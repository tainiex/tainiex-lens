import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { IChatMessage } from '@tainiex/shared-atlas';

interface UseChatScrollProps {
    messages: Partial<IChatMessage>[];
    isLoading: boolean;
    isStreaming: boolean;
    isFetchingMore: boolean;
    hasMore: boolean;
    nextCursor: string | undefined;
    scrollHeightBeforeRef: React.MutableRefObject<number>;
    fetchHistory: (before?: string) => void;
}

type RequestPushUpFn = (messageId: string | undefined) => void;

export function useChatScroll({
    messages,
    isLoading,
    isStreaming,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    fetchHistory,
}: UseChatScrollProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesListRef = useRef<HTMLDivElement>(null);
    const isInitialLoad = useRef(true);
    const isAutoScrollEnabled = useRef(false);

    // push-up state
    const pendingPushUpIdRef = useRef<string | undefined>(undefined);

    // Push up by messageId (called explicitly by parent via requestPushUp)
    const triggerPushUpById = useCallback(() => {
        if (!scrollContainerRef.current) return;

        const container = scrollContainerRef.current;
        const messageId = pendingPushUpIdRef.current;
        if (!messageId) return;

        // Disable auto-scroll immediately
        isAutoScrollEnabled.current = false;

        const doScroll = (id: string) => {
            if (!scrollContainerRef.current) return;
            const targetEl = scrollContainerRef.current.querySelector(
                `[data-message-id="${CSS.escape(String(id))}"]`
            ) as HTMLElement | null;
            if (!targetEl) {
                return;
            }
            const HEADER_OFFSET = 70;
            const GAP = 24;
            const targetScrollTop = targetEl.offsetTop - HEADER_OFFSET - GAP;

            scrollContainerRef.current.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth',
            });
        };

        // immediate
        doScroll(messageId);
        // delayed correction to counter SmoothLoader高度变化
        setTimeout(() => doScroll(messageId), 400);

        // Clear pending id after action
        pendingPushUpIdRef.current = undefined;
    }, []);

    const requestPushUp: RequestPushUpFn = useCallback((messageId?: string) => {
        pendingPushUpIdRef.current = messageId;
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;

            // Find the last message and scroll to show its bottom
            const messageElements = container.querySelectorAll('.message');
            const lastMessage = messageElements[messageElements.length - 1] as HTMLElement;

            if (lastMessage) {
                const messageBottom = lastMessage.offsetTop + lastMessage.offsetHeight;
                const targetScroll = messageBottom - container.clientHeight;

                container.scrollTo({
                    top: Math.max(0, targetScroll),
                    behavior,
                });
            } else {
                // Fallback if no messages found
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior,
                });
            }
        }
    }, []);

    // Reactively handle scrolling logic
    useLayoutEffect(() => {
        if (!scrollContainerRef.current) return;

        if (messages.length === 0) {
            scrollContainerRef.current.scrollTop = 0;
            return;
        }

        // 1. Initial Load: Stick to bottom
        if (isInitialLoad.current && messages.length > 0) {
            const container = scrollContainerRef.current;
            container.scrollTop = container.scrollHeight;
            // We do NOT set isInitialLoad.current = false here immediately.
            // We let the ResizeObserver handle subsequent layout shifts (e.g. SmoothLoader, images)
            // It will be disabled by the first user scroll interaction (handled in handleScroll).
            return;
        }

        // 2. Pagination Restore
        if (scrollHeightBeforeRef.current > 0) {
            const container = scrollContainerRef.current;
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - scrollHeightBeforeRef.current;
            scrollHeightBeforeRef.current = 0;
            return;
        }

        // 3. Push Up (Triggered by user send)
        if (pendingPushUpIdRef.current) {
            // Try to find element immediately
            triggerPushUpById();
        }
    }, [messages, scrollHeightBeforeRef, triggerPushUpById]);

    // Industrial Grade: Use ResizeObserver to maintain scroll position during layout shifts
    useEffect(() => {
        if (!messagesListRef.current || !scrollContainerRef.current) return;

        const observer = new ResizeObserver(() => {
            const container = scrollContainerRef.current;
            if (!container) return;

            // Scenario A: Initial Load - Force stick to bottom until user interacts
            if (isInitialLoad.current) {
                container.scrollTop = container.scrollHeight;
                return;
            }

            // Scenario B: Push Up Correction - Re-apply if layout shifts occurred after trigger
            if (pendingPushUpIdRef.current) {
                triggerPushUpById();
            }
        });

        observer.observe(messagesListRef.current);
        return () => observer.disconnect();
    }, [triggerPushUpById]);

    // Disabled viewport-based and resize-observer auto scroll to avoid unexpected jumps
    // useEffect(() => { ... }, [scrollToBottom]);
    // useEffect(() => { ... }, [isStreaming, scrollToBottom]);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        // If user manually scrolls UP away from bottom, disable initial load sticking
        if (isInitialLoad.current && !isAtBottom) {
            isInitialLoad.current = false;
        }

        if (isLoading) {
            isAutoScrollEnabled.current = isAtBottom;
        }

        if (isFetchingMore || !hasMore || !nextCursor) return;

        if (scrollTop < 50) {
            fetchHistory(nextCursor);
        }
    }, [isLoading, isFetchingMore, hasMore, nextCursor, fetchHistory]);

    const resetScrollState = useCallback(() => {
        isInitialLoad.current = true;
        isAutoScrollEnabled.current = true;
    }, []);

    const enableAutoScroll = useCallback(() => {
        isAutoScrollEnabled.current = true;
    }, []);

    return {
        scrollContainerRef,
        messagesListRef,
        scrollToBottom,
        handleScroll,
        resetScrollState,
        enableAutoScroll,
        isAutoScrollEnabled,
        requestPushUp,
    };
}
