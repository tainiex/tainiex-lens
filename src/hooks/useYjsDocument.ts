/**
 * Y.js 文档管理 Hook
 * Y.js Document Management Hook
 * 
 * 处理 Y.js 文档的初始化、同步和更新
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { logger } from '../utils/logger';
import type { YjsSyncPayload, YjsUpdatePayload } from '../types/collaboration';

interface UseYjsDocumentOptions {
  noteId: string | null;
  onLocalUpdate?: (update: string) => void; // Base64 encoded update
}

interface UseYjsDocumentReturn {
  ydoc: Y.Doc | null;
  yXmlFragment: Y.XmlFragment | null;
  isInitialized: boolean;
  isSyncing: boolean;
  applyRemoteUpdate: (payload: YjsUpdatePayload) => void;
  applyInitialSync: (payload: YjsSyncPayload) => void;
  getStateAsBase64: () => string;
}

/**
 * Base64 编解码工具
 */
const base64Utils = {
  encode(uint8Array: Uint8Array): string {
    // Convert Uint8Array to binary string then to base64
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  },

  decode(base64: string | undefined | null): Uint8Array {
    if (base64 === undefined || base64 === null) {
      // It's normal to have no initial state for new notes
      logger.debug('[base64Utils] No base64 string provided (new note?)');
      return new Uint8Array(0);
    }
    if (typeof base64 !== 'string') {
      logger.warn('[base64Utils] Invalid base64 type:', typeof base64);
      return new Uint8Array(0);
    }
    try {
      const binary = atob(base64);
      const len = binary.length;
      const uint8Array = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        uint8Array[i] = binary.charCodeAt(i);
      }
      return uint8Array;
    } catch (error) {
      logger.error('[base64Utils] Failed to decode base64:', error);
      return new Uint8Array(0);
    }
  },
};

export function useYjsDocument(options: UseYjsDocumentOptions): UseYjsDocumentReturn {
  const { noteId, onLocalUpdate } = options;

  const ydocRef = useRef<Y.Doc | null>(null);
  const yXmlFragmentRef = useRef<Y.XmlFragment | null>(null);
  const isLocalUpdateRef = useRef(false);
  const onLocalUpdateRef = useRef(onLocalUpdate);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 保持 callback ref 最新
  useEffect(() => {
    onLocalUpdateRef.current = onLocalUpdate;
  }, [onLocalUpdate]);

  /**
   * 初始化 Y.Doc
   */
  const initializeYDoc = useCallback(() => {
    // 清理旧文档
    if (ydocRef.current) {
      logger.debug('[YjsDoc] Destroying old Y.Doc');
      ydocRef.current.destroy();
      ydocRef.current = null;
      yXmlFragmentRef.current = null;
    }

    if (!noteId) {
      setIsInitialized(false);
      return;
    }

    logger.debug('[YjsDoc] Creating new Y.Doc for note:', noteId);
    const ydoc = new Y.Doc();
    
    // 创建 XmlFragment 用于富文本编辑器
    // Tiptap 使用 XmlFragment 作为文档结构
    const yXmlFragment = ydoc.getXmlFragment('prosemirror');

    // 监听本地更新
    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // 只发送本地更新，忽略远程更新
      if (origin === 'remote') {
        logger.debug('[YjsDoc] Ignoring remote update echo');
        return;
      }

      if (isLocalUpdateRef.current) {
        logger.debug('[YjsDoc] Ignoring local update during apply');
        return;
      }

      logger.debug('[YjsDoc] Local update detected, size:', update.byteLength);
      const base64Update = base64Utils.encode(update);
      onLocalUpdateRef.current?.(base64Update);
    });

    ydocRef.current = ydoc;
    yXmlFragmentRef.current = yXmlFragment;
    setIsInitialized(true);

    logger.debug('[YjsDoc] Y.Doc initialized');
  }, [noteId]);

  /**
   * 应用初始同步状态
   */
  const applyInitialSync = useCallback((payload: YjsSyncPayload) => {
    const ydoc = ydocRef.current;
    if (!ydoc) {
      logger.warn('[YjsDoc] Cannot apply sync: no Y.Doc');
      return;
    }

    logger.debug('[YjsDoc] Applying initial sync for note:', payload.noteId);
    setIsSyncing(true);

    try {
      isLocalUpdateRef.current = true;
      const update = base64Utils.decode(payload.state);
      if (update.byteLength > 0) {
        Y.applyUpdate(ydoc, update, 'remote');
        logger.debug('[YjsDoc] Initial sync applied, size:', update.byteLength);
      } else {
        logger.debug('[YjsDoc] Initial sync skipped: empty update');
      }
    } catch (error) {
      logger.error('[YjsDoc] Failed to apply initial sync:', error);
    } finally {
      isLocalUpdateRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  /**
   * 应用远程更新
   */
  const applyRemoteUpdate = useCallback((payload: YjsUpdatePayload) => {
    const ydoc = ydocRef.current;
    if (!ydoc) {
      logger.warn('[YjsDoc] Cannot apply remote update: no Y.Doc');
      return;
    }

    try {
      isLocalUpdateRef.current = true;
      const update = base64Utils.decode(payload.update);
      if (update.byteLength > 0) {
        Y.applyUpdate(ydoc, update, 'remote');
        logger.debug('[YjsDoc] Remote update applied, size:', update.byteLength);
      } else {
        logger.debug('[YjsDoc] Remote update skipped: empty update');
      }
    } catch (error) {
      logger.error('[YjsDoc] Failed to apply remote update:', error);
    } finally {
      isLocalUpdateRef.current = false;
    }
  }, []);

  /**
   * 获取当前状态的 Base64 编码
   */
  const getStateAsBase64 = useCallback((): string => {
    const ydoc = ydocRef.current;
    if (!ydoc) {
      return '';
    }

    const state = Y.encodeStateAsUpdate(ydoc);
    return base64Utils.encode(state);
  }, []);

  // 当 noteId 变化时重新初始化
  useEffect(() => {
    initializeYDoc();

    return () => {
      if (ydocRef.current) {
        logger.debug('[YjsDoc] Cleanup: destroying Y.Doc');
        ydocRef.current.destroy();
        ydocRef.current = null;
        yXmlFragmentRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [noteId, initializeYDoc]);

  return {
    ydoc: ydocRef.current,
    yXmlFragment: yXmlFragmentRef.current,
    isInitialized,
    isSyncing,
    applyRemoteUpdate,
    applyInitialSync,
    getStateAsBase64,
  };
}

export { base64Utils };