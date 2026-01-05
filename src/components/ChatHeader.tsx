import ModelSelector from './ModelSelector';
import { useChatContext } from '../contexts/ChatContext';
import './ChatHeader.css';

interface ChatHeaderProps {
  onMenuClick?: () => void;
  models: (string | { name: string })[];
  isConnected: boolean;
  wsError: string | null;
}

const ChatHeader = ({ onMenuClick, models, isConnected, wsError }: ChatHeaderProps) => {
  const {
    currentSessionId,
    currentSession,
    selectedModel,
    setSelectedModel,
    setCurrentSessionId,
    isLoading
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
        color: 'rgba(255, 255, 255, 0.9)',
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
        <div className="connection-status" title={isConnected ? 'Connected' : (wsError || 'Connecting...')}>
          <div className={`status-dot ${statusClass}`}></div>
        </div>
        {models.length > 0 && (
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            disabled={isLoading || !isConnected}
          />
        )}
        <button
          type="button"
          className="icon-btn"
          title="New Chat"
          onClick={() => setCurrentSessionId(null)}
          style={{ padding: '6px', borderRadius: '6px' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
