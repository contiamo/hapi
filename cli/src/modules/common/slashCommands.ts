import type { SlashCommand, SlashCommandsResponse } from '@hapi/protocol/types';

export type { SlashCommandsResponse as ListSlashCommandsResponse };

/**
 * Commands intercepted by HAPI for session lifecycle management.
 * These take precedence over any Claude Code-reported versions.
 */
export const INTERCEPTED_COMMANDS: SlashCommand[] = [
    { name: 'clear', description: 'Nuclear option: clears all conversation history and starts fresh in current directory', source: 'builtin' },
    { name: 'compact', description: 'Compact into isolated sub-session with fresh context', source: 'builtin' },
    { name: 'rollback', description: 'Rollback to previous session state', source: 'builtin' },
];

/**
 * TUI-only commands that don't produce useful output in remote/HAPI mode.
 * These are filtered out from Claude Code-reported commands.
 */
const TUI_ONLY_COMMAND_NAMES = new Set(['context', 'cost', 'init']);

/**
 * Build merged slash command list combining HAPI-intercepted commands with
 * Claude Code SDK-reported command names.
 *
 * IMPORTANT: /clear, /compact, and /rollback are intercepted by HAPI for session
 * lifecycle management. Their descriptions reflect HAPI's behavior.
 *
 * The full command list (built-ins, user skills, project skills, plugins) is already
 * provided by the Claude Code init message as command names — no separate user-directory
 * scan is needed.
 *
 * Priority order: Intercepted > Claude Code-reported
 * - Intercepted commands cannot be overridden (critical for session management)
 * - Claude Code-reported commands are included with a generic description
 * - User commands are ignored (init message already includes everything)
 *
 * @param claudeCommandNames - Command names from Claude Code SDK init message
 */
export function buildSlashCommandList(
    claudeCommandNames?: string[]
): SlashCommand[] {
    if (!claudeCommandNames) {
        return [...INTERCEPTED_COMMANDS];
    }

    const interceptedNames = new Set(INTERCEPTED_COMMANDS.map(cmd => cmd.name));
    const sdkCommands: SlashCommand[] = claudeCommandNames
        .filter(name => !interceptedNames.has(name) && !TUI_ONLY_COMMAND_NAMES.has(name))
        .map(name => ({ name, description: 'Claude Code command', source: 'claude' as const }));

    return [...INTERCEPTED_COMMANDS, ...sdkCommands];
}

/**
 * List all available slash commands.
 * Returns intercepted commands (no separate user scan needed — init message covers everything).
 */
export function listSlashCommands(): SlashCommand[] {
    return [...INTERCEPTED_COMMANDS];
}
