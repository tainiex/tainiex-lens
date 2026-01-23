import { useState, useCallback, useEffect } from 'react';
import { IChatSession } from '@tainiex/shared-atlas';
import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

export function useSessions() {
    const [sessions, setSessions] = useState<IChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true); // Start with true to show skeleton on initial load
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Track if we've ever loaded data

    const loadSessions = useCallback(async () => {
        setIsLoading(true);
        try {
            logger.debug('[useSessions] Loading sessions via .get() (Fixed Version)');
            // Use .get() instead of .getTyped() to avoid schema validation issues (missing Zod schema)
            const response = await apiClient.get('/api/chat/sessions');
            if (response.ok) {
                const data = await response.json();
                // Sort by createdAt desc (or updatedAt)
                const sorted = Array.isArray(data)
                    ? [...data].sort(
                          (a: any, b: any) =>
                              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                      )
                    : [];
                setSessions(sorted);
            }
        } catch (error) {
            logger.error('Failed to load sessions:', error);
        } finally {
            setIsLoading(false);
            setHasLoadedOnce(true); // Mark that we've completed at least one load attempt
        }
    }, []);

    useEffect(() => {
        // Load on mount
        loadSessions();
    }, [loadSessions]);

    const deleteSession = useCallback(async (sessionId: string) => {
        try {
            await apiClient.delete(`/api/chat/sessions/${sessionId}`);
            setSessions(prev => prev.filter(s => s.id !== sessionId));
        } catch (error) {
            logger.error('Failed to delete session:', error);
        }
    }, []);

    return {
        sessions,
        isLoading,
        hasLoadedOnce,
        loadSessions,
        deleteSession,
        isSidebarOpen,
        setIsSidebarOpen,
    };
}
