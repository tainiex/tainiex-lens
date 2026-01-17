/**
 * 笔记服务
 * Notes Service
 *
 * 封装所有笔记和块相关的 API 调用
 */

import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import type {
    INote,
    IBlock,
    CreateNoteRequest,
    UpdateNoteRequest,
    CreateBlockRequest,
    UpdateBlockRequest,
    IBlockVersion,
    INoteSnapshot,
    ISearchResult,
} from '../types/collaboration';

// ===== 笔记 API =====

/**
 * 获取所有笔记列表
 * @param parentId 可选，获取指定父节点的子笔记
 */
export async function getNotes(parentId?: string): Promise<INote[]> {
    try {
        const url = parentId ? `/api/notes?parentId=${parentId}` : '/api/notes';
        const res = await apiClient.get(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch notes: ${res.status}`);
        }
        const data = await res.json();
        // 适配分页结构 { notes: [], total: 0 } 或直接返回数组
        if (data && Array.isArray(data.notes)) {
            return data.notes;
        }
        if (Array.isArray(data)) {
            return data;
        }
        logger.warn('[NotesService] Unexpected notes data format:', data);
        return [];
    } catch (error) {
        logger.error('[NotesService] Failed to get notes:', error);
        throw error;
    }
}

/**
 * 获取单个笔记详情（包含 blocks 树）
 */
export async function getNote(noteId: string): Promise<INote> {
    try {
        const res = await apiClient.get(`/api/notes/${noteId}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch note: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to get note:', noteId, error);
        throw error;
    }
}

/**
 * 创建新笔记
 */
export async function createNote(data: CreateNoteRequest): Promise<INote> {
    try {
        const res = await apiClient.post('/api/notes', data);
        if (!res.ok) {
            throw new Error(`Failed to create note: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to create note:', error);
        throw error;
    }
}

/**
 * 更新笔记
 */
export async function updateNote(noteId: string, data: UpdateNoteRequest): Promise<INote> {
    try {
        const res = await apiClient.request(`/api/notes/${noteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            throw new Error(`Failed to update note: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to update note:', noteId, error);
        throw error;
    }
}

/**
 * 删除笔记
 */
export async function deleteNote(noteId: string): Promise<void> {
    try {
        const res = await apiClient.delete(`/api/notes/${noteId}`);
        if (!res.ok) {
            throw new Error(`Failed to delete note: ${res.status}`);
        }
    } catch (error) {
        logger.error('[NotesService] Failed to delete note:', noteId, error);
        throw error;
    }
}

// ===== 块 API =====

/**
 * 创建块
 */
export async function createBlock(noteId: string, data: CreateBlockRequest): Promise<IBlock> {
    try {
        const res = await apiClient.post(`/api/notes/${noteId}/blocks`, data);
        if (!res.ok) {
            throw new Error(`Failed to create block: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to create block:', error);
        throw error;
    }
}

/**
 * 更新块
 */
export async function updateBlock(blockId: string, data: UpdateBlockRequest): Promise<IBlock> {
    try {
        const res = await apiClient.request(`/api/blocks/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            throw new Error(`Failed to update block: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to update block:', blockId, error);
        throw error;
    }
}

/**
 * 删除块
 */
export async function deleteBlock(blockId: string): Promise<void> {
    try {
        const res = await apiClient.delete(`/api/blocks/${blockId}`);
        if (!res.ok) {
            throw new Error(`Failed to delete block: ${res.status}`);
        }
    } catch (error) {
        logger.error('[NotesService] Failed to delete block:', blockId, error);
        throw error;
    }
}

// ===== 版本历史 API =====

/**
 * 获取块的版本历史
 */
export async function getBlockVersions(blockId: string): Promise<IBlockVersion[]> {
    try {
        const res = await apiClient.get(`/api/versions/blocks/${blockId}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch block versions: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to get block versions:', blockId, error);
        throw error;
    }
}

/**
 * 获取笔记的快照列表
 */
export async function getNoteSnapshots(noteId: string): Promise<INoteSnapshot[]> {
    try {
        const res = await apiClient.get(`/api/versions/notes/${noteId}/snapshots`);
        if (!res.ok) {
            throw new Error(`Failed to fetch note snapshots: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to get note snapshots:', noteId, error);
        throw error;
    }
}

/**
 * 回滚块到指定版本
 */
export async function rollbackBlock(blockId: string, versionId: string): Promise<IBlock> {
    try {
        const res = await apiClient.post(`/api/versions/blocks/${blockId}/rollback/${versionId}`);
        if (!res.ok) {
            throw new Error(`Failed to rollback block: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to rollback block:', blockId, versionId, error);
        throw error;
    }
}

// ===== 搜索 API =====

/**
 * 搜索笔记和块内容
 */
export async function search(query: string): Promise<ISearchResult[]> {
    try {
        const res = await apiClient.get(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
            throw new Error(`Failed to search: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        logger.error('[NotesService] Failed to search:', query, error);
        throw error;
    }
}

// ===== 导出 API =====

/**
 * 导出笔记为 Markdown
 */
export async function exportMarkdown(noteId: string): Promise<Blob> {
    try {
        const res = await apiClient.get(`/api/export/${noteId}/markdown`);
        if (!res.ok) {
            throw new Error(`Failed to export markdown: ${res.status}`);
        }
        return await res.blob();
    } catch (error) {
        logger.error('[NotesService] Failed to export markdown:', noteId, error);
        throw error;
    }
}

/**
 * 导出笔记为 HTML
 */
export async function exportHtml(noteId: string): Promise<string> {
    try {
        const res = await apiClient.get(`/api/export/${noteId}/html`);
        if (!res.ok) {
            throw new Error(`Failed to export html: ${res.status}`);
        }
        return await res.text();
    } catch (error) {
        logger.error('[NotesService] Failed to export html:', noteId, error);
        throw error;
    }
}

/**
 * 下载 Markdown 文件
 */
export async function downloadMarkdown(
    noteId: string,
    filename: string = 'note.md'
): Promise<void> {
    try {
        const blob = await exportMarkdown(noteId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        logger.error('[NotesService] Failed to download markdown:', noteId, error);
        throw error;
    }
}

// ===== 导出所有函数作为默认对象 =====
const notesService = {
    // 笔记
    getNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    // 块
    createBlock,
    updateBlock,
    deleteBlock,
    // 版本历史
    getBlockVersions,
    getNoteSnapshots,
    rollbackBlock,
    // 搜索
    search,
    // 导出
    exportMarkdown,
    exportHtml,
    downloadMarkdown,
};

export default notesService;
