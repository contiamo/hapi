# Upstream Sync Report Generator

Automated tool that uses Claude AI to analyze upstream commits and generate comprehensive backporting guidance.

## Features

- **Semantic grouping**: Automatically groups related commits (features + fixes + refactorings)
- **Conflict detection**: Identifies conflicts with your fork's changes
- **Backport strategies**: Recommends cherry-pick, reimplement, or skip for each group
- **Risk assessment**: Rates conflict risk (🔴 High / 🟡 Medium / 🟢 Low)
- **Prioritization**: Organizes changes by value and effort
- **Actionable plans**: Provides step-by-step implementation guidance

## Backport Tracking

When a backport commit is created on our fork, add a `Backport:` footer to the commit message
listing the upstream SHA(s) it covers. The report generator reads these footers and excludes
those upstream commits from future reports.

### Footer format

```
feat: add font size setting

Port of upstream font size feature, adapted for our settings layout.

Backport: efbe4f8...308249a,61dd69d
```

- Comma-separated list of entries
- Each entry is either a **single SHA** or an **inclusive range** `old_sha...new_sha`
  (`old_sha` is the older commit on `upstream/main`, `new_sha` is the newer one)
- Short (7-char) or full (40-char) SHAs are both accepted
- Use a range when one backport commit covers multiple upstream commits — for example a feature
  and its follow-up fixes that were all addressed together in a single reimplementation

A commit that is intentionally **not** backported simply never gets a footer — it will reappear
in future reports, which is the right behaviour (reviewers decide each week what to do with it).

## Prerequisites

1. **Python 3.11+** with `uv` installed
2. **Claude Code session** (script uses your existing Claude authentication)
3. **Git repository** with `upstream` remote configured

## Setup

### 1. Verify upstream remote

```bash
git remote -v | grep upstream
# Should show: upstream https://github.com/tiann/hapi (fetch)
```

If not configured, the script will add it automatically.

## Usage

### Basic Usage

From the repository root:

```bash
uv run scripts/generate-upstream-sync-report.py
```

This will:
1. Fetch latest upstream commits
2. Analyze commit history and diffs
3. Generate comprehensive report using Claude
4. Save to `UPSTREAM_SYNC_REPORT.md`

### Output

The script generates a markdown report with:

1. **Executive Summary Table**
   - Groups of related commits
   - Backport strategy recommendations
   - Conflict risk ratings
   - Priority levels
   - Time estimates

2. **Detailed Analysis by Group**
   - What each group does
   - Files modified
   - Compatibility with your fork
   - Step-by-step backport plans
   - Conflict resolution strategies

3. **Prioritized Checklist**
   - Phase 1: Quick wins (low risk)
   - Phase 2: Important features
   - Phase 3: Consider later
   - Skip: Not applicable changes

### Example Output

```markdown
# Upstream Sync Report

## Executive Summary

| Group | Commits | Strategy | Risk | Priority | Effort |
|-------|---------|----------|------|----------|--------|
| Protocol Version Detection | 1b22fe0 | Cherry-pick | 🟢 Low | High | 1h |
| Session Resume | 87c79c3 | Skip | 🔴 High | Low | - |
| Font Size Setting | efbe4f8 | Cherry-pick | 🟢 Low | Medium | 1h |

## Detailed Analysis

### Protocol Version Detection

**Commits**:
- `1b22fe0` feat: add CLI-server protocol version mismatch detection

**What It Does**:
Adds protocol version checking between CLI and server to prevent compatibility issues...

**Compatibility Analysis**:
No conflicts detected. We don't have protocol version checking...

**Backport Strategy**: Cherry-pick recommended
- Clean cherry-pick expected
- Minimal conflict risk
- High value for stability

**Implementation Plan**:
1. Cherry-pick commit: `git cherry-pick -x 1b22fe0`
2. Run tests: `pnpm test`
3. Verify version mismatch handling manually
...
```

## Integration with Weekly Workflow

### Weekly Sync Process

1. **Generate report** (5 minutes)
   ```bash
   uv run scripts/generate-upstream-sync-report.py
   ```

2. **Review report** (15-20 minutes)
   - Read executive summary table
   - Identify Phase 1 quick wins
   - Check for critical bug fixes

3. **Execute backports** (30-60 minutes)
   ```bash
   git checkout -b upstream-sync-$(date +%Y-%m-%d)

   # Follow implementation plans from report
   git cherry-pick -x <sha>
   # or reimplement as guided

   pnpm test
   ```

4. **Update sync log** (5 minutes)
   - Document what was backported
   - Record any deviations from plan
   - Note lessons learned

### GitHub Actions Automation

A GitHub Actions workflow is included that runs weekly and creates an issue with the report.

**Setup:**

1. **Add Anthropic API key as repository secret**:
   - Go to repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key from https://console.anthropic.com/

2. **Workflow will run automatically**:
   - Every Monday at 9 AM UTC
   - Can also be triggered manually via Actions tab

**What it does:**
- Fetches upstream commits
- Generates comprehensive sync report
- Creates or updates a GitHub issue with the report
- Uploads full report as workflow artifact
- Adds helpful checklist and quick action links

**Issue created includes:**
- Report preview (first 3000 characters)
- Link to download full report artifact
- Next steps checklist
- Links to sync strategy and log documents

See `.github/workflows/weekly-upstream-sync-report.yml` for details.

## Customization

### Adjusting Analysis Depth

Edit the script to change limits:

```python
# Line ~140: Limit diff size per commit
"diff": commit.full_diff[:10000],  # Increase for more context

# Line ~150: Limit our commits analyzed
for commit in our_commits[:50]:  # Increase to analyze more history
```

### Customizing Prompt

Modify the prompt in `generate_report_with_claude()` to:
- Add specific focus areas
- Request different output format
- Include project-specific context
- Adjust grouping criteria

### Changing Claude Model

```python
message = client.messages.create(
    model="claude-opus-4-20250514",  # Use Opus for deeper analysis
    max_tokens=32000,  # Increase for longer reports
    ...
)
```

## Cost Estimation

Approximate costs per run (using Claude Sonnet 4.5):

- **Input tokens**: ~50k-100k (varies with number of commits)
- **Output tokens**: ~15k-20k (comprehensive report)
- **Cost per run**: $0.50-$1.50

For weekly runs: ~$2-6/month

## Troubleshooting

### "ANTHROPIC_API_KEY not found"

The script uses your Claude Code authentication. If you're running outside of Claude Code:
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

### "Not in a git repository"

Run the script from within your git repository.

### "upstream remote not found"

The script will automatically add it. If it fails:
```bash
git remote add upstream https://github.com/tiann/hapi
```

### "Upstream commits not found"

Fetch upstream:
```bash
git fetch upstream main
```

### Report is incomplete

If you have many commits, the analysis might hit token limits. Either:
- Reduce the diff limit per commit
- Run analysis on smaller commit ranges
- Use Claude Opus with higher token limit

### Rate limit errors

If you hit Anthropic API rate limits:
- Wait a few minutes and retry
- Reduce the number of commits analyzed
- Use a higher tier API plan

## Advanced Usage

### Analyze Specific Commit Range

Modify the script to analyze a subset:

```python
# In get_upstream_commits(), change the range:
commits = run_command([
    "git", "log", "--oneline", "--no-merges",
    "abc1234..xyz5678"  # Specific range
])
```

### Compare with Different Base Branch

```python
# In get_merge_base():
return run_command(["git", "merge-base", "develop", "upstream/develop"])
```

### Generate Report for Specific Groups

Add filtering logic before calling Claude:

```python
# Filter only bug fixes
upstream_commits = [
    c for c in upstream_commits
    if "fix" in c.message.lower()
]
```

## Tips for Best Results

1. **Run weekly**: Fresh analysis catches changes before they pile up
2. **Review before executing**: Don't blindly follow recommendations
3. **Update sync log**: Track what you actually did vs. what was recommended
4. **Iterate on prompts**: Adjust based on report quality
5. **Combine with manual review**: Use report as guidance, not gospel

## Contributing

To improve the script:

1. Fork and create feature branch
2. Test changes with real upstream commits
3. Verify report quality
4. Submit PR with example output

## License

Same as parent project (HAPI)
