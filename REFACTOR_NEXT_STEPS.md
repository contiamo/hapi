# Refactor Next Steps

Architecture issues identified during the `refactor-simplify` branch review that are too large
to address in-branch. Capture here so they are not lost.

---

## 1. agentState update chain causes O(N) full reconstruction on every permission event

### Problem

Every permission request or response (approve, deny, register, batch-cancel) calls
`updateAgentState`, which triggers the following chain:

```
updateAgentState()
  → HTTP PUT to server (CLI → server)
  → server writes to SQLite
  → server emits SSE "session-updated" event
  → web invalidates queryKeys.session()
  → react-query re-fetches full session object (HTTP GET)
  → props.session is replaced with a new object
  → useMemo([normalizedMessages, props.session.agentState]) re-runs reduceChatBlocks()
  → full O(N) reconstruction of all ChatBlock objects
  → reconcileChatBlocks() does another O(N) pass to restore referential identity
  → React re-renders only the blocks that actually changed
```

For a session with hundreds of tool calls (common for long coding tasks), this means a
single permission status change (one field on one object) causes a full HTTP round-trip
plus two full O(N) passes over the entire message list on the client.

During an active turn with parallel tool calls this can fire several times per second.

### Why the reconciler exists

`reconcileChatBlocks` / `arePermissionsEqual` exist solely to compensate for this: after
`reduceChatBlocks` creates new object identities for everything, the reconciler restores
the previous object references for blocks that did not actually change, so React skips
re-rendering them. It is a patch on the cost of full reconstruction, not a feature.

### Root cause

agentState is stored on the session row and fetched as part of the session object. There
is no separate real-time channel for agentState deltas — changes go through
invalidate→refetch→replace, which is appropriate for slow-changing REST resources, not
for sub-second permission handshakes.

### Direction for a fix

Deliver agentState updates as SSE deltas on the same channel that delivers messages,
instead of as session query invalidations. The web would apply the delta directly to the
cached agentState without a refetch. `reduceChatBlocks` would only re-run when either
messages or agentState actually changed (it already takes both as inputs), and a targeted
delta would keep the agentState reference stable for unchanged sessions.

Concretely:
- Add an `agentState` field to the existing `message-received` / `session-updated` SSE
  event, or introduce a dedicated `agent-state-updated` event type carrying the new value
  and version
- On the web, apply it with `queryClient.setQueryData` instead of `invalidateQueries`,
  so no refetch is triggered
- Remove or simplify `reconcileChatBlocks` once the reconstruction frequency drops — at
  that point it only needs to handle the message-append case, not the agentState-tick case

---

## 2. Dead code from Codex/Gemini removal (minor, low risk)

Left over from the `8f24f47` backend removal commit:

- `web/src/components/ToolCard/views/_results.tsx` still registers `CodexReasoning`,
  `CodexPatch`, `CodexDiff` view types (~150 lines of dead view code) whose backing
  files were deleted
- `cli/src/claude/sdk/index.ts` and `sdk/types.ts` export `CanCallToolCallback` as a
  legacy alias for `CanUseTool` with a comment "kept for callers that haven't migrated"
  — there are zero callers in the codebase
- `cli/src/runner/run.ts` uses `_machineId` to suppress an oxlint warning for a field
  that is genuinely unused; should be removed from the destructure entirely
- `shared/src/schemas.ts` `flavor` field is `z.string().nullish()` but only `'claude'`
  is ever written; could be narrowed to `z.literal('claude').nullish()`
