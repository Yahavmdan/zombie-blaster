import type { LevelLayout } from './level-generator';

/**
 * Floor 1, designed in the level editor: no hanging exit, the way out is the exit door on the
 * right ledge. The door is open only while something weighs down the button on the low left ledge, so
 * carry a box (or a body) onto the button, then climb the crate stack to the ledge.
 */
const FLOOR_1: LevelLayout = {
  seed: 851510303,
  floor: 1,
  hint: 'Weigh down the button to open the door',
  // The clue: a zombie rises on the middle ledge, walks off its left end and drops onto the button
  // on the ledge below (the door opens), stands there 4 s, then hunts.
  clueScene: { spawnX: 490, spawnY: 400, gadgetId: 'g2' },
  platforms: [
    { x: 1120, y: 452, width: 160, height: 32 },
    { x: 188, y: 228, width: 160, height: 32 },
    { x: 712, y: 152, width: 160, height: 32, safe: true },
    { x: 272, y: 508, width: 160, height: 32 },
    { x: 460, y: 400, width: 160, height: 32 },
  ],
  ropes: [{ x: 784, topY: 152, bottomY: 620 }],
  exitX: 1068,
  exitY: 310,
  exitHidden: true,
  props: [
    { kind: 'box1', x: 1252, y: 598, width: 28, height: 22 },
    { kind: 'box3', x: 1254, y: 604, width: 26, height: 16 },
    { kind: 'box3', x: 1254, y: 582, width: 26, height: 16 },
    { kind: 'box1', x: 1252, y: 560, width: 28, height: 22 },
    { kind: 'box1', x: 1252, y: 538, width: 28, height: 22 },
    { kind: 'locker2', x: 1217, y: 597, width: 31, height: 23 },
    { kind: 'box2', x: 1213, y: 575, width: 28, height: 22 },
    { kind: 'box1', x: 312, y: 206, width: 28, height: 22 },
    { kind: 'box1', x: 524, y: 378, width: 28, height: 22 },
    { kind: 'box1', x: 689, y: 598, width: 28, height: 22 },
    { kind: 'box2', x: 659, y: 598, width: 28, height: 22 },
    { kind: 'box2', x: 668, y: 576, width: 28, height: 22 },
    { kind: 'barrel2', x: 602, y: 375, width: 18, height: 25 },
    { kind: 'barrel2', x: 32, y: 595, width: 18, height: 25 },
    { kind: 'barrel2', x: 821, y: 595, width: 18, height: 25 },
    { kind: 'box2', x: 285, y: 206, width: 28, height: 22 },
    { kind: 'box2', x: 308, y: 184, width: 28, height: 22 },
    { kind: 'rail', x: 368, y: 604, width: 100, height: 16 },
  ],
  walls: [],
  gadgets: [
    {
      id: 'g1',
      kind: 'door',
      latch: false,
      exit: true,
      x: 1172,
      y: 324,
      width: 64,
      height: 128,
    },
    { id: 'g2', kind: 'button', kg: 10, targets: ['g1'], x: 376, y: 508, width: 48, height: 6 },
  ],
  // No zombie rises on the button's ledge or the two ledges above it: a random spawn there would
  // reach the button and open the door for free. The ground under the zone stays open.
  noSpawn: [{ x: 168, y: 56, width: 448, height: 480 }],
};

/**
 * Floor 2, designed in the level editor: a tall door shuts off the right end of the map, with the
 * exit door behind it. The high ledge's button opens the tall door, the right ledge's button opens
 * the exit door, and both need 60 kg at once: a player can only hold one, so the other needs a
 * body or props. No ladders: climb the pile of the dead beside the right ledge.
 */
const FLOOR_2: LevelLayout = {
  seed: 1481236960,
  floor: 2,
  hint: 'Weigh down both buttons to reach the exit door',
  platforms: [
    { x: 356, y: 208, width: 160, height: 32 },
    { x: 604, y: 300, width: 160, height: 32 },
    { x: 56, y: 464, width: 160, height: 32 },
    { x: 468, y: 460, width: 160, height: 32 },
  ],
  ropes: [],
  exitX: 768,
  exitY: 298,
  exitHidden: true,
  props: [
    { kind: 'box2', x: 69, y: 598, width: 28, height: 22 },
    { kind: 'box2', x: 83, y: 576, width: 28, height: 22 },
    { kind: 'box1', x: 100, y: 598, width: 28, height: 22 },
    { kind: 'box1', x: 133, y: 598, width: 28, height: 22 },
    { kind: 'box1', x: 113, y: 576, width: 28, height: 22 },
    { kind: 'box3', x: 92, y: 560, width: 26, height: 16 },
    { kind: 'box3', x: 110, y: 560, width: 26, height: 16 },
    { kind: 'box3', x: 101, y: 544, width: 26, height: 16 },
    { kind: 'barrel1', x: 841, y: 598, width: 18, height: 22 },
    { kind: 'barrel1', x: 484, y: 438, width: 18, height: 22 },
    { kind: 'barrel3', x: 106, y: 441, width: 18, height: 23 },
    { kind: 'barrel3', x: 14, y: 597, width: 18, height: 23 },
  ],
  walls: [],
  gadgets: [
    {
      id: 'g1',
      kind: 'door',
      latch: false,
      exit: false,
      x: 1076,
      y: 12,
      width: 32,
      height: 608,
      look: 'hazard',
    },
    { id: 'g2', kind: 'door', latch: false, exit: true, x: 1164, y: 492, width: 64, height: 128 },
    { id: 'g3', kind: 'button', kg: 60, targets: ['g2'], x: 660, y: 300, width: 48, height: 6 },
    { id: 'g4', kind: 'button', kg: 60, targets: ['g1'], x: 408, y: 208, width: 48, height: 6 },
  ],
  // No zombie rises on the two button ledges (a random spawn there would press a button for free),
  // behind the tall door, or over the crates in the left corner.
  noSpawn: [
    { x: 328, y: 112, width: 480, height: 224 },
    { x: 1056, y: 12, width: 224, height: 608 },
    { x: 0, y: 492, width: 128, height: 128 },
    { x: 0, y: 368, width: 128, height: 128 },
    { x: 0, y: 244, width: 128, height: 128 },
  ],
};

/**
 * Floor 3, designed in the level editor: a boulder waits on a slope behind a tall door, and a pile
 * of bodies lies by the low ledge. Weight on that ledge's button opens the door; the boulder rolls
 * down and breaks the cracked wall, and the exit door stands behind the hole.
 */
const FLOOR_3: LevelLayout = {
  seed: 1510986940,
  floor: 3,
  hint: 'Weigh down the button to let the boulder through',
  platforms: [{ x: 728, y: 460, width: 160, height: 32 }],
  ropes: [],
  exitX: 20,
  exitY: 100,
  exitHidden: true,
  props: [
    { kind: 'barrel2', x: 724, y: 383, width: 18, height: 25 },
    { kind: 'barrel2', x: 258, y: 595, width: 18, height: 25 },
    { kind: 'barrel2', x: 969, y: 595, width: 18, height: 25 },
  ],
  walls: [],
  gadgets: [
    { id: 'g5', kind: 'button', kg: 60, targets: ['g7'], x: 784, y: 460, width: 48, height: 6 },
    { id: 'g6', kind: 'boulder', kg: 600, x: 388, y: 352.8, width: 48, height: 48 },
    {
      id: 'g7',
      kind: 'door',
      latch: false,
      exit: false,
      x: 356,
      y: 12,
      width: 32,
      height: 608,
      look: 'hazard',
    },
    { id: 'g8', kind: 'slope', risesRight: true, x: 116, y: 384, width: 320, height: 224 },
    {
      id: 'g9',
      kind: 'crack-wall',
      x: 116,
      y: 12,
      width: 64,
      height: 608,
      crackTop: 460,
      crackBottom: 620,
    },
    { id: 'g10', kind: 'door', latch: true, exit: true, x: 28, y: 492, width: 64, height: 128 },
  ],
  // No zombie rises behind the tall door or over the slope.
  noSpawn: [{ x: 0, y: 12, width: 384, height: 608 }],
  zombiePiles: [{ x: 589, y: 556, width: 96, height: 64, bodies: 30 }],
};

/**
 * Floor 4, designed in the level editor: a boulder sits high on the long right slope behind two
 * doors. The left button opens the near door and the door at the foot of the left slope; the button
 * on the middle ledge opens the far one. A spring at the foot throws what lands on it, and the exit
 * door stands in the right corner, behind a cracked wall past the far door.
 */
const FLOOR_4: LevelLayout = {
  seed: 407375565,
  floor: 4,
  hint: 'Weigh down the buttons to set the boulder rolling',
  platforms: [
    { x: 720, y: 396, width: 96, height: 32 },
    { x: 56, y: 512, width: 160, height: 32 },
    { x: 976, y: 400, width: 32, height: 32 },
  ],
  ropes: [],
  exitX: 20,
  exitY: 274,
  exitHidden: true,
  props: [{ kind: 'box1', x: 36, y: 598, width: 28, height: 22 }],
  walls: [{ x: 1140, y: 588, width: 32, height: 32 }],
  gadgets: [
    { id: 'g1', kind: 'slope', risesRight: true, x: 444, y: 52, width: 704, height: 160 },
    { id: 'g2', kind: 'slope', risesRight: false, x: 336, y: 204, width: 384, height: 192 },
    {
      id: 'g3',
      kind: 'door',
      latch: false,
      exit: false,
      x: 976,
      y: 12,
      width: 32,
      height: 384,
      look: 'hazard',
    },
    { id: 'g7', kind: 'button', kg: 1, targets: ['g3', 'g19'], x: 116, y: 512, width: 48, height: 6 },
    {
      id: 'g8',
      kind: 'door',
      latch: false,
      exit: false,
      x: 1140,
      y: 12,
      width: 32,
      height: 576,
      look: 'hazard',
    },
    { id: 'g11', kind: 'button', kg: 1, targets: ['g8'], x: 720, y: 396, width: 48, height: 6 },
    { id: 'g13', kind: 'boulder', kg: 600, x: 1044, y: 30, width: 48, height: 48 },
    { id: 'g15', kind: 'spring', power: 24, x: 1024, y: 588, width: 120, height: 32 },
    { id: 'g16', kind: 'slope', risesRight: false, x: 720, y: 396, width: 288, height: 128 },
    { id: 'g17', kind: 'door', latch: false, exit: true, x: 1212, y: 492, width: 64, height: 128 },
    {
      id: 'g18',
      kind: 'crack-wall',
      crackTop: 460,
      crackBottom: 620,
      x: 1172,
      y: 12,
      width: 32,
      height: 608,
    },
    {
      id: 'g19',
      kind: 'door',
      latch: false,
      exit: false,
      x: 784,
      y: 12,
      width: 32,
      height: 384,
      look: 'hazard',
    },
    { id: 'g20', kind: 'slope', risesRight: true, x: 824, y: 576, width: 192, height: 32 },
  ],
  noSpawn: [],
};

/** Floors made in the level editor: `levelFor` plays a copy of these instead of a generated one. */
export const DESIGNED_LEVELS: Readonly<Record<number, LevelLayout>> = {
  1: FLOOR_1,
  2: FLOOR_2,
  3: FLOOR_3,
  4: FLOOR_4,
};
