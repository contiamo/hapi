# Setup Guide: Automated Upstream Sync

Quick guide to enable automated weekly upstream sync reports.

## What This Adds

✅ **Python script** that analyzes upstream commits using Claude AI
✅ **GitHub Action** that runs weekly and creates issues with reports
✅ **Comprehensive documentation** for manual and automated workflows

## Setup Steps

### 1. Merge This PR

Once this PR is merged to `main`, the automation will be available.

### 2. Add Anthropic API Key to Repository Secrets

Required for the GitHub Action to work:

1. **Get an Anthropic API key**:
   - Go to https://console.anthropic.com/
   - Create account or log in
   - Navigate to API Keys section
   - Create a new key

2. **Add to GitHub repository**:
   - Go to repository: https://github.com/LucasRoesler/hapi/settings/secrets/actions
   - Click "New repository secret"
   - Name: `ANTHROPIC_API_KEY`
   - Value: Paste your API key
   - Click "Add secret"

### 3. Done!

The workflow will automatically:
- Run every Monday at 9 AM UTC
- Generate upstream sync analysis
- Create/update GitHub issue with report
- Upload full report as artifact

## Manual Usage

You can also run the script manually anytime:

```bash
# From repository root
uv run scripts/generate-upstream-sync-report.py

# Output: UPSTREAM_SYNC_REPORT.md
```

**Cost**: ~$0.50-1.50 per run

## Workflow Triggers

The GitHub Action can be triggered:

1. **Automatically**: Every Monday at 9 AM UTC
2. **Manually**:
   - Go to Actions tab
   - Select "Weekly Upstream Sync Report"
   - Click "Run workflow"

## What to Expect

### First Run

After merging and adding the API key, the first Monday you'll get:

1. **GitHub Issue** created with label `upstream-sync`
   - Title: "Weekly Upstream Sync Report - YYYY-MM-DD"
   - Body: Report preview + checklist + links

2. **Workflow Artifact** with full report
   - Downloadable from Actions tab
   - Retained for 30 days

3. **Example Issue Content**:
   ```markdown
   ## 📦 Upstream Sync Report Available

   ### Quick Actions
   - 📥 Download full report artifact
   - 📖 Read upstream sync strategy
   - 📝 View sync log

   ### Report Preview
   [First 3000 characters of report]

   ### 📋 Next Steps Checklist
   - [ ] Review executive summary
   - [ ] Identify Phase 1 quick wins
   - [ ] Create sync branch
   - [ ] Execute backports
   - [ ] Update sync log
   - [ ] Create PR
   - [ ] Close this issue
   ```

### Subsequent Runs

- If previous issue is less than 1 week old: Updates that issue
- If previous issue is older than 1 week: Creates new issue
- Prevents issue spam by reusing recent issues

## Weekly Sync Workflow

Once automated:

1. **Monday morning**: Check for new GitHub issue
2. **Review report**: Click artifact link to download full report
3. **Identify quick wins**: Look at Phase 1 items
4. **Execute backports**: Follow implementation plans
5. **Update sync log**: Document what you did
6. **Close issue**: Mark as done

**Time commitment**: 30-60 minutes per week

## Cost

### Manual Runs
- ~$0.50-1.50 per run (Claude API usage)
- Only when you manually run the script

### Automated Weekly Runs
- ~$2-6 per month
- Runs automatically every Monday

## Troubleshooting

### Workflow fails with "ANTHROPIC_API_KEY not found"

The secret wasn't added correctly:
1. Verify at: Settings → Secrets → Actions
2. Name must be exactly: `ANTHROPIC_API_KEY`
3. Delete and re-add if needed

### No issue is created

1. Check workflow run in Actions tab
2. Look for errors in logs
3. Verify `repo` scope in GITHUB_TOKEN (should be automatic)

### Want to test before Monday

Manually trigger the workflow:
1. Go to Actions tab
2. Select "Weekly Upstream Sync Report"
3. Click "Run workflow" → "Run workflow"

## Documentation

Full documentation available:

- **scripts/README.md**: Complete usage guide
- **scripts/EXAMPLE_USAGE.md**: Real-world examples
- **UPSTREAM_SYNC_STRATEGY.md**: Overall sync strategy
- **UPSTREAM_SYNC_QUICKSTART.md**: Quick reference
- **UPSTREAM_SYNC_LOG.md**: Track sync history

## Disabling Automation

If you want to disable weekly runs:

1. Edit `.github/workflows/weekly-upstream-sync-report.yml`
2. Comment out or remove the `schedule:` section
3. Keep `workflow_dispatch:` for manual triggering

## Questions?

- Review the comprehensive docs in `scripts/README.md`
- Check example workflows in `scripts/EXAMPLE_USAGE.md`
- See sync strategy in `UPSTREAM_SYNC_STRATEGY.md`

Happy syncing! 🚀
