import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocketManager } from '../utils/socketManager';
import type { CollaborationConnectionState } from '../types/collaboration';
import { logger } from '../utils/logger';

interface SocketContextType {
    connectionState: CollaborationConnectionState;
    reconnect: () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [connectionState, setConnectionState] = useState<CollaborationConnectionState>(() => {
        const manager = getSocketManager();
        // Check if already connected to avoid initial flicker
        // @ts-ignore - engine property exists on Manager
        if (manager.engine && manager.engine.readyState === 'open') {
            return { status: 'connected' };
        }
        // [FIX] Default to 'connecting' instead of 'disconnected' to prevent red flash
        return { status: 'connecting' };
    });

    useEffect(() => {
        const manager = getSocketManager();

        // Initial check is now handled in useState, but we keep listeners.

        // Manager events don't map 1:1 to "connection" events perfectly,
        // but the engine events or the manager's open/close are key.

        const onOpen = () => {
            logger.debug('[SocketContext] Manager open');
            setConnectionState({ status: 'connected' });
            // Clear error on success
        };

        const onError = (err: any) => {
            logger.warn('[SocketContext] Manager error', err);
            setConnectionState((prev) => ({
                status: 'failed',
                error: err.message || 'Connection Error'
            }));
        };

        const onClose = (reason: any) => {
            // [FIX] Ignore 'transport close' to prevent UI flickering during navigation/reconnects
            // The manager will auto-reconnect, and we don't want to show Red status for a split second.
            if (reason === 'transport close') {
                logger.debug('[SocketContext] Ignoring transport close');
                return;
            }
            logger.debug('[SocketContext] Manager closed', reason);
            setConnectionState({ status: 'disconnected', error: typeof reason === 'string' ? reason : undefined });
        };

        const onReconnectAttempt = (attempt: number) => {
            logger.debug('[SocketContext] Reconnecting...', attempt);
            setConnectionState({ status: 'reconnecting' });
        };

        const onReconnectFailed = () => {
            logger.error('[SocketContext] Reconnect failed');
            setConnectionState({ status: 'failed', error: 'Reconnection failed' });
        };

        manager.on('open', onOpen);
        manager.on('error', onError);
        manager.on('close', onClose);
        manager.on('reconnect_attempt', onReconnectAttempt);
        manager.on('reconnect_failed', onReconnectFailed);

        // [FIX] Add global network status listeners
        const onNetworkOnline = () => {
            logger.info('[SocketContext] Network is ONLINE, forcing reconnect...');
            setConnectionState({ status: 'reconnecting', error: undefined });
            // Slight delay to allow OS/Browser networking to stabilize
            setTimeout(() => {
                manager.connect();
            }, 1000);
        };

        const onNetworkOffline = () => {
            logger.warn('[SocketContext] Network is OFFLINE');
            setConnectionState({ status: 'disconnected', error: 'No Internet Connection' });
        };

        window.addEventListener('online', onNetworkOnline);
        window.addEventListener('offline', onNetworkOffline);

        // Also listen to the underlying engine for immediate open/close if manager doesn't emit immediately on first connect
        // (Manager usually emits 'open' when a socket connects, but 'open' event on Manager is for the engine connection)

        return () => {
            manager.off('open', onOpen);
            manager.off('error', onError);
            manager.off('close', onClose);
            manager.off('reconnect_attempt', onReconnectAttempt);
            manager.off('reconnect_failed', onReconnectFailed);

            window.removeEventListener('online', onNetworkOnline);
            window.removeEventListener('offline', onNetworkOffline);
        };
    }, []);

    const reconnect = () => {
        const manager = getSocketManager();
        manager.connect();
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
