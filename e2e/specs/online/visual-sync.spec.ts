import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { ClassId, GamePlayer, KEYS } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { runBot } from '../../support/bot';
import { CapturedFrame } from '../../support/net-monitor';
import {
  E2eRemotePlayerView,
  E2eSkillView,
  E2eSnapshot,
  E2eVfxLogEntry,
} from '../../support/probe';

/**
 * "Every player always sees every other player's animations and effects."
 * The caster acts; the observer's probe proves the effect arrived AND rendered
 * (sprite animator state, replayed VFX with particle/sprite deltas).
 */

interface CastEvidence {
  skill: string;
  replayed: string[];
  rendered: boolean;
}

async function idOf(p: GamePlayer): Promise<string> {
  return (await p.probe.state()).player!.id;
}

function animOf(s: E2eSnapshot, id: string): string | null {
  return s.remotePlayers.find((r: E2eRemotePlayerView): boolean => r.id === id)?.animState ?? null;
}

function renderedSomething(e: E2eVfxLogEntry): boolean {
  return (
    (e.particlesAdded ?? 0) > 0 ||
    (e.spriteEffectsAdded ?? 0) > 0 ||
    (e.damageNumbersAdded ?? 0) > 0 ||
    (e.hitMarksAdded ?? 0) > 0
  );
}

async function waitObserverCalm(observer: GamePlayer): Promise<void> {
  await observer.probe.waitFor(
    'observer effects faded',
    (s: E2eSnapshot): boolean => s.vfx.particles < 120,
    { timeoutMs: 15_000 },
  );
}

/** Caster casts every usable skill; returns what the observer replayed for each. */
async function castAllAndObserve(
  caster: GamePlayer,
  observer: GamePlayer,
  testInfo: TestInfo,
): Promise<CastEvidence[]> {
  const casterId: string = await idOf(caster);
  const skills: E2eSkillView[] = (await caster.probe.state()).usableSkills;
  const evidence: CastEvidence[] = [];

  for (const skill of skills) {
    await caster.probe.waitFor(
      `${skill.id} ready`,
      (s: E2eSnapshot): boolean =>
        (s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)?.cooldownTicks ??
          0) === 0 && s.player!.isGrounded,
      { timeoutMs: 20_000 },
    );
    await waitObserverCalm(observer);
    const mark: number = (await observer.probe.vfxLog()).reduce(
      (m: number, e: E2eVfxLogEntry): number => Math.max(m, e.seq),
      0,
    );

    if (skill.mechanic === 'doubleJump') {
      await caster.jump();
      await caster.probe.waitFor('airborne', (s: E2eSnapshot): boolean => !s.player!.isGrounded, {
        timeoutMs: 2_000,
      });
    }
    await caster.castSkill(skill.slot);
    await observer.wait(900);

    const fromCaster: E2eVfxLogEntry[] = (await observer.probe.vfxLog()).filter(
      (e: E2eVfxLogEntry): boolean =>
        e.seq > mark && e.direction === 'replayed' && e.playerId === casterId,
    );
    evidence.push({
      skill: skill.id,
      replayed: [
        ...new Set<string>(
          fromCaster.map((e: E2eVfxLogEntry): string =>
            e.animationKey ? `${e.type}:${e.animationKey}` : e.type,
          ),
        ),
      ],
      rendered: fromCaster.some(renderedSomething),
    });
    await observer.attachCanvas(testInfo, `sees ${skill.id}`);
    await caster.probe.waitFor('caster landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
      timeoutMs: 5_000,
    });
  }
  return evidence;
}

const PAIRS: Array<{ host: ClassId; guest: ClassId }> = [
  { host: 'warrior', guest: 'assassin' },
  { host: 'assassin', guest: 'warrior' },
];

test.describe('everyone sees everyone', { tag: ['@online', '@visual'] }, (): void => {
  test('basic attack animation plays on the other screen (both directions)', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'atk',
    );
    const [host, guest]: GamePlayer[] = session.players;
    for (const [actor, observer] of [
      [host, guest],
      [guest, host],
    ] as Array<[GamePlayer, GamePlayer]>) {
      const actorId: string = await idOf(actor);
      await observer.probe.waitFor(
        `${observer.name} sees ${actor.name} idle`,
        (s: E2eSnapshot): boolean => animOf(s, actorId) === 'idle',
        { timeoutMs: 5_000 },
      );
      await actor.hold(KEYS.attack);
      try {
        await observer.probe.waitFor(
          `${observer.name} sees ${actor.name} attack`,
          (s: E2eSnapshot): boolean => animOf(s, actorId) === 'attack',
          { timeoutMs: 3_000 },
        );
      } finally {
        await actor.release(KEYS.attack);
      }
    }
  });

  test('run and jump animations are mirrored', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'priest' },
        { name: 'Guest', classId: 'ranger' },
      ],
      'move',
    );
    const [host, guest]: GamePlayer[] = session.players;
    const guestId: string = await idOf(guest);
    await guest.hold(KEYS.right);
    await host.probe.waitFor(
      'host sees guest run',
      (s: E2eSnapshot): boolean => animOf(s, guestId) === 'run',
      { timeoutMs: 3_000 },
    );
    await guest.release(KEYS.right);
    await guest.jump();
    await host.probe.waitFor(
      'host sees guest jump',
      (s: E2eSnapshot): boolean => ['jump', 'doubleJump'].includes(animOf(s, guestId) ?? ''),
      { timeoutMs: 3_000 },
    );
  });

  for (const pair of PAIRS) {
    test(`every ${pair.host} (host) and ${pair.guest} (guest) skill is replayed and rendered on the other screen`, async ({
      room,
    }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
      test.setTimeout(240_000);
      const session: RoomSession = await room(
        [
          { name: 'Host', classId: pair.host },
          { name: 'Guest', classId: pair.guest },
        ],
        'skills',
      );
      const [host, guest]: GamePlayer[] = session.players;
      for (const p of session.players) {
        await p.probe.maxOutPlayer();
        await p.probe.setGodMode(true);
      }
      await host.wait(1_500);

      const hostCasts: CastEvidence[] = await castAllAndObserve(host, guest, testInfo);
      const guestCasts: CastEvidence[] = await castAllAndObserve(guest, host, testInfo);
      await testInfo.attach('cast evidence', {
        body: JSON.stringify({ hostCasts, guestCasts }, null, 2),
        contentType: 'application/json',
      });

      for (const [who, list] of [
        ['host→guest', hostCasts],
        ['guest→host', guestCasts],
      ] as Array<[string, CastEvidence[]]>) {
        for (const e of list) {
          expect
            .soft(e.replayed.length, `${who}: ${e.skill} reached the other player`)
            .toBeGreaterThan(0);
          expect
            .soft(
              e.rendered,
              `${who}: ${e.skill} rendered something on the other screen (replayed ${e.replayed.join(', ')})`,
            )
            .toBe(true);
        }
      }
    });
  }

  test('level-up effect is shown to the other player', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'priest' },
      ],
      'lvl',
    );
    const [host, guest]: GamePlayer[] = session.players;
    const guestId: string = await idOf(guest);
    await waitObserverCalm(host);
    await host.probe.clearVfxLog();
    await guest.probe.levelUp(1);
    await expect(async (): Promise<void> => {
      const log: E2eVfxLogEntry[] = await host.probe.vfxLog();
      const lvl: E2eVfxLogEntry | undefined = log.find(
        (e: E2eVfxLogEntry): boolean => e.type === 'level-up' && e.playerId === guestId,
      );
      expect(lvl, 'host replayed the guest level-up').toBeDefined();
      expect(renderedSomething(lvl!)).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  test('a guest hit shows exactly one damage number on the host', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'priest' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'dmg',
    );
    const [host, guest]: GamePlayer[] = session.players;
    const guestId: string = await idOf(guest);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.waitFor(
      'zombies',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eSnapshot['zombies'][number]): boolean => z.spawnTimer <= 0),
      { timeoutMs: 20_000 },
    );
    await host.probe.clearVfxLog();
    host.net.reset();

    await runBot(guest, {
      durationMs: 45_000,
      onTick: (): boolean => host.net.ofType('received', 'zombie-damage').length < 5,
    });

    await host.wait(800);

    const guestHits: number = guest.net
      .ofType('sent', 'zombie-damage')
      .reduce(
        (sum: number, f: CapturedFrame): number =>
          sum + ((f.payload as { events?: unknown[] } | null)?.events?.length ?? 0),
        0,
      );
    const log: E2eVfxLogEntry[] = await host.probe.vfxLog();
    const drawnOnHost: number = log.filter(
      (e: E2eVfxLogEntry): boolean =>
        e.direction === 'replayed' &&
        e.playerId === guestId &&
        e.type === 'damage-number' &&
        (e.damageNumbersAdded ?? 0) > 0,
    ).length;
    const rebroadcastByHost: number = log.filter(
      (e: E2eVfxLogEntry): boolean => e.direction === 'sent' && e.playerId === guestId,
    ).length;
    await testInfo.attach('damage number evidence', {
      body: JSON.stringify({ guestHits, drawnOnHost, rebroadcastByHost }, null, 2),
      contentType: 'application/json',
    });
    expect(guestHits, 'guest landed hits').toBeGreaterThan(0);
    expect(drawnOnHost, 'each guest hit is drawn once on the host (from the guest broadcast)').toBe(
      guestHits,
    );
    expect(
      rebroadcastByHost,
      'host must not re-broadcast hit VFX for guest hits (3rd players would see them twice)',
    ).toBe(0);
  });

  test("a guest's special drop reaches the host without replaying its effects on the host player", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'priest' },
      ],
      'drop',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.waitFor(
      'host screen calm',
      (s: E2eSnapshot): boolean => s.vfx.screenFlashFrames === 0,
      { timeoutMs: 5_000 },
    );

    await guest.probe.activateSpecialDrop('super-speed');
    let maxHostFlash: number = 0;
    const deadline: number = Date.now() + 2_000;
    let applied: boolean = false;
    while (Date.now() < deadline) {
      const s: E2eSnapshot = await host.probe.state();
      maxHostFlash = Math.max(maxHostFlash, s.vfx.screenFlashFrames);
      applied = applied || s.activeSpecialEffects.includes('super-speed');
      await host.wait(40);
    }
    expect(applied, 'host simulation applies the guest pickup').toBe(true);
    expect(maxHostFlash, 'host does not flash its own screen for a remote pickup').toBe(0);
  });
});
