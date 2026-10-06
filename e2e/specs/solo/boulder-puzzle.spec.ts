import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eBoulderPuzzleView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { Brain } from '../../support/brain';

const PUZZLE_FLOOR: number = 2;

async function puzzleFloor(p: GamePlayer): Promise<E2eSnapshot> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(PUZZLE_FLOOR);
  return p.probe.waitFor(
    'the boulder puzzle floor',
    (st: E2eSnapshot): boolean => st.floor === PUZZLE_FLOOR && st.puzzle !== null,
  );
}

function towardWallKey(puzzle: E2eBoulderPuzzleView): string {
  return puzzle.wallDir === 1 ? KEYS.right : KEYS.left;
}

/** Walks into the opening from just outside it (props keep clear of that strip) until the next floor loads. */
async function walkOut(p: GamePlayer, puzzle: E2eBoulderPuzzleView): Promise<void> {
  const nearWall: number =
    puzzle.wallDir === 1
      ? puzzle.wall.x - WORLD.playerWidth - 8
      : puzzle.wall.x + puzzle.wall.width + 8;
  await p.probe.teleport(nearWall, WORLD.groundY - WORLD.playerHeight);
  await p.wait(250);
  await p.hold(towardWallKey(puzzle));
  await p.probe.waitFor(
    'walked out to the next floor',
    (st: E2eSnapshot): boolean => st.floor === PUZZLE_FLOOR + 1,
    { timeoutMs: 15_000 },
  );
  await p.release(towardWallKey(puzzle));
}

test.describe('boulder puzzle (floor 2)', { tag: '@solo' }, (): void => {
  test('floor 2: the boulder waits on the exit ledge behind its gate, and a wall closes the side', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await puzzleFloor(p);
    const puzzle: E2eBoulderPuzzleView = s0.puzzle!;
    expect(puzzle.ledge, 'the boulder ledge is the exit platform').toEqual(s0.exit);
    expect(puzzle.gateHits).toBe(0);
    expect(puzzle.boulder, 'the boulder rests on the ledge').not.toBeNull();
    expect(puzzle.boulder!.y + puzzle.boulder!.height).toBe(puzzle.ledge.y);
    expect(puzzle.progress).toBe(0);
    expect(puzzle.wallStanding).toBe(true);

    const startX: number =
      puzzle.wallDir === 1 ? puzzle.wall.x - 200 : puzzle.wall.x + puzzle.wall.width + 200;
    await p.probe.teleport(startX, WORLD.groundY - WORLD.playerHeight);
    await p.wait(250);
    await p.hold(towardWallKey(puzzle));
    await p.wait(1500);
    await p.release(towardWallKey(puzzle));
    const s: E2eSnapshot = await p.probe.state();
    const insideWall: boolean =
      s.player!.x + WORLD.playerWidth > puzzle.wall.x + 1 &&
      s.player!.x < puzzle.wall.x + puzzle.wall.width - 1;
    expect(insideWall, 'the wall stops the player').toBe(false);
    expect(s.floor, 'still on the puzzle floor').toBe(PUZZLE_FLOOR);
  });

  test('pile the dead under the ledge, climb up, break the gate: the boulder breaks the wall and the opening leads on', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(180_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await puzzleFloor(p);
    const puzzle: E2eBoulderPuzzleView = s0.puzzle!;
    let ready: E2eSnapshot = s0;
    for (let batch: number = 0; batch < 15 && !ready.exitPile.reachable; batch++) {
      await p.probe.dropCorpses(s0.exitPile.centerX, 10);
      await p.wait(2_500);
      ready = await p.probe.state();
    }
    expect(ready.exitPile.reachable, 'the pile reached jump range of the ledge').toBe(true);
    // Setup: start beside the pile; the Brain climbs it the way it climbs to any exit.
    const side: number = ready.exitPile.centerX < WORLD.width / 2 ? 1 : -1;
    await p.probe.teleport(
      ready.exitPile.centerX + side * 90 - WORLD.playerWidth / 2,
      WORLD.groundY - WORLD.playerHeight,
    );
    const logs: string[] = [];
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 60_000,
      goal: 'exit',
      log: (m: string): void => {
        logs.push(m);
      },
      stopWhen: (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.player!.y + WORLD.playerHeight === s.exit.y,
    });
    await brain.run();
    await p.releaseAll();
    await testInfo.attach('brain log', { body: logs.join('\n'), contentType: 'text/plain' });
    const onLedge: E2eSnapshot = await p.probe.state();
    expect(onLedge.player!.y + WORLD.playerHeight, 'climbed onto the ledge').toBe(onLedge.exit.y);
    expect(onLedge.floor, 'standing on the ledge does not end the floor').toBe(PUZZLE_FLOOR);

    // Walk up to the gate (it is solid: you stop against it) and keep swinging at it.
    await p.probe.clearVfxLog();
    await p.hold(towardWallKey(puzzle));
    await p.wait(1_000);
    await p.release(towardWallKey(puzzle));
    await p.hold(KEYS.attack);
    const broken: E2eSnapshot = await p.probe.waitFor(
      'three hits break the gate',
      (st: E2eSnapshot): boolean => st.puzzle!.gateHits >= st.puzzle!.gateHitsNeeded,
      { timeoutMs: 10_000 },
    );
    await p.release(KEYS.attack);
    expect(broken.floor).toBe(PUZZLE_FLOOR);
    const s: E2eSnapshot = await p.probe.waitFor(
      'the boulder rolls down and breaks the wall',
      (st: E2eSnapshot): boolean => st.puzzle!.wallBroken,
      { timeoutMs: 10_000 },
    );
    expect(s.puzzle!.wallStanding, 'the wall collision is gone').toBe(false);
    expect(s.puzzle!.boulder, 'the boulder shattered against the wall').toBeNull();
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'gate-break')).toBe(true);
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'wall-break')).toBe(true);
    await p.attachCanvas(testInfo, 'wall broken');

    await walkOut(p, puzzle);
  });
});
