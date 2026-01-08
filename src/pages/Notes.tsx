import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppSidebar from '../components/AppSidebar';
import NoteEditor from '../components/NoteEditor';
import { NotificationProvider } from '../contexts/NotificationContext';
import ErrorBoundary from '../components/ErrorBoundary';
import './AppDashboard.css'; // Reusing dashboard styles for layout
import { IUser } from '@tainiex/tainiex-shared';
import type { INote } from '../types/collaboration';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

import { useLoadingAnimation } from '../hooks/useLoadingAnimation';

import { getCachedNotes, setCachedNotes } from '../utils/noteCache';

const Notes = () => {
    const [user, setUser] = useState<IUser | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const loadingClass = useLoadingAnimation(isLoadingAuth);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Session state
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    // Notes state: Initialize from Cache if available
    const [notes, setNotes] = useState<INote[]>(() => getCachedNotes() || []);
    // If we have cached notes, we are not "loading" in the blocking sense.
    // We still fetch in background, but UI is ready.
    const [isLoadingNotes, setIsLoadingNotes] = useState(() => !getCachedNotes());

    const navigate = useNavigate();
    const params = useParams();
    // [FIX] Handle wildcard route: /app/notes/123 -> params["*"] = "123"
    const noteId = params["*"] || params.noteId; // Fallback to noteId if explicit param used elsewhere

    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const res = await apiClient.get('/api/chat/sessions');
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            }
        } catch (error) {
            logger.error('Failed to fetch chat sessions:', error);
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const fetchNotes = async () => {
        // [FIX] Background Refresh Strategy
        // Only set blocking loading state if we have NO data.
        // If we have data, we silently update.
        if (notes.length === 0) {
            setIsLoadingNotes(true);
        }
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
                } else {
                    logger.warn('Unexpected notes API response format:', data);
                }

                const sortedNotes = notesArray.sort((a: INote, b: INote) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                setNotes(sortedNotes);
                setCachedNotes(sortedNotes); // Update cache
            }
        } catch (error) {
            logger.error('Failed to fetch notes:', error);
        } finally {
            setIsLoadingNotes(false);
        }
    };

    useEffect(() => {
        console.log('[DEBUG_TRACE] [Notes Page] MOUNTED. NoteId:', noteId);
        let isMounted = true;
        const checkAuth = async () => {
            try {
                const res = await apiClient.get('/api/profile');
                if (!isMounted) return;

                if (res.ok) {
                    const data = await res.json();
                    setUser(data as IUser);
                    // Fetch both sessions and notes
                    fetchSessions();
                    fetchNotes();
                } else {
                    setTimeout(() => {
                        if (isMounted) navigate('/login');
                    }, 500);
                }
            } catch (err) {
                if (isMounted) navigate('/login');
            } finally {
                if (isMounted) setIsLoadingAuth(false);
            }
        };

        checkAuth();
        return () => {
            console.log('[DEBUG_TRACE] [Notes Page] UNMOUNTED. NoteId:', noteId);
            isMounted = false;
        };
    }, [navigate]); // navigate is stable, so this only runs on mount/unmount

    const handleSessionSelect = (id: string | null) => {
        if (id) {
            navigate(`/app/${id}`);
        } else {
            navigate('/app');
        }
    };

    const handleNoteSelect = (id: string | null) => {
        if (id) {
            navigate(`/app/notes/${id}`);
        } else {
            navigate('/app/notes');
        }
    };

    const handleCreateNote = async () => {
        try {
            const res = await apiClient.post('/api/notes', {
                title: 'Untitled Note',
                isPublic: false
            });
            if (res.ok) {
                const newNote = await res.json();
                setNotes(prev => [newNote, ...prev]);
                navigate(`/app/notes/${newNote.id}`);
            }
        } catch (error) {
            logger.error('Failed to create note', error);
        }
    };

    const handleDeleteNote = async (id: string) => {
        try {
            const res = await apiClient.delete(`/api/notes/${id}`);
            if (res.ok) {
                setNotes(prev => prev.filter(n => n.id !== id));
                // If we were on this note, navigate away
                if (window.location.pathname.includes(id)) {
                    navigate('/app/notes');
                }
            }
        } catch (error) {
            logger.error('Failed to delete note', error);
        }
    };

    // Sidebar handlers
    const handleDeleteSession = async (id: string) => {
        try {
            const res = await apiClient.delete(`/api/chat/sessions/${id}`);
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            logger.error('Failed to delete session', error);
        }
    };

    const handleRenameSession = async (id: string, newTitle: string) => {
        try {
            const res = await apiClient.request(`/api/chat/sessions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (res.ok) {
                setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s));
            }
        } catch (error) {
            logger.error('Failed to rename session', error);
        }
    };

    // Find active note
    const activeNote = notes.find(n => n.id === noteId);

    const handleTitleChange = async (newTitle: string) => {
        if (!noteId) return;

        // Optimistic update
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: newTitle } : n));

        try {
            await apiClient.request(`/api/notes/${noteId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
        } catch (error) {
            logger.error('Failed to update note title', error);
            // Revert on error? Or just log. For now, log.
        }
    };

    return (
        <NotificationProvider>
            <ErrorBoundary>
                <div className={`app-dashboard ${isSidebarOpen ? 'sidebar-open' : ''}`}>
                    {/* ... sidebar ... */}
                    <div className={`loading-line ${loadingClass}`} style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 9999 }}></div>
                    {isSidebarOpen && (
                        <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)} />
                    )}
                    <AppSidebar
                        user={user}
                        isOpen={isSidebarOpen}
                        setIsOpen={setIsSidebarOpen}
                        currentSessionId={null}
                        onSessionSelect={(id) => {
                            handleSessionSelect(id);
                            setIsSidebarOpen(false);
                        }}
                        sessions={sessions}
                        isLoading={isLoadingSessions}
                        onDeleteSession={handleDeleteSession}
                        onRenameSession={handleRenameSession}
                        // Notes props
                        notes={notes}
                        isLoadingNotes={isLoadingNotes}
                        onNoteSelect={(id) => {
                            handleNoteSelect(id);
                            setIsSidebarOpen(false);
                        }}
                        onCreateNote={handleCreateNote}
                        onDeleteNote={handleDeleteNote}
                    />
                    <main className="dashboard-main" style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Mobile Header for Navigation - Only show when no note is selected (Editor has its own header) */}
                        {!noteId && (
                            <div className="mobile-header" style={{
                                padding: '0 1rem',
                                // Actually, if we put display:flex here, we might override display:none from CSS class on Desktop?
                                // CSS class has .mobile-header { display: none } then @media { display: flex }.
                                // Inline style overrides CSS class!
                                // So we MUST NOT set display here if we want it hidden on desktop.
                                // But wait, on mobile we want flex.
                                // Let's rely on CSS for display, but set other layout props here.
                                alignItems: 'center',
                                justifyContent: 'center', // Center the title
                                position: 'relative', // For absolute positioning of button
                                borderBottom: '1px solid var(--border-primary)',
                                height: '60px',
                                minHeight: '60px'
                            }}>
                                <button
                                    className="mobile-menu-btn"
                                    onClick={() => setIsSidebarOpen(true)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0.5rem',
                                        display: 'flex',
                                        color: 'var(--text-primary)',
                                        position: 'absolute',
                                        left: '1rem',
                                        zIndex: 1
                                    }}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="3" y1="12" x2="21" y2="12"></line>
                                        <line x1="3" y1="6" x2="21" y2="6"></line>
                                        <line x1="3" y1="18" x2="21" y2="18"></line>
                                    </svg>
                                </button>
                                <span style={{
                                    fontWeight: 600,
                                    fontSize: '1.1rem',
                                    whiteSpace: 'nowrap' // Prevent line break
                                }}>Notes</span>
                            </div>
                        )}

                        <div style={{ flex: 1, padding: 0, overflowY: 'hidden' }}>
                            {/* [FIX] Reverted blocking check to prevents sidebar flicker. Title flash handled in NoteEditor */}
                            {noteId ? (
                                <NoteEditor
                                    key={noteId} // [FIX] Force remount on note switch to reset Tiptap
                                    noteId={noteId}
                                    title={activeNote?.title}
                                    onTitleChange={handleTitleChange}
                                    onMobileMenuClick={() => setIsSidebarOpen(true)}
                                    isLoading={isLoadingNotes} // [FIX] Pass loading state to show title skeleton
                                />
                            ) : (
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-tertiary)',
                                    gap: '1rem'
                                }}>
                                    <div style={{ fontSize: '3rem' }}>📝</div>
                                    <p>Select a note to view or create a new one</p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </ErrorBoundary>
        </NotificationProvider>
    );
};

export default Notes;
