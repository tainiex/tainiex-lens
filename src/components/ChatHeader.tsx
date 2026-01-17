/* removed ModelSelector import */
import { useChatContext } from '../contexts/ChatContext';
import './ChatHeader.css';
import PageHeader from './PageHeader';

interface ChatHeaderProps {
    onMenuClick?: () => void;
    /* removed models prop */
    isConnected: boolean;
    wsError: string | null;
    onReconnect?: () => void;
}

const ChatHeader = ({ onMenuClick, isConnected, wsError, onReconnect }: ChatHeaderProps) => {
    const { currentSessionId, currentSession, setCurrentSessionId } = useChatContext();

    const sessionTitle = currentSession?.title || (currentSessionId ? 'Chat' : 'New Chat');

    // Menu Button
    const menuButton = (
        <button className="header-icon-btn mobile-menu-btn" onClick={onMenuClick}>
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        </button>
    );

    // Center Title
    const centerTitle = (
        <div
            style={{
                fontWeight: 600,
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
            }}
        >
            {sessionTitle}
        </div>
    );

    // Right Actions
    const rightActions = (
        <>
            <button
                type="button"
                className="header-icon-btn new-chat-btn"
                title="New Chat"
                onClick={() => setCurrentSessionId(null)}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>
        </>
    );

    return (
        <PageHeader
            className="chat-interface-header-wrapper"
            startContent={menuButton}
            centerContent={centerTitle}
            endContent={rightActions}
        />
    );
};

export default ChatHeader;
