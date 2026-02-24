import type { Store, StoredSession } from '../store'

export type MessageHistoryModificationReason = 'clear' | 'other'

export type MessageHistoryModificationResult =
    | { success: true }
    | { success: false; error: string }

/**
 * Handles message history modifications by clearing associated agentState.
 *
 * When messages are removed or modified, the agentState (which contains tool
 * call permissions and state) must be cleared to prevent "stray tool calls"
 * from appearing in the UI.
 *
 * This function should be called whenever:
 * - Messages are cleared via /clear command
 * - Any other operation that modifies message history (archive, delete)
 *
 * @param store - The data store
 * @param sessionId - ID of the session being modified
 * @param session - The session object (must be fresh from cache)
 * @param reason - Why the modification is happening (for logging)
 * @returns Result indicating success or failure
 */
export function handleMessageHistoryModification(
    store: Store,
    sessionId: string,
    session: StoredSession,
    reason: MessageHistoryModificationReason
): MessageHistoryModificationResult {
    // Capture agentState stats before clearing for audit trail.
    // completedRequests is a Record<string, ...> keyed by request ID (not an Array).
    const agentState = session.agentState as { completedRequests?: Record<string, unknown> } | null | undefined
    const completedRequests = agentState?.completedRequests ?? {}
    const requestIds = Object.keys(completedRequests)
    const firstTwo = requestIds.slice(0, 2)
    const lastTwo = requestIds.slice(-2)

    console.log('[messageHistory:audit]', {
        action: reason,
        sessionId,
        active: session.active,
        before: {
            agentStateExists: session.agentState !== null,
            completedRequestsCount: requestIds.length,
            firstRequests: firstTwo,
            lastRequests: requestIds.length > 2 ? lastTwo : [],
        },
        timestamp: Date.now()
    })

    // Safety check: warn if session is active (may cause tool execution issues)
    if (session.active) {
        console.warn(
            `[messageHistory] Clearing agentState while session is active. ` +
            `This may affect in-progress tool execution. SessionId: ${sessionId}`
        )
    }

    // Attempt to clear agentState
    const result = store.sessions.updateSessionAgentState(
        sessionId,
        null,
        session.agentStateVersion,
        session.namespace
    )

    if (result.result === 'success') {
        console.log('[messageHistory:audit]', {
            action: reason,
            sessionId,
            result: 'success',
            timestamp: Date.now()
        })
        return { success: true }
    }

    if (result.result === 'version-mismatch') {
        console.warn(
            `[messageHistory] Version mismatch when clearing agentState (expected ${session.agentStateVersion}, ` +
            `got ${result.version}). Retrying with updated version.`
        )

        // Retry once with the updated version
        const retryResult = store.sessions.updateSessionAgentState(
            sessionId,
            null,
            result.version,
            session.namespace
        )

        if (retryResult.result === 'success') {
            console.log('[messageHistory:audit]', {
                action: reason,
                sessionId,
                result: 'success-after-retry',
                timestamp: Date.now()
            })
            return { success: true }
        }

        const error = `Failed to clear agentState after version-mismatch retry: ${retryResult.result}`
        console.error('[messageHistory:audit]', {
            action: reason,
            sessionId,
            result: 'error',
            error,
            timestamp: Date.now()
        })
        return { success: false, error }
    }

    // Other error
    const error = `Failed to clear agentState: ${result.result}`
    console.error('[messageHistory:audit]', {
        action: reason,
        sessionId,
        result: 'error',
        error,
        timestamp: Date.now()
    })
    return { success: false, error }
}
