# Virtualization and Scrolling

## Current architecture (as of this branch)

The message list uses **TanStack Virtual** (`@tanstack/react-virtual`) with a hand-rolled
scroll owner in `HappyThread.tsx`. The virtualizer renders only the messages currently
in the viewport, making long sessions feasible.

```
HappyThread (owns scroll state via refs)
  └── ThreadPrimitive.Viewport (scroll container, autoScroll=false)
        └── VirtualMessageList (useVirtualizer)
              └── ThreadPrimitive.MessageByIndex × visible items only
```

Key files:

- `web/src/components/AssistantChat/HappyThread.tsx` — scroll logic (autoScroll ref,
  scroll handler, load-more scroll preservation, force-scroll on send)
- `web/src/components/AssistantChat/VirtualMessageList.tsx` — virtualizer

## What this branch fixed (rendering flashes)

Two bugs caused a visible flash on initial load and on session switch:

**1. `useEffect` → `useLayoutEffect` for scroll element initialization**
(`VirtualMessageList.tsx`)

`useEffect` runs after the browser paints. On first render, `scrollElement` was `null`,
so the virtualizer produced an empty list. The browser painted that empty frame, then
`useEffect` fired, set `scrollElement`, re-rendered with items — a visible flash.

`useLayoutEffect` runs synchronously after DOM mutations but before paint, batching both
renders into a single paint.

**2. `marginBottom` → `paddingBottom` on virtual item wrappers**
(`VirtualMessageList.tsx`)

`getBoundingClientRect().height` excludes CSS margins. Using `marginBottom` for the
inter-item gap caused the virtualizer to undercount each item's height by 12px (0.75rem),
misplacing items after the first measurement cycle as the virtualizer corrected itself.
`paddingBottom` is included in `getBoundingClientRect().height`.

**3. `autoScrollEnabled` `useState` → pure ref**
(`HappyThread.tsx`)

`autoScrollEnabled` never drove rendered output — it only gated the auto-scroll effect.
Using `useState` caused an unnecessary re-render on every scroll threshold crossing, plus
a second `useEffect` to sync state into the ref. Writing `autoScrollEnabledRef.current`
directly eliminates both.

## Known limitations with TanStack Virtual for long sessions

Long sessions (200+ messages) are a hard requirement — a session covering research,
implementation, and code review routinely exceeds this count.

### Scroll position drift under streaming

TanStack Virtual calculates item positions from estimated heights before measurement.
During active streaming, the last message grows token-by-token. Each growth triggers a
`ResizeObserver` callback, the virtualizer re-measures, and corrects `scrollTop`.
If auto-scroll is enabled, the scroll correction and the auto-scroll write race, producing
a jitter that worsens as the message grows.

Mitigation: the current code uses `behavior: 'auto'` (instant) not `'smooth'`, which
reduces the window for racing writes. The `autoScrollEnabledRef` guard means scroll
corrections only happen when the user is near the bottom.

### Load-more scroll position preservation

When older messages are prepended, the virtualizer recalculates total height and all item
positions shift down. `HappyThread.tsx` snapshots `{scrollTop, scrollHeight}` before the
load and restores via `viewport.scrollTop = pending.scrollTop + delta` in a
`useLayoutEffect`, which runs before paint.

This works for Chrome and Firefox. Safari does not support `overflow-anchor`, so the
browser itself does not help stabilize the scroll position; the manual snapshot/restore
is the only mechanism, and it may flicker on slow devices.

### Item height estimation

The virtualizer estimates each item at 212px (200px base + 12px gap). Messages with
code blocks, long tool outputs, or images are much taller. Large estimation errors cause:
- Incorrect scroll bar thumb size/position until the item is measured
- Visible position jumps when the virtualizer corrects after first measurement

### Firefox `getBoundingClientRect` path

Firefox's implementation of `getBoundingClientRect` for absolutely-positioned children
inside a scroll container can return stale values during fast scroll. The current code
falls back to the virtualizer's default `offsetHeight` measurement on Firefox to avoid
this. This means Firefox may have slightly less accurate height measurements.

## Research summary (Feb 2026)

Three libraries were evaluated as alternatives to TanStack Virtual for a future migration.

### `use-stick-to-bottom`

Scroll behavior only — no virtualization. Does not solve the long-session DOM size
problem. Has an open bug with `initial="instant"` and an open `ResizeObserver` memory
leak. **Not suitable.**

### `react-virtuoso`

Purpose-built for chat/messaging lists. Handles streaming, prepend, and auto-scroll
natively. `followOutput="auto"` reacts to new messages; `atBottomStateChange` replaces
the manual scroll listener; `firstItemIndex` handles prepend without snapshot/restore.

Bundle size: ~7–8 KB gzip (tree-shaking broken — grid/table always included).

**Recommended for the virtualization migration.**

### `virtua`

Smaller bundle (~3 KB gzip, tree-shakeable). The `shift` prop is a cleaner prepend API
than `react-virtuoso`'s `firstItemIndex`. Pre-1.0 versioning means API instability is a
risk. Worth revisiting if it reaches 1.0 or if `react-virtuoso`'s bundle size becomes
a problem.

## Suggested future migration: react-virtuoso

Trigger: sessions regularly hitting performance problems at 200+ messages with rich
content (markdown, code blocks, images).

### Architecture

Replace `VirtualMessageList` + TanStack Virtual with a `VirtualMessageList` backed by
`react-virtuoso`'s `<Virtuoso>`:

```
HappyThread (simplified — no manual scroll logic)
  └── VirtualMessageList
        └── Virtuoso (react-virtuoso)
              ├── followOutput="auto"       → auto-scroll on new messages
              ├── atBottomStateChange       → onAtBottomChange callback
              ├── firstItemIndex            → prepend scroll preservation
              └── ref.autoscrollToBottom()  → scroll during streaming (growing item)
```

`HappyThread.tsx` loses most of its scroll machinery. The manual scroll handler,
snapshot/restore logic, and `autoScrollEnabledRef` are replaced by `react-virtuoso`
props and callbacks.

### Key integration notes

**Bypass `ThreadPrimitive.Messages`** (which renders all messages unconditionally):
```tsx
const messages = useAssistantState(state => state.thread.messages)

<Virtuoso
  data={messages}
  followOutput={(isAtBottom) => isAtBottom ? 'auto' : false}
  atBottomStateChange={props.onAtBottomChange}
  atBottomThreshold={16}
  firstItemIndex={firstItemIndex}
  itemContent={(index, message) => <MessageItem message={message} />}
/>
```

**Streaming**: `followOutput` only fires on `data.length` changes, not on growing item
content. For token-by-token streaming, call `autoscrollToBottom` imperatively:
```tsx
useEffect(() => {
  if (isAtBottomRef.current) {
    virtuosoRef.current?.autoscrollToBottom()
  }
}, [messages[messages.length - 1]?.content])
```

**Force-scroll on send**:
```tsx
virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
```

**Prepend (load older messages)**:
```tsx
const START_INDEX = 100_000
const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX)

const handleLoadMore = async () => {
  const older = await fetchOlder()
  setFirstItemIndex(prev => prev - older.length)
  setMessages(prev => [...older, ...prev])
}
```

### Gotchas

1. CSS `margin` on block elements inside `itemContent` (`<p>`, `<h1>`–`<h6>`, `<ul>`,
   `<pre>`) breaks height measurement. Use `padding` instead, or wrap content in a
   container that normalizes margins to padding.
2. Increase `atBottomThreshold` from the default 4px to ~16px for reliable bottom
   detection.
3. Use `followOutput="auto"` (instant), not `'smooth'` — smooth breaks under rapid
   token updates.
4. After prepending messages, call `scrollToIndex` inside a `setTimeout(0)` to let
   the virtualizer process the new `firstItemIndex` first.
