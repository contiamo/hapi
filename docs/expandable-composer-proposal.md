# Expandable Composer: Implementation Proposal

**Date:** 2026-02-03
**Status:** Research Complete - Ready for Implementation
**Goal:** Fix Android Chrome PWA keyboard and focus issues

## Executive Summary

This document proposes two implementation approaches to fix critical issues with the expandable composer on Android Chrome PWA. Both approaches will be prototyped in separate branches for side-by-side comparison.

### Current Problems

1. **Textarea doesn't become typeable after drag-to-expand** - No cursor or keyboard on Android Chrome
2. **Layout breaks when keyboard opens** - Bottom 50px covered by OS nav bar
3. **Composer pushed off-screen** - Top hidden when keyboard opens, impossible to close
4. **Lag during drag** - Performance issues with dozens of lines of text

### Required Features (Must Preserve)

- ✅ Drag-to-expand gesture
- ✅ Easy desktop close (double-click or button)
- ✅ Support for large text content (dozens+ lines)
- ✅ Mobile-first, but desktop-compatible

---

## Approach 1: Vaul + TextareaAutosize (Battle-Tested)

### Overview

Replace custom expandable implementation with Vaul drawer component, integrate react-textarea-autosize for better text handling.

### Key Components

**Libraries:**
- `vaul` - Drawer component built on Radix UI
- `react-textarea-autosize` - Auto-resizing textarea (1.3KB)

**Why Vaul:**
- Built on Radix UI Dialog (already in project - zero duplicate dependencies)
- Battle-tested by Vercel and major production apps
- Active maintenance (updated January 2026)
- Solves Android focus and keyboard issues out-of-the-box
- Performance optimized (CSS variable recalculation fix)

### Technical Details

#### Architecture

```
Drawer.Root (Vaul)
├── Drawer.Trigger
└── Drawer.Portal
    ├── Drawer.Overlay
    └── Drawer.Content
        ├── Drawer.Handle (drag handle)
        ├── ComposerPrimitive.Root (@assistant-ui/react)
        │   ├── TextareaAutosize
        │   ├── Attachments
        │   └── ComposerButtons
        └── Drawer.Close (close button)
```

#### Android Issue Solutions

**1. Focus Management**
- Vaul accepts React ref for focus element
- Auto-selects first interactive element if not specified
- Focus trapping enabled by default
- Tested and working on Android Chrome

**2. Keyboard Repositioning**
- Built-in `repositionInputs` prop
- Can be disabled if default browser behavior preferred
- Handles viewport resize events automatically

**3. Performance**
- Already solved CSS variable performance issues
- Tested with 20+ list items (no lag)
- GPU-accelerated animations
- Minimal rerenders

**4. Safe Area Handling**
```css
.drawer-content {
  bottom: env(safe-area-inset-bottom, 0px);
}
```

#### Implementation Example

```tsx
import { Drawer } from 'vaul'
import TextareaAutosize from 'react-textarea-autosize'
import { ComposerPrimitive } from '@assistant-ui/react'

export function VaulComposer(props: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [snapPoint, setSnapPoint] = useState<number | string | null>(0.2)

  return (
    <Drawer.Root
      snapPoints={[0.2, 0.5, 1]}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={setSnapPoint}
      dismissible={true}
      modal={false}
    >
      <Drawer.Trigger asChild>
        <button>Open Composer</button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />

        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-content"
          style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Drag Handle */}
          <div className="mx-auto w-full max-w-content rounded-t-[20px] bg-[var(--app-secondary-bg)] px-3 pt-2">
            <Drawer.Handle className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--app-hint)]/40" />

            <ComposerPrimitive.Root>
              {/* Status Bar */}
              <StatusBar {...statusBarProps} />

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2">
                  <ComposerPrimitive.Attachments
                    components={{ Attachment: AttachmentItem }}
                  />
                </div>
              )}

              {/* Textarea */}
              <TextareaAutosize
                ref={textareaRef}
                autoFocus={!controlsDisabled && !isTouch}
                placeholder={placeholder}
                disabled={controlsDisabled}
                maxRows={snapPoint === 1 ? 50 : 5}
                cacheMeasurements
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                className="w-full resize-none bg-transparent text-sm leading-snug"
              />

              {/* Composer Buttons */}
              <ComposerButtons {...buttonProps} />
            </ComposerPrimitive.Root>

            {/* Desktop Close Button */}
            <Drawer.Close asChild>
              <button
                className="absolute right-4 top-4 rounded-full p-2 hover:bg-[var(--app-bg)]"
                aria-label="Close composer"
              >
                ×
              </button>
            </Drawer.Close>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

#### Snap Points Configuration

```tsx
// Quick mode: 20% of viewport
// Expanded mode: 50% of viewport
// Full screen: 100% of viewport
snapPoints={[0.2, 0.5, 1]}

// Or fixed heights:
snapPoints={[150, 400, '100%']}
```

#### Desktop Close Methods

1. **Close button** - Top-right × button
2. **Escape key** - Built-in Radix UI behavior
3. **Click overlay** - If dismissible enabled
4. **Drag down** - Gesture to dismiss
5. **Double-tap handle** - Custom addition (optional)

### Known Issues & Mitigations

**Issue:** Some users report drawer jumping on keyboard focus (mostly iOS)
- **Mitigation:** Test `repositionInputs={false}` to use default browser behavior
- **Status:** Primarily iOS issue, not Android

**Issue:** Keyboard may block view in some cases
- **Mitigation:** Configure snap points to account for keyboard height
- **Status:** Fixed in PR #441, ongoing improvements

### Bundle Impact

- Vaul: ~8-10KB (minified + gzipped)
- react-textarea-autosize: 1.3KB
- **Total: ~10KB increase**
- No duplicate dependencies (uses existing Radix UI)

### Pros

✅ Battle-tested solution (production-proven)
✅ Active maintenance (Jan 2026 updates)
✅ Solves all 4 identified problems out-of-the-box
✅ Uses existing Radix UI dependency
✅ Tailwind CSS friendly (unstyled)
✅ Multiple desktop close methods
✅ Performance optimized
✅ Focus management handled automatically
✅ Accessibility built-in (WAI-ARIA)

### Cons

⚠️ Moderate refactoring required (different API)
⚠️ Learning curve for Vaul API
⚠️ May need to adjust snap points through testing
⚠️ Some reported keyboard jump issues (iOS, not Android)

### Implementation Effort

**Estimated Time:** Medium
- Replace expandable composer logic with Vaul primitives
- Integrate TextareaAutosize
- Style with Tailwind CSS (match existing design)
- Test and configure snap points
- Add desktop close button
- Test on Android Chrome, iOS Safari, Desktop

### Risk Level: Low-Medium

- Well-documented library
- Active community
- Production-proven
- Built on familiar tech (Radix UI)

---

## Approach 2: Enhanced Custom Solution

### Overview

Fix the existing custom implementation by addressing root causes of each issue. Keep current architecture and UX exactly as-is.

### Key Components

**Libraries:**
- `react-textarea-autosize` - Better auto-resize (1.3KB)

**Changes:**
- Fix focus timing for Android Chrome
- Add safe area inset handling
- Add visualViewport listener for max-height
- Improve drag performance with CSS transforms
- Replace textarea with TextareaAutosize

### Technical Details

#### Android Issue Solutions

**1. Focus Management Fix**

**Problem:** `setTimeout(() => textareaRef.current?.focus(), 0)` doesn't work on Android Chrome

**Root Cause:** Android Chrome event timing differs from iOS; 0ms is too short for event loop

**Solution:**
```tsx
const focusTextarea = () => {
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (!textareaRef.current) return

      // Ensure drag handle isn't blocking pointer events
      const dragHandle = dragHandleRef.current
      if (dragHandle) {
        dragHandle.style.pointerEvents = 'none'
      }

      // Try to focus with preventScroll
      textareaRef.current.focus({ preventScroll: true })

      // Restore drag handle pointer events after focus
      setTimeout(() => {
        if (dragHandle) {
          dragHandle.style.pointerEvents = ''
        }
      }, 100)
    }, 100) // Increased from 0ms to 100ms for Android
  })
}

// Call after drag ends
onDragEnd: (totalDeltaY, velocity) => {
  // ... existing logic
  focusTextarea()
}
```

**2. Safe Area Inset Handling**

**Problem:** Bottom 50px covered by Android OS nav bar

**Root Cause:** Not using `env(safe-area-inset-bottom)`

**Solution:**
```tsx
// Update bottom padding class
const bottomPaddingClass = isIOSPWA
  ? 'pb-0'
  : 'pb-[env(safe-area-inset-bottom,12px)]'

// For expanded mode positioning
const expandedStyles: CSSProperties = {
  position: 'fixed',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  height: expandedHeight || undefined
}
```

**3. Prevent Off-Screen Push**

**Problem:** Keyboard pushes composer top off-screen

**Root Cause:** No max-height constraint when visualViewport changes

**Solution:**
```tsx
// Add visualViewport listener
useEffect(() => {
  if (!window.visualViewport) return

  const handleViewportResize = () => {
    const vh = window.visualViewport.height
    const SAFE_TOP_MARGIN = 60 // Keep close button/handle visible
    const maxHeight = vh - SAFE_TOP_MARGIN

    if (expandedHeight && expandedHeight > maxHeight) {
      setExpandedHeight(maxHeight)
    }
  }

  window.visualViewport.addEventListener('resize', handleViewportResize)
  window.visualViewport.addEventListener('scroll', handleViewportResize)

  return () => {
    window.visualViewport.removeEventListener('resize', handleViewportResize)
    window.visualViewport.removeEventListener('scroll', handleViewportResize)
  }
}, [expandedHeight])

// Update drag end calculation
onDragEnd: (totalDeltaY: number, velocity: number) => {
  const vh = window.visualViewport?.height ?? window.innerHeight
  const maxAllowedHeight = vh - 60 // Safe margin
  const newHeight = Math.min(
    maxAllowedHeight,
    Math.max(MIN_EXPANDED_HEIGHT, dragStartHeightRef.current - totalDeltaY)
  )

  setExpandedHeight(newHeight)
  // ... rest of logic
}
```

**4. Drag Performance Improvement**

**Problem:** Lag during drag with large content

**Root Cause:** React rerenders and CSS reflow on every drag update

**Solution:**
```tsx
// Add transform state for smooth dragging
const [dragTranslateY, setDragTranslateY] = useState(0)

const dragHandlers = useVerticalDrag({
  // ... existing config
  onDrag: (deltaY: number) => {
    // During drag: only update transform (no reflow, no React rerender)
    setDragTranslateY(-deltaY)

    // Calculate what height will be, but don't commit yet
    const targetHeight = dragStartHeightRef.current - deltaY

    // Only transition mode if threshold crossed
    if (dragStartModeRef.current === 'quick' && targetHeight >= MIN_EXPANDED_HEIGHT) {
      if (composerMode !== 'expanded') {
        setComposerMode('expanded')
      }
    }
  },

  onDragEnd: (totalDeltaY: number, velocity: number) => {
    // On drag end: commit to height change, reset transform
    const newHeight = calculateNewHeight(totalDeltaY)
    setExpandedHeight(newHeight)
    setDragTranslateY(0)
    setIsDragging(false)

    // Focus textarea after state settles
    focusTextarea()
  }
})

// In render:
<div
  style={{
    height: isExpanded ? expandedHeight : undefined,
    bottom: 'env(safe-area-inset-bottom, 0px)',
    transform: isDragging ? `translateY(${dragTranslateY}px)` : undefined,
    willChange: isDragging ? 'transform' : undefined,
    transition: isDragging ? 'none' : 'height 0.2s ease-out'
  }}
>
```

**5. TextareaAutosize Integration**

**Replace:**
```tsx
<ComposerPrimitive.Input
  ref={textareaRef}
  maxRows={isExpanded ? undefined : 5}
  // ...
/>
```

**With:**
```tsx
import TextareaAutosize from 'react-textarea-autosize'

<TextareaAutosize
  ref={textareaRef}
  autoFocus={!controlsDisabled && !isTouch}
  placeholder={showContinueHint ? t('misc.typeMessage') : t('misc.typeAMessage')}
  disabled={controlsDisabled}
  maxRows={isExpanded ? 50 : 5}
  minRows={1}
  cacheMeasurements // Performance optimization
  value={inputState.text}
  onChange={handleChange}
  onSelect={handleSelect}
  onKeyDown={handleKeyDown}
  onPaste={handlePaste}
  className={`flex-1 resize-none bg-transparent text-sm leading-snug text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${isExpanded ? 'h-full' : ''}`}
/>
```

### Implementation Changes Summary

| File | Changes |
|------|---------|
| `HappyComposer.tsx` | Fix focus timing, add visualViewport listener, improve drag performance, integrate TextareaAutosize |
| `useVerticalDrag.ts` | Add transform-based dragging (or keep as-is) |
| `index.html` | Already has correct viewport settings ✅ |

### Bundle Impact

- react-textarea-autosize: 1.3KB
- **Total: ~1.3KB increase**

### Pros

✅ Minimal refactoring (same architecture)
✅ Keep exact current UX
✅ Small bundle increase (1.3KB)
✅ Maintain full control over behavior
✅ No new major dependencies
✅ Fixes all 4 identified issues
✅ Better understanding of implementation

### Cons

⚠️ Custom solution (you maintain it)
⚠️ Potential edge cases not discovered in testing
⚠️ visualViewport API not supported in very old browsers
⚠️ More complex code than using library
⚠️ Need to test thoroughly across devices
⚠️ Future Android/iOS changes may require updates

### Implementation Effort

**Estimated Time:** Low-Medium
- Update focus logic in existing code
- Add safe area inset CSS
- Add visualViewport listener
- Update drag logic for performance
- Integrate TextareaAutosize
- Test on Android Chrome, iOS Safari, Desktop

### Risk Level: Medium

- Custom solution requires thorough testing
- Edge cases may emerge in production
- Ongoing maintenance burden
- Need to track Android/iOS platform changes

---

## Comparison Matrix

| Criteria | Vaul + TextareaAutosize | Enhanced Custom |
|----------|-------------------------|-----------------|
| **Bundle Size** | +10KB | +1.3KB |
| **Refactoring** | Moderate | Minimal |
| **Maintenance** | Library maintainers | You |
| **Android Focus Fix** | Built-in, tested | Custom timing fix |
| **Keyboard Handling** | Built-in prop | Custom visualViewport |
| **Performance** | Pre-optimized | Requires optimization |
| **Desktop UX** | Multiple close methods | Keep current double-tap |
| **Battle-Tested** | Yes (Vercel, production) | No |
| **Accessibility** | Built-in (Radix UI) | Current implementation |
| **Learning Curve** | New API | Familiar code |
| **Risk Level** | Low-Medium | Medium |
| **Future-Proof** | Library updates | Manual updates |

---

## Testing Plan

Both approaches will be tested with the same criteria:

### Android Chrome PWA
- [ ] Textarea becomes typeable after drag-to-expand
- [ ] Cursor appears immediately
- [ ] Keyboard shows without delay
- [ ] Keyboard doesn't cover composer content
- [ ] Composer doesn't get pushed off-screen
- [ ] Close button/handle always visible
- [ ] OS nav bar doesn't cover content
- [ ] Smooth drag with 50+ lines of text
- [ ] No lag during typing
- [ ] No layout shifts when keyboard appears/disappears

### iOS Safari PWA
- [ ] Drag gesture works smoothly
- [ ] Keyboard behavior acceptable
- [ ] Safe area insets respected
- [ ] No layout breaks
- [ ] Double-tap to collapse works

### Desktop (Chrome, Firefox, Safari)
- [ ] Drag with mouse works
- [ ] Close button easily accessible
- [ ] Escape key closes (if applicable)
- [ ] Click outside closes (if applicable)
- [ ] Keyboard navigation works
- [ ] No lag with large content

### Performance Metrics
- [ ] First Input Delay < 100ms
- [ ] Drag gesture framerate 60fps
- [ ] No layout thrashing during drag
- [ ] Memory usage stable with large text

---

## Implementation Plan

### Phase 1: Branch Setup
```bash
# Create branches
git checkout main
git pull origin main

# Approach 1
git checkout -b feature/vaul-composer
# Approach 2
git checkout -b feature/enhanced-custom-composer
```

### Phase 2: Parallel Implementation
- Each approach implemented in its branch
- Commit frequently with descriptive messages
- Document any issues or discoveries

### Phase 3: Testing
- Test each branch on Android Chrome PWA
- Test on iOS Safari PWA
- Test on desktop browsers
- Record metrics and observations

### Phase 4: Comparison & Decision
- Side-by-side comparison on actual devices
- Review code complexity
- Evaluate bundle size impact
- Assess maintainability
- Make final decision

### Phase 5: Merge & Deploy
- Merge chosen approach to main
- Clean up alternate branch (keep for reference)
- Update documentation
- Monitor production for issues

---

## Recommendation

**Primary: Approach 1 (Vaul + TextareaAutosize)**

### Reasoning

1. **Battle-tested** - Used by Vercel and major production apps
2. **Active maintenance** - Updated January 2026, ongoing support
3. **Solves all problems** - Focus, keyboard, performance, safe area
4. **Future-proof** - Library maintainers handle platform changes
5. **Accessibility** - Built on Radix UI primitives
6. **Bundle size acceptable** - 10KB for battle-tested solution
7. **Multiple close methods** - Better desktop UX

### Fallback: Approach 2 (Enhanced Custom)

Use if Vaul testing reveals:
- Unacceptable UX differences
- Unsolvable integration issues
- Performance problems
- Bundle size concerns outweigh benefits

---

## Success Criteria

A successful implementation must:
1. ✅ Fix textarea focus on Android Chrome after drag
2. ✅ Prevent OS nav bar from covering content
3. ✅ Prevent composer from being pushed off-screen
4. ✅ Maintain smooth drag with 50+ lines
5. ✅ Keep drag-to-expand gesture
6. ✅ Provide easy desktop close
7. ✅ Pass all testing checklist items
8. ✅ No regressions on iOS or desktop

---

## References

### Vaul
- [Documentation](https://vaul.emilkowal.ski/)
- [GitHub Repository](https://github.com/emilkowalski/vaul)
- [shadcn/ui Drawer Component](https://ui.shadcn.com/docs/components/drawer)
- [Vaul Inputs Example](https://vaul.emilkowal.ski/inputs)

### Chrome Android
- [Edge-to-edge Migration Guide](https://developer.chrome.com/docs/css-ui/edge-to-edge)
- [Viewport Resize Behavior](https://developer.chrome.com/blog/viewport-resize-behavior)
- [Interactive Widget](https://whatpwacando.today/viewport/)

### React Textarea Autosize
- [GitHub Repository](https://github.com/Andarist/react-textarea-autosize)
- [NPM Package](https://www.npmjs.com/package/react-textarea-autosize)

### Related Issues
- [Vaul Issue #294: Mobile Input](https://github.com/emilkowalski/vaul/issues/294)
- [Vaul Issue #255: Virtual Keyboard](https://github.com/emilkowalski/vaul/issues/255)
- [CSS Safe Area Insets](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)

---

## Next Steps

1. ✅ Review this proposal
2. ⏭️ Create implementation branches
3. ⏭️ Implement Approach 1 (Vaul)
4. ⏭️ Implement Approach 2 (Enhanced Custom)
5. ⏭️ Test both on actual devices
6. ⏭️ Compare and decide
7. ⏭️ Merge chosen approach
8. ⏭️ Monitor production
