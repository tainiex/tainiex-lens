import React, { createContext, useContext, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { connectionMachine } from '@/shared/machines/connectionMachine';
import type { CollaborationConnectionState } from '@/shared';

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

    const reconnect = () => {
        send({ type: 'RETRY' });
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
