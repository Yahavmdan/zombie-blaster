// Builds the pixel icon set from drafts.mjs.
//
//   npm run icons                     validate drafts, write src/app/ui/pixel-icons.ts + tools/pixel-icons/sheet.png
//   npm run icons -- --zoom bow,skull also write tools/pixel-icons/zoom.png (12x close-up, git-ignored)
//
// Icon order comes from the PixelIconId union in shared/pixel-icon.ts: add the id there first.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, MASTER, ICONS, SHAPES } from './drafts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const require = createRequire(resolve(root, 'package.json'));
const sharp = require('sharp');

const GRID = 16;
const ORDER = [...readFileSync(resolve(root, 'shared/pixel-icon.ts'), 'utf8')
  .match(/export type PixelIconId =([\s\S]*?);/)[1]
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);

const zoomArg = process.argv.indexOf('--zoom');
const zoomIds = zoomArg >= 0 ? (process.argv[zoomArg + 1] ?? '').split(',').filter(Boolean) : [];

/** Adds the 'k' ink outline around every filled pixel (4-neighbour, optionally diagonal). */
function outline(rows, noOutline = '', diag = false) {
  const g = rows.map((r) => r.split(''));
  const out = g.map((r) => r.slice());
  const filled = (r, c) =>
    r >= 0 && r < GRID && c >= 0 && c < GRID && g[r][c] !== '.' && !noOutline.includes(g[r][c]);
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      if (g[r][c] !== '.') continue;
      const n4 = filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1);
      const n8 =
        diag && (filled(r - 1, c - 1) || filled(r - 1, c + 1) || filled(r + 1, c - 1) || filled(r + 1, c + 1));
      if (n4 || n8) out[r][c] = 'k';
    }
  return out.map((r) => r.join(''));
}

// ---------- validate + outline ----------
const errors = [];
const final = {};
for (const id of Object.keys(ICONS)) if (!ORDER.includes(id)) errors.push(`${id}: not in PixelIconId`);
for (const id of ORDER) {
  const d = ICONS[id];
  if (!d) { errors.push(`${id}: no drawing in drafts.mjs`); continue; }
  let rows = d.shape ? SHAPES[d.shape].rows : typeof d.rows === 'function' ? d.rows() : d.rows;
  const noOut = d.shape ? SHAPES[d.shape].noOutline ?? '' : d.noOutline ?? '';
  const diag = d.shape ? SHAPES[d.shape].diag : d.diag;
  if (rows.length !== GRID) errors.push(`${id}: ${rows.length} rows, expected ${GRID}`);
  rows.forEach((r, i) => { if (r.length !== GRID) errors.push(`${id} row ${i}: length ${r.length} "${r}"`); });
  rows = d.raw ? rows : outline(rows, noOut, diag);
  const pal = {};
  for (const ch of new Set(rows.join('').replace(/\./g, ''))) {
    const name = (d.pal && d.pal[ch]) || MASTER[ch];
    if (!name || !COLORS[name]) errors.push(`${id}: no colour for '${ch}'`);
    pal[ch] = name;
  }
  final[id] = { rows, pal, shape: d.shape };
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// ---------- contact sheet (4x, 3x, 2x, 1x on the two panel colours) ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const COLS = 8, CW = 136, CH = 96;
const W = COLS * CW, H = Math.ceil(ORDER.length / COLS) * CH;
const buf = Buffer.alloc(W * H * 4);
const bgs = ['#2a2622', '#1b1916'];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const [r, g, b] = hex(bgs[(Math.floor(x / CW) + Math.floor(y / CH)) % 2]);
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
  }
function blit(target, width, id, ox, oy, s) {
  const { rows, pal } = final[id];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      const [R, G, B] = hex(COLORS[pal[ch]]);
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) {
          const i = ((oy + r * s + dy) * width + (ox + c * s + dx)) * 4;
          target[i] = R; target[i + 1] = G; target[i + 2] = B;
        }
    }
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
ORDER.forEach((id, n) => {
  const x0 = (n % COLS) * CW, y0 = Math.floor(n / COLS) * CH;
  blit(buf, W, id, x0 + 4, y0 + 4, 4);
  blit(buf, W, id, x0 + 72, y0 + 4, 3);
  blit(buf, W, id, x0 + 72, y0 + 56, 2);
  blit(buf, W, id, x0 + 108, y0 + 56, 1);
  svg += `<text x="${x0 + 4}" y="${y0 + 88}" font-family="Arial" font-size="11" fill="#e8dcc2">${n} ${id}</text>`;
});
svg += '</svg>';
await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(resolve(here, 'sheet.png'));

if (zoomIds.length) {
  const S = 12, ZW = zoomIds.length * (GRID * S + 8), ZH = GRID * S;
  const zb = Buffer.alloc(ZW * ZH * 4);
  for (let i = 0; i < zb.length; i += 4) { zb[i] = 0x2a; zb[i + 1] = 0x26; zb[i + 2] = 0x22; zb[i + 3] = 255; }
  zoomIds.forEach((id, n) => {
    if (!final[id]) throw new Error(`--zoom: unknown icon ${id}`);
    blit(zb, ZW, id, n * (GRID * S + 8), 0, S);
  });
  await sharp(zb, { raw: { width: ZW, height: ZH, channels: 4 } }).png().toFile(resolve(here, 'zoom.png'));
}

// ---------- emit src/app/ui/pixel-icons.ts ----------
const usedColors = new Set();
for (const id of ORDER) Object.values(final[id].pal).forEach((n) => usedColors.add(n));
const colorOrder = Object.keys(COLORS).filter((n) => usedColors.has(n));
let ts = `// GENERATED by tools/pixel-icons/build.mjs from tools/pixel-icons/drafts.mjs. Edit the drafts, then \`npm run icons\`.\n`;
ts += `import type { PixelIconId } from '@shared/pixel-icon';\n\n`;
ts += `/** A 16x16 pixel icon: one char per pixel, '.' is transparent, every other char is a palette key. */\n`;
ts += `export interface PixelIconDef {\n  readonly palette: Readonly<Record<string, string>>;\n  readonly rows: readonly string[];\n}\n\n`;
ts += `// Palette: the UI tokens (src/styles/tokens.css) plus the darker/lighter shades the art needs.\n`;
for (const n of colorOrder) ts += `const ${n}: string = '${COLORS[n]}';\n`;
ts += '\n';
const shapeRows = {};
for (const id of ORDER) if (final[id].shape) shapeRows[final[id].shape] = final[id].rows;
for (const [name, rows] of Object.entries(shapeRows)) {
  const comment = SHAPES[name].comment ? `/** ${SHAPES[name].comment} */\n` : '';
  ts += `${comment}const ${name}: readonly string[] = [\n${rows.map((r) => `  '${r}',`).join('\n')}\n];\n\n`;
}
ts += `/** Hand-drawn icon set. 'k' is the 1px ink outline in every palette. */\n`;
ts += `export const PIXEL_ICONS: Readonly<Record<PixelIconId, PixelIconDef>> = {\n`;
for (const id of ORDER) {
  const { rows, pal, shape } = final[id];
  const key = /^[a-z]+$/.test(id) ? id : `'${id}'`;
  const palStr = Object.entries(pal)
    .sort(([a], [b]) => (a === 'k' ? -1 : b === 'k' ? 1 : 0))
    .map(([ch, n]) => `${ch}: ${n}`)
    .join(', ');
  const rowsStr = shape ? shape : `[\n${rows.map((r) => `      '${r}',`).join('\n')}\n    ]`;
  ts += `  ${key}: {\n    palette: { ${palStr} },\n    rows: ${rowsStr},\n  },\n`;
}
ts += '};\n';
const outFile = resolve(root, 'src/app/ui/pixel-icons.ts');
writeFileSync(outFile, ts);
execFileSync(process.execPath, [require.resolve('prettier/bin/prettier.cjs'), '--write', outFile], { stdio: 'ignore' });
console.log(`pixel icons: ${ORDER.length} icons -> src/app/ui/pixel-icons.ts, tools/pixel-icons/sheet.png`);
