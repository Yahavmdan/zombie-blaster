---
name: worktrees
description: Use when starting work on a branch/task that needs its own worktree so several sessions can work on this repo at once, or when the user asks for a worktree, a free slot, worktree status, resetting worktrees, or to avoid reinstalling node_modules. Reuses fixed sibling pool slots (<repo>-2, <repo>-3, ...) whose node_modules persist; only re-syncs deps when a lockfile changed.
---

# Worktree pool

Never `git worktree add` + `npm ci` per task. Take a slot from the pool. The script works for any
repo it sits in: the primary checkout, the slot names (`<repo-folder>-<n>` next to it, the primary
counts as 1) and the base branch (`origin/HEAD`, else `origin/main`, else `origin/master`) are derived.

```powershell
$wt = "$(git rev-parse --show-toplevel)\.claude\skills\worktrees\wt.ps1"
& $wt take feat/some-slug           # prints: READY <root>\<repo>-N (feat/some-slug)
& $wt take                          # free slot detached at the base; branch it later inside the slot
& $wt status                        # slots, branch, who holds them, dirty count
& $wt all                           # every worktree: dirty, pushed, behind base, PR, lock, Free
& $wt release <repo>-N              # done: unlock + detach HEAD (refuses if dirty; -Force overrides)
& $wt reset <all|name>              # clean worktree(s) -> latest base, unlock, re-sync deps
& $wt sync <repo>-N [-Clean]        # re-sync deps
& $wt init -Count 3                 # grow the pool (new slots get a clean npm ci)
```

Commands wrapping it: `/find-free-worktree-and <task>`, `/worktrees-status`, `/reset-worktree`.

- `take`: fetches, picks a free clean slot (prefers one already on that branch, then a detached
  one), switches to the existing local/remote branch or creates it from `-Base` (`--no-track`).
- Deps: every folder with a tracked `package-lock.json` (root and sub-apps). Hash of the lockfile +
  `patches/*` is stamped in `<folder>\node_modules\.wt-deps-hash`. Same hash = no install.
  Different = incremental `npm install`; if that rewrites the lockfile it is restored and `npm ci`
  runs instead. Installs use their own cache (`~\.npm-cache-pool`) and retry once with an empty one.
- Git-ignored files a fresh worktree needs (local config, `.env`): list them in `local-files.txt`
  next to the script (relative paths, one per line); they are copied from the primary on
  `init` / `reset` / `config`. No file = nothing copied.
- Lock lives in the slot's private git dir (`.git\worktrees\<slot>\wt-slot.lock`), not in the tree.
- One slot per session. Never switch branches in a slot another session holds (`status` shows holder).
- After `take`, work only inside the printed path. Release when the branch is pushed.
- Dev servers on fixed ports collide across slots; run a slot's servers on other ports.
- The script must be committed for slots to have it; it always acts on the whole pool from any worktree.
