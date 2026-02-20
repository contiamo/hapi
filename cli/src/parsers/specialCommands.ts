/**
 * Parsers for special commands that require dedicated remote session handling
 */

export type SpecialCommandResult =
    | { type: 'compact'; originalMessage: string }
    | { type: 'clear' }
    | { type: 'rollback'; turns: number }
    | { type: null }

/**
 * Parse /compact command
 * Matches messages starting with "/compact " or exactly "/compact"
 */
function parseCompact(message: string): SpecialCommandResult {
    const trimmed = message.trim();

    if (trimmed === '/compact' || trimmed.startsWith('/compact ')) {
        return { type: 'compact', originalMessage: trimmed };
    }

    return { type: null };
}

/**
 * Parse /clear command
 * Only matches exactly "/clear"
 */
function parseClear(message: string): SpecialCommandResult {
    return message.trim() === '/clear' ? { type: 'clear' } : { type: null };
}

/**
 * Parse /rollback [N] command
 * Matches "/rollback" (N=1) or "/rollback N" where N is a positive integer.
 * Returns { type: null } for invalid arguments so the caller can send an error.
 */
export function parseRollback(message: string): SpecialCommandResult | { type: 'rollback_invalid'; raw: string } {
    const trimmed = message.trim();

    if (trimmed === '/rollback') {
        return { type: 'rollback', turns: 1 };
    }

    if (trimmed.startsWith('/rollback ')) {
        const arg = trimmed.slice('/rollback '.length).trim();
        const n = Number(arg);
        if (Number.isInteger(n) && n > 0) {
            return { type: 'rollback', turns: n };
        }
        return { type: 'rollback_invalid', raw: arg };
    }

    return { type: null };
}

/**
 * Unified parser for special commands.
 * Returns the type of command detected, or { type: null } if none matched.
 */
export function parseSpecialCommand(message: string): SpecialCommandResult | { type: 'rollback_invalid'; raw: string } {
    const compact = parseCompact(message);
    if (compact.type !== null) return compact;

    const clear = parseClear(message);
    if (clear.type !== null) return clear;

    return parseRollback(message);
}
