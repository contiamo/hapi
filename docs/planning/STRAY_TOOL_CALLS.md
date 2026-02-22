# Stray Tool Calls After Message Compaction

## Problem

In long-running sessions, `agentState.completedRequests` accumulates an entry for every tool call that has ever been approved or denied. The frontend uses this to render "orphan tool cards" — tool call UI elements whose originating messages are no longer in the current conversation transcript. After the Claude SDK compacts the conversation history (removing old messages), the corresponding `completedRequests` entries remain in `agentState` indefinitely.

Observed symptom: a long-running session had 266 entries in `completedRequests` while the current message history contained none of the corresponding tool_use messages.

## Root Cause

### Data flow

1. A tool call fires during a Claude turn
2. The CLI's `PermissionHandler` adds an entry to `agentState.requests` via `updateAgentState`
3. The user approves or denies; the CLI moves the entry from `requests` to `completedRequests` via another `updateAgentState`
4. The server stores the updated `agentState` in SQLite
5. When the SDK compacts the conversation, old messages (including tool_use/tool_result pairs) are removed from the Claude session file
6. `completedRequests` is never pruned — it keeps growing

### Why the previous server-side fix was insufficient

The server detects `microcompact_boundary` system messages forwarded from the CLI and calls `handleMessageHistoryModification`, which sets `agentState = null`. However, this creates a race condition:

- The CLI buffers `updateAgentState` calls in a lock queue (`agentStateLock`)
- After the server sets `agentState = null`, any queued CLI `updateAgentState` call applies its handler to the CLI's local cached state and re-posts `completedRequests` to the server
- The server's null-set is immediately overwritten

Additionally, `microcompact_boundary` is not the only compaction trigger — user-triggered `/compact` also compacts the history, and the sequence of SDK events may differ.

## Fix: CLI-driven cleanup

### Approach

The CLI is the only party with live knowledge of the current turn and the only party that observes SDK messages before they are forwarded. Rather than having the server attempt to clean up state it does not fully understand, the CLI clears `completedRequests` at the appropriate moment.

**Two compaction triggers are handled:**

1. **Autonomous microcompact** (`microcompact_boundary` system message from the SDK): detected in `claudeRemoteLauncher.ts`'s `onMessage` callback. When the message arrives, the CLI calls `updateAgentState` to reset `completedRequests` and `requests` to empty objects.

2. **User-triggered `/compact`**: detected in `claudeRemote.ts` via the `isCompactCommand` flag. When the SDK `result` message arrives after a compact command, the same `updateAgentState` reset is called.

**The server-side microcompact handler** (`handleMessageHistoryModification` called from `sessionHandlers.ts` on `microcompact_boundary`) was removed for the microcompact case, since:
- It races with the CLI's own `updateAgentState`
- The CLI's reset is now authoritative and arrives via the normal `update-state` socket flow
- The server-side wipe is still present for `/clear`, archive, and delete (where it is safe and correct)

### Key properties of this fix

- **No new data structures**: the CLI does not need to accumulate a full message history
- **No DB scanning**: no SQL queries against message blobs
- **No race**: the CLI controls the wipe timing, so the reset is not overwritten by a subsequent `updateAgentState`
- **Works for both compaction types**: microcompact and explicit `/compact`

### Files changed

- `cli/src/claude/claudeRemoteLauncher.ts`: detect `microcompact_boundary` in `onMessage`, call `session.client.updateAgentState` to clear tool call state
- `cli/src/claude/claudeRemote.ts`: after compact `result` arrives, call `opts.onClearAgentState()` before `onReady()`
- `server/src/socket/handlers/cli/sessionHandlers.ts`: remove `handleMessageHistoryModification` call from `microcompact_boundary` handler (keep the log, remove the wipe)

## Limitations and next steps

### What this fix does NOT handle

1. **Server restart between compactions**: if the server restarts after messages were compacted but before the next compaction event, `agentState` in the DB still has the old `completedRequests`. They will be loaded by the CLI on reconnect and re-posted. This is bounded: it only persists until the next compaction.

2. **Rollback command**: `/rollback` truncates the Claude session JSONL file, removing turns from history. The `completedRequests` entries for those rolled-back tool calls remain in `agentState`. A separate cleanup is needed here.

3. **Accumulation between compactions**: in a very long session that never compacts, `completedRequests` still grows without bound. The fix only kicks in at compaction boundaries.

### If this fix is not sufficient

The next step would be a server-side reconciliation pass:

- At session load/resume, compare the tool_use IDs in `completedRequests` against those found in the stored messages
- Any ID not found in messages gets pruned
- This requires either: (a) adding an indexed `tool_use_id` column to the messages table, or (b) scanning message JSON blobs (expensive but correct)

This was not implemented in the initial fix due to the complexity of DB blob scanning and the introduction of a new index. If the simpler CLI-driven approach proves insufficient in practice, pursue option (a): add a `tool_use_ids` JSON column populated at message insert time.
