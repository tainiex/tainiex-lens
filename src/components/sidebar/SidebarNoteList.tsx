import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { INote } from '@/shared';
import SidebarNoteItem from '../SidebarNoteItem';
import Skeleton from '../ui/Skeleton';
import SmoothLoader from '../ui/SmoothLoader';

interface SidebarNoteListProps {
    notes: INote[];
    activeNoteId: string | null; // active note id from url usually
    onNoteSelect: (id: string) => void;
    onCreateNote?: () => void;
    onDeleteNote?: (id: string) => void;
    onRenameNote?: (id: string, newTitle: string) => void;
    isLoading?: boolean;
    hasLoadedOnce?: boolean;
}

const SidebarNoteList = ({
    notes,
    activeNoteId,
    onNoteSelect,
    onCreateNote,
    onDeleteNote,
    onRenameNote,
    isLoading = false,
    hasLoadedOnce = false,
}: SidebarNoteListProps) => {
    const [noteSearch, setNoteSearch] = useState('');
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteEditTitle, setNoteEditTitle] = useState('');
    const [activeNoteMenuId, setActiveNoteMenuId] = useState<string | null>(null);
    const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const noteMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (noteMenuRef.current && !noteMenuRef.current.contains(event.target as Node)) {
                setActiveNoteMenuId(null);
            }
        };

        if (activeNoteMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeNoteMenuId]);

    const handleRenameNote = async (noteId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        onRenameNote?.(noteId, newTitle);
        setEditingNoteId(null);
    };

    return (
        <>
            {/* Search at fixed position above list */}
            <div className="sidebar-search-row">
                <div className="sidebar-unified-search">
                    <svg
                        className="sidebar-search-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        type="text"
                        className="sidebar-search-input-transparent"
                        placeholder="Search notes..."
                        value={noteSearch}
                        onChange={e => setNoteSearch(e.target.value)}
                    />
                    <button className="sidebar-add-btn-unified" onClick={onCreateNote}>
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="12" y1="18" x2="12" y2="12"></line>
                            <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                    </button>
                </div>
            </div>

            {/* NOTES LIST CONTENT in sidebar-history */}
            <SmoothLoader
                isLoading={isLoading}
                skeleton={
                    <div
                        className="history-list skeleton-view"
                        style={{ padding: '1rem 0.5rem', height: '100%' }}
                    >
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={`note-skel-${i}`}
                                style={{ padding: '6px 8px', marginBottom: '4px' }}
                            >
                                <Skeleton
                                    style={{ height: '20px', width: i % 2 === 0 ? '80%' : '65%' }}
                                />
                            </div>
                        ))}
                    </div>
                }
                className="history-list-wrapper"
                style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                minDuration={300}
            >
                {/* CRITICAL: Only show "No notes yet" when we've loaded data AND confirmed no notes exist */}
                {hasLoadedOnce && !isLoading && notes.length === 0 ? (
                    <div className="history-list" style={{ flex: 1, overflowY: 'auto' }}>
                        <div
                            style={{
                                padding: '0 0.6rem',
                                fontSize: '0.8rem',
                                color: '#52525b',
                                textAlign: 'center',
                                marginTop: '1rem',
                            }}
                        >
                            No notes yet
                        </div>
                    </div>
                ) : notes.length === 0 ? (
                    // Before first load or during loading with empty notes, render empty div (skeleton will show)
                    <div className="history-list" style={{ flex: 1, overflowY: 'auto' }} />
                ) : (
                    <div className="history-list" style={{ flex: 1, overflowY: 'auto' }}>
                        {notes
                            .filter(n => n.title.toLowerCase().includes(noteSearch.toLowerCase()))
                            .map(note => {
                                return (
                                    <SidebarNoteItem
                                        key={note.id}
                                        note={note}
                                        level={0}
                                        activeNoteId={activeNoteId}
                                        onSelect={id => onNoteSelect?.(id)}
                                        onMenuOpen={(e, id) => {
                                            const rect = (
                                                e.target as HTMLElement
                                            ).getBoundingClientRect();
                                            setMenuPosition({ x: rect.right, y: rect.top });
                                            setActiveNoteMenuId(id);
                                        }}
                                        editingNoteId={editingNoteId}
                                        noteEditTitle={noteEditTitle}
                                        setNoteEditTitle={setNoteEditTitle}
                                        onRenameSubmit={handleRenameNote}
                                        onEditCancel={() => setEditingNoteId(null)}
                                    />
                                );
                            })}
                    </div>
                )}
            </SmoothLoader>

            {/* Note Action Menu Portal */}
            {activeNoteMenuId &&
                menuPosition &&
                createPortal(
                    <div
                        ref={noteMenuRef}
                        className="session-menu-dropdown"
                        style={{
                            position: 'fixed',
                            left: menuPosition.x,
                            top: menuPosition.y,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                            zIndex: 9999,
                            minWidth: '120px',
                            overflow: 'hidden',
                            marginLeft: '4px',
                        }}
                    >
                        <div
                            className="menu-item"
                            onClick={e => {
                                e.stopPropagation();
                                const note = notes.find(n => n.id === activeNoteMenuId);
                                if (note) {
                                    setEditingNoteId(note.id);
                                    setNoteEditTitle(note.title || '');
                                }
                                setActiveNoteMenuId(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                            Rename
                        </div>
                        <div
                            className="menu-item danger"
                            onClick={e => {
                                e.stopPropagation();
                                if (activeNoteMenuId) setDeleteNoteId(activeNoteMenuId);
                                setActiveNoteMenuId(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e =>
                                (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')
                            }
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </div>
                    </div>,
                    document.body
                )}

            {/* Note Delete Confirmation Modal */}
            {deleteNoteId && (
                <div className="modal-overlay" onClick={() => setDeleteNoteId(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">Delete Note</div>
                        <div className="modal-description">
                            Are you sure you want to delete this note? This action cannot be undone.
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn-modal btn-cancel"
                                onClick={() => setDeleteNoteId(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-modal btn-delete"
                                onClick={() => {
                                    onDeleteNote?.(deleteNoteId);
                                    setDeleteNoteId(null);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SidebarNoteList;
