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
  type: DropType;
  value: number;
}
