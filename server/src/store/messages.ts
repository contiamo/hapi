import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type { StoredMessage } from './types'
import { safeJsonParse } from './json'

type DbMessageRow = {
    id: string
    session_id: string
    content: string
    created_at: number
    seq: number
    local_id: string | null
}

function toStoredMessage(row: DbMessageRow): StoredMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        content: safeJsonParse(row.content),
        createdAt: row.created_at,
        seq: row.seq,
        localId: row.local_id
    }
}

export function addMessage(
    db: Database,
    sessionId: string,
    content: unknown,
    localId?: string
): StoredMessage {
    const now = Date.now()

    if (localId) {
        const existing = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND local_id = ? LIMIT 1'
        ).get(sessionId, localId) as DbMessageRow | undefined
        if (existing) {
            return toStoredMessage(existing)
        }
    }

    const msgSeqRow = db.prepare(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM messages WHERE session_id = ?'
    ).get(sessionId) as { nextSeq: number }
    const msgSeq = msgSeqRow.nextSeq

    const id = randomUUID()
    const json = JSON.stringify(content)

    db.prepare(`
        INSERT INTO messages (
            id, session_id, content, created_at, seq, local_id
        ) VALUES (
            @id, @session_id, @content, @created_at, @seq, @local_id
        )
    `).run({
        id,
        session_id: sessionId,
        content: json,
        created_at: now,
        seq: msgSeq,
        local_id: localId ?? null
    })

    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessageRow | undefined
    if (!row) {
        throw new Error('Failed to create message')
    }
    return toStoredMessage(row)
}

export function getMessages(
    db: Database,
    sessionId: string,
    limit: number = 200,
    beforeSeq?: number,
    afterSeq?: number
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
    const hasBefore = beforeSeq !== undefined && beforeSeq !== null && Number.isFinite(beforeSeq)
    const hasAfter = afterSeq !== undefined && afterSeq !== null && Number.isFinite(afterSeq)

    let rows: DbMessageRow[]
    if (hasBefore && hasAfter) {
        rows = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND seq > ? AND seq < ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, afterSeq, beforeSeq, safeLimit) as DbMessageRow[]
    } else if (hasBefore) {
        rows = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, beforeSeq, safeLimit) as DbMessageRow[]
    } else if (hasAfter) {
        rows = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? AND seq > ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, afterSeq, safeLimit) as DbMessageRow[]
    } else {
        rows = db.prepare(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?'
        ).all(sessionId, safeLimit) as DbMessageRow[]
    }

    return rows.reverse().map(toStoredMessage)
}

export function hasMessagesAtOrBeforeSeq(db: Database, sessionId: string, seq: number): boolean {
    const row = db.prepare(
        'SELECT 1 FROM messages WHERE session_id = ? AND seq <= ? LIMIT 1'
    ).get(sessionId, seq)
    return row !== undefined
}

export function getMessagesAfter(
    db: Database,
    sessionId: string,
    afterSeq: number,
    limit: number = 200
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
    const safeAfterSeq = Number.isFinite(afterSeq) ? afterSeq : 0

    const rows = db.prepare(
        'SELECT * FROM messages WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
    ).all(sessionId, safeAfterSeq, safeLimit) as DbMessageRow[]

    return rows.map(toStoredMessage)
}

export function deleteAllMessages(
    db: Database,
    sessionId: string
): number {
    const result = db.prepare(
        'DELETE FROM messages WHERE session_id = ?'
    ).run(sessionId)
    return result.changes
}
