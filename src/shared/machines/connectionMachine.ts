import { setup, fromCallback, assign } from 'xstate';
import { socketService } from '../services/SocketService';
import { logger } from '../utils/logger';

/**
 * WebSocket 连接状态机
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
        },
        events: {} as
            | { type: 'CONNECT' }
            | { type: 'CONNECTED' }
            | { type: 'DISCONNECTED'; error?: string }
            | { type: 'NETWORK_ONLINE' }
            | { type: 'NETWORK_OFFLINE' }
            | { type: 'RETRY' },
    },

    actors: {
        // 订阅 SocketService 的连接状态
        // Subscribe to SocketService connection state
        socketSubscription: fromCallback(({ sendBack }) => {
            const unsubscribe = socketService.subscribe(isConnected => {
                if (isConnected) {
                    sendBack({ type: 'CONNECTED' });
                } else {
                    sendBack({ type: 'DISCONNECTED' });
                }
            });

            return () => {
                unsubscribe();
            };
        }),
    },

    actions: {
        setError: assign({
            error: ({ event }) => {
                return event.type === 'DISCONNECTED' ? event.error : undefined;
            },
        }),
        clearError: assign({
            error: () => undefined,
        }),
        setOfflineError: assign({
            error: () => 'No Internet Connection',
        }),
    },
}).createMachine({
    id: 'websocket-connection',
    initial: 'initializing',
    context: {
        error: undefined,
    },

    states: {
        initializing: {
            // 启动时检查初始状态
            // Check initial state on startup
            always: [
                {
                    guard: () => socketService.getChatSocket()?.connected === true,
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
            on: {
                CONNECT: 'connecting',
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
                CONNECTED: 'connected',
                DISCONNECTED: {
                    target: 'reconnecting',
                    actions: 'setError',
                },
                NETWORK_OFFLINE: 'offline',
            },
        },

        connected: {
            entry: ['clearError', () => logger.log('[ConnectionMachine] State: connected')],
            invoke: {
                src: 'socketSubscription',
            },
            on: {
                DISCONNECTED: {
                    target: 'reconnecting',
                    actions: 'setError',
                },
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
                CONNECTED: 'connected',
                NETWORK_OFFLINE: 'offline',
                RETRY: 'connecting',
            },
        },

        offline: {
            entry: ['setOfflineError', () => logger.warn('[ConnectionMachine] State: offline')],
            on: {
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
    | 'offline';
