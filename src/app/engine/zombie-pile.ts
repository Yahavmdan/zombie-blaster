import { GAME_CONSTANTS } from '@shared/index';

/**
 * A designed layout's pile of dead zombies: real corpses laid on the surface at the box's foot when
 * the floor starts, so they can be carried, climbed and weighed like any other body.
 */
export interface ZombiePile {
  x: number;
  y: number;
  width: number;
  height: number;
  bodies: number;
}

/** Where a body starts: it settles from here by normal corpse physics. */
export interface PileSpot {
  centerX: number;
  top: number;
}

/** Corpses laid from a pile: a rebuilt floor swaps these and keeps the slain. */
export const PILE_CORPSE_ID_PREFIX: string = 'pile-corpse';

export function isPileCorpse(id: string): boolean {
  return id.startsWith(`${PILE_CORPSE_ID_PREFIX}-`);
}

/** A new pile of the default size, its left edge at `left`, standing on `surfaceY`. */
export function newZombiePile(left: number, surfaceY: number): ZombiePile {
  const height: number = GAME_CONSTANTS.ZOMBIE_PILE_HEIGHT_PX;
  return {
    x: left,
    y: surfaceY - height,
    width: GAME_CONSTANTS.ZOMBIE_PILE_WIDTH_PX,
    height,
    bodies: GAME_CONSTANTS.ZOMBIE_PILE_BODIES,
  };
}

/**
 * Rows narrowing to the top, the bottom row filling the pile's width; more bodies start a new
 * heap on top. Rows start one body apart, so each one lands on the row under it.
 */
export function pileSpots(pile: ZombiePile, bodyHeight: number): PileSpot[] {
  const spacing: number = GAME_CONSTANTS.ZOMBIE_PILE_BODY_SPACING_PX;
  const widest: number = Math.max(1, Math.floor(pile.width / spacing));
  const center: number = pile.x + pile.width / 2;
  const foot: number = pile.y + pile.height;
  const spots: PileSpot[] = [];
  let row: number = 0;
  let cols: number = widest;
  let col: number = 0;
  while (spots.length < pile.bodies) {
    spots.push({
      centerX: center + (col - (cols - 1) / 2) * spacing,
      top: foot - (row + 1) * bodyHeight,
    });
    col++;
    if (col === cols) {
      col = 0;
      row++;
      cols = cols > 1 ? cols - 1 : widest;
    }
  }
  return spots;
}
