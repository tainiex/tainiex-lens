import { Socket, Manager } from 'socket.io-client';
import { ChatSocket } from '../types/socket';
import { logger } from '../utils/logger';
import { apiClient } from '../utils/apiClient';
import type { CollaborationSocket } from '../types/collaboration';
import { ActivitySocket } from '../types/socket';

/**
 * SocketService Singleton
 * Manages the WebSocket connection lifecycle independently of React components.
 */
class SocketService {
    private static instance: SocketService;
    private manager: Manager | null = null;
    private chatSocket: ChatSocket | null = null;
    private collaborationSocket: CollaborationSocket | null = null;
    private activitySocket: ActivitySocket | null = null;

    // Track connection state internally to avoid multiple connects
    private connectionPromise: Promise<void> | null = null;
    private forcedDisconnect: boolean = false;

    // Reconnection state tracking
    private reconnectionAttempts: Map<string, number> = new Map(); // Track attempts per socket
    private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map(); // Track active timers
    private maxReconnectionDelay: number = 5000; // Max 5 seconds
    private baseReconnectionDelay: number = 1000; // Start at 1 second

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
    public async connect(force: boolean = false): Promise<void> {
        logger.debug(`[SocketService] connect() called with force=${force}`);

        if (
            !force &&
            (this.chatSocket?.connected ||
                this.collaborationSocket?.connected ||
                this.activitySocket?.connected)
        ) {
            logger.debug('[SocketService] Already connected or partially connected.');
            return;
        }

        // If a connection is already in progress, return the existing promise, unless forced
        if (!force && this.connectionPromise) {
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
            logger.debug('[SocketService] Checking authentication...');
            const isAuthenticated = await apiClient.ensureAuth();
            if (!isAuthenticated) {
                logger.warn('[SocketService] Authentication failed. Cannot connect socket.');
                return;
            }
            logger.debug('[SocketService] Authentication confirmed.');

            // 2. Create Manager if not exists
            if (!this.manager) {
                logger.debug('[SocketService] Manager not found, creating new Manager...');
                this.createManager();
            } else {
                logger.debug('[SocketService] Manager exists, checking socket state...');

                // CRITICAL FIX: Update extraHeaders with LATEST token before reconnecting
                // This prevents stale tokens causing "io server disconnect" loops
                const token = apiClient.accessToken;
                if (this.manager.opts) {
                    this.manager.opts.extraHeaders = {
                        Authorization: token ? `Bearer ${token}` : '',
                        'X-Auth-Mode': 'bearer',
                    };
                    // Also update query param for next connection attempt
                    (this.manager.opts as any).query = {
                        token: token || '',
                    };
                    logger.debug(
                        '[SocketService] Updated Manager headers and query with fresh token.'
                    );
                }
            }

            // 3. Create Sockets if not exists
            if (!this.chatSocket) {
                this.createChatSocket();
            }
            if (!this.collaborationSocket) {
                this.createCollaborationSocket();
            }
            if (!this.activitySocket) {
                this.createActivitySocket();
            }

            // 4. Manually connect if not connected
            if (this.chatSocket && !this.chatSocket.connected) {
                logger.debug('[SocketService] ChatSocket not connected, calling connect()...');
                this.chatSocket.connect();
            } else {
                logger.debug(
                    `[SocketService] ChatSocket already connected? ${this.chatSocket?.connected}`
                );
            }

            if (this.collaborationSocket && !this.collaborationSocket.connected) {
                logger.debug(
                    '[SocketService] CollaborationSocket not connected, calling connect()...'
                );
                this.collaborationSocket.connect();
            }

            if (this.activitySocket && !this.activitySocket.connected) {
                logger.debug('[SocketService] ActivitySocket not connected, calling connect()...');
                this.activitySocket.connect();
            }
        } catch (error) {
            logger.error('[SocketService] Connection failed with error:', error);
            // Sentry access removed for shared logic
        }
    }

    /**
     * Disconnects the socket (e.g. on logout)
     */
    public disconnect() {
        this.forcedDisconnect = true;
        logger.log('[SocketService] Disconnecting all sockets...');

        // Clear all reconnection timers
        this.reconnectionTimers.forEach((timer, socketName) => {
            clearTimeout(timer);
            logger.debug(`[SocketService] Cleared reconnection timer for ${socketName}`);
        });
        this.reconnectionTimers.clear();
        this.reconnectionAttempts.clear();

        if (this.chatSocket) {
            this.chatSocket.disconnect();
        }
        if (this.collaborationSocket) {
            this.collaborationSocket.disconnect();
        }
        if (this.activitySocket) {
            this.activitySocket.disconnect();
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

    public getActivitySocket(): ActivitySocket | null {
        return this.activitySocket;
    }

    /**
     * Join an activity session to receive updates
     */
    public joinActivity(sessionId: string) {
        if (!this.activitySocket) {
            logger.warn('[SocketService] Cannot join activity: socket not initialized.');
            return;
        }
        if (!this.activitySocket.connected) {
            logger.warn('[SocketService] Activity socket not connected. Connecting...');
            this.activitySocket.connect();
        }
        logger.log(`[SocketService] Joining activity session: ${sessionId}`);
        this.activitySocket.emit('join', { sessionId });
    }

    // Alias for backward compatibility if needed, but prefer specific getters
    public getSocket(): ChatSocket | null {
        return this.chatSocket;
    }

    private config: { baseUrl: string } | null = null;

    public configure(config: { baseUrl: string }) {
        this.config = config;
        // If manager exists, we might need to reconnect if URL changed, but typically config happens once at startup.
    }

    /**
     * Internal: Create the Manager instance
     */
    private createManager() {
        if (!this.config) {
            logger.warn(
                '[SocketService] Configuration missing. Call configure() before connecting.'
            );
            // Fallback for Web if not configured (backwards compat during migration, though ideally strict)
            if (typeof window !== 'undefined') {
                this.config = { baseUrl: window.location.origin };
            } else {
                throw new Error(
                    '[SocketService] No configuration provided and window is undefined.'
                );
            }
        }

        const baseUrl = this.config.baseUrl;
        const token = apiClient.accessToken;

        logger.debug('[SocketService] Creating Manager with URL:', baseUrl);
        logger.debug('[SocketService] Creating Manager. Initial Token available:', !!token);

        this.manager = new Manager(baseUrl, {
            path: '/socket.io',
            transports: ['polling', 'websocket'], // Start with polling to ensure auth headers are sent
            withCredentials: true,
            auth: (cb: (data: object) => void) => {
                const currentToken = apiClient.accessToken;
                logger.debug(
                    '[SocketService] Auth callback. Token:',
                    currentToken ? 'Present' : 'Missing'
                );
                cb({ token: currentToken || '' });
            },
            query: {
                token: token || '', // Pass token in query for initial connection
            },
            extraHeaders: {
                Authorization: token ? `Bearer ${token}` : '',
                'X-Auth-Mode': 'bearer',
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            timeout: 20000,
            autoConnect: false,
        } as any);

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
     * Internal: Create the Activity Socket instance
     */
    private createActivitySocket() {
        if (!this.manager) return;
        logger.debug('[SocketService] Creating Activity Socket...');
        this.activitySocket = this.manager.socket('/activity') as ActivitySocket;
        this.setupSocketEvents(this.activitySocket, 'Activity');
    }

    /**
     * Calculate reconnection delay with exponential backoff
     */
    private getReconnectionDelay(socketName: string): number {
        const attempts = this.reconnectionAttempts.get(socketName) || 0;
        const delay = Math.min(
            this.baseReconnectionDelay * Math.pow(2, attempts),
            this.maxReconnectionDelay
        );
        return delay;
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    private scheduleReconnection(socketName: string) {
        // Clear any existing timer
        const existingTimer = this.reconnectionTimers.get(socketName);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Don't reconnect if forcefully disconnected
        if (this.forcedDisconnect) {
            logger.debug(
                `[SocketService] Skipping reconnection for ${socketName} (forced disconnect)`
            );
            return;
        }

        const attempts = this.reconnectionAttempts.get(socketName) || 0;
        const delay = this.getReconnectionDelay(socketName);

        logger.debug(
            `[SocketService] Scheduling ${socketName} reconnection attempt ${attempts + 1} in ${delay}ms`
        );

        const timer = setTimeout(async () => {
            this.reconnectionAttempts.set(socketName, attempts + 1);

            try {
                await this.connect();
                // Reset counter on successful connection (handled in 'connect' event)
            } catch (error) {
                logger.warn(
                    `[SocketService] Reconnection attempt ${attempts + 1} failed for ${socketName}:`,
                    error
                );
                // Schedule another attempt
                this.scheduleReconnection(socketName);
            }
        }, delay);

        this.reconnectionTimers.set(socketName, timer);
    }

    /**
     * Setup global listeners for the Manager
     */
    private setupManagerEvents() {
        if (!this.manager) return;

        this.manager.on('reconnect_attempt', misc => {
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

        // 1. Connection Lifecycle
        socket.on('connect', () => {
            logger.log(`[SocketService] ${name} Socket Connected! ID: ${socket.id}`);
            // Sentry breadcrumb removed

            // Reset reconnection attempts on successful connection
            this.reconnectionAttempts.set(name, 0);
            const timer = this.reconnectionTimers.get(name);
            if (timer) {
                clearTimeout(timer);
                this.reconnectionTimers.delete(name);
            }

            this.notifyListeners(true);
        });

        socket.on('disconnect', reason => {
            logger.warn(`[SocketService] ${name} Socket Disconnected: ${reason}`);
            // Sentry breadcrumb removed

            // Only notify false if BOTH are disconnected, or we just care about chat being primary
            // For simplicity, if Chat disconnects, we consider it offline.
            if (name === 'Chat') {
                this.notifyListeners(false);
            }

            // Handle server-initiated disconnects with persistent reconnection
            if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                if (!this.forcedDisconnect) {
                    logger.debug(
                        `[SocketService] Server disconnected ${name}, scheduling reconnection...`
                    );
                    this.scheduleReconnection(name);
                }
            }
            // For other disconnect reasons (e.g., transport error), Socket.IO's built-in reconnection handles it
        });

        // 2. Auth Lifecycle & Token Renewal
        socket.on('auth:token-expiring', async (data: { expiresIn: number }) => {
            logger.warn(
                `[SocketService] ${name} Token expiring in ${data.expiresIn}s. Refreshing...`
            );

            try {
                // Refresh via HTTP
                const success = await apiClient.refreshToken();
                if (success) {
                    const newToken = apiClient.accessToken;
                    if (newToken) {
                        // Update Socket Auth for future reconnections
                        socket.auth = { token: newToken };
                        // Notify Server
                        socket.emit('auth:token-refreshed', { newToken });
                        logger.debug(`[SocketService] ${name} Sent auth:token-refreshed.`);
                    }
                } else {
                    logger.error(
                        `[SocketService] ${name} Refresh failed during active connection.`
                    );
                }
            } catch (err) {
                logger.error(`[SocketService] ${name} Error handling token expiry:`, err);
            }
        });

        socket.on('auth:token-renewed', () => {
            logger.log(`[SocketService] ${name} Token successfully renewed on server linkage`);
        });

        // 3. Structured Error Handling
        socket.on('error', (error: any) => {
            // Check if it matches our structure
            if (error && error.category) {
                logger.error(`[SocketService] ${name} Structured Error:`, error);

                if (error.category === 'AUTH') {
                    // 4011: Invalid Token, 4012: Expired
                    if (error.code === 4011 || error.code === 4012) {
                        logger.warn(`[SocketService] ${name} Auth error, attempting refresh...`);

                        // Don't immediately reconnect, let the disconnect handler trigger reconnection
                        apiClient.refreshToken().then(ok => {
                            if (ok) {
                                logger.debug(
                                    `[SocketService] ${name} Token refreshed successfully`
                                );
                                // Update manager headers with fresh token
                                const token = apiClient.accessToken;
                                if (this.manager?.opts) {
                                    this.manager.opts.extraHeaders = {
                                        Authorization: token ? `Bearer ${token}` : '',
                                        'X-Auth-Mode': 'bearer',
                                    };
                                    (this.manager.opts as any).query = {
                                        token: token || '',
                                    };
                                    logger.debug(
                                        `[SocketService] Updated Manager headers with fresh token for ${name}`
                                    );
                                }
                                // Socket will auto-reconnect or be reconnected by disconnect handler
                            } else {
                                logger.error(`[SocketService] ${name} Token refresh failed`);
                            }
                        });
                    }
                }
            } else {
                // Fallback for string errors or other types
                logger.error(`[SocketService] ${name} Socket Error:`, error);
            }
        });

        // 4. Connection Error (Lower level)
        socket.on('connect_error', (err: any) => {
            logger.warn(`[SocketService] ${name} Connect Error: ${err.message}`);

            // Rate limit check
            if (err.message && err.message.includes('Rate limit')) {
                logger.error(`[SocketService] ${name} Rate limited! Stopping retries.`);
                // We should probably NOT close if we want automatic backoff, but 'aggressively blocks' implies we should wait.
                // Socket.io standard reconnection handles delays, but if we want to stop:
                // socket.close();
                // For now, let's just log it and maybe standard backoff handles it.
                return;
            }

            if (
                err.message &&
                (err.message.includes('401') || err.message.includes('Unauthorized'))
            ) {
                apiClient.ensureAuth().then(ok => {
                    if (ok && !this.forcedDisconnect && socket && !socket.connected) {
                        socket.connect();
                    }
                });
            }
        });

        // 5. Reliability & ACK
        socket.onAny((event, ...args) => {
            // Debug Spy
            if (event.includes('chat') || event.includes('stream')) {
                logger.debug(`[SocketSpy] ${event}`, JSON.stringify(args).slice(0, 100));
            }

            // ACK Check
            const data = args[0];
            if (data && typeof data === 'object' && data.messageId) {
                socket.emit('message:ack', { messageId: data.messageId });
            }
        });
    }
}

export const socketService = SocketService.getInstance();
