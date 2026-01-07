import { useEffect, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../utils/msalConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import './Login.css';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [inviteRequired, setInviteRequired] = useState(false);
    const [pendingToken, setPendingToken] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await apiClient.get('/api/profile');
                if (res.ok) {
                    const params = new URLSearchParams(location.search);
                    const redirect = params.get('redirect');
                    navigate(redirect || '/app');
                    // Keep loading true while redirecting
                } else {
                    // Not valid session, show login form
                    setIsLoading(false);
                }
            } catch (error) {
                // If checking session fails, show login form
                logger.debug('Not logged in or error checking session');
                setIsLoading(false);
            }
        };

        checkSession();
    }, [navigate]);

    const { instance } = useMsal();

    const handleMicrosoftLogin = () => {
        instance.loginPopup(loginRequest)
            .then(async (response) => {
                logger.debug('Microsoft Login Response:', response);
                if (response.accessToken) {
                    try {
                        const res = await apiClient.post('/api/auth/microsoft', {
                            accessToken: response.accessToken,
                            idToken: response.idToken
                        });

                        if (res.ok) {
                            const params = new URLSearchParams(location.search);
                            const redirect = params.get('redirect');
                            navigate(redirect || '/app');
                        } else {
                            const data = await res.json();
                            logger.error('Microsoft backend auth failed', data);
                            setErrorMsg('Authentication failed');
                        }
                    } catch (error) {
                        logger.error('Microsoft login error:', error);
                        setErrorMsg('Login error occurred');
                    }
                }
            })
            .catch((e) => {
                logger.error(e);
            });
    };

    const login = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            if (codeResponse.code) {
                try {
                    const res = await apiClient.post('/api/auth/google', { code: codeResponse.code });

                    // Start by trying to parse JSON, as we need to check the body
                    const data = await res.json();
                    logger.debug('Login response:', data);

                    if (res.ok) {
                        // Even if 200 OK, check if invite is required
                        if (data.requiresInvite) {
                            setInviteRequired(true);
                            // Capture token from various possible keys since backend spec is loose
                            const token = data.signupToken || data.token || data.pendingToken;
                            if (token) setPendingToken(token);
                        } else {
                            // Normal success case - cookies are handled by browser
                            const params = new URLSearchParams(location.search);
                            const redirect = params.get('redirect');
                            navigate(redirect || '/app');
                        }
                    } else {
                        // Error status code
                        if (data.requiresInvite) {
                            setInviteRequired(true);
                            const token = data.signupToken || data.token || data.pendingToken;
                            if (token) setPendingToken(token);
                        } else {
                            logger.error('Backend authentication failed', data);
                            setErrorMsg('Authentication failed');
                        }
                    }
                } catch (error) {
                    logger.error('Login error:', error);
                    setErrorMsg('Login error occurred');
                }
            }
        },
        onError: () => logger.log('Login Failed'),
    });

    const handleSignup = async () => {
        if (!inviteCode.trim()) return;

        try {
            const res = await apiClient.post('/api/auth/google/signup', {
                invitationCode: inviteCode,
                signupToken: pendingToken
            });

            if (res.ok) {
                // Strict Cookie-Only enforcement: Do NOT store token in localStorage
                // const data = await res.json();
                // Strict Cookie-Only enforcement: Do NOT store token in localStorage
                // const token = data.accessToken || data.access_token || data.token;
                // if (token) {
                //     localStorage.setItem('access_token', token);
                // }
                const params = new URLSearchParams(location.search);
                const redirect = params.get('redirect');
                navigate(redirect || '/app');
            } else {
                const data = await res.json();
                setErrorMsg(data.message || 'Invalid invite code');
            }
        } catch (error) {
            logger.error('Signup error:', error);
            setErrorMsg('Signup failed');
        }
    };

    return (
        <div className="login-container">
            {isLoading ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    width: '100%',
                    background: 'var(--bg-primary)'
                }}>
                    <div className="loading-spinner large" style={{ marginBottom: '1.5rem' }}></div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Checking authentication...</p>
                </div>
            ) : (
                <>
                    {inviteRequired && (
                        <div className="invite-modal-overlay">
                            <div className="invite-modal-content">
                                <h2 className="invite-modal-title">Enter Invitation Code</h2>
                                <p style={{ color: '#ccc', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                                    An invitation code is required to complete your registration.
                                </p>
                                <input
                                    type="text"
                                    placeholder="Invite Code"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '1rem',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                {errorMsg && <p style={{ color: '#ff6b6b', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>{errorMsg}</p>}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button
                                        className="btn-social"
                                        onClick={handleSignup}
                                        style={{ justifyContent: 'center', background: 'white', color: 'black', width: '100%' }}
                                    >
                                        Complete Signup
                                    </button>
                                    <button
                                        onClick={() => { setInviteRequired(false); setPendingToken(''); setErrorMsg(''); }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#888',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Back to Login
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="login-content">
                        <h1 className="login-title">Sign in to Tainiex</h1>

                        <div className="login-actions">
                            <button className="btn-social" onClick={() => login()} style={{ fontFamily: 'Roboto, arial, sans-serif' }}>
                                <svg className="social-icon" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </button>

                            <button className="btn-social" onClick={handleMicrosoftLogin} style={{ fontFamily: 'Segoe UI, Roboto, arial, sans-serif' }}>
                                <svg className="social-icon" width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="#F25022" d="M1 1h9v9H1z" />
                                    <path fill="#00A4EF" d="M1 11h9v9H1z" />
                                    <path fill="#7FBA00" d="M11 1h9v9H11z" />
                                    <path fill="#FFB900" d="M11 11h9v9H11z" />
                                </svg>
                                Continue with Microsoft
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Login;
