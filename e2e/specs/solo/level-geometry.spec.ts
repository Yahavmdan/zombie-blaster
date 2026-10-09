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
import { layoutWhere } from '../../support/navigation';
import { LevelProp } from '../../support/props';

const FLOORS: number[] = [1, 2, 3, 4, 5, 6];
/** Mirrors LEVEL_TILE_PX in shared/game-constants.ts: a platform is one tile tall. */
const TILE_PX: number = 32;

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

    test('walking into a prop stack too tall to step over stops you at its drawn side', async ({
      solo,
    }: {
      solo: SoloFactory;
    }): Promise<void> => {
      test.setTimeout(120_000);
      const p: GamePlayer = await solo('warrior');
      await p.probe.setGodMode(true);
      const s0: E2eSnapshot = await layoutWhere(
        p,
        'a prop stack on open ground',
        (s: E2eSnapshot): boolean => groundStack(s) !== undefined,
      );
      const stack: LevelProp[] = groundStack(s0)!;
      const left: number = Math.min(...stack.map((q: LevelProp): number => q.x));
      await p.probe.teleport(left - 90, WORLD.groundY - WORLD.playerHeight);
      await p.wait(300);
      await p.hold(KEYS.right);
      await p.wait(900);
      await p.release(KEYS.right);
      const s: E2eSnapshot = await p.probe.state();
      const rightEdge: number = s.player!.x + WORLD.playerWidth;
      const kinds: string = stack.map((q: LevelProp): string => q.kind).join(' under ');
      expect(
        rightEdge,
        `stopped at the ${kinds} stack's drawn left side (${left})`,
      ).toBeLessThanOrEqual(left + EDGE_TOLERANCE_PX);
      expect(rightEdge, 'walked all the way up to it').toBeGreaterThanOrEqual(left - 3);
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
          // Drop where the player's body overlaps this prop and nothing taller beside it. A
          // barrel under a ledge (crowded floors) has no room to stand on: it is skipped.
          const cx: number | undefined = soloDropSpot(
            prop,
            props,
            report.checks.filter((c: E2eGeometryCheck): boolean => c.kind === 'platform'),
          );
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

/** Two props stacked on open ground (base first), with nothing else on their left approach. */
function groundStack(s: E2eSnapshot): LevelProp[] | undefined {
  for (const base of s.level.props) {
    if (base.y + base.height !== WORLD.groundY || base.x < 150) continue;
    const top: LevelProp | undefined = s.level.props.find(
      (o: LevelProp): boolean =>
        o.y + o.height === base.y && o.x < base.x + base.width && o.x + o.width > base.x,
    );
    if (!top) continue;
    const left: number = Math.min(base.x, top.x);
    const approachClear: boolean = !s.level.props.some(
      (o: LevelProp): boolean =>
        o !== base && o !== top && o.x + o.width > left - 110 && o.x < base.x + base.width,
    );
    if (approachClear) return [base, top];
  }
  return undefined;
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

/**
 * A drop x whose 32 px body overlaps `prop` but no higher prop (e.g. a taller stack next to it),
 * with room to stand on it (no platform tile low over it).
 */
function soloDropSpot(
  prop: E2eGeometryCheck,
  props: E2eGeometryCheck[],
  platforms: E2eGeometryCheck[],
): number | undefined {
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
    const ledgeOver: boolean = platforms.some(
      (pl: E2eGeometryCheck): boolean =>
        pl.expectedTop < prop.expectedTop &&
        prop.expectedTop - (pl.expectedTop + TILE_PX) < WORLD.playerHeight + 4 &&
        overlaps(pl, left, right),
    );
    if (!higher && !ledgeOver) return cx;
  }
  return undefined;
}
