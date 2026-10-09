---
description: Reset this repo's worktree(s) to the fresh base branch, ready for a new task - asks all or a specific one
argument-hint: [all | worktree name, e.g. zombie-blaster-2]
---

Script: `$wt = "$(git rev-parse --show-toplevel)\.claude\skills\worktrees\wt.ps1"` (skill `worktrees`).

## 1. Which ones

If `$ARGUMENTS` already says `all` or names a worktree, use it. Otherwise run `& $wt all` and ask
with AskUserQuestion: **All worktrees** (recommended only when the table shows no dirty /
in-progress ones), or each worktree by name (multiSelect). Show each option's `Free` column in its
description.

## 2. Reset (one call per target, or `all`)

```powershell
& $wt reset <all|name>
```

What it does per worktree:
- fetches; the worktree on the base branch (e.g. `main`) gets `git pull --ff-only`; every other
  worktree is switched to **detached `origin/<base>`** (git cannot check the base branch out
  twice). The old branch stays as a local branch - nothing is deleted.
- removes the pool lock, copies the git-ignored files listed in `local-files.txt`, re-syncs
  `node_modules` when a lockfile changed (`-NoDeps` to skip).
- **SKIPS** a dirty tree (never discards changes), a locked slot (`-Force` overrides), and a
  missing/prunable one. `all` skips the primary checkout when it is not on the base branch; reset
  it only when named explicitly.

## 3. Report

One line per worktree: OK / SKIP + reason. For each SKIP ask what to do - never pass `-Force`,
stash, `git restore`, or `git worktree prune` without the user saying so for that worktree:
- DIRTY: commit+push, or discard (user must say "discard" for that worktree).
- locked: the slot may belong to another live session - confirm before `-Force`.
- "no origin copy" note: the old branch was never pushed (or was deleted after merge) - mention it.

$ARGUMENTS
