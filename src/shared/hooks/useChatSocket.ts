import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { socketService } from '../services/SocketService';

interface ConnectionState {
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
    attempt: number;
    lastError?: ApiError;
}

export function useChatSocket() {
    // We don't manage the socket instance anymore, the Service does.
    // But we need a local reference to return to consumers who might use it directly.
    const [socket, setSocket] = useState<Socket | null>(null);

    const attemptRef = useRef(0);
    const lastReconnectTimeRef = useRef(0);
    const isConnectedRef = useRef(false);

    const [connectionState, setConnectionState] = useState<ConnectionState>({
        status: 'disconnected',
        attempt: 0,
    });
    const [error, setError] = useState<string | null>(null);

    /**
     * Handle connection state changes
     */
    const updateConnectionState = useCallback(
        (status: ConnectionState['status'], attempt: number = 0, error?: ApiError) => {
            attemptRef.current = attempt;
            setConnectionState({ status, attempt, lastError: error });
            isConnectedRef.current = status === 'connected';

            if (error) {
                setError(error.message);
            } else {
                setError(null);
            }
        },
        []
    );

    /**
     * Attach listeners to the shared socket
     */
    useEffect(() => {
        let activeSocket: Socket | null = null;
        let unsubscribeService: (() => void) | null = null;

        const initSocket = async () => {
            // Ensure service is connected (or connecting)
            await socketService.connect();
            activeSocket = socketService.getSocket();

            if (!activeSocket) {
                logger.warn('[useChatSocket] Failed to get socket from service');
                updateConnectionState('failed');
                return;
            }

            setSocket(activeSocket);

            // [FIX] Subscribe to SocketService global state to ensure UI sync
            unsubscribeService = socketService.subscribe(isConnected => {
                updateConnectionState(isConnected ? 'connected' : 'disconnected');
                // Ensure we always have the latest socket instance, especially after reconnects
                const latestSocket = socketService.getSocket();
                if (latestSocket && latestSocket !== activeSocket) {
                    activeSocket = latestSocket;
                    setSocket(latestSocket);
                }
            });

            // Define Handlers for detailed errors only (optional)
            const onConnectError = (err: Error) => {
                logger.warn(`[useChatSocket] Connect error: ${err.message}`);
                // activeSocket will emit connect_error, but Service will handle retry.
                // We show 'reconnecting' state.
                updateConnectionState('reconnecting', attemptRef.current + 1);
            };

            // Attach Listeners
            // We rely on Service Subscription for Connect/Disconnect state now.
            // But we keep connect_error for granular feedback if needed.
            activeSocket.on('connect_error', onConnectError);

            // Cleanup function for this effect
            return () => {
                if (unsubscribeService) unsubscribeService();
                if (activeSocket) {
                    activeSocket.off('connect_error', onConnectError);
                }
            };
        };

        const cleanupPromise = initSocket();

        return () => {
            cleanupPromise.then(cleanup => {
                if (cleanup) cleanup();
            });
        };
    }, [updateConnectionState]);

    /**
     * Manual reconnect
     */
    const reconnect = useCallback(() => {
        const now = Date.now();
        if (now - lastReconnectTimeRef.current < 2000) {
            logger.log('[useChatSocket] Reconnection throttled...');
            return;
        }
        lastReconnectTimeRef.current = now;

        updateConnectionState('connecting', 0);
        socketService.disconnect();
        setTimeout(() => {
            socketService.connect();
        }, 500);
    }, [updateConnectionState]);

    return {
        socket,
        isConnected: connectionState.status === 'connected',
        connectionState,
        error,
        reconnect,
    };
}
