import { test, expect, SoloFactory } from '../../support/fixtures';
import { ALL_CLASSES, GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { vfxQueuedBy } from '../../support/vfx-gate';

/**
 * Passive skills (SKILLS with a passiveEffect in shared/game-constants.ts): every class has
 * Auto Potion (drinks below 50% HP / 30% MP, only once learned); the warrior also has Improved
 * HP Recovery (+HP every 10 s while standing still).
 */

/** Mirrors the auto-potion passive's hpThresholdPercent / mpThresholdPercent. */
const AUTO_HP_THRESHOLD: number = 0.5;
const AUTO_MP_THRESHOLD: number = 0.3;
/** Mirrors warrior-improved-hp-recovery: intervalMs and the max-level (16) heal. */
const HP_RECOVERY_INTERVAL_MS: number = 10_000;
const HP_RECOVERY_MAX_HEAL: number = 50;
const HEAL_NUMBER_COLOR: string = '#44ff44';

function hpPotions(s: E2eSnapshot): number {
  return s.player!.potions['hp-potion-1'] ?? 0;
}

function mpPotions(s: E2eSnapshot): number {
  return s.player!.potions['mp-potion-1'] ?? 0;
}

/** Stands the player on the ground with the zombies kept off by god mode. */
async function settle(player: GamePlayer): Promise<E2eSnapshot> {
  await player.probe.setGodMode(true);
  return player.probe.waitFor(
    'player standing on the ground',
    (s: E2eSnapshot): boolean => s.player!.isGrounded && Math.abs(s.player!.velocityX) < 0.1,
  );
}

test.describe('passive skills', { tag: '@solo' }, (): void => {
  for (const classId of ALL_CLASSES) {
    test(`${classId}: auto potion drinks below the thresholds only once learned`, async ({
      solo,
    }: {
      solo: SoloFactory;
    }): Promise<void> => {
      const player: GamePlayer = await solo(classId);
      const start: E2eSnapshot = await settle(player);
      expect(start.player!.skillLevels[`${classId}-auto-potion`] ?? 0, 'not learned yet').toBe(0);
      const maxHp: number = start.player!.maxHp;
      const maxMp: number = start.player!.maxMp;
      const lowHp: number = Math.max(1, Math.floor(maxHp * 0.2));
      const lowMp: number = Math.floor(maxMp * 0.1);

      // Without the passive: hurt and drained, nothing drinks for the player.
      await player.probe.setVitals(lowHp, lowMp);
      await player.wait(2_500);
      const untouched: E2eSnapshot = await player.probe.state();
      expect(hpPotions(untouched), 'no HP potion drunk without the passive').toBe(hpPotions(start));
      expect(mpPotions(untouched), 'no MP potion drunk without the passive').toBe(mpPotions(start));
      expect(untouched.player!.hp).toBe(lowHp);
      expect(untouched.player!.mp).toBe(lowMp);

      // Learn it (max level: 90% per try) while healthy: above both thresholds it waits.
      await player.probe.setVitals(Math.ceil(maxHp * 0.8), Math.ceil(maxMp * 0.8));
      await player.probe.maxAllSkills();
      await player.probe.waitFor(
        'auto potion learned',
        (s: E2eSnapshot): boolean => (s.player!.skillLevels[`${classId}-auto-potion`] ?? 0) > 0,
      );
      await player.wait(2_000);
      const healthy: E2eSnapshot = await player.probe.state();
      expect(hpPotions(healthy), 'above the HP threshold: no drink').toBe(hpPotions(start));
      expect(mpPotions(healthy), 'above the MP threshold: no drink').toBe(mpPotions(start));

      // Below the HP threshold: it drinks HP potions until HP is back over it (or none left).
      await player.probe.setVitals(lowHp, maxMp);
      const healed: E2eSnapshot = await player.probe.waitFor(
        'auto potion drank HP potions back over the threshold',
        (s: E2eSnapshot): boolean =>
          hpPotions(s) < hpPotions(start) &&
          (s.player!.hp > s.player!.maxHp * AUTO_HP_THRESHOLD || hpPotions(s) === 0),
        { timeoutMs: 8_000 },
      );
      expect(healed.player!.hp, 'the drink healed').toBeGreaterThan(lowHp);
      expect(mpPotions(healed), 'MP was full: no MP potion').toBe(mpPotions(start));
      await player.wait(1_500);
      expect(hpPotions(await player.probe.state()), 'over the threshold it stops').toBe(
        hpPotions(healed),
      );

      // Below the MP threshold: MP potions.
      await player.probe.setVitals(maxHp, lowMp);
      const refilled: E2eSnapshot = await player.probe.waitFor(
        'auto potion drank MP potions back over the threshold',
        (s: E2eSnapshot): boolean =>
          mpPotions(s) < mpPotions(start) &&
          (s.player!.mp > s.player!.maxMp * AUTO_MP_THRESHOLD || mpPotions(s) === 0),
        { timeoutMs: 8_000 },
      );
      expect(refilled.player!.mp, 'the drink restored MP').toBeGreaterThan(lowMp);
      expect(hpPotions(refilled), 'HP was full: no HP potion').toBe(hpPotions(healed));
    });
  }

  test('warrior: improved HP recovery heals every 10 s while standing still', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxAllSkills();
    const start: E2eSnapshot = await settle(player);
    expect(start.player!.skillLevels['warrior-improved-hp-recovery']).toBeGreaterThan(0);
    // Hurt, but above the auto-potion threshold so only the recovery heals.
    const hurtHp: number = Math.ceil(start.player!.maxHp * 0.6);
    await player.probe.setVitals(hurtHp, start.player!.maxMp);

    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(player, async (): Promise<void> => {
      await player.probe.waitFor(
        'HP recovered while standing still',
        (s: E2eSnapshot): boolean => s.player!.hp > hurtHp,
        { timeoutMs: HP_RECOVERY_INTERVAL_MS + 3_000, intervalMs: 250 },
      );
    });
    const after: E2eSnapshot = await player.probe.state();
    expect(after.player!.hp, 'one recovery tick').toBe(
      Math.min(after.player!.maxHp, hurtHp + HP_RECOVERY_MAX_HEAL),
    );
    expect(hpPotions(after), 'no potion was used').toBe(hpPotions(start));
    expect(
      queued.some(
        (e: E2eVfxLogEntry): boolean => e.type === 'damage-number' && e.color === HEAL_NUMBER_COLOR,
      ),
      'the green heal number is queued for other players',
    ).toBe(true);
  });

  test('warrior: improved HP recovery does nothing while the player keeps moving', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxAllSkills();
    const start: E2eSnapshot = await settle(player);
    const hurtHp: number = Math.ceil(start.player!.maxHp * 0.6);
    await player.probe.setVitals(hurtHp, start.player!.maxMp);

    // Held jump hops again on every landing: never standing still for more than a tick.
    await player.hold(KEYS.jump);
    let airborneSamples: number = 0;
    let samples: number = 0;
    const end: number = Date.now() + HP_RECOVERY_INTERVAL_MS + 2_000;
    while (Date.now() < end) {
      const s: E2eSnapshot = await player.probe.state();
      samples++;
      if (!s.player!.isGrounded) airborneSamples++;
      expect(s.player!.hp, 'no recovery while hopping').toBe(hurtHp);
      await player.wait(200);
    }
    await player.release(KEYS.jump);
    expect(airborneSamples, 'the player really kept hopping').toBeGreaterThan(samples / 2);

    // Standing still again, the recovery comes back.
    await player.probe.waitFor(
      'HP recovered once the player stood still',
      (s: E2eSnapshot): boolean => s.player!.hp > hurtHp,
      { timeoutMs: HP_RECOVERY_INTERVAL_MS + 3_000, intervalMs: 250 },
    );
  });
});
