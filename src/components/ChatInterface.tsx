import React, { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { IUser } from '@tainiex/tainiex-shared';
import { ChatProvider, useChatContext } from '../contexts/ChatContext';
import { useChat } from '../hooks/useChat';
import { useMessageHistory } from '../hooks/useMessageHistory';
import { useChatScroll } from '../hooks/useChatScroll';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

interface ChatInterfaceProps {
  user: IUser | null;
  onMenuClick?: () => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null, options?: { skipFetch?: boolean }) => void;
  currentSession?: { id: string; title?: string };
  onSessionCreated?: () => void;
  onSessionUpdate?: (title?: string) => void;
  initialSkipFetch?: boolean;
}

function ChatInterfaceContent({
  user,
  onMenuClick,
  onSessionCreated,
  onSessionUpdate,
  initialSkipFetch
}: Omit<ChatInterfaceProps, 'currentSessionId' | 'setCurrentSessionId' | 'currentSession'>) {
  const {
    currentSessionId,
    setCurrentSessionId,
    messages,
    setMessages,
    selectedModel,
    setSelectedModel,
    setIsLoading,
    setIsStreaming,
    isLoading,
    isStreaming
  } = useChatContext();

  // Initialize scroll management first (needs to be available for other hooks)
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    fetchHistory,
    syncMessages,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    resetHistory
  } = useMessageHistory({
    currentSessionId,
    setMessages,
    setIsLoading,
    scrollContainerRef
  });

  const {
    scrollContainerRef: scrollRef,
    messagesListRef,
    scrollToBottom,
    handleScroll,
    resetScrollState,
    enableAutoScroll
  } = useChatScroll({
    messages,
    isLoading,
    isStreaming,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    fetchHistory
  });

  // Sync the refs
  useEffect(() => {
    if (scrollRef.current) {
      scrollContainerRef.current = scrollRef.current;
    }
  }, [scrollRef]);

  const {
    models,
    isConnected,
    wsError,
    handleSend,
    shouldSkipHistoryFetchRef,
    setCurrentMessage,
    reconnect
  } = useChat({
    currentSessionId,
    setCurrentSessionId,
    messages,
    setMessages,
    selectedModel,
    setIsLoading,
    setIsStreaming,
    onSessionCreated,
    onSessionUpdate,
    enableAutoScroll,
    initialSkipFetch
  });

  // Fetch message history when session changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      resetHistory();
      return;
    }

    if (shouldSkipHistoryFetchRef.current) {
      // shouldSkipHistoryFetchRef.current = false; // logic moved to hook/ref initialization for initial, 
      // but we still need to respect it here if it was set to true dynamically.
      // Actually, if we use the hook logic, the ref is persistent.
      // BUT, we need to reset it after consuming it.

      // Check if this "consumption" logic is still valid here. 
      // Yes, if the ref is true, we skip fetch. Then we set it to false so next time it fetches.
      shouldSkipHistoryFetchRef.current = false;
      return;
    }

    resetScrollState();
    setMessages([]);
    setIsLoading(true);
    fetchHistory();
  }, [currentSessionId, fetchHistory, resetHistory, resetScrollState, setIsLoading, setMessages, shouldSkipHistoryFetchRef]);

  // Auto-sync messages when socket reconnects to "heal" any interrupted streams (especially on mobile)
  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current && currentSessionId) {
      logger.debug('Socket reconnected, performing silent sync of messages...');
      syncMessages().then(() => {
        // After successful sync, we need to clear any "phantom" messages 
        // that were stuck in the useSendMessage state
        if (typeof setCurrentMessage === 'function') {
          logger.debug('Clearing phantom messages from useSendMessage state...');
          setCurrentMessage(null);
        }
      });
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
        scrollToBottom={scrollToBottom}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
      />
    </div>
  );
}

const ChatInterface = ({
  user,
  onMenuClick,
  currentSessionId,
  setCurrentSessionId,
  currentSession,
  onSessionCreated,
  onSessionUpdate,
  initialSkipFetch
}: ChatInterfaceProps) => {
  return (
    <ChatProvider
      initialSessionId={currentSessionId}
      initialSession={currentSession}
      onSessionIdChange={setCurrentSessionId}
    >
      <ChatInterfaceContent
        user={user}
        onMenuClick={onMenuClick}
        onSessionCreated={onSessionCreated}
        onSessionUpdate={onSessionUpdate}
        initialSkipFetch={initialSkipFetch}
      />
    </ChatProvider>
  );
};

export default React.memo(ChatInterface);
