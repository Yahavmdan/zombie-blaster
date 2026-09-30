---
paths:
  - "src/app/**/*.component.ts"
  - "src/app/**/*.component.html"
  - "src/app/**/*.component.css"
---

# Angular Components

- Never inline `template` or `styles` in `@Component`. Use `templateUrl: './{name}.component.html'` and `styleUrl: './{name}.component.css'` (plain CSS, not SCSS).
- Standalone, signal inputs/outputs, native control flow (`@if`, `@for` with `track`), OnPush.
- Selector `app-{name}`, class `{Name}Component`, file `{name}.component.ts`.
- Clean up subscriptions with `takeUntilDestroyed` / `DestroyRef`.
- Styling: component `.css` files are the norm (Tailwind is imported in `styles.css` but templates don't use it yet). Keep HUD/menu styles apart from canvas rendering.
- For new components, use the `angular-component` skill.
