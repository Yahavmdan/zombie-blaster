import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGeometryCheck, E2eGeometryReport, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import {
  EDGE_TOLERANCE_PX,
  drawnGeometry,
  expectArtMatchesCollision,
} from '../../support/level-geometry';
import { goToFloorWhere } from '../../support/navigation';

const FLOORS: number[] = [1, 2, 3, 4, 5, 6];

/**
 * What you see is what you stand on, on every generated floor (helpers: support/level-geometry.ts).
 */
test.describe(
  'level geometry: what you see is what you stand on',
  { tag: ['@solo', '@visual'] },
  (): void => {
    test('on every generated floor the drawn platforms, ladders and exit match the collision geometry', async ({
      solo,
    }: {
      solo: SoloFactory;
    }, testInfo: TestInfo): Promise<void> => {
      test.setTimeout(180_000);
      const p: GamePlayer = await solo('warrior');
      await p.probe.setGodMode(true);
      const layouts: Set<string> = new Set<string>();
      for (const floor of FLOORS) {
        if (floor > 1) await p.probe.setFloor(floor);
        const s: E2eSnapshot = await p.probe.waitFor(
          `floor ${floor}`,
          (st: E2eSnapshot): boolean => st.floor === floor,
        );
        layouts.add(JSON.stringify(s.level.platforms) + JSON.stringify(s.level.ropes));
        const report: E2eGeometryReport = await drawnGeometry(p, `floor ${floor}`);
        await testInfo.attach(`floor ${floor} geometry`, {
          body: JSON.stringify({ level: s.level, exit: s.exit, report }, null, 2),
          contentType: 'application/json',
        });
        await p.attachCanvas(testInfo, `floor ${floor}`);
        expectArtMatchesCollision(report, `floor ${floor}`);
      }
      expect(layouts.size, 'every floor has its own layout').toBeGreaterThanOrEqual(
        FLOORS.length - 1,
      );
    });

    test('walking into a prop stops you at its drawn side', async ({
      solo,
    }: {
      solo: SoloFactory;
    }): Promise<void> => {
      test.setTimeout(120_000);
      const p: GamePlayer = await solo('warrior');
      await p.probe.setGodMode(true);
      const s0: E2eSnapshot = await goToFloorWhere(
        p,
        'a prop on open ground',
        (s: E2eSnapshot): boolean => groundProp(s) !== undefined,
      );
      const prop: LevelProp = groundProp(s0)!;
      await p.probe.teleport(prop.x - 90, WORLD.groundY - WORLD.playerHeight);
      await p.wait(300);
      await p.hold(KEYS.right);
      await p.wait(900);
      await p.release(KEYS.right);
      const s: E2eSnapshot = await p.probe.state();
      const rightEdge: number = s.player!.x + WORLD.playerWidth;
      expect(
        rightEdge,
        `stopped at the ${prop.kind}'s drawn left side (${prop.x})`,
      ).toBeLessThanOrEqual(prop.x + EDGE_TOLERANCE_PX);
      expect(rightEdge, 'walked all the way up to it').toBeGreaterThanOrEqual(prop.x - 3);
      expect(s.player!.y + WORLD.playerHeight, 'still on the ground beside it').toBe(WORLD.groundY);
    });

    test('you land exactly on every drawn platform and prop top and climb every drawn ladder at its center', async ({
      solo,
    }: {
      solo: SoloFactory;
    }): Promise<void> => {
      test.setTimeout(240_000);
      const p: GamePlayer = await solo('warrior');
      await p.probe.setGodMode(true);
      for (const floor of [1, 2, 3]) {
        if (floor > 1) await p.probe.setFloor(floor);
        await p.probe.waitFor(`floor ${floor}`, (st: E2eSnapshot): boolean => st.floor === floor);
        const report: E2eGeometryReport = await drawnGeometry(p, `floor ${floor}`);
        const props: E2eGeometryCheck[] = report.checks.filter(
          (c: E2eGeometryCheck): boolean => c.kind === 'prop',
        );
        // Platforms (at a spot with no prop on it) and every prop with nothing stacked on top.
        const surfaces: Array<{ check: E2eGeometryCheck; cx: number }> = [];
        for (const plat of report.checks.filter(
          (c: E2eGeometryCheck): boolean => c.kind === 'platform',
        )) {
          const cx: number | undefined = freeSpotOn(plat, props);
          if (cx !== undefined) surfaces.push({ check: plat, cx });
        }
        for (const prop of props) {
          // Drop where the player's body overlaps this prop and nothing taller beside it.
          const cx: number | undefined = soloDropSpot(prop, props);
          if (cx !== undefined) surfaces.push({ check: prop, cx });
        }
        for (const { check: plat, cx } of surfaces) {
          await p.probe.teleport(
            cx - WORLD.playerWidth / 2,
            plat.drawnTop! - WORLD.playerHeight - 60,
          );
          // Let the drop play out (a teleport can report grounded for a tick before falling).
          await p.wait(500);
          const landed: E2eSnapshot = await p.probe.waitFor(
            `floor ${floor}: landed on ${plat.object}`,
            (st: E2eSnapshot): boolean => st.player!.isGrounded && st.player!.velocityY === 0,
            { timeoutMs: 3_000 },
          );
          expect(
            Math.abs(landed.player!.y + WORLD.playerHeight - plat.drawnTop!),
            `floor ${floor}, ${plat.object}: feet rest on the drawn top (dropped at cx ${cx}; landed x ${Math.round(landed.player!.x)}, feet ${Math.round(landed.player!.y + WORLD.playerHeight)}, corpses ${landed.corpses}, zombies near ${landed.zombies.filter((z: E2eSnapshot['zombies'][number]): boolean => Math.abs(z.x - cx) < 60).length})`,
          ).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
        }
        const ladders: E2eGeometryCheck[] = report.checks.filter(
          (c: E2eGeometryCheck): boolean => c.kind === 'rope',
        );
        for (const ladder of ladders) {
          const drawnCenter: number = (ladder.drawnLeft! + ladder.drawnRight! + 1) / 2;
          const midY: number = (ladder.drawnTop! + ladder.drawnBottom!) / 2;
          await p.probe.teleport(
            drawnCenter - WORLD.playerWidth / 2,
            midY - WORLD.playerHeight / 2,
          );
          await p.hold(KEYS.up);
          const climbing: E2eSnapshot = await p.probe.waitFor(
            `floor ${floor}: climbing ${ladder.object}`,
            (st: E2eSnapshot): boolean => st.player!.isClimbing,
            { timeoutMs: 2_000 },
          );
          await p.release(KEYS.up);
          expect(
            Math.abs(climbing.player!.x + WORLD.playerWidth / 2 - drawnCenter),
            `floor ${floor}, ${ladder.object}: you climb along the drawn ladder`,
          ).toBeLessThanOrEqual(EDGE_TOLERANCE_PX + 0.5);
          await p.hold(KEYS.right);
          await p.press(KEYS.jump, 100);
          await p.release(KEYS.right);
        }
      }
    });
  },
);

type LevelProp = E2eSnapshot['level']['props'][number];

/** A prop standing on open ground with nothing else on its left approach. */
function groundProp(s: E2eSnapshot): LevelProp | undefined {
  return s.level.props.find(
    (q: LevelProp): boolean =>
      q.y + q.height === WORLD.groundY &&
      q.x > 120 &&
      !s.level.props.some(
        (o: LevelProp): boolean => o !== q && o.x + o.width > q.x - 110 && o.x < q.x,
      ),
  );
}

function overlaps(c: E2eGeometryCheck, left: number, right: number): boolean {
  return c.expectedLeft <= right && c.expectedRight >= left;
}

/** A landing x on a platform where no prop sits (the player is 32 px wide). */
function freeSpotOn(plat: E2eGeometryCheck, props: E2eGeometryCheck[]): number | undefined {
  for (let cx: number = plat.expectedLeft + 20; cx <= plat.expectedRight - 20; cx += 8) {
    const left: number = cx - WORLD.playerWidth / 2 - 2;
    const right: number = cx + WORLD.playerWidth / 2 + 2;
    const blocked: boolean = props.some(
      (q: E2eGeometryCheck): boolean =>
        q.expectedTop < plat.expectedTop && overlaps(q, left, right),
    );
    if (!blocked) return cx;
  }
  return undefined;
}

/** A drop x whose 32 px body overlaps `prop` but no higher prop (e.g. a taller stack next to it). */
function soloDropSpot(prop: E2eGeometryCheck, props: E2eGeometryCheck[]): number | undefined {
  const half: number = WORLD.playerWidth / 2;
  for (
    let cx: number = prop.expectedLeft - half + 2;
    cx <= prop.expectedRight + half - 2;
    cx += 2
  ) {
    const left: number = cx - half;
    const right: number = cx + half - 1;
    const higher: boolean = props.some(
      (q: E2eGeometryCheck): boolean =>
        q !== prop && q.expectedTop < prop.expectedTop && overlaps(q, left, right),
    );
    if (!higher) return cx;
  }
  return undefined;
}
