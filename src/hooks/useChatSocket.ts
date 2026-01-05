import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { useNotifications } from '../contexts/NotificationContext';
import { ErrorHandler, ApiError } from '../utils/errorHandler';

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
     * 添加连接错误通知
     */
    const showConnectionError = useCallback((error: ApiError, attempt: number) => {
        const notificationType = ErrorHandler.getNotificationType(error);
        const userMessage = ErrorHandler.getUserMessage(error);
        const suggestedAction = ErrorHandler.getSuggestedAction(error);

        let message = userMessage;
        if (attempt <= maxReconnectAttempts) {
            message += ` (重连尝试 ${attempt}/${maxReconnectAttempts})`;
        }

        addNotification({
            type: notificationType,
            title: '连接失败',
            message,
            action: suggestedAction ? {
                label: suggestedAction,
                onClick: () => window.location.reload()
            } : undefined,
            duration: attempt <= maxReconnectAttempts ? 0 : 8000, // 重连期间不自动消失
            persistent: attempt <= maxReconnectAttempts
        });
    }, [addNotification]);

    /**
     * 处理连接状态变化
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
     * 手动重连
     */
    const reconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        updateConnectionState('disconnected', 0);

        // 延迟重连以避免频繁重连
        setTimeout(() => {
            setupSocket();
        }, 100);
    }, [updateConnectionState]);

    /**
     * 设置 Socket 连接
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
            reconnection: false, // 我们自己处理重连
            reconnectionDelay: reconnectDelay,
            reconnectionAttempts: maxReconnectAttempts,
            timeout: 10000 // 10秒连接超时
        });

        socket.on('connect', () => {
            console.log('WebSocket connected successfully, socket ID:', socket.id);
            updateConnectionState('connected', 0);
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);

            // 判断断开原因决定是否重连
            if (reason === 'io server disconnect') {
                // 服务器主动断开，不自动重连
                updateConnectionState('disconnected', 0);
                addNotification({
                    type: 'warning',
                    title: '连接已断开',
                    message: '与服务器的连接已断开，请刷新页面重试',
                    action: {
                        label: '刷新页面',
                        onClick: () => window.location.reload()
                    },
                    duration: 0,
                    persistent: true
                });
            } else {
                // 网络断开，尝试重连
                updateConnectionState('reconnecting', attemptRef.current + 1);
            }
        });

        socket.on('connect_error', (err) => {
            console.error('WebSocket connection error details:', err.message, err);

            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket connection');
            const newAttempt = attemptRef.current + 1;

            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);

            showConnectionError(apiError, newAttempt);
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('WebSocket reconnected after', attemptNumber, 'attempts');
            updateConnectionState('connected', 0);

            // 成功重连时显示通知
            addNotification({
                type: 'success',
                title: '重连成功',
                message: '已重新建立连接',
                duration: 3000
            });
        });

        socket.on('reconnect_error', (err) => {
            console.error('WebSocket reconnection error:', err.message);
            const apiError = ErrorHandler.parseError(new Error(err.message), 'WebSocket reconnection');
            const newAttempt = attemptRef.current + 1;

            updateConnectionState(newAttempt > maxReconnectAttempts ? 'failed' : 'reconnecting', newAttempt, apiError);
        });

        socket.on('reconnect_failed', () => {
            console.error('WebSocket reconnection failed after maximum attempts');
            const apiError = ErrorHandler.parseError(new Error('重连失败'), 'WebSocket reconnection');
            updateConnectionState('failed', maxReconnectAttempts, apiError);

            addNotification({
                type: 'error',
                title: '重连失败',
                message: '无法重新建立连接，请检查网络或刷新页面',
                action: {
                    label: '重新连接',
                    onClick: reconnect
                },
                duration: 0,
                persistent: true
            });
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