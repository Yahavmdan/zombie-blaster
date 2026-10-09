// Source art for the pixel icon set. Fill-only 16x16 rows (. = empty); build.mjs adds the k ink outline.
// Edit here, then run `npm run icons` to regenerate src/app/ui/pixel-icons.ts and sheet.png.
export const COLORS = {
  INK: '#0e0d0b',
  INK_2: '#1b1916',
  WHITE: '#fff8e8',
  BONE: '#e8dcc2',
  BONE_DIM: '#a89c84',
  BONE_FAINT: '#6f6656',
  BLOOD_HI: '#e0503f',
  BLOOD: '#b8322a',
  BLOOD_DARK: '#6e1c17',
  HP_HI: '#ef5a46',
  HP: '#c9302c',
  RUST_HI: '#e8964a',
  RUST: '#c9762c',
  RUST_DARK: '#7a4318',
  GLOW: '#fff3b0',
  GOLD_HI: '#ffe08a',
  GOLD: '#f2c14e',
  GOLD_DARK: '#b07f22',
  TOXIC_HI: '#b5e05a',
  TOXIC: '#8fbf3a',
  TOXIC_DARK: '#557a22',
  STEEL_LIGHT: '#a9bac6',
  STEEL_HI: '#6f8190',
  STEEL: '#4f5d68',
  STEEL_DARK: '#2e363d',
  MP_LIGHT: '#9cc4ff',
  MP_HI: '#5f9bef',
  MP: '#3a74c9',
  MP_DARK: '#1f4580',
  PURPLE_HI: '#c48ce8',
  PURPLE: '#8a4fc0',
  PURPLE_DARK: '#55307a',
  TEAL_HI: '#8fe8d8',
  TEAL: '#3fb3a0',
  TEAL_DARK: '#1f6e62',
  WOOD_HI: '#b07a44',
  WOOD: '#8a5a2e',
  WOOD_DARK: '#5e3d20',
  PINK_HI: '#f4b4b8',
  PINK: '#d87c88',
  PINK_DARK: '#8e4452',
};

export const MASTER = {
  k: 'INK', d: 'INK_2', w: 'WHITE', b: 'BONE', B: 'BONE_DIM', f: 'BONE_FAINT',
  r: 'BLOOD_HI', R: 'BLOOD', q: 'BLOOD_DARK',
  o: 'RUST_HI', O: 'RUST', x: 'RUST_DARK',
  Y: 'GLOW', y: 'GOLD_HI', g: 'GOLD', G: 'GOLD_DARK',
  t: 'TOXIC_HI', T: 'TOXIC', v: 'TOXIC_DARK',
  c: 'STEEL_LIGHT', s: 'STEEL_HI', S: 'STEEL', z: 'STEEL_DARK',
  a: 'MP_LIGHT', p: 'MP_HI', P: 'MP', n: 'MP_DARK',
  u: 'PURPLE_HI', U: 'PURPLE', m: 'PURPLE_DARK',
  e: 'TEAL_HI', E: 'TEAL', F: 'TEAL_DARK',
  h: 'WOOD_HI', H: 'WOOD', D: 'WOOD_DARK',
  i: 'PINK_HI', I: 'PINK', J: 'PINK_DARK',
};

const blank = () => Array.from({ length: 16 }, () => Array(16).fill('.'));
const rowsOf = (g) => g.map((r) => r.join(''));
const polar = (fn) => {
  const g = blank();
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    const dx = c + 0.5 - 8, dy = r + 0.5 - 8;
    const ch = fn(dx, dy, Math.hypot(dx, dy), (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI), r, c);
    if (ch) g[r][c] = ch;
  }
  return rowsOf(g);
};
// light top-left, dark bottom-right on a silhouette of 'X'
const autoShade = (rows, hi, mid, lo) => {
  const g = rows.map((r) => r.split(''));
  const on = (r, c) => r >= 0 && r < 16 && c >= 0 && c < 16 && rows[r][c] !== '.';
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    if (!on(r, c)) continue;
    const tl = !on(r - 1, c) || !on(r, c - 1);
    const br = !on(r + 1, c) || !on(r, c + 1);
    g[r][c] = tl && !br ? hi : br && !tl ? lo : mid;
  }
  return rowsOf(g);
};
const rot90 = (rows) => rows.map((_, r) => rows.map((row) => row[r]).reverse().join('')); // clockwise
const flipV = (rows) => rows.slice().reverse();

const ARROW = [
  '................',
  '................',
  '.......XX.......',
  '......XXXX......',
  '.....XXXXXX.....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '................',
  '................',
];

const HEART = [
  '................',
  '................',
  '................',
  '...LLL....MMM...',
  '..LWWLM..MMMMD..',
  '..LWLMMMMMMMMD..',
  '..LLMMMMMMMMMD..',
  '..LMMMMMMMMMDD..',
  '...MMMMMMMMDD...',
  '....MMMMMMDD....',
  '.....MMMMDD.....',
  '......MMDD......',
  '.......DD.......',
  '................',
  '................',
  '................',
];
const heartWith = (L, M, D, W) => HEART.map((r) => r.replace(/L/g, L).replace(/M/g, M).replace(/D/g, D).replace(/W/g, W));

export const SHAPES = {
  POTION_SMALL_ROWS: {
    comment: 'Small round potion bottle; liquid l/m/d, glass c/s, cork h/H.',
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.......hH.......',
      '......cccs......',
      '.......cs.......',
      '.....wlllm......',
      '....lwllmmmd....',
      '....lwllmmmd....',
      '....llmmmmdd....',
      '....lmmmmmdd....',
      '.....mmmmdd.....',
      '......dddd......',
      '................',
      '................',
    ],
  },
  POTION_MEDIUM_ROWS: {
    comment: 'Medium potion bottle; same letters as the small one.',
    rows: [
      '................',
      '................',
      '......hhHH......',
      '......hHHH......',
      '.....ccccss.....',
      '......ccss......',
      '.....llllmm.....',
      '....lwllllmm....',
      '...lwwlllmmmd...',
      '...lwlllmmmmd...',
      '...lllmmmmmdd...',
      '...llmmmmmddd...',
      '...lmmmmmdddd...',
      '....mmmmmddd....',
      '.....dddddd.....',
      '................',
    ],
  },
  POTION_LARGE_ROWS: {
    comment: 'Large potion jug with a label band; same letters as the small one.',
    rows: [
      '................',
      '.....hhhHH......',
      '.....hHHHH......',
      '....ccccccss....',
      '.....ccccss.....',
      '....lllllmmm....',
      '...lwwllllmmm...',
      '..lwwllllmmmmd..',
      '..lwlllllmmmmd..',
      '..bbbbbbbbbbBB..',
      '..BBBBBBBBBBff..',
      '..llmmmmmmmddd..',
      '..lmmmmmmmdddd..',
      '...mmmmmmmddd...',
      '....dddddddd....',
      '................',
    ],
  },
};

const hp = { l: 'HP_HI', m: 'HP', d: 'BLOOD_DARK' };
const mp = { l: 'MP_HI', m: 'MP', d: 'MP_DARK' };
const elixir = { l: 'PURPLE_HI', m: 'PURPLE', d: 'PURPLE_DARK' };

export const ICONS = {
  sword: {
    rows: [
      '................',
      '............wc..',
      '...........wcS..',
      '..........wcS...',
      '.........wcS....',
      '........wcS.....',
      '..yg...wcS......',
      '...yg.wcS.......',
      '....gwcS........',
      '.....gG.........',
      '....hHgG........',
      '...hH..GG.......',
      '..yg............',
      '..gG............',
      '................',
      '................',
    ],
  },
  bow: {
    noOutline: 'b',
    rows: [
      '................',
      '.........hHb....',
      '........hH.b....',
      '.......hH..b....',
      '......hH...b....',
      '.....hH....b....',
      '..c.hH.....bRR..',
      '.wcbbbbbbbbbRR..',
      '..c.hH.....bRR..',
      '....hH.....b....',
      '.....hH....b....',
      '......hH...b....',
      '.......hH..b....',
      '........hH.b....',
      '.........hHb....',
      '................',
    ],
    pal: { R: 'BLOOD_HI' },
  },
  orb: {
    rows: [
      '................',
      '.....uuuuUU.....',
      '....uwwuuUUU....',
      '...uwwuuUUUUU...',
      '...uwuuUUUUUm...',
      '...uuUUUUUUUm...',
      '...uUUUUUUUmm...',
      '...UUUUUUUUmm...',
      '...UUUUUUUmmm...',
      '....UUUUUmmm....',
      '.....mmmmmm.....',
      '................',
      '.....yggGG......',
      '....yggggGGG....',
      '...GGGGGGGGGG...',
      '................',
    ],
  },
  dagger: {
    rows: [
      '................',
      '.......cS.......',
      '.......wS.......',
      '.......wS.......',
      '.......cS.......',
      '.......cS.......',
      '.......cS.......',
      '.......cS.......',
      '...g...cS...G...',
      '...yggggggggG...',
      '.......hH.......',
      '.......hH.......',
      '.......hH.......',
      '......ygGG......',
      '................',
      '................',
    ],
  },
  holy: {
    noOutline: 'Y',
    rows: [
      '................',
      '..Y....yg....Y..',
      '...Y...yg...Y...',
      '.......yg.......',
      '...yyyywyyyyg...',
      '...ggggygGGGG...',
      '.......yg.......',
      '.......gG.......',
      '...Y...gG...Y...',
      '..Y....gG....Y..',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......GG.......',
      '................',
      '................',
    ],
  },
  whirl: {
    rows: () => {
      const b = 3.3 / (2 * Math.PI);
      return polar((dx, dy, rho, th) => {
        for (let n = 0; n < 4; n++) {
          const t = th + 2 * Math.PI * n;
          if (t < 1.2 || t > 12.6) continue;
          if (Math.abs(rho - b * t) < 1.1) {
            const lit = -(dx + dy) / Math.max(rho, 0.1);
            return lit > 0.35 ? 'e' : lit < -0.35 ? 'F' : 'E';
          }
        }
        return null;
      });
    },
  },
  wind: {
    rows: [
      '................',
      '..........ccc...',
      '.........c...c..',
      '.............c..',
      '.wwwwwwwwwwwcc..',
      '................',
      '................',
      '...wwwwwwwwwwww.',
      '................',
      '................',
      '.wwwwwwwwwwcc...',
      '............c...',
      '........c...c...',
      '.........ccc....',
      '................',
      '................',
    ],
  },
  heal: { rows: heartWith('t', 'T', 'v', 'w') },
  shield: {
    rows: [
      '................',
      '..cccccccccccc..',
      '..crrrrrRRRRRS..',
      '..crrrrrRRRRRS..',
      '..crrrrrRRRRRS..',
      '..crrrrygRRRRS..',
      '..crrrrgGRRRRS..',
      '..crrrrrRRRRRS..',
      '..crrrrrRRRRRS..',
      '...crrrrRRRRS...',
      '...crrrrRRRRS...',
      '....crrrRRRS....',
      '.....crrRRS.....',
      '......crRS......',
      '.......SS.......',
      '................',
    ],
  },
  fist: {
    rows: [
      '................',
      '................',
      '...bB.bB.bB.bB..',
      '...bBkbBkbBkbB..',
      '...bBkbBkbBkbB..',
      '..bbbbbbbbkBBf..',
      '..bBBBBBBBkBBf..',
      '..BkkkkkkkBBBf..',
      '..BBBBBBBBBBBf..',
      '...BBBBBBBBBf...',
      '....RRRRRRRR....',
      '....rRRRRRRq....',
      '....rRRRRRRq....',
      '....rRRRRRRq....',
      '................',
      '................',
    ],
  },
  magnet: {
    rows: [
      '................',
      '..cccc....cccc..',
      '..csss....csss..',
      '..kkkk....kkkk..',
      '..rwRR....rRRR..',
      '..rRRR....rRRR..',
      '..rRRR....rRRR..',
      '..rRRR....rRRq..',
      '..rRRRR..RRRRq..',
      '..rRRRRRRRRRRq..',
      '...RRRRRRRRRq...',
      '....qRRRRRRq....',
      '......qqqq......',
      '................',
      '................',
      '................',
    ],
  },
  dragon: {
    rows: [
      '................',
      '...b............',
      '...Bb...........',
      '....Bb.rrr......',
      '.....BrrrrRr....',
      '....rrrrrrrRRRr.',
      '...rrrgkrrRRRRR.',
      '...rRRRRRRRRRRq.',
      '..rRRRRqqqqqqqq.',
      '..RRRRb.b.b.b...',
      '..RRRR.b.b.b....',
      '..RRRRqqqqqq....',
      '..qRRRqqq.......',
      '...qRRq.........',
      '...qqq..........',
      '................',
    ],
  },
  flask: {
    rows: [
      '................',
      '.....cccccc.....',
      '......cwss......',
      '......cwss......',
      '......cwss......',
      '.....cttTTs.....',
      '.....ctTTTs.....',
      '....cttTTTTs....',
      '....ctwTTTTs....',
      '...cttTTTTTTs...',
      '...ctTTTwTTvs...',
      '..cttTTTTTTvvs..',
      '..ctTTTTTTvvvs..',
      '...ssssssssss...',
      '................',
      '................',
    ],
  },
  star: {
    rows: [
      '................',
      '.......yg.......',
      '.......yg.......',
      '......yygg......',
      '......yygg......',
      '.yyyyyywgggggGG.',
      '..yyyyyygggggG..',
      '...yyyyygggGG...',
      '....yyyyggGG....',
      '....yyyggGGG....',
      '...yyygGGgGGG...',
      '...yyGG..gGGG...',
      '..yGG......GGG..',
      '..GG........GG..',
      '................',
      '................',
    ],
  },
  spring: {
    rows: [
      '................',
      '..yyyyyyyyyyyG..',
      '..GGGGGGGGGGGG..',
      '....cccccccc....',
      '..........cs....',
      '....ssssssss....',
      '...cs...........',
      '....cccccccc....',
      '..........cs....',
      '....ssssssss....',
      '...cs...........',
      '....cccccccc....',
      '..........cs....',
      '...zzzzzzzzzz...',
      '................',
      '................',
    ],
  },
  paw: {
    rows: [
      '................',
      '....bb....bb....',
      '...bbbB..bbbB...',
      '...bBBB..bBBB...',
      '....BB....BB....',
      '.bb..........bb.',
      '.bbB........bbB.',
      '.bBB........bBB.',
      '..B...bbbb...B..',
      '.....bbbbbbB....',
      '....bbbbbbbBB...',
      '....bbbbbbBBB...',
      '....bbBBBBBBB...',
      '.....BBBBBBB....',
      '......BB..BB....',
      '................',
    ],
  },
  twins: {
    rows: () => {
      const FIG = ['..XXXX..', '.XXXXXX.', '.XXXXXX.', '.XXXXXX.', '..XXXX..', '........', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX'];
      const stamp = (r0, c0) => {
        const g = blank();
        FIG.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'X') g[r0 + r][c0 + c] = 'X'; }));
        return rowsOf(g);
      };
      const back = autoShade(stamp(1, 7), 's', 'S', 'z').map((r) => r.split(''));
      const front = autoShade(stamp(5, 1), 'w', 'c', 's');
      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => front[r + dr]?.[c + dc] && front[r + dr][c + dc] !== '.');
        if (front[r][c] !== '.') back[r][c] = front[r][c];
        else if (near) back[r][c] = '.';
      }
      return back.map((r) => r.join(''));
    },
  },
  eclipse: {
    noOutline: 'j',
    pal: { j: 'GOLD' },
    rows: () =>
      polar((dx, dy, rho, th) => {
        if (rho < 4.5) return dx + dy > 3.2 && rho > 3.2 ? 'U' : 'm';
        if (rho < 5.9) {
          const lit = -(dx + dy) / rho;
          return lit > 0.3 ? 'Y' : lit < -0.5 ? 'g' : 'y';
        }
        const a = (((th / (Math.PI / 4)) % 1) + 1) % 1;
        if (rho < 7.6 && (a < 0.12 || a > 0.88)) return 'j';
        return null;
      }),
  },
  moon: {
    rows: () =>
      polar((dx, dy, rho) => {
        if (rho > 6.4) return null;
        const d2 = Math.hypot(dx - 2.6, dy + 2.4);
        if (d2 < 5.0) return null;
        if (d2 < 6.1) return 'g';
        return dx + dy > 4 ? 'G' : -(dx + dy) > 5 ? 'Y' : 'y';
      }),
  },
  bolt: {
    rows: [
      '................',
      '........yyyg....',
      '.......yyyg.....',
      '......yyyg......',
      '.....yyyg.......',
      '....yyyg........',
      '...yyyyywwg.....',
      '.......yyGG.....',
      '......yygG......',
      '.....yygG.......',
      '....yyG.........',
      '...yG...........',
      '..y.............',
      '................',
      '................',
      '................',
    ],
  },
  skull: {
    rows: [
      '................',
      '................',
      '.....bbbbbb.....',
      '...bbwwbbbbbB...',
      '..bbwbbbbbbbbB..',
      '..bbbbbbbbbbbB..',
      '..bbkkkbbkkkbB..',
      '..bbkrkbbkrkbB..',
      '..bBkkkbbkkkBB..',
      '...bbbbkkbbbB...',
      '....bbbbbbbB....',
      '....bkbkbkbB....',
      '....BBBBBBBB....',
      '................',
      '................',
      '................',
    ],
  },
  'potion-hp-s': { shape: 'POTION_SMALL_ROWS', pal: hp },
  'potion-hp-m': { shape: 'POTION_MEDIUM_ROWS', pal: hp },
  'potion-hp-l': { shape: 'POTION_LARGE_ROWS', pal: hp },
  'potion-mp-s': { shape: 'POTION_SMALL_ROWS', pal: mp },
  'potion-mp-m': { shape: 'POTION_MEDIUM_ROWS', pal: mp },
  elixir: { shape: 'POTION_LARGE_ROWS', pal: elixir },
  heart: { rows: heartWith('r', 'R', 'q', 'w') },
  mana: {
    rows: [
      '................',
      '.......pP.......',
      '.......pP.......',
      '......ppPP......',
      '......pwPP......',
      '.....ppPPPP.....',
      '....ppwPPPPP....',
      '....pwPPPPPP....',
      '...ppwPPPPPPn...',
      '...ppPPPPPPPn...',
      '...pPPPPPPPnn...',
      '...pPPPPPPnnn...',
      '....PPPPPnnn....',
      '.....nnnnnn.....',
      '................',
      '................',
    ],
  },
  coin: {
    rows: [
      '................',
      '................',
      '......yyyy......',
      '....yyyyyygg....',
      '...yyggggggGG...',
      '...ygggGGgggG...',
      '..yggggGygggGG..',
      '..yggggGygggGG..',
      '..yggggGygggGG..',
      '..yggggGygggGG..',
      '...ggggggggGG...',
      '...ggggggGGGG...',
      '....GGGGGGGG....',
      '......GGGG......',
      '................',
      '................',
    ],
  },
  shop: {
    rows: [
      '................',
      '................',
      '..RRbbRRbbRRbb..',
      '..RRbbRRbbRRbb..',
      '..qqBBqqBBqqBB..',
      '...hhhhhhhhhh...',
      '...hcpphhhhhH...',
      '...hcpphDDDhH...',
      '...hpPPhDDDhH...',
      '...hhhhhDgDhH...',
      '...hhhhhDDDhH...',
      '...hhhhhDDDhH...',
      '...HHHHHDDDHH...',
      '..ffffffffffff..',
      '................',
      '................',
    ],
  },
  bag: {
    rows: [
      '................',
      '................',
      '......oOO.......',
      '.....oooOO......',
      '......ggG.......',
      '.....ooooO......',
      '....oooooOO.....',
      '...ooooooOOO....',
      '..ooooooooOOO...',
      '..ooooooooOOO...',
      '..ooooooooOOx...',
      '..oooooooOOxx...',
      '...ooooOOOxx....',
      '....xxxxxxx.....',
      '................',
      '................',
    ],
    pal: { o: 'RUST_HI', O: 'RUST', x: 'RUST_DARK' },
  },
  gear: {
    rows: () =>
      polar((dx, dy, rho, th) => {
        const tooth = ((th / (Math.PI / 4) + 0.25) % 1) < 0.5;
        if (rho < 1.9) return null;
        if (rho < 5.0 || (rho < 7.0 && tooth)) {
          const lit = -(dx + dy);
          return lit > 2.5 ? 'c' : lit < -2.5 ? 'S' : 's';
        }
        return null;
      }),
  },
  book: {
    rows: [
      '................',
      '................',
      '................',
      '..bbb......bbb..',
      '.bbbbbb..bbbbbB.',
      '.bbbbbbbbbbbbbB.',
      '.bfffbbBBbfffbB.',
      '.bbbbbbBBbbbbbB.',
      '.bfffbbBBbfffbB.',
      '.bbbbbbBBbbbbbB.',
      '.bfffbbBBbfffbB.',
      '.bbbbbbBBbbbbbB.',
      '.RRRRRRqqRRRRRq.',
      '...RRRq..qRRR...',
      '................',
      '................',
    ],
  },
  chart: {
    rows: [
      '................',
      '................',
      '................',
      '..........tTv...',
      '..........tTv...',
      '..........tTv...',
      '......ygG.tTv...',
      '......ygG.tTv...',
      '......ygG.tTv...',
      '..rRq.ygG.tTv...',
      '..rRq.ygG.tTv...',
      '..rRq.ygG.tTv...',
      '..rRq.ygG.tTv...',
      '.bbbbbbbbbbbbbB.',
      '................',
      '................',
    ],
  },
  lock: {
    rows: [
      '................',
      '.....ccccss.....',
      '....cc....ss....',
      '....cs....sS....',
      '....cs....sS....',
      '....cs....sS....',
      '...yyyyyyyygg...',
      '...yggggggggG...',
      '...ygggkkgggG...',
      '...ygggkkgggG...',
      '...ygggkkgggG...',
      '...yggggggggG...',
      '...GGGGGGGGGG...',
      '................',
      '................',
      '................',
    ],
  },
  close: {
    rows: () =>
      autoShade(
        polar((dx, dy, rho, th, r, c) =>
          r >= 2 && r <= 13 && c >= 2 && c <= 13 && (Math.abs(r - c) <= 1 || Math.abs(r + c - 15) <= 1) ? 'X' : null,
        ),
        'w', 'b', 'B',
      ),
  },
  spark: {
    rows: [
      '................',
      '.......wy.......',
      '.......yg.......',
      '.......yg.......',
      '......yygg......',
      '......yygg......',
      '.....yywwgg.....',
      '.yyyyywwwwggggg.',
      '.gggggwwwwGGGGG.',
      '.....ggwwGG.....',
      '......ggGG......',
      '......ggGG......',
      '.......gG.......',
      '.......gG.......',
      '.......GG.......',
      '................',
    ],
  },
  zombie: {
    rows: [
      '................',
      '......zz.z......',
      '.....zzzzzz.....',
      '....tttttTTT....',
      '...ttttTTTTTv...',
      '...ttTTTTTTTv...',
      '...tTkkTTkkTv...',
      '...tTykTTkyTv...',
      '...tTTTTvTTTv...',
      '...TTTTTTTTTv...',
      '...TkbkbkbkTv...',
      '...vTTRTTTTvv...',
      '....vvvvvvvv....',
      '................',
      '................',
      '................',
    ],
  },
  boot: {
    rows: [
      '................',
      '................',
      '...ooooooO......',
      '...hhhhhhH......',
      '...hhhhhbH......',
      '...hhhhhbH......',
      '...hhhhhbH......',
      '...hhhhhhbHH....',
      '...hhhhhhhhHH...',
      '...hhhhhhhhhhH..',
      '...hhhhhhhhhhhH.',
      '...HHHHHHHHHHHH.',
      '...zzzzzzzzzzzz.',
      '................',
      '................',
      '................',
    ],
  },
  brain: {
    rows: [
      '................',
      '................',
      '................',
      '....iiiiiIII....',
      '..iwwiiJiIIJII..',
      '.iwiJJiiJIIJIII.',
      '.iiJiiJJiIJJIJI.',
      '.iJiiiiJIJIIIJI.',
      '.iiJJiiJIIJJIIJ.',
      '..iiiJJIIJIIIJ..',
      '...IIIIJIIJJJ...',
      '.........IJ.....',
      '.........JJ.....',
      '................',
      '................',
      '................',
    ],
  },
  clover: {
    rows: () => {
      const g = polar((dx, dy) => {
        if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) return null;
        const sx = Math.sign(dx), sy = Math.sign(dy);
        const ex = dx - sx * 3.3, ey = dy - sy * 3.3;
        if (Math.hypot(ex, ey) > 3.1) return null;
        if (Math.hypot(dx - sx * 6.6, dy - sy * 6.6) < 2.6) return null;
        return ex + ey < -1.2 ? 't' : ex + ey > 1.2 ? 'v' : 'T';
      }).map((r) => r.split(''));
      [[7, 7], [7, 8], [8, 7], [8, 8], [9, 8], [10, 8], [11, 9], [12, 9], [13, 10], [14, 11]].forEach(([r, c]) => (g[r][c] = 'v'));
      return g.map((r) => r.join(''));
    },
  },
  'arrow-up': { rows: autoShade(ARROW, 'w', 'b', 'B') },
  'arrow-down': { rows: autoShade(flipV(ARROW), 'w', 'b', 'B') },
  'arrow-left': { rows: autoShade(rot90(rot90(rot90(ARROW))), 'w', 'b', 'B') },
  'arrow-right': { rows: autoShade(rot90(ARROW), 'w', 'b', 'B') },
  slot: {
    raw: false,
    rows: [
      '................',
      '................',
      '..sssssssssssS..',
      '..szzzzzzzzzcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szddddddddcS..',
      '..szcccccccccS..',
      '..SSSSSSSSSSSS..',
      '................',
      '................',
    ],
  },
  revive: {
    rows: heartWith('r', 'R', 'q', 'w').map((row, r) =>
      row
        .split('')
        .map((ch, c) =>
          ch !== '.' && (((c === 7 || c === 8) && r >= 4 && r <= 9) || ((r === 6 || r === 7) && c >= 5 && c <= 10)) ? 'b' : ch,
        )
        .join(''),
    ),
  },
};
