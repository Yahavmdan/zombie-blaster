import { describe, expect, it } from 'vitest';
import { PIXEL_ICON_IDS, PixelIconId } from '@shared/pixel-icon';
import { PIXEL_ICONS, PixelIconDef } from './pixel-icons';

describe('PIXEL_ICONS', (): void => {
  it('defines a grid for every id and nothing else', (): void => {
    expect(Object.keys(PIXEL_ICONS).sort()).toEqual([...PIXEL_ICON_IDS].sort());
  });

  for (const id of PIXEL_ICON_IDS as readonly PixelIconId[]) {
    it(`${id} is a 16x16 grid using only its palette`, (): void => {
      const def: PixelIconDef = PIXEL_ICONS[id];
      expect(def.rows.length).toBe(16);
      for (const row of def.rows) {
        expect(row.length).toBe(16);
        for (const ch of row) {
          expect(ch === '.' || ch in def.palette).toBe(true);
        }
      }
      const painted: number = def.rows.join('').replace(/\./g, '').length;
      expect(painted).toBeGreaterThan(20);
    });
  }

  it('outlines every icon in ink', (): void => {
    for (const id of PIXEL_ICON_IDS) {
      expect(PIXEL_ICONS[id].palette['k']).toBe('#0e0d0b');
    }
  });
});
