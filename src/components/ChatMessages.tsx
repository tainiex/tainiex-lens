import ReactMarkdown from 'react-markdown';
import React, { useEffect, memo } from 'react';
import { logger } from '@/shared/utils/logger';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { IUser, ChatRole, IChatMessage } from '@tainiex/shared-atlas';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';
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
import { useChatContext } from '../contexts/ChatContext';

import Skeleton from './ui/Skeleton';
import SmoothLoader from './ui/SmoothLoader';
import ChatErrorBoundary from './ChatErrorBoundary';

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

// Type definitions for markdown components
interface CodeProps extends React.HTMLAttributes<HTMLElement> {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href?: string;
    children?: React.ReactNode;
}

// Memoized Markdown components to avoid recreating on every render
const markdownComponents: Partial<Components> = {
    code({ inline, className, children, ...props }: CodeProps) {
        const match = /language-(\w+)/.exec(className || '');
        if (!inline && match) {
            const Highlighter =
                SyntaxHighlighter as unknown as React.ComponentType<SyntaxHighlighterProps>;
            return (
                <Highlighter
                    // @ts-expect-error - react-syntax-highlighter's style prop has complex union types that TypeScript struggles with
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
                    {String(children).replace(/\n$/, '')}
                </Highlighter>
            );
        }
        return (
            <code className={className} {...props}>
                {children}
            </code>
        );
    },
    a({ href, children, ...props }: LinkProps) {
        const handleClick = (e: React.MouseEvent) => {
            e.preventDefault();
            if (href) {
                const confirmed = window.confirm(`即将跳转到外部网站：\n${href}\n\n是否继续访问？`);
                if (confirmed) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        };
        return (
            <a href={href} onClick={handleClick} style={{ cursor: 'pointer' }} {...props}>
                {children}
            </a>
        );
    },
};

import ToolExecution from './ToolExecution';
import ActivityStatusIndicator from './ActivityStatusIndicator';

// Shared message rendering logic
const renderMessageContent = (
    msg: Partial<IChatMessage>,
    idx: number,
    isLastMessage: boolean,
    isLoading: boolean,
    isStreaming: boolean,
    currentSessionId?: string // Passed for ActivityStatus
) => {
    // Determine if this message bubble should have streaming animation
    const isStreamingMessage = isLastMessage && isStreaming && msg.role === ChatRole.ASSISTANT;

    // Helper to parse content for Tool JSON blocks
    // Strategy: Find tool JSON blocks that are standalone (not inside markdown code blocks)
    // We check if the JSON appears to be outside of code fences (```)
    const renderContent = (content: string) => {
        if (!content) return null;

        const parts: React.ReactNode[] = [];
        let currentIndex = 0;

        // Regex to find potential tool JSON blocks at line boundaries
        // Match { followed by "tool": at start of line (with optional whitespace)
        const toolPattern = /^\s*\{\s*"tool"\s*:/gm;

        let match: RegExpExecArray | null;
        toolPattern.lastIndex = 0;

        while ((match = toolPattern.exec(content)) !== null) {
            const jsonStartIndex = match.index + match[0].indexOf('{');

            // Check if this JSON is inside a markdown code block
            // Count code fences before this position
            const beforeContent = content.slice(0, jsonStartIndex);
            const codeFenceCount = (beforeContent.match(/```/g) || []).length;

            // If odd number of code fences, we're inside a code block - skip
            if (codeFenceCount % 2 !== 0) {
                continue;
            }

            // Find the matching closing brace
            let balance = 0;
            let closeBraceIndex = -1;
            let inString = false;
            let escape = false;

            for (let i = jsonStartIndex; i < content.length; i++) {
                const char = content[i];

                if (escape) {
                    escape = false;
                    continue;
                }

                if (char === '\\') {
                    escape = true;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === '{') {
                        balance++;
                    } else if (char === '}') {
                        balance--;
                        if (balance === 0) {
                            closeBraceIndex = i;
                            break;
                        }
                    }
                }
            }

            if (closeBraceIndex !== -1) {
                const jsonStr = content.slice(jsonStartIndex, closeBraceIndex + 1);
                try {
                    const toolData = JSON.parse(jsonStr);
                    if (toolData.tool && toolData.parameters) {
                        // Render markdown before the tool block
                        if (currentIndex < jsonStartIndex) {
                            const mdText = content.slice(currentIndex, jsonStartIndex);
                            if (mdText.trim()) {
                                parts.push(
                                    <div key={`md-${currentIndex}`} className="markdown-content">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[[rehypeKatex, { strict: false }]]}
                                            components={markdownComponents}
                                        >
                                            {mdText}
                                        </ReactMarkdown>
                                    </div>
                                );
                            }
                        }

                        // Render the tool block
                        parts.push(
                            <ToolExecution
                                key={`tool-${jsonStartIndex}`}
                                toolName={toolData.tool}
                                parameters={toolData.parameters}
                            />
                        );

                        // Update current index
                        currentIndex = closeBraceIndex + 1;

                        // Update regex lastIndex to continue searching after this block
                        toolPattern.lastIndex = closeBraceIndex + 1;
                    }
                } catch (e) {
                    // Invalid JSON, continue searching
                    logger.debug('Failed to parse potential tool JSON:', e);
                }
            }
        }

        // Render any remaining markdown content
        if (currentIndex < content.length) {
            const remainingText = content.slice(currentIndex);
            if (remainingText.trim()) {
                parts.push(
                    <div key={`md-${currentIndex}`} className="markdown-content">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[[rehypeKatex, { strict: false }]]}
                            components={markdownComponents}
                        >
                            {remainingText}
                        </ReactMarkdown>
                    </div>
                );
            }
        }

        // If no tool blocks were found, just render as markdown
        if (parts.length === 0 && content.trim()) {
            return (
                <div className="markdown-content">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[[rehypeKatex, { strict: false }]]}
                        components={markdownComponents}
                    >
                        {content}
                    </ReactMarkdown>
                </div>
            );
        }

        return parts.length > 0 ? parts : null;
    };

    return (
        <div className={`message ${msg.role}`} data-message-id={String(msg.id || idx)}>
            <div
                className="message-inner-container"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === ChatRole.USER ? 'flex-end' : 'flex-start',
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
                                marginRight: '8px',
                                userSelect: 'none',
                            }}
                        >
                            {formatMessageTime((msg as any).createdAt || (msg as any).timestamp)}
                        </div>
                    )}

                <div className={`message-bubble ${isStreamingMessage ? 'streaming' : ''}`}>
                    {msg.role === ChatRole.ASSISTANT &&
                        ((msg as any).createdAt || (msg as any).timestamp) && (
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
                                    (msg as any).createdAt || (msg as any).timestamp
                                )}
                            </div>
                        )}

                    {msg.content ? renderContent(msg.content) : null}

                    {/* Activity Indicator only for the last Assistant message that is loading/streaming */}
                    {/* OR if this is the very last block and we are waiting for tokens */}
                    {msg.role === ChatRole.ASSISTANT &&
                        isLastMessage &&
                        (isLoading || isStreaming) && (
                            <div className="status-area">
                                {/* Show Activity Status if available (e.g. "Searching...") */}
                                {currentSessionId && (
                                    <ActivityStatusIndicator
                                        sessionId={currentSessionId}
                                        isVisible={true}
                                    />
                                )}

                                {/* Fallback dots if no specific activity description but still loading content */}
                                <div className="typing-dots">
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                </div>
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
};

// Memoized component for completed (non-streaming) messages
const CompletedMessageBubble = memo(
    ({
        msg,
        idx,
        currentSessionId,
    }: {
        msg: Partial<IChatMessage>;
        idx: number;
        currentSessionId?: string;
    }) => {
        return renderMessageContent(msg, idx, false, false, false, currentSessionId);
    },
    (prevProps, nextProps) => {
        // Only re-render if content changed
        return prevProps.msg.content === nextProps.msg.content;
    }
);

// Non-memoized component for streaming messages (always re-renders)
const StreamingMessageBubble = ({
    msg,
    idx,
    isLastMessage,
    isLoading,
    isStreaming,
    currentSessionId,
}: {
    msg: Partial<IChatMessage>;
    idx: number;
    isLastMessage: boolean;
    isLoading: boolean;
    isStreaming: boolean;
    currentSessionId?: string;
}) => {
    return renderMessageContent(msg, idx, isLastMessage, isLoading, isStreaming, currentSessionId);
};

const ChatMessages = ({
    user,
    isFetchingMore,
    scrollContainerRef,
    messagesListRef,
    handleScroll,
}: ChatMessagesProps) => {
    // Use `user` to avoid unused-prop TS error (some builds enable noUnusedParameters)
    void user;
    const {
        currentSessionId,
        messages,
        isLoading,
        isStreaming,
        isHistoryReady,
        shouldShowSkeleton,
    } = useChatContext();

    useEffect(() => {
        // High-signal timeline log for reproducing "skeleton -> blank -> content" flashes without video
        logger.debug('[SkeletonDebug][ChatMessages]', {
            sessionId: currentSessionId,
            isLoading,
            isHistoryReady,
            shouldShowSkeleton,
            messagesLen: messages.length,
            lastRole: messages.length > 0 ? (messages[messages.length - 1] as any)?.role : null,
            isStreaming,
            ts: performance.now(),
        });
    }, [
        currentSessionId,
        isLoading,
        isHistoryReady,
        shouldShowSkeleton,
        messages.length,
        isStreaming,
    ]);

    const skeletonContent = (
        <div
            style={{
                // Match the real messages container sizing so switching sessions doesn't shift position
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',

                // IMPORTANT: messages list is bottom-aligned (chat style). Skeleton should mimic that.
                justifyContent: 'flex-end',

                // Match common chat padding (same as bubbles list area)
                padding: '1rem',

                gap: '32px',
            }}
        >
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    <Skeleton
                        style={{
                            width: i % 2 === 0 ? '70%' : '85%',
                            height: 18,
                        }}
                    />
                    <Skeleton
                        style={{
                            width: i % 2 === 0 ? '50%' : '60%',
                            height: 18,
                        }}
                    />
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
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                <div
                    className="chat-messages"
                    ref={messagesListRef as React.RefObject<HTMLDivElement>}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100%',
                    }}
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
                        isLoading={shouldShowSkeleton}
                        skeleton={skeletonContent}
                        // Ensure overlay and content share the same sizing rules (prevents vertical jumps)
                        // Use marginTop: auto to bottom-align content when short, instead of flex spacer
                        style={{
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            marginTop: 'auto',
                        }}
                        minDuration={400}
                        transitionDuration={0}
                    >
                        <ChatErrorBoundary>
                            {(() => {
                                // Render-path log: confirms what children branch is active at the time of a flash
                                const branch = messages.length === 0 ? 'empty(null)' : 'messages';
                                logger.debug('[SkeletonDebug][ChatMessages][render]', {
                                    sessionId: currentSessionId,
                                    branch,
                                    isLoading,
                                    isHistoryReady,
                                    shouldShowSkeleton,
                                    messagesLen: messages.length,
                                    ts: performance.now(),
                                });
                                return null;
                            })()}
                            {messages.length === 0 ? (
                                <div
                                    className="welcome-message"
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flex: 1,
                                        padding: '2rem',
                                        textAlign: 'center',
                                        opacity: 0.7,
                                    }}
                                >
                                    <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
                                        How can I help you today?
                                    </h2>
                                    <p style={{ fontSize: '0.9rem', maxWidth: '600px' }}>
                                        Start a conversation by typing your message below.
                                    </p>
                                </div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const isLastMessage = idx === messages.length - 1;
                                    // Use non-memoized component for last message during streaming
                                    // Use memoized component for all completed messages
                                    if (isLastMessage && isStreaming) {
                                        return (
                                            <StreamingMessageBubble
                                                key={msg.id || idx}
                                                msg={msg}
                                                idx={idx}
                                                isLastMessage={isLastMessage}
                                                isLoading={isLoading}
                                                isStreaming={isStreaming}
                                                currentSessionId={currentSessionId || undefined}
                                            />
                                        );
                                    } else {
                                        return (
                                            <CompletedMessageBubble
                                                key={msg.id || idx}
                                                msg={msg}
                                                idx={idx}
                                                currentSessionId={currentSessionId || undefined}
                                            />
                                        );
                                    }
                                })
                            )}
                        </ChatErrorBoundary>
                    </SmoothLoader>
                </div>
            </div>
        </div>
    );
};

export default ChatMessages;
