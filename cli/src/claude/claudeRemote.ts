import { EnhancedMode } from "./loop";
import { query, type QueryOptions as Options, type SDKMessage, AbortError, type SDKUserMessage } from '@/claude/sdk'
import { claudeCheckSession } from "./utils/claudeCheckSession";
import { join } from 'node:path';
import { parseSpecialCommand } from "@/parsers/specialCommands";
import { logger } from "@/lib";
import { PushableAsyncIterable } from "@/utils/PushableAsyncIterable";
import { getProjectPath } from "./utils/path";
import { awaitFileExist } from "@/modules/watcher/awaitFileExist";
import { systemPrompt } from "./utils/systemPrompt";
import type { CanUseTool, McpServerConfig, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { getHapiBlobsDir } from "@/constants/uploadPaths";
import { rollbackSession, CORRUPTION_ERRORS } from "./utils/repairSession";

/** CanUseTool extended with HAPI's EnhancedMode context. */
export type CanCallTool = (
    toolName: string,
    input: Record<string, unknown>,
    mode: EnhancedMode,
    options: Parameters<CanUseTool>[2]
) => Promise<PermissionResult>;

export interface ClaudeRemoteOptions {
    // Fixed parameters
    sessionId: string | null;
    path: string;
    mcpServers?: Record<string, McpServerConfig>;
    claudeEnvVars?: Record<string, string>;
    claudeArgs?: string[];
    allowedTools: string[];
    hookSettingsPath: string;
    signal?: AbortSignal;
    canCallTool: CanCallTool;

    // Dynamic parameters
    nextMessage: () => Promise<{ message: string; mode: EnhancedMode } | null>;
    onReady: () => void;
    isAborted: (toolCallId: string) => boolean;

    // Callbacks
    onSessionFound: (id: string) => void;
    onThinkingChange?: (thinking: boolean) => void;
    onMessage: (message: SDKMessage) => void;
    onCompletionEvent?: (message: string) => void;
    onSessionReset?: () => void;
}

export async function claudeRemote(opts: ClaudeRemoteOptions) {

    // Check if session is valid
    let startFrom = opts.sessionId;
    if (opts.sessionId && !claudeCheckSession(opts.sessionId, opts.path)) {
        startFrom = null;
    }
    
    // Extract --resume from claudeArgs if present (for first spawn)
    if (!startFrom && opts.claudeArgs) {
        for (let i = 0; i < opts.claudeArgs.length; i++) {
            if (opts.claudeArgs[i] === '--resume') {
                // Check if next arg exists and looks like a session ID
                if (i + 1 < opts.claudeArgs.length) {
                    const nextArg = opts.claudeArgs[i + 1];
                    // If next arg doesn't start with dash and contains dashes, it's likely a UUID
                    if (!nextArg.startsWith('-') && nextArg.includes('-')) {
                        startFrom = nextArg;
                        logger.debug(`[claudeRemote] Found --resume with session ID: ${startFrom}`);
                        break;
                    } else {
                        // Just --resume without UUID - SDK doesn't support this
                        logger.debug('[claudeRemote] Found --resume without session ID - not supported in remote mode');
                        break;
                    }
                } else {
                    // --resume at end of args - SDK doesn't support this
                    logger.debug('[claudeRemote] Found --resume without session ID - not supported in remote mode');
                    break;
                }
            }
        }
    }

    // Set environment variables for Claude Code SDK
    if (opts.claudeEnvVars) {
        Object.entries(opts.claudeEnvVars).forEach(([key, value]) => {
            process.env[key] = value;
        });
    }
    process.env.DISABLE_AUTOUPDATER = '1';

    // Get initial message
    const initial = await opts.nextMessage();
    if (!initial) { // No initial message - exit
        return;
    }

    // Handle special commands
    const specialCommand = parseSpecialCommand(initial.message);

    // Handle /clear command
    // Note: onReady() is intentionally NOT called here. /clear triggers onSessionReset()
    // which causes the launcher loop to start a fresh session. The ready event will come
    // from the new session once it processes its first real message.
    if (specialCommand.type === 'clear') {
        if (opts.onCompletionEvent) {
            opts.onCompletionEvent('Context was reset');
        }
        if (opts.onSessionReset) {
            opts.onSessionReset();
        }
        return;
    }

    // Handle /rollback [N] command — invalid args return an error, valid args truncate the session
    if (specialCommand.type === 'rollback_invalid') {
        opts.onCompletionEvent?.(`/rollback: invalid argument "${specialCommand.raw}" — usage: /rollback [N] where N is a positive integer`);
        opts.onReady();
        return;
    }
    if (specialCommand.type === 'rollback') {
        const result = rollbackSession(opts.path, opts.sessionId, specialCommand.turns);
        if (result.truncated) {
            const preview = result.removedText ? ` Removed: "${result.removedText.slice(0, 120)}"` : '';
            const label = result.turnsRemoved === 1 ? 'turn' : 'turns';
            opts.onCompletionEvent?.(`Rolled back ${result.turnsRemoved} ${label}.${preview}`);
        } else {
            opts.onCompletionEvent?.('Nothing to roll back.');
        }
        opts.onReady();
        return;
    }

    // Handle /compact command
    let isCompactCommand = false;
    if (specialCommand.type === 'compact') {
        logger.debug('[claudeRemote] /compact command detected - will process as normal but with compaction behavior');
        isCompactCommand = true;
        if (opts.onCompletionEvent) {
            opts.onCompletionEvent('Compaction started');
        }
    }

    // Prepare SDK options
    let mode = initial.mode;
    const sdkOptions: Options = {
        cwd: opts.path,
        resume: startFrom ?? undefined,
        mcpServers: opts.mcpServers,
        permissionMode: initial.mode.permissionMode,
        model: initial.mode.model,
        fallbackModel: initial.mode.fallbackModel,
        customSystemPrompt: initial.mode.customSystemPrompt ? initial.mode.customSystemPrompt + '\n\n' + systemPrompt : undefined,
        appendSystemPrompt: initial.mode.appendSystemPrompt ? initial.mode.appendSystemPrompt + '\n\n' + systemPrompt : systemPrompt,
        allowedTools: initial.mode.allowedTools ? initial.mode.allowedTools.concat(opts.allowedTools) : opts.allowedTools,
        disallowedTools: initial.mode.disallowedTools,
        canUseTool: (toolName: string, input: Record<string, unknown>, options) => opts.canCallTool(toolName, input, mode, options),
        abort: opts.signal,
        pathToClaudeCodeExecutable: 'claude',
        settingsPath: opts.hookSettingsPath,
        additionalDirectories: [getHapiBlobsDir()],
    }

    // Track thinking state
    let thinking = false;
    const updateThinking = (newThinking: boolean) => {
        if (thinking !== newThinking) {
            thinking = newThinking;
            logger.debug(`[claudeRemote] Thinking state changed to: ${thinking}`);
            if (opts.onThinkingChange) {
                opts.onThinkingChange(thinking);
            }
        }
    };

    // Push initial message.
    // SDKUserMessage requires parent_tool_use_id and session_id, which are output-direction
    // metadata the SDK subprocess ignores on received input — null and '' are safe placeholders.
    let messages = new PushableAsyncIterable<SDKUserMessage>();
    messages.push({
        type: 'user',
        message: { role: 'user', content: initial.message },
        parent_tool_use_id: null,
        session_id: '',
    });

    // Start the loop
    const response = query({
        prompt: messages,
        options: sdkOptions,
    });

    updateThinking(true);
    try {
        logger.debug(`[claudeRemote] Starting to iterate over response`);

        for await (const message of response) {
            logger.debugLargeJson(`[claudeRemote] Message ${message.type}`, message);

            // Handle messages
            opts.onMessage(message);

            // Handle special system messages
            if (message.type === 'system' && message.subtype === 'init') {
                // Start thinking when session initializes
                updateThinking(true);

                // Session id is still in memory, wait until session file is written to disk
                // Start a watcher for to detect the session id
                if (message.session_id) {
                    logger.debug(`[claudeRemote] Waiting for session file to be written to disk: ${message.session_id}`);
                    const projectDir = getProjectPath(opts.path);
                    const found = await awaitFileExist(join(projectDir, `${message.session_id}.jsonl`));
                    logger.debug(`[claudeRemote] Session file found: ${message.session_id} ${found}`);
                    opts.onSessionFound(message.session_id);
                }
            }

            // Handle result messages
            if (message.type === 'result') {
                updateThinking(false);
                logger.debug('[claudeRemote] Result received, exiting claudeRemote');

                // Send completion messages
                if (isCompactCommand) {
                    logger.debug('[claudeRemote] Compaction completed');
                    if (opts.onCompletionEvent) {
                        opts.onCompletionEvent('Compaction completed');
                    }
                    isCompactCommand = false;
                }

                // Send ready event
                opts.onReady();

                // If the session is corrupted, exit cleanly without calling nextMessage().
                // Feeding another message into the same broken session would trigger
                // the same 400 error again immediately.
                if (
                    message.subtype === 'success' &&
                    message.is_error &&
                    typeof message.result === 'string' &&
                    CORRUPTION_ERRORS.some((e) => (message.result as string).includes(e))
                ) {
                    logger.warn('[claudeRemote] Corrupted session detected, exiting early');
                    messages.end();
                    return;
                }

                // Push next message
                const next = await opts.nextMessage();
                if (!next) {
                    messages.end();
                    return;
                }
                mode = next.mode;
                messages.push({ type: 'user', message: { role: 'user', content: next.message }, parent_tool_use_id: null, session_id: '' });
            }

            // Handle tool result
            if (message.type === 'user') {
                if (message.message.role === 'user' && Array.isArray(message.message.content)) {
                    for (const c of message.message.content) {
                        if (c.type === 'tool_result' && c.tool_use_id && opts.isAborted(c.tool_use_id)) {
                            logger.debug('[claudeRemote] Tool aborted, exiting claudeRemote');
                            return;
                        }
                    }
                }
            }
        }
    } catch (e) {
        if (e instanceof AbortError) {
            logger.debug(`[claudeRemote] Aborted`);
            // Ignore
        } else {
            throw e;
        }
    } finally {
        updateThinking(false);
    }
}
