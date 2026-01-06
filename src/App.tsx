import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Background from './components/Background';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import GoogleCallback from './pages/GoogleCallback';
import AppDashboard from './pages/AppDashboard';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

function App() {
  return (
    <Router>
      <ThemeProvider>
        <div className="app">
          <Routes>
            <Route path="/app" element={<AppDashboard />} />
            <Route path="/app/:sessionId" element={<AppDashboard />} />
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
