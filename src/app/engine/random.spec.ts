import { describe, expect, it } from 'vitest';
import { randomInt } from '@shared/index';

describe('randomInt', (): void => {
  it('reaches both ends of the range and nothing outside it', (): void => {
    const seen: Set<number> = new Set<number>();
    for (let i: number = 0; i < 5_000; i++) seen.add(randomInt(5, 8));
    expect([...seen].sort((a: number, b: number): number => a - b)).toEqual([5, 6, 7, 8]);
  });
});
