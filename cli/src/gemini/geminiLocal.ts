import { logger } from '@/ui/logger';
import { restoreTerminalState } from '@/ui/terminalState';
import { spawnWithAbort } from '@/utils/spawnWithAbort';

export async function geminiLocal(opts: {
    path: string;
    sessionId: string | null;
    resumeSessionId?: string | null;
    abort: AbortSignal;
    model?: string;
    approvalMode?: string;
    allowedTools?: string[];
    hookSettingsPath?: string;
}): Promise<void> {
    const args: string[] = [];

    // Use resumeSessionId if provided, otherwise fall back to sessionId
    const sessionToResume = opts.resumeSessionId || opts.sessionId;
    if (sessionToResume) {
        args.push('--resume', sessionToResume);
    }
    if (opts.model) {
        args.push('--model', opts.model);
    }
    if (opts.approvalMode) {
        args.push('--approval-mode', opts.approvalMode);
    }
    if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push('--allowed-tools', ...opts.allowedTools);
    }

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        GEMINI_PROJECT_DIR: opts.path
    };
    if (opts.hookSettingsPath) {
        env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = opts.hookSettingsPath;
    }

    logger.debug(`[GeminiLocal] Spawning gemini with args: ${JSON.stringify(args)}`);

    process.stdin.pause();
    try {
        await spawnWithAbort({
            command: 'gemini',
            args,
            cwd: opts.path,
            env,
            signal: opts.abort,
            shell: process.platform === 'win32',
            logLabel: 'GeminiLocal',
            spawnName: 'gemini',
            installHint: 'Gemini CLI',
            includeCause: true,
            logExit: true
        });
    } finally {
        process.stdin.resume();
        restoreTerminalState();
    }
}
