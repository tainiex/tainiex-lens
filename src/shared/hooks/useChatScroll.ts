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
    const isAutoScrollEnabled = useRef(true);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior,
            });
        }
    }, []);

    // Auto-scroll during message updates (streaming)
    useEffect(() => {
        if (isLoading && isAutoScrollEnabled.current) {
            scrollToBottom();
        }
    }, [messages, isLoading, scrollToBottom]);

    // Perform scroll adjustment after messages are rendered
    useLayoutEffect(() => {
        if (!scrollContainerRef.current) return;

        if (messages.length === 0) {
            // Reset scroll to top when messages are cleared (e.g. switching sessions)
            // This ensures the Skeleton (which is at the top) is visible.
            scrollContainerRef.current.scrollTop = 0;
            return;
        }

        if (isInitialLoad.current && messages.length > 0) {
            scrollToBottom();
            isInitialLoad.current = false;
        } else if (scrollHeightBeforeRef.current > 0) {
            const container = scrollContainerRef.current;
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - scrollHeightBeforeRef.current;
            scrollHeightBeforeRef.current = 0; // Reset
        }
    }, [messages, scrollToBottom, scrollHeightBeforeRef]);

    // Manage visual viewport for mobile keyboards
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const handleViewportChange = () => {
            if (scrollContainerRef.current) {
                scrollToBottom();
            }

            const chatInterface = document.querySelector('.chat-interface') as HTMLElement;
            if (chatInterface) {
                chatInterface.style.height = `${viewport.height}px`;
                chatInterface.style.bottom = '0';
                window.scrollTo(0, 0);
            }
        };

        viewport.addEventListener('resize', handleViewportChange);
        viewport.addEventListener('scroll', handleViewportChange);

        return () => {
            viewport.removeEventListener('resize', handleViewportChange);
            viewport.removeEventListener('scroll', handleViewportChange);
        };
    }, [scrollToBottom]);

    // PRECISE AUTO-SCROLL: Use ResizeObserver to track message list growth
    useEffect(() => {
        if (!messagesListRef.current) return;

        const observer = new ResizeObserver(() => {
            if (isStreaming && isAutoScrollEnabled.current) {
                scrollToBottom();
            }
        });

        observer.observe(messagesListRef.current);
        return () => observer.disconnect();
    }, [isStreaming, scrollToBottom]);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

        // Detect manual scroll: if user scrolls up from the bottom (with 50px buffer)
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        if (isLoading) {
            isAutoScrollEnabled.current = isAtBottom;
        }

        if (isFetchingMore || !hasMore || !nextCursor) return;

        // Trigger load more when user scrolls to the top (within threshold)
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
    };
}
