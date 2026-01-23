/**
 * Type definitions for the Smart Scroll System
 * @version 2.0.0
 */

import { IChatMessage } from '@tainiex/shared-atlas';

/**
 * Props for the useChatScroll hook
 */
export interface UseChatScrollProps {
    /** Array of chat messages */
    messages: Partial<IChatMessage>[];
    /** Whether messages are currently being loaded */
    isLoading: boolean;
    /** Whether AI is currently streaming a response */
    isStreaming: boolean;
    /** Whether more history is being fetched (pagination) */
    isFetchingMore: boolean;
    /** Whether there are more messages to load */
    hasMore: boolean;
    /** Cursor for pagination */
    nextCursor: string | undefined;
    /** Ref to store scroll height before fetching more messages */
    scrollHeightBeforeRef: React.MutableRefObject<number>;
    /** Function to fetch message history */
    fetchHistory: (before?: string) => void;
}

/**
 * Return type for the useChatScroll hook
 */
export interface UseChatScrollReturn {
    /** Ref for the scroll container element */
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the messages list element */
    messagesListRef: React.RefObject<HTMLDivElement | null>;
    /** Function to programmatically scroll to bottom */
    scrollToBottom: (behavior?: ScrollBehavior) => void;
    /** Handler for scroll events */
    handleScroll: () => void;
    /** Reset all scroll state flags */
    resetScrollState: () => void;
    /** Enable auto-scroll and scroll to bottom */
    enableAutoScroll: () => void;
}
