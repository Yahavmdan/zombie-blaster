import { BuffStat, CharacterClass, CharacterStats } from './character';
import { PixelIconId } from './pixel-icon';
import { SkillType } from './skill';

/**
 * Skill trees (classes listed in `SKILL_TREES`): one point per level, one point per skill, no skill
 * levels. A skill's strength comes from the player's stats through `StatCurve`s. Ownership is
 * `skillLevels[id] === 1`. A few attacks fire from the attack button (`AttackCombo`); the other
 * actives and buffs fire from the skill bar (`CharacterState.skillBar`, keys 1-6, one key = one
 * skill); passives and reactives work by themselves.
 */

export type ScalingStat = keyof CharacterStats;

/** A value that grows with one stat and flattens out: `min + (max - min) * s / (s + half)`. */
export interface StatCurve {
  readonly stat: ScalingStat;
  readonly min: number;
  readonly max: number;
  /** The stat value that gives the halfway point. */
  readonly half: number;
}

/** Named secondary values a skill can scale (each mechanic reads the ones it needs). */
export type TreeCurveKey =
  | 'range'
  | 'radius'
  | 'distance'
  | 'knockback'
  | 'launch'
  | 'stunMs'
  | 'iframesMs'
  | 'windowMs'
  | 'percent'
  | 'healPercent'
  | 'lifestealPercent'
  | 'chance'
  | 'cooldownCut';

export type TreeSkillMechanic =
  | 'strike'
  | 'cleave'
  | 'uppercut'
  | 'ground-slam'
  | 'heavy-hands'
  | 'executioner'
  | 'roar'
  | 'dash'
  | 'shoulder-charge'
  | 'backstep'
  | 'pull'
  | 'leap-strike'
  | 'adrenaline'
  | 'rampage'
  | 'carry'
  | 'hp-recovery'
  | 'auto-potion'
  | 'buff'
  | 'counter'
  | 'second-wind'
  | 'rally'
  | 'last-stand';

/** How an attack-button skill fires (it takes no skill-bar slot). Each combo belongs to one skill per tree. */
export enum AttackCombo {
  /** Hold attack on the ground: charging starts after a moment; let go to fire. */
  Hold = 'hold',
  /** Hold attack in the air. */
  AirHold = 'air-hold',
  /** Two quick attack presses. */
  DoubleTap = 'double-tap',
}

export interface TreeSkillBuff {
  readonly stat: BuffStat;
  readonly durationMs: number;
  /** Curve giving the buff value (percent for percent stats). */
  readonly valueCurve: TreeCurveKey;
  /** The curve is a percent of the caster's current derived stat (e.g. +20% defense), not a flat value. */
  readonly percentOfDerived: boolean;
  /** Also buffs allies within this many px of the caster (0 = self only). */
  readonly allyRadius: number;
  /** A second stat applied with the same value (e.g. stance: knockback resist alongside defense). */
  readonly extra: { readonly stat: BuffStat; readonly value: number } | null;
}

export interface TreeSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly classId: CharacterClass;
  readonly branch: string;
  /** 1..5; unlocks at `SKILL_TIER_LEVELS[tier - 1]`. */
  readonly tier: number;
  /** Layout column inside the branch (0..2). */
  readonly column: number;
  /** Owning any one of these unlocks the skill (empty = a branch root). */
  readonly parents: readonly string[];
  readonly type: SkillType;
  readonly mechanic: TreeSkillMechanic;
  /** Fired from the attack button instead of the skill bar (null = a bar skill or a passive). */
  readonly combo: AttackCombo | null;
  readonly icon: PixelIconId;
  readonly color: string;
  readonly animationKey: string | null;
  /** Damage = attack × this (0 for utility). */
  readonly damageMult: number;
  readonly maxTargets: number;
  readonly mpCost: number;
  /** HP cost in percent of max HP. */
  readonly hpCostPercent: number;
  /** The skill can't be used at or below this HP percent. */
  readonly minHpPercent: number;
  readonly cooldownMs: number;
  readonly curves: Readonly<Partial<Record<TreeCurveKey, StatCurve>>>;
  readonly buff: TreeSkillBuff | null;
  /** Capstone of its branch (tier 5). */
  readonly capstone: boolean;
}

export interface SkillTreeBranch {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: PixelIconId;
  readonly blurb: string;
}

export interface ClassSkillTree {
  readonly classId: CharacterClass;
  readonly branches: readonly SkillTreeBranch[];
  readonly skills: readonly TreeSkill[];
}

export type TreeLockReason = 'owned' | 'level' | 'parent' | 'points';

export function curveValue(curve: StatCurve, stats: CharacterStats): number {
  const s: number = Math.max(0, stats[curve.stat]);
  return curve.min + (curve.max - curve.min) * (s / (s + curve.half));
}

/** The skill's named value for these stats, or `fallback` when the skill has no such curve. */
export function treeSkillValue(
  skill: TreeSkill,
  key: TreeCurveKey,
  stats: CharacterStats,
  fallback: number = 0,
): number {
  const curve: StatCurve | undefined = skill.curves[key];
  return curve ? curveValue(curve, stats) : fallback;
}

/** Cooldown after the stat-based cut (`cooldownCut` is the fraction removed, 0..1). */
export function treeSkillCooldownMs(skill: TreeSkill, stats: CharacterStats): number {
  const cut: number = treeSkillValue(skill, 'cooldownCut', stats);
  return Math.round(skill.cooldownMs * (1 - Math.min(0.9, Math.max(0, cut))));
}

export function ownsTreeSkill(skillLevels: Readonly<Record<string, number>>, id: string): boolean {
  return (skillLevels[id] ?? 0) > 0;
}

export function countOwnedTreeSkills(
  tree: ClassSkillTree,
  skillLevels: Readonly<Record<string, number>>,
): number {
  return tree.skills.filter((s: TreeSkill): boolean => ownsTreeSkill(skillLevels, s.id)).length;
}

/** Why the skill can't be learned right now, or null when it can. */
export function treeSkillLockReason(
  skill: TreeSkill,
  skillLevels: Readonly<Record<string, number>>,
  characterLevel: number,
  unspentPoints: number,
  tierLevels: readonly number[],
): TreeLockReason | null {
  if (ownsTreeSkill(skillLevels, skill.id)) return 'owned';
  if (characterLevel < tierLevels[skill.tier - 1]) return 'level';
  if (
    skill.parents.length > 0 &&
    !skill.parents.some((p: string): boolean => ownsTreeSkill(skillLevels, p))
  ) {
    return 'parent';
  }
  if (unspentPoints <= 0) return 'points';
  return null;
}

/** Actives and buffs go on the skill bar; attack-button combos, passives and reactives don't. */
export function isSlottable(skill: TreeSkill): boolean {
  return (skill.type === SkillType.Active || skill.type === SkillType.Buff) && skill.combo === null;
}

/**
 * The skill bar cleaned for this tree: exactly `slots` entries, each an owned slottable skill (at
 * most once) or null. Reads anything (a saved or relayed bar is not trusted).
 */
export function normalizeSkillBar(
  tree: ClassSkillTree,
  skillLevels: Readonly<Record<string, number>>,
  bar: readonly unknown[] | null | undefined,
  slots: number,
): Array<string | null> {
  const out: Array<string | null> = [];
  const seen: Set<string> = new Set<string>();
  for (let i: number = 0; i < slots; i++) {
    const id: unknown = bar?.[i];
    const skill: TreeSkill | undefined =
      typeof id === 'string' ? tree.skills.find((s: TreeSkill): boolean => s.id === id) : undefined;
    const keep: boolean =
      !!skill && isSlottable(skill) && ownsTreeSkill(skillLevels, skill.id) && !seen.has(skill.id);
    out.push(keep && skill ? skill.id : null);
    if (keep && skill) seen.add(skill.id);
  }
  return out;
}

/**
 * Puts a skill in a slot (null empties it). A skill already on the bar moves there and swaps places
 * with whatever held the slot.
 */
export function placeOnSkillBar(
  bar: readonly (string | null)[],
  slot: number,
  id: string | null,
): Array<string | null> {
  const next: Array<string | null> = [...bar];
  if (slot < 0 || slot >= next.length) return next;
  if (id !== null) {
    const from: number = next.indexOf(id);
    if (from >= 0) next[from] = next[slot];
  }
  next[slot] = id;
  return next;
}

/** A newly learned skill goes to the first empty slot (unchanged when it is on the bar or the bar is full). */
export function autoSlotSkill(bar: readonly (string | null)[], id: string): Array<string | null> {
  if (bar.includes(id)) return [...bar];
  const empty: number = bar.indexOf(null);
  return empty < 0 ? [...bar] : placeOnSkillBar(bar, empty, id);
}

/** The owned skill fired by this attack-button combo, if any. */
export function ownedComboSkill(
  tree: ClassSkillTree,
  skillLevels: Readonly<Record<string, number>>,
  combo: AttackCombo,
): TreeSkill | null {
  return (
    tree.skills.find(
      (s: TreeSkill): boolean => s.combo === combo && ownsTreeSkill(skillLevels, s.id),
    ) ?? null
  );
}

/** The owned skill with this mechanic, if any (passives and reactives are looked up this way). */
export function ownedSkillByMechanic(
  tree: ClassSkillTree,
  skillLevels: Readonly<Record<string, number>>,
  mechanic: TreeSkillMechanic,
): TreeSkill | null {
  return (
    tree.skills.find(
      (s: TreeSkill): boolean => s.mechanic === mechanic && ownsTreeSkill(skillLevels, s.id),
    ) ?? null
  );
}
