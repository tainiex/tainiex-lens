/**
 * Smart Scroll System Configuration
 * Centralized configuration constants for chat auto-scroll behavior
 * @version 2.0.0
 */

export const SCROLL_CONFIG = {
    /**
     * Time window (ms) to ignore scroll events after programmatic scroll
     * Prevents false detection of user scrolling immediately after auto-scroll
     */
    PROGRAMMATIC_SCROLL_WINDOW: 100,

    /**
     * Minimum scroll distance (px) from bottom to consider user has scrolled up
     * Below this threshold, user is considered "at bottom"
     */
    SCROLL_THRESHOLD: 50,

    /**
     * Scroll threshold ratio during streaming (relative to viewport height)
     * More aggressive threshold when AI is responding
     */
    STREAMING_SCROLL_RATIO: 0.25, // clientHeight / 4

    /**
     * Scroll threshold ratio during normal state (relative to viewport height)
     * More relaxed threshold when not streaming
     */
    NORMAL_SCROLL_RATIO: 0.33, // clientHeight / 3

    /**
     * Absolute distance (px) from bottom to consider user "at bottom"
     * Used as fallback when dynamic threshold is not applicable
     */
    BOTTOM_THRESHOLD: 100,

    /**
     * Debounce delay (ms) for scroll event handling
     * Prevents excessive scroll calculations
     */
    DEBOUNCE_DELAY: 150,

    /**
     * Animation duration (ms) for streaming text reveal effect
     */
    STREAMING_ANIMATION_DURATION: 1000,

    /**
     * Animation duration (ms) for line-height transitions
     */
    LINE_TRANSITION_DURATION: 300,
} as const;

export type ScrollConfig = typeof SCROLL_CONFIG;
