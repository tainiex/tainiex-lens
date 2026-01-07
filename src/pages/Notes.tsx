import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppSidebar from '../components/AppSidebar';
import NoteEditor from '../components/NoteEditor';
import { NotificationProvider } from '../contexts/NotificationContext';
import ErrorBoundary from '../components/ErrorBoundary';
import './AppDashboard.css'; // Reusing dashboard styles for layout
import { IUser } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

import { useLoadingAnimation } from '../hooks/useLoadingAnimation';

const Notes = () => {
    const [user, setUser] = useState<IUser | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const loadingClass = useLoadingAnimation(isLoadingAuth);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Session state for sidebar
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    const navigate = useNavigate();

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

    useEffect(() => {
        let isMounted = true;
        const checkAuth = async () => {
            try {
                const res = await apiClient.get('/api/profile');
                if (!isMounted) return;

                if (res.ok) {
                    const data = await res.json();
                    setUser(data as IUser);
                    fetchSessions();
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
        return () => { isMounted = false; };
    }, [navigate]);

    const handleSessionSelect = (id: string | null) => {
        if (id) {
            navigate(`/app/${id}`);
        } else {
            navigate('/app');
        }
    };

    // Sidebar handlers (dup logic for now)
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

    return (
        <NotificationProvider>
            <ErrorBoundary>
                <div className={`app-dashboard ${isSidebarOpen ? 'sidebar-open' : ''}`}>
                    <div className={`loading-line ${loadingClass}`} style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 9999 }}></div>
                    {isSidebarOpen && (
                        <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)} />
                    )}
                    <AppSidebar
                        user={user}
                        isOpen={isSidebarOpen}
                        setIsOpen={setIsSidebarOpen}
                        currentSessionId={null} // We are in Notes, no chat session active
                        onSessionSelect={(id) => {
                            handleSessionSelect(id);
                            setIsSidebarOpen(false);
                        }}
                        sessions={sessions}
                        isLoading={isLoadingSessions}
                        onDeleteSession={handleDeleteSession}
                        onRenameSession={handleRenameSession}
                    />
                    <main className="dashboard-main" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                            padding: '1rem 2rem',
                            borderBottom: '1px solid var(--border-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            height: '60px'
                        }}>
                            <button
                                className="mobile-menu-btn"
                                onClick={() => setIsSidebarOpen(true)}
                                style={{ marginRight: '1rem', display: 'none' /* handled by css media query usually but let's replicate logic if needed or rely on global AppDashboard.css */ }}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            </button>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Notes</h2>
                        </div>
                        <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'hidden' }}>
                            <NoteEditor />
                        </div>
                    </main>
                </div>
            </ErrorBoundary>
        </NotificationProvider>
    );
};

export default Notes;
