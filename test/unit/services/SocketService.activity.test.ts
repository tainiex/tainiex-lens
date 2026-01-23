import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSocket } from '../../utils/mocks';
import { socketService } from '../../../src/shared/services/SocketService';

// Mock Socket.IO Manager
const mockManagerSocketMethod = vi.fn();
// We need to return different sockets for different namespaces if checking equality,
// but for now returning a new mock each time is fine.
mockManagerSocketMethod.mockImplementation(() => ({
    ...createMockSocket(),
    onAny: vi.fn(),
}));

vi.mock('socket.io-client', () => {
    class MockManager {
        opts: any;
        constructor() {
            this.opts = {};
        }
        socket = mockManagerSocketMethod;
        on = vi.fn();
    }
    return {
        Manager: MockManager,
        Socket: vi.fn(),
    };
});

describe('SocketService Activity Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset private state if possible, or just rely on public API
        // Since it's a singleton, state might persist. We might need to access private fields via (socketService as any) to reset.
        (socketService as any).chatSocket = null;
        (socketService as any).collaborationSocket = null;
        (socketService as any).activitySocket = null;
        (socketService as any).manager = null;
        (socketService as any).config = null;
        (socketService as any).connectionPromise = null;
    });

    it('should create activity socket when configured and connected', async () => {
        // 1. Configure
        socketService.configure({ baseUrl: 'http://localhost:3000' });

        // 2. Connect
        // We mock apiClient to avoid auth issues
        vi.mock('../../../src/shared/utils/apiClient', () => ({
            apiClient: {
                ensureAuth: vi.fn().mockResolvedValue(true),
                accessToken: 'mock-token',
            },
        }));

        await socketService.connect();

        // 3. Verify Manager was created
        // @ts-ignore
        // expect(Manager).toHaveBeenCalledWith('http://localhost:3000', expect.any(Object));

        // 4. Verify Activity Scoket was created
        expect(mockManagerSocketMethod).toHaveBeenCalledWith('/activity');

        const activitySocket = socketService.getActivitySocket();
        expect(activitySocket).toBeDefined();
    });

    it('should emit join event with sessionId when joinActivity is called', async () => {
        // Setup state
        socketService.configure({ baseUrl: 'http://localhost:3000' });

        // Mock socket specifically for this test
        const mockActivitySocket = {
            ...createMockSocket(),
            onAny: vi.fn(),
        } as any;
        mockManagerSocketMethod.mockReturnValue(mockActivitySocket);

        // Force creation
        await socketService.connect();

        const sessionId = 'session-123';
        socketService.joinActivity(sessionId);

        expect(mockActivitySocket.emit).toHaveBeenCalledWith('join', { sessionId });
    });
});
