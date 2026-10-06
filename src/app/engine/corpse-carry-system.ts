import { CharacterState, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';
import { IGameEngine } from './engine-types';
import {
  assignCarriers,
  canCarry,
  carryableCorpse,
  holdCarriedCorpses,
  holdOverhead,
} from './corpse-carry';

/**
 * Corpse carrying. The carry key picks up the nearest lying corpse (a request in the local
 * player's state); pressing it again tosses the corpse forward. The host (or solo) grants and
 * releases corpses for every player; every client puts carried corpses on their carrier's head as
 * it sees them. A guest holds its own pick-up right away while the host's answer is on its way.
 */
export class CorpseCarrySystem {
  private carryKeyHeld: boolean = false;
  private unconfirmedTicks: number = 0;

  constructor(private readonly e: IGameEngine) {}

  /** Local player: the carry key toggles between picking up and tossing. */
  handleInput(): void {
    const p: CharacterState | null = this.e.player;
    const pressed: boolean = this.e.keys.carry && !this.carryKeyHeld;
    this.carryKeyHeld = this.e.keys.carry;
    if (!p || !pressed) return;
    if (p.carryingCorpseId) {
      p.carryingCorpseId = null;
      return;
    }
    const corpse: ZombieCorpse | null = carryableCorpse(p, this.e.zombieCorpses);
    if (corpse) {
      p.carryingCorpseId = corpse.id;
      this.unconfirmedTicks = 0;
    }
  }

  update(): void {
    if (!this.e.isMultiplayerClient) assignCarriers(this.e.zombieCorpses, this.players());
    this.settleLocalRequest();
    this.holdCorpses();
  }

  /** Puts every carried corpse on its carrier (also right after a corpse sync, before the next tick). */
  holdCorpses(): void {
    holdCarriedCorpses(this.e.zombieCorpses, this.players());
    const p: CharacterState | null = this.e.player;
    if (!p?.carryingCorpseId || !this.e.isMultiplayerClient) return;
    const pending: ZombieCorpse | undefined = this.e.zombieCorpses.find(
      (c: ZombieCorpse): boolean => c.id === p.carryingCorpseId && c.carrierId === null,
    );
    if (pending) holdOverhead(pending, p);
  }

  /** Drops a request that can't hold: down, corpse gone, someone else has it, or the host said no. */
  private settleLocalRequest(): void {
    const p: CharacterState | null = this.e.player;
    if (!p?.carryingCorpseId) return;
    const corpse: ZombieCorpse | undefined = this.e.zombieCorpses.find(
      (c: ZombieCorpse): boolean => c.id === p.carryingCorpseId,
    );
    const takenByOther: boolean =
      !!corpse && corpse.carrierId !== null && corpse.carrierId !== p.id;
    if (!canCarry(p) || !corpse || takenByOther) {
      p.carryingCorpseId = null;
      return;
    }
    if (corpse.carrierId === p.id) {
      this.unconfirmedTicks = 0;
      return;
    }
    // Not granted: the host decides at once; a guest waits a moment for the host's answer.
    this.unconfirmedTicks++;
    if (
      !this.e.isMultiplayerClient ||
      this.unconfirmedTicks > GAME_CONSTANTS.CORPSE_CARRY_CONFIRM_TICKS
    ) {
      p.carryingCorpseId = null;
    }
  }

  private players(): CharacterState[] {
    return [...(this.e.player ? [this.e.player] : []), ...this.e.remotePlayers];
  }
}
