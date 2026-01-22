import React, { useState, useEffect } from 'react';
import { INote } from '../shared/types/collaboration';
import { apiClient, logger } from '@/shared';
import './SidebarNoteItem.css';

interface SidebarNoteItemProps {
    note: INote;
    activeNoteId: string | null;
    level: number;
    onSelect: (id: string) => void;
    onMenuOpen: (event: React.MouseEvent | React.TouchEvent, noteId: string) => void;

    // Editing props passed down
    editingNoteId: string | null;
    noteEditTitle: string;
    setNoteEditTitle: (title: string) => void;
    onRenameSubmit: (id: string, title: string) => void;
    onEditCancel: () => void;
}

const SidebarNoteItem: React.FC<SidebarNoteItemProps> = ({
    note,
    activeNoteId,
    level,
    onSelect,
    onMenuOpen,
    editingNoteId,
    noteEditTitle,
    setNoteEditTitle,
    onRenameSubmit,
    onEditCancel,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoadingChildren, setIsLoadingChildren] = useState(false);
    const [children, setChildren] = useState<INote[]>(note.children || []);
    const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

    // Sync children prop if it updates
    useEffect(() => {
        if (note.children) {
            setChildren(note.children);
        }
    }, [note.children]);

    // [FIX] Listen for global note updates to sync children titles
    useEffect(() => {
        const handleNoteUpdate = (e: CustomEvent) => {
            const { id, title } = e.detail;
            setChildren(prev => {
                const index = prev.findIndex(child => child.id === id);
                if (index !== -1) {
                    const newChildren = [...prev];
                    newChildren[index] = { ...newChildren[index], title };
                    return newChildren;
                }
                return prev;
            });
        };

        window.addEventListener('note-update', handleNoteUpdate as EventListener);
        return () => {
            window.removeEventListener('note-update', handleNoteUpdate as EventListener);
        };
    }, []);

    const handleExpandClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleExpand();
    };

    const toggleExpand = async () => {
        if (isExpanded) {
            setIsExpanded(false);
            return;
        }

        setIsExpanded(true);
        loadChildren();
    };

    const loadChildren = async () => {
        // Fetch children if needed
        if (note.hasChildren && children.length === 0 && !hasAttemptedLoad) {
            setIsLoadingChildren(true);
            try {
                const res = await apiClient.get(`/api/notes?parentId=${note.id}`);
                if (res.ok) {
                    const data = await res.json();
                    let fetchedChildren: INote[] = [];
                    if (Array.isArray(data)) {
                        fetchedChildren = data;
                    } else if (data && Array.isArray(data.data)) {
                        fetchedChildren = data.data;
                    } else if (data && Array.isArray(data.notes)) {
                        fetchedChildren = data.notes;
                    }
                    fetchedChildren.sort(
                        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    );
                    setChildren(fetchedChildren);
                }
            } catch (error) {
                logger.error(`Failed to load children for note ${note.id}`, error);
            } finally {
                setIsLoadingChildren(false);
                setHasAttemptedLoad(true);
            }
        }
    };

    const handleCreateChild = async (e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            if (!isExpanded) {
                setIsExpanded(true);
            }
            if (!hasAttemptedLoad && note.hasChildren) {
                await loadChildren();
            }

            const res = await apiClient.post('/api/notes', {
                title: '', // Untitled
                parentId: note.id,
                isPublic: false,
            });

            if (res.ok) {
                const newNote = await res.json();
                if (newNote.title === 'Untitled' || newNote.title === 'Untitled Note') {
                    newNote.title = '';
                }

                setChildren(prev => [newNote, ...prev]);
                setIsExpanded(true);
                onSelect(newNote.id);
            }
        } catch (error) {
            logger.error('Failed to create sub-note', error);
        }
    };

    const isActive = activeNoteId === note.id;
    const isEditing = editingNoteId === note.id;

    // Aligned base indentation: 12px base (aligned with 8px margin to 20px) + level * 12px
    const indentation = 12 + level * 12;

    return (
        <div className="sidebar-tree-item-container">
            <div
                className={`sidebar-tree-row ${isActive ? 'active' : ''} ${note.hasChildren || children.length > 0 ? 'has-children' : ''}`}
                onClick={() => onSelect(note.id)}
                style={{ paddingLeft: `${indentation}px` }}
            >
                {/* Icon Slot */}
                <div
                    className="tree-icon-slot"
                    onClick={e => {
                        if (note.hasChildren || children.length > 0) {
                            handleExpandClick(e);
                        }
                    }}
                >
                    {note.hasChildren || children.length > 0 ? (
                        <div
                            className="icon-chevron"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    ) : (
                        <div className="icon-doc">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        </div>
                    )}
                </div>

                {/* Title or Edit Input */}
                {isEditing ? (
                    <input
                        autoFocus
                        className="history-item-input"
                        value={noteEditTitle}
                        onChange={e => setNoteEditTitle(e.target.value)}
                        onBlur={onEditCancel}
                        onKeyDown={async e => {
                            if (e.key === 'Enter') {
                                e.stopPropagation();
                                onRenameSubmit(note.id, noteEditTitle);
                            } else if (e.key === 'Escape') {
                                onEditCancel();
                            }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 0, padding: '0 4px', fontSize: 'inherit' }}
                    />
                ) : (
                    <div
                        className="item-title"
                        style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={note.title}
                    >
                        {note.title || 'Untitled'}
                    </div>
                )}

                {/* Actions Menu */}
                {!isEditing && (
                    <div className="tree-actions">
                        <button
                            className="tree-action-btn"
                            onClick={e => {
                                e.stopPropagation();
                                onMenuOpen(e, note.id);
                            }}
                            title="More actions"
                            style={{ padding: '2px 4px' }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="12" cy="5" r="1" />
                                <circle cx="12" cy="19" r="1" />
                            </svg>
                        </button>

                        <button
                            className="tree-action-btn"
                            onClick={handleCreateChild}
                            title="Create sub-page"
                            style={{ padding: '2px 4px' }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {isExpanded && (
                <div className="sidebar-tree-children">
                    {isLoadingChildren ? (
                        <div
                            style={{
                                paddingLeft: `${32 + indentation}px`,
                                paddingTop: '4px',
                                paddingBottom: '4px',
                                color: 'var(--text-tertiary)',
                                fontSize: '0.8rem',
                            }}
                        >
                            Loading...
                        </div>
                    ) : (
                        children.map(child => (
                            <SidebarNoteItem
                                key={child.id}
                                note={child}
                                level={level + 1}
                                activeNoteId={activeNoteId}
                                onSelect={onSelect}
                                onMenuOpen={onMenuOpen}
                                editingNoteId={editingNoteId}
                                noteEditTitle={noteEditTitle}
                                setNoteEditTitle={setNoteEditTitle}
                                onRenameSubmit={onRenameSubmit}
                                onEditCancel={onEditCancel}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SidebarNoteItem;
