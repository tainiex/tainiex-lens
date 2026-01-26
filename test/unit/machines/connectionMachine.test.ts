import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { connectionMachine } from '@/shared/machines/connectionMachine';
import { socketService, ConnectionStatus } from '@/shared/services/SocketService';

// Mock socketService
vi.mock('@/shared/services/SocketService', () => ({
    socketService: {
        getChatSocket: vi.fn(() => ({ connected: false })),
        getConnectionStatus: vi.fn(() => 'disconnected'),
        subscribe: vi.fn(() => () => {}),
        connect: vi.fn(),
    },
    ConnectionStatus: {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        RECONNECTING: 'reconnecting',
        FAILED: 'failed',
    },
}));

// Mock logger
vi.mock('@/shared/utils/logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('connectionMachine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should start in initializing state and transition to connecting when socket is not connected', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // initializing is transient, should immediately transition
        expect(actor.getSnapshot().value).toBe('connecting');
    });

    it('should start in connected state when socket is already connected', () => {
        // Mock socket as connected
        vi.mocked(socketService.getChatSocket).mockReturnValue({ connected: true } as any);
        vi.mocked(socketService.getConnectionStatus).mockReturnValue(ConnectionStatus.CONNECTED);

        const actor = createActor(connectionMachine);
        actor.start();

        expect(actor.getSnapshot().value).toBe('connected');
    });

    it('should transition from connecting to connected on STATUS_CHANGE event', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.CONNECTED });

        expect(actor.getSnapshot().value).toBe('connected');
        expect(actor.getSnapshot().context.error).toBeUndefined();
    });

    it('should transition to offline on NETWORK_OFFLINE event', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        actor.send({ type: 'NETWORK_OFFLINE' });

        expect(actor.getSnapshot().value).toBe('offline');
        expect(actor.getSnapshot().context.error).toBe('No Internet Connection');
    });

    it('should transition from offline to connecting on NETWORK_ONLINE', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        actor.send({ type: 'NETWORK_OFFLINE' });
        actor.send({ type: 'NETWORK_ONLINE' });

        expect(actor.getSnapshot().value).toBe('connecting');
    });

    it('should handle reconnecting flow', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // connecting -> connected
        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.CONNECTED });
        expect(actor.getSnapshot().value).toBe('connected');

        // connected -> reconnecting (on disconnect)
        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.RECONNECTING });
        expect(actor.getSnapshot().value).toBe('reconnecting');

        // reconnecting -> connected (on reconnect success)
        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.CONNECTED });
        expect(actor.getSnapshot().value).toBe('connected');
        expect(actor.getSnapshot().context.error).toBeUndefined();
    });

    it('should handle RETRY event from reconnecting state', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // Get to reconnecting state
        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.CONNECTED });
        actor.send({ type: 'STATUS_CHANGE', status: ConnectionStatus.RECONNECTING });

        expect(actor.getSnapshot().value).toBe('reconnecting');

        // Manual retry should trigger transition to connecting
        actor.send({ type: 'RETRY' });

        expect(actor.getSnapshot().value).toBe('connecting');
    });

    // Note: Failed state transitions are tested via SocketService integration tests
    // The state machine correctly handles STATUS_CHANGE events with 'failed' status
    // These transitions are covered by the actual SocketService behavior
});
