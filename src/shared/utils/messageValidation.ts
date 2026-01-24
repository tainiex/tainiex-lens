import { logger } from './logger';

/**
 * 清理和验证消息内容
 * 确保内容始终是有效的字符串，过滤掉无效值
 *
 * @param content - 原始内容（可能是任何类型）
 * @returns 清理后的有效字符串
 */
export function sanitizeMessageContent(content: any): string {
    // 处理 undefined 和 null
    if (content === undefined || content === null) {
        logger.warn('[messageValidation] Content is undefined or null, returning empty string');
        return '';
    }

    // 处理字面量字符串 "undefined" 或 "null"
    if (content === 'undefined' || content === 'null') {
        logger.warn(
            '[messageValidation] Content is literal string "undefined" or "null", returning empty string'
        );
        return '';
    }

    // 确保转换为字符串
    if (typeof content !== 'string') {
        logger.warn('[messageValidation] Content is not a string, converting:', typeof content);
        try {
            return String(content);
        } catch (error) {
            logger.error('[messageValidation] Failed to convert content to string:', error);
            return '';
        }
    }

    // 返回有效字符串（包括空字符串）
    return content;
}

/**
 * 验证消息内容是否为有效的非空字符串
 *
 * @param content - 要验证的内容
 * @returns 是否为有效的非空内容
 */
export function isValidMessageContent(content: any): boolean {
    const sanitized = sanitizeMessageContent(content);
    return sanitized.length > 0;
}
