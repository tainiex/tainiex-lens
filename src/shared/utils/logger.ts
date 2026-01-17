/**
 * Logger utility for managing application logs.
 *
 * Log level is controlled via Vite env var `VITE_LOG_LEVEL`:
 * - debug | log | warn | error
 *
 * Production default is `warn`.
 * Development default is `debug`.
 *
 * Future integration: This is the central place to add Firebase/Sentry logging.
 */

type LogLevel = 'debug' | 'log' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
    debug: 10,
    log: 20,
    warn: 30,
    error: 40,
};

const getEnvLogLevel = (): LogLevel | null => {
    // IMPORTANT:
    // Use `import.meta.env.*` directly so Vite can statically replace these values.
    // Do NOT wrap in optional chaining / `any` access, otherwise Vite may not inject them.
    const raw = import.meta.env.VITE_LOG_LEVEL;
    if (typeof raw !== 'string') return null;

    const v = raw.trim().toLowerCase();
    if (v === 'debug' || v === 'log' || v === 'warn' || v === 'error') return v;
    return null;
};

const isDev = import.meta.env.DEV;
const defaultLevel: LogLevel = isDev ? 'debug' : 'warn';
const envLevel: LogLevel | null = getEnvLogLevel();
const activeLevel: LogLevel = envLevel ?? defaultLevel;

const shouldLog = (level: LogLevel) => LEVEL_RANK[level] >= LEVEL_RANK[activeLevel];

// Avoid direct `console.*` references across the app by capturing a private handle here.
// This makes grepping/enforcing "no console usage" easier while keeping logger behavior.
const _console = console;

// Dev-only: print the resolved logger configuration once at startup.
if (isDev) {
    _console.debug('[Logger]', {
        activeLevel,
        source: envLevel ? 'env' : 'default',
        envLevel,
        defaultLevel,
    });
}

class Logger {
    debug(...args: any[]) {
        if (shouldLog('debug')) {
            _console.log(...args);
        }
    }

    log(...args: any[]) {
        if (shouldLog('log')) {
            _console.log(...args);
        }
    }

    warn(...args: any[]) {
        if (shouldLog('warn')) {
            _console.warn(...args);
        }
    }

    error(...args: any[]) {
        if (shouldLog('error')) {
            _console.error(...args);
            // TODO: Add Firebase/Sentry error reporting here
        }
    }
}

export const logger = new Logger();
