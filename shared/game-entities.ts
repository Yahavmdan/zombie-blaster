export enum ZombieType {
  Walker = 'walker',
  Runner = 'runner',
  Tank = 'tank',
  Spitter = 'spitter',
  Boss = 'boss',
  DragonBoss = 'dragon-boss',
  Eater = 'eater',
}

export interface ZombieDefinition {
  type: ZombieType;
  name: string;
  hpMin: number;
  hpMax: number;
  damageMinLow: number;
  damageMinHigh: number;
  damageMaxLow: number;
  damageMaxHigh: number;
  speedMin: number;
  speedMax: number;
  knockbackMin: number;
  knockbackMax: number;
  hesitationMin: number;
  hesitationMax: number;
  xpRewardMin: number;
  xpRewardMax: number;
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
  attackAnimTicks: number;
  attackHitTick: number;
  /** Body weight in kg (alive or as a corpse): what it puts on a scale. */
  weightKg: number;
}

export interface ZombieState {
  id: string;
  type: ZombieType;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  isDead: boolean;
  target: string | null;
  knockbackFrames: number;
  jumpCooldown: number;
  attackCooldown: number;
  attackAnimTimer: number;
  attackHasHit: boolean;
  attackHesitation: number;
  hesitationRange: number;
  facing: number;
  instanceSpeed: number;
  instanceDamageMin: number;
  instanceDamageMax: number;
  instanceKnockbackForce: number;
  instanceXpReward: number;
  instanceWidth: number;
  instanceHeight: number;
  orbitOffset: number;
  platformDropTimer: number;
  spawnTimer: number;
  reactionDelay: number;
  eatingTargetId: string | null;
  eatingTimer: number;
  /** Monster-magnet drag in progress. Host-simulated and synced, so every screen draws the pull. */
  magnetPull: MagnetPull | null;
}

/** A zombie being dragged by monster magnet from where it stood to the caster's spot. */
export interface MagnetPull {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  /** Ticks the zombie still braces before it is torn loose (farther zombies wait longer). */
  delayTicks: number;
  elapsedTicks: number;
  durationTicks: number;
}

export enum DropType {
  HpPotion = 'hp-potion',
  MpPotion = 'mp-potion',
  Gold = 'gold',
  Special = 'special',
}

export enum SpecialDropType {
  LowGravity = 'low-gravity',
  SuperSpeed = 'super-speed',
  GiantSlayer = 'giant-slayer',
  ZombieShock = 'zombie-shock',
}

export type PotionCategory = 'hp' | 'mp';
export type PotionMode = 'flat' | 'percent';

export interface PotionDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: PotionCategory;
  mode: PotionMode;
  value: number;
  shopPrice: number;
}

export interface WorldDrop {
  id: string;
  type: DropType;
  specialType?: SpecialDropType;
  x: number;
  y: number;
  velocityY: number;
  value: number;
  lifetime: number;
  isGrounded: boolean;
}

export interface SpecialDropDefinition {
  type: SpecialDropType;
  name: string;
  description: string;
  funnyDescription: string;
  icon: string;
  color: string;
  highlightColor: string;
  durationTicks: number;
}

export interface PendingSpecialDropConfirm {
  type: SpecialDropType;
  cx: number;
  cy: number;
  remainingTicks: number;
  totalTicks: number;
}

export interface ActiveSpecialEffect {
  type: SpecialDropType;
  remainingTicks: number;
  totalTicks: number;
}

export interface PlayerInventory {
  potions: Record<string, number>;
  gold: number;
  autoPotionHpId: string | null;
  autoPotionMpId: string | null;
}

export interface ZombieCorpse {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteKey: string;
  facing: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  frozen: boolean;
  landProcessed: boolean;
  fadeTimer: number;
  maxFadeTimer: number;
  showBlood: boolean;
  /** Player carrying this corpse overhead (the host decides; null = lying in the world). */
  carrierId: string | null;
}

export interface ShopItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  potionId: string;
}

export interface ShopPurchase {
  itemId: string;
  quantity: number;
}

export type QuickSlotContentType = 'skill' | 'potion' | 'keybind';

export interface QuickSlotEntry {
  type: QuickSlotContentType;
  id: string;
}

export interface ActionInfo {
  label: string;
  icon: string;
}

export const ACTION_INFO: Record<string, ActionInfo> = {
  left: { label: 'Move Left', icon: '←' },
  right: { label: 'Move Right', icon: '→' },
  up: { label: 'Up / Climb', icon: '↑' },
  down: { label: 'Down', icon: '↓' },
  jump: { label: 'Jump', icon: '⬆' },
  attack: { label: 'Attack', icon: '⚔' },
  skill1: { label: 'Skill 1', icon: '①' },
  skill2: { label: 'Skill 2', icon: '②' },
  skill3: { label: 'Skill 3', icon: '③' },
  skill4: { label: 'Skill 4', icon: '④' },
  skill5: { label: 'Skill 5', icon: '⑤' },
  skill6: { label: 'Skill 6', icon: '⑥' },
  openStats: { label: 'Stats', icon: '📊' },
  openSkills: { label: 'Skills', icon: '📖' },
  useHpPotion: { label: 'HP Potion', icon: '❤' },
  useMpPotion: { label: 'MP Potion', icon: '💧' },
  openShop: { label: 'Shop', icon: '🛒' },
  openInventory: { label: 'Inventory', icon: '🎒' },
  revive: { label: 'Revive', icon: '💖' },
  carry: { label: 'Carry Corpse', icon: '🧟' },
  quickSlot1: { label: 'QSlot 1', icon: '❶' },
  quickSlot2: { label: 'QSlot 2', icon: '❷' },
  quickSlot3: { label: 'QSlot 3', icon: '❸' },
  quickSlot4: { label: 'QSlot 4', icon: '❹' },
  quickSlot5: { label: 'QSlot 5', icon: '❺' },
  quickSlot6: { label: 'QSlot 6', icon: '❻' },
  quickSlot7: { label: 'QSlot 7', icon: '❼' },
  quickSlot8: { label: 'QSlot 8', icon: '❽' },
  quickSlot9: { label: 'QSlot 9', icon: '❾' },
  quickSlot10: { label: 'QSlot 10', icon: '❿' },
  quickSlot11: { label: 'QSlot 11', icon: '⓫' },
  quickSlot12: { label: 'QSlot 12', icon: '⓬' },
};

export type QuickSlotAction =
  | 'quickSlot1'
  | 'quickSlot2'
  | 'quickSlot3'
  | 'quickSlot4'
  | 'quickSlot5'
  | 'quickSlot6'
  | 'quickSlot7'
  | 'quickSlot8'
  | 'quickSlot9'
  | 'quickSlot10'
  | 'quickSlot11'
  | 'quickSlot12';

export const QUICK_SLOT_ACTIONS: QuickSlotAction[] = [
  'quickSlot1',
  'quickSlot2',
  'quickSlot3',
  'quickSlot4',
  'quickSlot5',
  'quickSlot6',
  'quickSlot7',
  'quickSlot8',
  'quickSlot9',
  'quickSlot10',
  'quickSlot11',
  'quickSlot12',
];

export const QUICK_SLOT_ACTION_SET: Set<string> = new Set<string>(QUICK_SLOT_ACTIONS);

/**
 * A map prop players can pick up and throw (barrels, boxes). Its kind and starting spot come from
 * the floor layout (id `prop-<index in the layout's props>`); the host simulates where it is and
 * sends it with every game-sync. Lying, it is solid like any prop; carried, it rides overhead like
 * a corpse.
 */
export interface LooseProp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  /** Player carrying it overhead (the host decides; null = lying in the world or falling). */
  carrierId: string | null;
  /** Weight in kg, from what it is made of (PROP_WEIGHT_KG). Clients take it from their own layout. */
  weightKg: number;
}

/** What a map prop is made of: picks its weight (PROP_WEIGHT_KG). */
export type PropMaterial = 'barrel' | 'box' | 'locker' | 'rail';

/** Floor-2 boulder puzzle: the host simulates it and sends it with every game-sync. */
export interface BoulderState {
  /** Hits the gate holding the boulder has taken; at BOULDER_GATE_HITS it breaks and the boulder rolls. */
  gateHits: number;
  /** Distance rolled along the boulder's path (0 = resting against the gate). */
  progress: number;
  /** Rolling speed along the path, px/tick. */
  speed: number;
  /** True once the boulder smashed the side wall and shattered (permanent for the floor). */
  wallBroken: boolean;
}

/**
 * Floor-3 spring puzzle: the host simulates it and sends it with every game-sync. A scale away
 * from the spring pulls the spring's button up on a cable while it holds enough kg.
 */
export interface SpringState {
  /** Launches so far on this floor (the button stays up while the scale stays loaded). */
  launches: number;
  /** Ticks left of the 3-2-1 after a hit on the raised button (0 = not counting). */
  countdownTicks: number;
  /** Ticks left of the release-and-settle bounce after a launch (0 = at rest). */
  bounceTicks: number;
  /** Kg on the scale, as the host weighs it (corpses, props, zombies, players and what they carry). */
  scaleKg: number;
  /** How far the button has risen: 0 = sunk in the ground, SPRING_BUTTON_RISE_TICKS = fully up. */
  buttonTicks: number;
}

/** One floor-4 hanging cage: its cleat takes hits until the chain snaps, then it falls. */
export interface CageState {
  /** Swings its cleat took; at CAGE_CLEAT_HITS the chain snaps (permanent for the floor). */
  cleatHits: number;
  /** Ticks it has been falling since the chain snapped (0 while it hangs). */
  fallTicks: number;
  /** True once it landed: the exit cage stands there, any other cage smashed open. */
  landed: boolean;
}

/** Floor-4 cage puzzle: the host simulates it and sends it with every game-sync. */
export interface CagePuzzleState {
  /** One per cage, in layout order: [0] the exit cage, then the cages hanging mid-screen. */
  cages: CageState[];
}

/** Floor-5 pressure plate: the host weighs it and sends it with every game-sync. */
export interface PlateState {
  /** Weight on the plate (a lying corpse 1, a standing player PLATE_PLAYER_WEIGHT). */
  weight: number;
  /** How far the exit door is open: 0 (shut) to PLATE_DOOR_TICKS (open, the exit lets you out). */
  doorTicks: number;
}
