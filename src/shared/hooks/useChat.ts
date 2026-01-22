import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatRole, IChatMessage, GetMessagesResponse } from '@tainiex/shared-atlas';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import { useChatSocket } from './useChatSocket';
import { useSendMessage } from './useSendMessage';

interface UseChatProps {
    currentSessionId: string | null;
    setCurrentSessionId: (
        id: string | null,
        options?: { skipFetch?: boolean; initialMessages?: Partial<IChatMessage>[] }
    ) => void;
    messages: Partial<IChatMessage>[];
    setMessages: (
        messages:
            | Partial<IChatMessage>[]
            | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])
    ) => void;
    selectedModel: string;
    setIsLoading: (loading: boolean) => void;
    setIsStreaming: (streaming: boolean) => void;
    setIsHistoryReady?: (ready: boolean) => void;
    onSessionCreated?: () => void;
    onSessionUpdate?: (title?: string) => void;
    enableAutoScroll: () => void;
    requestPushUp?: (messageId?: string) => void;
    initialSkipFetch?: boolean;
    pageSize?: number;
}

export function useChat({
    currentSessionId,
    setCurrentSessionId,
    setMessages,
    selectedModel,
    setIsLoading,
    setIsStreaming,
    setIsHistoryReady,
    onSessionCreated,
    onSessionUpdate,
    enableAutoScroll,
    requestPushUp,
    initialSkipFetch = false,
    pageSize = 20,
}: UseChatProps) {
    const [models, setModels] = useState<(string | { name: string })[]>([]);

    // WebSocket hooks
    const { socket, isConnected, error: wsError, reconnect } = useChatSocket();
    const {
        sendMessage: wsSendMessage,
        isStreaming: wsStreaming,
        streamingText,
        currentMessage,
        setCurrentMessage,
    } = useSendMessage(socket, onSessionUpdate);

    // Refs
    const currentSessionIdRef = useRef(currentSessionId);
    const shouldSkipHistoryFetchRef = useRef(initialSkipFetch);
    const lastFetchedSessionIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    useEffect(() => {
        logger.debug('[useChat] currentSessionId changed:', currentSessionId);

        // Check if session ID actually changed
        const sessionChanged = currentSessionId !== currentSessionIdRef.current;
        currentSessionIdRef.current = currentSessionId;

        // Abort previous fetch ONLY if session actually changed
        // This prevents unnecessary abort during React StrictMode double-invocation
        if (sessionChanged && abortControllerRef.current) {
            logger.debug('[useChat] Aborting previous fetch due to session switch');
            abortControllerRef.current.abort(new Error('Session switched'));
            abortControllerRef.current = null;
        }

        logger.debug('[SkeletonDebug][useChat][session-change]', {
            currentSessionId,
            sessionChanged,
            shouldSkipHistoryFetch: shouldSkipHistoryFetchRef.current,
            lastFetchedSessionId: lastFetchedSessionIdRef.current,
            ts: performance.now(),
        });

        // New session selection: history is not ready until we hydrate messages for this session.
        setIsHistoryReady?.(false);

        // Fetch history when session ID changes
        const loadHistory = async () => {
            if (shouldSkipHistoryFetchRef.current) {
                logger.debug('[useChat] Skipping history fetch for session:', currentSessionId);

                logger.debug('[SkeletonDebug][useChat][skip-fetch]', {
                    currentSessionId,
                    ts: performance.now(),
                });

                shouldSkipHistoryFetchRef.current = false;
                // Important: Mark as fetched so we don't fetch again if effect re-runs
                lastFetchedSessionIdRef.current = currentSessionId;
                // Ensure loading is off if we skip fetch (assuming data is already provided)
                setIsLoading(false);

                // Messages should already be provided by navigation state; mark ready immediately.
                setIsHistoryReady?.(true);
                return;
            }

            if (!currentSessionId) {
                logger.debug('[useChat] No session ID, clearing messages');

                logger.debug('[SkeletonDebug][useChat][no-session]', {
                    currentSessionId,
                    ts: performance.now(),
                });

                setMessages([]);
                setHasMore(false);
                setNextCursor(null);
                lastFetchedSessionIdRef.current = null;
                setIsLoading(false); // Ensure loading is off

                // No session means no history to hydrate.
                setIsHistoryReady?.(true);
                return;
            }

            // Deduplicate requests for the same session
            if (currentSessionId === lastFetchedSessionIdRef.current) {
                logger.debug('[useChat] Session already fetched, skipping:', currentSessionId);

                logger.debug('[SkeletonDebug][useChat][dedupe-skip]', {
                    currentSessionId,
                    lastFetchedSessionId: lastFetchedSessionIdRef.current,
                    ts: performance.now(),
                });

                setIsLoading(false); // Ensure loading is off

                // If we already fetched this session, consider it ready.
                setIsHistoryReady?.(true);
                return;
            }
            lastFetchedSessionIdRef.current = currentSessionId;

            // Create new abort controller for this fetch
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            logger.debug('[useChat] Starting fetch for session:', currentSessionId);

            logger.debug('[SkeletonDebug][useChat][fetch:start]', {
                currentSessionId,
                pageSize,
                ts: performance.now(),
            });

            setIsLoading(true);
            try {
                const url = `/api/chat/sessions/${currentSessionId}/messages?limit=${pageSize}`;
                logger.debug('[useChat] Requesting URL:', url);
                const res = await apiClient.get(url, {
                    signal: abortController.signal,
                });

                // Check if aborted before processing
                if (abortController.signal.aborted) {
                    logger.debug('[useChat] Fetch was aborted, skipping processing');
                    return;
                }

                logger.debug('[useChat] API Response status:', res.status);

                if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);

                const data = (await res.json()) as GetMessagesResponse | Partial<IChatMessage>[];
                logger.debug(
                    '[useChat] API Data received type:',
                    Array.isArray(data) ? 'Array' : 'Object'
                );

                let msgs: Partial<IChatMessage>[] = [];
                let newHasMore = false;
                let newNextCursor = null;

                // Handle both new pagination format and potential legacy array format
                if (Array.isArray(data)) {
                    msgs = data;
                } else if (data && Array.isArray(data.messages)) {
                    msgs = data.messages;
                    newHasMore = data.hasMore || false;
                    newNextCursor = data.nextCursor || null;
                }

                logger.debug(`[useChat] Parsed ${msgs.length} messages, hasMore: ${newHasMore}`);

                logger.debug('[SkeletonDebug][useChat][fetch:parsed]', {
                    currentSessionId,
                    msgsLen: msgs.length,
                    hasMore: newHasMore,
                    nextCursor: newNextCursor,
                    ts: performance.now(),
                });

                setHasMore(newHasMore);
                setNextCursor(newNextCursor);

                setMessages(prev => {
                    // Critical Fix: Merge fetched history with local optimistic messages
                    // This prevents loadHistory from wiping out messages that are currently being sent (starting with temp_)
                    // IMPORTANT: Only preserve temp messages that belong to the CURRENT session
                    const tempMsgs = prev.filter(
                        m =>
                            m.id &&
                            String(m.id).startsWith('temp_') &&
                            m.sessionId === currentSessionId
                    );

                    logger.debug('[SkeletonDebug][useChat][setMessages:merge]', {
                        currentSessionId,
                        prevLen: prev.length,
                        tempLen: tempMsgs.length,
                        fetchedLen: msgs.length,
                        resultLen: msgs.length + tempMsgs.length,
                        ts: performance.now(),
                    });

                    if (tempMsgs.length > 0) {
                        logger.debug(
                            `[useChat] Preserving ${tempMsgs.length} optimistic messages for session ${currentSessionId}`
                        );
                    }

                    return [...msgs, ...tempMsgs];
                });

                // Mark ready on next frame so React has a chance to commit the hydrated messages.
                // IMPORTANT: This must also become true when the session has 0 messages, otherwise
                // the skeleton will never dismiss for empty sessions.
                requestAnimationFrame(() => {
                    logger.debug('[SkeletonDebug][useChat][historyReady:raf(after-setMessages)]', {
                        currentSessionId,
                        ts: performance.now(),
                    });
                    setIsHistoryReady?.(true);
                });

                // Allow UI to settle then scroll
                // NOTE: For empty sessions this is still safe; it just keeps layout consistent.
                setTimeout(enableAutoScroll, 100);
            } catch (error) {
                // Ignore abort errors
                if (error instanceof Error && error.name === 'AbortError') {
                    logger.debug('[useChat] Fetch aborted');
                    return;
                }

                logger.error('[useChat] Load history error:', error);

                logger.debug('[SkeletonDebug][useChat][fetch:error]', {
                    currentSessionId,
                    error,
                    ts: performance.now(),
                });
            } finally {
                // Clear abort controller ref if this is still the current one
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }

                logger.debug('[useChat] Fetch finished, turning off loading');

                logger.debug('[SkeletonDebug][useChat][fetch:finally]', {
                    currentSessionId,
                    ts: performance.now(),
                });

                setIsLoading(false);

                // Safety net: ensure history-ready is eventually true even if the request fails
                // or if React batching delays the RAF above.
                requestAnimationFrame(() => {
                    logger.debug('[SkeletonDebug][useChat][historyReady:raf(finally)]', {
                        currentSessionId,
                        ts: performance.now(),
                    });
                    setIsHistoryReady?.(true);
                });
            }
        };

        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSessionId]);

    const loadMoreMessages = useCallback(async () => {
        if (!currentSessionIdRef.current || !nextCursor || isFetchingMore) return;

        setIsFetchingMore(true);
        try {
            logger.debug(
                `[useChat] Fetching more messages, limit=${pageSize}, cursor: ${nextCursor}`
            );
            const queryString = nextCursor
                ? `limit=${pageSize}&before=${encodeURIComponent(nextCursor)}`
                : `limit=${pageSize}`;
            const res = await apiClient.get(
                `/api/chat/sessions/${currentSessionIdRef.current}/messages?${queryString}`
            );
            if (!res.ok) throw new Error('Failed to load more messages');

            const data = (await res.json()) as GetMessagesResponse;

            let newMsgs: Partial<IChatMessage>[] = [];
            let newHasMore = false;
            let newNextCursor = null;

            if (data && Array.isArray(data.messages)) {
                newMsgs = data.messages;
                newHasMore = data.hasMore || false;
                newNextCursor = data.nextCursor || null;
                logger.debug(
                    `[useChat] Loaded more messages:Count=${newMsgs.length}, hasMore=${newHasMore}`
                );
            }

            setHasMore(newHasMore);
            setNextCursor(newNextCursor);

            setMessages(prev => [...newMsgs, ...prev]);
        } catch (error) {
            logger.error('[useChat] Load more error:', error);
        } finally {
            setIsFetchingMore(false);
        }
    }, [nextCursor, isFetchingMore, setMessages]);

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

    // Fetch available models from backend
    useEffect(() => {
        apiClient
            .get('/api/chat/models')
            .then(res => {
                if (!res.ok) {
                    logger.error('[useChat] Failed to fetch models:', res.status);
                    throw new Error(`API returned status ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                const list = Array.isArray(data) ? data : data.models || [];
                if (list.length === 0) {
                    logger.warn('[useChat] Backend returned empty model list');
                }
                setModels(list);
            })
            .catch(error => {
                logger.error('[useChat] Failed to load models from backend:', error);
                // Set empty array - UI should handle this gracefully
                setModels([]);
            });
    }, []);

    const handleSend = useCallback(
        async (inputValue: string, parentId?: string) => {
            if (!inputValue.trim()) return;

            // Reset scroll lock when sending a new message to follow the new response
            enableAutoScroll();

            const msgToSend = inputValue;
            // Removed setIsLoading(true) to allow optimistic UI to show immediately without skeleton

            let sessionId = currentSessionId;

            try {
                // Prepare optimistic messages immediately (needed for navigation state)
                const userMessageId = `temp_${Date.now()}`;
                const userMessage: Partial<IChatMessage> = {
                    id: userMessageId,
                    sessionId: sessionId ?? undefined,
                    role: ChatRole.USER,
                    content: msgToSend,
                    parentId,
                };
                const assistantMsgId = `temp_ai_${Date.now()}`;
                const assistantMessage: Partial<IChatMessage> = {
                    id: assistantMsgId,
                    sessionId: sessionId ?? undefined,
                    role: ChatRole.ASSISTANT,
                    content: '',
                    parentId: userMessage.id,
                };
                const optimisticMessages = [userMessage, assistantMessage];

                // 1. Create session if it doesn't exist
                if (!sessionId) {
                    const sessionRes = await apiClient.post('/api/chat/sessions', {
                        title: msgToSend.slice(0, 30) + (msgToSend.length > 30 ? '...' : ''),
                    });
                    if (!sessionRes.ok) throw new Error('Failed to create session');
                    const sessionData = await sessionRes.json();
                    sessionId = sessionData.id;

                    // UPDATE temp messages with real session ID (convert null to undefined)
                    userMessage.sessionId = sessionId ?? undefined;
                    assistantMessage.sessionId = sessionId ?? undefined;

                    shouldSkipHistoryFetchRef.current = true;

                    setCurrentSessionId(sessionId, {
                        skipFetch: true,
                        initialMessages: optimisticMessages,
                    });
                    onSessionCreated?.();
                }

                // Ensure we have a valid sessionId before proceeding
                if (!sessionId) {
                    throw new Error('Session ID missing after creation');
                }
                const sessionIdStr = sessionId as string;

                // 2. Add local user message (with a temporary ID prefix)
                setMessages(prev => [
                    ...prev.filter(m => m.id !== 'welcome'),
                    ...optimisticMessages,
                ]);

                // Trigger push-up only for this user message
                if (requestPushUp) {
                    requestPushUp(userMessageId);
                }

                // 3. Send message via WebSocket
                await wsSendMessage({
                    sessionId: sessionIdStr,
                    content: msgToSend,
                    model: selectedModel,
                    parentId,
                });
            } catch (error) {
                logger.error('Chat error:', error);
                const errorMsg = '\n[Error: Connection failed]';
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === ChatRole.ASSISTANT) {
                        return prev.map((msg, idx) =>
                            idx === prev.length - 1
                                ? { ...msg, content: (msg.content || '') + errorMsg }
                                : msg
                        );
                    }
                    return prev;
                });
            }
        },
        [
            currentSessionId,
            setCurrentSessionId,
            setMessages,
            selectedModel,
            setIsLoading,
            onSessionCreated,
            wsSendMessage,
            enableAutoScroll,
        ]
    );

    return {
        models,
        isConnected,
        wsError,
        handleSend,
        requestPushUp,
        shouldSkipHistoryFetchRef,
        currentMessage,
        setCurrentMessage,
        reconnect,
        hasMore,
        isFetchingMore,
        loadMoreMessages,
    };
}
