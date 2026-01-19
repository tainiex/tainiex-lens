import { z } from 'zod';
import * as Sentry from '@sentry/react';
import { logger } from './logger';

// Error Type Schema
const ErrorTypeSchema = z.enum(['NETWORK', 'AUTH', 'VALIDATION', 'SERVER', 'CANCELLED', 'UNKNOWN']);
export type ErrorType = z.infer<typeof ErrorTypeSchema>;

// API Error Schema
export const ApiErrorSchema = z.object({
    type: ErrorTypeSchema,
    message: z.string(),
    status: z.number().optional(),
    originalError: z.instanceof(Error).optional(),
    retryable: z.boolean(),
    context: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const isApiError = (error: unknown): error is ApiError => {
    try {
        ApiErrorSchema.parse(error);
        return true;
    } catch {
        return false;
    }
};

export class ErrorHandler {
    /**
     * Parse error into standardized ApiError
     */
    static parseError(error: Error | Response | any, context?: string): ApiError {
        // Handle Response object
        if (error instanceof Response) {
            const status = error.status;
            const statusText = error.statusText;

            switch (status) {
                case 400:
                    return {
                        type: 'VALIDATION',
                        message: 'Invalid request parameters, please check your input',
                        status,
                        retryable: false,
                        context,
                    };
                case 401:
                    return {
                        type: 'AUTH',
                        message: 'Session expired, please login again',
                        status,
                        retryable: false,
                        context,
                    };
                case 403:
                    return {
                        type: 'AUTH',
                        message: 'Access denied, insufficient permissions',
                        status,
                        retryable: false,
                        context,
                    };
                case 404:
                    return {
                        type: 'SERVER',
                        message: 'Requested resource not found',
                        status,
                        retryable: false,
                        context,
                    };
                case 408:
                    return {
                        type: 'NETWORK',
                        message: 'Request timeout, please retry',
                        status,
                        retryable: true,
                        context,
                    };
                case 422:
                    return {
                        type: 'VALIDATION',
                        message: 'Data validation failed, please check your input',
                        status,
                        retryable: false,
                        context,
                    };
                case 429:
                    return {
                        type: 'SERVER',
                        message: 'Too many requests, please try again later',
                        status,
                        retryable: true,
                        context,
                    };
                case 500:
                case 502:
                case 503:
                case 504:
                    return {
                        type: 'SERVER',
                        message: 'Server temporarily unavailable, please try again later',
                        status,
                        retryable: true,
                        context,
                    };
                default:
                    return {
                        type: status >= 500 ? 'SERVER' : 'UNKNOWN',
                        message: `Request failed (${status}): ${statusText}`,
                        status,
                        retryable: status >= 500,
                        context,
                    };
            }
        }

        // Handle network errors
        if (error?.name === 'TypeError' && error.message?.includes('fetch')) {
            return {
                type: 'NETWORK',
                message: 'Network connection failed, please check your settings',
                originalError: error,
                retryable: true,
                context,
            };
        }

        // Handle timeout errors and aborts
        if (error?.name === 'AbortError') {
            // Check if this was an intentional abort (e.g., session switch)
            const abortReason = (error as any).cause?.message || error?.message;
            if (abortReason?.includes('Session switched')) {
                return {
                    type: 'CANCELLED',
                    message: 'Request cancelled',
                    originalError: error,
                    retryable: false,
                    context,
                };
            }

            // Real timeout or unknown abort
            return {
                type: 'NETWORK',
                message: 'Request timeout, please retry',
                originalError: error,
                retryable: true,
                context,
            };
        }

        if (error?.message?.includes('timeout')) {
            return {
                type: 'NETWORK',
                message: error.message?.includes('Stream timeout')
                    ? 'AI processing timeout, please try again later'
                    : 'Request timeout, please retry',
                originalError: error,
                retryable: true,
                context,
            };
        }

        // Handle other errors
        return {
            type: 'UNKNOWN',
            message: error.message || 'An unknown error occurred',
            originalError: error,
            retryable: false,
            context,
        };
    }

    /**
     * Check if error is retryable
     */
    static isRetryable(error: ApiError): boolean {
        return error.retryable;
    }

    /**
     * Get user-friendly error message
     */
    static getUserMessage(error: ApiError): string {
        return error.message;
    }

    /**
     * Get suggested action for error
     */
    static getSuggestedAction(error: ApiError): string | null {
        switch (error.type) {
            case 'NETWORK':
                return 'Check network or retry later';
            case 'AUTH':
                return 'Please login again to continue';
            case 'VALIDATION':
                return 'Please check your input';
            case 'SERVER':
                return 'Retry later or contact support';
            case 'CANCELLED':
                return null; // No action needed for cancelled requests
            default:
                return null;
        }
    }

    /**
     * Log error to console
     */
    static logError(error: ApiError, context?: string): void {
        const contextInfo = context ? ` [${context}]` : '';
        const errorInfo = {
            type: error.type,
            message: error.message,
            status: error.status,
            retryable: error.retryable,
            context: contextInfo,
            timestamp: new Date().toISOString(),
        };

        // Don't log cancelled requests as errors
        if (error.type === 'CANCELLED') {
            logger.debug('Request cancelled:', errorInfo);
            return;
        }

        if (error.type === 'SERVER' || error.type === 'NETWORK') {
            logger.warn('API Error:', errorInfo, error.originalError);

            // Specifically capture network errors if they are not just retries, or if we want to debug mobile issues
            if (error.type === 'NETWORK') {
                Sentry.captureException(error.originalError || new Error(error.message), {
                    tags: {
                        type: error.type,
                        status: error.status,
                        retryable: error.retryable,
                    },
                    extra: { context },
                });
            }
        } else {
            logger.error('API Error:', errorInfo, error.originalError);

            // Capture critical errors
            Sentry.captureException(error.originalError || new Error(error.message), {
                tags: {
                    type: error.type,
                    status: error.status,
                },
                extra: { context },
            });
        }
    }

    /**
     * Calculate exponential backoff delay
     */
    static calculateRetryDelay(attempt: number, baseDelay: number = 1000): number {
        // Exponential backoff: baseDelay * 2^(attempt-1) + jitter
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
        return Math.min(exponentialDelay + jitter, 30000); // Max 30s
    }

    /**
     * Get notification type for error
     */
    static getNotificationType(error: ApiError): 'error' | 'warning' | 'info' {
        switch (error.type) {
            case 'NETWORK':
                return 'warning';
            case 'AUTH':
                return 'error';
            case 'VALIDATION':
                return 'warning';
            case 'SERVER':
                return 'error';
            case 'CANCELLED':
                return 'info';
            default:
                return 'error';
        }
    }
}
