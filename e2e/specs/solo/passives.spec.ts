import { test, expect, SoloFactory } from '../../support/fixtures';
import { ALL_CLASSES, GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { vfxQueuedBy } from '../../support/vfx-gate';
import { WARRIOR } from '../../support/warrior';

/**
 * Passive skills: every class has Auto Potion (drinks below 50% HP / 30% MP, only once learned;
 * legacy SKILLS passiveEffect, or the warrior tree's warrior-auto-potion); the warrior also has Iron
 * Recovery in its tree (a share of max HP every 3 s while standing still).
 */

/** Mirrors the auto-potion passive's hpThresholdPercent / mpThresholdPercent. */
const AUTO_HP_THRESHOLD: number = 0.5;
const AUTO_MP_THRESHOLD: number = 0.3;
/** Mirrors SKILL_IRON_RECOVERY_STILL_TICKS + SKILL_IRON_RECOVERY_INTERVAL_TICKS (50 + 150 ticks). */
const IRON_RECOVERY_FIRST_HEAL_MS: number = 4_000;
/** Mirrors warrior-iron-recovery's healPercent curve (StatCurve on str) and the warrior's base str. */
const IRON_RECOVERY_CURVE: { min: number; max: number; half: number } = { min: 2, max: 5, half: 60 };
const WARRIOR_BASE_STR: number = 15;
/** Every player regains 1 MP per second (PLAYER_MP_REGEN_INTERVAL_TICKS). */
const MP_REGEN_PER_S: number = 1;
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
      // Only the slow MP regen every player has (still well under the threshold).
      expect(untouched.player!.mp).toBeGreaterThanOrEqual(lowMp);
      expect(untouched.player!.mp).toBeLessThanOrEqual(lowMp + Math.ceil(2.5 * MP_REGEN_PER_S) + 1);

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

  test('warrior: iron recovery heals a share of max HP every 3 s while standing still', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setTreeSkills([WARRIOR.ironRecovery, WARRIOR.autoPotion]);
    const start: E2eSnapshot = await settle(player);
    expect(start.player!.skillLevels[WARRIOR.ironRecovery]).toBe(1);
    // Hurt, but above the auto-potion threshold so only the recovery heals.
    const hurtHp: number = Math.ceil(start.player!.maxHp * 0.6);
    await player.probe.setVitals(hurtHp, start.player!.maxMp);

    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(player, async (): Promise<void> => {
      await player.probe.waitFor(
        'HP recovered while standing still',
        (s: E2eSnapshot): boolean => s.player!.hp > hurtHp,
        { timeoutMs: IRON_RECOVERY_FIRST_HEAL_MS + 3_000, intervalMs: 250 },
      );
    });
    const after: E2eSnapshot = await player.probe.state();
    // healPercent = min + (max - min) * str / (str + half), of max HP, at least 1.
    const healPercent: number =
      IRON_RECOVERY_CURVE.min +
      (IRON_RECOVERY_CURVE.max - IRON_RECOVERY_CURVE.min) * (WARRIOR_BASE_STR / (WARRIOR_BASE_STR + IRON_RECOVERY_CURVE.half));
    const heal: number = Math.max(1, Math.floor(after.player!.maxHp * healPercent / 100));
    expect(after.player!.hp, `one recovery tick of ${heal} (${healPercent.toFixed(2)}% of max HP)`).toBe(
      Math.min(after.player!.maxHp, hurtHp + heal),
    );
    expect(hpPotions(after), 'no potion was used').toBe(hpPotions(start));
    expect(
      queued.some(
        (e: E2eVfxLogEntry): boolean => e.type === 'damage-number' && e.color === HEAL_NUMBER_COLOR,
      ),
      'the green heal number is queued for other players',
    ).toBe(true);
  });

  test('warrior: iron recovery does nothing while the player keeps moving', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setTreeSkills([WARRIOR.ironRecovery]);
    const start: E2eSnapshot = await settle(player);
    const hurtHp: number = Math.ceil(start.player!.maxHp * 0.6);
    await player.probe.setVitals(hurtHp, start.player!.maxMp);

    // Held jump hops again on every landing: never standing still for more than a tick.
    await player.hold(KEYS.jump);
    let airborneSamples: number = 0;
    let samples: number = 0;
    const end: number = Date.now() + IRON_RECOVERY_FIRST_HEAL_MS + 2_000;
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
      { timeoutMs: IRON_RECOVERY_FIRST_HEAL_MS + 3_000, intervalMs: 250 },
    );
  });
});
