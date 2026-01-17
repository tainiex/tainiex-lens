import { useEffect, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { GoogleLoginDto } from '@tainiex/shared-atlas';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../utils/msalConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import './Login.css';
import { apiClient, logger } from '@/shared';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [inviteRequired, setInviteRequired] = useState(false);
    const [pendingToken, setPendingToken] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [pendingProvider, setPendingProvider] = useState<'google' | 'microsoft' | null>(null);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await apiClient.get('/api/profile', {
                    retryCount: 0,
                });
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
        setIsLoading(true); // Start loading immediately
        instance
            .loginPopup(loginRequest)
            .then(async response => {
                logger.debug('Microsoft Login Response:', response);
                if (response.accessToken) {
                    setIsLoading(true); // Show loading while verifying with backend
                    try {
                        const res = await apiClient.post('/api/auth/microsoft', {
                            accessToken: response.accessToken,
                            idToken: response.idToken,
                        });

                        // Attempt to parse JSON response
                        const data = await res.json();

                        if (res.ok) {
                            if (data.requiresInvite) {
                                setInviteRequired(true);
                                setPendingProvider('microsoft');
                                const token = data.signupToken || data.token || data.pendingToken;
                                if (token) setPendingToken(token);
                                setIsLoading(false); // Stop loading to show invite form
                            } else {
                                const params = new URLSearchParams(location.search);
                                const redirect = params.get('redirect');
                                navigate(redirect || '/app');
                                // Keep loading true during redirect
                            }
                        } else {
                            setIsLoading(false); // Stop loading on error
                            if (data.requiresInvite) {
                                setInviteRequired(true);
                                setPendingProvider('microsoft');
                                const token = data.signupToken || data.token || data.pendingToken;
                                if (token) setPendingToken(token);
                            } else {
                                logger.error('Microsoft backend auth failed', data);
                                setErrorMsg('Authentication failed');
                            }
                        }
                    } catch (error) {
                        setIsLoading(false); // Stop loading on error
                        logger.error('Microsoft login error:', error);
                        setErrorMsg('Login error occurred');
                    }
                }
            })
            .catch(e => {
                setIsLoading(false); // Reset loading on error/cancel
                logger.error(e);
            });
    };

    const login = useGoogleLogin({
        flow: 'auth-code',
        redirect_uri: window.location.origin + '/login',
        onSuccess: async codeResponse => {
            if (codeResponse.code) {
                setIsLoading(true); // Show loading while verifying
                try {
                    const payload: GoogleLoginDto = { code: codeResponse.code };
                    const res = await apiClient.post('/api/auth/google', payload);

                    // Start by trying to parse JSON
                    const data = await res.json();
                    logger.debug('Login response:', data);

                    if (res.ok) {
                        if (data.requiresInvite) {
                            setInviteRequired(true);
                            setPendingProvider('google');
                            const token = data.signupToken || data.token || data.pendingToken;
                            if (token) setPendingToken(token);
                            setIsLoading(false); // Stop loading to show invite form
                        } else {
                            const params = new URLSearchParams(location.search);
                            const redirect = params.get('redirect');
                            navigate(redirect || '/app');
                            // Keep loading true
                        }
                    } else {
                        setIsLoading(false); // Stop loading on error
                        if (data.requiresInvite) {
                            setInviteRequired(true);
                            setPendingProvider('google');
                            const token = data.signupToken || data.token || data.pendingToken;
                            if (token) setPendingToken(token);
                        } else {
                            logger.error('Backend authentication failed', data);
                            setErrorMsg('Authentication failed');
                        }
                    }
                } catch (error) {
                    setIsLoading(false);
                    logger.error('Login error:', error);
                    setErrorMsg('Login error occurred');
                }
            }
        },
        onError: () => {
            setIsLoading(false);
            logger.log('Login Failed');
        },
    });

    const handleSignup = async () => {
        if (!inviteCode.trim()) return;

        try {
            const endpoint =
                pendingProvider === 'microsoft'
                    ? '/api/auth/microsoft/signup'
                    : '/api/auth/google/signup';

            const res = await apiClient.post(endpoint, {
                invitationCode: inviteCode,
                signupToken: pendingToken,
            });

            if (res.ok) {
                // ... same logic as before ...
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
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100vh',
                        width: '100%',
                        background: 'var(--bg-primary)',
                    }}
                >
                    <div className="loading-spinner large" style={{ marginBottom: '1.5rem' }}></div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Checking authentication...
                    </p>
                    <button
                        onClick={() => setIsLoading(false)}
                        style={{
                            marginTop: '1.5rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            textDecoration: 'underline',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <div className="login-content">
                    <h1 className="login-title">Sign in to Tainiex</h1>

                    {inviteRequired ? (
                        <div
                            className="invite-form-container"
                            style={{
                                width: '100%',
                                maxWidth: '320px',
                                margin: '0 auto',
                                textAlign: 'center',
                                animation: 'fadeIn 0.3s ease-out',
                            }}
                        >
                            <h2
                                style={{
                                    fontSize: '1.1rem',
                                    marginBottom: '0.75rem',
                                    color: 'var(--text-primary)',
                                    fontWeight: 500,
                                }}
                            >
                                Invitation Required
                            </h2>
                            <p
                                style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.9rem',
                                    marginBottom: '1.5rem',
                                    lineHeight: 1.5,
                                }}
                            >
                                Please enter your invitation code to complete registration.
                            </p>
                            <input
                                type="text"
                                placeholder="Enter Invite Code"
                                value={inviteCode}
                                onChange={e => setInviteCode(e.target.value)}
                                style={{
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-primary)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '1rem',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    marginBottom: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => (e.target.style.borderColor = 'var(--accent-color)')}
                                onBlur={e => (e.target.style.borderColor = 'var(--border-primary)')}
                            />
                            {errorMsg && (
                                <p
                                    style={{
                                        color: '#ff6b6b',
                                        fontSize: '0.85rem',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    {errorMsg}
                                </p>
                            )}
                            <div
                                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                            >
                                <button
                                    className="btn-social"
                                    onClick={handleSignup}
                                    style={{
                                        justifyContent: 'center',
                                        background: '#8b5cf6',
                                        color: 'white',
                                        width: '100%',
                                        border: 'none',
                                        marginTop: '0.5rem',
                                        fontWeight: 600,
                                        fontSize: '0.95rem',
                                    }}
                                >
                                    Complete Signup
                                </button>
                                <button
                                    onClick={() => {
                                        setInviteRequired(false);
                                        setPendingToken('');
                                        setErrorMsg('');
                                        setPendingProvider(null);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        padding: '8px',
                                    }}
                                >
                                    Back to Login
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="login-actions">
                            <button
                                className="btn-social"
                                onClick={() => {
                                    setIsLoading(true);
                                    login();
                                }}
                                style={{ fontFamily: 'Roboto, arial, sans-serif' }}
                            >
                                <svg
                                    className="social-icon"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Continue with Google
                            </button>

                            <button
                                className="btn-social"
                                onClick={handleMicrosoftLogin}
                                style={{ fontFamily: 'Segoe UI, Roboto, arial, sans-serif' }}
                            >
                                <svg
                                    className="social-icon"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 21 21"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path fill="#F25022" d="M1 1h9v9H1z" />
                                    <path fill="#00A4EF" d="M1 11h9v9H1z" />
                                    <path fill="#7FBA00" d="M11 1h9v9H11z" />
                                    <path fill="#FFB900" d="M11 11h9v9H11z" />
                                </svg>
                                Continue with Microsoft
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Login;
