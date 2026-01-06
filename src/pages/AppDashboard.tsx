import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import AppSidebar from '../components/AppSidebar';
import ChatInterface from '../components/ChatInterface';
import { NotificationProvider } from '../contexts/NotificationContext';
import ErrorBoundary from '../components/ErrorBoundary';
import NotificationContainer from '../components/NotificationContainer';
import './AppDashboard.css';
import { IUser } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';


const AppDashboard = () => {
    const { sessionId } = useParams<{ sessionId?: string }>();
    const [user, setUser] = useState<IUser | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Lifted session state
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();

    // Sync state with URL if URL changes externally (e.g. forward/back buttons)
    useEffect(() => {
        if (sessionId !== undefined && sessionId !== currentSessionId) {
            setCurrentSessionId(sessionId);
        } else if (sessionId === undefined && currentSessionId !== null) {
            setCurrentSessionId(null);
        }
    }, [sessionId, currentSessionId]);

    const handleSessionSelect = (id: string | null) => {
        if (id) {
            navigate(`/app/${id}`);
        } else {
            navigate('/app');
        }
    };

    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const res = await apiClient.get('/api/chat/sessions');
            if (res.ok) {
                const data = await res.json();
                console.log('[Debug] Fetched sessions:', data);
                setSessions(data.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            }
        } catch (error) {
            console.error('Failed to fetch chat sessions:', error);
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
                    // Small delay to prevent rapid loops in case of race conditions
                    setTimeout(() => {
                        if (isMounted) navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
                    }, 500);
                }
            } catch (err) {
                if (isMounted) navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
            } finally {
                if (isMounted) setIsLoadingAuth(false);
            }
        };

        checkAuth();
        return () => { isMounted = false; };
    }, [navigate]);

    const handleDeleteSession = async (id: string) => {
        try {
            // Optimistic check: are we deleting the active session?
            const isDeletingCurrent = currentSessionId === id;

            // Navigate away immediately if it's the current session to prevent glitches
            if (isDeletingCurrent) {
                handleSessionSelect(null);
            }

            const res = await apiClient.delete(`/api/chat/sessions/${id}`);
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.id !== id));
            } else {
                // Determine if we should revert navigation or show error?
                // For simplicity, just log error. Ideally show a toast.
                console.error('Failed to delete session (API error)');
                // If it failed and we navigated away, the user just finds themselves on the new chat screen. 
                // This is an acceptable failure mode compared to being stuck on a broken chat.
            }
        } catch (error) {
            console.error('Failed to delete session', error);
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
            console.error('Failed to rename session', error);
        }
    };

    // Find current session object for shared state usage (e.g. title in ChatInterface)
    const currentSession = sessions.find(s => s.id === currentSessionId);

    const handleSessionUpdate = (title?: string) => {
        if (title && currentSessionId) {
            setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title } : s));
        }
        // Always refresh the full list to stay in sync or handle new sessions
        fetchSessions();
    };

    return (
        <NotificationProvider>
            <ErrorBoundary>
                <div className={`app-dashboard ${isSidebarOpen ? 'sidebar-open' : ''}`}>
                    {isLoadingAuth && <div className="loading-line" style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 9999 }}></div>}
                    {isSidebarOpen && (
                        <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)} />
                    )}
                    <AppSidebar
                        user={user}
                        isOpen={isSidebarOpen}
                        setIsOpen={setIsSidebarOpen}
                        currentSessionId={currentSessionId}
                        onSessionSelect={(id) => {
                            handleSessionSelect(id);
                            setIsSidebarOpen(false); // Close on selection on mobile
                        }}
                        sessions={sessions}
                        isLoading={isLoadingSessions}
                        onDeleteSession={handleDeleteSession}
                        onRenameSession={handleRenameSession}
                    />
                    <main className="dashboard-main">
                        <ChatInterface
                            user={user}
                            onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            currentSessionId={currentSessionId}
                            setCurrentSessionId={handleSessionSelect}
                            currentSession={currentSession}
                            onSessionCreated={fetchSessions} // Refresh list on new chat creation
                            onSessionUpdate={handleSessionUpdate}
                        />
                    </main>
                </div>
                <NotificationContainer />
            </ErrorBoundary>
        </NotificationProvider>
    );
};

export default AppDashboard;
