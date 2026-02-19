import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import type { SlashCommand, SlashCommandsResponse } from '@hapi/protocol/types';

export interface ListSlashCommandsRequest {
    agent: string;
}

export type { SlashCommandsResponse as ListSlashCommandsResponse };

/**
 * Built-in slash commands for each agent type.
 */
const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation context', source: 'builtin' },
        { name: 'context', description: 'Show context information', source: 'builtin' },
        { name: 'cost', description: 'Show session cost', source: 'builtin' },
        { name: 'plan', description: 'Toggle plan mode', source: 'builtin' },
    ],
    codex: [
        { name: 'review', description: 'Review code', source: 'builtin' },
        { name: 'new', description: 'Start new conversation', source: 'builtin' },
        { name: 'compat', description: 'Check compatibility', source: 'builtin' },
        { name: 'undo', description: 'Undo last action', source: 'builtin' },
    ],
    gemini: [
        { name: 'about', description: 'About Gemini', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation', source: 'builtin' },
        { name: 'compress', description: 'Compress context', source: 'builtin' },
    ],
};

/**
 * Build merged slash command list combining HAPI-intercepted commands with
 * Claude Code-reported commands.
 *
 * IMPORTANT: /clear and /compact are intercepted by HAPI for session lifecycle management.
 * Their descriptions reflect HAPI's behavior, not Claude Code's native behavior.
 *
 * For Claude, the full command list (built-ins, user skills, project skills, plugins)
 * is already provided by the Claude Code init message, so no separate user-directory
 * scan is needed. For other agents (Codex), user commands are passed in explicitly.
 *
 * Priority order: Intercepted > Claude Code-reported > user (Codex only)
 * - Intercepted commands cannot be overridden (critical for session management)
 * - Claude Code-reported commands take precedence over Codex user commands
 *
 * @param agent - Agent type
 * @param claudeCodeCommands - Command names from the Claude Code init message (Claude only)
 * @param userCommands - User-defined commands scanned from disk (Codex only)
 * @returns Merged list with deduplication applied
 */
export function buildSlashCommandList(
    agent: string,
    claudeCodeCommands?: string[],
    userCommands?: SlashCommand[]
): SlashCommand[] {
    // Intercepted commands with HAPI-specific descriptions
    const intercepted: SlashCommand[] = [
        {
            name: 'clear',
            description: 'Complete context and session reset (nuclear option - starts fresh Claude process)',
            source: 'builtin'
        },
        {
            name: 'compact',
            description: 'Compress context while preserving session (isolated from other messages)',
            source: 'builtin'
        }
    ];

    const interceptedNames = new Set(intercepted.map(c => c.name));

    // These Claude Code built-in commands only produce output in the terminal UI (TUI).
    // When sent via stream-json SDK mode they execute silently with an empty result,
    // so they are useless in HAPI's remote mode.
    const TUI_ONLY_COMMANDS = new Set(['context', 'cost', 'init']);

    if (agent === 'claude') {
        // For Claude, the init message already includes everything (built-ins, user skills,
        // project skills, plugin skills). Deduplicate across scopes and strip intercepted names.
        const seen = new Set<string>();
        const claudeCommands: SlashCommand[] = (claudeCodeCommands ?? [])
            .filter(name => {
                if (interceptedNames.has(name) || TUI_ONLY_COMMANDS.has(name) || seen.has(name)) return false;
                seen.add(name);
                return true;
            })
            .map(name => ({ name, description: 'Claude Code command', source: 'claude' as const }));

        return [...intercepted, ...claudeCommands];
    }

    // For other agents (Codex), merge intercepted with user-scanned commands.
    const filteredUserCommands = (userCommands ?? [])
        .filter(cmd => !interceptedNames.has(cmd.name));

    return [...intercepted, ...filteredUserCommands];
}

/**
 * Parse frontmatter from a markdown file content.
 * Returns the description (from frontmatter) and the body content.
 */
function parseFrontmatter(fileContent: string): { description?: string; content: string } {
    // Match frontmatter: starts with ---, ends with ---
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
        const yamlContent = match[1];
        const body = match[2].trim();
        try {
            const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
            const description = typeof parsed?.description === 'string' ? parsed.description : undefined;
            return { description, content: body };
        } catch {
            // Invalid YAML - the --- block is not valid frontmatter, return entire file
            return { content: fileContent.trim() };
        }
    }
    // No frontmatter, entire file is content
    return { content: fileContent.trim() };
}

/**
 * Get the user commands directory for an agent type.
 * Returns null if the agent doesn't support user commands.
 */
function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
            return join(configDir, 'commands');
        }
        case 'codex': {
            const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
            return join(codexHome, 'prompts');
        }
        default:
            // Gemini and other agents don't have user commands
            return null;
    }
}

/**
 * Scan a directory for user-defined commands (*.md files).
 * For Codex, reads file content and parses frontmatter.
 * Returns the command names (filename without extension).
 */
export async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent);
    if (!dir) {
        return [];
    }

    const shouldReadContent = agent === 'codex';

    try {
        const entries = await readdir(dir, { withFileTypes: true });
        const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

        // Read all files in parallel
        const commands = await Promise.all(
            mdFiles.map(async (entry): Promise<SlashCommand | null> => {
                const name = entry.name.slice(0, -3);
                if (!name) return null;

                const command: SlashCommand = {
                    name,
                    description: 'Custom command',
                    source: 'user',
                };

                if (shouldReadContent) {
                    try {
                        const filePath = join(dir, entry.name);
                        const fileContent = await readFile(filePath, 'utf-8');
                        const parsed = parseFrontmatter(fileContent);
                        if (parsed.description) {
                            command.description = parsed.description;
                        }
                        command.content = parsed.content;
                    } catch {
                        // Failed to read file, keep default description
                    }
                }

                return command;
            })
        );

        // Filter nulls and sort alphabetically
        return commands
            .filter((cmd): cmd is SlashCommand => cmd !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // Directory doesn't exist or not accessible - return empty array
        return [];
    }
}

/**
 * List all available slash commands for an agent type.
 * Returns built-in commands plus user-defined commands.
 */
export async function listSlashCommands(agent: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? [];
    const user = await scanUserCommands(agent);

    // Combine: built-in first, then user commands
    return [...builtin, ...user];
}
