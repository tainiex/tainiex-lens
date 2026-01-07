import { useState, useRef, useCallback } from 'react';
import { IChatMessage } from '@tainiex/tainiex-shared';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

// Helper to reconstruct message chain from parentId
function topoSortMessages(messages: Partial<IChatMessage>[]): Partial<IChatMessage>[] {
  if (messages.length <= 1) return messages;

  // 1. Index by ID and ParentID
  const byId = new Map<string, Partial<IChatMessage>>();
  const childrenMap = new Map<string, Partial<IChatMessage>[]>(); // parentId -> [children]

  // Also keep track of all IDs to identify roots
  const allIds = new Set<string>();

  messages.forEach(msg => {
    if (msg.id) {
      byId.set(msg.id, msg);
      allIds.add(msg.id);
    }
  });

  // 2. Build the tree/graph structure
  // We assume a message without a parent (or parent not in list) is a root of this segment.
  const roots: Partial<IChatMessage>[] = [];

  messages.forEach(msg => {
    // We treat 'parentId' as the linking key.
    // Use standard field from shared lib
    const pId = msg.parentId;

    if (pId && allIds.has(pId)) {
      if (!childrenMap.has(pId)) {
        childrenMap.set(pId, []);
      }
      childrenMap.get(pId)!.push(msg);
    } else {
      // If parent is missing in this list, it's a root of this chunk
      roots.push(msg);
    }
  });

  // 3. Sort roots by creating time (fallback) if multiple roots exist
  roots.sort((a, b) => {
    const tA = (a as any).createdAt || (a as any).timestamp || 0;
    const tB = (b as any).createdAt || (b as any).timestamp || 0;
    return new Date(tA).getTime() - new Date(tB).getTime();
  });

  // 4. Traverse (DFS or BFS - linear chain usually implies 1 child, but just in case)
  const result: Partial<IChatMessage>[] = [];

  const traverse = (msg: Partial<IChatMessage>) => {
    result.push(msg);
    if (!msg.id) return;

    const children = childrenMap.get(msg.id);
    if (children) {
      // If branching exists, sort children by time? Usually 1 child.
      children.sort((a, b) => {
        const tA = (a as any).createdAt || (a as any).timestamp || 0;
        const tB = (b as any).createdAt || (b as any).timestamp || 0;
        return new Date(tA).getTime() - new Date(tB).getTime();
      });
      children.forEach(traverse);
    }
  };

  roots.forEach(traverse);

  // Safety check: did we miss any disconnected cycles?
  if (result.length < messages.length) {
    // Append remaining messages sorted by time as fallback
    const processedIds = new Set(result.map(m => m.id));
    const remaining = messages.filter(m => !processedIds.has(m.id));
    remaining.sort((a, b) => {
      const tA = (a as any).createdAt || (a as any).timestamp || 0;
      const tB = (b as any).createdAt || (b as any).timestamp || 0;
      return new Date(tA).getTime() - new Date(tB).getTime();
    });
    return [...result, ...remaining];
  }

  return result;
}

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
              return topoSortMessages(data.messages);
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
            const merged = [...uniqueNext, ...prev];
            return topoSortMessages(merged);
          });
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch message history:', err);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [currentSessionId, setIsLoading, setMessages, scrollContainerRef]);

  const syncMessages = useCallback(async () => {
    if (!currentSessionId || isLoadingRef.current) return;

    try {
      const res = await apiClient.get(`/api/chat/sessions/${currentSessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          setMessages(prev => {
            const nextMsgs = data.messages;
            // When syncing from server, we should generally trust the server's history.
            // If the last message in our 'prev' is a "temporary" or "streaming" message
            // and it's NOT in the server's history yet, it means it likely failed 
            // to persist during the disconnect.

            // To be safe, if we are doing a full sync, we replace everything EXCEPT 
            // perhaps very recent messages that might still be in flight (though here we trust server info).
            if (JSON.stringify(prev.filter(m => !m.id?.startsWith('temp_'))) === JSON.stringify(nextMsgs)) {
              return prev;
            }
            return topoSortMessages(nextMsgs);
          });
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        }


      }
    } catch (err) {
      logger.error('Failed to sync messages:', err);
    }
  }, [currentSessionId, setMessages]);

  const resetHistory = useCallback(() => {

    setHasMore(false);
    setNextCursor(undefined);
    isLoadingRef.current = false;
    isFetchingMoreRef.current = false;
    scrollHeightBeforeRef.current = 0;
  }, []);

  return {
    fetchHistory,
    syncMessages,
    isFetchingMore,
    hasMore,
    nextCursor,
    scrollHeightBeforeRef,
    resetHistory
  };
}
