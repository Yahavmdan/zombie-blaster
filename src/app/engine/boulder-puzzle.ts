import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { BoulderState } from '@shared/game-entities';
import { BoulderPuzzleLayout, Platform } from './engine-types';

/**
 * Floor-2 boulder puzzle rules, free of engine state so the host system, the client, the
 * renderer and the tests all use the same math.
 *
 * The boulder rests on the ledge (the exit platform's spot) against a small gate. Breaking the
 * gate releases it: it rolls off the ledge and down a chute (boulder-only, not walkable) into the
 * wall at the screen edge, breaks it and shatters. Ledge height follows the exit's rules (floor,
 * player count), so everything here takes `ledgeY` and is derived per frame.
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The boulder's center from rest (against the gate), over the ledge edge, to the wall face. */
export interface BoulderPath {
  start: Point;
  edge: Point;
  end: Point;
  length: number;
}

export interface CrushTarget {
  id: string;
  x: number;
  y: number;
  instanceWidth: number;
  instanceHeight: number;
  isDead: boolean;
}

const R: number = GAME_CONSTANTS.BOULDER_SIZE_PX / 2;

/** Horizontal span of the chute: from the ledge's downhill edge to the wall face. */
export function chuteSpan(puzzle: BoulderPuzzleLayout): [number, number] {
  return puzzle.wallDir === 1
    ? [puzzle.ledgeX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH, puzzle.wall.x]
    : [puzzle.wall.x + puzzle.wall.width, puzzle.ledgeX];
}

/** The small wall holding the boulder, standing on the ledge's downhill edge. */
export function gateBox(puzzle: BoulderPuzzleLayout, ledgeY: number): Box {
  const width: number = GAME_CONSTANTS.BOULDER_GATE_WIDTH_PX;
  const height: number = GAME_CONSTANTS.BOULDER_GATE_HEIGHT_PX;
  const x: number =
    puzzle.wallDir === 1
      ? puzzle.ledgeX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH - width
      : puzzle.ledgeX;
  return { x, y: ledgeY - height, width, height };
}

export function boulderPath(puzzle: BoulderPuzzleLayout, ledgeY: number): BoulderPath {
  const dir: number = puzzle.wallDir;
  const gate: Box = gateBox(puzzle, ledgeY);
  const start: Point = { x: dir === 1 ? gate.x - R : gate.x + gate.width + R, y: ledgeY - R };
  const edge: Point = {
    x: dir === 1 ? puzzle.ledgeX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH : puzzle.ledgeX,
    y: ledgeY - R,
  };
  const wallFace: number = dir === 1 ? puzzle.wall.x : puzzle.wall.x + puzzle.wall.width;
  const end: Point = {
    x: wallFace - dir * R,
    y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.BOULDER_CHUTE_END_CLEARANCE_PX - R,
  };
  const flat: number = Math.abs(edge.x - start.x);
  const down: number = Math.hypot(end.x - edge.x, end.y - edge.y);
  return { start, edge, end, length: flat + down };
}

/** The boulder's center after rolling `progress` px along the path. */
export function pointAlong(path: BoulderPath, progress: number): Point {
  const flat: number = Math.abs(path.edge.x - path.start.x);
  if (progress <= flat) {
    const t: number = flat > 0 ? progress / flat : 1;
    return { x: path.start.x + (path.edge.x - path.start.x) * t, y: path.start.y };
  }
  if (progress >= path.length) return { ...path.end };
  const t: number = (progress - flat) / (path.length - flat);
  return {
    x: path.edge.x + (path.end.x - path.edge.x) * t,
    y: path.edge.y + (path.end.y - path.edge.y) * t,
  };
}

/** The boulder's box, or null once it shattered against the wall. */
export function boulderBox(boulder: BoulderState, path: BoulderPath): Box | null {
  if (boulder.wallBroken) return null;
  const c: Point = pointAlong(path, boulder.progress);
  return { x: c.x - R, y: c.y - R, width: 2 * R, height: 2 * R };
}

export function gateBroken(boulder: BoulderState): boolean {
  return boulder.gateHits >= GAME_CONSTANTS.BOULDER_GATE_HITS;
}

/** An attacking player next to the gate (within reach, level with it) and facing it hits it. */
export function gateHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  puzzle: BoulderPuzzleLayout,
  ledgeY: number,
): boolean {
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const gate: Box = gateBox(puzzle, ledgeY);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const feet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  // Up on the ledge (standing or hopping beside the gate), never from below through its floor.
  if (feet > ledgeY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE || feet <= gate.y) return false;
  // The boulder rests against the gate while it holds: swinging at the boulder hits the gate too.
  const size: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
  const left: number = puzzle.wallDir === 1 ? gate.x - size : gate.x;
  const right: number = left + size + gate.width;
  const gap: number = Math.max(0, Math.max(left - (player.x + width), player.x - right));
  if (gap > GAME_CONSTANTS.BOULDER_HIT_REACH_PX) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign((left + right) / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/**
 * One tick of rolling: only once the gate broke and until the wall broke. Speeds up along the
 * path; returns true when it is at the wall (also when the path shrank under it: the ledge drops
 * when a player leaves).
 */
export function rollBoulder(boulder: BoulderState, path: BoulderPath): boolean {
  if (boulder.wallBroken || !gateBroken(boulder)) return false;
  if (boulder.progress < path.length) {
    boulder.speed = Math.min(
      GAME_CONSTANTS.BOULDER_MAX_SPEED,
      boulder.speed + GAME_CONSTANTS.BOULDER_ROLL_ACCEL,
    );
    boulder.progress += boulder.speed;
    if (boulder.progress < path.length) return false;
  }
  boulder.progress = path.length;
  boulder.speed = 0;
  return true;
}

/** Live zombies a box overlaps that are not in `crushed` yet. */
export function crushTargets<T extends CrushTarget>(
  zombies: T[],
  box: Box,
  crushed: Set<string>,
): T[] {
  return zombies.filter(
    (z: T): boolean =>
      !z.isDead &&
      !crushed.has(z.id) &&
      z.x < box.x + box.width &&
      z.x + z.instanceWidth > box.x &&
      z.y < box.y + box.height &&
      z.y + z.instanceHeight > box.y,
  );
}

/** Where the broken wall's debris comes down: in front of the wall face, screen top to ground. */
export function debrisBox(puzzle: BoulderPuzzleLayout): Box {
  const depth: number = GAME_CONSTANTS.BOULDER_DEBRIS_PX;
  const x: number =
    puzzle.wallDir === 1 ? puzzle.wall.x - depth : puzzle.wall.x + puzzle.wall.width;
  return { x, y: 0, width: depth, height: GAME_CONSTANTS.GROUND_Y };
}

/** Moves a box (corpse, drop, spawn) out of the standing wall, to the wall's open side. */
export function keepOutOfWall(x: number, width: number, wall: Platform | null): number {
  if (!wall || x + width <= wall.x || x >= wall.x + wall.width) return x;
  return wall.x === 0 ? wall.width : wall.x - width;
}

/** A grounded player inside where the wall stood, after it broke, leaves the floor. */
export function leavesThroughOpening(
  player: Pick<CharacterState, 'x' | 'isGrounded'>,
  puzzle: BoulderPuzzleLayout,
  boulder: BoulderState,
): boolean {
  if (!boulder.wallBroken || !player.isGrounded) return false;
  const wall: Platform = puzzle.wall;
  // Only the ground and corpses are walkable inside the opening, so any footing there counts.
  return player.x + GAME_CONSTANTS.PLAYER_WIDTH > wall.x && player.x < wall.x + wall.width;
}

/** Subtitle under the floor title: the puzzle floor's way out is the wall, not the ledge. */
export function floorHint(puzzle: BoulderPuzzleLayout | null): string {
  return puzzle ? 'Climb to the boulder and break its gate' : 'Find a way up to the EXIT';
}
