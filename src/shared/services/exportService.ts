/**
 * 导出服务
 * Export Service
 *
 * 处理笔记导出为 Markdown 和 HTML 格式
 */

import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';

export type ExportFormat = 'markdown' | 'html';

/**
 * 导出笔记为 Markdown
 */
export async function exportAsMarkdown(noteId: string): Promise<Blob> {
    const endpoint = `/api/export/${noteId}/markdown`;

    try {
        logger.debug('[ExportService] Exporting as Markdown:', noteId);

        const res = await apiClient.request(endpoint, {
            method: 'GET',
        });

        if (!res.ok) {
            throw new Error(`Export failed: ${res.status}`);
        }

        return await res.blob();
    } catch (error) {
        logger.error('[ExportService] Markdown export failed:', error);
        throw error;
    }
}

/**
 * 导出笔记为 HTML
 */
export async function exportAsHtml(noteId: string): Promise<Blob> {
    const endpoint = `/api/export/${noteId}/html`;

    try {
        logger.debug('[ExportService] Exporting as HTML:', noteId);

        const res = await apiClient.request(endpoint, {
            method: 'GET',
        });

        if (!res.ok) {
            throw new Error(`Export failed: ${res.status}`);
        }

        return await res.blob();
    } catch (error) {
        logger.error('[ExportService] HTML export failed:', error);
        throw error;
    }
}

/**
 * 获取 HTML 预览内容
 */
export async function getHtmlPreview(noteId: string): Promise<string> {
    const endpoint = `/api/export/${noteId}/html`;

    try {
        const res = await apiClient.request(endpoint, {
            method: 'GET',
        });

        if (!res.ok) {
            throw new Error(`Preview failed: ${res.status}`);
        }

        return await res.text();
    } catch (error) {
        logger.error('[ExportService] HTML preview failed:', error);
        throw error;
    }
}

/**
 * 下载文件
 */
export function downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 导出并下载笔记
 */
export async function exportAndDownload(
    noteId: string,
    noteTitle: string,
    format: ExportFormat
): Promise<void> {
    try {
        let blob: Blob;
        let extension: string;

        if (format === 'markdown') {
            blob = await exportAsMarkdown(noteId);
            extension = 'md';
        } else {
            blob = await exportAsHtml(noteId);
            extension = 'html';
        }

        // 清理文件名中的非法字符
        const safeTitle = noteTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'untitled';
        const filename = `${safeTitle}.${extension}`;

        downloadFile(blob, filename);
        logger.debug('[ExportService] Download completed:', filename);
    } catch (error) {
        logger.error('[ExportService] Export and download failed:', error);
        throw error;
    }
}

const exportService = {
    exportAsMarkdown,
    exportAsHtml,
    getHtmlPreview,
    downloadFile,
    exportAndDownload,
};

export default exportService;
