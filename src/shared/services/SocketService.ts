import { Socket, Manager } from 'socket.io-client';
import { ChatSocket } from '../types/socket';
import { logger } from '../utils/logger';
import { apiClient } from '../utils/apiClient';
import type { CollaborationSocket } from '../types/collaboration';
import { ActivitySocket } from '../types/socket';

/**
 * 连接状态枚举
 * Connection state enum for aggregated socket status
 */
export enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed',
}

/**
 * 连接质量指标
 * Connection quality metrics
 */
interface ConnectionMetrics {
    latency: number; // ms
    lastPingTime: number;
    reconnectCount: number;
    failureCount: number;
    lastSuccessfulConnect: number;
}

/**
 * 断路器状态
 * Circuit breaker for intelligent reconnection management
 */
enum CircuitState {
    CLOSED = 'closed', // 正常工作
    OPEN = 'open', // 故障，停止重连
    HALF_OPEN = 'half_open', // 尝试性恢复
}

/**
 * SocketService Singleton (Enhanced Industrial-Grade Version)
 * Manages the WebSocket connection lifecycle with robust reconnection and health monitoring.
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

    // Enhanced reconnection state tracking
    private reconnectionAttempts: number = 0;
    private reconnectionTimer: NodeJS.Timeout | null = null;
    private maxReconnectionDelay: number = 30000; // Max 30 seconds
    private baseReconnectionDelay: number = 1000; // Start at 1 second
    private maxReconnectionAttempts: number = 10; // Before entering circuit breaker

    // Circuit breaker for preventing infinite reconnection attempts
    private circuitState: CircuitState = CircuitState.CLOSED;
    private circuitOpenTime: number = 0;
    private circuitResetTimeout: number = 60000; // 1 minute before trying again

    // Health check mechanism
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private healthCheckIntervalMs: number = 30000; // Check every 30 seconds
    private pingTimeout: NodeJS.Timeout | null = null;
    private pingTimeoutMs: number = 10000; // 10 second timeout for ping response
    private lastPongReceived: number = Date.now();

    // Connection quality metrics
    private metrics: ConnectionMetrics = {
        latency: 0,
        lastPingTime: 0,
        reconnectCount: 0,
        failureCount: 0,
        lastSuccessfulConnect: 0,
    };

    // Enhanced listener pattern with detailed state
    private listeners: ((status: ConnectionStatus, metrics?: ConnectionMetrics) => void)[] = [];

    // Token refresh tracking
    private tokenRefreshTimer: NodeJS.Timeout | null = null;
    private tokenExpiryCheckInterval: number = 60000; // Check every minute

    private constructor() {
        // Private constructor for singleton
        this.startTokenExpiryMonitor();
    }

    /**
     * Subscribe to connection status changes with detailed metrics
     */
    public subscribe(
        callback: (status: ConnectionStatus, metrics?: ConnectionMetrics) => void
    ): () => void {
        this.listeners.push(callback);
        // Initial Emit with current state
        const currentStatus = this.getAggregatedStatus();
        callback(currentStatus, this.metrics);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notify all listeners with current connection status
     */
    private notifyListeners(status: ConnectionStatus) {
        logger.debug(`[SocketService] Notifying listeners: ${status}`);
        this.listeners.forEach(l => l(status, this.metrics));
    }

    /**
     * Get aggregated connection status across all sockets
     */
    private getAggregatedStatus(): ConnectionStatus {
        const sockets = [this.chatSocket, this.collaborationSocket, this.activitySocket];
        const connectedCount = sockets.filter(s => s?.connected).length;
        const totalCount = sockets.filter(s => s !== null).length;

        if (totalCount === 0) return ConnectionStatus.DISCONNECTED;
        if (connectedCount === totalCount) return ConnectionStatus.CONNECTED;
        if (connectedCount > 0) return ConnectionStatus.RECONNECTING;

        // Check if we're in the process of connecting
        if (this.connectionPromise) return ConnectionStatus.CONNECTING;

        // Check circuit breaker state
        if (this.circuitState === CircuitState.OPEN) return ConnectionStatus.FAILED;

        return ConnectionStatus.DISCONNECTED;
    }

    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Initialize and connect the socket with circuit breaker protection
     */
    public async connect(force: boolean = false): Promise<void> {
        logger.debug(`[SocketService] connect() called with force=${force}`);

        // Check circuit breaker state
        if (this.circuitState === CircuitState.OPEN && !force) {
            const now = Date.now();
            if (now - this.circuitOpenTime < this.circuitResetTimeout) {
                logger.warn(
                    '[SocketService] Circuit breaker is OPEN. Rejecting connection attempt.'
                );
                this.notifyListeners(ConnectionStatus.FAILED);
                return;
            } else {
                // Try to transition to HALF_OPEN
                logger.log(
                    '[SocketService] Circuit breaker timeout expired. Entering HALF_OPEN state.'
                );
                this.circuitState = CircuitState.HALF_OPEN;
            }
        }

        // Already connected check
        if (!force && this.getAggregatedStatus() === ConnectionStatus.CONNECTED) {
            logger.debug('[SocketService] Already fully connected.');
            return;
        }

        // If a connection is already in progress, return the existing promise, unless forced
        if (!force && this.connectionPromise) {
            logger.debug('[SocketService] Joining existing connection attempt...');
            return this.connectionPromise;
        }

        this.forcedDisconnect = false;
        this.notifyListeners(ConnectionStatus.CONNECTING);

        // Create a new connection promise
        this.connectionPromise = this.performConnection();

        try {
            await this.connectionPromise;
        } finally {
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
                logger.error('[SocketService] Authentication failed. Cannot connect socket.');
                this.notifyListeners(ConnectionStatus.FAILED);
                throw new Error('Authentication failed');
            }
            logger.debug('[SocketService] Authentication confirmed.');

            // 2. Create Manager if not exists, or update existing manager
            if (!this.manager) {
                logger.debug('[SocketService] Manager not found, creating new Manager...');
                this.createManager();
            } else {
                logger.debug('[SocketService] Manager exists, updating authentication...');
                await this.updateManagerAuth();
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
            const connectPromises: Promise<void>[] = [];

            if (this.chatSocket && !this.chatSocket.connected) {
                logger.debug('[SocketService] Connecting ChatSocket...');
                connectPromises.push(
                    new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('ChatSocket connection timeout'));
                        }, 20000);

                        this.chatSocket!.once('connect', () => {
                            clearTimeout(timeout);
                            resolve();
                        });

                        this.chatSocket!.once('connect_error', err => {
                            clearTimeout(timeout);
                            reject(err);
                        });

                        this.chatSocket!.connect();
                    })
                );
            }

            if (this.collaborationSocket && !this.collaborationSocket.connected) {
                logger.debug('[SocketService] Connecting CollaborationSocket...');
                this.collaborationSocket.connect();
            }

            if (this.activitySocket && !this.activitySocket.connected) {
                logger.debug('[SocketService] Connecting ActivitySocket...');
                this.activitySocket.connect();
            }

            // Wait for at least chat socket to connect
            if (connectPromises.length > 0) {
                await Promise.race([
                    Promise.all(connectPromises),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Connection timeout')), 20000)
                    ),
                ]);
            }

            logger.log('[SocketService] Connection established successfully');
        } catch (error) {
            logger.error('[SocketService] Connection failed with error:', error);
            this.metrics.failureCount++;

            // Notify failure
            const status = this.getAggregatedStatus();
            this.notifyListeners(status);

            // Schedule reconnection if not in circuit breaker
            if (this.circuitState !== CircuitState.OPEN) {
                this.scheduleReconnection('connection_failed');
            }

            throw error;
        }
    }

    /**
     * Disconnects the socket (e.g. on logout) and cleanup all timers
     */
    public disconnect() {
        this.forcedDisconnect = true;
        logger.log('[SocketService] Disconnecting all sockets...');

        // Clear all timers
        this.clearAllTimers();

        // Reset circuit breaker
        this.circuitState = CircuitState.CLOSED;
        this.reconnectionAttempts = 0;

        if (this.chatSocket) {
            this.chatSocket.disconnect();
        }
        if (this.collaborationSocket) {
            this.collaborationSocket.disconnect();
        }
        if (this.activitySocket) {
            this.activitySocket.disconnect();
        }

        this.notifyListeners(ConnectionStatus.DISCONNECTED);
    }

    /**
     * Clear all timers (reconnection, health check, ping, token refresh)
     */
    private clearAllTimers() {
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
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
     * Calculate reconnection delay with exponential backoff + jitter
     */
    private getReconnectionDelay(): number {
        const exponentialDelay = Math.min(
            this.baseReconnectionDelay * Math.pow(2, this.reconnectionAttempts),
            this.maxReconnectionDelay
        );
        // Add jitter (random 0-25% of delay) to prevent thundering herd
        const jitter = Math.random() * exponentialDelay * 0.25;
        return exponentialDelay + jitter;
    }

    /**
     * Schedule a reconnection attempt with intelligent backoff and circuit breaker
     */
    private scheduleReconnection(reason: string) {
        // Clear any existing timer
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }

        // Don't reconnect if forcefully disconnected
        if (this.forcedDisconnect) {
            logger.debug('[SocketService] Skipping reconnection (forced disconnect)');
            return;
        }

        // Check if we've exceeded max attempts
        if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
            logger.error(
                `[SocketService] Max reconnection attempts (${this.maxReconnectionAttempts}) reached. Opening circuit breaker.`
            );
            this.circuitState = CircuitState.OPEN;
            this.circuitOpenTime = Date.now();
            this.metrics.failureCount++;
            this.notifyListeners(ConnectionStatus.FAILED);
            return;
        }

        const delay = this.getReconnectionDelay();
        this.reconnectionAttempts++;
        this.metrics.reconnectCount++;

        logger.log(
            `[SocketService] Scheduling reconnection attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} in ${Math.round(delay)}ms (reason: ${reason})`
        );

        this.notifyListeners(ConnectionStatus.RECONNECTING);

        this.reconnectionTimer = setTimeout(async () => {
            try {
                logger.debug(
                    `[SocketService] Executing reconnection attempt ${this.reconnectionAttempts}...`
                );
                await this.connect(true); // Force reconnection
            } catch (error) {
                logger.warn(
                    `[SocketService] Reconnection attempt ${this.reconnectionAttempts} failed:`,
                    error
                );
                this.metrics.failureCount++;
                // Schedule another attempt (will be handled by disconnect event)
            }
        }, delay);
    }

    /**
     * Start health check mechanism with ping/pong
     */
    private startHealthCheck() {
        // Clear existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        logger.debug('[SocketService] Starting health check mechanism');

        this.healthCheckInterval = setInterval(() => {
            const status = this.getAggregatedStatus();

            // Only ping if we think we're connected
            if (status === ConnectionStatus.CONNECTED) {
                this.performHealthCheck();
            }
        }, this.healthCheckIntervalMs);
    }

    /**
     * Perform a health check by sending ping and waiting for pong
     */
    private performHealthCheck() {
        const now = Date.now();

        // Check if we haven't received a pong in too long
        if (now - this.lastPongReceived > this.pingTimeoutMs * 2) {
            logger.warn('[SocketService] Health check failed: No pong received for too long');
            this.handleHealthCheckFailure();
            return;
        }

        // Send ping to primary socket (chat)
        if (this.chatSocket?.connected) {
            const pingTime = Date.now();
            this.metrics.lastPingTime = pingTime;

            // Set timeout for pong response
            if (this.pingTimeout) {
                clearTimeout(this.pingTimeout);
            }

            this.pingTimeout = setTimeout(() => {
                logger.warn('[SocketService] Health check timeout: No pong received');
                this.handleHealthCheckFailure();
            }, this.pingTimeoutMs);

            // Emit ping (server should respond with pong)
            // Use 'any' to bypass strict type checking for custom events
            (this.chatSocket as any).emit('ping', { timestamp: pingTime });
        }
    }

    /**
     * Handle health check failure
     */
    private handleHealthCheckFailure() {
        logger.error('[SocketService] Health check failed. Triggering reconnection...');
        this.metrics.failureCount++;

        // Ensure forcedDisconnect is false so reconnection can proceed
        // Health check failures should always trigger reconnection attempts
        this.forcedDisconnect = false;

        // Disconnect and schedule reconnection
        if (this.chatSocket?.connected) {
            this.chatSocket.disconnect();
        }

        this.scheduleReconnection('health_check_failed');
    }

    /**
     * Start token expiry monitoring
     */
    private startTokenExpiryMonitor() {
        // Clear existing timer
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
        }

        // Check token expiry periodically
        this.tokenRefreshTimer = setTimeout(() => {
            this.checkAndRefreshToken();
            this.startTokenExpiryMonitor(); // Reschedule
        }, this.tokenExpiryCheckInterval);
    }

    /**
     * Check if token is about to expire and refresh if needed
     */
    private async checkAndRefreshToken() {
        try {
            const token = apiClient.accessToken;
            if (!token) return;

            // Parse JWT to check expiry (simple decode without verification)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiryTime = payload.exp * 1000; // Convert to ms
            const now = Date.now();
            const timeUntilExpiry = expiryTime - now;

            // Refresh if expiring within 5 minutes
            if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
                logger.log('[SocketService] Token expiring soon, refreshing...');
                const success = await apiClient.refreshToken();

                if (success) {
                    logger.log('[SocketService] Token refreshed successfully');
                    // Update manager with new token
                    await this.updateManagerAuth();
                } else {
                    logger.error('[SocketService] Token refresh failed');
                }
            }
        } catch (error) {
            logger.debug('[SocketService] Token expiry check skipped:', error);
        }
    }

    /**
     * Update manager authentication with latest token
     */
    private async updateManagerAuth() {
        const token = apiClient.accessToken;
        if (this.manager?.opts && token) {
            this.manager.opts.extraHeaders = {
                Authorization: `Bearer ${token}`,
                'X-Auth-Mode': 'bearer',
            };
            (this.manager.opts as any).query = {
                token: token,
            };

            // Update auth for all sockets
            if (this.chatSocket) {
                this.chatSocket.auth = { token };
            }
            if (this.collaborationSocket) {
                this.collaborationSocket.auth = { token };
            }
            if (this.activitySocket) {
                this.activitySocket.auth = { token };
            }

            logger.debug('[SocketService] Updated authentication for all sockets');
        }
    }

    /**
     * Setup global listeners for the Manager
     */
    private setupManagerEvents() {
        if (!this.manager) return;

        this.manager.on('reconnect_attempt', misc => {
            logger.debug(`[SocketService] Manager reconnect attempt (${misc})`);
        });

        this.manager.on('reconnect_failed', () => {
            logger.error('[SocketService] Manager reconnection failed');
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

            // Reset reconnection attempts and circuit breaker on successful connection
            this.reconnectionAttempts = 0;
            if (this.reconnectionTimer) {
                clearTimeout(this.reconnectionTimer);
                this.reconnectionTimer = null;
            }

            // Update metrics
            this.metrics.lastSuccessfulConnect = Date.now();
            this.lastPongReceived = Date.now();

            // Reset or close circuit breaker
            if (this.circuitState === CircuitState.HALF_OPEN) {
                logger.log('[SocketService] Circuit breaker closed after successful connection');
                this.circuitState = CircuitState.CLOSED;
            }

            // Start health check if all sockets are connected
            const status = this.getAggregatedStatus();
            if (status === ConnectionStatus.CONNECTED) {
                this.startHealthCheck();
            }

            this.notifyListeners(status);
        });

        socket.on('disconnect', reason => {
            logger.warn(`[SocketService] ${name} Socket Disconnected: ${reason}`);

            // Stop health check
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            const status = this.getAggregatedStatus();
            this.notifyListeners(status);

            // Handle different disconnect reasons
            if (this.forcedDisconnect) {
                logger.debug(`[SocketService] ${name} disconnected by user request`);
                return;
            }

            // Determine if we should reconnect
            const shouldReconnect =
                reason === 'io server disconnect' ||
                reason === 'io client disconnect' ||
                reason === 'transport close' ||
                reason === 'transport error';

            if (shouldReconnect) {
                logger.debug(
                    `[SocketService] ${name} disconnected (${reason}), scheduling reconnection...`
                );
                this.scheduleReconnection(reason);
            } else {
                // Let Socket.IO's built-in reconnection handle other cases
                logger.debug(
                    `[SocketService] ${name} disconnected (${reason}), relying on Socket.IO auto-reconnect`
                );
            }
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
                (err.message.includes('401') ||
                    err.message.includes('Unauthorized') ||
                    err.message.includes('Authentication error') ||
                    err.message.includes('No token provided'))
            ) {
                apiClient.ensureAuth().then(ok => {
                    // Retry connection if auth is resolved
                    // Use force=false to respect existing promise if any, but since we are in error state,
                    // we might need to be careful. connect() handles joining existing promise.
                    if (ok && !this.forcedDisconnect) {
                        // We must ensure the socket is actually disconnected before calling connect() on it directly
                        // OR better: call the main connect() method to orchestrate everything
                        logger.debug(
                            `[SocketService] ${name} Auth resolved after error, retrying connection...`
                        );
                        this.connect();
                    }
                });
            }
        });

        // 5. Health Check Response
        socket.on('pong', (data: { timestamp: number }) => {
            const latency = Date.now() - data.timestamp;
            this.metrics.latency = latency;
            this.lastPongReceived = Date.now();

            if (this.pingTimeout) {
                clearTimeout(this.pingTimeout);
                this.pingTimeout = null;
            }

            logger.debug(`[SocketService] ${name} pong received (latency: ${latency}ms)`);
        });

        // 6. Reliability & ACK
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

    /**
     * Get current connection metrics
     */
    public getMetrics(): ConnectionMetrics {
        return { ...this.metrics };
    }

    /**
     * Get current connection status
     */
    public getConnectionStatus(): ConnectionStatus {
        return this.getAggregatedStatus();
    }

    /**
     * Manual reconnect trigger (for user-initiated reconnection)
     */
    public async reconnect(): Promise<void> {
        logger.log('[SocketService] Manual reconnect triggered');

        // Reset circuit breaker if open
        if (this.circuitState === CircuitState.OPEN) {
            logger.log('[SocketService] Resetting circuit breaker for manual reconnect');
            this.circuitState = CircuitState.HALF_OPEN;
            this.reconnectionAttempts = 0;
        }

        // Disconnect all sockets first
        if (this.chatSocket?.connected) this.chatSocket.disconnect();
        if (this.collaborationSocket?.connected) this.collaborationSocket.disconnect();
        if (this.activitySocket?.connected) this.activitySocket.disconnect();

        // Force reconnection
        await this.connect(true);
    }
}

export const socketService = SocketService.getInstance();
