import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { IUser, ChatRole } from '@tainiex/shared-atlas';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ts from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import js from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';

SyntaxHighlighter.registerLanguage('typescript', ts);
SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('css', css);
import TypewriterEffect from './TypewriterEffect';
import { useChatContext } from '../contexts/ChatContext';

import Skeleton from './ui/Skeleton';
import SmoothLoader from './ui/SmoothLoader';

interface ChatMessagesProps {
    user: IUser | null;
    isFetchingMore: boolean;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    messagesListRef: React.RefObject<HTMLDivElement | null>;
    handleScroll: () => void;
}

const formatMessageTime = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);

    // Basic date time
    // Using standard slashes YYYY/MM/DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const timeStr = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    // Timezone info
    const timeZoneID = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "Asia/Shanghai"

    const offsetMinutes = -date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const offsetStr = `UTC${offsetSign}${offsetHours}${offsetMins > 0 ? `:${offsetMins}` : ''}`;

    return `${timeStr} ${timeZoneID} (${offsetStr})`;
};

const ChatMessages = ({
    user,
    isFetchingMore,
    scrollContainerRef,
    messagesListRef,
    handleScroll,
}: ChatMessagesProps) => {
    const { messages, isLoading, isStreaming } = useChatContext();

    const skeletonContent = (
        <div
            style={{
                padding: '80px 0 20px 0',
            }}
        >
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: '32px',
                        padding: '0 16px',
                    }}
                >
                    <Skeleton
                        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, paddingTop: 4 }}>
                        <Skeleton
                            style={{
                                width: i % 2 === 0 ? '60%' : '80%',
                                height: 16,
                                marginBottom: 8,
                            }}
                        />
                        <Skeleton style={{ width: i % 2 === 0 ? '40%' : '50%', height: 16 }} />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div
            className="chat-content-container"
            ref={scrollContainerRef as React.RefObject<HTMLDivElement>}
            onScroll={handleScroll}
        >
            <div
                className="chat-width-limiter"
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <div
                    className="chat-messages"
                    ref={messagesListRef as React.RefObject<HTMLDivElement>}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                    {isFetchingMore && (
                        <div
                            className="loading-more"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.8rem',
                                padding: '1rem',
                                opacity: 0.7,
                                marginTop: '2rem',
                            }}
                        >
                            <div className="loading-spinner"></div>
                        </div>
                    )}
                    <SmoothLoader
                        isLoading={isLoading}
                        skeleton={skeletonContent}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        transitionDuration={300}
                    >
                        {messages.length === 0 ? (
                            <div className="welcome-container">
                                <h1 className="welcome-title">Hi {user?.username}</h1>
                                <p className="welcome-subtitle">Where should we start?</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`message ${msg.role}`}>
                                    <div
                                        className="message-inner-container"
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems:
                                                msg.role === ChatRole.USER
                                                    ? 'flex-end'
                                                    : 'flex-start',
                                            maxWidth: '100%',
                                            flex: 1,
                                            minWidth: 0,
                                        }}
                                    >
                                        {msg.role === ChatRole.USER &&
                                            ((msg as any).createdAt || (msg as any).timestamp) && (
                                                <div
                                                    className="message-time-outside"
                                                    style={{
                                                        fontSize: '0.7rem',
                                                        opacity: 0.6,
                                                        marginBottom: '4px',
                                                        marginRight: '8px', // Slight offset for visual alignment
                                                        userSelect: 'none',
                                                    }}
                                                >
                                                    {formatMessageTime(
                                                        (msg as any).createdAt ||
                                                            (msg as any).timestamp
                                                    )}
                                                </div>
                                            )}

                                        <div className="message-bubble">
                                            {msg.role === ChatRole.ASSISTANT &&
                                                ((msg as any).createdAt ||
                                                    (msg as any).timestamp) && (
                                                    <div
                                                        className="message-time"
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            opacity: 0.6,
                                                            marginBottom: '4px',
                                                            textAlign: 'left',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        {formatMessageTime(
                                                            (msg as any).createdAt ||
                                                                (msg as any).timestamp
                                                        )}
                                                    </div>
                                                )}
                                            {msg.role === ChatRole.ASSISTANT &&
                                            idx === messages.length - 1 &&
                                            isStreaming ? (
                                                <TypewriterEffect
                                                    content={msg.content || ''}
                                                    isStreaming={true}
                                                />
                                            ) : msg.content ? (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                    rehypePlugins={[
                                                        [rehypeKatex, { strict: false }],
                                                    ]}
                                                    components={{
                                                        code({
                                                            inline,
                                                            className,
                                                            children,
                                                            ...props
                                                        }: any) {
                                                            const match = /language-(\w+)/.exec(
                                                                className || ''
                                                            );
                                                            return !inline && match ? (
                                                                <SyntaxHighlighter
                                                                    style={oneLight}
                                                                    language={match[1]}
                                                                    PreTag="div"
                                                                    customStyle={{
                                                                        background: 'transparent',
                                                                        padding: 0,
                                                                        margin: 0,
                                                                    }}
                                                                    {...props}
                                                                >
                                                                    {String(children).replace(
                                                                        /\n$/,
                                                                        ''
                                                                    )}
                                                                </SyntaxHighlighter>
                                                            ) : (
                                                                <code
                                                                    className={className}
                                                                    {...props}
                                                                >
                                                                    {children}
                                                                </code>
                                                            );
                                                        },
                                                        a({ href, children, ...props }: any) {
                                                            const handleClick = (
                                                                e: React.MouseEvent
                                                            ) => {
                                                                e.preventDefault();
                                                                if (href) {
                                                                    const confirmed =
                                                                        window.confirm(
                                                                            `即将跳转到外部网站：\n${href}\n\n是否继续访问？`
                                                                        );
                                                                    if (confirmed) {
                                                                        window.open(
                                                                            href,
                                                                            '_blank',
                                                                            'noopener,noreferrer'
                                                                        );
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
                                                        },
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
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </SmoothLoader>
                </div>
            </div>
        </div>
    );
};

export default ChatMessages;
