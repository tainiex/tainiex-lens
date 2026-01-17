import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ModelSelector from './ModelSelector';
import { useChatContext } from '../contexts/ChatContext';

interface ChatInputProps {
    onSend: (message: string) => void;
    isConnected: boolean;
    scrollToBottom: () => void;
    models: (string | { name: string })[];
    selectedModel: string;
    onSelectModel: (model: string) => void;
}

const ChatInput = ({
    onSend,
    isConnected,
    scrollToBottom,
    models,
    selectedModel,
    onSelectModel,
}: ChatInputProps) => {
    const { isLoading } = useChatContext();
    const [inputValue, setInputValue] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Restore draft on mount
    useEffect(() => {
        const draft = localStorage.getItem('chat_input_draft');
        if (draft) setInputValue(draft);
    }, []);

    // Save to stored draft on change
    useEffect(() => {
        localStorage.setItem('chat_input_draft', inputValue);
    }, [inputValue]);

    const handleSend = (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        onSend(inputValue);
        setInputValue('');
        localStorage.removeItem('chat_input_draft');

        // Reset height explicitly
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const isMobile = window.innerWidth <= 768;

        if (e.key === 'Enter' && !e.shiftKey) {
            if (isComposing || isMobile || isLoading) {
                if (isLoading) e.preventDefault(); // Prevent newline insertion if we just want to block send
                return;
            }
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea height
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';

            // Calculate new height
            // Line height is approx 24px (1.5 * 16px)
            // Max height for ~6 lines is around 144px + padding
            const maxHeight = 150;
            const newHeight = Math.min(textarea.scrollHeight, maxHeight);

            textarea.style.height = `${newHeight}px`;

            // Show scrollbar if we hit the limit
            textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [inputValue]);

    return (
        <div className="chat-input-container">
            <div className="chat-input-area" style={{ display: 'flex', flexDirection: 'column' }}>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Type your message..."
                    className="chat-input"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onFocus={() => {
                        setTimeout(() => scrollToBottom(), 100);
                    }}
                    disabled={false} // [FIX] Allow typing while loading
                    autoFocus
                    style={{ width: '100%', marginBottom: '8px', flex: 'none', resize: 'none' }}
                />
                <div
                    className="input-footer"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                    }}
                >
                    <div className="model-selector-wrapper">
                        {models && models.length > 0 && (
                            <ModelSelector
                                models={models}
                                selectedModel={selectedModel}
                                onSelect={onSelectModel}
                                disabled={isLoading || !isConnected}
                                dropUp={true}
                            />
                        )}
                    </div>
                    <div className="input-actions">
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={handleSend}
                            disabled={isLoading || !inputValue.trim() || !isConnected}
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatInput;
