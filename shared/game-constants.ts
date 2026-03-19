import {
  CharacterClass,
  CharacterClassDefinition,
  CharacterStats,
} from './character';
import {
  ZombieType,
  ZombieDefinition,
  DropType,
  ShopItemDefinition,
} from './game-entities';
import { KeyBindings } from './messages';
import { SkillDefinition, SkillType } from './skill';

// ═══════════════════════════════════════════════════════════════
//  GAME CONSTANTS
//  Single source of truth for ALL tunable game variables.
//  Edit this file to adjust game balance, physics, combat, etc.
// ═══════════════════════════════════════════════════════════════

export const GAME_CONSTANTS = {

  // ─── Canvas & World ─────────────────────────────
  CANVAS_WIDTH: 1280, // Width of the game screen in pixels
  CANVAS_HEIGHT: 720, // Height of the game screen in pixels
  GROUND_Y: 620, // Y position of the ground floor (pixels from top)
  BACKGROUND_STAR_COUNT: 80, // Number of decorative stars drawn in the background

  // ─── Physics ────────────────────────────────────
  GRAVITY: 0.5, // Downward pull applied every tick to airborne entities
  TERMINAL_VELOCITY: 25, // Maximum falling speed anything can reach
  PLATFORM_SNAP_TOLERANCE: 6, // How close (pixels) you must be to a platform edge to land on it
  PLATFORM_DROP_TICKS: 8, // How many ticks the player falls through a platform when pressing down

  // ─── Player Movement ────────────────────────────
  PLAYER_WIDTH: 32, // Player hitbox width in pixels
  PLAYER_HEIGHT: 48, // Player hitbox height in pixels
  PLAYER_JUMP_FORCE: -10, // Upward velocity applied when jumping (negative = up)
  PLAYER_MOVE_SPEED: 5, // Horizontal speed when walking
  PLAYER_FRICTION: .9, // Ground friction multiplier each tick (closer to 0 = more slippery)
  PLAYER_AIR_DRAG: 0.98, // Air resistance multiplier each tick while airborne
  PLAYER_MIN_VELOCITY: 1, // Speeds below this are snapped to zero (stops sliding)

  // ─── Player Combat ─────────────────────────────
  PLAYER_BASE_ATTACK_RANGE: 50, // How far (pixels) the basic attack reaches beyond the player body
  PLAYER_ATTACK_COOLDOWN_TICKS: 24, // Minimum ticks between basic attacks
  PLAYER_ATTACK_ANIM_MS: 480, // How long the attack animation plays in milliseconds
  PLAYER_ATTACK_HIT_DELAY_MS: 240, // Delay after pressing attack before damage is actually dealt
  PLAYER_SKILL_ANIM_MS: 480, // How long skill attack animations play in milliseconds
  INVINCIBILITY_FRAMES: 90, // Ticks of invincibility after the player takes damage
  INVINCIBILITY_BLINK_RATE: 3, // Player blinks every N ticks during invincibility

  // ─── Knockback ──────────────────────────────────
  KNOCKBACK_FORCE_PLAYER: 6, // How far the player is pushed back when hit by a zombie
  KNOCKBACK_FORCE_ZOMBIE: 8, // How far a zombie is pushed back when hit by the player
  KNOCKBACK_UP_FORCE: -5, // Upward pop applied during any knockback (negative = up)
  KNOCKBACK_ZOMBIE_FRAMES: 10, // How many ticks a zombie stays in knockback before regaining control

  // ─── Player Derived Stat Formulas ───────────────
  PLAYER_BASE_HP: 50, // Starting HP at level 1 before any stat bonuses
  PLAYER_BASE_MP: 30, // Starting MP at level 1 before any stat bonuses
  PLAYER_HP_PER_LEVEL: 25, // Extra max HP gained per level up
  PLAYER_MP_PER_LEVEL: 3, // Extra max MP gained per level up
  PLAYER_SPEED_PER_DEX: 0.05, // Bonus move speed per point of DEX
  PLAYER_CRIT_RATE_CAP: 60, // Maximum critical hit chance in percent
  PLAYER_CRIT_DAMAGE_BASE: 150, // Base critical hit damage as a percent of normal damage

  // ─── XP & Leveling ─────────────────────────────
  XP_BASE: 120, // XP needed to reach level 2
  XP_GROWTH: 1.6, // Each level requires this much more XP than the previous one
  STAT_POINTS_PER_LEVEL: 5, // Stat points awarded per level up
  SKILL_POINTS_PER_LEVEL: 3, // Skill points awarded per level up
  MAX_SKILL_LEVEL: 20, // Highest level any skill can be raised to

  // ─── Level Progression ─────────────────────────
  LEVEL_TRANSITION_TICKS: 120, // Ticks the "level complete" screen shows before the next level
  LEVEL_INITIAL_SPAWN_DELAY_TICKS: 60, // Ticks before zombies start spawning at the start of a new level
  LEVEL_MAX_ALIVE_ZOMBIES_BASE: 10, // Max zombies alive at once on level 1
  LEVEL_MAX_ALIVE_ZOMBIES_GROWTH: 2, // Extra max zombies added per level
  LEVEL_MAX_ALIVE_ZOMBIES_CAP: 30, // Absolute max zombies alive at once regardless of level

  // ─── Exit Platform (level exit) ───────────────
  EXIT_PLATFORM_Y: 130, // Y position of the exit platform (pixels from top)
  EXIT_PLATFORM_WIDTH: 250, // Width of the exit platform in pixels
  EXIT_PLATFORM_HEIGHT: 20, // Height of the exit platform in pixels

  // ─── Zombie Spawning ───────────────────────────
  ZOMBIE_SPAWN_INTERVAL_MS: 2000, // Time between zombie spawns in milliseconds
  ZOMBIE_SPAWN_MIN_INTERVAL_MS: 500, // Fastest possible spawn interval after scaling
  ZOMBIE_SPAWN_DECREASE_PER_WAVE: 100, // Spawn interval shrinks by this many ms each wave
  ZOMBIE_HP_SCALE_PER_WAVE: 0.15, // Zombie HP increases by this fraction each wave (0.15 = +15%)
  ZOMBIE_DAMAGE_SCALE_PER_WAVE: 0.08, // Zombie damage increases by this fraction each wave
  ZOMBIE_RUNNER_MIN_WAVE: 2, // First wave that Runner zombies can appear
  ZOMBIE_RUNNER_ROLL_THRESHOLD: 0.7, // Chance (0-1) a spawn is NOT a Runner when eligible
  ZOMBIE_TANK_MIN_WAVE: 3, // First wave that Tank zombies can appear
  ZOMBIE_TANK_ROLL_THRESHOLD: 0.85, // Chance (0-1) a spawn is NOT a Tank when eligible
  ZOMBIE_SPITTER_MIN_WAVE: 4, // First wave that Spitter zombies can appear
  ZOMBIE_SPITTER_ROLL_THRESHOLD: 0.6, // Chance (0-1) a spawn is NOT a Spitter when eligible
  ZOMBIE_BOSS_MIN_WAVE: 5, // First wave a Boss can spawn
  ZOMBIE_BOSS_WAVE_INTERVAL: 5, // A Boss spawns every N waves
  ZOMBIE_DRAGON_BOSS_MIN_WAVE: 10, // First wave the Dragon Boss can spawn
  ZOMBIE_DRAGON_BOSS_WAVE_INTERVAL: 10, // Dragon Boss spawns every N waves

  // ─── Dragon Boss ─────────────────────────────
  DRAGON_HOVER_Y_OFFSET: 140, // How high above the ground the dragon hovers
  DRAGON_ATTACK_RANGE: 350, // Distance at which the dragon starts shooting fireballs
  DRAGON_KEEP_DISTANCE: 280, // Dragon tries to stay at least this far from the player
  DRAGON_APPROACH_SPEED_MULT: 0.6, // Dragon moves at this fraction of its base speed when approaching
  DRAGON_PROJECTILE_SPEED: 7, // How fast dragon fireballs travel in pixels per tick
  DRAGON_PROJECTILE_LIFETIME: 100, // How many ticks a dragon fireball lives before disappearing

  // ─── Spitter (Ranged Poison) ────────────────
  SPITTER_ATTACK_RANGE: 280, // Distance at which the spitter starts shooting
  SPITTER_KEEP_DISTANCE: 200, // Spitter tries to stay at least this far from the player
  SPITTER_PROJECTILE_SPEED: 5, // How fast spitter projectiles travel in pixels per tick
  SPITTER_PROJECTILE_LIFETIME: 80, // How many ticks a spitter projectile lives before disappearing
  SPITTER_PROJECTILE_GRAVITY: 0.08, // Downward pull on spitter projectiles (arcing shots)
  SPITTER_POISON_DURATION_TICKS: 150, // Total ticks the poison effect lasts on the player
  SPITTER_POISON_TICK_INTERVAL: 25, // Ticks between each poison damage tick
  SPITTER_POISON_DAMAGE_PER_TICK: 3, // Base damage dealt per poison tick
  SPITTER_POISON_DAMAGE_WAVE_SCALE: 0.5, // Extra poison damage scaling per wave

  // ─── Zombie AI ────────────────────────────────
  ZOMBIE_ORBIT_MIN: 25, // Closest distance a zombie tries to orbit around the player
  ZOMBIE_ORBIT_MAX: 55, // Farthest distance a zombie tries to orbit around the player
  ZOMBIE_ORBIT_ARRIVE_THRESHOLD: 15, // How close to the orbit target before the zombie considers it "arrived"
  ZOMBIE_JUMP_FORCE: -9.5, // Upward velocity when a zombie jumps (negative = up)
  ZOMBIE_JUMP_COOLDOWN_MIN: 80, // Minimum ticks between zombie jumps
  ZOMBIE_JUMP_COOLDOWN_MAX: 200, // Maximum ticks between zombie jumps
  ZOMBIE_JUMP_CHANCE_PER_TICK: 0.015, // Probability each tick that a zombie decides to jump
  ZOMBIE_JUMP_PLATFORM_CHASE_CHANCE: 0.04, // Chance per tick a zombie jumps to chase the player onto a platform
  ZOMBIE_ATTACK_RANGE: 35, // How close a zombie must be to melee attack the player
  ZOMBIE_ATTACK_COOLDOWN_MIN: 40, // Minimum ticks between zombie attacks
  ZOMBIE_ATTACK_COOLDOWN_MAX: 70, // Maximum ticks between zombie attacks
  ZOMBIE_ATTACK_ANIM_TICKS: 12, // Duration of the zombie attack animation in ticks
  ZOMBIE_ATTACK_HIT_TICK: 6, // Tick within the attack animation when damage is actually dealt
  ZOMBIE_HESITATION_RANGE_MIN: 0, // Minimum extra distance a zombie pauses before attacking
  ZOMBIE_HESITATION_RANGE_MAX: 40, // Maximum extra distance a zombie pauses before attacking
  ZOMBIE_CONTACT_DAMAGE_MULT: 0.5, // Damage multiplier when a zombie walks into the player (no attack anim)
  ZOMBIE_PLATFORM_DROP_TICKS: 10, // Ticks a zombie falls through a platform when dropping down
  ZOMBIE_PLATFORM_DROP_CHANCE: 0.03, // Chance per tick a zombie drops through its current platform
  ZOMBIE_REACTION_DELAY_MIN_TICKS: 5, // Minimum ticks before a zombie reacts to the player
  ZOMBIE_REACTION_DELAY_MAX_TICKS: 50, // Maximum ticks before a zombie reacts to the player
  ZOMBIE_DETECTION_RANGE: 0.5, // Fraction of canvas width a zombie can detect the player from
  ZOMBIE_IDLE_WANDER_SPEED_MULT: 0.3, // Speed multiplier when a zombie is wandering idly
  ZOMBIE_IDLE_DIRECTION_CHANGE_CHANCE: 0.015, // Chance per tick an idle zombie turns around
  ZOMBIE_IDLE_ATTACK_CHANCE: 0.004, // Chance per tick an idle zombie randomly swings
  ZOMBIE_IDLE_STOP_CHANCE: 0.02, // Chance per tick an idle wandering zombie stops moving

  // ─── Zombie-to-Zombie Collision ────────────────
  ZOMBIE_COLLISION_PUSH_STRENGTH: 0.45, // How hard two overlapping zombies push each other apart
  ZOMBIE_COLLISION_Y_TOLERANCE: 20, // Vertical tolerance for two zombies to be considered on the same level
  ZOMBIE_CROWD_OVERLAP_LIMIT: 5, // Max number of overlapping zombies before crowd-push kicks in
  ZOMBIE_CROWD_PUSH_STRENGTH: 0.08, // Extra push applied when too many zombies overlap in a crowd

  // ─── Zombie-on-Zombie Climbing ───────────────
  ZOMBIE_CLIMB_SNAP_TOLERANCE: 10, // How close a zombie must be to another's top to climb on it
  ZOMBIE_CLIMB_WIDTH_RATIO: 0.7, // Fraction of a zombie's width used for climb collision checks

  // ─── Zombie Spawn Animation ────────────────────
  ZOMBIE_SPAWN_ANIM_TICKS: 50, // Duration of the rising-from-ground spawn animation in ticks

  // ─── Zombie Corpse ─────────────────────────────
  ZOMBIE_CORPSE_LINGER_TICKS: 999_999, // How long a corpse stays on screen before fading (very large = nearly forever)
  ZOMBIE_CORPSE_PLATFORM_HEIGHT: 12, // Height of the invisible platform a corpse becomes
  ZOMBIE_CORPSE_SNAP_TOLERANCE: 16, // How close something must be to snap onto a corpse platform
  ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO: 0.55, // Fraction of corpse width used as a walkable platform
  ZOMBIE_CORPSE_SLIDE_OFFSET: 4, // Small horizontal offset applied to corpses so they don't stack perfectly
  ZOMBIE_CORPSE_DEATH_SCATTER: 0.2, // Random horizontal scatter applied to corpses on death
  ZOMBIE_CORPSE_DIVERSE_CHANCE: 0.45, // Chance a corpse uses a different visual variant
  ZOMBIE_CORPSE_BLOOD_CHANCE: 0.3, // Chance a corpse shows a blood splatter

  // ─── Ropes ──────────────────────────────────────
  ROPE_CLIMB_SPEED: 5, // How fast the player moves up/down on a rope
  ROPE_WIDTH: 20, // Visual width of ropes in pixels
  ROPE_GRAB_RANGE: 24, // How close the player must be to grab a rope
  ROPE_JUMP_COOLDOWN_TICKS: 12, // Ticks before the player can grab a rope again after jumping off

  // ─── Particles ──────────────────────────────────
  MAX_PARTICLES: 400, // Maximum particles alive at once (oldest removed when exceeded)
  PARTICLE_LIFETIME_MS: 600, // Default particle lifetime in milliseconds
  HIT_PARTICLE_COUNT: 6, // Number of particles spawned per hit
  HIT_PARTICLE_VELOCITY: 6, // Speed of hit particles flying outward
  HIT_PARTICLE_UP_BIAS: 2, // Extra upward push on hit particles
  HIT_PARTICLE_LIFE: 30, // Lifetime of hit particles in ticks
  DEATH_PARTICLE_COUNT: 15, // Number of particles spawned when a zombie dies
  DEATH_PARTICLE_VELOCITY: 10, // Speed of death particles flying outward
  DEATH_PARTICLE_UP_BIAS: 3, // Extra upward push on death particles
  DEATH_PARTICLE_LIFE: 45, // Lifetime of death particles in ticks
  PARTICLE_GRAVITY: 0.15, // Downward pull on particles each tick

  // ─── Damage Numbers ────────────────────────────
  DAMAGE_NUMBER_LIFE_TICKS: 60, // How many ticks a floating damage number stays visible

  // ─── Drop Rates ───────────────────────────────
  DROP_HP_POTION_CHANCE: 0.02, // Chance (0-1) a killed zombie drops an HP potion
  DROP_MP_POTION_CHANCE: 0.02, // Chance (0-1) a killed zombie drops an MP potion
  DROP_GOLD_CHANCE: 0.55, // Chance (0-1) a killed zombie drops gold
  DROP_GOLD_MIN: 5, // Minimum gold dropped per drop
  DROP_GOLD_MAX: 25, // Maximum gold dropped per drop
  DROP_GOLD_WAVE_BONUS: 3, // Extra gold added to drops per wave
  DROP_LIFETIME: 600, // Ticks before an uncollected drop disappears
  DROP_SIZE: 14, // Visual size of drop items in pixels
  DROP_POP_FORCE: -2, // Upward pop when a drop spawns (negative = up)

  // ─── Potions ──────────────────────────────────
  HP_POTION_RESTORE: 50, // HP restored when using an HP potion
  MP_POTION_RESTORE: 30, // MP restored when using an MP potion
  POTION_USE_COOLDOWN_TICKS: 30, // Ticks before another potion can be used

  // ─── Auto Potion ─────────────────────────────
  AUTO_POTION_HP_THRESHOLD_PERCENT: 50, // Auto-use HP potion when HP drops below this percent
  AUTO_POTION_MP_THRESHOLD_PERCENT: 30, // Auto-use MP potion when MP drops below this percent

  // ─── Shop ────────────────────────────────────
  SHOP_HP_POTION_PRICE: 30, // Gold cost to buy one HP potion
  SHOP_MP_POTION_PRICE: 20, // Gold cost to buy one MP potion

  // ─── Tick Rate ──────────────────────────────────
  TICK_RATE: 50, // Game loop runs at this many ticks per second

} as const;

// ─── Class Stat Weights (MapleStory-style) ──────

export interface ClassStatWeights {
  primaryStat: keyof CharacterStats;
  secondaryStat: keyof CharacterStats;
  attackFromPrimary: number;
  attackFromSecondary: number;
  defenseFromStr: number;
  defenseFromDex: number;
  hpPerStr: number;
  mpPerInt: number;
  critFromLuk: number;
  critDmgFromLuk: number;
}

export const CLASS_STAT_WEIGHTS: Record<CharacterClass, ClassStatWeights> = {
  [CharacterClass.Warrior]: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    attackFromPrimary: 3.5,
    attackFromSecondary: 1.0,
    defenseFromStr: 0.5,
    defenseFromDex: 0.2,
    hpPerStr: 12,
    mpPerInt: 4,
    critFromLuk: 0.5,
    critDmgFromLuk: 1.0,
  },
  [CharacterClass.Ranger]: {
    primaryStat: 'dex',
    secondaryStat: 'str',
    attackFromPrimary: 3.5,
    attackFromSecondary: 1.0,
    defenseFromStr: 0.2,
    defenseFromDex: 0.35,
    hpPerStr: 8,
    mpPerInt: 6,
    critFromLuk: 1.0,
    critDmgFromLuk: 1.5,
  },
  [CharacterClass.Mage]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 4.0,
    attackFromSecondary: 0.5,
    defenseFromStr: 0.1,
    defenseFromDex: 0.1,
    hpPerStr: 6,
    mpPerInt: 14,
    critFromLuk: 1.0,
    critDmgFromLuk: 2.0,
  },
  [CharacterClass.Assassin]: {
    primaryStat: 'luk',
    secondaryStat: 'dex',
    attackFromPrimary: 3.0,
    attackFromSecondary: 1.5,
    defenseFromStr: 0.2,
    defenseFromDex: 0.35,
    hpPerStr: 7,
    mpPerInt: 5,
    critFromLuk: 2.0,
    critDmgFromLuk: 3.0,
  },
  [CharacterClass.Priest]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 3.5,
    attackFromSecondary: 0.8,
    defenseFromStr: 0.2,
    defenseFromDex: 0.2,
    hpPerStr: 8,
    mpPerInt: 12,
    critFromLuk: 0.8,
    critDmgFromLuk: 1.5,
  },
};

// ─── Character Classes ───────────────────────────

export const CHARACTER_CLASSES: Record<CharacterClass, CharacterClassDefinition> = {
  [CharacterClass.Warrior]: {
    id: CharacterClass.Warrior,
    name: 'Warrior',
    description: 'Heavy melee fighter with high HP and defense. Cleaves through zombie hordes.',
    baseStats: { str: 15, dex: 8, int: 4, luk: 6 },
    color: '#ff4444',
    icon: '⚔️',
  },
  [CharacterClass.Ranger]: {
    id: CharacterClass.Ranger,
    name: 'Ranger',
    description: 'Ranged attacker with high DEX. Picks off zombies from a safe distance.',
    baseStats: { str: 8, dex: 15, int: 6, luk: 8 },
    color: '#44cc44',
    icon: '🏹',
  },
  [CharacterClass.Mage]: {
    id: CharacterClass.Mage,
    name: 'Mage',
    description: 'Wields devastating AoE magic. Fragile but deals massive damage.',
    baseStats: { str: 4, dex: 6, int: 18, luk: 5 },
    color: '#6644ff',
    icon: '🔮',
  },
  [CharacterClass.Assassin]: {
    id: CharacterClass.Assassin,
    name: 'Assassin',
    description: 'Lightning-fast strikes and high crit chance. Thrives on lucky hits.',
    baseStats: { str: 10, dex: 12, int: 4, luk: 14 },
    color: '#cc44cc',
    icon: '🗡️',
  },
  [CharacterClass.Priest]: {
    id: CharacterClass.Priest,
    name: 'Priest',
    description: 'Support class that heals allies and smites undead with holy damage.',
    baseStats: { str: 6, dex: 6, int: 14, luk: 8 },
    color: '#ffcc44',
    icon: '✨',
  },
};

// ─── Zombie Types ────────────────────────────────

export const ZOMBIE_TYPES: Record<ZombieType, ZombieDefinition> = {
  [ZombieType.Walker]: {
    type: ZombieType.Walker,
    name: 'Walker',
    hpMin: 22, hpMax: 40,
    damageMinLow: 30, damageMinHigh: 48,
    damageMaxLow: 55, damageMaxHigh: 75,
    speedMin: 0.4, speedMax: 0.8,
    knockbackMin: 6, knockbackMax: 10,
    hesitationMin: 70, hesitationMax: 110,
    xpRewardMin: 4, xpRewardMax: 7,
    widthMin: 25, widthMax: 35,
    heightMin: 37, heightMax: 45,
    attackAnimTicks: 20,
    attackHitTick: 10,
  },
  [ZombieType.Runner]: {
    type: ZombieType.Runner,
    name: 'Runner',
    hpMin: 14, hpMax: 28,
    damageMinLow: 32, damageMinHigh: 50,
    damageMaxLow: 58, damageMaxHigh: 80,
    speedMin: 1.4, speedMax: 2.3,
    knockbackMin: 4, knockbackMax: 8,
    hesitationMin: 35, hesitationMax: 65,
    xpRewardMin: 6, xpRewardMax: 11,
    widthMin: 22, widthMax: 35,
    heightMin: 33, heightMax: 45,
    attackAnimTicks: 20,
    attackHitTick: 10,
  },
  [ZombieType.Tank]: {
    type: ZombieType.Tank,
    name: 'Tank',
    hpMin: 75, hpMax: 135,
    damageMinLow: 12, damageMinHigh: 22,
    damageMaxLow: 28, damageMaxHigh: 42,
    speedMin: 0.2, speedMax: 0.45,
    knockbackMin: 3, knockbackMax: 6,
    hesitationMin: 85, hesitationMax: 130,
    xpRewardMin: 12, xpRewardMax: 20,
    widthMin: 36, widthMax: 55,
    heightMin: 44, heightMax: 60,
    attackAnimTicks: 30,
    attackHitTick: 15,
  },
  [ZombieType.Spitter]: {
    type: ZombieType.Spitter,
    name: 'Spitter',
    hpMin: 18, hpMax: 35,
    damageMinLow: 10, damageMinHigh: 20,
    damageMaxLow: 24, damageMaxHigh: 36,
    speedMin: 0.65, speedMax: 1.2,
    knockbackMin: 5, knockbackMax: 9,
    hesitationMin: 75, hesitationMax: 115,
    xpRewardMin: 7, xpRewardMax: 14,
    widthMin: 23, widthMax: 35,
    heightMin: 35, heightMax: 44,
    attackAnimTicks: 20,
    attackHitTick: 10,
  },
  [ZombieType.Boss]: {
    type: ZombieType.Boss,
    name: 'Undead King',
    hpMin: 400, hpMax: 650,
    damageMinLow: 35, damageMinHigh: 55,
    damageMaxLow: 60, damageMaxHigh: 85,
    speedMin: 0.35, speedMax: 0.65,
    knockbackMin: 3, knockbackMax: 5,
    hesitationMin: 45, hesitationMax: 80,
    xpRewardMin: 80, xpRewardMax: 130,
    widthMin: 52, widthMax: 70,
    heightMin: 60, heightMax: 77,
    attackAnimTicks: 20,
    attackHitTick: 10,
  },
  [ZombieType.DragonBoss]: {
    type: ZombieType.DragonBoss,
    name: 'Ancient Dragon',
    hpMin: 1600, hpMax: 2500,
    damageMinLow: 65, damageMinHigh: 100,
    damageMaxLow: 110, damageMaxHigh: 155,
    speedMin: 0.5, speedMax: 0.9,
    knockbackMin: 3, knockbackMax: 5,
    hesitationMin: 25, hesitationMax: 55,
    xpRewardMin: 800, xpRewardMax: 1250,
    widthMin: 130, widthMax: 150,
    heightMin: 120, heightMax: 140,
    attackAnimTicks: 36,
    attackHitTick: 18,
  },
};

// ─── Skills ─────────────────────────────────────

export const SKILLS: SkillDefinition[] = [

  // ═══ WARRIOR ═══
  {
    id: 'warrior-power-strike',
    name: 'Power Strike',
    classId: CharacterClass.Warrior,
    type: SkillType.Active,
    description: 'Use MP to deliver a killer blow to a single monster with a melee weapon.',
    maxLevel: 20,
    requiredCharacterLevel: 3,
    icon: '⚔️',
    color: '#ff4444',
    scaling: {
      baseDamage: 1.65, damagePerLevel: 0.05,
      baseMpCost: 4, mpCostPerLevel: 0.42,
      baseCooldown: 800, cooldownReductionPerLevel: 15,
      baseRange: 55, rangePerLevel: 1,
    },
    levelData: [
      { mpCost: 4,  hpCost: 0, damage: 1.65 },
      { mpCost: 4,  hpCost: 0, damage: 1.70 },
      { mpCost: 4,  hpCost: 0, damage: 1.75 },
      { mpCost: 4,  hpCost: 0, damage: 1.80 },
      { mpCost: 5,  hpCost: 0, damage: 1.85 },
      { mpCost: 5,  hpCost: 0, damage: 1.90 },
      { mpCost: 5,  hpCost: 0, damage: 1.95 },
      { mpCost: 6,  hpCost: 0, damage: 2.00 },
      { mpCost: 6,  hpCost: 0, damage: 2.05 },
      { mpCost: 7,  hpCost: 0, damage: 2.10 },
      { mpCost: 7,  hpCost: 0, damage: 2.15 },
      { mpCost: 8,  hpCost: 0, damage: 2.20 },
      { mpCost: 8,  hpCost: 0, damage: 2.25 },
      { mpCost: 9,  hpCost: 0, damage: 2.30 },
      { mpCost: 9,  hpCost: 0, damage: 2.35 },
      { mpCost: 10, hpCost: 0, damage: 2.40 },
      { mpCost: 10, hpCost: 0, damage: 2.45 },
      { mpCost: 11, hpCost: 0, damage: 2.50 },
      { mpCost: 11, hpCost: 0, damage: 2.55 },
      { mpCost: 12, hpCost: 0, damage: 2.60 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 1,
    aoeRadius: 0,
    animationKey: 'warrior-power-strike',
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 1,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'warrior-slash-blast',
    name: 'Slash Blast',
    classId: CharacterClass.Warrior,
    type: SkillType.Active,
    description: 'Use HP and MP to attack up to 6 enemies around you with a melee weapon.',
    maxLevel: 20,
    requiredCharacterLevel: 5,
    icon: '🌀',
    color: '#ff6644',
    scaling: {
      baseDamage: 0.72, damagePerLevel: 0.03,
      baseMpCost: 6, mpCostPerLevel: 0.42,
      baseCooldown: 1200, cooldownReductionPerLevel: 20,
      baseRange: 80, rangePerLevel: 2,
    },
    levelData: [
      { mpCost: 6,  hpCost: 8,  damage: 0.72 },
      { mpCost: 6,  hpCost: 8,  damage: 0.75 },
      { mpCost: 6,  hpCost: 8,  damage: 0.78 },
      { mpCost: 6,  hpCost: 8,  damage: 0.81 },
      { mpCost: 7,  hpCost: 9,  damage: 0.84 },
      { mpCost: 7,  hpCost: 9,  damage: 0.87 },
      { mpCost: 7,  hpCost: 9,  damage: 0.90 },
      { mpCost: 8,  hpCost: 10, damage: 0.93 },
      { mpCost: 8,  hpCost: 10, damage: 0.96 },
      { mpCost: 9,  hpCost: 11, damage: 0.99 },
      { mpCost: 9,  hpCost: 11, damage: 1.02 },
      { mpCost: 10, hpCost: 12, damage: 1.05 },
      { mpCost: 10, hpCost: 12, damage: 1.08 },
      { mpCost: 11, hpCost: 13, damage: 1.11 },
      { mpCost: 11, hpCost: 13, damage: 1.14 },
      { mpCost: 12, hpCost: 14, damage: 1.17 },
      { mpCost: 12, hpCost: 14, damage: 1.20 },
      { mpCost: 13, hpCost: 15, damage: 1.23 },
      { mpCost: 13, hpCost: 15, damage: 1.26 },
      { mpCost: 14, hpCost: 16, damage: 1.30 },
    ],
    prerequisite: { skillId: 'warrior-power-strike', level: 1 },
    buffEffect: null,
    buffDuration: null,
    hitCount: 1,
    aoeRadius: 80,
    animationKey: 'warrior-slash-blast',
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 6,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR ACTIVE (Dash) ═══
  {
    id: 'warrior-power-dash',
    name: 'Power Dash',
    classId: CharacterClass.Warrior,
    type: SkillType.Active,
    description: 'Make a mad dash forward, pushing off up to 10 monsters.',
    maxLevel: 30,
    requiredCharacterLevel: 10,
    icon: '💨',
    color: '#ff8844',
    scaling: {
      baseDamage: 0.72, damagePerLevel: 0.02,
      baseMpCost: 22, mpCostPerLevel: 2,
      baseCooldown: 1500, cooldownReductionPerLevel: 20,
      baseRange: 200, rangePerLevel: 4,
    },
    levelData: [
      { mpCost: 22, hpCost: 0, damage: 0.72, range: 200 },
      { mpCost: 24, hpCost: 0, damage: 0.74, range: 200 },
      { mpCost: 26, hpCost: 0, damage: 0.76, range: 200 },
      { mpCost: 28, hpCost: 0, damage: 0.78, range: 213 },
      { mpCost: 30, hpCost: 0, damage: 0.80, range: 213 },
      { mpCost: 32, hpCost: 0, damage: 0.82, range: 213 },
      { mpCost: 34, hpCost: 0, damage: 0.84, range: 213 },
      { mpCost: 36, hpCost: 0, damage: 0.86, range: 225 },
      { mpCost: 38, hpCost: 0, damage: 0.88, range: 225 },
      { mpCost: 40, hpCost: 0, damage: 0.90, range: 225 },
      { mpCost: 42, hpCost: 0, damage: 0.92, range: 238 },
      { mpCost: 44, hpCost: 0, damage: 0.94, range: 238 },
      { mpCost: 46, hpCost: 0, damage: 0.96, range: 238 },
      { mpCost: 48, hpCost: 0, damage: 0.98, range: 250 },
      { mpCost: 50, hpCost: 0, damage: 1.00, range: 250 },
      { mpCost: 52, hpCost: 0, damage: 1.02, range: 250 },
      { mpCost: 54, hpCost: 0, damage: 1.04, range: 263 },
      { mpCost: 56, hpCost: 0, damage: 1.06, range: 263 },
      { mpCost: 58, hpCost: 0, damage: 1.08, range: 263 },
      { mpCost: 60, hpCost: 0, damage: 1.10, range: 275 },
      { mpCost: 59, hpCost: 0, damage: 1.12, range: 275 },
      { mpCost: 58, hpCost: 0, damage: 1.14, range: 288 },
      { mpCost: 57, hpCost: 0, damage: 1.16, range: 288 },
      { mpCost: 56, hpCost: 0, damage: 1.18, range: 288 },
      { mpCost: 55, hpCost: 0, damage: 1.20, range: 300 },
      { mpCost: 54, hpCost: 0, damage: 1.22, range: 300 },
      { mpCost: 53, hpCost: 0, damage: 1.24, range: 300 },
      { mpCost: 52, hpCost: 0, damage: 1.26, range: 313 },
      { mpCost: 51, hpCost: 0, damage: 1.28, range: 313 },
      { mpCost: 50, hpCost: 0, damage: 1.30, range: 313 },
    ],
    prerequisite: { skillId: 'warrior-slash-blast', level: 5 },
    buffEffect: null,
    buffDuration: null,
    hitCount: 1,
    aoeRadius: 0,
    animationKey: 'warrior-power-dash',
    passiveEffect: null,
    mechanic: 'dash',
    maxTargets: 10,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR PASSIVE ═══
  {
    id: 'warrior-improved-hp-recovery',
    name: 'Improved HP Recovery',
    classId: CharacterClass.Warrior,
    type: SkillType.Passive,
    description: 'Recover additional HP every 10 seconds while standing still.',
    maxLevel: 16,
    requiredCharacterLevel: 1,
    icon: '💚',
    color: '#44cc44',
    scaling: {
      baseDamage: 3, damagePerLevel: 3,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 3 },
      { mpCost: 0, hpCost: 0, damage: 6 },
      { mpCost: 0, hpCost: 0, damage: 9 },
      { mpCost: 0, hpCost: 0, damage: 12 },
      { mpCost: 0, hpCost: 0, damage: 15 },
      { mpCost: 0, hpCost: 0, damage: 18 },
      { mpCost: 0, hpCost: 0, damage: 21 },
      { mpCost: 0, hpCost: 0, damage: 24 },
      { mpCost: 0, hpCost: 0, damage: 27 },
      { mpCost: 0, hpCost: 0, damage: 30 },
      { mpCost: 0, hpCost: 0, damage: 33 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 39 },
      { mpCost: 0, hpCost: 0, damage: 42 },
      { mpCost: 0, hpCost: 0, damage: 45 },
      { mpCost: 0, hpCost: 0, damage: 50 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'hpRecovery',
      intervalMs: 10_000,
      condition: 'standingStill',
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR BUFF (Defensive) ═══
  {
    id: 'warrior-power-stance',
    name: 'Power Stance',
    classId: CharacterClass.Warrior,
    type: SkillType.Buff,
    description: 'Enables one to stay at the same spot after being struck, resisting knock-back effects.',
    maxLevel: 30,
    requiredCharacterLevel: 7,
    icon: '🛡️',
    color: '#ff9944',
    scaling: {
      baseDamage: 42, damagePerLevel: 1.65,
      baseMpCost: 30, mpCostPerLevel: 0.8,
      baseCooldown: 1000, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 30, hpCost: 0, damage: 42 },
      { mpCost: 30, hpCost: 0, damage: 44 },
      { mpCost: 30, hpCost: 0, damage: 46 },
      { mpCost: 30, hpCost: 0, damage: 48 },
      { mpCost: 30, hpCost: 0, damage: 50 },
      { mpCost: 36, hpCost: 0, damage: 52 },
      { mpCost: 36, hpCost: 0, damage: 54 },
      { mpCost: 36, hpCost: 0, damage: 56 },
      { mpCost: 36, hpCost: 0, damage: 58 },
      { mpCost: 36, hpCost: 0, damage: 60 },
      { mpCost: 42, hpCost: 0, damage: 62 },
      { mpCost: 42, hpCost: 0, damage: 64 },
      { mpCost: 42, hpCost: 0, damage: 66 },
      { mpCost: 42, hpCost: 0, damage: 68 },
      { mpCost: 42, hpCost: 0, damage: 70 },
      { mpCost: 48, hpCost: 0, damage: 72 },
      { mpCost: 48, hpCost: 0, damage: 74 },
      { mpCost: 48, hpCost: 0, damage: 76 },
      { mpCost: 48, hpCost: 0, damage: 78 },
      { mpCost: 48, hpCost: 0, damage: 80 },
      { mpCost: 54, hpCost: 0, damage: 81 },
      { mpCost: 54, hpCost: 0, damage: 82 },
      { mpCost: 54, hpCost: 0, damage: 83 },
      { mpCost: 54, hpCost: 0, damage: 84 },
      { mpCost: 54, hpCost: 0, damage: 85 },
      { mpCost: 53, hpCost: 0, damage: 86 },
      { mpCost: 52, hpCost: 0, damage: 87 },
      { mpCost: 51, hpCost: 0, damage: 88 },
      { mpCost: 50, hpCost: 0, damage: 89 },
      { mpCost: 50, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: { stat: 'knockbackResist', baseValue: 42, valuePerLevel: 1.65 },
    buffDuration: { baseDurationMs: 10_000, durationPerLevelMs: 10_000 },
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'warrior-power-stance',
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR BUFF (Party) ═══
  {
    id: 'warrior-hyper-body',
    name: 'Hyper Body',
    classId: CharacterClass.Warrior,
    type: SkillType.Buff,
    description: 'Temporarily increases the Max HP and Max MP of all party members in the area.',
    maxLevel: 30,
    requiredCharacterLevel: 10,
    icon: '💪',
    color: '#44ddaa',
    scaling: {
      baseDamage: 2, damagePerLevel: 2,
      baseMpCost: 20, mpCostPerLevel: 1.4,
      baseCooldown: 1000, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 20, hpCost: 0, damage: 2 },
      { mpCost: 20, hpCost: 0, damage: 4 },
      { mpCost: 20, hpCost: 0, damage: 6 },
      { mpCost: 20, hpCost: 0, damage: 8 },
      { mpCost: 20, hpCost: 0, damage: 10 },
      { mpCost: 20, hpCost: 0, damage: 12 },
      { mpCost: 20, hpCost: 0, damage: 14 },
      { mpCost: 20, hpCost: 0, damage: 16 },
      { mpCost: 20, hpCost: 0, damage: 18 },
      { mpCost: 20, hpCost: 0, damage: 20 },
      { mpCost: 40, hpCost: 0, damage: 22 },
      { mpCost: 40, hpCost: 0, damage: 24 },
      { mpCost: 40, hpCost: 0, damage: 26 },
      { mpCost: 40, hpCost: 0, damage: 28 },
      { mpCost: 40, hpCost: 0, damage: 30 },
      { mpCost: 40, hpCost: 0, damage: 32 },
      { mpCost: 40, hpCost: 0, damage: 34 },
      { mpCost: 40, hpCost: 0, damage: 36 },
      { mpCost: 40, hpCost: 0, damage: 38 },
      { mpCost: 40, hpCost: 0, damage: 40 },
      { mpCost: 60, hpCost: 0, damage: 42 },
      { mpCost: 60, hpCost: 0, damage: 44 },
      { mpCost: 60, hpCost: 0, damage: 46 },
      { mpCost: 60, hpCost: 0, damage: 48 },
      { mpCost: 50, hpCost: 0, damage: 50 },
      { mpCost: 60, hpCost: 0, damage: 52 },
      { mpCost: 60, hpCost: 0, damage: 54 },
      { mpCost: 60, hpCost: 0, damage: 56 },
      { mpCost: 60, hpCost: 0, damage: 58 },
      { mpCost: 60, hpCost: 0, damage: 60 },
    ],
    prerequisite: null,
    buffEffect: { stat: 'maxHpMaxMpPercent', baseValue: 2, valuePerLevel: 2 },
    buffDuration: { baseDurationMs: 10_000, durationPerLevelMs: 10_000 },
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'warrior-hyper-body',
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR ACTIVE (Utility) ═══
  {
    id: 'warrior-monster-magnet',
    name: 'Monster Magnet',
    classId: CharacterClass.Warrior,
    type: SkillType.Active,
    description: 'Pulls all monsters from afar (within range) right to you.',
    maxLevel: 30,
    requiredCharacterLevel: 5,
    icon: '🧲',
    color: '#cc44ff',
    scaling: {
      baseDamage: 0, damagePerLevel: 0,
      baseMpCost: 10, mpCostPerLevel: 0,
      baseCooldown: 8000, cooldownReductionPerLevel: 80,
      baseRange: 50, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 10, hpCost: 0, damage: 0, range: 50 },
      { mpCost: 10, hpCost: 0, damage: 0, range: 50 },
      { mpCost: 10, hpCost: 0, damage: 0, range: 50 },
      { mpCost: 10, hpCost: 0, damage: 0, range: 50 },
      { mpCost: 10, hpCost: 0, damage: 0, range: 50 },
      { mpCost: 13, hpCost: 0, damage: 0, range: 100 },
      { mpCost: 13, hpCost: 0, damage: 0, range: 100 },
      { mpCost: 13, hpCost: 0, damage: 0, range: 100 },
      { mpCost: 13, hpCost: 0, damage: 0, range: 100 },
      { mpCost: 13, hpCost: 0, damage: 0, range: 100 },
      { mpCost: 18, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 18, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 18, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 18, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 18, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 150 },
      { mpCost: 26, hpCost: 0, damage: 0, range: 200 },
      { mpCost: 26, hpCost: 0, damage: 0, range: 200 },
      { mpCost: 26, hpCost: 0, damage: 0, range: 200 },
      { mpCost: 26, hpCost: 0, damage: 0, range: 200 },
      { mpCost: 26, hpCost: 0, damage: 0, range: 250 },
      { mpCost: 25, hpCost: 0, damage: 0, range: 250 },
      { mpCost: 24, hpCost: 0, damage: 0, range: 250 },
      { mpCost: 23, hpCost: 0, damage: 0, range: 250 },
      { mpCost: 22, hpCost: 0, damage: 0, range: 250 },
      { mpCost: 21, hpCost: 0, damage: 0, range: 250 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'warrior-monster-magnet',
    passiveEffect: null,
    mechanic: 'pull',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ WARRIOR ACTIVE (Dragon Roar) ═══
  {
    id: 'warrior-dragon-roar',
    name: 'Dragon Roar',
    classId: CharacterClass.Warrior,
    type: SkillType.Active,
    description: 'Sacrifice a large portion of HP to attack up to 15 monsters within a large area. Temporarily stuns the Knight. Only usable above 50% HP.',
    maxLevel: 30,
    requiredCharacterLevel: 10,
    icon: '🐉',
    color: '#ff2200',
    scaling: {
      baseDamage: 0.96, damagePerLevel: 0.05,
      baseMpCost: 16, mpCostPerLevel: 0.5,
      baseCooldown: 6000, cooldownReductionPerLevel: 50,
      baseRange: 110, rangePerLevel: 10,
    },
    levelData: [
      { mpCost: 16, hpCost: 59, damage: 0.96, range: 110, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 58, damage: 1.02, range: 120, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 57, damage: 1.08, range: 130, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 56, damage: 1.14, range: 140, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 55, damage: 1.20, range: 150, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 54, damage: 1.26, range: 160, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 53, damage: 1.32, range: 170, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 52, damage: 1.38, range: 180, stunDurationMs: 4000 },
      { mpCost: 16, hpCost: 51, damage: 1.44, range: 190, stunDurationMs: 4000 },
      { mpCost: 24, hpCost: 50, damage: 1.50, range: 200, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 49, damage: 1.55, range: 210, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 48, damage: 1.60, range: 220, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 47, damage: 1.65, range: 230, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 46, damage: 1.70, range: 240, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 45, damage: 1.75, range: 250, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 44, damage: 1.80, range: 260, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 43, damage: 1.85, range: 270, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 42, damage: 1.90, range: 190, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 41, damage: 1.95, range: 290, stunDurationMs: 3000 },
      { mpCost: 24, hpCost: 40, damage: 2.00, range: 300, stunDurationMs: 3000 },
      { mpCost: 30, hpCost: 39, damage: 2.04, range: 310, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 38, damage: 2.08, range: 320, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 37, damage: 2.12, range: 330, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 36, damage: 2.16, range: 340, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 35, damage: 2.20, range: 350, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 34, damage: 2.24, range: 360, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 33, damage: 2.28, range: 370, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 32, damage: 2.32, range: 380, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 31, damage: 2.36, range: 390, stunDurationMs: 2000 },
      { mpCost: 30, hpCost: 30, damage: 2.40, range: 400, stunDurationMs: 2000 },
    ],
    prerequisite: { skillId: 'warrior-slash-blast', level: 5 },
    buffEffect: null,
    buffDuration: null,
    hitCount: 1,
    aoeRadius: 200,
    animationKey: 'warrior-dragon-roar',
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 15,
    hpCostIsPercent: true,
    minHpPercent: 50,
  },

  // ═══ AUTO POTION (all classes) ═══

  {
    id: 'warrior-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Warrior,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: '🧪',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'ranger-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Ranger,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: '🧪',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'mage-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Mage,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: '🧪',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'assassin-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Assassin,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: '🧪',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'priest-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Priest,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: '🧪',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
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
  skill1: ['1'],
  skill2: ['2'],
  skill3: ['3'],
  skill4: ['4'],
  skill5: ['5'],
  skill6: ['6'],
  openStats: ['p'],
  openSkills: ['o'],
  useHpPotion: ['7'],
  useMpPotion: ['8'],
  openShop: ['b'],
};

// ─── Shop Items ─────────────────────────────────

export const SHOP_ITEMS: ShopItemDefinition[] = [
  {
    id: 'shop-hp-potion',
    name: 'HP Potion',
    description: 'Restores 50 HP when used.',
    icon: '❤️',
    price: GAME_CONSTANTS.SHOP_HP_POTION_PRICE,
    type: DropType.HpPotion,
    value: GAME_CONSTANTS.HP_POTION_RESTORE,
  },
  {
    id: 'shop-mp-potion',
    name: 'MP Potion',
    description: 'Restores 30 MP when used.',
    icon: '💧',
    price: GAME_CONSTANTS.SHOP_MP_POTION_PRICE,
    type: DropType.MpPotion,
    value: GAME_CONSTANTS.MP_POTION_RESTORE,
  },
];
