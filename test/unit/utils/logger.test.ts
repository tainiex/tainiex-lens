import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { logger } from '@/shared/utils/logger';

describe('logger', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should call console.log for debug level', () => {
        logger.debug('test debug message');
        expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should call console.log for log level', () => {
        logger.log('test log message');
        expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should call console.warn for warn level', () => {
        logger.warn('test warn message');
        expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should call console.error for error level', () => {
        logger.error('test error message');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should format messages with multiple arguments', () => {
        logger.debug('Message:', { foo: 'bar' }, 123);
        expect(consoleLogSpy).toHaveBeenCalledWith('Message:', { foo: 'bar' }, 123);
    });
});
