import {
  CharacterClass,
  CharacterClassDefinition,
} from './character';
import {
  ZombieType,
  ZombieDefinition,
} from './game-entities';
import { KeyBindings } from './messages';
import { SkillDefinition } from './skill';

// ═══════════════════════════════════════════════════════════════
//  GAME CONSTANTS
//  Single source of truth for ALL tunable game variables.
//  Edit this file to adjust game balance, physics, combat, etc.
// ═══════════════════════════════════════════════════════════════

export const GAME_CONSTANTS = {

  // ─── Canvas & World ─────────────────────────────
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  GROUND_Y: 620,
  BACKGROUND_STAR_COUNT: 80,

  // ─── Physics ────────────────────────────────────
  GRAVITY: 0.5,
  TERMINAL_VELOCITY: 25,
  PLATFORM_SNAP_TOLERANCE: 6,

  // ─── Player Movement ────────────────────────────
  PLAYER_WIDTH: 32,
  PLAYER_HEIGHT: 48,
  PLAYER_JUMP_FORCE: -10,
  PLAYER_MOVE_SPEED: 5,
  PLAYER_FRICTION: .9,
  PLAYER_MIN_VELOCITY: 1,

  // ─── Player Combat ─────────────────────────────
  PLAYER_BASE_ATTACK_RANGE: 45,
  PLAYER_ATTACK_COOLDOWN_TICKS: 20,
  PLAYER_ATTACK_ANIM_MS: 200,
  PLAYER_SKILL_ANIM_MS: 300,
  INVINCIBILITY_FRAMES: 30,
  INVINCIBILITY_BLINK_RATE: 3,

  // ─── Knockback ──────────────────────────────────
  KNOCKBACK_FORCE_ZOMBIE: 8,
  KNOCKBACK_FORCE_PLAYER: 15,
  KNOCKBACK_UP_FORCE: -5,
  KNOCKBACK_ZOMBIE_FRAMES: 10,

  // ─── Player Derived Stat Formulas ───────────────
  PLAYER_BASE_HP: 50,
  PLAYER_BASE_MP: 30,
  PLAYER_ATTACK_STR_MULT: 2,
  PLAYER_ATTACK_DEX_MULT: 1,
  PLAYER_DEFENSE_STR_MULT: 1,
  PLAYER_DEFENSE_DEX_DIVISOR: 2,
  PLAYER_SPEED_PER_DEX: 0.05,
  PLAYER_CRIT_PER_LUK: 1.5,
  PLAYER_CRIT_RATE_CAP: 60,
  PLAYER_CRIT_DAMAGE_BASE: 150,
  PLAYER_CRIT_DAMAGE_PER_LUK: 2,

  // ─── XP & Leveling ─────────────────────────────
  XP_BASE: 100,
  XP_GROWTH: 1.5,

  // ─── Waves ──────────────────────────────────────
  WAVE_ZOMBIE_COUNT_BASE: 5,
  WAVE_ZOMBIE_COUNT_GROWTH: 3,
  WAVE_TRANSITION_TICKS: 120,
  WAVE_INITIAL_SPAWN_DELAY_TICKS: 60,

  // ─── Zombie Spawning ───────────────────────────
  ZOMBIE_SPAWN_INTERVAL_MS: 2000,
  ZOMBIE_SPAWN_MIN_INTERVAL_MS: 500,
  ZOMBIE_SPAWN_DECREASE_PER_WAVE: 100,
  ZOMBIE_HP_SCALE_PER_WAVE: 0.15,
  ZOMBIE_RUNNER_MIN_WAVE: 2,
  ZOMBIE_RUNNER_ROLL_THRESHOLD: 0.7,
  ZOMBIE_TANK_MIN_WAVE: 3,
  ZOMBIE_TANK_ROLL_THRESHOLD: 0.85,
  ZOMBIE_SPITTER_MIN_WAVE: 4,
  ZOMBIE_SPITTER_ROLL_THRESHOLD: 0.6,
  ZOMBIE_BOSS_MIN_WAVE: 5,
  ZOMBIE_BOSS_WAVE_INTERVAL: 5,

  // ─── Ropes ──────────────────────────────────────
  ROPE_CLIMB_SPEED: 5,
  ROPE_WIDTH: 6,
  ROPE_GRAB_RANGE: 20,

  // ─── Particles ──────────────────────────────────
  MAX_PARTICLES: 200,
  PARTICLE_LIFETIME_MS: 600,
  HIT_PARTICLE_COUNT: 6,
  HIT_PARTICLE_VELOCITY: 6,
  HIT_PARTICLE_UP_BIAS: 2,
  HIT_PARTICLE_LIFE: 30,
  DEATH_PARTICLE_COUNT: 15,
  DEATH_PARTICLE_VELOCITY: 10,
  DEATH_PARTICLE_UP_BIAS: 3,
  DEATH_PARTICLE_LIFE: 45,
  PARTICLE_GRAVITY: 0.15,

  // ─── Damage Numbers ────────────────────────────
  DAMAGE_NUMBER_LIFE_TICKS: 60,

  // ─── MP Potions ─────────────────────────────────
  MP_POTION_DROP_CHANCE: 0.25,
  MP_POTION_RESTORE_AMOUNT: 20,
  MP_POTION_LIFETIME: 600,
  MP_POTION_SIZE: 14,
  MP_POTION_POP_FORCE: -2,

  // ─── Tick Rate ──────────────────────────────────
  TICK_RATE: 50,

} as const;

// ─── Class Stat Multipliers ──────────────────────

export interface ClassMultiplier {
  hpMult: number;
  mpMult: number;
}

export const CLASS_MULTIPLIERS: Record<CharacterClass, ClassMultiplier> = {
  [CharacterClass.Warrior]: { hpMult: 12, mpMult: 4 },
  [CharacterClass.Ranger]: { hpMult: 8, mpMult: 6 },
  [CharacterClass.Mage]: { hpMult: 6, mpMult: 12 },
  [CharacterClass.Assassin]: { hpMult: 7, mpMult: 5 },
  [CharacterClass.Priest]: { hpMult: 8, mpMult: 10 },
};

// ─── Character Classes ───────────────────────────

export const CHARACTER_CLASSES: Record<CharacterClass, CharacterClassDefinition> = {
  [CharacterClass.Warrior]: {
    id: CharacterClass.Warrior,
    name: 'Warrior',
    description: 'Heavy melee fighter with high HP and defense. Cleaves through zombie hordes.',
    baseStats: { str: 15, dex: 8, int: 4, luk: 6 },
    growthPerLevel: { str: 5, dex: 2, int: 1, luk: 2 },
    color: '#ff4444',
    icon: '⚔️',
  },
  [CharacterClass.Ranger]: {
    id: CharacterClass.Ranger,
    name: 'Ranger',
    description: 'Ranged attacker with high DEX. Picks off zombies from a safe distance.',
    baseStats: { str: 8, dex: 15, int: 6, luk: 8 },
    growthPerLevel: { str: 2, dex: 5, int: 1, luk: 3 },
    color: '#44cc44',
    icon: '🏹',
  },
  [CharacterClass.Mage]: {
    id: CharacterClass.Mage,
    name: 'Mage',
    description: 'Wields devastating AoE magic. Fragile but deals massive damage.',
    baseStats: { str: 4, dex: 6, int: 18, luk: 5 },
    growthPerLevel: { str: 1, dex: 2, int: 6, luk: 2 },
    color: '#6644ff',
    icon: '🔮',
  },
  [CharacterClass.Assassin]: {
    id: CharacterClass.Assassin,
    name: 'Assassin',
    description: 'Lightning-fast strikes and high crit chance. Thrives on lucky hits.',
    baseStats: { str: 10, dex: 12, int: 4, luk: 14 },
    growthPerLevel: { str: 3, dex: 3, int: 1, luk: 5 },
    color: '#cc44cc',
    icon: '🗡️',
  },
  [CharacterClass.Priest]: {
    id: CharacterClass.Priest,
    name: 'Priest',
    description: 'Support class that heals allies and smites undead with holy damage.',
    baseStats: { str: 6, dex: 6, int: 14, luk: 8 },
    growthPerLevel: { str: 1, dex: 2, int: 5, luk: 3 },
    color: '#ffcc44',
    icon: '✨',
  },
};

// ─── Zombie Types ────────────────────────────────

export const ZOMBIE_TYPES: Record<ZombieType, ZombieDefinition> = {
  [ZombieType.Walker]: {
    type: ZombieType.Walker,
    name: 'Walker',
    baseHp: 30,
    baseDamageMin: 30,
    baseDamageMax: 50,
    speed: 1,
    xpReward: 10,
    color: '#558833',
    width: 28,
    height: 40,
  },
  [ZombieType.Runner]: {
    type: ZombieType.Runner,
    name: 'Runner',
    baseHp: 20,
    baseDamageMin: 30,
    baseDamageMax: 50,
    speed: 3,
    xpReward: 15,
    color: '#886633',
    width: 24,
    height: 36,
  },
  [ZombieType.Tank]: {
    type: ZombieType.Tank,
    name: 'Tank',
    baseHp: 100,
    baseDamageMin: 10,
    baseDamageMax: 20,
    speed: 0.5,
    xpReward: 30,
    color: '#445522',
    width: 40,
    height: 48,
  },
  [ZombieType.Spitter]: {
    type: ZombieType.Spitter,
    name: 'Spitter',
    baseHp: 25,
    baseDamageMin: 8,
    baseDamageMax: 15,
    speed: 1.5,
    xpReward: 20,
    color: '#33aa55',
    width: 26,
    height: 38,
  },
  [ZombieType.Boss]: {
    type: ZombieType.Boss,
    name: 'Undead King',
    baseHp: 500,
    baseDamageMin: 25,
    baseDamageMax: 40,
    speed: 0.8,
    xpReward: 200,
    color: '#882222',
    width: 56,
    height: 64,
  },
};

// ─── Skills ──────────────────────────────────────

export const SKILLS: SkillDefinition[] = [
  {
    id: 'warrior-slash',
    name: 'Power Slash',
    classId: CharacterClass.Warrior,
    description: 'A mighty overhead slash dealing heavy damage.',
    mpCost: 10,
    cooldown: 1000,
    damage: 2.0,
    range: 60,
    unlockLevel: 1,
    icon: '⚔️',
  },
  {
    id: 'warrior-spin',
    name: 'Whirlwind',
    classId: CharacterClass.Warrior,
    description: 'Spin attack hitting all nearby enemies.',
    mpCost: 25,
    cooldown: 3000,
    damage: 1.5,
    range: 80,
    unlockLevel: 5,
    icon: '🌀',
  },
  {
    id: 'ranger-shot',
    name: 'Arrow Shot',
    classId: CharacterClass.Ranger,
    description: 'Fire an arrow at a distant target.',
    mpCost: 8,
    cooldown: 800,
    damage: 1.8,
    range: 300,
    unlockLevel: 1,
    icon: '🏹',
  },
  {
    id: 'ranger-rain',
    name: 'Arrow Rain',
    classId: CharacterClass.Ranger,
    description: 'Rain arrows on an area, hitting multiple zombies.',
    mpCost: 30,
    cooldown: 5000,
    damage: 1.2,
    range: 250,
    unlockLevel: 5,
    icon: '🌧️',
  },
  {
    id: 'mage-fireball',
    name: 'Fireball',
    classId: CharacterClass.Mage,
    description: 'Launch a fireball that explodes on impact.',
    mpCost: 15,
    cooldown: 1200,
    damage: 2.5,
    range: 200,
    unlockLevel: 1,
    icon: '🔥',
  },
  {
    id: 'mage-blizzard',
    name: 'Blizzard',
    classId: CharacterClass.Mage,
    description: 'Freeze and damage all enemies in an area.',
    mpCost: 40,
    cooldown: 6000,
    damage: 2.0,
    range: 150,
    unlockLevel: 5,
    icon: '❄️',
  },
  {
    id: 'assassin-strike',
    name: 'Shadow Strike',
    classId: CharacterClass.Assassin,
    description: 'A quick dash-attack with high crit chance.',
    mpCost: 12,
    cooldown: 900,
    damage: 2.2,
    range: 50,
    unlockLevel: 1,
    icon: '💨',
  },
  {
    id: 'assassin-poison',
    name: 'Venom Blade',
    classId: CharacterClass.Assassin,
    description: 'Coat blades in poison, dealing damage over time.',
    mpCost: 20,
    cooldown: 4000,
    damage: 1.0,
    range: 40,
    unlockLevel: 5,
    icon: '☠️',
  },
  {
    id: 'priest-smite',
    name: 'Holy Smite',
    classId: CharacterClass.Priest,
    description: 'Call holy light to smite undead foes.',
    mpCost: 12,
    cooldown: 1000,
    damage: 2.0,
    range: 150,
    unlockLevel: 1,
    icon: '☀️',
  },
  {
    id: 'priest-heal',
    name: 'Heal',
    classId: CharacterClass.Priest,
    description: 'Restore HP to yourself and nearby allies.',
    mpCost: 25,
    cooldown: 4000,
    damage: -1.5,
    range: 100,
    unlockLevel: 5,
    icon: '💚',
  },
];

// ─── Default Key Bindings ────────────────────────

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  jump: [' '],
  attack: ['j'],
  skill1: ['k'],
  skill2: ['l'],
};
