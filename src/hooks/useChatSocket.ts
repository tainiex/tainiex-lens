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
    const [connectionState, setConnectionState] = useState<ConnectionState>({
        status: 'disconnected',
        attempt: 0
    });
    const [error, setError] = useState<string | null>(null);
    const { addNotification } = useNotifications();
    const maxReconnectAttempts = 5;
    const reconnectDelay = 1000;

    /**
     * Show connection error notification
     */
    /**
     * Show connection error notification (Disabled per user request - subtle UI only)
     */
    const showConnectionError = useCallback((error: ApiError, attempt: number) => {
        // Silent failing - using UI indicator instead
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
     * Manual reconnect
     */
    const reconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        updateConnectionState('disconnected', 0);

        // Delay reconnection to avoid flapping
        setTimeout(() => {
            setupSocket();
        }, 100);
    }, [updateConnectionState]);

    /**
     * Setup Socket Connection
     */
    const setupSocket = useCallback(() => {
        // Socket.IO connection configuration
        // Backend uses namespace: '/api/chat'
        let wsUrl: string;

        if (import.meta.env.DEV) {
            // Development: use relative path to leverage Vite proxy (/api/chat)
            wsUrl = '/api/chat';
        } else {
            // Production: use environment variable or current origin
            const baseUrl = API_BASE_URL || window.location.origin;
            wsUrl = baseUrl.startsWith('http') ? `${baseUrl}/api/chat` : `${window.location.origin}${baseUrl}/api/chat`;
        }

        console.log('Connecting to Socket.IO (Cookie-based):', wsUrl);

        updateConnectionState('connecting');

        // Connect to Socket.IO - force websocket transport to avoid polling proxy issues
        const socket = io(wsUrl, {
            transports: ['websocket'],
            withCredentials: true,  // Include cookies for authentication
            reconnection: false, // We handle reconnection manually
            reconnectionDelay: reconnectDelay,
            reconnectionAttempts: maxReconnectAttempts,
            timeout: 10000 // 10s connection timeout
        });

        socket.on('connect', () => {
            console.log('WebSocket connected successfully, socket ID:', socket.id);
            updateConnectionState('connected', 0);
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);

            // Determine if we should reconnect based on reason
            if (reason === 'io server disconnect') {
                // Server disconnected us, do not auto-reconnect
                updateConnectionState('disconnected', 0);
                // Notification removed per request
            } else {
                // Network disconnect, try to reconnect
                updateConnectionState('reconnecting', attemptRef.current + 1);
            }
        });

        socket.on('connect_error', async (err) => {
            console.error('WebSocket connection error details:', err.message, err);

            // Check for authentication error
            // Socket.IO middleware usually throws error with message 'Authentication error' or similar status
            const isAuthError = err.message.includes('Authentication error') ||
                err.message.includes('Unauthorized') ||
                err.message.includes('401') ||
                // Sometimes it's just a general connection error if handshake fails
                err.message === 'xhr poll error';

            if (isAuthError) {
                console.warn('Socket auth error detected, attempting to refresh token...');
                try {
                    const refreshed = await apiClient.ensureAuth();
                    if (refreshed) {
                        console.log('Token refreshed successfully, retrying socket connection immediately...');
                        // Force reconnect immediately
                        socket.connect();
                        return;
                    }
                } catch (refreshErr) {
                    console.error('Failed to trigger auth refresh from socket:', refreshErr);
                }
            }

            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket connection');
            const newAttempt = attemptRef.current + 1;

            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);

            // Only show non-auth errors or if refresh failed
            if (!isAuthError) {
                showConnectionError(apiError, newAttempt);
            }
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('WebSocket reconnected after', attemptNumber, 'attempts');
            updateConnectionState('connected', 0);

            // Show notification on successful reconnection
            // (Removed per request)
            /*
            addNotification({
                type: 'success',
                title: 'Reconnected',
                message: 'Connection exhausted',
                duration: 3000
            });
            */
        });

        socket.on('reconnect_error', (err) => {
            console.error('WebSocket reconnection error:', err.message);
            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket reconnection');
            const newAttempt = attemptRef.current + 1;

            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);
        });

        socket.on('reconnect_failed', () => {
            console.error('WebSocket reconnection failed after maximum attempts');
            const apiError = ErrorHandler.parseError(new Error('Reconnection failed'), 'WebSocket reconnection');
            updateConnectionState('failed', maxReconnectAttempts, apiError);

            // Notification removed per request
        });

        socketRef.current = socket;

        return socket;
    }, [updateConnectionState, showConnectionError, addNotification, reconnect]);

    useEffect(() => {
        const socket = setupSocket();

        // Handle visibility change to reconnect when app comes back to foreground (mobile unlock)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const currentStatus = connectionState.status;
                console.log('App successfully became visible. Socket status:', currentStatus);
                // Only reconnect if we are disconnected or failed, and not manually disconnected (implied by this not being tracked, but good enough)
                if (currentStatus === 'disconnected' || currentStatus === 'failed') {
                    console.log('Triggering reconnection on visibility change...');
                    reconnect();
                } else if (!socket?.connected) {
                    console.log('Socket object says disconnected. Reconnecting...');
                    reconnect();
                }
            }
        };

        // Also handle window focus as a backup
        const handleFocus = () => {
            if (!socket?.connected) {
                console.log('Window focused and socket disconnected. Reconnecting...');
                reconnect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            if (socket) {
                socket.disconnect();
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