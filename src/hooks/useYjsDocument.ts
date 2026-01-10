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



export function useYjsDocument(options: UseYjsDocumentOptions): UseYjsDocumentReturn {
  const { noteId, onLocalUpdate } = options;

  const ydocRef = useRef<Y.Doc | null>(null);
  const yXmlFragmentRef = useRef<Y.XmlFragment | null>(null);
  const isLocalUpdateRef = useRef(false);
  const onLocalUpdateRef = useRef(onLocalUpdate);

  const [isSyncing, setIsSyncing] = useState(false);

  // 保持 callback ref 最新
  useEffect(() => {
    onLocalUpdateRef.current = onLocalUpdate;
  }, [onLocalUpdate]);

  /**
   * [FIX] Track active fragment name to force UI remount on switch
   */
  const [activeFragmentName, setActiveFragmentName] = useState<'blocks' | 'default'>('blocks');

  /**
   * [FIX] Initialize Y.Doc synchronously to prevent race conditions
   * We use a ref to hold the singleton instance per noteId to persist across renders,
   * but we initialize it immediately if missing for the current noteId.
   */
  if (!ydocRef.current || (noteId && ydocRef.current.guid !== noteId)) {
    if (ydocRef.current) {
      ydocRef.current.destroy();
    }

    if (noteId) {
      logger.debug('[YjsDoc] Initializing Y.Doc synchronously for:', noteId);
      const doc = new Y.Doc({ guid: noteId });
      const fragment = doc.getXmlFragment('blocks');

      // Setup listener immediately
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        // We need to access the LATEST ref, but this closure is created once.
        // That's fine as long as onLocalUpdateRef is stable (which it is).
        if (origin === 'remote' || isLocalUpdateRef.current) return;
        const base64Update = base64Utils.encode(update);
        onLocalUpdateRef.current?.(base64Update);
      });

      ydocRef.current = doc;
      yXmlFragmentRef.current = fragment;
    } else {
      ydocRef.current = null;
      yXmlFragmentRef.current = null;
    }
  }

  // Effect for cleanup only
  useEffect(() => {
    return () => {
      if (ydocRef.current && !noteId) { // Only destroy if unmounting or noteId became null
        // Actually, we handle destruction in the synchronous block above when noteId changes.
        // We only need to destroy on FINAL unmount.
      }
    };
  }, []);

  // On unmount of the hook
  useEffect(() => {
    return () => {
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
    }
  }, []); // Run once on unmount

  // We don't need isInitialized anymore as it's sync
  const isInitialized = !!ydocRef.current;

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
      // [FIX] Read from 'update' property as per guide, fallback to 'state'
      const updateData = payload.update || (payload as any).state;
      const update = base64Utils.decode(updateData);

      if (update.byteLength > 0) {
        Y.applyUpdate(ydoc, update, 'remote');
        logger.debug('[YjsDoc] Initial sync applied, size:', update.byteLength);




        // [FIX] Smart Fragment Selection
        const blocksFrag = ydoc.getXmlFragment('blocks');
        const defaultFrag = ydoc.getXmlFragment('default');

        const getFragmentText = (frag: Y.XmlFragment) => {
          try {
            return frag.toJSON().replace(/<[^>]+>/g, '').trim();
          } catch {
            return '';
          }
        };

        const blocksText = getFragmentText(blocksFrag);
        const defaultText = getFragmentText(defaultFrag);

        if (blocksText.length === 0 && defaultText.length > 0) {
          logger.warn('[YjsDoc] Legacy content detected in "default". Migrating to Tiptap "blocks".');

          /* [DEBUG] Disable Migration temporarily to check if it causes "Extra Blank Line"
          // [MIGRATION] Convert legacy text to Tiptap Node Structure
          ydoc.transact(() => {
            const blocks = ydoc.getXmlFragment('blocks');
            const p = new Y.XmlElement('paragraph');
            // Insert text into paragraph
            const text = new Y.XmlText(defaultText);
            p.insert(0, [text]);
            blocks.insert(0, [p]);
          });
          */

          // Use 'blocks' fragment (now populated)
          yXmlFragmentRef.current = blocksFrag;
          setActiveFragmentName('blocks');
        } else {
          yXmlFragmentRef.current = blocksFrag;
          setActiveFragmentName('blocks');
        }
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
