# Angular Component Patterns

Every snippet follows the repo hard rules (explicit types, `templateUrl` + `styleUrl`, OnPush). `@Component` metadata is trimmed to what each pattern needs; real components also set `changeDetection: ChangeDetectionStrategy.OnPush`.

## Table of Contents
- [Model Inputs (Two-Way Binding)](#model-inputs-two-way-binding)
- [View Queries](#view-queries)
- [Content Queries](#content-queries)
- [Dependency Injection in Components](#dependency-injection-in-components)
- [Component Communication Patterns](#component-communication-patterns)
- [Deferred Loading](#deferred-loading)
- [Attribute Directives on Components](#attribute-directives-on-components)

## Model Inputs (Two-Way Binding)

For two-way binding with `[(value)]` syntax:

```typescript
import { Component, input, InputSignal, model, ModelSignal } from '@angular/core';

@Component({
  selector: 'app-slider',
  templateUrl: './slider.component.html',
  styleUrl: './slider.component.css',
})
export class SliderComponent {
  // Model creates both input and output
  readonly value: ModelSignal<number> = model<number>(0);
  readonly min: InputSignal<number> = input<number>(0);
  readonly max: InputSignal<number> = input<number>(100);

  onInput(event: Event): void {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    this.value.set(Number(target.value));
  }
}

// Usage: <app-slider [(value)]="sliderValue" />
```

```html
<!-- slider.component.html -->
<input type="range" [value]="value()" [min]="min()" [max]="max()" (input)="onInput($event)" />
<span>{{ value() }}</span>
```

Required model:

```typescript
readonly value: ModelSignal<number> = model.required<number>();
```

## View Queries

```typescript
import { Component, ElementRef, input, InputSignal, Signal, viewChild, viewChildren } from '@angular/core';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.css',
})
export class GalleryComponent {
  readonly images: InputSignal<Image[]> = input.required<Image[]>();

  // Query single element
  readonly container: Signal<ElementRef<HTMLDivElement>> =
    viewChild.required<ElementRef<HTMLDivElement>>('container');

  // Query single component (optional)
  readonly firstCard: Signal<ImageCardComponent | undefined> = viewChild(ImageCardComponent);

  // Query all matching components
  readonly allCards: Signal<readonly ImageCardComponent[]> = viewChildren(ImageCardComponent);
}
```

```html
<!-- gallery.component.html -->
<div #container class="gallery">
  @for (image of images(); track image.id) {
    <app-image-card [image]="image" />
  }
</div>
```

## Content Queries

```typescript
import {
  Component,
  contentChildren,
  effect,
  input,
  InputSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';

@Component({
  selector: 'app-tab',
  host: {
    '[class.active]': 'isActive()',
  },
  templateUrl: './tab.component.html',
  styleUrl: './tab.component.css',
})
export class TabComponent {
  readonly label: InputSignal<string> = input.required<string>();
  readonly isActive: InputSignal<boolean> = input<boolean>(false);
}

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.css',
})
export class TabsComponent {
  // Query all projected TabComponent children
  readonly tabs: Signal<readonly TabComponent[]> = contentChildren(TabComponent);

  readonly activeTab: WritableSignal<TabComponent | undefined> = signal<TabComponent | undefined>(undefined);

  constructor() {
    effect((): void => {
      this.selectFirstTabIfNone();
    });
  }

  selectTab(tab: TabComponent): void {
    this.activeTab.set(tab);
  }

  private selectFirstTabIfNone(): void {
    const firstTab: TabComponent | undefined = this.tabs()[0];
    if (firstTab && !this.activeTab()) {
      this.activeTab.set(firstTab);
    }
  }
}
```

```html
<!-- tabs.component.html -->
<div class="tab-headers">
  @for (tab of tabs(); track tab.label()) {
    <button [class.active]="tab === activeTab()" (click)="selectTab(tab)">
      {{ tab.label() }}
    </button>
  }
</div>
<div class="tab-content">
  <ng-content />
</div>
```

## Dependency Injection in Components

Use `inject()` instead of constructor injection:

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-lobby',
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent {
  private readonly router: Router = inject(Router);
  private readonly ws: WebSocketService = inject(WebSocketService);

  // Optional injection
  private readonly saves: SaveGameService | null = inject(SaveGameService, { optional: true });

  goToGame(): void {
    void this.router.navigate(['/game']);
  }
}
```

## Component Communication Patterns

### Parent to Child (Inputs)

```typescript
// Parent — template: <app-child [data]="parentData()" />
export class ParentComponent {
  readonly parentData: WritableSignal<Data> = signal<Data>({ name: 'Test' });
}

// Child
export class ChildComponent {
  readonly data: InputSignal<Data> = input.required<Data>();
  readonly config: InputSignal<Config | undefined> = input<Config>();
}
```

### Child to Parent (Outputs)

```typescript
// Child — template: <button (click)="save()">Save</button>
export class ChildComponent {
  readonly saved: OutputEmitterRef<Data> = output<Data>();

  save(): void {
    this.saved.emit({ id: 1, name: 'Item' });
  }
}

// Parent — template: <app-child (saved)="onSaved($event)" />
export class ParentComponent {
  readonly lastSaved: WritableSignal<Data | undefined> = signal<Data | undefined>(undefined);

  onSaved(data: Data): void {
    this.lastSaved.set(data);
  }
}
```

### Shared Service Pattern

State lives in services (no NgRx).

```typescript
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly items: WritableSignal<InventoryItem[]> = signal<InventoryItem[]>([]);

  readonly items$: Signal<InventoryItem[]> = this.items.asReadonly();
  readonly totalWeight: Signal<number> = computed((): number =>
    this.items().reduce((sum: number, item: InventoryItem): number => sum + item.weight, 0),
  );

  addItem(item: InventoryItem): void {
    this.items.update((items: InventoryItem[]): InventoryItem[] => [...items, item]);
  }

  removeItem(id: string): void {
    this.items.update((items: InventoryItem[]): InventoryItem[] =>
      items.filter((i: InventoryItem): boolean => i.id !== id),
    );
  }
}

// Consumer
export class InventorySummaryComponent {
  readonly inventory: InventoryService = inject(InventoryService);
}
```

## Deferred Loading

```html
@defer (on viewport) {
  <app-heavy-chart [data]="chartData()" />
} @placeholder {
  <div class="chart-placeholder">Loading chart...</div>
} @loading (minimum 500ms) {
  <app-spinner />
} @error {
  <p>Failed to load chart</p>
}

@defer (on interaction; prefetch on idle) {
  <app-comments [postId]="postId()" />
} @placeholder {
  <button>Load Comments</button>
}
```

Triggers: `on viewport`, `on idle`, `on interaction`, `on hover`, `on immediate`, `on timer(500ms)`, `when condition`.

## Attribute Directives on Components

```typescript
@Directive({
  selector: '[appHighlight]',
  host: {
    '[style.backgroundColor]': 'color()',
  },
})
export class HighlightDirective {
  readonly color: InputSignal<string> = input<string>('yellow', { alias: 'appHighlight' });
}

// Usage: add HighlightDirective to `imports`, then <app-card appHighlight="lightblue" />
```
