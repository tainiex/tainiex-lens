/**
 * Base64 Encoding/Decoding Utilities
 * Base64 编解码工具
 *
 * Centralized utility to ensure consistent safe decoding across the app.
 * 集中管理的工具，确保应用内一致的安全解码。
 */

import { logger } from './logger';

export const base64Utils = {
    /**
     * Encode Uint8Array to Base64 string
     * 将 Uint8Array 编码为 Base64 字符串
     */
    encode(uint8Array: Uint8Array): string {
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    },

    /**
     * Decode Base64 string to Uint8Array with robust cleaning
     * 将 Base64 字符串解码为 Uint8Array，包含健壮的清理逻辑
     */
    decode(base64: string | undefined | null): Uint8Array {
        if (!base64) return new Uint8Array(0);
        try {
            // Robust Decode: remove whitespace, normalize URL-safe chars, fix padding
            // 健壮解码：移除空白，标准化 URL 安全字符，修复填充
            let cleanBase64 = base64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
            while (cleanBase64.length % 4) {
                cleanBase64 += '=';
            }
            const binary = atob(cleanBase64);
            const len = binary.length;
            const uint8Array = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                uint8Array[i] = binary.charCodeAt(i);
            }
            return uint8Array;
        } catch (e) {
            logger.error('[Base64Utils] Decode failed:', e);
            return new Uint8Array(0);
        }
    },
};
