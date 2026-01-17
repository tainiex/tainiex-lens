import * as Y from 'yjs';
import { logger } from '../utils/logger';
import { base64Utils } from '../utils/base64';
import type { YjsSyncPayload, YjsUpdatePayload } from '../types/collaboration';

interface YDocState {
    doc: Y.Doc;
    fragment: Y.XmlFragment;
    activeFragmentName: 'blocks' | 'default';
    syncedOnce: boolean;
    // Local Listeners (to notify React hooks of changes)
    listeners: Set<() => void>;
}

/**
 * YDocManager (Singleton Service)
 *
 * Creates a fortress around Y.js data logic, completely decoupling it
 * from React Component lifecycle volatility.
 */
class YDocManager {
    private static instance: YDocManager;
    private states = new Map<string, YDocState>();

    // Callback to emit updates to Socket (injected by UI/app)
    private sendUpdateCallback: ((noteId: string, update: string) => void) | null = null;

    private constructor() {}

    public static getInstance(): YDocManager {
        if (!YDocManager.instance) {
            YDocManager.instance = new YDocManager();
        }
        return YDocManager.instance;
    }

    /**
     * Inject the transport layer sender
     */
    public setSendUpdateCallback(cb: (noteId: string, update: string) => void) {
        this.sendUpdateCallback = cb;
    }

    /**
     * Get or Create a Y.Doc for a note
     */
    public getOrCreate(noteId: string): YDocState {
        let state = this.states.get(noteId);

        if (!state) {
            logger.debug('[YDocManager] Creating Y.Doc for:', noteId);
            const doc = new Y.Doc({ guid: noteId });
            const fragment = doc.getXmlFragment('blocks');

            state = {
                doc,
                fragment,
                activeFragmentName: 'blocks',
                syncedOnce: false,
                listeners: new Set(),
            };

            // Bind local update listener immediately
            doc.on('update', (update: Uint8Array, origin: unknown) => {
                this.handleLocalDocUpdate(noteId, update, origin);
            });

            this.states.set(noteId, state);
        }

        return state;
    }

    /**
     * Handle updates generated locally (e.g. by Tiptap)
     */
    private handleLocalDocUpdate(noteId: string, update: Uint8Array, origin: unknown) {
        if (origin === 'remote') return;

        const state = this.states.get(noteId);
        if (!state) return;

        // [STRICT GATE] Block updates before initial sync
        if (!state.syncedOnce) {
            logger.warn('[YDocManager] Blocked local update before initial sync for:', noteId);
            return;
        }

        if (this.sendUpdateCallback) {
            const base64 = base64Utils.encode(update);
            this.sendUpdateCallback(noteId, base64);
        }
    }

    /**
     * Handle 'yjs:sync' from server
     */
    public applyInitialSync(payload: YjsSyncPayload) {
        // Precise Routing: Get specific state for this note
        const state = this.states.get(payload.noteId);
        if (!state) {
            // Safe to ignore if we haven't opened this note yet
            // logger.debug('[YDocManager] Received sync for unopened note:', payload.noteId);
            return;
        }

        if (state.syncedOnce) {
            logger.debug('[YDocManager] Already synced:', payload.noteId);
            this.notifyListeners(state); // Ensure UI matches state
            return;
        }

        logger.debug('[YDocManager] Applying sync:', payload.noteId);

        try {
            const updateData = payload.update || (payload as any).state;
            const update = base64Utils.decode(updateData);

            if (update.byteLength > 0) {
                Y.applyUpdate(state.doc, update, 'remote');

                // Smart Fragment Selection
                const blocksFrag = state.doc.getXmlFragment('blocks');
                const defaultFrag = state.doc.getXmlFragment('default');

                const getLen = (f: Y.XmlFragment) => {
                    try {
                        return f
                            .toJSON()
                            .replace(/<[^>]+>/g, '')
                            .trim().length;
                    } catch {
                        return 0;
                    }
                };

                if (getLen(blocksFrag) === 0 && getLen(defaultFrag) > 0) {
                    logger.warn('[YDocManager] Legacy content detected. Switching to default.');
                    state.activeFragmentName = 'default';
                    state.fragment = defaultFrag;
                }

                state.syncedOnce = true;
                this.notifyListeners(state);
            } else {
                state.syncedOnce = true;
                this.notifyListeners(state); // Notify even if empty, to confirm sync complete
            }
        } catch (e) {
            logger.error('[YDocManager] Sync failed:', e);
        }
    }

    /**
     * Handle 'yjs:update' from server
     */
    public applyRemoteUpdate(payload: YjsUpdatePayload) {
        const state = this.states.get(payload.noteId);
        if (!state) return;

        try {
            const update = base64Utils.decode(payload.update);
            if (update.byteLength > 0) {
                Y.applyUpdate(state.doc, update, 'remote');
                // No need to notify listeners explicitly, Y.js events drive Tiptap
            }
        } catch (e) {
            logger.error('[YDocManager] Update failed:', e);
        }
    }

    /**
     * Subscribe to state changes (fragment switching, sync status)
     */
    public subscribe(noteId: string, callback: () => void): () => void {
        const state = this.states.get(noteId);
        if (state) {
            state.listeners.add(callback);
            return () => state.listeners.delete(callback);
        }
        return () => {};
    }

    private notifyListeners(state: YDocState) {
        state.listeners.forEach(cb => cb());
    }
}

export const yDocManager = YDocManager.getInstance();
