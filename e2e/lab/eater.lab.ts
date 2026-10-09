import { TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'fs';
import { test, SoloFactory, RoomFactory } from '../support/fixtures';
import { GamePlayer, KEYS } from '../support/game-player';
import { RoomSession } from '../support/room';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../support/probe';
import { WORLD } from '../support/invariants';
import { LevelPlatform, levelPlatforms, mealGroundX } from '../support/navigation';

/**
 * Eater lab: plays the Eater zombie in many situations and measures what it does (meals,
 * climbs, stuck spells, bites, puzzle side effects, host/guest agreement). Findings go to
 * e2e/.results/lab/findings.jsonl, screenshots next to them. Measurements, not pass/fail.
 * `npm run e2e:lab -- -g eater`
 */

const LAB_DIR: string = 'e2e/.results/lab';
const SAMPLE_MS: number = 250;
/** Not eating, hardly moving this long while corpses lie around: stuck. */
const STUCK_MS: number = 3_000;

async function record(
  testInfo: TestInfo,
  experiment: string,
  finding: Record<string, unknown>,
): Promise<void> {
  mkdirSync(LAB_DIR, { recursive: true });
  const line: string = JSON.stringify({ at: new Date().toISOString(), experiment, ...finding });
  appendFileSync(`${LAB_DIR}/findings.jsonl`, `${line}\n`);
  console.log(`FINDING ${line}`);
  await testInfo.attach(experiment, {
    body: JSON.stringify(finding, null, 2),
    contentType: 'application/json',
  });
}

async function snap(player: GamePlayer, name: string): Promise<string> {
  mkdirSync(LAB_DIR, { recursive: true });
  const path: string = `${LAB_DIR}/${name}.png`;
  await player.page.locator('canvas').first().screenshot({ path });
  return path;
}

function eaters(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter(
    (z: E2eZombieView): boolean => z.type === 'eater' && !z.isDead && z.spawnTimer <= 0,
  );
}

function feetOf(z: E2eZombieView): { x: number; y: number } {
  return { x: Math.round(z.x + z.width / 2), y: Math.round(z.y + z.height) };
}

interface StuckSpell {
  eater: string;
  at: { x: number; y: number };
  ms: number;
  anim: string | null;
  shot: string;
}

interface Track {
  x: number;
  y: number;
  since: number;
  anim: string | null;
  attacking: boolean;
  reported: boolean;
}

interface Observation {
  ms: number;
  eatersSeen: number;
  maxEatersAtOnce: number;
  corpsesBefore: number;
  corpsesAfter: number;
  meals: number;
  firstEaterMs: number | null;
  firstMealMs: number | null;
  jumps: number;
  attacks: number;
  highestFeetY: number;
  offScreen: number;
  anims: Record<string, number>;
  stuck: StuckSpell[];
}

/** Samples every Eater for `ms`, counting meals, jumps, attacks and stuck spells (with a screenshot each). */
async function observe(p: GamePlayer, ms: number, label: string): Promise<Observation> {
  const start: number = Date.now();
  const first: E2eSnapshot = await p.probe.state();
  const seen: Set<string> = new Set<string>();
  const last: Map<string, Track> = new Map<string, Track>();
  const anims: Record<string, number> = {};
  const stuck: StuckSpell[] = [];
  let corpses: number = first.corpses;
  let meals: number = 0;
  let jumps: number = 0;
  let attacks: number = 0;
  let maxAtOnce: number = 0;
  let highest: number = WORLD.groundY;
  let offScreen: number = 0;
  let firstEaterMs: number | null = null;
  let firstMealMs: number | null = null;
  while (Date.now() - start < ms) {
    const s: E2eSnapshot = await p.probe.state();
    const now: number = Date.now();
    const list: E2eZombieView[] = eaters(s);
    maxAtOnce = Math.max(maxAtOnce, list.length);
    if (list.length > 0 && firstEaterMs === null) firstEaterMs = now - start;
    if (
      s.corpses < corpses &&
      list.some((z: E2eZombieView): boolean => z.eating || last.get(z.id)?.anim === 'eating')
    ) {
      meals += corpses - s.corpses;
      if (firstMealMs === null) firstMealMs = now - start;
    }
    corpses = s.corpses;
    for (const z of list) {
      seen.add(z.id);
      const f: { x: number; y: number } = feetOf(z);
      anims[z.animState ?? 'none'] = (anims[z.animState ?? 'none'] ?? 0) + 1;
      highest = Math.min(highest, f.y);
      if (f.x < 0 || f.x > WORLD.width || f.y < 0) offScreen++;
      const prev: Track | undefined = last.get(z.id);
      if (prev && prev.anim !== 'jump' && z.animState === 'jump') jumps++;
      if (prev && !prev.attacking && z.isAttacking) attacks++;
      const moved: boolean = !prev || Math.abs(prev.x - f.x) + Math.abs(prev.y - f.y) > 6;
      if (moved || z.eating || s.corpses === 0) {
        last.set(z.id, {
          x: f.x,
          y: f.y,
          since: now,
          anim: z.animState,
          attacking: z.isAttacking,
          reported: false,
        });
      } else {
        prev!.anim = z.animState;
        prev!.attacking = z.isAttacking;
        if (!prev!.reported && now - prev!.since > STUCK_MS) {
          prev!.reported = true;
          const shot: string = await snap(p, `${label}-stuck-${stuck.length}`);
          stuck.push({
            eater: z.id.slice(0, 6),
            at: f,
            ms: now - prev!.since,
            anim: z.animState,
            shot,
          });
        }
      }
    }
    await p.wait(SAMPLE_MS);
  }
  return {
    ms,
    eatersSeen: seen.size,
    maxEatersAtOnce: maxAtOnce,
    corpsesBefore: first.corpses,
    corpsesAfter: corpses,
    meals,
    firstEaterMs,
    firstMealMs,
    jumps,
    attacks,
    highestFeetY: highest,
    offScreen,
    anims,
    stuck,
  };
}

async function restOnSafeSpot(p: GamePlayer): Promise<void> {
  const s: E2eSnapshot = await p.probe.state();
  const spot: { x: number; y: number; width: number } = s.level.safeSpot!;
  await p.probe.teleport(
    spot.x + spot.width / 2 - WORLD.playerWidth / 2,
    spot.y - WORLD.playerHeight,
  );
  await p.wait(400);
}

/** What weighs on the floor's puzzle: the floor-3 scale (kg) and the floor-5 plate. */
function puzzleLoad(s: E2eSnapshot): { scaleKg: number | null; plateWeight: number | null } {
  return { scaleKg: s.spring?.scaleKg ?? null, plateWeight: s.plate?.weight ?? null };
}

/** Regular ledges (not the safe spot) from low to high. */
function ledges(s: E2eSnapshot): LevelPlatform[] {
  const spot: { x: number; y: number; width: number } | null = s.level.safeSpot;
  return levelPlatforms(s)
    .filter(
      (pl: LevelPlatform): boolean =>
        pl.y < WORLD.groundY && (!spot || pl.y > spot.y) && pl.width >= 96,
    )
    .sort((a: LevelPlatform, b: LevelPlatform): number => b.y - a.y);
}

test.describe('eater lab', (): void => {
  test('eater: corpses spread over the ground and ledges, six layouts', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    for (let seed: number = 1; seed <= 6; seed++) {
      await p.probe.setLayoutSeed(seed);
      await p.wait(500);
      await restOnSafeSpot(p);
      const s: E2eSnapshot = await p.probe.state();
      const ground: number | null = mealGroundX(s, 120);
      const up: LevelPlatform[] = ledges(s);
      const spots: number[] = [ground !== null ? ground + 60 : 200];
      if (up[0]) spots.push(up[0].x + up[0].width / 2);
      const highest: LevelPlatform | undefined = up.find(
        (pl: LevelPlatform): boolean => pl.y < (up[0]?.y ?? 0),
      );
      if (highest) spots.push(highest.x + highest.width / 2);
      while (spots.length < 3) spots.push(spots[0] + 40);
      for (const x of spots) await p.probe.dropCorpses(x, 1);
      await p.wait(1500);
      const placed: E2eCorpseView[] = (await p.probe.state()).corpseViews;
      const o: Observation = await observe(p, 60_000, `eater-ledges-seed${seed}`);
      await record(testInfo, 'eater: corpses over ledges', {
        seed,
        corpses: placed.map(
          (c: E2eCorpseView): string =>
            `${Math.round(c.footX + c.footWidth / 2)},${Math.round(c.footY)}`,
        ),
        ...o,
      });
    }
  });

  test('eater: corpses lying on the safe spot', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s: E2eSnapshot = await p.probe.state();
    const spot: { x: number; y: number; width: number } = s.level.safeSpot!;
    await p.probe.teleport(spot.x + 4, spot.y - WORLD.playerHeight);
    await p.probe.dropCorpses(spot.x + spot.width - 30, 3);
    await p.wait(1500);
    const o: Observation = await observe(p, 45_000, 'eater-safe-spot');
    await record(testInfo, 'eater: corpses on the safe spot', { spot, ...o });
  });

  test('eater: the exit pile', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await restOnSafeSpot(p);
    const s: E2eSnapshot = await p.probe.state();
    await p.probe.dropCorpses(s.exitPile.centerX, 20);
    await p.wait(6000);
    const before: E2eSnapshot = await p.probe.state();
    const o: Observation = await observe(p, 90_000, 'eater-exit-pile');
    const after: E2eSnapshot = await p.probe.state();
    await snap(p, 'eater-exit-pile-after');
    await record(testInfo, 'eater: exit pile', {
      pileBefore: {
        bodies: before.exitPile.bodies,
        topY: before.exitPile.topY,
        reachable: before.exitPile.reachable,
      },
      pileAfter: {
        bodies: after.exitPile.bodies,
        topY: after.exitPile.topY,
        reachable: after.exitPile.reachable,
      },
      ...o,
    });
  });

  test('eater: puzzle floors 2 to 5', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const floors: number[] = [2, 3, 4, 5];
    for (const floor of floors) {
      await p.probe.setFloor(floor);
      await p.wait(3000);
      await restOnSafeSpot(p);
      const s: E2eSnapshot = await p.probe.state();
      const x: number = s.spring
        ? s.spring.scale.x + s.spring.scale.width / 2
        : s.plate
          ? s.plate.box.x + s.plate.box.width / 2
          : (mealGroundX(s, 120) ?? 300) + 60;
      await p.probe.dropCorpses(x, 4);
      await p.wait(2500);
      const before: E2eSnapshot = await p.probe.state();
      const o: Observation = await observe(p, 60_000, `eater-floor${floor}`);
      const after: E2eSnapshot = await p.probe.state();
      await snap(p, `eater-floor${floor}-after`);
      await record(testInfo, 'eater: puzzle floor', {
        floor,
        droppedAt: Math.round(x),
        puzzleBefore: puzzleLoad(before),
        puzzleAfter: puzzleLoad(after),
        ...o,
      });
    }
  });

  test('eater: the player snatches its meal', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await restOnSafeSpot(p);
    const s0: E2eSnapshot = await p.probe.state();
    const x: number = (mealGroundX(s0, 160) ?? 300) + 80;
    await p.probe.dropCorpses(x, 3);
    const eating: E2eSnapshot = await p.probe.waitFor(
      'an Eater eats',
      (s: E2eSnapshot): boolean => eaters(s).some((z: E2eZombieView): boolean => z.eating),
      { timeoutMs: 60_000 },
    );
    const eater: E2eZombieView = eaters(eating).find((z: E2eZombieView): boolean => z.eating)!;
    const meal: E2eCorpseView = eating.corpseViews.reduce(
      (a: E2eCorpseView, b: E2eCorpseView): E2eCorpseView =>
        Math.abs(b.footX + b.footWidth / 2 - feetOf(eater).x) <
        Math.abs(a.footX + a.footWidth / 2 - feetOf(eater).x)
          ? b
          : a,
    );
    await p.probe.teleport(
      meal.footX + meal.footWidth / 2 - WORLD.playerWidth / 2,
      meal.footY + 5 - WORLD.playerHeight,
    );
    await p.wait(200);
    await p.press(KEYS.carry, 80);
    await p.wait(300);
    const carried: E2eSnapshot = await p.probe.state();
    const shot: string = await snap(p, 'eater-snatched');
    const o: Observation = await observe(p, 15_000, 'eater-snatch');
    await record(testInfo, 'eater: meal snatched', {
      carrying: carried.player!.carryingCorpseIds.length,
      eaterAfterSnatch: eaters(carried).map(
        (z: E2eZombieView): string => `${z.animState} eating=${z.eating}`,
      ),
      shot,
      ...o,
    });
  });

  test('eater: hungry bites on a player (no god mode)', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.maxOutPlayer();
    await p.probe.setGodMode(true);
    await restOnSafeSpot(p);
    const s0: E2eSnapshot = await p.probe.state();
    const x: number = (mealGroundX(s0, 160) ?? 300) + 80;
    await p.probe.dropCorpses(x, 3);
    await p.probe.waitFor(
      'an Eater has eaten them all',
      (s: E2eSnapshot): boolean => eaters(s).length > 0 && s.corpses === 0,
      { timeoutMs: 90_000 },
    );
    const eater: E2eZombieView = eaters(await p.probe.state())[0];
    await p.probe.teleport(eater.x + eater.width + 4, WORLD.groundY - WORLD.playerHeight);
    await p.probe.setGodMode(false);
    const hpStart: number = (await p.probe.state()).player!.hp;
    const o: Observation = await observe(p, 15_000, 'eater-hungry-player');
    const end: E2eSnapshot = await p.probe.state();
    await record(testInfo, 'eater: hungry vs player', { hpStart, hpEnd: end.player!.hp, ...o });
  });

  test('eater: low gravity', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await restOnSafeSpot(p);
    const s0: E2eSnapshot = await p.probe.state();
    const up: LevelPlatform[] = ledges(s0);
    const x: number = up[0] ? up[0].x + up[0].width / 2 : 400;
    await p.probe.dropCorpses(x, 3);
    await p.probe.waitFor('an Eater comes', (s: E2eSnapshot): boolean => eaters(s).length > 0, {
      timeoutMs: 30_000,
    });
    await p.probe.activateSpecialDrop('low-gravity');
    const o: Observation = await observe(p, 30_000, 'eater-low-gravity');
    await record(testInfo, 'eater: low gravity', { ledgeY: up[0]?.y ?? null, ...o });
  });

  test('eater: killed mid-meal', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.maxOutPlayer();
    await p.probe.setGodMode(true);
    await restOnSafeSpot(p);
    const s0: E2eSnapshot = await p.probe.state();
    const x: number = (mealGroundX(s0, 160) ?? 300) + 80;
    await p.probe.dropCorpses(x, 4);
    const eating: E2eSnapshot = await p.probe.waitFor(
      'an Eater eats',
      (s: E2eSnapshot): boolean => eaters(s).some((z: E2eZombieView): boolean => z.eating),
      { timeoutMs: 60_000 },
    );
    const eater: E2eZombieView = eaters(eating).find((z: E2eZombieView): boolean => z.eating)!;
    await p.probe.teleport(eater.x - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await p.face('right');
    for (let i: number = 0; i < 12; i++) await p.press(KEYS.attack, 80);
    const after: E2eSnapshot = await p.probe.state();
    const dead: boolean = !after.zombies.some(
      (z: E2eZombieView): boolean => z.id === eater.id && !z.isDead,
    );
    const shot: string = await snap(p, 'eater-killed-mid-meal');
    await restOnSafeSpot(p);
    const o: Observation = await observe(p, 40_000, 'eater-after-kill');
    await record(testInfo, 'eater: killed mid-meal', {
      killed: dead,
      eaterHp: eater.hp,
      corpsesAfterKill: after.corpses,
      shot,
      ...o,
    });
  });

  test('eater: host and guest see the same Eater', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'eaterlab',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    for (const pl of session.players) {
      await pl.probe.setGodMode(true);
      await restOnSafeSpot(pl);
    }
    const s0: E2eSnapshot = await host.probe.state();
    await host.probe.dropCorpses((mealGroundX(s0, 160) ?? 300) + 80, 6);
    const start: number = Date.now();
    const mismatch: Record<string, number> = {};
    let compared: number = 0;
    let maxDrift: number = 0;
    let guestOnlyEaters: number = 0;
    while (Date.now() - start < 60_000) {
      const [h, g]: E2eSnapshot[] = await Promise.all([host.probe.state(), guest.probe.state()]);
      const onGuest: Map<string, E2eZombieView> = new Map<string, E2eZombieView>(
        eaters(g).map((z: E2eZombieView): [string, E2eZombieView] => [z.id, z]),
      );
      for (const z of eaters(h)) {
        const gz: E2eZombieView | undefined = onGuest.get(z.id);
        if (!gz) continue;
        compared++;
        maxDrift = Math.max(maxDrift, Math.abs(gz.x - z.x) + Math.abs(gz.y - z.y));
        if (gz.animState !== z.animState)
          mismatch[`${z.animState}->${gz.animState}`] =
            (mismatch[`${z.animState}->${gz.animState}`] ?? 0) + 1;
        onGuest.delete(z.id);
      }
      guestOnlyEaters += onGuest.size;
      await host.wait(SAMPLE_MS);
    }
    await snap(host, 'eater-online-host');
    await snap(guest, 'eater-online-guest');
    await record(testInfo, 'eater: host vs guest', {
      compared,
      animMismatches: mismatch,
      maxDriftPx: Math.round(maxDrift),
      guestOnlyEaterSamples: guestOnlyEaters,
    });
  });
});
