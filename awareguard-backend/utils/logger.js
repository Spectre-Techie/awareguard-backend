// awareguard-backend/utils/logger.js
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Structured logger utility
 * Replaces all console.log/console.error with level-based logging
 */
const logger = {
    /**
     * Info-level logs (general application flow)
     */
    info: (message, meta = {}) => {
        const log = {
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        };

        if (isDev) {
            console.log(`[INFO] ${message}`, meta);
        } else {
            console.log(JSON.stringify(log));
        }
    },

    /**
     * Warning-level logs (potential issues)
     */
    warn: (message, meta = {}) => {
        const log = {
            level: 'warn',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        };

        if (isDev) {
            console.warn(`[WARN] ${message}`, meta);
        } else {
            console.warn(JSON.stringify(log));
        }
    },

    /**
     * Error-level logs (actual errors, never expose to users)
     */
    error: (message, meta = {}) => {
        const log = {
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        };

        if (isDev) {
            console.error(`[ERROR] ${message}`, meta);
        } else {
            // In production, log as JSON without stack traces in the main output
            const { stack, ...safeLog } = log;
            console.error(JSON.stringify(safeLog));

            // Stack trace goes to stderr separately for debugging
            if (meta.stack) {
                console.error('Stack trace:', meta.stack);
            }
        }
    }
};

export default logger;
