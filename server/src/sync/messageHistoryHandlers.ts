import type { Store, StoredSession } from '../store'

export type MessageHistoryModificationReason = 'clear' | 'microcompact' | 'other'

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
 * - Microcompact event removes/compacts messages
 * - Any other operation that modifies message history
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
    console.log(`[messageHistory] Clearing agentState for session ${sessionId} (reason: ${reason})`)

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
        console.log(`[messageHistory] Successfully cleared agentState for session ${sessionId}`)
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
            console.log(`[messageHistory] Successfully cleared agentState on retry for session ${sessionId}`)
            return { success: true }
        }

        const error = `Failed to clear agentState after version-mismatch retry: ${retryResult.result}`
        console.error(`[messageHistory] ${error}`)
        return { success: false, error }
    }

    // Other error
    const error = `Failed to clear agentState: ${result.result}`
    console.error(`[messageHistory] ${error}`)
    return { success: false, error }
}
