import type { Database } from 'bun:sqlite'

import type { StoredMessage } from './types'
import { addMessage, deleteAllMessages, getMessages, getMessagesAfter, hasMessagesBeforeSeq } from './messages'

export class MessageStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    addMessage(sessionId: string, content: unknown, localId?: string): StoredMessage {
        return addMessage(this.db, sessionId, content, localId)
    }

    getMessages(sessionId: string, limit: number = 200, beforeSeq?: number, afterSeq?: number): StoredMessage[] {
        return getMessages(this.db, sessionId, limit, beforeSeq, afterSeq)
    }

    getMessagesAfter(sessionId: string, afterSeq: number, limit: number = 200): StoredMessage[] {
        return getMessagesAfter(this.db, sessionId, afterSeq, limit)
    }

    hasMessagesBeforeSeq(sessionId: string, seq: number): boolean {
        return hasMessagesBeforeSeq(this.db, sessionId, seq)
    }

    deleteAllMessages(sessionId: string): number {
        return deleteAllMessages(this.db, sessionId)
    }
}
