import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { LevelLayout } from './level-generator';
import { ZombiePile } from './zombie-pile';
import {
  EditorField,
  EditorRef,
  clearLayout,
  exportLayout,
  fieldsOf,
  itemAt,
  moveTo,
  parseLayout,
  placeAt,
  removeItem,
  setField,
} from './level-editor';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;

function room(): LevelLayout {
  return {
    seed: 7,
    floor: 1,
    platforms: [],
    ropes: [],
    exitX: 20,
    exitY: 300,
    props: [],
    walls: [],
  };
}

describe('level editor: zombie piles', () => {
  it('the tool puts a pile on the surface below', (): void => {
    const layout: LevelLayout = room();
    const ref: EditorRef | null = placeAt(layout, 'zombie-pile', 600, 200);
    expect(ref?.kind).toBe('zombie-pile');
    const pile: ZombiePile = layout.zombiePiles![0];
    expect(pile.y + pile.height).toBe(GROUND_Y);
    expect(pile.bodies).toBe(GAME_CONSTANTS.ZOMBIE_PILE_BODIES);
    expect(itemAt(layout, 600, GROUND_Y - 10)).toEqual(ref);
  });

  it('moves along surfaces, adjusts its bodies and width, and erases', (): void => {
    const layout: LevelLayout = room();
    layout.platforms.push({
      x: 300,
      y: 400,
      width: 320,
      height: GAME_CONSTANTS.LEVEL_TILE_PX,
    });
    const ref: EditorRef = placeAt(layout, 'zombie-pile', 800, 200)!;
    moveTo(layout, ref, 400, 200);
    const pile: ZombiePile = layout.zombiePiles![0];
    expect(pile.y + pile.height).toBe(400);

    setField(layout, ref, 'bodies', 999);
    expect(pile.bodies).toBe(GAME_CONSTANTS.ZOMBIE_PILE_MAX_BODIES);
    setField(layout, ref, 'width', 192);
    expect(pile.width).toBe(192);
    expect(fieldsOf(layout, ref).map((f: EditorField): string => f.key)).toEqual([
      'bodies',
      'width',
    ]);

    removeItem(layout, ref);
    expect(layout.zombiePiles).toEqual([]);
  });

  it('survives export and import, and an import refuses a bad body count', (): void => {
    const layout: LevelLayout = room();
    placeAt(layout, 'zombie-pile', 600, 200);
    const back: LevelLayout = parseLayout(exportLayout(layout)) as LevelLayout;
    expect(back.zombiePiles).toEqual(layout.zombiePiles);

    layout.zombiePiles![0].bodies = 0;
    expect(parseLayout(exportLayout(layout))).toHaveProperty('error');
  });

  it('a clear takes the piles', (): void => {
    const layout: LevelLayout = room();
    placeAt(layout, 'zombie-pile', 600, 200);
    clearLayout(layout);
    expect(layout.zombiePiles).toBeUndefined();
  });
});
