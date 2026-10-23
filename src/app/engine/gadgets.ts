import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import {
  GadgetBody,
  GadgetState,
  LooseProp,
  ZombieCorpse,
  ZombieState,
} from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import {
  ButtonGadget,
  CageGadget,
  CrackWallGadget,
  DoorGadget,
  EXIT_TARGET,
  Gadget,
  GadgetKind,
  LauncherGadget,
  Platform,
  ScaleGadget,
  SlopeGadget,
  SourceGadget,
} from './engine-types';
import { WeighedPlayer } from './spring-puzzle';
import { playerLoadKg, zombieWeightKg } from './weight';

/**
 * Gadget rules for designed floors (dev level editor), free of engine state so the host system,
 * the client, the renderer, the editor and the tests use the same math.
 *
 * Every gadget stands alone. A boulder rolls when a swing pushes it, a blast throws it or a
 * launcher fires it; moving fast it crushes zombies and breaks crack bands. A cracked wall breaks
 * only in its crack band: from swings there, a barrel blast or a fast boulder. Sources (a button
 * or scale weighed down, a lever flipped) send their signal down wires to targets: a spring or
 * slingshot fires as the signal comes on, a door slides open while it is on, a wired exit opens
 * its door. An unwired spring or slingshot fires on its own once something lands on it.
 */

const S: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
const R: number = S / 2;
const W: number = GAME_CONSTANTS.CANVAS_WIDTH;

/** How far the drawn pad sinks while a launcher winds up, and how far it shoots up on release. */
const WIND_PX: number = 6;
const RELEASE_PX: number = 16;
/** How far a boulder's feet may sit from a surface's top and still rest on it. */
const REST_TOLERANCE_PX: number = 2;

export const GADGET_KINDS: GadgetKind[] = [
  'boulder',
  'crack-wall',
  'button',
  'scale',
  'lever',
  'spring',
  'slingshot',
  'door',
  'slope',
  'cage',
];

export function isSource(g: Gadget): g is SourceGadget {
  return g.kind === 'button' || g.kind === 'scale' || g.kind === 'lever';
}

export function isLauncher(g: Gadget): g is LauncherGadget {
  return g.kind === 'spring' || g.kind === 'slingshot';
}

/** Kinds a wire can run to (besides the exit). */
export function isTargetKind(kind: GadgetKind): boolean {
  return kind === 'spring' || kind === 'slingshot' || kind === 'door' || kind === 'cage';
}

/** One wire: from a source to a target id (a gadget or EXIT_TARGET). */
export interface Wire {
  from: SourceGadget;
  to: string;
}

export function wires(gadgets: Gadget[]): Wire[] {
  const out: Wire[] = [];
  for (const g of gadgets) {
    if (!isSource(g)) continue;
    for (const to of g.targets) out.push({ from: g, to });
  }
  return out;
}

/** A wire runs to the exit: the exit gets a door. */
export function exitWired(gadgets: Gadget[]): boolean {
  return wires(gadgets).some((w: Wire): boolean => w.to === EXIT_TARGET);
}

/** Has a wire running to it (a launcher with one fires on the signal, not on its own). */
export function isWired(gadgets: Gadget[], id: string): boolean {
  return wires(gadgets).some((w: Wire): boolean => w.to === id);
}

export function boulderBodyAt(g: Gadget): GadgetBody {
  return { x: g.x, y: g.y, velocityX: 0, velocityY: 0, isGrounded: true, angle: 0 };
}

export function newGadgetState(id: string, body: GadgetBody | null): GadgetState {
  return {
    id,
    on: false,
    kg: 0,
    hits: 0,
    broken: false,
    openTicks: 0,
    launches: 0,
    bounceTicks: 0,
    windTicks: 0,
    body,
    dropped: false,
    landed: false,
  };
}

/** The floor's start: one state per gadget (boulders at rest where placed), plus the exit's door when wired. */
export function newGadgetStates(gadgets: Gadget[]): GadgetState[] {
  const states: GadgetState[] = gadgets.map((g: Gadget): GadgetState => {
    const state: GadgetState = newGadgetState(g.id, g.kind === 'boulder' ? boulderBodyAt(g) : null);
    if (g.kind === 'lever') state.on = g.startsOn;
    return state;
  });
  if (exitWired(gadgets)) states.push(newGadgetState(EXIT_TARGET, null));
  return states;
}

export function stateOf(states: GadgetState[], id: string): GadgetState | undefined {
  return states.find((s: GadgetState): boolean => s.id === id);
}

// ─── Signals ─────────────────────────────────────────────

/** A target's input: on while any source wired to it gives its signal. */
export function inputOn(gadgets: Gadget[], states: GadgetState[], targetId: string): boolean {
  return wires(gadgets).some(
    (w: Wire): boolean => w.to === targetId && stateOf(states, w.from.id)?.on === true,
  );
}

/** The exit has a door (a wire runs to it) that isn't fully open yet. */
export function exitLocked(states: GadgetState[]): boolean {
  const exit: GadgetState | undefined = stateOf(states, EXIT_TARGET);
  return exit !== undefined && exit.openTicks < GAME_CONSTANTS.GADGET_DOOR_TICKS;
}

// ─── Weighing ────────────────────────────────────────────

/** A boulder's body with its weight. */
export interface WeighedBoulder {
  body: GadgetBody;
  kg: number;
}

/** What can rest on a button, scale or launcher. */
export interface WeighedWorld {
  corpses: ZombieCorpse[];
  props: LooseProp[];
  zombies: ZombieState[];
  players: WeighedPlayer[];
  boulders: WeighedBoulder[];
}

/** Something whose center is over `box` and whose bottom is on its top or up to `stack` above it (a pile). */
export function restsOn(
  x: number,
  width: number,
  bottom: number,
  box: Box,
  stack: number,
): boolean {
  const cx: number = x + width / 2;
  return (
    cx >= box.x &&
    cx <= box.x + box.width &&
    bottom <= box.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
    bottom >= box.y - stack
  );
}

function stackOf(g: ButtonGadget | ScaleGadget): number {
  return g.kind === 'button'
    ? GAME_CONSTANTS.GADGET_BUTTON_STACK_PX
    : GAME_CONSTANTS.GADGET_SCALE_STACK_PX;
}

/**
 * Everything on a button or scale now, in kg: lying corpses and props, standing zombies, players
 * (downed ones too) with what they carry, and boulders.
 */
export function loadKg(g: ButtonGadget | ScaleGadget, world: WeighedWorld): number {
  const stack: number = stackOf(g);
  let kg: number = 0;
  for (const c of world.corpses) {
    if (!c.isGrounded || c.carrierId !== null) continue;
    if (restsOn(c.x, c.width, c.y + c.height, g, stack)) kg += zombieWeightKg(c.type);
  }
  for (const p of world.props) {
    if (!p.isGrounded || p.carrierId !== null) continue;
    if (restsOn(p.x, p.width, p.y + p.height, g, stack)) kg += p.weightKg;
  }
  for (const z of world.zombies) {
    if (z.isDead || !z.isGrounded) continue;
    if (restsOn(z.x, z.instanceWidth, z.y + z.instanceHeight, g, stack))
      kg += zombieWeightKg(z.type);
  }
  for (const p of world.players) {
    if (p.isDead || !p.isGrounded || p.isClimbing) continue;
    const bottom: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    if (restsOn(p.x, GAME_CONSTANTS.PLAYER_WIDTH, bottom, g, stack)) {
      kg += playerLoadKg(p.id, world.corpses, world.props);
    }
  }
  for (const b of world.boulders) {
    if (b.body.isGrounded && restsOn(b.body.x, S, b.body.y + S, g, stack)) kg += b.kg;
  }
  return Math.min(GAME_CONSTANTS.GADGET_MAX_KG, kg);
}

/** Where a scale's gauge points: 0 empty, 1 at what it needs or more. */
export function gaugeFraction(g: ScaleGadget, state: GadgetState): number {
  return g.kg > 0 ? Math.min(1, state.kg / g.kg) : 1;
}

// ─── Swings ──────────────────────────────────────────────

/** An attacking player next to `box` (within `reach`, level with it) and facing it hits it. */
export function swingHits(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  box: Box,
  reach: number,
): boolean {
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const top: number = player.y;
  const bottom: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  if (bottom <= box.y || top >= box.y + box.height) return false;
  const gap: number = Math.max(
    0,
    Math.max(box.x - (player.x + width), player.x - (box.x + box.width)),
  );
  if (gap > reach) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(box.x + box.width / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/** The side (-1 or 1) a swing pushes: the way the swinger faces. */
export function swingDir(player: Pick<CharacterState, 'facing'>): number {
  return player.facing === Direction.Right ? 1 : -1;
}

// ─── Cracked wall ────────────────────────────────────────

export function crackBand(g: CrackWallGadget): Box {
  return { x: g.x, y: g.crackTop, width: g.width, height: g.crackBottom - g.crackTop };
}

/** The wall's solid pieces: above the band, the band while it holds, below it. */
export function crackWallPieces(g: CrackWallGadget, broken: boolean): Box[] {
  const pieces: Box[] = [];
  if (g.crackTop > g.y) pieces.push({ x: g.x, y: g.y, width: g.width, height: g.crackTop - g.y });
  if (!broken) pieces.push(crackBand(g));
  const bottom: number = g.y + g.height;
  if (g.crackBottom < bottom) {
    pieces.push({ x: g.x, y: g.crackBottom, width: g.width, height: bottom - g.crackBottom });
  }
  return pieces;
}

/** The nearest distance from a point to a box (0 inside it). */
export function distanceToBox(p: Point, box: Box): number {
  const dx: number = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
  const dy: number = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

// ─── Doors ───────────────────────────────────────────────

export function doorOpenFraction(state: GadgetState): number {
  return state.openTicks / GAME_CONSTANTS.GADGET_DOOR_TICKS;
}

/**
 * A door's solid part now: its shutter slides up into the housing at its top, its foot rising as
 * it opens; the housing (GADGET_DOOR_LINTEL_PX) stays.
 */
export function doorSolid(g: DoorGadget, state: GadgetState): Box {
  const lintel: number = Math.min(g.height, GAME_CONSTANTS.GADGET_DOOR_LINTEL_PX);
  const shutter: number = (g.height - lintel) * (1 - doorOpenFraction(state));
  return { x: g.x, y: g.y, width: g.width, height: Math.round(lintel + shutter) };
}

/** One tick of a door (or the exit's door): it opens while its input is on; a `latch` door stays open once open. */
export function tickDoor(state: GadgetState, input: boolean, latch: boolean): void {
  const held: boolean = latch && state.openTicks >= GAME_CONSTANTS.GADGET_DOOR_TICKS;
  state.on = input;
  state.openTicks = Math.min(
    GAME_CONSTANTS.GADGET_DOOR_TICKS,
    Math.max(0, state.openTicks + (input || held ? 1 : -1)),
  );
}

// ─── Launchers ───────────────────────────────────────────

/** The speed a launcher gives what it throws (a spring straight up). */
export function launchVelocity(g: LauncherGadget): { vx: number; vy: number } {
  if (g.kind === 'spring') return { vx: 0, vy: -g.power };
  const a: number = (g.angle * Math.PI) / 180;
  return { vx: g.power * Math.cos(a), vy: -g.power * Math.sin(a) };
}

/** Something resting on a launcher's top (or piled on it) is thrown when it fires. */
export function onLauncher(x: number, width: number, bottom: number, g: LauncherGadget): boolean {
  return restsOn(x, width, bottom, g, GAME_CONSTANTS.GADGET_BUTTON_STACK_PX);
}

/** A player standing on a launcher (on its top or on what lies on it). */
export function playerOnLauncher(
  player: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead' | 'isDown' | 'isClimbing'>,
  g: LauncherGadget,
): boolean {
  if (player.isDead || player.isDown || player.isClimbing || !player.isGrounded) return false;
  return onLauncher(
    player.x,
    GAME_CONSTANTS.PLAYER_WIDTH,
    player.y + GAME_CONSTANTS.PLAYER_HEIGHT,
    g,
  );
}

/** Anything at all rests on the launcher (an unwired one winds up then). */
export function launcherLoaded(g: LauncherGadget, world: WeighedWorld): boolean {
  return (
    world.corpses.some(
      (c: ZombieCorpse): boolean =>
        c.isGrounded && c.carrierId === null && onLauncher(c.x, c.width, c.y + c.height, g),
    ) ||
    world.props.some(
      (p: LooseProp): boolean =>
        p.isGrounded && p.carrierId === null && onLauncher(p.x, p.width, p.y + p.height, g),
    ) ||
    world.players.some(
      (p: WeighedPlayer): boolean =>
        !p.isDead &&
        p.isGrounded &&
        !p.isClimbing &&
        onLauncher(p.x, GAME_CONSTANTS.PLAYER_WIDTH, p.y + GAME_CONSTANTS.PLAYER_HEIGHT, g),
    ) ||
    world.boulders.some(
      (b: WeighedBoulder): boolean => b.body.isGrounded && onLauncher(b.body.x, S, b.body.y + S, g),
    )
  );
}

/**
 * One host tick of a launcher. A wired one fires as its input comes on; an unwired one fires
 * GADGET_LAUNCH_WIND_TICKS after something lands on it. Never again until its bounce settled.
 * Returns true on the tick it fires (counted here).
 */
export function tickLauncher(
  state: GadgetState,
  wired: boolean,
  input: boolean,
  loaded: boolean,
): boolean {
  const rising: boolean = input && !state.on;
  state.on = input;
  if (state.bounceTicks > 0) {
    state.bounceTicks--;
    state.windTicks = 0;
    return false;
  }
  if (wired) {
    if (!rising) return false;
  } else {
    state.windTicks = loaded ? state.windTicks + 1 : 0;
    if (state.windTicks < GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS) return false;
  }
  state.windTicks = 0;
  state.launches++;
  state.bounceTicks = GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS;
  return true;
}

/** One client tick between snapshots: the bounce settles; the wind-up waits for the host to fire. */
export function tickLauncherClient(state: GadgetState): void {
  if (state.bounceTicks > 0) state.bounceTicks--;
  state.windTicks = Math.min(state.windTicks, GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS - 1);
}

/** A client launches itself only on a launch it just saw happen, not on a bounce it joined late. */
export function freshLaunch(state: GadgetState): boolean {
  return (
    state.bounceTicks >
    GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS - GAME_CONSTANTS.GADGET_LAUNCH_FLING_WINDOW_TICKS
  );
}

/** How far (px, + = down) the drawn pad sits from rest: it sinks winding up, shoots up on release. */
export function padOffset(state: GadgetState): number {
  if (state.windTicks > 0) {
    return Math.round((WIND_PX * state.windTicks) / GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS);
  }
  if (state.bounceTicks > 0) {
    const t: number = GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS - state.bounceTicks;
    const decay: number = state.bounceTicks / GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS;
    return Math.round(-RELEASE_PX * Math.cos(t * 0.45) * decay);
  }
  return 0;
}

// ─── Boulder ─────────────────────────────────────────────

/**
 * How much faster (> 1) or slower a boulder of `kg` moves off the same swing or blast than one of
 * the usual weight, within GADGET_BOULDER_SPEED_SCALE_MIN..MAX.
 */
export function boulderSpeedScale(kg: number): number {
  const scale: number = GAME_CONSTANTS.GADGET_BOULDER_KG / Math.max(1, kg);
  return Math.min(
    GAME_CONSTANTS.GADGET_BOULDER_SPEED_SCALE_MAX,
    Math.max(GAME_CONSTANTS.GADGET_BOULDER_SPEED_SCALE_MIN, scale),
  );
}

export function boulderBox(body: GadgetBody): Box {
  return { x: body.x, y: body.y, width: S, height: S };
}

export function boulderSpeed(body: GadgetBody): number {
  return Math.hypot(body.velocityX, body.velocityY);
}

/** At rest on something: solid (stood on, walked into), weighing on what it lies on. */
export function boulderResting(body: GadgetBody): boolean {
  return body.isGrounded && body.velocityX === 0;
}

/** A solid the boulder ran into this tick, and how fast. */
export interface BoulderImpact {
  solid: Platform;
  speed: number;
}

/**
 * Whether the boulder breaks through `solid` (a crack band) at `speed`: then it keeps going
 * (slowed) instead of bouncing back.
 */
export type BreaksThrough = (solid: Platform, speed: number) => boolean;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The top of something under the boulder's middle that its bottom rests on now, or null. */
function supportUnder(body: GadgetBody, platforms: Platform[]): Platform | null {
  const cx: number = body.x + R;
  const bottom: number = body.y + S;
  for (const p of platforms) {
    if (cx < p.x || cx > p.x + p.width) continue;
    if (Math.abs(bottom - p.y) <= REST_TOLERANCE_PX) return p;
  }
  return null;
}

/**
 * One tick of a boulder (`platforms` without its own solid): it rolls along what it lies on
 * (friction), falls off edges, flies (gravity, air drag), lands (bouncing when hard), and bounces
 * off solids and the screen sides. Returns every solid it ran into; `breaks` lets it through a
 * crack band it breaks.
 */
export function stepBoulder(
  body: GadgetBody,
  platforms: Platform[],
  slopes: SlopeSurface[],
  gravity: number,
  breaks: BreaksThrough,
): BoulderImpact[] {
  const impacts: BoulderImpact[] = [];
  const max: number = GAME_CONSTANTS.GADGET_BOULDER_MAX_SPEED;
  const bounce: number = GAME_CONSTANTS.GADGET_BOULDER_BOUNCE;
  const slope: SlopeSurface | null = body.isGrounded
    ? slopeHolding(slopes, body.x, S, body.y + S, body.velocityX)
    : null;
  if (body.isGrounded && !slope && !supportUnder(body, platforms)) body.isGrounded = false;
  if (slope) {
    // Down a slope it gathers speed: the sideways part of gravity along it.
    const k: number = slopeGrade(slope);
    body.velocityX += (gravity * k) / (1 + k * k);
  }
  body.velocityX = Math.min(max, Math.max(-max, body.velocityX));

  // Sideways: the screen sides and solids level with it stop it (a crack band it breaks does not).
  const prevX: number = body.x;
  body.x += body.velocityX;
  if (body.x < 0 || body.x > W - S) {
    body.x = Math.min(W - S, Math.max(0, body.x));
    body.velocityX = -body.velocityX * bounce;
  }
  for (const s of platforms) {
    if (!s.solid) continue;
    const box: Box = boulderBox(body);
    if (!overlaps(box, s) || body.y + S <= s.y + REST_TOLERANCE_PX) continue;
    // Already inside before this move (it landed on its corner): let it roll on out.
    if (overlaps({ ...box, x: prevX }, s)) continue;
    const speed: number = Math.abs(body.velocityX);
    impacts.push({ solid: s, speed });
    if (breaks(s, speed)) {
      body.velocityX *= 0.7;
      continue;
    }
    body.x = prevX + R <= s.x + s.width / 2 ? s.x - S : s.x + s.width;
    body.velocityX = -body.velocityX * bounce;
  }

  if (body.isGrounded) {
    body.velocityX *= GAME_CONSTANTS.GADGET_BOULDER_ROLL_FRICTION;
    if (Math.abs(body.velocityX) < 0.05) body.velocityX = 0;
    if (slope) followSlope(body, slope);
  } else {
    fly(body, platforms, slopes, gravity, breaks, impacts);
  }
  body.angle += (body.x - prevX) / R;
  return impacts;
}

/** On a slope the boulder keeps to its surface; past its end it flies on with the slope's lift. */
function followSlope(body: GadgetBody, slope: SlopeSurface): void {
  const top: number | null = slopeY(slope, body.x + R);
  if (top === null) {
    body.isGrounded = false;
    body.velocityY = body.velocityX * slopeGrade(slope);
    return;
  }
  body.y = top - S;
  body.velocityY = 0;
}

function fly(
  body: GadgetBody,
  platforms: Platform[],
  slopes: SlopeSurface[],
  gravity: number,
  breaks: BreaksThrough,
  impacts: BoulderImpact[],
): void {
  body.velocityX *= GAME_CONSTANTS.GADGET_BOULDER_AIR_DRAG;
  body.velocityY = Math.min(body.velocityY + gravity, GAME_CONSTANTS.TERMINAL_VELOCITY);
  const prevY: number = body.y;
  body.y += body.velocityY;
  const left: number = body.x;
  const right: number = body.x + S;
  if (body.velocityY < 0) {
    // Rising into a solid's underside: it stops there.
    for (const s of platforms) {
      if (!s.solid || right <= s.x || left >= s.x + s.width) continue;
      const underside: number = s.y + s.height;
      if (prevY < underside || body.y >= underside) continue;
      impacts.push({ solid: s, speed: -body.velocityY });
      if (breaks(s, -body.velocityY)) continue;
      body.y = underside;
      body.velocityY = 0;
    }
    return;
  }
  const cx: number = body.x + R;
  const prevBottom: number = prevY + S;
  const bottom: number = body.y + S;
  let landing: Platform | null = null;
  for (const p of platforms) {
    if (cx < p.x || cx > p.x + p.width) continue;
    if (bottom < p.y || prevBottom > p.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE) continue;
    if (!landing || p.y < landing.y) landing = p;
  }
  let top: number | null = landing ? landing.y : null;
  for (const s of slopes) {
    const sy: number | null = slopeY(s, cx);
    if (sy === null || bottom < sy || prevBottom > sy + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE)
      continue;
    if (top === null || sy < top) {
      top = sy;
      landing = null;
    }
  }
  if (top === null) return;
  const speed: number = body.velocityY;
  if (landing?.solid) {
    impacts.push({ solid: landing, speed });
    if (breaks(landing, speed)) return;
  }
  body.y = top - S;
  if (speed > GAME_CONSTANTS.GADGET_BOULDER_BOUNCE_MIN_SPEED) {
    body.velocityY = -speed * GAME_CONSTANTS.GADGET_BOULDER_BOUNCE;
    return;
  }
  body.velocityY = 0;
  body.isGrounded = true;
}

/** Live zombies a moving boulder overlaps that it hasn't crushed yet. */
export function boulderVictims(
  body: GadgetBody,
  zombies: ZombieState[],
  crushed: Set<string>,
): ZombieState[] {
  if (boulderSpeed(body) < GAME_CONSTANTS.GADGET_BOULDER_CRUSH_SPEED) return [];
  return zombiesIn(boulderBox(body), zombies, crushed);
}

/** Live zombies `box` overlaps that are not in `crushed` yet (a falling cage crushes these). */
export function zombiesIn(box: Box, zombies: ZombieState[], crushed: Set<string>): ZombieState[] {
  return zombies.filter(
    (z: ZombieState): boolean =>
      !z.isDead &&
      !crushed.has(z.id) &&
      overlaps(box, { x: z.x, y: z.y, width: z.instanceWidth, height: z.instanceHeight }),
  );
}

/**
 * Where a boulder thrown from `start` (its center) at (vx, vy) flies, one point per tick, until it
 * comes down to `floorY` or `ticks` run out: the editor draws a slingshot's or spring's aim with it.
 */
export function flightPath(
  start: Point,
  vx: number,
  vy: number,
  ticks: number,
  floorY: number,
): Point[] {
  const points: Point[] = [];
  let x: number = start.x;
  let y: number = start.y;
  let speedX: number = vx;
  let speedY: number = vy;
  for (let t: number = 0; t < ticks; t++) {
    speedX *= GAME_CONSTANTS.GADGET_BOULDER_AIR_DRAG;
    speedY = Math.min(speedY + GAME_CONSTANTS.GRAVITY, GAME_CONSTANTS.TERMINAL_VELOCITY);
    x += speedX;
    y += speedY;
    if (x < R || x > W - R) break;
    points.push({ x, y });
    if (speedY > 0 && y + R >= floorY) break;
  }
  return points;
}

// ─── Slopes ──────────────────────────────────────────────

/** A slope's walkable line, left end to right end. */
export interface SlopeSurface {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function slopeSurface(g: SlopeGadget): SlopeSurface {
  const bottom: number = g.y + g.height;
  return g.risesRight
    ? { x0: g.x, y0: bottom, x1: g.x + g.width, y1: g.y }
    : { x0: g.x, y0: g.y, x1: g.x + g.width, y1: bottom };
}

export function slopesOf(gadgets: Gadget[]): SlopeSurface[] {
  return gadgets
    .filter((g: Gadget): g is SlopeGadget => g.kind === 'slope')
    .map((g: SlopeGadget): SlopeSurface => slopeSurface(g));
}

/** How much the surface drops per px to the right (negative: it rises). */
export function slopeGrade(s: SlopeSurface): number {
  return (s.y1 - s.y0) / Math.max(1, s.x1 - s.x0);
}

/** The surface's height at x, or null past its ends. */
export function slopeY(s: SlopeSurface, x: number): number | null {
  if (x < s.x0 || x > s.x1) return null;
  return s.y0 + (x - s.x0) * slopeGrade(s);
}

/**
 * The slope something resting there (its box x..x+width, bottom at `bottom`, moving `vx`) keeps
 * to: its bottom is on the surface under its middle, give or take the stick (more on steep ones).
 */
export function slopeHolding(
  slopes: SlopeSurface[],
  x: number,
  width: number,
  bottom: number,
  vx: number,
): SlopeSurface | null {
  const cx: number = x + width / 2;
  for (const s of slopes) {
    const top: number | null = slopeY(s, cx);
    const stick: number = GAME_CONSTANTS.GADGET_SLOPE_STICK_PX + Math.abs(slopeGrade(s) * vx);
    if (top !== null && Math.abs(bottom - top) <= stick) return s;
  }
  return null;
}

/**
 * Where a falling or walking body (box x..x+width) stands on a slope this tick, or null: it lands
 * on one it came down onto, or, `wasGrounded`, keeps to the one it walks along (one-way: never
 * from below).
 */
export function slopeTopUnder(
  slopes: SlopeSurface[],
  x: number,
  width: number,
  bottom: number,
  vx: number,
  vy: number,
  wasGrounded: boolean,
): number | null {
  if (vy < 0) return null;
  const cx: number = x + width / 2;
  const prevBottom: number = bottom - vy;
  let best: number | null = null;
  for (const s of slopes) {
    const top: number | null = slopeY(s, cx);
    if (top === null) continue;
    const lands: boolean =
      bottom >= top && prevBottom <= top + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE;
    const stick: number = GAME_CONSTANTS.GADGET_SLOPE_STICK_PX + Math.abs(slopeGrade(s) * vx);
    const keeps: boolean = wasGrounded && Math.abs(bottom - top) <= stick;
    if ((lands || keeps) && (best === null || top < best)) best = top;
  }
  return best;
}

// ─── Cages ───────────────────────────────────────────────

/** Where a cage is now: hanging where placed, or falling / landed (its body). */
export function cageBox(g: CageGadget, state: GadgetState): Box {
  return state.body ? { x: state.body.x, y: state.body.y, width: g.width, height: g.height } : g;
}

/** A cage's solid: while it hangs, and where it landed unless it smashed; none while it falls. */
export function cageSolid(g: CageGadget, state: GadgetState): Box | null {
  if (!state.dropped) return g;
  return state.landed && !state.broken ? cageBox(g, state) : null;
}

/**
 * One tick of a falling cage (box `width` x `height`): it drops (gravity) onto the highest thing
 * under any part of it. Returns true on the tick it lands.
 */
export function fallCage(
  body: GadgetBody,
  width: number,
  height: number,
  platforms: Platform[],
  gravity: number,
): boolean {
  body.velocityY = Math.min(body.velocityY + gravity, GAME_CONSTANTS.TERMINAL_VELOCITY);
  const prevBottom: number = body.y + height;
  body.y += body.velocityY;
  const bottom: number = body.y + height;
  let top: number | null = null;
  for (const p of platforms) {
    if (body.x + width <= p.x || body.x >= p.x + p.width) continue;
    if (bottom < p.y || prevBottom > p.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE) continue;
    if (top === null || p.y < top) top = p.y;
  }
  if (top === null) return false;
  body.y = top - height;
  body.velocityY = 0;
  body.isGrounded = true;
  return true;
}

// ─── Exit doors ──────────────────────────────────────────

/** A grounded player standing in a fully open exit door (feet on its foot, middle within it). */
export function inExitDoor(
  g: DoorGadget,
  state: GadgetState,
  p: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>,
): boolean {
  if (!g.exit || p.isDead || !p.isGrounded) return false;
  if (state.openTicks < GAME_CONSTANTS.GADGET_DOOR_TICKS) return false;
  const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const feet: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  return (
    cx >= g.x &&
    cx <= g.x + g.width &&
    Math.abs(feet - (g.y + g.height)) <= GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE
  );
}

export function leavesThroughDoor(
  gadgets: Gadget[],
  states: GadgetState[],
  p: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>,
): boolean {
  return gadgets.some((g: Gadget): boolean => {
    const state: GadgetState | undefined = stateOf(states, g.id);
    return g.kind === 'door' && state !== undefined && inExitDoor(g, state, p);
  });
}

// ─── Wires ───────────────────────────────────────────────

/** Where a wire leaves a gadget or reaches it: the middle of its top. */
export function wireEnd(box: Box): Point {
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y) };
}

/** A wire's run, like the indicator dots on a test chamber's floor: across, then up or down. */
export function wirePath(from: Box, to: Box): Point[] {
  const a: Point = wireEnd(from);
  const b: Point = wireEnd(to);
  return [a, { x: b.x, y: a.y }, b];
}

/** Points every `spacing` px along a path of straight runs (the wire's dots). */
export function dotsAlong(path: Point[], spacing: number): Point[] {
  const dots: Point[] = [];
  let carry: number = 0;
  for (let i: number = 0; i < path.length - 1; i++) {
    const a: Point = path[i];
    const b: Point = path[i + 1];
    const length: number = Math.hypot(b.x - a.x, b.y - a.y);
    let d: number = carry;
    while (d <= length) {
      const t: number = length > 0 ? d / length : 0;
      dots.push({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });
      d += spacing;
    }
    carry = d - length;
  }
  return dots;
}
