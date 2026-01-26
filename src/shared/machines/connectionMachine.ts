import { setup, fromCallback, assign } from 'xstate';
import { socketService, ConnectionStatus } from '../services/SocketService';
import { logger } from '../utils/logger';

/**
 * WebSocket 连接状态机 (Enhanced)
 * WebSocket Connection State Machine
 *
 * 状态图可视化: https://stately.ai/viz
 * 粘贴本文件代码即可查看状态转换图
 *
 * State Diagram Visualizer: https://stately.ai/viz
 * Paste this file's code to visualize state transitions
 */
export const connectionMachine = setup({
    types: {
        context: {} as {
            error?: string;
            latency?: number;
            reconnectCount?: number;
        },
        events: {} as
            | {
                  type: 'STATUS_CHANGE';
                  status: ConnectionStatus;
                  latency?: number;
                  reconnectCount?: number;
              }
            | { type: 'NETWORK_ONLINE' }
            | { type: 'NETWORK_OFFLINE' }
            | { type: 'RETRY' },
    },

    actors: {
        // 订阅 SocketService 的连接状态（增强版）
        // Subscribe to SocketService connection state (Enhanced)
        socketSubscription: fromCallback(({ sendBack }) => {
            const unsubscribe = socketService.subscribe((status, metrics) => {
                sendBack({
                    type: 'STATUS_CHANGE',
                    status,
                    latency: metrics?.latency,
                    reconnectCount: metrics?.reconnectCount,
                });
            });

            return () => {
                unsubscribe();
            };
        }),
    },

    actions: {
        updateMetrics: assign({
            latency: ({ event }) => {
                return event.type === 'STATUS_CHANGE' ? event.latency : undefined;
            },
            reconnectCount: ({ event }) => {
                return event.type === 'STATUS_CHANGE' ? event.reconnectCount : undefined;
            },
        }),
        clearError: assign({
            error: () => undefined,
        }),
        setOfflineError: assign({
            error: () => 'No Internet Connection',
        }),
        setFailedError: assign({
            error: () => 'Connection failed. Please try again.',
        }),
    },
}).createMachine({
    id: 'websocket-connection',
    initial: 'initializing',
    context: {
        error: undefined,
        latency: undefined,
        reconnectCount: undefined,
    },

    states: {
        initializing: {
            // 启动时立即开始订阅
            // Start subscription immediately on startup
            entry: () => {
                logger.log('[ConnectionMachine] State: initializing');
            },
            invoke: {
                src: 'socketSubscription',
            },
            always: [
                {
                    guard: () => socketService.getConnectionStatus() === ConnectionStatus.CONNECTED,
                    target: 'connected',
                },
                {
                    target: 'connecting',
                },
            ],
        },

        disconnected: {
            entry: () => {
                logger.log('[ConnectionMachine] State: disconnected');
            },
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTING,
                        target: 'connecting',
                        actions: 'updateMetrics',
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTED,
                        target: 'connected',
                        actions: 'updateMetrics',
                    },
                ],
                RETRY: 'connecting',
                NETWORK_ONLINE: 'connecting',
            },
        },

        connecting: {
            entry: () => {
                logger.log('[ConnectionMachine] State: connecting');
                socketService.connect();
            },
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTED,
                        target: 'connected',
                        actions: ['clearError', 'updateMetrics'],
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.RECONNECTING,
                        target: 'reconnecting',
                        actions: 'updateMetrics',
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.FAILED,
                        target: 'failed',
                        actions: ['setFailedError', 'updateMetrics'],
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.DISCONNECTED,
                        target: 'reconnecting',
                        actions: 'updateMetrics',
                    },
                ],
                NETWORK_OFFLINE: 'offline',
            },
        },

        connected: {
            entry: ['clearError', () => logger.log('[ConnectionMachine] State: connected')],
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.RECONNECTING,
                        target: 'reconnecting',
                        actions: 'updateMetrics',
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.DISCONNECTED,
                        target: 'reconnecting',
                        actions: 'updateMetrics',
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.FAILED,
                        target: 'failed',
                        actions: ['setFailedError', 'updateMetrics'],
                    },
                    {
                        // Stay in connected, just update metrics
                        actions: 'updateMetrics',
                    },
                ],
                NETWORK_OFFLINE: 'offline',
            },
        },

        reconnecting: {
            entry: () => {
                logger.log('[ConnectionMachine] State: reconnecting');
            },
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTED,
                        target: 'connected',
                        actions: ['clearError', 'updateMetrics'],
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.FAILED,
                        target: 'failed',
                        actions: ['setFailedError', 'updateMetrics'],
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTING,
                        target: 'connecting',
                        actions: 'updateMetrics',
                    },
                    {
                        // Stay in reconnecting, just update metrics
                        actions: 'updateMetrics',
                    },
                ],
                NETWORK_OFFLINE: 'offline',
                RETRY: 'connecting',
            },
        },

        failed: {
            entry: ['setFailedError', () => logger.error('[ConnectionMachine] State: failed')],
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTING,
                        target: 'connecting',
                        actions: 'updateMetrics',
                    },
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTED,
                        target: 'connected',
                        actions: ['clearError', 'updateMetrics'],
                    },
                ],
                RETRY: 'connecting',
                NETWORK_ONLINE: 'connecting',
            },
        },

        offline: {
            entry: ['setOfflineError', () => logger.warn('[ConnectionMachine] State: offline')],
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                STATUS_CHANGE: [
                    {
                        guard: ({ event }) => event.status === ConnectionStatus.CONNECTING,
                        target: 'connecting',
                        actions: ['clearError', 'updateMetrics'],
                    },
                ],
                NETWORK_ONLINE: 'connecting',
            },
        },
    },
});

// 导出状态值类型供 TypeScript 使用
// Export state value type for TypeScript usage
export type ConnectionStateValue =
    | 'initializing'
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'failed'
    | 'offline';
