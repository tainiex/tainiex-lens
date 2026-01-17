/**
 * 图片压缩工具
 * Image Compression Utility
 *
 * 在上传前压缩图片，尽量不降低画质的情况下缩小文件体积
 */

import imageCompression from 'browser-image-compression';

/**
 * 压缩配置
 */
const COMPRESSION_OPTIONS = {
    // 最大宽度或高度（像素）
    maxSizeMB: 2, // 目标文件大小（MB）
    maxWidthOrHeight: 1920, // 最大宽度或高度
    useWebWorker: true, // 使用 Web Worker 提升性能
    fileType: 'image/jpeg', // 输出格式
    initialQuality: 0.9, // 初始质量（0-1）
};

/**
 * 检查文件是否需要压缩
 */
function shouldCompress(file: File): boolean {
    // 1. 只压缩图片
    if (!file.type.startsWith('image/')) {
        return false;
    }

    // 2. SVG 和 GIF 不压缩（SVG 是矢量图，GIF 可能有动画）
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        return false;
    }

    // 3. 文件小于 200KB 不压缩
    const MIN_SIZE_TO_COMPRESS = 200 * 1024; // 200KB
    if (file.size < MIN_SIZE_TO_COMPRESS) {
        return false;
    }

    return true;
}

/**
 * 压缩图片文件
 * @param file - 原始图片文件
 * @returns 压缩后的文件（如果不需要压缩则返回原文件）
 */
export async function compressImage(file: File): Promise<File> {
    // 检查是否需要压缩
    if (!shouldCompress(file)) {
        console.log(
            `[ImageCompression] Skipping compression for ${file.name} (${formatFileSize(file.size)})`
        );
        return file;
    }

    const originalSize = file.size;
    console.log(`[ImageCompression] Compressing ${file.name} (${formatFileSize(originalSize)})...`);

    try {
        // 根据文件类型调整压缩选项
        const options = { ...COMPRESSION_OPTIONS };

        // PNG 保持透明度
        if (file.type === 'image/png') {
            options.fileType = 'image/png';
            options.initialQuality = 0.95; // PNG 需要更高质量
        }

        // WebP 使用更高压缩率
        if (file.type === 'image/webp') {
            options.fileType = 'image/webp';
            options.initialQuality = 0.85;
        }

        const compressedFile = await imageCompression(file, options);
        const compressedSize = compressedFile.size;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        console.log(
            `[ImageCompression] Compressed ${file.name}: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (${compressionRatio}% reduction)`
        );

        // 如果压缩后反而变大了（可能发生在小文件上），返回原文件
        if (compressedSize >= originalSize) {
            console.log(`[ImageCompression] Compressed file is larger, using original`);
            return file;
        }

        return compressedFile;
    } catch (error) {
        console.error('[ImageCompression] Compression failed:', error);
        // 压缩失败时返回原文件
        return file;
    }
}

/**
 * 批量压缩图片
 * @param files - 图片文件数组
 * @returns 压缩后的文件数组
 */
export async function compressImages(files: File[]): Promise<File[]> {
    return Promise.all(files.map(file => compressImage(file)));
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
