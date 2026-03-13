---
name: ac-code-review-ts-angular
description: Review TypeScript/Angular changes for correctness, lint compliance, and UI safety. Use when reviewing .ts/.html/.scss changes.
---

# Code Review: TS/Angular

## Angular/TS Checklist
- Ensure subscriptions are cleaned up (e.g., `takeUntilDestroyed` or async pipes).
- Avoid direct DOM manipulation unless required for game canvas/rendering.
- Template safety: avoid unsafe HTML; sanitize user content.
- Strong typing: avoid `any`; use proper interfaces/types.
- Performance: use `track` for `@for` loops; prefer OnPush change detection.
- Follow Angular v20+ patterns: signal inputs/outputs, native control flow.

## Project Notes
- This is a zombie platformer game frontend built with Angular.
- Uses Jest for unit testing.
- Game rendering may use Canvas/WebGL alongside Angular components for UI.
