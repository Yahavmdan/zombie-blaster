import {
  CharacterState,
  Direction,
  GAME_CONSTANTS,
} from '@shared/index';
import { IGameEngine, Platform, Rope } from './engine-types';

export class PhysicsSystem {
  constructor(private readonly e: IGameEngine) {}

  rectsOverlap(
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number,
  ): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  isOnPlatform(
    ex: number, ey: number, ew: number, eh: number,
    plat: Platform,
    velocityY: number,
  ): boolean {
    const entityBottom: number = ey + eh;
    const prevBottom: number = entityBottom - velocityY;
    return (
      ex + ew > plat.x &&
      ex < plat.x + plat.width &&
      entityBottom >= plat.y &&
      prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
      velocityY >= 0
    );
  }

  updatePlayer(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (this.e.playerStunTicks > 0) {
      this.applyStunnedMovement(p);
      this.e.onPlayerUpdate?.(p);
      return;
    }

    const activeRope: Rope | null = this.getActiveRope();

    if (p.isClimbing) {
      this.updateClimbing(activeRope);
    } else {
      this.updateMovement(activeRope);
    }

    this.clampPlayerX(p);
    this.e.onPlayerUpdate?.(p);
  }

  private applyStunnedMovement(p: CharacterState): void {
    p.velocityX *= GAME_CONSTANTS.PLAYER_FRICTION;
    if (Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) p.velocityX = 0;
    p.velocityY += GAME_CONSTANTS.GRAVITY;
    if (p.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
      p.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
    }
    p.x += p.velocityX;
    p.y += p.velocityY;
    p.isGrounded = false;
    for (const plat of this.e.platforms) {
      if (this.e.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
      if (this.isOnPlatform(p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT, plat, p.velocityY)) {
        p.y = plat.y - GAME_CONSTANTS.PLAYER_HEIGHT;
        p.velocityY = 0;
        p.isGrounded = true;
      }
    }
    this.clampPlayerX(p);
  }

  private clampPlayerX(p: CharacterState): void {
    if (p.x < 0) p.x = 0;
    if (p.x + GAME_CONSTANTS.PLAYER_WIDTH > GAME_CONSTANTS.CANVAS_WIDTH) {
      p.x = GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.PLAYER_WIDTH;
    }
  }

  getActiveRope(): Rope | null {
    const p: CharacterState | null = this.e.player;
    if (!p) return null;
    const playerCenterX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCenterY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const playerBottom: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    for (const rope of this.e.ropes) {
      const withinX: boolean = Math.abs(playerCenterX - rope.x) < GAME_CONSTANTS.ROPE_GRAB_RANGE;
      const withinY: boolean = playerBottom >= rope.topY && playerCenterY <= rope.bottomY;
      if (withinX && withinY) return rope;
    }
    return null;
  }

  private updateClimbing(activeRope: Rope | null): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (!activeRope) {
      p.isClimbing = false;
      return;
    }

    p.velocityX = 0;
    p.velocityY = 0;
    p.x = activeRope.x - GAME_CONSTANTS.PLAYER_WIDTH / 2;

    if (this.e.keys.up) {
      p.y -= GAME_CONSTANTS.ROPE_CLIMB_SPEED;
      if (p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2 < activeRope.topY) {
        p.y = activeRope.topY - GAME_CONSTANTS.PLAYER_HEIGHT;
        p.isClimbing = false;
        p.isGrounded = true;
      }
    }

    if (this.e.keys.down) {
      p.y += GAME_CONSTANTS.ROPE_CLIMB_SPEED;
      if (p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2 > activeRope.bottomY) {
        p.isClimbing = false;
      }
    }

    if (this.e.keys.jump) {
      p.isClimbing = false;
      p.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
      this.e.ropeJumpCooldown = GAME_CONSTANTS.ROPE_JUMP_COOLDOWN_TICKS;

      if (this.e.keys.left) {
        p.velocityX = -p.derived.speed;
        p.facing = Direction.Left;
      } else if (this.e.keys.right) {
        p.velocityX = p.derived.speed;
        p.facing = Direction.Right;
      }
    }
  }

  private updateMovement(activeRope: Rope | null): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const speed: number = p.derived.speed;
    if (p.isGrounded) {
      if (this.e.keys.left) {
        p.velocityX = -speed;
        p.facing = Direction.Left;
      } else if (this.e.keys.right) {
        p.velocityX = speed;
        p.facing = Direction.Right;
      } else {
        p.velocityX *= GAME_CONSTANTS.PLAYER_FRICTION;
        if (Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) p.velocityX = 0;
      }
    } else {
      if (this.e.keys.left) {
        p.facing = Direction.Left;
      } else if (this.e.keys.right) {
        p.facing = Direction.Right;
      }
      p.velocityX *= GAME_CONSTANTS.PLAYER_AIR_DRAG;
      if (Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) p.velocityX = 0;
    }

    const jumpPressed: boolean = this.e.keys.up || this.e.keys.jump;
    if (jumpPressed && !this.e.jumpHeld && p.isGrounded) {
      if (this.e.keys.down && p.y + GAME_CONSTANTS.PLAYER_HEIGHT < GAME_CONSTANTS.GROUND_Y) {
        this.e.platformDropTimer = GAME_CONSTANTS.PLATFORM_DROP_TICKS;
        p.y += GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE + 1;
        p.isGrounded = false;
      } else {
        p.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
        p.isGrounded = false;
      }
    }
    this.e.jumpHeld = jumpPressed;

    if (this.e.keys.up && activeRope && !p.isGrounded && this.e.ropeJumpCooldown <= 0) {
      p.isClimbing = true;
      p.velocityX = 0;
      p.velocityY = 0;
      return;
    }

    if (this.e.keys.down && activeRope && this.e.ropeJumpCooldown <= 0) {
      p.isClimbing = true;
      p.velocityX = 0;
      p.velocityY = 0;
      return;
    }

    p.velocityY += GAME_CONSTANTS.GRAVITY;
    if (p.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
      p.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
    }

    p.x += p.velocityX;
    p.y += p.velocityY;

    p.isGrounded = false;
    for (const plat of this.e.platforms) {
      if (this.e.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
      if (this.isOnPlatform(p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT, plat, p.velocityY)) {
        p.y = plat.y - GAME_CONSTANTS.PLAYER_HEIGHT;
        p.velocityY = 0;
        p.isGrounded = true;
      }
    }
  }
}
