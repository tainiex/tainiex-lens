/**
 * Logger utility for managing application logs.
 * In production, debug and log messages are suppressed.
 * Warn and error messages are always displayed.
 * 
 * Future integration: This is the central place to add Firebase/Sentry logging.
 */

const isDev = import.meta.env.DEV;

type LogLevel = 'debug' | 'log' | 'warn' | 'error';

class Logger {
    debug(...args: any[]) {
        if (isDev) {
            console.log(...args);
        }
    }

    log(...args: any[]) {
        if (isDev) {
            console.log(...args);
        }
    }

    warn(...args: any[]) {
        console.warn(...args);
    }

    error(...args: any[]) {
        console.error(...args);
        // TODO: Add Firebase/Sentry error reporting here
    }
}

export const logger = new Logger();
