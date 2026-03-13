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
- Tests updated for behavior changes (Jest).
- Lint/format compliance (eslint/prettier).

## Project Notes
- Backend uses Node.js with TypeScript.
- Multiplayer game server with WebSocket support.
- Run scripts: `npm run lint`, `npm run test`, `npm run build`.
