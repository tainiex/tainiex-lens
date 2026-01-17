import React, { createContext, useContext, useEffect, useState } from 'react';
import { socketService, logger } from '@/shared';
import type { CollaborationConnectionState } from '@/shared';

interface SocketContextType {
    connectionState: CollaborationConnectionState;
    reconnect: () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [connectionState, setConnectionState] = useState<CollaborationConnectionState>(() => {
        // [FIX] Check service state roughly via chat socket connection
        const socket = socketService.getChatSocket();

        if (socket?.connected) {
            return { status: 'connected' };
        }
        // [FIX] Default to 'connecting' instead of 'disconnected' to prevent red flash
        return { status: 'connecting' };
    });

    useEffect(() => {
        // Subscribe to global socket state
        const unsubscribe = socketService.subscribe(isConnected => {
            setConnectionState(prev => {
                if (isConnected) return { status: 'connected' };
                // If we were connected and lost it, show disconnected (or reconnecting if handled by service)
                // But service only emits true/false.
                // We can infer 'reconnecting' if we want, but 'disconnected' is safe for now.
                if (prev.status === 'connected') return { status: 'disconnected' };
                return prev;
            });
        });

        // Listen to detailed errors if possible, or just keep network listeners
        const onNetworkOnline = () => {
            logger.info('[SocketContext] Network is ONLINE, forcing reconnect...');
            setConnectionState({ status: 'reconnecting' });
            setTimeout(() => {
                socketService.connect();
            }, 1000);
        };

        const onNetworkOffline = () => {
            logger.warn('[SocketContext] Network is OFFLINE');
            setConnectionState({ status: 'disconnected', error: 'No Internet Connection' });
        };

        window.addEventListener('online', onNetworkOnline);
        window.addEventListener('offline', onNetworkOffline);

        return () => {
            unsubscribe();
            window.removeEventListener('online', onNetworkOnline);
            window.removeEventListener('offline', onNetworkOffline);
        };
    }, []);

    const reconnect = () => {
        socketService.disconnect();
        setTimeout(() => socketService.connect(), 500);
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
