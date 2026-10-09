import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS, PROP_WEIGHT_KG, ZOMBIE_TYPES } from '@shared/index';
import { LooseProp, SpringState, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { SpringPuzzleLayout } from './engine-types';
import { Box, Point } from './boulder-puzzle';
import {
  SPRING_FLOOR_HINT,
  WeighedPlayer,
  buttonBox,
  buttonHitBy,
  buttonTopY,
  cablePath,
  corpsesOnSpring,
  countdownSeconds,
  flingIfOnSpring,
  freshLaunch,
  gaugeFraction,
  isBusy,
  isButtonUp,
  newSpringState,
  onSpring,
  plateOffset,
  pressButton,
  scaleBox,
  scaleLoadKg,
  scalePostX,
  scatterVelocity,
  springSpan,
  tickButton,
  tickSpring,
  tickSpringClient,
} from './spring-puzzle';
import { playerLoadKg, zombieWeightKg } from './weight';

const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const GROUND: number = GAME_CONSTANTS.GROUND_Y;
const TOP: number = GROUND - GAME_CONSTANTS.SPRING_HEIGHT_PX;
const COUNT: number = GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS;
const RISE: number = GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS;
const NEEDED: number = GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED;
const WALKER_KG: number = ZOMBIE_TYPES[ZombieType.Walker].weightKg;

/** Exit on the right (1068..1260): the spring spans 1068..1280, the button left of it, the scale far left. */
const RIGHT: SpringPuzzleLayout = {
  spring: { x: 1068, y: TOP, width: 212, height: GAME_CONSTANTS.SPRING_HEIGHT_PX },
  side: 1,
  scaleX: 432,
};

/** Mirror: exit on the left (20..212): the spring spans 0..212, the button right of it, the scale far right. */
const LEFT: SpringPuzzleLayout = {
  spring: { x: 0, y: TOP, width: 212, height: GAME_CONSTANTS.SPRING_HEIGHT_PX },
  side: -1,
  scaleX: 720,
};

/** Center of the RIGHT puzzle's pan. */
const PAN_CX: number = 432 + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX / 2;

type Attacker = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;

function attacker(overrides: Partial<Attacker>): Attacker {
  return {
    x: 0,
    y: GROUND - PH,
    facing: Direction.Right,
    isAttacking: true,
    isDead: false,
    isDown: false,
    ...overrides,
  };
}

function corpse(cx: number, feetY: number, overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  const width: number = 40;
  const height: number = 30;
  return {
    id: `c-${cx}-${feetY}`,
    type: ZombieType.Walker,
    x: cx - width / 2,
    y: feetY - height,
    width,
    height,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: false,
    landProcessed: true,
    fadeTimer: 0,
    maxFadeTimer: 1,
    showBlood: false,
    carrierId: null,
    ...overrides,
  };
}

function box(cx: number, bottom: number, overrides: Partial<LooseProp> = {}): LooseProp {
  const width: number = 27;
  const height: number = 22;
  return {
    id: `box-${cx}`,
    x: cx - width / 2,
    y: bottom - height,
    width,
    height,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    carrierId: null,
    weightKg: PROP_WEIGHT_KG.box,
    ...overrides,
  };
}

function zombie(cx: number, type: ZombieType, overrides: Partial<ZombieState> = {}): ZombieState {
  return {
    type,
    x: cx - 15,
    y: GROUND - 40,
    instanceWidth: 30,
    instanceHeight: 40,
    isDead: false,
    isGrounded: true,
    ...overrides,
  } as ZombieState;
}

function weighed(id: string, cx: number, overrides: Partial<WeighedPlayer> = {}): WeighedPlayer {
  return {
    id,
    x: cx - PW / 2,
    y: GROUND - PH,
    isGrounded: true,
    isDead: false,
    isClimbing: false,
    ...overrides,
  };
}

function state(overrides: Partial<SpringState> = {}): SpringState {
  return { ...newSpringState(), ...overrides };
}

function standingPlayer(x: number, feet: number = TOP): CharacterState {
  return {
    x,
    y: feet - PH,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isDown: false,
    isClimbing: false,
  } as CharacterState;
}

describe('weights (kg)', (): void => {
  it('every zombie type, the player and every prop material has a weight', (): void => {
    const types: ZombieType[] = Object.values(ZombieType);
    for (const type of types) {
      expect(zombieWeightKg(type), type).toBeGreaterThan(0);
    }
    expect(GAME_CONSTANTS.PLAYER_WEIGHT_KG).toBeGreaterThan(0);
    const propKgs: number[] = Object.values(PROP_WEIGHT_KG);
    for (const kg of propKgs) expect(kg).toBeGreaterThan(0);
    expect(zombieWeightKg(ZombieType.Tank)).toBeGreaterThan(zombieWeightKg(ZombieType.Runner));
  });

  it("a player weighs their body plus what they carry overhead, not anyone else's load", (): void => {
    const carried: ZombieCorpse[] = [
      corpse(0, 0, { id: 'a', carrierId: 'p1', type: ZombieType.Tank }),
      corpse(0, 0, { id: 'b', carrierId: 'p2' }),
    ];
    const props: LooseProp[] = [box(0, 0, { carrierId: 'p1' })];
    expect(playerLoadKg('p1', carried, props)).toBe(
      GAME_CONSTANTS.PLAYER_WEIGHT_KG + zombieWeightKg(ZombieType.Tank) + PROP_WEIGHT_KG.box,
    );
    expect(playerLoadKg('p3', carried, props)).toBe(GAME_CONSTANTS.PLAYER_WEIGHT_KG);
  });
});

describe('spring puzzle geometry', (): void => {
  it('the spring spans the exit from the screen edge; the button stands on the ground at its open side', (): void => {
    expect(springSpan(RIGHT)).toEqual([1068, 1280]);
    const right: Box = buttonBox(RIGHT);
    expect(right.x + right.width + GAME_CONSTANTS.SPRING_BUTTON_GAP_PX).toBe(1068);
    expect(right.y + right.height).toBe(GROUND);
    expect(buttonBox(LEFT).x).toBe(212 + GAME_CONSTANTS.SPRING_BUTTON_GAP_PX);
  });

  it('the pan is set into the ground (its top is the ground); its post stands at the end toward the spring', (): void => {
    const pan: Box = scaleBox(RIGHT);
    expect(pan.y).toBe(GROUND);
    expect(pan.width).toBe(GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX);
    expect(scalePostX(RIGHT)).toBe(432 + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX);
    expect(scalePostX(LEFT)).toBe(720);
  });

  it('the cable runs from the post up to the ceiling, along it, and down to the button cap', (): void => {
    const states: SpringState[] = [state(), state({ buttonTicks: RISE })];
    for (const s of states) {
      const path: Point[] = cablePath(RIGHT, s);
      expect(path[0].x).toBe(scalePostX(RIGHT));
      expect(path[1].y).toBe(GAME_CONSTANTS.SPRING_CABLE_Y);
      expect(path[2].y).toBe(GAME_CONSTANTS.SPRING_CABLE_Y);
      const button: Box = buttonBox(RIGHT);
      expect(path[3]).toEqual({ x: button.x + button.width / 2, y: buttonTopY(RIGHT, s) });
    }
    expect(buttonTopY(RIGHT, state())).toBe(GROUND);
    expect(buttonTopY(RIGHT, state({ buttonTicks: RISE }))).toBe(buttonBox(RIGHT).y);
  });
});

describe('the scale', (): void => {
  it('weighs corpses on the pan and piled on it by their type, not beside it, in the air, or on a ledge over it', (): void => {
    const corpses: ZombieCorpse[] = [
      corpse(PAN_CX, GROUND),
      corpse(PAN_CX + 30, GROUND - 40, { type: ZombieType.Tank }),
      corpse(PAN_CX + 120, GROUND),
      corpse(PAN_CX, GROUND - 10, { isGrounded: false }),
      corpse(PAN_CX, GROUND - 90),
    ];
    expect(scaleLoadKg(RIGHT, corpses, [], [], [])).toBe(
      WALKER_KG + zombieWeightKg(ZombieType.Tank),
    );
  });

  it('weighs lying props, standing zombies and players with their load; not the dead or climbing', (): void => {
    const props: LooseProp[] = [box(PAN_CX, GROUND), box(PAN_CX - 200, GROUND)];
    const zombies: ZombieState[] = [
      zombie(PAN_CX, ZombieType.Runner),
      zombie(PAN_CX, ZombieType.Tank, { isDead: true }),
      zombie(PAN_CX, ZombieType.Tank, { isGrounded: false }),
    ];
    const carried: ZombieCorpse[] = [corpse(0, 0, { carrierId: 'p1', isGrounded: false })];
    const players: WeighedPlayer[] = [
      weighed('p1', PAN_CX),
      weighed('p2', PAN_CX, { isDead: true }),
      weighed('p3', PAN_CX, { isClimbing: true }),
      weighed('p4', PAN_CX + 300),
    ];
    expect(scaleLoadKg(RIGHT, carried, props, zombies, players)).toBe(
      PROP_WEIGHT_KG.box +
        zombieWeightKg(ZombieType.Runner) +
        GAME_CONSTANTS.PLAYER_WEIGHT_KG +
        WALKER_KG,
    );
  });

  it('the cable pulls the button up slowly while loaded, and lets it sink back as slowly', (): void => {
    const s: SpringState = state({ scaleKg: NEEDED - 1 });
    tickButton(s);
    expect(s.buttonTicks).toBe(0);
    s.scaleKg = NEEDED;
    for (let i: number = 0; i < RISE - 1; i++) tickButton(s);
    expect(isButtonUp(s)).toBe(false);
    tickButton(s);
    expect(isButtonUp(s)).toBe(true);
    tickButton(s);
    expect(s.buttonTicks).toBe(RISE);
    s.scaleKg = 0;
    tickButton(s);
    expect(isButtonUp(s)).toBe(false);
    for (let i: number = 0; i < RISE + 5; i++) tickButton(s);
    expect(s.buttonTicks).toBe(0);
  });

  it('the gauge needle follows the load up to the needed weight', (): void => {
    expect(gaugeFraction(state())).toBe(0);
    expect(gaugeFraction(state({ scaleKg: NEEDED / 2 }))).toBe(0.5);
    expect(gaugeFraction(state({ scaleKg: NEEDED * 3 }))).toBe(1);
  });
});

describe('spring button', (): void => {
  const button: Box = buttonBox(RIGHT);
  const up: SpringState = state({ scaleKg: NEEDED, buttonTicks: RISE });

  it('a swing facing the raised button presses it from the ground or from the spring top', (): void => {
    const fromCenter: number = button.x - PW - 4;
    expect(buttonHitBy(attacker({ x: fromCenter, facing: Direction.Right }), RIGHT, up)).toBe(true);
    const fromSpring: number = button.x + button.width + 4;
    expect(
      buttonHitBy(attacker({ x: fromSpring, y: TOP - PH, facing: Direction.Left }), RIGHT, up),
    ).toBe(true);
  });

  it('sunk or half up, not facing it, out of reach, high above it, not attacking or downed: no press', (): void => {
    const x: number = button.x - PW - 4;
    expect(buttonHitBy(attacker({ x }), RIGHT, state())).toBe(false);
    expect(buttonHitBy(attacker({ x }), RIGHT, state({ buttonTicks: RISE - 1 }))).toBe(false);
    expect(buttonHitBy(attacker({ x, facing: Direction.Left }), RIGHT, up)).toBe(false);
    const far: number = button.x - PW - GAME_CONSTANTS.SPRING_HIT_REACH_PX - 1;
    expect(buttonHitBy(attacker({ x: far }), RIGHT, up)).toBe(false);
    expect(buttonHitBy(attacker({ x, y: button.y - PH - 10 }), RIGHT, up)).toBe(false);
    expect(buttonHitBy(attacker({ x, isAttacking: false }), RIGHT, up)).toBe(false);
    expect(buttonHitBy(attacker({ x, isDown: true }), RIGHT, up)).toBe(false);
  });

  it('a press on the raised button starts the 3-2-1; a sunk button or a busy spring ignores it', (): void => {
    expect(pressButton(state())).toBe(false);
    const s: SpringState = state({ scaleKg: NEEDED, buttonTicks: RISE });
    expect(pressButton(s)).toBe(true);
    expect(isBusy(s)).toBe(true);
    expect(countdownSeconds(s)).toBe(3);
    expect(pressButton(s)).toBe(false);
  });

  it('the countdown runs out into exactly one launch, then the spring bounces and is ready again while loaded', (): void => {
    const s: SpringState = state({ countdownTicks: COUNT, scaleKg: NEEDED, buttonTicks: RISE });
    let launches: number = 0;
    for (let i: number = 0; i < COUNT - 1; i++) if (tickSpring(s)) launches++;
    expect(launches).toBe(0);
    expect(countdownSeconds(s)).toBe(1);
    expect(tickSpring(s)).toBe(true);
    expect(s.launches).toBe(1);
    expect(freshLaunch(s)).toBe(true);
    for (let i: number = 0; i < GAME_CONSTANTS.SPRING_FLING_WINDOW_TICKS; i++) tickSpring(s);
    expect(freshLaunch(s)).toBe(false);
    for (let i: number = 0; i < GAME_CONSTANTS.SPRING_BOUNCE_TICKS; i++) tickSpring(s);
    expect(isBusy(s)).toBe(false);
    expect(pressButton(s)).toBe(true);
  });

  it("a client's countdown waits at its last tick for the host's launch; its button follows the synced kg", (): void => {
    const s: SpringState = state({ countdownTicks: 3, scaleKg: NEEDED });
    for (let i: number = 0; i < 10; i++) tickSpringClient(s);
    expect(s.countdownTicks).toBe(1);
    expect(s.launches).toBe(0);
    expect(s.buttonTicks).toBe(10);
  });
});

describe('spring launch', (): void => {
  it('launches a player on the spring straight up, high enough to land on the exit', (): void => {
    const p: CharacterState = { ...standingPlayer(1150), velocityX: 3 };
    expect(flingIfOnSpring(p, RIGHT)).toBe(true);
    expect(p.isGrounded).toBe(false);
    expect(p.velocityX, 'walking speed is dropped: straight up').toBe(0);
    let vy: number = p.velocityY;
    let feet: number = TOP;
    while (vy < 0) {
      vy += GAME_CONSTANTS.GRAVITY;
      feet += vy;
    }
    expect(feet).toBeLessThan(GAME_CONSTANTS.SPRING_LEDGE_Y - 40);
    expect(onSpring(standingPlayer(100), LEFT)).toBe(true);
  });

  it('players on corpses piled on the spring fly too; nobody beside it, mid-air or downed does', (): void => {
    expect(onSpring(standingPlayer(1150, TOP - 60), RIGHT)).toBe(true);
    expect(onSpring(standingPlayer(1000, GROUND), RIGHT)).toBe(false);
    expect(onSpring({ ...standingPlayer(1150), isGrounded: false }, RIGHT)).toBe(false);
    expect(onSpring({ ...standingPlayer(1150), isDown: true }, RIGHT)).toBe(false);
    const p: CharacterState = standingPlayer(300, GROUND);
    expect(flingIfOnSpring(p, LEFT)).toBe(false);
    expect(p.velocityY).toBe(0);
  });

  it('the corpses lying on the spring are the ones the launch throws', (): void => {
    const corpses: ZombieCorpse[] = [
      corpse(1100, TOP),
      corpse(1200, TOP - 120),
      corpse(1000, GROUND),
      corpse(1150, TOP, { isGrounded: false }),
    ];
    expect(corpsesOnSpring(corpses, RIGHT)).toHaveLength(2);
  });

  it('the launch scatters corpses up and out: every one clears the spring and lands within the scatter range', (): void => {
    for (const [puzzle, cx] of [
      [RIGHT, 1075],
      [RIGHT, 1270],
      [LEFT, 5],
      [LEFT, 205],
    ] as Array<[SpringPuzzleLayout, number]>) {
      for (const [spread, pop] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ] as Array<[number, number]>) {
        const c: ZombieCorpse = corpse(cx, TOP);
        const v: { vx: number; vy: number } = scatterVelocity(c, puzzle, spread, pop);
        expect(Math.sign(v.vx)).toBe(-puzzle.side);
        expect(v.vy).toBeLessThan(0);
        // Corpse flight (zombie-system): slide with drag, fall with gravity, back to spring-top height.
        let x: number = c.x;
        let vx: number = v.vx;
        let vy: number = v.vy;
        let feet: number = TOP;
        do {
          x += vx;
          vx *= 0.92;
          vy += GAME_CONSTANTS.GRAVITY;
          feet += vy;
        } while (feet < TOP);
        const [left, right]: [number, number] = springSpan(puzzle);
        const past: number = puzzle.side === 1 ? left - (x + c.width) : x - right;
        const where: string = `corpse at ${cx}, spread ${spread}, pop ${pop}: x ${x.toFixed(1)}`;
        expect(past, `${where} clears the spring`).toBeGreaterThanOrEqual(0);
        expect(past, where).toBeLessThanOrEqual(GAME_CONSTANTS.SPRING_SCATTER_MAX_PX + 40);
      }
    }
  });

  it('the plate rests level, sinks as it winds up and shoots up on release', (): void => {
    expect(plateOffset(state())).toBe(0);
    expect(plateOffset(state({ countdownTicks: 10 }))).toBeGreaterThan(0);
    expect(plateOffset(state({ bounceTicks: GAME_CONSTANTS.SPRING_BOUNCE_TICKS }))).toBeLessThan(0);
  });

  it('the floor hint names the scale, the button and the spring', (): void => {
    expect(SPRING_FLOOR_HINT).toContain('scale');
    expect(SPRING_FLOOR_HINT).toContain('button');
    expect(SPRING_FLOOR_HINT).toContain('hop on');
  });
});
