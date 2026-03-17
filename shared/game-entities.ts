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
  baseHp: number;
  baseDamageMin: number;
  baseDamageMax: number;
  speed: number;
  xpReward: number;
  width: number;
  height: number;
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
  orbitOffset: number;
  platformDropTimer: number;
}

export enum DropType {
  HpPotion = 'hp-potion',
  MpPotion = 'mp-potion',
  Gold = 'gold',
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
  hpPotions: number;
  mpPotions: number;
  gold: number;
}

export interface ShopItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  type: DropType;
  value: number;
}
