import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { Box } from './boulder-puzzle';
import { exitCageHangBox } from './cage-puzzle';
import { EXIT_TARGET, Gadget, GadgetKind, Platform, SourceGadget } from './engine-types';
import { GADGET_KINDS } from './gadgets';
import { LevelLayout, generateLevel } from './level-generator';
import {
  EditorRef,
  clearLayout,
  edgeAt,
  editableLayout,
  exitBox,
  exportLayout,
  followExit,
  itemAt,
  itemBox,
  moveTo,
  parseLayout,
  placeAt,
  removeItem,
  resizeTo,
  EditorField,
  fieldsOf,
  hasWayOut,
  setField,
  sourceOf,
  toggleWire,
  wireTargetId,
} from './level-editor';

const TILE: number = GAME_CONSTANTS.LEVEL_TILE_PX;
const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const W: number = GAME_CONSTANTS.CANVAS_WIDTH;

/** An empty room: the exit hangs at the left edge, at y 300. */
function room(): LevelLayout {
  return {
    seed: 7,
    floor: 1,
    platforms: [],
    ropes: [],
    exitX: 20,
    exitY: 300,
    props: [],
    walls: [],
  };
}

function gadgetAt(layout: LevelLayout, ref: EditorRef | null): Gadget {
  expect(ref?.kind).toBe('gadget');
  return layout.gadgets![(ref as { index: number }).index];
}

function boxOf(layout: LevelLayout, ref: EditorRef | null): Box {
  expect(ref).not.toBeNull();
  const box: Box | null = itemBox(layout, ref!);
  expect(box).not.toBeNull();
  return box!;
}

describe('level editor: editable layout', () => {
  it('copies a generated floor, fixes the exit height and lists walls', () => {
    const level: LevelLayout = generateLevel(123, 2);
    const layout: LevelLayout = editableLayout(level, 250);
    expect(layout.exitY).toBe(250);
    expect(layout.walls).toEqual([]);
    expect(layout.boulderPuzzle).toEqual(level.boulderPuzzle);
    layout.platforms.push({ x: 0, y: 0, width: TILE, height: TILE });
    expect(level.platforms.length).toBe(layout.platforms.length - 1);
  });

  it('keeps an exit height the layout already has', () => {
    expect(editableLayout({ ...room(), exitY: 180 }, 300).exitY).toBe(180);
  });
});

describe('level editor: placing', () => {
  it('a platform is whole tiles, snapped, centered on the click', () => {
    const layout: LevelLayout = room();
    const box: Box = boxOf(layout, placeAt(layout, 'platform', 641, 401));
    expect(box.width).toBe(GAME_CONSTANTS.DEV_EDITOR_PLATFORM_TILES * TILE);
    expect(box.height).toBe(TILE);
    expect(box.x % GAME_CONSTANTS.DEV_EDITOR_SNAP_PX).toBe(0);
    expect(box.y % GAME_CONSTANTS.DEV_EDITOR_SNAP_PX).toBe(0);
    expect(Math.abs(box.x + box.width / 2 - 641)).toBeLessThanOrEqual(4);
  });

  it('a platform stays on screen at the edge', () => {
    const layout: LevelLayout = room();
    const box: Box = boxOf(layout, placeAt(layout, 'platform', W - 2, 100));
    expect(box.x + box.width).toBeLessThanOrEqual(W);
  });

  it('a wall stands on the surface under the click', () => {
    const layout: LevelLayout = room();
    layout.platforms.push({ x: 600, y: 430, width: 6 * TILE, height: TILE });
    const onGround: Box = boxOf(layout, placeAt(layout, 'wall', 200, 500));
    expect(onGround.y + onGround.height).toBe(GROUND_Y);
    const onLedge: Box = boxOf(layout, placeAt(layout, 'wall', 680, 380));
    expect(onLedge.y + onLedge.height).toBe(430);
    expect(onLedge.height).toBe(GAME_CONSTANTS.DEV_EDITOR_WALL_HEIGHT_TILES * TILE);
  });

  it('a ladder hangs from the platform clicked down to the surface below', () => {
    const layout: LevelLayout = room();
    layout.platforms.push({ x: 600, y: 330, width: 6 * TILE, height: TILE });
    layout.platforms.push({ x: 560, y: 530, width: 8 * TILE, height: TILE });
    expect(placeAt(layout, 'ladder', 700, 335)).toEqual({ kind: 'ladder', index: 0 });
    expect(layout.ropes[0]).toEqual({ x: 700, topY: 330, bottomY: 530 });
  });

  it('no ladder from the ground', () => {
    const layout: LevelLayout = room();
    expect(placeAt(layout, 'ladder', 900, 600)).toBeNull();
    expect(layout.ropes).toEqual([]);
  });

  it('the safe spot moves: there is only ever one', () => {
    const layout: LevelLayout = room();
    placeAt(layout, 'safe-spot', 300, 230);
    placeAt(layout, 'safe-spot', 900, 230);
    const safe: Platform[] = layout.platforms.filter((p: Platform): boolean => p.safe === true);
    expect(safe.length).toBe(1);
    expect(safe[0].width).toBe(GAME_CONSTANTS.LEVEL_SAFE_SPOT_TILES * TILE);
    expect(safe[0].x + safe[0].width / 2).toBeGreaterThan(800);
  });

  it('a prop drops onto the surface below, stacking on props', () => {
    const layout: LevelLayout = room();
    const box1: Box = boxOf(layout, placeAt(layout, 'box1', 800, 300));
    expect(box1.y + box1.height).toBe(GROUND_Y);
    const box2: Box = boxOf(layout, placeAt(layout, 'box2', 800, 300));
    expect(box2.y + box2.height).toBe(box1.y);
    const rail: Box = boxOf(layout, placeAt(layout, 'rail', 300, 300));
    expect(rail.width).toBe(GAME_CONSTANTS.RAIL_MIN_WIDTH_PX);
  });

  it('the exit tool moves the exit (snapped, its height kept)', () => {
    const layout: LevelLayout = room();
    placeAt(layout, 'exit', 1000, 200);
    expect(layout.exitY! + GAME_CONSTANTS.EXIT_PLATFORM_HEIGHT / 2).toBeCloseTo(200, -1);
    expect(layout.exitX % GAME_CONSTANTS.DEV_EDITOR_SNAP_PX).toBe(0);
  });

  it('gadgets stand alone on the surface under the click, each with its own id', () => {
    const layout: LevelLayout = {
      ...room(),
      platforms: [{ x: 600, y: 430, width: 8 * TILE, height: TILE }],
    };
    const boulder: Gadget = gadgetAt(layout, placeAt(layout, 'boulder', 700, 380));
    expect(boulder).toMatchObject({ kind: 'boulder', id: 'g1' });
    expect(boulder.y + boulder.height).toBe(430);
    expect(boulder.width).toBe(GAME_CONSTANTS.BOULDER_SIZE_PX);
    const button: Gadget = gadgetAt(layout, placeAt(layout, 'button', 300, 600));
    expect(button).toMatchObject({
      id: 'g2',
      y: GROUND_Y,
      kg: GAME_CONSTANTS.GADGET_BUTTON_KG,
      targets: [],
    });
    const spring: Gadget = gadgetAt(layout, placeAt(layout, 'spring', 900, 600));
    expect(spring.y + spring.height).toBe(GROUND_Y);
    expect(spring).toMatchObject({ power: GAME_CONSTANTS.GADGET_SPRING_POWER });
    const sling: Gadget = gadgetAt(layout, placeAt(layout, 'slingshot', 1100, 600));
    expect(sling).toMatchObject({ angle: GAME_CONSTANTS.GADGET_SLINGSHOT_ANGLE });
    const door: Gadget = gadgetAt(layout, placeAt(layout, 'door', 200, 600));
    expect(door).toMatchObject({
      width: TILE,
      height: GAME_CONSTANTS.GADGET_DOOR_TILES * TILE,
      latch: false,
    });
    // No floor puzzle comes with any of them.
    expect(layout.boulderPuzzle).toBeUndefined();
    expect(layout.springPuzzle).toBeUndefined();
  });

  it('a cracked wall stands on the ground, its crack band at its foot', () => {
    const layout: LevelLayout = room();
    const wall: Gadget = gadgetAt(layout, placeAt(layout, 'crack-wall', 800, 600));
    if (wall.kind !== 'crack-wall') throw new Error('not a cracked wall');
    expect(wall.y + wall.height).toBe(GROUND_Y);
    expect(wall.height).toBe(GAME_CONSTANTS.GADGET_CRACK_WALL_TILES * TILE);
    expect(wall.crackBottom).toBe(GROUND_Y);
    expect(wall.crackBottom - wall.crackTop).toBe(GAME_CONSTANTS.GADGET_CRACK_BAND_TILES * TILE);
  });
});

describe('level editor: gadgets', () => {
  it('the crack band lines drag in whole tiles and stay inside the wall', () => {
    const layout: LevelLayout = room();
    const ref: EditorRef | null = placeAt(layout, 'crack-wall', 800, 600);
    const wall: Gadget = gadgetAt(layout, ref);
    if (wall.kind !== 'crack-wall') throw new Error('not a cracked wall');
    expect(edgeAt(layout, ref!, wall.x + 20, wall.crackTop + 1)).toBe('crack-top');
    resizeTo(layout, ref!, 'crack-top', wall.x, wall.y + TILE + 5);
    expect(wall.crackTop).toBe(wall.y + TILE);
    resizeTo(layout, ref!, 'crack-bottom', wall.x, wall.y + 3 * TILE - 4);
    expect(wall.crackBottom).toBe(wall.y + 3 * TILE);
    // Never thinner than a tile, never outside the wall.
    resizeTo(layout, ref!, 'crack-top', wall.x, wall.y + 10 * TILE);
    expect(wall.crackTop).toBe(wall.crackBottom - TILE);
    resizeTo(layout, ref!, 'crack-bottom', wall.x, GROUND_Y + 200);
    expect(wall.crackBottom).toBe(GROUND_Y);
    // Moving the wall takes its band along.
    moveTo(layout, ref!, wall.x, wall.y - 2 * TILE);
    expect(wall.crackBottom).toBe(GROUND_Y - 2 * TILE);
  });

  it('a button dragged onto a ledge is set into its top', () => {
    const layout: LevelLayout = {
      ...room(),
      platforms: [{ x: 600, y: 430, width: 8 * TILE, height: TILE }],
    };
    const ref: EditorRef | null = placeAt(layout, 'button', 300, 600);
    const grab: Box = boxOf(layout, ref);
    moveTo(layout, ref!, 700, 430 - (gadgetAt(layout, ref).y - grab.y));
    expect(gadgetAt(layout, ref)).toMatchObject({ x: 700, y: 430 });
  });

  it('wires run from a source to springs, slingshots, doors or the exit, and go with a removed target', () => {
    const layout: LevelLayout = room();
    const lever: EditorRef | null = placeAt(layout, 'lever', 300, 600);
    const door: EditorRef | null = placeAt(layout, 'door', 700, 600);
    const boulder: EditorRef | null = placeAt(layout, 'boulder', 900, 600);
    const source: SourceGadget | null = sourceOf(layout, lever);
    expect(source).not.toBeNull();
    expect(sourceOf(layout, door)).toBeNull();
    expect(wireTargetId(layout, boulder)).toBeNull();
    expect(wireTargetId(layout, { kind: 'exit' })).toBe(EXIT_TARGET);
    toggleWire(source!, wireTargetId(layout, door)!);
    toggleWire(source!, EXIT_TARGET);
    expect(source!.targets).toEqual(['g2', EXIT_TARGET]);
    toggleWire(source!, EXIT_TARGET);
    expect(source!.targets).toEqual(['g2']);
    removeItem(layout, door!);
    expect(source!.targets).toEqual([]);
  });

  it('each thing lists what can be adjusted on it', () => {
    const layout: LevelLayout = room();
    const keys: (ref: EditorRef | null) => string[] = (ref: EditorRef | null): string[] =>
      fieldsOf(layout, ref!).map((f: EditorField): string => f.key);
    expect(keys(placeAt(layout, 'scale', 300, 600))).toEqual(['kg', 'width']);
    expect(keys(placeAt(layout, 'slingshot', 600, 600))).toEqual(['power', 'angle', 'width']);
    expect(keys(placeAt(layout, 'spring', 800, 600))).toEqual(['power', 'width']);
    expect(keys(placeAt(layout, 'boulder', 1000, 600))).toEqual(['kg']);
    expect(keys(placeAt(layout, 'lever', 1100, 600))).toEqual(['startsOn']);
    expect(keys(placeAt(layout, 'door', 200, 600))).toEqual(['width', 'height', 'latch', 'exit']);
    expect(keys(placeAt(layout, 'slope', 300, 600))).toEqual(['width', 'height', 'risesRight']);
    expect(keys(placeAt(layout, 'cage', 500, 200))).toEqual([
      'content',
      'zombies',
      'smashes',
      'width',
      'height',
    ]);
    expect(keys(placeAt(layout, 'crack-wall', 400, 600))).toEqual([
      'width',
      'height',
      'bandBottom',
      'bandHeight',
    ]);
    expect(keys(placeAt(layout, 'wall', 700, 600))).toEqual(['width', 'height']);
    expect(keys(placeAt(layout, 'box1', 900, 600))).toEqual([]);
    expect(keys({ kind: 'exit' })).toEqual([]);
  });

  it('a field is clamped to its range and snapped to its step', () => {
    const layout: LevelLayout = room();
    const scaleRef: EditorRef | null = placeAt(layout, 'scale', 300, 600);
    const slingRef: EditorRef | null = placeAt(layout, 'slingshot', 800, 600);
    setField(layout, scaleRef!, 'kg', 0);
    setField(layout, slingRef!, 'power', 99);
    setField(layout, slingRef!, 'angle', 93);
    setField(layout, slingRef!, 'kg', 5);
    expect(gadgetAt(layout, scaleRef)).toMatchObject({ kg: 1 });
    const sling: Gadget = gadgetAt(layout, slingRef);
    expect(sling).toMatchObject({ power: GAME_CONSTANTS.GADGET_LAUNCH_MAX_POWER, angle: 95 });
    expect('kg' in sling).toBe(false);
  });

  it('a wall grows up from its foot; a crack band is set from the foot and stays inside', () => {
    const layout: LevelLayout = room();
    const wallRef: EditorRef | null = placeAt(layout, 'wall', 500, 600);
    setField(layout, wallRef!, 'height', 7 * TILE + 5);
    expect(layout.walls![0]).toMatchObject({ height: 7 * TILE, y: GROUND_Y - 7 * TILE });
    const crackRef: EditorRef | null = placeAt(layout, 'crack-wall', 900, 600);
    const wall: Gadget = gadgetAt(layout, crackRef);
    if (wall.kind !== 'crack-wall') throw new Error('not a cracked wall');
    setField(layout, crackRef!, 'bandBottom', 2 * TILE);
    setField(layout, crackRef!, 'bandHeight', 3 * TILE);
    expect(wall).toMatchObject({ crackBottom: GROUND_Y - 2 * TILE, crackTop: GROUND_Y - 5 * TILE });
    // Shrinking the wall keeps the band inside it.
    setField(layout, crackRef!, 'height', 3 * TILE);
    expect(wall.crackTop).toBeGreaterThanOrEqual(wall.y);
    expect(wall.crackBottom - wall.crackTop).toBeGreaterThanOrEqual(TILE);
  });

  it('a lever can start on; a boulder has its own weight', () => {
    const layout: LevelLayout = room();
    const leverRef: EditorRef | null = placeAt(layout, 'lever', 300, 600);
    setField(layout, leverRef!, 'startsOn', 1);
    expect(gadgetAt(layout, leverRef)).toMatchObject({ startsOn: true });
    const boulderRef: EditorRef | null = placeAt(layout, 'boulder', 600, 600);
    expect(gadgetAt(layout, boulderRef)).toMatchObject({ kg: GAME_CONSTANTS.GADGET_BOULDER_KG });
    setField(layout, boulderRef!, 'kg', 1203);
    expect(gadgetAt(layout, boulderRef)).toMatchObject({ kg: 1200 });
  });
});

describe('level editor: picking, moving, resizing, removing', () => {
  it('picks the topmost thing: a prop over the platform it stands on', () => {
    const layout: LevelLayout = {
      ...room(),
      platforms: [{ x: 600, y: 430, width: 8 * TILE, height: TILE }],
    };
    placeAt(layout, 'box1', 700, 400);
    const prop: Box = boxOf(layout, { kind: 'prop', index: 0 });
    expect(itemAt(layout, prop.x + 4, prop.y + 4)).toEqual({ kind: 'prop', index: 0 });
    expect(itemAt(layout, 610, 440)).toEqual({ kind: 'platform', index: 0 });
    expect(itemAt(layout, 1000, 100)).toBeNull();
  });

  it('a platform side resizes in whole tiles, the middle moves it', () => {
    const layout: LevelLayout = {
      ...room(),
      platforms: [{ x: 320, y: 430, width: 4 * TILE, height: TILE }],
    };
    const ref: EditorRef = { kind: 'platform', index: 0 };
    expect(edgeAt(layout, ref, 322 + 4 * TILE - 4, 440)).toBe('right');
    expect(edgeAt(layout, ref, 323, 440)).toBe('left');
    expect(edgeAt(layout, ref, 380, 440)).toBeNull();
    resizeTo(layout, ref, 'right', 320 + 6 * TILE + 5, 440);
    expect(layout.platforms[0].width).toBe(6 * TILE);
    resizeTo(layout, ref, 'left', 320 + 5 * TILE, 440);
    expect(layout.platforms[0]).toMatchObject({ x: 320 + 5 * TILE, width: TILE });
    moveTo(layout, ref, 101, 299);
    expect(layout.platforms[0]).toMatchObject({ x: 100, y: 300 });
  });

  it('a wall grows from its top, its bottom stays', () => {
    const layout: LevelLayout = room();
    placeAt(layout, 'wall', 500, 600);
    const ref: EditorRef = { kind: 'wall', index: 0 };
    resizeTo(layout, ref, 'top', 500, GROUND_Y - 7 * TILE + 3);
    expect(layout.walls![0].height).toBe(7 * TILE);
    expect(layout.walls![0].y + layout.walls![0].height).toBe(GROUND_Y);
  });

  it('a ladder end snaps onto a surface close by', () => {
    const layout: LevelLayout = {
      ...room(),
      platforms: [{ x: 600, y: 330, width: 6 * TILE, height: TILE }],
    };
    layout.ropes.push({ x: 700, topY: 330, bottomY: 500 });
    resizeTo(layout, { kind: 'ladder', index: 0 }, 'bottom', 700, GROUND_Y - 6);
    expect(layout.ropes[0].bottomY).toBe(GROUND_Y);
  });

  it('a prop dragged off a ledge lands on what is below', () => {
    const layout: LevelLayout = room();
    placeAt(layout, 'barrel1', 700, 300);
    moveTo(layout, { kind: 'prop', index: 0 }, 300, 100);
    const prop: Box = boxOf(layout, { kind: 'prop', index: 0 });
    expect(prop.x).toBe(300);
    expect(prop.y + prop.height).toBe(GROUND_Y);
  });

  it('the floor puzzles of generated floors are edited and removed whole; the exit stays', () => {
    const springFloor: LevelLayout = editableLayout(generateLevel(3, 3), 100);
    removeItem(springFloor, { kind: 'scale' });
    expect(springFloor.springPuzzle).toBeUndefined();
    const cageFloor: LevelLayout = editableLayout(generateLevel(3, 4), 280);
    const cages: number = cageFloor.cagePuzzle!.cages.length;
    removeItem(cageFloor, { kind: 'cleat', index: 1 });
    expect(cageFloor.cagePuzzle?.cages.length).toBe(cages - 1);
    moveTo(cageFloor, { kind: 'cage', index: 0 }, 900, 100);
    expect(boxOf(cageFloor, { kind: 'cage', index: 0 })).toEqual(
      exitCageHangBox(exitBox(cageFloor)),
    );
    removeItem(cageFloor, { kind: 'cage', index: 0 });
    expect(cageFloor.cagePuzzle).toBeUndefined();
    // The hanging exit goes too (an exit door can be the way out); the Exit tool puts it back.
    removeItem(cageFloor, { kind: 'exit' });
    expect(cageFloor.exitHidden).toBe(true);
    expect(itemAt(cageFloor, exitBox(cageFloor).x + 4, exitBox(cageFloor).y + 4)).toBeNull();
    placeAt(cageFloor, 'exit', 600, 300);
    expect(cageFloor.exitHidden).toBeUndefined();
  });

  it('clear leaves only the exit', () => {
    const layout: LevelLayout = editableLayout(generateLevel(5, 4), 300);
    clearLayout(layout);
    expect(layout.platforms).toEqual([]);
    expect(layout.ropes).toEqual([]);
    expect(layout.props).toEqual([]);
    expect(layout.cagePuzzle).toBeUndefined();
  });
});

describe('level editor: export and import', () => {
  it('round-trips every kind of thing', () => {
    const layout: LevelLayout = { ...room(), exitX: 500 };
    placeAt(layout, 'platform', 300, 430);
    placeAt(layout, 'ladder', 300, 435);
    placeAt(layout, 'wall', 1000, 600);
    placeAt(layout, 'rail', 800, 600);
    placeAt(layout, 'safe-spot', 1000, 230);
    GADGET_KINDS.forEach((kind: GadgetKind, i: number): void => {
      placeAt(layout, kind, 100 + i * 140, 600);
    });
    const button: SourceGadget = layout.gadgets!.find(
      (g: Gadget): boolean => g.kind === 'button',
    ) as SourceGadget;
    toggleWire(button, 'g8');
    toggleWire(button, EXIT_TARGET);
    layout.notes = 'Roll the boulder onto the button: the door opens.';
    const back: LevelLayout | { error: string } = parseLayout(exportLayout(layout));
    expect(back).toEqual(layout);
  });

  it('a generated floor exports and reads back the same (chains re-tangled from the layout seed)', () => {
    for (const floor of [1, 2, 3, 4, 5]) {
      const layout: LevelLayout = editableLayout(generateLevel(99, floor), 280);
      followExit(layout);
      expect(parseLayout(exportLayout(layout))).toEqual(layout);
    }
  });

  it('names the bad field', () => {
    const good: Record<string, unknown> = JSON.parse(exportLayout(room()));
    const bad: (patch: Record<string, unknown>) => string = (
      patch: Record<string, unknown>,
    ): string => {
      const out: LevelLayout | { error: string } = parseLayout(
        JSON.stringify({ ...good, ...patch }),
      );
      return 'error' in out ? out.error : 'no error';
    };
    expect(bad({ exitY: 'high' })).toContain('exitX, exitY');
    expect(bad({ floor: 0 })).toContain('floor');
    expect(bad({ platforms: [{ x: 1, y: 2, width: NaN, height: 3 }] })).toContain('platforms[0]');
    expect(bad({ ropes: [{ x: 1, topY: 500, bottomY: 400 }] })).toContain('ropes[0]');
    expect(bad({ props: [{ kind: 'piano', x: 1, y: 2, width: 3, height: 4 }] })).toContain(
      'unknown kind',
    );
    expect(
      bad({ boulderPuzzle: { wall: { x: 0, y: 0, width: 64, height: 620 }, wallDir: 2 } }),
    ).toContain('wallDir');
    expect(bad({ cagePuzzle: { cages: [] } })).toContain('exit cage');
    expect(bad({ platePuzzle: { plateX: 1 } })).toContain('platePuzzle');
    const box: Record<string, unknown> = { x: 10, y: 500, width: 64, height: 120 };
    expect(bad({ gadgets: [{ ...box, id: 'g1', kind: 'piano' }] })).toContain('gadgets[0].kind');
    expect(bad({ gadgets: [{ ...box, id: 'one', kind: 'boulder' }] })).toContain('gadgets[0].id');
    expect(
      bad({ gadgets: [{ ...box, id: 'g1', kind: 'crack-wall', crackTop: 400, crackBottom: 620 }] }),
    ).toContain('crackTop');
    expect(
      bad({
        gadgets: [
          { ...box, id: 'g1', kind: 'lever', targets: ['g2'] },
          { ...box, id: 'g2', kind: 'boulder' },
        ],
      }),
    ).toContain('wired to g2');
    expect(
      bad({
        gadgets: [
          { ...box, id: 'g1', kind: 'boulder' },
          { ...box, id: 'g1', kind: 'boulder' },
        ],
      }),
    ).toContain('twice');
    expect(bad({ notes: 5 })).toContain('notes');
    expect('error' in parseLayout('not json')).toBe(true);
  });
});

describe('level editor: slopes, cages, exit doors', () => {
  it('a cage asks only what fits what it hides', () => {
    const layout: LevelLayout = room();
    const ref: EditorRef | null = placeAt(layout, 'cage', 600, 200);
    setField(layout, ref!, 'content', 1);
    expect(gadgetAt(layout, ref)).toMatchObject({ content: 'loot' });
    expect(fieldsOf(layout, ref!).map((f: EditorField): string => f.key)).toContain('gold');
    expect(fieldsOf(layout, ref!).map((f: EditorField): string => f.key)).not.toContain('zombies');
    setField(layout, ref!, 'gold', 333);
    expect(gadgetAt(layout, ref)).toMatchObject({ gold: 330 });
  });

  it('a boulder dropped over a slope rests on it; a door can be an exit; the hanging exit can go', () => {
    const layout: LevelLayout = room();
    placeAt(layout, 'slope', 600, 600);
    const slope: Gadget = layout.gadgets![0];
    const boulder: Gadget = gadgetAt(
      layout,
      placeAt(layout, 'boulder', slope.x + slope.width / 2, 300),
    );
    expect(boulder.y + boulder.height).toBeLessThan(GROUND_Y - 20);
    const door: EditorRef | null = placeAt(layout, 'door', 1000, 600);
    setField(layout, door!, 'exit', 1);
    expect(gadgetAt(layout, door)).toMatchObject({ exit: true });
    const lever: SourceGadget = gadgetAt(
      layout,
      placeAt(layout, 'lever', 300, 600),
    ) as SourceGadget;
    toggleWire(lever, EXIT_TARGET);
    removeItem(layout, { kind: 'exit' });
    expect(layout.exitHidden).toBe(true);
    expect(lever.targets, 'its wires went with it').toEqual([]);
    const back: LevelLayout | { error: string } = parseLayout(exportLayout(layout));
    expect(back).toEqual(layout);
    expect(hasWayOut(layout), 'the exit door').toBe(true);
    setField(layout, door!, 'exit', 0);
    expect(hasWayOut(layout)).toBe(false);
  });
});
