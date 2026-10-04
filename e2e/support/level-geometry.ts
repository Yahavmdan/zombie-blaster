import { expect } from './fixtures';
import { E2eGeometryReport } from './probe';
import { GamePlayer } from './game-player';

/** Drawn edges may differ from collision edges by at most this (anti-aliasing, rounding). */
export const EDGE_TOLERANCE_PX: number = 1;

/**
 * What you see is what you stand on. Floors are generated, so on every floor the art that is
 * actually drawn (measured from rendered pixels) must sit exactly on the collision geometry,
 * every platform must hold the player at its drawn top, and every drawn ladder must be climbable
 * along its drawn center. Nothing may be drawn that you can't stand on or climb.
 */
export function expectArtMatchesCollision(report: E2eGeometryReport, where: string): void {
  expect(report.ready, `${where}: level art is drawn`).toBe(true);
  for (const c of report.checks) {
    const label: string = `${where}, ${c.object}`;
    expect(c.presentInFrame, `${label}: its art is in the rendered frame`).toBeGreaterThanOrEqual(
      0.99,
    );
    expect(c.drawnTop, `${label}: drawn top edge`).not.toBeNull();
    expect(
      Math.abs(c.drawnTop! - c.expectedTop),
      `${label}: art starts at the collision top`,
    ).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    expect(c.drawnLeft, `${label}: drawn left edge`).not.toBeNull();
    expect(Math.abs(c.drawnLeft! - c.expectedLeft), `${label}: left edge`).toBeLessThanOrEqual(
      EDGE_TOLERANCE_PX,
    );
    expect(Math.abs(c.drawnRight! - c.expectedRight), `${label}: right edge`).toBeLessThanOrEqual(
      EDGE_TOLERANCE_PX,
    );
    if (c.kind === 'rope') {
      expect(
        Math.abs(c.drawnBottom! - c.expectedBottom!),
        `${label}: ladder reaches the surface below`,
      ).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      expect(c.coverage, `${label}: ladder drawn along its whole length`).toBeGreaterThanOrEqual(
        0.9,
      );
    } else {
      expect(c.coverage, `${label}: surface drawn across its whole width`).toBeGreaterThanOrEqual(
        0.95,
      );
    }
  }
  expect(
    report.strayPixels,
    `${where}: art with nothing to stand on or climb (first at ${report.strayExample})`,
  ).toBe(0);
}

/** The geometry report once the level art has loaded and been drawn (assets load async). */
export async function drawnGeometry(player: GamePlayer, where: string): Promise<E2eGeometryReport> {
  const until: number = Date.now() + 15_000;
  let report: E2eGeometryReport = await player.probe.geometryReport();
  while (!report.ready && Date.now() < until) {
    await player.wait(200);
    report = await player.probe.geometryReport();
  }
  expect(report.ready, `${where}: level art finished loading`).toBe(true);
  return report;
}
