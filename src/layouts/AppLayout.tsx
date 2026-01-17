import { IChatMessage, INote } from '@tainiex/shared-atlas';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from '../components/AppSidebar';
import { NotificationProvider } from '../contexts/NotificationContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { IUser } from '@tainiex/shared-atlas';
import { apiClient, logger, useLoadingAnimation, getCachedNotes, setCachedNotes } from '@/shared';
import '../pages/AppDashboard.css'; // Shared styles
import { SocketProvider } from '../contexts/SocketContext';
import NetworkStatusBar from '../components/NetworkStatusBar';
import { ChatProvider } from '../contexts/ChatContext';

export interface AppLayoutContextType {
    user: IUser | null;
    currentSessionId: string | null;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (v: boolean) => void;
    sessions: any[]; // refined type if available
    notes: INote[];
    handleSessionSelect: (
        id: string | null,
        options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
    ) => void;
    handleNoteSelect: (id: string | null) => void;
    handleDeleteSession: (id: string) => void;
    handleRenameSession: (id: string, newTitle: string) => void;
    handleUpdateSessionTitle: (id: string, title: string) => void; // New: immediate local update
    handleCreateNote: () => void;
    handleDeleteNote: (id: string) => void;
    handleUpdateNoteTitle: (id: string, title: string) => void;
    refreshSessions: (options?: { background?: boolean }) => void;
    refreshNotes: () => void;
    isLoadingNotes: boolean; // Added for detecting 404s
}

const AppLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // --- Auth State ---
    const [user, setUser] = useState<IUser | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const loadingClass = useLoadingAnimation(isLoadingAuth);

    // --- Sidebar State ---
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        // Check if mobile viewport (matching CSS breakpoint)
        const isMobile = window.innerWidth <= 768;

        // On mobile, always start closed
        if (isMobile) {
            return false;
        }

        // On desktop, restore from navigation state
        return (location.state as any)?.sidebarOpen || false;
    });

    // Use ref to keep handlers stable even if sidebar state changes
    const isSidebarOpenRef = useRef(isSidebarOpen);
    useEffect(() => {
        isSidebarOpenRef.current = isSidebarOpen;
    }, [isSidebarOpen]);

    // --- Data State ---
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    const [notes, setNotes] = useState<INote[]>(() => getCachedNotes() || []);
    const [isLoadingNotes, setIsLoadingNotes] = useState(() => !getCachedNotes());

    // --- Current Selection Derived from URL ---
    // /app/:sessionId -> Chat
    // /app/notes/:noteId -> Note
    const isNotesPath = location.pathname.includes('/notes');

    // Parse IDs from URL manually or rely on child routes to sync?
    // Sidebar needs to know which item is active.
    // Let's parse loosely for highlighting:
    const getCurrentId = () => {
        const parts = location.pathname.split('/');
        // URL Structure:
        // /app/notes/:id -> parts[0]='', parts[1]='app', parts[2]='notes', parts[3]=id
        // /app/chats/:id -> parts[0]='', parts[1]='app', parts[2]='chats', parts[3]=id
        // /app/chats     -> parts[0]='', parts[1]='app', parts[2]='chats' (length 3, no ID)

        if (isNotesPath) {
            if (parts.length > 3 && parts[3]) return parts[3];
            return null;
        } else {
            // For chats, we want to ensure we are actually grabbing an ID, not "chats"
            // If URL is /app/chats, parts[2] is "chats". We should check if parts[2] is "chats" and look at parts[3]
            // OR if the route is /app/:id (legacy?), we check.
            // But based on routing, it seems to be /app/chats/:id

            // Check if parts[2] is 'chats'
            if (parts[2] === 'chats') {
                if (parts.length > 3 && parts[3]) return parts[3];
                return null;
            }

            // Fallback for direct /app/:id if supported, or other routes
            if (parts.length > 2 && parts[2] !== '' && parts[2] !== 'chats') return parts[2];
        }
        return null;
    };
    const currentActiveId = getCurrentId();

    // --- Data Fetching ---
    const fetchSessions = useCallback(async (options?: { background?: boolean }) => {
        if (!options?.background) {
            setIsLoadingSessions(true);
        }
        try {
            const res = await apiClient.get('/api/chat/sessions');
            if (res.ok) {
                const data = await res.json();
                setSessions(
                    data.sort(
                        (a: any, b: any) =>
                            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    )
                );
            }
        } catch (error) {
            logger.error('Failed to fetch chat sessions:', error);
        } finally {
            setIsLoadingSessions(false);
        }
    }, []);

    const fetchNotes = useCallback(async () => {
        // If we already have notes, we don't need to set loading true for background refresh
        // But we can't easily check `notes` state here without adding it to dependency and recreating function.
        // So we use functional update or weak check.
        // Actually, let's just use a ref or accept that this function might be recreated if we rely on state?
        // Or better: `setIsLoadingNotes` is safe to call.
        // To avoid dep on `notes`, we can omit the "if empty set loading" check here or move it.
        // Let's just set loading if we don't have cache?
        // Logic: if (!getCachedNotes()) setIsLoadingNotes(true);
        // This is safe.
        if (!getCachedNotes()) setIsLoadingNotes(true);

        try {
            const res = await apiClient.get('/api/notes');
            if (res.ok) {
                const data = await res.json();
                let notesArray: INote[] = [];
                if (Array.isArray(data)) {
                    notesArray = data;
                } else if (data && Array.isArray(data.data)) {
                    notesArray = data.data;
                } else if (data && Array.isArray(data.notes)) {
                    notesArray = data.notes;
                }
                const sortedNotes = notesArray.sort(
                    (a: INote, b: INote) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
                setNotes(sortedNotes);
                setCachedNotes(sortedNotes);
            }
        } catch (error) {
            logger.error('Failed to fetch notes:', error);
        } finally {
            setIsLoadingNotes(false);
        }
    }, []);

    // --- Auth Check ---
    // --- Auth Check ---
    useEffect(() => {
        let isMounted = true;
        const checkAuth = async () => {
            try {
                const res = await apiClient.get('/api/profile');
                if (!isMounted) return;

                if (res.ok) {
                    const data = await res.json();
                    setUser(data as IUser);
                    // Fetch initial data
                    fetchSessions();
                    fetchNotes();
                } else {
                    setTimeout(() => {
                        // Use window.location.pathname to get current path for redirect
                        if (isMounted)
                            navigate(
                                `/login?redirect=${encodeURIComponent(window.location.pathname)}`
                            );
                    }, 500);
                }
            } catch (err) {
                if (isMounted)
                    navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            } finally {
                if (isMounted) setIsLoadingAuth(false);
            }
        };

        checkAuth();
        return () => {
            isMounted = false;
        };
    }, []); // Run ONLY once on mount (empty deps is sufficient)

    // --- Global Auth Event Listener ---
    useEffect(() => {
        const handleLogout = () => {
            logger.warn('[AppLayout] Received auth:logout event. Redirecting to login...');
            setUser(null); // Clear user state immediately
            navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        };

        window.addEventListener('auth:logout', handleLogout);
        return () => window.removeEventListener('auth:logout', handleLogout);
    }, [navigate]);

    // --- Handlers ---
    const handleSessionCreated = useCallback(() => {
        fetchSessions({ background: true });
    }, [fetchSessions]);

    const handleSessionUpdate = useCallback(() => {
        fetchSessions({ background: true });
    }, [fetchSessions]);
    const handleSessionSelect = useCallback(
        (
            id: string | null,
            options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
        ) => {
            // Use ref for sidebar state to avoid recreating this function when sidebar toggles
            const sidebarOpen = isSidebarOpenRef.current;
            if (id) {
                navigate(`/app/chats/${id}`, {
                    state: {
                        sidebarOpen,
                        skipFetch: options?.skipFetch,
                        initialMessages: options?.initialMessages,
                    },
                });
            } else {
                navigate('/app/chats', { state: { sidebarOpen } });
            }
            if (id) setIsSidebarOpen(false); // Close on selection on mobile
        },
        [navigate, setIsSidebarOpen]
    );

    const handleNoteSelect = useCallback(
        (id: string | null) => {
            const sidebarOpen = isSidebarOpenRef.current;
            if (id) {
                navigate(`/app/notes/${id}`, { state: { sidebarOpen } });
            } else {
                navigate('/app/notes', { state: { sidebarOpen } });
            }
            if (id) setIsSidebarOpen(false);
        },
        [navigate, setIsSidebarOpen]
    );

    const handleDeleteSession = useCallback(
        async (id: string) => {
            try {
                const res = await apiClient.delete(`/api/chat/sessions/${id}`);
                if (res.ok) {
                    setSessions(prev => prev.filter(s => s.id !== id));
                    // If we delete the current chat, go back to main chats list
                    if (window.location.pathname.includes(id)) {
                        navigate('/app/chats', {
                            state: { sidebarOpen: isSidebarOpenRef.current },
                        });
                    }
                }
            } catch (error) {
                logger.error('Failed to delete session', error);
            }
        },
        [navigate, setSessions]
    );

    const handleRenameSession = useCallback(
        async (id: string, newTitle: string) => {
            try {
                const res = await apiClient.request(`/api/chat/sessions/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle }),
                });
                if (res.ok) {
                    setSessions(prev =>
                        prev.map(s => (s.id === id ? { ...s, title: newTitle } : s))
                    );
                }
            } catch (error) {
                logger.error('Failed to rename session', error);
            }
        },
        [setSessions]
    );

    // Immediate local title update (without API call, for backend-pushed title updates)
    const handleUpdateSessionTitle = useCallback(
        (id: string, title: string) => {
            setSessions(prev =>
                prev.map(s =>
                    s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s
                )
            );
        },
        [setSessions]
    );

    const handleCreateNote = useCallback(async () => {
        try {
            const res = await apiClient.post('/api/notes', {
                title: '',
                isPublic: false,
            });
            if (res.ok) {
                const newNote = await res.json();
                // [FIX] Backend may return "Untitled" or "Untitled Note" as default
                // Normalize it to empty string so placeholder shows
                if (newNote.title === 'Untitled' || newNote.title === 'Untitled Note') {
                    newNote.title = '';
                }
                setNotes(prev => [newNote, ...prev]);
                navigate(`/app/notes/${newNote.id}`, { state: { sidebarOpen: false } });
                setIsSidebarOpen(false);
            }
        } catch (error) {
            logger.error('Failed to create note', error);
        }
    }, [navigate, setNotes, setIsSidebarOpen]);

    const handleDeleteNote = useCallback(
        async (id: string) => {
            try {
                const res = await apiClient.delete(`/api/notes/${id}`);
                if (res.ok) {
                    setNotes(prev => prev.filter(n => n.id !== id));
                    if (window.location.pathname.includes(id)) {
                        navigate('/app/notes', {
                            state: { sidebarOpen: isSidebarOpenRef.current },
                        });
                    }
                }
            } catch (error) {
                logger.error('Failed to delete note', error);
            }
        },
        [navigate, setNotes]
    );

    const handleUpdateNoteTitle = useCallback(
        async (id: string, title: string) => {
            // 1. Optimistic Update
            setNotes(prev => {
                const newNotes = prev.map(n =>
                    n.id === id ? { ...n, title, updatedAt: new Date().toISOString() } : n
                );
                setCachedNotes(newNotes);
                return newNotes;
            });

            // 2. API Call (Debouncing is handled by caller)
            try {
                await apiClient.request(`/api/notes/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title }),
                });
                window.dispatchEvent(new CustomEvent('note-update', { detail: { id, title } }));
            } catch (error) {
                logger.error('Failed to update note title', error);
                // Revert on error? For now, let's keep it simple. User will see error on refresh.
                fetchNotes(); // unexpected error, sync with server
            }
        },
        [setNotes, fetchNotes]
    ); // fetchNotes as fail-safe ref

    // Context value to share with child routes
    const contextValue = useMemo<AppLayoutContextType>(
        () => ({
            user,
            currentSessionId: !isNotesPath ? currentActiveId : null,
            isSidebarOpen,
            setIsSidebarOpen,
            sessions,
            notes,
            handleSessionSelect,
            handleNoteSelect,
            handleDeleteSession,
            handleRenameSession,
            handleUpdateSessionTitle,
            handleCreateNote,
            handleDeleteNote,
            handleUpdateNoteTitle, // Export new handler
            refreshSessions: fetchSessions,
            refreshNotes: fetchNotes,
            isLoadingNotes,
        }),
        [
            user,
            isNotesPath,
            currentActiveId,
            isSidebarOpen,
            setIsSidebarOpen,
            sessions,
            notes,
            isLoadingNotes, // Add to dep array
            handleSessionSelect,
            handleNoteSelect,
            handleDeleteSession,
            handleRenameSession,
            handleUpdateSessionTitle,
            handleCreateNote,
            handleDeleteNote,
            handleUpdateNoteTitle,
            fetchSessions,
            fetchNotes,
        ]
    );

    return (
        <SocketProvider>
            <NotificationProvider>
                <ErrorBoundary>
                    <ChatProvider
                        initialSessionId={!isNotesPath ? currentActiveId : null}
                        initialSession={sessions.find(s => s.id === currentActiveId) || undefined}
                        onSessionIdChange={handleSessionSelect}
                        initialMessages={(location.state as any)?.initialMessages}
                        onSessionCreated={handleSessionCreated}
                        onSessionUpdate={handleSessionUpdate}
                        initialSkipFetch={(location.state as any)?.skipFetch}
                    >
                        <div
                            className={`app-dashboard ${isSidebarOpen && !new URLSearchParams(location.search).get('hideSidebar') ? 'sidebar-open' : ''}`}
                        >
                            <NetworkStatusBar />
                            <div
                                className={`loading-line ${loadingClass}`}
                                style={{
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    zIndex: 9999,
                                }}
                            ></div>

                            {/* Render Outlet with Context */}
                            {/* Problem: If isSidebarOpen changes, contextValue changes, Outlet re-renders. */}
                            {/* We rely on Child components (ChatInterface) being React.memo so they only re-render if THEIR specific props change. */}
                            {/* And we made the handler props stable! */}

                            {isSidebarOpen && (
                                <div
                                    className="mobile-overlay"
                                    onClick={() => setIsSidebarOpen(false)}
                                />
                            )}

                            {!new URLSearchParams(location.search).get('hideSidebar') && (
                                <AppSidebar
                                    user={user}
                                    isOpen={isSidebarOpen}
                                    setIsOpen={setIsSidebarOpen}
                                    // Session Props
                                    currentSessionId={!isNotesPath ? currentActiveId : null}
                                    onSessionSelect={handleSessionSelect}
                                    sessions={sessions}
                                    isLoading={isLoadingSessions}
                                    onDeleteSession={handleDeleteSession}
                                    onRenameSession={handleRenameSession}
                                    // Note Props
                                    notes={notes}
                                    isLoadingNotes={isLoadingNotes}
                                    onNoteSelect={handleNoteSelect}
                                    onCreateNote={handleCreateNote}
                                    onDeleteNote={handleDeleteNote}
                                    onRenameNote={handleUpdateNoteTitle}
                                />
                            )}

                            <main className="dashboard-main">
                                <Outlet context={contextValue} />
                            </main>
                        </div>
                    </ChatProvider>
                </ErrorBoundary>
            </NotificationProvider>
        </SocketProvider>
    );
};

export default AppLayout;
