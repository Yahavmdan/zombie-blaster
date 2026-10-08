import { CharacterState, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';
import { IGameEngine } from './engine-types';
import {
  assignCarriers,
  canCarry,
  carriedIds,
  carryableCorpse,
  holdCarriedCorpses,
  holdOverhead,
} from './corpse-carry';

/**
 * Corpse carrying. The carry key picks up the nearest lying corpse (a request in the local
 * player's state) and stacks it on the ones already carried, up to `CORPSE_CARRY_MAX`; with
 * nothing more to pick up (or a full stack) it tosses the whole stack forward. The host (or solo)
 * grants and releases corpses for every player; every client puts carried corpses on their
 * carrier's head as it sees them. A guest holds its own pick-ups right away while the host's
 * answer is on its way.
 */
export class CorpseCarrySystem {
  private carryKeyHeld: boolean = false;
  private attackKeyHeld: boolean = false;
  /** Guest: ticks each of its pick-ups has waited for the host's grant. */
  private readonly unconfirmedTicks: Map<string, number> = new Map<string, number>();

  constructor(private readonly e: IGameEngine) {}

  /**
   * Local player: the carry key picks up one more corpse, or tosses the stack when there is
   * nothing more to pick up; the attack key always tosses it (handy beside a pile). Returns true
   * while the hands are full this tick, so no attack or skill goes off.
   */
  handleInput(): boolean {
    const p: CharacterState | null = this.e.player;
    const carryPressed: boolean = this.e.keys.carry && !this.carryKeyHeld;
    const attackPressed: boolean = this.e.keys.attack && !this.attackKeyHeld;
    this.carryKeyHeld = this.e.keys.carry;
    this.attackKeyHeld = this.e.keys.attack;
    if (!p) return false;
    const ids: string[] = carriedIds(p);
    if (ids.length > 0 && attackPressed) {
      p.carryingCorpseIds = [];
      return true;
    }
    if (!carryPressed) return ids.length > 0;
    const corpse: ZombieCorpse | null =
      ids.length < GAME_CONSTANTS.CORPSE_CARRY_MAX
        ? carryableCorpse(p, this.e.zombieCorpses)
        : null;
    if (corpse) {
      p.carryingCorpseIds = [...ids, corpse.id];
      this.unconfirmedTicks.set(corpse.id, 0);
      return true;
    }
    p.carryingCorpseIds = [];
    return ids.length > 0;
  }

  update(): void {
    if (!this.e.isMultiplayerClient) assignCarriers(this.e.zombieCorpses, this.players());
    this.settleLocalRequests();
    this.holdCorpses();
  }

  /** Puts every carried corpse on its carrier (also right after a corpse sync, before the next tick). */
  holdCorpses(): void {
    holdCarriedCorpses(this.e.zombieCorpses, this.players());
    const p: CharacterState | null = this.e.player;
    if (!p || !this.e.isMultiplayerClient) return;
    carriedIds(p).forEach((id: string, level: number): void => {
      const pending: ZombieCorpse | undefined = this.e.zombieCorpses.find(
        (c: ZombieCorpse): boolean => c.id === id && c.carrierId === null,
      );
      if (pending) holdOverhead(pending, p, level);
    });
  }

  /** Drops requests that can't hold: down, corpse gone, someone else has it, or the host said no. */
  private settleLocalRequests(): void {
    const p: CharacterState | null = this.e.player;
    const ids: string[] = p ? carriedIds(p) : [];
    if (!p || ids.length === 0) {
      this.unconfirmedTicks.clear();
      return;
    }
    if (!canCarry(p)) {
      p.carryingCorpseIds = [];
      return;
    }
    const kept: string[] = ids.filter((id: string): boolean => this.keepRequest(p, id));
    if (kept.length !== ids.length) p.carryingCorpseIds = kept;
  }

  private keepRequest(p: CharacterState, id: string): boolean {
    const corpse: ZombieCorpse | undefined = this.e.zombieCorpses.find(
      (c: ZombieCorpse): boolean => c.id === id,
    );
    if (!corpse || (corpse.carrierId !== null && corpse.carrierId !== p.id)) return false;
    if (corpse.carrierId === p.id) {
      this.unconfirmedTicks.delete(id);
      return true;
    }
    // Not granted: the host decides at once; a guest waits a moment for the host's answer.
    if (!this.e.isMultiplayerClient) return false;
    const ticks: number = (this.unconfirmedTicks.get(id) ?? 0) + 1;
    this.unconfirmedTicks.set(id, ticks);
    return ticks <= GAME_CONSTANTS.CORPSE_CARRY_CONFIRM_TICKS;
  }

  private players(): CharacterState[] {
    return [...(this.e.player ? [this.e.player] : []), ...this.e.remotePlayers];
  }
}
