import { useEffect, useState } from 'react';
import { ActivityEventPayload } from '../types/activity';
import { socketService } from '../services/SocketService';
import { logger } from '../utils/logger';

export function useActivitySocket(sessionId: string) {
    const [lastActivity, setLastActivity] = useState<ActivityEventPayload | null>(null);
    const [recentActivities, setRecentActivities] = useState<ActivityEventPayload[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!sessionId) return;

        // 1. Join the activity room for this session
        socketService.joinActivity(sessionId);

        const socket = socketService.getActivitySocket();

        // 2. Local state for connection status
        setIsConnected(socket?.connected || false);

        if (!socket) {
            logger.warn('[useActivitySocket] Socket not initialized.');
            return;
        }

        // 3. Define event handlers
        const handleStatus = (payload: ActivityEventPayload) => {
            logger.debug('[useActivitySocket] Received status:', payload);
            setLastActivity(payload);
            setRecentActivities(prev => {
                // Keep only the last 50 events to avoid memory issues
                const updated = [payload, ...prev];
                return updated.slice(0, 50);
            });
        };

        const handleConnect = () => setIsConnected(true);
        const handleDisconnect = () => setIsConnected(false);

        // 4. Bind events
        socket.on('activity:status', handleStatus);
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);

        // 5. Cleanup
        return () => {
            socket.off('activity:status', handleStatus);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        };
    }, [sessionId]);

    return {
        lastActivity,
        recentActivities,
        isConnected,
    };
}
