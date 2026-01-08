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
import { ThemeProvider } from './contexts/ThemeContext';
import { initializeGlobalListeners, disconnectAllSockets } from './utils/socketManager';
import './App.css';

function App() {
  // Initialize global lifecycle listeners for shared Socket.IO Manager
  useEffect(() => {
    const cleanup = initializeGlobalListeners();

    // Cleanup on app unmount
    return () => {
      cleanup();
      disconnectAllSockets();
    };
  }, []);

  return (
    <Router>
      <ThemeProvider>
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
      </ThemeProvider>
    </Router>
  );
}

export default App;
