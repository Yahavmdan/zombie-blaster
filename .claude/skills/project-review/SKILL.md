---
name: project-review
description: Zombie Blaster review checklist for diffs, branches and PRs (Angular frontend, engine, Node ws server, shared types). Use when reviewing changes in this repo, including alongside /code-review.
---

# Project Review

## Workflow
- Scope: `git diff origin/main...HEAD` (current branch only). Review modified files and their direct callers.
- Start immediately; don't gather unrelated context.
- Re-check every changed file against the hard rules in `CLAUDE.md` and the path rules in `.claude/rules/`.

## All code
- Correctness: intended behavior, edge cases, no regressions.
- Explicit types everywhere; no `any`; no unused vars/imports/params/files.
- Types shared by client and server live in `shared/`, never duplicated.
- No new `console.*` in production code.
- No hardcoded secrets. Consider OWASP Top 10.
- Tests present and meaningful for frontend/engine behavior changes (Vitest, `*.spec.ts` next to code).

## Frontend / engine (`src/app/**`)
- Components: `templateUrl` + `styleUrl`, OnPush, signal inputs/outputs, `@for` with `track`.
- Subscriptions cleaned up (`takeUntilDestroyed`, `DestroyRef`, async pipe).
- No direct DOM manipulation outside canvas rendering. No unsafe HTML; sanitize user content (chat, names).
- Engine: logic in the matching system file; systems never import `game-engine.ts`; no new circular deps (`.claude/rules/engine-architecture.md`).
- Any new or changed visual effect passes the `multiplayer-vfx-sync` checklist.
- Host authority: non-host clients send inputs/requests, never computed damage/loot/position.

## Server (`zombie-blaster-api/**`)
- Every incoming message validated (type + payload shape); no unhandled promise rejections; no stack traces sent to clients.
- No blocking work in message handlers.
- `shared/` imports are relative with `.js` extension, not `@shared/*`.
- Dependency changes justified.
- `cd zombie-blaster-api && npm run build` passes.
- `shared/` changed: frontend build passes too.

## Output
- Group by priority: **Critical**, **High**, **Medium**, **Low**. Full write-ups for Critical/High; short bullets for the rest.
- Only issues that should change. No praise. Include a concrete fix.
- Open with: what the change tries to do, files inspected, existing features affected.
- Report in chat. Write a `<branch> Code Review <timestamp>.md` file only if asked.
