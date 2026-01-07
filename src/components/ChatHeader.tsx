/* removed ModelSelector import */
import { useChatContext } from '../contexts/ChatContext';
import './ChatHeader.css';

interface ChatHeaderProps {
  onMenuClick?: () => void;
  /* removed models prop */
  isConnected: boolean;
  wsError: string | null;
  onReconnect?: () => void;
}

const ChatHeader = ({ onMenuClick, isConnected, wsError, onReconnect }: ChatHeaderProps) => {
  const {
    currentSessionId,
    currentSession,
    setCurrentSessionId
  } = useChatContext();

  const sessionTitle = currentSession?.title || (currentSessionId ? 'Chat' : 'New Chat');

  // Determine status class
  let statusClass = 'connected';
  if (wsError || !isConnected) {
    if (wsError && (wsError.includes('Reconnecting') || !wsError.includes('Failed'))) {
      statusClass = 'reconnecting';
    } else if (!isConnected) {
      statusClass = 'connecting';
    }

    if (wsError && wsError.toLowerCase().includes('fail')) {
      statusClass = 'failed';
    }
  }

  if (isConnected) statusClass = 'connected';

  return (
    <div className="chat-interface-header" style={{ position: 'relative' }}>
      <div className="header-left">
        <button className="mobile-menu-btn" onClick={onMenuClick}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
      <div className="session-title-header" style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        fontWeight: 600,
        fontSize: '0.95rem',
        color: 'var(--text-primary)',
        maxWidth: '40%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        display: 'block',
        pointerEvents: 'none'
      }}>
        {sessionTitle}
      </div>
      <div className="header-right">
        <div
          className="connection-status"
          title={isConnected ? 'Connected' : 'Click to reconnect'}
          onClick={onReconnect}
          style={{ cursor: 'pointer' }}
        >
          <div className={`status-dot ${statusClass}`}></div>
        </div>

        <button
          type="button"
          className="new-chat-btn"
          title="New Chat"
          onClick={() => setCurrentSessionId(null)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span className="new-chat-text">New chat</span>
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
