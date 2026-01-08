import { useEffect, useCallback } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import ChatInterface from '../components/ChatInterface';
import { AppLayoutContextType } from '../layouts/AppLayout';
// import { NotificationProvider } from '../contexts/NotificationContext'; // Provider is in Layout now
import './AppDashboard.css';

const AppDashboard = () => {
    const { sessionId } = useParams<{ sessionId?: string }>();
    const navigate = useNavigate();

    // Consume data from Layout
    const {
        user,
        currentSessionId, // This might be null if URL doesn't have ID, but layout parses it
        sessions,
        setIsSidebarOpen,
        handleSessionSelect,
        handleRenameSession, // We might need this if ChatInterface handles renaming?
        refreshSessions
    } = useOutletContext<AppLayoutContextType>();

    // ChatInterface expects `currentSessionId` state to be managed locally or passed.
    // In our original code, `currentSessionId` was local state in AppDashboard.
    // Now `AppLayout` has `currentSessionId` derived from URL logic too, or we can keep it local for flexibility?
    // Actually, `AppLayout` logic `!isNotesPath ? currentActiveId : null` might be enough.
    // But `ChatInterface` takes `setCurrentSessionId` which navigates.

    // Original AppDashboard logic:
    // Sync state with URL if URL changes externally (e.g. forward/back buttons)
    // useEffect(() => {
    //     if (sessionId !== undefined && sessionId !== currentSessionId) {
    //         setCurrentSessionId(sessionId);
    //     } ...
    // }, [sessionId, currentSessionId]);

    // Since we navigate in `handleSessionSelect`, the URL updates, and `AppLayout` updates `currentSessionId`.
    // So we can just use the prop from context.

    // However, `ChatInterface` expects `setCurrentSessionId` callback.
    // We can pass `handleSessionSelect` from context.

    // Find current session object
    // Use the ID from params directly to be safe, or from context.
    // Using sessionId from params is safer for immediate consistency with URL.
    const activeSessionId = sessionId || null;
    const currentSession = sessions.find(s => s.id === activeSessionId);

    // [FIX] Memoize handlers to prevent ChatInterface re-render when Sidebar opens
    const handleMenuClick = useCallback(() => setIsSidebarOpen(true), [setIsSidebarOpen]);
    const handleSessionUpdate = useCallback((title?: string) => {
        refreshSessions();
    }, [refreshSessions]);

    // Note: ChatInterface should be React.memo-ized in its own file
    return (
        // NotificationProvider and ErrorBoundary are in Layout
        <div className="chat-view-container" style={{ height: '100%', width: '100%' }}>
            <ChatInterface
                user={user}
                onMenuClick={handleMenuClick}
                currentSessionId={activeSessionId}
                setCurrentSessionId={handleSessionSelect} // Stable from context
                currentSession={currentSession}
                onSessionCreated={refreshSessions} // Stable from context
                onSessionUpdate={handleSessionUpdate}
            />
        </div>
    );
};

export default AppDashboard;
