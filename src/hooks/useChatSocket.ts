import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { ErrorHandler, ApiError } from '../utils/errorHandler';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

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
    const isConnectedRef = useRef(false); // To track if the socket was connected before a server disconnect

    const lastHiddenTimeRef = useRef<number | null>(null);

    const [connectionState, setConnectionState] = useState<ConnectionState>({
        status: 'disconnected',
        attempt: 0
    });
    const [error, setError] = useState<string | null>(null);

    const maxReconnectAttempts = Infinity;
    const RECONNECT_DELAY = 1000; // Reduced for faster auto-reconnect

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
     * Refreshes the access token.
     */
    const refreshAccessToken = useCallback(async () => {
        try {
            const refreshed = await apiClient.ensureAuth();
            if (!refreshed) {
                logger.error('Failed to refresh access token.');
                throw new Error('Failed to refresh access token');
            }
            return refreshed;
        } catch (err) {
            logger.error('Error refreshing access token:', err);
            throw err;
        }
    }, []);

    /**
     * Setup Socket Connection
     */
    const setupSocket = useCallback(() => {
        // Ensure any existing socket is fully cleaned up before creating a new one
        if (socketRef.current) {
            logger.debug('Cleaning up existing socket before new setup...');
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Socket.IO connection configuration
        let wsUrl: string;

        if (import.meta.env.DEV) {
            wsUrl = '/api/chat';
        } else {
            const baseUrl = API_BASE_URL || window.location.origin;
            wsUrl = baseUrl.startsWith('http') ? `${baseUrl}/api/chat` : `${window.location.origin}${baseUrl}/api/chat`;
        }

        if (import.meta.env.DEV) {
            logger.debug('Connecting to Socket.IO (Cookie-based):', wsUrl);
        }
        updateConnectionState('connecting');

        const socket = io(wsUrl, {
            transports: ['websocket'],
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: RECONNECT_DELAY, // Use RECONNECT_DELAY
            reconnectionDelayMax: 3000,
            reconnectionAttempts: maxReconnectAttempts,
            timeout: 20000,
            autoConnect: true,
            forceNew: true // Critical for mobile: force a new connection manager
        });

        socket.on('connect', () => {
            logger.debug('WebSocket connected successfully, socket ID:', socket.id);
            updateConnectionState('connected', 0);
            authRetryCountRef.current = 0;
            attemptRef.current = 0;
        });

        socket.on('disconnect', (reason) => {
            logger.log('WebSocket disconnected:', reason);

            if (reason === 'io server disconnect') {
                updateConnectionState('disconnected', 0);
                logger.warn('Socket disconnected by server, attempting auth refresh...');
                refreshAccessToken().then((success) => {
                    if (success && isConnectedRef.current) { // Added isConnectedRef.current check
                        logger.log('Auth restored, reconnecting socket...');
                        socket.connect();
                    }
                }).catch(err => logger.error('Auth refresh error:', err)); // Changed console.error to logger.error
            } else if (reason === 'io client disconnect') {
                updateConnectionState('disconnected', 0);
            } else {
                updateConnectionState('reconnecting', attemptRef.current);
            }
        });

        socket.on('connect_error', async (err) => {
            // Only log as error if it's genuinely stuck or critical
            if (attemptRef.current < 2) {
                logger.debug('WebSocket connection attempt:', err.message);
            } else if (attemptRef.current === maxReconnectAttempts) {
                logger.error('WebSocket connection failed permanently:', err.message);
            } else {
                logger.warn('WebSocket connection retrying:', err.message);
            }

            const isAuthError = err.message.includes('Authentication error') ||
                err.message.includes('Unauthorized') ||
                err.message.includes('401') ||
                err.message === 'xhr poll error';

            if (isAuthError) {
                authRetryCountRef.current++;
                const delay = Math.min(authRetryCountRef.current * 1000, 10000);
                logger.warn(`Socket auth error detected (Attempt ${authRetryCountRef.current}), waiting ${delay}ms to refresh token...`);

                setTimeout(async () => {
                    try {
                        const refreshed = await apiClient.ensureAuth();
                        if (refreshed) {
                            logger.log('Token refreshed successfully, retrying socket connection...');
                            socket.connect();
                        }
                    } catch (refreshErr) {
                        logger.error('Failed to trigger auth refresh from socket:', refreshErr);
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
            logger.debug('WebSocket reconnection attempt:', attempt);
            updateConnectionState('reconnecting', attempt);
        });

        socket.on('reconnect_failed', () => {
            logger.error('WebSocket reconnection failed after maximum attempts');
            const apiError = ErrorHandler.parseError(new Error('Reconnection failed'), 'WebSocket reconnection');
            updateConnectionState('failed', maxReconnectAttempts, apiError);
        });

        socket.on('reconnect_error', (err) => {
            logger.error('WebSocket reconnection error:', err.message);
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
            logger.log('Reconnection throttled...');
            return;
        }
        lastReconnectTimeRef.current = now;

        logger.log('Executing manual hard reconnect...');

        // Hard reset: fully disconnect and clear ref
        if (socketRef.current) {
            socketRef.current.removeAllListeners(); // Good practice to remove listeners
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Reset state
        updateConnectionState('connecting', 0);

        // Re-initialize
        setupSocket();
    }, [updateConnectionState, setupSocket]);

    useEffect(() => {
        setupSocket();

        const handleVisibilityChange = () => {
            const now = Date.now();

            if (document.visibilityState === 'hidden') {
                lastHiddenTimeRef.current = now;
                logger.debug("App hidden, recording timestamp.");
            } else if (document.visibilityState === 'visible') {
                const sleepDuration = lastHiddenTimeRef.current ? now - lastHiddenTimeRef.current : 0;
                logger.log(`App visible. Sleep duration: ${sleepDuration}ms`);

                // If app was backgrounded for more than 60s, force a hard reconnect
                // This handles cases where the socket is in a zombie state
                if (sleepDuration > 60000) {
                    logger.warn('App was backgrounded for > 60s, forcing hard socket reconnect...');
                    reconnect();
                    return;
                }

                const socket = socketRef.current;

                // If not connected, or if we suspect a drop, check connection
                if (!socket || !socket.connected) {
                    logger.log('Socket disconnected on wake. Waiting 1s for network radio...');
                    // Add a small delay for network radio to wake up on mobile
                    setTimeout(() => {
                        if (!socketRef.current?.connected) {
                            logger.log('Still disconnected after wait, reconnecting...');
                            reconnect();
                        }
                    }, 1000);
                }
            }
        };

        const handleFocus = () => {
            const socket = socketRef.current;
            if (socket && !socket.connected) {
                // Similar small delay logic can be applied here if needed, 
                // but visibilityChange is usually the primary trigger on mobile.
                reconnect();
            }
        };

        const handleOnline = () => {
            logger.log('Network online detected. Reconnecting...');
            reconnect();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
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