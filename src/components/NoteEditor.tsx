/**
 * 协同笔记编辑器组件
 * Collaborative Note Editor Component
 *
 * 基于 Tiptap + Y.js 的实时协同编辑器
 */

import DropCursor from '@tiptap/extension-dropcursor';
import UniqueID from '@tiptap/extension-unique-id';
import { NodeSelection } from '@tiptap/pm/state';
import { GlobalDragState } from '../utils/dragState';

import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
// import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Collaboration from '@tiptap/extension-collaboration';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import Gapcursor from '@tiptap/extension-gapcursor';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
// Import CellSelection for precise table selection check
import { CellSelection } from '@tiptap/pm/tables';
import React, { useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import * as Y from 'yjs';
import { useCollaborationSocket, useYjsDocument, logger } from '@/shared';
import type {
    YjsSyncPayload,
    YjsUpdatePayload,
    CursorUpdatePayload,
    PresenceUser,
    CollaborationLimitPayload,
} from '@/shared';
import './NoteEditor.css';

import { IUser } from '@tainiex/shared-atlas';
import PageHeader from './PageHeader';
import { SlashCommand, getSuggestionItems, renderItems } from './editor/extensions/SlashCommand';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { CodeBlockComponent } from './editor/CodeBlockComponent';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TextBubbleMenu } from './editor/TextBubbleMenu';
import { GlobalDragHandle } from './editor/GlobalDragHandle';
import Image from '@tiptap/extension-image';
import { UploadService } from '../utils/uploadService';
import { refreshExpiringImages } from '../utils/imageUrlRefresher';
// import { toast } from 'sonner'; // Removed unused and missing module

// Initialize lowlight with common languages
const lowlight = createLowlight(common);

interface NoteEditorProps {
    noteId: string | null;
    title?: string;
    initialContent?: string;
    onChange?: (content: string) => void;
    onTitleChange?: (title: string) => void;
    user: IUser | null;
    editable?: boolean;
    onMobileMenuClick?: () => void;
    isLoading?: boolean;
}

// 内部 Tiptap 编辑器组件

// [FIX] Custom Table Extension for Mobile Scrolling
const CustomTable = Table.extend({
    renderHTML({ HTMLAttributes }) {
        return ['div', { class: 'tableWrapper' }, ['table', HTMLAttributes, 0]];
    },
});

// [NEW] Custom Image Extension with GCS Path and Expiration Tracking
const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),

            // GCS internal path (for URL refresh)
            path: {
                default: null,
                parseHTML: element => element.getAttribute('data-path'),
                renderHTML: attributes => {
                    if (!attributes.path) return {};
                    return { 'data-path': attributes.path };
                },
            },

            // URL expiration timestamp (Unix milliseconds)
            expiresAt: {
                default: null,
                parseHTML: element => {
                    const value = element.getAttribute('data-expires-at');
                    return value ? parseInt(value, 10) : null;
                },
                renderHTML: attributes => {
                    if (!attributes.expiresAt) return {};
                    return { 'data-expires-at': String(attributes.expiresAt) };
                },
            },
        };
    },
});

const TiptapEditor = ({
    ydoc,
    fragment,
    initialContent,
    editable,
    isLimitReached,
    onChange,
    sendCursorUpdate,
    // presenceUsers,
    isSyncing,
    noteId,
    onReady,
    hasData,
}: {
    ydoc: Y.Doc;
    fragment: Y.XmlFragment;
    initialContent: string | undefined;
    editable: boolean;
    isLimitReached: boolean;
    onChange?: (content: string) => void;
    sendCursorUpdate: (cursor: any) => void;
    presenceUsers: PresenceUser[];
    isSyncing: boolean;
    noteId: string | null;
    onReady?: () => void;
    hasData: boolean;
    isLoading?: boolean;
}) => {
    const [isReadyCalled, setIsReadyCalled] = useState(false);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const editor = useEditor({
        extensions: [
            UniqueID.configure({
                types: [
                    'heading',
                    'paragraph',
                    'bulletList',
                    'orderedList',
                    'listItem',
                    'taskList',
                    'taskItem',
                    'blockquote',
                    'codeBlock',
                    'table',
                    'tableRow',
                    'tableHeader',
                    'tableCell',
                ],
            }),
            Document,
            DropCursor.configure({
                color: '#007bff', // Or var(--primary-color)
                width: 2,
            }),
            Paragraph,
            Text,
            Bold,
            Italic,
            Strike,
            Heading,
            BulletList,
            OrderedList,
            ListItem,
            TaskList.configure({
                itemTypeName: 'taskItem',
                HTMLAttributes: {
                    class: 'task-list',
                },
            }),
            TaskItem.configure({
                nested: true,
                HTMLAttributes: {
                    class: 'task-item',
                },
            }),
            CodeBlockLowlight.configure({
                lowlight,
            }).extend({
                addNodeView() {
                    return ReactNodeViewRenderer(CodeBlockComponent);
                },
            }),
            Blockquote,
            CustomTable.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            Gapcursor,
            BubbleMenuExtension.configure({
                pluginKey: 'bubbleMenuTable',
            }),
            TextStyle,
            Color,
            Code,
            Link.configure({
                openOnClick: false,
            }),
            Placeholder.configure({
                placeholder: 'Start writing your note...',
            }),
            Collaboration.configure({
                document: ydoc,
                fragment: fragment, // [FIX] Use dynamic fragment passed from hook
            }),
            CustomImage.configure({
                inline: false,
                allowBase64: true, // Allow base64 for immediate feedback if needed, but we prefer upload
            }),
            SlashCommand.configure({
                suggestion: {
                    items: getSuggestionItems,
                    render: renderItems,
                },
            }),
        ],
        content: initialContent,
        editable: editable && !isLimitReached,
        onCreate: ({ editor }) => {
            // [FIX] Smart Loading Strategy:
            // 1. If hasData is false (New Note), show immediately.
            // 2. If hasData is true (Existing Note), wait for content to render.
            if (!hasData || !editor.isEmpty) {
                // Defer to avoid "Cannot update component while rendering"
                setTimeout(() => {
                    if (isMounted.current) {
                        onReady?.();
                        setIsReadyCalled(true);
                    }
                }, 0);
            }
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());

            // If we were waiting for data, and now we have it (or editor updated), show it.
            if (!isReadyCalled) {
                setTimeout(() => {
                    if (isMounted.current) {
                        onReady?.();
                        setIsReadyCalled(true);
                    }
                }, 0);
            }
        },
        onSelectionUpdate: ({ editor }) => {
            if (!noteId) return;
            const { from, to } = editor.state.selection;
            sendCursorUpdate({
                position: from,
                selectionStart: from,
                selectionEnd: to,
            });
        },
        onBlur: () => {
            sendCursorUpdate(null);
        },
        editorProps: {
            attributes: {
                class: 'tiptap-editor-content',
            },
            handlePaste: (view, event, _slice) => {
                const items = Array.from(event.clipboardData?.items || []);
                const item = items.find(item => item.type.indexOf('image') === 0);

                if (item && noteId) {
                    event.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const pos = view.state.selection.from;

                        // Optimistic UI: Insert blob URL immediately
                        const blobUrl = URL.createObjectURL(file);
                        const transaction = view.state.tr.insert(
                            pos,
                            view.state.schema.nodes.image.create({ src: blobUrl })
                        );
                        view.dispatch(transaction);

                        UploadService.uploadNoteImage(noteId, file)
                            .then(response => {
                                // Find and update the node with full metadata
                                let tr = view.state.tr;
                                let found = false;
                                view.state.doc.descendants((node, pos) => {
                                    if (
                                        !found &&
                                        node.type.name === 'image' &&
                                        node.attrs.src === blobUrl
                                    ) {
                                        tr = tr.setNodeMarkup(pos, undefined, {
                                            src: response.url,
                                            path: response.path,
                                            expiresAt: response.expiresAt,
                                        });
                                        found = true;
                                    }
                                });
                                if (found) {
                                    view.dispatch(tr);
                                    URL.revokeObjectURL(blobUrl);
                                }
                            })
                            .catch(err => {
                                logger.error('Failed to upload pasted image', err);
                                alert('Failed to upload image: ' + err.message);
                                // Remove failed node
                                let tr = view.state.tr;
                                let found = false;
                                view.state.doc.descendants((node, pos) => {
                                    if (
                                        !found &&
                                        node.type.name === 'image' &&
                                        node.attrs.src === blobUrl
                                    ) {
                                        tr = tr.delete(pos, pos + node.nodeSize);
                                        found = true;
                                    }
                                });
                                if (found) view.dispatch(tr);
                            });

                        return true;
                    }
                }
                return false;
            },
            handleDrop: (view, event, _slice, moved) => {
                // Check if this is a file drop (images) first
                const hasFiles =
                    event.dataTransfer &&
                    event.dataTransfer.files &&
                    event.dataTransfer.files.length > 0;

                // 1. Handle File Drop (Images) - priority check
                if (!moved && hasFiles && noteId) {
                    const file = event.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        event.preventDefault();

                        const coordinates = view.posAtCoords({
                            left: event.clientX,
                            top: event.clientY,
                        });
                        if (!coordinates) return false;

                        // Optimistic UI
                        const blobUrl = URL.createObjectURL(file);
                        const transaction = view.state.tr.insert(
                            coordinates.pos,
                            view.state.schema.nodes.image.create({ src: blobUrl })
                        );
                        view.dispatch(transaction);

                        UploadService.uploadNoteImage(noteId, file)
                            .then(response => {
                                // Find and update with full metadata
                                let tr = view.state.tr;
                                let found = false;
                                view.state.doc.descendants((node, pos) => {
                                    if (
                                        !found &&
                                        node.type.name === 'image' &&
                                        node.attrs.src === blobUrl
                                    ) {
                                        tr = tr.setNodeMarkup(pos, undefined, {
                                            src: response.url,
                                            path: response.path,
                                            expiresAt: response.expiresAt,
                                        });
                                        found = true;
                                    }
                                });
                                if (found) {
                                    view.dispatch(tr);
                                    URL.revokeObjectURL(blobUrl);
                                }
                            })
                            .catch(err => {
                                logger.error('Failed to upload dropped image', err);
                                alert('Failed to upload image: ' + err.message);
                                // Remove failed node
                                let tr = view.state.tr;
                                let found = false;
                                view.state.doc.descendants((node, pos) => {
                                    if (
                                        !found &&
                                        node.type.name === 'image' &&
                                        node.attrs.src === blobUrl
                                    ) {
                                        tr = tr.delete(pos, pos + node.nodeSize);
                                        found = true;
                                    }
                                });
                                if (found) view.dispatch(tr);
                            });
                        return true;
                    }
                }

                // 2. Handle Internal Block Move
                const dataTransferInternal =
                    event.dataTransfer?.getData('application/x-lens-drag') === 'true';
                const isInternal =
                    (GlobalDragState.isInternal && GlobalDragState.srcPos !== null) ||
                    dataTransferInternal;

                if (isInternal) {
                    let fromPos = GlobalDragState.srcPos;
                    if (fromPos === null && dataTransferInternal) {
                        const fromStr = event.dataTransfer?.getData('application/x-lens-from');
                        if (fromStr) fromPos = parseInt(fromStr, 10);
                    }

                    if (fromPos !== null) {
                        const coordinates = view.posAtCoords({
                            left: event.clientX,
                            top: event.clientY,
                        });

                        if (coordinates) {
                            event.preventDefault(); // Stop default copy behavior
                            event.stopPropagation(); // Prevent React handler from also processing

                            const toPos = coordinates.pos;
                            const tr = view.state.tr;
                            const doc = view.state.doc;
                            const node = doc.nodeAt(fromPos);

                            if (node) {
                                // Logic for moving:
                                // If we drop inside itself, do nothing?
                                if (toPos >= fromPos && toPos <= fromPos + node.nodeSize) {
                                    return true;
                                }

                                logger.debug('[DragDrop] Moving node from', fromPos, 'to', toPos);

                                // Determine insert position based on drag direction
                                let insertPos: number;
                                if (toPos < fromPos) {
                                    // Dragging up - insert before deleting
                                    insertPos = toPos;
                                    tr.insert(insertPos, node);
                                    // Delete source (adjust position because we inserted above)
                                    tr.delete(fromPos + node.nodeSize, fromPos + node.nodeSize * 2);
                                } else {
                                    // Dragging down - delete before inserting
                                    tr.delete(fromPos, fromPos + node.nodeSize);
                                    // Map destination after deletion
                                    insertPos = tr.mapping.map(toPos);
                                    tr.insert(insertPos, node);
                                }

                                logger.debug('[DragDrop] Inserted at position', insertPos);

                                // Set Selection to new pos (safely)
                                try {
                                    const insertedNode = tr.doc.nodeAt(insertPos);
                                    if (insertedNode) {
                                        tr.setSelection(NodeSelection.create(tr.doc, insertPos));
                                    }
                                } catch (e) {
                                    logger.warn('[DragDrop] Failed to create NodeSelection:', e);
                                }

                                view.dispatch(tr);

                                // Clear drag state to prevent React handler from processing
                                GlobalDragState.isInternal = false;
                                GlobalDragState.srcPos = null;

                                return true; // Handled
                            }
                        }
                    }
                }

                return false;
            },
        },
    });

    // [FIX] Safety Timeout: If for some reason Tiptap doesn't update (e.g. data is just whitespace), force show after 500ms
    useEffect(() => {
        if (!isReadyCalled) {
            const timer = setTimeout(() => {
                onReady?.();
                setIsReadyCalled(true);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isReadyCalled, onReady]);

    // [New] Handle Custom Image Upload Event from Slash Command
    useEffect(() => {
        if (!editor || !noteId) return;

        const handleUploadEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && detail.file) {
                const file = detail.file;
                const pos = detail.pos ?? editor.state.selection.from;

                // 1. Create Optimistic Blob URL
                const blobUrl = URL.createObjectURL(file);

                // 2. Insert Image immediately with Blob URL
                // We use chain to ensure we focus and insert correctly
                editor
                    .chain()
                    .insertContentAt(pos, { type: 'image', attrs: { src: blobUrl } })
                    .focus()
                    .run();

                // 3. Perform Upload
                UploadService.uploadNoteImage(noteId, file)
                    .then(response => {
                        // 4. Update the node with the real URL and metadata
                        let transaction = editor.state.tr;
                        let found = false;
                        editor.state.doc.descendants((node, pos) => {
                            if (
                                !found &&
                                node.type.name === 'image' &&
                                node.attrs.src === blobUrl
                            ) {
                                transaction = transaction.setNodeMarkup(pos, undefined, {
                                    src: response.url,
                                    path: response.path,
                                    expiresAt: response.expiresAt,
                                });
                                found = true;
                            }
                        });

                        if (found) {
                            editor.view.dispatch(transaction);
                            URL.revokeObjectURL(blobUrl);
                        }
                    })
                    .catch(err => {
                        logger.error('Failed to upload image from slash command', err);
                        alert('Failed to upload image: ' + err.message);

                        // Remove the failed image node
                        let transaction = editor.state.tr;
                        let found = false;
                        editor.state.doc.descendants((node, pos) => {
                            if (
                                !found &&
                                node.type.name === 'image' &&
                                node.attrs.src === blobUrl
                            ) {
                                transaction = transaction.delete(pos, pos + node.nodeSize);
                                found = true;
                            }
                        });
                        if (found) editor.view.dispatch(transaction);
                    });
            }
        };

        const dom = editor.view.dom;
        dom.addEventListener('editor:upload-image', handleUploadEvent);
        return () => {
            dom.removeEventListener('editor:upload-image', handleUploadEvent);
        };
    }, [editor, noteId]);

    // 同步可编辑状态
    useEffect(() => {
        if (editor) {
            editor.setEditable(editable && !isLimitReached);
        }
    }, [editor, editable, isLimitReached]);

    // [NEW] Automatic image URL refresh
    useEffect(() => {
        if (!editor) return;

        let isMounted = true;

        // 初始检查
        refreshExpiringImages(editor).catch(err => {
            if (isMounted) {
                logger.error('[NoteEditor] Initial image refresh failed:', err);
            }
        });

        // 每 2 分钟检查一次
        const intervalId = setInterval(
            () => {
                if (isMounted && editor && !editor.isDestroyed) {
                    refreshExpiringImages(editor).catch(err => {
                        if (isMounted) {
                            logger.error('[NoteEditor] Periodic image refresh failed:', err);
                        }
                    });
                }
            },
            2 * 60 * 1000
        );

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <>
            {/* Editor Content */}

            {/* 编辑器内容 */}
            {/* 编辑器内容 */}
            {/* 编辑器内容 */}
            <div
                className={`editor-content-wrapper ${isSyncing ? 'syncing' : ''}`}
                onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={e => {
                    // Handle Internal Block Move Drop in Gutter (fallback if Tiptap doesn't handle it)
                    if (
                        GlobalDragState.isInternal &&
                        GlobalDragState.srcPos !== null &&
                        editor &&
                        noteId
                    ) {
                        const fromPos = GlobalDragState.srcPos;
                        const coordinates = editor.view.posAtCoords({
                            left: e.clientX,
                            top: e.clientY,
                        });

                        if (coordinates) {
                            e.preventDefault();

                            const toPos = coordinates.pos;
                            const tr = editor.state.tr;
                            const doc = editor.state.doc;
                            const node = doc.nodeAt(fromPos);

                            if (node) {
                                if (toPos >= fromPos && toPos <= fromPos + node.nodeSize) {
                                    return;
                                }

                                logger.debug(
                                    '[DragDrop React] Moving node from',
                                    fromPos,
                                    'to',
                                    toPos
                                );

                                // Determine insert position based on drag direction
                                let insertPos: number;
                                if (toPos < fromPos) {
                                    // Dragging up - insert before deleting
                                    insertPos = toPos;
                                    tr.insert(insertPos, node);
                                    // Delete source (adjust position because we inserted above)
                                    tr.delete(fromPos + node.nodeSize, fromPos + node.nodeSize * 2);
                                } else {
                                    // Dragging down - delete before inserting
                                    tr.delete(fromPos, fromPos + node.nodeSize);
                                    // Map destination after deletion
                                    insertPos = tr.mapping.map(toPos);
                                    tr.insert(insertPos, node);
                                }

                                logger.debug('[DragDrop React] Inserted at position', insertPos);

                                // Set Selection to new pos (safely)
                                try {
                                    const insertedNode = tr.doc.nodeAt(insertPos);
                                    if (insertedNode) {
                                        tr.setSelection(NodeSelection.create(tr.doc, insertPos));
                                    }
                                } catch (e) {
                                    logger.warn(
                                        '[DragDrop React] Failed to create NodeSelection:',
                                        e
                                    );
                                }

                                editor.view.dispatch(tr);

                                GlobalDragState.isInternal = false;
                                GlobalDragState.srcPos = null;
                            }
                        }
                    }
                }}
            >
                <EditorContent editor={editor} />
            </div>

            {/* Text Bubble Menu */}
            <TextBubbleMenu editor={editor} />

            {/* Global Drag Handle */}
            <GlobalDragHandle editor={editor} />

            {/* Table Bubble Menu */}
            <BubbleMenu
                editor={editor}
                pluginKey="bubbleMenuTable"
                shouldShow={({ editor }) => {
                    // Only show if selection is a CellSelection (Row, Column, or Multi-cell)
                    // Default TextSelection inside a cell should NOT trigger the menu
                    return editor.state.selection instanceof CellSelection;
                }}
                className="bubble-menu"
            >
                <button
                    onClick={() => editor.chain().focus().addColumnBefore().run()}
                    title="Insert Column Before"
                >
                    Col+ ←
                </button>
                <button
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    title="Insert Column After"
                >
                    Col+ →
                </button>
                <button
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    title="Delete Column"
                >
                    Col-
                </button>
                <div className="bubble-menu-divider" />
                <button
                    onClick={() => editor.chain().focus().addRowBefore().run()}
                    title="Insert Row Before"
                >
                    Row+ ↑
                </button>
                <button
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    title="Insert Row After"
                >
                    Row+ ↓
                </button>
                <button onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row">
                    Row-
                </button>
                <div className="bubble-menu-divider" />
                <button
                    onClick={() => editor.chain().focus().mergeOrSplit().run()}
                    title="Merge/Split Cells"
                >
                    Merge/Split
                </button>
                <div className="bubble-menu-divider" />
                <button
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    className="danger"
                    title="Delete Table"
                >
                    Trash
                </button>
            </BubbleMenu>
        </>
    );
};

const NoteEditor = React.memo(
    ({
        noteId,
        title = '',
        initialContent,
        onChange,
        onTitleChange,
        user,
        editable = true,
        onMobileMenuClick,
        isLoading,
    }: NoteEditorProps) => {
        const [collaborationError, setCollaborationError] = useState<string | null>(null);
        const [isLimitReached, setIsLimitReached] = useState(false);

        // [FIX] Circular Dependency: Use a Ref to allow accessing sendUpdate from useYjsDocument
        const sendUpdateRef = useRef<((update: string, targetNoteId: string) => void) | null>(null);
        const titleRef = useRef<HTMLTextAreaElement>(null);

        // [UI] Auto-expand Title Textarea
        useLayoutEffect(() => {
            if (titleRef.current) {
                // Reset height to get correct scrollHeight
                titleRef.current.style.height = 'auto';
                // Set height based on content
                titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
            }
        }, [title]);

        // Y.js 文档管理
        const {
            ydoc,
            yXmlFragment,
            activeFragmentName, // [FIX] Get fragment name for key
            isInitialized: isYjsInitialized,
            isSyncing,
            isSynced: isYDocSynced, // [FIX] Get synced status from Manager
            hasData,
            applyRemoteUpdate,
            applyInitialSync,
        } = useYjsDocument({
            noteId,
            onLocalUpdate: update => {
                logger.debug('[NoteEditor] Sending local update, size:', update.length);

                // [FIX] Status Tracking: Mark as saving
                lastUpdateTimeRef.current = Date.now();
                if (connectionState.status === 'connected') {
                    setSaveStatus('saving');

                    // Clear any pending 'saved' switch
                    if (savingTimeoutRef.current) {
                        clearTimeout(savingTimeoutRef.current);
                        savingTimeoutRef.current = null;
                    }
                } else {
                    // [FIX] Even if disconnected, treat local updates as "Saving" (locally)
                    setSaveStatus('saving');
                }

                if (noteId && sendUpdateRef.current) {
                    sendUpdateRef.current(update, noteId);

                    // [FIX] Status Tracking: Mark as sent to transport
                    lastSentTimeRef.current = Date.now();

                    // [FIX] Debounce "Saved" state
                    if (connectionState.status === 'connected') {
                        savingTimeoutRef.current = setTimeout(() => {
                            // Only switch to saved if we haven't typed since AND no pending updates
                            if (
                                lastSentTimeRef.current >= lastUpdateTimeRef.current &&
                                pendingUpdatesCountRef.current === 0
                            ) {
                                setSaveStatus('saved');
                            }
                        }, 800);
                    }
                }
            },
        });

        // 协同 Socket 连接
        const {
            connectionState,
            presenceUsers,
            sendUpdate,
            sendCursorUpdate,
            // reconnect, // Unused
            // isSynced: isSocketSynced, // Unused
            pendingUpdatesCount,
        } = useCollaborationSocket({
            noteId,
            user, // Pass user here
            onSync: useCallback(
                (payload: YjsSyncPayload) => {
                    applyInitialSync(payload);
                },
                [applyInitialSync]
            ),
            onUpdate: useCallback(
                (payload: YjsUpdatePayload) => {
                    applyRemoteUpdate(payload);
                },
                [applyRemoteUpdate]
            ),
            onCursorUpdate: useCallback((_payload: CursorUpdatePayload) => {
                // TODO: 实现光标渲染
            }, []),
            onPresenceChange: useCallback((_users: PresenceUser[]) => {
                // Presence 变化由 hook 内部管理
            }, []),
            onLimit: useCallback((payload: CollaborationLimitPayload) => {
                setIsLimitReached(true);
                setCollaborationError(payload.error);
            }, []),
            onError: useCallback((payload: { error: string }) => {
                setCollaborationError(payload.error);
            }, []),
        });

        // [FIX] Keep Ref updated with the latest sendUpdate function
        useEffect(() => {
            sendUpdateRef.current = sendUpdate;
        }, [sendUpdate]);

        // Auto-resize title textarea to fit content
        useEffect(() => {
            if (titleRef.current) {
                // Reset height to 0 to force scrollHeight recalculation
                titleRef.current.style.height = '0px';
                // Force a reflow by reading offsetHeight
                void titleRef.current.offsetHeight;
                // Now set height to match actual content
                const newHeight = titleRef.current.scrollHeight;
                titleRef.current.style.height = newHeight + 'px';
            }
        }, [title]);

        // Determine Network Status Light Class
        const { status } = connectionState;

        // [FIX] Real-time Saving Status Logic
        // 1. Offline Priority
        // 2. Saving (Unsent changes)
        // 3. Saved (All clear)

        // Track timestamps to determine if we have unsent changes
        // We use refs to avoid re-renders during rapid typing, but trigger re-render on status change
        const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
        const lastUpdateTimeRef = useRef<number>(0);
        const lastSentTimeRef = useRef<number>(0);
        const savingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        const pendingUpdatesCountRef = useRef(pendingUpdatesCount);

        // Keep ref in sync
        useEffect(() => {
            pendingUpdatesCountRef.current = pendingUpdatesCount;
        }, [pendingUpdatesCount]);

        // Sync effect to update status based on connection and timestamps
        useEffect(() => {
            // If disconnected, force offline status
            if (status !== 'connected') {
                setSaveStatus('offline');
                return;
            }

            // [FIX] Connection restored!
            // Check if we have pending unsaved changes.
            // If lastSentTime >= lastUpdateTime AND no pending updates, we are effectively saved.
            // Otherwise, we are still saving (waiting for emit).
            if (lastSentTimeRef.current >= lastUpdateTimeRef.current && pendingUpdatesCount === 0) {
                setSaveStatus('saved');
            } else {
                setSaveStatus('saving');
            }
        }, [status, pendingUpdatesCount]);

        // 清除错误
        const handleDismissError = useCallback(() => {
            setCollaborationError(null);
            setIsLimitReached(false);
        }, []);

        // [FIX] Editor ready state to prevent placeholder flash
        const [isEditorReady, setIsEditorReady] = useState(false);

        // [FIX] Reset ready state when note changes
        useEffect(() => {
            setIsEditorReady(false);
        }, [noteId]);

        // Update logic when Data is Sent (Emitted)
        // We need to hook into the socket send.
        // Since `useCollaborationSocket` owns `sendUpdate`, we can wrap it or listen to it?
        // We passed `onLocalUpdate` to `useYjsDocument`, which calls `sendUpdate`.
        // Let's wrap the `onLocalUpdate` passed to `useYjsDocument`!

        // In `useYjsDocument` props below:
        /*
    onLocalUpdate: (update) => {
        handleLocalUpdate(); // Mark as dirty/saving
        if (noteId && sendUpdateRef.current) {
            sendUpdateRef.current(update, noteId);
            // Mark as sent immediately after handing to socket?
            // Yes, "Sent to Transport".
            lastSentTimeRef.current = Date.now();

            // Debounce the switch back to "Saved" to avoid flickering
            if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
            savingTimeoutRef.current = setTimeout(() => {
                if (lastSentTimeRef.current >= lastUpdateTimeRef.current) {
                    setSaveStatus('saved');
                }
            }, 800); // 800ms natural pause
        }
    }
  */

        // Status Text
        // Status Text
        let statusText = '';
        if (saveStatus === 'saved') {
            statusText = 'Saved';
        } else if (saveStatus === 'saving') {
            statusText = 'Saving...';
        } else {
            // Offline state - User requested to hide this status
            // statusText = '';
        }

        return (
            <div className="note-editor-container">
                {/* Mobile Menu Button - Positioned in the header */}
                {/* If isLoading, we might want to hide it or show simplified header */}
                {/* Mobile Menu Button - Positioned in the header */}
                {/* Using PageHeader for consistent top bar */}
                <PageHeader
                    className="editor-page-header"
                    startContent={
                        <button
                            className="header-icon-btn mobile-menu-btn"
                            onClick={onMobileMenuClick}
                            style={{
                                visibility: onMobileMenuClick ? 'visible' : 'hidden',
                                pointerEvents: onMobileMenuClick ? 'auto' : 'none',
                            }}
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                    }
                    centerContent={
                        <div className="breadcrumbs">
                            <span className="breadcrumb-icon">
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ display: 'block' }}
                                >
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </span>
                            <span className="breadcrumb-text">Private</span>
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-current">{title || 'Untitled'}</span>
                        </div>
                    }
                    endContent={
                        <div className="header-actions">
                            {/* New Status Indicator */}
                            <div
                                className={`status-indicator ${saveStatus === 'saving' || isSyncing ? 'syncing' : saveStatus === 'offline' ? 'offline' : 'saved'}`}
                            >
                                {saveStatus !== 'offline' && <div className="status-dot"></div>}
                                <span>{statusText}</span>
                            </div>
                            {/* Network Status Light removed - using Global NetworkStatusBar */}
                        </div>
                    }
                />

                <div className="editor-scroll-container">
                    <div className="editor-title-section">
                        {isLoading || title === undefined || title === null ? (
                            <div
                                className="editor-title-skeleton"
                                style={{
                                    height: '38px',
                                    width: '50%',
                                    backgroundColor: 'rgba(0,0,0,0.03)', // [FIX] Lighter skeleton
                                    borderRadius: '4px',
                                    animation: 'pulse 1.5s infinite',
                                }}
                            />
                        ) : (
                            <textarea
                                ref={titleRef}
                                className="editor-title-input"
                                placeholder="Untitled"
                                value={title}
                                onChange={e => {
                                    onTitleChange?.(e.target.value);
                                    // [FIX] Show saving status for title updates
                                    setSaveStatus('saving');
                                    // Debounce the switch back to "Saved" (matching parent's debounce ~500ms + network)
                                    if (savingTimeoutRef.current)
                                        clearTimeout(savingTimeoutRef.current);
                                    savingTimeoutRef.current = setTimeout(() => {
                                        setSaveStatus('saved');
                                    }, 1200);
                                }}
                                spellCheck={false}
                            />
                        )}
                    </div>

                    {/* 只有当 Y.js 文档初始化完成 且 (有数据 或 已完成同步确认是空文档) 时，才渲染编辑器 */}
                    {(() => {
                        // [FIX] Strict Loading Strategy:
                        // Show Editor ONLY if:
                        // 1. We have local data (hasData == true)
                        // 2. OR we have finished syncing and verified it is empty (isYDocSynced == true)
                        // 3. Fallback: If fully connected AND synced at socket level (double check), mount.
                        // Note: isYDocSynced from Manager is the source of truth for "Did we apply initial sync?"
                        const readyToMount = isYjsInitialized && ydoc && (hasData || isYDocSynced);
                        return readyToMount;
                    })() ? (
                        <>
                            {!isEditorReady && (
                                <div className="editor-content-shell">
                                    {/* [FIX] Unify skeleton style with initial load state */}
                                    <div
                                        style={{
                                            height: '20px',
                                            width: '100%',
                                            backgroundColor: 'rgba(0,0,0,0.03)',
                                            marginBottom: '0.8rem',
                                            borderRadius: '4px',
                                            animation: 'pulse 1.5s infinite',
                                        }}
                                    />
                                    <div
                                        style={{
                                            height: '20px',
                                            width: '92%',
                                            backgroundColor: 'rgba(0,0,0,0.03)',
                                            marginBottom: '0.8rem',
                                            borderRadius: '4px',
                                            animation: 'pulse 1.5s infinite',
                                        }}
                                    />
                                    <div
                                        style={{
                                            height: '20px',
                                            width: '96%',
                                            backgroundColor: 'rgba(0,0,0,0.03)',
                                            marginBottom: '0.8rem',
                                            borderRadius: '4px',
                                            animation: 'pulse 1.5s infinite',
                                        }}
                                    />
                                    <div
                                        style={{
                                            height: '20px',
                                            width: '80%',
                                            backgroundColor: 'rgba(0,0,0,0.03)',
                                            marginBottom: '0.8rem',
                                            borderRadius: '4px',
                                            animation: 'pulse 1.5s infinite',
                                        }}
                                    />
                                </div>
                            )}
                            <div style={{ display: isEditorReady ? 'block' : 'none' }}>
                                <TiptapEditor
                                    key={`${noteId}-${activeFragmentName}`} // [FIX] Force remount when fragment changes
                                    ydoc={ydoc!}
                                    fragment={yXmlFragment || ydoc!.getXmlFragment('blocks')} // [FIX] Pass dynamic fragment
                                    initialContent={hasData ? undefined : initialContent || ''} // [FIX] Prevent Tiptap from merging initialContent if Yjs has data
                                    editable={editable}
                                    isLimitReached={isLimitReached}
                                    onChange={onChange}
                                    sendCursorUpdate={sendCursorUpdate}
                                    presenceUsers={presenceUsers}
                                    isSyncing={isSyncing}
                                    noteId={noteId}
                                    onReady={() => setIsEditorReady(true)}
                                    hasData={hasData} // Tiptap will use this to decide if it needs to wait for render
                                />

                                {/* Table Bubble Menu */}
                            </div>
                        </>
                    ) : (
                        // [FIX] Show Skeleton during initial Sync/Load instead of Spinner or "Initializing..." text
                        // This fixes the "Gray Bar" glitch by making the loading state look like the editor
                        <div className="editor-content-shell">
                            {/* [FIX] Removed duplicate title block to prevent layout shift */}
                            <div
                                style={{
                                    height: '20px',
                                    width: '100%',
                                    backgroundColor: 'rgba(0,0,0,0.03)',
                                    marginBottom: '0.8rem',
                                    borderRadius: '4px',
                                    animation: 'pulse 1.5s infinite',
                                }}
                            />
                            <div
                                style={{
                                    height: '20px',
                                    width: '92%',
                                    backgroundColor: 'rgba(0,0,0,0.03)',
                                    marginBottom: '0.8rem',
                                    borderRadius: '4px',
                                    animation: 'pulse 1.5s infinite',
                                }}
                            />
                            <div
                                style={{
                                    height: '20px',
                                    width: '96%',
                                    backgroundColor: 'rgba(0,0,0,0.03)',
                                    marginBottom: '0.8rem',
                                    borderRadius: '4px',
                                    animation: 'pulse 1.5s infinite',
                                }}
                            />
                            <div
                                style={{
                                    height: '20px',
                                    width: '80%',
                                    backgroundColor: 'rgba(0,0,0,0.03)',
                                    marginBottom: '0.8rem',
                                    borderRadius: '4px',
                                    animation: 'pulse 1.5s infinite',
                                }}
                            />
                        </div>
                    )}

                    {/* 同步状态指示器 - Optional to keep, header already has status */}
                    {/* {isSyncing && (
          <div className="sync-indicator">
            <div className="sync-spinner" />
            <span>同步中...</span>
          </div>
        )} */}
                    {/* User asked to remove prompt/toasts, but this is a subtle indicator at bottom right.
            The requirement said "Remove connection tips, use green/yellow light".
            I'll interpret that as removing the NetworkStatusBar mostly.
            I'll comment out the bottom sync indicator too since we have it in the header now.
        */}

                    {/* 协作限制提示 */}
                    {collaborationError && (
                        <div className="collaboration-error">
                            <span>{collaborationError}</span>
                            <button onClick={handleDismissError}>×</button>
                        </div>
                    )}

                    {/* Removed NetworkStatusBar as requested */}

                    {/* Y.js 初始化状态调试（仅开发环境） */}
                    {import.meta.env.DEV && noteId && (
                        <div className="debug-info">
                            Y.js: {isYjsInitialized ? '✓' : '×'} | Socket: {connectionState.status}{' '}
                            | Users: {presenceUsers.length}
                        </div>
                    )}
                </div>
            </div>
        );
    }
);

export default NoteEditor;
