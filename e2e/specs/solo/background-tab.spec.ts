import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';

function zombiePositions(s: E2eSnapshot): string {
  return s.zombies
    .map((z: E2eZombieView): string => `${z.id}:${Math.round(z.x)}:${Math.round(z.y)}`)
    .sort()
    .join('|');
}

test.describe('solo game in a background tab', { tag: '@solo' }, (): void => {
  test('pauses while the tab is hidden and resumes when it is back', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.waitFor('zombies', (s: E2eSnapshot): boolean => s.zombies.length > 0, {
      timeoutMs: 20_000,
    });

    await player.setBackgroundTab(true);
    await player.wait(300);
    const hidden: string = zombiePositions(await player.probe.state());
    await player.wait(2_000);
    expect(zombiePositions(await player.probe.state()), 'nothing moves while you are away').toBe(
      hidden,
    );

    await player.setBackgroundTab(false);
    await player.probe.waitFor(
      'the world runs again',
      (s: E2eSnapshot): boolean => zombiePositions(s) !== hidden,
      { timeoutMs: 3_000 },
    );
  });
});
