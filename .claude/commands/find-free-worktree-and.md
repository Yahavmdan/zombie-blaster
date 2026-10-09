---
description: Take a free worktree (pool slot) of this repo and do the request that follows inside it - "/find-free-worktree-and <instructions>"
argument-hint: <instructions or another /command to run in the free worktree>
---

The text after the command is the real task. This command only decides WHERE this session works.
Script: `$wt = "$(git rev-parse --show-toplevel)\.claude\skills\worktrees\wt.ps1"` (skill `worktrees`).

## 1. Take a slot (one call)

If the instructions name an existing branch (`git branch -a --list "*<name>*"`), take it on that branch:

```powershell
& $wt take <branch>
```

Otherwise take it detached at the fresh base branch (branch it later, inside the slot, once the
task is clear - follow the repo's branch naming, e.g. `feat/<slug>`):

```powershell
& $wt take
```

It locks a clean, unlocked slot (`<repo>-N` next to the primary checkout, prefers detached ones),
fetches, switches, syncs `node_modules` only if a lockfile changed, and prints
`READY <path> (...) WEB_PORT=<N*1111> API_PORT=<N*1111+1>` - the slot's own ports (`<repo>-N` gets
N*1111 / N*1111+1, a reserved port moves up one; the primary is 1 = 1111/1112). `& $wt ports` prints them again.
Then it starts the slot's dev servers (API + frontend, from `dev-servers.txt`) hidden in the
background on those ports and waits until they listen: `SERVE WEB up on http://localhost:<WEB_PORT>`.
A port already in use is left as is and reported. Don't start them again yourself.

No free slot: run `& $wt all`, show which worktrees are close to free, and ask the user whether to
`/reset-worktree` one of them or grow the pool (`& $wt init -Count <n+1>`, a clean install each).
Never pick a worktree that is dirty, locked, or on a branch with an open PR.

## 2. Work only there

Tell the user in one line: `Working in <path> (<branch|detached>), app on http://localhost:<WEB_PORT>`.

For the rest of the session the slot is the working directory:
- PowerShell / Bash: `Set-Location <path>` (cd) first - the shell keeps it between calls.
- Read / Edit / Write / Grep / Glob: absolute paths under `<path>` only.
- git: run inside `<path>` (or `git -C <path>`). Never edit or switch branches in the primary
  checkout or any other worktree.
- Dev servers: already running on the slot's ports (`take` started them), never the defaults
  (4200/3001 belong to nobody; another slot may hold them). Logs: `wt-serve-web.log` /
  `wt-serve-api.log` in the slot's git dir (`git -C <path> rev-parse --absolute-git-dir`).
  - Restart: `& $wt stop <slot>; & $wt serve <slot>`.
  - E2E: `$env:WEB_PORT=<WEB_PORT>; $env:API_PORT=<API_PORT>; npm run e2e` - reuses the slot's servers.
  Port busy at `take`? Something else holds it (`netstat -ano | findstr :<port>`) - ask, don't fall back to another port.

## 3. Do the request

Execute `$ARGUMENTS` in the slot - if it is a `/command`, run that command's process there. If
`$ARGUMENTS` is empty, ask what to do.

When the work is pushed (or the user is done), release the slot: `& $wt release <slot>` - stops its
dev servers; refuses if dirty.

$ARGUMENTS
