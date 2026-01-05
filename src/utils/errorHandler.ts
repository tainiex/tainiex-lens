import { z } from 'zod';

// 错误类型分类 Schema
const ErrorTypeSchema = z.enum(['NETWORK', 'AUTH', 'VALIDATION', 'SERVER', 'UNKNOWN']);
export type ErrorType = z.infer<typeof ErrorTypeSchema>;

// API Error Schema
export const ApiErrorSchema = z.object({
  type: ErrorTypeSchema,
  message: z.string(),
  status: z.number().optional(),
  originalError: z.instanceof(Error).optional(),
  retryable: z.boolean(),
  context: z.string().optional()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const isApiError = (error: unknown): error is ApiError => {
  try {
    ApiErrorSchema.parse(error);
    return true;
  } catch {
    return false;
  }
};

export class ErrorHandler {
  /**
   * 解析错误为标准化的 ApiError
   */
  static parseError(error: Error | Response | any, context?: string): ApiError {
    // 处理 Response 对象
    if (error instanceof Response) {
      const status = error.status;
      const statusText = error.statusText;
      
      switch (status) {
        case 400:
          return {
            type: 'VALIDATION',
            message: '请求参数错误，请检查输入内容',
            status,
            retryable: false,
            context
          };
        case 401:
          return {
            type: 'AUTH',
            message: '登录已过期，请重新登录',
            status,
            retryable: false,
            context
          };
        case 403:
          return {
            type: 'AUTH',
            message: '权限不足，无法访问此内容',
            status,
            retryable: false,
            context
          };
        case 404:
          return {
            type: 'SERVER',
            message: '请求的资源不存在',
            status,
            retryable: false,
            context
          };
        case 408:
          return {
            type: 'NETWORK',
            message: '请求超时，请重试',
            status,
            retryable: true,
            context
          };
        case 422:
          return {
            type: 'VALIDATION',
            message: '数据验证失败，请检查输入',
            status,
            retryable: false,
            context
          };
        case 429:
          return {
            type: 'SERVER',
            message: '请求过于频繁，请稍后再试',
            status,
            retryable: true,
            context
          };
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: 'SERVER',
            message: '服务器暂时不可用，请稍后重试',
            status,
            retryable: true,
            context
          };
        default:
          return {
            type: status >= 500 ? 'SERVER' : 'UNKNOWN',
            message: `请求失败 (${status}): ${statusText}`,
            status,
            retryable: status >= 500,
            context
          };
      }
    }

    // 处理网络错误
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        type: 'NETWORK',
        message: '网络连接失败，请检查网络设置',
        originalError: error,
        retryable: true,
        context
      };
    }

    // 处理超时错误
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('超时')) {
      return {
        type: 'NETWORK',
        message: error.message.includes('流超时') ? 
          'AI模型处理超时，请稍后重试' : 
          '请求超时，请重试',
        originalError: error,
        retryable: true,
        context
      };
    }

    // 处理其他错误
    return {
      type: 'UNKNOWN',
      message: error.message || '发生未知错误',
      originalError: error,
      retryable: false,
      context
    };
  }

  /**
   * 判断错误是否可重试
   */
  static isRetryable(error: ApiError): boolean {
    return error.retryable;
  }

  /**
   * 获取用户友好的错误消息
   */
  static getUserMessage(error: ApiError): string {
    return error.message;
  }

  /**
   * 获取错误的具体建议操作
   */
  static getSuggestedAction(error: ApiError): string | null {
    switch (error.type) {
      case 'NETWORK':
        return '请检查网络连接或稍后重试';
      case 'AUTH':
        return '请重新登录以继续使用';
      case 'VALIDATION':
        return '请检查输入内容是否正确';
      case 'SERVER':
        return '请稍后重试或联系技术支持';
      default:
        return null;
    }
  }

  /**
   * 记录错误到控制台
   */
  static logError(error: ApiError, context?: string): void {
    const contextInfo = context ? ` [${context}]` : '';
    const errorInfo = {
      type: error.type,
      message: error.message,
      status: error.status,
      retryable: error.retryable,
      context: contextInfo,
      timestamp: new Date().toISOString()
    };

    if (error.type === 'SERVER' || error.type === 'NETWORK') {
      console.warn('API Error:', errorInfo, error.originalError);
    } else {
      console.error('API Error:', errorInfo, error.originalError);
    }
  }

  /**
   * 指数退避重试计算
   */
  static calculateRetryDelay(attempt: number, baseDelay: number = 1000): number {
    // 指数退避：baseDelay * 2^(attempt-1) + 随机抖动
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% 随机抖动
    return Math.min(exponentialDelay + jitter, 30000); // 最大30秒
  }

  /**
   * 获取错误类型对应的通知类型
   */
  static getNotificationType(error: ApiError): 'error' | 'warning' | 'info' {
    switch (error.type) {
      case 'NETWORK':
        return 'warning';
      case 'AUTH':
        return 'error';
      case 'VALIDATION':
        return 'warning';
      case 'SERVER':
        return 'error';
      default:
        return 'error';
    }
  }
}