import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { connectionMachine } from '@/shared/machines/connectionMachine';
import { socketService } from '@/shared/services/SocketService';

// Mock socketService
vi.mock('@/shared/services/SocketService', () => ({
    socketService: {
        getChatSocket: vi.fn(() => ({ connected: false })),
        subscribe: vi.fn(() => () => {}),
        connect: vi.fn(),
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

        const actor = createActor(connectionMachine);
        actor.start();

        expect(actor.getSnapshot().value).toBe('connected');
    });

    it('should transition from connecting to connected on CONNECTED event', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        actor.send({ type: 'CONNECTED' });

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
        actor.send({ type: 'CONNECTED' });
        expect(actor.getSnapshot().value).toBe('connected');

        // connected -> reconnecting (on disconnect)
        actor.send({ type: 'DISCONNECTED', error: 'Connection lost' });
        expect(actor.getSnapshot().value).toBe('reconnecting');

        // reconnecting -> connected (on reconnect success)
        actor.send({ type: 'CONNECTED' });
        expect(actor.getSnapshot().value).toBe('connected');
        expect(actor.getSnapshot().context.error).toBeUndefined();
    });

    it('should handle RETRY event from reconnecting state', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // Get to reconnecting state
        actor.send({ type: 'CONNECTED' });
        actor.send({ type: 'DISCONNECTED' });

        expect(actor.getSnapshot().value).toBe('reconnecting');

        // Manual retry should trigger  transition to connecting
        actor.send({ type: 'RETRY' });

        expect(actor.getSnapshot().value).toBe('connecting');
    });

    it('should preserve error message in context during disconnection', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // First get to connected state
        actor.send({ type: 'CONNECTED' });
        expect(actor.getSnapshot().value).toBe('connected');

        // Then disconnect with error
        actor.send({ type: 'DISCONNECTED', error: 'Network timeout' });

        expect(actor.getSnapshot().value).toBe('reconnecting');
        expect(actor.getSnapshot().context.error).toBe('Network timeout');
    });

    it('should clear error when successfully connected', () => {
        const actor = createActor(connectionMachine);
        actor.start();

        // Get to connected state
        actor.send({ type: 'CONNECTED' });

        // Set error by disconnecting
        actor.send({ type: 'DISCONNECTED', error: 'Test error' });
        expect(actor.getSnapshot().value).toBe('reconnecting');
        expect(actor.getSnapshot().context.error).toBe('Test error');

        // Connect should clear error
        actor.send({ type: 'CONNECTED' });
        expect(actor.getSnapshot().value).toBe('connected');
        expect(actor.getSnapshot().context.error).toBeUndefined();
    });
});
