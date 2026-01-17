import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './components/Header';
import Background from './components/Background';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import GoogleCallback from './pages/GoogleCallback';
import AppLayout from './layouts/AppLayout';
import AppDashboard from './pages/AppDashboard';
import Notes from './pages/Notes';

import './App.css';

import { socketService, apiClient, logger } from '@/shared';

// [FIX] Configure SocketService and ApiClient synchronously before App mounts
// This prevents the race condition where AppLayout checks auth before client is ready.
const config = { baseUrl: import.meta.env.VITE_API_BASE_URL || window.location.origin };
socketService.configure(config);
apiClient.configure(config);

function App() {
    // Initialize global lifecycle listeners
    useEffect(() => {
        // Function to attempt socket connection
        const attemptConnection = (force: boolean = false) => {
            logger.debug(`[App] Attempting socket connection (force=${force})...`);
            // Check if we are in a WebView and expecting a token injection
            // If window.APP_AuthToken is defined, use it.
            // If we are in standard web, proceed as normal (cookie/localStorage).
            if ((window as any).APP_AuthToken) {
                logger.debug('[App] Found window.APP_AuthToken, setting it to apiClient...');
                apiClient.setAuthToken((window as any).APP_AuthToken);
            } else {
                logger.debug('[App] No window.APP_AuthToken found. Using existing persistence.');
            }
            socketService.connect(force);
        };

        // If 'APP_AUTH_TOKEN_READY' fires, it means we are in WebView and token just arrived.
        const handleTokenReady = () => {
            logger.debug('[App] Received APP_AUTH_TOKEN_READY event! Socket reconnecting...');

            // Critical: Force disconnect existing socket so it reconnects with the NEW token
            socketService.disconnect();

            // Wait a tick for disconnect to process? Or just force valid connection
            setTimeout(() => {
                attemptConnection(true);
            }, 100);
        };

        window.addEventListener('APP_AUTH_TOKEN_READY', handleTokenReady);

        // Standard Visibility Listener
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                attemptConnection(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Initial Connection Attempt:
        attemptConnection(false);

        return () => {
            window.removeEventListener('APP_AUTH_TOKEN_READY', handleTokenReady);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            socketService.disconnect();
        };
    }, []);

    return (
        <Router>
            <div className="app">
                <Routes>
                    <Route path="/app" element={<AppLayout />}>
                        <Route index element={<Navigate to="/app/chats" replace />} />
                        <Route path="chats" element={<AppDashboard />} />
                        <Route path="chats/:sessionId" element={<AppDashboard />} />
                        <Route path="notes" element={<Notes />} />
                        <Route path="notes/*" element={<Notes />} />
                    </Route>
                    <Route
                        path="*"
                        element={
                            <div className="layout-public">
                                <Background />
                                <Header />
                                <main className="main-content">
                                    <Routes>
                                        <Route path="/" element={<Home />} />
                                        <Route path="/login" element={<Login />} />
                                        <Route path="/google-oauth" element={<GoogleCallback />} />
                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </main>
                                <Footer />
                            </div>
                        }
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
