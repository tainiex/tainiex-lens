import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { createPortal } from 'react-dom';
import { IUser, IChatSession } from '@tainiex/tainiex-shared';
import type { INote } from '../types/collaboration';
import { apiClient } from '../utils/apiClient';

import { groupItemsByDate } from '../utils/dateGrouping';

interface AppSidebarProps {
    user: IUser | null;
    isOpen?: boolean;
    setIsOpen?: (open: boolean) => void;
    currentSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    sessions?: IChatSession[];
    isLoading?: boolean;
    onDeleteSession?: (id: string) => void;
    onRenameSession?: (id: string, newTitle: string) => void;
    // Notes props
    notes?: INote[];
    isLoadingNotes?: boolean;
    onNoteSelect?: (id: string | null) => void;
    onCreateNote?: () => void;
    onDeleteNote?: (id: string) => void;
    onRenameNote?: (id: string, newTitle: string) => void;
}

const AppSidebar = ({
    user,
    isOpen,
    setIsOpen,
    currentSessionId,
    onSessionSelect,
    sessions = [],
    isLoading = false,
    onDeleteSession,
    onRenameSession,
    notes = [],
    isLoadingNotes = false,
    onNoteSelect,
    onCreateNote,
    onDeleteNote,
    onRenameNote
}: AppSidebarProps) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
    const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

    // Session state
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [activeSessionMenuId, setActiveSessionMenuId] = useState<string | null>(null);

    // Note state
    const [activeNoteMenuId, setActiveNoteMenuId] = useState<string | null>(null);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteEditTitle, setNoteEditTitle] = useState('');

    const [noteSearch, setNoteSearch] = useState('');
    const location = useLocation();
    const navigate = useNavigate();

    // Long-press handling for mobile
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const longPressTriggeredRef = useRef(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);

    // Refs
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const sessionMenuRef = useRef<HTMLDivElement>(null);
    const noteMenuRef = useRef<HTMLDivElement>(null);

    // Active Tab State (derived from URL)
    const activeTab = location.pathname.includes('/notes') ? 'notes' : 'chats';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (sessionMenuRef.current && !sessionMenuRef.current.contains(event.target as Node)) {
                setActiveSessionMenuId(null);
            }
            if (noteMenuRef.current && !noteMenuRef.current.contains(event.target as Node)) {
                setActiveNoteMenuId(null);
            }
        };

        if (isProfileMenuOpen || activeSessionMenuId || activeNoteMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProfileMenuOpen, activeSessionMenuId, activeNoteMenuId]);

    const handleDelete = (sessionId: string) => {
        setDeleteConfirmationId(sessionId);
    };

    const handleRename = async (sessionId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        onRenameSession?.(sessionId, newTitle);
        setEditingSessionId(null);
    };

    const handleRenameNote = async (noteId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        onRenameNote?.(noteId, newTitle);
        setEditingNoteId(null);
    };

    // Long-press handlers
    const handleLongPressStart = (id: string, type: 'note' | 'session', event: React.TouchEvent) => {
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            // Trigger haptic feedback if available
            if ('vibrate' in navigator) {
                navigator.vibrate(50);
            }
            // Open menu
            const target = event.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            setMenuPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            if (type === 'note') {
                setActiveNoteMenuId(id);
            } else {
                setActiveSessionMenuId(id);
            }
        }, 500); // 500ms long-press threshold
    };

    const handleLongPressEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleLongPressCancel = () => {
        handleLongPressEnd();
        longPressTriggeredRef.current = false;
    };

    const handleItemClick = (callback: () => void) => {
        // Only execute click if long-press wasn't triggered
        if (!longPressTriggeredRef.current) {
            callback();
        }
        longPressTriggeredRef.current = false;
    };

    return (
        <div className={`app-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-brand">
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '0.4rem 0', gap: '0.75rem' }}>
                    <img src="/header-logo.png" alt="Tainiex" style={{ height: '32px', width: 'auto', filter: 'none' }} />
                </div>
                <button
                    className="mobile-close-btn"
                    onClick={() => setIsOpen?.(false)}
                    style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            {/* Tab Switcher (Segmented Control) */}
            <div className="sidebar-tabs-container">
                <div className="sidebar-segmented-control">
                    <button
                        className={`sidebar-tab ${activeTab === 'chats' ? 'active' : ''}`}
                        onClick={() => {
                            onSessionSelect(null);
                            navigate('/app/chats', { state: { sidebarOpen: isOpen } });
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        Chats
                    </button>
                    <button
                        className={`sidebar-tab ${activeTab === 'notes' ? 'active' : ''}`}
                        onClick={() => {
                            navigate('/app/notes', { state: { sidebarOpen: isOpen } });
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        Notes
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'notes' && (
                /* Search at fixed position above list */
                <div className="sidebar-search-row">
                    <div className="sidebar-unified-search">
                        <svg className="sidebar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input
                            type="text"
                            className="sidebar-search-input-transparent"
                            placeholder="Search notes..."
                            value={noteSearch}
                            onChange={(e) => setNoteSearch(e.target.value)}
                        />
                        <button className="sidebar-add-btn-unified" onClick={onCreateNote}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                    </div>
                </div>
            )}

            <div className="sidebar-history">
                {/* LOADING STATE - Check based on tab */}
                {((activeTab === 'chats' && isLoading) || (activeTab === 'notes' && isLoadingNotes)) ? (
                    <div className="loading-state" style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flex: 1,
                        minHeight: '100px'
                    }}>
                        <div className="spinner" style={{
                            border: '4px solid rgba(0, 0, 0, 0.1)',
                            borderLeftColor: 'var(--accent-primary)',
                            borderRadius: '50%',
                            width: '30px',
                            height: '30px',
                            animation: 'spin 1s linear infinite'
                        }}></div>
                        <style>{`
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                ) : activeTab === 'notes' ? (
                    /* NOTES LIST */
                    <>
                        {/* NOTES LIST CONTENT in sidebar-history */}
                        <div className="history-list" style={{ flex: 1, overflowY: 'auto' }}>
                            {notes.length === 0 ? (
                                <div style={{ padding: '1rem', fontSize: '0.8rem', color: '#52525b', textAlign: 'center' }}>
                                    No notes yet
                                </div>
                            ) : (
                                notes.filter(n => n.title.toLowerCase().includes(noteSearch.toLowerCase())).map(note => {
                                    const noteIdFromUrl = location.pathname.split('/notes/')[1];
                                    const isActive = noteIdFromUrl === note.id;
                                    return (
                                        <div
                                            key={note.id}
                                            className={`sidebar-item-styled ${isActive ? 'active' : ''}`}
                                            onClick={() => handleItemClick(() => onNoteSelect?.(note.id))}
                                            onTouchStart={(e) => handleLongPressStart(note.id, 'note', e)}
                                            onTouchEnd={handleLongPressEnd}
                                            onTouchMove={handleLongPressCancel}
                                        >
                                            <div className="item-content">
                                                {editingNoteId === note.id ? (
                                                    <input
                                                        autoFocus
                                                        className="history-item-input"
                                                        value={noteEditTitle}
                                                        onChange={(e) => setNoteEditTitle(e.target.value)}
                                                        onBlur={() => setEditingNoteId(null)}
                                                        onKeyDown={async (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.stopPropagation();
                                                                await handleRenameNote(note.id, noteEditTitle);
                                                            } else if (e.key === 'Escape') {
                                                                setEditingNoteId(null);
                                                            }
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                ) : (
                                                    <div className="item-top-row">
                                                        <div className="item-title">{note.title || 'Untitled'}</div>

                                                        {/* Note Action Menu Trigger */}
                                                        <div className={`session-actions ${activeNoteMenuId === note.id ? 'open' : ''}`} style={{
                                                            marginLeft: 'auto'
                                                        }}>
                                                            <div style={{ position: 'relative' }} ref={activeNoteMenuId === note.id ? noteMenuRef : null}>
                                                                <button
                                                                    className="icon-btn"
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (activeNoteMenuId === note.id) {
                                                                            setActiveNoteMenuId(null);
                                                                            setMenuPosition(null);
                                                                        } else {
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            setMenuPosition({ x: rect.right, y: rect.top });
                                                                            setActiveNoteMenuId(note.id);
                                                                        }
                                                                    }}
                                                                    style={{ padding: '2px', color: 'var(--text-secondary)' }}
                                                                >
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                        <circle cx="12" cy="12" r="1" />
                                                                        <circle cx="12" cy="5" r="1" />
                                                                        <circle cx="12" cy="19" r="1" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                ) : (
                    /* CHAT SESSIONS LIST */
                    <>
                        <div className="history-list" onScroll={() => setActiveSessionMenuId(null)} style={{ flex: 1, overflowY: 'auto' }}>
                            {sessions.length === 0 ? (
                                <div style={{ padding: '0 0.6rem', fontSize: '0.8rem', color: '#52525b', textAlign: 'center', marginTop: '1rem' }}>
                                    No recent chats
                                </div>
                            ) : (
                                Object.entries(groupItemsByDate(sessions)).map(([group, groupSessions]) => (
                                    groupSessions.length > 0 && (
                                        <div key={group}>
                                            <div className="sidebar-group-header">{group}</div>
                                            {groupSessions.map(session => (
                                                <div
                                                    key={session.id}
                                                    className={`sidebar-item-styled ${currentSessionId === session.id ? 'active' : ''}`}
                                                    onClick={() => handleItemClick(() => onSessionSelect(session.id))}
                                                    onTouchStart={(e) => handleLongPressStart(session.id, 'session', e)}
                                                    onTouchEnd={handleLongPressEnd}
                                                    onTouchMove={handleLongPressCancel}
                                                >
                                                    <div className="item-content">
                                                        {editingSessionId === session.id ? (
                                                            <input
                                                                autoFocus
                                                                className="history-item-input"
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                onBlur={() => setEditingSessionId(null)}
                                                                onKeyDown={async (e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.stopPropagation();
                                                                        await handleRename(session.id, editTitle);
                                                                    } else if (e.key === 'Escape') {
                                                                        setEditingSessionId(null);
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <div className="item-top-row">
                                                                <div className="item-title">{session.title || 'New chat'}</div>

                                                                {/* Session Action Menu Trigger */}
                                                                <div className={`session-actions ${activeSessionMenuId === session.id ? 'open' : ''}`} style={{
                                                                    marginLeft: 'auto'
                                                                }}>
                                                                    <div style={{ position: 'relative' }} ref={activeSessionMenuId === session.id ? sessionMenuRef : null}>
                                                                        <button
                                                                            className="icon-btn"
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (activeSessionMenuId === session.id) {
                                                                                    setActiveSessionMenuId(null);
                                                                                    setMenuPosition(null);
                                                                                } else {
                                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                                    setMenuPosition({ x: rect.right, y: rect.top });
                                                                                    setActiveSessionMenuId(session.id);
                                                                                }
                                                                            }}
                                                                            style={{ padding: '2px', color: 'var(--text-secondary)' }}
                                                                        >
                                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                                <circle cx="12" cy="12" r="1" />
                                                                                <circle cx="12" cy="5" r="1" />
                                                                                <circle cx="12" cy="19" r="1" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="sidebar-footer">
                {user && (
                    <div
                        className="user-profile"
                        ref={profileMenuRef}
                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    >
                        {isProfileMenuOpen && (
                            <div className="profile-menu">
                                <div className="profile-menu-item" style={{ opacity: 0.5, cursor: 'not-allowed' }} onClick={(e) => e.stopPropagation()}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 3.64 2.5 2.5 0 0 0 2.16 3.66h.7a2 2 0 0 0 3.8 0h.4a2 2 0 0 0 3.82 0h.7A2.5 2.5 0 0 0 17 9.83a2.5 2.5 0 0 0-1.26-3.7A2.5 2.5 0 0 0 12 4.5z"></path>
                                        <path d="M12 14v6"></path>
                                        <path d="M9 20h6"></path>
                                        <path d="M12 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"></path>
                                    </svg>
                                    Memories
                                </div>
                                <div className="profile-menu-item" style={{ opacity: 0.5, cursor: 'not-allowed' }} onClick={(e) => e.stopPropagation()}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20.5 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3a1.5 1.5 0 0 1 0 3 1.5 1.5 0 0 1 0-3"></path>
                                        <path d="M10 21V19a2 2 0 0 1 2-2h3"></path>
                                        <path d="M12 3H8a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h3"></path>
                                        <path d="M19 14v3a2 2 0 0 1-2 2h-3"></path>
                                        <path d="M14 3h3a2 2 0 0 1 2 2v3"></path>
                                    </svg>
                                    Tools
                                </div>
                                <div className="profile-menu-item danger" onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await apiClient.post('/api/auth/logout');
                                        window.location.href = '/login';
                                    } catch (e) {
                                        logger.error('Logout failed', e);
                                        window.location.href = '/login';
                                    }
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                    Sign Out
                                </div>
                            </div>
                        )}
                        {user.avatar ? (
                            <img
                                src={user.avatar}
                                alt={user.email}
                                style={{ width: 32, height: 32, borderRadius: '50%' }}
                            />
                        ) : (
                            <div className="user-avatar">{user.username?.charAt(0).toUpperCase() || 'U'}</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</span>
                            <span style={{ fontSize: '0.75rem', color: '#a1a1aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Session Action Menu Portal */}
            {
                activeSessionMenuId && menuPosition && createPortal(
                    <div
                        ref={sessionMenuRef}
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
                            marginLeft: '4px' // Little gap from the button
                        }}
                    >
                        <div
                            className="menu-item"
                            onClick={(e) => {
                                e.stopPropagation();
                                const session = sessions.find(s => s.id === activeSessionMenuId);
                                if (session) {
                                    setEditingSessionId(session.id);
                                    setEditTitle(session.title || '');
                                }
                                setActiveSessionMenuId(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            Rename
                        </div>
                        <div
                            className="menu-item danger"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (activeSessionMenuId) handleDelete(activeSessionMenuId);
                                setActiveSessionMenuId(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Note Action Menu Portal */}
            {
                activeNoteMenuId && menuPosition && createPortal(
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
                            marginLeft: '4px'
                        }}
                    >
                        <div
                            className="menu-item"
                            onClick={(e) => {
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
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            Rename
                        </div>
                        <div
                            className="menu-item danger"
                            onClick={(e) => {
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
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Note Delete Confirmation Modal */}
            {
                deleteNoteId && (
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
                )
            }

            {/* Delete Confirmation Modal (Session) */}
            {
                deleteConfirmationId && (
                    <div className="modal-overlay" onClick={() => setDeleteConfirmationId(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-title">Delete Chat</div>
                            <div className="modal-description">
                                Are you sure you want to delete this chat? This action cannot be undone.
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="btn-modal btn-cancel"
                                    onClick={() => setDeleteConfirmationId(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn-modal btn-delete"
                                    onClick={() => {
                                        onDeleteSession?.(deleteConfirmationId);
                                        setDeleteConfirmationId(null);
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AppSidebar;
