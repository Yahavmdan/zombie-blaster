---
name: ac-base-angular-workflow
description: Follow Angular conventions for the zombie-blaster game frontend. Use when editing Angular TypeScript, templates, or styles.
---

# Angular Workflow — Zombie Blaster

## Conventions

### General
- Do not use `async/await` in Angular code unless there is no other way; stay in the observable chain.
- Follow lint rules (eslint + prettier).
- Prefer path aliases where possible.

### HTTP & State
- Keep state in services (service-based state; no NgRx unless justified).
- Use a dedicated game state service for shared game data.

### Styling
- Use Tailwind utility classes for layout and styling.
- Keep game UI styles separate from game rendering (canvas) styles.

### Naming
- Selector `app-{feature}-{name}`, class `{Name}Component`, file `{name}.component.ts`.

### Testing & Cleanup
- Add `data-testid` to interactive elements using `{page}-{component}-{type}-{action}`.
- Clean up subscriptions with `takeUntilDestroyed` or `DestroyRef`.

## Examples

```typescript
// BAD: async/await when not needed
async load() {
  this.items = await this.api.getItems().toPromise();
}

// GOOD: stay in the observable chain
load() {
  this.api.getItems().subscribe(items => (this.items = items));
}
```

## App Commands
- Lint+format: `npm run lint`
- Test: `npm test` (Jest)
- Build: `npm run build`
- Dev server: `ng serve`
