import React, { createContext, useContext, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { connectionMachine } from '@/shared/machines/connectionMachine';
import type { CollaborationConnectionState } from '@/shared';
import { logger } from '@/shared/utils/logger';

interface SocketContextType {
    connectionState: CollaborationConnectionState;
    reconnect: () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, send] = useMachine(connectionMachine);

    // 映射 XState 状态到现有的 CollaborationConnectionState 类型
    // Map XState state to existing CollaborationConnectionState type
    const connectionState: CollaborationConnectionState = {
        status: state.value as any, // 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'offline' | 'initializing'
        noteId: null,
        error: state.context.error,
    };

    // 监听浏览器网络事件
    // Listen to browser network events
    useEffect(() => {
        const onNetworkOnline = () => {
            send({ type: 'NETWORK_ONLINE' });
        };

        const onNetworkOffline = () => {
            send({ type: 'NETWORK_OFFLINE' });
        };

        window.addEventListener('online', onNetworkOnline);
        window.addEventListener('offline', onNetworkOffline);

        return () => {
            window.removeEventListener('online', onNetworkOnline);
            window.removeEventListener('offline', onNetworkOffline);
        };
    }, [send]);

    const reconnect = async () => {
        logger.log('[SocketContext] User triggered reconnect');
        send({ type: 'RETRY' });

        // Also trigger SocketService manual reconnect
        const { socketService } = await import('@/shared/services/SocketService');
        await socketService.reconnect();
    };

    return (
        <SocketContext.Provider value={{ connectionState, reconnect }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocketContext = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocketContext must be used within a SocketProvider');
    }
    return context;
};
