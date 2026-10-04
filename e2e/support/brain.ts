import { Locator } from '@playwright/test';
import { GamePlayer, KEYS } from './game-player';
import {
  E2eCorpseView,
  E2eDropView,
  E2eRemotePlayerView,
  E2eSkillView,
  E2eSnapshot,
  E2eZombieView,
} from './probe';
import { WORLD } from './invariants';
import { LevelPlatform, currentPlatform, platformUnder, stepToward } from './navigation';

/**
 * A player that tries to play well, through real key presses only.
 *
 * Priorities every decision tick (highest first):
 *   drink potions → flee when low and out of potions → revive a downed teammate when safe →
 *   break out of a surround → fight (melee trades during i-frames, ranged classes kite) →
 *   loot → spend stat/skill points → shop for potions → regroup with the teammate.
 *
 * Game facts it relies on (shared/game-constants.ts): zombie melee reach 35 px, zombie attack
 * cooldown 40–70 ticks, 90 ticks of player invincibility after a hit, potion cooldown 30 ticks,
 * HP potion +50 for 30 gold, revive = hold F for 150 ticks within 60 px (damage cancels it).
 */

export interface BrainOptions {
  deadline: number;
  /** Buy potions from the shop when calm (default true). */
  shop?: boolean;
  /**
   * 'exit' (default): hold the platform under the exit, slay zombies in the beam to build the
   * corpse stack, then climb it to the next floor. 'fight': just fight wherever zombies are.
   */
  goal?: 'exit' | 'fight';
  /** Stop early when this returns true. */
  stopWhen?: (s: E2eSnapshot) => boolean;
  log?: (message: string) => void;
}

export interface BrainStats {
  kills: number;
  attacks: number;
  skillCasts: number;
  potionsUsed: number;
  potionsBought: number;
  retreats: number;
  revives: number;
  pickups: number;
  statSpends: number;
  skillSpends: number;
  downs: number;
}

interface Threat {
  z: E2eZombieView;
  /** Zombie center minus player center (px, + = zombie is to the right). */
  dx: number;
  /** Zombie feet minus player feet (px, - = zombie stands higher). */
  dy: number;
  dist: number;
  sameLevel: boolean;
}

type Move = -1 | 0 | 1;

const TICK_MS: number = 100;
const SAME_LEVEL_PX: number = 70;
const MELEE_REACH_PX: number = 42;
const RANGED_REACH_PX: number = 150;
const RANGED_COMFORT_PX: number = 110;
const HP_POTION_ID: string = 'hp-potion-1';
const MP_POTION_ID: string = 'mp-potion-1';
const HP_POTION_PRICE: number = 30;
const MP_POTION_PRICE: number = 20;
const DRINK_HP_BELOW: number = 0.55;
/** Assumed damage per adjacent zombie hit, for "can the next burst kill me?" (floor-1 zombies hit 24–85). */
const BURST_PER_ZOMBIE: number = 70;
const FLEE_HP_BELOW: number = 0.3;
/** Stop fleeing once back above this (hysteresis, so it does not flip every tick). */
const RESUME_HP_ABOVE: number = 0.45;
const POTION_STOCK_TARGET: number = 10;
/** Classes with MP-costing skills keep this many MP potions (the game has no MP regen). */
const MP_POTION_STOCK_TARGET: number = 5;
/** Skill-point order by id keyword: auto-potion first (drinks for you), then damage, then buffs. */
const SKILL_PRIORITY: string[] = [
  'power-strike',
  'lucky-seven',
  'slash-blast',
  'dragon-roar',
  'monster-magnet',
  'hyper-body',
  'power-stance',
  'claw-mastery',
  'magic-twin',
  'power-dash',
  'dark-sight',
  'double-jump',
  'hp-recovery',
  'auto-potion',
];
const PASSIVE_KEYWORDS: string[] = ['auto-potion', 'hp-recovery', 'mastery'];
const DAMAGE_KEYWORDS: string[] = ['power-strike', 'lucky-seven', 'slash-blast', 'dragon-roar'];
/** Highest foothold one jump reaches (single jump ~116 px). */
const CLIMB_REACH_PX: number = 105;

interface Foothold {
  /** Center x. */
  x: number;
  y: number;
  width: number;
}

const RANGED_CLASSES: Set<string> = new Set<string>(['assassin']);

export function newBrainStats(): BrainStats {
  return {
    kills: 0,
    attacks: 0,
    skillCasts: 0,
    potionsUsed: 0,
    potionsBought: 0,
    retreats: 0,
    revives: 0,
    pickups: 0,
    statSpends: 0,
    skillSpends: 0,
    downs: 0,
  };
}

function threatsOf(s: E2eSnapshot): Threat[] {
  const p: E2eSnapshot['player'] = s.player;
  if (!p) return [];
  const pcx: number = p.x + WORLD.playerWidth / 2;
  const pFeet: number = p.y + WORLD.playerHeight;
  return s.zombies
    .filter((z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0)
    .map((z: E2eZombieView): Threat => {
      const dx: number = z.x + z.width / 2 - pcx;
      const dy: number = z.y + z.height - pFeet;
      return { z, dx, dy, dist: Math.hypot(dx, dy), sameLevel: Math.abs(dy) < SAME_LEVEL_PX };
    })
    .sort((a: Threat, b: Threat): number => a.dist - b.dist);
}

export class Brain {
  readonly stats: BrainStats = newBrainStats();
  private move: Move = 0;
  private attacking: boolean = false;
  private lastShopAt: number = 0;
  private lastPointsAt: number = 0;
  private wasDown: boolean = false;
  private retreating: boolean = false;
  private readonly everSeen: Set<string> = new Set<string>();
  private lastDrinkAt: number = 0;
  private climbing: boolean = false;
  private lastClimbLogAt: number = 0;
  private lastX: number = 0;
  private blockedTicks: number = 0;

  constructor(
    private readonly me: GamePlayer,
    private readonly options: BrainOptions,
  ) {}

  async run(): Promise<void> {
    while (Date.now() < this.options.deadline) {
      if (await this.me.probe.isGameOver()) break;
      const s: E2eSnapshot = await this.me.probe.state();
      this.countKills(s);
      if (this.options.stopWhen?.(s)) break;
      if (await this.hopIfBlocked(s)) continue;
      await this.decide(s);
      await this.me.wait(TICK_MS);
    }
    await this.stop();
  }

  /**
   * Solid props block walking: if a held direction key moves us nowhere for a few ticks while
   * grounded, hop over whatever is in the way (players do the same).
   */
  private async hopIfBlocked(s: E2eSnapshot): Promise<boolean> {
    const p: E2eSnapshot['player'] = s.player;
    if (!p) return false;
    const walking: boolean = this.me.isHolding(KEYS.left) || this.me.isHolding(KEYS.right);
    const stalled: boolean = walking && p.isGrounded && !p.isClimbing && Math.abs(p.x - this.lastX) < 0.5;
    this.lastX = p.x;
    this.blockedTicks = stalled ? this.blockedTicks + 1 : 0;
    if (this.blockedTicks < 3) return false;
    this.blockedTicks = 0;
    await this.fullJump();
    return true;
  }

  private log(message: string): void {
    this.options.log?.(`${this.me.name}: ${message}`);
  }

  /**
   * Team kills = zombies ever seen minus zombies alive now. Robust to the client's zombie
   * list flickering between snapshots (counting disappearances double-counts those).
   */
  private countKills(s: E2eSnapshot): void {
    const alive: E2eZombieView[] = s.zombies.filter((z: E2eZombieView): boolean => !z.isDead);
    for (const z of alive) this.everSeen.add(z.id);
    this.stats.kills = this.everSeen.size - alive.length;
  }

  private async decide(s: E2eSnapshot): Promise<void> {
    const p: E2eSnapshot['player'] = s.player;
    if (!p) return;
    if (p.isDown || p.isDead) {
      if (!this.wasDown) {
        this.stats.downs++;
        this.log(`went down on floor ${s.floor}`);
      }
      this.wasDown = true;
      await this.stop();
      return;
    }
    this.wasDown = false;

    if (await this.closeStrayDialogs()) return;

    if (s.hasPendingSpecialDrop) {
      // Picked-up special drops wait for Y/N (with a timeout): always take the buff.
      await this.me.press('y', 70);
      this.log('activated a special drop');
      return;
    }

    const hpPct: number = p.hp / p.maxHp;
    const threats: Threat[] = threatsOf(s);
    const near: Threat[] = threats.filter(
      (t: Threat): boolean => t.sameLevel && Math.abs(t.dx) < 140,
    );

    const adjacent: number = near.filter((t: Threat): boolean => Math.abs(t.dx) < 60).length;
    if (await this.drinkIfNeeded(s, hpPct, adjacent)) return;

    const hpPotions: number = p.potions[HP_POTION_ID] ?? 0;
    const potionReady: boolean = hpPotions > 0 && s.potionCooldownTicks === 0;
    const mustFlee: boolean = hpPct < FLEE_HP_BELOW && near.length > 0 && !potionReady;
    const keepFleeing: boolean = this.retreating && hpPct < RESUME_HP_ABOVE && !potionReady;
    if (mustFlee || keepFleeing) {
      const nearest: number = threats.length > 0 ? threats[0].dist : Infinity;
      if (hpPotions === 0 && nearest > 90 && (await this.shop(s, true))) return;
      await this.flee(s, threats);
      return;
    }
    if (this.retreating) {
      this.retreating = false;
      this.log(`back in the fight at ${Math.round(hpPct * 100)}% hp`);
    }

    if (await this.reviveIfSafe(s, threats)) return;
    // A finished stack is the way out: the beam steadies climbers, so don't run from the crowd.
    const climbOut: boolean = (this.options.goal ?? 'exit') === 'exit' && s.exitStack.reachable;
    if (!climbOut && (await this.escapeSurround(s, near))) return;

    // Menus don't pause the game: only open them with nobody in striking distance.
    const calm: boolean = threats.length === 0 || threats[0].dist > 200;
    if (calm && (await this.spendPoints(s))) return;
    if (calm && (await this.shop(s, false))) return;

    if ((this.options.goal ?? 'exit') === 'exit' && (await this.pursueExit(s, threats))) return;

    if (threats.length > 0 && threats[0].dist < 420) {
      await this.fight(s, threats);
      return;
    }

    await this.setAttack(false);
    if (await this.loot(s)) return;
    await this.regroup(s);
  }

  // ── Survival ─────────────────────────────────────────────

  /**
   * Any open menu disables game input, so a menu left open means standing still while
   * zombies hit you. Close it (and log which one, to find the brain step that leaked it).
   */
  private async closeStrayDialogs(): Promise<boolean> {
    const open: string | null = await this.me.page.evaluate((): string | null => {
      const el: Element | null = document.querySelector(
        'app-shop, app-stat-allocation, app-skill-tree, app-inventory, .settings-overlay, .dev-dialog',
      );
      return el
        ? el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : '')
        : null;
    });
    if (!open) return false;
    this.log(`closing stray dialog ${open}`);
    await this.stop();
    await this.me.page.keyboard.press('Escape');
    return true;
  }

  private async drinkIfNeeded(s: E2eSnapshot, hpPct: number, adjacent: number): Promise<boolean> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    if (s.potionCooldownTicks > 0 || Date.now() - this.lastDrinkAt < 700) return false;
    const burstCouldKill: boolean =
      hpPct < 0.8 && adjacent > 0 && p.hp <= BURST_PER_ZOMBIE * (adjacent + 1);
    const drinkHp: boolean =
      (hpPct < DRINK_HP_BELOW || burstCouldKill) && (p.potions[HP_POTION_ID] ?? 0) > 0;
    const drinkMp: boolean =
      !drinkHp &&
      s.usableSkills.length > 0 &&
      p.mp / p.maxMp < 0.25 &&
      (p.potions[MP_POTION_ID] ?? 0) > 0;
    if (!drinkHp && !drinkMp) return false;
    this.lastDrinkAt = Date.now();
    const potionId: string = drinkHp ? HP_POTION_ID : MP_POTION_ID;
    // Hold long enough for a 20 ms engine tick to see the key (a bare press() can slip between ticks).
    await this.me.press(drinkHp ? KEYS.hpPotion : KEYS.mpPotion, 70);
    const after: E2eSnapshot = await this.me.probe.state();
    const used: boolean = (after.player?.potions[potionId] ?? 0) < (p.potions[potionId] ?? 0);
    if (used) {
      this.stats.potionsUsed++;
      this.log(`drank ${potionId} at ${p.hp}/${p.maxHp} hp, ${p.mp}/${p.maxMp} mp`);
    }
    return used;
  }

  /** Runs away from the weighted mass of nearby zombies; jumps over one when cornered. */
  private async flee(s: E2eSnapshot, threats: Threat[]): Promise<void> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    if (!this.retreating) {
      this.retreating = true;
      this.stats.retreats++;
      this.log(`retreating at ${p.hp}/${p.maxHp} hp, no potion ready`);
    }
    await this.setAttack(false);
    let push: number = 0;
    for (const t of threats) {
      if (!t.sameLevel || Math.abs(t.dx) > 350) continue;
      push -= Math.sign(t.dx || 1) / Math.max(Math.abs(t.dx), 20);
    }
    let dir: Move = push >= 0 ? 1 : -1;
    const cornered: boolean = (dir === -1 && p.x < 70) || (dir === 1 && p.x > WORLD.width - 110);
    if (cornered) dir = dir === 1 ? -1 : 1;
    await this.setMove(dir);
    const blocking: boolean = threats.some(
      (t: Threat): boolean => t.sameLevel && Math.sign(t.dx) === dir && Math.abs(t.dx) < 60,
    );
    if ((blocking || cornered) && p.isGrounded) await this.me.press(KEYS.jump, 90);
  }

  private async escapeSurround(s: E2eSnapshot, near: Threat[]): Promise<boolean> {
    const left: Threat[] = near.filter((t: Threat): boolean => t.dx < 0 && t.dx > -65);
    const right: Threat[] = near.filter((t: Threat): boolean => t.dx > 0 && t.dx < 65);
    if (left.length === 0 || right.length === 0 || s.invincibilityFrames > 20) return false;
    const dir: Move = left.length <= right.length ? -1 : 1;
    await this.setAttack(false);
    await this.setMove(dir);
    if (s.player!.isGrounded) await this.me.press(KEYS.jump, 90);
    return true;
  }

  // ── Co-op ────────────────────────────────────────────────

  private async reviveIfSafe(s: E2eSnapshot, threats: Threat[]): Promise<boolean> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const downed: E2eRemotePlayerView | undefined = s.remotePlayers.find(
      (r: E2eRemotePlayerView): boolean => r.isDown,
    );
    if (!downed) {
      await this.me.release(KEYS.revive);
      return false;
    }
    // The 3 s channel is cancelled by any hit: only start when nothing can reach us.
    const aroundTeammate: Threat[] = threats.filter(
      (t: Threat): boolean =>
        Math.abs(t.z.x + t.z.width / 2 - (downed.x + 16)) < 90 && Math.abs(t.dy) < 120,
    );
    const aroundMe: Threat[] = threats.filter(
      (t: Threat): boolean => t.sameLevel && Math.abs(t.dx) < 70,
    );
    const safeEnough: boolean = aroundTeammate.length === 0 && aroundMe.length === 0;
    if (!safeEnough) {
      await this.me.release(KEYS.revive);
      // Clear the zombies on the teammate first: fight() prefers them.
      return false;
    }
    await this.setAttack(false);
    const dx: number = downed.x - p.x;
    if (Math.abs(dx) > 30) {
      await this.me.release(KEYS.revive);
      await this.setMove(dx > 0 ? 1 : -1);
      if (downed.y + 20 < p.y && p.isGrounded) await this.me.press(KEYS.jump, 90);
    } else {
      await this.setMove(0);
      if (!this.me.isHolding(KEYS.revive)) this.log(`reviving teammate`);
      await this.me.hold(KEYS.revive);
      const after: E2eSnapshot = await this.me.probe.state();
      const still: E2eRemotePlayerView | undefined = after.remotePlayers.find(
        (r: E2eRemotePlayerView): boolean => r.id === downed.id,
      );
      if (still && !still.isDown && !still.isDead) {
        this.stats.revives++;
        this.log('teammate revived');
        await this.me.release(KEYS.revive);
      }
    }
    return true;
  }

  private async regroup(s: E2eSnapshot): Promise<void> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const mate: E2eRemotePlayerView | undefined = s.remotePlayers.find(
      (r: E2eRemotePlayerView): boolean => !r.isDead,
    );
    if (!mate || Math.abs(mate.x - p.x) < 180) {
      await this.setMove(0);
      return;
    }
    await this.setMove(mate.x > p.x ? 1 : -1);
  }

  // ── Exit (corpse stack in the beam) ──────────────────────

  /**
   * Go to the platform under the exit and fight there so kills land in the beam; once the
   * stack reaches the target line, climb it. Returns false when fighting elsewhere is better.
   */
  private async pursueExit(s: E2eSnapshot, threats: Threat[]): Promise<boolean> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const stack: E2eSnapshot['exitStack'] = s.exitStack;
    const base: LevelPlatform = platformUnder(s, stack.centerX, stack.baseY);
    const here: LevelPlatform | null = currentPlatform(s);
    const cx: number = p.x + WORLD.playerWidth / 2;
    const closeThreat: Threat | undefined = threats.find(
      (t: Threat): boolean => t.sameLevel && Math.abs(t.dx) < 70,
    );
    const inColumn: boolean = cx > stack.columnLeft + 6 && cx < stack.columnRight - 6;

    if (stack.reachable) {
      if (!this.climbing) {
        this.climbing = true;
        this.log(`stack ready (${stack.steps} steps) — climbing to the exit`);
        this.log(
          `footholds: ${s.corpseViews
            .filter((c: E2eCorpseView): boolean => c.anchored)
            .map((c: E2eCorpseView): string => `[${Math.round(c.footX)}+${Math.round(c.footWidth)} @${Math.round(c.footY)}${c.isGrounded ? '' : ' air'}]`)
            .join(' ')}`,
        );
      }
      // Don't fight the crowd at the base: fighting and aligning pull opposite ways. Jumping onto
      // the stack is the escape (the beam steadies climbers).
      await this.climbStack(s, cx);
      return true;
    }
    this.climbing = false;

    if (closeThreat && !inColumn) {
      // Cut through a zombie that blocks the way to the beam; walk away from ones behind
      // (handing over to fight() kited the bot away from the beam for minutes).
      const blocking: boolean = Math.sign(closeThreat.dx) === Math.sign(stack.centerX - cx);
      if (blocking) {
        await this.setMove(0);
        const want: string = closeThreat.dx >= 0 ? 'right' : 'left';
        if (p.facing !== want) await this.me.face(want === 'left' ? 'left' : 'right');
        await this.setAttack(true);
        this.stats.attacks++;
        await this.castSkills(s, threats, true);
        return true;
      }
    }
    if (!here || here.name !== base.name) {
      await this.setAttack(false);
      this.move = 0;
      await stepToward(this.me, s, base, stack.centerX);
      return true;
    }
    // On the base: every kill made from inside the light joins the stack (and so does every
    // zombie that dies in it). Hold the column and fight whatever comes; ranged classes shoot far.
    const sameLevel: Threat[] = threats.filter((t: Threat): boolean => t.sameLevel);
    const leftCount: number = sameLevel.filter(
      (t: Threat): boolean => t.z.x + t.z.width / 2 < stack.centerX,
    ).length;
    const hordeFromLeft: boolean = leftCount >= sameLevel.length - leftCount;
    // Melee: the far wall facing the horde, so zombies walk deep into the light before dying.
    const anchorX: number = RANGED_CLASSES.has(p.classId)
      ? stack.centerX
      : hordeFromLeft
        ? stack.columnRight - 22
        : stack.columnLeft + 22;
    const reach: number = RANGED_CLASSES.has(p.classId) ? 380 : 160;
    const target: Threat | undefined = inColumn
      ? sameLevel.find((t: Threat): boolean => Math.abs(t.dx) < reach)
      : sameLevel.find((t: Threat): boolean => Math.abs(t.dx) < 45);
    if (target) {
      await this.setMove(0);
      const want: string = target.dx >= 0 ? 'right' : 'left';
      if (p.facing !== want) await this.me.face(want === 'left' ? 'left' : 'right');
      await this.setAttack(true);
      this.stats.attacks++;
      await this.castSkills(s, threats, true);
      return true;
    }
    await this.setAttack(false);
    const dx: number = anchorX - cx;
    if (Math.abs(dx) > 10) {
      await this.setMove(dx > 0 ? 1 : -1);
      return true;
    }
    await this.setMove(0);
    const facing: string = hordeFromLeft ? 'left' : 'right';
    if (p.facing !== facing) await this.me.face(facing === 'left' ? 'left' : 'right');
    return true;
  }

  /**
   * Climb the corpse stack like stairs: aim for the highest foothold (a stack step or the exit
   * itself) that one jump can reach, jump toward it and steer in the air. From the ground, walk
   * to the lowest step first.
   */
  private async climbStack(s: E2eSnapshot, cx: number): Promise<void> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    await this.setAttack(false);
    const feet: number = p.y + WORLD.playerHeight;
    const holds: Foothold[] = s.corpseViews
      .filter((c: E2eCorpseView): boolean => c.anchored && c.isGrounded)
      .map(
        (c: E2eCorpseView): Foothold => ({ x: c.footX + c.footWidth / 2, y: c.footY, width: c.footWidth }),
      );
    const exitHold: Foothold = { x: s.exit.x + s.exit.width / 2, y: s.exit.y, width: s.exit.width };
    // Footholds are one-way: from under one, a straight jump lands on it if the body overlaps it.
    const overlaps: (h: Foothold) => boolean = (h: Foothold): boolean =>
      Math.abs(h.x - cx) < (h.width + WORLD.playerWidth) / 2 - 6;
    const inReach: Foothold[] = [...holds, exitHold]
      .filter((h: Foothold): boolean => h.y < feet - 4 && feet - h.y <= CLIMB_REACH_PX)
      .sort((a: Foothold, b: Foothold): number => a.y - b.y);
    // Prefer the highest foothold already overhead: no walking on narrow steps. On the zigzag the
    // same-side step two up always overlaps, so walking is only needed from the ground.
    const overhead: Foothold | undefined = inReach.find(overlaps);
    const onStack: boolean = s.exitStack.playerSteadied && p.isGrounded;
    const target: Foothold | undefined = overhead ?? (onStack ? undefined : inReach[0]);

    if (Date.now() - this.lastClimbLogAt > 1_000) {
      this.lastClimbLogAt = Date.now();
      this.log(
        `climb: x=${Math.round(cx)} vy=${p.velocityY.toFixed(1)} feet=${Math.round(feet)} aim=${target ? `(${Math.round(target.x)},${Math.round(target.y)})${overhead ? ' overhead' : ''}` : 'none'} grounded=${p.isGrounded}`,
      );
    }

    await this.setMove(0);
    if (p.isClimbing) {
      // Ended up on a rope: direction + jump lets go, toward the stack.
      const toStack: string = s.exitStack.centerX > cx ? KEYS.right : KEYS.left;
      await this.me.hold(toStack);
      await this.me.press(KEYS.jump, 80);
      await this.me.release(toStack);
      return;
    }
    if (!p.isGrounded) return;
    if (overhead) {
      await this.fullJump();
      return;
    }
    if (target) {
      await this.walkTo(target.x);
      return;
    }
    // On a step with nothing overhead: step toward the beam center, where the zigzag overlaps.
    if (Math.abs(s.exitStack.centerX - cx) > 6) await this.walkTo(s.exitStack.centerX);
    else await this.fullJump();
  }


  /**
   * Hold jump until the apex. A fixed-length press gets cut short by variable jump height when
   * the browser drops frames (fewer game ticks pass per real millisecond).
   */
  private async fullJump(): Promise<void> {
    await this.me.hold(KEYS.jump);
    const until: number = Date.now() + 1_500;
    let tookOff: boolean = false;
    while (Date.now() < until) {
      await this.me.wait(20);
      const vy: number = (await this.me.probe.state()).player?.velocityY ?? 0;
      if (vy < 0) tookOff = true;
      else if (tookOff) break;
    }
    await this.me.release(KEYS.jump);
  }

  /**
   * Closed-loop walk to a center x: hold the key, watch the position, and let go early enough for
   * the slide. Fixed-length taps overshoot back and forth forever once the player is fast (maxed
   * stats or super speed).
   */
  private async walkTo(targetX: number): Promise<void> {
    const key: string = targetX > this.centerX(await this.me.probe.state()) ? KEYS.right : KEYS.left;
    const dir: number = key === KEYS.right ? 1 : -1;
    await this.me.hold(key);
    const until: number = Date.now() + 1_200;
    while (Date.now() < until) {
      const s: E2eSnapshot = await this.me.probe.state();
      const remaining: number = (targetX - this.centerX(s)) * dir;
      const slide: number = Math.abs(s.player?.velocityX ?? 0) * 4;
      if (remaining <= slide + 4) break;
      await this.me.wait(10);
    }
    await this.me.release(key);
    await this.me.wait(120);
  }

  private centerX(s: E2eSnapshot): number {
    return s.player ? s.player.x + WORLD.playerWidth / 2 : 0;
  }

  // ── Combat ───────────────────────────────────────────────

  private async fight(s: E2eSnapshot, threats: Threat[]): Promise<void> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const ranged: boolean = RANGED_CLASSES.has(p.classId);
    const downed: E2eRemotePlayerView | undefined = s.remotePlayers.find(
      (r: E2eRemotePlayerView): boolean => r.isDown,
    );
    const target: Threat = downed
      ? [...threats].sort(
          (a: Threat, b: Threat): number => Math.abs(a.z.x - downed.x) - Math.abs(b.z.x - downed.x),
        )[0]
      : (threats.find((t: Threat): boolean => t.sameLevel) ?? threats[0]);

    if (!target.sameLevel) {
      await this.setAttack(false);
      await this.setMove(target.dx > 0 ? 1 : -1);
      if (target.dy < -SAME_LEVEL_PX && p.isGrounded) await this.me.press(KEYS.jump, 110);
      return;
    }

    const reach: number = ranged ? RANGED_REACH_PX : MELEE_REACH_PX + target.z.width / 2;
    const gap: number = Math.abs(target.dx);
    const wantFacing: string = target.dx >= 0 ? 'right' : 'left';

    if (ranged && gap < RANGED_COMFORT_PX && s.invincibilityFrames === 0) {
      // Kite: step away, then turn and throw.
      const away: Move = target.dx > 0 ? -1 : 1;
      const wall: boolean = (away === -1 && p.x < 60) || (away === 1 && p.x > WORLD.width - 100);
      if (!wall) {
        await this.setAttack(false);
        await this.setMove(away);
        return;
      }
    }

    if (gap > reach) {
      await this.setAttack(false);
      await this.setMove(target.dx > 0 ? 1 : -1);
      return;
    }

    await this.setMove(0);
    if (p.facing !== wantFacing) await this.me.face(wantFacing === 'left' ? 'left' : 'right');
    await this.setAttack(true);
    this.stats.attacks++;
    await this.castSkills(s, threats);
  }

  /** holdPosition: skip movement skills (dash) that would carry the fight out of the beam. */
  private async castSkills(
    s: E2eSnapshot,
    threats: Threat[],
    holdPosition: boolean = false,
  ): Promise<void> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const close: number = threats.filter(
      (t: Threat): boolean => t.sameLevel && Math.abs(t.dx) < 220,
    ).length;
    const ready: E2eSkillView[] = s.usableSkills.filter(
      (k: E2eSkillView): boolean => k.cooldownTicks === 0,
    );
    for (const skill of ready) {
      const worthIt: boolean =
        (skill.type === 'buff' && close >= 1) ||
        (skill.mechanic === 'pull' && close >= 3) ||
        (skill.mechanic === 'damage' && close >= 1) ||
        (skill.mechanic === 'dash' && close >= 2 && !holdPosition);
      if (!worthIt || p.mp < 8) continue;
      await this.me.castSkill(skill.slot);
      this.stats.skillCasts++;
      return;
    }
  }

  // ── Economy ──────────────────────────────────────────────

  private async loot(s: E2eSnapshot): Promise<boolean> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    const pcx: number = p.x + WORLD.playerWidth / 2;
    const reachable: E2eDropView[] = s.drops
      .filter(
        (d: E2eDropView): boolean =>
          d.type !== 'special' && Math.abs(d.y - (p.y + WORLD.playerHeight)) < 90,
      )
      .sort((a: E2eDropView, b: E2eDropView): number => Math.abs(a.x - pcx) - Math.abs(b.x - pcx));
    const drop: E2eDropView | undefined = reachable[0];
    if (!drop || Math.abs(drop.x - pcx) > 600) return false;
    if (Math.abs(drop.x - pcx) < 12) {
      await this.setMove(0);
      this.stats.pickups++;
      return true;
    }
    await this.setMove(drop.x > pcx ? 1 : -1);
    return true;
  }

  /**
   * Opens a menu with its key, waits until Angular has rendered it, runs `use`, then closes
   * it with Escape and waits until it is gone. Pressing Escape before the menu exists does
   * nothing and leaves it open afterwards, blocking all game input.
   */
  private async withMenu(key: string, selector: string, use: () => Promise<void>): Promise<void> {
    const menu: Locator = this.me.page.locator(selector);
    await this.me.page.keyboard.press(key);
    const opened: boolean = await menu.waitFor({ state: 'visible', timeout: 1_500 }).then(
      (): boolean => true,
      (): boolean => false,
    );
    if (opened) await use();
    await this.me.page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden', timeout: 1_500 }).catch((): void => undefined);
  }

  private async spendPoints(s: E2eSnapshot): Promise<boolean> {
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    if (Date.now() - this.lastPointsAt < 3_000) return false;
    if (p.unallocatedStatPoints === 0 && p.unallocatedSkillPoints === 0) return false;
    this.lastPointsAt = Date.now();
    await this.stop();
    if (p.unallocatedStatPoints > 0) {
      await this.withMenu(KEYS.openStats, 'app-stat-allocation', async (): Promise<void> => {
        await this.me.page
          .getByTestId('stat-allocation-button-auto')
          .click({ timeout: 1_500 })
          .catch((): void => undefined);
      });
      this.stats.statSpends++;
      this.log(`spent stat points (level ${p.level})`);
    }
    if (p.unallocatedSkillPoints > 0) {
      const levels: Record<string, number> = { ...p.skillLevels };
      await this.withMenu(KEYS.openSkills, 'app-skill-tree', async (): Promise<void> => {
        for (let i: number = 0; i < p.unallocatedSkillPoints; i++) {
          const id: string | null = await this.bestSkillToInvest(levels);
          if (!id) break;
          await this.me.page
            .getByTestId(`skill-tree-button-invest-${id}`)
            .click({ timeout: 1_500 })
            .catch((): void => undefined);
          levels[id] = (levels[id] ?? 0) + 1;
          this.stats.skillSpends++;
          this.log(`invested a skill point in ${id}`);
        }
      });
    }
    return true;
  }

  /** Enabled invest button with the best priority (see SKILL_PRIORITY), or null. */
  /**
   * Order: unlock every active skill (1 point) → auto-potion up to 3 → level damage skills →
   * the rest by SKILL_PRIORITY. Pouring everything into auto-potion first left the AI with no
   * active skill at all for a whole 8-minute game.
   */
  private async bestSkillToInvest(levels: Record<string, number>): Promise<string | null> {
    const ids: string[] = await this.me.page
      .locator('[data-testid^="skill-tree-button-invest-"]:enabled')
      .evaluateAll((els: Element[]): string[] =>
        els.map((el: Element): string =>
          (el.getAttribute('data-testid') ?? '').replace('skill-tree-button-invest-', ''),
        ),
      );
    if (ids.length === 0) return null;
    const has: (id: string, keywords: string[]) => boolean = (
      id: string,
      keywords: string[],
    ): boolean => keywords.some((k: string): boolean => id.includes(k));
    const rank: (id: string) => number = (id: string): number => {
      const index: number = SKILL_PRIORITY.findIndex((keyword: string): boolean =>
        id.includes(keyword),
      );
      const base: number = index === -1 ? SKILL_PRIORITY.length : index;
      const level: number = levels[id] ?? 0;
      if (!has(id, PASSIVE_KEYWORDS) && level === 0) return base;
      if (id.includes('auto-potion') && level < 3) return 100 + base;
      if (has(id, DAMAGE_KEYWORDS)) return 200 + base;
      return 300 + base;
    };
    return [...ids].sort((a: string, b: string): number => rank(a) - rank(b))[0];
  }

  /** emergency = out of potions mid-fight: skip the cooldown between shop visits. */
  private async shop(s: E2eSnapshot, emergency: boolean): Promise<boolean> {
    if (this.options.shop === false) return false;
    const p: NonNullable<E2eSnapshot['player']> = s.player!;
    if (!emergency && Date.now() - this.lastShopAt < 8_000) return false;
    const hpPotions: number = p.potions[HP_POTION_ID] ?? 0;
    const affordable: number = Math.min(
      Math.floor(p.gold / HP_POTION_PRICE),
      POTION_STOCK_TARGET - hpPotions,
    );
    const mpWanted: number =
      emergency || s.usableSkills.length === 0
        ? 0
        : Math.min(
            Math.floor((p.gold - Math.max(0, affordable) * HP_POTION_PRICE) / MP_POTION_PRICE),
            MP_POTION_STOCK_TARGET - (p.potions[MP_POTION_ID] ?? 0),
          );
    if (affordable <= 0 && mpWanted <= 0) return false;
    this.lastShopAt = Date.now();
    await this.stop();
    let bought: number = 0;
    let boughtMp: number = 0;
    const buyMany: (potionId: string, count: number) => Promise<number> = async (
      potionId: string,
      count: number,
    ): Promise<number> => {
      const buy: Locator = this.me.page.getByTestId(`shop-item-button-buy-shop-${potionId}`);
      let n: number = 0;
      for (let i: number = 0; i < count; i++) {
        const ok: boolean = await buy.click({ timeout: 1_500 }).then(
          (): boolean => true,
          (): boolean => false,
        );
        if (!ok) break;
        n++;
      }
      return n;
    };
    await this.withMenu(KEYS.openShop, 'app-shop', async (): Promise<void> => {
      bought = await buyMany(HP_POTION_ID, Math.max(0, affordable));
      boughtMp = await buyMany(MP_POTION_ID, Math.max(0, mpWanted));
    });
    this.stats.potionsBought += bought + boughtMp;
    this.log(
      `bought ${bought} HP and ${boughtMp} MP potion(s)${emergency ? ' (emergency)' : ''}`,
    );
    return bought + boughtMp > 0;
  }

  // ── Key state ────────────────────────────────────────────

  private async setMove(dir: Move): Promise<void> {
    if (dir === this.move) {
      if (dir !== 0) await this.me.hold(dir === 1 ? KEYS.right : KEYS.left);
      return;
    }
    await this.me.release(KEYS.left);
    await this.me.release(KEYS.right);
    if (dir !== 0) await this.me.hold(dir === 1 ? KEYS.right : KEYS.left);
    this.move = dir;
  }

  private async setAttack(on: boolean): Promise<void> {
    if (on === this.attacking) return;
    this.attacking = on;
    if (on) await this.me.hold(KEYS.attack);
    else await this.me.release(KEYS.attack);
  }

  private async stop(): Promise<void> {
    this.move = 0;
    this.attacking = false;
    await this.me.releaseAll();
  }
}
