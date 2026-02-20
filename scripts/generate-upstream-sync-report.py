#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "anthropic>=0.39.0",
#   "rich>=13.7.0",
# ]
# ///
"""
Generate a comprehensive upstream sync report using Claude AI.

This script analyzes upstream commits, groups related changes, and provides
detailed backporting guidance including compatibility assessment and implementation plans.
"""

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from anthropic import Anthropic
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()


@dataclass
class CommitInfo:
    """Information about a single git commit."""

    sha: str
    short_sha: str
    message: str
    author: str
    date: str
    files_changed: list[str]
    diff_stat: str
    full_diff: str


def run_command(cmd: list[str], check: bool = True) -> str:
    """Run a shell command and return output."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=check, encoding="utf-8"
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error running command: {' '.join(cmd)}[/red]")
        console.print(f"[red]Error: {e.stderr}[/red]")
        raise


def get_merge_base() -> str:
    """Get the merge base between main and upstream/main."""
    return run_command(["git", "merge-base", "main", "upstream/main"])


def resolve_sha(sha: str) -> str | None:
    """Resolve a short or full SHA to a full 40-char SHA. Returns None if unresolvable."""
    try:
        return run_command(["git", "rev-parse", "--verify", sha])
    except subprocess.CalledProcessError:
        console.print(f"[yellow]Warning: could not resolve SHA '{sha}', skipping[/yellow]")
        return None


def parse_backport_footer(value: str) -> list[str]:
    """Parse the value of a Backport: footer line into a list of entries.

    Each entry is either a single SHA or a range in the form 'old_sha...new_sha'.
    Example input: ' sha1...sha2, sha3, sha4...sha5 '
    """
    return [entry.strip() for entry in value.split(",") if entry.strip()]


def get_handled_upstream_shas(merge_base: str) -> set[str]:
    """Scan our commits for Backport: footers and return the set of upstream SHAs they cover."""
    handled: set[str] = set()

    # Get full commit messages for all our commits since the fork
    log_output = run_command(
        ["git", "log", "--format=%B%x00", f"{merge_base}..main"]
    )

    for commit_body in log_output.split("\x00"):
        for line in commit_body.splitlines():
            if not line.startswith("Backport:"):
                continue
            value = line[len("Backport:"):].strip()
            for entry in parse_backport_footer(value):
                if "..." in entry:
                    # Range: old_sha...new_sha — expand to all commits inclusive
                    parts = entry.split("...", 1)
                    old_sha, new_sha = parts[0].strip(), parts[1].strip()
                    old_full = resolve_sha(old_sha)
                    new_full = resolve_sha(new_sha)
                    if old_full is None or new_full is None:
                        continue
                    # git log old^..new gives all commits inclusive of both ends
                    range_output = run_command(
                        ["git", "log", "--format=%H", f"{old_full}^..{new_full}"],
                        check=False,
                    )
                    for sha in range_output.splitlines():
                        if sha:
                            handled.add(sha)
                else:
                    # Single SHA
                    full = resolve_sha(entry)
                    if full:
                        handled.add(full)

    return handled


def get_upstream_commits(merge_base: str, handled: set[str]) -> list[str]:
    """Get list of upstream commit SHAs not yet handled by our fork."""
    commits = run_command(
        ["git", "log", "--oneline", "--no-merges", f"{merge_base}..upstream/main"]
    )
    all_shas = [line.split()[0] for line in commits.split("\n") if line]

    # Filter out already-handled commits (resolve short SHAs to full for comparison)
    unhandled = []
    for short_sha in all_shas:
        full = resolve_sha(short_sha)
        if full and full in handled:
            continue
        unhandled.append(short_sha)

    return unhandled


def get_commit_info(sha: str) -> CommitInfo:
    """Get detailed information about a commit."""
    # Get basic info
    message = run_command(["git", "log", "-1", "--format=%s", sha])
    author = run_command(["git", "log", "-1", "--format=%an <%ae>", sha])
    date = run_command(["git", "log", "-1", "--format=%ai", sha])
    short_sha = run_command(["git", "rev-parse", "--short", sha])

    # Get files changed
    files = run_command(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha])
    files_changed = [f for f in files.split("\n") if f]

    # Get diff stat
    diff_stat = run_command(["git", "show", "--stat", "--format=", sha])

    # Get full diff (limit to reasonable size)
    full_diff = run_command(["git", "show", "--format=%B", sha])

    return CommitInfo(
        sha=sha,
        short_sha=short_sha,
        message=message,
        author=author,
        date=date,
        files_changed=files_changed,
        diff_stat=diff_stat,
        full_diff=full_diff[:50000],  # Limit diff size to avoid token limits
    )


def get_our_commits(merge_base: str) -> list[CommitInfo]:
    """Get list of our commits since fork."""
    shas = run_command(
        ["git", "log", "--oneline", "--no-merges", f"{merge_base}..main"]
    )
    commits = []
    for line in shas.split("\n"):
        if not line:
            continue
        sha = line.split()[0]
        commits.append(get_commit_info(sha))
    return commits


def check_upstream_remote() -> bool:
    """Check if upstream remote exists and fetch it."""
    remotes = run_command(["git", "remote"], check=False)
    if "upstream" not in remotes.split("\n"):
        console.print("[yellow]Upstream remote not found. Adding it...[/yellow]")
        run_command(["git", "remote", "add", "upstream", "https://github.com/tiann/hapi"])

    console.print("[cyan]Fetching upstream/main...[/cyan]")
    run_command(["git", "fetch", "upstream", "main"])
    return True


def generate_report_with_claude(
    upstream_commits: list[CommitInfo],
    our_commits: list[CommitInfo],
    merge_base: str,
) -> str:
    """Generate comprehensive sync report using Claude."""
    # Use default Anthropic client which will use ANTHROPIC_API_KEY from environment
    # This assumes we're running in an authenticated Claude Code environment
    client = Anthropic()

    # Prepare upstream commits data
    upstream_data = []
    for commit in upstream_commits:
        upstream_data.append(
            {
                "sha": commit.sha,
                "short_sha": commit.short_sha,
                "message": commit.message,
                "author": commit.author,
                "date": commit.date,
                "files_changed": commit.files_changed,
                "diff_stat": commit.diff_stat,
                "diff": commit.full_diff[:10000],  # Limit per-commit diff
            }
        )

    # Prepare our commits summary (for conflict detection)
    our_commits_summary = []
    for commit in our_commits[:50]:  # Limit to recent 50 commits
        our_commits_summary.append(
            {
                "sha": commit.short_sha,
                "message": commit.message,
                "files_changed": commit.files_changed,
            }
        )

    prompt = f"""You are analyzing upstream commits from a forked repository to generate a comprehensive sync report.

# Context

**Merge Base**: `{merge_base}`
**Number of upstream commits**: {len(upstream_commits)}
**Number of our commits since fork**: {len(our_commits)}

# Our Recent Commits (for conflict detection)

{json.dumps(our_commits_summary, indent=2)}

# Upstream Commits to Analyze

{json.dumps(upstream_data, indent=2)}

# Task

Generate a comprehensive upstream sync report following this structure:

## 1. Executive Summary Table

Create a markdown table with these columns:
- **Group** (e.g., "Session Resume", "UI Enhancements", "Bug Fixes")
- **Commits** (count and SHAs)
- **Backport Strategy** (Cherry-pick / Reimplement / Skip / Partial)
- **Conflict Risk** (🔴 High / 🟡 Medium / 🟢 Low)
- **Priority** (High / Medium / Low)
- **Estimated Effort** (hours)

Group related commits together (e.g., feature + its fixes, related refactorings).

## 2. Detailed Analysis by Group

For each group of related commits, provide:

### Group Name (e.g., "Session Resume Feature")

**Commits**: List all commit SHAs and messages in this group

**What It Does**: 2-3 sentence summary of the changes

**Files Modified**: Key files changed

**Compatibility Analysis**:
- Does this conflict with our fork's changes?
- Which of our commits touch the same areas?
- What are the specific conflict points?

**Backport Strategy**:
- **Recommended approach**: Cherry-pick / Reimplement / Skip / Partial adoption
- **Why**: Reasoning for the recommendation
- **If cherry-pick**: Expected conflicts and resolution strategy
- **If reimplement**: Key aspects to port and what to skip
- **If skip**: Clear justification

**Implementation Plan**:
1. Step-by-step instructions
2. Files to modify
3. Testing approach
4. Validation criteria

**Conflict Risk**: 🔴/🟡/🟢 with explanation

**Estimated Effort**: X-Y hours with breakdown

**Dependencies**: Other commits/groups that should be done first

## 3. Prioritized Backport Checklist

Create a prioritized checklist format:

```markdown
### Phase 1: Quick Wins (Low Risk, High Value)
- [ ] Group A: Description (🟢 Low risk, 1-2h)
- [ ] Group B: Description (🟢 Low risk, 1h)

### Phase 2: Important Features (Medium Risk)
- [ ] Group C: Description (🟡 Medium risk, 3-4h)

### Phase 3: Consider Later (High Risk or Low Value)
- [ ] Group D: Description (🔴 High risk, 8-12h)

### Skip (Not Applicable or Superseded)
- [ ] ~~Group E~~: Reason for skipping
```

# Important Guidelines

1. **Group semantically related commits**: Feature + fixes + related refactorings
2. **Be specific about conflicts**: Name exact files and our commits that conflict
3. **Provide actionable plans**: Step-by-step, not vague guidance
4. **Estimate realistically**: Consider our fork's complexity
5. **Prioritize pragmatically**: Balance value vs. effort vs. risk
6. **Identify dependencies**: Some changes might depend on others

Generate the complete report now."""

    console.print("[cyan]Analyzing commits with Claude...[/cyan]")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Generating report...", total=None)

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=16000,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )

        progress.update(task, completed=True)

    return message.content[0].text


def main() -> None:
    """Main entry point."""
    console.print("[bold cyan]Upstream Sync Report Generator[/bold cyan]\n")

    # Check if we're in a git repo
    try:
        run_command(["git", "rev-parse", "--git-dir"])
    except subprocess.CalledProcessError:
        console.print("[red]Error: Not in a git repository[/red]")
        sys.exit(1)

    # Ensure we're at repo root
    repo_root = Path(run_command(["git", "rev-parse", "--show-toplevel"]))
    os.chdir(repo_root)
    console.print(f"[cyan]Working directory: {repo_root}[/cyan]\n")

    # Check and fetch upstream
    check_upstream_remote()

    # Get merge base
    console.print("[cyan]Finding merge base...[/cyan]")
    merge_base = get_merge_base()
    console.print(f"[green]Merge base: {merge_base}[/green]\n")

    # Scan our commits for already-handled upstream SHAs
    console.print("[cyan]Scanning for already-handled upstream commits...[/cyan]")
    handled = get_handled_upstream_shas(merge_base)
    if handled:
        console.print(f"[green]Found {len(handled)} already-handled upstream commits[/green]\n")
    else:
        console.print("[dim]No Backport: footers found yet[/dim]\n")

    # Get upstream commits, filtering out handled ones
    console.print("[cyan]Collecting upstream commits...[/cyan]")
    all_upstream_shas = run_command(
        ["git", "log", "--oneline", "--no-merges", f"{merge_base}..upstream/main"]
    )
    total_upstream = len([l for l in all_upstream_shas.split("\n") if l])
    upstream_shas = get_upstream_commits(merge_base, handled)
    filtered_count = total_upstream - len(upstream_shas)

    if filtered_count:
        console.print(
            f"[green]Found {total_upstream} upstream commits "
            f"({filtered_count} already handled, {len(upstream_shas)} remaining)[/green]\n"
        )
    else:
        console.print(f"[green]Found {len(upstream_shas)} upstream commits[/green]\n")

    if not upstream_shas:
        console.print("[bold green]✓ All upstream commits have been handled. Nothing to report.[/bold green]")
        return

    # Get detailed info for each upstream commit
    upstream_commits = []
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task(
            f"Analyzing {len(upstream_shas)} commits...", total=len(upstream_shas)
        )
        for sha in upstream_shas:
            upstream_commits.append(get_commit_info(sha))
            progress.advance(task)

    console.print()

    # Get our commits
    console.print("[cyan]Collecting our commits...[/cyan]")
    our_commits = get_our_commits(merge_base)
    console.print(f"[green]Found {len(our_commits)} of our commits[/green]\n")

    # Generate report with Claude
    report = generate_report_with_claude(upstream_commits, our_commits, merge_base)

    # Save report
    output_file = repo_root / "UPSTREAM_SYNC_REPORT.md"
    output_file.write_text(report, encoding="utf-8")

    console.print(f"\n[bold green]✓ Report generated: {output_file}[/bold green]")
    console.print("\n[cyan]Preview:[/cyan]\n")
    console.print(report[:1000] + "...\n")
    console.print(f"[cyan]Full report saved to: {output_file}[/cyan]")


if __name__ == "__main__":
    main()
