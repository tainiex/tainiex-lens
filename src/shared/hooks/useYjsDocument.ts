/**
 * Y.js 文档管理 Hook (Refactored to use YDocManager Service)
 * 纯粹的 View Model，负责连接 React 组件与 YDocManager
 */

import { useEffect, useState, useCallback } from 'react';
import { yDocManager } from '../services/YDocManager';
import type { YjsSyncPayload, YjsUpdatePayload } from '../types/collaboration';
import { base64Utils } from '../utils/base64';
import * as Y from 'yjs'; // For Type Defs

interface UseYjsDocumentOptions {
    noteId: string | null;
    onLocalUpdate?: (update: string) => void;
}

interface UseYjsDocumentReturn {
    ydoc: Y.Doc | null;
    yXmlFragment: Y.XmlFragment | null;
    activeFragmentName: 'blocks' | 'default';
    isInitialized: boolean;
    isSyncing: boolean; // Computed locally or from state
    isSynced: boolean; // [FIX] Expose sync status (syncedOnce)
    hasData: boolean;
    applyRemoteUpdate: (payload: YjsUpdatePayload) => void;
    applyInitialSync: (payload: YjsSyncPayload) => void;
    getStateAsBase64: () => string;
}

export function useYjsDocument({
    noteId,
    onLocalUpdate,
}: UseYjsDocumentOptions): UseYjsDocumentReturn {
    // Force re-render when Manager notifies us of changes (e.g. fragment switch, sync complete)
    const [, setTick] = useState(0);
    const forceUpdate = useCallback(() => setTick(t => t + 1), []);

    // Bridge the global Send Callback from Manager to the Component's Prop
    // [NOTE] This is a bit of a hack. Ideally Manager talks to SocketService directly.
    // But for now, we route it: Manager -> Hook -> onLocalUpdate -> Component -> SocketHook -> Emit
    useEffect(() => {
        yDocManager.setSendUpdateCallback((_targetNoteId, update) => {
            // Only trigger if this hook is responsible for THIS note
            // (Though Manager is global, so this callback is global replacement)
            // We just need to make sure onLocalUpdate is valid.
            if (onLocalUpdate) {
                onLocalUpdate(update);
            }
        });
    }, [onLocalUpdate]);

    // Get current state from Manager (Synchronous)
    const state = noteId ? yDocManager.getOrCreate(noteId) : null;

    // Subscribe to changes
    useEffect(() => {
        if (!noteId) return;
        return yDocManager.subscribe(noteId, forceUpdate);
    }, [noteId, forceUpdate]);

    const applyInitialSync = useCallback((payload: YjsSyncPayload) => {
        yDocManager.applyInitialSync(payload);
    }, []);

    const applyRemoteUpdate = useCallback((payload: YjsUpdatePayload) => {
        yDocManager.applyRemoteUpdate(payload);
    }, []);

    const getStateAsBase64 = useCallback((): string => {
        if (!state) return '';
        return base64Utils.encode(Y.encodeStateAsUpdate(state.doc));
    }, [state]);

    // Derived State
    const hasData = state ? state.fragment.length > 0 : false;

    return {
        ydoc: state?.doc || null,
        yXmlFragment: state?.fragment || null,
        activeFragmentName: state?.activeFragmentName || 'blocks',
        isInitialized: !!state,
        isSyncing: false,
        isSynced: state?.syncedOnce || false, // [FIX]
        hasData,
        applyRemoteUpdate,
        applyInitialSync,
        getStateAsBase64,
    };
}
