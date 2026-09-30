---
name: ac-code-review-node
description: Review Node.js/TypeScript backend code for quality and best practices. Use when reviewing server-side changes.
---

# Code Review: Node.js Backend

## Node/TS Checklist
- Validate inputs at API boundaries; no unhandled promise rejections.
- Avoid blocking operations in request paths.
- Configuration via env (no hardcoded secrets).
- Keep dependency changes justified; avoid unused packages.
- Tests updated for behavior changes (Vitest).
- Explicit types everywhere; no unused vars/imports.
- Message types come from `@shared/*`, not redefined locally.

## Project Notes
- Backend uses Node.js with TypeScript.
- Multiplayer game server with WebSocket support.
- Code lives in `zombie-blaster-api/src/`. Verify with `cd zombie-blaster-api && npm run build`.
