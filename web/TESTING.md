# Draft Persistence Testing Strategy

## Overview

Draft persistence testing is split into two levels:
1. **Unit tests** for draft-store logic (localStorage, merge, save/clear)
2. **Integration tests** for HappyComposer component (restoration, error handling)

## Unit Tests (`draft-store.test.ts`)

Tests the core draft persistence logic in isolation:

✅ **Save/Retrieve Operations**
- Save and retrieve draft text
- Auto-generate timestamps
- Handle multiple sessions independently
- Trim whitespace
- Truncate long drafts (10KB limit)

✅ **Clear Operations**
- Remove drafts for specific sessions
- Don't affect other sessions
- Idempotent (clearing non-existent draft is safe)

✅ **Merge Logic (Last-Write-Wins)**
- Return remote when local is null
- Return local when remote is null
- Choose newer draft by timestamp
- Tie-breaker: remote wins when timestamps are equal

✅ **Error Handling**
- Corrupted localStorage data
- Invalid draft structures
- localStorage quota exceeded
- SSR safety (no window object)

✅ **Edge Cases**
- Special characters in session IDs
- Unicode text
- Empty strings and whitespace
- Very long session IDs

**Coverage:** 29 tests, all passing

## Integration Tests (`HappyComposer.test.tsx`)

Tests the component's integration with draft persistence APIs:

✅ **Component Rendering**
- Renders without crashing
- Displays textarea with correct attributes

✅ **Draft Restoration - Merge Logic**
- Restores server draft when newer than local
- Keeps local draft when newer than server
- Falls back to localStorage when API fails
- Handles null server responses correctly

✅ **Draft Saving - Component Wiring**
- Component initializes with draft persistence wired up
- API methods are available and properly configured
- Component sets up effects without crashing

✅ **Error Resilience**
- Component remains functional when saveDraft fails
- Component remains functional when clearDraft fails

✅ **Session Isolation**
- Does not restore draft for different sessionId
- Only restores draft once per session (caches restoration state)

**Coverage:** 14 tests, all passing

## What We DON'T Test (And Why)

### ❌ Debounced Save Behavior in Integration Tests

**Why not:**
- The component's draft save is triggered by changes to `composerText`
- `composerText` comes from `useAssistantState` (assistant-ui library)
- In tests, assistant-ui is completely mocked with static state
- Changing `mockComposerState.text` doesn't trigger React re-renders
- Therefore, the `useEffect` that watches `composerText` never re-executes

**What we do instead:**
1. Unit test the draft-store save/clear functions (✅ done)
2. Verify the component wires up the APIs correctly (✅ done)
3. Manual/E2E testing for the full user flow

**Why this is acceptable:**
- The debounce logic itself is from a library (`@/lib/utils debounce`)
- The draft-store save/clear logic is fully unit tested
- We verify the component doesn't crash when configured with draft APIs
- We test the critical restoration and merge logic thoroughly

## Testing Philosophy

### What Makes a Good Integration Test?

✅ **Test actual behavior, not mocks:**
- Check `mockSetText` was called with correct value ✅
- Verify localStorage state after operations ✅
- Confirm error handling logs errors ✅

❌ **Don't test mock configuration:**
- "Mock returns what we told it to return"
- "Function we passed exists"

### Limitations We Accept

**Can't test without real state changes:**
- User typing → debounced save
- Send button → clear draft

**Solution:**
- Unit test the underlying functions
- Verify component wiring is correct
- Rely on manual/E2E testing for full flow

## Running Tests

```bash
# Run all tests
npm test

# Run only HappyComposer integration tests
npm test -- HappyComposer.test.tsx --run

# Run only draft-store unit tests
npm test -- draft-store.test.ts --run

# Run with coverage
npm test -- --coverage
```

## Test Results

```
✓ src/lib/draft-store.test.ts (29 tests) - 48ms
✓ src/components/AssistantChat/HappyComposer.test.tsx (14 tests) - 502ms

Total: 43 tests, all passing
```

## Manual Test Checklist

Since we can't fully test the debounced save behavior in integration tests, verify manually:

- [ ] Type in composer → draft saves after 1s (check localStorage)
- [ ] Type rapidly → only final value saves (debounce works)
- [ ] Clear text → draft clears from localStorage
- [ ] Send message → draft clears
- [ ] Open session on two devices → newer draft wins
- [ ] Network error during save → local draft still saved
- [ ] Session switching → drafts don't leak between sessions

## Future Improvements

If we need to test the full debounced save flow in integration tests:

1. **Option 1:** Use a real assistant-ui provider instead of mocking it
   - Pro: Tests actual state management
   - Con: More complex setup, slower tests

2. **Option 2:** Create a testable wrapper around the draft persistence logic
   - Pro: Easier to test in isolation
   - Con: Refactoring required

3. **Option 3:** Add E2E tests with Playwright
   - Pro: Tests real user interactions
   - Con: Slower, requires test infrastructure

For now, the combination of comprehensive unit tests + targeted integration tests + manual testing provides sufficient coverage for the draft persistence feature.
