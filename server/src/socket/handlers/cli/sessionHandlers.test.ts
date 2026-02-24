import { describe, expect, it } from 'bun:test'
import { Store } from '../../../store'
import { registerSessionHandlers } from './sessionHandlers'
import { handleMessageHistoryModification } from '../../../sync/messageHistoryHandlers'
import type { SyncEvent } from '../../../sync/syncEngine'

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

type EmittedEvent = { event: string; data: unknown }

class FakeSocket {
    readonly emitted: EmittedEvent[] = []
    readonly webappEvents: SyncEvent[] = []
    private readonly handlers = new Map<string, (...args: unknown[]) => void>()
    private readonly rooms = new Map<string, FakeSocket>()

    on(event: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(event, handler)
        return this
    }

    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }

    to(_room: string): this {
        return this
    }

    trigger(event: string, data?: unknown): void {
        const handler = this.handlers.get(event)
        if (!handler) return
        handler(data)
    }

    triggerWithAck(event: string, data: unknown, cb: (result: unknown) => void): void {
        const handler = this.handlers.get(event)
        if (!handler) return
        handler(data, cb)
    }

    join(_room: string): void {}
}

function lastEmitted(socket: FakeSocket, event: string): unknown | undefined {
    const found = [...socket.emitted].reverse().find((e) => e.event === event)
    return found?.data
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStore(): Store {
    return new Store(':memory:')
}

function createSession(store: Store, agentState: unknown = null) {
    return store.sessions.getOrCreateSession(null, null, agentState, 'default')
}

function createHarness(agentState: unknown = null) {
    const store = createStore()
    const session = createSession(store, agentState)
    const socket = new FakeSocket()
    const webappEvents: SyncEvent[] = []

    registerSessionHandlers(socket as unknown as Parameters<typeof registerSessionHandlers>[0], {
        store,
        resolveSessionAccess: (sid) => {
            const s = store.sessions.getSession(sid)
            return s ? { ok: true, value: s } : { ok: false, reason: 'not-found' as const }
        },
        emitAccessError: () => {},
        onWebappEvent: (event) => webappEvents.push(event),
    })

    return { store, session, socket, webappEvents }
}

// Wrap a raw SDK message the same way the CLI forwards it over the socket
function cliMessage(sid: string, data: unknown) {
    return { sid, message: data, localId: undefined }
}

function microcompactMessage(sid: string) {
    return cliMessage(sid, {
        type: 'output',
        data: { type: 'system', subtype: 'microcompact_boundary' }
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionHandlers — microcompact_boundary', () => {
    it('does NOT wipe agentState when microcompact_boundary arrives', () => {
        const existingAgentState = {
            requests: {},
            completedRequests: {
                'toolu_abc': { tool: 'Bash', status: 'approved' }
            }
        }
        const { store, session, socket } = createHarness(existingAgentState)

        socket.trigger('message', microcompactMessage(session.id))

        const updated = store.sessions.getSession(session.id)
        // agentState must be untouched — cleanup is the CLI's responsibility
        expect(updated?.agentState).toEqual(existingAgentState)
    })

    it('stores the microcompact_boundary message in the message log', () => {
        const { store, session, socket } = createHarness()

        socket.trigger('message', microcompactMessage(session.id))

        const messages = store.messages.getMessages(session.id)
        expect(messages.length).toBe(1)
        expect((messages[0].content as { type: string }).type).toBe('output')
    })
})

describe('sessionHandlers — update-state (CLI clears tool call state after compaction)', () => {
    it('clears completedRequests when CLI sends update-state with empty objects', () => {
        const staleAgentState = {
            controlledByUser: false,
            requests: {},
            completedRequests: {
                'toolu_001': { tool: 'Bash', status: 'approved' },
                'toolu_002': { tool: 'Read', status: 'approved' },
            }
        }
        const { store, session, socket } = createHarness(staleAgentState)

        // Simulate what the CLI does after observing microcompact_boundary:
        // it calls updateAgentState((state) => ({ ...state, requests: {}, completedRequests: {} }))
        // which emits 'update-state' with the cleared state.
        const clearedState = { controlledByUser: false, requests: {}, completedRequests: {} }
        const currentVersion = store.sessions.getSession(session.id)!.agentStateVersion

        let ackResult: unknown
        socket.triggerWithAck('update-state', {
            sid: session.id,
            agentState: clearedState,
            expectedVersion: currentVersion
        }, (result) => { ackResult = result })

        expect((ackResult as { result: string }).result).toBe('success')

        const updated = store.sessions.getSession(session.id)
        expect(updated?.agentState).toEqual(clearedState)
        expect((updated?.agentState as { completedRequests: unknown })?.completedRequests).toEqual({})
    })

    it('emits session-updated webapp event after a successful update-state', () => {
        const { store, session, socket, webappEvents } = createHarness()

        const currentVersion = store.sessions.getSession(session.id)!.agentStateVersion
        socket.triggerWithAck('update-state', {
            sid: session.id,
            agentState: { requests: {}, completedRequests: {} },
            expectedVersion: currentVersion
        }, () => {})

        const sessionUpdated = webappEvents.find((e) => e.type === 'session-updated')
        expect(sessionUpdated).toBeDefined()
    })

    it('rejects update-state with stale version and returns current version', () => {
        const { store, session, socket } = createHarness({ controlledByUser: false })

        // First update succeeds, bumping the version
        const v0 = store.sessions.getSession(session.id)!.agentStateVersion
        socket.triggerWithAck('update-state', {
            sid: session.id,
            agentState: { controlledByUser: true },
            expectedVersion: v0
        }, () => {})

        // Second update with the stale version should be rejected
        let ackResult: unknown
        socket.triggerWithAck('update-state', {
            sid: session.id,
            agentState: { controlledByUser: false },
            expectedVersion: v0   // stale — server already incremented
        }, (result) => { ackResult = result })

        expect((ackResult as { result: string }).result).toBe('version-mismatch')
    })
})

describe('sessionHandlers — microcompact_boundary records boundary and emits session-updated', () => {
    it('records compactionBoundarySeq on the session', () => {
        const { store, session, socket } = createHarness()

        socket.trigger('message', microcompactMessage(session.id))

        const updated = store.sessions.getSession(session.id)
        expect(updated?.compactionBoundarySeq).toBeNumber()
        expect(updated?.compactionBoundarySeq).toBeGreaterThan(0)
    })

    it('emits a session-updated webapp event so clients reload session data', () => {
        const { session, socket, webappEvents } = createHarness()

        socket.trigger('message', microcompactMessage(session.id))

        const sessionUpdated = webappEvents.find((e) => e.type === 'session-updated')
        expect(sessionUpdated).toBeDefined()
        expect(sessionUpdated?.sessionId).toBe(session.id)
    })
})

describe('sessionHandlers — hasMoreBeforeBoundary edge cases', () => {
    it('is false when the boundary message is the only message in the session', () => {
        // The boundary message (seq=1) is stored; compactionBoundarySeq=1.
        // hasMessagesBeforeSeq uses seq < 1, which matches nothing => false.
        const { store, session, socket } = createHarness()

        socket.trigger('message', microcompactMessage(session.id))

        const updated = store.sessions.getSession(session.id)
        const boundarySeq = updated?.compactionBoundarySeq
        expect(boundarySeq).toBeNumber()

        // hasMessagesBeforeSeq should return false — no messages before the boundary
        expect(store.messages.hasMessagesBeforeSeq(session.id, boundarySeq!)).toBe(false)
    })

    it('is true when messages exist before the boundary', () => {
        const { store, session, socket } = createHarness()

        // Post a regular message first, then compact
        socket.trigger('message', cliMessage(session.id, { type: 'output', data: { type: 'text', text: 'hello' } }))
        socket.trigger('message', microcompactMessage(session.id))

        const updated = store.sessions.getSession(session.id)
        const boundarySeq = updated?.compactionBoundarySeq
        expect(boundarySeq).toBeNumber()

        // The earlier message has seq < boundarySeq
        expect(store.messages.hasMessagesBeforeSeq(session.id, boundarySeq!)).toBe(true)
    })
})

describe('sessionHandlers — malformed payloads are rejected gracefully', () => {
    it('ignores a message event with no sid field', () => {
        const { store, session, socket } = createHarness()
        const before = store.messages.getMessages(session.id).length

        // Payload missing the required `sid` field
        socket.trigger('message', { message: { type: 'output', data: {} }, localId: undefined })

        expect(store.messages.getMessages(session.id).length).toBe(before)
    })

    it('ignores a message event with a non-string sid', () => {
        const { store, session, socket } = createHarness()
        const before = store.messages.getMessages(session.id).length

        socket.trigger('message', { sid: 42, message: { type: 'output', data: {} } })

        expect(store.messages.getMessages(session.id).length).toBe(before)
    })

    it('returns error for update-state with missing sid', () => {
        const { socket } = createHarness()

        let ackResult: unknown
        socket.triggerWithAck('update-state', {
            agentState: { requests: {}, completedRequests: {} },
            expectedVersion: 1
            // sid missing
        }, (result) => { ackResult = result })

        expect((ackResult as { result: string }).result).toBe('error')
    })

    it('returns error for update-state with non-integer expectedVersion', () => {
        const { store, session, socket } = createHarness()
        const v = store.sessions.getSession(session.id)!.agentStateVersion

        let ackResult: unknown
        socket.triggerWithAck('update-state', {
            sid: session.id,
            agentState: { requests: {}, completedRequests: {} },
            expectedVersion: 'not-a-number'
        }, (result) => { ackResult = result })

        expect((ackResult as { result: string }).result).toBe('error')
    })

    it('returns error for update-state targeting an unknown session', () => {
        const { socket } = createHarness()

        let ackResult: unknown
        socket.triggerWithAck('update-state', {
            sid: 'does-not-exist',
            agentState: { requests: {}, completedRequests: {} },
            expectedVersion: 1
        }, (result) => { ackResult = result })

        expect((ackResult as { result: string }).result).toBe('error')
    })
})

describe('handleMessageHistoryModification — agentState null-clear (store level)', () => {
    // These tests cover the core operation that archiveSession and deleteSession
    // rely on: handleMessageHistoryModification sets agentState to null in the store.

    it('clears agentState to null when session has populated completedRequests', () => {
        const store = createStore()
        const session = createSession(store, {
            requests: {},
            completedRequests: {
                'toolu_abc': { tool: 'Bash', status: 'approved' },
                'toolu_xyz': { tool: 'Read', status: 'denied' },
            }
        })

        const fresh = store.sessions.getSession(session.id)!
        const result = handleMessageHistoryModification(store, session.id, fresh, 'other')

        expect(result.success).toBe(true)
        expect(store.sessions.getSession(session.id)!.agentState).toBeNull()
    })

    it('succeeds and leaves agentState null when it was already null', () => {
        const store = createStore()
        const session = createSession(store, null)

        const fresh = store.sessions.getSession(session.id)!
        const result = handleMessageHistoryModification(store, session.id, fresh, 'clear')

        expect(result.success).toBe(true)
        expect(store.sessions.getSession(session.id)!.agentState).toBeNull()
    })
})
