import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { getProjectPath } from './path'

/**
 * Anthropic API error messages that indicate a corrupted session JSONL file.
 * Import this wherever session corruption needs to be detected.
 */
export const CORRUPTION_ERRORS = [
    'text content blocks must be non-empty',
    'thinking or redacted_thinking blocks in the latest assistant message cannot be modified',
] as const

type Entry = Record<string, unknown>

/**
 * Returns true if the entry is a "human turn" user message — a user-role entry
 * whose content array contains at least one text block and no tool_result blocks.
 *
 * Using the absence of tool_result (rather than requiring all-text) correctly
 * handles messages with image or document attachments alongside the text block.
 */
function isHumanTurnEntry(entry: Entry): boolean {
    const msg = entry.message as Entry | undefined
    if (!msg || msg.role !== 'user') return false

    const content = msg.content
    if (!Array.isArray(content) || content.length === 0) return false

    const blocks = content as Entry[]
    const hasToolResult = blocks.some((b) => b.type === 'tool_result')
    if (hasToolResult) return false

    return blocks.some((b) => b.type === 'text')
}

/**
 * Extract the text of the first text block from a human turn entry.
 */
function extractHumanTurnText(entry: Entry): string {
    const msg = entry.message as Entry | undefined
    const content = msg?.content as Entry[] | undefined
    if (!content) return ''
    const textBlock = content.find((b) => (b as Entry).type === 'text')
    return (textBlock?.text as string | undefined) ?? ''
}

export type RollbackResult =
    | { truncated: true; removedText: string; turnsRemoved: number }
    | { truncated: false; reason: 'no_session' | 'not_enough_turns' | 'file_not_found' }

/**
 * Rolls back the last `turns` conversation turns from a Claude session JSONL file.
 *
 * A "turn" is defined as one human user message plus the assistant response(s) that
 * follow it. Rolling back N turns truncates the file to just before the Nth-from-last
 * human turn message, discarding that turn and all subsequent turns.
 *
 * Returns the text of the first removed human turn message so the caller can
 * show the user what was removed.
 */
export function rollbackSession(cwd: string, sessionId: string | null, turns: number): RollbackResult {
    if (!sessionId) {
        return { truncated: false, reason: 'no_session' }
    }

    const projectPath = getProjectPath(cwd)
    const filePath = join(projectPath, `${sessionId}.jsonl`)

    if (!existsSync(filePath)) {
        logger.warn(`[rollbackSession] Session file not found: ${filePath}`)
        return { truncated: false, reason: 'file_not_found' }
    }

    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n').filter((l) => l.trim() !== '')

    const entries: Entry[] = []
    for (const line of lines) {
        try {
            entries.push(JSON.parse(line) as Entry)
        } catch {
            entries.push({})
        }
    }

    // Collect indices of human turn entries in forward order.
    const humanTurnIndices: number[] = []
    for (let i = 0; i < entries.length; i++) {
        if (isHumanTurnEntry(entries[i])) {
            humanTurnIndices.push(i)
        }
    }

    if (humanTurnIndices.length < turns) {
        logger.warn(
            `[rollbackSession] Not enough turns to roll back (have ${humanTurnIndices.length}, requested ${turns})`
        )
        return { truncated: false, reason: 'not_enough_turns' }
    }

    // The cut point is the index of the Nth-from-last human turn.
    const cutIndex = humanTurnIndices[humanTurnIndices.length - turns]

    // If the cut point is the very first entry, rolling back would produce an empty
    // or near-empty file that Claude Code cannot resume from. Treat this as
    // not_enough_turns and let the user use /clear to start fresh instead.
    if (cutIndex === 0) {
        logger.warn('[rollbackSession] Rollback would empty the session; use /clear instead')
        return { truncated: false, reason: 'not_enough_turns' }
    }

    const removedText = extractHumanTurnText(entries[cutIndex])

    const cleanLines = lines.slice(0, cutIndex)
    writeFileSync(filePath, cleanLines.join('\n') + '\n', 'utf-8')

    logger.info(
        `[rollbackSession] Truncated session to ${cleanLines.length} lines ` +
            `(removed ${lines.length - cleanLines.length} from ${turns} turn(s))`
    )

    return { truncated: true, removedText, turnsRemoved: turns }
}
