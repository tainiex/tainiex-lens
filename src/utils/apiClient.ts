import { API_BASE_URL } from '../config';
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
                    logger.warn(`API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, apiError.message);
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
                    logger.warn(`API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, apiError.message);
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
     * Improved token refresh logic with proper concurrency handling (deduplication)
     */
    private async refreshToken(notificationCallback?: (error: ApiError) => void): Promise<boolean> {
        // If a refresh is already in progress, return the existing promise
        if (this.refreshPromise) {
            logger.debug('[AuthDebug] Joining existing token refresh request...');
            return this.refreshPromise;
        }

        logger.debug('[AuthDebug] Starting new token refresh request...');
        this.refreshPromise = (async () => {
            try {
                const refreshUrl = `${API_BASE_URL}/api/auth/refresh`;
                logger.debug('[AuthDebug] Fetching:', refreshUrl);
                const res = await fetch(refreshUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                });
                logger.debug('[AuthDebug] Refresh response status:', res.status);

                if (res.ok) {
                    logger.debug('[AuthDebug] Refresh successful. Status:', res.status);
                    return true;
                }

                // Handle refresh failure
                logger.warn('[AuthDebug] Refresh failed. Status:', res.status, 'StatusText:', res.statusText);
                const error = this.handleError(res, 'token refresh');
                if (notificationCallback) {
                    notificationCallback(error);
                }

                return false;
            } catch (error) {
                logger.error('[AuthDebug] Refresh exception:', error);
                const apiError = this.handleError(error as Error, 'token refresh');
                if (notificationCallback) {
                    notificationCallback(apiError);
                }
                return false;
            }
        })();

        try {
            return await this.refreshPromise;
        } finally {
            // Clear the promise so subsequent failures can trigger a new refresh
            logger.debug('[AuthDebug] Clearing refresh promise');
            this.refreshPromise = null;
        }
    }

    async request(path: string, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<Response> {
        const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

        const headers = {
            ...options.headers,
        };

        // Handle 401 Auth Error
        const makeRequest = async (_retryAttempt: number = 0): Promise<Response> => {
            const response = await fetch(url, { ...options, headers, credentials: 'include' });

            if (response.status === 401 && !path.includes('/auth/refresh') && !options.skipAuthRefresh) {
                logger.debug('[AuthDebug] 401 detected for:', path, 'Attempting refresh...');

                // Wait for token refresh (deduplicated)
                const success = await this.refreshToken(notificationCallback);
                logger.debug('[AuthDebug] Refresh finished for:', path, 'Success:', success);

                if (success) {
                    // Retry request, relying on credentials: 'include' for cookie
                    logger.debug('[AuthDebug] Retrying request for:', path);
                    return fetch(url, { ...options, headers, credentials: 'include' });
                } else {
                    logger.warn('[AuthDebug] Refresh failed, returning 401 for:', path);
                    return response;
                }
            }

            return response;
        };

        // Use retry mechanism
        const retryCount = options.retryCount ?? 3;
        // If retryCount is 0, we still want to make 1 attempt.
        // So maxAttempts should be retryCount + 1 if we interpret retryCount as "number of retries".
        // But if retryCount is interpreted as "max attempts", then 0 is invalid.
        // Given Login.tsx passes 0, it likely means "do not retry".
        // So we ensure at least 1 attempt.
        const maxAttempts = retryCount === 0 ? 1 : retryCount;

        return this.retryWithBackoff(
            () => makeRequest(),
            maxAttempts,
            `API request to ${path}`
        );
    }

    async get(path: string, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void) {
        return this.request(path, { ...options, method: 'GET' }, notificationCallback);
    }

    async post(path: string, body?: any, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void) {
        return this.request(path, {
            ...options,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            body: JSON.stringify(body),
        }, notificationCallback);
    }

    async delete(path: string, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void) {
        return this.request(path, { ...options, method: 'DELETE' }, notificationCallback);
    }

    async getTyped<T>(path: string, schema: z.ZodSchema<T>, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<T> {
        const res = await this.get(path, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postTyped<T>(path: string, body: unknown, schema: z.ZodSchema<T>, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<T> {
        const res = await this.post(path, body, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postVoid(path: string, body?: unknown, options: ApiRequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<void> {
        const res = await this.post(path, body, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
    }

    /**
     * Manually ensure authentication is valid (triggers refresh if needed)
     */
    async ensureAuth(): Promise<boolean> {
        try {
            // We use a lightweight protected endpoint to check auth status
            // If this fails with 401, the internal interceptor will trigger a refresh
            // We use '/api/auth/me' or similar user profile endpoint if available,
            // or we can try to refresh directly if we suspect auth is broken.
            // But 'refreshToken' is private. Let's make a request that forces the logic.
            // However, simply calling refreshToken directly might be better if we expose it or use a check.

            // Since refreshToken is private and specific to 401 handling,
            // let's try to verify the session using the refresh endpoint directly if we think we are expired.
            // Or better, just make a call to 'get /api/auth/check' (or similar)
            // If that fails, the Interceptor logic in request() will attempt refresh.

            // Assuming /api/auth/session or /api/user/profile exists.
            // Let's rely on the internal logic: call an endpoint, if 401, it refreshes.
            // If request() returns 401 ultimately, then we are truly logged out.

            // NOTE: Using a non-existent endpoint might cause 404.
            // We should use an endpoint that exists. `ChatInterface` fetches models.
            // Let's use a lightweight one.
            // If we don't know one, we can just try to refresh token directly since this method is called when we suspect trouble.

            return await this.refreshToken();
        } catch (error) {
            logger.warn('Manual auth check failed:', error);
            return false;
        }
    }
}

export const apiClient = new ApiClient();