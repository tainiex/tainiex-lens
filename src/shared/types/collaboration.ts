/**
 * 协同编辑类型定义
 * Collaboration Types Definition
 *
 * 基于后端 @tainiex/shared 接口和 Y.js 协议
 */

/**
 * 协同编辑类型定义
 * Collaboration Types Definition
 *
 * 基于后端 @tainiex/shared 接口和 Y.js 协议
 */

import { Socket as SocketIOSocket } from 'socket.io-client';
import {
    BlockType,
    IBlock as SharedIBlock,
    INote as SharedINote,
    // IUser, // Unused
    NoteJoinPayload,
    NoteLeavePayload,
    YjsUpdatePayload,
    YjsSyncPayload,
    // CursorUpdatePayload, // Shared version exists but might differ in cursor structure
    PresenceLeavePayload,
    // PresenceUser as SharedPresenceUser, // Removed: Not exported from shared
    CollaborationLimitPayload,
    // CollaborationErrorPayload // Shared likely doesn't have this generic specific error
    ClientToServerEvents,
    ServerToClientEvents,
} from '@tainiex/shared-atlas';

export interface CursorPosition {
    blockId: string;
    offset: number;
}

export interface CollaborationEvent {
    type: string;
    payload: any;
}

// Re-export BlockType
export { BlockType };

// ===== Block Interface =====
// Extend SharedIBlock to include frontend-specific properties like 'children' for tree rendering
export interface IBlock extends SharedIBlock {
    children?: IBlock[];
    // Shared has 'position', Local had 'order'. We will use 'position'.
}

// ===== Note Interface =====
// Shared INote uses 'userId' instead of 'ownerId'.
// Shared INote doesn't have 'blocks' by default, but existing code expects it?
export interface INote extends SharedINote {
    blocks?: IBlock[];
    hasChildren?: boolean;
    parentId?: string;
    children?: INote[]; // Frontend cache for tree view

    // Map old 'ownerId' access to 'userId' via code changes
}

// ===== Collaborator (Presence) Interface =====
// Frontend specific representation of a connected user
export interface ICollaborator {
    id: string; // Mapped from userId
    name: string; // Mapped from username
    email?: string;
    avatar?: string;
    color: string;
    cursor?: {
        position: number;
        selectionStart?: number;
        selectionEnd?: number;
    };
}

// ===== Y.js Payloads =====
// Re-export shared payloads where exact match
export type {
    NoteJoinPayload,
    NoteLeavePayload,
    YjsUpdatePayload,
    PresenceLeavePayload,
    CollaborationLimitPayload,
};

// Custom/Augmented Payloads

// Shared CursorUpdatePayload might differ. Shared: { position?: { blockId, offset }, selection?: ... }
// Local: { cursor: { position, selectionStart... } }
// Keeping Local for now to avoid breaking Editor logic heavily, or adapt later.
// Actually, guide said "Delete NoteJoinPayload (and related DTOs)".
// But if Editor logic relies on specific cursor shape, blindly switching breaks it.
// Let's keep local definition for Cursor if it differs significantly, or check Shared first.
// Shared CursorUpdatePayload: position: { blockId, offset }, selection: { ... }
// Local code uses simple number index.
// DECISION: Keep local CursorUpdatePayload for now to minimize breakage in Tiptap binding.
export interface CursorUpdatePayload {
    noteId: string;
    userId: string;
    userName: string;
    color: string;
    cursor: {
        position: number;
        selectionStart?: number;
        selectionEnd?: number;
    } | null;
}

// ===== Presence Payloads =====
export interface PresenceUser {
    userId: string;
    userName: string;
    avatar?: string;
    color: string;
    joinedAt?: string; // Optional in shared?
}

// Adapter for PresenceJoin
export interface PresenceJoinPayload {
    noteId: string;
    user: PresenceUser;
}

export interface PresenceListPayload {
    noteId: string;
    users: PresenceUser[];
}

export interface CollaborationErrorPayload {
    error: string;
    code?: string;
    noteId?: string;
}

// ===== Socket.IO Event Types for Collaboration =====

// ===== Socket.IO Definitions =====

// Re-export BlockType
export type { YjsSyncPayload };

// ... (keep intermediate interfaces) ...

// ===== Socket.IO Definitions =====

// Combined Socket Type
export type CollaborationSocket = SocketIOSocket<ServerToClientEvents, ClientToServerEvents>;

// ===== API Request/Response Types =====
// Shared defines CreateNoteDto, etc. We should prefer those.
import {
    CreateNoteDto,
    UpdateNoteDto,
    CreateBlockDto,
    UpdateBlockDto,
} from '@tainiex/shared-atlas';

export type CreateNoteRequest = CreateNoteDto;
export type UpdateNoteRequest = UpdateNoteDto;

// Shared CreateBlockDto has 'type: BlockType', 'content: string', 'position'.
// Local had 'order'.
export type CreateBlockRequest = CreateBlockDto;
export type UpdateBlockRequest = UpdateBlockDto;

// Version/Snapshot/Search - Keep local if not in shared
export interface IBlockVersion {
    id: string;
    blockId: string;
    content: string;
    type: BlockType;
    createdAt: string;
    userId: string;
    userName?: string;
}

export interface INoteSnapshot {
    id: string;
    noteId: string;
    title: string;
    blocks: IBlock[];
    createdAt: string;
    userId: string;
    userName?: string;
}

export interface ISearchResult {
    type: 'note' | 'block';
    noteId: string;
    noteTitle: string;
    blockId?: string;
    blockType?: BlockType;
    content: string;
    highlight: string;
    score: number;
}

export interface IUploadResponse {
    url: string;
    filename: string;
    contentType: string;
    size: number;
}

export interface CollaborationConnectionState {
    status:
        | 'initializing'
        | 'disconnected'
        | 'connecting'
        | 'connected'
        | 'reconnecting'
        | 'offline'
        | 'failed';
    noteId: string | null;
    error?: string;
}
