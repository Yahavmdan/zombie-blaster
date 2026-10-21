import { expect } from '@playwright/test';
import { GamePlayer, KEYS } from './game-player';
import { E2eSnapshot, E2eTreeSkillView, E2eVfxLogEntry, E2eZombieView } from './probe';
import { WORLD } from './invariants';

/** Open ground the skill tests need around the player (dash, charge run, both sides of a cleave). */
const ARENA_SPAN: number = 520;
/** Tough-floor tests fight one zombie up close: less flat ground will do. */
const TOUGH_ARENA_SPAN: number = 300;

/** The warrior tree's skill ids (shared/game-constants.ts WARRIOR_SKILL_TREE). */
export const WARRIOR = {
  powerDash: 'warrior-power-dash',
  slashBlast: 'warrior-slash-blast',
  groundSlam: 'warrior-ground-slam',
  shoulderCharge: 'warrior-shoulder-charge',
  carry1: 'warrior-carry-1',
  backstep: 'warrior-backstep',
  carry2: 'warrior-carry-2',
  monsterMagnet: 'warrior-monster-magnet',
  leapStrike: 'warrior-leap-strike',
  adrenaline: 'warrior-adrenaline',
  rampage: 'warrior-rampage',
  ironRecovery: 'warrior-iron-recovery',
  autoPotion: 'warrior-auto-potion',
  powerStance: 'warrior-power-stance',
  hyperBody: 'warrior-hyper-body',
  counter: 'warrior-counter',
  secondWind: 'warrior-second-wind',
  rally: 'warrior-rally',
  lastStand: 'warrior-last-stand',
} as const;

/**
 * Attack-button combos (shared/skill-tree.ts AttackCombo, timings ATTACK_* in game-constants.ts), with
 * margin: double tap within 300 ms, hold 250 ms in the air, hold 1 s on the ground then 0.8 s of charge.
 */
export const COMBO = {
  hold: 'hold',
  airHold: 'air-hold',
  doubleTap: 'double-tap',
} as const;
/** One tap of a double tap (two of them back to back stay well inside ATTACK_DOUBLE_TAP_MS). */
const TAP_MS: number = 40;
/** Held this long in the air: past ATTACK_AIR_HOLD_MS (250). */
const AIR_HOLD_PRESS_MS: number = 400;
/** Held this long on the ground: ATTACK_HOLD_MS (1000) + ATTACK_CHARGE_MS (800), full charge. */
export const FULL_CHARGE_MS: number = 2_000;
/** Held this long: under ATTACK_HOLD_MS, no charge starts. */
export const SHORT_HOLD_MS: number = 600;

/**
 * A warrior owning exactly `skills`, standing on open ground (nothing overhead, room on both sides),
 * facing right. The bar actives and buffs among `skills` fill the skill bar in that order (keys
 * 1-6); combo skills (Power Dash, Ground Slam, Slash Blast) fire from the attack button instead.
 * Returns the player's x. Solo/host only (teleport + setup controls).
 */
export async function warriorArena(
  p: GamePlayer,
  skills: string[],
  godMode: boolean = true,
  floor: number = 1,
): Promise<number> {
  if ((await p.probe.state()).floor !== floor) await p.probe.setFloor(floor);
  await p.probe.setGodMode(godMode);
  await p.probe.setTreeSkills(skills);
  // Tough floors are crowded overhead: there the tests only need flat ground (no jumps).
  const x: number = await openArena(p, floor === 1);
  const standX: number = Math.round(x + (floor === 1 ? ARENA_SPAN : TOUGH_ARENA_SPAN) / 2);
  await p.probe.teleport(standX, WORLD.groundY - WORLD.playerHeight);
  await p.probe.waitFor(
    'standing on the arena ground',
    (st: E2eSnapshot): boolean =>
      st.player!.isGrounded && Math.abs(st.player!.y + WORLD.playerHeight - WORLD.groundY) < 2,
    { timeoutMs: 5_000 },
  );
  await p.face('right');
  await p.probe.waitFor('owns the skills', (st: E2eSnapshot): boolean =>
    skills.every((id: string): boolean =>
      st.treeSkills.some((t: E2eTreeSkillView): boolean => t.id === id && t.owned),
    ),
  );
  return (await p.probe.state()).player!.x;
}

/** Ground with nothing overhead and no props, ARENA_SPAN wide: returns its left edge. */
export async function openArena(p: GamePlayer, openSky: boolean): Promise<number> {
  for (let seed: number = 1; seed <= 40; seed++) {
    await p.probe.clearPickables(0, WORLD.width);
    const x: number | null = clearSpanX(
      await p.probe.state(),
      openSky ? ARENA_SPAN : TOUGH_ARENA_SPAN,
      openSky,
    );
    if (x !== null) return x;
    await p.probe.setLayoutSeed(seed * 7919);
  }
  throw new Error('no layout with enough open ground');
}

/**
 * Left edge of ground `span` wide with no prop left on it and, with `openSky`, no platform
 * overhead either (jumps), or null.
 */
function clearSpanX(s: E2eSnapshot, span: number, openSky: boolean): number | null {
  const reachY: number = WORLD.groundY - WORLD.playerHeight * 2;
  const blockers: Array<{ x: number; width: number }> = [
    ...s.level.platforms.filter(
      (pl: { y: number; height: number }): boolean =>
        pl.y < WORLD.groundY && (openSky || pl.y + pl.height > reachY),
    ),
    ...s.level.props.filter((pr: { exploded: boolean }): boolean => !pr.exploded),
  ];
  for (let x: number = 60; x + span < WORLD.width - 60; x += 10) {
    if (
      blockers.every(
        (b: { x: number; width: number }): boolean => b.x >= x + span || b.x + b.width <= x,
      )
    )
      return x;
  }
  return null;
}

/** Spawns a zombie climbing out of the ground at x and waits until it can be hit. Returns its id. */
export async function zombieAt(p: GamePlayer, x: number): Promise<string> {
  const before: Set<string> = new Set<string>(
    (await p.probe.state()).zombies.map((z: E2eZombieView): string => z.id),
  );
  await p.probe.spawnZombieAt(x);
  const s: E2eSnapshot = await p.probe.waitFor(
    'the new zombie is up',
    (st: E2eSnapshot): boolean =>
      st.zombies.some((z: E2eZombieView): boolean => !before.has(z.id) && z.spawnTimer <= 0),
    { timeoutMs: 6_000 },
  );
  return s.zombies.find((z: E2eZombieView): boolean => !before.has(z.id) && z.spawnTimer <= 0)!.id;
}

/**
 * Floor for tests that need a zombie to survive a few warrior hits: zombie HP grows 15% per floor
 * and a level-1 warrior's swing kills any floor-1 walker in one hit. Not a puzzle floor.
 */
export const TOUGH_FLOOR: number = 30;

/** Walks the player up to the zombie (gap center to center), facing it. */
export async function walkUpTo(p: GamePlayer, id: string, gap: number = 44): Promise<void> {
  for (let i: number = 0; i < 40; i++) {
    const s: E2eSnapshot = await p.probe.state();
    const z: E2eZombieView | undefined = zombieById(s, id);
    if (!z || z.isDead) return;
    const dx: number = z.x + z.width / 2 - (s.player!.x + WORLD.playerWidth / 2);
    if (Math.abs(dx) <= gap) {
      await p.face(dx >= 0 ? 'right' : 'left');
      return;
    }
    await p.press(dx > 0 ? KEYS.right : KEYS.left, 60);
  }
}

export function zombieById(s: E2eSnapshot, id: string): E2eZombieView | undefined {
  return s.zombies.find((z: E2eZombieView): boolean => z.id === id);
}

/** Damage taken so far (a dead zombie counts as fully damaged). */
export function damageOf(s: E2eSnapshot, id: string): number {
  const z: E2eZombieView | undefined = zombieById(s, id);
  if (!z || z.isDead) return Infinity;
  return z.maxHp - z.hp;
}

/** The skill-bar slot (0..5) holding the skill, -1 when it isn't on the bar. */
export function barSlotOf(s: E2eSnapshot, id: string): number {
  return s.treeSkills.find((t: E2eTreeSkillView): boolean => t.id === id)?.barSlot ?? -1;
}

/** The attack-button combo that fires the skill (`COMBO`), null for a skill-bar skill. */
export function comboOf(s: E2eSnapshot, id: string): string | null {
  return s.treeSkills.find((t: E2eTreeSkillView): boolean => t.id === id)?.combo ?? null;
}

/**
 * Fires a tree skill the way a player does: its combo on the attack button (double tap, hold in the
 * air, hold and let go at full charge) or its skill-bar key (1-6). Fails when a bar skill isn't on
 * the bar.
 */
export async function castSkill(p: GamePlayer, id: string, s?: E2eSnapshot): Promise<void> {
  const snap: E2eSnapshot = s ?? (await p.probe.state());
  const combo: string | null = comboOf(snap, id);
  if (combo === COMBO.doubleTap) return doubleTapAttack(p);
  if (combo === COMBO.airHold) return airHoldAttack(p, snap);
  if (combo === COMBO.hold) return p.press(KEYS.attack, FULL_CHARGE_MS);
  const slot: number = barSlotOf(snap, id);
  expect(slot, `${id} is on the skill bar`).toBeGreaterThanOrEqual(0);
  await p.castSkill(slot + 1);
}

/** Two quick attack presses. */
export async function doubleTapAttack(p: GamePlayer): Promise<void> {
  await p.press(KEYS.attack, TAP_MS);
  await p.press(KEYS.attack, TAP_MS);
}

/** Jumps (unless already airborne) and holds attack in the air. */
export async function airHoldAttack(p: GamePlayer, s?: E2eSnapshot): Promise<void> {
  const grounded: boolean = (s ?? (await p.probe.state())).player!.isGrounded;
  if (grounded) {
    await p.hold(KEYS.jump);
    await p.probe.waitFor(
      'airborne for the air hold',
      (st: E2eSnapshot): boolean =>
        !st.player!.isGrounded && st.player!.y < WORLD.groundY - WORLD.playerHeight - 30,
      { timeoutMs: 2_000, intervalMs: 20 },
    );
    await p.release(KEYS.jump);
  }
  await p.press(KEYS.attack, AIR_HOLD_PRESS_MS);
}

export function cooldownOf(s: E2eSnapshot, id: string): number {
  return s.treeSkills.find((t: E2eTreeSkillView): boolean => t.id === id)?.cooldownTicks ?? 0;
}

export function animationsIn(events: E2eVfxLogEntry[]): string[] {
  return events
    .filter((e: E2eVfxLogEntry): boolean => e.type === 'skill-animation' && !!e.animationKey)
    .map((e: E2eVfxLogEntry): string => e.animationKey!);
}

export async function expectAnimation(events: E2eVfxLogEntry[], key: string): Promise<void> {
  expect(animationsIn(events), `the ${key} animation was queued for other players`).toContain(key);
}

// ── AI players (bot.ts, brain.ts): fighting with the warrior's tree skills ──────

/** Same level for a fight: feet within this many px. */
const FIGHT_SAME_LEVEL_PX: number = 70;
/** A zombie this close (center to center) is in melee reach. */
const FIGHT_ADJACENT_PX: number = 60;
/** Power dash targets: a crowd this far ahead (dash distance is 160-320 px). */
const DASH_MIN_PX: number = 50;
const DASH_MAX_PX: number = 260;
/** Skills don't fire on a ladder; the AI keeps clear of one before using a skill. */
const LADDER_CLEAR_PX: number = 45;

/** The player owns this tree skill, can fire it (on the skill bar, or an attack combo) and it is off cooldown. */
export function treeSkillReady(s: E2eSnapshot, id: string): boolean {
  return s.treeSkills.some(
    (t: E2eTreeSkillView): boolean =>
      t.id === id && t.owned && (t.barSlot >= 0 || t.combo !== null) && t.cooldownTicks === 0,
  );
}

/** True for a skill-tree class (attack combos and the skill bar, keys 1-6). */
export function hasSkillTree(s: E2eSnapshot): boolean {
  return s.treeSkills.length > 0;
}

/**
 * One fight decision with the tree skills, played with real keys: slash blast (double tap) when
 * surrounded or crowded; when `allowDash`, shoulder charge (bar) into a single adjacent zombie and
 * power dash (hold and let go) into a crowd ahead.
 * Returns the skill used, or null when no skill fits (then the caller just swings).
 */
export async function fightWithSkills(
  p: GamePlayer,
  s: E2eSnapshot,
  allowDash: boolean,
): Promise<string | null> {
  const me: E2eSnapshot['player'] = s.player;
  if (!me || !me.isGrounded || me.isClimbing || me.carryingCorpseIds.length > 0) return null;
  const cx: number = me.x + WORLD.playerWidth / 2;
  const feet: number = me.y + WORLD.playerHeight;
  const dxs: number[] = s.zombies
    .filter(
      (z: E2eZombieView): boolean =>
        !z.isDead && z.spawnTimer <= 0 && Math.abs(z.y + z.height - feet) < FIGHT_SAME_LEVEL_PX,
    )
    .map((z: E2eZombieView): number => z.x + z.width / 2 - cx);
  const adjacent: number[] = dxs.filter((dx: number): boolean => Math.abs(dx) < FIGHT_ADJACENT_PX);
  const nearLadder: boolean = s.level.ropes.some(
    (r: { x: number; topY: number; bottomY: number }): boolean =>
      Math.abs(r.x - cx) < LADDER_CLEAR_PX && r.topY <= feet + 4 && r.bottomY >= feet - 4,
  );

  if (!nearLadder) {
    const surrounded: boolean =
      adjacent.some((dx: number): boolean => dx < 0) &&
      adjacent.some((dx: number): boolean => dx > 0);
    if (treeSkillReady(s, WARRIOR.slashBlast) && (surrounded || adjacent.length >= 3)) {
      await castSkill(p, WARRIOR.slashBlast, s);
      return WARRIOR.slashBlast;
    }
    if (allowDash && treeSkillReady(s, WARRIOR.shoulderCharge) && adjacent.length === 1) {
      await p.face(adjacent[0] >= 0 ? 'right' : 'left');
      await castSkill(p, WARRIOR.shoulderCharge, s);
      return WARRIOR.shoulderCharge;
    }
  }
  if (allowDash && treeSkillReady(s, WARRIOR.powerDash)) {
    const facing: number = me.facing === 'left' ? -1 : 1;
    for (const dir of [facing, -facing]) {
      const ahead: number = dxs.filter(
        (dx: number): boolean =>
          Math.sign(dx) === dir && Math.abs(dx) >= DASH_MIN_PX && Math.abs(dx) <= DASH_MAX_PX,
      ).length;
      if (ahead < 2) continue;
      await p.face(dir > 0 ? 'right' : 'left');
      await castSkill(p, WARRIOR.powerDash, s);
      return WARRIOR.powerDash;
    }
  }
  return null;
}

/** Monster magnet pulls zombies standing at least this far away (closer ones are struck). */
const MAGNET_MIN_PX: number = 120;
/** ...and at most this far (the pull range grows with str, 200 px at the least). */
const MAGNET_MAX_PX: number = 450;

/**
 * Monster magnet (its skill-bar key) when zombies stand on the player's level out of reach: drags
 * them to the player's feet. Returns true when it pulled.
 */
export async function pullWithMagnet(p: GamePlayer, s: E2eSnapshot): Promise<boolean> {
  const me: E2eSnapshot['player'] = s.player;
  if (!me || !me.isGrounded || me.isClimbing || !treeSkillReady(s, WARRIOR.monsterMagnet))
    return false;
  const cx: number = me.x + WORLD.playerWidth / 2;
  const feet: number = me.y + WORLD.playerHeight;
  const nearLadder: boolean = s.level.ropes.some(
    (r: { x: number; topY: number; bottomY: number }): boolean =>
      Math.abs(r.x - cx) < LADDER_CLEAR_PX && r.topY <= feet + 4 && r.bottomY >= feet - 4,
  );
  if (nearLadder) return false;
  const inRange: boolean = s.zombies.some((z: E2eZombieView): boolean => {
    const dx: number = Math.abs(z.x + z.width / 2 - cx);
    return (
      !z.isDead &&
      z.spawnTimer <= 0 &&
      Math.abs(z.y + z.height - feet) < FIGHT_SAME_LEVEL_PX &&
      dx >= MAGNET_MIN_PX &&
      dx <= MAGNET_MAX_PX
    );
  });
  if (!inRange) return false;
  await castSkill(p, WARRIOR.monsterMagnet, s);
  return true;
}
