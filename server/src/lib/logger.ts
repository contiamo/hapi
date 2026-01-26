/**
 * Structured logging with Pino
 *
 * Features:
 * - Runtime log level changes (via HTTP endpoint or signals)
 * - Automatic child logger tracking for global level updates
 * - JSON output in production (journald-friendly)
 * - Pretty printing in development
 * - Sensitive data redaction
 *
 * Usage:
 *   import { logger, createChildLogger } from '@/lib/logger'
 *
 *   logger.info('Server started')
 *   logger.debug({ sessionId }, 'Processing session')
 *
 *   const sessionLogger = createChildLogger({ sessionId: 'abc-123' })
 *   sessionLogger.info('Session created')
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

/**
 * Track child loggers for global level changes
 */
const childLoggers: pino.Logger[] = []

/**
 * Create a child logger with persistent context
 * Automatically tracked for global level changes
 *
 * @param bindings - Context to include in all log messages
 * @returns Child logger instance
 *
 * @example
 * const sessionLogger = createChildLogger({ sessionId: 'abc-123' })
 * sessionLogger.info('Session created')  // Includes sessionId in output
 */
export function createChildLogger(bindings: object): pino.Logger {
    const child = logger.child(bindings)
    childLoggers.push(child)
    return child
}

/**
 * Change log level globally (parent + all child loggers)
 * Useful for runtime debugging without restart
 *
 * @param level - New log level
 *
 * @example
 * setGlobalLogLevel('debug')  // Enable debug logging
 * setGlobalLogLevel('info')   // Back to normal
 */
export function setGlobalLogLevel(level: string) {
    logger.level = level
    childLoggers.forEach(child => {
        child.level = level
    })
    logger.info({ previousLevel: logger.level, newLevel: level }, 'Log level changed globally')
}

/**
 * Get current log level
 */
export function getLogLevel(): string {
    return logger.level
}

// Setup signal handlers for emergency log level changes
// SIGUSR1: Enable debug logging
// SIGUSR2: Reset to info logging
if (!isDev) {
    process.on('SIGUSR1', () => {
        setGlobalLogLevel('debug')
    })

    process.on('SIGUSR2', () => {
        setGlobalLogLevel('info')
    })
}

export type Logger = typeof logger
