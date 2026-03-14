export enum ZombieType {
  Walker = 'walker',
  Runner = 'runner',
  Tank = 'tank',
  Spitter = 'spitter',
  Boss = 'boss',
}

export interface ZombieDefinition {
  type: ZombieType;
  name: string;
  baseHp: number;
  baseDamageMin: number;
  baseDamageMax: number;
  speed: number;
  xpReward: number;
  color: string;
  width: number;
  height: number;
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
  facing: number;
}

export interface MpPotionDrop {
  id: string;
  x: number;
  y: number;
  velocityY: number;
  restoreAmount: number;
  lifetime: number;
  isGrounded: boolean;
}
