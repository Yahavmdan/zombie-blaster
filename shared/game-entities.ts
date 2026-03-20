export enum ZombieType {
  Walker = 'walker',
  Runner = 'runner',
  Tank = 'tank',
  Spitter = 'spitter',
  Boss = 'boss',
  DragonBoss = 'dragon-boss',
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
}

export enum DropType {
  HpPotion = 'hp-potion',
  MpPotion = 'mp-potion',
  Gold = 'gold',
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
  x: number;
  y: number;
  velocityY: number;
  value: number;
  lifetime: number;
  isGrounded: boolean;
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
  quickSlot1: { label: 'QSlot 1', icon: '❶' },
  quickSlot2: { label: 'QSlot 2', icon: '❷' },
  quickSlot3: { label: 'QSlot 3', icon: '❸' },
  quickSlot4: { label: 'QSlot 4', icon: '❹' },
  quickSlot5: { label: 'QSlot 5', icon: '❺' },
  quickSlot6: { label: 'QSlot 6', icon: '❻' },
  quickSlot7: { label: 'QSlot 7', icon: '❼' },
  quickSlot8: { label: 'QSlot 8', icon: '❽' },
};

export type QuickSlotAction =
  | 'quickSlot1'
  | 'quickSlot2'
  | 'quickSlot3'
  | 'quickSlot4'
  | 'quickSlot5'
  | 'quickSlot6'
  | 'quickSlot7'
  | 'quickSlot8';

export const QUICK_SLOT_ACTIONS: QuickSlotAction[] = [
  'quickSlot1',
  'quickSlot2',
  'quickSlot3',
  'quickSlot4',
  'quickSlot5',
  'quickSlot6',
  'quickSlot7',
  'quickSlot8',
];

export const QUICK_SLOT_ACTION_SET: Set<string> = new Set<string>(QUICK_SLOT_ACTIONS);
