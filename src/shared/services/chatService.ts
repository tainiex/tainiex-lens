import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import type {
    ChatSession,
    ChatMessage,
    CreateSessionRequest,
    UpdateSessionRequest,
    AIModel,
} from '../types/chat';

/**
 * Get user chat sessions
 */
export async function getSessions(): Promise<ChatSession[]> {
    try {
        logger.debug('[ChatService] Calling GET /api/chat/sessions...');
        const res = await apiClient.get('/api/chat/sessions');
        logger.debug('[ChatService] Response received:', res.status, res.ok);
        if (!res.ok) {
            logger.error('[ChatService] Request failed with status:', res.status);
            throw new Error(`Failed to fetch sessions: ${res.status}`);
        }
        const data = await res.json();
        logger.debug('[ChatService] Sessions data:', data);
        return data;
    } catch (error) {
        logger.error('[ChatService] Failed to get sessions:', error);
        throw error;
    }
}

/**
 * Create a new chat session
 */
export async function createSession(data: CreateSessionRequest): Promise<ChatSession> {
    try {
        const res = await apiClient.post('/api/chat/sessions', data);
        if (!res.ok) {
            throw new Error(`Failed to create session: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[ChatService] Failed to create session:', error);
        throw error;
    }
}

/**
 * Get single session details
 */
export async function getSession(sessionId: string): Promise<ChatSession> {
    try {
        const res = await apiClient.get(`/api/chat/sessions/${sessionId}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch session: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[ChatService] Failed to get session:', sessionId, error);
        throw error;
    }
}

/**
 * Delete a session (Soft Delete)
 */
export async function deleteSession(sessionId: string): Promise<void> {
    try {
        const res = await apiClient.delete(`/api/chat/sessions/${sessionId}`);
        if (!res.ok) {
            throw new Error(`Failed to delete session: ${res.status}`);
        }
    } catch (error) {
        logger.error('[ChatService] Failed to delete session:', sessionId, error);
        throw error;
    }
}

/**
 * Update session title
 */
export async function updateSessionTitle(sessionId: string, title: string): Promise<ChatSession> {
    try {
        const res = await apiClient.request(`/api/chat/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        });
        if (!res.ok) {
            throw new Error(`Failed to update session title: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[ChatService] Failed to update session title:', sessionId, error);
        throw error;
    }
}

/**
 * Get messages for a session
 */
export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
        const res = await apiClient.get(`/api/chat/sessions/${sessionId}/messages`);
        if (!res.ok) {
            throw new Error(`Failed to fetch messages: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[ChatService] Failed to get messages:', sessionId, error);
        throw error;
    }
}

/**
 * List supported AI models
 */
export async function getModels(): Promise<AIModel[]> {
    try {
        const res = await apiClient.get('/api/chat/models');
        if (!res.ok) {
            throw new Error(`Failed to fetch models: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[ChatService] Failed to get models:', error);
        throw error;
    }
}

const chatService = {
    getSessions,
    createSession,
    getSession,
    deleteSession,
    updateSessionTitle,
    getMessages,
    getModels,
};

export default chatService;
