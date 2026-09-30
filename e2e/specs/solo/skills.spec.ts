import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { ALL_CLASSES, GamePlayer } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

/** VFX event types that make a skill cast visible to other players. */
const BROADCAST_EFFECT_TYPES: string[] = [
  'skill-animation',
  'throwing-star',
  'dash-portal',
  'buff-activation',
  'magic-twin-spawn',
];

interface SkillCastResult {
  skill: string;
  mechanic: string;
  queued: string[];
  cooldownAfter: number;
  localEffect: boolean;
}

/** Puts the player in a state where the skill's mechanic can fire (double jump needs to be airborne). */
async function castInContext(player: GamePlayer, skill: E2eSkillView): Promise<void> {
  if (skill.mechanic === 'doubleJump') {
    await player.jump();
    await player.probe.waitFor(
      'airborne for double jump',
      (s: E2eSnapshot): boolean => !s.player!.isGrounded,
      { timeoutMs: 2_000 },
    );
  }
  await player.castSkill(skill.slot);
}

async function prepareMaxedPlayer(
  solo: SoloFactory,
  classId: GamePlayer['classId'],
): Promise<GamePlayer> {
  const player: GamePlayer = await solo(classId);
  await player.probe.maxOutPlayer();
  await player.probe.setGodMode(true);
  await player.wait(300);
  await player.probe.waitFor('player grounded', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
    timeoutMs: 5_000,
  });
  return player;
}

test.describe('skills', { tag: '@solo' }, (): void => {
  for (const classId of ALL_CLASSES) {
    test(`${classId}: every usable skill fires, shows a local effect, queues its VFX and goes on cooldown`, async ({
      solo,
    }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
      test.setTimeout(120_000);
      const player: GamePlayer = await prepareMaxedPlayer(solo, classId);
      const skills: E2eSkillView[] = (await player.probe.state()).usableSkills;
      test.skip(skills.length === 0, `${classId} has no active or buff skills yet`);
      const results: SkillCastResult[] = [];

      for (const skill of skills) {
        await player.probe.waitFor(
          `${skill.id} off cooldown`,
          (s: E2eSnapshot): boolean =>
            (s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)?.cooldownTicks ??
              0) === 0 && s.player!.isGrounded,
          { timeoutMs: 20_000 },
        );
        await player.probe.waitFor(
          'previous effects faded',
          (s: E2eSnapshot): boolean =>
            s.vfx.particles < 120 &&
            s.vfx.spriteEffects.length === 0 &&
            s.vfx.screenShakeFrames === 0 &&
            s.vfx.screenFlashFrames === 0,
          { timeoutMs: 15_000 },
        );
        const before: E2eSnapshot = await player.probe.state();
        const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
          player,
          (): Promise<void> => castInContext(player, skill),
          150,
        );
        const after: E2eSnapshot = await player.probe.state();

        const localEffect: boolean =
          after.vfx.particles > before.vfx.particles ||
          after.vfx.spriteEffects.length > before.vfx.spriteEffects.length ||
          after.vfx.playerProjectiles > before.vfx.playerProjectiles ||
          after.vfx.screenShakeFrames > 0 ||
          after.vfx.screenFlashFrames > 0;
        results.push({
          skill: skill.id,
          mechanic: skill.mechanic,
          queued: typesOf(queued),
          cooldownAfter:
            after.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)
              ?.cooldownTicks ?? 0,
          localEffect,
        });
        await player.attachCanvas(testInfo, `${skill.id} cast`);
        await player.probe.waitFor('landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
          timeoutMs: 5_000,
        });
      }

      await testInfo.attach(`${classId} skill results`, {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
      });
      for (const r of results) {
        expect.soft(r.cooldownAfter, `${r.skill} goes on cooldown`).toBeGreaterThan(0);
        expect.soft(r.localEffect, `${r.skill} shows a local effect`).toBe(true);
        expect.soft(r.queued.length, `${r.skill} queues VFX for other players`).toBeGreaterThan(0);
        expect
          .soft(
            r.queued.some((t: string): boolean => BROADCAST_EFFECT_TYPES.includes(t)),
            `${r.skill} broadcasts a visible effect (queued: ${r.queued.join(', ')})`,
          )
          .toBe(true);
      }
    });
  }

  test('skills respect their cooldown when the key is spammed', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await prepareMaxedPlayer(solo, 'warrior');
    const skill: E2eSkillView | undefined = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.mechanic === 'damage',
    );
    expect(skill, 'warrior has a damage skill').toBeDefined();

    await player.castSkill(skill!.slot);
    const afterFirst: E2eSnapshot = await player.probe.state();
    const cooldownMs: number =
      (afterFirst.usableSkills.find((k: E2eSkillView): boolean => k.id === skill!.id)
        ?.cooldownTicks ?? 0) * 20;
    expect(cooldownMs, 'first cast starts a cooldown').toBeGreaterThan(0);
    await player.probe.waitFor(
      'cooldown over',
      (s: E2eSnapshot): boolean =>
        (s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill!.id)?.cooldownTicks ??
          0) === 0,
      { timeoutMs: 20_000 },
    );

    const spamStart: number = Date.now();
    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
      player,
      async (): Promise<void> => {
        for (let i: number = 0; i < 25; i++) {
          await player.castSkill(skill!.slot);
        }
      },
      0,
    );
    const elapsedMs: number = Date.now() - spamStart;
    const casts: number = queued.filter(
      (e: E2eVfxLogEntry): boolean =>
        e.type === 'skill-animation' && e.animationKey === skill!.animationKey,
    ).length;
    const allowed: number = Math.floor(elapsedMs / cooldownMs) + 1;
    expect(
      casts,
      `${casts} casts in ${elapsedMs}ms with a ${cooldownMs}ms cooldown`,
    ).toBeLessThanOrEqual(allowed);
    expect(casts).toBeGreaterThanOrEqual(1);
  });

  test('casting costs mana when god mode is off', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await prepareMaxedPlayer(solo, 'warrior');
    await player.probe.setGodMode(false);
    const skill: E2eSkillView = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.mechanic === 'damage',
    )!;
    const before: E2eSnapshot = await player.probe.state();
    await player.castSkill(skill.slot);
    const after: E2eSnapshot = await player.probe.waitFor(
      'mana spent',
      (s: E2eSnapshot): boolean => s.player!.mp < before.player!.mp,
      { timeoutMs: 2_000 },
    );
    expect(after.player!.mp).toBeLessThan(before.player!.mp);
  });
});
