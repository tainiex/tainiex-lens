import React from 'react';
import { useActivitySocket } from '../shared/hooks/useActivitySocket';

interface ActivityStatusIndicatorProps {
    sessionId: string;
    isVisible: boolean;
}

const ActivityStatusIndicator: React.FC<ActivityStatusIndicatorProps> = ({
    sessionId,
    isVisible,
}) => {
    const { lastActivity } = useActivitySocket(sessionId);

    // If invisible or no activity yet, return null
    if (!isVisible) return null;

    // We primarily show "IN_PROGRESS" or "STARTED" states as loading indicators
    const isLoadingState =
        lastActivity?.status === 'IN_PROGRESS' || lastActivity?.status === 'STARTED';

    if (!isLoadingState) return null;

    const description = lastActivity?.description || 'Processing...';

    return (
        <div
            className="activity-status-indicator"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.03)',
                fontSize: '0.85rem',
                color: '#666',
                maxWidth: 'fit-content',
                marginBottom: '8px',
                animation: 'fadeIn 0.3s ease-in-out',
            }}
        >
            <div className="activity-spinner" style={{ width: '14px', height: '14px' }}>
                <svg
                    className="animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    ></circle>
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                </svg>
            </div>
            <span>{description}</span>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default ActivityStatusIndicator;
