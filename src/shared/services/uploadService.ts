/**
 * 文件上传服务
 * Upload Service
 *
 * 处理图片、视频和文件上传到 GCS
 */

import { apiClient } from '../utils/apiClient';
import { logger } from '../utils/logger';
import type { IUploadResponse } from '../types/collaboration';
import type { ISignedUrlResponse } from '@tainiex/shared-atlas';
import { compressImage } from '../utils/imageCompression';

// 上传类型和限制
export const UPLOAD_LIMITS = {
    image: {
        maxSize: 10 * 1024 * 1024, // 10MB
        acceptedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
    video: {
        maxSize: 100 * 1024 * 1024, // 100MB
        acceptedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    },
    file: {
        maxSize: 50 * 1024 * 1024, // 50MB
        acceptedTypes: [], // 任何类型
    },
} as const;

export type UploadType = keyof typeof UPLOAD_LIMITS;

interface UploadOptions {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
}

/**
 * 验证文件
 */
function validateFile(file: File, type: UploadType): { valid: boolean; error?: string } {
    const limits = UPLOAD_LIMITS[type];

    if (file.size > limits.maxSize) {
        const maxMB = limits.maxSize / (1024 * 1024);
        return { valid: false, error: `文件大小超过限制 (${maxMB}MB)` };
    }

    if (
        limits.acceptedTypes.length > 0 &&
        !(limits.acceptedTypes as readonly string[]).includes(file.type)
    ) {
        return { valid: false, error: `不支持的文件类型: ${file.type}` };
    }

    return { valid: true };
}

/**
 * 上传图片
 */
export async function uploadImage(
    noteId: string,
    file: File,
    options?: UploadOptions
): Promise<IUploadResponse> {
    const validation = validateFile(file, 'image');
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    return uploadFile(noteId, file, 'image', options);
}

/**
 * 上传视频
 */
export async function uploadVideo(
    noteId: string,
    file: File,
    options?: UploadOptions
): Promise<IUploadResponse> {
    const validation = validateFile(file, 'video');
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    return uploadFile(noteId, file, 'video', options);
}

/**
 * 上传普通文件
 */
export async function uploadGenericFile(
    noteId: string,
    file: File,
    options?: UploadOptions
): Promise<IUploadResponse> {
    const validation = validateFile(file, 'file');
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    return uploadFile(noteId, file, 'file', options);
}

/**
 * 通用上传函数
 */
async function uploadFile(
    noteId: string,
    file: File,
    type: UploadType,
    options?: UploadOptions
): Promise<IUploadResponse> {
    // 如果是图片，先压缩
    let fileToUpload = file;
    if (type === 'image') {
        fileToUpload = await compressImage(file);
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);

    const endpoint = `/api/upload/${type}/${noteId}`;

    try {
        logger.debug('[UploadService] Uploading', type, 'to', endpoint);

        // 使用 XMLHttpRequest 支持进度回调
        if (options?.onProgress) {
            return await uploadWithProgress(endpoint, formData, options);
        }

        // 简单上传
        const res = await apiClient.request(endpoint, {
            method: 'POST',
            body: formData,
            signal: options?.signal,
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Upload failed: ${res.status} - ${errorText}`);
        }

        return await res.json();
    } catch (error) {
        logger.error('[UploadService] Upload failed:', error);
        throw error;
    }
}

/**
 * 带进度的上传
 */
function uploadWithProgress(
    endpoint: string,
    formData: FormData,
    options: UploadOptions
): Promise<IUploadResponse> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // 进度事件
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                options.onProgress?.(percent);
            }
        });

        // 完成事件
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        });

        // 错误事件
        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        // 取消事件
        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
        });

        // 配置请求
        const fullUrl = endpoint.startsWith('http')
            ? endpoint
            : `${window.location.origin}${endpoint}`;

        xhr.open('POST', fullUrl);
        xhr.withCredentials = true;

        // 监听取消信号
        options.signal?.addEventListener('abort', () => {
            xhr.abort();
        });

        // 发送
        xhr.send(formData);
    });
}

/**
 * 根据文件类型自动选择上传方法
 */
export async function autoUpload(
    noteId: string,
    file: File,
    options?: UploadOptions
): Promise<IUploadResponse> {
    const type = file.type;

    if (type.startsWith('image/')) {
        return uploadImage(noteId, file, options);
    }

    if (type.startsWith('video/')) {
        return uploadVideo(noteId, file, options);
    }

    return uploadGenericFile(noteId, file, options);
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Refresh a signed URL for an existing GCS path
 * 为现有 GCS 路径刷新签名 URL
 *
 * @param path - Internal GCS path
 * @param expirationSeconds - Optional expiration time (default: 3600)
 * @returns New signed URL with expiration info
 */
export async function refreshSignedUrl(
    path: string,
    expirationSeconds?: number
): Promise<ISignedUrlResponse> {
    const params = new URLSearchParams({ path });
    if (expirationSeconds !== undefined) {
        params.append('expirationSeconds', String(expirationSeconds));
    }

    const response = await apiClient.get(`/api/storage/url?${params.toString()}`);

    if (!response.ok) {
        throw new Error(`Failed to refresh signed URL: ${response.statusText}`);
    }

    return await response.json();
}

const uploadService = {
    uploadImage,
    uploadVideo,
    uploadGenericFile,
    autoUpload,
    validateFile,
    formatFileSize,
    refreshSignedUrl,
    UPLOAD_LIMITS,
};

export default uploadService;
