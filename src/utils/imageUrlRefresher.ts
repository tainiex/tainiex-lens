import { Editor } from '@tiptap/react';
import { refreshSignedUrl, logger } from '@/shared';

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry
const REFRESH_IN_PROGRESS = new Map<string, Promise<string>>();

/**
 * Check and refresh expiring image URLs in the editor
 * 检查并刷新编辑器中即将过期的图片 URL
 */
export async function refreshExpiringImages(editor: Editor | null): Promise<void> {
    if (!editor || editor.isDestroyed) return;

    const now = Date.now();
    const refreshPromises: Promise<void>[] = [];

    try {
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image') {
                const { path, expiresAt } = node.attrs;

                // 跳过没有元数据的图片
                if (!path || !expiresAt) return;

                // 检查是否即将过期
                const timeUntilExpiry = expiresAt - now;
                if (timeUntilExpiry < REFRESH_THRESHOLD_MS) {
                    const promise = refreshImageUrl(editor, pos, node, path);
                    refreshPromises.push(promise);
                }
            }
        });

        if (refreshPromises.length > 0) {
            logger.debug(`[ImageRefresher] Refreshing ${refreshPromises.length} expiring URLs`);
            await Promise.allSettled(refreshPromises);
        }
    } catch (error) {
        // Editor might be destroyed during traversal
        if (!editor.isDestroyed) {
            logger.error('[ImageRefresher] Error during image refresh:', error);
        }
    }
}

/**
 * Refresh a single image URL
 * 刷新单个图片 URL
 */
async function refreshImageUrl(
    editor: Editor,
    pos: number,
    node: any,
    path: string
): Promise<void> {
    // 去重：检查是否已在刷新中
    if (REFRESH_IN_PROGRESS.has(path)) {
        const newUrl = await REFRESH_IN_PROGRESS.get(path)!;
        updateImageNode(editor, pos, node, newUrl);
        return;
    }

    // 开始刷新
    const refreshPromise = (async () => {
        try {
            const response = await refreshSignedUrl(path);
            return response.url;
        } catch (error) {
            logger.error(`[ImageRefresher] Failed to refresh ${path}:`, error);
            throw error;
        } finally {
            REFRESH_IN_PROGRESS.delete(path);
        }
    })();

    REFRESH_IN_PROGRESS.set(path, refreshPromise);

    try {
        const response = await refreshSignedUrl(path);
        updateImageNode(editor, pos, node, response.url, response.expiresAt);
    } catch (error) {
        logger.error('[ImageRefresher] Refresh failed:', error);
    }
}

/**
 * Update an image node with new URL
 * 使用新 URL 更新图片节点
 */
function updateImageNode(
    editor: Editor,
    pos: number,
    node: any,
    newUrl: string,
    newExpiresAt?: number
): void {
    // Check if editor is still valid
    if (editor.isDestroyed) {
        logger.warn('[ImageRefresher] Editor destroyed, skipping image update');
        return;
    }

    try {
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            src: newUrl,
            expiresAt: newExpiresAt || node.attrs.expiresAt,
        });
        editor.view.dispatch(tr);
    } catch (error) {
        logger.error('[ImageRefresher] Failed to update image node:', error);
    }
}
