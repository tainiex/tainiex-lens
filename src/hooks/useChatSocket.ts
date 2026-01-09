import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import * as Sentry from "@sentry/react";
import { ErrorHandler, ApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { getNamespaceSocket, refreshAndReconnect } from '../utils/socketManager';

interface ConnectionState {
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
    attempt: number;
    lastError?: ApiError;
}

export function useChatSocket() {
    const socketRef = useRef<Socket | null>(null);
    const attemptRef = useRef(0);
    const lastReconnectTimeRef = useRef(0);
    const isConnectedRef = useRef(false); // To track if the socket was connected before a server disconnect
    const isInitializedRef = useRef(false); // Track if socket has been initialized

    const [connectionState, setConnectionState] = useState<ConnectionState>({
        status: 'disconnected',
        attempt: 0
    });
    const [error, setError] = useState<string | null>(null);

    const maxReconnectAttempts = Infinity;

    /**
     * Show connection error notification (Disabled per user request - subtle UI only)
     */
    const showConnectionError = useCallback((error: ApiError, attempt: number) => {
        logger.warn('Connection error (silent):', error.message, 'Attempt:', attempt);
    }, []);

    /**
     * Handle connection state changes
     */
    const updateConnectionState = useCallback((status: ConnectionState['status'], attempt: number = 0, error?: ApiError) => {
        attemptRef.current = attempt;
        setConnectionState({ status, attempt, lastError: error });
        isConnectedRef.current = status === 'connected'; // Update isConnectedRef

        if (error) {
            setError(error.message);
        } else {
            setError(null);
        }
    }, []);



    /**
     * 设置 Socket 连接使用共享 Manager
     */
    const setupSocket = useCallback(() => {
        // Ensure any existing socket is fully cleaned up before creating a new one
        if (socketRef.current) {
            logger.debug('[ChatSocket] Cleaning up existing socket before new setup...');
            socketRef.current.removeAllListeners();
            socketRef.current = null;
        }

        logger.debug('[ChatSocket] Getting namespace socket from Manager');
        // Get namespace socket from shared Manager
        const socket = getNamespaceSocket('/api/chat');

        // Check if socket is already connected immediately
        if (socket.connected) {
            logger.debug('[ChatSocket] Socket already connected, socket ID:', socket.id);
            updateConnectionState('connected', 0);
        } else {
            updateConnectionState('connecting');
        }

        socket.on('connect', () => {
            logger.debug('[ChatSocket] Connected successfully, socket ID:', socket.id);
            Sentry.addBreadcrumb({
                category: 'websocket.chat',
                message: 'Connected',
                data: { socketId: socket.id },
                level: 'info'
            });
            updateConnectionState('connected', 0);
            attemptRef.current = 0;
        });

        socket.on('disconnect', (reason) => {
            logger.log('[ChatSocket] Disconnected:', reason);
            Sentry.addBreadcrumb({
                category: 'websocket.chat',
                message: 'Disconnected',
                data: { reason },
                level: 'warning'
            });

            if (reason === 'io server disconnect') {
                updateConnectionState('disconnected', 0);
                logger.warn('[ChatSocket] Socket disconnected by server, attempting auth refresh...');
                refreshAndReconnect().then((success) => {
                    if (success) {
                        logger.log('[ChatSocket] Auth restored, socket will auto-reconnect');
                    }
                }).catch(err => logger.error('[ChatSocket] Auth refresh error:', err));
            } else if (reason === 'io client disconnect') {
                updateConnectionState('disconnected', 0);
            } else {
                updateConnectionState('reconnecting', attemptRef.current);
            }
        });

        socket.on('connect_error', async (err) => {
            // Only log as error if it's genuinely stuck or critical
            if (attemptRef.current < 2) {
                logger.debug('[ChatSocket] Connection attempt:', err.message);
            } else if (attemptRef.current === maxReconnectAttempts) {
                logger.error('[ChatSocket] Connection failed permanently:', err.message);
            } else {
                logger.warn('[ChatSocket] Connection retrying:', err.message);
            }

            // Capture all connection errors to Sentry for debugging
            Sentry.captureException(err, {
                tags: {
                    type: 'websocket_chat_connect_error',
                    attempt: attemptRef.current
                }
            });

            const isAuthError = err.message.includes('Authentication error') ||
                err.message.includes('Unauthorized') ||
                err.message.includes('401') ||
                err.message === 'xhr poll error';

            if (isAuthError) {
                logger.warn('[ChatSocket] Auth error detected, delegating to Manager...');
                Sentry.addBreadcrumb({
                    category: 'websocket.chat',
                    message: 'Auth error',
                    data: { message: err.message },
                    level: 'warning'
                });
                // Delegate to Manager's refreshAndReconnect
                refreshAndReconnect();
                return;
            }

            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket connection');
            const newAttempt = attemptRef.current + 1;
            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);
            showConnectionError(apiError, newAttempt);
        });

        socket.on('reconnect_attempt', (attempt) => {
            logger.debug('[ChatSocket] Reconnection attempt:', attempt);
            Sentry.addBreadcrumb({
                category: 'websocket.chat',
                message: 'Reconnection attempt',
                data: { attempt },
                level: 'info'
            });
            updateConnectionState('reconnecting', attempt);
        });

        socket.on('reconnect_failed', () => {
            logger.error('[ChatSocket] Reconnection failed after maximum attempts');
            Sentry.addBreadcrumb({
                category: 'websocket.chat',
                message: 'Reconnection failed',
                level: 'error'
            });
            const apiError = ErrorHandler.parseError(new Error('Reconnection failed'), 'WebSocket reconnection');
            updateConnectionState('failed', maxReconnectAttempts, apiError);
        });

        socket.on('reconnect_error', (err) => {
            logger.error('[ChatSocket] Reconnection error:', err.message);
            Sentry.addBreadcrumb({
                category: 'websocket.chat',
                message: 'Reconnection error',
                data: { error: err.message },
                level: 'warning'
            });
        });

        socketRef.current = socket;
        return socket;
    }, [updateConnectionState, showConnectionError]);

    /**
     * Manual reconnect
     */
    const reconnect = useCallback(() => {
        const now = Date.now();
        if (now - lastReconnectTimeRef.current < 2000) {
            logger.log('[ChatSocket] Reconnection throttled...');
            return;
        }
        lastReconnectTimeRef.current = now;

        logger.log('[ChatSocket] Executing manual reconnect...');
        Sentry.addBreadcrumb({
            category: 'websocket.chat',
            message: 'Manual reconnect',
            level: 'info'
        });

        // Reset state
        updateConnectionState('connecting', 0);

        // Reconnect socket
        if (socketRef.current) {
            socketRef.current.connect();
        } else {
            setupSocket();
        }
    }, [updateConnectionState, setupSocket]);

    useEffect(() => {
        // If socket already exists and is connected, don't recreate
        if (socketRef.current?.connected && isInitializedRef.current) {
            logger.debug('[ChatSocket] Socket already initialized and connected, skipping setup');
            updateConnectionState('connected', 0);
            return;
        }

        // Only setup if not initialized or socket is disconnected
        if (!isInitializedRef.current || !socketRef.current) {
            setupSocket();
            isInitializedRef.current = true;
        }

        return () => {
            // Clean up listeners when component unmounts
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                // Don't disconnect here - let Manager handle it
                socketRef.current = null;
            }
            // Reset initialization flag on unmount
            isInitializedRef.current = false;
        };
    }, [setupSocket, updateConnectionState]);

    return {
        socket: socketRef.current,
        isConnected: connectionState.status === 'connected',
        connectionState,
        error,
        reconnect
    };
}