/**
 * Socket.IO Manager Singleton / Socket.IO 管理器单例
 * 
 * Provides a shared Socket.IO Manager to multiplex multiple namespaces
 * over a single WebSocket connection.
 * 
 * 提供共享的 Socket.IO Manager，在单个 WebSocket 连接上复用多个命名空间。
 */

import { Manager, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { apiClient } from './apiClient';
import { logger } from './logger';
import * as Sentry from '@sentry/react';

// Singleton Manager instance
let managerInstance: Manager | null = null;

// Namespace socket instances
let chatSocket: Socket | null = null;
let collaborationSocket: Socket | null = null;

// Lifecycle tracking
let lastHiddenTimeRef: number | null = null;
let authRetryCount = 0;

/**
 * Get or create the shared Socket.IO Manager
 * 获取或创建共享的 Socket.IO Manager
 */
export function getSocketManager(): Manager {
    if (managerInstance) {
        return managerInstance;
    }

    // Construct WebSocket URL
    let baseUrl: string;
    if (import.meta.env.DEV) {
        baseUrl = window.location.origin;
    } else {
        baseUrl = API_BASE_URL || window.location.origin;
        if (!baseUrl.startsWith('http')) {
            baseUrl = `${window.location.origin}${baseUrl}`;
        }
    }

    logger.debug('[SocketManager] Creating Manager with base URL:', baseUrl);

    // Create Manager with shared configuration
    managerInstance = new Manager(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        withCredentials: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 30000,
        autoConnect: true,
        forceNew: false, // Reuse existing Manager
    });

    // Setup global Manager event handlers
    setupManagerEvents(managerInstance);

    return managerInstance;
}

/**
 * Get or create a namespace socket
 * 获取或创建命名空间 socket
 */
export function getNamespaceSocket(
    namespace: '/api/chat' | '/api/collaboration'
): Socket {
    const manager = getSocketManager();

    if (namespace === '/api/chat') {
        if (!chatSocket) {
            logger.debug('[SocketManager] Creating Chat namespace socket');
            chatSocket = manager.socket('/api/chat');
        }
        return chatSocket;
    } else {
        if (!collaborationSocket) {
            logger.debug('[SocketManager] Creating Collaboration namespace socket');
            collaborationSocket = manager.socket('/api/collaboration');
        }
        return collaborationSocket;
    }
}

/**
 * Setup Manager-level event handlers
 * 设置 Manager 级别的事件处理器
 */
function setupManagerEvents(manager: Manager) {
    // Manager-level reconnection attempt
    manager.on('reconnect_attempt', (attempt) => {
        logger.debug('[SocketManager] Reconnection attempt:', attempt);
        Sentry.addBreadcrumb({
            category: 'websocket.manager',
            message: 'Reconnection attempt',
            data: { attempt },
            level: 'info',
        });
    });

    // Manager-level reconnection error
    manager.on('reconnect_error', (err) => {
        logger.warn('[SocketManager] Reconnection error:', err.message);
        Sentry.addBreadcrumb({
            category: 'websocket.manager',
            message: 'Reconnection error',
            data: { error: err.message },
            level: 'warning',
        });
    });

    // Manager-level reconnection failed
    manager.on('reconnect_failed', () => {
        logger.error('[SocketManager] Reconnection failed after max attempts');
        Sentry.captureMessage('WebSocket Manager reconnection failed', 'error');
    });

    // Manager-level error
    manager.on('error', (err) => {
        logger.error('[SocketManager] Manager error:', err);
        Sentry.captureException(err, {
            tags: { type: 'websocket_manager_error' },
        });
    });
}

/**
 * Refresh access token and reconnect
 * 刷新访问 token 并重连
 */
export async function refreshAndReconnect(): Promise<boolean> {
    try {
        authRetryCount++;
        // Use a much shorter delay for the first attempt to be responsive
        // But backoff if it keeps failing despite ensuring auth
        const delay = authRetryCount === 1 ? 0 : Math.min(authRetryCount * 1000, 10000);

        if (delay > 0) {
            logger.warn(
                `[SocketManager] Auth error (attempt ${authRetryCount}), retrying in ${delay}ms`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // apiClient now correctly deduplicates concurrent refresh requests
        // so we can call this safely from multiple contexts
        logger.debug(`[SocketManager] Ensuring auth (attempt ${authRetryCount})...`);
        const refreshed = await apiClient.ensureAuth();

        if (refreshed) {
            logger.log('[SocketManager] Token refreshed/valid, reconnecting...');
            authRetryCount = 0; // Reset on success

            // Reconnect Manager (this will reconnect all namespace sockets)
            const manager = getSocketManager();
            manager.engine.close();
            manager.connect();

            return true;
        }
        return false;
    } catch (err) {
        logger.error('[SocketManager] Failed to refresh token:', err);
        return false;
    }
}

/**
 * Manual reconnect for all sockets
 * 手动重连所有 socket
 */
export function reconnectAllSockets() {
    logger.log('[SocketManager] Manual reconnect requested');

    const manager = getSocketManager();

    // Close and reconnect Manager
    manager.engine.close();
    manager.connect();

    Sentry.addBreadcrumb({
        category: 'websocket.manager',
        message: 'Manual reconnect',
        level: 'info',
    });
}

/**
 * Disconnect all sockets and cleanup
 * 断开所有 socket 并清理
 */
export function disconnectAllSockets() {
    logger.log('[SocketManager] Disconnecting all sockets');

    if (chatSocket) {
        chatSocket.disconnect();
        chatSocket = null;
    }

    if (collaborationSocket) {
        collaborationSocket.disconnect();
        collaborationSocket = null;
    }

    if (managerInstance) {
        managerInstance.removeAllListeners();
        managerInstance = null;
    }
}

/**
 * Initialize global lifecycle listeners
 * 初始化全局生命周期监听器
 */
export function initializeGlobalListeners() {
    const handleVisibilityChange = () => {
        const now = Date.now();

        if (document.visibilityState === 'hidden') {
            lastHiddenTimeRef = now;
            logger.debug('[SocketManager] App hidden');
            Sentry.addBreadcrumb({
                category: 'app.lifecycle',
                message: 'App hidden',
                level: 'info',
            });
        } else if (document.visibilityState === 'visible') {
            const sleepDuration = lastHiddenTimeRef ? now - lastHiddenTimeRef : 0;
            logger.log(`[SocketManager] App visible. Sleep duration: ${sleepDuration}ms`);

            Sentry.addBreadcrumb({
                category: 'app.lifecycle',
                message: 'App visible',
                data: { sleepDuration },
                level: 'info',
            });

            // If backgrounded for >60s, force hard reconnect
            if (sleepDuration > 60000) {
                logger.log('[SocketManager] Long sleep detected, forcing reconnect...');
                Sentry.addBreadcrumb({
                    category: 'websocket.manager',
                    message: 'Hard reconnect after long sleep',
                    data: { sleepDuration },
                    level: 'warning',
                });
                reconnectAllSockets();
            } else if (managerInstance && !managerInstance.engine.readyState) {
                // If disconnected, wait 1s for network radio to wake up
                setTimeout(() => {
                    if (managerInstance && !managerInstance.engine.readyState) {
                        logger.log('[SocketManager] Still disconnected after wait, reconnecting...');
                        reconnectAllSockets();
                    }
                }, 1000);
            }
        }
    };

    const handleFocus = () => {
        if (managerInstance && !managerInstance.engine.readyState) {
            logger.log('[SocketManager] Window focused, reconnecting...');
            reconnectAllSockets();
        }
    };

    const handleOnline = () => {
        logger.log('[SocketManager] Network online, reconnecting...');
        Sentry.addBreadcrumb({
            category: 'app.lifecycle',
            message: 'Network online',
            level: 'info',
        });
        reconnectAllSockets();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // Return cleanup function
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('online', handleOnline);
    };
}
