import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

test.describe('movement and physics', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.waitFor(
      'player grounded',
      (s: E2eSnapshot): boolean => s.player?.isGrounded === true,
    );
  });

  test('walking right/left moves and turns the player', async (): Promise<void> => {
    const start: E2eSnapshot = await player.probe.state();
    await player.moveRight(600);
    const afterRight: E2eSnapshot = await player.probe.state();
    expect(afterRight.player!.x).toBeGreaterThan(start.player!.x + 20);
    expect(afterRight.player!.facing).toBe('right');

    await player.moveLeft(600);
    const afterLeft: E2eSnapshot = await player.probe.state();
    expect(afterLeft.player!.x).toBeLessThan(afterRight.player!.x - 20);
    expect(afterLeft.player!.facing).toBe('left');
  });

  test('player stops after releasing movement keys', async (): Promise<void> => {
    await player.hold(KEYS.right);
    await player.wait(400);
    await player.release(KEYS.right);
    await player.probe.waitFor(
      'horizontal velocity settles',
      (s: E2eSnapshot): boolean => Math.abs(s.player!.velocityX) < 0.5,
      { timeoutMs: 2_000 },
    );
    const a: E2eSnapshot = await player.probe.state();
    await player.wait(400);
    const b: E2eSnapshot = await player.probe.state();
    expect(Math.abs(b.player!.x - a.player!.x)).toBeLessThan(3);
  });

  test('jump leaves the ground and lands again', async (): Promise<void> => {
    await player.jump();
    await player.probe.waitFor(
      'airborne',
      (s: E2eSnapshot): boolean => s.player!.isGrounded === false,
      { timeoutMs: 2_000 },
    );
    await player.probe.waitFor(
      'landed',
      (s: E2eSnapshot): boolean => s.player!.isGrounded === true,
      { timeoutMs: 4_000 },
    );
  });

  test('player cannot leave the world horizontally', async (): Promise<void> => {
    await player.hold(KEYS.left);
    await player.wait(4_000);
    await player.release(KEYS.left);
    const leftEdge: E2eSnapshot = await player.probe.state();
    expect(leftEdge.player!.x).toBeGreaterThanOrEqual(0);

    await player.hold(KEYS.right);
    await player.wait(5_000);
    await player.release(KEYS.right);
    const rightEdge: E2eSnapshot = await player.probe.state();
    expect(rightEdge.player!.x + WORLD.playerWidth).toBeLessThanOrEqual(WORLD.width);
  });

  test('player never falls through the ground', async (): Promise<void> => {
    for (let i: number = 0; i < 6; i++) {
      await player.jump();
      await player.press(KEYS.down, 200);
    }
    await player.probe.waitFor(
      'grounded again',
      (s: E2eSnapshot): boolean => s.player!.isGrounded,
      { timeoutMs: 4_000 },
    );
    const s: E2eSnapshot = await player.probe.state();
    expect(s.player!.y + WORLD.playerHeight).toBeLessThanOrEqual(WORLD.groundY + 2);
  });
});
