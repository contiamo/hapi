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

## 2. `completedRequests` in agentState is redundant and grows unboundedly

### Problem

`agentState.completedRequests` accumulates one entry per tool call for the lifetime of
the session and is never pruned (only cleared on `/clear`). Each entry stores `tool`,
`arguments` (which can be large — full file contents for Write calls), `status`, `mode`,
`decision`, `blockedPath`, `decisionReason`, etc.

This data is already in the `messages` table. When a permission is resolved,
`sdkToLogConverter` embeds a `permissions` field (`{ result, date, mode, decision }`) in
the tool-result message. The tool name and input are in the preceding tool-use message.
`completedRequests` is a second copy of this information, keyed by tool call ID for fast
lookup during `reduceChatBlocks`.

### Why it exists

The web reducer (`getPermissions` in `reducerTools.ts`) reads `completedRequests` to
build a `Map<toolCallId, PermissionEntry>` before processing messages. This lets it
overlay permission status onto tool cards in O(1) per card rather than scanning messages.
But since `reduceChatBlocks` already iterates all messages, the map could be built during
that pass at zero extra storage cost.

### Direction for a fix

Drop `completedRequests` entirely:

1. In `reducerTools.ts` / `reducer.ts`: build the permission map from messages during the
   reduce pass instead of reading it from agentState. The `permissions` field on
   tool-result messages already carries `result`, `mode`, and `decision`. The tool name
   and input come from the matching tool-use content block.

2. In `BasePermissionHandler.finalizeRequest`: stop calling `updateAgentState` to append
   to `completedRequests`. The message emitted by `sdkToLogConverter` already records the
   outcome; no second write is needed.

This directly shrinks the `agent_state` column (which can reach 100KB+ on long sessions),
and — combined with item 1 above — means permission responses no longer trigger
`updateAgentState` at all, removing the biggest source of the O(N) update chain.

The remaining agentState content (`requests` for pending permissions, `controlledByUser`)
is small and genuinely ephemeral.

---

## 3. Collapse the monorepo into a single TypeScript project

### Problem

The repo has four separate TypeScript projects (`cli`, `server`, `shared`, `web`), each
with its own `tsconfig.json`, `package.json`, and `node_modules`. This creates constant
friction:

- `pnpm tsc --noEmit` at the root does nothing; you must `cd` into each package
- `pnpm lint` is a wrapper script that shells into each folder in sequence
- Cross-package imports use workspace package names (`@hapi/protocol`, `@twsxtd/hapi`)
  which require workspace resolution plumbing even though all packages live in the same
  repo and are never published separately
- `shared` (`@hapi/protocol`) exists purely as an internal dependency; it has no external
  consumers and no reason to be its own package

The cli `tsconfig.json` already `include`s `../server/src` directly, so cli and server
are effectively one TS project already — the package boundary is fictional.

### What separates them today

- **`web`** genuinely needs different compiler settings: `DOM` libs, `vite/client` types,
  `react-jsx`, no `bun-types`. It also has a separate build tool (Vite). This one has a
  real reason to stay separate.
- **`cli` + `server` + `shared`**: all target the same runtime (Bun), share the same
  base tsconfig, compile to the same binary. The split is organisational, not technical.

### Direction for a fix

Merge `cli`, `server`, and `shared` into a single TypeScript project rooted at the repo
root:

- One `tsconfig.json` at the root covering `cli/src`, `server/src`, `shared/src`
- One `package.json` with all dependencies merged, one `node_modules`
- `@hapi/protocol` imports become relative imports or a path alias (`@shared/*`)
- `pnpm tsc --noEmit` and `pnpm lint` work from the root with no wrapper scripts

`web` stays as a separate Vite project — it genuinely needs different compiler settings
and a different build pipeline. A root-level `pnpm lint` and `pnpm typecheck` can still
invoke both in sequence, but the common case (touching cli/server/shared) becomes a
single command from any directory.

