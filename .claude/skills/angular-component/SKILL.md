---
name: angular-component
description: Create modern Angular standalone components following v20+ best practices. Use for building UI components with signal-based inputs/outputs, OnPush change detection, host bindings, content projection, and lifecycle hooks.
---

# Angular Component

Create standalone components for Angular v20+. Components are standalone by default—do NOT set `standalone: true`.

Every snippet here follows the repo hard rules: explicit types on every declaration, `templateUrl` + `styleUrl`, no `console.*`. Copy them as-is.

## Component Structure

Every component must use `ChangeDetectionStrategy.OnPush`. Always use separate `.component.html` and `.component.css` files—never inline `template` or `styles`.

```typescript
// user-card.component.ts
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  InputSignal,
  InputSignalWithTransform,
  output,
  OutputEmitterRef,
  Signal,
} from '@angular/core';

@Component({
  selector: 'app-user-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'user-card',
    '[class.active]': 'isActive()',
    '(click)': 'handleClick()',
  },
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.css',
})
export class UserCardComponent {
  readonly name: InputSignal<string> = input.required<string>();
  readonly email: InputSignal<string> = input<string>('');
  readonly showEmail: InputSignal<boolean> = input<boolean>(false);
  readonly isActive: InputSignalWithTransform<boolean, unknown> = input<boolean, unknown>(false, {
    transform: booleanAttribute,
  });

  readonly avatarUrl: Signal<string> = computed((): string => `/avatars/${this.name()}.png`);

  readonly selected: OutputEmitterRef<string> = output<string>();

  handleClick(): void {
    this.selected.emit(this.name());
  }
}
```

```html
<!-- user-card.component.html -->
<img [src]="avatarUrl()" [alt]="name() + ' avatar'" />
<h2>{{ name() }}</h2>
@if (showEmail()) {
  <p>{{ email() }}</p>
}
```

```css
/* user-card.component.css */
:host { display: block; }
:host.active { border: 2px solid blue; }
```

## Signal Inputs

```typescript
readonly name: InputSignal<string> = input.required<string>();
readonly count: InputSignal<number> = input<number>(0);
readonly label: InputSignal<string | undefined> = input<string>();
readonly size: InputSignal<string> = input<string>('medium', { alias: 'buttonSize' });
readonly disabled: InputSignalWithTransform<boolean, unknown> = input<boolean, unknown>(false, {
  transform: booleanAttribute,
});
readonly value: InputSignalWithTransform<number, unknown> = input<number, unknown>(0, {
  transform: numberAttribute,
});
```

## Signal Outputs

```typescript
import { output, OutputEmitterRef, OutputRef, outputFromObservable } from '@angular/core';
import { Subject } from 'rxjs';

readonly clicked: OutputEmitterRef<void> = output<void>();
readonly selected: OutputEmitterRef<Item> = output<Item>();
readonly valueChange: OutputEmitterRef<number> = output<number>({ alias: 'change' });

private readonly scroll$: Subject<number> = new Subject<number>();
readonly scrolled: OutputRef<number> = outputFromObservable<number>(this.scroll$);

this.clicked.emit();
this.selected.emit(item);
```

## Host Bindings

Use the `host` object in `@Component`—do NOT use `@HostBinding` or `@HostListener` decorators.

```typescript
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'button',
    '[class.primary]': 'variant() === "primary"',
    '[class.disabled]': 'disabled()',
    '[style.--btn-color]': 'color()',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.tabindex]': 'disabled() ? -1 : 0',
    '(click)': 'onClick()',
    '(keydown.enter)': 'onClick()',
    '(keydown.space)': 'onClick()',
  },
  templateUrl: './button.component.html',
  styleUrl: './button.component.css',
})
export class ButtonComponent {
  readonly variant: InputSignal<'primary' | 'secondary'> = input<'primary' | 'secondary'>('primary');
  readonly disabled: InputSignalWithTransform<boolean, unknown> = input<boolean, unknown>(false, {
    transform: booleanAttribute,
  });
  readonly color: InputSignal<string> = input<string>('#007bff');
  readonly clicked: OutputEmitterRef<void> = output<void>();

  onClick(): void {
    if (!this.disabled()) {
      this.clicked.emit();
    }
  }
}
```

## Content Projection

```typescript
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card.component.html',
  styleUrl: './card.component.css',
})
export class CardComponent {}
```

```html
<!-- card.component.html -->
<header>
  <ng-content select="[card-header]" />
</header>
<main>
  <ng-content />
</main>
<footer>
  <ng-content select="[card-footer]" />
</footer>
```

## Lifecycle Hooks API

```typescript
import { afterEveryRender, afterNextRender, OnDestroy, OnInit } from '@angular/core';

export class MyComponent implements OnInit, OnDestroy {
  constructor() {
    afterNextRender((): void => {
      // Runs once after first render — use for canvas init, WebGL setup, etc.
    });

    afterEveryRender((): void => {
      // Runs after every render
    });
  }

  ngOnInit(): void { /* Component initialized */ }
  ngOnDestroy(): void { /* Cleanup */ }
}
```

## Lifecycle Hooks — Declarative Call List

Lifecycle methods (`ngOnInit`, etc.) must read like a table of contents. Each line should be a single, named method call — no inline logic.

```typescript
ngOnInit(): void {
  this.initGameState();
  this.loadCharacterData();
  this.subscribeToServerEvents();
}
```

## Accessibility Requirements

Components MUST:
- Include proper ARIA attributes for interactive elements
- Support keyboard navigation
- Maintain visible focus indicators

```typescript
@Component({
  selector: 'app-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'switch',
    '[attr.aria-checked]': 'checked()',
    '[attr.aria-label]': 'label()',
    'tabindex': '0',
    '(click)': 'toggle()',
    '(keydown.enter)': 'toggle()',
    '(keydown.space)': 'toggle(); $event.preventDefault()',
  },
  templateUrl: './toggle.component.html',
  styleUrl: './toggle.component.css',
})
export class ToggleComponent {
  readonly label: InputSignal<string> = input.required<string>();
  readonly checked: InputSignalWithTransform<boolean, unknown> = input<boolean, unknown>(false, {
    transform: booleanAttribute,
  });
  readonly checkedChange: OutputEmitterRef<boolean> = output<boolean>();

  toggle(): void {
    this.checkedChange.emit(!this.checked());
  }
}
```

## Template Syntax

Use native control flow—do NOT use `*ngIf`, `*ngFor`, `*ngSwitch`.

```html
@if (isLoading()) {
  <app-spinner />
} @else if (error()) {
  <app-error [message]="error()" />
} @else {
  <app-content [data]="data()" />
}

@for (item of items(); track item.id) {
  <app-item [item]="item" />
} @empty {
  <p>No items found</p>
}

@switch (status()) {
  @case ('pending') { <span>Pending</span> }
  @case ('active') { <span>Active</span> }
  @default { <span>Unknown</span> }
}
```

## Class and Style Bindings

Do NOT use `ngClass` or `ngStyle`. Use direct bindings:

```html
<div [class.active]="isActive()">Single class</div>
<div [class]="classString()">Class string</div>
<div [style.color]="textColor()">Styled text</div>
<div [style.width.px]="width()">With unit</div>
```

## Reactive Forms Only — No `ngModel`

Never use `[(ngModel)]`. Always use Angular Reactive Forms (`FormControl`, `FormGroup`, `FormArray`) with `[formControl]`, `[formGroup]`, or `formControlName`.

## Single Responsibility Functions

Every function must do one thing. If a function does more than one thing, break it into smaller, well-named functions.

## CSS Basics

1. Always follow class name conventions: `kebab-case`.
2. Never use `::ng-deep` for nested components.
3. Never use inline styles — use class names.
4. Always check there are no unused CSS classes or styles.

## More patterns

Model inputs, view/content queries, DI, services, `@defer`: see `references/component-patterns.md`.
