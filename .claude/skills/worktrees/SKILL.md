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
& $wt take feat/some-slug           # prints: READY <root>\<repo>-N (feat/some-slug), then starts its dev servers (-NoServe skips)
& $wt take                          # free slot detached at the base; branch it later inside the slot
& $wt status                        # slots, branch, who holds them, dirty count
& $wt all                           # every worktree: dirty, pushed, behind base, PR, lock, Free
& $wt release <repo>-N              # done: unlock + detach HEAD (refuses if dirty; -Force overrides)
& $wt reset <all|name>              # clean worktree(s) -> latest base, unlock, re-sync deps
& $wt sync <repo>-N [-Clean]        # re-sync deps
& $wt init -Count 3                 # grow the pool (new slots get a clean npm ci)
& $wt ports [<repo>-N]              # WEB_PORT=N*1111 API_PORT=N*1111+1 (primary = 1; default: current dir)
& $wt serve [<repo>-N]              # start its dev servers (dev-servers.txt) on its ports, hidden, wait until up
& $wt stop [<repo>-N]               # stop the dev servers serve started (release does this too)
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
- Ports: worktree N (primary = 1, `<repo>-N` = N) runs its dev servers on WEB_PORT=N*1111 and
  API_PORT=N*1111+1 (`take` prints them; `ports` repeats). In this repo `ng serve` proxies `/ws` to
  `API_PORT` (`proxy.conf.mjs`), the API listens on `PORT`, and `playwright.config.ts` reads
  `WEB_PORT`/`API_PORT`. Chrome's blocked 6665-6669 and `netsh portproxy` listeners (2222 here)
  are skipped: the port moves up one (slot 2 = web 2224, api 2223).
- Dev servers: `dev-servers.txt` lists them (`<WEB|API> <dir> <command>`, `{WEB_PORT}`/`{API_PORT}`
  replaced; each also gets `PORT` = its own port). `take`/`serve` run each as a hidden `cmd /c`
  that outlives the script, log to `wt-serve-<web|api>.log` in the worktree's git dir, keep PIDs in
  `wt-serve.pids` there, and wait up to 180 s for the port. A port already listening is left alone
  (maybe another session's server). `stop`/`release` `taskkill /T` only those PIDs (if still `cmd`).
- The script must be committed for slots to have it; it always acts on the whole pool from any worktree.
