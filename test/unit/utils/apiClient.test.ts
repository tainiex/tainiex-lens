import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';

// Mock the global fetch
global.fetch = vi.fn();

describe('apiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should make a successful GET request', async () => {
        const mockResponse = { data: 'test' };
        (global.fetch as any).mockResolvedValue(
            new Response(JSON.stringify(mockResponse), {
                status: 200,
            })
        );

        const response = await apiClient.get('/test-endpoint');
        const data = await response.json();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/test-endpoint'),
            expect.objectContaining({
                method: 'GET',
                credentials: 'include',
            })
        );
        expect(data).toEqual(mockResponse);
    });

    it('should handle 401 errors by attempting to refresh token', async () => {
        // First call fails with 401
        (global.fetch as any).mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
            })
        );

        // Refresh token call succeeds (mocking the internal refresh call)
        (global.fetch as any).mockResolvedValueOnce(
            new Response(JSON.stringify({ success: true }), {
                status: 200,
            })
        );

        // Retry of original request succeeds
        (global.fetch as any).mockResolvedValueOnce(
            new Response(JSON.stringify({ data: 'retry-success' }), {
                status: 200,
            })
        );

        await apiClient.get('/protected-resource');

        // Should have called fetch 3 times: 1. Initial 401, 2. Refresh, 3. Retry
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle non-retriable errors correctly', async () => {
        // Mock a 404 response
        (global.fetch as any).mockResolvedValue(
            new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                statusText: 'Not Found',
            })
        );

        const response = await apiClient.get('/missing');
        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
    });
});
