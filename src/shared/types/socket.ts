import { z } from 'zod';
import { ChatSendPayload, ChatStreamEvent, ChatErrorPayload } from '@tainiex/shared-atlas';

// Re-export shared types for convenience
export type { ChatSendPayload, ChatStreamEvent, ChatErrorPayload };

// ===== Socket.IO Event Types =====

// Chat Send Payload Schema
// We use Zod to validate data at runtime, ensuring it matches the shared interface
export const ChatSendPayloadSchema: z.ZodType<ChatSendPayload> = z.object({
    sessionId: z.string(),
    content: z.string(),
    model: z.string().optional(),
    parentId: z.string().optional(),
    role: z.any().optional(), // Role is optional enum, allow any compatible value for validation
    // Shared interface: { sessionId, content, role?, model? }
    // My previous code added timestamp. Shared doesn't have it. I should make it optional or remove if strict.
    // Actually, shared lib is the source of truth. If shared doesn't have timestamp, backend might ignore it.
    // I will match shared interface strictly for required fields.
});

// Chat Stream Event Schema
export const ChatStreamEventSchema: z.ZodType<ChatStreamEvent> = z.object({
    type: z.enum(['chunk', 'done', 'error']),
    data: z.string().optional(),
    error: z.string().optional(),
    title: z.string().optional(), // [NEW] Backend added field
});

// Chat Error Event Schema
// Shared lib has `ChatErrorPayload` { error: string }
// But my code previously handled `message`, `msg`, `description`.
// I should align with ChatErrorPayload but keep fallback for robustness if backend sends other formats during legacy transition.
export const ChatErrorEventSchema = z
    .object({
        error: z.string(),
        // loose validation to allow extra fields just in case, but enforce primary 'error' field if possible
        message: z.string().optional(),
        msg: z.string().optional(),
        description: z.string().optional(),
    })
    .catchall(z.any());
export type ChatErrorEvent = z.infer<typeof ChatErrorEventSchema>;

// Socket.IO Connection Events (Not in shared lib yet? Keep local)
export const ConnectionAckSchema = z.object({
    connected: z.boolean(),
    sessionId: z.string().optional(),
});
export type ConnectionAck = z.infer<typeof ConnectionAckSchema>;

// Client to Server Events
export interface ClientToServerEvents {
    'chat:send': (payload: ChatSendPayload, ack?: (response: any) => void) => void;
    'chat:history': (data: { sessionId: string; limit?: number; cursor?: string }) => void;
    'chat:sessions': () => void;
}

// Server to Client Events
export interface ServerToClientEvents {
    'chat:stream': (event: ChatStreamEvent) => void;
    'chat:history': (response: {
        messages: Array<{
            id: string;
            role: string;
            content: string;
            timestamp?: string;
        }>;
        hasMore: boolean;
        nextCursor?: string;
    }) => void;
    'chat:error': (error: ChatErrorPayload) => void;
    'chat:sessions': (
        sessions: Array<{
            id: string;
            title: string;
            createdAt?: string;
            updatedAt?: string;
        }>
    ) => void;
}

// Combined type for typing the Socket instance
// usage: Socket<ServerToClientEvents, ClientToServerEvents>
import { Socket as SocketIOSocket } from 'socket.io-client';
export type ChatSocket = SocketIOSocket<ServerToClientEvents, ClientToServerEvents>;
