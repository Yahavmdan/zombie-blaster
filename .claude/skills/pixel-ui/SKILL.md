---
name: pixel-ui
description: Design or change any Zombie Blaster UI (menus, HUD, dialogs/modals, panels, buttons, icons, canvas text and overlays) so it matches the pixel-art UI kit instead of drifting back to a generic "AI dashboard" look. Holds the art direction, the tokens and .px-* primitives, recipes for a new modal / HUD element / icon / canvas panel, the icon tool (npm run icons), the screenshot tool (tools/ui-shot.mjs) and the pitfalls already hit. Use when adding or restyling a screen, component, dialog, button, icon or any text drawn on the canvas.
---

# Pixel UI

The UI is pixel art that belongs to the game's sprites and grimy industrial tileset, like a 16-bit
RPG window (MapleStory-style), **not** a dark neon web dashboard. Reference screenshots of the
finished look: `reference/menu.png`, `charselect.png`, `hud.png`, `modal-shop.png`, `canvas.png`.
Look at them before you design anything.

The hard rule lives in `CLAUDE.md` ("Pixel UI kit"); component-level conventions are in
`.claude/rules/angular.md` (Styling). This skill is the how-to.

## The "looks AI-generated" checklist (never ship these)

- System / Impact / Segoe UI / `monospace` fonts, or any font other than Pixelify Sans
- Emoji as icons (in templates, TS data, `<option>` text or canvas `fillText`)
- Blurred `box-shadow` / `text-shadow` glows, `backdrop-filter`, `shadowBlur` on canvas (allowed only on crit damage numbers and the level-up title)
- Rounded corners (`border-radius` > 0, canvas `roundRect`)
- Gradient fills on bars/buttons/backgrounds, purple–cyan neon accents, raw Tailwind palette hex (`#facc15`, `#a78bfa` …)
- ALL CAPS headings and buttons with wide letter-spacing (only the logo and "Game over" may shout)
- Generic copy ("Survive the undead horde", "No rooms available. Create one!"): write in the game's voice
- Every panel the same dark box with a different glow colour: give each window its own accent stripe/identity
- Smooth easing animations and pulsing glows: use `steps()` and 2-frame blinks

## Building blocks

**Tokens** — `src/styles/tokens.css` (only source of colours, sizes, shadows):
- Surfaces `--ink --ink-2 --panel --panel-2 --panel-3 --edge-light`; text `--bone --bone-dim --bone-faint`
- Accents `--blood --blood-hi --rust --gold --toxic --toxic-hi --steel --steel-hi`; bars `--hp(-hi) --mp(-hi) --xp(-hi)`
- Classes `--class-warrior|ranger|mage|assassin|priest`
- Type scale `--fs-12 --fs-14 --fs-16 --fs-20 --fs-28 --fs-40 --fs-64` (px; nothing below 12)
- Geometry `--px` (2px) `--border` (3px) `--shadow-drop --bevel --bevel-pressed --text-shadow`

**Primitives** — `src/styles/ui-kit.css` (global classes; add them in templates, don't re-implement):

| Class | Use |
|---|---|
| `px-panel` / `px-panel--inset` | raised window / sunken slot, cell, list row |
| `px-header` | window title row (icon + title + close) |
| `px-title`, `px-label` | big hard-shadow heading / small dim caption |
| `px-btn` + `--primary --accent --good --ghost` + `--sm --lg` | every button; pressed state moves 2px |
| `px-close` (with `px-btn`) | square close button holding `<app-pixel-icon [icon]="'close'" [size]="16" />` |
| `px-chip` | stat tags, badges (Host, Ready, Rec.), counters |
| `px-bar` > `px-bar__fill` + `px-bar__label` | segmented bars; colour via `--bar-color` / `--bar-hi` (e.g. `[style.--bar-color]="skill.color"`) |
| `px-input` | text inputs and selects |
| `px-overlay` | modal backdrop |
| `px-scroll` | scrollable body with pixel-coloured scrollbar |

Component CSS keeps only layout (grid, flex, sizes, positions) and component-specific accents via tokens.
Angular build budget is 6 kB per component CSS: reusing the kit keeps you under it.

**Icons** — `PixelIconId` (`shared/pixel-icon.ts`), 48 hand-drawn 16x16 grids:
- Template: `<app-pixel-icon [icon]="skill.icon" [size]="32" />` (import `PixelIconComponent` from `src/app/ui/pixel-icon/pixel-icon.component`). Static ids need a binding: `[icon]="'coin'"`.
- Canvas: `drawPixelIcon(ctx, id, x, y, size)` from `src/app/ui/pixel-icon-raster.ts` (top-left anchored, smoothing off, state restored).
- Sizes 16 / 24 / 32 / 48 (whole multiples of the grid). 12 blurs a 16px grid; avoid it.
- Every `icon` field in `shared/` data (classes, skills, potions, drops, `ACTION_INFO`) is a `PixelIconId`.

**Canvas text and panels** — `src/app/engine/canvas-text.ts`:
- `ctx.font = pixelFont(size, weight)` with sizes from 10/12/14/16/20/28/40/52 (`snapFontSize` rounds).
- `fillOutlinedText(ctx, text, x, y, fill)` for anything over the game world (names, numbers, toasts, banners).
- `fillPixelBox(ctx, x, y, w, h, fill)` / `fillPixelPanel(ctx, x, y, w, h)` instead of `roundRect` pills.
- Canvas can't read CSS vars: use the `CANVAS_*` colour constants there, which mirror `tokens.css`. Change both together.
- Any new effect still goes through the `multiplayer-vfx-sync` skill; restyling how something draws needs no new VfxEvent.

## Recipes

### New modal / dialog
```html
<div class="px-overlay my-overlay" (click)="onClose()">
  <div class="px-panel my-window" (click)="$event.stopPropagation()">
    <div class="px-header">
      <app-pixel-icon [icon]="'book'" [size]="24" />
      <h2>Recipes</h2>
      <button class="px-btn px-close" (click)="onClose()" data-testid="recipes-panel-button-close">
        <app-pixel-icon [icon]="'close'" [size]="16" />
      </button>
    </div>
    <div class="my-body px-scroll"><!-- rows: px-panel--inset --></div>
  </div>
</div>
```
```css
.my-overlay { display: flex; justify-content: center; align-items: flex-start; padding: 8px 16px 72px; z-index: 50; }
.my-window { border-top: var(--border) solid var(--toxic); width: min(560px, 100%); max-height: 100%; display: flex; flex-direction: column; }
.px-header h2 { flex: 1; font-size: var(--fs-20); }
.my-body { min-height: 0; overflow: auto; padding: 12px 14px; display: grid; gap: 8px; }
```
- Pick an accent stripe not already taken: shop gold, inventory rust, stats blood, skills mp blue, settings steel-hi, dev gold, game over blood.
- The bottom ~72px is the quick-slot tray (it draws above modals): keep windows above it.
- Close on Escape (`host: { '(document:keydown.escape)': 'onClose()' }`), keep/define `data-testid`s, and cover the dialog in e2e (`game-e2e` skill); add it to `PANELS` in `e2e/specs/smoke/ui-style.spec.ts`.
- Optional open animation: ≤120ms `steps(3)` scale-in. No slide-ins with easing.

### New HUD element
- A small `px-panel` "plate" (see `hud.component.html`): label `--fs-12 --bone-dim`, value `--fs-16`/`--fs-20` in an accent.
- Don't cover play space: the top band holds the portrait plate (left), floor sign (centre), score + chips + gear (right); the bottom band is the quick-slot tray. Buff timers sit just above the tray.
- Attention states blink with `steps(2)` and stop under `prefers-reduced-motion`.

### New icon
1. Add the id to the `PixelIconId` union in `shared/pixel-icon.ts` (and `PIXEL_ICON_IDS`).
2. Draw it in `tools/pixel-icons/drafts.mjs` → `ICONS`: 16 fill-only rows, `.` = empty, letters from `MASTER` (palette names in `COLORS`); `build.mjs` adds the `k` ink outline. Shade light top-left, dark bottom-right, one specular pixel on shiny things. Reuse a `SHAPES` silhouette for families (potions share one bottle per size, colour via `pal`).
3. `npm run icons -- --zoom <id>` → regenerates `src/app/ui/pixel-icons.ts` (never hand-edit it) and `tools/pixel-icons/sheet.png`; read `sheet.png` / `zoom.png` and fix until it reads at 16px.
4. `npm test -- --watch=false --include src/app/ui/pixel-icons.spec.ts`.

### New text on screen
- DOM: inherits the pixel font; size from the type scale; sentence case; hard `var(--text-shadow)` if over art.
- Canvas: `pixelFont` + `fillOutlinedText`. Never `fillText` an emoji.

## Check your work

1. `npm run build` (no errors, no budget warnings). `shared/` touched → also `cd zombie-blaster-api && npm run build`.
2. Look at it: `node tools/ui-shot.mjs <scene>` with `WEB_PORT` = your dev server port
   (scenes: menu, help, charselect, lobby, hud, shop, inventory, stats, skills, settings). Read the PNG, compare
   with `reference/`, judge it like a pixel artist: alignment to a 2px grid, nothing overlapping at 1280x720.
3. `npm run e2e:smoke` (includes `ui-style.spec.ts`: pixel font loaded, no emoji, pixel icons in HUD and every panel) plus the
   specs that touch your screen (`ui.spec.ts`, `coop-and-ui.spec.ts`, `mouse-controls.spec.ts`, `online/lobby.spec.ts`).

## Pitfalls already hit

- `innerText` applies `text-transform`: e2e reading labels sees what the user sees (the menu spec expects `New game`).
- An `<option>` can't contain an `<img>`: drop the icon from option text.
- Keycaps at the 12px minimum don't fit a label: settings shows icons on keys, the name in `title`.
- The HUD's old action bar (`.action-bar`) is `display:none`; the quick-slot tray is the action bar. Open shop/inventory in tests with keys (`b`/`i`), not the hidden HUD buttons.
- Canvas text drawn before the font loads falls back to serif: `RenderSystem` calls `preloadCanvasFonts()`.
- A worktree dev server started without the slot's `API_PORT` has a dead `/ws` proxy: online specs hang on "Connecting". Restart it with `wt.ps1 stop/serve`.
- Several agents running Playwright in one worktree share `e2e/.results`; pass `--output <dir>` to avoid trace-copy clashes.
