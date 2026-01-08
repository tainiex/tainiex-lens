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
  activeFragmentName: 'blocks' | 'default';
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
      logger.debug('[base64Utils] No base64 string provided (new note?)');
      return new Uint8Array(0);
    }
    if (typeof base64 !== 'string') {
      logger.warn('[base64Utils] Invalid base64 type:', typeof base64);
      return new Uint8Array(0);
    }
    try {
      // [FIX] Make Base64 decode robust:
      // 1. Remove whitespace (newlines usually cause atob failure)
      // 2. Convert URL-safe chars (-_) to standard (+/)
      // 3. Add padding if needed
      let cleanBase64 = base64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (cleanBase64.length % 4) {
        cleanBase64 += '=';
      }

      const binary = atob(cleanBase64);
      const len = binary.length;
      const uint8Array = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        uint8Array[i] = binary.charCodeAt(i);
      }
      return uint8Array;
    } catch (error) {
      logger.error('[base64Utils] Failed to decode base64:', error);
      // Fallback: If atob completely fails, return empty to prevent crash
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
   * [FIX] Track active fragment name to force UI remount on switch
   */
  const [activeFragmentName, setActiveFragmentName] = useState<'blocks' | 'default'>('blocks');

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
    // [FIX] Use 'blocks' to match backend expectation
    const yXmlFragment = ydoc.getXmlFragment('blocks');
    console.log('[DEBUG_TRACE] [INIT] Y.Doc initialized. Fragment "blocks" created.');

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
      console.log('[DEBUG_TRACE] [WRITE] Local (Editor) Change Detected:', update.byteLength, 'bytes');

      // [DEBUG] Dump the entire doc structure to see where data is
      console.log('[DEBUG_TRACE] Y.Doc Structure:', JSON.stringify(ydoc.toJSON(), null, 2));

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
      // [FIX] Read from 'update' property as per guide, fallback to 'state'
      const updateData = payload.update || (payload as any).state;
      console.log('[DEBUG_TRACE] [READ] Processing Initial Sync. Raw Payload Keys:', Object.keys(payload));
      console.log('[DEBUG_TRACE] [READ] Update Data (First 50 chars):', updateData?.substring(0, 50));

      const update = base64Utils.decode(updateData);
      console.log('[DEBUG_TRACE] [READ] Decoded Sync Update size:', update.byteLength, 'bytes');
      console.log('[DEBUG_TRACE] [READ] Decoded First 10 bytes:', Array.from(update.slice(0, 10)));

      if (update.byteLength > 0) {
        Y.applyUpdate(ydoc, update, 'remote');
        logger.debug('[YjsDoc] Initial sync applied, size:', update.byteLength);

        // [DEBUG] Dump structure AFTER sync
        console.log('[DEBUG_TRACE] [READ] Y.Doc Structure AFTER Sync:', JSON.stringify(ydoc.toJSON(), null, 2));
        const blocks = ydoc.getXmlFragment('blocks');
        console.log('[DEBUG_TRACE] [READ] Blocks Fragment content:', blocks.toJSON());

        // [DEBUG] Check for Pending Structs (Missing Dependencies)
        // Access internal store more robustly
        // @ts-ignore
        const store = ydoc.store;
        const pendingStructs = store.pendingStructs;
        const pendingDs = store.pendingDs;

        const getMapSize = (m: any) => m ? (m.size !== undefined ? m.size : Object.keys(m).length) : 0;
        const pendingStructsSize = getMapSize(pendingStructs);
        const pendingDsSize = getMapSize(pendingDs);

        console.log(`[DEBUG_TRACE] [READ] Pending Structs: ${pendingStructsSize}, Pending Delete Set: ${pendingDsSize}`);

        if (pendingStructsSize > 0) {
          console.warn('[DEBUG_TRACE] [CRITICAL] Update incomplete! Missing dependencies found.');
          // Access missing clients
          if (pendingStructs && pendingStructs.missing) {
            console.log('[DEBUG_TRACE] Missing Clients:', Array.from(pendingStructs.missing.keys()));
          }
        }

        // [DEBUG] Deep Content Inspection
        const inspectFragment = (name: string, frag: Y.XmlFragment) => {
          console.log(`[DEBUG_TRACE] [INSPECT] Inspecting Fragment: ${name}`);
          const length = frag.length;
          console.log(`[DEBUG_TRACE] [INSPECT] Fragment Length (Item Count): ${length}`);

          // ToArray creates Y.XmlText or Y.XmlElement wrappers
          const children = frag.toArray();
          children.forEach((child, index) => {
            const type = child.constructor.name;
            const str = child.toString();
            const json = child.toJSON();
            console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] Type: ${type}`);
            console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] toString: "${str}"`);
            console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] toJSON: ${json}`);

            if (type === 'XmlElement') {
              // Deep inspect element
              const element = child as Y.XmlElement;
              console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] NodeName: ${element.nodeName}`);
              console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] Inner Length: ${element.length}`);
              if (element.length > 0) {
                // Check first child of element
                const grandChild = element.get(0);
                console.log(`[DEBUG_TRACE] [INSPECT] Child [${index}] -> First Grandchild: ${grandChild.constructor.name} "${grandChild.toString()}"`);
              }
            }
          });
        };

        // [DEBUG] Check Shared Types
        const sharedKeys = Array.from(ydoc.share.keys());
        console.log('[DEBUG_TRACE] [READ] Y.Doc Shared Types:', sharedKeys);

        // [DEBUG] Check content of ALL shared types
        sharedKeys.forEach(key => {
          try {
            // Try as XmlFragment first (most likely for Tiptap)
            const fragment = ydoc.getXmlFragment(key);
            console.log(`[DEBUG_TRACE] [READ] Fragment "${key}" content:`, fragment.toJSON());
          } catch (e) {
            console.log(`[DEBUG_TRACE] [READ] Fragment "${key}" inspect failed:`, e);
          }
        });
        // [FIX] Smart Fragment Selection
        // Check if data is hiding in 'default' instead of 'blocks'
        const blocksFrag = ydoc.getXmlFragment('blocks');
        const defaultFrag = ydoc.getXmlFragment('default');

        inspectFragment('blocks', blocksFrag);
        inspectFragment('default', defaultFrag);

        const getFragmentText = (frag: Y.XmlFragment) => {
          try {
            // Simple heuristic: remove tags and whitespace
            return frag.toJSON().replace(/<[^>]+>/g, '').trim();
          } catch {
            return '';
          }
        };

        const blocksText = getFragmentText(blocksFrag);
        const defaultText = getFragmentText(defaultFrag);

        console.log(`[DEBUG_TRACE] [SMART_SELECT] Blocks Text Length: ${blocksText.length}, Default Text Length: ${defaultText.length}`);

        if (blocksText.length === 0 && defaultText.length > 0) {
          console.log('[DEBUG_TRACE] [SMART_SELECT] Legacy content detected in "default". Migrating to Tiptap "blocks".');

          // [MIGRATION] Convert legacy text to Tiptap Node Structure
          ydoc.transact(() => {
            const blocks = ydoc.getXmlFragment('blocks');
            const p = new Y.XmlElement('paragraph');
            // Insert text into paragraph
            const text = new Y.XmlText(defaultText);
            p.insert(0, [text]);
            blocks.insert(0, [p]);
          });

          // Use 'blocks' fragment (now populated)
          yXmlFragmentRef.current = blocksFrag;
          setActiveFragmentName('blocks');
        } else {
          console.log('[DEBUG_TRACE] [SMART_SELECT] Using standard "blocks" fragment.');
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
    activeFragmentName,
    isInitialized,
    isSyncing,
    applyRemoteUpdate,
    applyInitialSync,
    getStateAsBase64,
  };
}

export { base64Utils };