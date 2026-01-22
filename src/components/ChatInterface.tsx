import { IUser } from '@tainiex/shared-atlas';
import React, { useEffect, useRef, useCallback } from 'react';
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
        scrollToBottom,
        handleScroll,
        enableAutoScroll,
        requestPushUp,
    } = useChatScroll({
        messages,
        isLoading,
        isStreaming,
        isFetchingMore,
        hasMore,
        nextCursor,
        scrollHeightBeforeRef,
        fetchHistory, // [FIX] Connect fetchHistory
    });

    // Sync the refs
    useEffect(() => {
        if (scrollRef.current) {
            scrollContainerRef.current = scrollRef.current;
        }
    }, [scrollRef]);

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

    // Callback for when ChatMessages is ready to trigger push-up
    const handlePushUpReady = useCallback(
        (messageId?: string) => {
            requestPushUp(messageId);
        },
        [requestPushUp]
    );

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
                onPushUpReady={handlePushUpReady}
            />
            <ChatInput
                onSend={handleSend}
                isConnected={isConnected}
                scrollToBottom={scrollToBottom}
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
