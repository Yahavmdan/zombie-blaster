import type { LevelLayout } from './level-generator';

/**
 * Floor 1, designed in the level editor: no hanging exit, the way out is the exit door on the
 * right ledge. The door is open only while something weighs down the button at the far left, so
 * carry a box (or a body) onto the button, then climb the crate stack to the ledge.
 */
const FLOOR_1: LevelLayout = {
  seed: 851510303,
  floor: 1,
  hint: 'Weigh down the button to open the door',
  platforms: [{ x: 1120, y: 452, width: 160, height: 32 }],
  ropes: [],
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
    { id: 'g2', kind: 'button', kg: 10, targets: ['g1'], x: 104, y: 620, width: 48, height: 6 },
  ],
};

/** Floors made in the level editor: `levelFor` plays a copy of these instead of a generated one. */
export const DESIGNED_LEVELS: Readonly<Record<number, LevelLayout>> = { 1: FLOOR_1 };
