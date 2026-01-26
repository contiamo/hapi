import type { SyncEvent } from '@hapi/protocol/types'
import type { SSEManager } from '../sse/sseManager'
import { logger } from '../lib/logger'

export type SyncEventListener = (event: SyncEvent) => void

export class EventPublisher {
    private readonly listeners: Set<SyncEventListener> = new Set()

    constructor(
        private readonly sseManager: SSEManager,
        private readonly resolveNamespace: (event: SyncEvent) => string | undefined
    ) {
    }

    subscribe(listener: SyncEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit(event: SyncEvent): void {
        const namespace = this.resolveNamespace(event)
        const enrichedEvent = namespace ? { ...event, namespace } : event

        for (const listener of this.listeners) {
            try {
                listener(enrichedEvent)
            } catch (error) {
                logger.error({ component: 'EventPublisher', error }, 'Listener error')
            }
        }

        this.sseManager.broadcast(enrichedEvent)
    }
}
