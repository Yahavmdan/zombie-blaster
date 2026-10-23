import { WORLD } from './invariants';

/** A gadget as the level editor exports it (see `Gadget` in src/app/engine/engine-types.ts). */
export type GadgetJson = Record<string, unknown> & {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The boulder's size (GAME_CONSTANTS.BOULDER_SIZE_PX). */
export const BOULDER_PX: number = 48;
/** Swings a crack band takes before it breaks out (GAME_CONSTANTS.GADGET_CRACK_HITS). */
export const CRACK_HITS: number = 5;

/**
 * A designed floor as the level editor exports it: an empty room on `floor` (the exit at the left
 * edge, 300 px down) holding these gadgets. Load it with `probe.loadLayout` (online: on every page).
 */
export function gadgetRoom(floor: number, gadgets: GadgetJson[], notes: string = ''): string {
  return JSON.stringify({
    seed: 1,
    floor,
    platforms: [],
    ropes: [],
    exitX: 20,
    exitY: 300,
    props: [],
    walls: [],
    gadgets,
    notes,
  });
}

export function boulderAt(id: string, x: number): GadgetJson {
  return {
    id,
    kind: 'boulder',
    kg: 600,
    x,
    y: WORLD.groundY - BOULDER_PX,
    width: BOULDER_PX,
    height: BOULDER_PX,
  };
}

/** A cracked wall on the ground, 6 tiles tall, its crack band the bottom 2 tiles (a hole to walk through). */
export function crackWallAt(id: string, x: number): GadgetJson {
  return {
    id,
    kind: 'crack-wall',
    x,
    y: WORLD.groundY - 192,
    width: 64,
    height: 192,
    crackTop: WORLD.groundY - 64,
    crackBottom: WORLD.groundY,
  };
}

export function leverAt(id: string, x: number, targets: string[]): GadgetJson {
  return {
    id,
    kind: 'lever',
    x,
    y: WORLD.groundY - 32,
    width: 16,
    height: 32,
    targets,
    startsOn: false,
  };
}

export function doorAt(id: string, x: number): GadgetJson {
  return { id, kind: 'door', x, y: WORLD.groundY - 128, width: 32, height: 128, latch: false };
}

export function springAt(id: string, x: number, power: number = 18): GadgetJson {
  return { id, kind: 'spring', x, y: WORLD.groundY - 32, width: 64, height: 32, power };
}

export function buttonAt(id: string, x: number, targets: string[], kg: number = 60): GadgetJson {
  return { id, kind: 'button', x, y: WORLD.groundY, width: 48, height: 6, kg, targets };
}

export function slopeAt(id: string, x: number, risesRight: boolean = true): GadgetJson {
  return { id, kind: 'slope', x, y: WORLD.groundY - 96, width: 192, height: 96, risesRight };
}

/** A cage hanging with its top at `y`: what it hides, and whether it smashes or stays as a step. */
export function cageAt(
  id: string,
  x: number,
  y: number,
  content: 'zombies' | 'loot' | 'empty',
  smashes: boolean = false,
): GadgetJson {
  return { id, kind: 'cage', x, y, width: 64, height: 64, content, zombies: 2, gold: 100, smashes };
}

export function exitDoorAt(id: string, x: number): GadgetJson {
  return { ...doorAt(id, x), exit: true };
}
