/**
 * 协同编辑类型定义
 * Collaboration Types Definition
 * 
 * 基于后端 @tainiex/shared 接口和 Y.js 协议
 */

import { Socket as SocketIOSocket } from 'socket.io-client';

// ===== Block Types (来自 BlockType 枚举) =====
export enum BlockType {
  TEXT = 'TEXT',
  HEADING1 = 'HEADING1',
  HEADING2 = 'HEADING2',
  HEADING3 = 'HEADING3',
  BULLET_LIST = 'BULLET_LIST',
  NUMBERED_LIST = 'NUMBERED_LIST',
  TODO = 'TODO',
  QUOTE = 'QUOTE',
  CODE = 'CODE',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  TABLE = 'TABLE',
  DIVIDER = 'DIVIDER',
  CALLOUT = 'CALLOUT',
  TOGGLE = 'TOGGLE',
}

// ===== Block Interface =====
export interface IBlock {
  id: string;
  noteId: string;
  type: BlockType;
  content: string; // JSON 或 HTML 内容
  order: number;
  parentBlockId?: string | null;
  children?: IBlock[]; // 树状结构时由后端构建
  createdAt: string;
  updatedAt: string;
}

// ===== Note Interface =====
export interface INote {
  id: string;
  title: string;
  ownerId: string;
  workspaceId?: string | null;
  icon?: string | null;
  coverImage?: string | null;
  isPublic: boolean;
  blocks?: IBlock[]; // 获取笔记详情时包含
  createdAt: string;
  updatedAt: string;
}

// ===== Collaborator (Presence) Interface =====
export interface ICollaborator {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string; // 协作者高亮颜色
  cursor?: {
    position: number;
    selectionStart?: number;
    selectionEnd?: number;
  };
}

// ===== Y.js Payloads =====
export interface YjsUpdatePayload {
  noteId: string;
  update: string; // Base64 encoded Uint8Array
  clientId?: string;
}

export interface YjsSyncPayload {
  noteId: string;
  state: string; // Base64 encoded initial state
}

// ===== Cursor Update Payload =====
export interface CursorUpdatePayload {
  noteId: string;
  userId: string;
  userName: string;
  color: string;
  cursor: {
    position: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null; // null 表示光标不可见/失焦
}

// ===== Presence Payloads =====
export interface PresenceUser {
  userId: string;
  userName: string;
  avatar?: string;
  color: string;
  joinedAt: string;
}

export interface PresenceJoinPayload {
  noteId: string;
  user: PresenceUser;
}

export interface PresenceLeavePayload {
  noteId: string;
  userId: string;
}

export interface PresenceListPayload {
  noteId: string;
  users: PresenceUser[];
}

// ===== Collaboration Error Payloads =====
export interface CollaborationLimitPayload {
  noteId: string;
  maxUsers: number;
  message: string;
}

export interface CollaborationErrorPayload {
  error: string;
  code?: string;
  noteId?: string;
}

// ===== Socket.IO Event Types for Collaboration =====

// Client to Server Events
export interface CollaborationClientToServerEvents {
  // 加入笔记协同房间
  'note:join': (data: { noteId: string }) => void;
  // 离开笔记协同房间
  'note:leave': (data: { noteId: string }) => void;
  // 发送 Y.js 增量更新
  'yjs:update': (payload: YjsUpdatePayload) => void;
  // 更新光标位置
  'cursor:update': (payload: CursorUpdatePayload) => void;
}

// Server to Client Events
export interface CollaborationServerToClientEvents {
  // 接收初始 Y.js 状态
  'yjs:sync': (payload: YjsSyncPayload) => void;
  // 接收他人的 Y.js 更新
  'yjs:update': (payload: YjsUpdatePayload) => void;
  // 用户加入协同
  'presence:join': (payload: PresenceJoinPayload) => void;
  // 用户离开协同
  'presence:leave': (payload: PresenceLeavePayload) => void;
  // 当前在线用户列表
  'presence:list': (payload: PresenceListPayload) => void;
  // 他人光标更新
  'cursor:update': (payload: CursorUpdatePayload) => void;
  // 协同人数已满
  'collaboration:limit': (payload: CollaborationLimitPayload) => void;
  // 协同错误
  'collaboration:error': (payload: CollaborationErrorPayload) => void;
}

// Combined Socket Type
export type CollaborationSocket = SocketIOSocket<
  CollaborationServerToClientEvents,
  CollaborationClientToServerEvents
>;

// ===== API Request/Response Types =====

// 创建笔记请求
export interface CreateNoteRequest {
  title: string;
  workspaceId?: string;
  icon?: string;
  isPublic?: boolean;
}

// 更新笔记请求
export interface UpdateNoteRequest {
  title?: string;
  icon?: string;
  coverImage?: string;
  isPublic?: boolean;
}

// 创建块请求
export interface CreateBlockRequest {
  type: BlockType;
  content: string;
  order?: number;
  parentBlockId?: string;
}

// 更新块请求
export interface UpdateBlockRequest {
  type?: BlockType;
  content?: string;
  order?: number;
  parentBlockId?: string;
}

// 版本信息
export interface IBlockVersion {
  id: string;
  blockId: string;
  content: string;
  type: BlockType;
  createdAt: string;
  userId: string;
  userName?: string;
}

// 笔记快照
export interface INoteSnapshot {
  id: string;
  noteId: string;
  title: string;
  blocks: IBlock[];
  createdAt: string;
  userId: string;
  userName?: string;
}

// 搜索结果
export interface ISearchResult {
  type: 'note' | 'block';
  noteId: string;
  noteTitle: string;
  blockId?: string;
  blockType?: BlockType;
  content: string;
  highlight: string; // 高亮匹配的片段
  score: number;
}

// 上传响应
export interface IUploadResponse {
  url: string; // GCS 签名 URL
  filename: string;
  contentType: string;
  size: number;
}

// ===== Connection State =====
export interface CollaborationConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  noteId: string | null;
  error?: string;
}