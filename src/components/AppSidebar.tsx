import { useLocation, useNavigate } from 'react-router-dom';
import { IUser, IChatSession, INote } from '@tainiex/shared-atlas';

import SidebarSessionList from './sidebar/SidebarSessionList';
import SidebarNoteList from './sidebar/SidebarNoteList';
import UserProfileMenu from './sidebar/UserProfileMenu';

interface AppSidebarProps {
    user: IUser | null;
    isOpen?: boolean;
    setIsOpen?: (open: boolean) => void;
    currentSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    sessions?: IChatSession[];
    isLoading?: boolean;
    hasLoadedOnce?: boolean;
    onDeleteSession?: (id: string) => void;
    onRenameSession?: (id: string, newTitle: string) => void;
    // Notes props
    notes?: INote[];
    isLoadingNotes?: boolean;
    hasLoadedNotesOnce?: boolean;
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
    hasLoadedOnce = false,
    onDeleteSession,
    onRenameSession,
    notes = [],
    isLoadingNotes = false,
    hasLoadedNotesOnce = false,
    onNoteSelect,
    onCreateNote,
    onDeleteNote,
    onRenameNote,
}: AppSidebarProps) => {
    const location = useLocation();
    const navigate = useNavigate();

    // Active Tab State (derived from URL)
    const activeTab = location.pathname.includes('/notes') ? 'notes' : 'chats';
    const activeNoteId = location.pathname.split('/notes/')[1] || null;

    return (
        <div className={`app-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-brand">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        flex: 1,
                        padding: '0.4rem 0',
                        gap: '0.75rem',
                    }}
                >
                    <img
                        src="/logo.png"
                        alt="Tainiex"
                        style={{ height: '32px', width: 'auto', filter: 'none' }}
                    />
                </div>
                <button
                    className="mobile-close-btn"
                    onClick={() => setIsOpen?.(false)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#a1a1aa',
                        cursor: 'pointer',
                        padding: '4px',
                    }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
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
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Chats
                    </button>
                    <button
                        className={`sidebar-tab ${activeTab === 'notes' ? 'active' : ''}`}
                        onClick={() => {
                            navigate('/app/notes', { state: { sidebarOpen: isOpen } });
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
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Notes
                    </button>
                </div>
            </div>

            <div className="sidebar-history">
                {/* LOADING STATE */}
                {activeTab === 'notes' ? (
                    <SidebarNoteList
                        notes={notes}
                        activeNoteId={activeNoteId}
                        onNoteSelect={id => onNoteSelect?.(id)}
                        onCreateNote={onCreateNote}
                        onDeleteNote={onDeleteNote}
                        onRenameNote={onRenameNote}
                        isLoading={isLoadingNotes}
                        hasLoadedOnce={hasLoadedNotesOnce}
                    />
                ) : (
                    <SidebarSessionList
                        sessions={sessions}
                        currentSessionId={currentSessionId}
                        onSessionSelect={id => onSessionSelect(id)}
                        onDeleteSession={onDeleteSession}
                        onRenameSession={onRenameSession}
                        isLoading={isLoading}
                        hasLoadedOnce={hasLoadedOnce}
                    />
                )}
            </div>

            <div className="sidebar-footer">{user && <UserProfileMenu user={user} />}</div>
        </div>
    );
};

export default AppSidebar;
