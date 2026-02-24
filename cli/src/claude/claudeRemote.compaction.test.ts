/**
 * Tests that claudeRemote correctly calls onCompact after a user-triggered
 * /compact command completes, so the CLI can clear stale completedRequests.
 * Also tests that onMessage is forwarded for microcompact_boundary messages,
 * so claudeRemoteLauncher can react to them.
 *
 * See docs/planning/STRAY_TOOL_CALLS.md for context.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the SDK query function so we don't spawn a real Claude process.
// ---------------------------------------------------------------------------

vi.mock('@/claude/sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/claude/sdk')>()
    return {
        ...actual,
        query: vi.fn(),
    }
})

// Mock modules that claudeRemote imports but aren't relevant to this test
vi.mock('./utils/claudeCheckSession', () => ({ claudeCheckSession: vi.fn(() => true) }))
vi.mock('./utils/path', () => ({ getProjectPath: vi.fn(() => '/tmp/test-project') }))
vi.mock('./utils/systemPrompt', () => ({ systemPrompt: vi.fn(() => 'system prompt') }))
vi.mock('@/modules/watcher/awaitFileExist', () => ({ awaitFileExist: vi.fn(() => true) }))
vi.mock('@/lib', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), debugLargeJson: vi.fn() } }))
vi.mock('@/constants/uploadPaths', () => ({ getHapiBlobsDir: vi.fn(() => '/tmp/blobs') }))
vi.mock('./utils/repairSession', () => ({
    rollbackSession: vi.fn(),
    CORRUPTION_ERRORS: [],
}))

import { query } from '@/claude/sdk'
import { claudeRemote } from './claudeRemote'
import type { SDKMessage } from '@/claude/sdk'
import type { Query } from '@/claude/sdk/query'

// ---------------------------------------------------------------------------
// Helpers to create async iterables that yield specific SDK messages
// ---------------------------------------------------------------------------

async function* makeStream(messages: SDKMessage[]): AsyncIterable<SDKMessage> {
    for (const msg of messages) {
        yield msg
    }
}

// Cast helper: query is fully mocked so we only need AsyncIterable at runtime.
function asQuery(iter: AsyncIterable<SDKMessage>): Query {
    return iter as unknown as Query
}

const systemInitMessage: SDKMessage = {
    type: 'system',
    subtype: 'init',
    session_id: 'test-session-id',
} as SDKMessage

const resultSuccessMessage: SDKMessage = {
    type: 'result',
    subtype: 'success',
    result: 'done',
    num_turns: 1,
} as SDKMessage

const microcompactBoundaryMessage: SDKMessage = {
    type: 'system',
    subtype: 'microcompact_boundary',
} as SDKMessage

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claudeRemote — onCompact callback', () => {
    beforeEach(() => {
        vi.mocked(query).mockReset()
    })

    it('does not call onCompact when no message is queued (nextMessage returns null immediately)', async () => {
        vi.mocked(query).mockReturnValue(asQuery(makeStream([resultSuccessMessage])))

        const onCompact = vi.fn()

        await claudeRemote({
            sessionId: null,
            path: '/tmp/test',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook',
            signal: AbortSignal.timeout(5000),
            canCallTool: vi.fn().mockResolvedValue({ outcome: 'approved' }),
            nextMessage: vi.fn().mockResolvedValue(null),
            onReady: vi.fn(),
            isAborted: vi.fn().mockReturnValue(false),
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent: vi.fn(),
            onCompact,
        })

        expect(onCompact).not.toHaveBeenCalled()
    })

    it('calls onCompact exactly once when /compact result arrives', async () => {
        // To test the /compact path, we need claudeRemote to have set isCompactCommand=true.
        // claudeRemote sets this when parseSpecialCommand returns { type: 'compact' } for
        // the message it reads. We get that message from nextMessage → the queue.
        //
        // claudeRemote reads its first message from the `initial` parameter, which comes
        // from awaiting nextMessage(). So we mock nextMessage to return /compact first,
        // then null to end the loop.

        vi.mocked(query).mockReturnValue(asQuery(makeStream([resultSuccessMessage])))

        const onCompact = vi.fn()
        const onReady = vi.fn()
        const messagesSeen: unknown[] = []

        // nextMessage returns the /compact message on first call, then null
        const nextMessage = vi.fn()
            .mockResolvedValueOnce({ message: '/compact', mode: { permissionMode: 'default' } })
            .mockResolvedValue(null)

        await claudeRemote({
            sessionId: null,
            path: '/tmp/test',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook',
            signal: AbortSignal.timeout(5000),
            canCallTool: vi.fn().mockResolvedValue({ outcome: 'approved' }),
            nextMessage,
            onReady,
            isAborted: vi.fn().mockReturnValue(false),
            onSessionFound: vi.fn(),
            onMessage: (msg) => messagesSeen.push(msg),
            onCompletionEvent: vi.fn(),
            onCompact,
        })

        expect(onCompact).toHaveBeenCalledTimes(1)
    })

    it('does not call onCompact for a normal (non-compact) message result', async () => {
        vi.mocked(query).mockReturnValue(asQuery(makeStream([resultSuccessMessage])))

        const onCompact = vi.fn()
        const nextMessage = vi.fn()
            .mockResolvedValueOnce({ message: 'hello world', mode: { permissionMode: 'default' } })
            .mockResolvedValue(null)

        await claudeRemote({
            sessionId: null,
            path: '/tmp/test',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook',
            signal: AbortSignal.timeout(5000),
            canCallTool: vi.fn().mockResolvedValue({ outcome: 'approved' }),
            nextMessage,
            onReady: vi.fn(),
            isAborted: vi.fn().mockReturnValue(false),
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent: vi.fn(),
            onCompact,
        })

        expect(onCompact).not.toHaveBeenCalled()
    })
})

describe('claudeRemote — microcompact_boundary forwarded to onMessage', () => {
    beforeEach(() => {
        vi.mocked(query).mockReset()
    })

    it('calls onMessage with the microcompact_boundary system message when the SDK emits one', async () => {
        // The launcher's onMessage closure detects microcompact_boundary and clears
        // tool call state. This test verifies that claudeRemote forwards the message
        // so the launcher can act on it.
        vi.mocked(query).mockReturnValue(
            asQuery(makeStream([microcompactBoundaryMessage, resultSuccessMessage]))
        )

        const receivedMessages: SDKMessage[] = []
        const nextMessage = vi.fn()
            .mockResolvedValueOnce({ message: 'hello', mode: { permissionMode: 'default' } })
            .mockResolvedValue(null)

        await claudeRemote({
            sessionId: null,
            path: '/tmp/test',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook',
            signal: AbortSignal.timeout(5000),
            canCallTool: vi.fn().mockResolvedValue({ outcome: 'approved' }),
            nextMessage,
            onReady: vi.fn(),
            isAborted: vi.fn().mockReturnValue(false),
            onSessionFound: vi.fn(),
            onMessage: (msg) => receivedMessages.push(msg),
            onCompletionEvent: vi.fn(),
        })

        const microcompact = receivedMessages.find(
            (m) => m.type === 'system' && (m as { subtype?: string }).subtype === 'microcompact_boundary'
        )
        expect(microcompact).toBeDefined()
    })

    it('does not call onCompact when only a microcompact_boundary arrives (no /compact command)', async () => {
        // microcompact_boundary triggers launcher-level cleanup via onMessage,
        // NOT via the onCompact callback (which is only for user-triggered /compact).
        vi.mocked(query).mockReturnValue(
            asQuery(makeStream([microcompactBoundaryMessage, resultSuccessMessage]))
        )

        const onCompact = vi.fn()
        const nextMessage = vi.fn()
            .mockResolvedValueOnce({ message: 'hello', mode: { permissionMode: 'default' } })
            .mockResolvedValue(null)

        await claudeRemote({
            sessionId: null,
            path: '/tmp/test',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook',
            signal: AbortSignal.timeout(5000),
            canCallTool: vi.fn().mockResolvedValue({ outcome: 'approved' }),
            nextMessage,
            onReady: vi.fn(),
            isAborted: vi.fn().mockReturnValue(false),
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent: vi.fn(),
            onCompact,
        })

        expect(onCompact).not.toHaveBeenCalled()
    })
})
