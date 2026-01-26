/**
 * Structured logging with Pino
 *
 * Features:
 * - Runtime log level changes (via HTTP endpoint or signals)
 * - JSON output in production (journald-friendly)
 * - Pretty printing in development
 * - Sensitive data redaction
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *
 *   logger.info('Server started')
 *   logger.debug({ component: 'MyComponent', sessionId }, 'Processing session')
 */

import pino from 'pino'
import { isBunCompiled } from '../utils/bunCompiled'

const isDev = process.env.NODE_ENV === 'development'
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info')
const isCompiled = isBunCompiled()

/**
 * Main logger instance
 */
export const logger = pino({
    level: logLevel,

    // For development (not compiled): pretty print
    // For production (compiled): JSON to stdout (journald will capture)
    // Note: pino-pretty can't be loaded in compiled binaries
    transport: (isDev && !isCompiled) ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
        }
    } : undefined,

    // Base configuration
    formatters: {
        level: (label) => {
            return { level: label }
        }
    },

    // Add timestamp in production
    timestamp: !isDev ? pino.stdTimeFunctions.isoTime : false,

    // Redact sensitive data
    redact: {
        paths: [
            'password',
            '*.password',
            'token',
            '*.token',
            'apiKey',
            '*.apiKey',
            'secret',
            '*.secret',
            'authorization',
            '*.authorization',
        ],
        censor: '[REDACTED]'
    },

    // Custom serializers for common objects
    serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    }
})

const VALID_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

/**
 * Change log level at runtime
 * Useful for debugging without restart
 *
 * @param level - New log level
 */
export function setGlobalLogLevel(level: string) {
    if (!VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
        logger.warn({ level, component: 'Logger' }, 'Invalid log level, ignoring')
        return
    }
    const previousLevel = logger.level
    logger.level = level
    logger.info({ previousLevel, newLevel: level, component: 'Logger' }, 'Log level changed')
}

/**
 * Get current log level
 */
export function getLogLevel(): string {
    return logger.level
}

// Signal handlers for runtime log level changes
// SIGUSR1: Enable debug logging
// SIGUSR2: Reset to info logging
process.on('SIGUSR1', () => {
    setGlobalLogLevel('debug')
})

process.on('SIGUSR2', () => {
    setGlobalLogLevel('info')
})

export type Logger = typeof logger
