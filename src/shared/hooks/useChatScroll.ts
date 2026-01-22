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
    const shouldAutoScroll = useRef(true);
    const prevMessagesLength = useRef(messages.length);
    const isUserScrollingRef = useRef(false);
    const forceScrollToBottomRef = useRef(false);
    const userScrolledUpDuringStreamingRef = useRef(false);

    // Check if user is at bottom (with generous threshold)
    const isAtBottom = useCallback(() => {
        if (!scrollContainerRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Allow up to 100px offset from bottom
        return scrollHeight - scrollTop - clientHeight < 100;
    }, []);

    // Simple scroll to bottom
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior,
        });
    }, []);

    // Handle scroll events
    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;

        const atBottom = isAtBottom();

        // Update auto-scroll preference based on user position
        shouldAutoScroll.current = atBottom;

        // Disable initial load behavior once user scrolls
        if (isInitialLoad.current && !atBottom) {
            isInitialLoad.current = false;
        }

        // Pagination: load more when scrolling to top
        if (!isFetchingMore && hasMore && nextCursor) {
            const { scrollTop } = scrollContainerRef.current;
            if (scrollTop < 100) {
                fetchHistory(nextCursor);
            }
        }
    }, [isAtBottom, isFetchingMore, hasMore, nextCursor, fetchHistory]);

    // Auto-scroll on new messages
    useLayoutEffect(() => {
        if (!scrollContainerRef.current) return;

        const container = scrollContainerRef.current;

        // Initial load: always scroll to bottom
        if (isInitialLoad.current && messages.length > 0) {
            container.scrollTop = container.scrollHeight;
            return;
        }

        // Pagination restore
        if (scrollHeightBeforeRef.current > 0) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - scrollHeightBeforeRef.current;
            scrollHeightBeforeRef.current = 0;
            return;
        }

        // New message added
        if (messages.length > prevMessagesLength.current) {
            const newMessages = messages.slice(prevMessagesLength.current);
            const hasNewUserMessage = newMessages.some(msg => msg.role === 'user');

            // ALWAYS scroll to bottom if user sent a new message (they want to see the response)
            if (hasNewUserMessage) {
                shouldAutoScroll.current = true;
                forceScrollToBottomRef.current = true; // Force ResizeObserver to scroll
                isUserScrollingRef.current = false; // Clear user scrolling flag
                userScrolledUpDuringStreamingRef.current = false; // Reset streaming scroll flag
                scrollToBottom('smooth');
            } else if (shouldAutoScroll.current) {
                // For AI messages, only scroll if already at bottom
                scrollToBottom(isStreaming ? 'auto' : 'smooth');
            }
        }

        prevMessagesLength.current = messages.length;
    }, [messages, scrollHeightBeforeRef, isStreaming, scrollToBottom]);

    // ResizeObserver to handle dynamic content height changes (streaming, images loading, etc.)
    useEffect(() => {
        if (!messagesListRef.current || !scrollContainerRef.current) return;

        const container = scrollContainerRef.current;
        let isUserScrolling = false;
        let scrollTimeout: NodeJS.Timeout;
        let lastScrollTop = container.scrollTop;
        let scrollStartTop = container.scrollTop; // Track where scrolling started

        // Detect when user is actively scrolling
        const handleUserScroll = () => {
            const currentScrollTop = container.scrollTop;
            const scrollingDown = currentScrollTop > lastScrollTop;
            const { clientHeight } = container;

            // Calculate scroll distance from start
            const scrollDistance = scrollStartTop - currentScrollTop; // Positive = scrolling up

            if (scrollingDown) {
                // User scrolling down
                if (isAtBottom()) {
                    // Reached bottom - clear all flags
                    isUserScrolling = false;
                    shouldAutoScroll.current = true;
                    userScrolledUpDuringStreamingRef.current = false;
                }
                // Reset scroll start when changing direction
                scrollStartTop = currentScrollTop;
            } else {
                // User scrolling up
                isUserScrolling = true;

                // Only mark as "intentionally scrolled up" if they scrolled > half viewport
                if (isStreaming && scrollDistance > clientHeight / 2) {
                    userScrolledUpDuringStreamingRef.current = true;
                }
            }

            lastScrollTop = currentScrollTop;
            clearTimeout(scrollTimeout);

            // Consider scrolling done after 150ms of no scroll events
            scrollTimeout = setTimeout(() => {
                isUserScrolling = false;
                scrollStartTop = container.scrollTop; // Reset start position
            }, 150);
        };

        container.addEventListener('scroll', handleUserScroll, { passive: true });

        const observer = new ResizeObserver(() => {
            if (!container) return;

            // Force scroll if user just sent a message (overrides all checks)
            if (forceScrollToBottomRef.current) {
                requestAnimationFrame(() => {
                    if (container) {
                        // Use smooth scroll for better UX (push-up animation effect)
                        container.scrollTo({
                            top: container.scrollHeight,
                            behavior: 'smooth',
                        });
                    }
                });
                forceScrollToBottomRef.current = false;
                return;
            }

            // Don't interfere if user is actively scrolling
            if (isUserScrolling) return;

            // Determine if we should auto-scroll based on context
            let shouldScroll = false;

            if (isStreaming) {
                // During AI streaming: only stop if user intentionally scrolled up significantly
                // Small accidental scrolls (< half viewport) won't stop auto-scroll
                shouldScroll = !userScrolledUpDuringStreamingRef.current || isInitialLoad.current;
            } else {
                // When not streaming: only scroll if user is very close to bottom
                shouldScroll = isAtBottom() || isInitialLoad.current;
            }

            if (shouldScroll) {
                // Use RAF to ensure DOM has updated
                requestAnimationFrame(() => {
                    if (container) {
                        // Instant scroll during streaming for smoother experience
                        container.scrollTop = container.scrollHeight;
                    }
                });
            }
        });

        observer.observe(messagesListRef.current);

        return () => {
            observer.disconnect();
            container.removeEventListener('scroll', handleUserScroll);
            clearTimeout(scrollTimeout);
        };
    }, [isAtBottom, isStreaming]);

    const resetScrollState = useCallback(() => {
        isInitialLoad.current = true;
        shouldAutoScroll.current = true;
    }, []);

    const enableAutoScroll = useCallback(() => {
        shouldAutoScroll.current = true;
        scrollToBottom('smooth');
    }, [scrollToBottom]);

    return {
        scrollContainerRef,
        messagesListRef,
        scrollToBottom,
        handleScroll,
        resetScrollState,
        enableAutoScroll,
    };
}
