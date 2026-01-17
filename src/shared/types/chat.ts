import {
    IChatSession,
    IChatMessage,
    ChatRole,
    CreateSessionDto,

    // AddMessageDto
} from '@tainiex/shared-atlas';

// Backend returns dates as ISO strings in JSON
export type ChatSession = Omit<IChatSession, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
    model?: string; // Optional, might be added later
};

export type ChatMessage = Omit<IChatMessage, 'createdAt'> & {
    createdAt: string;
};

export type CreateSessionRequest = CreateSessionDto & {
    title?: string;
    model?: string;
    initialMessage?: string;
};

export interface UpdateSessionRequest {
    title: string;
}

export interface AIModel {
    id: string;
    name: string;
    provider: string;
}

export { ChatRole };
