import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { yDocManager } from './YDocManager';
import { base64Utils } from '../utils/base64';
import type { YjsSyncPayload, YjsUpdatePayload } from '../types/collaboration';

describe('YDocManager', () => {
    let sendUpdateCallback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sendUpdateCallback = vi.fn();
        yDocManager.setSendUpdateCallback(sendUpdateCallback);
    });

    describe('getOrCreate', () => {
        it('should create new Y.Doc for new noteId', () => {
            const noteId = 'test-note-1';
            const state = yDocManager.getOrCreate(noteId);

            expect(state.doc).toBeInstanceOf(Y.Doc);
            expect(state.fragment).toBeInstanceOf(Y.XmlFragment);
            expect(state.activeFragmentName).toBe('blocks');
            expect(state.syncedOnce).toBe(false);
        });

        it('should return existing state for same noteId', () => {
            const noteId = 'test-note-2';
            const state1 = yDocManager.getOrCreate(noteId);
            const state2 = yDocManager.getOrCreate(noteId);

            expect(state1).toBe(state2);
        });

        it('should use noteId as Y.Doc guid', () => {
            const noteId = 'test-note-guid';
            const state = yDocManager.getOrCreate(noteId);

            expect(state.doc.guid).toBe(noteId);
        });
    });

    describe('applyInitialSync', () => {
        it('should apply initial sync with valid update', () => {
            const noteId = 'test-note-sync';
            yDocManager.getOrCreate(noteId);

            // Create a dummy update
            const doc = new Y.Doc();
            const fragment = doc.getXmlFragment('blocks');
            fragment.insert(0, [new Y.XmlText('Hello')]);
            const update = Y.encodeStateAsUpdate(doc);
            const base64Update = base64Utils.encode(update);
            const stateVector = base64Utils.encode(Y.encodeStateVector(doc));

            const payload: YjsSyncPayload = {
                noteId,
                update: base64Update,
                stateVector,
            };

            yDocManager.applyInitialSync(payload);

            const state = yDocManager.getOrCreate(noteId);
            expect(state.syncedOnce).toBe(true);
        });

        it('should mark syncedOnce even with empty update', () => {
            const noteId = 'test-note-empty';
            yDocManager.getOrCreate(noteId);

            const emptyDoc = new Y.Doc();
            const payload: YjsSyncPayload = {
                noteId,
                update: '',
                stateVector: base64Utils.encode(Y.encodeStateVector(emptyDoc)),
            };

            yDocManager.applyInitialSync(payload);

            const state = yDocManager.getOrCreate(noteId);
            expect(state.syncedOnce).toBe(true);
        });

        it('should not apply sync twice', () => {
            const noteId = 'test-note-double-sync';
            const state = yDocManager.getOrCreate(noteId);

            const emptyDoc = new Y.Doc();
            const payload: YjsSyncPayload = {
                noteId,
                update: '',
                stateVector: base64Utils.encode(Y.encodeStateVector(emptyDoc)),
            };

            // First sync
            yDocManager.applyInitialSync(payload);
            expect(state.syncedOnce).toBe(true);

            // Second sync (should be ignored, syncedOnce stays true)
            yDocManager.applyInitialSync(payload);
            expect(state.syncedOnce).toBe(true);
        });
    });

    describe('applyRemoteUpdate', () => {
        it('should apply remote update', () => {
            const noteId = 'test-note-remote';
            yDocManager.getOrCreate(noteId);

            const emptyDoc = new Y.Doc();
            const syncPayload: YjsSyncPayload = {
                noteId,
                update: '',
                stateVector: base64Utils.encode(Y.encodeStateVector(emptyDoc)),
            };
            yDocManager.applyInitialSync(syncPayload);

            // Create an update
            const doc = new Y.Doc();
            const fragment = doc.getXmlFragment('blocks');
            fragment.insert(0, [new Y.XmlText('Update')]);
            const update = Y.encodeStateAsUpdate(doc);
            const base64Update = base64Utils.encode(update);

            const updatePayload: YjsUpdatePayload = {
                noteId,
                update: base64Update,
            };

            yDocManager.applyRemoteUpdate(updatePayload);

            // Verify update was applied (doc should have content)
            const state = yDocManager.getOrCreate(noteId);
            expect(state.fragment.length).toBeGreaterThan(0);
        });

        it('should ignore update for unopened note', () => {
            // Should not throw error
            expect(() => {
                const updatePayload: YjsUpdatePayload = {
                    noteId: 'nonexistent-note',
                    update: '',
                };
                yDocManager.applyRemoteUpdate(updatePayload);
            }).not.toThrow();
        });
    });

    describe('subscribe', () => {
        it('should call listener on state changes', () => {
            const noteId = 'test-note-subscribe';
            yDocManager.getOrCreate(noteId);

            const listener = vi.fn();
            yDocManager.subscribe(noteId, listener);

            const emptyDoc = new Y.Doc();
            const payload: YjsSyncPayload = {
                noteId,
                update: '',
                stateVector: base64Utils.encode(Y.encodeStateVector(emptyDoc)),
            };

            // Trigger sync to notify listeners
            yDocManager.applyInitialSync(payload);

            expect(listener).toHaveBeenCalled();
        });

        it('should return unsubscribe function', () => {
            const noteId = 'test-note-unsubscribe';
            yDocManager.getOrCreate(noteId);

            const listener = vi.fn();
            const unsubscribe = yDocManager.subscribe(noteId, listener);

            const emptyDoc = new Y.Doc();
            const payload: YjsSyncPayload = {
                noteId,
                update: '',
                stateVector: base64Utils.encode(Y.encodeStateVector(emptyDoc)),
            };

            yDocManager.applyInitialSync(payload);
            expect(listener).toHaveBeenCalledTimes(1);

            // Unsubscribe
            unsubscribe();
            listener.mockClear();

            const updatePayload: YjsUpdatePayload = {
                noteId,
                update: '',
            };
            yDocManager.applyRemoteUpdate(updatePayload);
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('local update gate', () => {
        it('should block local updates before initial sync', () => {
            const noteId = 'test-note-gate';
            const state = yDocManager.getOrCreate(noteId);

            // Try to make a local change before sync
            const fragment = state.fragment;
            fragment.insert(0, [new Y.XmlText('Local change')]);

            // Wait a bit for potential async update
            setTimeout(() => {
                // Should not send update
                expect(sendUpdateCallback).not.toHaveBeenCalled();
            }, 50);
        });
    });
});
