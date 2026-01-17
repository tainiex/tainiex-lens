export interface NotificationHandler {
    (params: {
        type: 'success' | 'error' | 'info' | 'warning';
        title: string;
        message: string;
        action?: { label: string; onClick: () => void };
        duration?: number;
        persistent?: boolean;
    }): void;
}
