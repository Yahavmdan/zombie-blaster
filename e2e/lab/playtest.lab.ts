import { TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'fs';
import { test, SoloFactory } from '../support/fixtures';
import { ClassId, GamePlayer, KEYS } from '../support/game-player';
import { Brain } from '../support/brain';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../support/probe';
import { WORLD } from '../support/invariants';
import { goToFloorWhere } from '../support/navigation';

/**
 * Playtest lab. Every experiment answers one design question by playing with real inputs
 * and records a finding. These are measurements: they only fail if the experiment itself
 * could not run.
 */

const LAB_DIR: string = 'e2e/.results/lab';

interface Platform {
  name: string;
  x: number;
  y: number;
  width: number;
}

/** Floors are generated: experiments that compare spots pin this layout seed in every session. */
const LAB_LAYOUT_SEED: number = 1;

function platformsOf(s: E2eSnapshot): Platform[] {
  return s.level.platforms.map(
    (pl: { x: number; y: number; width: number }): Platform => ({
      name: `${pl.x},${pl.y}`,
      x: pl.x,
      y: pl.y,
      width: pl.width,
    }),
  );
}

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

function standOn(platform: Platform, xCenter: number): { x: number; y: number } {
  const x: number = Math.max(
    platform.x + 4,
    Math.min(platform.x + platform.width - WORLD.playerWidth - 4, xCenter - WORLD.playerWidth / 2),
  );
  return { x, y: platform.y - WORLD.playerHeight };
}

test.describe('playtest lab', (): void => {
  test('rope: can you attack, turn and jump off while climbing?', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const withRope: E2eSnapshot = await goToFloorWhere(
      p,
      'a rope',
      (s: E2eSnapshot): boolean => s.level.ropes.length > 0,
    );
    const rope: { x: number; topY: number; bottomY: number } = withRope.level.ropes[0];
    await p.probe.teleport(rope.x - WORLD.playerWidth / 2, rope.bottomY - 100);
    await p.hold(KEYS.up);
    await p.wait(400);
    await p.release(KEYS.up);
    const onRope: E2eSnapshot = await p.probe.state();

    const anims: Set<string> = new Set<string>();
    let attacked: boolean = false;
    await p.hold(KEYS.attack);
    for (let i: number = 0; i < 12; i++) {
      const s: E2eSnapshot = await p.probe.state();
      anims.add(s.localAnimState);
      attacked = attacked || s.player!.isAttacking;
      await p.wait(80);
    }
    await p.release(KEYS.attack);
    const facingBefore: string = (await p.probe.state()).player!.facing;
    await p.press(KEYS.left, 150);
    const afterLeft: E2eSnapshot = await p.probe.state();
    await p.press(KEYS.jump, 120);
    const afterJump: E2eSnapshot = await p.probe.state();
    await snap(p, 'rope-attack');

    await record(testInfo, 'rope-attack', {
      grabbedRope: onRope.player!.isClimbing,
      attackRegisteredWhileClimbing: attacked,
      animationsShownWhileAttackingOnRope: [...anims],
      canTurnOnRope: afterLeft.player!.facing !== facingBefore,
      stillClimbingAfterLeft: afterLeft.player!.isClimbing,
      jumpAloneLeavesRope: !afterJump.player!.isClimbing,
    });
  });

  test('movement: jump height vs the gaps between platforms and the exit', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const results: Record<string, number> = {};
    for (const classId of ['warrior', 'assassin'] as ClassId[]) {
      const p: GamePlayer = await solo(classId);
      await p.probe.setGodMode(true);
      await p.probe.maxOutPlayer();
      await p.probe.waitFor('grounded', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
        timeoutMs: 5_000,
      });
      const groundY: number = (await p.probe.state()).player!.y;
      let apex: number = groundY;
      await p.press(KEYS.jump, 250);
      for (let i: number = 0; i < 25; i++) {
        apex = Math.min(apex, (await p.probe.state()).player!.y);
        await p.wait(30);
      }
      results[`${classId}.singleJumpPx`] = Math.round(groundY - apex);
      if (classId === 'assassin') {
        const skill: E2eSkillView | undefined = (await p.probe.state()).usableSkills.find(
          (k: E2eSkillView): boolean => k.mechanic === 'doubleJump',
        );
        await p.probe.waitFor('grounded', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
          timeoutMs: 5_000,
        });
        let apex2: number = groundY;
        await p.press(KEYS.jump, 250);
        await p.wait(150);
        if (skill) await p.castSkill(skill.slot);
        for (let i: number = 0; i < 30; i++) {
          apex2 = Math.min(apex2, (await p.probe.state()).player!.y);
          await p.wait(30);
        }
        results['assassin.doubleJumpPx'] = Math.round(groundY - apex2);
      }
      const s: E2eSnapshot = await p.probe.state();
      results.exitY = s.exit.y;
      results.exitX = Math.round(s.exit.x);
    }
    await record(testInfo, 'jump-reach', {
      ...results,
      gapLowestPlatformToExitPx: 530 - results.exitY,
      exitReachableByDoubleJumpFromLowPlatform:
        (results['assassin.doubleJumpPx'] ?? 0) >= 530 - results.exitY,
    });
  });

  test('afk: is there a spot where you can idle without being hurt?', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const scout: GamePlayer = await solo('warrior', 'scout');
    await scout.probe.setLayoutSeed(LAB_LAYOUT_SEED);
    const layout: E2eSnapshot = await scout.probe.state();
    const firstRope: { x: number; topY: number; bottomY: number } | undefined = layout.level.ropes[0];
    const spots: Array<{ name: string; x: number; y: number; rope?: boolean }> = [
      { name: 'ground-center', x: 624, y: WORLD.groundY - WORLD.playerHeight },
      ...platformsOf(layout).map((pl: Platform): { name: string; x: number; y: number } => ({
        name: pl.name,
        ...standOn(pl, pl.x + pl.width / 2),
      })),
      ...(firstRope
        ? [{ name: 'rope', x: firstRope.x - WORLD.playerWidth / 2, y: firstRope.bottomY - 100, rope: true }]
        : []),
    ];
    const results: Array<Record<string, unknown>> = await Promise.all(
      spots.map(
        async (spot: {
          name: string;
          x: number;
          y: number;
          rope?: boolean;
        }): Promise<Record<string, unknown>> => {
          const p: GamePlayer = await solo('warrior', spot.name);
          await p.probe.setLayoutSeed(LAB_LAYOUT_SEED);
          await p.probe.teleport(spot.x, spot.y);
          if (spot.rope) {
            await p.hold(KEYS.up);
            await p.wait(200);
            await p.release(KEYS.up);
          }
          const start: E2eSnapshot = await p.probe.state();
          let firstHitS: number | null = null;
          let minHp: number = start.player!.hp;
          let downed: boolean = false;
          for (let t: number = 0; t < 60; t++) {
            await p.wait(1_000);
            const s: E2eSnapshot = await p.probe.state();
            if (s.player!.hp < start.player!.hp && firstHitS === null) firstHitS = t + 1;
            minHp = Math.min(minHp, s.player!.hp);
            if (s.player!.isDead || (await p.probe.isGameOver())) {
              downed = true;
              break;
            }
          }
          const end: E2eSnapshot = await p.probe.state();
          return {
            spot: spot.name,
            firstHitAfterS: firstHitS,
            hpLostPct: Math.round(((start.player!.hp - minHp) / start.player!.maxHp) * 100),
            died: downed,
            stillOnSpot:
              Math.abs(end.player!.x - spot.x) < 40 && Math.abs(end.player!.y - spot.y) < 40,
          };
        },
      ),
    );
    await record(testInfo, 'afk-spots', { durationS: 60, floor: 1, level: 1, spots: results });
  });

  for (const classId of ['warrior', 'assassin'] as ClassId[]) {
    test(`exit: how long does a fresh ${classId} take to build the stack and climb out?`, async ({
      solo,
    }: {
      solo: SoloFactory;
    }, testInfo: TestInfo): Promise<void> => {
      const p: GamePlayer = await solo(classId);
      const started: number = Date.now();
      let readyAtS: number | null = null;
      let stepsAt60s: number | null = null;
      const brain: Brain = new Brain(p, {
        deadline: Date.now() + 360_000,
        goal: 'exit',
        stopWhen: (s: E2eSnapshot): boolean => {
          const t: number = (Date.now() - started) / 1000;
          if (readyAtS === null && s.exitStack.reachable) readyAtS = Math.round(t);
          if (stepsAt60s === null && t >= 60) stepsAt60s = s.exitStack.steps;
          return s.floor > 1;
        },
      });
      await brain.run();
      const end: E2eSnapshot = await p.probe.state();
      await snap(p, `exit-stack-${classId}`);
      await record(testInfo, `exit-stack-${classId}`, {
        level: end.player?.level,
        stepsNeeded: end.floor === 1 ? end.exitStack.stepsNeeded : 'done',
        stepsAt60s,
        stackReadyAfterS: readyAtS,
        reachedFloor2AfterS: end.floor > 1 ? Math.round((Date.now() - started) / 1000) : null,
        died: await p.probe.isGameOver(),
        potionsUsed: brain.stats.potionsUsed,
        kills: brain.stats.kills,
      });
    });
  }

  for (const classId of ['warrior', 'assassin'] as ClassId[]) {
    test(`skills: how does each ${classId} skill play against a crowd?`, async ({
      solo,
    }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
      const p: GamePlayer = await solo(classId);
      await p.probe.maxOutPlayer();
      await p.probe.setGodMode(true);
      await p.probe.setFloor(3);
      const skills: E2eSkillView[] = (await p.probe.state()).usableSkills;
      const rows: Array<Record<string, unknown>> = [];
      for (const skill of skills) {
        await p.probe.waitFor(
          `${skill.id} ready`,
          (s: E2eSnapshot): boolean =>
            (s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)?.cooldownTicks ??
              0) === 0,
          { timeoutMs: 30_000 },
        );
        // Let zombies gather around us.
        await p.probe
          .waitFor(
            'crowd nearby',
            (s: E2eSnapshot): boolean =>
              s.zombies.filter(
                (z: E2eZombieView): boolean =>
                  !z.isDead && z.spawnTimer <= 0 && Math.abs(z.x - s.player!.x) < 200,
              ).length >= 3,
            { timeoutMs: 30_000 },
          )
          .catch((): null => null);
        const before: E2eSnapshot = await p.probe.state();
        const near: E2eZombieView | undefined = before.zombies.find(
          (z: E2eZombieView): boolean => !z.isDead && Math.abs(z.x - before.player!.x) < 200,
        );
        if (near) await p.face(near.x > before.player!.x ? 'right' : 'left');
        const aliveBefore: Set<string> = new Set<string>(
          before.zombies
            .filter((z: E2eZombieView): boolean => !z.isDead)
            .map((z: E2eZombieView): string => z.id),
        );
        if (skill.mechanic === 'doubleJump') {
          await p.press(KEYS.jump, 150);
          await p.wait(100);
        }
        await p.castSkill(skill.slot);
        await p.wait(120);
        const impact: string = await snap(p, `skill-${skill.id}-impact`);
        const mid: E2eSnapshot = await p.probe.state();
        await p.wait(1_200);
        const after: E2eSnapshot = await p.probe.state();
        const killed: number = [...aliveBefore].filter(
          (id: string): boolean =>
            !after.zombies.some((z: E2eZombieView): boolean => z.id === id && !z.isDead),
        ).length;
        rows.push({
          skill: skill.id,
          mechanic: skill.mechanic,
          type: skill.type,
          zombiesWithin200: before.zombies.filter(
            (z: E2eZombieView): boolean => !z.isDead && Math.abs(z.x - before.player!.x) < 200,
          ).length,
          killedWithin1_3s: killed,
          particlesAtImpact: mid.vfx.particles,
          spriteEffects: mid.vfx.spriteEffects,
          screenShake: mid.vfx.screenShakeFrames,
          damageNumbersAtImpact: mid.vfx.damageNumbers,
          cooldownS:
            Math.round(
              ((mid.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)
                ?.cooldownTicks ?? 0) /
                50) *
                10,
            ) / 10,
          screenshot: impact,
        });
      }
      await record(testInfo, `skills-${classId}`, { floor: 3, level: 50, skills: rows });
    });
  }

  test('economy: does gold income keep up with potion use?', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const start: E2eSnapshot = await p.probe.state();
    const brain: Brain = new Brain(p, { deadline: Date.now() + 180_000, shop: false });
    await brain.run();
    const end: E2eSnapshot = await p.probe.state();
    const minutes: number = 3;
    await record(testInfo, 'economy', {
      minutes,
      level: end.player?.level,
      goldEarnedPerMin: Math.round((end.player!.gold - start.player!.gold) / minutes),
      potionsDrunkPerMin: Math.round((brain.stats.potionsUsed / minutes) * 10) / 10,
      hpPotionPrice: 30,
      teamKillsPerMin: Math.round(brain.stats.kills / minutes),
      downs: brain.stats.downs,
      survived: !(await p.probe.isGameOver()),
    });
  });
});
