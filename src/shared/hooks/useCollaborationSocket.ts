/**
 * 协同 WebSocket Hook
 * Collaboration WebSocket Hook
 *
 * 连接到 /api/collaboration 命名空间处理实时协同
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { logger } from '../utils/logger';
import { socketService } from '../services/SocketService';
import { base64Utils } from '../utils/base64';
import type {
    CollaborationSocket,
    CollaborationConnectionState,
    YjsSyncPayload,
    YjsUpdatePayload,
    CursorUpdatePayload,
    PresenceUser,
    CollaborationLimitPayload,
    CollaborationErrorPayload,
} from '../types/collaboration';

interface UseCollaborationSocketOptions {
    noteId: string | null;
    onSync?: (payload: YjsSyncPayload) => void;
    onUpdate?: (payload: YjsUpdatePayload) => void;
    onCursorUpdate?: (payload: CursorUpdatePayload) => void;
    onPresenceChange?: (users: PresenceUser[]) => void;
    onLimit?: (payload: CollaborationLimitPayload) => void;
    onError?: (payload: CollaborationErrorPayload) => void;
    user?: { id: string; username?: string; email: string } | null;
}

interface UseCollaborationSocketReturn {
    socket: CollaborationSocket | null;
    connectionState: CollaborationConnectionState;
    presenceUsers: PresenceUser[];
    sendUpdate: (update: string, targetNoteId: string) => void;
    sendCursorUpdate: (cursor: CursorUpdatePayload['cursor']) => void;
    joinNote: (noteId: string) => void;
    leaveNote: () => void;
    reconnect: () => void;
    isSynced: boolean;
    pendingUpdatesCount: number;
}

export function useCollaborationSocket(
    options: UseCollaborationSocketOptions
): UseCollaborationSocketReturn {
    const { noteId, onSync, onUpdate, onCursorUpdate, onPresenceChange, onLimit, onError } =
        options;

    // Use state to expose the socket instance coming from service
    const [socket, setSocket] = useState<CollaborationSocket | null>(null);

    // Keep socketRef for internal logic to access without dependency
    const socketRef = useRef<CollaborationSocket | null>(null);

    const currentNoteIdRef = useRef<string | null>(null);
    const messageQueueRef = useRef<Array<{ type: string; payload: any }>>([]);
    const pendingUpdatesQueueRef = useRef<Array<{ update: Uint8Array; targetNoteId: string }>>([]);

    const syncedNoteIdRef = useRef<string | null>(null);

    const [connectionState, setConnectionState] = useState<CollaborationConnectionState>({
        status: 'disconnected',
        noteId: null,
    });
    const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

    const userInfoRef = useRef<{ userId: string; userName: string; color: string } | null>(null);

    // [FIX] Use Refs for callbacks
    const onSyncRef = useRef(onSync);
    const onUpdateRef = useRef(onUpdate);
    const onCursorUpdateRef = useRef(onCursorUpdate);
    const onPresenceChangeRef = useRef(onPresenceChange);
    const onLimitRef = useRef(onLimit);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onSyncRef.current = onSync;
        onUpdateRef.current = onUpdate;
        onCursorUpdateRef.current = onCursorUpdate;
        onPresenceChangeRef.current = onPresenceChange;
        onLimitRef.current = onLimit;
        onErrorRef.current = onError;
    }, [onSync, onUpdate, onCursorUpdate, onPresenceChange, onLimit, onError]);

    const updateConnectionState = useCallback(
        (
            status: CollaborationConnectionState['status'],
            noteIdValue: string | null = null,
            error?: string
        ) => {
            setConnectionState({ status, noteId: noteIdValue, error });
        },
        []
    );

    const [isSynced, setIsSynced] = useState(false);
    const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0);

    useEffect(() => {
        setIsSynced(false);
        setPendingUpdatesCount(0);
        pendingUpdatesQueueRef.current = [];
        messageQueueRef.current = [];
    }, [noteId]);

    /**
     * Initialize Socket from Service
     */
    useEffect(() => {
        let activeSocket: CollaborationSocket | null = null;

        const initSocket = async () => {
            await socketService.connect();
            activeSocket = socketService.getCollaborationSocket();

            if (!activeSocket) return;

            setSocket(activeSocket);
            socketRef.current = activeSocket;

            updateConnectionState(
                activeSocket.connected ? 'connected' : 'connecting',
                currentNoteIdRef.current
            );

            const handleConnected = () => {
                logger.debug('[CollabSocket] Connected ID:', activeSocket?.id);
                updateConnectionState('connected', currentNoteIdRef.current);

                if (currentNoteIdRef.current) {
                    // Auto-rejoin logic
                    logger.debug('[CollabSocket] Re-joining note:', currentNoteIdRef.current);
                    syncedNoteIdRef.current = null;

                    const joinPayload = {
                        noteId: currentNoteIdRef.current,
                        stateVector: base64Utils.encode(Y.encodeStateVector(new Y.Doc())),
                    };
                    // @ts-ignore
                    activeSocket.emit('note:join', joinPayload);

                    const syncPayload = {
                        noteId: currentNoteIdRef.current,
                        type: 'sync-step-1',
                        stateVector: joinPayload.stateVector,
                    };
                    // @ts-ignore
                    activeSocket.emit('yjs:sync', syncPayload);

                    // Flush queues ...
                    if (messageQueueRef.current.length > 0) {
                        messageQueueRef.current.forEach(({ type, payload }) => {
                            // @ts-ignore
                            activeSocket?.emit(type, payload);
                        });
                        messageQueueRef.current = [];
                        setPendingUpdatesCount(pendingUpdatesQueueRef.current.length);
                    }
                }
            };

            // Define listeners
            const listeners = {
                connect: handleConnected,
                disconnect: (reason: string) => {
                    logger.log('[CollabSocket] Disconnected:', reason);
                    updateConnectionState('disconnected', null);
                },
                connect_error: (err: any) => {
                    updateConnectionState('reconnecting', currentNoteIdRef.current, err.message);
                },
                yjs_sync: (payload: YjsSyncPayload) => {
                    if (payload.noteId === currentNoteIdRef.current) {
                        syncedNoteIdRef.current = payload.noteId;
                        if (pendingUpdatesQueueRef.current.length > 0) {
                            pendingUpdatesQueueRef.current.forEach(({ update, targetNoteId }) => {
                                if (targetNoteId === payload.noteId) {
                                    const encodedUpdate = base64Utils.encode(update);
                                    // @ts-ignore
                                    activeSocket?.emit('yjs:update', {
                                        noteId: targetNoteId,
                                        update: encodedUpdate,
                                    });
                                }
                            });
                            pendingUpdatesQueueRef.current = [];
                            setPendingUpdatesCount(messageQueueRef.current.length);
                        }
                    }
                    onSyncRef.current?.(payload);
                    setIsSynced(true);
                },
                yjs_update: (payload: YjsUpdatePayload) => {
                    if (payload.noteId !== currentNoteIdRef.current) return;
                    onUpdateRef.current?.(payload);
                },
                presence_list: (users: any) => {
                    setPresenceUsers(users as any);
                    onPresenceChangeRef.current?.(users as any);
                },
                presence_join: (payload: any) => {
                    const user: PresenceUser = {
                        userId: payload.userId,
                        userName: payload.username,
                        avatar: payload.avatar,
                        color: payload.color,
                    };
                    setPresenceUsers(prev => {
                        const exists = prev.some(u => u.userId === user.userId);
                        if (exists) return prev;
                        const newUsers = [...prev, user];
                        onPresenceChangeRef.current?.(newUsers);
                        return newUsers;
                    });
                },
                presence_leave: (payload: any) => {
                    setPresenceUsers(prev => {
                        const newUsers = prev.filter(u => u.userId !== payload.userId);
                        onPresenceChangeRef.current?.(newUsers);
                        return newUsers;
                    });
                },
                cursor_update: (payload: any) => {
                    onCursorUpdateRef.current?.(payload as any);
                },
                collaboration_limit: (payload: CollaborationLimitPayload) => {
                    onLimitRef.current?.(payload);
                },
            };

            // Attach listeners
            activeSocket.on('connect', listeners.connect);
            activeSocket.on('disconnect', listeners.disconnect);
            // activeSocket.on('connect_error', listeners.connect_error); // Handled by service mostly, but good for local state update
            activeSocket.on('yjs:sync', listeners.yjs_sync);
            activeSocket.on('yjs:update', listeners.yjs_update);
            activeSocket.on('presence:list', listeners.presence_list);
            activeSocket.on('presence:join', listeners.presence_join);
            activeSocket.on('presence:leave', listeners.presence_leave);
            activeSocket.on('cursor:update', listeners.cursor_update);
            activeSocket.on('collaboration:limit', listeners.collaboration_limit);

            // [FIX] If socket is already connected, trigger handler manually
            if (activeSocket.connected) {
                logger.debug(
                    '[CollabSocket] Socket already connected, triggering handler manually'
                );
                handleConnected();
            }

            // Cleanup
            return () => {
                if (activeSocket) {
                    activeSocket.off('connect', listeners.connect);
                    activeSocket.off('disconnect', listeners.disconnect);
                    // activeSocket.off('connect_error', listeners.connect_error);
                    activeSocket.off('yjs:sync', listeners.yjs_sync);
                    activeSocket.off('yjs:update', listeners.yjs_update);
                    activeSocket.off('presence:list', listeners.presence_list);
                    activeSocket.off('presence:join', listeners.presence_join);
                    activeSocket.off('presence:leave', listeners.presence_leave);
                    activeSocket.off('cursor:update', listeners.cursor_update);
                    activeSocket.off('collaboration:limit', listeners.collaboration_limit);
                }
            };
        };

        const cleanupPromise = initSocket();

        return () => {
            cleanupPromise.then(cleanup => {
                if (cleanup) cleanup();
            });
        };
    }, [updateConnectionState]);

    const joinNote = useCallback((noteIdToJoin: string) => {
        logger.debug('[CollabSocket] Joining note:', noteIdToJoin);
        syncedNoteIdRef.current = null;
        currentNoteIdRef.current = noteIdToJoin;
        pendingUpdatesQueueRef.current = [];

        if (socketRef.current?.connected) {
            const joinPayload = {
                noteId: noteIdToJoin,
                stateVector: base64Utils.encode(Y.encodeStateVector(new Y.Doc())),
            };
            // @ts-ignore
            socketRef.current.emit('note:join', joinPayload);

            const syncPayload = {
                noteId: noteIdToJoin,
                type: 'sync-step-1',
                stateVector: joinPayload.stateVector,
            };
            // @ts-ignore
            socketRef.current.emit('yjs:sync', syncPayload);
        }
    }, []);

    const leaveNote = useCallback(() => {
        if (currentNoteIdRef.current && socketRef.current?.connected) {
            socketRef.current.emit('note:leave', { noteId: currentNoteIdRef.current });
        }
        currentNoteIdRef.current = null;
        setPresenceUsers([]);
    }, []);

    const sendUpdate = useCallback((update: Uint8Array | string, targetNoteId: string) => {
        const updateBytes = typeof update === 'string' ? base64Utils.decode(update) : update;

        if (syncedNoteIdRef.current !== targetNoteId) {
            pendingUpdatesQueueRef.current.push({ update: updateBytes, targetNoteId });
            setPendingUpdatesCount(prev => prev + 1);
            return;
        }

        if (!currentNoteIdRef.current) return;

        const encodedUpdate = base64Utils.encode(updateBytes);
        const payload = {
            noteId: currentNoteIdRef.current,
            update: encodedUpdate,
        };

        if (!socketRef.current?.connected) {
            messageQueueRef.current.push({ type: 'yjs:update', payload });
            setPendingUpdatesCount(prev => prev + 1);
        } else {
            // @ts-ignore
            socketRef.current.emit('yjs:update', payload);
        }
    }, []);

    const sendCursorUpdate = useCallback((cursor: CursorUpdatePayload['cursor']) => {
        if (!currentNoteIdRef.current) return;

        const userInfo = userInfoRef.current;
        if (!userInfo) return;

        const payload = {
            noteId: currentNoteIdRef.current,
            userId: userInfo.userId,
            userName: userInfo.userName,
            color: userInfo.color,
            cursor,
        };

        if (!socketRef.current?.connected) {
            // messageQueueRef.current.push({ type: 'cursor:update', payload });
            return;
        }
        socketRef.current.emit('cursor:update', payload);
    }, []);

    const reconnect = useCallback(() => {
        socketService.disconnect();
        setTimeout(() => socketService.connect(), 500);
    }, []);

    // Update effect for noteId
    useEffect(() => {
        if (noteId) {
            joinNote(noteId);
        } else {
            leaveNote();
        }
        return () => {
            if (noteId) leaveNote();
        };
    }, [noteId, joinNote, leaveNote]);

    // Update effect for user info
    useEffect(() => {
        if (options.user) {
            const colors = [
                '#FF6B6B',
                '#4ECDC4',
                '#45B7D1',
                '#96CEB4',
                '#FFEAA7',
                '#DDA0DD',
                '#98D8C8',
                '#F7DC6F',
            ];
            const color = colors[Math.floor(Math.random() * colors.length)];
            userInfoRef.current = {
                userId: options.user.id,
                userName: options.user.username || options.user.email,
                color,
            };
        }
    }, [options.user?.id]);

    return {
        socket,
        connectionState,
        presenceUsers,
        sendUpdate,
        sendCursorUpdate,
        joinNote,
        leaveNote,
        reconnect,
        isSynced,
        pendingUpdatesCount,
    };
}
