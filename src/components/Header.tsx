import { Link, useLocation } from 'react-router-dom';
import './Header.css';

const Header = () => {
    const location = useLocation();

    return (
        <header className="header">
            <div className="container header-content">
                <Link
                    to="/"
                    className="logo-section"
                    style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                    }}
                >
                    <div className="logo-icon">
                        <img
                            src="/logo.png"
                            alt="Tainiex"
                            className="logo-image"
                            style={{ height: '48px', width: 'auto', borderRadius: '8px' }}
                        />
                    </div>
                </Link>

                <nav className="nav-links"></nav>

                <div className="header-actions">
                    {location.pathname !== '/login' && (
                        <Link to="/login" className="btn btn-adaptive btn-sm">
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
