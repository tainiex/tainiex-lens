import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import tippy, { Instance } from 'tippy.js';
import './GlobalDragHandle.css';
import { GlobalDragState } from '../../utils/dragState';

interface GlobalDragHandleProps {
    editor: Editor;
}

export const GlobalDragHandle: React.FC<GlobalDragHandleProps> = ({ editor }) => {
    const [position, setPosition] = useState<{ top: number; left: number; height: number } | null>(
        null
    );
    const [currentNodePos, setCurrentNodePos] = useState<number | null>(null);
    const handleRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const tippyInstance = useRef<Instance | null>(null);
    const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

    // Track hover
    useEffect(() => {
        if (!editor) return;

        const updateHandlePosition = (clientX: number, clientY: number) => {
            const view = editor.view;
            if (!view || view.isDestroyed) return;

            // Find node at coords
            const pos = view.posAtCoords({ left: clientX, top: clientY });
            if (!pos) return;

            // Resolve to the top-level node (block)
            let resolvedPos = view.state.doc.resolve(pos.pos);

            // Find the appropriate block node
            // For images and other block nodes at depth 0, use the node directly
            // For inline content, traverse up to find depth 1 (child of doc)
            let blockPos: number;
            let blockNode: any;

            if (resolvedPos.depth === 0) {
                // Node is at document root (like images)
                blockPos = pos.inside >= 0 ? pos.inside : pos.pos;
                blockNode = view.state.doc.nodeAt(blockPos);
            } else {
                // Node has depth >= 1, find the top-level block
                const targetDepth = Math.min(1, resolvedPos.depth);
                blockPos = resolvedPos.before(targetDepth);
                blockNode = view.state.doc.nodeAt(blockPos);
            }

            if (!blockNode) return;

            // Get DOM node
            const domNode = view.nodeDOM(blockPos) as HTMLElement;

            if (domNode && domNode.getBoundingClientRect) {
                const rect = domNode.getBoundingClientRect();

                // Defer state updates to avoid flushSync warning
                queueMicrotask(() => {
                    setPosition({
                        top: rect.top, // Viewport coordinates (fixed positioning)
                        left: rect.left - 24, // 24px gutter to the left
                        height: rect.height,
                    });
                    setCurrentNodePos(blockPos);
                });
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            // Hide if we are hovering the handle itself to avoid jitter
            if (handleRef.current && handleRef.current.contains(e.target as Node)) {
                return;
            }

            // Store mouse position for scroll handler
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };

            updateHandlePosition(e.clientX, e.clientY);
        };

        const handleScroll = () => {
            // When scrolling, update handle position based on last known mouse position
            if (lastMousePosRef.current) {
                updateHandlePosition(lastMousePosRef.current.x, lastMousePosRef.current.y);
            }
        };

        const editorDom = editor.view.dom;
        const editorWrapper = editorDom.parentElement;

        // Find all scrollable ancestors
        const scrollContainers: HTMLElement[] = [];
        let current = editorWrapper;
        while (current && current !== document.documentElement) {
            const overflowY = window.getComputedStyle(current).overflowY;

            if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
                scrollContainers.push(current);
            }
            current = current.parentElement;
        }

        editorWrapper?.addEventListener('mousemove', handleMouseMove);

        // Listen to all scrollable containers
        scrollContainers.forEach(container => {
            container.addEventListener('scroll', handleScroll);
        });
        window.addEventListener('scroll', handleScroll);

        return () => {
            editorWrapper?.removeEventListener('mousemove', handleMouseMove);
            scrollContainers.forEach(container => {
                container.removeEventListener('scroll', handleScroll);
            });
            window.removeEventListener('scroll', handleScroll);
        };
    }, [editor]);

    // Initialize Tippy for Menu
    useEffect(() => {
        if (handleRef.current && menuRef.current) {
            tippyInstance.current = tippy(handleRef.current, {
                content: menuRef.current,
                interactive: true,
                trigger: 'click',
                placement: 'bottom-start',
                theme: 'light-border',
                onShow: () => {
                    // Select the node when menu opens
                    if (currentNodePos !== null) {
                        // Set Node Selection
                        const tr = editor.state.tr.setSelection(
                            NodeSelection.create(editor.state.doc, currentNodePos)
                        );
                        editor.view.dispatch(tr);
                    }
                },
            });
        }
        return () => {
            tippyInstance.current?.destroy();
        };
    }, [currentNodePos, editor]);

    const handleDragStart = (e: React.DragEvent) => {
        if (currentNodePos === null) {
            e.preventDefault();
            return;
        }

        const node = editor.state.doc.nodeAt(currentNodePos);
        if (!node) return;

        // 1. Select the node in Tiptap
        const tr = editor.state.tr.setSelection(
            NodeSelection.create(editor.state.doc, currentNodePos)
        );
        editor.view.dispatch(tr);

        // 2. Set Drag Data
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0);

        // Serialize Node to HTML for ProseMirror to handle the drop correctly
        const slice = editor.state.selection.content();
        // @ts-ignore - relying on internal API or standard DOM serializer
        const serializer =
            editor.view.someProp('clipboardSerializer') || DOMSerializer.fromSchema(editor.schema);
        const div = document.createElement('div');
        // @ts-ignore
        const content = serializer.serializeFragment(slice.content);
        div.appendChild(content);

        e.dataTransfer.setData('text/html', div.innerHTML);
        e.dataTransfer.setData('text/plain', node.textContent);

        // [New] Use Global Singleton for reliability
        GlobalDragState.isInternal = true;
        GlobalDragState.srcPos = currentNodePos;
        e.dataTransfer.setData('application/x-lens-drag', 'true');
        e.dataTransfer.setData('application/x-lens-from', currentNodePos.toString());
    };

    // Actions
    const handleDelete = () => {
        if (currentNodePos !== null) {
            editor.chain().deleteSelection().run();
            tippyInstance.current?.hide();
            setPosition(null);
        }
    };

    const handleDuplicate = () => {
        if (currentNodePos !== null) {
            const node = editor.state.doc.nodeAt(currentNodePos);
            if (node) {
                editor
                    .chain()
                    .insertContentAt(currentNodePos + node.nodeSize, node.toJSON())
                    .run();
                tippyInstance.current?.hide();
            }
        }
    };

    if (!editor || !position) return null;

    return (
        <>
            <div
                ref={handleRef}
                className="global-drag-handle"
                draggable="true"
                onDragStart={handleDragStart}
                style={{
                    position: 'fixed',
                    top: position.top,
                    left: position.left,
                    height: 24,
                    width: 24,
                    zIndex: 50,
                }}
            >
                <div className="drag-handle-icon">
                    <svg viewBox="0 0 10 10" width="12" height="12" className="drag-icon">
                        <path
                            d="M3,2 C2.44771525,2 2,1.55228475 2,1 C2,0.44771525 2.44771525,0 3,0 C3.55228475,0 4,0.44771525 4,1 C4,1.55228475 3.55228475,2 3,2 Z M3,6 C2.44771525,6 2,5.55228475 2,5 C2,4.44771525 2.44771525,4 3,4 C3.55228475,4 4,4.44771525 4,5 C4,5.55228475 3.55228475,6 3,6 Z M3,10 C2.44771525,10 2,9.55228475 2,9 C2,8.44771525 2.44771525,8 3,8 C3.55228475,8 4,8.44771525 4,9 C4,9.55228475 3.55228475,10 3,10 Z M7,2 C6.44771525,2 6,1.55228475 6,1 C6,0.44771525 6.44771525,0 7,0 C7.55228475,0 8,0.44771525 8,1 C8,1.55228475 7.55228475,2 7,2 Z M7,6 C6.44771525,6 6,5.55228475 6,5 C6,4.44771525 6.44771525,4 7,4 C7.55228475,4 8,4.44771525 8,5 C8,5.55228475 7.55228475,6 7,6 Z M7,10 C6.44771525,10 6,9.55228475 6,9 C6,8.44771525 6.44771525,8 7,8 C7.55228475,8 8,8.44771525 8,9 C8,9.55228475 7.55228475,10 7,10 Z"
                            fill="currentColor"
                        ></path>
                    </svg>
                </div>
            </div>

            {/* Hidden Menu Content */}
            <div ref={menuRef} className="drag-handle-menu" style={{ display: 'none' }}>
                <div className="menu-item disabled">Drag to move</div>
                <div className="menu-item-divider" />
                <div className="menu-item" onClick={handleDuplicate}>
                    Duplicate
                </div>
                <div className="menu-item danger" onClick={handleDelete}>
                    Delete
                </div>
            </div>
        </>
    );
};
