import { z } from 'zod';

// ===== Shared Enums & Types =====
export const ChatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

// ===== Chat Messages =====
export const ChatMessageSchema = z.object({
    id: z.string(),
    role: ChatRoleSchema,
    content: z.string(),
    parentId: z.string().optional(),
    sessionId: z.string().optional(),
    timestamp: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatMessagesResponseSchema = z.object({
    messages: z.array(ChatMessageSchema),
    hasMore: z.boolean().default(false),
    nextCursor: z.string().optional(),
});
export type ChatMessagesResponse = z.infer<typeof ChatMessagesResponseSchema>;

// ===== Chat Sessions =====
export const ChatSessionSchema = z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const ChatSessionsResponseSchema = z.object({
    sessions: z.array(ChatSessionSchema),
    total: z.number().optional(),
});
export type ChatSessionsResponse = z.infer<typeof ChatSessionsResponseSchema>;

// ===== User Profile =====
export const UserProfileSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatar: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

// ===== Auth =====
export const AuthResponseSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    accessToken: z.string().optional(),
    requiresInvite: z.boolean().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ===== Models =====
export const ModelSchema = z.object({
    name: z.string(),
});
export type Model = z.infer<typeof ModelSchema>;

export const ModelsResponseSchema = z.union([
    z.array(ModelSchema),
    z.object({ models: z.array(ModelSchema) }),
]);
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

// ===== Error Response =====
export const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string().optional(),
    status: z.number().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ===== Session Create Request/Response =====
export const SessionCreateRequestSchema = z.object({
    title: z.string(),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;

// ===== Rename Session Request =====
export const SessionRenameRequestSchema = z.object({
    title: z.string(),
});
export type SessionRenameRequest = z.infer<typeof SessionRenameRequestSchema>;

// ===== Send Message Payload =====
export const SendMessagePayloadSchema = z.object({
    sessionId: z.string(),
    message: z.string(),
    model: z.string(),
});
export type SendMessagePayload = z.infer<typeof SendMessagePayloadSchema>;
