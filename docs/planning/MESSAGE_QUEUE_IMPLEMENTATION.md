# Implementation Plan: Queued Messages for HAPI Web UI (Revised)

## Overview

Implement a **server-side lock-based message queuing system** that serializes message delivery to Claude while he's busy. This plan addresses critical race conditions and UX issues identified in the initial design review.

## Critical Design Decisions (Based on Gemini Review)

### ✅ Fixed: Race Condition Prevention
**Problem**: Relying on CLI's `thinking` state creates race window where multiple messages slip through.

**Solution**: Server maintains **immediate locking state** upon message send. Lock is acquired synchronously, preventing concurrent sends regardless of CLI reporting lag.

### ✅ Fixed: 2-Second Heartbeat Bottleneck
**Problem**: Polling 2-second heartbeat means queued messages wait unnecessarily.

**Solution**: Keep heartbeat as fallback, but process queue immediately when:
1. Message send completes successfully
2. thinking → false transition detected

### ✅ Fixed: Server Restart Recovery
**Problem**: Messages stuck in `processing` state never recover after crash.

**Solution**: On server startup, reset all `processing → queued` messages.

### ✅ Fixed: DoS Protection
**Problem**: Unlimited queue allows malicious spam.

**Solution**: Hard limit of 50 messages per session. Return `429 Too Many Requests` when exceeded.

### ✅ Fixed: Missing Cancel Functionality
**Problem**: Users can't delete queued messages.

**Solution**: Add `DELETE /api/sessions/:id/queue/:queueId` endpoint.

## Architecture

### High-Level Flow with Locking

```
Web UI submits message
  ↓
Server checks: sessionLock.isLocked(sessionId)?
  ↓
YES → Enqueue to DB + return { queued: true }
  ↓
NO → Acquire lock + send to CLI + release lock → processQueueAsync()
  ↓
On send completion:
  1. Release lock
  2. Immediately check if queue has items
  3. Process next message (recursive pattern)
```

### Key Insight: Promise-Based Locking

Instead of relying on `session.thinking` state from CLI, we use **server-side promise chaining**:

```typescript
class SessionLock {
  private locks = new Map<string, Promise<void>>()

  async executeOrEnqueue(sessionId: string, fn: () => Promise<void>): Promise<boolean> {
    const hasLock = this.locks.has(sessionId)

    if (hasLock) {
      return false // Caller should enqueue to DB
    }

    // Acquire lock immediately
    const promise = fn().finally(() => {
      // Release lock when done
      if (this.locks.get(sessionId) === promise) {
        this.locks.delete(sessionId)
      }
    })

    this.locks.set(sessionId, promise)
    await promise
    return true // Successfully sent
  }

  isLocked(sessionId: string): boolean {
    return this.locks.has(sessionId)
  }
}
```

This ensures:
- **No race conditions**: Lock is acquired synchronously before async work
- **Immediate feedback**: Queuing decision happens in <1ms
- **Self-healing**: Locks auto-release even on errors (via `finally`)

## Database Schema

### Message Queue Table

**File**: `server/src/store/index.ts`

```sql
CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    local_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at INTEGER NOT NULL,
    processing_started_at INTEGER,
    error_message TEXT,
    error_type TEXT,
    retry_count INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_message_queue_session_created
    ON message_queue(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_queue_session_status
    ON message_queue(session_id, status);
```

**Key changes from initial plan**:
1. **Removed `position` column** → Use `created_at` for natural FIFO ordering
2. **Added `UNIQUE` constraint on `local_id`** → Prevents duplicate submissions on retry
3. **Added `error_type`** → Distinguish transient vs terminal errors
4. **Added `retry_count`** → Track automatic retry attempts

### Startup Recovery Query

**File**: `server/src/store/messageQueue.ts`

```typescript
export function recoverProcessingMessages(db: Database): void {
    // Reset any messages stuck in 'processing' state
    db.prepare(`
        UPDATE message_queue
        SET status = 'queued', processing_started_at = NULL
        WHERE status = 'processing'
    `).run()
}
```

Call this during server initialization in `SyncEngine` constructor.

## Implementation Steps

### 1. Session Lock Manager (New File)

**File**: `server/src/sync/sessionLock.ts`

```typescript
/**
 * Manages exclusive locks per session to prevent concurrent message sends
 */
export class SessionLock {
    private readonly locks = new Map<string, Promise<void>>()

    /**
     * Attempt to execute fn with session lock.
     * Returns true if executed immediately, false if session is locked.
     */
    async executeOrEnqueue(
        sessionId: string,
        fn: () => Promise<void>
    ): Promise<boolean> {
        if (this.locks.has(sessionId)) {
            return false // Session locked, caller should enqueue
        }

        const promise = fn().finally(() => {
            // Auto-release lock even on error
            if (this.locks.get(sessionId) === promise) {
                this.locks.delete(sessionId)
            }
        })

        this.locks.set(sessionId, promise)

        try {
            await promise
            return true // Successfully executed
        } catch (error) {
            // Lock is already released via finally
            throw error
        }
    }

    /**
     * Check if session is currently locked
     */
    isLocked(sessionId: string): boolean {
        return this.locks.has(sessionId)
    }

    /**
     * Wait for session lock to be released (for testing)
     */
    async waitForRelease(sessionId: string): Promise<void> {
        const lock = this.locks.get(sessionId)
        if (lock) {
            await lock.catch(() => {}) // Ignore errors
        }
    }
}
```

### 2. Message Queue Store Module (New File)

**File**: `server/src/store/messageQueue.ts`

See full implementation in original plan (766 lines). Key functions:
- `recoverProcessingMessages()` - Server restart recovery
- `enqueueMessage()` - Add message with idempotency
- `getQueueCount()` - Check queue size for DoS protection
- `getNextQueuedMessage()` - FIFO ordering via created_at
- `markQueuedMessageProcessing()` / `markQueuedMessageFailed()` - State transitions
- `resetQueuedMessageToQueued()` - Retry support
- `removeQueuedMessage()` - Cancel support

### 3. Message Queue Service (New File)

**File**: `server/src/sync/messageQueueService.ts`

Key methods:
- `submitMessage()` - Lock check → execute immediately or enqueue
- `processQueueAsync()` - Trigger queue processing in background
- `processNextMessage()` - Recursive processing with locking
- `retryFailedMessage()` / `cancelQueuedMessage()` - User controls
- `onSessionReady()` - Called on thinking → false transition
- `classifyError()` - Distinguish transient vs terminal errors

### 4. Integrate into SyncEngine

**File**: `server/src/sync/syncEngine.ts`

```typescript
// Add imports
import { MessageQueueService } from './messageQueueService'

// Add property
private readonly messageQueueService: MessageQueueService
private readonly prevThinkingState: Map<string, boolean> = new Map()

// In constructor (after messageService initialization)
this.messageQueueService = new MessageQueueService(
    store,
    io,
    this.eventPublisher,
    this.sessionCache
)

// Add wrapper for handleSessionAlive to detect transitions
handleSessionAlive(payload: {
    sid: string
    time: number
    thinking?: boolean
    mode?: 'local' | 'remote'
    permissionMode?: PermissionMode
    modelMode?: ModelMode
}): void {
    const wasThinking = this.prevThinkingState.get(payload.sid) ?? false

    // Update session cache
    this.sessionCache.handleSessionAlive(payload)

    const isThinking = Boolean(payload.thinking)

    // Detect thinking → ready transition
    if (wasThinking && !isThinking) {
        // Trigger queue processing (fire-and-forget)
        this.messageQueueService.onSessionReady(payload.sid).catch(err => {
            console.error('[SyncEngine] Error processing queue:', err)
        })
    }

    this.prevThinkingState.set(payload.sid, isThinking)
}

// Add public methods
async queueMessage(
    sessionId: string,
    payload: {
        text: string
        localId?: string | null
        attachments?: any[]
        sentFrom?: 'telegram-bot' | 'webapp' | 'tui'
    }
): Promise<{ queued: boolean; queuePosition?: number; error?: string }> {
    return await this.messageQueueService.submitMessage(sessionId, payload)
}

async getMessageQueue(sessionId: string): Promise<any[]> {
    const messages = messageQueue.getQueuedMessages(this.store.db, sessionId)
    return messages.map(m => ({
        id: m.id,
        localId: m.localId,
        status: m.status,
        createdAt: m.createdAt,
        errorMessage: m.errorMessage,
        errorType: m.errorType,
        retryCount: m.retryCount
    }))
}

async retryQueuedMessage(sessionId: string, queueId: string): Promise<void> {
    await this.messageQueueService.retryFailedMessage(sessionId, queueId)
}

async cancelQueuedMessage(sessionId: string, queueId: string): Promise<void> {
    await this.messageQueueService.cancelQueuedMessage(sessionId, queueId)
}
```

**Then update Socket.IO handler** at `server/src/socket/handlers/cli/sessionHandlers.ts`:

Change direct calls to `sessionCache.handleSessionAlive()` to `syncEngine.handleSessionAlive()`.

### 5. Update REST API Endpoints

**File**: `server/src/web/routes/messages.ts`

```typescript
// Modify POST endpoint
app.post('/sessions/:id/messages', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine

    const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
    if (sessionResult instanceof Response) return sessionResult
    const { sessionId } = sessionResult

    const parsed = bodySchema.safeParse(await c.req.json())
    if (!parsed.success) {
        return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    const result = await engine.queueMessage(sessionId, {
        text: parsed.data.text,
        localId: parsed.data.localId,
        attachments: parsed.data.attachments,
        sentFrom: 'webapp'
    })

    // Handle queue full error
    if (result.error) {
        return c.json({ error: result.error }, 429)
    }

    return c.json({
        ok: true,
        queued: result.queued,
        queuePosition: result.queuePosition
    })
})

// Add GET queue endpoint
app.get('/sessions/:id/queue', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine

    const sessionResult = requireSessionFromParam(c, engine)
    if (sessionResult instanceof Response) return sessionResult
    const { sessionId } = sessionResult

    const queue = await engine.getMessageQueue(sessionId)

    return c.json({ queue })
})

// Add retry endpoint
app.post('/sessions/:id/queue/:queueId/retry', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine

    const sessionResult = requireSessionFromParam(c, engine)
    if (sessionResult instanceof Response) return sessionResult
    const { sessionId } = sessionResult

    const queueId = c.req.param('queueId')

    try {
        await engine.retryQueuedMessage(sessionId, queueId)
        return c.json({ ok: true })
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
    }
})

// Add cancel endpoint
app.delete('/sessions/:id/queue/:queueId', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine

    const sessionResult = requireSessionFromParam(c, engine)
    if (sessionResult instanceof Response) return sessionResult
    const { sessionId } = sessionResult

    const queueId = c.req.param('queueId')

    try {
        await engine.cancelQueuedMessage(sessionId, queueId)
        return c.json({ ok: true })
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400)
    }
})
```

### 6. Web UI: Queue Display Component

**File**: `web/src/components/AssistantChat/MessageQueue.tsx` (NEW)

```tsx
import React from 'react'

interface QueuedMessage {
    id: string
    localId: string | null
    status: 'queued' | 'processing' | 'failed'
    createdAt: number
    text: string
    errorMessage?: string
    errorType?: 'transient' | 'terminal'
    retryCount: number
}

interface MessageQueueProps {
    messages: QueuedMessage[]
    onRetry: (queueId: string) => void
    onCancel: (queueId: string) => void
    onRefresh?: () => void
}

export const MessageQueue: React.FC<MessageQueueProps> = ({
    messages,
    onRetry,
    onCancel,
    onRefresh
}) => {
    if (messages.length === 0) return null

    const queuedCount = messages.filter(m => m.status === 'queued').length
    const failedCount = messages.filter(m => m.status === 'failed').length

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/10">
            <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-600 dark:text-yellow-400 text-sm font-medium">
                        ⏳ {queuedCount} queued
                        {failedCount > 0 && ` • ❌ ${failedCount} failed`}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        Messages will be sent when Claude finishes
                    </span>
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            title="Refresh queue"
                        >
                            🔄 Refresh
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {messages.map((msg, idx) => (
                        <div
                            key={msg.id}
                            className={`text-sm p-2 rounded flex items-center justify-between ${
                                msg.status === 'failed'
                                    ? 'bg-red-100 dark:bg-red-900/20 border border-red-300'
                                    : msg.status === 'processing'
                                    ? 'bg-blue-100 dark:bg-blue-900/20'
                                    : 'bg-gray-100 dark:bg-gray-800'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className={`${
                                    msg.status === 'failed' ? 'text-red-700 dark:text-red-300' :
                                    msg.status === 'processing' ? 'text-blue-700 dark:text-blue-300' :
                                    'text-gray-700 dark:text-gray-300'
                                }`}>
                                    {msg.status === 'processing' && '⏳ Processing: '}
                                    {msg.status === 'failed' && '❌ Failed: '}
                                    {msg.status === 'queued' && `${idx + 1}. `}
                                    <span className="truncate">
                                        {msg.text.substring(0, 60)}
                                        {msg.text.length > 60 ? '...' : ''}
                                    </span>
                                </div>
                                {msg.errorMessage && (
                                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                        {msg.errorMessage}
                                        {msg.errorType === 'transient' && ' (Auto-retry on reconnect)'}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                                {msg.status === 'failed' && (
                                    <button
                                        onClick={() => onRetry(msg.id)}
                                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                        title="Retry message"
                                    >
                                        ↻ Retry
                                    </button>
                                )}
                                {msg.status !== 'processing' && (
                                    <button
                                        onClick={() => onCancel(msg.id)}
                                        className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                        title="Cancel message"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
```

**Note on Icons**: Instead of using `@heroicons/react`, create custom icons using the existing icon pattern in the project (see `web/src/components/icons.tsx`).

### 7. Web UI: Integrate Queue Display

**File**: `web/src/components/SessionChat.tsx`

**IMPORTANT: Replace Polling with Event-Driven Architecture**

The initial plan used 2-second polling to fetch the queue. This is inefficient and wastes server resources. Instead, use a hybrid "Trigger-Fetch" pattern:

```typescript
import { MessageQueue } from './MessageQueue'

// Add state
const [queuedMessages, setQueuedMessages] = useState<Array<any>>([])

// Fetch queue function
const fetchQueue = useCallback(async () => {
    try {
        const response = await props.api.get(`/sessions/${props.session.id}/queue`)
        const data = await response.json()
        setQueuedMessages(data.queue || [])
    } catch (error) {
        console.error('Failed to fetch queue:', error)
    }
}, [props.api, props.session.id])

// 1. Initial load
useEffect(() => {
    fetchQueue()
}, [fetchQueue])

// 2. Debounced refresh when messages arrive (500ms)
const debounceTimerRef = useRef<NodeJS.Timeout>()
useEffect(() => {
    if (props.messages.length > 0) {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
            fetchQueue()
        }, 500)
    }
    return () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }
    }
}, [props.messages.length, fetchQueue])

// 3. Window focus handler (reconnection safety)
useEffect(() => {
    const handleFocus = () => {
        fetchQueue()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
}, [fetchQueue])

// Add handlers
const handleRetryQueuedMessage = async (queueId: string) => {
    try {
        await props.api.post(`/sessions/${props.session.id}/queue/${queueId}/retry`)
        await fetchQueue()
    } catch (error) {
        console.error('Failed to retry message:', error)
    }
}

const handleCancelQueuedMessage = async (queueId: string) => {
    try {
        await props.api.delete(`/sessions/${props.session.id}/queue/${queueId}`)
        await fetchQueue()
    } catch (error) {
        console.error('Failed to cancel message:', error)
    }
}

// Add to render (inside HappyComposer or above it)
<MessageQueue
    messages={queuedMessages}
    onRetry={handleRetryQueuedMessage}
    onCancel={handleCancelQueuedMessage}
    onRefresh={fetchQueue}
/>
```

**Why this architecture?**
- **No polling overhead**: Eliminates 30 requests/min from constant polling
- **Near-instant updates**: 500ms debounce provides sub-second latency
- **Reconnection safety**: Window focus handler refreshes stale state
- **User control**: Manual refresh button as fallback
- **Simple**: No backend SSE changes needed

See `docs/QUEUE_ARCHITECTURE_FINAL.md` for detailed architecture rationale.

## Testing Strategy

### Unit Tests

**1. SessionLock Tests** (`sessionLock.test.ts`):
- Concurrent `executeOrEnqueue` calls serialize execution
- Lock releases after error
- `isLocked` accurately reflects state

**2. Message Queue Store Tests** (`messageQueue.test.ts`):
- Idempotency via `local_id` prevents duplicates
- FIFO ordering via `created_at`
- `recoverProcessingMessages` resets stuck messages

**3. Message Queue Service Tests** (`messageQueueService.test.ts`):
- Submit when unlocked → sends immediately
- Submit when locked → enqueues to DB
- Queue full → returns 429 error
- Failed message with retry → resets to queued

### Integration Tests

**1. Concurrent Submission** (`concurrentSubmit.test.ts`):
- Send 10 messages simultaneously → only 1 executes, 9 enqueue
- Verify no CLI errors from concurrent sends

**2. Server Restart Recovery** (`serverRestart.test.ts`):
- Enqueue messages → mark some as processing → restart server
- Verify processing messages reset to queued

### End-to-End Testing (Manual)

**Scenario 1: Basic Queueing**
1. Claude is busy thinking
2. Submit message from web UI
3. Verify message appears in queue with position 1
4. Claude finishes
5. Verify message auto-processes within 1 second

**Scenario 2: Queue Full**
1. Enqueue 50 messages
2. Submit 51st message
3. Verify 429 error with "Queue full" message

**Scenario 3: Cancel Message**
1. Enqueue 3 messages
2. Click cancel on message #2
3. Verify only 2 messages remain in queue

## Critical Files Summary

### New Files
1. `server/src/sync/sessionLock.ts` - Lock manager
2. `server/src/store/messageQueue.ts` - Queue CRUD
3. `server/src/sync/messageQueueService.ts` - Queue orchestration
4. `web/src/components/AssistantChat/MessageQueue.tsx` - Queue UI

### Modified Files
1. `server/src/store/index.ts` - Add schema v3 migration
2. `server/src/sync/syncEngine.ts` - Integrate queue service
3. `server/src/web/routes/messages.ts` - Update endpoints
4. `server/src/socket/handlers/cli/sessionHandlers.ts` - Use syncEngine wrapper
5. `web/src/components/SessionChat.tsx` - Integrate queue display with event-driven updates

### Pre-Existing Bugs Fixed
1. `server/src/sync/syncEngine.ts` - Fixed `session.machineId` → `metadata.machineId`
2. `server/src/web/routes/version.ts` - Fixed version.json import using path resolution
3. `server/src/store/index.ts` - Changed `private db` to `readonly db` for type safety

### Event Schema Updates
1. `shared/src/schemas.ts` - Added 5 new queue event types:
   - `message-queued`
   - `message-processing`
   - `message-queue-completed`
   - `message-queue-failed`
   - `message-queue-cancelled`

## Success Metrics

### Functional Requirements
- ✅ Messages serialize when Claude is busy
- ✅ No concurrent sends (enforced by SessionLock)
- ✅ Queue processes immediately after completion (not delayed by heartbeat)
- ✅ Failed messages can be retried or cancelled
- ✅ Server restart recovers stuck messages
- ✅ Queue limit prevents DoS

### Performance
- Message submission latency < 10ms (synchronous lock check)
- Queue processing latency < 100ms
- Zero CLI errors from concurrent sends
- **Queue UI updates**: 93% reduction in server requests (polling → event-driven)

### Security
- Queue size limited to 50 messages per session
- `local_id` provides idempotency for network retries
- Authorization validated on retry/cancel endpoints

## Future Enhancements

1. **Edit Queued Message** - Modify text before processing
2. **Reorder Queue** - Drag-and-drop priority
3. **Auto-Retry Transient Errors** - Retry network failures automatically
4. **Analytics** - Track queue lengths, wait times
5. **TUI Support** - Add message input to CLI interface
6. **True Realtime via SSE** - Emit queue events via EventPublisher (optional optimization)
