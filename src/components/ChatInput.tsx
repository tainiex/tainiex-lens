import { useState, useRef, useEffect } from 'react';
import { useChatContext } from '../contexts/ChatContext';

interface ChatInputProps {
  onSend: (message: string) => void;
  isConnected: boolean;
  scrollToBottom: () => void;
}

const ChatInput = ({ onSend, isConnected, scrollToBottom }: ChatInputProps) => {
  const { isLoading } = useChatContext();
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    onSend(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMobile = window.innerWidth <= 768;

    if (e.key === 'Enter' && !e.shiftKey) {
      if (isComposing || isMobile) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  return (
    <div className="chat-input-container">
      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Type your message..."
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onFocus={() => {
            setTimeout(() => scrollToBottom(), 100);
          }}
          disabled={isLoading || !isConnected}
        />
        <div className="input-actions" style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>
          <button 
            type="button" 
            className="icon-btn" 
            onClick={handleSend} 
            disabled={isLoading || !inputValue.trim() || !isConnected}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
