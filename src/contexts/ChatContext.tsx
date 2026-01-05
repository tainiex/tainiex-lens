import { createContext, useContext, useState, ReactNode } from 'react';
import { IChatMessage } from '@tainiex/tainiex-shared';

interface ChatContextValue {
  // State
  currentSessionId: string | null;
  currentSession: { id: string; title?: string } | undefined;
  messages: Partial<IChatMessage>[];
  selectedModel: string;
  isLoading: boolean;
  isStreaming: boolean;
  
  // Methods
  setCurrentSessionId: (id: string | null) => void;
  setCurrentSession: (session: { id: string; title?: string } | undefined) => void;
  setMessages: (messages: Partial<IChatMessage>[] | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])) => void;
  setSelectedModel: (model: string) => void;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  addMessage: (msg: Partial<IChatMessage>) => void;
  updateLastMessage: (content: string) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
  initialSessionId: string | null;
  initialSession?: { id: string; title?: string };
  onSessionIdChange: (id: string | null) => void;
}

export function ChatProvider({ 
  children, 
  initialSessionId,
  initialSession,
  onSessionIdChange
}: ChatProviderProps) {
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(initialSessionId);
  const [currentSession, setCurrentSession] = useState<{ id: string; title?: string } | undefined>(initialSession);
  const [messages, setMessages] = useState<Partial<IChatMessage>[]>([]);
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    return localStorage.getItem('selectedModel') || 'gemini-2.5-flash';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const setCurrentSessionId = (id: string | null) => {
    setCurrentSessionIdState(id);
    onSessionIdChange(id);
  };

  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    localStorage.setItem('selectedModel', model);
  };

  const addMessage = (msg: Partial<IChatMessage>) => {
    setMessages(prev => [...prev, msg]);
  };

  const updateLastMessage = (content: string) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], content };
      return updated;
    });
  };

  const value: ChatContextValue = {
    currentSessionId,
    currentSession,
    messages,
    selectedModel,
    isLoading,
    isStreaming,
    setCurrentSessionId,
    setCurrentSession,
    setMessages,
    setSelectedModel,
    setIsLoading,
    setIsStreaming,
    addMessage,
    updateLastMessage
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}
