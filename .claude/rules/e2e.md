---
paths:
  - 'e2e/**'
  - 'playwright.config.ts'
  - 'src/app/testing/**'
  - 'src/app/engine/**'
  - 'src/app/pages/game/**'
  - 'src/app/components/**'
  - 'shared/**'
  - 'zombie-blaster-api/src/**'
---

# Gameplay E2E coverage

Every gameplay feature ships with browser coverage in `e2e/` (skill: `game-e2e`).

- New/changed mechanic, skill, dialog, drop, zombie behavior, sync message or server handler
  → add or update a spec in the same change. Multiplayer-visible behavior needs an online test
  proving the other player sees it.
- Bugs: failing test first, tagged `@bug`, pinned with `test.fail(true, 'KNOWN BUG: ...')`.
  When fixing, remove the pin.
- The probe (`src/app/testing/`) is dev-only and read-mostly. Production code must never call it;
  it is attached behind `isDevMode()`. Extend `e2e-api.ts` + `e2e-hooks.ts` together.
- Suite code follows the same hard rules as the app: explicit types, no unused code.
  Check with `npm run e2e:typecheck`.
- Before finishing a gameplay change, run the affected tags (e.g. `npm run e2e:solo`,
  `npm run e2e:online`) and report the result.
