// Eater zombie sprite generator: rigged quadruped crawler, 128x128 frames, zombie_1-4 style
// (rim shading, colored selective outline, inner contours between overlapping limbs).
// Usage: node generate-eater-sprites.cjs [Anim1,Anim2,...]
// Writes public/sprites/zombies/eater/<Anim>.png and a zoomed preview to <tmp>/eater-contact.png.
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const OUT = path.join(__dirname, 'public', 'sprites', 'zombies', 'eater');

const S = 128;
const GY = 126; // lowest pixel row of hands/feet (outline sits on 127)

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const blend = (c, t, a) => c.map((v, i) => Math.round(v * (1 - a) + t[i] * a));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

// Colors taken from the zombie_1-4 sheets: two flat tones per material, black ink.
const PAL = {
  skin: hex('#e3cfc0'),
  skinS: hex('#c7a59a'),
  skinD: hex('#926e6a'),
  belly: hex('#e3cfc0'),
  pants: hex('#56312b'),
  pantsS: hex('#251914'),
  claw: hex('#0d0a17'),
  blood: hex('#421020'),
  bloodHi: hex('#672d35'),
  eye: hex('#fff3bf'),
  socket: hex('#2f1418'),
  mouth: hex('#421020'),
  tooth: hex('#fff3bf'),
  hair: hex('#2f1418'),
  ink: hex('#0d0a17'),
  outline: hex('#010000'),
};
PAL.skinFar = PAL.skinS;
PAL.pantsFar = PAL.pantsS;
const key = (c) => c.join(',');
// base tone -> its flat shadow tone
const SHADOW = new Map([
  [key(PAL.skin), PAL.skinS],
  [key(PAL.skinS), PAL.skinD],
  [key(PAL.pants), PAL.pantsS],
  [key(PAL.pantsS), PAL.pantsS],
]);
// light comes from the front-top (the way the zombie faces); shadow falls on the back and underside
const LIGHT = (() => {
  const x = 0.45,
    y = -0.9,
    l = Math.hypot(x, y);
  return [x / l, y / l];
})();
const SHADOW_SHARE = 0.5;
// inner line where a part overlaps another: the darkest tone of the front part's material
const INNER = new Map([
  [key(PAL.skin), PAL.skinD],
  [key(PAL.skinS), PAL.skinD],
  [key(PAL.skinD), PAL.ink],
  [key(PAL.pants), PAL.pantsS],
  [key(PAL.pantsS), PAL.ink],
]);

class Canvas {
  constructor() {
    this.px = new Array(S * S).fill(null);
    this.z = {};
    this.zc = 0;
  }
  set(x, y, part, col, fixed) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    if (!(part in this.z)) this.z[part] = this.zc++;
    this.px[y * S + x] = { part, col, fixed: !!fixed };
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= S || y >= S ? null : this.px[y * S + x];
  }
  disc(cx, cy, r, part, col) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) this.set(x, y, part, col);
  }
  ellipse(cx, cy, rx, ry, part, col, ang = 0) {
    const c = Math.cos(ang),
      s = Math.sin(ang),
      R = Math.max(rx, ry) + 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx,
          dy = y - cy;
        const lx = dx * c + dy * s,
          ly = -dx * s + dy * c;
        if ((lx / rx) ** 2 + (ly / ry) ** 2 <= 1.04) this.set(x, y, part, col);
      }
  }
  capsule(a, b, ra, rb, part, col) {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.disc(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(ra, rb, t), part, col);
    }
  }
  poly(pts, part, col) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i],
          [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y))
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, part, col);
    }
  }
  line(a, b, col, part = 'detail') {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    for (let i = 0; i <= n; i++)
      this.set(lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n), part, col, true);
  }
  dot(p, col) {
    this.set(p[0], p[1], 'detail', col, true);
  }
  // flat two-tone shading: the part of each shape facing away from the light takes the shadow tone
  shade() {
    const march = (x, y, part, dx, dy) => {
      let n = 0;
      for (let k = 1; k < 24; k++) {
        const q = this.get(Math.round(x + dx * k), Math.round(y + dy * k));
        if (!q || q.part !== part) break;
        n = k;
      }
      return n;
    };
    this.px = this.px.map((p, i) => {
      if (!p || p.fixed) return p;
      const x = i % S,
        y = (i / S) | 0;
      const lit = march(x, y, p.part, LIGHT[0], LIGHT[1]);
      const dark = march(x, y, p.part, -LIGHT[0], -LIGHT[1]);
      const inShadow = (dark + 0.5) / (lit + dark + 1) < SHADOW_SHARE;
      const col = inShadow ? SHADOW.get(key(p.col)) || p.col : p.col;
      return { part: p.part, col, fixed: false };
    });
  }
  // dark line where a part sits in front of a different limb/body group
  contour() {
    const grp = (p) => p.split('.')[0];
    this.px = this.px.map((p, i) => {
      if (!p || p.fixed) return p;
      const x = i % S,
        y = (i / S) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const q = this.get(x + dx, y + dy);
        if (
          q &&
          !q.fixed &&
          grp(q.part) !== grp(p.part) &&
          this.z[q.part] < this.z[p.part] &&
          !NOCONTOUR.has(grp(p.part) + '|' + grp(q.part))
        )
          return { part: p.part, col: INNER.get(key(p.col)) || PAL.ink, fixed: true };
      }
      return p;
    });
  }
  outline() {
    const adds = [];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (this.get(x, y)) continue;
        const n = [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ]
          .map(([dx, dy]) => this.get(x + dx, y + dy))
          .find(Boolean);
        if (n) adds.push([x, y, PAL.outline]);
      }
    for (const [x, y, col] of adds) this.px[y * S + x] = { part: 'outline', col, fixed: true };
  }
  rgba() {
    const buf = Buffer.alloc(S * S * 4);
    this.px.forEach((p, i) => {
      if (p) {
        buf[i * 4] = p.col[0];
        buf[i * 4 + 1] = p.col[1];
        buf[i * 4 + 2] = p.col[2];
        buf[i * 4 + 3] = 255;
      }
    });
    return buf;
  }
}

// two-bone IK: returns joint position; bend +1/-1 picks the side
function ik(root, target, l1, l2, bend) {
  let dx = target[0] - root[0],
    dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  if (d < 0.01) return [root[0], root[1] + l1];
  const ux = dx / d,
    uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [root[0] + ux * a - uy * h * bend, root[1] + uy * a + ux * h * bend];
}
function reach(root, target, l) {
  // clamp target to limb length
  const dx = target[0] - root[0],
    dy = target[1] - root[1],
    d = Math.hypot(dx, dy),
    m = l - 0.01;
  return d > m ? [root[0] + (dx * m) / d, root[1] + (dy * m) / d] : target;
}

const NOCONTOUR = new Set([
  'pants|body',
  'body|pants',
  'neck|body',
  'head|neck',
  'belly|body',
  'body|belly',
  'pants|belly',
  'legN|pants',
  'legF|pants',
]);
const LEG = [16, 17],
  ARM = [15, 17];

// ---------------- body parts ----------------
function drawLeg(c, hip, ankle, far, footAng = 0) {
  const skin = far ? PAL.skinFar : PAL.skin,
    pants = far ? PAL.pantsFar : PAL.pants;
  const tag = far ? 'legF.' : 'legN.';
  ankle = reach(hip, ankle, LEG[0] + LEG[1]);
  const knee = ik(hip, ankle, LEG[0], LEG[1], -1); // knee points forward
  c.capsule(knee, ankle, 3, 2.2, tag + 'shin', skin);
  // foot: toes forward, flat when footAng = 0, pointing down when > 0
  const toe = [ankle[0] + 6 * Math.cos(footAng), ankle[1] + 1 + 6 * Math.sin(footAng)];
  c.capsule(ankle, toe, 2.4, 1.6, tag + 'foot', skin);
  c.capsule(hip, knee, 4.2, 3, tag + 'thigh', skin);
  // ragged shorts end mid-thigh
  c.capsule(hip, lerp2(hip, knee, 0.55), 5, 4.2, tag + 'shorts', pants);
  return { knee, ankle, toe };
}

function drawArm(c, sh, wrist, far, opts = {}) {
  const skin = far ? PAL.skinFar : PAL.skin,
    tag = far ? 'armF.' : 'armN.';
  wrist = reach(sh, wrist, ARM[0] + ARM[1]);
  const elbow = ik(sh, wrist, ARM[0], ARM[1], opts.bend ?? 1); // elbow juts back / up
  c.capsule(sh, elbow, 3.4, 2.4, tag + 'uarm', skin);
  c.capsule(elbow, wrist, 2.4, 2, tag + 'farm', skin);
  // hand: palm + three long clawed fingers
  const ang = opts.handAng ?? 0;
  const palm = [wrist[0] + 2 * Math.cos(ang), wrist[1] + 1 + 2 * Math.sin(ang)];
  c.disc(palm[0], palm[1], 2.4, tag + 'hand', skin);
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const fa = ang + (opts.curl ?? 0) + (i - 1) * 0.28;
    const tip = [
      palm[0] + 6 * Math.cos(fa),
      palm[1] + 0.5 + 6 * Math.sin(fa) - (opts.flat === false ? 0 : 0),
    ];
    fingers.push([palm, tip]);
  }
  return { elbow, wrist, palm, fingers };
}
function drawFingers(c, hand, far) {
  const skin = far ? PAL.skinD : PAL.skinS;
  for (const [a, b] of hand.fingers) {
    c.line(a, b, skin);
    c.dot(b, PAL.claw);
  }
}

function spinePoint(hip, sh, arch, t) {
  const mid = [lerp(hip[0], sh[0], 0.5), lerp(hip[1], sh[1], 0.5) - arch];
  const u = 1 - t;
  return [
    u * u * hip[0] + 2 * u * t * mid[0] + t * t * sh[0],
    u * u * hip[1] + 2 * u * t * mid[1] + t * t * sh[1],
  ];
}

function drawTorso(c, p) {
  const { hip, sh, arch } = p;
  // swollen belly hanging under the middle of the body
  const bc = spinePoint(hip, sh, arch, 0.48);
  c.ellipse(
    bc[0],
    bc[1] + 7 + p.belly,
    10,
    7 + p.belly * 0.5,
    'belly.b',
    PAL.belly,
    Math.atan2(sh[1] - hip[1], sh[0] - hip[0]),
  );
  // spine/back mass
  for (let i = 0; i <= 24; i++) {
    const t = i / 24,
      q = spinePoint(hip, sh, arch, t);
    const r = t < 0.2 ? lerp(6.5, 6, t / 0.2) : t < 0.7 ? 6 : lerp(6, 7.5, (t - 0.7) / 0.3);
    c.disc(q[0], q[1], r, 'body.t', PAL.skin);
  }
  // pants waist over the pelvis
  c.ellipse(hip[0] + 1, hip[1] + 0.5, 6.5, 6, 'pants.p', PAL.pants);
}

function torsoDetails(c, p) {
  const { hip, sh, arch } = p;
  // ribs on the chest side
  for (let k = 0; k < 4; k++) {
    const q = spinePoint(hip, sh, arch, 0.62 + k * 0.08);
    c.line([q[0] - 1, q[1] - 1], [q[0] + 1, q[1] + 4], PAL.skinS);
  }
  // belly stretch veins + belt rag
  const bc = spinePoint(hip, sh, arch, 0.48);
  c.line([bc[0] - 3, bc[1] + 6 + p.belly], [bc[0] + 3, bc[1] + 7 + p.belly], PAL.skinS);
  c.dot([bc[0] + 5, bc[1] + 11 + p.belly], PAL.blood);
  c.dot([bc[0] + 6, bc[1] + 10 + p.belly], PAL.blood);
  for (let x = -5; x <= 6; x += 4) c.dot([hip[0] + x, hip[1] - 5], PAL.pantsS);
}

function drawHead(c, p) {
  const { sh } = p;
  const hc = p.head,
    ang = p.headAng;
  const R = (lx, ly) => [
    hc[0] + lx * Math.cos(ang) - ly * Math.sin(ang),
    hc[1] + lx * Math.sin(ang) + ly * Math.cos(ang),
  ];
  // neck
  c.capsule([sh[0] + 2, sh[1] - 1], R(-4, 1), 3.4, 3, 'neck.n', PAL.skin);
  // skull: long, low brow
  c.ellipse(hc[0], hc[1], 7.5, 6, 'head.s', PAL.skin, ang);
  c.ellipse(...R(4, -0.5), 4.5, 4.5, 'head.s', PAL.skin, ang);
  // lower jaw hinged at the back, opens downward
  const j = p.jaw; // 0 closed .. 1 wide
  const ja = ang + j * 0.75;
  const hinge = R(-2, 2.5);
  const J = (lx, ly) => [
    hinge[0] + lx * Math.cos(ja) - ly * Math.sin(ja),
    hinge[1] + lx * Math.sin(ja) + ly * Math.cos(ja),
  ];
  // mouth cavity
  if (j > 0.05) c.poly([R(-1, 3), R(9.5, 2.5), J(10, 2), J(0, 3)], 'head.m', PAL.mouth);
  c.poly([J(0, 1), J(10, 1.2), J(10.5, 4), J(0, 5)], 'jaw.j', PAL.skin);
  return { R, J, j };
}
function headDetails(c, h, p) {
  const { R, J, j } = h;
  // eye socket + glowing pupil
  c.dot(R(4, -2.5), PAL.socket);
  c.dot(R(5, -2.5), PAL.socket);
  c.dot(R(4, -1.5), PAL.socket);
  c.dot(R(5, -1.5), PAL.eye);
  // brow ridge
  c.line(R(2, -4.5), R(7, -3.5), PAL.skinS);
  // upper teeth row
  for (let x = 4; x <= 10; x += 3) c.dot(R(x, 3), PAL.tooth);
  // lower teeth
  for (let x = 5; x <= 10; x += 3) c.dot(J(x, 1), PAL.tooth);
  if (j < 0.05) c.line(R(1, 3.5), R(10, 3.2), PAL.mouth);
  // blood around the mouth (more when fed)
  c.dot(J(9, 4), PAL.blood);
  c.dot(J(6, 5), PAL.blood);
  if (p.gore) {
    c.dot(J(8, 5), PAL.bloodHi);
    c.dot(R(10, 1), PAL.blood);
    c.dot(J(4, 5), PAL.blood);
    c.dot(J(5, 6), PAL.blood);
  }
  // ear + stringy hair
  c.dot(R(-3, -1), PAL.skinS);
  c.dot(R(-3, 0), PAL.skinS);
  c.line(R(-2, -6), R(-7, -3), PAL.hair);
  c.line(R(1, -6), R(-4, -7), PAL.hair);
  c.line(R(-5, -5), R(-8, 0), PAL.hair);
}

// ---------------- pose ----------------
// pose: hip, sh, arch, head, headAng, jaw, belly, gore,
//       hN/hF (hind ankles), fN/fF (front wrists), footN/footF angles, handN/handF opts, extras(c)
function base() {
  return {
    hip: [47, 97],
    sh: [77, 98],
    arch: 6,
    head: [90, 99],
    headAng: 0.15,
    jaw: 0.15,
    belly: 0,
    gore: false,
    hN: [50, GY - 2],
    hF: [44, GY - 2],
    fN: [87, GY - 1],
    fF: [81, GY - 1],
    footN: 0,
    footF: 0,
    handN: {},
    handF: {},
  };
}
function shift(p, dx, dy) {
  const s = (q) => [q[0] + dx, q[1] + dy];
  return { ...p, hip: s(p.hip), sh: s(p.sh), head: s(p.head) };
}

function render(p) {
  const c = new Canvas();
  const off = [-3, -2]; // far side roots sit slightly back/up
  // far limbs
  drawLeg(c, add(p.hip, off), p.hF, true, p.footF);
  const aF = drawArm(c, add(p.sh, off), p.fF, true, p.handF);
  drawTorso(c, p);
  drawLeg(c, p.hip, p.hN, false, p.footN);
  const h = drawHead(c, p);
  const aN = drawArm(c, [p.sh[0] + 1, p.sh[1] + 1], p.fN, false, p.handN);
  if (p.extras) p.extras(c, 'pre');
  c.shade();
  c.contour();
  torsoDetails(c, p);
  headDetails(c, h, p);
  drawFingers(c, aF, true);
  drawFingers(c, aN, false);
  if (p.extras) p.extras(c, 'post');
  c.outline();
  return c;
}

// ---------------- animations ----------------
const TAU = Math.PI * 2;
// foot cycle: stance slides the foot back on the ground, swing lifts it forward
function stride(phase, duty, len, lift) {
  const ph = ((phase % 1) + 1) % 1;
  if (ph < duty) return { dx: len / 2 - len * (ph / duty), dy: 0, up: false };
  const q = (ph - duty) / (1 - duty);
  return { dx: -len / 2 + len * q, dy: -lift * Math.sin(Math.PI * q), up: true, q };
}

const ANIMS = {
  Idle: [
    8,
    (f, n) => {
      const p = base(),
        t = f / n;
      const br = Math.sin(TAU * t);
      p.hip[1] += br * 0.6;
      p.sh[1] += br;
      p.arch += br * 0.6;
      p.head = [90 + Math.sin(TAU * t * 2) * 1, 99 + br * 1.2];
      p.headAng = 0.15 + (f === 3 || f === 4 ? -0.25 : 0); // sniff: snout lifts
      p.jaw = f === 4 ? 0.45 : 0.15 + 0.1 * Math.max(0, br);
      p.belly = br * 0.6;
      return p;
    },
  ],
  Walk: [
    10,
    (f, n) => {
      const p = base(),
        t = f / n;
      const legs = { hN: 0, fN: 0.25, hF: 0.5, fF: 0.75 };
      for (const k of Object.keys(legs)) {
        const s = stride(t + legs[k], 0.7, 12, 5);
        p[k] = add(p[k], [s.dx, s.dy]);
        if (k[0] === 'h')
          p[k === 'hN' ? 'footN' : 'footF'] = s.up ? 0.5 * Math.sin(Math.PI * s.q) : 0;
      }
      const bob = Math.sin(TAU * t * 2);
      p.hip[1] += bob * 0.8;
      p.sh[1] -= bob * 0.8;
      p.hip[0] += Math.sin(TAU * t) * 1;
      p.sh[0] += Math.sin(TAU * t + 1.5) * 1;
      p.head = [90 + Math.sin(TAU * t + 1.5), 99 - bob];
      p.belly = -bob * 0.8;
      p.jaw = 0.2;
      return p;
    },
  ],
  Run: [
    8,
    (f, n) => {
      const p = base(),
        t = f / n;
      // rotary gallop: hind pair then front pair, body flexes and extends
      const legs = { hN: 0, hF: 0.1, fN: 0.5, fF: 0.6 };
      for (const k of Object.keys(legs)) {
        const s = stride(t + legs[k], 0.42, 26, 9);
        p[k] = add(p[k], [s.dx, s.dy]);
        if (k[0] === 'h')
          p[k === 'hN' ? 'footN' : 'footF'] = s.up ? 0.8 * Math.sin(Math.PI * s.q) : 0;
        else
          p[k === 'fN' ? 'handN' : 'handF'] = s.up
            ? { handAng: 0.5 * Math.sin(Math.PI * s.q), curl: 0.6 }
            : {};
      }
      const flex = Math.cos(TAU * t);
      p.hip[0] += flex * 4 - 2;
      p.sh[0] -= flex * 2;
      p.arch += -flex * 3 + 1;
      const lift = Math.sin(TAU * t);
      p.hip[1] += -2 + lift * 2;
      p.sh[1] += -3 - lift * 2;
      p.head = [p.sh[0] + 14, p.sh[1] + 1];
      p.headAng = 0.05 + lift * 0.08;
      p.jaw = 0.5 + 0.3 * Math.sin(TAU * t * 2);
      p.belly = lift * 1.2;
      return p;
    },
  ],
  Jump: [
    6,
    (f) => {
      let p = base();
      const keys = [
        // crouch
        () => {
          p = shift(p, -1, 5);
          p.arch = 9;
          p.hN = [53, GY - 2];
          p.hF = [47, GY - 2];
          p.fN = [84, GY - 1];
          p.fF = [79, GY - 1];
          p.head = [88, 105];
          p.headAng = 0.3;
          p.belly = 1.5;
        },
        // launch: hind legs push back, front lifts
        () => {
          p = shift(p, 2, -2);
          p.sh[1] -= 8;
          p.arch = 4;
          p.hN = [28, GY - 4];
          p.hF = [24, GY - 6];
          p.footN = 1.1;
          p.footF = 1.1;
          p.fN = [98, p.sh[1] + 10];
          p.fF = [94, p.sh[1] + 12];
          p.handN = { handAng: -0.3 };
          p.handF = { handAng: -0.3 };
          p.head = [p.sh[0] + 14, p.sh[1] - 4];
          p.headAng = -0.2;
          p.jaw = 0.6;
        },
        // airborne tucked
        () => {
          p = shift(p, 0, -14);
          p.arch = 8;
          p.hN = [p.hip[0] + 6, p.hip[1] + 18];
          p.hF = [p.hip[0] + 1, p.hip[1] + 17];
          p.footN = 0.6;
          p.footF = 0.6;
          p.fN = [p.sh[0] + 13, p.sh[1] + 15];
          p.fF = [p.sh[0] + 9, p.sh[1] + 16];
          p.handN = { handAng: 0.4, curl: 0.6 };
          p.handF = { handAng: 0.4, curl: 0.6 };
          p.head = [p.sh[0] + 13, p.sh[1] - 1];
          p.jaw = 0.4;
          p.belly = -1;
        },
        // airborne stretched, claws forward
        () => {
          p = shift(p, 2, -12);
          p.arch = 2;
          p.hN = [p.hip[0] - 16, p.hip[1] + 18];
          p.hF = [p.hip[0] - 20, p.hip[1] + 15];
          p.footN = 1.2;
          p.footF = 1.2;
          p.fN = [p.sh[0] + 24, p.sh[1] + 6];
          p.fF = [p.sh[0] + 21, p.sh[1] + 3];
          p.handN = { handAng: 0.1 };
          p.handF = { handAng: 0 };
          p.head = [p.sh[0] + 13, p.sh[1] - 2];
          p.headAng = -0.1;
          p.jaw = 0.9;
        },
        // falling: front reaching for ground
        () => {
          p = shift(p, 1, -6);
          p.sh[1] += 3;
          p.arch = 5;
          p.hN = [p.hip[0] - 4, p.hip[1] + 22];
          p.hF = [p.hip[0] - 9, p.hip[1] + 21];
          p.footN = 0.7;
          p.footF = 0.7;
          p.fN = [p.sh[0] + 14, GY - 2];
          p.fF = [p.sh[0] + 9, GY - 3];
          p.head = [p.sh[0] + 13, p.sh[1] + 2];
          p.headAng = 0.3;
          p.jaw = 0.5;
        },
        // landing squash
        () => {
          p = shift(p, 0, 6);
          p.arch = 10;
          p.hN = [52, GY - 2];
          p.hF = [46, GY - 2];
          p.fN = [90, GY - 1];
          p.fF = [85, GY - 1];
          p.head = [90, 106];
          p.headAng = 0.25;
          p.belly = 2;
          p.jaw = 0.3;
        },
      ];
      keys[f]();
      return p;
    },
  ],
  // bite lunge
  Attack_1: [
    6,
    (f) => {
      let p = base();
      const k = [
        () => {
          p = shift(p, -3, 1);
          p.head = [85, 97];
          p.headAng = -0.15;
          p.jaw = 0.3;
        },
        () => {
          p = shift(p, -5, 3);
          p.arch = 9;
          p.head = [82, 99];
          p.headAng = -0.3;
          p.jaw = 0.7;
          p.belly = 1;
        },
        () => {
          p = shift(p, 5, -1);
          p.sh[1] -= 2;
          p.arch = 3;
          p.head = [p.sh[0] + 18, p.sh[1] - 1];
          p.headAng = -0.05;
          p.jaw = 1;
          p.hN = [44, GY - 2];
          p.footN = 0.6;
        },
        () => {
          p = shift(p, 6, 0);
          p.arch = 3;
          p.head = [p.sh[0] + 18, p.sh[1] + 1];
          p.headAng = 0.1;
          p.jaw = 0;
          p.gore = true;
          p.hN = [44, GY - 2];
        },
        () => {
          p = shift(p, 3, 0);
          p.head = [p.sh[0] + 15, p.sh[1] + 2];
          p.headAng = 0.35;
          p.jaw = 0.1;
          p.gore = true;
        },
        () => {
          p = shift(p, 0, 0);
          p.head = [90, 99];
          p.jaw = 0.2;
        },
      ];
      k[f]();
      return p;
    },
  ],
  // rears up on hind legs and rakes with the near claw
  Attack_2: [
    6,
    (f) => {
      let p = base();
      const rear = [6, 14, 16, 12, 6, 0][f];
      p.sh = [77 - rear * 0.2, 98 - rear];
      p.hip = [47 + rear * 0.15, 97 - rear * 0.1];
      p.arch = 6 - rear * 0.15;
      p.head = [p.sh[0] + 13, p.sh[1] - 1 + rear * 0.05];
      p.headAng = 0.1 - rear * 0.02;
      p.jaw = [0.3, 0.6, 0.9, 0.7, 0.3, 0.2][f];
      p.fF = rear > 4 ? [p.sh[0] + 10, p.sh[1] + 14] : p.fF;
      p.handF = rear > 4 ? { handAng: 0.6, curl: 0.5 } : {};
      const swipe = [
        [p.sh[0] + 8, p.sh[1] + 12],
        [p.sh[0] + 6, p.sh[1] - 18],
        [p.sh[0] + 16, p.sh[1] - 16],
        [p.sh[0] + 27, p.sh[1] + 8],
        [p.sh[0] + 18, GY - 6],
        [87, GY - 1],
      ][f];
      p.fN = swipe;
      p.handN = [
        { handAng: 0.8, curl: 0.4 },
        { handAng: -1.2, bend: -1 },
        { handAng: -0.5, bend: -1 },
        { handAng: 0.7, bend: -1 },
        { handAng: 0.9 },
        {},
      ][f];
      if (f === 3)
        p.extras = (c, stage) => {
          // claw trail
          if (stage !== 'post') return;
          const sh = p.sh;
          for (let i = 0; i < 3; i++) {
            const r = 30 + i * 3;
            for (let t = -1.0; t <= 0.35; t += 0.04)
              c.dot(
                [sh[0] + r * Math.cos(t), sh[1] + 4 + i * 2 + r * Math.sin(t)],
                i === 1 ? PAL.eye : PAL.skin,
              );
          }
        };
      return p;
    },
  ],
  Eating: [
    10,
    (f, n) => {
      const p = base();
      // pins the meal with both hands, face buried, rips a chunk loose, chews
      p.fN = [96, GY - 1];
      p.fF = [90, GY - 1];
      p.handN = { handAng: 0.15, curl: 0.4 };
      p.handF = { handAng: 0.15, curl: 0.4 };
      p.hip[1] -= 2;
      p.sh = [79, 103];
      p.arch = 9;
      const seq = [
        [99, 116, 0.6, 0.5],
        [99, 117, 0.75, 0.1],
        [99, 116, 0.6, 0.6],
        [99, 117, 0.75, 0.1],
        [97, 112, 0.2, 0.0],
        [94, 104, -0.25, 0.2],
        [93, 103, -0.3, 0.5],
        [93, 103, -0.25, 0.1],
        [94, 104, -0.2, 0.45],
        [97, 110, 0.3, 0.1],
      ][f];
      p.head = [seq[0], seq[1]];
      p.headAng = seq[2];
      p.jaw = seq[3];
      p.gore = true;
      p.belly = 1 + Math.sin((TAU * f) / n) * 0.5;
      p.extras = (c, stage) => {
        if (stage !== 'post') return;
        // blood splatter under the face
        [
          [97, GY],
          [100, GY],
          [103, GY],
          [101, GY - 1],
          [94, GY],
        ].forEach((q) => c.dot(q, PAL.blood));
        if (f >= 4 && f <= 6) {
          // meat strand stretching from the mouth to the ground
          const m = [p.head[0] + 9, p.head[1] + 4];
          c.line(m, [101, GY - 1], PAL.bloodHi);
          c.line([m[0] + 1, m[1]], [102, GY - 1], PAL.blood);
        }
        if (f >= 5 && f <= 8) {
          c.dot([p.head[0] + 10, p.head[1] + 4], PAL.bloodHi);
          c.dot([p.head[0] + 11, p.head[1] + 5], PAL.blood);
        }
      };
      return p;
    },
  ],
  Hurt: [
    4,
    (f) => {
      let p = base();
      const k = [
        () => {
          p = shift(p, -4, -2);
          p.head = [83, 92];
          p.headAng = -0.5;
          p.jaw = 0.8;
          p.fN = [84, GY - 4];
          p.handN = { handAng: -0.4 };
        },
        () => {
          p = shift(p, -6, -1);
          p.arch = 10;
          p.head = [80, 91];
          p.headAng = -0.6;
          p.jaw = 0.9;
          p.fN = [82, GY - 3];
          p.fF = [78, GY - 1];
        },
        () => {
          p = shift(p, -3, 1);
          p.head = [85, 96];
          p.headAng = -0.2;
          p.jaw = 0.4;
        },
        () => {
          p = shift(p, -1, 0);
          p.head = [89, 99];
          p.jaw = 0.2;
        },
      ];
      k[f]();
      return p;
    },
  ],
  Dead: [
    6,
    (f) => {
      let p = base();
      const k = [
        () => {
          p = shift(p, -4, -2);
          p.head = [83, 92];
          p.headAng = -0.6;
          p.jaw = 0.9;
        },
        () => {
          p.hip = [46, 108];
          p.sh = [76, 101];
          p.arch = 4;
          p.head = [88, 101];
          p.headAng = 0.2;
          p.jaw = 0.7;
          p.hN = [56, GY - 2];
          p.hF = [50, GY - 2];
        },
        () => {
          p.hip = [46, 114];
          p.sh = [77, 110];
          p.arch = 3;
          p.head = [90, 111];
          p.headAng = 0.4;
          p.jaw = 0.6;
          p.hN = [62, GY - 2];
          p.hF = [56, GY - 2];
          p.fN = [94, GY - 1];
          p.fF = [88, GY - 1];
          p.belly = -2;
        },
        () => {
          p.hip = [46, 118];
          p.sh = [77, 117];
          p.arch = 1;
          p.head = [91, 118];
          p.headAng = 0.6;
          p.jaw = 0.5;
          p.hN = [26, GY - 3];
          p.hF = [30, GY - 2];
          p.footN = 0.4;
          p.fN = [100, GY - 1];
          p.fF = [96, GY - 1];
          p.belly = -3;
        },
        () => {
          p.hip = [46, 119];
          p.sh = [77, 119];
          p.arch = 0;
          p.head = [91, 120];
          p.headAng = 0.15;
          p.jaw = 0.6;
          p.hN = [24, GY - 2];
          p.hF = [28, GY - 2];
          p.footN = 0.2;
          p.fN = [102, GY - 1];
          p.fF = [97, GY - 1];
          p.belly = -3.5;
        },
        () => {
          p.hip = [46, 119];
          p.sh = [77, 119];
          p.arch = 0;
          p.head = [91, 120];
          p.headAng = 0.1;
          p.jaw = 0.55;
          p.hN = [24, GY - 2];
          p.hF = [28, GY - 2];
          p.footN = 0.1;
          p.fN = [102, GY - 1];
          p.fF = [97, GY - 1];
          p.belly = -3.5;
          p.gore = true;
        },
      ];
      k[f]();
      return p;
    },
  ],
};

async function writeSheet(name, n, fn) {
  const w = S * n,
    out = Buffer.alloc(w * S * 4);
  for (let f = 0; f < n; f++) {
    const b = render(fn(f, n)).rgba();
    for (let y = 0; y < S; y++) b.copy(out, (y * w + f * S) * 4, y * S * 4, (y + 1) * S * 4);
  }
  await sharp(out, { raw: { width: w, height: S, channels: 4 } })
    .png()
    .toFile(path.join(OUT, name + '.png'));
}

// contact sheet: every animation as a row, cropped to the body region, zoomed
async function contact(names) {
  const Z = 3,
    CY = 56,
    CH = 72;
  const rows = [];
  let maxN = 0;
  for (const name of names) {
    const n = ANIMS[name][0];
    maxN = Math.max(maxN, n);
    rows.push(
      await sharp(path.join(OUT, name + '.png'))
        .extract({ left: 0, top: CY, width: S * n, height: CH })
        .resize(S * n * Z, CH * Z, { kernel: 'nearest' })
        .toBuffer(),
    );
  }
  await sharp({
    create: {
      width: S * maxN * Z,
      height: CH * Z * names.length,
      channels: 4,
      background: '#2b2f3a',
    },
  })
    .composite(rows.map((r, i) => ({ input: r, left: 0, top: i * CH * Z })))
    .png()
    .toFile(path.join(os.tmpdir(), 'eater-contact.png'));
}

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(ANIMS);
  for (const name of only) await writeSheet(name, ANIMS[name][0], ANIMS[name][1]);
  await contact(only);
})();
