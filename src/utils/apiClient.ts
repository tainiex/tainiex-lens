import { API_BASE_URL } from '../config';
import { ErrorHandler, ApiError } from './errorHandler';
import { z } from 'zod';
import { safeJsonParse } from './validation';

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
                    console.warn(`API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, apiError.message);
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
                    console.warn(`API request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, apiError.message);
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
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

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

        // If we are already on the login page, don't try to refresh or redirect
        const isLoginPage = window.location.pathname === '/login';

        // Handle 401 Auth Error
        const makeRequest = async (_retryAttempt: number = 0): Promise<Response> => {
            // Log retryAttempt to silence linter if needed, or remove it
            // console.debug('Retry attempt:', retryAttempt);

            const response = await fetch(url, { ...options, headers, credentials: 'include' });

            if (response.status === 401 && !path.includes('/auth/refresh') && !isLoginPage) {
                if (!this.isRefreshing) {
                    this.isRefreshing = true;
                    const success = await this.refreshToken(notificationCallback);
                    this.isRefreshing = false;

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
                    return new Promise((resolve) => {
                        this.addRefreshSubscriber((status: string) => {
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
}

export const apiClient = new ApiClient();