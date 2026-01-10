import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatRole, IChatMessage } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import { useChatSocket } from './useChatSocket';
import { useSendMessage } from './useSendMessage';

// Hardcoded fallback list for Production or when API fails
const SUPPORTED_MODELS = [
  { name: 'gemini-2.5-pro' },
  { name: 'gemini-2.5-flash' },
  { name: 'gemini-3-flash-preview' },
  { name: 'gemini-3-pro-preview' }
];

interface UseChatProps {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null, options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }) => void;
  messages: Partial<IChatMessage>[];
  setMessages: (messages: Partial<IChatMessage>[] | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])) => void;
  selectedModel: string;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  onSessionCreated?: () => void;
  onSessionUpdate?: (title?: string) => void;
  enableAutoScroll: () => void;
  initialSkipFetch?: boolean;
}

export function useChat({
  currentSessionId,
  setCurrentSessionId,
  setMessages,
  selectedModel,
  setIsLoading,
  setIsStreaming,
  onSessionCreated,
  onSessionUpdate,
  enableAutoScroll,
  initialSkipFetch = false
}: UseChatProps) {
  const [models, setModels] = useState<(string | { name: string })[]>([]);

  // WebSocket hooks
  const { socket, isConnected, error: wsError, reconnect } = useChatSocket();
  const {
    sendMessage: wsSendMessage,
    isStreaming: wsStreaming,
    streamingText,
    currentMessage,
    setCurrentMessage
  } = useSendMessage(socket, onSessionUpdate);

  // Refs
  const currentSessionIdRef = useRef(currentSessionId);
  const shouldSkipHistoryFetchRef = useRef(initialSkipFetch);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    setIsStreaming(wsStreaming);
  }, [wsStreaming, setIsStreaming]);

  // Sync streaming text from WebSocket to messages state
  useEffect(() => {
    if (streamingText) {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === ChatRole.ASSISTANT) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1 ? { ...msg, content: streamingText } : msg
          );
        }
        return prev;
      });
    }
  }, [streamingText, setMessages]);

  // Fetch available models
  useEffect(() => {
    apiClient.get('/api/chat/models')
      .then(res => {
        if (!res.ok) throw new Error('API not available');
        return res.json();
      })
      .then(data => {
        const list = Array.isArray(data) ? data : (data.models || []);
        if (list.length > 0) {
          setModels(list);
        } else {
          setModels(SUPPORTED_MODELS);
        }
      })
      .catch(() => {
        setModels(SUPPORTED_MODELS);
      });
  }, []);

  const handleSend = useCallback(async (inputValue: string) => {
    if (!inputValue.trim()) return;

    // Reset scroll lock when sending a new message to follow the new response
    enableAutoScroll();

    const msgToSend = inputValue;
    setIsLoading(true);

    let sessionId = currentSessionId;

    try {
      // Prepare optimistic messages immediately (needed for navigation state)
      const userMessage: Partial<IChatMessage> = {
        id: `temp_${Date.now()}`,
        role: ChatRole.USER,
        content: msgToSend
      };
      const assistantMsgId = `temp_ai_${Date.now()}`;
      const assistantMessage: Partial<IChatMessage> = {
        id: assistantMsgId,
        role: ChatRole.ASSISTANT,
        content: ''
      };
      const optimisticMessages = [userMessage, assistantMessage];

      // 1. Create session if it doesn't exist
      if (!sessionId) {
        const sessionRes = await apiClient.post('/api/chat/sessions', {
          title: msgToSend.slice(0, 30) + (msgToSend.length > 30 ? '...' : '')
        });
        if (!sessionRes.ok) throw new Error('Failed to create session');
        const sessionData = await sessionRes.json();
        sessionId = sessionData.id;
        // Prevent the upcoming prop update from triggering a history fetch
        shouldSkipHistoryFetchRef.current = true;

        // Navigate with explicit messages to prevent flash if remounting
        setCurrentSessionId(sessionId, {
          skipFetch: true,
          initialMessages: optimisticMessages
        });
        onSessionCreated?.();
      }

      // 2. Add local user message (with a temporary ID prefix)
      // If we navigated (remounted), this setMessages updates the unmounting component state (harmless)
      // The new component will init with optimisticMessages passed via navigation state.
      // If we did NOT navigate (or reused component), this updates the current state correctly.
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'welcome'),
        ...optimisticMessages
      ]);


      // 3. Send message via WebSocket
      await wsSendMessage({
        sessionId: sessionId!,
        content: msgToSend,
        model: selectedModel
      });

    } catch (error) {
      logger.error('Chat error:', error);
      const errorMsg = "\n[Error: Connection failed]";
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === ChatRole.ASSISTANT) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1 ? { ...msg, content: (msg.content || '') + errorMsg } : msg
          );
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSessionId,
    setCurrentSessionId,
    setMessages,
    selectedModel,
    setIsLoading,
    onSessionCreated,
    wsSendMessage,
    enableAutoScroll
  ]);

  return {
    models,
    isConnected,
    wsError,
    handleSend,
    shouldSkipHistoryFetchRef,
    currentMessage,
    setCurrentMessage,
    reconnect
  };
}
