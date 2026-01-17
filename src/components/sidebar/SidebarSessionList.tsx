import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IChatSession } from '@tainiex/shared-atlas';
import { groupItemsByDate } from '@/shared';
import Skeleton from '../ui/Skeleton';
import SmoothLoader from '../ui/SmoothLoader';

interface SidebarSessionListProps {
    sessions: IChatSession[];
    currentSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onDeleteSession?: (id: string) => void;
    onRenameSession?: (id: string, newTitle: string) => void;
    isLoading?: boolean;
}

const SidebarSessionList = ({
    sessions,
    currentSessionId,
    onSessionSelect,
    onDeleteSession,
    onRenameSession,
    isLoading = false,
}: SidebarSessionListProps) => {
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [activeSessionMenuId, setActiveSessionMenuId] = useState<string | null>(null);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const sessionMenuRef = useRef<HTMLDivElement>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const longPressTriggeredRef = useRef(false);

    // ... (keep effects)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sessionMenuRef.current && !sessionMenuRef.current.contains(event.target as Node)) {
                setActiveSessionMenuId(null);
            }
        };

        if (activeSessionMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeSessionMenuId]);

    const handleRename = async (sessionId: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        onRenameSession?.(sessionId, newTitle);
        setEditingSessionId(null);
    };

    const handleLongPressStart = (id: string, event: React.TouchEvent) => {
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            if ('vibrate' in navigator) navigator.vibrate(50);
            const target = event.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            setMenuPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            setActiveSessionMenuId(id);
        }, 500);
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
        if (!longPressTriggeredRef.current) {
            callback();
        }
        longPressTriggeredRef.current = false;
    };

    const skeletonContent = (
        <div
            className="history-list skeleton-view"
            style={{ padding: '1rem 0.5rem', height: '100%' }}
        >
            <div style={{ marginBottom: '1rem' }}>
                <Skeleton
                    style={{
                        height: '14px',
                        width: '40%',
                        marginBottom: '10px',
                        marginLeft: '8px',
                    }}
                />
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-1-${i}`} style={{ padding: '8px', marginBottom: '4px' }}>
                        <Skeleton style={{ height: '20px', width: '85%' }} />
                    </div>
                ))}
            </div>
            <div>
                <Skeleton
                    style={{
                        height: '14px',
                        width: '30%',
                        marginBottom: '10px',
                        marginLeft: '8px',
                    }}
                />
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={`skel-2-${i}`} style={{ padding: '8px', marginBottom: '4px' }}>
                        <Skeleton style={{ height: '20px', width: '70%' }} />
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <SmoothLoader
            isLoading={isLoading}
            skeleton={skeletonContent}
            className="history-list-wrapper"
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
            {sessions.length === 0 ? (
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
                        No recent chats
                    </div>
                </div>
            ) : (
                <div
                    className="history-list"
                    onScroll={() => setActiveSessionMenuId(null)}
                    style={{ flex: 1, overflowY: 'auto' }}
                >
                    {Object.entries(groupItemsByDate(sessions)).map(
                        ([group, groupSessions]) =>
                            groupSessions.length > 0 && (
                                <div key={group}>
                                    <div className="sidebar-group-header">{group}</div>
                                    {groupSessions.map(session => (
                                        <div
                                            key={session.id}
                                            className={`sidebar-item-styled ${currentSessionId === session.id ? 'active' : ''}`}
                                            onClick={() =>
                                                handleItemClick(() => onSessionSelect(session.id))
                                            }
                                            onTouchStart={e => handleLongPressStart(session.id, e)}
                                            onTouchEnd={handleLongPressEnd}
                                            onTouchMove={handleLongPressCancel}
                                        >
                                            <div className="item-content">
                                                {editingSessionId === session.id ? (
                                                    <input
                                                        autoFocus
                                                        className="history-item-input"
                                                        value={editTitle}
                                                        onChange={e => setEditTitle(e.target.value)}
                                                        onBlur={() => setEditingSessionId(null)}
                                                        onKeyDown={async e => {
                                                            if (e.key === 'Enter') {
                                                                e.stopPropagation();
                                                                await handleRename(
                                                                    session.id,
                                                                    editTitle
                                                                );
                                                            } else if (e.key === 'Escape') {
                                                                setEditingSessionId(null);
                                                            }
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                ) : (
                                                    <div className="item-top-row">
                                                        <div className="item-title">
                                                            {session.title || 'New chat'}
                                                        </div>

                                                        <div
                                                            className={`session-actions ${activeSessionMenuId === session.id ? 'open' : ''}`}
                                                            style={{
                                                                marginLeft: 'auto',
                                                            }}
                                                        >
                                                            <div
                                                                style={{ position: 'relative' }}
                                                                ref={
                                                                    activeSessionMenuId ===
                                                                    session.id
                                                                        ? sessionMenuRef
                                                                        : null
                                                                }
                                                            >
                                                                <button
                                                                    className="icon-btn"
                                                                    onMouseDown={e =>
                                                                        e.stopPropagation()
                                                                    }
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        if (
                                                                            activeSessionMenuId ===
                                                                            session.id
                                                                        ) {
                                                                            setActiveSessionMenuId(
                                                                                null
                                                                            );
                                                                            setMenuPosition(null);
                                                                        } else {
                                                                            const rect =
                                                                                e.currentTarget.getBoundingClientRect();
                                                                            setMenuPosition({
                                                                                x: rect.right,
                                                                                y: rect.top,
                                                                            });
                                                                            setActiveSessionMenuId(
                                                                                session.id
                                                                            );
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '2px',
                                                                        color: 'var(--text-secondary)',
                                                                    }}
                                                                >
                                                                    <svg
                                                                        width="16"
                                                                        height="16"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="2"
                                                                    >
                                                                        <circle
                                                                            cx="12"
                                                                            cy="12"
                                                                            r="1"
                                                                        />
                                                                        <circle
                                                                            cx="12"
                                                                            cy="5"
                                                                            r="1"
                                                                        />
                                                                        <circle
                                                                            cx="12"
                                                                            cy="19"
                                                                            r="1"
                                                                        />
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
                    )}
                </div>
            )}

            {/* Context Menu Portal */}
            {activeSessionMenuId &&
                menuPosition &&
                createPortal(
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
                            marginLeft: '4px',
                        }}
                    >
                        <div
                            className="menu-item"
                            onClick={e => {
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
                                if (activeSessionMenuId)
                                    setDeleteConfirmationId(activeSessionMenuId);
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

            {/* Delete Confirmation Modal */}
            {deleteConfirmationId && (
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
            )}
        </SmoothLoader>
    );
};

export default SidebarSessionList;
