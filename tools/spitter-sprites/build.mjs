// Spitter zombie sprites: derived from zombie_1-4's zombie_3 sheets (the Boss keeps the originals).
// Sickly bile-yellow skin, a swollen throat sac that fills up before the spit and empties on it,
// bile drooling from the mouth, green ichor instead of red blood when hurt.
// Usage: npm run sprites:spitter [-- --zoom]
// Writes public/sprites/zombies/spitter/<Anim>.png, src/app/engine/spitter-mouth.ts (mouth pixel
// per frame, used to spit and drool from the mouth) and, with --zoom, a 3x contact sheet to
// tools/spitter-sprites/contact.png.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'public', 'sprites', 'zombies', 'zombie_3');
const OUT = path.join(ROOT, 'public', 'sprites', 'zombies', 'spitter');
const MOUTH_TS = path.join(ROOT, 'src', 'app', 'engine', 'spitter-mouth.ts');
const S = 128;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const key = (c) => c.join(',');

// zombie_3 palette -> spitter palette (pants, outline and the blue nails stay).
const RECOLOR = new Map([
  ['#d1b28a', '#c2bb7f'], // skin: jaundiced, a little green
  ['#ab8760', '#918c58'], // skin shadow
  ['#fff3bf', '#e9e46a'], // eye: yellowed
  ['#672d35', '#3f4a1c'], // eye socket
  ['#edc087', '#b5e05a'], // open mouth (attack): bile inside
]);
// Red blood -> green ichor (only away from the face: the mouth also uses #421020).
const ICHOR = new Map([
  ['#d21a26', '#8fbf3a'],
  ['#87102a', '#557a22'],
  ['#421020', '#2f4a14'],
]);
const MOUTH_COLORS = ['#421020', '#edc087'];

const BILE = {
  hi: hex('#e6f78e'),
  mid: hex('#b5e05a'),
  dark: hex('#557a22'),
  deep: hex('#2f4a14'),
  ink: hex('#010000'),
};
const SAC = {
  hi: hex('#e4dc9a'),
  mid: hex('#c4b86c'),
  dark: hex('#8a8a44'),
  vein: hex('#5d7a2a'),
};

// Throat sac radius per frame (0 = none): it swells while winding up and empties on the spit.
const ANIMS = [
  { name: 'Idle', sac: [2, 2, 3, 3, 3, 2], drool: [3, 4, 5, 6, 2, 3] },
  { name: 'Walk', sac: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2], drool: [2, 3, 4, 2, 3, 4, 2, 3, 4, 3] },
  { name: 'Attack', sac: [3, 4, 0, 1], drool: [1, 0, 0, 4], spray: [false, false, true, false] },
  { name: 'Hurt', sac: [2, 2, 2, 2], drool: [2, 0, 3, 4] },
  { name: 'Dead', sac: [2, 2, 1, 0, 0], drool: [3, 4, 5, 0, 0] },
];

function frameAccess(data, width, frame) {
  const idx = (x, y) => (y * width + frame * S + x) * 4;
  const inside = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  return {
    get(x, y) {
      if (!inside(x, y)) return null;
      const i = idx(x, y);
      if (data[i + 3] === 0) return null;
      return [data[i], data[i + 1], data[i + 2]];
    },
    set(x, y, c) {
      if (!inside(x, y)) return;
      const i = idx(x, y);
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    },
    clear(x, y) {
      if (!inside(x, y)) return;
      data[idx(x, y) + 3] = 0;
    },
    hex(x, y) {
      const c = this.get(x, y);
      return c ? '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('') : null;
    },
  };
}

/** The mouth: centre of the mouth pixels just under the eye (frames lying down have none). */
function findMouth(f) {
  let eye = null;
  for (let y = 0; y < S && !eye; y++)
    for (let x = 0; x < S; x++) if (f.hex(x, y) === '#fff3bf') eye = { x, y };
  if (!eye || eye.y > 100) return null;
  let sx = 0,
    sy = 0,
    n = 0,
    maxY = 0,
    maxX = 0;
  for (let y = eye.y + 2; y <= eye.y + 7; y++) {
    for (let x = eye.x - 5; x <= eye.x + 5; x++) {
      if (!MOUTH_COLORS.includes(f.hex(x, y))) continue;
      sx += x;
      sy += y;
      n++;
      maxY = Math.max(maxY, y);
      maxX = Math.max(maxX, x);
    }
  }
  if (n === 0) return null;
  return { x: Math.round(sx / n), y: Math.round(sy / n), front: maxX, bottom: maxY };
}

/** Drops loose specks (attack swipe lines, blood flecks) not joined to the body. */
function removeSpecks(f, maxSize) {
  const seen = new Set();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!f.get(x, y) || seen.has(y * S + x)) continue;
      const part = [];
      const stack = [[x, y]];
      seen.add(y * S + x);
      while (stack.length) {
        const [px, py] = stack.pop();
        part.push([px, py]);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = px + dx,
            ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S || seen.has(ny * S + nx) || !f.get(nx, ny))
            continue;
          seen.add(ny * S + nx);
          stack.push([nx, ny]);
        }
      }
      if (part.length <= maxSize) for (const [px, py] of part) f.clear(px, py);
    }
  }
}

function recolor(f, mouth) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const h = f.hex(x, y);
      if (!h) continue;
      const nearFace = mouth && Math.abs(y - mouth.y) <= 3 && Math.abs(x - mouth.x) <= 4;
      if (RECOLOR.has(h) && !(h === '#edc087' && !nearFace)) f.set(x, y, hex(RECOLOR.get(h)));
      else if (ICHOR.has(h) && !nearFace) f.set(x, y, hex(ICHOR.get(h)));
    }
  }
}

/** Ink outline on every empty pixel next to one of `cells` (keeps the sheet's 1 px outline style). */
function outlineCells(f, cells) {
  const own = new Set(cells.map(([x, y]) => y * S + x));
  for (const [x, y] of cells) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (!own.has(ny * S + nx) && !f.get(nx, ny)) f.set(nx, ny, BILE.ink);
    }
  }
}

/** The swollen throat sac: under the jaw, in front of the neck, lit from the front-top. */
function drawSac(f, mouth, r) {
  if (r <= 0) return;
  const cx = mouth.x - 3;
  const cy = mouth.bottom + r;
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + r * 0.6) continue;
      cells.push([cx + x, cy + y]);
      const lit = x - y; // light from the front (+x) and the top (-y)
      const c = lit > r * 0.9 ? SAC.hi : lit < -r * 0.6 || y >= r - 0.5 ? SAC.dark : SAC.mid;
      f.set(cx + x, cy + y, c);
    }
  }
  // a vein across the bigger sacs
  if (r >= 3) {
    for (let i = -r + 2; i <= 0; i++) f.set(cx + i, cy + Math.round(i / 2) + 1, SAC.vein);
  }
  outlineCells(f, cells);
}

/** A thread of bile hanging from the mouth's front corner, ending in a fat drop. */
function drawDrool(f, mouth, len) {
  if (len <= 0) return;
  const x = mouth.front;
  const y0 = mouth.bottom + 1;
  const cells = [];
  for (let i = 0; i < len; i++) {
    f.set(x, y0 + i, i === 0 ? BILE.hi : BILE.mid);
    cells.push([x, y0 + i]);
  }
  const yd = y0 + len;
  f.set(x, yd, BILE.mid);
  f.set(x + 1, yd, BILE.dark);
  f.set(x, yd + 1, BILE.dark);
  f.set(x + 1, yd + 1, BILE.deep);
  cells.push([x, yd], [x + 1, yd], [x, yd + 1], [x + 1, yd + 1]);
  // stained lips
  f.set(mouth.front - 1, mouth.bottom, BILE.dark);
  outlineCells(f, cells);
}

/** The spit frame: a spray of bile bursting out of the mouth (the glob itself is the projectile). */
function drawSpray(f, mouth) {
  const x0 = mouth.front + 2;
  const y0 = mouth.y;
  const blobs = [
    [0, 0, 3],
    [4, -1, 2],
    [7, 1, 2],
    [3, 3, 1],
    [9, -2, 1],
    [6, 4, 1],
    [11, 2, 1],
  ];
  const cells = [];
  for (const [dx, dy, size] of blobs) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = x === 0 && y === 0 ? BILE.hi : y === size - 1 && size > 1 ? BILE.dark : BILE.mid;
        f.set(x0 + dx + x, y0 + dy + y, c);
        cells.push([x0 + dx + x, y0 + dy + y]);
      }
    }
  }
  outlineCells(f, cells);
}

async function build() {
  fs.mkdirSync(OUT, { recursive: true });
  const mouths = {};
  const sheets = [];
  for (const anim of ANIMS) {
    const { data, info } = await sharp(path.join(SRC, `${anim.name}.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const frames = info.width / S;
    mouths[anim.name] = [];
    for (let k = 0; k < frames; k++) {
      const f = frameAccess(data, info.width, k);
      if (anim.name === 'Attack') removeSpecks(f, 12);
      const mouth = findMouth(f);
      recolor(f, mouth);
      if (mouth) {
        drawSac(f, mouth, anim.sac[k] ?? 0);
        drawDrool(f, mouth, anim.drool[k] ?? 0);
        if (anim.spray?.[k]) drawSpray(f, mouth);
      }
      mouths[anim.name].push(mouth ? [mouth.front, mouth.y] : null);
    }
    const file = path.join(OUT, `${anim.name}.png`);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(file);
    sheets.push({ file, width: info.width });
  }
  writeMouthTs(mouths);
  if (process.argv.includes('--zoom')) await contact(sheets);
  console.log(`spitter sprites -> ${path.relative(ROOT, OUT)}`);
}

function writeMouthTs(mouths) {
  const rows = Object.entries(mouths)
    .map(
      ([name, list]) =>
        `  ${name.toLowerCase()}: [${list.map((m) => (m ? `[${m[0]}, ${m[1]}]` : 'null')).join(', ')}],`,
    )
    .join('\n');
  const ts = `// Generated by tools/spitter-sprites/build.mjs (npm run sprites:spitter). Do not edit.

/** Spitter mouth (front corner) per frame, in pixels of the 128 x 128 frame facing right; null when lying down. */
export const SPITTER_MOUTH: Readonly<Record<string, readonly (readonly [number, number] | null)[]>> = {
${rows}
};
`;
  fs.writeFileSync(MOUTH_TS, ts);
}

async function contact(sheets) {
  const zoom = 3;
  const comps = [];
  let y = 0;
  let w = 0;
  for (const s of sheets) {
    const crop = await sharp(s.file)
      .extract({ left: 0, top: 56, width: s.width, height: 72 })
      .toBuffer();
    comps.push({
      input: await sharp(crop)
        .resize(s.width * zoom, 72 * zoom, { kernel: 'nearest' })
        .toBuffer(),
      left: 0,
      top: y,
    });
    y += 72 * zoom + 4;
    w = Math.max(w, s.width * zoom);
  }
  await sharp({ create: { width: w, height: y, channels: 4, background: '#556677' } })
    .composite(comps)
    .png()
    .toFile(path.join(ROOT, 'tools', 'spitter-sprites', 'contact.png'));
}

await build();
