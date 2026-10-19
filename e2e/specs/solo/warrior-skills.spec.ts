import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { vfxQueuedBy } from '../../support/vfx-gate';
import { WORLD } from '../../support/invariants';
import { goToFloorWhere } from '../../support/navigation';
import {
  SHORT_HOLD_MS,
  WARRIOR,
  animationsIn,
  castSkill,
  cooldownOf,
  doubleTapAttack,
  TOUGH_FLOOR,
  damageOf,
  expectAnimation,
  walkUpTo,
  warriorArena,
  zombieAt,
  zombieById,
} from '../../support/warrior';

/**
 * The warrior's skill tree. Three attacks fire from the attack button: double tap = Slash Blast, hold
 * in the air = Ground Slam, hold 1 s on the ground then let go = Power Dash. The other actives and
 * buffs fire from the skill bar, one key (1-6) per skill; a single tap is a plain swing. Each test
 * owns only the skills it needs (probe setup, which fills the bar in the order given) and presses
 * the real keys.
 */
test.describe('warrior skills', { tag: '@solo' }, (): void => {
  test.setTimeout(90_000);

  test('one key, one skill: each bar key fires only its own skill, a tap fires none', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await warriorArena(p, [WARRIOR.powerStrike, WARRIOR.slashBlast, WARRIOR.uppercut]);
    const s0: E2eSnapshot = await p.probe.state();
    // Slash blast is an attack combo (double tap): it takes no bar slot.
    expect(s0.player!.skillBar).toEqual([
      WARRIOR.powerStrike,
      WARRIOR.uppercut,
      null,
      null,
      null,
      null,
    ]);

    await p.attack();
    await p.wait(200);
    const swung: E2eSnapshot = await p.probe.state();
    for (const id of [WARRIOR.powerStrike, WARRIOR.slashBlast, WARRIOR.uppercut]) {
      expect(cooldownOf(swung, id), `attack does not fire ${id}`).toBe(0);
    }

    await p.castSkill(2);
    const two: E2eSnapshot = await p.probe.waitFor(
      'key 2 fired the uppercut',
      (s: E2eSnapshot): boolean => cooldownOf(s, WARRIOR.uppercut) > 0,
      { timeoutMs: 2_000 },
    );
    expect(cooldownOf(two, WARRIOR.slashBlast), 'key 2 is not slash blast').toBe(0);
    expect(cooldownOf(two, WARRIOR.powerStrike), 'key 2 is not power strike').toBe(0);

    await p.wait(400);
    await p.castSkill(1);
    const one: E2eSnapshot = await p.probe.waitFor(
      'key 1 fired power strike',
      (s: E2eSnapshot): boolean => cooldownOf(s, WARRIOR.powerStrike) > 0,
      { timeoutMs: 2_000 },
    );
    expect(cooldownOf(one, WARRIOR.slashBlast), 'key 1 is not slash blast').toBe(0);
  });

  test('an empty bar slot does nothing; passives never go on the bar', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await warriorArena(p, [WARRIOR.powerStrike, WARRIOR.ironRecovery, WARRIOR.autoPotion], false);
    const s0: E2eSnapshot = await p.probe.state();
    expect(s0.player!.skillBar).toEqual([WARRIOR.powerStrike, null, null, null, null, null]);
    await p.probe.setVitals(99_999, 99_999);
    const before: E2eSnapshot = await p.probe.state();
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, async (): Promise<void> => {
      for (const slot of [2, 3, 4, 5, 6]) await p.castSkill(slot);
    });
    expect(animationsIn(events), 'empty slots play nothing').toEqual([]);
    const after: E2eSnapshot = await p.probe.state();
    expect(after.player!.mp, 'empty slots spend no MP').toBeGreaterThanOrEqual(before.player!.mp);
  });

  test('power strike: its key hits the zombie in front and knocks it back', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerStrike], true, TOUGH_FLOOR);
    const z: string = await zombieAt(p, x + 60);
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, async (): Promise<void> => {
      await castSkill(p, WARRIOR.powerStrike);
      // The cooldown is short (600 ms): read it right after the key, not after the settle time.
      await p.probe.waitFor(
        'power strike on a short cooldown',
        (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.powerStrike) > 0,
        { timeoutMs: 1_000, intervalMs: 20 },
      );
    });
    await expectAnimation(events, 'warrior-power-strike');
    await p.probe.waitFor(
      'the zombie took the hit',
      (st: E2eSnapshot): boolean => damageOf(st, z) > 0,
      { timeoutMs: 2_000 },
    );
  });

  test('power dash: hold attack 1 s, let go, and it dashes through the zombies ahead', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerDash]);
    const z: string = await zombieAt(p, x + 140);
    await castSkill(p, WARRIOR.powerDash);
    const after: E2eSnapshot = await p.probe.waitFor(
      'dashed past the zombie and hit it',
      (s: E2eSnapshot): boolean => s.player!.x > x + 150 && damageOf(s, z) > 0,
      { timeoutMs: 4_000 },
    );
    expect(cooldownOf(after, WARRIOR.powerDash), 'power dash goes on cooldown').toBeGreaterThan(0);
  });

  test('a short hold is only a swing: no charge, no dash', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerDash]);
    let charged: boolean = false;
    await p.hold(KEYS.attack);
    const started: number = Date.now();
    while (Date.now() - started < SHORT_HOLD_MS) {
      charged = charged || (await p.probe.state()).player!.skillCharge !== null;
      await p.wait(30);
    }
    await p.release(KEYS.attack);
    await p.wait(400);
    const s: E2eSnapshot = await p.probe.state();
    expect(charged, 'no charge before a full second').toBe(false);
    expect(s.player!.skillCharge, 'nothing charging after letting go').toBeNull();
    expect(cooldownOf(s, WARRIOR.powerDash), 'no dash').toBe(0);
    // A swing may nudge the body a step; a dash covers 80 px or more.
    expect(Math.abs(s.player!.x - x), 'did not dash').toBeLessThan(40);
  });

  test('a hold past 1 s charges (a bar fills), letting go dashes; a fuller charge goes farther', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await warriorArena(p, [WARRIOR.powerDash]);
    /** Holds attack until the charge reads at least `fill`, lets go, returns how far the dash went. */
    const chargedDash: (fill: number) => Promise<{ distance: number; peak: number }> = async (
      fill: number,
    ): Promise<{ distance: number; peak: number }> => {
      await p.probe.waitFor(
        'dash ready, standing',
        (s: E2eSnapshot): boolean =>
          cooldownOf(s, WARRIOR.powerDash) === 0 &&
          s.player!.isGrounded &&
          Math.abs(s.player!.velocityX) < 0.1,
        { timeoutMs: 6_000 },
      );
      const fromX: number = (await p.probe.state()).player!.x;
      await p.hold(KEYS.attack);
      const charging: E2eSnapshot = await p.probe.waitFor(
        `charge at ${fill}`,
        (s: E2eSnapshot): boolean => (s.player!.skillCharge ?? -1) >= fill,
        { timeoutMs: 4_000, intervalMs: 20 },
      );
      await p.release(KEYS.attack);
      await p.probe.waitFor(
        'dashed',
        (s: E2eSnapshot): boolean => cooldownOf(s, WARRIOR.powerDash) > 0,
        { timeoutMs: 2_000, intervalMs: 20 },
      );
      await p.wait(1_200);
      const after: E2eSnapshot = await p.probe.state();
      expect(after.player!.skillCharge, 'the charge bar is gone after the dash').toBeNull();
      return { distance: Math.abs(after.player!.x - fromX), peak: charging.player!.skillCharge! };
    };
    // Short charge to the left, full charge back to the right (the arena has room both ways).
    await p.face('left');
    const short: { distance: number; peak: number } = await chargedDash(0.01);
    await p.face('right');
    const full: { distance: number; peak: number } = await chargedDash(1);
    expect(short.peak, 'let go early in the charge').toBeLessThan(0.5);
    expect(short.distance, 'even a short charge dashes').toBeGreaterThan(40);
    expect(
      full.distance,
      `full charge ${full.distance}px vs short ${short.distance}px`,
    ).toBeGreaterThan(short.distance * 1.4);
  });

  test('holding attack without power dash keeps swinging (a plain attack, no skill)', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerStrike], true, TOUGH_FLOOR);
    const z: string = await zombieAt(p, x + 50);
    let lastHp: number = (zombieById(await p.probe.state(), z) ?? { hp: 0 }).hp;
    let hits: number = 0;
    await p.hold(KEYS.attack);
    const started: number = Date.now();
    while (Date.now() - started < 4_000 && hits < 2) {
      const s: E2eSnapshot = await p.probe.state();
      const zz: E2eZombieView | undefined = zombieById(s, z);
      // A hit lowers its HP; the killing hit removes it.
      if (!zz || zz.isDead) {
        hits++;
        break;
      }
      if (zz.hp < lastHp) hits++;
      lastHp = zz.hp;
      // Hits knock it back: keep in reach, as a player would.
      if (zz.x - s.player!.x > 50) await p.press(KEYS.right, 60);
      await p.wait(30);
    }
    await p.release(KEYS.attack);
    expect(hits, 'held attack hit more than once').toBeGreaterThanOrEqual(2);
    expect(cooldownOf(await p.probe.state(), WARRIOR.powerStrike), 'no skill from attack').toBe(0);
  });

  test('slash blast: a double tap hits zombies on both sides; a single tap is only a swing', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerStrike, WARRIOR.slashBlast]);
    await p.attack();
    await p.wait(400);
    expect(cooldownOf(await p.probe.state(), WARRIOR.slashBlast), 'one tap: no slash blast').toBe(0);
    // Two taps far apart are two swings.
    await p.attack();
    await p.wait(700);
    await p.attack();
    await p.wait(300);
    expect(cooldownOf(await p.probe.state(), WARRIOR.slashBlast), 'slow taps: no slash blast').toBe(0);
    await p.wait(400);

    const left: string = await zombieAt(p, x - 50);
    const right: string = await zombieAt(p, x + 80);
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, (): Promise<void> => doubleTapAttack(p));
    await expectAnimation(events, 'warrior-slash-blast');
    const s: E2eSnapshot = await p.probe.waitFor(
      'both zombies hit',
      (st: E2eSnapshot): boolean => damageOf(st, left) > 0 && damageOf(st, right) > 0,
      { timeoutMs: 2_000 },
    );
    expect(cooldownOf(s, WARRIOR.slashBlast)).toBeGreaterThan(0);
  });

  test('rising uppercut: its key launches and stuns a zombie', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(
      p,
      [WARRIOR.powerStrike, WARRIOR.uppercut],
      true,
      TOUGH_FLOOR,
    );
    const z: string = await zombieAt(p, x + 55);
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, async (): Promise<void> => {
      await castSkill(p, WARRIOR.uppercut);
      await p.probe.waitFor(
        'the zombie flies up, stunned',
        (s: E2eSnapshot): boolean => {
          const zz: E2eZombieView | undefined = zombieById(s, z);
          return !!zz && zz.stunTicks > 0 && !zz.isGrounded;
        },
        { timeoutMs: 1_500, intervalMs: 20 },
      );
    });
    await expectAnimation(events, 'warrior-uppercut');
  });

  test('ground slam: holding attack in the air dives and slams; holding on the ground does not', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [
      WARRIOR.powerStrike,
      WARRIOR.slashBlast,
      WARRIOR.groundSlam,
    ]);
    const ground: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      (): Promise<void> => p.press(KEYS.attack, SHORT_HOLD_MS),
      300,
    );
    expect(animationsIn(ground), 'no slam from the ground').not.toContain('warrior-ground-slam');
    expect(cooldownOf(await p.probe.state(), WARRIOR.groundSlam)).toBe(0);

    const near: string = await zombieAt(p, x + 70);
    const air: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await p.hold(KEYS.jump);
        await p.probe.waitFor(
          'rising',
          (s: E2eSnapshot): boolean => s.player!.y < WORLD.groundY - WORLD.playerHeight - 60,
          { timeoutMs: 2_000 },
        );
        await p.release(KEYS.jump);
        await castSkill(p, WARRIOR.groundSlam);
        await p.probe.waitFor('landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
          timeoutMs: 2_000,
        });
      },
      300,
    );
    await expectAnimation(air, 'warrior-ground-slam');
    const s: E2eSnapshot = await p.probe.state();
    expect(cooldownOf(s, WARRIOR.groundSlam), 'the slam went on cooldown').toBeGreaterThan(0);
    expect(damageOf(s, near), 'the landing hit the zombie').toBeGreaterThan(0);
  });

  test('dragon roar: its key costs HP and stuns what survives', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.dragonRoar], false, TOUGH_FLOOR);
    const z: string = await zombieAt(p, x + 120);
    await p.probe.setVitals(99_999, 99_999);
    const before: E2eSnapshot = await p.probe.state();
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, (): Promise<void> =>
      castSkill(p, WARRIOR.dragonRoar),
    );
    await expectAnimation(events, 'warrior-dragon-roar');
    const after: E2eSnapshot = await p.probe.state();
    expect(after.player!.hp, 'the roar cost HP').toBeLessThan(before.player!.hp);
    const zz: E2eZombieView | undefined = zombieById(after, z);
    expect(!zz || zz.isDead || zz.stunTicks > 0, 'the zombie is stunned (or dead)').toBe(true);
  });

  test('shoulder charge: its key barrels forward and knocks a zombie down', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerDash, WARRIOR.shoulderCharge]);
    const z: string = await zombieAt(p, x + 100);
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(p, (): Promise<void> =>
      castSkill(p, WARRIOR.shoulderCharge),
    );
    await expectAnimation(events, 'warrior-shoulder-charge');
    await p.probe.waitFor(
      'the zombie is knocked down',
      (s: E2eSnapshot): boolean => {
        const zz: E2eZombieView | undefined = zombieById(s, z);
        return !zz || zz.isDead || (zz.stunTicks > 0 && damageOf(s, z) > 0);
      },
      { timeoutMs: 2_000 },
    );
  });

  test('backstep: its key hops back, still facing forward, untouchable', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerDash, WARRIOR.backstep]);
    let untouchable: number = 0;
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await castSkill(p, WARRIOR.backstep);
        untouchable = (await p.probe.state()).invincibilityFrames;
      },
      300,
    );
    await expectAnimation(events, 'warrior-backstep');
    const s: E2eSnapshot = await p.probe.state();
    expect(s.player!.facing).toBe('right');
    expect(s.player!.x, 'hopped back').toBeLessThan(x - 30);
    expect(untouchable, 'invulnerable during the hop').toBeGreaterThan(0);
  });

  test('monster magnet: its key reels a far zombie in and stuns it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.monsterMagnet]);
    const z: string = await zombieAt(p, x + 230);
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      (): Promise<void> => castSkill(p, WARRIOR.monsterMagnet),
      150,
    );
    await expectAnimation(events, 'warrior-monster-magnet');
    await p.probe.waitFor(
      'pulled in, then stunned',
      (s: E2eSnapshot): boolean => {
        const zz: E2eZombieView | undefined = zombieById(s, z);
        return (
          !!zz && zz.magnetPull === null && zz.stunTicks > 0 && Math.abs(zz.x - s.player!.x) < 120
        );
      },
      { timeoutMs: 3_000 },
    );
  });

  test('leap strike: from the ground its key jumps forward and crashes onto a zombie', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.leapStrike]);
    const z: string = await zombieAt(p, x + 130);
    let airborne: boolean = false;
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await castSkill(p, WARRIOR.leapStrike);
        airborne = await p.probe
          .waitFor('in the air', (s: E2eSnapshot): boolean => !s.player!.isGrounded, {
            timeoutMs: 1_000,
            intervalMs: 20,
          })
          .then(
            (): boolean => true,
            (): boolean => false,
          );
        await p.probe.waitFor('landed', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
          timeoutMs: 2_000,
        });
      },
      300,
    );
    expect(airborne, 'the leap left the ground').toBe(true);
    await expectAnimation(events, 'warrior-leap-strike');
    const s: E2eSnapshot = await p.probe.state();
    expect(s.player!.x, 'leapt forward').toBeGreaterThan(x + 50);
    expect(damageOf(s, z)).toBeGreaterThan(0);
  });

  test('buffs: power stance and hyper body each from their own key', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await warriorArena(p, [WARRIOR.powerStance, WARRIOR.hyperBody]);
    const stance: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      (): Promise<void> => castSkill(p, WARRIOR.powerStance),
      150,
    );
    await expectAnimation(stance, 'warrior-power-stance');
    const body: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      (): Promise<void> => castSkill(p, WARRIOR.hyperBody),
      150,
    );
    await expectAnimation(body, 'warrior-hyper-body');
    const s: E2eSnapshot = await p.probe.state();
    const stats: string[] = s.buffs.map(
      (b: { skillId: string; stat: string }): string => `${b.skillId}:${b.stat}`,
    );
    expect(stats).toContain('warrior-power-stance:knockbackResist');
    expect(stats).toContain('warrior-power-stance:defense');
    expect(stats).toContain('warrior-hyper-body:maxHpMaxMpPercent');
  });

  test('counter: its key just before a zombie hits parries it and strikes back', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.counter], true, TOUGH_FLOOR);
    let z: string = await zombieAt(p, x + 45);
    // React to the swing like a player: press counter just before it lands (the window is
    // 200-350 ms, and one that closes without a hit can't reopen for half a second).
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        const started: number = Date.now();
        while (Date.now() - started < 30_000) {
          const s: E2eSnapshot = await p.probe.state();
          const zz: E2eZombieView | undefined = zombieById(s, z);
          if (!zz || zz.isDead) {
            z = await zombieAt(p, s.player!.x + 45);
            continue;
          }
          if (zz.ticksToHit !== null && zz.ticksToHit <= 6) {
            await castSkill(p, WARRIOR.counter, s);
            await p.wait(400);
            if (animationsIn(await p.probe.vfxLog()).includes('warrior-counter')) return;
            await p.wait(500);
            continue;
          }
          if (Math.abs(zz.x - s.player!.x) > 60) await walkUpTo(p, z);
        }
      },
      100,
    );
    await expectAnimation(events, 'warrior-counter');
  });

  test('rampage: attack tapped as a dash ends chains another one', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.powerDash, WARRIOR.rampage]);
    // Dash left first: the arena has room on both sides of its middle.
    await p.face('left');
    const events: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await castSkill(p, WARRIOR.powerDash);
        // The dash has ended once the player stops moving: tap attack inside the rampage window.
        let lastX: number = x;
        const started: number = Date.now();
        while (Date.now() - started < 3_000) {
          const s: E2eSnapshot = await p.probe.state();
          if (x - s.player!.x > 80 && Math.abs(s.player!.x - lastX) < 1) break;
          lastX = s.player!.x;
          await p.wait(20);
        }
        await p.attack();
      },
      600,
    );
    await expectAnimation(events, 'warrior-rampage');
  });

  test('on a rope or ladder only buffs fire', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await goToFloorWhere(p, 'a rope', (s: E2eSnapshot): boolean =>
      s.level.ropes.some((r: { topY: number; bottomY: number }): boolean => r.bottomY - r.topY >= 90),
    );
    await p.probe.setGodMode(true);
    await p.probe.setTreeSkills([WARRIOR.powerStrike, WARRIOR.slashBlast, WARRIOR.powerStance]);
    const rope: { x: number; topY: number; bottomY: number } = s0.level.ropes.find(
      (r: { topY: number; bottomY: number }): boolean => r.bottomY - r.topY >= 90,
    )!;
    await p.probe.teleport(rope.x - WORLD.playerWidth / 2, rope.bottomY - 100);
    await p.hold(KEYS.up);
    await p.probe.waitFor('climbing', (s: E2eSnapshot): boolean => s.player!.isClimbing, {
      timeoutMs: 2_000,
    });
    await p.release(KEYS.up);

    await castSkill(p, WARRIOR.slashBlast);
    await castSkill(p, WARRIOR.powerStrike);
    await p.wait(300);
    const held: E2eSnapshot = await p.probe.state();
    expect(held.player!.isClimbing, 'still on the rope').toBe(true);
    expect(cooldownOf(held, WARRIOR.slashBlast), 'no slash blast on a rope').toBe(0);
    expect(cooldownOf(held, WARRIOR.powerStrike), 'no power strike on a rope').toBe(0);

    await castSkill(p, WARRIOR.powerStance);
    await p.probe.waitFor(
      'a buff works on the rope',
      (s: E2eSnapshot): boolean =>
        s.buffs.some((b: { skillId: string }): boolean => b.skillId === WARRIOR.powerStance),
      { timeoutMs: 2_000 },
    );
  });

  test('passives: heavy hands staggers, second wind survives a killing blow once', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const x: number = await warriorArena(p, [WARRIOR.heavyHands]);
    const z: string = await zombieAt(p, x + 50);
    await p.attack();
    await p.probe.waitFor(
      'a basic hit staggers the zombie',
      (s: E2eSnapshot): boolean => {
        const zz: E2eZombieView | undefined = zombieById(s, z);
        return !zz || zz.isDead || zz.stunTicks > 0;
      },
      { timeoutMs: 2_000 },
    );

    await warriorArena(p, [WARRIOR.secondWind], false);
    await p.probe.knockOut();
    const saved: E2eSnapshot = await p.probe.state();
    expect(saved.player!.isDead, 'second wind saved the player').toBe(false);
    expect(saved.player!.hp).toBeGreaterThanOrEqual(1);
    await p.wait(1_700);
    await p.probe.knockOut();
    expect(await p.probe.isGameOver(), 'only once per floor').toBe(true);
  });

  test('iron recovery heals while standing still; MP comes back on its own', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await warriorArena(p, [WARRIOR.ironRecovery], false);
    await p.probe.setVitals(10, 0);
    await p.probe.waitFor(
      'healed and got MP back',
      (s: E2eSnapshot): boolean => s.player!.hp > 10 && s.player!.mp >= 2,
      { timeoutMs: 6_000 },
    );
  });
});
