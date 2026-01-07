import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { createPortal } from 'react-dom';
import { IUser, IChatSession } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';
import { useTheme } from '../contexts/ThemeContext';

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
    onRenameSession
}: AppSidebarProps) => {
    // Removed local session state and fetching logic
    const { theme, toggleTheme } = useTheme();
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [activeSessionMenuId, setActiveSessionMenuId] = useState<string | null>(null);
    const location = useLocation();
    const navigate = useNavigate();
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const sessionMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (sessionMenuRef.current && !sessionMenuRef.current.contains(event.target as Node)) {
                setActiveSessionMenuId(null);
            }
        };

        if (isProfileMenuOpen || activeSessionMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProfileMenuOpen, activeSessionMenuId]);

    const handleDelete = (sessionId: string) => {
        setDeleteConfirmationId(sessionId);
    };

    const handleRename = async (sessionId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        onRenameSession?.(sessionId, newTitle);
        setEditingSessionId(null);
    };

    return (
        <div className={`app-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-brand">
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '0.4rem 0', gap: '0.75rem' }}>
                    <img src="/header-logo.png" alt="Tainiex" style={{ height: '32px', width: 'auto', filter: theme === 'light' ? 'none' : 'brightness(1.2)' }} />
                </div>
                <button
                    className="mobile-close-btn"
                    onClick={() => setIsOpen?.(false)}
                    style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <nav className="sidebar-nav">
                <div
                    className={`sidebar-item ${!location.pathname.includes('/app/notes') ? 'active' : ''}`}
                    onClick={() => {
                        onSessionSelect(null);
                        navigate('/app');
                    }}
                    style={{ cursor: 'pointer' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    Chats
                </div>
                {import.meta.env.DEV && (
                    <div
                        className={`sidebar-item ${location.pathname.includes('/app/notes') ? 'active' : ''}`}
                        onClick={() => {
                            navigate('/app/notes');
                            setIsOpen?.(false);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        <span style={{ flex: 1 }}>Notes</span>
                    </div>
                )}
                <div className="sidebar-item disabled" title="Coming Soon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    <span style={{ flex: 1 }}>Memories</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <div className="sidebar-item disabled" title="Coming Soon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                    <span style={{ flex: 1 }}>Tools</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
            </nav>

            <div className="sidebar-divider" style={{
                height: '1px',
                background: 'rgba(255, 255, 255, 0.08)',
                margin: '0.4rem 1rem',
                flexShrink: 0
            }} />

            <div className="sidebar-history">
                <div className="history-label" style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.4rem',
                    paddingLeft: '0.6rem',
                    flexShrink: 0
                }}>
                    Your chats
                </div>
                <div className="history-list" onScroll={() => setActiveSessionMenuId(null)} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                    overflowY: 'auto',
                    flex: 1,
                    minHeight: 0
                }}>
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={`history-item ${currentSessionId === session.id ? 'active' : ''}`}
                            onClick={() => onSessionSelect(session.id)}
                            onContextMenu={(e) => {
                                // Prevent default context menu on mobile long press
                                if (window.innerWidth <= 768) {
                                    e.preventDefault();
                                }
                            }}
                            onTouchStart={(e) => {
                                // Only for mobile
                                if (window.innerWidth > 768) return;

                                const touch = e.touches[0];
                                const currentTarget = e.currentTarget;

                                const timerId = setTimeout(() => {
                                    if (navigator.vibrate) navigator.vibrate(50);

                                    // Position menu near the touch point or center
                                    setMenuPosition({
                                        x: touch.clientX,
                                        y: touch.clientY
                                    });
                                    setActiveSessionMenuId(session.id);
                                }, 600); // 600ms long press

                                // Store timer ID on the element or a ref map would be better, 
                                // but for simplicity using a data attribute equivalent or just relying on closure cleanup?
                                // Closure cleanup via strict touch end handling:
                                const clearTimer = () => {
                                    clearTimeout(timerId);
                                    currentTarget.removeEventListener('touchend', clearTimer);
                                    currentTarget.removeEventListener('touchmove', clearTimer);
                                };

                                currentTarget.addEventListener('touchend', clearTimer);
                                currentTarget.addEventListener('touchmove', clearTimer);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.35rem 0.6rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                flexShrink: 0
                            }}
                        >
                            {editingSessionId === session.id ? (
                                <input
                                    autoFocus
                                    type="text"
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
                                    className="history-item-input"
                                />
                            ) : (
                                <>
                                    <span className="history-item-text" title={session.title || 'New chat'} style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        flex: 1
                                    }}>
                                        {session.title || 'New chat'}
                                    </span>
                                    <div className={`session-actions ${activeSessionMenuId === session.id ? 'open' : ''}`} style={{
                                        display: 'flex',
                                        gap: '4px',
                                        transition: 'opacity 0.2s',
                                        position: 'absolute',
                                        right: '0',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        zIndex: 10,
                                        height: '100%',
                                        alignItems: 'center',
                                        paddingLeft: '4px'
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
                                                style={{
                                                    padding: '2px',
                                                    color: 'var(--text-secondary)',
                                                    background: 'transparent'
                                                }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="1" />
                                                    <circle cx="12" cy="5" r="1" />
                                                    <circle cx="12" cy="19" r="1" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                    {sessions.length === 0 && !isLoading && (
                        <div style={{ padding: '0 0.75rem', fontSize: '0.8rem', color: '#52525b' }}>
                            No recent chats
                        </div>
                    )}
                </div>
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
                                <div className="profile-menu-item" onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTheme();
                                }}>
                                    <div className="theme-toggle-row">
                                        <span className={theme === 'light' ? 'active' : ''}>Light</span>
                                        <div className={`theme-switch ${theme === 'dark' ? 'active' : ''}`} />
                                        <span className={theme === 'dark' ? 'active' : ''}>Dark</span>
                                    </div>
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
            {activeSessionMenuId && menuPosition && createPortal(
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
            )}

            {/* Delete Confirmation Modal */}
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
