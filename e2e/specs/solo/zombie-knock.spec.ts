import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { TOUGH_FLOOR, warriorArena, zombieAt } from '../../support/warrior';
import { KNOCK_MAX_TILT, KNOCK_TILT_SLACK, knockIt, peakTilt } from '../../support/zombie-knock';

test.describe('knocked zombies', { tag: '@solo' }, (): void => {
  test('every hit throws a zombie a little differently: it tilts more or less, then stands back up', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [], true, TOUGH_FLOOR);

    const peaks: number[] = [];
    for (let hit: number = 0; hit < 5; hit++) {
      // Floor 30 is crowded and a swing knocks the nearest zombie: one fresh zombie alone each time.
      await p.probe.clearZombies();
      const id: string = await zombieAt(p, x + 70);
      await knockIt(p, id);
      if (hit === 0) await p.attachCanvas(testInfo, 'knocked zombie tilting');
      peaks.push(await peakTilt(p, id));
    }
    testInfo.annotations.push({ type: 'peak tilts', description: peaks.join(', ') });
    for (const most of peaks) {
      expect(most, 'each knock tilts it').toBeGreaterThan(0.03);
      expect(most, 'it staggers, never cartwheels').toBeLessThan(KNOCK_MAX_TILT + KNOCK_TILT_SLACK);
    }
    expect(
      Math.max(...peaks) - Math.min(...peaks),
      'not the same throw every time',
    ).toBeGreaterThan(0.05);
  });
});
