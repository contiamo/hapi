const DRAFTS_KEY = 'hapi-drafts'
const MAX_DRAFT_LENGTH = 10000 // 10KB sanity limit

export type DraftData = {
    text: string
    timestamp: number
}

type DraftsMap = Record<string, DraftData> // sessionId -> DraftData

function safeParseJson(value: string): unknown {
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

function getAllDraftsInternal(): DraftsMap {
    if (typeof window === 'undefined') return {}
    try {
        const raw = localStorage.getItem(DRAFTS_KEY)
        if (!raw) return {}
        const parsed = safeParseJson(raw)
        if (!parsed || typeof parsed !== 'object') return {}

        const record = parsed as Record<string, unknown>
        const result: DraftsMap = {}
        for (const [key, value] of Object.entries(record)) {
            if (typeof key !== 'string' || key.trim().length === 0) continue
            if (!value || typeof value !== 'object') continue

            const draft = value as Record<string, unknown>
            if (typeof draft.text !== 'string') continue
            if (typeof draft.timestamp !== 'number' || !Number.isFinite(draft.timestamp)) continue

            result[key] = {
                text: draft.text,
                timestamp: draft.timestamp
            }
        }
        return result
    } catch {
        return {}
    }
}

function saveDraftsMap(drafts: DraftsMap): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
    } catch {
        // Ignore storage errors (quota exceeded, etc.)
    }
}

/**
 * Get draft text for a session (Phase 1 compatibility)
 */
export function getDraft(sessionId: string): string | null {
    const data = getDraftWithTimestamp(sessionId)
    return data?.text ?? null
}

/**
 * Get full draft data with timestamp (for Phase 2 merge logic)
 */
export function getDraftWithTimestamp(sessionId: string): DraftData | null {
    if (!sessionId) return null
    const drafts = getAllDraftsInternal()
    return drafts[sessionId] ?? null
}

/**
 * Save draft for a session
 */
export function saveDraft(sessionId: string, text: string, timestamp?: number): void {
    if (!sessionId) return
    if (typeof window === 'undefined') return

    const trimmed = text.trim()
    if (!trimmed) {
        // Empty draft - remove it
        clearDraft(sessionId)
        return
    }

    try {
        const drafts = getAllDraftsInternal()

        // Truncate if exceeds max length
        const finalText = trimmed.length > MAX_DRAFT_LENGTH ? trimmed.slice(0, MAX_DRAFT_LENGTH) : trimmed

        drafts[sessionId] = {
            text: finalText,
            timestamp: timestamp ?? Date.now()
        }

        saveDraftsMap(drafts)
    } catch {
        // Ignore storage errors
    }
}

/**
 * Clear draft for a session
 */
export function clearDraft(sessionId: string): void {
    if (!sessionId) return
    if (typeof window === 'undefined') return

    try {
        const drafts = getAllDraftsInternal()
        delete drafts[sessionId]
        saveDraftsMap(drafts)
    } catch {
        // Ignore storage errors
    }
}

/**
 * Get all drafts (for debugging)
 */
export function getAllDrafts(): DraftsMap {
    return getAllDraftsInternal()
}

/**
 * Merge drafts using last-write-wins (for Phase 2)
 */
export function mergeDrafts(local: DraftData | null, remote: DraftData | null): DraftData | null {
    if (!local) return remote
    if (!remote) return local
    // Last-write-wins by timestamp
    return local.timestamp > remote.timestamp ? local : remote
}
