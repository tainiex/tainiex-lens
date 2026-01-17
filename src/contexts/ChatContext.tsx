import {
    createContext,
    useContext,
    useState,
    ReactNode,
    useEffect,
    useRef,
    useCallback,
} from 'react';
import { IChatMessage } from '@tainiex/shared-atlas';
import { useChat } from '@/shared';

interface ChatContextValue {
    // State
    currentSessionId: string | null;
    currentSession: { id: string; title?: string } | undefined;
    messages: Partial<IChatMessage>[];
    selectedModel: string;
    isLoading: boolean;
    isStreaming: boolean;

    // Connection State
    isConnected: boolean;
    wsError: string | null;

    // Methods
    setCurrentSessionId: (
        id: string | null,
        options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
    ) => void;
    setCurrentSession: (session: { id: string; title?: string } | undefined) => void;
    setMessages: (
        messages:
            | Partial<IChatMessage>[]
            | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])
    ) => void;
    setSelectedModel: (model: string) => void;
    setIsLoading: (loading: boolean) => void;
    setIsStreaming: (streaming: boolean) => void;
    addMessage: (msg: Partial<IChatMessage>) => void;
    updateLastMessage: (content: string) => void;

    // Pagination
    hasMore: boolean;
    isFetchingMore: boolean;
    loadMoreMessages: () => Promise<void>;

    // Actions
    handleSend: (message: string, parentId?: string) => Promise<void>;
    reconnect: () => void;
    models: (string | { name: string })[];
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

interface ChatProviderProps {
    children: ReactNode;
    initialSessionId: string | null;
    initialSession?: { id: string; title?: string };
    initialMessages?: Partial<IChatMessage>[];
    onSessionIdChange: (
        id: string | null,
        options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
    ) => void;
    onSessionCreated?: () => void;
    onSessionUpdate?: (title?: string) => void;
    initialSkipFetch?: boolean;
}

export function ChatProvider({
    children,
    initialSessionId,
    initialSession,
    initialMessages = [],
    onSessionIdChange,
    onSessionCreated,
    // onSessionUpdate, // Currently unused
    initialSkipFetch,
}: ChatProviderProps) {
    useEffect(() => {
        // console.log('[ChatProvider] Mounted', { initialSessionId, initialSkipFetch });
        // return () => console.log('[ChatProvider] Unmounted');
    }, []);

    const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(initialSessionId);
    const [currentSession, setCurrentSession] = useState<
        { id: string; title?: string } | undefined
    >(initialSession);

    // Sync state with props when they change
    useEffect(() => {
        if (initialSessionId !== undefined) {
            setCurrentSessionIdState(initialSessionId);
        }
    }, [initialSessionId]);

    useEffect(() => {
        setCurrentSession(initialSession);
    }, [initialSession]);

    const [messages, setMessages] = useState<Partial<IChatMessage>[]>(initialMessages);

    // Sync messages if initialMessages prop changes
    useEffect(() => {
        if (initialMessages && initialMessages.length > 0) {
            setMessages(initialMessages);
        }
    }, [initialMessages]);
    // ...
    // [FIX] Clear messages when session changes, unless we are skipping fetch (New Chat -> Created)
    // This prevents ghosting of old messages while preserving new chat context.

    const [selectedModel, setSelectedModelState] = useState<string>(() => {
        return localStorage.getItem('selectedModel') || 'gemini-2.5-flash';
    });
    // These local states are now controlled/synced by useChat mostly,
    // but useChat expects us to pass setters or it manages them?
    // Let's check useChat signature. It manages some, but accepts setters for external control.
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);

    const setCurrentSessionId = (
        id: string | null,
        options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
    ) => {
        // Optimistic session reset/init
        if (id && id !== currentSessionId) {
            // We can't know the title for sure, but we can prevent "Chat" by using "New Chat" logic or waiting.
            // If options.skipFetch is true (new session created), we might assume it's valid.
            // But we don't have the title unless we pass it.
        }
        setCurrentSessionIdState(id);
        onSessionIdChange(id, options);
    };

    const setSelectedModel = (model: string) => {
        setSelectedModelState(model);
        localStorage.setItem('selectedModel', model);
    };

    const addMessage = (msg: Partial<IChatMessage>) => {
        setMessages(prev => [...prev, msg]);
    };

    // [FIX] Clear messages when session changes, unless we are skipping fetch (New Chat -> Created)
    // This prevents ghosting of old messages while preserving new chat context.
    const prevSessionIdRef = useRef<string | null>(initialSessionId);
    useEffect(() => {
        const prevId = prevSessionIdRef.current;
        if (initialSessionId !== prevId) {
            if (initialSessionId && !initialSkipFetch) {
                setMessages([]);
            }
            prevSessionIdRef.current = initialSessionId;
        }
    }, [initialSessionId, initialSkipFetch]);

    const updateLastMessage = (content: string) => {
        setMessages(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content };
            return updated;
        });
    };

    // Wrapper for session update to update local state immediately
    const handleSessionUpdateWrapper = (title?: string) => {
        if (title && currentSessionId) {
            setCurrentSession(prev => ({ ...prev, id: currentSessionId, title }));
        }
    };

    // [OPTIMIZATION] Intercept session ID change to trigger IMMEDIATE loading state.
    // This prevents "Flash of Old Content" or "White Screen" between click and useEffect fetch.
    const handleSetCurrentSessionId = useCallback(
        (
            id: string | null,
            options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
        ) => {
            if (id !== currentSessionId) {
                // If switching to a valid session, start loading IMMEDIATELY (Frame 0)
                // BUT only if we are NOT skipping fetch (e.g. creating new session with optimistic data)
                if (id && !options?.skipFetch) {
                    setIsLoading(true);
                }
                // Clear messages to prevent seeing old session data during switch
                if (!options?.initialMessages) {
                    setMessages([]);
                }
            }
            setCurrentSessionId(id);
            // Handle options if needed (passed to useChat logic via effects or refs?)
            if (options?.skipFetch) {
                // If skipping fetch, maybe don't set loading?
                if (id) setIsLoading(false);
            }
        },
        [currentSessionId]
    );

    // Integrate useChat here
    // We need to support onSessionCreated/Update for the layout to know
    // But onSessionIdChange acts as the creation callback in a way (when ID switches)

    const {
        models,
        isConnected,
        wsError,
        handleSend,
        reconnect,
        shouldSkipHistoryFetchRef,
        hasMore,
        isFetchingMore,
        loadMoreMessages,
    } = useChat({
        currentSessionId,
        setCurrentSessionId, // This calls the context wrapper which calls onSessionIdChange (navigates)
        messages,
        setMessages,
        selectedModel,
        setIsLoading,
        setIsStreaming,
        onSessionCreated, // Pass through
        onSessionUpdate: handleSessionUpdateWrapper, // Intercept to update local title

        enableAutoScroll: () => {
            // We can't scroll from here easily as ref is in ChatMessages or ChatInterface
            // But we can expose a way to trigger it?
            // Or we just ignore it here and let ChatInterface handle scrolling on message changes.
            window.dispatchEvent(new CustomEvent('chat-scroll-request'));
        },
        initialSkipFetch,
    });

    // Check if we need to skip fetch based on navigation state
    // Effect handles initialMessages sync. useChat handles fetching.
    // If we have initialMessages, we might want to tell useChat to skip fetch?
    useEffect(() => {
        if (initialMessages && initialMessages.length > 0) {
            shouldSkipHistoryFetchRef.current = true;
        }
    }, [initialMessages, shouldSkipHistoryFetchRef]);

    // [FIX] Force sync skip ref with prop to ensure prop updates (e.g. true -> undefined) are respected
    useEffect(() => {
        // Only update if explicit boolean (true/false), or handle undefined as false?
        // Navigation state might be undefined.
        shouldSkipHistoryFetchRef.current = !!initialSkipFetch;
    }, [initialSkipFetch, shouldSkipHistoryFetchRef]);

    const value: ChatContextValue = {
        currentSessionId,
        currentSession,
        messages,
        selectedModel,
        isLoading,
        isStreaming,
        isConnected,
        wsError,
        setCurrentSessionId: handleSetCurrentSessionId,
        setCurrentSession,
        setMessages,
        setSelectedModel,
        setIsLoading,
        setIsStreaming,
        addMessage,
        updateLastMessage,
        handleSend,
        reconnect,
        models,
        hasMore,
        isFetchingMore,
        loadMoreMessages,
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
