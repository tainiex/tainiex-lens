import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler, ApiError } from './errorHandler';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
    captureException: vi.fn(),
}));

describe('ErrorHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parseError', () => {
        it('should parse 401 Response as AUTH error', () => {
            const response = new Response('Unauthorized', {
                status: 401,
                statusText: 'Unauthorized',
            });
            const error = ErrorHandler.parseError(response);

            expect(error.type).toBe('AUTH');
            expect(error.status).toBe(401);
            expect(error.retryable).toBe(false);
        });

        it('should parse 500 Response as SERVER error', () => {
            const response = new Response('Internal Server Error', {
                status: 500,
                statusText: 'Internal Server Error',
            });
            const error = ErrorHandler.parseError(response);

            expect(error.type).toBe('SERVER');
            expect(error.status).toBe(500);
            expect(error.retryable).toBe(true);
        });

        it('should parse network error correctly', () => {
            const networkError = new TypeError('Failed to fetch');
            const error = ErrorHandler.parseError(networkError);

            expect(error.type).toBe('NETWORK');
            expect(error.retryable).toBe(true);
        });

        it('should parse AbortError as CANCELLED', () => {
            const abortError = new Error('Session switched');
            abortError.name = 'AbortError';
            const error = ErrorHandler.parseError(abortError);

            expect(error.type).toBe('CANCELLED');
            expect(error.retryable).toBe(false);
        });

        it('should include context in error', () => {
            const response = new Response('Not Found', { status: 404 });
            const error = ErrorHandler.parseError(response, 'User API');

            expect(error.context).toBe('User API');
        });

        it('should handle 400 as VALIDATION error', () => {
            const response = new Response('Bad Request', { status: 400 });
            const error = ErrorHandler.parseError(response);

            expect(error.type).toBe('VALIDATION');
            expect(error.retryable).toBe(false);
        });

        it('should handle 429 as retryable SERVER error', () => {
            const response = new Response('Too Many Requests', { status: 429 });
            const error = ErrorHandler.parseError(response);

            expect(error.type).toBe('SERVER');
            expect(error.retryable).toBe(true);
        });
    });

    describe('isRetryable', () => {
        it('should return true for retryable errors', () => {
            const error: ApiError = {
                type: 'NETWORK',
                message: 'Network error',
                retryable: true,
            };

            expect(ErrorHandler.isRetryable(error)).toBe(true);
        });

        it('should return false for non-retryable errors', () => {
            const error: ApiError = {
                type: 'AUTH',
                message: 'Unauthorized',
                retryable: false,
            };

            expect(ErrorHandler.isRetryable(error)).toBe(false);
        });
    });

    describe('getSuggestedAction', () => {
        it('should suggest action for NETWORK error', () => {
            const error: ApiError = { type: 'NETWORK', message: 'test', retryable: true };
            expect(ErrorHandler.getSuggestedAction(error)).toBe('Check network or retry later');
        });

        it('should suggest action for AUTH error', () => {
            const error: ApiError = { type: 'AUTH', message: 'test', retryable: false };
            expect(ErrorHandler.getSuggestedAction(error)).toBe('Please login again to continue');
        });

        it('should return null for CANCELLED error', () => {
            const error: ApiError = { type: 'CANCELLED', message: 'test', retryable: false };
            expect(ErrorHandler.getSuggestedAction(error)).toBeNull();
        });
    });

    describe('calculateRetryDelay', () => {
        it('should calculate exponential backoff', () => {
            const delay1 = ErrorHandler.calculateRetryDelay(1, 1000);
            const delay2 = ErrorHandler.calculateRetryDelay(2, 1000);
            const delay3 = ErrorHandler.calculateRetryDelay(3, 1000);

            expect(delay1).toBeGreaterThanOrEqual(1000);
            expect(delay1).toBeLessThan(1200); // 1000 + 10% jitter

            expect(delay2).toBeGreaterThanOrEqual(2000);
            expect(delay2).toBeLessThan(2400);

            expect(delay3).toBeGreaterThanOrEqual(4000);
            expect(delay3).toBeLessThan(4800);
        });

        it('should cap maximum delay at 30s', () => {
            const delay = ErrorHandler.calculateRetryDelay(10, 1000);
            expect(delay).toBeLessThanOrEqual(30000);
        });
    });

    describe('getNotificationType', () => {
        it('should return warning for NETWORK error', () => {
            const error: ApiError = { type: 'NETWORK', message: 'test', retryable: true };
            expect(ErrorHandler.getNotificationType(error)).toBe('warning');
        });

        it('should return error for AUTH error', () => {
            const error: ApiError = { type: 'AUTH', message: 'test', retryable: false };
            expect(ErrorHandler.getNotificationType(error)).toBe('error');
        });

        it('should return info for CANCELLED error', () => {
            const error: ApiError = { type: 'CANCELLED', message: 'test', retryable: false };
            expect(ErrorHandler.getNotificationType(error)).toBe('info');
        });
    });

    describe('logError', () => {
        it('should not log CANCELLED errors as errors', () => {
            const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const error: ApiError = { type: 'CANCELLED', message: 'test', retryable: false };

            ErrorHandler.logError(error);

            expect(consoleLogSpy).toHaveBeenCalled();
            expect(Sentry.captureException).not.toHaveBeenCalled();
            consoleLogSpy.mockRestore();
        });

        it('should capture NETWORK errors to Sentry', () => {
            const error: ApiError = {
                type: 'NETWORK',
                message: 'Failed to fetch',
                retryable: true,
                originalError: new Error('Network error'),
            };

            ErrorHandler.logError(error, 'API Call');

            expect(Sentry.captureException).toHaveBeenCalledWith(
                error.originalError,
                expect.any(Object)
            );
        });
    });
});
