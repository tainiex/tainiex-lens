
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

const Header = () => {
  const location = useLocation();

  return (
    <header className="header">
      <div className="container header-content">
        <div className="logo-section">
          <div className="logo-icon">
            <img src="/logo.png" alt="Tainiex" className="logo-image" style={{ height: '32px', width: 'auto', borderRadius: '6px' }} />
          </div>
          <Link to="/" className="logo-text" style={{ textDecoration: 'none', color: 'inherit' }}>Tainiex AI</Link>
        </div>

        <nav className="nav-links">
        </nav>

        <div className="header-actions">
          {location.pathname !== '/login' && (
            <Link to="/login" className="btn btn-adaptive btn-sm">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
