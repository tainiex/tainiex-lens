/**
 * 协同 WebSocket Hook
 * Collaboration WebSocket Hook
 * 
 * 连接到 /api/collaboration 命名空间处理实时协同
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import * as Sentry from '@sentry/react';
import { API_BASE_URL } from '../config';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
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
}

interface UseCollaborationSocketReturn {
  socket: CollaborationSocket | null;
  connectionState: CollaborationConnectionState;
  presenceUsers: PresenceUser[];
  sendUpdate: (update: string) => void;
  sendCursorUpdate: (cursor: CursorUpdatePayload['cursor']) => void;
  joinNote: (noteId: string) => void;
  leaveNote: () => void;
  reconnect: () => void;
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRetryCountRef = useRef(0);

  const [connectionState, setConnectionState] = useState<CollaborationConnectionState>({
    status: 'disconnected',
    noteId: null,
  });

  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  // 获取当前用户信息用于光标
  const userInfoRef = useRef<{ userId: string; userName: string; color: string } | null>(null);

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

  /**
   * 刷新认证 Token
   */
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    try {
      const refreshed = await apiClient.ensureAuth();
      if (!refreshed) {
        logger.error('[CollabSocket] Failed to refresh access token');
        return false;
      }
      return true;
    } catch (err) {
      logger.error('[CollabSocket] Error refreshing access token:', err);
      return false;
    }
  }, []);

  /**
   * 设置 Socket 连接
   */
  const setupSocket = useCallback(() => {
    // 清理现有连接
    if (socketRef.current) {
      logger.debug('[CollabSocket] Cleaning up existing socket');
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 构建 WebSocket URL - 连接到 /api/collaboration 命名空间
    let wsUrl: string;
    if (import.meta.env.DEV) {
      wsUrl = '/api/collaboration';
    } else {
      const baseUrl = API_BASE_URL || window.location.origin;
      wsUrl = baseUrl.startsWith('http')
        ? `${baseUrl}/api/collaboration`
        : `${window.location.origin}${baseUrl}/api/collaboration`;
    }

    logger.debug('[CollabSocket] Connecting to:', wsUrl);
    updateConnectionState('connecting');

    const socket = io(wsUrl, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 30000,
      autoConnect: true,
      forceNew: true,
    }) as CollaborationSocket;

    // ===== 连接事件 =====
    socket.on('connect', () => {
      logger.debug('[CollabSocket] Connected, socket ID:', socket.id);
      updateConnectionState('connected', currentNoteIdRef.current);
      authRetryCountRef.current = 0;

      // 如果有待加入的笔记，自动加入
      if (currentNoteIdRef.current) {
        logger.debug('[CollabSocket] Auto-joining note:', currentNoteIdRef.current);
        socket.emit('note:join', { noteId: currentNoteIdRef.current });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.log('[CollabSocket] Disconnected:', reason);

      if (reason === 'io server disconnect') {
        updateConnectionState('disconnected', currentNoteIdRef.current);
        // 服务器主动断开，尝试刷新认证
        refreshAccessToken().then((success) => {
          if (success) {
            logger.log('[CollabSocket] Auth restored, reconnecting...');
            socket.connect();
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
        authRetryCountRef.current++;
        const delay = Math.min(authRetryCountRef.current * 1000, 10000);
        logger.warn(
          `[CollabSocket] Auth error (attempt ${authRetryCountRef.current}), retrying in ${delay}ms`
        );

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(async () => {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            socket.connect();
          }
        }, delay);
        return;
      }

      updateConnectionState('reconnecting', currentNoteIdRef.current, err.message);
    });

    // ===== Y.js 同步事件 =====
    socket.on('yjs:sync', (payload: YjsSyncPayload) => {
      logger.debug('[CollabSocket] Received yjs:sync for note:', payload.noteId);
      onSync?.(payload);
    });

    socket.on('yjs:update', (payload: YjsUpdatePayload) => {
      logger.debug('[CollabSocket] Received yjs:update');
      onUpdate?.(payload);
    });

    // ===== Presence 事件 =====
    socket.on('presence:list', (payload) => {
      const users = payload?.users || [];
      logger.debug('[CollabSocket] Presence list:', users.length, 'users');
      setPresenceUsers(users);
      onPresenceChange?.(users);
    });

    socket.on('presence:join', (payload) => {
      logger.debug('[CollabSocket] User joined:', payload.user.userName);
      setPresenceUsers((prev) => {
        const exists = prev.some((u) => u.userId === payload.user.userId);
        if (exists) return prev;
        const newUsers = [...prev, payload.user];
        onPresenceChange?.(newUsers);
        return newUsers;
      });
    });

    socket.on('presence:leave', (payload) => {
      logger.debug('[CollabSocket] User left:', payload.userId);
      setPresenceUsers((prev) => {
        const newUsers = prev.filter((u) => u.userId !== payload.userId);
        onPresenceChange?.(newUsers);
        return newUsers;
      });
    });

    // ===== 光标事件 =====
    socket.on('cursor:update', (payload: CursorUpdatePayload) => {
      onCursorUpdate?.(payload);
    });

    // ===== 错误事件 =====
    socket.on('collaboration:limit', (payload: CollaborationLimitPayload) => {
      logger.warn('[CollabSocket] Collaboration limit reached:', payload.message);
      onLimit?.(payload);
    });

    socket.on('collaboration:error', (payload: CollaborationErrorPayload) => {
      logger.error('[CollabSocket] Collaboration error:', payload.error);
      onError?.(payload);
    });

    socketRef.current = socket;
    return socket;
  }, [
    updateConnectionState,
    refreshAccessToken,
    onSync,
    onUpdate,
    onCursorUpdate,
    onPresenceChange,
    onLimit,
    onError,
  ]);

  /**
   * 加入笔记协同房间
   */
  const joinNote = useCallback((noteIdToJoin: string) => {
    logger.debug('[CollabSocket] Joining note:', noteIdToJoin);
    currentNoteIdRef.current = noteIdToJoin;

    if (socketRef.current?.connected) {
      socketRef.current.emit('note:join', { noteId: noteIdToJoin });
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
  const sendUpdate = useCallback((update: string) => {
    if (!currentNoteIdRef.current || !socketRef.current?.connected) {
      logger.warn('[CollabSocket] Cannot send update: not connected or no noteId');
      return;
    }

    socketRef.current.emit('yjs:update', {
      noteId: currentNoteIdRef.current,
      update,
    });
  }, []);

  /**
   * 发送光标更新
   */
  const sendCursorUpdate = useCallback(
    (cursor: CursorUpdatePayload['cursor']) => {
      if (!currentNoteIdRef.current || !socketRef.current?.connected) {
        return;
      }

      const userInfo = userInfoRef.current;
      if (!userInfo) return;

      socketRef.current.emit('cursor:update', {
        noteId: currentNoteIdRef.current,
        userId: userInfo.userId,
        userName: userInfo.userName,
        color: userInfo.color,
        cursor,
      });
    },
    []
  );

  /**
   * 手动重连
   */
  const reconnect = useCallback(() => {
    logger.log('[CollabSocket] Manual reconnect');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setupSocket();
  }, [setupSocket]);

  // 初始化 Socket
  useEffect(() => {
    setupSocket();

    // 页面可见性变化处理
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!socketRef.current?.connected) {
          logger.log('[CollabSocket] Page visible, reconnecting...');
          reconnect();
        }
      }
    };

    // 网络在线处理
    const handleOnline = () => {
      logger.log('[CollabSocket] Network online, reconnecting...');
      reconnect();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (socketRef.current) {
        leaveNote();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [setupSocket, reconnect, leaveNote]);

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
  useEffect(() => {
    // 从 API 获取当前用户信息
    const fetchUserInfo = async () => {
      try {
        const res = await apiClient.get('/api/profile');
        if (res.ok) {
          const data = await res.json();
          // 生成随机颜色
          const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
          ];
          const color = colors[Math.floor(Math.random() * colors.length)];
          userInfoRef.current = {
            userId: data.id,
            userName: data.name || data.email,
            color,
          };
        }
      } catch (err) {
        logger.error('[CollabSocket] Failed to fetch user info:', err);
      }
    };

    fetchUserInfo();
  }, []);

  return {
    socket: socketRef.current,
    connectionState,
    presenceUsers,
    sendUpdate,
    sendCursorUpdate,
    joinNote,
    leaveNote,
    reconnect,
  };
}