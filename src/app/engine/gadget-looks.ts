import { PIXEL } from './pixel-art';

/**
 * What each look of a gadget is painted with (`GAME_CONSTANTS.GADGET_LOOKS` lists them, `lookOf` in
 * `gadgets.ts` says which one a gadget has). Looks only change the art: size, weight and behaviour
 * stay the gadget's own. An unknown look falls back to the kind's first.
 */

/** A material's three tones: top-left light, its body, bottom-right shade. */
export interface Ramp {
  hi: string;
  mid: string;
  dark: string;
}

function ramp(name: string): Ramp {
  return { hi: PIXEL[`${name}Hi`], mid: PIXEL[name], dark: PIXEL[`${name}Dark`] };
}

const STEEL: Ramp = ramp('steel');
const GOLD: Ramp = ramp('gold');
const WOOD: Ramp = ramp('wood');
const RUST: Ramp = ramp('rust');
const BLOOD: Ramp = ramp('blood');
const TOXIC: Ramp = ramp('toxic');
const BLUE: Ramp = ramp('blue');
const TARP: Ramp = ramp('tarp');
const SHROUD: Ramp = ramp('shroud');
const BONE: Ramp = { hi: PIXEL['bone'], mid: PIXEL['boneDim'], dark: PIXEL['boneFaint'] };
const STONE: Ramp = { hi: PIXEL['stoneHi'], mid: PIXEL['stone'], dark: PIXEL['stoneDark'] };

export interface BoulderLook {
  /** Darkest to lightest: crack, shade, body, lit, highlight. */
  shades: string[];
  /** What cracks show (magma glows through them). */
  crack: string;
  /** Specks on the surface, or null to only lift the shade. */
  fleck: string | null;
}

const BOULDER_STONE: string[] = [
  PIXEL['stoneDeep'],
  PIXEL['stoneDark'],
  PIXEL['stoneMid'],
  PIXEL['stone'],
  PIXEL['stoneHi'],
];

export const BOULDER_LOOKS: Readonly<Record<string, BoulderLook>> = {
  granite: { shades: BOULDER_STONE, crack: PIXEL['stoneDeep'], fleck: null },
  mossy: { shades: BOULDER_STONE, crack: PIXEL['stoneDeep'], fleck: PIXEL['mossHi'] },
  iron: {
    shades: [
      PIXEL['ink2'],
      PIXEL['steelDark'],
      PIXEL['steel'],
      PIXEL['steelHi'],
      PIXEL['steelLight'],
    ],
    crack: PIXEL['ink2'],
    fleck: PIXEL['steelLight'],
  },
  magma: {
    shades: [
      PIXEL['ink2'],
      PIXEL['stoneDeep'],
      PIXEL['stoneDark'],
      PIXEL['stoneMid'],
      PIXEL['stone'],
    ],
    crack: PIXEL['rustHi'],
    fleck: PIXEL['goldHi'],
  },
};

/** A wall's shades by cell value: ink, mortar, then the ramp up to its highlight, then moss. */
function wallShades(mortar: string, a: string, b: string, c: string, d: string): string[] {
  return [PIXEL['ink'], mortar, a, b, c, d, PIXEL['moss'], PIXEL['mossHi']];
}

const STONE_SHADES: string[] = wallShades(
  PIXEL['stoneDeep'],
  PIXEL['stoneDark'],
  PIXEL['stoneMid'],
  PIXEL['stone'],
  PIXEL['stoneHi'],
);

export const WALL_LOOKS: Readonly<Record<string, string[]>> = {
  stone: STONE_SHADES,
  mossy: STONE_SHADES,
  brick: wallShades(
    PIXEL['stoneDark'],
    PIXEL['brickDark'],
    PIXEL['brick'],
    PIXEL['brick'],
    PIXEL['brickHi'],
  ),
  concrete: wallShades(
    PIXEL['stoneDark'],
    PIXEL['stoneMid'],
    PIXEL['stone'],
    PIXEL['stone'],
    PIXEL['stoneHi'],
  ),
};

export interface ButtonLook {
  cap: Ramp;
  /** Pressed, the cap sits flush and lights up in this. */
  lit: Ramp;
}

export const BUTTON_LOOKS: Readonly<Record<string, ButtonLook>> = {
  red: { cap: BLOOD, lit: GOLD },
  green: { cap: TOXIC, lit: TOXIC },
  blue: { cap: BLUE, lit: BLUE },
  hazard: { cap: GOLD, lit: GOLD },
};

export const SCALE_LOOKS: Readonly<Record<string, Ramp>> = {
  steel: STEEL,
  brass: GOLD,
  wood: WOOD,
  rust: RUST,
};

export interface LeverLook {
  handle: string;
  base: Ramp;
  knobOff: string;
  knobOn: string;
  /** Half the knob's size. */
  knob: number;
}

export const LEVER_LOOKS: Readonly<Record<string, LeverLook>> = {
  steel: {
    handle: PIXEL['steelHi'],
    base: STEEL,
    knobOff: PIXEL['blood'],
    knobOn: PIXEL['toxicHi'],
    knob: 4,
  },
  brass: {
    handle: PIXEL['goldHi'],
    base: GOLD,
    knobOff: PIXEL['rustDark'],
    knobOn: PIXEL['tealHi'],
    knob: 4,
  },
  wood: {
    handle: PIXEL['woodHi'],
    base: WOOD,
    knobOff: PIXEL['steelHi'],
    knobOn: PIXEL['goldHi'],
    knob: 4,
  },
  bone: {
    handle: PIXEL['bone'],
    base: STONE,
    knobOff: PIXEL['bloodHi'],
    knobOn: PIXEL['toxicHi'],
    knob: 6,
  },
};

export interface SpringLook {
  base: Ramp;
  /** The coil's lit strokes, the shaded ones and the shine on top. */
  coilHi: string;
  coilDark: string;
  coilShine: string;
  /** The plate's stripes and the gaps between them (top row, the rest). */
  stripe: Ramp;
  gapTop: string;
  gap: string;
}

export const SPRING_LOOKS: Readonly<Record<string, SpringLook>> = {
  hazard: {
    base: STEEL,
    coilHi: PIXEL['steelHi'],
    coilDark: PIXEL['steelDark'],
    coilShine: PIXEL['steelLight'],
    stripe: GOLD,
    gapTop: PIXEL['steel'],
    gap: PIXEL['ink2'],
  },
  blue: {
    base: BLUE,
    coilHi: PIXEL['steelLight'],
    coilDark: PIXEL['steel'],
    coilShine: PIXEL['white'],
    stripe: BLUE,
    gapTop: PIXEL['blueDark'],
    gap: PIXEL['blueDark'],
  },
  rust: {
    base: RUST,
    coilHi: PIXEL['rust'],
    coilDark: PIXEL['rustDark'],
    coilShine: PIXEL['rustHi'],
    stripe: RUST,
    gapTop: PIXEL['rustDark'],
    gap: PIXEL['stoneDeep'],
  },
  toxic: {
    base: { hi: PIXEL['steel'], mid: PIXEL['steelDark'], dark: PIXEL['ink2'] },
    coilHi: PIXEL['toxic'],
    coilDark: PIXEL['toxicDark'],
    coilShine: PIXEL['toxicHi'],
    stripe: TOXIC,
    gapTop: PIXEL['steelDark'],
    gap: PIXEL['ink2'],
  },
};

export interface SlingshotLook {
  cradle: Ramp;
  pouch: Ramp;
  arrow: string;
}

export const SLINGSHOT_LOOKS: Readonly<Record<string, SlingshotLook>> = {
  wood: { cradle: WOOD, pouch: RUST, arrow: PIXEL['goldHi'] },
  steel: { cradle: STEEL, pouch: BLOOD, arrow: PIXEL['goldHi'] },
  bone: { cradle: BONE, pouch: BLOOD, arrow: PIXEL['bloodHi'] },
  red: { cradle: BLOOD, pouch: WOOD, arrow: PIXEL['bone'] },
};

/** The steel housing a door slides into, by look: its leaf is drawn in `gadget-art.ts`. */
export const DOOR_LOOKS: Readonly<Record<string, Ramp>> = {
  shutter: { hi: PIXEL['steelLight'], mid: PIXEL['steelHi'], dark: PIXEL['steelDark'] },
  planks: WOOD,
  portcullis: STONE,
  hazard: GOLD,
};

export interface SlopeLook {
  /** The walkable top row. */
  top: string;
  /** The deck's colour this many px along it. */
  deck: (along: number) => string;
  /** A speck on the deck (rivet, nail), or null. */
  stud: string | null;
  strut: string;
}

export const SLOPE_LOOKS: Readonly<Record<string, SlopeLook>> = {
  steel: {
    top: PIXEL['steelLight'],
    deck: (): string => PIXEL['steel'],
    stud: PIXEL['steelHi'],
    strut: PIXEL['steelDark'],
  },
  wood: {
    top: PIXEL['woodHi'],
    deck: (along: number): string => (along % 24 < 2 ? PIXEL['woodDark'] : PIXEL['wood']),
    stud: PIXEL['steelLight'],
    strut: PIXEL['woodDark'],
  },
  hazard: {
    top: PIXEL['steelLight'],
    deck: (along: number): string =>
      Math.floor(along / 8) % 2 === 0 ? PIXEL['gold'] : PIXEL['ink2'],
    stud: null,
    strut: PIXEL['steelDark'],
  },
  grate: {
    top: PIXEL['steelHi'],
    deck: (along: number): string => (along % 8 < 4 ? PIXEL['ink2'] : PIXEL['steelDark']),
    stud: null,
    strut: PIXEL['steelDark'],
  },
};

/** A hung cage's cloth; `crate` and `vault` box it in instead (it hides what is in it either way). */
export const CAGE_LOOKS: Readonly<Record<string, Ramp>> = {
  tarp: TARP,
  shroud: SHROUD,
};
