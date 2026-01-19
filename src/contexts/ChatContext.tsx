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
    isHistoryReady: boolean;

    // Skeleton Gate (Mode B): only show skeleton if switch is slow
    shouldShowSkeleton: boolean;

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
        // Intentionally left blank (no side effects on mount)
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

    // Indicates whether the current session's history has been hydrated into `messages`.
    // Used to prevent skeleton -> blank -> content flashes during session switching.
    //
    // IMPORTANT: Initialize from navigation state so empty sessions using `skipFetch` can
    // still dismiss skeleton even when `initialMessages` is an empty array.
    const [isHistoryReady, setIsHistoryReady] = useState(() => !!initialSkipFetch);

    // Mode B: delayed skeleton gate (avoid flashing skeleton on fast switches)
    // - On session change, wait `SKELETON_DELAY_MS`
    // - If history still isn't ready by then, show skeleton
    const SKELETON_DELAY_MS = 120;
    const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
    const skeletonDelayTimerRef = useRef<number | null>(null);

    // Avoid stale closures inside timers by reading the latest readiness from a ref.
    const isHistoryReadyRef = useRef(isHistoryReady);
    useEffect(() => {
        isHistoryReadyRef.current = isHistoryReady;
    }, [isHistoryReady]);

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

    // Session switching:
    // - We intentionally DO NOT clear messages here.
    // - `useChat` is the single owner of the hydration lifecycle (fetch/skipFetch/merge).
    // Clearing here can introduce an "empty frame" between skeleton removal and message hydration,
    // which causes visible white flashes.
    const prevSessionIdRef = useRef<string | null>(initialSessionId);
    useEffect(() => {
        const prevId = prevSessionIdRef.current;
        if (initialSessionId !== prevId) {
            // New session selected: history is not ready until useChat hydrates messages.
            setIsHistoryReady(false);

            // CRITICAL FIX: Clear messages immediately to prevent ghosting
            // Only preserve temp messages that belong to the new session (if any)
            setMessages(prev => {
                if (initialSessionId) {
                    // Keep only temp messages for the new session
                    return prev.filter(
                        m =>
                            m.sessionId === initialSessionId &&
                            m.id &&
                            String(m.id).startsWith('temp_')
                    );
                }
                // If clearing session (going to empty state), clear everything
                return [];
            });

            // Mode B: delay skeleton so fast switches don't flash
            setShouldShowSkeleton(false);
            if (skeletonDelayTimerRef.current) {
                window.clearTimeout(skeletonDelayTimerRef.current);
                skeletonDelayTimerRef.current = null;
            }
            skeletonDelayTimerRef.current = window.setTimeout(() => {
                // Only show skeleton if still not ready after the delay
                setShouldShowSkeleton(isHistoryReadyRef.current ? false : true);
            }, SKELETON_DELAY_MS);

            prevSessionIdRef.current = initialSessionId;
        }
    }, [initialSessionId]);

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

    // [OPTIMIZATION] Intercept session ID change to manage session switching.
    // Note: Loading state is now managed by useChat hook to avoid duplicate setIsLoading calls.
    // Message clearing is handled by the useEffect above to ensure consistent timing.
    const handleSetCurrentSessionId = useCallback(
        (
            id: string | null,
            options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
        ) => {
            setCurrentSessionId(id);
            // Handle options if needed (passed to useChat logic via effects or refs?)
            if (options?.skipFetch) {
                // If skipping fetch, ensure loading is off
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
        setIsHistoryReady,
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

    // When navigation provides skipFetch, we can consider history ready immediately.
    // This must work even if `initialMessages` is an empty array (empty session).
    useEffect(() => {
        if (initialSkipFetch) {
            setIsHistoryReady(true);
        }
    }, [initialSkipFetch]);

    // Whenever history becomes ready, skeleton should be off and any pending delay cancelled.
    useEffect(() => {
        if (isHistoryReady) {
            setShouldShowSkeleton(false);
            if (skeletonDelayTimerRef.current) {
                window.clearTimeout(skeletonDelayTimerRef.current);
                skeletonDelayTimerRef.current = null;
            }
        }
    }, [isHistoryReady]);

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
        isHistoryReady,

        // Mode B skeleton gate: parent UI should show skeleton if either:
        // - it's a slow switch (shouldShowSkeleton), OR
        // - the hook reports actual loading
        shouldShowSkeleton: shouldShowSkeleton || isLoading,

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
