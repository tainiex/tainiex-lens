import { io, Socket, Manager } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import * as Sentry from '@sentry/react';
import { ChatSocket, ClientToServerEvents, ServerToClientEvents } from '../types/socket';
import { CollaborationSocket } from '../types/collaboration';

/**
 * SocketService Singleton
 * Manages the WebSocket connection lifecycle independently of React components.
 */
class SocketService {
    private static instance: SocketService;
    private manager: Manager | null = null;
    private chatSocket: ChatSocket | null = null;
    private collaborationSocket: CollaborationSocket | null = null;

    // Track connection state internally to avoid multiple connects
    private connectionPromise: Promise<void> | null = null;
    private forcedDisconnect: boolean = false;

    // Simple listener pattern for global state
    private listeners: ((isConnected: boolean) => void)[] = [];

    private constructor() {
        // Private constructor for singleton
    }

    public subscribe(callback: (isConnected: boolean) => void): () => void {
        this.listeners.push(callback);
        // Initial Emit
        callback(this.chatSocket?.connected || false);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notifyListeners(isConnected: boolean) {
        this.listeners.forEach(l => l(isConnected));
    }

    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Initialize and connect the socket
     */
    public async connect(): Promise<void> {
        if (this.chatSocket?.connected || this.collaborationSocket?.connected) {
            logger.debug('[SocketService] Already connected or partially connected.');
            return;
        }

        // If a connection is already in progress, return the existing promise
        if (this.connectionPromise) {
            logger.debug('[SocketService] Joining existing connection attempt...');
            return this.connectionPromise;
        }

        this.forcedDisconnect = false;

        // Create a new connection promise
        this.connectionPromise = this.performConnection();

        try {
            await this.connectionPromise;
        } finally {
            // We don't clear the promise immediately if successful? 
            // Actually better to clear it so subsequent calls can retry if disconnected later.
            // But if it's connected, the first check handles it.
            this.connectionPromise = null;
        }
    }

    private async performConnection() {
        logger.log('[SocketService] Initiating connection...');

        try {
            // 1. Ensure Authentication first
            const isAuthenticated = await apiClient.ensureAuth();
            if (!isAuthenticated) {
                logger.warn('[SocketService] Authentication failed. Cannot connect socket.');
                return;
            }

            // 2. Create Manager if not exists
            if (!this.manager) {
                this.createManager();
            }

            // 3. Create Sockets if not exists
            if (!this.chatSocket) {
                this.createChatSocket();
            }
            if (!this.collaborationSocket) {
                this.createCollaborationSocket();
            }

            // 4. Manually connect if not connected
            if (this.chatSocket && !this.chatSocket.connected) {
                this.chatSocket.connect();
            }
            if (this.collaborationSocket && !this.collaborationSocket.connected) {
                this.collaborationSocket.connect();
            }

        } catch (error) {
            logger.error('[SocketService] Connection failed:', error);
            Sentry.captureException(error);
        }
    }

    /**
     * Disconnects the socket (e.g. on logout)
     */
    public disconnect() {
        this.forcedDisconnect = true;
        logger.log('[SocketService] Disconnecting all sockets...');

        if (this.chatSocket) {
            this.chatSocket.disconnect();
        }
        if (this.collaborationSocket) {
            this.collaborationSocket.disconnect();
        }
    }

    /**
     * Returns the chat socket instance for attaching listeners
     */
    public getChatSocket(): ChatSocket | null {
        return this.chatSocket;
    }

    public getCollaborationSocket(): CollaborationSocket | null {
        return this.collaborationSocket;
    }

    // Alias for backward compatibility if needed, but prefer specific getters
    public getSocket(): ChatSocket | null {
        return this.chatSocket;
    }

    /**
     * Internal: Create the Manager instance
     */
    private createManager() {
        let baseUrl: string;
        if (import.meta.env.DEV) {
            baseUrl = window.location.origin;
        } else {
            baseUrl = API_BASE_URL || window.location.origin;
            if (!baseUrl.startsWith('http')) {
                baseUrl = `${window.location.origin}${baseUrl}`;
            }
        }

        logger.debug('[SocketService] Creating Manager with URL:', baseUrl);

        this.manager = new Manager(baseUrl, {
            path: '/socket.io',
            transports: ['websocket'],
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            timeout: 20000,
            autoConnect: false // We handle connection manually after auth
        });

        this.setupManagerEvents();
    }

    /**
     * Internal: Create the Chat Socket instance
     */
    private createChatSocket() {
        if (!this.manager) return;
        logger.debug('[SocketService] Creating Chat Socket...');
        this.chatSocket = this.manager.socket('/api/chat') as ChatSocket;
        this.setupSocketEvents(this.chatSocket, 'Chat');
    }

    /**
     * Internal: Create the Collaboration Socket instance
     */
    private createCollaborationSocket() {
        if (!this.manager) return;
        logger.debug('[SocketService] Creating Collaboration Socket...');
        this.collaborationSocket = this.manager.socket('/api/collaboration') as CollaborationSocket;
        this.setupSocketEvents(this.collaborationSocket, 'Collaboration');
    }

    /**
     * Setup global listeners for the Manager
     */
    private setupManagerEvents() {
        if (!this.manager) return;

        this.manager.on('reconnect_attempt', (misc) => {
            logger.debug(`[SocketService] Reconnecting... (${misc})`);
        });

        this.manager.on('reconnect_failed', () => {
            logger.error('[SocketService] Reconnection failed.');
        });
    }

    /**
     * Setup permanent listeners for a Socket
     */
    private setupSocketEvents(socket: Socket | null, name: string) {
        if (!socket) return;

        socket.on('connect', () => {
            logger.log(`[SocketService] ${name} Socket Connected! ID: ${socket.id}`);
            Sentry.addBreadcrumb({ category: 'socket', message: `${name} Connected`, level: 'info' });
            this.notifyListeners(true);
        });

        socket.on('disconnect', (reason) => {
            logger.warn(`[SocketService] ${name} Socket Disconnected: ${reason}`);
            Sentry.addBreadcrumb({ category: 'socket', message: `${name} Disconnected`, data: { reason }, level: 'warning' });

            // Only notify false if BOTH are disconnected, or we just care about chat being primary
            // For simplicity, if Chat disconnects, we consider it offline.
            if (name === 'Chat') {
                this.notifyListeners(false);
            }

            if (reason === 'io server disconnect') {
                if (!this.forcedDisconnect) {
                    setTimeout(() => this.connect(), 1000);
                }
            }
        });

        socket.on('connect_error', (err: any) => {
            logger.warn(`[SocketService] ${name} Connect Error: ${err.message}`);
            if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
                apiClient.ensureAuth().then(ok => {
                    if (ok && !this.forcedDisconnect && socket && !socket.connected) {
                        socket.connect();
                    }
                });
            }
        });
    }
}

export const socketService = SocketService.getInstance();
