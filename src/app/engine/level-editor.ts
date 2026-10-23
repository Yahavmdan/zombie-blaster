import { GAME_CONSTANTS } from '@shared/index';
import { Box } from './boulder-puzzle';
import { cleatBox, exitCageHangBox } from './cage-puzzle';
import {
  BoulderPuzzleLayout,
  CageContent,
  EXIT_TARGET,
  Gadget,
  GadgetKind,
  HangingCage,
  PlatePuzzleLayout,
  Platform,
  Rope,
  SourceGadget,
  SpringPuzzleLayout,
} from './engine-types';
import { GADGET_KINDS, isSource, isTargetKind, slopeY, slopesOf } from './gadgets';
import {
  GROUND_PLATFORM,
  LevelLayout,
  PROP_ART,
  PROP_KINDS,
  Prop,
  PropKind,
  RAIL_ART,
  cageLandY,
  chainKinks,
  propArtHeight,
  propArtWidth,
  seededRandom,
} from './level-generator';

/**
 * The dev level editor's rules, free of engine state: what each tool places, where the pointer
 * grabs, how things move and resize (snapped), what a delete takes away, the wires from sources
 * to targets, how the floor puzzles follow the exit, and reading a layout back from its exported
 * JSON. The layout is changed in place; `LevelEditorSystem` plays it after every change.
 */

/** What a click on the map does: select (and drag), erase, wire, or place one kind of thing. */
export type EditorTool =
  | 'select'
  | 'erase'
  | 'link'
  | 'platform'
  | 'ladder'
  | 'wall'
  | 'safe-spot'
  | 'exit'
  | GadgetKind
  | PropKind;

/**
 * One thing in the layout. Indexed kinds point into the layout's lists. The floor puzzles'
 * parts (boulder wall, spring, scale, cages, plate) come from generated floors 2-5; designs use
 * the standalone gadgets.
 */
export type EditorRef =
  | { kind: 'platform' | 'ladder' | 'wall' | 'prop' | 'gadget' | 'cage' | 'cleat'; index: number }
  | { kind: 'exit' | 'boulder-wall' | 'spring' | 'scale' | 'plate' };

/** The side of a box (or end of a ladder, or edge of a crack band) being dragged to resize it. */
export type EditorEdge = 'left' | 'right' | 'top' | 'bottom' | 'crack-top' | 'crack-bottom';

/** Something a thing can be adjusted by (middle click, or the bar's selection). */
export type EditorFieldKey =
  | 'width'
  | 'height'
  | 'length'
  | 'kg'
  | 'power'
  | 'angle'
  | 'bandBottom'
  | 'bandHeight'
  | 'latch'
  | 'startsOn'
  | 'exit'
  | 'risesRight'
  | 'content'
  | 'zombies'
  | 'gold'
  | 'smashes';

/**
 * One adjustable value: a number in min..max (steps of `step`), a toggle (value 1 or 0), or a
 * choice (value: the index into `options`).
 */
export interface EditorField {
  key: EditorFieldKey;
  label: string;
  kind: 'number' | 'toggle' | 'choice';
  options: string[];
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export const CAGE_CONTENTS: CageContent[] = ['zombies', 'loot', 'empty'];

export const GADGET_LABELS: Record<GadgetKind, string> = {
  boulder: 'Boulder',
  'crack-wall': 'Cracked wall',
  button: 'Button',
  scale: 'Scale',
  lever: 'Lever',
  spring: 'Spring',
  slingshot: 'Slingshot',
  door: 'Door',
  slope: 'Slope',
  cage: 'Cage',
};

const TILE: number = GAME_CONSTANTS.LEVEL_TILE_PX;
const W: number = GAME_CONSTANTS.CANVAS_WIDTH;
const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const EXIT_W: number = GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
const EXIT_H: number = GAME_CONSTANTS.EXIT_PLATFORM_HEIGHT;
const BOULDER: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
const LADDER_HALF_PX: number = 8;
const SCALE_GRAB_PX: number = 16;
const PLATE_GRAB_PX: number = 8;
/** Thin gadgets set into a surface (buttons, scales) are grabbed this far above and below its top. */
const FLUSH_GRAB_PX: number = 10;
const BUTTON_H: number = 6;
const SCALE_H: number = 8;
/** Widths of buttons, scales and launchers change in steps of this many px. */
const GADGET_WIDTH_STEP_PX: number = 8;

function snap(v: number, step: number = GAME_CONSTANTS.DEV_EDITOR_SNAP_PX): number {
  return Math.round(v / step) * step;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function contains(box: Box, x: number, y: number, pad: number = 0): boolean {
  return (
    x >= box.x - pad &&
    x <= box.x + box.width + pad &&
    y >= box.y - pad &&
    y <= box.y + box.height + pad
  );
}

/** A copy of a floor's layout to edit: the exit fixed at `exitY` (where it hangs now), walls and gadgets listed. */
export function editableLayout(level: LevelLayout, exitY: number): LevelLayout {
  const copy: LevelLayout = structuredClone(level);
  return {
    ...copy,
    exitY: copy.exitY ?? exitY,
    walls: copy.walls ?? [],
    gadgets: copy.gadgets ?? [],
  };
}

export function exitBox(layout: LevelLayout): Platform {
  return {
    x: layout.exitX,
    y: layout.exitY ?? GAME_CONSTANTS.EXIT_PLATFORM_Y,
    width: EXIT_W,
    height: EXIT_H,
  };
}

function walls(layout: LevelLayout): Platform[] {
  if (!layout.walls) layout.walls = [];
  return layout.walls;
}

function gadgets(layout: LevelLayout): Gadget[] {
  if (!layout.gadgets) layout.gadgets = [];
  return layout.gadgets;
}

/** Gadgets whose box is solid where it stands (things rest on their tops). */
function solidGadgets(layout: LevelLayout, skip: number): Platform[] {
  return gadgets(layout).filter(
    (g: Gadget, i: number): boolean =>
      i !== skip &&
      (g.kind === 'crack-wall' ||
        g.kind === 'door' ||
        g.kind === 'spring' ||
        g.kind === 'slingshot' ||
        g.kind === 'cage'),
  );
}

/** Surfaces things stand on: the ground, platforms, walls, the exit, solid gadgets and (for stacking) props. */
function surfaces(
  layout: LevelLayout,
  withProps: boolean,
  skipProp: number = -1,
  skipGadget: number = -1,
): Platform[] {
  const props: Platform[] = withProps
    ? layout.props.filter((_: Prop, i: number): boolean => i !== skipProp)
    : [];
  return [
    GROUND_PLATFORM,
    ...layout.platforms,
    ...walls(layout),
    exitBox(layout),
    ...solidGadgets(layout, skipGadget),
    ...props,
  ];
}

/** Top of the highest surface covering x whose top is at or below y (a little above counts too). */
function surfaceBelow(list: Platform[], x: number, y: number): number {
  let top: number = GROUND_Y;
  for (const s of list) {
    if (x < s.x || x > s.x + s.width) continue;
    if (s.y < y - GAME_CONSTANTS.DEV_EDITOR_SURFACE_SNAP_PX) continue;
    top = Math.min(top, s.y);
  }
  return top;
}

/** Buttons and scales are set into their surface's top (`y` is that top). */
function isFlush(g: Gadget): boolean {
  return g.kind === 'button' || g.kind === 'scale';
}

/** The box a gadget is grabbed by: thin ones set into a surface get room above and below. */
function gadgetGrabBox(g: Gadget): Box {
  return isFlush(g)
    ? { x: g.x, y: g.y - FLUSH_GRAB_PX, width: g.width, height: 2 * FLUSH_GRAB_PX }
    : g;
}

/** The box a ref covers (outline, hit area); null when it is gone. */
export function itemBox(layout: LevelLayout, ref: EditorRef): Box | null {
  switch (ref.kind) {
    case 'platform':
      return layout.platforms[ref.index] ?? null;
    case 'wall':
      return walls(layout)[ref.index] ?? null;
    case 'prop':
      return layout.props[ref.index] ?? null;
    case 'gadget': {
      const g: Gadget | undefined = gadgets(layout)[ref.index];
      return g ? gadgetGrabBox(g) : null;
    }
    case 'ladder': {
      const r: Rope | undefined = layout.ropes[ref.index];
      return r
        ? {
            x: r.x - LADDER_HALF_PX,
            y: r.topY,
            width: 2 * LADDER_HALF_PX,
            height: r.bottomY - r.topY,
          }
        : null;
    }
    case 'exit':
      return exitBox(layout);
    case 'boulder-wall':
      return layout.boulderPuzzle?.wall ?? null;
    case 'spring':
      return layout.springPuzzle?.spring ?? null;
    case 'scale':
      return layout.springPuzzle
        ? {
            x: layout.springPuzzle.scaleX,
            y: GROUND_Y - SCALE_GRAB_PX,
            width: GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX,
            height: 2 * SCALE_GRAB_PX,
          }
        : null;
    case 'cage': {
      const cage: HangingCage | undefined = layout.cagePuzzle?.cages[ref.index];
      if (!cage) return null;
      return cage.hang ?? exitCageHangBox(exitBox(layout));
    }
    case 'cleat':
      return layout.cagePuzzle?.cages[ref.index] ? cleatBox(layout.cagePuzzle, ref.index) : null;
    case 'plate':
      return layout.platePuzzle
        ? {
            x: layout.platePuzzle.plateX,
            y: layout.platePuzzle.plateY - PLATE_GRAB_PX,
            width: GAME_CONSTANTS.PLATE_WIDTH_PX,
            height: 2 * PLATE_GRAB_PX,
          }
        : null;
  }
}

/** Every thing in the layout, topmost (picked first) to bottom: boulders over the rest. */
export function allRefs(layout: LevelLayout): EditorRef[] {
  const cages: number = layout.cagePuzzle?.cages.length ?? 0;
  const indexed: (
    kind: 'platform' | 'ladder' | 'wall' | 'prop' | 'cage' | 'cleat',
    n: number,
  ) => EditorRef[] = (
    kind: 'platform' | 'ladder' | 'wall' | 'prop' | 'cage' | 'cleat',
    n: number,
  ): EditorRef[] =>
    Array.from({ length: n }, (_: unknown, i: number): EditorRef => ({ kind, index: n - 1 - i }));
  const list: Gadget[] = gadgets(layout);
  const gadgetRefs: (front: boolean) => EditorRef[] = (front: boolean): EditorRef[] =>
    list
      .map((g: Gadget, index: number): { g: Gadget; index: number } => ({ g, index }))
      .filter((e: { g: Gadget; index: number }): boolean => (e.g.kind === 'boulder') === front)
      .reverse()
      .map((e: { g: Gadget; index: number }): EditorRef => ({ kind: 'gadget', index: e.index }));
  return [
    ...gadgetRefs(true),
    ...indexed('cleat', cages),
    ...indexed('cage', cages),
    ...(layout.platePuzzle ? [{ kind: 'plate' } as EditorRef] : []),
    ...(layout.springPuzzle ? [{ kind: 'scale' } as EditorRef] : []),
    ...gadgetRefs(false),
    ...indexed('prop', layout.props.length),
    ...indexed('ladder', layout.ropes.length),
    // A removed hanging exit is gone from the map (the Exit tool puts it back).
    ...(layout.exitHidden ? [] : [{ kind: 'exit' } as EditorRef]),
    ...indexed('platform', layout.platforms.length),
    ...indexed('wall', walls(layout).length),
    ...(layout.springPuzzle ? [{ kind: 'spring' } as EditorRef] : []),
    ...(layout.boulderPuzzle ? [{ kind: 'boulder-wall' } as EditorRef] : []),
  ];
}

/** The topmost thing under (x, y), or null. */
export function itemAt(layout: LevelLayout, x: number, y: number): EditorRef | null {
  for (const ref of allRefs(layout)) {
    const box: Box | null = itemBox(layout, ref);
    // Thin things (ladders, cleats) get a little slack.
    if (box && contains(box, x, y, ref.kind === 'ladder' || ref.kind === 'cleat' ? 4 : 0))
      return ref;
  }
  return null;
}

export function sameRef(a: EditorRef | null, b: EditorRef | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  return !('index' in a) || !('index' in b) || a.index === b.index;
}

/** The gadget a ref points at, or null. */
export function gadgetOf(layout: LevelLayout, ref: EditorRef | null): Gadget | null {
  return ref?.kind === 'gadget' ? (gadgets(layout)[ref.index] ?? null) : null;
}

export function gadgetLabel(g: Gadget): string {
  return `${GADGET_LABELS[g.kind]} ${g.id}`;
}

/** A short name for the editor bar. */
export function refLabel(layout: LevelLayout, ref: EditorRef): string {
  switch (ref.kind) {
    case 'platform':
      return layout.platforms[ref.index]?.safe ? 'Safe spot' : 'Platform';
    case 'ladder':
      return 'Ladder';
    case 'wall':
      return 'Wall';
    case 'prop':
      return `Prop: ${layout.props[ref.index]?.kind ?? '?'}`;
    case 'gadget': {
      const g: Gadget | undefined = gadgets(layout)[ref.index];
      return g ? gadgetLabel(g) : 'Gadget';
    }
    case 'exit':
      return 'Exit';
    case 'boulder-wall':
      return 'Boulder wall';
    case 'spring':
      return 'Spring';
    case 'scale':
      return 'Scale';
    case 'cage':
      return ref.index === 0 ? 'Exit cage' : `Cage ${ref.index}`;
    case 'cleat':
      return ref.index === 0 ? 'Exit cage cleat' : `Cleat of cage ${ref.index}`;
    case 'plate':
      return 'Plate';
  }
}

/** Gadgets resized by their sides (and their top for walls and doors). */
function sizable(g: Gadget): { sides: boolean; top: boolean } {
  return {
    sides: g.kind !== 'boulder' && g.kind !== 'lever',
    top: g.kind === 'crack-wall' || g.kind === 'door' || g.kind === 'slope' || g.kind === 'cage',
  };
}

/** Which side of a resizable thing (x, y) grabs, or null to move it. */
export function edgeAt(
  layout: LevelLayout,
  ref: EditorRef,
  x: number,
  y: number,
): EditorEdge | null {
  const box: Box | null = itemBox(layout, ref);
  if (!box) return null;
  const grab: number = GAME_CONSTANTS.DEV_EDITOR_EDGE_GRAB_PX;
  if (ref.kind === 'ladder') {
    if (y - box.y <= grab) return 'top';
    if (box.y + box.height - y <= grab) return 'bottom';
    return null;
  }
  const g: Gadget | null = gadgetOf(layout, ref);
  if (g) {
    if (g.kind === 'crack-wall') {
      if (Math.abs(y - g.crackTop) <= grab / 2) return 'crack-top';
      if (Math.abs(y - g.crackBottom) <= grab / 2) return 'crack-bottom';
    }
    const can: { sides: boolean; top: boolean } = sizable(g);
    if (can.top && y - box.y <= grab) return 'top';
    if (can.sides && x - box.x <= grab) return 'left';
    if (can.sides && box.x + box.width - x <= grab) return 'right';
    return null;
  }
  const sideways: boolean =
    ref.kind === 'platform' ||
    ref.kind === 'wall' ||
    (ref.kind === 'prop' && layout.props[ref.index]?.kind === 'rail');
  if (!sideways) return null;
  if (ref.kind === 'wall' && y - box.y <= grab) return 'top';
  if (x - box.x <= grab) return 'left';
  if (box.x + box.width - x <= grab) return 'right';
  return null;
}

function propSize(kind: PropKind): { width: number; height: number } {
  if (kind === 'rail')
    return { width: GAME_CONSTANTS.RAIL_MIN_WIDTH_PX, height: propArtHeight(RAIL_ART.middle) };
  return { width: propArtWidth(PROP_ART[kind]), height: propArtHeight(PROP_ART[kind]) };
}

function isPropKind(tool: EditorTool): tool is PropKind {
  return (PROP_KINDS as string[]).includes(tool);
}

function isGadgetKind(tool: EditorTool): tool is GadgetKind {
  return (GADGET_KINDS as string[]).includes(tool);
}

/** The next free gadget id on this layout (`g1`, `g2`, ...). */
function nextGadgetId(layout: LevelLayout): string {
  const used: number[] = gadgets(layout).map((g: Gadget): number => Number(g.id.slice(1)) || 0);
  return `g${Math.max(0, ...used) + 1}`;
}

/** A new gadget of `kind` centred on x, standing on (or set into) the surface under y. */
function newGadget(layout: LevelLayout, kind: GadgetKind, x: number, y: number): Gadget {
  const id: string = nextGadgetId(layout);
  const standing: (width: number, height: number) => Box = (width: number, height: number): Box => {
    const gx: number = clamp(snap(x - width / 2), 0, W - width);
    const top: number = surfaceBelow(surfaces(layout, true), gx + width / 2, y);
    return { x: gx, y: top - height, width, height };
  };
  switch (kind) {
    case 'boulder':
      return {
        id,
        kind,
        kg: GAME_CONSTANTS.GADGET_BOULDER_KG,
        ...ontoSlope(layout, standing(BOULDER, BOULDER), y),
      };
    case 'slope': {
      const width: number = GAME_CONSTANTS.GADGET_SLOPE_TILES_WIDE * TILE;
      const gx: number = clamp(snap(x - width / 2), 0, W - width);
      const bottom: number = surfaceBelow(surfaces(layout, false), gx + width / 2, y);
      const height: number = Math.min(GAME_CONSTANTS.GADGET_SLOPE_TILES_HIGH * TILE, bottom);
      return { id, kind, risesRight: true, x: gx, y: bottom - height, width, height };
    }
    case 'cage': {
      const size: number = GAME_CONSTANTS.GADGET_CAGE_SIZE_PX;
      return {
        id,
        kind,
        content: 'zombies',
        zombies: GAME_CONSTANTS.CAGE_ZOMBIES,
        gold: GAME_CONSTANTS.CAGE_LOOT_GOLD,
        smashes: false,
        x: clamp(snap(x - size / 2), 0, W - size),
        y: clamp(snap(y - size / 2), 0, GROUND_Y - size),
        width: size,
        height: size,
      };
    }
    case 'lever':
      return {
        id,
        kind,
        startsOn: false,
        targets: [],
        ...standing(GAME_CONSTANTS.GADGET_LEVER_WIDTH_PX, GAME_CONSTANTS.GADGET_LEVER_HEIGHT_PX),
      };
    case 'spring':
      return {
        id,
        kind,
        power: GAME_CONSTANTS.GADGET_SPRING_POWER,
        ...standing(GAME_CONSTANTS.GADGET_SPRING_WIDTH_PX, GAME_CONSTANTS.GADGET_SPRING_HEIGHT_PX),
      };
    case 'slingshot':
      return {
        id,
        kind,
        power: GAME_CONSTANTS.GADGET_SLINGSHOT_POWER,
        angle: GAME_CONSTANTS.GADGET_SLINGSHOT_ANGLE,
        ...standing(
          GAME_CONSTANTS.GADGET_SLINGSHOT_WIDTH_PX,
          GAME_CONSTANTS.GADGET_SLINGSHOT_HEIGHT_PX,
        ),
      };
    case 'button':
    case 'scale': {
      const width: number =
        kind === 'button'
          ? GAME_CONSTANTS.GADGET_BUTTON_WIDTH_PX
          : GAME_CONSTANTS.GADGET_SCALE_WIDTH_PX;
      const gx: number = clamp(snap(x - width / 2), 0, W - width);
      const top: number = surfaceBelow(surfaces(layout, false), gx + width / 2, y);
      const box: Box = { x: gx, y: top, width, height: kind === 'button' ? BUTTON_H : SCALE_H };
      return kind === 'button'
        ? { id, kind, kg: GAME_CONSTANTS.GADGET_BUTTON_KG, targets: [], ...box }
        : { id, kind, kg: GAME_CONSTANTS.GADGET_SCALE_KG, targets: [], ...box };
    }
    case 'door': {
      const height: number = GAME_CONSTANTS.GADGET_DOOR_TILES * TILE;
      const gx: number = clamp(snap(x - TILE / 2), 0, W - TILE);
      const bottom: number = surfaceBelow(surfaces(layout, false), gx + TILE / 2, y);
      const h: number = Math.min(height, bottom);
      return { id, kind, latch: false, exit: false, x: gx, y: bottom - h, width: TILE, height: h };
    }
    case 'crack-wall': {
      const width: number = GAME_CONSTANTS.DEV_EDITOR_WALL_TILES * TILE;
      const gx: number = clamp(snap(x - width / 2), 0, W - width);
      const bottom: number = surfaceBelow(surfaces(layout, false), gx + width / 2, y);
      const height: number = Math.min(GAME_CONSTANTS.GADGET_CRACK_WALL_TILES * TILE, bottom);
      const band: number = Math.min(height, GAME_CONSTANTS.GADGET_CRACK_BAND_TILES * TILE);
      return {
        id,
        kind,
        x: gx,
        y: bottom - height,
        width,
        height,
        crackTop: bottom - band,
        crackBottom: bottom,
      };
    }
  }
}

/**
 * Places what `tool` makes at (x, y), changing `layout`. Returns the new thing, or null when
 * nothing fits there (the select, erase and link tools place nothing).
 */
export function placeAt(
  layout: LevelLayout,
  tool: EditorTool,
  x: number,
  y: number,
): EditorRef | null {
  if (isPropKind(tool)) {
    const { width, height }: { width: number; height: number } = propSize(tool);
    const px: number = clamp(Math.round(x - width / 2), 0, W - width);
    const top: number = surfaceBelow(surfaces(layout, true), px + width / 2, y);
    layout.props.push({ kind: tool, x: px, y: top - height, width, height });
    return { kind: 'prop', index: layout.props.length - 1 };
  }
  if (isGadgetKind(tool)) {
    gadgets(layout).push(newGadget(layout, tool, x, y));
    return { kind: 'gadget', index: gadgets(layout).length - 1 };
  }
  switch (tool) {
    case 'select':
    case 'erase':
    case 'link':
      return null;
    case 'platform': {
      const width: number = GAME_CONSTANTS.DEV_EDITOR_PLATFORM_TILES * TILE;
      layout.platforms.push({
        x: clamp(snap(x - width / 2), 0, W - width),
        y: clamp(snap(y - TILE / 2), 0, GROUND_Y - TILE),
        width,
        height: TILE,
      });
      return { kind: 'platform', index: layout.platforms.length - 1 };
    }
    case 'safe-spot': {
      const width: number = GAME_CONSTANTS.LEVEL_SAFE_SPOT_TILES * TILE;
      layout.platforms = layout.platforms.filter((p: Platform): boolean => p.safe !== true);
      layout.platforms.push({
        x: clamp(snap(x - width / 2), 0, W - width),
        y: clamp(snap(y - TILE / 2), 0, GROUND_Y - TILE),
        width,
        height: TILE,
        safe: true,
      });
      return { kind: 'platform', index: layout.platforms.length - 1 };
    }
    case 'wall': {
      const width: number = GAME_CONSTANTS.DEV_EDITOR_WALL_TILES * TILE;
      const wx: number = clamp(snap(x - width / 2), 0, W - width);
      const bottom: number = surfaceBelow(surfaces(layout, false), wx + width / 2, y);
      const height: number = Math.min(GAME_CONSTANTS.DEV_EDITOR_WALL_HEIGHT_TILES * TILE, bottom);
      walls(layout).push({ x: wx, y: bottom - height, width, height });
      return { kind: 'wall', index: walls(layout).length - 1 };
    }
    case 'ladder': {
      const lx: number = clamp(snap(x), LADDER_HALF_PX, W - LADDER_HALF_PX);
      const topY: number = surfaceBelow(surfaces(layout, false), lx, y);
      if (topY >= GROUND_Y) return null;
      const bottomY: number = surfaceBelow(
        surfaces(layout, false),
        lx,
        topY + GAME_CONSTANTS.DEV_EDITOR_SURFACE_SNAP_PX + 1,
      );
      layout.ropes.push({ x: lx, topY, bottomY });
      return { kind: 'ladder', index: layout.ropes.length - 1 };
    }
    case 'exit':
      moveExit(layout, x - EXIT_W / 2, y - EXIT_H / 2);
      return { kind: 'exit' };
  }
}

function moveExit(layout: LevelLayout, left: number, top: number): void {
  delete layout.exitHidden;
  layout.exitX = clamp(snap(left), 0, W - EXIT_W);
  layout.exitY = clamp(snap(top), 0, GROUND_Y - EXIT_H);
  followExit(layout);
}

/** Moves a gadget so its box's top-left is at (left, top): onto (or into) the surface below, or free for walls and doors. */
function moveGadget(layout: LevelLayout, index: number, left: number, top: number): void {
  const g: Gadget | undefined = gadgets(layout)[index];
  if (!g) return;
  g.x = clamp(snap(left), 0, W - g.width);
  if (g.kind === 'crack-wall' || g.kind === 'door' || g.kind === 'slope' || g.kind === 'cage') {
    const y: number = clamp(snap(top), 0, GROUND_Y - g.height);
    if (g.kind === 'crack-wall') {
      g.crackTop += y - g.y;
      g.crackBottom += y - g.y;
    }
    g.y = y;
    return;
  }
  const list: Platform[] = surfaces(layout, true, -1, index);
  const cx: number = g.x + g.width / 2;
  if (isFlush(g)) {
    g.y = surfaceBelow(list, cx, top);
    return;
  }
  g.y = surfaceBelow(list, cx, top + g.height) - g.height;
  if (g.kind === 'boulder') g.y = ontoSlope(layout, g, top + g.height).y;
}

/** A boulder's box raised onto a slope under its middle when that is higher than where it stands. */
function ontoSlope(layout: LevelLayout, box: Box, y: number): Box {
  const cx: number = box.x + box.width / 2;
  let top: number = box.y + box.height;
  for (const s of slopesOf(gadgets(layout))) {
    const sy: number | null = slopeY(s, cx);
    if (sy !== null && sy >= y - GAME_CONSTANTS.DEV_EDITOR_SURFACE_SNAP_PX) top = Math.min(top, sy);
  }
  return { ...box, y: top - box.height };
}

/** Moves `ref` so its box's top-left is at (left, top) (snapped, kept on screen, set on its surface where it stands on one). */
export function moveTo(layout: LevelLayout, ref: EditorRef, left: number, top: number): void {
  switch (ref.kind) {
    case 'platform':
    case 'wall': {
      const box: Platform | undefined =
        ref.kind === 'platform' ? layout.platforms[ref.index] : walls(layout)[ref.index];
      if (!box) return;
      box.x = clamp(snap(left), 0, W - box.width);
      box.y = clamp(snap(top), 0, GROUND_Y - box.height);
      break;
    }
    case 'gadget': {
      const g: Gadget | undefined = gadgets(layout)[ref.index];
      // Flush gadgets are grabbed by a box reaching above their top.
      moveGadget(layout, ref.index, left, g && isFlush(g) ? top + FLUSH_GRAB_PX : top);
      break;
    }
    case 'ladder': {
      const r: Rope | undefined = layout.ropes[ref.index];
      if (!r) return;
      const length: number = r.bottomY - r.topY;
      r.x = clamp(snap(left + LADDER_HALF_PX), LADDER_HALF_PX, W - LADDER_HALF_PX);
      r.topY = clamp(snap(top), 0, GROUND_Y - length);
      r.bottomY = r.topY + length;
      break;
    }
    case 'prop': {
      const p: Prop | undefined = layout.props[ref.index];
      if (!p) return;
      p.x = clamp(Math.round(left), 0, W - p.width);
      p.y =
        surfaceBelow(surfaces(layout, true, ref.index), p.x + p.width / 2, top + p.height) -
        p.height;
      break;
    }
    case 'exit':
      moveExit(layout, left, top);
      return;
    case 'boulder-wall': {
      const puzzle: BoulderPuzzleLayout | undefined = layout.boulderPuzzle;
      if (!puzzle) return;
      const right: boolean = left + puzzle.wall.width / 2 >= W / 2;
      puzzle.wall.x = right ? W - puzzle.wall.width : 0;
      puzzle.wallDir = right ? 1 : -1;
      break;
    }
    case 'spring':
      return;
    case 'scale':
      if (layout.springPuzzle) {
        layout.springPuzzle.scaleX = clamp(
          Math.round(left),
          0,
          W - GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX,
        );
      }
      break;
    case 'cage': {
      const hang: Platform | null | undefined = layout.cagePuzzle?.cages[ref.index]?.hang;
      // The exit cage hangs under the exit and moves with it.
      if (!hang) return;
      hang.x = clamp(snap(left), 0, W - hang.width);
      hang.y = clamp(snap(top), 0, GROUND_Y - hang.height);
      break;
    }
    case 'cleat': {
      const cage: HangingCage | undefined = layout.cagePuzzle?.cages[ref.index];
      if (!cage) return;
      const width: number = GAME_CONSTANTS.CAGE_CLEAT_WIDTH_PX;
      cage.cleatX = clamp(Math.round(left + width / 2), width, W - width);
      cage.cleatY = surfaceBelow(
        surfaces(layout, false),
        cage.cleatX,
        top + GAME_CONSTANTS.CAGE_CLEAT_HEIGHT_PX,
      );
      break;
    }
    case 'plate': {
      const puzzle: PlatePuzzleLayout | undefined = layout.platePuzzle;
      if (!puzzle) return;
      const width: number = GAME_CONSTANTS.PLATE_WIDTH_PX;
      puzzle.plateX = clamp(Math.round(left), 0, W - width);
      puzzle.plateY = surfaceBelow(
        surfaces(layout, false),
        puzzle.plateX + width / 2,
        top + PLATE_GRAB_PX,
      );
      break;
    }
  }
  followExit(layout);
}

/** Drags a box's left or right side to x in whole `step`s, `minW`..`maxW` wide. */
function resizeSide(
  box: Box,
  edge: 'left' | 'right',
  x: number,
  step: number,
  minW: number,
  maxW: number,
): void {
  if (edge === 'right') {
    box.width = clamp(Math.round((x - box.x) / step) * step, minW, Math.min(maxW, W - box.x));
    return;
  }
  const right: number = box.x + box.width;
  const width: number = clamp(Math.round((right - x) / step) * step, minW, Math.min(maxW, right));
  box.x = right - width;
  box.width = width;
}

/** Drags a box's top to y in whole tiles, its bottom staying put. */
function resizeTop(box: Box, y: number): void {
  const bottom: number = box.y + box.height;
  const height: number = clamp(
    Math.round((bottom - y) / TILE) * TILE,
    TILE,
    Math.floor(bottom / TILE) * TILE,
  );
  box.y = bottom - height;
  box.height = height;
}

function resizeGadget(g: Gadget, edge: EditorEdge, x: number, y: number): void {
  if (g.kind === 'crack-wall' && (edge === 'crack-top' || edge === 'crack-bottom')) {
    // The band's edges snap to whole tiles from the wall's top, at least a tile high.
    const row: number = g.y + clamp(Math.round((y - g.y) / TILE) * TILE, 0, g.height);
    if (edge === 'crack-top') g.crackTop = Math.min(row, g.crackBottom - TILE);
    else g.crackBottom = Math.max(row, g.crackTop + TILE);
    return;
  }
  if (
    edge === 'top' &&
    (g.kind === 'crack-wall' || g.kind === 'door' || g.kind === 'slope' || g.kind === 'cage')
  ) {
    resizeTop(g, y);
    if (g.kind === 'crack-wall') {
      g.crackTop = clamp(g.crackTop, g.y, g.y + g.height - TILE);
      g.crackBottom = clamp(g.crackBottom, g.crackTop + TILE, g.y + g.height);
    }
    return;
  }
  if (edge !== 'left' && edge !== 'right') return;
  const tiled: boolean = g.kind === 'crack-wall' || g.kind === 'door' || g.kind === 'slope';
  const step: number = tiled ? TILE : GADGET_WIDTH_STEP_PX;
  resizeSide(g, edge, x, step, tiled ? TILE : 2 * GADGET_WIDTH_STEP_PX, W);
}

/** Drags one side of `ref` to (x, y): widths in whole tiles, a wall's top keeps its bottom, ladder ends snap onto surfaces. */
export function resizeTo(
  layout: LevelLayout,
  ref: EditorRef,
  edge: EditorEdge,
  x: number,
  y: number,
): void {
  if (ref.kind === 'ladder') {
    const r: Rope | undefined = layout.ropes[ref.index];
    if (!r) return;
    const min: number = GAME_CONSTANTS.DEV_EDITOR_LADDER_MIN_PX;
    const list: Platform[] = surfaces(layout, false);
    const end: number = surfaceBelow(list, r.x, y);
    const onSurface: number = end - y <= GAME_CONSTANTS.DEV_EDITOR_SURFACE_SNAP_PX ? end : snap(y);
    if (edge === 'top') r.topY = clamp(onSurface, 0, r.bottomY - min);
    if (edge === 'bottom') r.bottomY = clamp(onSurface, r.topY + min, GROUND_Y);
    return;
  }
  const g: Gadget | null = gadgetOf(layout, ref);
  if (g) {
    resizeGadget(g, edge, x, y);
    followExit(layout);
    return;
  }
  const box: Platform | Prop | undefined =
    ref.kind === 'platform'
      ? layout.platforms[ref.index]
      : ref.kind === 'wall'
        ? walls(layout)[ref.index]
        : ref.kind === 'prop'
          ? layout.props[ref.index]
          : undefined;
  if (!box) return;
  const rail: boolean = ref.kind === 'prop';
  if (edge === 'left' || edge === 'right') {
    resizeSide(
      box,
      edge,
      x,
      rail ? 1 : TILE,
      rail ? GAME_CONSTANTS.RAIL_MIN_WIDTH_PX : TILE,
      rail ? GAME_CONSTANTS.RAIL_MAX_WIDTH_PX : W,
    );
  } else if (edge === 'top' && ref.kind === 'wall') {
    resizeTop(box, y);
  }
  followExit(layout);
}

/** Takes `ref` away. A floor puzzle's own part takes the whole puzzle; a gadget (or the hanging exit) takes the wires to it. */
export function removeItem(layout: LevelLayout, ref: EditorRef): void {
  switch (ref.kind) {
    case 'platform':
      layout.platforms.splice(ref.index, 1);
      break;
    case 'ladder':
      layout.ropes.splice(ref.index, 1);
      break;
    case 'wall':
      walls(layout).splice(ref.index, 1);
      break;
    case 'prop':
      layout.props.splice(ref.index, 1);
      break;
    case 'gadget': {
      const [gone]: Gadget[] = gadgets(layout).splice(ref.index, 1);
      if (gone) unwireAll(layout, gone.id);
      break;
    }
    case 'exit':
      // The hanging exit goes (an exit door can be the way out); wires to it go with it.
      layout.exitHidden = true;
      unwireAll(layout, EXIT_TARGET);
      break;
    case 'boulder-wall':
      delete layout.boulderPuzzle;
      break;
    case 'spring':
    case 'scale':
      delete layout.springPuzzle;
      break;
    case 'cage':
    case 'cleat':
      if (ref.index === 0) delete layout.cagePuzzle;
      else layout.cagePuzzle?.cages.splice(ref.index, 1);
      break;
    case 'plate':
      delete layout.platePuzzle;
      break;
  }
  followExit(layout);
}

/** Everything but the exit (and the notes) goes: an empty room to design in. */
export function clearLayout(layout: LevelLayout): void {
  layout.platforms = [];
  layout.ropes = [];
  layout.props = [];
  layout.walls = [];
  layout.gadgets = [];
  delete layout.boulderPuzzle;
  delete layout.springPuzzle;
  delete layout.cagePuzzle;
  delete layout.platePuzzle;
}

// ─── Wires ───────────────────────────────────────────────

/** The id a wire to this thing names (a target gadget, or the exit), or null when nothing can be wired to it. */
export function wireTargetId(layout: LevelLayout, ref: EditorRef | null): string | null {
  if (ref?.kind === 'exit') return EXIT_TARGET;
  const g: Gadget | null = gadgetOf(layout, ref);
  return g && isTargetKind(g.kind) ? g.id : null;
}

/** The source gadget a ref points at (button, scale, lever), or null. */
export function sourceOf(layout: LevelLayout, ref: EditorRef | null): SourceGadget | null {
  const g: Gadget | null = gadgetOf(layout, ref);
  return g && isSource(g) ? g : null;
}

/** Wires the source to the target, or takes that wire away when it is there. */
export function toggleWire(source: SourceGadget, targetId: string): void {
  const at: number = source.targets.indexOf(targetId);
  if (at >= 0) source.targets.splice(at, 1);
  else source.targets.push(targetId);
}

function unwireAll(layout: LevelLayout, targetId: string): void {
  for (const g of gadgets(layout)) {
    if (isSource(g)) g.targets = g.targets.filter((t: string): boolean => t !== targetId);
  }
}

/** Players have a way off the floor: the hanging exit, or an exit door. */
export function hasWayOut(layout: LevelLayout): boolean {
  return (
    !layout.exitHidden || gadgets(layout).some((g: Gadget): boolean => g.kind === 'door' && g.exit)
  );
}

/** The label of a wire's target (the exit or a gadget). */
export function targetLabel(layout: LevelLayout, targetId: string): string {
  if (targetId === EXIT_TARGET) return 'Exit';
  const g: Gadget | undefined = gadgets(layout).find((x: Gadget): boolean => x.id === targetId);
  return g ? gadgetLabel(g) : targetId;
}

// ─── Adjustable fields ───────────────────────────────────

function numberField(
  key: EditorFieldKey,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit: string,
): EditorField {
  return {
    key,
    label,
    kind: 'number',
    options: [],
    value,
    min,
    max: Math.max(min, max),
    step,
    unit,
  };
}

function toggleField(key: EditorFieldKey, label: string, on: boolean): EditorField {
  return {
    key,
    label,
    kind: 'toggle',
    options: [],
    value: on ? 1 : 0,
    min: 0,
    max: 1,
    step: 1,
    unit: '',
  };
}

function choiceField(
  key: EditorFieldKey,
  label: string,
  options: string[],
  index: number,
): EditorField {
  return {
    key,
    label,
    kind: 'choice',
    options,
    value: index,
    min: 0,
    max: options.length - 1,
    step: 1,
    unit: '',
  };
}

const KG_STEP: number = 10;
const MAX_KG: number = GAME_CONSTANTS.GADGET_MAX_KG;
const MAX_POWER: number = GAME_CONSTANTS.GADGET_LAUNCH_MAX_POWER;

function widthField(box: Box, step: number, min: number, max: number): EditorField {
  return numberField('width', 'Width', box.width, min, Math.min(max, W - box.x), step, 'px');
}

/** A box standing on its foot: its height grows up from there (whole tiles). */
function heightField(box: Box): EditorField {
  const foot: number = box.y + box.height;
  return numberField(
    'height',
    'Height',
    box.height,
    TILE,
    Math.floor(foot / TILE) * TILE,
    TILE,
    'px',
  );
}

function gadgetFields(g: Gadget): EditorField[] {
  const slim: number = 2 * GADGET_WIDTH_STEP_PX;
  switch (g.kind) {
    case 'boulder':
      return [numberField('kg', 'Weight', g.kg, 1, MAX_KG, KG_STEP, 'kg')];
    case 'crack-wall': {
      const foot: number = g.y + g.height;
      const bandBottom: number = foot - g.crackBottom;
      return [
        widthField(g, TILE, TILE, W),
        heightField(g),
        numberField(
          'bandBottom',
          'Crack band above the foot',
          bandBottom,
          0,
          g.height - TILE,
          TILE,
          'px',
        ),
        numberField(
          'bandHeight',
          'Crack band height',
          g.crackBottom - g.crackTop,
          TILE,
          g.height - bandBottom,
          TILE,
          'px',
        ),
      ];
    }
    case 'door':
      return [
        widthField(g, TILE, TILE, W),
        heightField(g),
        toggleField('latch', 'Stays open once open', g.latch),
        toggleField('exit', 'Exit door (walk in when open)', g.exit),
      ];
    case 'slope':
      return [
        widthField(g, TILE, TILE, W),
        heightField(g),
        toggleField('risesRight', 'Rises to the right', g.risesRight),
      ];
    case 'cage': {
      const fields: EditorField[] = [
        choiceField('content', 'Hides', CAGE_CONTENTS, CAGE_CONTENTS.indexOf(g.content)),
      ];
      if (g.content === 'zombies') {
        fields.push(
          numberField(
            'zombies',
            'Zombies inside',
            g.zombies,
            1,
            GAME_CONSTANTS.GADGET_CAGE_MAX_ZOMBIES,
            1,
            '',
          ),
        );
      }
      if (g.content === 'loot') {
        fields.push(
          numberField(
            'gold',
            'Gold inside',
            g.gold,
            0,
            GAME_CONSTANTS.GADGET_CAGE_MAX_GOLD,
            10,
            'gold',
          ),
        );
      }
      return [
        ...fields,
        toggleField('smashes', 'Smashes when it lands (else stays as a step)', g.smashes),
        widthField(g, GADGET_WIDTH_STEP_PX, 4 * GADGET_WIDTH_STEP_PX, W),
        numberField(
          'height',
          'Height',
          g.height,
          4 * GADGET_WIDTH_STEP_PX,
          GROUND_Y - g.y,
          GADGET_WIDTH_STEP_PX,
          'px',
        ),
      ];
    }
    case 'button':
    case 'scale':
      return [
        numberField('kg', 'Weight to turn on', g.kg, 1, MAX_KG, KG_STEP, 'kg'),
        widthField(g, GADGET_WIDTH_STEP_PX, slim, W),
      ];
    case 'lever':
      return [toggleField('startsOn', 'Starts on', g.startsOn)];
    case 'spring':
      return [
        numberField('power', 'Launch power', g.power, 1, MAX_POWER, 1, 'px/tick'),
        widthField(g, GADGET_WIDTH_STEP_PX, slim, W),
      ];
    case 'slingshot':
      return [
        numberField('power', 'Launch power', g.power, 1, MAX_POWER, 1, 'px/tick'),
        numberField('angle', 'Angle (0 right, 90 up, 180 left)', g.angle, 0, 180, 5, 'deg'),
        widthField(g, GADGET_WIDTH_STEP_PX, slim, W),
      ];
  }
}

/** What can be adjusted on a thing (its size, strength, weight...), with ranges; [] when nothing. */
export function fieldsOf(layout: LevelLayout, ref: EditorRef): EditorField[] {
  const g: Gadget | null = gadgetOf(layout, ref);
  if (g) return gadgetFields(g);
  switch (ref.kind) {
    case 'platform': {
      const p: Platform | undefined = layout.platforms[ref.index];
      return p ? [widthField(p, TILE, TILE, W)] : [];
    }
    case 'wall': {
      const w: Platform | undefined = walls(layout)[ref.index];
      return w ? [widthField(w, TILE, TILE, W), heightField(w)] : [];
    }
    case 'ladder': {
      const r: Rope | undefined = layout.ropes[ref.index];
      return r
        ? [
            numberField(
              'length',
              'Length',
              r.bottomY - r.topY,
              GAME_CONSTANTS.DEV_EDITOR_LADDER_MIN_PX,
              GROUND_Y - r.topY,
              GAME_CONSTANTS.DEV_EDITOR_SNAP_PX,
              'px',
            ),
          ]
        : [];
    }
    case 'prop': {
      const p: Prop | undefined = layout.props[ref.index];
      return p?.kind === 'rail'
        ? [widthField(p, 1, GAME_CONSTANTS.RAIL_MIN_WIDTH_PX, GAME_CONSTANTS.RAIL_MAX_WIDTH_PX)]
        : [];
    }
    default:
      return [];
  }
}

/** A box's height changed from its foot (the foot stays). */
function setHeight(box: Box, height: number): void {
  const foot: number = box.y + box.height;
  box.y = foot - height;
  box.height = height;
}

function setGadgetField(g: Gadget, key: EditorFieldKey, v: number): void {
  if (key === 'width') g.width = v;
  else if (key === 'kg' && (g.kind === 'boulder' || g.kind === 'button' || g.kind === 'scale'))
    g.kg = v;
  else if (key === 'power' && (g.kind === 'spring' || g.kind === 'slingshot')) g.power = v;
  else if (key === 'angle' && g.kind === 'slingshot') g.angle = v;
  else if (key === 'latch' && g.kind === 'door') g.latch = v !== 0;
  else if (key === 'startsOn' && g.kind === 'lever') g.startsOn = v !== 0;
  else if (key === 'exit' && g.kind === 'door') g.exit = v !== 0;
  else if (key === 'risesRight' && g.kind === 'slope') g.risesRight = v !== 0;
  else if (key === 'content' && g.kind === 'cage') g.content = CAGE_CONTENTS[v];
  else if (key === 'zombies' && g.kind === 'cage') g.zombies = v;
  else if (key === 'gold' && g.kind === 'cage') g.gold = v;
  else if (key === 'smashes' && g.kind === 'cage') g.smashes = v !== 0;
  // A cage hangs from its top: it grows down.
  else if (key === 'height' && g.kind === 'cage') g.height = v;
  else if (g.kind === 'crack-wall') {
    const foot: number = g.y + g.height;
    let bandBottom: number = foot - g.crackBottom;
    let bandHeight: number = g.crackBottom - g.crackTop;
    if (key === 'height') setHeight(g, v);
    if (key === 'bandBottom') bandBottom = v;
    if (key === 'bandHeight') bandHeight = v;
    // The band stays inside the wall, at least a tile high.
    bandBottom = clamp(bandBottom, 0, g.height - TILE);
    bandHeight = clamp(bandHeight, TILE, g.height - bandBottom);
    g.crackBottom = foot - bandBottom;
    g.crackTop = g.crackBottom - bandHeight;
  } else if (key === 'height' && (g.kind === 'door' || g.kind === 'slope')) setHeight(g, v);
}

/** Sets one of a thing's fields, clamped to its range and snapped to its step. */
export function setField(
  layout: LevelLayout,
  ref: EditorRef,
  key: EditorFieldKey,
  value: number,
): void {
  const field: EditorField | undefined = fieldsOf(layout, ref).find(
    (f: EditorField): boolean => f.key === key,
  );
  if (!field || !Number.isFinite(value)) return;
  const v: number = clamp(Math.round(value / field.step) * field.step, field.min, field.max);
  const g: Gadget | null = gadgetOf(layout, ref);
  if (g) setGadgetField(g, key, v);
  else if (ref.kind === 'ladder') {
    const r: Rope | undefined = layout.ropes[ref.index];
    if (r) r.bottomY = r.topY + v;
  } else {
    const box: Platform | Prop | undefined =
      ref.kind === 'platform'
        ? layout.platforms[ref.index]
        : ref.kind === 'wall'
          ? walls(layout)[ref.index]
          : ref.kind === 'prop'
            ? layout.props[ref.index]
            : undefined;
    if (box && key === 'width') box.width = v;
    if (box && key === 'height') setHeight(box, v);
  }
  followExit(layout);
}

/**
 * Puzzle parts derived from the rest: the boulder's ledge is the exit; the spring stands under the
 * exit from its nearer screen edge; each cage lands on what is under it and its chain winds
 * through the ceiling band (seeded, so the same layout always tangles the same way).
 */
export function followExit(layout: LevelLayout): void {
  if (layout.boulderPuzzle) layout.boulderPuzzle.ledgeX = layout.exitX;
  const spring: SpringPuzzleLayout | undefined = layout.springPuzzle;
  if (spring) {
    const height: number = GAME_CONSTANTS.SPRING_HEIGHT_PX;
    const right: boolean = layout.exitX + EXIT_W / 2 > W / 2;
    spring.side = right ? 1 : -1;
    spring.spring = right
      ? { x: layout.exitX, y: GROUND_Y - height, width: W - layout.exitX, height }
      : { x: 0, y: GROUND_Y - height, width: layout.exitX + EXIT_W, height };
  }
  const cages: HangingCage[] = layout.cagePuzzle?.cages ?? [];
  const under: Platform[] = [...layout.platforms, ...walls(layout)];
  const hook: Box = exitCageHangBox(exitBox(layout));
  cages.forEach((cage: HangingCage, i: number): void => {
    cage.landY = cage.hang ? cageLandY(cage.hang, under) : GROUND_Y;
    const hookX: number = cage.hang ? cage.hang.x + cage.hang.width / 2 : hook.x + hook.width / 2;
    cage.kinks = chainKinks(seededRandom((layout.seed + i * 7919) >>> 0), cage.cleatX, hookX);
  });
}

/** The layout as JSON for export (what `parseLayout` reads back). */
export function exportLayout(layout: LevelLayout): string {
  return JSON.stringify(layout, null, 2);
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readBox(v: unknown, what: string): Platform {
  if (
    !isObject(v) ||
    !isNum(v['x']) ||
    !isNum(v['y']) ||
    !isNum(v['width']) ||
    !isNum(v['height'])
  ) {
    throw new Error(`${what}: needs numbers x, y, width, height`);
  }
  if (v['width'] <= 0 || v['height'] <= 0) throw new Error(`${what}: empty box`);
  const box: Platform = { x: v['x'], y: v['y'], width: v['width'], height: v['height'] };
  if (v['safe'] === true) box.safe = true;
  return box;
}

function readList<T>(v: unknown, what: string, read: (item: unknown, name: string) => T): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${what}: not a list`);
  return v.map((item: unknown, i: number): T => read(item, `${what}[${i}]`));
}

function readRope(v: unknown, what: string): Rope {
  if (
    !isObject(v) ||
    !isNum(v['x']) ||
    !isNum(v['topY']) ||
    !isNum(v['bottomY']) ||
    v['topY'] >= v['bottomY']
  ) {
    throw new Error(`${what}: needs x and topY above bottomY`);
  }
  return { x: v['x'], topY: v['topY'], bottomY: v['bottomY'] };
}

function readProp(v: unknown, what: string): Prop {
  const box: Platform = readBox(v, what);
  const kind: unknown = (v as Json)['kind'];
  if (!(PROP_KINDS as unknown[]).includes(kind)) throw new Error(`${what}: unknown kind`);
  return { kind: kind as PropKind, x: box.x, y: box.y, width: box.width, height: box.height };
}

function readSide(v: unknown, what: string): 1 | -1 {
  if (v !== 1 && v !== -1) throw new Error(`${what}: must be 1 or -1`);
  return v;
}

function readCage(v: unknown, what: string): HangingCage {
  if (!isObject(v)) throw new Error(`${what}: not an object`);
  const content: unknown = v['content'];
  if (!(CAGE_CONTENTS as unknown[]).includes(content))
    throw new Error(`${what}.content: zombies, loot or empty`);
  if (!isNum(v['cleatX']) || !isNum(v['cleatY'])) throw new Error(`${what}: needs cleatX, cleatY`);
  return {
    hang: v['hang'] === null || v['hang'] === undefined ? null : readBox(v['hang'], `${what}.hang`),
    landY: isNum(v['landY']) ? v['landY'] : GROUND_Y,
    content: content as CageContent,
    cleatX: v['cleatX'],
    cleatY: v['cleatY'],
    kinks: [],
  };
}

function readNumber(v: Json, field: string, what: string): number {
  const n: unknown = v[field];
  if (!isNum(n)) throw new Error(`${what}.${field}: a number`);
  return n;
}

function readTargets(v: Json, what: string): string[] {
  const t: unknown = v['targets'];
  if (!Array.isArray(t) || !t.every((id: unknown): boolean => typeof id === 'string')) {
    throw new Error(`${what}.targets: a list of gadget ids (or "${EXIT_TARGET}")`);
  }
  return [...new Set(t as string[])];
}

function readGadget(v: unknown, what: string): Gadget {
  const box: Platform = readBox(v, what);
  const o: Json = v as Json;
  const id: unknown = o['id'];
  if (typeof id !== 'string' || !/^g\d+$/.test(id)) throw new Error(`${what}.id: like "g1"`);
  const base: { id: string; x: number; y: number; width: number; height: number } = {
    id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
  const kind: unknown = o['kind'];
  switch (kind) {
    case 'boulder':
      // Exports from before boulders had a weight get the usual one.
      return { ...base, kind, kg: isNum(o['kg']) ? o['kg'] : GAME_CONSTANTS.GADGET_BOULDER_KG };
    case 'crack-wall': {
      const crackTop: number = readNumber(o, 'crackTop', what);
      const crackBottom: number = readNumber(o, 'crackBottom', what);
      if (crackTop < base.y || crackBottom > base.y + base.height || crackTop >= crackBottom) {
        throw new Error(`${what}: crackTop..crackBottom inside the wall`);
      }
      return { ...base, kind, crackTop, crackBottom };
    }
    case 'button':
    case 'scale':
      return { ...base, kind, kg: readNumber(o, 'kg', what), targets: readTargets(o, what) };
    case 'lever':
      return { ...base, kind, targets: readTargets(o, what), startsOn: o['startsOn'] === true };
    case 'spring':
      return { ...base, kind, power: readNumber(o, 'power', what) };
    case 'slingshot':
      return {
        ...base,
        kind,
        power: readNumber(o, 'power', what),
        angle: readNumber(o, 'angle', what),
      };
    case 'door':
      return { ...base, kind, latch: o['latch'] === true, exit: o['exit'] === true };
    case 'slope':
      return { ...base, kind, risesRight: o['risesRight'] !== false };
    case 'cage': {
      const content: unknown = o['content'];
      if (!(CAGE_CONTENTS as unknown[]).includes(content)) {
        throw new Error(`${what}.content: zombies, loot or empty`);
      }
      return {
        ...base,
        kind,
        content: content as CageContent,
        zombies: readNumber(o, 'zombies', what),
        gold: readNumber(o, 'gold', what),
        smashes: o['smashes'] === true,
      };
    }
    default:
      throw new Error(`${what}.kind: ${GADGET_KINDS.join(', ')}`);
  }
}

/** Gadget ids are unique and every wire runs to a target gadget or the exit. */
function checkWires(list: Gadget[]): void {
  const ids: Set<string> = new Set<string>();
  for (const g of list) {
    if (ids.has(g.id)) throw new Error(`gadgets: id ${g.id} used twice`);
    ids.add(g.id);
  }
  for (const g of list) {
    if (!isSource(g)) continue;
    for (const t of g.targets) {
      const target: Gadget | undefined = list.find((x: Gadget): boolean => x.id === t);
      if (t !== EXIT_TARGET && (!target || !isTargetKind(target.kind))) {
        throw new Error(
          `gadgets: ${g.id} is wired to ${t}, not a spring, slingshot, door or the exit`,
        );
      }
    }
  }
}

/** Reads an exported layout (validated: a bad field is named in the error). Puzzle parts derived from the rest are rebuilt. */
export function parseLayout(text: string): LevelLayout | { error: string } {
  try {
    const v: unknown = JSON.parse(text);
    if (!isObject(v)) throw new Error('not a layout object');
    if (!isNum(v['floor']) || v['floor'] < 1) throw new Error('floor: a number from 1');
    if (!isNum(v['exitX']) || !isNum(v['exitY'])) throw new Error('exitX, exitY: numbers');
    const notes: unknown = v['notes'];
    if (notes !== undefined && typeof notes !== 'string') throw new Error('notes: text');
    const layout: LevelLayout = {
      seed: isNum(v['seed']) ? v['seed'] : 0,
      floor: Math.floor(v['floor']),
      platforms: readList(v['platforms'], 'platforms', readBox),
      ropes: readList(v['ropes'], 'ropes', readRope),
      exitX: v['exitX'],
      exitY: v['exitY'],
      props: readList(v['props'], 'props', readProp),
      walls: readList(v['walls'], 'walls', readBox),
      gadgets: readList(v['gadgets'], 'gadgets', readGadget),
    };
    checkWires(layout.gadgets ?? []);
    if (typeof notes === 'string' && notes.length > 0) layout.notes = notes;
    if (v['exitHidden'] === true) layout.exitHidden = true;
    const boulder: unknown = v['boulderPuzzle'];
    if (boulder !== undefined) {
      if (!isObject(boulder)) throw new Error('boulderPuzzle: not an object');
      layout.boulderPuzzle = {
        wall: readBox(boulder['wall'], 'boulderPuzzle.wall'),
        wallDir: readSide(boulder['wallDir'], 'boulderPuzzle.wallDir'),
        ledgeX: layout.exitX,
      };
    }
    const spring: unknown = v['springPuzzle'];
    if (spring !== undefined) {
      if (!isObject(spring) || !isNum(spring['scaleX']))
        throw new Error('springPuzzle: needs scaleX');
      layout.springPuzzle = {
        spring: { x: 0, y: 0, width: 0, height: 0 },
        side: 1,
        scaleX: spring['scaleX'],
      };
    }
    const cages: unknown = v['cagePuzzle'];
    if (cages !== undefined) {
      if (!isObject(cages)) throw new Error('cagePuzzle: not an object');
      const list: HangingCage[] = readList(cages['cages'], 'cagePuzzle.cages', readCage);
      if (list.length === 0 || list[0].hang !== null)
        throw new Error('cagePuzzle.cages[0]: the exit cage (hang null)');
      if (list.slice(1).some((c: HangingCage): boolean => c.hang === null)) {
        throw new Error('cagePuzzle: only cages[0] hangs under the exit');
      }
      layout.cagePuzzle = { cages: list };
    }
    const plate: unknown = v['platePuzzle'];
    if (plate !== undefined) {
      if (!isObject(plate) || !isNum(plate['plateX']) || !isNum(plate['plateY'])) {
        throw new Error('platePuzzle: needs plateX, plateY');
      }
      layout.platePuzzle = { plateX: plate['plateX'], plateY: plate['plateY'] };
    }
    followExit(layout);
    return layout;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
