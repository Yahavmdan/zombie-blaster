---
name: ac-angular-jest
description: Write and update Angular unit tests using Jest. Use when creating or fixing Jest tests, mocks, or TestBed setup.
---

# Angular Jest Testing

## Core Rules
- Use Jest mocks/spies instead of Jasmine APIs.
- Prefer `TestBed` for component setup; keep tests focused.
- Avoid timers unless necessary; if used, switch to fake timers explicitly.

## Basic Test Pattern
```typescript
describe('MyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent],
    }).compileComponents();
  });

  it('renders title', () => {
    const fixture = TestBed.createComponent(MyComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Title');
  });
});
```

## Jest Mocks
```typescript
const api = { fetch: jest.fn() };
api.fetch.mockResolvedValue([{ id: '1' }]);
expect(api.fetch).toHaveBeenCalled();
```

## Async Helpers
- Use `fakeAsync` + `tick()` or `waitForAsync` consistently.
- Prefer `await fixture.whenStable()` for async templates.
