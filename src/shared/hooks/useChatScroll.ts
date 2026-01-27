import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { SCROLL_CONFIG } from '@/shared/config/scrollConfig';
import { logger } from '@/shared/utils/logger';
import type { UseChatScrollProps, UseChatScrollReturn } from '@/shared/types/scroll';

export function useChatScroll({
    messages,
    isStreaming,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    fetchHistory,
}: UseChatScrollProps): UseChatScrollReturn {
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
        // Allow up to BOTTOM_THRESHOLD offset from bottom
        return scrollHeight - scrollTop - clientHeight < SCROLL_CONFIG.BOTTOM_THRESHOLD;
    }, []);

    // Simple scroll to bottom
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        try {
            if (!scrollContainerRef.current) return;
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior,
            });
        } catch (error) {
            // Fallback to instant scroll if smooth scrolling fails
            logger.warn('[useChatScroll] scrollToBottom error, using fallback:', error);
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
        }
    }, []);

    // Handle scroll events
    const handleScroll = useCallback(() => {
        try {
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
                if (scrollTop < SCROLL_CONFIG.BOTTOM_THRESHOLD) {
                    fetchHistory(nextCursor);
                }
            }
        } catch (error) {
            logger.error('[useChatScroll] handleScroll error:', error);
        }
    }, [isAtBottom, isFetchingMore, hasMore, nextCursor, fetchHistory]);

    // Auto-scroll on new messages
    useLayoutEffect(() => {
        if (!scrollContainerRef.current) return;

        const container = scrollContainerRef.current;

        // Initial load: always scroll to bottom IMMEDIATELY (no animation)
        // Use requestAnimationFrame to ensure DOM has updated
        if (isInitialLoad.current && messages.length > 0) {
            // Immediate scroll
            container.scrollTop = container.scrollHeight;
            // Also schedule a RAF scroll to catch any late-rendered content
            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
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
                isInitialLoad.current = true; // Treat like initial load to ensure auto-scroll works
                // Use instant scroll to ensure we reach bottom immediately
                container.scrollTop = container.scrollHeight;
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

        // Check if ResizeObserver is supported
        if (typeof ResizeObserver === 'undefined') {
            logger.warn(
                '[useChatScroll] ResizeObserver not supported, falling back to mutation observer'
            );
            // Fallback: use MutationObserver for older browsers
            // This is less efficient but provides basic functionality
            const fallbackObserver = new MutationObserver(() => {
                if (shouldAutoScroll.current && scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                }
            });
            fallbackObserver.observe(messagesListRef.current, {
                childList: true,
                subtree: true,
                characterData: true,
            });
            return () => {
                fallbackObserver.disconnect();
            };
        }

        const container = scrollContainerRef.current;
        let scrollTimeout: NodeJS.Timeout;
        let lastScrollTop = container.scrollTop;
        let scrollStartTop = container.scrollTop;
        let lastProgrammaticScrollTime = 0;
        let rafId: number | null = null;

        // Detect when user is actively scrolling
        const handleUserScroll = () => {
            const now = Date.now();
            // Ignore scroll events within PROGRAMMATIC_SCROLL_WINDOW of programmatic scroll
            if (now - lastProgrammaticScrollTime < SCROLL_CONFIG.PROGRAMMATIC_SCROLL_WINDOW) {
                return;
            }

            const currentScrollTop = container.scrollTop;
            const scrollingDown = currentScrollTop > lastScrollTop;
            const { clientHeight } = container;

            // Calculate scroll distance from start
            const scrollDistance = Math.abs(scrollStartTop - currentScrollTop);

            if (scrollingDown) {
                // User scrolling down
                if (isAtBottom()) {
                    // Reached bottom - clear all flags and enable auto-scroll
                    shouldAutoScroll.current = true;
                    userScrolledUpDuringStreamingRef.current = false;
                    scrollStartTop = currentScrollTop;
                }
            } else {
                // User scrolling up - only trigger if significant movement
                if (scrollDistance > SCROLL_CONFIG.SCROLL_THRESHOLD) {
                    // Mark as "intentionally scrolled up" if they scrolled up significantly
                    // Use a smaller threshold during streaming to be more responsive
                    const threshold = isStreaming
                        ? clientHeight * SCROLL_CONFIG.STREAMING_SCROLL_RATIO
                        : clientHeight * SCROLL_CONFIG.NORMAL_SCROLL_RATIO;
                    if (scrollDistance > threshold) {
                        userScrolledUpDuringStreamingRef.current = true;
                        shouldAutoScroll.current = false;
                    }
                }
            }

            lastScrollTop = currentScrollTop;
            clearTimeout(scrollTimeout);

            // Reset scroll start position after DEBOUNCE_DELAY of no scroll events
            scrollTimeout = setTimeout(() => {
                scrollStartTop = container.scrollTop;
            }, SCROLL_CONFIG.DEBOUNCE_DELAY);
        };

        container.addEventListener('scroll', handleUserScroll, { passive: true });

        // Use requestAnimationFrame to perform scroll operations without blocking rendering
        const performScroll = () => {
            if (!container) return;

            lastProgrammaticScrollTime = Date.now();
            container.scrollTop = container.scrollHeight;
            rafId = null;
        };

        const scheduleScroll = () => {
            // Cancel any pending scroll to avoid stacking multiple RAF calls
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(performScroll);
        };

        let observer: ResizeObserver;
        try {
            observer = new ResizeObserver(() => {
                try {
                    if (!container) return;

                    // Force scroll if user just sent a message (overrides all checks)
                    if (forceScrollToBottomRef.current) {
                        scheduleScroll();
                        forceScrollToBottomRef.current = false;
                        return;
                    }

                    // Determine if we should auto-scroll based on context
                    let shouldScroll = false;

                    if (isStreaming) {
                        // During AI streaming: only stop if user intentionally scrolled up significantly
                        // Small accidental scrolls won't stop auto-scroll
                        shouldScroll =
                            !userScrolledUpDuringStreamingRef.current || isInitialLoad.current;
                    } else {
                        // When not streaming: only scroll if user is very close to bottom
                        shouldScroll = isAtBottom() || isInitialLoad.current;
                    }

                    if (shouldScroll) {
                        // Use RAF to ensure scroll doesn't block rendering
                        scheduleScroll();
                    }
                } catch (error) {
                    logger.error('[useChatScroll] ResizeObserver callback error:', error);
                }
            });

            observer.observe(messagesListRef.current);
        } catch (error) {
            logger.error('[useChatScroll] Failed to create ResizeObserver:', error);
            // If ResizeObserver creation fails, return early cleanup function
            return () => {
                container.removeEventListener('scroll', handleUserScroll);
                clearTimeout(scrollTimeout);
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                }
            };
        }

        return () => {
            try {
                observer?.disconnect();
            } catch (error) {
                logger.error('[useChatScroll] Error disconnecting ResizeObserver:', error);
            }
            container.removeEventListener('scroll', handleUserScroll);
            clearTimeout(scrollTimeout);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
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
