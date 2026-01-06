import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { useNotifications } from '../contexts/NotificationContext';
import { ErrorHandler, ApiError } from '../utils/errorHandler';
import { apiClient } from '../utils/apiClient';

interface ConnectionState {
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
    attempt: number;
    lastError?: ApiError;
}

export function useChatSocket() {
    const socketRef = useRef<Socket | null>(null);
    const attemptRef = useRef(0);
    const authRetryCountRef = useRef(0);
    const lastReconnectTimeRef = useRef(0);

    const [connectionState, setConnectionState] = useState<ConnectionState>({
        status: 'disconnected',
        attempt: 0
    });
    const [error, setError] = useState<string | null>(null);
    const { addNotification } = useNotifications();

    const maxReconnectAttempts = 10;
    const reconnectDelay = 2000;

    /**
     * Show connection error notification (Disabled per user request - subtle UI only)
     */
    const showConnectionError = useCallback((error: ApiError, attempt: number) => {
        console.warn('Connection error (silent):', error.message, 'Attempt:', attempt);
    }, []);

    /**
     * Handle connection state changes
     */
    const updateConnectionState = useCallback((status: ConnectionState['status'], attempt: number = 0, error?: ApiError) => {
        attemptRef.current = attempt;
        setConnectionState({ status, attempt, lastError: error });

        if (error) {
            setError(error.message);
        } else {
            setError(null);
        }
    }, []);

    /**
     * Setup Socket Connection
     */
    const setupSocket = useCallback(() => {
        // Socket.IO connection configuration
        let wsUrl: string;

        if (import.meta.env.DEV) {
            wsUrl = '/api/chat';
        } else {
            const baseUrl = API_BASE_URL || window.location.origin;
            wsUrl = baseUrl.startsWith('http') ? `${baseUrl}/api/chat` : `${window.location.origin}${baseUrl}/api/chat`;
        }

        console.log('Connecting to Socket.IO (Cookie-based):', wsUrl);
        updateConnectionState('connecting');

        const socket = io(wsUrl, {
            transports: ['websocket'],
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: reconnectDelay,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: maxReconnectAttempts,
            timeout: 20000,
            autoConnect: true
        });

        socket.on('connect', () => {
            console.log('WebSocket connected successfully, socket ID:', socket.id);
            updateConnectionState('connected', 0);
            authRetryCountRef.current = 0;
            attemptRef.current = 0;
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);

            if (reason === 'io server disconnect') {
                updateConnectionState('disconnected', 0);
                console.warn('Socket disconnected by server, attempting auth refresh...');
                apiClient.ensureAuth().then((success) => {
                    if (success) {
                        console.log('Auth restored, reconnecting socket...');
                        socket.connect();
                    }
                }).catch(err => console.error('Auth refresh error:', err));
            } else if (reason === 'io client disconnect') {
                updateConnectionState('disconnected', 0);
            } else {
                updateConnectionState('reconnecting', attemptRef.current);
            }
        });

        socket.on('connect_error', async (err) => {
            console.error('WebSocket connection error details:', err.message, err);

            const isAuthError = err.message.includes('Authentication error') ||
                err.message.includes('Unauthorized') ||
                err.message.includes('401') ||
                err.message === 'xhr poll error';

            if (isAuthError) {
                authRetryCountRef.current++;
                const delay = Math.min(authRetryCountRef.current * 1000, 10000);
                console.warn(`Socket auth error detected (Attempt ${authRetryCountRef.current}), waiting ${delay}ms to refresh token...`);

                setTimeout(async () => {
                    try {
                        const refreshed = await apiClient.ensureAuth();
                        if (refreshed) {
                            console.log('Token refreshed successfully, retrying socket connection...');
                            socket.connect();
                        }
                    } catch (refreshErr) {
                        console.error('Failed to trigger auth refresh from socket:', refreshErr);
                    }
                }, delay);
                return;
            }

            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket connection');
            const newAttempt = attemptRef.current + 1;
            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);

            if (!isAuthError) {
                showConnectionError(apiError, newAttempt);
            }
        });

        socket.on('reconnect_attempt', (attempt) => {
            console.log('WebSocket reconnection attempt:', attempt);
            updateConnectionState('reconnecting', attempt);
        });

        socket.on('reconnect_failed', () => {
            console.error('WebSocket reconnection failed after maximum attempts');
            const apiError = ErrorHandler.parseError(new Error('Reconnection failed'), 'WebSocket reconnection');
            updateConnectionState('failed', maxReconnectAttempts, apiError);
        });

        socket.on('reconnect_error', (err) => {
            console.error('WebSocket reconnection error:', err.message);
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
            console.log('Reconnection throttled...');
            return;
        }
        lastReconnectTimeRef.current = now;

        if (socketRef.current) {
            if (socketRef.current.connected) {
                socketRef.current.disconnect();
            }
            updateConnectionState('connecting', 0);
            socketRef.current.connect();
        } else {
            setupSocket();
        }
    }, [updateConnectionState, setupSocket]);

    useEffect(() => {
        setupSocket();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const socket = socketRef.current;
                console.log('App visible. Socket status:', socket?.connected ? 'connected' : 'disconnected');

                if (socket && !socket.connected) {
                    reconnect();
                }
            }
        };

        const handleFocus = () => {
            const socket = socketRef.current;
            if (socket && !socket.connected) {
                reconnect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [setupSocket, reconnect]);

    return {
        socket: socketRef.current,
        isConnected: connectionState.status === 'connected',
        connectionState,
        error,
        reconnect
    };
}