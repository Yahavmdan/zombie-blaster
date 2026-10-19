---
description: Status of every worktree of this repo - branch, dirty, pushed, behind base, PR, slot lock, ports, free or not
---

Run ONE call:

```powershell
& "$(git rev-parse --show-toplevel)\.claude\skills\worktrees\wt.ps1" all -Markdown
```

The script prints the two markdown tables. Copy its output into your reply exactly as it is - do not
put it in a code block, do not reformat it, and add nothing before it. The script keeps every row under
100 characters, because a wider table wraps in the terminal and shows as raw `|` text.

First table, one row per worktree:

- `Dirty` = uncommitted files.
- `Remote` = ahead/behind `origin/<branch>` (`NOT PUSHED`, or `gone (merged)` when the PR merged and
  the remote branch was deleted).
- `Behind` = commits the base branch (`origin/main`) has that HEAD lacks.
- `Last` = age of the last commit. `PR` = newest PR of mine for that branch. `Lock` = time the slot
  was taken with `wt.ps1 take`.
- `Ports web/api` = the worktree's dev-server ports (`web N*1111`, `api N*1111+1`, reserved ports
  skipped) and whether something listens on each (`up`/`dn`).
- `Free` = ✅ (free), ❌ (not free), or `primary` (the primary checkout is never handed out as a slot).

Second table: one row per worktree that needs attention (dirty, unpushed, MISSING/prunable, locked on
a merged branch), with the fix. When nothing needs attention, the script prints
`Nothing needs attention.` in its place.

When the full console view is necessary (lock holder names, the reasons a slot is not free), run
`wt.ps1 all` without `-Markdown`.

Do not change anything - this command is read-only.
