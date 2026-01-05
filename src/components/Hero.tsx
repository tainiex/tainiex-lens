
import { Link } from 'react-router-dom';
import './Hero.css';

const Hero = () => {
    return (
        <section className="hero-section">
            <div className="container hero-container">
                <h1 className="hero-title">
                    Your Personal AI Memory &<br />
                    Knowledge Infrastructure
                </h1>
                <p className="hero-subtitle">
                    A long-term AI system that compounds in value the more you use it.
                </p>

                <div className="hero-actions">
                    <Link to="/login" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>Login</Link>
                </div>
            </div>
        </section>
    );
};

export default Hero;
