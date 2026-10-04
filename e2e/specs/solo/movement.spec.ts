import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { goToFloorWhere } from '../../support/navigation';

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

  /** Tracks the lowest y (highest point) the player reaches over `ms`. */
  async function apexOver(ms: number): Promise<number> {
    let apex: number = Infinity;
    const end: number = Date.now() + ms;
    while (Date.now() < end) {
      apex = Math.min(apex, (await player.probe.state()).player!.y);
      await player.wait(20);
    }
    return apex;
  }

  test('coyote time: jumping just after walking off a ledge still works', async (): Promise<void> => {
    // Stand near the right edge of a lowest-tier platform (floors are generated) and walk off.
    const s0: E2eSnapshot = await player.probe.state();
    const low: { x: number; y: number; width: number } = s0.level.platforms
      .filter((pl: { y: number }): boolean => pl.y === 530)
      .sort((a: { x: number }, b: { x: number }): number => a.x - b.x)[0];
    // Props keep 40 px off platform edges, so this spot is always clear.
    await player.probe.teleport(low.x + low.width - 34, low.y - WORLD.playerHeight);
    await player.probe.waitFor(
      'on the platform',
      (s: E2eSnapshot): boolean => s.player!.isGrounded,
    );
    // In-page watcher: press jump on the first frame the player is airborne (~1 tick late).
    await player.page.evaluate((): void => {
      const tick: () => void = (): void => {
        const s: { player: { isGrounded: boolean } | null } | null =
          window.__zbE2e?.getState() ?? null;
        if (s?.player && !s.player.isGrounded) {
          setTimeout((): void => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
            setTimeout((): void => {
              window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
            }, 150);
          }, 40);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await player.hold(KEYS.right);
    const apex: number = await apexOver(900);
    await player.release(KEYS.right);
    expect(apex, 'a late jump off the ledge still rises above the platform').toBeLessThan(
      low.y - WORLD.playerHeight - 30,
    );
  });

  test('variable jump height: a tap is a short hop, holding jumps higher', async (): Promise<void> => {
    await player.press(KEYS.jump, 40);
    const tapApex: number = await apexOver(900);
    await player.probe.waitFor('landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
      timeoutMs: 3_000,
    });
    await player.hold(KEYS.jump);
    const holdApex: number = await apexOver(900);
    await player.release(KEYS.jump);
    const ground: number = WORLD.groundY - WORLD.playerHeight;
    expect(ground - tapApex, 'tap height').toBeLessThan((ground - holdApex) * 0.7);
    expect(ground - holdApex, 'full jump still reaches ~116 px').toBeGreaterThan(105);
  });

  test('air control: you can steer a jump', async (): Promise<void> => {
    const start: E2eSnapshot = await player.probe.state();
    await player.hold(KEYS.jump);
    await player.probe.waitFor('airborne', (s: E2eSnapshot): boolean => !s.player!.isGrounded, {
      timeoutMs: 2_000,
    });
    await player.hold(KEYS.right);
    await player.probe.waitFor('landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
      timeoutMs: 3_000,
    });
    await player.release(KEYS.right);
    await player.release(KEYS.jump);
    const end: E2eSnapshot = await player.probe.state();
    expect(end.player!.x - start.player!.x, 'steered sideways in the air').toBeGreaterThan(40);
  });

  test('ropes: turn while climbing, jump alone keeps you on, direction + jump lets go', async (): Promise<void> => {
    const s0: E2eSnapshot = await goToFloorWhere(
      player,
      'a rope',
      (s: E2eSnapshot): boolean => s.level.ropes.some((r: { topY: number; bottomY: number }): boolean => r.bottomY - r.topY >= 90),
    );
    const rope: { x: number; topY: number; bottomY: number } = s0.level.ropes.find(
      (r: { topY: number; bottomY: number }): boolean => r.bottomY - r.topY >= 90,
    )!;
    await player.probe.teleport(rope.x - WORLD.playerWidth / 2, rope.bottomY - 100);
    await player.hold(KEYS.up);
    await player.probe.waitFor('climbing', (s: E2eSnapshot): boolean => s.player!.isClimbing, {
      timeoutMs: 2_000,
    });
    await player.release(KEYS.up);
    const facing: string = (await player.probe.state()).player!.facing;
    await player.press(facing === 'right' ? KEYS.left : KEYS.right, 100);
    const turned: E2eSnapshot = await player.probe.state();
    expect(turned.player!.isClimbing, 'still on the rope after turning').toBe(true);
    expect(turned.player!.facing).not.toBe(facing);

    await player.press(KEYS.jump, 100);
    expect(
      (await player.probe.state()).player!.isClimbing,
      'jump alone keeps you on the rope',
    ).toBe(true);

    await player.hold(KEYS.right);
    await player.press(KEYS.jump, 100);
    await player.release(KEYS.right);
    expect((await player.probe.state()).player!.isClimbing, 'right + jump lets go').toBe(false);
  });
});
