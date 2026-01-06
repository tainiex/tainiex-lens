import { useEffect, useRef } from 'react';
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
  setCurrentSessionId: (id: string | null) => void;
  currentSession?: { id: string; title?: string };
  onSessionCreated?: () => void;
  onSessionUpdate?: (title?: string) => void;
}

function ChatInterfaceContent({
  user,
  onMenuClick,
  onSessionCreated,
  onSessionUpdate
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
    currentMessage,
    setCurrentMessage
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
    enableAutoScroll
  });

  // Fetch message history when session changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      resetHistory();
      return;
    }

    if (shouldSkipHistoryFetchRef.current) {
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
      console.log('Socket reconnected, performing silent sync of messages...');
      syncMessages().then(() => {
        // After successful sync, we need to clear any "phantom" messages 
        // that were stuck in the useSendMessage state
        if (typeof setCurrentMessage === 'function') {
          console.log('Clearing phantom messages from useSendMessage state...');
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
  onSessionUpdate
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
      />
    </ChatProvider>
  );
};

export default ChatInterface;
