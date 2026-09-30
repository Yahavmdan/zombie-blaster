---
paths:
  - "**/*.ts"
---

# Explicit Types Everywhere

Every piece of TypeScript is explicitly typed. Applies even when nearby code relies on inference.

Must be typed: `const`/`let`, function parameters, return types, class fields, arrow functions (params and return), destructured variables, generic arguments, array/object literals, callback parameters (`map`, `filter`, `subscribe`, ...).

```typescript
// BAD
const name = 'Alice';
let count = 0;
arr.map(x => x.id);
readonly items = computed(() => this.list().filter(i => i.active));

// GOOD
const name: string = 'Alice';
let count: number = 0;
arr.map((x: Item): string => x.id);
readonly items: Signal<Item[]> = computed((): Item[] => this.list().filter((i: Item): boolean => i.active));
readonly count: WritableSignal<number> = signal<number>(0);
```

`for...of` variables can't carry an annotation in TS. Make sure the iterable itself is explicitly typed (`const zombies: ZombieState[] = ...`, typed fields/Maps) so the loop variable's type is never a guess.

Prefer top-level imports over inline `import('./x').Type`.
