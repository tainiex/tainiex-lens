import { useState, useRef, useCallback } from 'react';
import { IChatMessage } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';

interface UseMessageHistoryProps {
  currentSessionId: string | null;
  setMessages: (messages: Partial<IChatMessage>[] | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])) => void;
  setIsLoading: (loading: boolean) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useMessageHistory({
  currentSessionId,
  setMessages,
  setIsLoading,
  scrollContainerRef
}: UseMessageHistoryProps) {
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  // Refs for immediate synchronous guarding against redundant/recursive calls
  const isLoadingRef = useRef(false);
  const isFetchingMoreRef = useRef(false);
  const scrollHeightBeforeRef = useRef<number>(0);

  const fetchHistory = useCallback(async (before?: string) => {
    if (!currentSessionId || isLoadingRef.current || isFetchingMoreRef.current) return;

    const isInitial = !before;
    if (isInitial) {
      setIsLoading(true);
      isLoadingRef.current = true;
      // Clear messages immediately to trigger the "Loading" state (centered spinner)
      setMessages([]);
    } else {
      setIsFetchingMore(true);
      isFetchingMoreRef.current = true;
      // Capture scroll height before update
      scrollHeightBeforeRef.current = scrollContainerRef.current?.scrollHeight || 0;
    }

    try {
      const startTime = Date.now();
      const path = before
        ? `/api/chat/sessions/${currentSessionId}/messages?before=${before}`
        : `/api/chat/sessions/${currentSessionId}/messages`;

      const res = await apiClient.get(path);
      if (res.ok) {
        const data = await res.json();

        // If initial load, ensure we show the premium loader for at least 800ms
        if (isInitial) {
          const elapsed = Date.now() - startTime;
          if (elapsed < 800) {
            await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
          }
        }

        // If it's the initial load for a session, replace messages.
        // If it's loading more (prepend), merge with existing.
        if (isInitial) {
          setMessages(prev => {
            if (data.messages && data.messages.length > 0) {
              return data.messages;
            }
            // If backend empty, keep what we have (optimistic)
            return prev.length > 1 ? prev : (data.messages || []);
          });

          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        } else {
          setMessages(prev => {
            const nextMsgs = data.messages || [];
            const seenIds = new Set(prev.map((m: Partial<IChatMessage>) => m.id).filter(Boolean));
            const uniqueNext = nextMsgs.filter((m: Partial<IChatMessage>) => !m.id || !seenIds.has(m.id));
            return [...uniqueNext, ...prev];
          });
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        }
      }
    } catch (err) {
      console.error('Failed to fetch message history:', err);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [currentSessionId, setIsLoading, setMessages, scrollContainerRef]);

  const resetHistory = useCallback(() => {
    setHasMore(false);
    setNextCursor(undefined);
    isLoadingRef.current = false;
    isFetchingMoreRef.current = false;
    scrollHeightBeforeRef.current = 0;
  }, []);

  return {
    fetchHistory,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    resetHistory
  };
}
