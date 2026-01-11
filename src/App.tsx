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
import { initializeGlobalListeners } from './utils/socketManager';
import './App.css';

function App() {
  // Initialize global lifecycle listeners for shared Socket.IO Manager
  useEffect(() => {
    // Start global socket connection
    import('./services/SocketService').then(({ socketService }) => {
      socketService.connect();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        import('./services/SocketService').then(({ socketService }) => {
          socketService.connect(); // Reconnect if needed
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      import('./services/SocketService').then(({ socketService }) => {
        socketService.disconnect();
      });
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
          <Route path="*" element={
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
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
