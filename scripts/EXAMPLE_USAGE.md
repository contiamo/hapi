# Example Usage: Upstream Sync Report Generator

## Quick Start

From the repository root in Claude Code:

```bash
uv run scripts/generate-upstream-sync-report.py
```

That's it! The script will:
1. Auto-detect you're authenticated through Claude Code
2. Fetch upstream commits
3. Analyze with Claude AI
4. Generate `UPSTREAM_SYNC_REPORT.md`

## Example Workflow

### Week 1: First Run

```bash
# Generate initial report
$ uv run scripts/generate-upstream-sync-report.py

Upstream Sync Report Generator

Working directory: /path/to/hapi
Fetching upstream/main...
Finding merge base...
Merge base: 6acde5a9b990fe467b404b8eedf51e23142fca87

Collecting upstream commits...
Found 43 upstream commits

  Analyzing 43 commits...

Collecting our commits...
Found 59 of our commits

Analyzing commits with Claude...
  Generating report...

✓ Report generated: UPSTREAM_SYNC_REPORT.md
```

### Review the Report

```bash
$ head -100 UPSTREAM_SYNC_REPORT.md
```

The report will show something like:

```markdown
# Upstream Sync Report

Generated: 2026-02-09

## Executive Summary

| Group | Commits | Strategy | Risk | Priority | Effort |
|-------|---------|----------|------|----------|--------|
| Protocol Version Check | 1b22fe0 | Cherry-pick | 🟢 Low | High | 1h |
| Reconnecting Banner | 5b27f6b | Cherry-pick | 🟢 Low | High | 1h |
| Font Size Setting | efbe4f8 | Cherry-pick | 🟢 Low | Medium | 1h |
| Session Resume | 87c79c3 | Skip | 🔴 High | Low | - |
| About Section | 7cad11c | Cherry-pick | 🟡 Medium | Medium | 2h |
...

## Quick Wins (Phase 1)

### Protocol Version Mismatch Detection

**Commits**: 1b22fe0

**What It Does**:
Adds version checking between CLI and server to detect incompatibilities...

**Backport Strategy**: Cherry-pick
- Clean cherry-pick expected
- No conflicts with our changes
- Adds shared/src/version.ts with PROTOCOL_VERSION constant

**Implementation Plan**:
1. Create sync branch: `git checkout -b upstream-sync-2026-02-09`
2. Cherry-pick: `git cherry-pick -x 1b22fe0`
3. Test: `pnpm test`
4. Verify: Test version mismatch manually
5. Commit if passing

**Risk**: 🟢 Low - New file, no conflicts
**Effort**: 1 hour
```

### Execute the Plan

```bash
# Create sync branch
$ git checkout -b upstream-sync-2026-02-09

# Follow Phase 1 from report
$ git cherry-pick -x 1b22fe0  # Protocol version
$ git cherry-pick -x 5b27f6b  # Reconnecting banner
$ git cherry-pick -x efbe4f8  # Font size setting

# Test
$ pnpm test

# If all good, create PR
$ gh pr create --title "Sync upstream: protocol version, reconnecting banner, font size" \
  --body "Phase 1 quick wins from upstream sync report"
```

### Week 2: Incremental Sync

```bash
# Generate updated report
$ uv run scripts/generate-upstream-sync-report.py

# Report now shows only NEW commits since last sync
# Continue with Phase 2 items...
```

## Real-World Example Output

Here's an excerpt from an actual report showing grouped commits:

```markdown
### Font Scaling Improvements (2 commits)

**Commits**:
- `308249a` fix(web): improve font scale compatibility and defaults
- `efbe4f8` feat(web): add font size setting

**What It Does**:
Adds a font size selector in settings and improves default font scaling
across different devices. Fixes issues with font rendering on mobile.

**Files Modified**:
- web/src/routes/settings/index.tsx (settings UI)
- web/src/hooks/useFontScale.ts (NEW - 116 lines)
- web/src/lib/terminalFont.ts (font loading)
- web/src/index.css (CSS variables)

**Compatibility Analysis**:
Potential conflict with our settings page changes:
- We added: PWA controls, base paths management
- Upstream added: Font size selector, About section
- Overlap: Both modify settings/index.tsx

Our commits that touched settings:
- `1d1298d` feat: add PWA force update controls
- `aa91b75` feat: add base paths management UI

**Backport Strategy**: Cherry-pick with conflict resolution

**Implementation Plan**:
1. Cherry-pick first commit: `git cherry-pick -x 308249a`
   - Likely clean, only touches font utils
2. Cherry-pick second commit: `git cherry-pick -x efbe4f8`
   - Will conflict in settings/index.tsx
   - Resolution: Add font size selector ABOVE our PWA controls section
3. Test font scaling on desktop and mobile
4. Verify existing settings (PWA, base paths) still work

**Conflict Resolution**:
```typescript
// In settings/index.tsx, merge like this:
<SettingsSection>
  {/* Upstream's font size setting */}
  <FontSizeSetting />

  {/* Our PWA controls */}
  <PWAControls />

  {/* Our base paths */}
  <BasePathsManager />
</SettingsSection>
```

**Risk**: 🟡 Medium - Settings conflict, but straightforward resolution
**Effort**: 2 hours (includes testing)
**Dependencies**: None - can be done independently
```

## Tips for Using Reports

### 1. Start with Executive Summary

Scan the table to understand:
- What categories of changes exist
- Which are low-risk quick wins
- Which require more effort

### 2. Tackle Quick Wins First

Look for:
- 🟢 Low risk
- High or Medium priority
- Short time estimates (1-2h)

Build confidence with easy wins before tackling complex changes.

### 3. Group Related Work

If the report groups commits (feature + fixes), backport them together:

```bash
# Example: All font-related changes together
git cherry-pick -x 308249a  # font compatibility
git cherry-pick -x efbe4f8  # font size setting
git cherry-pick -x 61dd69d  # nerd font support
```

### 4. Track Your Deviations

If you deviate from the plan, note why:

```bash
# In UPSTREAM_SYNC_LOG.md
## 2026-02-09

### Cherry-Picked
- `308249a`, `efbe4f8`: Font improvements
  - Deviated from plan: Skipped nerd font (61dd69d) - too large
  - Conflict resolution: Merged settings sections differently than suggested
```

### 5. Regenerate Periodically

Run weekly to catch new changes:

```bash
# Monday morning routine
uv run scripts/generate-upstream-sync-report.py
# Review new items
# Execute Phase 1 if any
```

## Cost Tracking

Each report run uses Claude API:
- ~50k-100k input tokens (commits + diffs)
- ~15k-20k output tokens (report)
- Cost: ~$0.50-$1.50 per run

Weekly runs: ~$2-6/month

To see token usage, check the Anthropic console after running.

## Iterating on Reports

If reports aren't giving you what you need:

### More Detail on Specific Area

Edit the prompt to focus:

```python
# In generate_report_with_claude()
prompt = f"""...
Pay special attention to:
- Web UI changes and their UX impact
- Changes affecting session management
- Performance improvements
...
"""
```

### Different Grouping Strategy

Adjust grouping instructions:

```python
prompt = f"""...
Group commits by:
1. Bug fixes (anything with 'fix:')
2. Features (anything with 'feat:')
3. Refactorings
Rather than semantic feature grouping
...
"""
```

### Shorter Reports

Limit analysis scope:

```python
# Only analyze recent 20 commits
upstream_commits = upstream_commits[:20]
```

## Next Steps

After reviewing your first report:

1. **Execute Phase 1** items (quick wins)
2. **Update sync log** with what you actually did
3. **Schedule weekly regeneration** (e.g., Monday mornings)
4. **Iterate on prompts** if report quality needs improvement
5. **Share patterns** with team if useful

Happy syncing! 🚀
