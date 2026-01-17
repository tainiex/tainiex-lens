import { useEffect, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import ChatInterface from '../components/ChatInterface';
import { AppLayoutContextType } from '../layouts/AppLayout';
// import { NotificationProvider } from '../contexts/NotificationContext'; // Provider is in Layout now
import './AppDashboard.css';

const AppDashboard = () => {
    const { sessionId } = useParams<{ sessionId?: string }>();
    // Consume data from Layout
    const { user, setIsSidebarOpen } = useOutletContext<AppLayoutContextType>();

    // [FIX] Memoize handlers to prevent ChatInterface re-render
    const handleMenuClick = useCallback(() => setIsSidebarOpen(true), [setIsSidebarOpen]);

    // [FIX] Restore activeSessionId definition
    const activeSessionId = sessionId || null;

    // Clean up timeout
    useEffect(() => {
        return () => {
            // Cleanup logic if needed, currently empty but keeping for structure
        };
    }, []);

    // Note: ChatInterface should be React.memo-ized in its own file
    return (
        // NotificationProvider and ErrorBoundary are in Layout
        <div className="chat-view-container" style={{ height: '100%', width: '100%' }}>
            <ChatInterface
                key={activeSessionId || 'new-chat'}
                user={user}
                onMenuClick={handleMenuClick}
            />
        </div>
    );
};

export default AppDashboard;
