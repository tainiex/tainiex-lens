import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { IUser, ChatRole } from '@tainiex/tainiex-shared';
import TypewriterEffect from './TypewriterEffect';
import { useChatContext } from '../contexts/ChatContext';

interface ChatMessagesProps {
  user: IUser | null;
  isFetchingMore: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesListRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
}

const ChatMessages = ({
  user,
  isFetchingMore,
  scrollContainerRef,
  messagesListRef,
  handleScroll
}: ChatMessagesProps) => {
  const { messages, isLoading, isStreaming } = useChatContext();

  return (
    <div
      className="chat-content-container"
      ref={scrollContainerRef}
      onScroll={handleScroll}
    >
      <div className="chat-width-limiter" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="chat-messages" ref={messagesListRef} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!isLoading && messages.length === 0 && (
            <div className="welcome-container">
              <h1 className="welcome-title">Hi {user?.username}</h1>
              <p className="welcome-subtitle">Where should we start?</p>
            </div>
          )}
          {isFetchingMore && (
            <div className="loading-more" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.8rem',
              padding: '1rem',
              opacity: 0.7,
              marginTop: '2rem'
            }}>
              <div className="loading-spinner"></div>
            </div>
          )}
          {isLoading && messages.length === 0 && (
            <div className="loading-state" style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100dvh'
            }}>
              <div className="loading-spinner large"></div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`message ${msg.role}`}>

              <div className="message-bubble">
                {(msg.role === ChatRole.ASSISTANT && idx === messages.length - 1 && isStreaming) ? (
                  <TypewriterEffect content={msg.content || ''} isStreaming={true} />
                ) : (
                  msg.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        code({ inline, className, children, ...props }: any) {
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                        a({ href, children, ...props }: any) {
                          const handleClick = (e: React.MouseEvent) => {
                            e.preventDefault();
                            if (href) {
                              const confirmed = window.confirm(
                                `即将跳转到外部网站：\n${href}\n\n是否继续访问？`
                              );
                              if (confirmed) {
                                window.open(href, '_blank', 'noopener,noreferrer');
                              }
                            }
                          };
                          return (
                            <a
                              href={href}
                              onClick={handleClick}
                              style={{ cursor: 'pointer' }}
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <div className="typing-dots">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatMessages;
