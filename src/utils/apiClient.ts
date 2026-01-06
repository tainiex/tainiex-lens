import { API_BASE_URL } from '../config';
import { ErrorHandler, ApiError } from './errorHandler';
import { z } from 'zod';
import { safeJsonParse } from './validation';
import { logger } from './logger';

class ApiClient {
    private isRefreshing = false;
    private refreshSubscribers: ((status: string) => void)[] = [];

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
     * Improved token refresh logic
     */
    private async refreshToken(notificationCallback?: (error: ApiError) => void): Promise<boolean> {
        logger.debug('[AuthDebug] Starting token refresh request...');
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
                return true;
            }

            // Handle refresh failure
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
    }

    private onRefreshFinished(success: boolean) {
        this.refreshSubscribers.map((cb) => cb(success ? 'success' : ''));
        this.refreshSubscribers = [];
    }

    private addRefreshSubscriber(cb: (status: string) => void) {
        this.refreshSubscribers.push(cb);
    }

    async request(path: string, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<Response> {
        const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

        const headers = {
            ...options.headers,
        };



        // Handle 401 Auth Error
        const makeRequest = async (_retryAttempt: number = 0): Promise<Response> => {
            // Log retryAttempt to silence linter if needed, or remove it
            // logger.debug('Retry attempt:', retryAttempt);

            const response = await fetch(url, { ...options, headers, credentials: 'include' });

            if (response.status === 401 && !path.includes('/auth/refresh')) {
                logger.debug('[AuthDebug] 401 detected for:', path, 'isRefreshing:', this.isRefreshing);
                if (!this.isRefreshing) {
                    this.isRefreshing = true;
                    logger.debug('[AuthDebug] Initiating refresh flow...');
                    const success = await this.refreshToken(notificationCallback);
                    this.isRefreshing = false;
                    logger.debug('[AuthDebug] Refresh finished. Success:', success);

                    if (success) {
                        this.onRefreshFinished(true);

                        // Retry request, relying on credentials: 'include' for cookie
                        return fetch(url, { ...options, headers, credentials: 'include' });
                    } else {
                        // Refresh failed, notify all subscribers
                        this.onRefreshFinished(false);
                        return response;
                    }
                } else {
                    // Wait for refresh to finish
                    logger.debug('[AuthDebug] Waiting for existing refresh...');
                    return new Promise((resolve) => {
                        this.addRefreshSubscriber((status: string) => {
                            logger.debug('[AuthDebug] Subscriber notified. Status:', status);
                            if (!status) {
                                resolve(response);
                                return;
                            }
                            resolve(fetch(url, { ...options, headers, credentials: 'include' }));
                        });
                    });
                }
            }

            return response;
        };

        // Use retry mechanism
        return this.retryWithBackoff(
            () => makeRequest(),
            3, // Max attempts
            `API request to ${path}`
        );
    }

    async get(path: string, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void) {
        return this.request(path, { ...options, method: 'GET' }, notificationCallback);
    }

    async post(path: string, body?: any, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void) {
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

    async delete(path: string, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void) {
        return this.request(path, { ...options, method: 'DELETE' }, notificationCallback);
    }

    async getTyped<T>(path: string, schema: z.ZodSchema<T>, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<T> {
        const res = await this.get(path, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postTyped<T>(path: string, body: unknown, schema: z.ZodSchema<T>, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<T> {
        const res = await this.post(path, body, options, notificationCallback);
        if (!res.ok) {
            const error = this.handleError(res, path);
            throw error;
        }
        return safeJsonParse(res, schema, path);
    }

    async postVoid(path: string, body?: unknown, options: RequestInit = {}, notificationCallback?: (error: ApiError) => void): Promise<void> {
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