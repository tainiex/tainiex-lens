import { IUser } from '@tainiex/shared-atlas';
import React, { useEffect, useRef } from 'react';
import { logger, useMessageHistory, useChatScroll } from '@/shared';
import { useChatContext } from '../contexts/ChatContext';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

interface ChatInterfaceProps {
    user: IUser | null;
    onMenuClick?: () => void;
    // Removed unused props
}

function ChatInterfaceContent({ user, onMenuClick }: ChatInterfaceProps) {
    const {
        currentSessionId,
        messages,
        setMessages,
        selectedModel,
        setSelectedModel,
        setIsLoading,
        isLoading,
        isStreaming,
        handleSend,
        isConnected,
        wsError,
        reconnect,
        models,
    } = useChatContext();

    // Initialize scroll management first (needs to be available for other hooks)
    // [FIX] Use mutable ref type to avoid read-only assignment error
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const { fetchHistory, isFetchingMore, hasMore, nextCursor, scrollHeightBeforeRef } =
        useMessageHistory({
            currentSessionId,
            setMessages,
            setIsLoading,
            scrollContainerRef,
        });

    const {
        scrollContainerRef: scrollRef,
        messagesListRef,
        handleScroll,
        resetScrollState,
        scrollToBottom,
    } = useChatScroll({
        messages,
        isLoading,
        isStreaming,
        isFetchingMore,
        hasMore,
        nextCursor,
        scrollHeightBeforeRef,
        fetchHistory,
    });

    // Sync the refs
    useEffect(() => {
        if (scrollRef.current) {
            scrollContainerRef.current = scrollRef.current;
        }
    }, [scrollRef]);

    // Reset scroll state and scroll to bottom when session changes
    const prevSessionIdRef = useRef(currentSessionId);
    useEffect(() => {
        if (currentSessionId !== prevSessionIdRef.current) {
            // Session changed - reset scroll state to ensure new messages scroll to bottom
            resetScrollState();

            // Immediately scroll to bottom to prevent keyboard from affecting scroll position
            // Use requestAnimationFrame to ensure DOM has rendered
            requestAnimationFrame(() => {
                scrollToBottom('auto'); // Use 'auto' for instant scroll
            });

            prevSessionIdRef.current = currentSessionId;
        }
    }, [currentSessionId, resetScrollState, scrollToBottom]);

    // [FIX] Removed chat-scroll-request listener to prevent scrollToBottom conflict with Push-Up effect.
    // The push-up effect (handled by ChatMessages -> triggerPushUp) now manages the scroll on send.
    // useEffect(() => {
    //     const handleScrollRequest = () => {
    //         enableAutoScroll();
    //         scrollToBottom();
    //     };
    //     window.addEventListener('chat-scroll-request', handleScrollRequest);
    //     return () => window.removeEventListener('chat-scroll-request', handleScrollRequest);
    // }, [enableAutoScroll, scrollToBottom]);

    const { syncMessages } = useMessageHistory({
        // Re-instantiate to access syncMessages if needed or just remove
        currentSessionId,
        setMessages,
        setIsLoading,
        scrollContainerRef,
    });

    // Auto-sync messages when socket reconnects
    const wasConnectedRef = useRef(isConnected);
    useEffect(() => {
        if (isConnected && !wasConnectedRef.current && currentSessionId) {
            logger.debug('Socket reconnected, performing silent sync of messages...');
            // We can use syncMessages from useMessageHistory if available
            if (syncMessages) syncMessages();
        }
        wasConnectedRef.current = isConnected;
    }, [isConnected, currentSessionId, syncMessages]);

    return (
        <div className="chat-interface" style={{ position: 'relative' }}>
            <ChatHeader
                onMenuClick={onMenuClick}
                isConnected={isConnected}
                wsError={wsError}
                onReconnect={reconnect}
            />
            <ChatMessages
                user={user}
                isFetchingMore={isFetchingMore}
                scrollContainerRef={scrollRef}
                messagesListRef={messagesListRef}
                handleScroll={handleScroll}
            />
            <ChatInput
                onSend={handleSend}
                isConnected={isConnected}
                models={models}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
            />
        </div>
    );
}

// Export specific component directly as ChatInterface
// Since Provider is now in Layout, we don't need the wrapper.
export default React.memo(ChatInterfaceContent);
