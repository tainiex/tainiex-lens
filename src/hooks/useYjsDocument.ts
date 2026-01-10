/**
 * Y.js 文档管理 Hook
 * Y.js Document Management Hook
 * 
 * 处理 Y.js 文档的初始化、同步和更新
 * 使用模块级单例 Map 管理 Y.Doc 实例，确保每个 noteId 只有一个实例
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { logger } from '../utils/logger';
import type { YjsSyncPayload, YjsUpdatePayload } from '../types/collaboration';
import { base64Utils } from '../utils/base64';

interface UseYjsDocumentOptions {
  noteId: string | null;
  onLocalUpdate?: (update: string) => void; // Base64 encoded update
}

interface UseYjsDocumentReturn {
  ydoc: Y.Doc | null;
  yXmlFragment: Y.XmlFragment | null;
  activeFragmentName: 'blocks' | 'default';
  isInitialized: boolean;
  isSyncing: boolean;
  hasData: boolean;
  applyRemoteUpdate: (payload: YjsUpdatePayload) => void;
  applyInitialSync: (payload: YjsSyncPayload) => void;
  getStateAsBase64: () => string;
}

// [FIX] Module-level singleton - Y.Doc生命周期独立于React组件
const ydocSingletons = new Map<string, {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  activeFragmentName: 'blocks' | 'default';
  syncedOnce: boolean;
}>();

function getOrCreateYDoc(noteId: string): { doc: Y.Doc; fragment: Y.XmlFragment; activeFragmentName: 'blocks' | 'default' } {
  let singleton = ydocSingletons.get(noteId);

  if (!singleton) {
    logger.debug('[YjsDoc] Creating singleton Y.Doc for:', noteId);
    const doc = new Y.Doc({ guid: noteId });
    const fragment = doc.getXmlFragment('blocks');

    singleton = {
      doc,
      fragment,
      activeFragmentName: 'blocks',
      syncedOnce: false
    };
    ydocSingletons.set(noteId, singleton);
  } else {
    logger.debug('[YjsDoc] Reusing singleton Y.Doc for:', noteId, 'Fragment:', singleton.activeFragmentName);
  }

  return {
    doc: singleton.doc,
    fragment: singleton.fragment,
    activeFragmentName: singleton.activeFragmentName
  };
}

// Function kep but not used for now (Persistence Strategy)
function destroyYDoc(noteId: string) {
  const singleton = ydocSingletons.get(noteId);
  if (singleton) {
    logger.debug('[YjsDoc] Destroying singleton Y.Doc for:', noteId);
    singleton.doc.destroy();
    ydocSingletons.delete(noteId);
  }
}

export function useYjsDocument(options: UseYjsDocumentOptions): UseYjsDocumentReturn {
  const { noteId, onLocalUpdate } = options;

  const ydocRef = useRef<Y.Doc | null>(null);
  const yXmlFragmentRef = useRef<Y.XmlFragment | null>(null);
  const isLocalUpdateRef = useRef(false);
  const onLocalUpdateRef = useRef(onLocalUpdate);
  const [isSyncing, setIsSyncing] = useState(false);

  // [FIX] Use State for activeFragmentName to ensure UI updates when fragment changes
  const [activeFragmentName, setActiveFragmentName] = useState<'blocks' | 'default'>('blocks');

  const prevNoteIdRef = useRef<string | null>(null);

  // 保持 callback ref 最新
  useEffect(() => {
    onLocalUpdateRef.current = onLocalUpdate;
  }, [onLocalUpdate]);

  // [FIX] Synchronous Lazy Initialization
  if (noteId && (!ydocRef.current || ydocRef.current.guid !== noteId)) {
    const { doc, fragment, activeFragmentName: cachedFragmentName } = getOrCreateYDoc(noteId);
    ydocRef.current = doc;
    yXmlFragmentRef.current = fragment;

    if (activeFragmentName !== cachedFragmentName) {
      setActiveFragmentName(cachedFragmentName);
    }
  }

  if (!noteId && ydocRef.current) {
    ydocRef.current = null;
    yXmlFragmentRef.current = null;
  }

  // Lifecycle & Listener Management
  useEffect(() => {
    if (!noteId || !ydocRef.current) return;

    // [UPDATE] Persistence Strategy: DO NOT destroy Y.Doc on switch. 
    prevNoteIdRef.current = noteId;

    const doc = ydocRef.current;

    const updateHandler = (update: Uint8Array, origin: unknown) => {
      // [FIX] Strict Gate: DO NOT send updates if:
      const singleton = noteId ? ydocSingletons.get(noteId) : null;
      const isSynced = singleton?.syncedOnce;

      if (origin === 'remote' || isLocalUpdateRef.current) return;

      if (!isSynced) {
        logger.warn('[YjsDoc] Blocked local update before initial sync.');
        return;
      }

      const base64Update = base64Utils.encode(update);
      onLocalUpdateRef.current?.(base64Update);
    };

    doc.on('update', updateHandler);

    return () => {
      doc.off('update', updateHandler);
    };
  }, [noteId]);

  const isInitialized = !!ydocRef.current;

  /**
   * 应用初始同步状态
   */
  const applyInitialSync = useCallback((payload: YjsSyncPayload) => {
    // [FIX] CRITICAL: Lookup correct doc by noteId to prevent cross-talk
    const singleton = ydocSingletons.get(payload.noteId);

    if (!singleton) {
      logger.warn('[YjsDoc] Received sync for inactive note:', payload.noteId);
      return;
    }

    if (singleton.syncedOnce) {
      logger.debug('[YjsDoc] Singleton already synced for:', payload.noteId);

      // Update local state if this update belongs to CURRENTLY viewed note
      // This handles the "Switch back to A -> Sync A arrived -> Update UI" case
      if (payload.noteId === noteId && singleton.activeFragmentName !== activeFragmentName) {
        logger.debug('[YjsDoc] Syncing local fragment choice with singleton:', singleton.activeFragmentName);
        setActiveFragmentName(singleton.activeFragmentName);
        yXmlFragmentRef.current = singleton.fragment;
      }
      return;
    }

    logger.debug('[YjsDoc] Applying initial sync for note:', payload.noteId);
    setIsSyncing(true);

    try {
      isLocalUpdateRef.current = true;
      const updateData = payload.update || (payload as any).state;
      const update = base64Utils.decode(updateData);
      const targetDoc = singleton.doc; // [FIX] USE CORRECT DOC

      if (update.byteLength > 0) {
        Y.applyUpdate(targetDoc, update, 'remote');
        logger.debug('[YjsDoc] Initial sync applied, size:', update.byteLength);

        // Smart Fragment Selection
        const blocksFrag = targetDoc.getXmlFragment('blocks');
        const defaultFrag = targetDoc.getXmlFragment('default');

        const getFragmentText = (frag: Y.XmlFragment) => {
          try {
            return frag.toJSON().replace(/<[^>]+>/g, '').trim();
          } catch { return ''; }
        };

        const blocksText = getFragmentText(blocksFrag);
        const defaultText = getFragmentText(defaultFrag);

        let chosenFragment = 'blocks' as const;
        let chosenFragObj = blocksFrag;

        if (blocksText.length === 0 && defaultText.length > 0) {
          logger.warn('[YjsDoc] Legacy content detected in "default". Switching to default fragment.');
          chosenFragment = 'default';
          chosenFragObj = defaultFrag;
        }

        // Update Singleton
        singleton.syncedOnce = true;
        singleton.activeFragmentName = chosenFragment;
        singleton.fragment = chosenFragObj;

        // If this update is for the CURRENT note, update UI State immediately
        if (payload.noteId === noteId) {
          setActiveFragmentName(chosenFragment);
          yXmlFragmentRef.current = chosenFragObj;
        }

      } else {
        logger.debug('[YjsDoc] Initial sync skipped: empty update');
        singleton.syncedOnce = true;
      }
    } catch (error) {
      logger.error('[YjsDoc] Failed to apply initial sync:', error);
    } finally {
      setIsSyncing(false);
      isLocalUpdateRef.current = false;
    }
  }, [noteId, activeFragmentName]);

  /**
   * 应用远程更新
   */
  const applyRemoteUpdate = useCallback((payload: YjsUpdatePayload) => {
    // [FIX] CRITICAL: Lookup correct doc by noteId
    const singleton = ydocSingletons.get(payload.noteId);
    if (!singleton) {
      logger.warn('[YjsDoc] Cannot apply remote update: doc not found for', payload.noteId);
      return;
    }

    try {
      isLocalUpdateRef.current = true;
      const update = base64Utils.decode(payload.update);
      if (update.byteLength > 0) {
        Y.applyUpdate(singleton.doc, update, 'remote');
        logger.debug('[YjsDoc] Remote update applied to', payload.noteId, 'size:', update.byteLength);
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

  // [FIX] Detect if we have data to render (to prevent placeholder flash)
  const hasData = yXmlFragmentRef.current && yXmlFragmentRef.current.length > 0;

  return {
    ydoc: ydocRef.current,
    yXmlFragment: yXmlFragmentRef.current,
    activeFragmentName,
    isInitialized,
    isSyncing,
    hasData: !!hasData,
    applyRemoteUpdate,
    applyInitialSync,
    getStateAsBase64,
  };
}
