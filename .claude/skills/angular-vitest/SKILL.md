---
name: angular-vitest
description: Write and update unit tests with Vitest (Angular `@angular/build:unit-test`). Use when creating or fixing tests, mocks, TestBed setup, or reproducing a bug with a failing test.
---

# Angular + Vitest Testing

Runner: `npm test -- --watch=false` (repo root); one file: add `--include <path-to-spec>`. Specs live next to the code as `*.spec.ts`. Examples: `src/app/engine/zombie-system.spec.ts`, `src/app/engine/multiplayer-sync.spec.ts`.

## Core rules
- Import test APIs explicitly: `import { describe, it, expect, beforeEach, vi } from 'vitest';`
- Mocks/spies use `vi` (`vi.fn()`, `vi.spyOn()`, `vi.useFakeTimers()`), never `jest.*` or Jasmine.
- Engine systems are plain classes: test them without TestBed by building a minimal `IGameEngine` stub and real peer systems (see `makeMockEngine` / `makePlayer` / `makeZombie` in `zombie-system.spec.ts`).
- Use TestBed only for components/services with DI.
- Explicit types still apply in tests (helper params, return types, locals).
- Bug repro: write a test that asserts the desired behaviour and fails on current code. No production changes in the repro step.

## Component pattern
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

describe('MyComponent', (): void => {
  let fixture: ComponentFixture<MyComponent>;

  beforeEach(async (): Promise<void> => {
    await TestBed.configureTestingModule({ imports: [MyComponent] }).compileComponents();
    fixture = TestBed.createComponent(MyComponent);
    fixture.detectChanges();
  });

  it('renders title', (): void => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Title');
  });
});
```

## Mocks
```typescript
import { vi, type Mock } from 'vitest';

const api: { fetch: Mock } = { fetch: vi.fn() };
api.fetch.mockResolvedValue([{ id: '1' }]);
expect(api.fetch).toHaveBeenCalled();
```

## Async
- Prefer `await fixture.whenStable()` for async templates.
- Timers: `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)`, restore with `vi.useRealTimers()`.
