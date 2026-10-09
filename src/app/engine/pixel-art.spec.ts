import { describe, it, expect } from 'vitest';
import { outlined } from './pixel-art';

describe('pixel art outlines', () => {
  it('ink fills the empty cells touching the art, never diagonals or the art itself', () => {
    expect(outlined(['....', '.a..', '....'])).toEqual(['.k..', 'kak.', '.k..']);
  });

  it('keeps every row its width', () => {
    const rows: string[] = outlined(['.....', '..b..', '.bbb.', '.....']);
    for (const row of rows) expect(row.length).toBe(5);
  });
});
