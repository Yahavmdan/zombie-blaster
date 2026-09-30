---
paths:
  - "src/app/**/*.ts"
  - "src/app/**/*.html"
  - "src/app/**/*.css"
---

# Angular Frontend

## Components

- Never inline `template` or `styles` in `@Component`. Use `templateUrl: './{name}.component.html'` and `styleUrl: './{name}.component.css'` (plain CSS, not SCSS).
- Standalone, signal inputs/outputs, native control flow (`@if`, `@for` with `track`), OnPush.
- Selector `app-{name}`, class `{Name}Component`, file `{name}.component.ts`.
- Add `data-testid` to interactive elements: `{page}-{component}-{type}-{action}`.
- For new components, use the `angular-component` skill.

## State and async

- State lives in services (`GameStateService` etc.). No NgRx.
- Avoid `async/await` in Angular code; stay in the observable chain. Exception: test setup (`beforeEach(async ...)`).
- Clean up subscriptions with `takeUntilDestroyed` / `DestroyRef`.

```typescript
// BAD
async load(): Promise<void> {
  this.items = await firstValueFrom(this.api.getItems());
}

// GOOD
load(): void {
  this.api.getItems().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((items: Item[]): void => {
    this.items.set(items);
  });
}
```

## Styling

- Component `.css` files are the norm (Tailwind is imported in `styles.css` but templates don't use it yet).
- Keep HUD/menu styles apart from canvas rendering.
- Prefer path aliases (`@shared/*`) over deep relative imports.
