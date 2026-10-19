import {
  ActiveBuff,
  AttackCombo,
  CharacterState,
  ClassSkillTree,
  Direction,
  GAME_CONSTANTS,
  GameAction,
  InputKeys,
  SKILL_KEY_ACTIONS,
  SkillType,
  TreeSkill,
  TreeSkillMechanic,
  VfxEvent,
  VfxEventType,
  ZombieEffectKind,
  ZombieEffectRequest,
  ZombieState,
  ZombieType,
  StatCurve,
  TreeCurveKey,
  findTreeSkill,
  getSkillTree,
  isSlottable,
  ownedComboSkill,
  ownedSkillByMechanic,
  ownsTreeSkill,
  treeSkillCooldownMs,
  treeSkillValue,
} from '@shared/index';
import { CombatHooks, CombatSystem } from './combat-system';
import { refreshDerivedStats } from './derived-stats';
import { IGameEngine, SkillMotion } from './engine-types';
import { pullZombiesToward } from './magnet-pull';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { airTimeTicks, applyZombieEffect, launchForceForHeight } from './zombie-effects';

interface SlamState {
  skill: TreeSkill;
  startY: number;
}

interface ChargeRunState {
  skill: TreeSkill;
  ticksLeft: number;
  dir: number;
  hit: Set<string>;
}

interface LeapState {
  skill: TreeSkill;
  ticksLeft: number;
}

const ROOTED: SkillMotion = { keepMomentum: false };
const MOMENTUM: SkillMotion = { keepMomentum: true };

/**
 * Skill trees (classes in SKILL_TREES): fires the attack-button combos (double tap, air hold, hold and
 * let go) and the skill-bar actives and buffs (one key, one skill), runs their mechanics, passives
 * and reactions. Also the combat hooks (Heavy Hands,
 * Executioner, Last Stand, Counter). Classes without a tree never reach this system.
 */
export class TreeSkillSystem implements CombatHooks {
  /** Skills asked for since the last tick (bar keys pressed, quick-slot skills), oldest first. */
  private queued: string[] = [];
  private prevKeys: InputKeys | null = null;

  /** Attack went down / came up since the last tick (a tap shorter than a tick still counts). */
  private attackPressed: boolean = false;
  private attackReleased: boolean = false;
  /** Ticks since the last attack press (double tap). */
  private sinceTap: number = Infinity;
  /** Ticks the current attack press has been held. */
  private holdTicks: number = 0;
  /** The current press started in the air (air hold) rather than on the ground (hold and let go). */
  private holdInAir: boolean = false;
  /** The current press already fired a combo, or can't any more. */
  private holdSpent: boolean = true;

  private parryTicks: number = 0;
  private parryLockTicks: number = 0;
  private slam: SlamState | null = null;
  private chargeRun: ChargeRunState | null = null;
  private leap: LeapState | null = null;
  private backstepTicks: number = 0;
  private rootTicks: number = 0;

  private rampageChains: number = 0;
  private rampageWindow: number = 0;
  private dashWasActive: boolean = false;

  private adrenalineStacks: number = 0;
  private secondWindUsed: boolean = false;
  private secondWindHealTicks: number = 0;
  private secondWindHealPerTick: number = 0;
  private healCarry: number = 0;
  private stillTicks: number = 0;
  private recoveryTimer: number = 0;
  private lastStandOn: boolean = false;
  private floorSeen: number = 0;

  constructor(
    private readonly e: IGameEngine,
    private readonly physics: PhysicsSystem,
    private readonly vfx: VfxSystem,
    private readonly combat: CombatSystem,
  ) {}

  /** The local player's class has a skill tree (warrior today). */
  isActive(): boolean {
    return this.tree() !== null;
  }

  reset(): void {
    this.queued = [];
    this.prevKeys = null;
    this.attackPressed = false;
    this.attackReleased = false;
    this.sinceTap = Infinity;
    this.holdTicks = 0;
    this.holdSpent = true;
    if (this.e.player) this.e.player.skillCharge = undefined;
    this.parryTicks = 0;
    this.parryLockTicks = 0;
    this.slam = null;
    this.chargeRun = null;
    this.leap = null;
    this.backstepTicks = 0;
    this.rootTicks = 0;
    this.rampageChains = 0;
    this.rampageWindow = 0;
    this.dashWasActive = false;
    this.adrenalineStacks = 0;
    this.secondWindUsed = false;
    this.secondWindHealTicks = 0;
    this.healCarry = 0;
    this.stillTicks = 0;
    this.recoveryTimer = 0;
    this.lastStandOn = false;
    this.floorSeen = this.e.floor;
  }

  /** The keys changed (between ticks): a bar key going down queues the skill in that slot. */
  keysChanged(keys: InputKeys): void {
    if (keys.attack && !this.prevKeys?.attack) this.attackPressed = true;
    if (!keys.attack && this.prevKeys?.attack) this.attackReleased = true;
    const bar: ReadonlyArray<string | null> = this.e.player?.skillBar ?? [];
    SKILL_KEY_ACTIONS.forEach((key: GameAction, slot: number): void => {
      const id: string | null = bar[slot] ?? null;
      if (keys[key] && !this.prevKeys?.[key] && id) this.queued.push(id);
    });
    this.prevKeys = { ...keys };
  }

  /** A quick slot holding a tree skill was pressed: fires it like its bar key. */
  queueSkill(skillId: string): void {
    this.queued.push(skillId);
  }

  /** Before physics: how the body moves while a skill owns it (rooted, carried by momentum). */
  beginTick(): void {
    const p: CharacterState | null = this.e.player;
    if (!p || !this.isActive()) {
      this.e.skillMotion = null;
      return;
    }
    if (this.chargeRun) p.velocityX = this.chargeRun.dir * GAME_CONSTANTS.SKILL_CHARGE_RUN_SPEED;
    if (this.rootTicks > 0) {
      p.velocityX = 0;
      this.e.skillMotion = ROOTED;
    } else if (this.chargeRun || this.backstepTicks > 0 || this.leap || this.slam) {
      this.e.skillMotion = MOMENTUM;
    } else {
      this.e.skillMotion = null;
    }
  }

  /** The player can't act this tick (stunned, carrying, a menu opened): drop the skills asked for. */
  idle(): void {
    this.queued = [];
    this.attackPressed = false;
    this.attackReleased = false;
    this.dropHold();
  }

  /** The player is down or dead: nothing in progress survives to the revive. */
  downed(): void {
    this.idle();
    this.slam = null;
    this.chargeRun = null;
    this.leap = null;
    this.rootTicks = 0;
    this.backstepTicks = 0;
    this.parryTicks = 0;
  }

  /** A skill owns the body (a dash, slam, charge run, leap, backstep, roar): no basic swings now. */
  busy(): boolean {
    return (
      this.e.dashPhase !== null ||
      this.slam !== null ||
      this.chargeRun !== null ||
      this.leap !== null ||
      this.backstepTicks > 0 ||
      this.rootTicks > 0
    );
  }

  /**
   * Attack-button combos, before the swing: two quick presses fire the double-tap skill, holding in
   * the air fires the air-hold skill, holding on the ground charges the hold skill and letting go
   * fires it. Right after a dash, a press chains a Rampage dash. True when this tick's swing gives
   * way (a combo fired or a charge is building).
   */
  updateAttack(resting: boolean): boolean {
    const p: CharacterState | null = this.e.player;
    const pressed: boolean = this.attackPressed;
    const released: boolean = this.attackReleased;
    this.attackPressed = false;
    this.attackReleased = false;
    this.sinceTap++;
    if (!p) return false;
    // Weapons down on the safe spot; hands on the rope or ladder.
    if (resting || p.isClimbing || this.physics.getActiveRope() !== null) {
      this.dropHold();
      return false;
    }
    if (p.skillCharge !== undefined && (released || !this.e.keys.attack)) {
      const charge: number = p.skillCharge;
      this.dropHold();
      this.fireCombo(AttackCombo.Hold, charge);
      return true;
    }
    if (pressed) {
      const doubleTap: boolean = this.sinceTap <= this.msToTicks(GAME_CONSTANTS.ATTACK_DOUBLE_TAP_MS);
      this.sinceTap = doubleTap ? Infinity : 0;
      this.holdTicks = 0;
      this.holdInAir = !p.isGrounded;
      this.holdSpent = false;
      if (this.tryRampageChain() || (doubleTap && this.fireCombo(AttackCombo.DoubleTap))) {
        this.holdSpent = true;
        return true;
      }
    }
    if (!this.e.keys.attack || this.holdSpent || this.busy()) return false;
    this.holdTicks++;
    if (this.holdInAir) {
      if (p.isGrounded || this.holdTicks < this.msToTicks(GAME_CONSTANTS.ATTACK_AIR_HOLD_MS))
        return false;
      this.holdSpent = true;
      return this.fireCombo(AttackCombo.AirHold);
    }
    const start: number = this.msToTicks(GAME_CONSTANTS.ATTACK_HOLD_MS);
    const skill: TreeSkill | null = this.comboSkill(AttackCombo.Hold);
    if (!skill || this.holdTicks < start) return false;
    // Nothing to charge (cooldown, no MP): the held attack keeps swinging.
    if (p.skillCharge === undefined && !this.ready(skill)) return false;
    p.skillCharge = Math.min(
      1,
      (this.holdTicks - start) / this.msToTicks(GAME_CONSTANTS.ATTACK_CHARGE_MS),
    );
    return true;
  }

  /** After physics: fires the skills asked for since the last tick. */
  updateInput(resting: boolean): void {
    const ids: string[] = this.queued;
    this.queued = [];
    if (resting) return;
    for (const id of ids) this.fire(id);
  }

  /** Per-tick skill state: slams landing, charges running, passives, reactions. */
  updateTimers(): void {
    const p: CharacterState | null = this.e.player;
    if (!p || !this.isActive()) return;
    if (this.e.floor !== this.floorSeen) {
      this.floorSeen = this.e.floor;
      this.secondWindUsed = false;
    }
    if (this.parryTicks > 0) {
      this.parryTicks--;
      // A window that closed without a hit: no new one for a moment (mashing is no shield).
      if (this.parryTicks === 0)
        this.parryLockTicks = this.msToTicks(GAME_CONSTANTS.SKILL_PARRY_LOCKOUT_MS);
    } else if (this.parryLockTicks > 0) {
      this.parryLockTicks--;
    }
    if (this.backstepTicks > 0) this.backstepTicks--;
    if (this.rootTicks > 0) this.rootTicks--;

    this.updateSlam(p);
    this.updateChargeRun(p);
    this.updateLeap(p);
    this.updateRampage();
    this.updateSecondWindHeal(p);
    this.updateIronRecovery(p);
    if (!p.activeBuffs.some((b: ActiveBuff): boolean => b.skillId === 'warrior-adrenaline'))
      this.adrenalineStacks = 0;
    this.updateLastStand(p);
  }

  // ─── Casting ──────────────────────────────────────

  /** One bar key or quick slot: the owned active or buff with this id, if it can go now. */
  private fire(id: string): void {
    const p: CharacterState | null = this.e.player;
    const skill: TreeSkill | undefined = this.tree()?.skills.find(
      (s: TreeSkill): boolean => s.id === id,
    );
    if (!p || !skill || !isSlottable(skill) || !ownsTreeSkill(p.skillLevels, skill.id)) return;
    // On a rope or ladder only buffs: every other skill moves or swings the body.
    const climbing: boolean = p.isClimbing || this.physics.getActiveRope() !== null;
    if (climbing && skill.type !== SkillType.Buff) return;
    if (this.busy()) return;
    this.cast(skill);
  }

  /** The owned skill on this attack combo, if it can go now (charge: how full a hold was, 0..1). */
  private fireCombo(combo: AttackCombo, charge: number = 1): boolean {
    const skill: TreeSkill | null = this.comboSkill(combo);
    if (!skill || this.busy() || !this.ready(skill)) return false;
    this.cast(skill, charge);
    return true;
  }

  private comboSkill(combo: AttackCombo): TreeSkill | null {
    const tree: ClassSkillTree | null = this.tree();
    return tree && this.e.player ? ownedComboSkill(tree, this.e.player.skillLevels, combo) : null;
  }

  /** The current attack press fires nothing more and any charge is dropped. */
  private dropHold(): void {
    this.holdSpent = true;
    if (this.e.player) this.e.player.skillCharge = undefined;
  }

  private tree(): ClassSkillTree | null {
    return this.e.player ? getSkillTree(this.e.player.classId) : null;
  }

  private ownedMech(mechanic: TreeSkillMechanic): TreeSkill | null {
    const tree: ClassSkillTree | null = this.tree();
    return tree && this.e.player
      ? ownedSkillByMechanic(tree, this.e.player.skillLevels, mechanic)
      : null;
  }

  /** Off cooldown and affordable. */
  private ready(skill: TreeSkill): boolean {
    const p: CharacterState | null = this.e.player;
    if (!p) return false;
    if ((this.e.skillCooldowns.get(skill.id) ?? 0) > 0) return false;
    if (skill.mechanic === 'counter' && (this.parryTicks > 0 || this.parryLockTicks > 0))
      return false;
    if (this.e.godMode) return true;
    if (p.mp < skill.mpCost) return false;
    if (skill.minHpPercent > 0 && (p.hp / p.derived.maxHp) * 100 <= skill.minHpPercent)
      return false;
    if (skill.hpCostPercent > 0 && p.hp <= this.hpCost(p, skill)) return false;
    return true;
  }

  private hpCost(p: CharacterState, skill: TreeSkill): number {
    return Math.floor((p.derived.maxHp * skill.hpCostPercent) / 100);
  }

  /** Pays for and fires a skill (nothing happens when it isn't ready). Charge: a hold skill's fill, 0..1. */
  private cast(skill: TreeSkill, charge: number = 1): void {
    const p: CharacterState | null = this.e.player;
    if (!p || !this.ready(skill)) return;
    if (!this.e.godMode) {
      p.mp -= skill.mpCost;
      if (skill.hpCostPercent > 0) p.hp -= this.hpCost(p, skill);
      // Report the cost before the hit: a kill's XP syncs progression back, which would refund unreported MP.
      this.e.onPlayerUpdate?.(p);
    }
    const cooldownMs: number = treeSkillCooldownMs(skill, p.stats);
    if (cooldownMs > 0) this.e.skillCooldowns.set(skill.id, Math.ceil(cooldownMs / this.e.fixedDt));

    switch (skill.mechanic) {
      case 'strike':
        this.strike(p, skill);
        break;
      case 'cleave':
        this.cleave(p, skill);
        break;
      case 'uppercut':
        this.uppercut(p, skill);
        break;
      case 'ground-slam':
        this.startSlam(p, skill);
        break;
      case 'roar':
        this.roar(p, skill);
        break;
      case 'dash':
        this.dash(p, skill, charge);
        break;
      case 'shoulder-charge':
        this.startChargeRun(p, skill);
        break;
      case 'backstep':
        this.backstep(p, skill);
        break;
      case 'pull':
        this.pull(p, skill);
        break;
      case 'leap-strike':
        this.startLeap(p, skill);
        break;
      case 'counter':
        this.openParry(p, skill);
        break;
      case 'buff':
        this.activateBuff(p, skill);
        break;
      default:
        break;
    }
    this.e.onPlayerUpdate?.(p);
  }

  // ─── Mechanics ────────────────────────────────────

  /** Power Strike: a heavy blow on the zombie in front that knocks it away. */
  private strike(p: CharacterState, skill: TreeSkill): void {
    const target: ZombieState | null = this.frontTarget(p, GAME_CONSTANTS.SKILL_STRIKE_RANGE_PX);
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    this.pose();
    if (!target) {
      this.animate(
        skill,
        p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 + (dir * GAME_CONSTANTS.SKILL_STRIKE_RANGE_PX) / 2,
        p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
        p.facing,
      );
      return;
    }
    this.animate(
      skill,
      target.x + target.instanceWidth / 2,
      target.y + target.instanceHeight / 2,
      p.facing,
    );
    this.combat.dealSkillDamage(target, skill.damageMult, skill.color, {
      knockback: false,
      forceCrit: false,
    });
    if (!target.isDead) {
      this.affect(
        target,
        'knockback',
        dir,
        treeSkillValue(skill, 'knockback', p.stats, GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE),
        0,
      );
    }
    this.combat.finishHits();
  }

  /** Counter: a short guard; a zombie hit landing inside it is parried (see tryParry). */
  private openParry(p: CharacterState, skill: TreeSkill): void {
    this.parryTicks = this.msToTicks(treeSkillValue(skill, 'windowMs', p.stats));
    this.pose();
  }

  private cleave(p: CharacterState, skill: TreeSkill): void {
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const radius: number = treeSkillValue(skill, 'radius', p.stats);
    this.animate(skill, cx, cy, p.facing);
    this.pose();
    let hits: number = 0;
    for (const z of this.e.zombies) {
      if (hits >= skill.maxTargets) break;
      if (!this.hittable(z)) continue;
      const zcx: number = z.x + z.instanceWidth / 2;
      const reachX: boolean = Math.abs(zcx - cx) <= radius + z.instanceWidth / 2;
      const reach: number = GAME_CONSTANTS.SKILL_CLEAVE_VERTICAL_REACH_PX;
      const reachY: boolean =
        z.y < p.y + GAME_CONSTANTS.PLAYER_HEIGHT + reach && z.y + z.instanceHeight > p.y - reach;
      if (!reachX || !reachY) continue;
      this.combat.dealSkillDamage(z, skill.damageMult, skill.color, {
        knockback: true,
        forceCrit: false,
      });
      hits++;
    }
    this.combat.finishHits();
  }

  private uppercut(p: CharacterState, skill: TreeSkill): void {
    const target: ZombieState | null = this.frontTarget(p, GAME_CONSTANTS.SKILL_STRIKE_RANGE_PX);
    this.pose();
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    if (!target) {
      this.animate(
        skill,
        p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 + (dir * GAME_CONSTANTS.SKILL_STRIKE_RANGE_PX) / 2,
        p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 4,
        p.facing,
      );
      return;
    }
    this.animate(
      skill,
      target.x + target.instanceWidth / 2,
      target.y + target.instanceHeight / 2,
      p.facing,
    );
    this.combat.dealSkillDamage(target, skill.damageMult, skill.color, {
      knockback: false,
      forceCrit: false,
    });
    if (!target.isDead) {
      const force: number = launchForceForHeight(treeSkillValue(skill, 'launch', p.stats));
      const stunMs: number =
        airTimeTicks(force) * this.e.fixedDt + GAME_CONSTANTS.SKILL_UPPERCUT_EXTRA_STUN_MS;
      this.affect(target, 'launch', dir, force, stunMs);
    }
    this.combat.finishHits();
  }

  private startSlam(p: CharacterState, skill: TreeSkill): void {
    p.velocityY = Math.max(p.velocityY, GAME_CONSTANTS.SKILL_SLAM_FALL_SPEED);
    this.slam = { skill, startY: p.y };
    this.pose();
  }

  private updateSlam(p: CharacterState): void {
    const slam: SlamState | null = this.slam;
    if (!slam) return;
    if (p.isClimbing) {
      this.slam = null;
      return;
    }
    if (!p.isGrounded) {
      p.velocityY = Math.max(p.velocityY, GAME_CONSTANTS.SKILL_SLAM_FALL_SPEED);
      return;
    }
    this.slam = null;
    const skill: TreeSkill = slam.skill;
    const fall: number = Math.max(0, p.y - slam.startY);
    const mult: number =
      skill.damageMult *
      Math.min(
        GAME_CONSTANTS.SKILL_SLAM_MAX_MULT,
        1 + fall / GAME_CONSTANTS.SKILL_SLAM_FALL_PX_PER_BONUS,
      );
    const radius: number =
      treeSkillValue(skill, 'radius', p.stats) +
      GAME_CONSTANTS.PLAYER_WEIGHT_KG * GAME_CONSTANTS.SKILL_SLAM_RADIUS_PER_KG;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const feetY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    this.animate(skill, cx, feetY - GAME_CONSTANTS.SKILL_SLAM_FX_RAISE_PX, p.facing);
    let hits: number = 0;
    for (const z of this.e.zombies) {
      if (hits >= skill.maxTargets) break;
      if (!this.hittable(z)) continue;
      const zcx: number = z.x + z.instanceWidth / 2;
      const zFeet: number = z.y + z.instanceHeight;
      if (Math.abs(zcx - cx) > radius + z.instanceWidth / 2) continue;
      if (Math.abs(zFeet - feetY) > GAME_CONSTANTS.PLAYER_HEIGHT) continue;
      this.combat.dealSkillDamage(z, mult, skill.color, { knockback: false, forceCrit: false });
      if (!z.isDead)
        this.affect(
          z,
          'launch',
          zcx >= cx ? 1 : -1,
          -GAME_CONSTANTS.SKILL_SLAM_POP_FORCE,
          GAME_CONSTANTS.SKILL_SLAM_STUN_MS,
        );
      hits++;
    }
    this.combat.finishHits();
  }

  private roar(p: CharacterState, skill: TreeSkill): void {
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const range: number = treeSkillValue(skill, 'range', p.stats);
    const stunMs: number = treeSkillValue(skill, 'stunMs', p.stats);
    this.animate(skill, cx, cy, p.facing);
    this.pose();
    this.rootTicks = this.msToTicks(GAME_CONSTANTS.SKILL_ROAR_ROOT_MS);
    let hits: number = 0;
    for (const z of this.e.zombies) {
      if (hits >= skill.maxTargets) break;
      if (!this.hittable(z)) continue;
      const dist: number = Math.hypot(
        z.x + z.instanceWidth / 2 - cx,
        z.y + z.instanceHeight / 2 - cy,
      );
      if (dist > range) continue;
      this.combat.dealSkillDamage(z, skill.damageMult, skill.color, {
        knockback: true,
        forceCrit: false,
      });
      if (!z.isDead) this.affect(z, 'stun', 0, 0, stunMs);
      hits++;
    }
    this.combat.finishHits();
  }

  /** Power Dash: the charge (0..1) stretches it from SKILL_DASH_MIN_CHARGE of its distance to all of it. */
  private dash(p: CharacterState, skill: TreeSkill, charge: number): void {
    const min: number = GAME_CONSTANTS.SKILL_DASH_MIN_CHARGE;
    const fill: number = min + (1 - min) * Math.min(1, Math.max(0, charge));
    const distance: number = treeSkillValue(skill, 'distance', p.stats) * fill;
    this.rampageChains = 0;
    this.combat.startDash(distance, skill.damageMult, skill.maxTargets, skill.color);
  }

  /** Rampage: attack pressed as a dash ends chains another dash (no cooldown, Rampage's MP). */
  private tryRampageChain(): boolean {
    const p: CharacterState | null = this.e.player;
    const rampage: TreeSkill | null = this.ownedMech('rampage');
    const dashSkill: TreeSkill | null = this.ownedMech('dash');
    if (!p || !rampage || !dashSkill || this.rampageWindow <= 0) return false;
    if (this.rampageChains >= GAME_CONSTANTS.SKILL_RAMPAGE_CHAINS) return false;
    if (!this.e.godMode && p.mp < rampage.mpCost) return false;
    const distance: number = treeSkillValue(dashSkill, 'distance', p.stats);
    if (!this.combat.startDash(distance, dashSkill.damageMult, dashSkill.maxTargets, rampage.color))
      return false;
    if (!this.e.godMode) p.mp -= rampage.mpCost;
    this.rampageChains++;
    this.rampageWindow = 0;
    this.animate(
      rampage,
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      p.facing,
    );
    this.e.onPlayerUpdate?.(p);
    return true;
  }

  private updateRampage(): void {
    const dashActive: boolean = this.e.dashPhase !== null;
    const p: CharacterState | null = this.e.player;
    const rampage: TreeSkill | null = this.ownedMech('rampage');
    if (
      this.dashWasActive &&
      !dashActive &&
      rampage &&
      p &&
      this.rampageChains < GAME_CONSTANTS.SKILL_RAMPAGE_CHAINS
    ) {
      this.rampageWindow = this.msToTicks(treeSkillValue(rampage, 'windowMs', p.stats));
    }
    this.dashWasActive = dashActive;
    if (this.rampageWindow > 0) this.rampageWindow--;
  }

  private startChargeRun(p: CharacterState, skill: TreeSkill): void {
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    this.chargeRun = {
      skill,
      ticksLeft: GAME_CONSTANTS.SKILL_CHARGE_RUN_TICKS,
      dir,
      hit: new Set<string>(),
    };
    p.velocityX = dir * GAME_CONSTANTS.SKILL_CHARGE_RUN_SPEED;
    this.pose();
    this.animate(
      skill,
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      p.facing,
    );
  }

  private updateChargeRun(p: CharacterState): void {
    const run: ChargeRunState | null = this.chargeRun;
    if (!run) return;
    run.ticksLeft--;
    let landed: boolean = false;
    for (const z of this.e.zombies) {
      if (run.hit.size >= run.skill.maxTargets) break;
      if (!this.hittable(z) || run.hit.has(z.id)) continue;
      const pad: number = GAME_CONSTANTS.SKILL_CHARGE_RUN_HIT_PAD_PX;
      if (
        !this.physics.rectsOverlap(
          p.x - pad,
          p.y,
          GAME_CONSTANTS.PLAYER_WIDTH + pad * 2,
          GAME_CONSTANTS.PLAYER_HEIGHT,
          z.x,
          z.y,
          z.instanceWidth,
          z.instanceHeight,
        )
      )
        continue;
      run.hit.add(z.id);
      this.combat.dealSkillDamage(z, run.skill.damageMult, run.skill.color, {
        knockback: false,
        forceCrit: false,
      });
      if (!z.isDead)
        this.affect(
          z,
          'knockdown',
          run.dir,
          treeSkillValue(run.skill, 'knockback', p.stats),
          GAME_CONSTANTS.SKILL_KNOCKDOWN_MS,
        );
      landed = true;
    }
    if (landed) this.combat.finishHits();
    if (run.ticksLeft <= 0 || p.isClimbing) {
      this.chargeRun = null;
      p.velocityX = run.dir * p.derived.speed;
    }
  }

  private backstep(p: CharacterState, skill: TreeSkill): void {
    const facing: Direction = p.facing;
    const away: number = facing === Direction.Right ? -1 : 1;
    p.velocityX =
      (away * treeSkillValue(skill, 'distance', p.stats)) / GAME_CONSTANTS.SKILL_BACKSTEP_TICKS;
    p.velocityY = GAME_CONSTANTS.SKILL_BACKSTEP_HOP_FORCE;
    p.isGrounded = false;
    this.backstepTicks = GAME_CONSTANTS.SKILL_BACKSTEP_TICKS;
    this.e.invincibilityFrames = Math.max(
      this.e.invincibilityFrames,
      this.msToTicks(treeSkillValue(skill, 'iframesMs', p.stats)),
    );
    this.animate(
      skill,
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT,
      facing,
    );
  }

  private pull(p: CharacterState, skill: TreeSkill): void {
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const range: number = treeSkillValue(skill, 'range', p.stats);
    const stunMs: number = treeSkillValue(skill, 'stunMs', p.stats);
    this.animate(skill, cx, cy, p.facing);
    this.pose();
    // Zombies belong to the host's simulation: a guest only asks the host to pull.
    if (this.e.isMultiplayerClient) {
      this.e.pendingPullEvents.push({
        playerX: p.x,
        playerY: p.y,
        pullRange: range,
        skillColor: skill.color,
        stunMs,
      });
    } else {
      pullZombiesToward(this.e.zombies, p.x, p.y, range, this.msToTicks(stunMs));
    }
  }

  /** Leap Strike: from the ground a jump that covers the reach over its arc; in the air a dive. */
  private startLeap(p: CharacterState, skill: TreeSkill): void {
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    const distance: number = treeSkillValue(skill, 'distance', p.stats);
    if (p.isGrounded) {
      const force: number = GAME_CONSTANTS.SKILL_LEAP_JUMP_FORCE;
      const arcTicks: number = Math.max(1, Math.round((-2 * force) / GAME_CONSTANTS.GRAVITY));
      p.velocityX = (dir * distance) / arcTicks;
      p.velocityY = force;
      p.isGrounded = false;
      this.leap = { skill, ticksLeft: arcTicks + GAME_CONSTANTS.SKILL_LEAP_MAX_TICKS };
    } else {
      p.velocityX = (dir * distance) / GAME_CONSTANTS.SKILL_LEAP_DIVE_TICKS;
      p.velocityY = GAME_CONSTANTS.SKILL_LEAP_DIVE_FALL_SPEED;
      this.leap = { skill, ticksLeft: GAME_CONSTANTS.SKILL_LEAP_MAX_TICKS };
    }
    this.pose();
  }

  private updateLeap(p: CharacterState): void {
    const leap: LeapState | null = this.leap;
    if (!leap) return;
    leap.ticksLeft--;
    if (!p.isGrounded && leap.ticksLeft > 0 && !p.isClimbing) return;
    this.leap = null;
    const skill: TreeSkill = leap.skill;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.animate(skill, cx, cy, p.facing);
    let hits: number = 0;
    for (const z of this.e.zombies) {
      if (hits >= skill.maxTargets) break;
      if (!this.hittable(z)) continue;
      const dx: number = Math.abs(z.x + z.instanceWidth / 2 - cx);
      const dy: number = Math.abs(z.y + z.instanceHeight / 2 - cy);
      if (
        dx > GAME_CONSTANTS.SKILL_LEAP_HIT_RADIUS_PX + z.instanceWidth / 2 ||
        dy > GAME_CONSTANTS.PLAYER_HEIGHT
      )
        continue;
      this.combat.dealSkillDamage(z, skill.damageMult, skill.color, {
        knockback: true,
        forceCrit: false,
      });
      hits++;
    }
    this.combat.finishHits();
  }

  private activateBuff(p: CharacterState, skill: TreeSkill): void {
    const buff: TreeSkill['buff'] = skill.buff;
    if (!buff) return;
    p.activeBuffs = p.activeBuffs.filter((b: ActiveBuff): boolean => b.skillId !== skill.id);
    refreshDerivedStats(p);
    const percent: number = treeSkillValue(skill, buff.valueCurve, p.stats);
    const value: number = buff.percentOfDerived
      ? Math.max(
          1,
          Math.floor(
            (((p.derived as unknown as Record<string, number>)[buff.stat] ?? 0) * percent) / 100,
          ),
        )
      : Math.round(percent);
    this.pushBuff(p, skill, value, buff.durationMs);

    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.animate(skill, cx, cy, p.facing);
    this.vfx.spawnBuffActivationParticles(cx, cy, skill.color);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.BuffActivation,
      playerId: p.id,
      x: cx,
      y: cy,
      color: skill.color,
    });

    if (buff.allyRadius > 0) {
      const targetIds: string[] = this.e.remotePlayers
        .filter(
          (rp: CharacterState): boolean =>
            !rp.isDown && !rp.isDead && Math.hypot(rp.x - p.x, rp.y - p.y) <= buff.allyRadius,
        )
        .map((rp: CharacterState): string => rp.id);
      if (targetIds.length > 0) {
        this.e.pendingVfxEvents.push({
          type: VfxEventType.AllyBuff,
          playerId: p.id,
          x: cx,
          y: cy,
          animationKey: skill.id,
          value,
          frames: buff.durationMs,
          targetIds,
        });
      }
    }
  }

  private pushBuff(p: CharacterState, skill: TreeSkill, value: number, durationMs: number): void {
    const buff: TreeSkill['buff'] = skill.buff;
    if (!buff) return;
    p.activeBuffs = p.activeBuffs.filter((b: ActiveBuff): boolean => b.skillId !== skill.id);
    p.activeBuffs.push({
      skillId: skill.id,
      remainingMs: durationMs,
      totalDurationMs: durationMs,
      stat: buff.stat,
      value,
    });
    if (buff.extra) {
      p.activeBuffs.push({
        skillId: skill.id,
        remainingMs: durationMs,
        totalDurationMs: durationMs,
        stat: buff.extra.stat,
        value: buff.extra.value,
      });
    }
    refreshDerivedStats(p);
  }

  /**
   * Another player's tree skill targeted us (Hyper Body, Rally). Any class can receive it: the buff
   * or heal goes on our own player, which we own.
   */
  applyAllyEffect(evt: VfxEvent): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDead || !evt.targetIds?.includes(p.id) || !evt.animationKey) return;
    const skill: TreeSkill | null = findTreeSkill(evt.animationKey);
    if (!skill) return;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    // Another client's numbers: only skills that reach allies, values inside their curve's range.
    if (skill.mechanic === 'rally') {
      if (p.isDown) return;
      const percent: number = this.clampToCurve(skill, 'healPercent', evt.value ?? 0);
      p.hp = Math.max(p.hp, Math.floor((p.derived.maxHp * percent) / 100));
    } else if (skill.buff && skill.buff.allyRadius > 0 && !skill.buff.percentOfDerived) {
      // Positions lag a little between clients: allow twice the radius.
      if (Math.hypot(evt.x - cx, evt.y - cy) > skill.buff.allyRadius * 2) return;
      const value: number = this.clampToCurve(skill, skill.buff.valueCurve, evt.value ?? 0);
      const duration: number = Math.max(0, Math.min(evt.frames ?? 0, skill.buff.durationMs));
      this.pushBuff(p, skill, value, duration);
    } else {
      return;
    }
    this.vfx.spawnBuffActivationParticles(cx, cy, skill.color);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.BuffActivation,
      playerId: p.id,
      x: cx,
      y: cy,
      color: skill.color,
    });
    this.e.onPlayerUpdate?.(p);
  }

  private clampToCurve(skill: TreeSkill, key: TreeCurveKey, value: number): number {
    const curve: StatCurve | undefined = skill.curves[key];
    if (!curve) return 0;
    return Math.max(curve.min, Math.min(curve.max, value));
  }

  // ─── Passives and reactions ───────────────────────

  private updateIronRecovery(p: CharacterState): void {
    const still: boolean =
      p.isGrounded && !p.isClimbing && Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY;
    if (!still) {
      this.stillTicks = 0;
      this.recoveryTimer = 0;
      return;
    }
    this.stillTicks++;
    const skill: TreeSkill | null = this.ownedMech('hp-recovery');
    if (!skill || this.stillTicks < GAME_CONSTANTS.SKILL_IRON_RECOVERY_STILL_TICKS) return;
    this.recoveryTimer++;
    if (this.recoveryTimer < GAME_CONSTANTS.SKILL_IRON_RECOVERY_INTERVAL_TICKS) return;
    this.recoveryTimer = 0;
    if (p.hp >= p.derived.maxHp) return;
    const amount: number = Math.max(
      1,
      Math.floor((p.derived.maxHp * treeSkillValue(skill, 'healPercent', p.stats)) / 100),
    );
    this.heal(p, amount);
  }

  private updateSecondWindHeal(p: CharacterState): void {
    if (this.secondWindHealTicks <= 0) return;
    this.secondWindHealTicks--;
    this.healCarry += this.secondWindHealPerTick;
    const whole: number = Math.floor(this.healCarry);
    if (whole <= 0) return;
    this.healCarry -= whole;
    p.hp = Math.min(p.derived.maxHp, p.hp + whole);
    this.e.onPlayerUpdate?.(p);
  }

  private updateLastStand(p: CharacterState): void {
    const skill: TreeSkill | null = this.ownedMech('last-stand');
    const on: boolean =
      skill !== null &&
      p.hp > 0 &&
      (p.hp / p.derived.maxHp) * 100 < GAME_CONSTANTS.SKILL_LAST_STAND_HP_PERCENT;
    if (on && !this.lastStandOn && skill) {
      this.animate(
        skill,
        p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
        p.facing,
      );
    }
    this.lastStandOn = on;
  }

  /** Second Wind: once per floor a killing blow leaves the player at 1 HP. True when it saved them. */
  trySecondWind(): boolean {
    const p: CharacterState | null = this.e.player;
    const skill: TreeSkill | null = this.ownedMech('second-wind');
    if (!p || !skill || this.secondWindUsed) return false;
    this.secondWindUsed = true;
    p.hp = 1;
    // A poison still ticking would kill the saved player at once.
    this.e.poisonEffect = null;
    this.e.invincibilityFrames = Math.max(
      this.e.invincibilityFrames,
      GAME_CONSTANTS.SKILL_SECOND_WIND_IFRAME_TICKS,
    );
    const total: number = (p.derived.maxHp * treeSkillValue(skill, 'healPercent', p.stats)) / 100;
    this.secondWindHealTicks = GAME_CONSTANTS.SKILL_SECOND_WIND_HEAL_TICKS;
    this.secondWindHealPerTick = total / GAME_CONSTANTS.SKILL_SECOND_WIND_HEAL_TICKS;
    this.healCarry = 0;
    this.animate(
      skill,
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      p.facing,
    );
    return true;
  }

  /** Ticks a revive takes for the local player (Rally shortens it). */
  reviveChannelTicks(): number {
    const p: CharacterState | null = this.e.player;
    const rally: TreeSkill | null = this.ownedMech('rally');
    if (!p || !rally) return GAME_CONSTANTS.REVIVE_CHANNEL_TICKS;
    const cut: number = treeSkillValue(rally, 'percent', p.stats);
    return Math.max(1, Math.round(GAME_CONSTANTS.REVIVE_CHANNEL_TICKS * (1 - cut / 100)));
  }

  /** The local player revived someone: Rally sends them back up with more HP. */
  onReviveDone(targetId: string): void {
    const p: CharacterState | null = this.e.player;
    const rally: TreeSkill | null = this.ownedMech('rally');
    if (!p || !rally) return;
    const target: CharacterState | undefined = this.e.remotePlayers.find(
      (rp: CharacterState): boolean => rp.id === targetId,
    );
    const x: number = (target?.x ?? p.x) + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const y: number = (target?.y ?? p.y) + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.animate(rally, x, y, p.facing);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.AllyBuff,
      playerId: p.id,
      x,
      y,
      animationKey: rally.id,
      value: Math.round(treeSkillValue(rally, 'healPercent', p.stats)),
      frames: 0,
      targetIds: [targetId],
    });
  }

  // ─── Combat hooks ─────────────────────────────────

  hitMultiplier(z: ZombieState, basic: boolean): number {
    const p: CharacterState | null = this.e.player;
    if (!p) return 1;
    let mult: number = 1;
    const heavy: TreeSkill | null = basic ? this.ownedMech('heavy-hands') : null;
    if (heavy && (z.stunTicks > 0 || !z.isGrounded || z.knockbackFrames > 0)) {
      mult *= 1 + treeSkillValue(heavy, 'percent', p.stats) / 100;
    }
    const lastStand: TreeSkill | null = this.lastStandOn ? this.ownedMech('last-stand') : null;
    if (lastStand) mult *= 1 + treeSkillValue(lastStand, 'percent', p.stats) / 100;
    return mult;
  }

  afterHit(z: ZombieState, damage: number, basic: boolean): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const executioner: TreeSkill | null = this.ownedMech('executioner');
    if (
      executioner &&
      !z.isDead &&
      z.hp > 0 &&
      z.stunTicks > 0 &&
      !this.isBoss(z) &&
      z.hp <= (z.maxHp * treeSkillValue(executioner, 'percent', p.stats)) / 100
    ) {
      this.animate(executioner, z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2, p.facing);
      this.combat.dealDamage(z, z.hp, true, executioner.color, false);
    }
    const heavy: TreeSkill | null = basic ? this.ownedMech('heavy-hands') : null;
    if (heavy && !z.isDead) {
      this.affect(z, 'stun', 0, 0, GAME_CONSTANTS.SKILL_HEAVY_HANDS_STAGGER_MS);
    }
    const lastStand: TreeSkill | null = this.lastStandOn ? this.ownedMech('last-stand') : null;
    if (lastStand && damage > 0 && p.hp < p.derived.maxHp) {
      const amount: number = Math.max(
        1,
        Math.floor((damage * treeSkillValue(lastStand, 'lifestealPercent', p.stats)) / 100),
      );
      p.hp = Math.min(p.derived.maxHp, p.hp + amount);
      this.e.onPlayerUpdate?.(p);
    }
  }

  onKill(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const dashSkill: TreeSkill | null = this.ownedMech('dash');
    if (dashSkill && this.ownedMech('rampage') && (this.e.dashPhase || this.rampageWindow > 0)) {
      this.e.skillCooldowns.set(dashSkill.id, 0);
    }
    const adrenaline: TreeSkill | null = this.ownedMech('adrenaline');
    if (!adrenaline) return;
    this.adrenalineStacks = Math.min(
      GAME_CONSTANTS.SKILL_ADRENALINE_MAX_STACKS,
      this.adrenalineStacks + 1,
    );
    const percent: number = treeSkillValue(adrenaline, 'percent', p.stats) * this.adrenalineStacks;
    p.activeBuffs = p.activeBuffs.filter((b: ActiveBuff): boolean => b.skillId !== adrenaline.id);
    refreshDerivedStats(p);
    const duration: number = GAME_CONSTANTS.SKILL_ADRENALINE_WINDOW_MS;
    p.activeBuffs.push(
      {
        skillId: adrenaline.id,
        remainingMs: duration,
        totalDurationMs: duration,
        stat: 'attackSpeed',
        value: Math.round(percent),
      },
      {
        skillId: adrenaline.id,
        remainingMs: duration,
        totalDurationMs: duration,
        stat: 'speed',
        value: (p.derived.speed * percent) / 100,
      },
    );
    refreshDerivedStats(p);
  }

  tryParry(zombieX: number, zombie: ZombieState | null): boolean {
    const p: CharacterState | null = this.e.player;
    const counter: TreeSkill | null = this.ownedMech('counter');
    if (!p || !counter || this.parryTicks <= 0 || !zombie || zombie.isDead) return false;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const facingIt: boolean = zombieX >= cx === (p.facing === Direction.Right);
    if (!facingIt) return false;
    this.parryTicks = 0;
    this.combat.cancelAttack();
    this.e.invincibilityFrames = Math.max(
      this.e.invincibilityFrames,
      GAME_CONSTANTS.SKILL_PARRY_IFRAME_TICKS,
    );
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    this.animate(
      counter,
      cx + (dir * GAME_CONSTANTS.PLAYER_WIDTH) / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      p.facing,
    );
    this.pose();
    this.affect(zombie, 'stun', dir, 0, GAME_CONSTANTS.SKILL_PARRY_STUN_MS);
    this.combat.dealSkillDamage(zombie, counter.damageMult, counter.color, {
      knockback: true,
      forceCrit: true,
    });
    this.combat.finishHits();
    return true;
  }

  // ─── Helpers ──────────────────────────────────────

  affectZombie(
    z: ZombieState,
    kind: ZombieEffectKind,
    dir: number,
    force: number,
    stunMs: number,
  ): void {
    this.affect(z, kind, dir, force, stunMs);
  }

  /** A skill's push, launch or stun: applied here when we simulate zombies, else asked of the host. */
  private affect(
    z: ZombieState,
    kind: ZombieEffectKind,
    dir: number,
    force: number,
    stunMs: number,
  ): void {
    const req: ZombieEffectRequest = {
      zombieId: z.id,
      kind,
      dir,
      force,
      stunMs: Math.round(stunMs),
    };
    if (this.e.isMultiplayerClient) this.e.pendingZombieEffects.push(req);
    else applyZombieEffect(z, req, this.e.fixedDt);
  }

  private hittable(z: ZombieState): boolean {
    return !z.isDead && z.spawnTimer <= 0;
  }

  private isBoss(z: ZombieState): boolean {
    return z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss;
  }

  /** The nearest zombie in front of the player within `range` px of the body. */
  private frontTarget(p: CharacterState, range: number): ZombieState | null {
    const w: number = GAME_CONSTANTS.PLAYER_WIDTH;
    const x: number = p.facing === Direction.Right ? p.x : p.x - range;
    const cx: number = p.x + w / 2;
    let best: ZombieState | null = null;
    let bestDist: number = Infinity;
    for (const z of this.e.zombies) {
      if (!this.hittable(z)) continue;
      if (
        !this.physics.rectsOverlap(
          x,
          p.y,
          w + range,
          GAME_CONSTANTS.PLAYER_HEIGHT,
          z.x,
          z.y,
          z.instanceWidth,
          z.instanceHeight,
        )
      )
        continue;
      const dist: number = Math.abs(z.x + z.instanceWidth / 2 - cx);
      if (dist < bestDist) {
        bestDist = dist;
        best = z;
      }
    }
    return best;
  }

  /** Plays the skill's animation here and on every other screen. */
  private animate(skill: TreeSkill, x: number, y: number, facing: Direction): void {
    const p: CharacterState | null = this.e.player;
    if (!skill.animationKey || !p) return;
    const level: number = GAME_CONSTANTS.TREE_SKILL_VFX_LEVEL;
    this.vfx.triggerSkillAnimation(skill.animationKey, x, y, facing, level);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.SkillAnimation,
      playerId: p.id,
      x,
      y,
      animationKey: skill.animationKey,
      facing,
      level,
    });
  }

  /** The attack pose for a skill that has no swing of its own. */
  private pose(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    p.isAttacking = true;
    this.e.attackAnimTicks = this.msToTicks(GAME_CONSTANTS.PLAYER_SKILL_ANIM_MS);
    this.e.spriteAnimator.restart();
  }

  private heal(p: CharacterState, amount: number): void {
    p.hp = Math.min(p.derived.maxHp, p.hp + amount);
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    this.vfx.spawnDamageNumber(cx, p.y - 10, amount, false, '#44ff44');
    this.e.pendingVfxEvents.push({
      type: VfxEventType.DamageNumber,
      playerId: p.id,
      x: cx,
      y: p.y - 10,
      value: amount,
      isCrit: false,
      color: '#44ff44',
    });
    this.e.onPlayerUpdate?.(p);
  }

  private msToTicks(ms: number): number {
    return Math.max(1, Math.round(ms / this.e.fixedDt));
  }
}
