---
name: angular-component
description: Create modern Angular standalone components following v20+ best practices. Use for building UI components with signal-based inputs/outputs, OnPush change detection, host bindings, content projection, and lifecycle hooks.
---

# Angular Component

Create standalone components for Angular v20+. Components are standalone by default—do NOT set `standalone: true`.

## Component Structure

Every component must use `ChangeDetectionStrategy.OnPush`. Signal inputs, outputs, computed values, and host bindings are covered in dedicated sections below.

**Always use separate files for templates and styles** — never inline `template` or `styles`. Use `templateUrl` and `styleUrl` pointing to co-located `.component.html` and `.component.css` files.

```typescript
// user-card.component.ts
import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';

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
  name = input.required<string>();
  email = input<string>('');
  showEmail = input(false);
  isActive = input(false, { transform: booleanAttribute });

  avatarUrl = computed(() => `https://api.example.com/avatar/${this.name()}`);

  selected = output<string>();

  handleClick() {
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
name = input.required<string>();
count = input(0);
label = input<string>();
size = input('medium', { alias: 'buttonSize' });
disabled = input(false, { transform: booleanAttribute });
value = input(0, { transform: numberAttribute });
```

## Signal Outputs

```typescript
import { output, outputFromObservable } from '@angular/core';

clicked = output<void>();
selected = output<Item>();
valueChange = output<number>({ alias: 'change' });

scroll$ = new Subject<number>();
scrolled = outputFromObservable(this.scroll$);

this.clicked.emit();
this.selected.emit(item);
```

## Host Bindings

Use the `host` object in `@Component`—do NOT use `@HostBinding` or `@HostListener` decorators.

```typescript
@Component({
  selector: 'app-button',
  host: {
    'role': 'button',
    '[class.primary]': 'variant() === "primary"',
    '[class.disabled]': 'disabled()',
    '[style.--btn-color]': 'color()',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.tabindex]': 'disabled() ? -1 : 0',
    '(click)': 'onClick($event)',
    '(keydown.enter)': 'onClick($event)',
    '(keydown.space)': 'onClick($event)',
  },
  templateUrl: './button.component.html',
  styleUrl: './button.component.css',
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary'>('primary');
  disabled = input(false, { transform: booleanAttribute });
  color = input('#007bff');
  clicked = output<void>();

  onClick(event: Event) {
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
import { OnDestroy, OnInit, afterNextRender, afterRender } from '@angular/core';

export class MyComponent implements OnInit, OnDestroy {
  constructor() {
    afterNextRender(() => {
      // Runs once after first render — use for canvas init, WebGL setup, etc.
    });

    afterRender(() => {
      // Runs after every render
    });
  }

  ngOnInit() { /* Component initialized */ }
  ngOnDestroy() { /* Cleanup */ }
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
  label = input.required<string>();
  checked = input(false, { transform: booleanAttribute });
  checkedChange = output<boolean>();

  toggle() {
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

## Strict Typing — Mandatory

Every `const`, `let`, variable, parameter, return type, property, signal, computed, input, output, and local must have an explicit type annotation. No inference allowed.

```typescript
// BAD — relies on type inference
const name = signal('');
const count = signal(0);
const items = computed(() => this.list().filter(i => i.active));
const data = input.required<Item>();
const clicked = output<void>();
let result = this.http.get('/api/items');
private readonly svc = inject(MyService);

// GOOD — every declaration explicitly typed
const name: WritableSignal<string> = signal<string>('');
const count: WritableSignal<number> = signal<number>(0);
const items: Signal<Item[]> = computed((): Item[] => this.list().filter((i: Item) => i.active));
const data: InputSignal<Item> = input.required<Item>();
const clicked: OutputEmitterRef<void> = output<void>();
let result: Observable<Item[]> = this.http.get<Item[]>('/api/items');
private readonly svc: MyService = inject(MyService);
```

## Reactive Forms Only — No `ngModel`

Never use `[(ngModel)]`. Always use Angular Reactive Forms (`FormControl`, `FormGroup`, `FormArray`) with `[formControl]`, `[formGroup]`, or `formControlName`.

## Single Responsibility Functions

Every function must do one thing. If a function does more than one thing, break it into smaller, well-named functions.

## Lifecycle Hooks — Declarative Call List

Lifecycle methods (`ngOnInit`, etc.) must read like a table of contents. Each line should be a single, named method call — no inline logic.

```typescript
ngOnInit(): void {
  this.initGameState();
  this.loadCharacterData();
  this.subscribeToServerEvents();
}
```

## CSS Basics

1. Always follow class name conventions: `kebab-case`.
2. Never use `::ng-deep` for nested components.
3. Never use inline styles — use class names.
4. Always check there are no unused CSS classes or styles.
