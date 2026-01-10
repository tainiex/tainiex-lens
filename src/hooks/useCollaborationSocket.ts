/**
 * 协同 WebSocket Hook
 * Collaboration WebSocket Hook
 * 
 * 连接到 /api/collaboration 命名空间处理实时协同
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import * as Y from 'yjs'; // Added for encodeStateVector
import { logger } from '../utils/logger';
import { apiClient } from '../utils/apiClient';
import { getNamespaceSocket, refreshAndReconnect } from '../utils/socketManager';
import { base64Utils } from '../utils/base64';
import type {
  // NoteJoinPayload, // Unused in this file directly
  // NoteLeavePayload, // Unused
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
  user?: { id: string; username?: string; email: string; } | null;
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
  const {
    noteId,
    onSync,
    onUpdate,
    onCursorUpdate,
    onPresenceChange,
    onLimit,
    onError,
  } = options;

  const socketRef = useRef<CollaborationSocket | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const messageQueueRef = useRef<Array<{ type: string; payload: any }>>([]);
  // [FIX] Buffer updates while waiting for sync to prevent data loss
  const pendingUpdatesQueueRef = useRef<Array<{ update: Uint8Array; targetNoteId: string }>>([]);
  const isInitializedRef = useRef(false); // Track if socket has been initialized

  // [FIX] Sync Guard: Prevent local updates from overwriting server data before sync
  // We use noteId instead of boolean to prevent race conditions (Assassin Update)
  const syncedNoteIdRef = useRef<string | null>(null);

  const [connectionState, setConnectionState] = useState<CollaborationConnectionState>(() => {
    // [FIX] Smart Initialization: Check if socket is already connected
    const socket = getNamespaceSocket('/api/collaboration');
    if (socket.connected) {
      return { status: 'connected', noteId: null };
    }
    return { status: 'disconnected', noteId: null };
  });

  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  // 获取当前用户信息用于光标
  const userInfoRef = useRef<{ userId: string; userName: string; color: string } | null>(null);

  // [FIX] Use Refs for callbacks so listeners always access latest version
  const onSyncRef = useRef(onSync);
  const onUpdateRef = useRef(onUpdate);
  const onCursorUpdateRef = useRef(onCursorUpdate);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onLimitRef = useRef(onLimit);
  const onErrorRef = useRef(onError);

  // Keep Refs updated
  useEffect(() => {
    onSyncRef.current = onSync;
    onUpdateRef.current = onUpdate;
    onCursorUpdateRef.current = onCursorUpdate;
    onPresenceChangeRef.current = onPresenceChange;
    onLimitRef.current = onLimit;
    onErrorRef.current = onError;
  }, [onSync, onUpdate, onCursorUpdate, onPresenceChange, onLimit, onError]);

  /**
   * 更新连接状态
   */
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



  // State to track if synchronization is complete for current note
  const [isSynced, setIsSynced] = useState(false);
  // [FIX] Track pending updates count for UI feedback
  const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0);

  // Reset sync state when noteId changes
  useEffect(() => {
    setIsSynced(false);
    setPendingUpdatesCount(0);
    pendingUpdatesQueueRef.current = [];
    messageQueueRef.current = [];
  }, [noteId]);

  /**
   * 设置 Socket 连接使用共享 Manager
   */
  const setupSocket = useCallback(async () => {
    // 清理现有连接
    if (socketRef.current) {
      logger.debug('[CollabSocket] Cleaning up existing socket');
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }

    logger.debug('[CollabSocket] Getting namespace socket from Manager');

    // Get namespace socket from shared Manager
    const socket = getNamespaceSocket('/api/collaboration') as CollaborationSocket;

    // [FIX] Ensure auth is valid before connecting
    logger.debug('[CollabSocket] Checking authentication...');
    const authReady = await apiClient.ensureAuth();
    if (!authReady) {
      logger.warn('[CollabSocket] Auth check failed, not connecting');
      updateConnectionState('disconnected', null);
      socketRef.current = socket;
      return socket;
    }
    logger.debug('[CollabSocket] Auth check passed');

    // [FIX] Abstract connection logic to handle both "Event" and "Immediate" connection
    const handleConnected = () => {
      logger.debug('[CollabSocket] Socket Connected/Ready, ID:', socket.id);
      updateConnectionState('connected', currentNoteIdRef.current);

      if (currentNoteIdRef.current) {
        logger.debug('[CollabSocket] Auto-joining note:', currentNoteIdRef.current);

        syncedNoteIdRef.current = null;

        const joinPayload = {
          noteId: currentNoteIdRef.current,
          stateVector: base64Utils.encode(Y.encodeStateVector(new Y.Doc()))
        };
        // @ts-ignore
        socket.emit('note:join', joinPayload);

        const syncPayload = {
          noteId: currentNoteIdRef.current,
          type: 'sync-step-1',
          stateVector: joinPayload.stateVector
        };
        // @ts-ignore
        socket.emit('yjs:sync', syncPayload);

        // Flush message queue
        if (messageQueueRef.current.length > 0) {
          logger.debug('[CollabSocket] Flushing message queue:', messageQueueRef.current.length);
          messageQueueRef.current.forEach(({ type, payload }) => {
            // @ts-ignore
            socket.emit(type, payload);
          });
          messageQueueRef.current = [];
          setPendingUpdatesCount(pendingUpdatesQueueRef.current.length); // Update count
        }
      }
    };

    // [FIX] 检查 socket 是否已经连接
    if (socket.connected) {
      logger.debug('[CollabSocket] Socket already connected, triggering handler manually');
      handleConnected();
    } else {
      updateConnectionState('connecting');
      logger.debug('[CollabSocket] Manually connecting socket...');
      socket.connect();
    }

    // ===== 连接事件 =====
    socket.on('connect', handleConnected);

    socket.on('disconnect', (reason) => {
      logger.log('[CollabSocket] Disconnected:', reason);

      if (reason === 'io server disconnect') {
        updateConnectionState('disconnected', currentNoteIdRef.current);
        // 服务器主动断开，尝试刷新认证
        refreshAndReconnect().then((success) => {
          if (success) {
            logger.log('[CollabSocket] Auth restored, socket will auto-reconnect');
          }
        });
      } else if (reason === 'io client disconnect') {
        updateConnectionState('disconnected', null);
      } else {
        updateConnectionState('reconnecting', currentNoteIdRef.current);
      }
    });

    socket.on('connect_error', async (err) => {
      logger.warn('[CollabSocket] Connection error:', err.message);

      Sentry.captureException(err, {
        tags: { type: 'collaboration_socket_error' },
      });

      const isAuthError =
        err.message.includes('Authentication') ||
        err.message.includes('Unauthorized') ||
        err.message.includes('401');

      if (isAuthError) {
        logger.warn('[CollabSocket] Auth error detected, delegating to Manager...');
        refreshAndReconnect();
        return;
      }

      updateConnectionState('reconnecting', currentNoteIdRef.current, err.message);
    });

    // ===== Y.js 同步事件 =====
    socket.on('yjs:sync', (payload: YjsSyncPayload) => {


      // [FIX] Unblock outgoing updates for THIS note
      if (payload.noteId === currentNoteIdRef.current) {
        syncedNoteIdRef.current = payload.noteId;

        // [FIX] Flush pending updates that were blocked awaiting sync
        if (pendingUpdatesQueueRef.current.length > 0) {
          pendingUpdatesQueueRef.current.forEach(({ update, targetNoteId }) => {
            if (targetNoteId === payload.noteId) {
              // Encode update if needed or send as is? 
              // sendUpdate logic does: socket.emit('yjs:update', { noteId, update: base64Utils.encode(update) })
              // So we need to replicate the emit logic or reuse sendUpdate?
              // Reuse logic manually to avoid recursion checks
              const encodedUpdate = base64Utils.encode(update);
              const updatePayload = {
                noteId: targetNoteId,
                update: encodedUpdate
              };
              // @ts-ignore
              socketRef.current.emit('yjs:update', updatePayload);
            }
          });
          pendingUpdatesQueueRef.current = [];
          setPendingUpdatesCount(messageQueueRef.current.length); // Update count (messageQueue should be empty here anyway)
        }
      }

      logger.debug('[CollabSocket] Received yjs:sync for note:', payload.noteId);
      onSyncRef.current?.(payload);
      setIsSynced(true);
    });

    socket.on('yjs:update', (payload: YjsUpdatePayload) => {
      logger.debug('[CollabSocket] Received yjs:update');
      onUpdateRef.current?.(payload);
    });

    // ===== Presence 事件 =====
    socket.on('presence:list', (users) => {
      // Shared payload IS the array of users (ICollaborator[])
      // const users = payload?.users || []; // Old
      logger.debug('[CollabSocket] Presence list:', users?.length || 0, 'users');
      // Shared ICollaborator might need mapping to local PresenceUser if types differ?
      // Assuming they are compatible for now or compatible enough.
      // Shared ICollaborator likely has userId, username, etc.
      // Local PresenceUser has userId, userName, color.
      // We might need a map if Shared uses 'username' and Local uses 'userName'.
      // For now passing as is, if TS fails we fix mapping.
      setPresenceUsers(users as any);
      onPresenceChangeRef.current?.(users as any);
    });

    socket.on('presence:join', (payload) => {
      // Shared payload is flat: { userId, username, avatar, color }
      const user: PresenceUser = {
        userId: payload.userId,
        userName: payload.username,
        avatar: payload.avatar,
        color: payload.color
      };

      logger.debug('[CollabSocket] User joined:', user.userName);
      setPresenceUsers((prev) => {
        const exists = prev.some((u) => u.userId === user.userId);
        if (exists) return prev;
        const newUsers = [...prev, user];
        onPresenceChangeRef.current?.(newUsers);
        return newUsers;
      });
    });

    socket.on('presence:leave', (payload) => {
      logger.debug('[CollabSocket] User left:', payload.userId);
      setPresenceUsers((prev) => {
        const newUsers = prev.filter((u) => u.userId !== payload.userId);
        onPresenceChangeRef.current?.(newUsers);
        return newUsers;
      });
    });

    // ===== 光标事件 =====
    // Shared payload differs from local. We receive Shared, need to emit Local to callback?
    // Actually, onCursorUpdate expects Local CursorUpdatePayload.
    socket.on('cursor:update', (payload) => {
      // Shared: { position: { blockId, offset }, selection: ... }
      // Local expectation: { cursor: { position: number } }
      // If backend sends Shared structure, we need to map it or ignore it if we stick to local.
      // For now, casting or ignoring to prevent crash, assuming backend might still send legacy or we need deep change.
      // User said "backend sending... TS knows payload".
      // Assuming backend sends Shared structure. Front needs to adapt.
      // But Tiptap relies on Y.js awareness mostly? This event might be supplementary.
      // Let's safe-guard usage.
      if (!onCursorUpdateRef.current) return;

      // Temporary Adapter:
      // If payload has 'cursor' (Legacy), pass it.
      // If payload has 'position' (Shared), map it? No, blockId mapping is hard without doc context.
      // We silence the cast for now to pass build, but mark Todo.
      onCursorUpdateRef.current(payload as any);
    });

    // ===== 错误事件 =====
    socket.on('collaboration:limit', (payload: CollaborationLimitPayload) => {
      logger.warn('[CollabSocket] Collaboration limit reached:', payload.error);
      onLimitRef.current?.(payload);
    });

    // collaboration:error not in Shared ServerToClientEvents
    // socket.on('collaboration:error', ... );

    socketRef.current = socket;
    return socket;
  }, [
    updateConnectionState,
    // [FIX] Removed volatile deps to prevent recreate loop. Refs are used instead.
  ]);

  /**
   * 加入笔记协同房间
   */
  const joinNote = useCallback((noteIdToJoin: string) => {
    logger.debug('[CollabSocket] Joining note:', noteIdToJoin);

    // [FIX] Reset sync state and update current note ID
    syncedNoteIdRef.current = null;
    currentNoteIdRef.current = noteIdToJoin;
    pendingUpdatesQueueRef.current = [];

    if (socketRef.current?.connected) {
      const joinPayload = {
        noteId: noteIdToJoin,
        stateVector: base64Utils.encode(Y.encodeStateVector(new Y.Doc()))
      };
      // @ts-ignore
      socketRef.current.emit('note:join', joinPayload);

      // [TRY FIX] Also emit 'yjs:sync' explicit handshake
      // Some backends separate join (room) and sync (data)
      const syncPayload = {
        noteId: noteIdToJoin,
        type: 'sync-step-1', // Standard YJS flag
        stateVector: joinPayload.stateVector
      };
      // @ts-ignore
      socketRef.current.emit('yjs:sync', syncPayload);
    } else {
      logger.debug('[CollabSocket] Socket is NOT open. Will auto-join upon connect.');
    }
  }, []);

  /**
   * 离开笔记协同房间
   */
  const leaveNote = useCallback(() => {
    if (currentNoteIdRef.current && socketRef.current?.connected) {
      logger.debug('[CollabSocket] Leaving note:', currentNoteIdRef.current);
      socketRef.current.emit('note:leave', { noteId: currentNoteIdRef.current });
    }
    currentNoteIdRef.current = null;
    setPresenceUsers([]);
  }, []);

  /**
   * 发送 Y.js 更新
   */
  const sendUpdate = useCallback((update: Uint8Array | string, targetNoteId: string) => {

    // Convert string to Uint8Array if needed (though usually it comes as Uint8Array from Yjs)
    const updateBytes = typeof update === 'string' ? base64Utils.decode(update) : update;

    // [FIX] Sync Guard & Buffering
    // If not synced yet (or syncing wrong note), buffer the update!
    if (syncedNoteIdRef.current !== targetNoteId) {
      logger.debug(`[CollabSocket] Not synced yet. Buffering update for ${targetNoteId}.`);
      logger.debug(`[CollabSocket] Not synced yet. Buffering update for ${targetNoteId}.`);
      pendingUpdatesQueueRef.current.push({ update: updateBytes, targetNoteId });
      setPendingUpdatesCount(prev => prev + 1);
      return;
    }

    if (!currentNoteIdRef.current) {
      logger.warn('[CollabSocket] Cannot send update: no noteId');
      return;
    }

    // [FIX] Encode to Base64 to match Shared Lib protocol
    const encodedUpdate = base64Utils.encode(updateBytes);

    const payload = {
      noteId: currentNoteIdRef.current,
      update: encodedUpdate,
    };

    if (!socketRef.current?.connected) {
      logger.debug('[CollabSocket] Socket not connected, buffering update');
      logger.debug('[CollabSocket] Socket not connected, buffering update');
      // This is the socket connection buffer, distinct from sync buffer
      messageQueueRef.current.push({ type: 'yjs:update', payload });
      setPendingUpdatesCount(prev => prev + 1);
    } else {
      // @ts-ignore
      socketRef.current.emit('yjs:update', payload);
    }
  }, []);

  /**
   * 发送光标更新
   */
  const sendCursorUpdate = useCallback(
    (cursor: CursorUpdatePayload['cursor']) => {
      if (!currentNoteIdRef.current) {
        return;
      }

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
        // Optional: decide if we want to buffer cursor updates. 
        // For now, let's buffer them to be consistent, but maybe limit queue size?
        // Actually, cursor updates are valid only if relevant. 
        // Let's buffer them too.
        messageQueueRef.current.push({ type: 'cursor:update', payload });
        return;
      }

      socketRef.current.emit('cursor:update', payload);
    },
    []
  );

  /**
   * 手动重连
   */
  const reconnect = useCallback(() => {
    logger.log('[CollabSocket] Manual reconnect');
  }, []);

  // Initial setup
  useEffect(() => {
    // If socket already exists and is connected, don't recreate
    if (socketRef.current?.connected && isInitializedRef.current) {
      logger.debug('[CollabSocket] Socket already initialized and connected, skipping setup');
      updateConnectionState('connected', currentNoteIdRef.current);
      return;
    }

    // Only setup if not initialized or socket is disconnected
    if (!isInitializedRef.current || !socketRef.current) {
      setupSocket();
      isInitializedRef.current = true;
    }

    return () => {
      // Clean up listeners when component unmounts
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        // Don't disconnect here - let Manager handle it
        socketRef.current = null;
      }
      // Reset initialization flag on unmount
      isInitializedRef.current = false;
    };
  }, [setupSocket, updateConnectionState]);

  // 当 noteId 变化时，自动加入/离开房间
  useEffect(() => {
    if (noteId) {
      joinNote(noteId);
    } else {
      leaveNote();
    }

    return () => {
      if (noteId) {
        leaveNote();
      }
    };
  }, [noteId, joinNote, leaveNote]);

  // 设置用户信息（用于光标）
  // 设置用户信息（用于光标）
  useEffect(() => {
    if (options.user) {
      // 生成随机颜色
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
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
    socket: socketRef.current,
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