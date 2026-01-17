import React, { createContext, useContext, useState, useCallback } from 'react';
import { logger } from '@/shared';

export interface Notification {
    id: string;
    type: 'error' | 'warning' | 'success' | 'info';
    title?: string;
    message: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    duration?: number; // Duration in ms
    dismissible?: boolean;
    persistent?: boolean; // Do not auto-dismiss
    timestamp: number;
}

interface NotificationContextValue {
    notifications: Notification[];
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string;
    removeNotification: (id: string) => void;
    clearAll: () => void;
    clearByType: (type: Notification['type']) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

interface NotificationProviderProps {
    children: React.ReactNode;
    maxNotifications?: number;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
        const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Log to console instead of showing UI toast
        const logPrefix = `[${notification.type.toUpperCase()}] ${notification.title ? notification.title + ': ' : ''}`;
        if (notification.type === 'error') {
            logger.error(
                `${logPrefix}${notification.message}`,
                notification.action ? '(Action available in logs)' : ''
            );
        } else if (notification.type === 'warning') {
            logger.warn(`${logPrefix}${notification.message}`);
        } else {
            logger.log(`${logPrefix}${notification.message}`);
        }

        // Return a dummy ID, no state update
        return id;
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const clearByType = useCallback((type: Notification['type']) => {
        setNotifications(prev => prev.filter(notification => notification.type !== type));
    }, []);

    const value: NotificationContextValue = {
        notifications,
        addNotification,
        removeNotification,
        clearAll,
        clearByType,
    };

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
