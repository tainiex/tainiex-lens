import { useState, useRef, useCallback } from 'react';
import { IChatMessage, GetMessagesResponse } from '@tainiex/shared-atlas';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

// Helper to reconstruct message chain from parentId
// Helper to reconstruct message chain from parentId and linearize branches
// (Only shows the path to the latest leaf in each connected component)
function topoSortMessages(messages: Partial<IChatMessage>[]): Partial<IChatMessage>[] {
    if (messages.length <= 1) return messages;

    // 1. Index by ID and ParentID (Defensive Deduplication)
    // We use a Map to ensure only unique IDs are processed, preventing graph loops/duplicates
    const byId = new Map<string, Partial<IChatMessage>>();
    const allIds = new Set<string>();

    messages.forEach(msg => {
        if (msg.id) {
            byId.set(msg.id, msg);
            allIds.add(msg.id);
        }
    });

    const uniqueMessages = Array.from(byId.values());
    const childrenMap = new Map<string, Partial<IChatMessage>[]>(); // parentId -> [children]
    const parentMap = new Map<string, string>(); // childId -> parentId

    // 2. Build Graph & Find Roots using UNIQUE messages
    const roots: Partial<IChatMessage>[] = [];

    uniqueMessages.forEach(msg => {
        const pId = msg.parentId;
        if (pId && allIds.has(pId)) {
            if (!childrenMap.has(pId)) {
                childrenMap.set(pId, []);
            }
            childrenMap.get(pId)!.push(msg);
            if (msg.id) parentMap.set(msg.id, pId);
        } else {
            roots.push(msg);
        }
    });

    // 3. Process ALL connected components (Resilient Linearization)
    // Instead of picking only the global latest, we process EACH root to preserve all history segments.
    const allChains: Partial<IChatMessage>[][] = [];

    roots.forEach(root => {
        if (!root.id) return;

        // BFS/DFS to find all nodes in this component and identify leaves
        const componentNodes: Partial<IChatMessage>[] = [];
        const leaves: Partial<IChatMessage>[] = [];
        const queue = [root];

        while (queue.length > 0) {
            const node = queue.shift()!;
            componentNodes.push(node);

            const children = childrenMap.get(node.id!) || [];
            if (children.length === 0) {
                leaves.push(node);
            } else {
                queue.push(...children);
            }
        }

        // Find the latest leaf in this SPECIFIC component
        leaves.sort((a, b) => {
            const tA = (a as any).createdAt || (a as any).timestamp || 0;
            const tB = (b as any).createdAt || (b as any).timestamp || 0;
            return new Date(tB).getTime() - new Date(tA).getTime(); // Descending
        });

        const latestLeaf = leaves[0];
        if (!latestLeaf) return;

        // Backtrack from latest leaf to root to reconstruct the main path for this component
        const path: Partial<IChatMessage>[] = [];
        let curr: Partial<IChatMessage> | undefined = latestLeaf;

        while (curr) {
            path.unshift(curr);
            if (curr.id === root.id) break;
            const pId: string | undefined = curr.id ? parentMap.get(curr.id) : undefined;
            curr = pId ? byId.get(pId) : undefined;
        }

        allChains.push(path);
    });

    // 4. Sort the chains chronologically based on their latest message
    // This ensures that even if history has gaps, the segments appear in order.
    allChains.sort((chainA, chainB) => {
        const lastA = chainA[chainA.length - 1];
        const lastB = chainB[chainB.length - 1];
        const tA = (lastA as any).createdAt || (lastA as any).timestamp || 0;
        const tB = (lastB as any).createdAt || (lastB as any).timestamp || 0;
        return new Date(tA).getTime() - new Date(tB).getTime();
    });

    // 5. Flatten
    const result = allChains.flat();

    // Safety fallback: if we produced NOTHING but had messages, something went wrong.
    if (result.length === 0 && uniqueMessages.length > 0) {
        return uniqueMessages; // Fallback to raw
    }

    return result;
}

interface UseMessageHistoryProps {
    currentSessionId: string | null;
    setMessages: (
        messages:
            | Partial<IChatMessage>[]
            | ((prev: Partial<IChatMessage>[]) => Partial<IChatMessage>[])
    ) => void;
    setIsLoading: (loading: boolean) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useMessageHistory({
    currentSessionId,
    setMessages,
    setIsLoading,
    scrollContainerRef,
}: UseMessageHistoryProps) {
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

    // Refs for immediate synchronous guarding against redundant/recursive calls
    const isLoadingRef = useRef(false);
    const isFetchingMoreRef = useRef(false);
    const scrollHeightBeforeRef = useRef<number>(0);

    const fetchHistory = useCallback(
        async (before?: string) => {
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
                // Use new API params
                const params: any = { limit: 20 };
                if (before) {
                    params.before = before;
                }

                const queryString = before
                    ? `limit=${params.limit}&before=${encodeURIComponent(before)}`
                    : `limit=${params.limit}`;
                const res = await apiClient.get(
                    `/api/chat/sessions/${currentSessionId}/messages?${queryString}`
                );
                if (res.ok) {
                    const data = (await res.json()) as GetMessagesResponse;

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
                            return prev.length > 1 ? prev : data.messages || [];
                        });

                        setHasMore(data.hasMore);
                        setNextCursor(data.nextCursor ?? undefined);
                    } else {
                        setMessages(prev => {
                            const nextMsgs = data.messages || [];
                            const seenIds = new Set(
                                prev.map((m: Partial<IChatMessage>) => m.id).filter(Boolean)
                            );
                            const uniqueNext = nextMsgs.filter(
                                (m: Partial<IChatMessage>) => !m.id || !seenIds.has(m.id)
                            );
                            const merged = [...uniqueNext, ...prev];
                            return topoSortMessages(merged);
                        });
                        setHasMore(data.hasMore);
                        setNextCursor(data.nextCursor ?? undefined);
                    }
                }
            } catch (err) {
                logger.error('Failed to fetch message history:', err);
            } finally {
                if (isInitial) {
                    // Critical: Add a small delay to ensure React has fully rendered the heavy message list
                    // (Markdown, SyntaxHighlighter) behind the skeleton before we lift the curtain.
                    // This prevents the "White Screen" flash where the skeleton is gone but content isn't painted yet.
                    setIsLoading(false);
                    isLoadingRef.current = false;
                } else {
                    setIsLoading(false);
                    isLoadingRef.current = false;
                }

                setIsFetchingMore(false);
                isFetchingMoreRef.current = false;
            }
        },
        [currentSessionId, setIsLoading, setMessages, scrollContainerRef]
    );

    const syncMessages = useCallback(async () => {
        if (!currentSessionId || isLoadingRef.current) return;

        try {
            const res = await apiClient.get(
                `/api/chat/sessions/${currentSessionId}/messages?limit=50`
            );
            if (res.ok) {
                const data = (await res.json()) as GetMessagesResponse;
                if (data.messages) {
                    setMessages(prev => {
                        const nextMsgs = data.messages;

                        // If we only fetched a subset, we must merge, NOT replace.
                        const seenIds = new Set(nextMsgs.map((m: Partial<IChatMessage>) => m.id));
                        // Keep previous messages that are NOT in the new batch (older messages or temp messages)
                        const keptPrev = prev.filter(m => m.id && !seenIds.has(m.id));

                        // Re-sort everything
                        return topoSortMessages([...keptPrev, ...nextMsgs]);
                    });
                    setHasMore(data.hasMore);
                    setNextCursor(data.nextCursor ?? undefined);
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
        resetHistory,
    };
}
