import { ErrorHandler, ApiError } from './errorHandler';

import { z } from 'zod';
import { safeJsonParse } from './validation';
import { logger } from './logger';

interface ApiRequestInit extends RequestInit {
    skipAuthRefresh?: boolean;
    retryCount?: number;
}

class ApiClient {
    private refreshPromise: Promise<boolean> | null = null;
    private config: { baseUrl: string; authType?: 'cookie' | 'header' } | null = null;
    public accessToken: string | null = null; // Made public for debugging
    private lastRefreshFailureTime: number = 0; // Cooldown tracker

    public configure(config: { baseUrl: string; authType?: 'cookie' | 'header' }) {
        this.config = config;
    }

    public setAuthToken(token: string | null) {
        this.accessToken = token;
        logger.debug('[ApiClient] Auth token manually set:', token ? 'Token exists' : 'Null');
    }

    public getAccessToken(): string | null {
        return this.accessToken;
    }

    private getBaseUrl(): string {
        if (!this.config) {
            // Fallback for Web if not configured (backwards compat during migration)
            if (typeof window !== 'undefined') {
                return window.location.origin;
            }
            throw new Error('[ApiClient] Configuration missing. Call configure() before using.');
        }
        return this.config.baseUrl;
    }

    /**
     * Handle error and log
     */
    private handleError(error: Error | Response, context?: string): ApiError {
        const ctx = context || 'unknown context';
        const apiError = ErrorHandler.parseError(error, ctx);
        ErrorHandler.logError(apiError, ctx);
        return apiError;
    }

    /**
     * Exponential backoff retry
     */
    private async retryWithBackoff(
        fn: () => Promise<Response>,
        maxAttempts: number = 3,
        context?: string
    ): Promise<Response> {
        let lastError: Error | Response | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fn();

                if (response.ok) {
                    return response;
                }

                const apiError = this.handleError(response, context);
                if (!ErrorHandler.isRetryable(apiError)) {
                    return response;
                }

                // Log retry info
                if (attempt < maxAttempts) {
                    const delay = ErrorHandler.calculateRetryDelay(attempt);
                    logger.warn(
                        `API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
                        apiError.message
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                lastError = response;
            } catch (error) {
                lastError = error as Error;

                const apiError = this.handleError(error as Error, context);

                if (!ErrorHandler.isRetryable(apiError)) {
                    throw apiError;
                }

                if (attempt < maxAttempts) {
                    const delay = ErrorHandler.calculateRetryDelay(attempt);
                    logger.warn(
                        `API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
                        apiError.message
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries failed
        if (lastError) {
            throw this.handleError(lastError, context);
        }

        throw new Error('Unknown error occurred during retry');
    }

    /**
     * Improved token refresh logic with proper concurrency handling (deduplication) and retry
     */
    public async refreshToken(notificationCallback?: (error: ApiError) => void): Promise<boolean> {
        // If a refresh is already in progress, return the existing promise
        if (this.refreshPromise) {
            logger.debug('[ApiClient] Joining existing token refresh request...');
            return this.refreshPromise;
        }

        // COOLDOWN CHECK: If we failed recently, don't spam the server
        if (Date.now() - this.lastRefreshFailureTime < 5000) {
            logger.warn('[ApiClient] Refresh cooldown active, skipping request.');
            return false;
        }

        logger.debug('[ApiClient] Starting new token refresh request...');
        this.refreshPromise = (async () => {
            const maxAttempts = 3;
            const baseDelay = 1000; // 1 second

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    logger.debug(`[ApiClient] Refresh attempt ${attempt}/${maxAttempts}`);

                    // Web: Use cookie-based refresh (existing logic)
                    const response = await fetch(`${this.getBaseUrl()}/api/auth/refresh`, {
                        method: 'POST',
                        credentials: 'include',
                    });

                    if (response.ok) {
                        logger.debug('[ApiClient] Token refresh successful');
                        // Reset failure time on success
                        this.lastRefreshFailureTime = 0;
                        return true;
                    }

                    // Check if error is retryable (5xx server errors)
                    const isServerError = response.status >= 500 && response.status < 600;
                    const isLastAttempt = attempt === maxAttempts;

                    logger.warn(
                        `[ApiClient] Refresh failed with status: ${response.status} (attempt ${attempt}/${maxAttempts})`
                    );

                    // If it's not a server error, don't retry
                    if (!isServerError) {
                        logger.warn('[ApiClient] Non-retryable error (4xx), not retrying');
                        this.lastRefreshFailureTime = Date.now();
                        if (notificationCallback) {
                            const apiError = this.handleError(response, 'refreshToken');
                            notificationCallback(apiError);
                        }
                        return false;
                    }

                    // If this is the last attempt, give up
                    if (isLastAttempt) {
                        logger.error(`[ApiClient] Refresh failed after ${maxAttempts} attempts`);
                        this.lastRefreshFailureTime = Date.now();
                        if (notificationCallback) {
                            const apiError = this.handleError(response, 'refreshToken');
                            notificationCallback(apiError);
                        }
                        return false;
                    }

                    // Calculate exponential backoff delay
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    logger.debug(
                        `[ApiClient] Retrying refresh in ${delay}ms (server error: ${response.status})`
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch (error) {
                    const isLastAttempt = attempt === maxAttempts;

                    logger.error(
                        `[ApiClient] Refresh error on attempt ${attempt}/${maxAttempts}:`,
                        error
                    );

                    if (isLastAttempt) {
                        this.lastRefreshFailureTime = Date.now();
                        if (notificationCallback) {
                            const wrappedError =
                                error instanceof Error
                                    ? error
                                    : new Error('Refresh request failed');
                            const apiError = this.handleError(wrappedError, 'refreshToken');
                            notificationCallback(apiError);
                        }
                        return false;
                    }

                    // Retry on network errors
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    logger.debug(`[ApiClient] Retrying refresh in ${delay}ms (network error)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            return false;
        })();

        try {
            return await this.refreshPromise;
        } finally {
            // Clear the promise so subsequent failures can trigger a new refresh
            this.refreshPromise = null;
        }
    }

    async request(
        path: string,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ): Promise<Response> {
        // If a token refresh is already in progress, wait for it before starting any new requests.
        // This avoids a "storm" of 401 errors when multiple requests are made simultaneously
        // after the session has expired.
        if (this.refreshPromise && !path.includes('/auth/refresh') && !options.skipAuthRefresh) {
            logger.debug(
                `[ApiClient] Waiting for in-progress token refresh before starting: ${path}`
            );
            await this.refreshPromise;
        }

        const baseUrl = this.getBaseUrl();
        const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

        const headers: Record<string, string> = {
            ...(options.headers as Record<string, string>),
        };

        // Web: Strictly use Cookies (credentials: 'include'), no Authorization header.
        // Mobile logic removed.

        // Set credentials based on platform
        // Web: send cookies
        const credentials: RequestCredentials = 'include';

        // Handle 401 Auth Error
        const makeRequest = async (_retryAttempt: number = 0): Promise<Response> => {
            try {
                // logger.debug('[ApiClient] Making fetch request to:', url);

                const response = await fetch(url, { ...options, headers, credentials });

                // logger.debug('[ApiClient] Fetch completed. Status:', response.status, 'OK:', response.ok);

                if (
                    response.status === 401 &&
                    !path.includes('/auth/refresh') &&
                    !options.skipAuthRefresh
                ) {
                    logger.debug('[ApiClient] 401 detected for:', path, 'Attempting refresh...');

                    // Wait for token refresh (deduplicated)
                    const success = await this.refreshToken(notificationCallback);
                    logger.debug('[ApiClient] Refresh finished for:', path, 'Success:', success);

                    if (success) {
                        // Rebuild headers based on platform
                        const updatedHeaders: Record<string, string> = {
                            ...(options.headers as Record<string, string>),
                        };

                        logger.debug('[ApiClient] Retrying request for:', path);
                        return fetch(url, { ...options, headers: updatedHeaders, credentials });
                    } else {
                        logger.warn('[ApiClient] Refresh failed, returning 401 for:', path);
                        return response;
                    }
                }

                return response;
            } catch (error) {
                // Check if this is an intentional abort (e.g., session switch)
                if (error instanceof Error && error.name === 'AbortError') {
                    const abortReason = (error as any).cause?.message || error.message;
                    if (abortReason?.includes('Session switched')) {
                        logger.debug('[ApiClient] Request aborted due to session switch');
                        throw error;
                    }
                }

                logger.error('[ApiClient] Fetch threw error:', error);
                throw error;
            }
        };

        // Use retry mechanism
        const retryCount = options.retryCount ?? 3;
        const maxAttempts = retryCount === 0 ? 1 : retryCount;

        return this.retryWithBackoff(() => makeRequest(), maxAttempts, `API request to ${path}`);
    }

    async get(
        path: string,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ) {
        return this.request(path, { ...options, method: 'GET' }, notificationCallback);
    }

    async post(
        path: string,
        body?: any,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ) {
        return this.request(
            path,
            {
                ...options,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                body: JSON.stringify(body),
            },
            notificationCallback
        );
    }

    async delete(
        path: string,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ) {
        return this.request(path, { ...options, method: 'DELETE' }, notificationCallback);
    }

    async getTyped<T>(
        path: string,
        schema: z.ZodSchema<T>,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ): Promise<T> {
        const res = await this.get(path, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postTyped<T>(
        path: string,
        body: unknown,
        schema: z.ZodSchema<T>,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ): Promise<T> {
        const res = await this.post(path, body, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postVoid(
        path: string,
        body?: unknown,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ): Promise<void> {
        const res = await this.post(path, body, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
    }

    /**
     * Upload a file using FormData
     * Does NOT set Content-Type header so browser can set boundary
     */
    async upload<T>(
        path: string,
        formData: FormData,
        options: ApiRequestInit = {},
        notificationCallback?: (error: ApiError) => void
    ): Promise<T> {
        // Use request() but override body and method
        // Note: request() merges options.headers. We must ensure we don't set Content-Type: application/json
        const res = await this.request(
            path,
            {
                ...options,
                method: 'POST',
                body: formData,
            },
            notificationCallback
        );

        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }

        // We assume generic upload returns JSON
        return res.json() as Promise<T>;
    }

    /**
     * Manually ensure authentication is valid
     */
    async ensureAuth(): Promise<boolean> {
        try {
            // If we have a token, check if it's expired
            if (this.accessToken) {
                const isExpired = this.isTokenExpired(this.accessToken);
                if (!isExpired) {
                    return true;
                }
                logger.debug('[ApiClient] Token expired or expiring soon. Attempting refresh...');
            } else {
                logger.debug('[ApiClient] Token missing. Attempting refresh...');
            }

            return await this.refreshToken();
        } catch (error) {
            logger.warn('[ApiClient] Manual auth check failed:', error);
            return false;
        }
    }

    private isTokenExpired(token: string): boolean {
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return true;

            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );

            const { exp } = JSON.parse(jsonPayload);
            if (!exp) return false;

            // Check if expired or expiring in next 60 seconds (clock skew protection)
            return Date.now() >= exp * 1000 - 60000;
        } catch (e) {
            // If we can't parse it, assume it might be valid (or let server reject it),
            // but safer to try refresh if we are unsure?
            // Actually if it's invalid format, refresh is safer.
            logger.warn('[ApiClient] Failed to parse token expiration:', e);
            return true;
        }
    }
}

export const apiClient = new ApiClient();
