import { CharacterState, GAME_CONSTANTS, VfxEventType, ZombieType } from '@shared/index';
import { GadgetBody, GadgetState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CombatSystem } from './combat-system';
import { DropSystem } from './drop-system';
import {
  BoulderGadget,
  CageGadget,
  CrackWallGadget,
  EXIT_TARGET,
  Gadget,
  IGameEngine,
  LauncherGadget,
  Platform,
} from './engine-types';
import {
  WeighedBoulder,
  WeighedWorld,
  boulderSpeedScale,
  boulderBox,
  boulderResting,
  boulderVictims,
  cageBox,
  cageSolid,
  fallCage,
  slopesOf,
  zombiesIn,
  crackBand,
  crackWallPieces,
  distanceToBox,
  doorSolid,
  freshLaunch,
  inputOn,
  isLauncher,
  isWired,
  launchVelocity,
  launcherLoaded,
  loadKg,
  newGadgetStates,
  onLauncher,
  playerOnLauncher,
  stateOf,
  stepBoulder,
  swingDir,
  swingHits,
  tickDoor,
  tickLauncher,
  tickLauncherClient,
} from './gadgets';
import { LevelLayout } from './level-generator';
import { LoosePropSystem } from './loose-prop-system';
import { VfxSystem } from './vfx-system';
import { knockZombie } from './zombie-knock';
import { wrapAngle } from './prop-tumble';
import { ZombieSystem } from './zombie-system';
import { releaseSpots } from './cage-puzzle';
import { ZombieState } from '@shared/game-entities';

const STONE_COLOR: string = '#b8a888';
const SPARK_COLOR: string = '#ffd166';
const CRUSH_DAMAGE_COLOR: string = '#ffcc66';
const S: number = GAME_CONSTANTS.BOULDER_SIZE_PX;

function clampInt(n: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(n)));
}

/**
 * A designed floor's gadgets (dev level editor; `gadgets.ts` has the rules). The host (or solo)
 * moves the boulders, counts every player's swings (push a boulder, flip a lever, chip a crack
 * band), weighs buttons and scales, carries their signals down the wires, fires the launchers and
 * slides the doors, and breaks crack bands (swings, barrel blasts, fast boulders). Every client
 * makes the gadgets' solids from the synced state; guests launch themselves on a fresh launch.
 */
export class GadgetSystem {
  /** Host: ticks until each gadget takes another swing. */
  private readonly cooldowns: Map<string, number> = new Map<string, number>();
  /** Host: zombies each boulder crushed since it last lay still (each is crushed once a run). */
  private readonly crushed: Map<string, Set<string>> = new Map<string, Set<string>>();

  constructor(
    private readonly e: IGameEngine,
    private readonly combat: CombatSystem,
    private readonly vfx: VfxSystem,
    private readonly props: LoosePropSystem,
    private readonly drops: DropSystem,
    private readonly zombieSystem: ZombieSystem,
  ) {}

  /** New floor (or a new design): every gadget as placed. */
  reset(level: LevelLayout): void {
    this.e.gadgets = structuredClone(level.gadgets ?? []);
    this.e.gadgetStates = newGadgetStates(this.e.gadgets);
    this.cooldowns.clear();
    this.crushed.clear();
    this.placeSolids();
  }

  update(): void {
    if (this.e.gadgets.length === 0) return;
    const players: CharacterState[] = this.players();
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (!state) continue;
      const cooldown: number = this.cooldowns.get(g.id) ?? 0;
      if (cooldown > 0) this.cooldowns.set(g.id, cooldown - 1);
      if (g.kind === 'boulder' && state.body) this.roll(g, state.body, players);
      else if (g.kind === 'crack-wall') this.chip(g, state, players);
      else if (g.kind === 'lever') this.flip(g, state, players);
      else if (g.kind === 'cage') this.hangOrFall(g, state, players);
    }
    const world: WeighedWorld = this.world(players);
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (state && (g.kind === 'button' || g.kind === 'scale')) {
        state.kg = loadKg(g, world);
        state.on = state.kg >= g.kg;
      }
    }
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (!state) continue;
      const input: boolean = inputOn(this.e.gadgets, this.e.gadgetStates, g.id);
      const wired: boolean = isWired(this.e.gadgets, g.id);
      // A door with no wire stands open (a doorway, or a plain exit door).
      if (g.kind === 'door') tickDoor(state, wired ? input : true, g.latch);
      else if (isLauncher(g)) {
        if (tickLauncher(state, wired, input, launcherLoaded(g, world))) this.fire(g);
      } else if (g.kind === 'cage' && wired && input && !state.dropped) {
        this.dropCage(g, state);
      }
    }
    const exit: GadgetState | undefined = stateOf(this.e.gadgetStates, EXIT_TARGET);
    if (exit) tickDoor(exit, inputOn(this.e.gadgets, this.e.gadgetStates, EXIT_TARGET), false);
    this.placeSolids();
  }

  /** Client, every tick between snapshots: boulders roll on, doors slide, launchers settle. */
  tickClient(): void {
    if (this.e.gadgets.length === 0) return;
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (!state) continue;
      if (g.kind === 'boulder' && state.body && !boulderResting(state.body)) {
        stepBoulder(
          state.body,
          this.others(g.id),
          slopesOf(this.e.gadgets),
          this.drops.getEffectiveGravity(),
          (): boolean => false,
        );
      } else if (g.kind === 'cage' && state.body && !state.landed) {
        fallCage(
          state.body,
          g.width,
          g.height,
          this.others(g.id),
          this.drops.getEffectiveGravity(),
        );
      } else if (g.kind === 'door') {
        tickDoor(state, state.on, g.latch);
      } else if (isLauncher(g)) {
        tickLauncherClient(state);
      }
    }
    const exit: GadgetState | undefined = stateOf(this.e.gadgetStates, EXIT_TARGET);
    if (exit) tickDoor(exit, exit.on, false);
    this.placeSolids();
  }

  /** Host: the states to send with a game-sync. */
  snapshot(): GadgetState[] {
    return this.e.gadgetStates.map(
      (s: GadgetState): GadgetState => ({ ...s, body: s.body ? { ...s.body } : null }),
    );
  }

  /**
   * Client: the host's gadget states, validated (numbers clamped, a broken band stays broken). A
   * launch the client just saw throws its own player if it stands on that launcher.
   */
  applyRemote(remote: unknown): void {
    if (!this.e.isMultiplayerClient || !Array.isArray(remote)) return;
    for (const r of remote as unknown[]) {
      if (typeof r !== 'object' || r === null) continue;
      const incoming: Partial<GadgetState> = r as Partial<GadgetState>;
      const state: GadgetState | undefined =
        typeof incoming.id === 'string' ? stateOf(this.e.gadgetStates, incoming.id) : undefined;
      if (!state) continue;
      const before: number = state.launches;
      this.applyState(state, incoming);
      const g: Gadget | undefined = this.e.gadgets.find((x: Gadget): boolean => x.id === state.id);
      const player: CharacterState | null = this.e.player;
      if (g && isLauncher(g) && player && state.launches > before && freshLaunch(state)) {
        if (playerOnLauncher(player, g)) this.throwPlayer(player, g);
      }
    }
    this.placeSolids();
  }

  /** Host: a barrel blew up at `center`: boulders in reach fly off, crack bands in reach break out. */
  blast(center: Point): void {
    const radius: number = GAME_CONSTANTS.BARREL_BLAST_RADIUS_PX;
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (!state) continue;
      if (
        g.kind === 'crack-wall' &&
        !state.broken &&
        distanceToBox(center, crackBand(g)) <= radius
      ) {
        this.breakBand(g, state, Math.sign(g.x + g.width / 2 - center.x) || 1);
      } else if (g.kind === 'cage' && !state.dropped && distanceToBox(center, g) <= radius) {
        this.dropCage(g, state);
      } else if (g.kind === 'boulder' && state.body) {
        const body: GadgetBody = state.body;
        const middle: Point = { x: body.x + S / 2, y: body.y + S / 2 };
        if (Math.hypot(middle.x - center.x, middle.y - center.y) > radius) continue;
        const dir: number = Math.sign(middle.x - center.x) || 1;
        const scale: number = boulderSpeedScale(g.kg);
        body.velocityX = dir * GAME_CONSTANTS.GADGET_BOULDER_BLAST_SPEED_X * scale;
        body.velocityY = GAME_CONSTANTS.GADGET_BOULDER_BLAST_SPEED_Y * scale;
        body.isGrounded = false;
      }
    }
    this.placeSolids();
  }

  /** Every gadget's solids where its state says: resting boulders, crack wall pieces, doors, launcher bases. */
  placeSolids(): void {
    const solids: Platform[] = [];
    for (const g of this.e.gadgets) {
      const state: GadgetState | undefined = stateOf(this.e.gadgetStates, g.id);
      if (!state) continue;
      const add: (box: Box) => void = (box: Box): void => {
        solids.push({ ...box, solid: true, puzzlePart: 'gadget', gadgetId: g.id });
      };
      if (g.kind === 'boulder' && state.body && boulderResting(state.body))
        add(boulderBox(state.body));
      else if (g.kind === 'crack-wall') crackWallPieces(g, state.broken).forEach(add);
      else if (g.kind === 'door') add(doorSolid(g, state));
      else if (isLauncher(g)) add(g);
      else if (g.kind === 'cage') {
        const cage: Box | null = cageSolid(g, state);
        if (cage) add(cage);
      }
    }
    this.e.platforms = [
      ...this.e.platforms.filter((p: Platform): boolean => p.puzzlePart !== 'gadget'),
      ...solids,
    ];
  }

  private applyState(state: GadgetState, r: Partial<GadgetState>): void {
    const num: (v: unknown) => number | null = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    state.on = r.on === true;
    state.kg = clampInt(num(r.kg) ?? state.kg, GAME_CONSTANTS.GADGET_MAX_KG);
    state.hits = clampInt(num(r.hits) ?? state.hits, GAME_CONSTANTS.GADGET_CRACK_HITS);
    state.broken = state.broken || r.broken === true;
    state.landed = state.landed || r.landed === true;
    const dropping: boolean = !state.dropped && r.dropped === true;
    state.dropped = state.dropped || dropping;
    // The host's body arrives below; a cage that just let go gets one to carry it.
    if (dropping && !state.body)
      state.body = { x: 0, y: 0, velocityX: 0, velocityY: 0, isGrounded: false, angle: 0 };
    state.openTicks = clampInt(
      num(r.openTicks) ?? state.openTicks,
      GAME_CONSTANTS.GADGET_DOOR_TICKS,
    );
    state.launches = clampInt(num(r.launches) ?? state.launches, Number.MAX_SAFE_INTEGER);
    state.bounceTicks = clampInt(
      num(r.bounceTicks) ?? state.bounceTicks,
      GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS,
    );
    state.windTicks = clampInt(
      num(r.windTicks) ?? state.windTicks,
      GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS,
    );
    const body: unknown = r.body;
    if (!state.body || typeof body !== 'object' || body === null) return;
    const b: Partial<GadgetBody> = body as Partial<GadgetBody>;
    const x: number | null = num(b.x);
    const y: number | null = num(b.y);
    const vx: number | null = num(b.velocityX);
    const vy: number | null = num(b.velocityY);
    if (x === null || y === null || vx === null || vy === null) return;
    const max: number = GAME_CONSTANTS.GADGET_BOULDER_MAX_SPEED;
    state.body.x = Math.min(GAME_CONSTANTS.CANVAS_WIDTH - S, Math.max(0, x));
    state.body.y = Math.min(GAME_CONSTANTS.GROUND_Y - S, Math.max(0, y));
    state.body.velocityX = Math.min(max, Math.max(-max, vx));
    state.body.velocityY = Math.min(
      GAME_CONSTANTS.TERMINAL_VELOCITY,
      Math.max(-GAME_CONSTANTS.GADGET_LAUNCH_MAX_POWER, vy),
    );
    state.body.isGrounded = b.isGrounded === true;
    state.body.angle = wrapAngle(num(b.angle) ?? 0);
  }

  private players(): CharacterState[] {
    return [...(this.e.player ? [this.e.player] : []), ...this.e.remotePlayers];
  }

  private world(players: CharacterState[]): WeighedWorld {
    return {
      corpses: this.e.zombieCorpses,
      props: this.e.looseProps,
      zombies: this.e.zombies,
      players,
      boulders: this.e.gadgets.flatMap((g: Gadget): WeighedBoulder[] => {
        const body: GadgetBody | null | undefined = stateOf(this.e.gadgetStates, g.id)?.body;
        return g.kind === 'boulder' && body ? [{ body, kg: g.kg }] : [];
      }),
    };
  }

  /** Every platform but this gadget's own solids. */
  private others(id: string): Platform[] {
    return this.e.platforms.filter((p: Platform): boolean => p.gadgetId !== id);
  }

  /** Swings that may land on this gadget now (it took none this swing). */
  private swingers(
    id: string,
    box: Box,
    reach: number,
    players: CharacterState[],
  ): CharacterState | null {
    if ((this.cooldowns.get(id) ?? 0) > 0) return null;
    const swinger: CharacterState | undefined = players.find((p: CharacterState): boolean =>
      swingHits(p, box, reach),
    );
    if (!swinger) return null;
    this.cooldowns.set(id, GAME_CONSTANTS.GADGET_HIT_COOLDOWN_TICKS);
    return swinger;
  }

  /** A boulder: a swing at a still one rolls it away; then it moves, crushes and breaks bands. */
  private roll(g: BoulderGadget, body: GadgetBody, players: CharacterState[]): void {
    const pusher: CharacterState | null = body.isGrounded
      ? this.swingers(g.id, boulderBox(body), GAME_CONSTANTS.GADGET_BOULDER_HIT_REACH_PX, players)
      : null;
    if (pusher) {
      body.velocityX +=
        swingDir(pusher) * GAME_CONSTANTS.GADGET_BOULDER_PUSH_SPEED * boulderSpeedScale(g.kg);
      this.dust(body.x + S / 2, body.y + S / 2, STONE_COLOR);
    }
    // A still one only falls when what held it up is gone.
    if (boulderResting(body)) this.crushed.delete(g.id);
    const dir: number = Math.sign(body.velocityX) || 1;
    stepBoulder(
      body,
      this.others(g.id),
      slopesOf(this.e.gadgets),
      this.drops.getEffectiveGravity(),
      (solid: Platform, speed: number): boolean => this.boulderBreaks(solid, speed, dir),
    );
    this.crush(g.id, boulderVictims(body, this.e.zombies, this.crushedBy(g.id)), dir);
  }

  /** A hanging cage drops at a swing (unwired; wires drop it in `update`); a dropped one falls and lands. */
  private hangOrFall(g: CageGadget, state: GadgetState, players: CharacterState[]): void {
    if (!state.dropped) {
      if (isWired(this.e.gadgets, g.id)) return;
      if (this.swingers(g.id, g, GAME_CONSTANTS.GADGET_HIT_REACH_PX, players))
        this.dropCage(g, state);
      return;
    }
    const body: GadgetBody | null = state.body;
    if (!body || state.landed) return;
    const landed: boolean = fallCage(
      body,
      g.width,
      g.height,
      this.others(g.id),
      this.drops.getEffectiveGravity(),
    );
    this.crush(g.id, zombiesIn(cageBox(g, state), this.e.zombies, this.crushedBy(g.id)), 1);
    if (landed) this.landCage(g, state);
  }

  /** The cage lets go of its chain: from now on it falls (no collision until it lands). */
  private dropCage(g: CageGadget, state: GadgetState): void {
    if (state.dropped) return;
    state.dropped = true;
    state.body = { x: g.x, y: g.y, velocityX: 0, velocityY: 0, isGrounded: false, angle: 0 };
    this.dust(g.x + g.width / 2, g.y, SPARK_COLOR);
    this.placeSolids();
  }

  /** Down: it stands there as a step (or smashes) and lets out what it hid. */
  private landCage(g: CageGadget, state: GadgetState): void {
    state.landed = true;
    state.broken = g.smashes;
    const box: Box = cageBox(g, state);
    const cx: number = box.x + box.width / 2;
    const floor: number = box.y + box.height;
    const playerId: string = this.e.player?.id ?? '';
    if (g.smashes) {
      const gore: boolean = g.content === 'zombies';
      this.vfx.spawnCageSmash(cx, box.y + box.height / 2, gore);
      this.e.pendingVfxEvents.push({
        type: VfxEventType.CageSmash,
        playerId,
        x: cx,
        y: box.y + box.height / 2,
        value: gore ? 1 : 0,
      });
    } else {
      this.vfx.spawnCageLand(cx, floor);
      this.e.pendingVfxEvents.push({ type: VfxEventType.CageLand, playerId, x: cx, y: floor });
    }
    this.placeSolids();
    // What it hid comes out where it smashed, or climbs out on top of the cage left standing.
    const surface: number = g.smashes ? floor : box.y;
    if (g.content === 'zombies') {
      for (const spot of releaseSpots(box, surface, g.zombies)) {
        this.zombieSystem.spawnZombieAt(spot.x, spot.y);
      }
    } else if (g.content === 'loot') {
      this.drops.spawnCageLoot(cx, surface, g.gold);
    }
  }

  private crushedBy(id: string): Set<string> {
    let crushed: Set<string> | undefined = this.crushed.get(id);
    if (!crushed) {
      crushed = new Set<string>();
      this.crushed.set(id, crushed);
    }
    return crushed;
  }

  /** A boulder ran into a crack band fast enough: it breaks out and the boulder goes on through. */
  private boulderBreaks(solid: Platform, speed: number, dir: number): boolean {
    if (speed < GAME_CONSTANTS.GADGET_BOULDER_BREAK_SPEED || !solid.gadgetId) return false;
    const g: Gadget | undefined = this.e.gadgets.find(
      (x: Gadget): boolean => x.id === solid.gadgetId,
    );
    const state: GadgetState | undefined = stateOf(this.e.gadgetStates, solid.gadgetId);
    // A hanging cage it hits hard comes down (and the boulder bounces off it).
    if (g?.kind === 'cage' && state && !state.dropped) {
      this.dropCage(g, state);
      return false;
    }
    if (!g || g.kind !== 'crack-wall' || !state || state.broken) return false;
    const band: Box = crackBand(g);
    if (solid.y !== band.y || solid.height !== band.height) return false;
    this.breakBand(g, state, dir);
    return true;
  }

  /** Zombies under a moving boulder or a falling cage: crushed (once each), knocked `dir`. */
  private crush(id: string, victims: ZombieState[], dir: number): void {
    const crushed: Set<string> = this.crushedBy(id);
    const playerId: string = this.e.player?.id ?? '';
    for (const z of victims) {
      crushed.add(z.id);
      const boss: boolean = z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss;
      const percent: number = boss
        ? GAME_CONSTANTS.GADGET_BOULDER_BOSS_CRUSH_PERCENT
        : GAME_CONSTANTS.GADGET_BOULDER_CRUSH_DAMAGE_PERCENT;
      const damage: number = Math.max(1, Math.ceil((z.maxHp * percent) / 100));
      z.hp -= damage;
      if (!z.magnetPull) {
        knockZombie(
          z,
          dir,
          GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE,
          GAME_CONSTANTS.KNOCKBACK_UP_FORCE,
          GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES,
        );
      }
      const cx: number = z.x + z.instanceWidth / 2;
      const cy: number = z.y + z.instanceHeight / 2;
      this.dust(cx, cy, STONE_COLOR);
      this.vfx.spawnDamageNumber(cx, z.y - 10, damage, false, CRUSH_DAMAGE_COLOR);
      this.e.pendingVfxEvents.push({
        type: VfxEventType.DamageNumber,
        playerId,
        x: cx,
        y: z.y - 10,
        value: damage,
        isCrit: false,
        color: CRUSH_DAMAGE_COLOR,
      });
      if (z.hp <= 0) this.combat.handleZombieDeath(z);
    }
  }

  /** Swings on a crack band (only there) chip it; the last one breaks it out. */
  private chip(g: CrackWallGadget, state: GadgetState, players: CharacterState[]): void {
    if (state.broken) return;
    const band: Box = crackBand(g);
    const swinger: CharacterState | null = this.swingers(
      g.id,
      band,
      GAME_CONSTANTS.GADGET_HIT_REACH_PX,
      players,
    );
    if (!swinger) return;
    state.hits++;
    if (state.hits >= GAME_CONSTANTS.GADGET_CRACK_HITS) {
      this.breakBand(g, state, swingDir(swinger));
      return;
    }
    const side: number = swingDir(swinger) === 1 ? band.x : band.x + band.width;
    this.dust(side, swinger.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, STONE_COLOR);
  }

  private breakBand(g: CrackWallGadget, state: GadgetState, dir: number): void {
    if (state.broken) return;
    state.broken = true;
    state.hits = GAME_CONSTANTS.GADGET_CRACK_HITS;
    const band: Box = crackBand(g);
    this.vfx.spawnCrackBreak(band, dir);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.CrackBreak,
      playerId: this.e.player?.id ?? '',
      x: band.x,
      y: band.y,
      endX: band.x + band.width,
      targetY: band.y + band.height,
      dir,
    });
    this.placeSolids();
  }

  /** A swing flips a lever on or off. */
  private flip(g: Gadget, state: GadgetState, players: CharacterState[]): void {
    if (!this.swingers(g.id, g, GAME_CONSTANTS.GADGET_HIT_REACH_PX, players)) return;
    state.on = !state.on;
    this.dust(g.x + g.width / 2, g.y, SPARK_COLOR);
  }

  /** Throws everything resting on the launcher: corpses, props, boulders and the host's own player. */
  private fire(g: LauncherGadget): void {
    const { vx, vy }: { vx: number; vy: number } = launchVelocity(g);
    for (const c of this.e.zombieCorpses) {
      if (!c.isGrounded || c.carrierId !== null || !onLauncher(c.x, c.width, c.y + c.height, g))
        continue;
      c.velocityX = vx;
      c.velocityY = vy;
      c.isGrounded = false;
    }
    for (const p of this.e.looseProps) {
      if (!p.isGrounded || p.carrierId !== null || !onLauncher(p.x, p.width, p.y + p.height, g))
        continue;
      this.props.launch(p, vx, vy, Math.sign(vx) * 0.1);
    }
    for (const s of this.e.gadgetStates) {
      const b: GadgetBody | null = s.body;
      if (!b || !b.isGrounded || !onLauncher(b.x, S, b.y + S, g)) continue;
      b.velocityX = vx;
      b.velocityY = vy;
      b.isGrounded = false;
    }
    const player: CharacterState | null = this.e.player;
    if (player && playerOnLauncher(player, g)) this.throwPlayer(player, g);
    const cx: number = g.x + g.width / 2;
    const angle: number = g.kind === 'spring' ? 90 : g.angle;
    this.vfx.spawnGadgetLaunch(cx, g.y, angle);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.GadgetLaunch,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: g.y,
      value: angle,
    });
  }

  private throwPlayer(player: CharacterState, g: LauncherGadget): void {
    const { vx, vy }: { vx: number; vy: number } = launchVelocity(g);
    player.velocityX = vx;
    player.velocityY = vy;
    player.isGrounded = false;
  }

  private dust(x: number, y: number, color: string): void {
    this.vfx.spawnHitParticles(x, y, color);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: this.e.player?.id ?? '',
      x,
      y,
      color,
    });
  }
}
