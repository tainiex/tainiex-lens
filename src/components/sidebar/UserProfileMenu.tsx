import { useState, useRef, useEffect } from 'react';
import { IUser } from '@tainiex/shared-atlas';
import { apiClient, logger } from '@/shared';

interface UserProfileMenuProps {
    user: IUser;
}

const UserProfileMenu = ({ user }: UserProfileMenuProps) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };

        if (isProfileMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProfileMenuOpen]);

    const handleLogout = async () => {
        try {
            // Web relies on Cookies for logout. Sending empty body as backend clears cookies.
            await apiClient.post('/api/auth/logout', {});

            // Clear all auth-related data from localStorage for consistent frontend state
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');

            // Dispatch logout event for other components to react
            window.dispatchEvent(new Event('auth:logout'));

            // Redirect to login page
            window.location.href = '/login';
        } catch (e) {
            logger.error('Logout failed', e);

            // Even if API call fails, clear local state and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.dispatchEvent(new Event('auth:logout'));
            window.location.href = '/login';
        }
    };

    return (
        <div
            className="user-profile"
            ref={profileMenuRef}
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
        >
            {isProfileMenuOpen && (
                <div className="profile-menu">
                    <div
                        className="profile-menu-item"
                        style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 3.64 2.5 2.5 0 0 0 2.16 3.66h.7a2 2 0 0 0 3.8 0h.4a2 2 0 0 0 3.82 0h.7A2.5 2.5 0 0 0 17 9.83a2.5 2.5 0 0 0-1.26-3.7A2.5 2.5 0 0 0 12 4.5z"></path>
                            <path d="M12 14v6"></path>
                            <path d="M9 20h6"></path>
                            <path d="M12 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"></path>
                        </svg>
                        Memories
                    </div>
                    <div
                        className="profile-menu-item"
                        style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M20.5 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3a1.5 1.5 0 0 1 0 3 1.5 1.5 0 0 1 0-3"></path>
                            <path d="M10 21V19a2 2 0 0 1 2-2h3"></path>
                            <path d="M12 3H8a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h3"></path>
                            <path d="M19 14v3a2 2 0 0 1-2 2h-3"></path>
                            <path d="M14 3h3a2 2 0 0 1 2 2v3"></path>
                        </svg>
                        Tools
                    </div>
                    <div
                        className="profile-menu-item danger"
                        onClick={e => {
                            e.stopPropagation();
                            handleLogout();
                        }}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Sign Out
                    </div>
                </div>
            )}
            {user.avatar ? (
                <img
                    src={user.avatar}
                    alt={user.email}
                    style={{ width: 32, height: 32, borderRadius: '50%' }}
                />
            ) : (
                <div className="user-avatar">{user.username?.charAt(0).toUpperCase() || 'U'}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span
                    style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {user.username}
                </span>
                <span
                    style={{
                        fontSize: '0.75rem',
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {user.email}
                </span>
            </div>
        </div>
    );
};

export default UserProfileMenu;
