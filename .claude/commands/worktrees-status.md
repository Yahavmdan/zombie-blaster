---
description: Status of every worktree of this repo - branch, dirty, pushed, behind base, PR, slot lock, free or not
---

Run ONE call and show the table:

```powershell
& "$(git rev-parse --show-toplevel)\.claude\skills\worktrees\wt.ps1" all
```

Columns: `Dirty` = uncommitted files; `Remote` = ahead/behind `origin/<branch>` (`NOT PUSHED`, or
`gone (merged)` when the PR merged and the remote branch was deleted); `BaseBehind` = commits the
base branch (`origin/main`) has that HEAD lacks; `PR` = newest PR of mine for that branch; `Lock` =
pool-slot holder from `wt.ps1 take`; `Free` = YES or the reasons it is not (dirty, locked, primary,
unpushed, branch in progress).

Then one short line per worktree that needs attention (dirty, unpushed, MISSING/prunable, stale lock
on a merged branch) with the fix: `/reset-worktree <name>`, `git worktree prune`, or push.
Do not change anything - this command is read-only.
