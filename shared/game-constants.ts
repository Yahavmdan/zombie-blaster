import {
  CharacterClass,
  CharacterClassDefinition,
  CharacterStats,
} from './character';
import {
  ZombieType,
  ZombieDefinition,
  ZombieState,
  ShopItemDefinition,
  PotionDefinition,
  PotionCategory,
  SpecialDropType,
  SpecialDropDefinition,
  QuickSlotEntry,
  QuickSlotAction,
  QUICK_SLOT_ACTIONS,
  PropMaterial,
} from './game-entities';
import { KeyBindings } from './messages';
import { SkillDefinition, SkillType } from './skill';
import { AttackCombo, ClassSkillTree, TreeSkill } from './skill-tree';

// ═══════════════════════════════════════════════════════════════
//  GAME CONSTANTS
//  Single source of truth for ALL tunable game variables.
//  Edit this file to adjust game balance, physics, combat, etc.
// ═══════════════════════════════════════════════════════════════

export const GAME_CONSTANTS = {

  // ─── Canvas & World ─────────────────────────────
  CANVAS_WIDTH: 1280, // Width of the game screen in pixels
  CANVAS_HEIGHT: 720, // Height of the game screen in pixels
  GROUND_Y: 620, // Y position of the ground floor (pixels from top)
  BACKGROUND_STAR_COUNT: 80, // Number of decorative stars drawn in the background

  // ─── Physics ────────────────────────────────────
  GRAVITY: 0.5, // Downward pull applied every tick to airborne entities
  TERMINAL_VELOCITY: 25, // Maximum falling speed anything can reach
  PLATFORM_SNAP_TOLERANCE: 6, // How close (pixels) you must be to a platform edge to land on it
  PLATFORM_DROP_TICKS: 8, // How many ticks the player falls through a platform when pressing down

  // ─── Weight (kg) ────────────────────────────────
  // Every body and object has a weight, for scales, plates and anything that should feel heavy.
  // Zombies: ZOMBIE_TYPES[type].weightKg (a corpse weighs what its zombie did). Props: PROP_WEIGHT_KG.
  PLAYER_WEIGHT_KG: 80, // A player's body; what they carry overhead weighs on top of this

  // ─── Player Movement ────────────────────────────
  PLAYER_WIDTH: 32, // Player hitbox width in pixels
  PLAYER_HEIGHT: 48, // Player hitbox height in pixels
  PLAYER_JUMP_FORCE: -11, // Upward velocity applied when jumping (negative = up)
  PLAYER_MOVE_SPEED: 3, // Horizontal speed when walking
  PLAYER_FRICTION: .9, // Ground friction multiplier each tick (closer to 0 = more slippery)
  PLAYER_AIR_DRAG: 0.99, // Air resistance multiplier each tick while airborne
  PLAYER_MIN_VELOCITY: 1, // Speeds below this are snapped to zero (stops sliding)
  JUMP_BUFFER_TICKS: 6, // Ticks a jump press is remembered if it arrives between game ticks (~120ms at 50 tps)
  COYOTE_TICKS: 5, // Ticks after walking off a ledge during which a jump still works (~100 ms)
  JUMP_CUT_MULTIPLIER: 0.5, // Releasing jump while rising multiplies upward speed by this (short hops)
  APEX_HANG_VELOCITY: 1.5, // Near the top of a held jump (|vy| below this) gravity is reduced...
  APEX_HANG_GRAVITY_MULT: 0.5, // ...to this fraction, for a floatier, more controllable peak
  HITSTOP_NORMAL_TICKS: 1, // Solo only: world freezes this long when your hit lands (~20 ms)...
  HITSTOP_CRIT_TICKS: 4, // ...and this long on a critical hit (~80 ms)
  HITSTOP_COOLDOWN_TICKS: 6, // Minimum gap between freezes so multi-hit skills don't stutter
  PLAYER_AIR_ACCEL: 0.35, // Horizontal acceleration per tick while airborne and holding a direction (air control)

  // ─── Double Jump ─────────────────────────────
  DOUBLE_JUMP_FORCE: -9, // Upward velocity applied during a double jump (negative = up)
  DOUBLE_JUMP_HORIZONTAL_BURST: 7, // Horizontal speed burst during a double jump
  DOUBLE_JUMP_ANIM_TICKS: 30, // Ticks the double jump animation plays

  // ─── Player Combat ─────────────────────────────
  PLAYER_BASE_ATTACK_RANGE: 50, // How far (pixels) the basic attack reaches beyond the player body
  ASSASSIN_ATTACK_RANGE: 160, // Assassin throws stars — ranged basic attack reach in pixels
  PLAYER_ATTACK_COOLDOWN_TICKS: 36, // Minimum ticks between basic attacks
  PLAYER_ATTACK_ANIM_MS: 720, // How long the attack animation plays in milliseconds
  PLAYER_ATTACK_HIT_DELAY_MS: 360, // Delay after pressing attack before damage is actually dealt
  PLAYER_SKILL_ANIM_MS: 480, // How long skill attack animations play in milliseconds
  INVINCIBILITY_FRAMES: 90, // Ticks of invincibility after the player takes damage
  INVINCIBILITY_BLINK_RATE: 3, // Player blinks every N ticks during invincibility
  PLAYER_HURT_TINT_TICKS: 18, // Ticks the player's sprite stays tinted red after a hit

  // ─── Knockback ──────────────────────────────────
  KNOCKBACK_FORCE_PLAYER: 6, // How far the player is pushed back when hit by a zombie
  KNOCKBACK_FORCE_ZOMBIE: 8, // How far a zombie is pushed back when hit by the player
  KNOCKBACK_UP_FORCE: -5, // Upward pop applied during any knockback (negative = up)
  KNOCKBACK_ZOMBIE_FRAMES: 10, // How many ticks a zombie stays in knockback before regaining control

  // ─── Player Derived Stat Formulas ───────────────
  PLAYER_BASE_HP: 50, // Starting HP at level 1 before any stat bonuses
  PLAYER_BASE_MP: 30, // Starting MP at level 1 before any stat bonuses
  PLAYER_HP_PER_LEVEL: 25, // Extra max HP gained per level up
  PLAYER_MP_PER_LEVEL: 3, // Extra max MP gained per level up
  PLAYER_SPEED_PER_DEX: 0.05, // Bonus move speed per point of DEX
  PLAYER_CRIT_RATE_CAP: 60, // Maximum critical hit chance in percent
  PLAYER_CRIT_DAMAGE_BASE: 150, // Base critical hit damage as a percent of normal damage

  // ─── XP & Leveling ─────────────────────────────
  XP_BASE: 120, // XP needed to reach level 2
  XP_GROWTH: 1.3, // Each level requires this much more XP than the previous one (skill-tree capstones at lv 16 stay reachable)
  STAT_POINTS_PER_LEVEL: 5, // Stat points awarded per level up
  SKILL_POINTS_PER_LEVEL: 3, // Skill points per level up for classes without a skill tree (SKILLS levels)
  MAX_SKILL_LEVEL: 20, // Highest level any skill can be raised to

  // ─── Floor Progression ────────────────────────
  FLOOR_TRANSITION_TICKS: 120, // Ticks the "floor complete" screen shows before the next floor
  FLOOR_INITIAL_SPAWN_DELAY_TICKS: 60, // Ticks before zombies start spawning at the start of a new floor
  FLOOR_MAX_ALIVE_ZOMBIES_BASE: 10, // Max zombies alive at once on floor 1
  FLOOR_MAX_ALIVE_ZOMBIES_GROWTH: 2, // Extra max zombies added per floor
  FLOOR_MAX_ALIVE_ZOMBIES_CAP: 30, // Absolute max zombies alive at once regardless of floor

  // ─── Exit Platform (floor exit) ──────────────
  EXIT_PLATFORM_Y: 310, // Exit height on floor 1 solo: above what a double jump reaches from the ground or a low platform (~14 bodies)
  EXIT_RISE_PER_FLOOR: 12, // The exit sits this much higher each floor (more bodies needed)
  EXIT_RISE_PER_EXTRA_PLAYER: 64, // ...and this much higher per extra player (co-op kills faster)
  EXIT_PLATFORM_MIN_Y: 150, // Highest the exit ever goes
  EXIT_PLATFORM_WIDTH: 192, // Width of the exit platform: whole tiles (6 × 32), so the art matches the collision box
  EXIT_PLATFORM_HEIGHT: 32, // Height of the exit platform: one tile
  EXIT_EDGE_MARGIN_PX: 20, // Gap between the exit and the screen edge it hangs at
  LEVEL_TILE_PX: 32, // Platforms are whole tiles wide and one tile tall: drawn art == collision box
  LEVEL_TIER_Y: [530, 430, 330], // Platform surfaces by tier: each is one jump (≤ 100 px) above the one below
  LEVEL_EXIT_CLEARANCE_PX: 48, // No platform within this of the exit's span (the ground under it stays open)
  LEVEL_TIER2_EXIT_GAP_PX: 320, // Tier-2 platforms keep this far from the exit (no double jump across)
  LEVEL_TIER3_EXIT_GAP_PX: 480, // Tier-3 platforms keep this far from the exit
  LEVEL_PLATFORM_GAP_PX: 64, // Minimum gap between two platforms on the same tier
  LEVEL_STEP_UP_GAP_PX: 24, // A platform one tier up is jumpable if its span is within this of the one below
  EXIT_REACH_PX: 100, // The exit is in jump reach once a corpse pile under it tops out this close below it (jump is ~116 px)
  LEVEL_SAFE_SPOT_Y: 230, // Surface of each floor's safe spot: a high ledge reached by its own ladder
  LEVEL_SAFE_SPOT_TILES: 5, // Width of the safe spot in tiles (room for a full party)
  LEVEL_SAFE_SPOT_EXIT_GAP_PX: 640, // The safe spot keeps this far from the exit (no dropping from it onto the exit)
  PUZZLE_BOULDER_FLOOR: 2, // Floor whose exit is a side wall broken by a boulder (the hanging exit is the boulder's ledge)
  BOULDER_SIZE_PX: 48, // Boulder diameter: its box is size x size
  BOULDER_GATE_HITS: 3, // Hits the small wall (gate) holding the boulder takes before it breaks
  BOULDER_GATE_WIDTH_PX: 16, // The gate stands on the ledge's downhill edge: this wide...
  BOULDER_GATE_HEIGHT_PX: 40, // ...and this tall
  BOULDER_HIT_REACH_PX: 24, // Max gap between an attacking player's box and the gate for the swing to hit it
  BOULDER_HIT_COOLDOWN_TICKS: 36, // One gate hit per swing (a held attack swings every 36 ticks)
  BOULDER_ROLL_ACCEL: 0.35, // Speed (px/tick) the released boulder gains each tick along its path
  BOULDER_MAX_SPEED: 14, // Top rolling speed (px/tick)
  BOULDER_CRUSH_DAMAGE_PERCENT: 60, // The boulder (and the wall's debris) takes this share of a zombie's max HP, once
  BOULDER_CHUTE_MIN_SPAN_PX: 256, // The chute from the ledge to the wall spans at least this far...
  BOULDER_CHUTE_MAX_SPAN_PX: 320, // ...and at most this far horizontally
  BOULDER_CHUTE_END_CLEARANCE_PX: 60, // The chute's low end stays this high above the ground (players walk under it)
  BOULDER_SAFE_SPOT_GAP_PX: 448, // On the puzzle floor the safe spot keeps this far from the ledge (no jumping across)
  BOULDER_DEBRIS_PX: 96, // Wall debris lands this far out from the wall face (and crushes zombies there)
  BOULDER_WALL_TILES: 2, // Width of the breakable side wall (it spans the screen top to the ground)
  BOULDER_OPENING_CLEAR_PX: 96, // Props keep this far from the wall, so the way out stays open
  PUZZLE_SPRING_FLOOR: 3, // Floor whose exit hangs at the very top: a spring under it, armed by a loaded scale, launches players up
  SPRING_HEIGHT_PX: 48, // The spring block (solid, at the screen edge under the exit): one hop up onto its plate
  SPRING_LEDGE_Y: 100, // The exit on the spring floor: as high as it goes (just under the HUD), no pile gets there
  SPRING_SCALE_KG_NEEDED: 1000, // Kg on the scale before its cable pulls the spring's button up (~14 walker corpses)
  SPRING_SCALE_WIDTH_PX: 128, // The scale's pan, set into the ground on the far side from the spring: this wide
  SPRING_SCALE_INSET_PX: 432, // The pan's outer end sits this far from the far screen edge (just past where the safe spot can hang)
  SPRING_SCALE_CLEAR_PX: 32, // No platform hangs over the pan or this close to it: bodies must fall onto the scale
  SPRING_SCALE_STACK_PX: 80, // Anything resting up to this high over the pan (a pile on it) weighs on it; a tier-1 ledge (90 px) does not
  SPRING_CABLE_Y: 112, // The cable runs along the ceiling at this height, from over the scale to over the button
  SPRING_BUTTON_WIDTH_PX: 20, // The spring's button beside its open side: this wide...
  SPRING_BUTTON_HEIGHT_PX: 64, // ...and this tall when fully up (hit it from the ground or from the spring)
  SPRING_BUTTON_GAP_PX: 20, // Gap between the spring's open side and the button
  SPRING_BUTTON_RISE_TICKS: 200, // The cable pulls the button up this slowly (4 s) while the scale holds enough; it sinks back as slowly
  SPRING_LAUNCH_FORCE: 23, // Upward speed (px/tick) the spring gives everyone on it: feet peak ~60 px over the exit
  SPRING_HIT_REACH_PX: 24, // Max gap between an attacking player's box and the button for the swing to press it
  SPRING_HIT_COOLDOWN_TICKS: 36, // One button press per swing (a held attack swings every 36 ticks)
  SPRING_SCATTER_MAX_PX: 360, // On launch the corpses on the spring scatter through the air, landing up to this far past it
  SPRING_COUNTDOWN_TICKS: 150, // 3-2-1 after a press on the raised button: time to get on the spring
  SPRING_BOUNCE_TICKS: 40, // The spring's release-and-settle animation after a launch
  SPRING_FLING_WINDOW_TICKS: 10, // A client flings itself only while the synced bounce is this fresh (not on a late join)
  SPRING_CLEAR_PX: 96, // Platforms, ropes and props keep this far from the spring's open side (the button stands there)
  PUZZLE_CAGE_FLOOR: 4, // Floor with 4-5 covered cages on tangled chains: drop the one under the exit as a step; the others hide zombies, loot or nothing
  CAGE_WIDTH_PX: 128, // The exit cage is this wide (whole tiles: art == collision box)...
  CAGE_HEIGHT_PX: 96, // ...and this tall: the landed cage's top is beyond double-jump reach of the exit
  CAGE_HANG_GAP_PX: 48, // The exit cage hangs this far under the exit (room to stand on it)
  CAGE_COUNT_MIN: 4, // Cages on the floor (the exit cage included): at least this many...
  CAGE_COUNT_MAX: 5, // ...and at most this many
  CAGE_MID_SIZE_PX: 96, // The other cages are this wide and tall (whole tiles)...
  CAGE_MID_TOP_Y: 160, // ...and hang with their tops at this height, mid-screen
  CAGE_MID_GAP_PX: 32, // They keep this far from each other and from the safe spot...
  CAGE_EXIT_CLEAR_PX: 64, // ...and this far from the exit's span
  CAGE_CHAIN_TOP_Y: 40, // The tangled chains wind through the ceiling band between this height...
  CAGE_CHAIN_BOTTOM_Y: 136, // ...and this one
  CAGE_CHAIN_KINKS: 3, // Points each chain winds through in that band (more = more tangled)
  CAGE_CLEAT_WIDTH_PX: 12, // Each chain is tied to a cleat on a ledge (never the safe spot: no swinging there): this wide...
  CAGE_CLEAT_HEIGHT_PX: 28, // ...and this tall
  CAGE_CLEAT_INSET_PX: 40, // Cleats sit at least this far in from their ledge's ends...
  CAGE_CLEAT_SPACING_PX: 64, // ...and this far apart (a swing reaches only one)
  CAGE_CLEAT_HITS: 3, // Swings on a cleat before its chain snaps and the cage falls
  CAGE_HIT_REACH_PX: 24, // Max gap between an attacking player's box and a cleat for the swing to hit it
  CAGE_HIT_COOLDOWN_TICKS: 36, // One cleat hit per swing (a held attack swings every 36 ticks)
  CAGE_ZOMBIE_CAGES: 2, // Cages hiding zombies (any of them, the exit cage too)...
  CAGE_LOOT_CAGES: 1, // ...hiding loot; the rest are empty
  CAGE_ZOMBIES: 4, // Zombies a zombie cage lets loose when it lands
  CAGE_LOOT_GOLD: 120, // Gold in a loot cage (plus an HP and an MP potion)
  PUZZLE_PLATE_FLOOR: 5, // Floor whose exit is behind a door that a pressure plate on a far, high ledge holds open
  PLATE_WIDTH_PX: 96, // The pressure plate is set into its ledge's top: 3 tiles wide
  PLATE_WEIGHT_NEEDED: 3, // Weight on the plate that holds the exit door open: a lying corpse weighs 1...
  PLATE_PLAYER_WEIGHT: 3, // ...a player standing on it this much
  PLATE_STACK_PX: 40, // Corpses piled up to this far above the plate still press on it
  PLATE_DOOR_TICKS: 20, // Ticks the exit door takes to slide fully open (or shut): only a fully open door lets you out
  PLATE_DOOR_WIDTH_PX: 56, // The barred door standing on the exit: this wide...
  PLATE_DOOR_HEIGHT_PX: 72, // ...and this tall (scenery: you walk in front of it)
  PLATE_KICK_SPEED_X: 8, // A zombie walking over the plate kicks a corpse off it this fast sideways...
  PLATE_KICK_SPEED_Y: -6, // ...and up (negative = up)
  PLATE_KICK_COOLDOWN_TICKS: 240, // A zombie kicks at most one corpse this often (one per pass over the plate)
  SAFE_SPOT_HEADROOM_PX: 160, // Players up to this far above the safe spot (jumping on it) still count as resting there

  // ─── Zombie Spawning ───────────────────────────
  ZOMBIE_SPAWN_INTERVAL_MS: 2000, // Time between zombie spawns in milliseconds
  ZOMBIE_SPAWN_MIN_INTERVAL_MS: 500, // Fastest possible spawn interval after scaling
  ZOMBIE_SPAWN_DECREASE_PER_WAVE: 100, // Spawn interval shrinks by this many ms each wave
  ZOMBIE_HP_SCALE_PER_WAVE: 0.15, // Zombie HP increases by this fraction each wave (0.15 = +15%)
  ZOMBIE_DAMAGE_SCALE_PER_WAVE: 0.08, // Zombie damage increases by this fraction each wave
  MAGNET_PULL_DELAY_TICKS_PER_100PX: 3, // Monster magnet: zombies brace this long per 100 px of distance before they are torn loose
  MAGNET_PULL_BASE_TICKS: 12, // Drag duration for a zombie right next to the caster
  MAGNET_PULL_TICKS_PER_100PX: 9, // Extra drag duration per 100 px (far zombies fly longer)
  MAGNET_PULL_MAX_TICKS: 40, // Longest drag (0.8 s)
  MAGNET_PULL_LIFT_PX: 22, // How high a dragged zombie is lifted off its feet mid-pull
  ZOMBIE_XP_SCALE_PER_WAVE: 0.2, // Kill XP bonus per floor (was a hard-coded 0.1; levels fell far behind floors)
  ZOMBIE_EARLY_DAMAGE_MULT_START: 0.4, // Floor 1 zombies deal this fraction of their listed damage (onboarding)...
  ZOMBIE_EARLY_DAMAGE_MULT_STEP: 0.15, // ...rising by this per floor until full damage (floor 5)
  ZOMBIE_ATTACK_WINDUP_TICKS: 15, // Telegraphed wind-up before a melee swing starts (~0.3 s, plus the swing's own lead-in)
  ZOMBIE_MAX_ATTACKERS_PER_TARGET: 2, // At most this many zombies swing at the same player at once (attack tokens)
  ZOMBIE_ATTACKER_RADIUS: 150, // Zombies swinging within this distance of a player count as attacking that player
  ZOMBIE_RUNNER_MIN_WAVE: 2, // First wave that Runner zombies can appear
  ZOMBIE_RUNNER_ROLL_THRESHOLD: 0.7, // Chance (0-1) a spawn is NOT a Runner when eligible
  ZOMBIE_TANK_MIN_WAVE: 3, // First wave that Tank zombies can appear
  ZOMBIE_TANK_ROLL_THRESHOLD: 0.85, // Chance (0-1) a spawn is NOT a Tank when eligible
  ZOMBIE_SPITTER_MIN_WAVE: 4, // First wave that Spitter zombies can appear
  ZOMBIE_SPITTER_ROLL_THRESHOLD: 0.6, // Chance (0-1) a spawn is NOT a Spitter when eligible
  ZOMBIE_BOSS_MIN_WAVE: 5, // First wave a Boss can spawn
  ZOMBIE_BOSS_WAVE_INTERVAL: 5, // A Boss spawns every N waves
  ZOMBIE_DRAGON_BOSS_MIN_WAVE: 10, // First wave the Dragon Boss can spawn
  ZOMBIE_DRAGON_BOSS_WAVE_INTERVAL: 10, // Dragon Boss spawns every N waves
  // Eaters never come with the regular spawns: lying corpses draw them, and they come to eat.
  ZOMBIE_EATER_MIN_WAVE: 1, // First floor Eaters can appear on
  ZOMBIE_EATER_SPAWN_MIN_CORPSES: 3, // Lying, unclaimed corpses on the floor that draw an Eater
  ZOMBIE_EATER_SPAWN_DELAY_MIN_TICKS: 500, // Shortest wait (10 s) for the next Eater while corpses lie around
  ZOMBIE_EATER_SPAWN_DELAY_MAX_TICKS: 1000, // Longest wait (20 s) for the next Eater while corpses lie around
  ZOMBIE_EATER_MAX_ALIVE: 2, // Eaters alive at once, per player up
  ZOMBIE_EATER_SPAWN_MIN_DIST: 150, // An Eater rises at least this far (px) from the corpse it comes for
  ZOMBIE_EATER_SPAWN_TRIES: 8, // Spawn spots tried to find one within ZOMBIE_EATER_DETECT_RANGE of a corpse
  ZOMBIE_EATER_EATING_TICKS: 100, // Ticks (2 s) an Eater eats before the corpse is gone
  ZOMBIE_EATER_DETECT_RANGE: 1500, // Distance (px) at which an Eater smells a corpse: the whole 1280x720 screen
  ZOMBIE_EATER_RUN_SPEED_MULT: 3.5, // An Eater runs to its goal (meal or prey) this many times its crawling speed
  ZOMBIE_EATER_JUMP_FORCE: -12, // An Eater's jump (negative = up): ~144 px, a ledge above it in one leap (other zombies: -9.5, ~90 px)
  ZOMBIE_EATER_JUMP_MARGIN_PX: 14, // Height it keeps spare when judging which ledge one jump reaches
  ZOMBIE_EATER_JUMP_COOLDOWN_TICKS: 20, // Ticks between an Eater's jumps
  ZOMBIE_EATER_LEAP_MAX_SPEED: 6, // Fastest sideways speed of a leap from one ledge across to a higher one
  ZOMBIE_EATER_LEAP_INSET_PX: 12, // A leap lands the body this far inside the near end of the ledge
  ZOMBIE_EATER_STEP_OFF_WIDTHS: 3, // Half-widths an Eater steps aside to get off a pile toward a goal below it
  ZOMBIE_EATER_STEP_OFF_MARGIN_PX: 4, // An Eater walking off a prop (a box stack) to a goal below aims this far past its end
  ZOMBIE_EATER_LEVEL_TOLERANCE_PX: 12, // A goal within this height of its feet counts as on its level (no climbing)
  ZOMBIE_EATER_ARRIVE_THRESHOLD: 8, // Distance (px) at which an Eater starts eating
  ZOMBIE_EATER_ATTACK_CHANCE: 0.004, // Chance per tick an Eater bites a player in reach while corpses lie around (rare: ~once per 5 s beside it; never while eating)
  // With no corpse to smell, an Eater turns hungry: it runs at the nearest player or zombie and attacks like any zombie.
  ZOMBIE_EATER_BITE_COLOR: '#b02a22', // Hit particles and damage numbers of an Eater biting a zombie
  ZOMBIE_EATER_BITE_KNOCKBACK_PX: 100, // How far (px) an Eater's bite throws a zombie: one short hop, it stops where it lands (2 bites stay within 200 px)
  ZOMBIE_EATER_BITE_KNOCKBACK_UP: -4, // Upward speed of that hop (negative = up); its sideways speed is set so the hop covers ZOMBIE_EATER_BITE_KNOCKBACK_PX
  ZOMBIE_EATER_SPRITE_PX: 118, // Drawn size (px, square) of an Eater's 128 px frame at its average height (other zombies: 140)

  // ─── Dragon Boss ─────────────────────────────
  DRAGON_HOVER_Y_OFFSET: 140, // How high above the ground the dragon hovers
  DRAGON_ATTACK_RANGE: 350, // Distance at which the dragon starts shooting fireballs
  DRAGON_KEEP_DISTANCE: 280, // Dragon tries to stay at least this far from the player
  DRAGON_APPROACH_SPEED_MULT: 0.6, // Dragon moves at this fraction of its base speed when approaching
  DRAGON_PROJECTILE_SPEED: 7, // How fast dragon fireballs travel in pixels per tick
  DRAGON_PROJECTILE_LIFETIME: 100, // How many ticks a dragon fireball lives before disappearing

  // ─── Spitter (Ranged Poison) ────────────────
  SPITTER_ATTACK_RANGE: 280, // Distance at which the spitter starts shooting
  SPITTER_KEEP_DISTANCE: 200, // Spitter tries to stay at least this far from the player
  SPITTER_PROJECTILE_SPEED: 5, // How fast spitter projectiles travel in pixels per tick
  SPITTER_PROJECTILE_LIFETIME: 80, // How many ticks a spitter projectile lives before disappearing
  SPITTER_PROJECTILE_GRAVITY: 0.08, // Downward pull on spitter projectiles (arcing shots)
  SPITTER_POISON_DURATION_TICKS: 150, // Total ticks the poison effect lasts on the player
  SPITTER_POISON_TICK_INTERVAL: 25, // Ticks between each poison damage tick
  SPITTER_POISON_DAMAGE_PER_TICK: 3, // Base damage dealt per poison tick
  SPITTER_POISON_DAMAGE_WAVE_SCALE: 0.5, // Extra poison damage scaling per wave

  // ─── Zombie AI ────────────────────────────────
  ZOMBIE_ORBIT_MIN: 25, // Closest distance a zombie tries to orbit around the player
  ZOMBIE_ORBIT_MAX: 55, // Farthest distance a zombie tries to orbit around the player
  ZOMBIE_ORBIT_ARRIVE_THRESHOLD: 15, // How close to the orbit target before the zombie considers it "arrived"
  ZOMBIE_JUMP_FORCE: -9.5, // Upward velocity when a zombie jumps (negative = up)
  ZOMBIE_JUMP_COOLDOWN_MIN: 80, // Minimum ticks between zombie jumps
  ZOMBIE_JUMP_COOLDOWN_MAX: 200, // Maximum ticks between zombie jumps
  ZOMBIE_JUMP_CHANCE_PER_TICK: 0.015, // Probability each tick that a zombie decides to jump
  ZOMBIE_JUMP_PLATFORM_CHASE_CHANCE: 0.04, // Chance per tick a zombie jumps to chase the player onto a platform
  ZOMBIE_ATTACK_RANGE: 35, // How close a zombie must be to melee attack the player
  ZOMBIE_ATTACK_COOLDOWN_MIN: 40, // Minimum ticks between zombie attacks
  ZOMBIE_ATTACK_COOLDOWN_MAX: 70, // Maximum ticks between zombie attacks
  ZOMBIE_ATTACK_ANIM_TICKS: 12, // Duration of the zombie attack animation in ticks
  ZOMBIE_ATTACK_HIT_TICK: 6, // Tick within the attack animation when damage is actually dealt
  ZOMBIE_HESITATION_RANGE_MIN: 0, // Minimum extra distance a zombie pauses before attacking
  ZOMBIE_HESITATION_RANGE_MAX: 40, // Maximum extra distance a zombie pauses before attacking
  ZOMBIE_CONTACT_DAMAGE_MULT: 0.5, // Damage multiplier when a zombie walks into the player (no attack anim)
  ZOMBIE_PLATFORM_DROP_TICKS: 10, // Ticks a zombie falls through a platform when dropping down
  ZOMBIE_PLATFORM_DROP_CHANCE: 0.03, // Chance per tick a zombie drops through its current platform
  ZOMBIE_REACTION_DELAY_MIN_TICKS: 5, // Minimum ticks before a zombie reacts to the player
  ZOMBIE_REACTION_DELAY_MAX_TICKS: 50, // Maximum ticks before a zombie reacts to the player
  ZOMBIE_DETECTION_RANGE: 0.5, // Fraction of canvas width a zombie can detect the player from
  ZOMBIE_IDLE_WANDER_SPEED_MULT: 0.3, // Speed multiplier when a zombie is wandering idly
  ZOMBIE_IDLE_DIRECTION_CHANGE_CHANCE: 0.015, // Chance per tick an idle zombie turns around
  ZOMBIE_IDLE_ATTACK_CHANCE: 0.004, // Chance per tick an idle zombie randomly swings
  ZOMBIE_IDLE_STOP_CHANCE: 0.02, // Chance per tick an idle wandering zombie stops moving

  // ─── Zombie-to-Zombie Collision ────────────────
  ZOMBIE_COLLISION_PUSH_STRENGTH: 0.45, // How hard two overlapping zombies push each other apart
  ZOMBIE_COLLISION_Y_TOLERANCE: 20, // Vertical tolerance for two zombies to be considered on the same level
  ZOMBIE_CROWD_OVERLAP_LIMIT: 5, // Max number of overlapping zombies before crowd-push kicks in
  ZOMBIE_CROWD_PUSH_STRENGTH: 0.08, // Extra push applied when too many zombies overlap in a crowd

  // ─── Zombie-on-Zombie Climbing ───────────────
  ZOMBIE_CLIMB_SNAP_TOLERANCE: 10, // How close a zombie must be to another's top to climb on it
  ZOMBIE_CLIMB_WIDTH_RATIO: 0.7, // Fraction of a zombie's width used for climb collision checks
  ZOMBIE_MAX_STACK_HEIGHT: 3, // Max zombie layers that can stack on top of each other

  // ─── Zombie Pile-Up ────────────────────────────
  ZOMBIE_PILE_DENSITY_THRESHOLD: 3, // Overlapping zombie count that triggers pile-up impulse
  ZOMBIE_PILE_JUMP_CHANCE: 0.04, // Per-tick chance a crowded grounded zombie hops up to pile
  ZOMBIE_PILE_JUMP_FORCE: -6, // Upward impulse for pile jump (negative = up, weaker than normal jump)

  // ─── Zombie Spawn Animation ────────────────────
  ZOMBIE_SPAWN_ANIM_TICKS: 50, // Duration of the rising-from-ground spawn animation in ticks

  // ─── Zombie Corpse ─────────────────────────────
  ZOMBIE_CORPSE_LINGER_TICKS: 999_999, // How long a corpse stays on screen before fading (very large = nearly forever)
  // Quick-climb values for manual testing (a few bodies reach the exit/ledge, walk up the pile):
  // ZOMBIE_CORPSE_PLATFORM_HEIGHT: 50, ZOMBIE_CORPSE_SNAP_TOLERANCE: 50, ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO: 1
  ZOMBIE_CORPSE_PLATFORM_HEIGHT: 5, // Height of the invisible platform a corpse becomes (lower = denser piles)
  ZOMBIE_CORPSE_SNAP_TOLERANCE: 10, // How close something must be to snap onto a corpse platform
  ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO: 0.55, // Fraction of corpse width used as a walkable platform
  ZOMBIE_CORPSE_SLIDE_OFFSET: 1, // Small horizontal offset applied to corpses so they don't stack perfectly
  ZOMBIE_CORPSE_DEATH_SCATTER: 0.2, // Random horizontal scatter applied to corpses on death
  ZOMBIE_CORPSE_DIVERSE_CHANCE: 0.45, // Chance a corpse uses a different visual variant
  ZOMBIE_CORPSE_BLOOD_CHANCE: 0.3, // Chance a corpse shows a blood splatter
  CORPSE_CARRY_RANGE: 50, // Pixels from the player's center to a lying corpse's center to pick it up
  CORPSE_CARRY_SPEED_MULTIPLIER: 0.75, // Walking speed while carrying corpses overhead
  CORPSE_CARRY_BASE: 1, // Corpses or props anyone can carry overhead at once
  CORPSE_CARRY_SKILL_EXTRA: 1, // Each owned carry skill (warrior Carry 1 / Carry 2) adds this many
  CORPSE_CARRY_MAX: 3, // Most one player can ever carry, stacked overhead
  CORPSE_CARRY_STACK_STEP: 5, // Each carried corpse above the bottom one rides this much higher (a body is ~6 px thick: they rest on each other)
  CORPSE_CARRY_CONFIRM_TICKS: 25, // A guest's pick-up the host hasn't granted by then is given up
  CORPSE_CARRY_LIFT: 12, // Carried corpse's box bottom sits this far above the carrier's head (its lying body rests on the head)
  CORPSE_THROW_SPEED_X: 4, // Sideways speed of a dropped corpse, in the carrier's facing direction
  CORPSE_THROW_SPEED_Y: -3, // Upward toss of a dropped corpse (negative = up)
  PROP_STEP_UP_PX: 26, // A prop this low (or lower) is stepped onto when walked into; taller stacks still block
  BARREL_FUSE_TICKS: 150, // A barrel hit by an attack burns its fuse this long (3 s), then blows up
  BARREL_HIT_REACH_PX: 24, // Max gap between an attacking player's box and a barrel for the swing to light it
  BARREL_BLAST_RADIUS_PX: 110, // Zombies (and other barrels) whose center is this close to the barrel's center are caught in the blast
  BARREL_BLAST_DAMAGE_PERCENT: 60, // The blast takes this share of a caught zombie's max HP
  BARREL_BLAST_BOSS_DAMAGE_PERCENT: 10, // ...and only this share of a boss's (a few barrels don't kill one)
  BARREL_BLAST_KNOCKBACK: 9, // Sideways speed (px/tick) the blast throws a caught zombie away from the barrel
  BARREL_BLAST_KNOCKBACK_UP: -6, // Upward speed of a caught zombie (negative = up)
  BARREL_BLAST_PLAYER_DAMAGE_PERCENT: 25, // Players are caught too (center within the radius, whoever lit it): the blast takes this share of their max HP
  BARREL_BLAST_PLAYER_KNOCKBACK: 10, // Sideways speed a caught player is thrown away from the barrel (a zombie hit throws 6)
  BARREL_BLAST_PLAYER_KNOCKBACK_UP: -7, // Upward speed of a caught player (negative = up)
  BARREL_BLAST_CORPSE_SPEED_X: 8, // Lying corpses in the blast fly away from the barrel this fast sideways (~100 px: they slow by 8% a tick)...
  BARREL_BLAST_CORPSE_SPEED_Y: -7, // ...and this fast upward (negative = up)
  BARREL_CHAIN_FUSE_TICKS: 12, // A barrel caught in another's blast blows up this soon (a chain reaction)
  BARREL_RESPAWN_TICKS: 500, // A blown-up barrel comes back on its spawn spot this long after the blast (10 s), once no player or prop is in the way
  BARREL_COUNT_MIN: 5, // Barrels the level generator puts on every floor: at least this many...
  BARREL_COUNT_MAX: 10, // ...and at most this many
  BARREL_OTHER_PROPS_MIN: 4, // Other props (boxes, lockers, rails) per floor besides the barrels: at least this many...
  BARREL_OTHER_PROPS_MAX: 8, // ...and at most this many
  BARREL_BLAST_FX_TICKS: 45, // The blast's fireball, shockwave and glow play out over this long
  BARREL_SCORCH_TICKS: 400, // The scorch mark a blast leaves on the surface under it fades over this long (8 s)
  BARREL_BLAST_HITSTOP_TICKS: 4, // Solo only: the game freezes this long on a blast, so it lands hard

  // ─── Ropes ──────────────────────────────────────
  ROPE_CLIMB_SPEED: 3, // How fast the player moves up/down on a rope
  ROPE_WIDTH: 20, // Visual width of ropes in pixels
  ROPE_GRAB_RANGE: 24, // How close the player must be to grab a rope
  ROPE_JUMP_COOLDOWN_TICKS: 12, // Ticks before the player can grab a rope again after jumping off

  // ─── Particles ──────────────────────────────────
  MAX_PARTICLES: 400, // Maximum particles alive at once (oldest removed when exceeded)
  MAX_PENDING_VFX_EVENTS: 300, // Outbound VFX events kept while the socket is down (oldest dropped beyond this)

  // ─── Away from keyboard (online) ───
  AFK_TIMEOUT_MS: 120_000, // No key, mouse or touch input this long (hidden tab included): the player is frozen behind the away overlay
  AFK_SEAT_HOLD_MS: 60 * 60_000, // The server keeps an away player's seat this long after its socket dies (a discarded or sleeping tab); others get 60 s
  PARTICLE_LIFETIME_MS: 600, // Default particle lifetime in milliseconds
  HIT_PARTICLE_COUNT: 6, // Number of particles spawned per hit
  HIT_PARTICLE_VELOCITY: 6, // Speed of hit particles flying outward
  HIT_PARTICLE_UP_BIAS: 2, // Extra upward push on hit particles
  HIT_PARTICLE_LIFE: 30, // Lifetime of hit particles in ticks
  DEATH_PARTICLE_COUNT: 15, // Number of particles spawned when a zombie dies
  DEATH_PARTICLE_VELOCITY: 10, // Speed of death particles flying outward
  DEATH_PARTICLE_UP_BIAS: 3, // Extra upward push on death particles
  DEATH_PARTICLE_LIFE: 45, // Lifetime of death particles in ticks
  PARTICLE_GRAVITY: 0.15, // Downward pull on particles each tick

  // ─── Storm Sky (scenery, never walkable) ─────────
  STORM_CLOUD_SPEED_PX_S: 14, // The background clouds' drift speed (pixels per second, to the left)
  STORM_FOG_SPEED_PX_S: 12, // Ground fog drift speed (pixels per second, to the right)
  STORM_RAIN_DROP_COUNT: 160, // Rain streaks on screen at once
  STORM_RAIN_FALL_PX_S: 950, // Rain fall speed (pixels per second)
  STORM_RAIN_SLANT: 0.22, // Rain sideways drift per pixel fallen (wind)
  STORM_RAIN_LENGTH_PX: 14, // Length of a rain streak
  LIGHTNING_MIN_INTERVAL_MS: 9000, // Shortest wait between two lightning strikes (host decides)
  LIGHTNING_MAX_INTERVAL_MS: 22000, // Longest wait between two lightning strikes
  LIGHTNING_DURATION_MS: 700, // How long a strike lights the sky (bolt + afterglow)
  LIGHTNING_EDGE_MARGIN_PX: 90, // A bolt lands at least this far from the screen edges
  LIGHTNING_TOP_Y: 100, // Where a bolt leaves the cloud base
  LIGHTNING_MIN_LENGTH_PX: 200, // A bolt reaches at least this far down, even onto the tallest stack
  LIGHTNING_SEGMENT_PX: 22, // Vertical step between two kinks of a bolt
  LIGHTNING_JITTER_PX: 26, // Sideways reach of each kink
  LIGHTNING_MAX_BRANCHES: 3, // Forks off the main bolt
  LIGHTNING_SCREEN_FLASH_ALPHA: 0.22, // Whole-screen white flash at the peak of a strike
  LIGHTNING_SHAKE_FRAMES: 14, // Thunder rumble length (frames)
  LIGHTNING_SHAKE_INTENSITY: 3, // Thunder rumble strength (pixels)

  // ─── Damage Numbers ────────────────────────────
  DAMAGE_NUMBER_LIFE_TICKS: 60, // How many ticks a floating damage number stays visible

  // ─── Drop Rates ───────────────────────────────
  DROP_HP_POTION_CHANCE: 0.02, // Chance (0-1) a killed zombie drops an HP potion
  DROP_MP_POTION_CHANCE: 0.02, // Chance (0-1) a killed zombie drops an MP potion
  DROP_GOLD_CHANCE: 0.55, // Chance (0-1) a killed zombie drops gold
  DROP_GOLD_MIN: 5, // Minimum gold dropped per drop
  DROP_GOLD_MAX: 25, // Maximum gold dropped per drop
  DROP_GOLD_WAVE_BONUS: 3, // Extra gold added to drops per wave
  DROP_LIFETIME: 600, // Ticks before an uncollected drop disappears
  DROP_SIZE: 14, // Visual size of drop items in pixels
  DROP_POP_FORCE: -2, // Upward pop when a drop spawns (negative = up)
  DROP_MAGNET_RADIUS: 120, // Distance (pixels) at which drops start flying toward the player
  DROP_MAGNET_SPEED: 6, // Speed (pixels/tick) at which magnetized drops move toward the player

  // ─── Potions ──────────────────────────────────
  HP_POTION_RESTORE: 50, // HP restored when using an HP potion
  MP_POTION_RESTORE: 30, // MP restored when using an MP potion
  POTION_USE_COOLDOWN_TICKS: 30, // Ticks before another potion can be used

  // ─── Auto Potion ─────────────────────────────
  AUTO_POTION_HP_THRESHOLD_PERCENT: 50, // Auto-use HP potion when HP drops below this percent
  AUTO_POTION_MP_THRESHOLD_PERCENT: 30, // Auto-use MP potion when MP drops below this percent

  // ─── Shop ────────────────────────────────────
  SHOP_HP_POTION_PRICE: 30, // Gold cost to buy one HP potion (tier 1)
  SHOP_HP_POTION_2_PRICE: 100, // Gold cost for HP Potion II
  SHOP_HP_ELIXIR_PRICE: 250, // Gold cost for HP Elixir (percent)
  SHOP_MP_POTION_PRICE: 20, // Gold cost to buy one MP potion (tier 1)
  SHOP_MP_POTION_2_PRICE: 80, // Gold cost for MP Potion II
  SHOP_MP_ELIXIR_PRICE: 200, // Gold cost for MP Elixir (percent)

  HP_POTION_2_RESTORE: 200, // HP restored by HP Potion II
  HP_ELIXIR_RESTORE_PERCENT: 30, // Percent of max HP restored by HP Elixir
  MP_POTION_2_RESTORE: 100, // MP restored by MP Potion II
  MP_ELIXIR_RESTORE_PERCENT: 30, // Percent of max MP restored by MP Elixir

  // ─── Revival (Co-op) ───────────────────────────
  REVIVE_WINDOW_TICKS: 1500, // Ticks the downed player can be revived (10 s at 50 tps)
  REVIVE_CHANNEL_TICKS: 100, // Ticks the reviver must channel to complete (2 s at 50 tps); the downed timer pauses meanwhile
  ALLY_VFX_ALPHA: 0.7, // Particles replayed from other players draw at this opacity
  REVIVE_RANGE: 60, // Pixels — reviver must be within this distance
  REVIVE_HP_PERCENT: 30, // Percent of max HP the revived player comes back with
  FLOOR_RESPAWN_HP_PERCENT: 50, // Co-op: a player who died is back on the next floor with this percent of max HP

  // ─── Special Drops ────────────────────────────────
  SPECIAL_DROP_CHANCE_NORMAL: 0.008, // Chance (0-1) a normal zombie drops a special item
  SPECIAL_DROP_CHANCE_BOSS: 0.35, // Chance (0-1) a boss drops a special item
  SPECIAL_DROP_CHANCE_DRAGON_BOSS: 0.60, // Chance (0-1) the dragon boss drops a special item
  SPECIAL_DROP_LIFETIME: 900, // Ticks before an uncollected special drop disappears
  SPECIAL_DROP_SIZE: 20, // Visual size of special drops in pixels
  SPECIAL_DROP_POP_FORCE: -4, // Upward pop when a special drop spawns (negative = up)

  SPECIAL_LOW_GRAVITY_DURATION_S: 30, // Duration in seconds for low gravity effect
  SPECIAL_LOW_GRAVITY_VALUE: 0.25, // Gravity value during effect (normal: 0.5)
  SPECIAL_SUPER_SPEED_DURATION_S: 15, // Duration in seconds for super speed effect
  SPECIAL_SUPER_SPEED_MULTIPLIER: 1.8, // Move speed multiplier during effect
  SPECIAL_SUPER_SPEED_TRAIL_COUNT: 5, // Number of afterimage copies trailing behind the player
  SPECIAL_SUPER_SPEED_TRAIL_SPACING: 14, // Pixel spacing between each afterimage copy
  SPECIAL_GIANT_SLAYER_DURATION_S: 20, // Duration in seconds for giant slayer effect
  SPECIAL_GIANT_SLAYER_DAMAGE_MULTIPLIER: 2, // Damage multiplied by this during effect
  SPECIAL_ZOMBIE_SHOCK_DURATION_S: 10, // Duration in seconds for zombie shock effect
  SPECIAL_ZOMBIE_SHOCK_VIBRATE_PX: 3, // Max pixel offset for shock vibration
  SPECIAL_ZOMBIE_SHOCK_ARC_SEGMENTS: 5, // Number of line segments per electric arc
  SPECIAL_ZOMBIE_SHOCK_ARC_COUNT: 3, // Number of electric arcs per zombie
  SPECIAL_DROP_CONFIRM_TICKS: 250, // Ticks (5 seconds at 50 tps) the player has to confirm a special drop

  // ─── Magic Twin ─────────────────────────────────
  MAGIC_TWIN_OFFSET_X: 25, // Horizontal offset behind the player in pixels
  MAGIC_TWIN_ALPHA: 0.4, // Opacity of the twin sprite

  // ─── Dark Sight ─────────────────────────────────
  DARK_SIGHT_ALPHA: 0.5, // Player opacity while Dark Sight is active

  // ─── Tick Rate ──────────────────────────────────
  TICK_RATE: 50, // Game loop runs at this many ticks per second

  // ─── Skill tree (classes in SKILL_TREES) ────────
  TREE_SKILL_POINTS_PER_LEVEL: 1, // A tree class gets one point per level up; every skill costs one point
  TREE_STARTING_SKILL_POINTS: 1, // ...and one point at level 1, so a skill is there from the start
  SKILL_TIER_LEVELS: [1, 4, 8, 12, 16], // Character level that opens tiers 1..5 of a tree
  RESPEC_GOLD_PER_LEVEL: 50, // Respec price per character level (the first respec is free)
  PLAYER_MP_REGEN_INTERVAL_TICKS: 50, // Every player regains 1 MP this often (1 per second) so MP never locks skills out

  // ─── Skill bar and HUD (tree classes) ──────────
  TREE_SKILL_BAR_SLOTS: 6, // Skill-bar slots of a tree class (keys skill1..skill6); one key fires one skill
  ATTACK_DOUBLE_TAP_MS: 300, // Two attack presses this close fire the double-tap skill (Slash Blast)
  ATTACK_AIR_HOLD_MS: 250, // Attack held this long in the air fires the air-hold skill (Ground Slam)
  ATTACK_HOLD_MS: 1000, // Attack held this long on the ground starts charging the hold skill (Power Dash)...
  ATTACK_CHARGE_MS: 800, // ...which fills over this long; letting go fires it
  SKILL_DASH_MIN_CHARGE: 0.5, // A dash let go as its charge starts covers this fraction of its distance (full charge: all of it)
  SKILL_CHARGE_BAR_WIDTH_PX: 36, // The charge bar over a charging player...
  SKILL_CHARGE_BAR_HEIGHT_PX: 4, // ...its height...
  SKILL_CHARGE_BAR_RAISE_PX: 34, // ...and how far above the body's top it sits
  NEW_MOVE_TOAST_MS: 6000, // The HUD's "New move" plate stays up this long after a tree skill is learned
  SKILL_COOLDOWN_HUD_REFRESH_MS: 100, // The HUD's skill bar redraws its cooldown shades this often
  TREE_SKILL_VFX_LEVEL: 10, // Particle density tree-skill animations play at (they have no skill level)

  // ─── Warrior tree mechanics ─────────────────────
  SKILL_STRIKE_RANGE_PX: 70, // Reach of single-target melee skills (power strike, uppercut) past the body
  SKILL_UPPERCUT_EXTRA_STUN_MS: 600, // An uppercut zombie stays stunned this long after it lands
  SKILL_SLAM_FALL_SPEED: 18, // Fall speed of a ground slam dive
  SKILL_SLAM_FALL_PX_PER_BONUS: 200, // Each this many px fallen adds x1 to slam damage...
  SKILL_SLAM_MAX_MULT: 2.5, // ...up to this multiplier
  SKILL_SLAM_RADIUS_PER_KG: 0.5, // Slam shockwave grows by this many px per kg of the slammer (PLAYER_WEIGHT_KG)
  SKILL_SLAM_POP_FORCE: -6, // Zombies in a slam shockwave pop up this hard...
  SKILL_SLAM_STUN_MS: 480, // ...and stay stunned this long
  SKILL_SLAM_FX_RAISE_PX: 16, // The slam animation plays this far above the feet
  SKILL_CLEAVE_VERTICAL_REACH_PX: 24, // Slash blast also hits zombies this far above the head or below the feet
  SKILL_HEAVY_HANDS_STAGGER_MS: 240, // Heavy hands: a basic hit staggers the zombie this long
  SKILL_ROAR_ROOT_MS: 600, // Dragon roar roots the warrior this long
  SKILL_RAMPAGE_CHAINS: 2, // Extra dashes a rampage can chain
  SKILL_CHARGE_RUN_SPEED: 9, // Shoulder charge speed (px per tick)
  SKILL_CHARGE_RUN_TICKS: 16, // Shoulder charge length
  SKILL_CHARGE_RUN_HIT_PAD_PX: 6, // Shoulder charge hits zombies this close to the body
  SKILL_KNOCKDOWN_MS: 1200, // Shoulder charge knockdown stun
  SKILL_BACKSTEP_TICKS: 10, // Backstep hop duration
  SKILL_BACKSTEP_HOP_FORCE: -4, // Backstep hop (negative = up)
  SKILL_LEAP_JUMP_FORCE: -6, // Leap strike from the ground jumps this hard (negative = up) and covers its reach over the arc
  SKILL_LEAP_DIVE_TICKS: 12, // Leap strike in the air covers its reach in this many ticks...
  SKILL_LEAP_DIVE_FALL_SPEED: 9, // ...diving down this fast...
  SKILL_LEAP_MAX_TICKS: 24, // ...and lands (hits) after at most this long, even still in the air
  SKILL_LEAP_HIT_RADIUS_PX: 70, // Leap strike landing hit radius
  SKILL_ADRENALINE_WINDOW_MS: 4000, // Adrenaline: kills within this window stack...
  SKILL_ADRENALINE_MAX_STACKS: 3, // ...up to this many stacks
  SKILL_IRON_RECOVERY_STILL_TICKS: 50, // Iron recovery heals after standing still this long...
  SKILL_IRON_RECOVERY_INTERVAL_TICKS: 150, // ...then every this many ticks (3 s)
  SKILL_PARRY_STUN_MS: 1000, // A parried zombie is stunned this long
  SKILL_PARRY_IFRAME_TICKS: 12, // A parry leaves the warrior untouchable this long (one swing can't hit twice)
  SKILL_PARRY_LOCKOUT_MS: 500, // A parry window that closed without a hit can't reopen for this long (no mashing)
  SKILL_LAUNCH_DRIFT_SPEED: 1.5, // A launched zombie drifts sideways this fast
  SKILL_SECOND_WIND_IFRAME_TICKS: 75, // Second wind: invulnerable this long after the save (1.5 s)...
  SKILL_SECOND_WIND_HEAL_TICKS: 150, // ...then heals over this long (3 s)
  SKILL_LAST_STAND_HP_PERCENT: 25, // Last stand kicks in below this HP percent
  SKILL_MAX_REMOTE_STUN_MS: 3000, // Host clamp for a guest's stun request
  SKILL_MAX_REMOTE_LAUNCH_FORCE: 16, // Host clamp for a guest's launch request (px per tick, upward)
  SKILL_MAX_REMOTE_PUSH_FORCE: 14, // Host clamp for a guest's knockback request
  SKILL_STUN_STAR_COLOR: '#ffe08a', // Stars circling a stunned zombie

} as const;

// ─── Special Drop Definitions ─────────────────────

export const SPECIAL_DROP_DEFINITIONS: SpecialDropDefinition[] = [
  {
    type: SpecialDropType.LowGravity,
    name: 'Moon Walk',
    description: 'Gravity weakens across the entire map — everything floats a little!',
    funnyDescription: 'Houston, we have a problem... gravity just rage-quit! Everyone bounces around like a trampoline park for the undead. Your calves will thank you later.',
    icon: 'moon',
    color: '#aa88ff',
    highlightColor: '#ddbbff',
    durationTicks: GAME_CONSTANTS.SPECIAL_LOW_GRAVITY_DURATION_S * GAME_CONSTANTS.TICK_RATE,
  },
  {
    type: SpecialDropType.SuperSpeed,
    name: 'Nitro Boost',
    description: 'Move at blazing speed!',
    funnyDescription: 'NYOOOOM! Your legs are now fueled by pure caffeine and questionable life choices. Run so fast your shadow files a missing person report!',
    icon: 'bolt',
    color: '#00ccff',
    highlightColor: '#88eeff',
    durationTicks: GAME_CONSTANTS.SPECIAL_SUPER_SPEED_DURATION_S * GAME_CONSTANTS.TICK_RATE,
  },
  {
    type: SpecialDropType.GiantSlayer,
    name: 'Giant Slayer',
    description: 'All damage doubled — cleave through hordes!',
    funnyDescription: 'Your weapons just ate their Wheaties. Every hit now packs the punch of an angry gorilla swinging a telephone pole. Zombies? More like confetti.',
    icon: 'skull',
    color: '#ff2222',
    highlightColor: '#ff6666',
    durationTicks: GAME_CONSTANTS.SPECIAL_GIANT_SLAYER_DURATION_S * GAME_CONSTANTS.TICK_RATE,
  },
  {
    type: SpecialDropType.ZombieShock,
    name: 'Tesla Storm',
    description: 'Lightning surges through all zombies — they convulse in place!',
    funnyDescription: 'Bzzzzzt! Every zombie on the map is about to involuntarily breakdance. Sparks fly, limbs flail — dignity was never there to begin with.',
    icon: 'bolt',
    color: '#ccff00',
    highlightColor: '#eeff88',
    durationTicks: GAME_CONSTANTS.SPECIAL_ZOMBIE_SHOCK_DURATION_S * GAME_CONSTANTS.TICK_RATE,
  },
];

export function getSpecialDropDefinition(type: SpecialDropType): SpecialDropDefinition | undefined {
  return SPECIAL_DROP_DEFINITIONS.find((d: SpecialDropDefinition): boolean => d.type === type);
}

// ─── Class Stat Weights (MapleStory-style) ──────

export interface ClassStatWeights {
  primaryStat: keyof CharacterStats;
  secondaryStat: keyof CharacterStats;
  attackFromPrimary: number;
  attackFromSecondary: number;
  defenseFromStr: number;
  defenseFromDex: number;
  hpPerStr: number;
  mpPerInt: number;
  critFromLuk: number;
  critDmgFromLuk: number;
}

export const CLASS_STAT_WEIGHTS: Record<CharacterClass, ClassStatWeights> = {
  [CharacterClass.Warrior]: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    attackFromPrimary: 3.5,
    attackFromSecondary: 1.0,
    defenseFromStr: 0.5,
    defenseFromDex: 0.2,
    hpPerStr: 12,
    mpPerInt: 4,
    critFromLuk: 0.5,
    critDmgFromLuk: 1.0,
  },
  [CharacterClass.Ranger]: {
    primaryStat: 'dex',
    secondaryStat: 'str',
    attackFromPrimary: 3.5,
    attackFromSecondary: 1.0,
    defenseFromStr: 0.2,
    defenseFromDex: 0.35,
    hpPerStr: 8,
    mpPerInt: 6,
    critFromLuk: 1.0,
    critDmgFromLuk: 1.5,
  },
  [CharacterClass.Mage]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 4.0,
    attackFromSecondary: 0.5,
    defenseFromStr: 0.1,
    defenseFromDex: 0.1,
    hpPerStr: 6,
    mpPerInt: 14,
    critFromLuk: 1.0,
    critDmgFromLuk: 2.0,
  },
  [CharacterClass.Assassin]: {
    primaryStat: 'luk',
    secondaryStat: 'dex',
    attackFromPrimary: 3.0,
    attackFromSecondary: 1.5,
    defenseFromStr: 0.2,
    defenseFromDex: 0.35,
    hpPerStr: 7,
    mpPerInt: 5,
    critFromLuk: 2.0,
    critDmgFromLuk: 3.0,
  },
  [CharacterClass.Priest]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 3.5,
    attackFromSecondary: 0.8,
    defenseFromStr: 0.2,
    defenseFromDex: 0.2,
    hpPerStr: 8,
    mpPerInt: 12,
    critFromLuk: 0.8,
    critDmgFromLuk: 1.5,
  },
};

// ─── Character Classes ───────────────────────────

export const CHARACTER_CLASSES: Record<CharacterClass, CharacterClassDefinition> = {
  [CharacterClass.Warrior]: {
    id: CharacterClass.Warrior,
    name: 'Warrior',
    description: 'Heavy melee fighter with high HP and defense. Cleaves through zombie hordes.',
    baseStats: { str: 15, dex: 8, int: 4, luk: 6 },
    color: '#ff4444',
    icon: 'sword',
  },
  [CharacterClass.Ranger]: {
    id: CharacterClass.Ranger,
    name: 'Ranger',
    description: 'Ranged attacker with high DEX. Picks off zombies from a safe distance.',
    baseStats: { str: 8, dex: 15, int: 6, luk: 8 },
    color: '#44cc44',
    icon: 'bow',
  },
  [CharacterClass.Mage]: {
    id: CharacterClass.Mage,
    name: 'Mage',
    description: 'Wields devastating AoE magic. Fragile but deals massive damage.',
    baseStats: { str: 4, dex: 6, int: 18, luk: 5 },
    color: '#6644ff',
    icon: 'orb',
  },
  [CharacterClass.Assassin]: {
    id: CharacterClass.Assassin,
    name: 'Assassin',
    description: 'Lightning-fast strikes and high crit chance. Thrives on lucky hits.',
    baseStats: { str: 10, dex: 12, int: 4, luk: 14 },
    color: '#cc44cc',
    icon: 'dagger',
  },
  [CharacterClass.Priest]: {
    id: CharacterClass.Priest,
    name: 'Priest',
    description: 'Support class that heals allies and smites undead with holy damage.',
    baseStats: { str: 6, dex: 6, int: 14, luk: 8 },
    color: '#ffcc44',
    icon: 'holy',
  },
};

// ─── Zombie Types ────────────────────────────────

export const ZOMBIE_TYPES: Record<ZombieType, ZombieDefinition> = {
  [ZombieType.Walker]: {
    type: ZombieType.Walker,
    name: 'Walker',
    hpMin: 22, hpMax: 40,
    damageMinLow: 30, damageMinHigh: 48,
    damageMaxLow: 55, damageMaxHigh: 75,
    speedMin: 0.4, speedMax: 0.8,
    knockbackMin: 6, knockbackMax: 10,
    hesitationMin: 22, hesitationMax: 33,
    xpRewardMin: 4, xpRewardMax: 7,
    widthMin: 25, widthMax: 35,
    heightMin: 37, heightMax: 45,
    attackAnimTicks: 20,
    attackHitTick: 10,
    weightKg: 70, // kg, a grown man
  },
  [ZombieType.Runner]: {
    type: ZombieType.Runner,
    name: 'Runner',
    hpMin: 14, hpMax: 28,
    damageMinLow: 32, damageMinHigh: 50,
    damageMaxLow: 58, damageMaxHigh: 80,
    speedMin: 1.4, speedMax: 2.3,
    knockbackMin: 4, knockbackMax: 8,
    hesitationMin: 15, hesitationMax: 22,
    xpRewardMin: 6, xpRewardMax: 11,
    widthMin: 22, widthMax: 35,
    heightMin: 33, heightMax: 45,
    attackAnimTicks: 20,
    attackHitTick: 10,
    weightKg: 55, // kg, lean and light
  },
  [ZombieType.Tank]: {
    type: ZombieType.Tank,
    name: 'Tank',
    hpMin: 75, hpMax: 135,
    damageMinLow: 12, damageMinHigh: 22,
    damageMaxLow: 28, damageMaxHigh: 42,
    speedMin: 0.2, speedMax: 0.45,
    knockbackMin: 3, knockbackMax: 6,
    hesitationMin: 28, hesitationMax: 40,
    xpRewardMin: 12, xpRewardMax: 20,
    widthMin: 36, widthMax: 55,
    heightMin: 44, heightMax: 60,
    attackAnimTicks: 30,
    attackHitTick: 15,
    weightKg: 160, // kg, a bloated heavyweight
  },
  [ZombieType.Spitter]: {
    type: ZombieType.Spitter,
    name: 'Spitter',
    hpMin: 18, hpMax: 35,
    damageMinLow: 10, damageMinHigh: 20,
    damageMaxLow: 24, damageMaxHigh: 36,
    speedMin: 0.65, speedMax: 1.2,
    knockbackMin: 5, knockbackMax: 9,
    hesitationMin: 20, hesitationMax: 30,
    xpRewardMin: 7, xpRewardMax: 14,
    widthMin: 23, widthMax: 35,
    heightMin: 35, heightMax: 44,
    attackAnimTicks: 20,
    attackHitTick: 10,
    weightKg: 60, // kg, bony
  },
  [ZombieType.Boss]: {
    type: ZombieType.Boss,
    name: 'Undead King',
    hpMin: 400, hpMax: 650,
    damageMinLow: 35, damageMinHigh: 55,
    damageMaxLow: 60, damageMaxHigh: 85,
    speedMin: 0.35, speedMax: 0.65,
    knockbackMin: 3, knockbackMax: 5,
    hesitationMin: 15, hesitationMax: 25,
    xpRewardMin: 80, xpRewardMax: 130,
    widthMin: 52, widthMax: 70,
    heightMin: 60, heightMax: 77,
    attackAnimTicks: 20,
    attackHitTick: 10,
    weightKg: 300, // kg, huge
  },
  [ZombieType.DragonBoss]: {
    type: ZombieType.DragonBoss,
    name: 'Ancient Dragon',
    hpMin: 1600, hpMax: 2500,
    damageMinLow: 65, damageMinHigh: 100,
    damageMaxLow: 110, damageMaxHigh: 155,
    speedMin: 0.5, speedMax: 0.9,
    knockbackMin: 3, knockbackMax: 5,
    hesitationMin: 15, hesitationMax: 20,
    xpRewardMin: 800, xpRewardMax: 1250,
    widthMin: 130, widthMax: 150,
    heightMin: 120, heightMax: 140,
    attackAnimTicks: 36,
    attackHitTick: 18,
    weightKg: 900, // kg, a dragon
  },
  [ZombieType.Eater]: {
    type: ZombieType.Eater,
    name: 'Eater',
    hpMin: 35, hpMax: 60,
    damageMinLow: 20, damageMinHigh: 30,
    damageMaxLow: 35, damageMaxHigh: 50,
    speedMin: 0.5, speedMax: 0.9,
    knockbackMin: 5, knockbackMax: 9,
    hesitationMin: 0, hesitationMax: 0, // no hesitation: its rare bites roll ZOMBIE_EATER_ATTACK_CHANCE
    xpRewardMin: 8, xpRewardMax: 15,
    widthMin: 20, widthMax: 29, // scaled with ZOMBIE_EATER_SPRITE_PX, so the box fits the art
    heightMin: 31, heightMax: 37,
    attackAnimTicks: 20,
    attackHitTick: 10,
    weightKg: 120, // kg, swollen from eating
  },
};

/** Weight in kg of a map prop by what it is made of (a lifted barrel or box adds it to its carrier). */
export const PROP_WEIGHT_KG: Record<PropMaterial, number> = {
  barrel: 45, // a full steel drum
  box: 20, // a wooden crate
  locker: 90, // steel, too heavy to lift (lockers stay put)
  rail: 35, // a fence (stays put)
};

/** True while a zombie telegraphs a melee swing (before its attack animation starts). */
export function isZombieWindingUp(z: ZombieState): boolean {
  return z.attackAnimTimer > ZOMBIE_TYPES[z.type].attackAnimTicks;
}

// ─── Skills ─────────────────────────────────────

export const SKILLS: SkillDefinition[] = [

  // ═══ AUTO POTION (all classes) ═══

  {
    id: 'ranger-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Ranger,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: 'flask',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    secondaryBuffEffect: null,
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'mage-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Mage,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: 'flask',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    secondaryBuffEffect: null,
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'assassin-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Assassin,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: 'flask',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    secondaryBuffEffect: null,
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
  {
    id: 'priest-auto-potion',
    name: 'Auto Potion',
    classId: CharacterClass.Priest,
    type: SkillType.Passive,
    description: 'Automatically uses a potion when HP drops below 50% or MP drops below 30%. Higher levels increase the success chance.',
    maxLevel: 10,
    requiredCharacterLevel: 1,
    icon: 'flask',
    color: '#ff6699',
    scaling: {
      baseDamage: 20, damagePerLevel: 7.78,
      baseMpCost: 0, mpCostPerLevel: 0,
      baseCooldown: 0, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 0, hpCost: 0, damage: 20 },
      { mpCost: 0, hpCost: 0, damage: 28 },
      { mpCost: 0, hpCost: 0, damage: 36 },
      { mpCost: 0, hpCost: 0, damage: 43 },
      { mpCost: 0, hpCost: 0, damage: 51 },
      { mpCost: 0, hpCost: 0, damage: 59 },
      { mpCost: 0, hpCost: 0, damage: 67 },
      { mpCost: 0, hpCost: 0, damage: 74 },
      { mpCost: 0, hpCost: 0, damage: 82 },
      { mpCost: 0, hpCost: 0, damage: 90 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: '',
    secondaryBuffEffect: null,
    passiveEffect: {
      type: 'autoPotion',
      intervalMs: 0,
      condition: 'always',
      hpThresholdPercent: 50,
      mpThresholdPercent: 30,
    },
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ ASSASSIN ═══
  {
    id: 'assassin-lucky-seven',
    name: 'Lucky Seven',
    classId: CharacterClass.Assassin,
    type: SkillType.Active,
    description: 'Throws 2 throwing stars based on LUK, regardless of Claw Mastery.',
    maxLevel: 20,
    requiredCharacterLevel: 1,
    icon: 'star',
    color: '#cc44cc',
    scaling: {
      baseDamage: 0.94, damagePerLevel: 0.04,
      baseMpCost: 8, mpCostPerLevel: 0.32,
      baseCooldown: 800, cooldownReductionPerLevel: 15,
      baseRange: 55, rangePerLevel: 1,
    },
    levelData: [
      { mpCost: 8,  hpCost: 0, damage: 0.94 },
      { mpCost: 8,  hpCost: 0, damage: 0.98 },
      { mpCost: 8,  hpCost: 0, damage: 1.02 },
      { mpCost: 8,  hpCost: 0, damage: 1.06 },
      { mpCost: 8,  hpCost: 0, damage: 1.10 },
      { mpCost: 10, hpCost: 0, damage: 1.14 },
      { mpCost: 10, hpCost: 0, damage: 1.18 },
      { mpCost: 10, hpCost: 0, damage: 1.22 },
      { mpCost: 10, hpCost: 0, damage: 1.26 },
      { mpCost: 10, hpCost: 0, damage: 1.30 },
      { mpCost: 10, hpCost: 0, damage: 1.34 },
      { mpCost: 12, hpCost: 0, damage: 1.38 },
      { mpCost: 12, hpCost: 0, damage: 1.42 },
      { mpCost: 12, hpCost: 0, damage: 1.46 },
      { mpCost: 12, hpCost: 0, damage: 1.50 },
      { mpCost: 12, hpCost: 0, damage: 1.54 },
      { mpCost: 12, hpCost: 0, damage: 1.58 },
      { mpCost: 14, hpCost: 0, damage: 1.62 },
      { mpCost: 14, hpCost: 0, damage: 1.66 },
      { mpCost: 14, hpCost: 0, damage: 1.70 },
    ],
    prerequisite: null,
    buffEffect: null,
    buffDuration: null,
    hitCount: 2,
    aoeRadius: 0,
    animationKey: 'assassin-lucky-seven',
    secondaryBuffEffect: null,
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 1,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ ASSASSIN ACTIVE (Double Jump) ═══
  {
    id: 'assassin-double-jump',
    name: 'Double Jump',
    classId: CharacterClass.Assassin,
    type: SkillType.Active,
    description: 'Leap a second time while airborne, launching forward with explosive force.',
    maxLevel: 5,
    requiredCharacterLevel: 8,
    icon: 'spring',
    color: '#bb44dd',
    scaling: {
      baseDamage: 0.62, damagePerLevel: 0.095,
      baseMpCost: 8, mpCostPerLevel: 0.5,
      baseCooldown: 600, cooldownReductionPerLevel: 10,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 8,  hpCost: 0, damage: 0.62 },
      { mpCost: 8,  hpCost: 0, damage: 0.72 },
      { mpCost: 9,  hpCost: 0, damage: 0.81 },
      { mpCost: 9,  hpCost: 0, damage: 0.91 },
      { mpCost: 10, hpCost: 0, damage: 1.00 },
    ],
    prerequisite: { skillId: 'assassin-lucky-seven', level: 3 },
    buffEffect: null,
    buffDuration: null,
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'assassin-double-jump',
    secondaryBuffEffect: null,
    passiveEffect: null,
    mechanic: 'doubleJump',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ ASSASSIN BUFF (Claw Mastery) ═══
  {
    id: 'assassin-claw-mastery',
    name: 'Claw Mastery',
    classId: CharacterClass.Assassin,
    type: SkillType.Buff,
    description: 'Increases the weapon mastery and accuracy of Throwing Stars, enhancing attack speed and critical hit chance.',
    maxLevel: 10,
    requiredCharacterLevel: 5,
    icon: 'paw',
    color: '#dd66ff',
    scaling: {
      baseDamage: 10, damagePerLevel: 3.33,
      baseMpCost: 10, mpCostPerLevel: 1.11,
      baseCooldown: 1000, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 10, hpCost: 0, damage: 10 },
      { mpCost: 11, hpCost: 0, damage: 13 },
      { mpCost: 12, hpCost: 0, damage: 17 },
      { mpCost: 13, hpCost: 0, damage: 20 },
      { mpCost: 14, hpCost: 0, damage: 23 },
      { mpCost: 15, hpCost: 0, damage: 27 },
      { mpCost: 16, hpCost: 0, damage: 30 },
      { mpCost: 17, hpCost: 0, damage: 33 },
      { mpCost: 18, hpCost: 0, damage: 37 },
      { mpCost: 20, hpCost: 0, damage: 40 },
    ],
    prerequisite: null,
    buffEffect: { stat: 'critRate', baseValue: 10, valuePerLevel: 3.33 },
    buffDuration: { baseDurationMs: 60_000, durationPerLevelMs: 20_000 },
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'assassin-claw-mastery',
    secondaryBuffEffect: { stat: 'attackSpeed', baseValue: 12, valuePerLevel: 4.44 },
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ ASSASSIN BUFF (Magic Twin) ═══
  {
    id: 'assassin-magic-twin',
    name: 'Magic Twin',
    classId: CharacterClass.Assassin,
    type: SkillType.Buff,
    description: 'A magic twin that mimics the summoner appears. It does not have its own HP and disappears after a fixed period of time.',
    maxLevel: 20,
    requiredCharacterLevel: 10,
    icon: 'twins',
    color: '#aa66ff',
    scaling: {
      baseDamage: 12, damagePerLevel: 2.53,
      baseMpCost: 10, mpCostPerLevel: 2.11,
      baseCooldown: 1000, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 10, hpCost: 0, damage: 12 },
      { mpCost: 12, hpCost: 0, damage: 15 },
      { mpCost: 14, hpCost: 0, damage: 17 },
      { mpCost: 16, hpCost: 0, damage: 20 },
      { mpCost: 18, hpCost: 0, damage: 22 },
      { mpCost: 20, hpCost: 0, damage: 25 },
      { mpCost: 22, hpCost: 0, damage: 27 },
      { mpCost: 24, hpCost: 0, damage: 30 },
      { mpCost: 26, hpCost: 0, damage: 32 },
      { mpCost: 28, hpCost: 0, damage: 35 },
      { mpCost: 30, hpCost: 0, damage: 37 },
      { mpCost: 32, hpCost: 0, damage: 40 },
      { mpCost: 34, hpCost: 0, damage: 42 },
      { mpCost: 36, hpCost: 0, damage: 45 },
      { mpCost: 38, hpCost: 0, damage: 47 },
      { mpCost: 40, hpCost: 0, damage: 50 },
      { mpCost: 42, hpCost: 0, damage: 52 },
      { mpCost: 44, hpCost: 0, damage: 55 },
      { mpCost: 46, hpCost: 0, damage: 57 },
      { mpCost: 50, hpCost: 0, damage: 60 },
    ],
    prerequisite: { skillId: 'assassin-lucky-seven', level: 5 },
    buffEffect: { stat: 'twinMimicPercent', baseValue: 12, valuePerLevel: 2.53 },
    buffDuration: { baseDurationMs: 60_000, durationPerLevelMs: 6_316 },
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'assassin-magic-twin',
    secondaryBuffEffect: null,
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },

  // ═══ ASSASSIN BUFF (Dark Sight) ═══
  {
    id: 'assassin-dark-sight',
    name: 'Dark Sight',
    classId: CharacterClass.Assassin,
    type: SkillType.Buff,
    description: 'Hides in the shadows for a certain period of time. With Dark Sight activated, you can neither attack nor be attacked.',
    maxLevel: 10,
    requiredCharacterLevel: 3,
    icon: 'eclipse',
    color: '#6633aa',
    scaling: {
      baseDamage: 1, damagePerLevel: 0,
      baseMpCost: 23, mpCostPerLevel: -2,
      baseCooldown: 1000, cooldownReductionPerLevel: 0,
      baseRange: 0, rangePerLevel: 0,
    },
    levelData: [
      { mpCost: 23, hpCost: 0, damage: 1 },
      { mpCost: 21, hpCost: 0, damage: 1 },
      { mpCost: 19, hpCost: 0, damage: 1 },
      { mpCost: 17, hpCost: 0, damage: 1 },
      { mpCost: 15, hpCost: 0, damage: 1 },
      { mpCost: 13, hpCost: 0, damage: 1 },
      { mpCost: 11, hpCost: 0, damage: 1 },
      { mpCost: 9,  hpCost: 0, damage: 1 },
      { mpCost: 7,  hpCost: 0, damage: 1 },
      { mpCost: 5,  hpCost: 0, damage: 1 },
    ],
    prerequisite: null,
    buffEffect: { stat: 'darkSight', baseValue: 1, valuePerLevel: 0 },
    buffDuration: { baseDurationMs: 20_000, durationPerLevelMs: 20_000 },
    hitCount: 0,
    aoeRadius: 0,
    animationKey: 'assassin-dark-sight',
    secondaryBuffEffect: { stat: 'darkSightSpeedPenalty', baseValue: 27, valuePerLevel: -3 },
    passiveEffect: null,
    mechanic: 'damage',
    maxTargets: 0,
    hpCostIsPercent: false,
    minHpPercent: 0,
  },
];

// ─── Default Key Bindings ────────────────────────

// ─── Skill trees ────────────────────────────────
// Classes listed in SKILL_TREES use a skill tree instead of SKILLS levels: one point per level, one
// point per skill, strength from stats (StatCurve), actives fired from a 6-slot skill bar (keys 1-6). The rest keep SKILLS.

const COMBAT_COLOR: string = '#e0503f';
const AGILITY_COLOR: string = '#f2c14e';
const GRIT_COLOR: string = '#8fbf3a';

type TreeSkillSpec = Partial<TreeSkill> &
  Pick<TreeSkill, 'id' | 'name' | 'description' | 'branch' | 'tier' | 'column' | 'parents' | 'type' | 'mechanic' | 'icon' | 'color'>;

/** A warrior tree skill; fills the fields most skills leave at zero. */
function warriorSkill(skill: TreeSkillSpec): TreeSkill {
  return {
    classId: CharacterClass.Warrior,
    animationKey: null,
    damageMult: 0,
    maxTargets: 0,
    mpCost: 0,
    hpCostPercent: 0,
    minHpPercent: 0,
    cooldownMs: 0,
    curves: {},
    buff: null,
    capstone: false,
    combo: null,
    ...skill,
  };
}

/** How each attack-button combo is done, for the tree window and the HUD. */
export const ATTACK_COMBO_HINTS: Readonly<Record<AttackCombo, string>> = {
  [AttackCombo.Hold]: `Hold attack ${GAME_CONSTANTS.ATTACK_HOLD_MS / 1000} s, then let go`,
  [AttackCombo.AirHold]: 'Hold attack in the air',
  [AttackCombo.DoubleTap]: 'Double-tap attack',
};

export const WARRIOR_SKILL_TREE: ClassSkillTree = {
  classId: CharacterClass.Warrior,
  branches: [
    { id: 'combat', name: 'Combat', color: COMBAT_COLOR, icon: 'fist', blurb: 'The attack-button moves: dash, spin, slam.' },
    { id: 'agility', name: 'Agility', color: AGILITY_COLOR, icon: 'wind', blurb: 'Move fast, carry more, pull and push the crowd.' },
    { id: 'grit', name: 'Grit', color: GRIT_COLOR, icon: 'shield', blurb: 'Survive, protect, get allies back up.' },
  ],
  skills: [
    // ═══ Combat ═══
    warriorSkill({
      id: 'warrior-power-dash', name: 'Power Dash', branch: 'combat', tier: 1, column: 1, parents: [],
      type: SkillType.Active, mechanic: 'dash', combo: AttackCombo.Hold,
      icon: 'wind', color: COMBAT_COLOR,
      description: 'Dash forward through every zombie in the way. The longer the charge, the farther it goes.',
      damageMult: 1.1, maxTargets: 10, mpCost: 12, cooldownMs: 1500,
      curves: { distance: { stat: 'dex', min: 160, max: 320, half: 40 }, cooldownCut: { stat: 'dex', min: 0, max: 0.35, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-slash-blast', name: 'Slash Blast', branch: 'combat', tier: 2, column: 1, parents: ['warrior-power-dash'],
      type: SkillType.Active, mechanic: 'cleave', combo: AttackCombo.DoubleTap,
      icon: 'whirl', color: COMBAT_COLOR, animationKey: 'warrior-slash-blast',
      description: 'A spinning cleave that hits zombies on both sides of you.',
      damageMult: 1.3, maxTargets: 6, mpCost: 8, cooldownMs: 1200,
      curves: { radius: { stat: 'str', min: 70, max: 140, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-ground-slam', name: 'Ground Slam', branch: 'combat', tier: 3, column: 1, parents: ['warrior-slash-blast'],
      type: SkillType.Active, mechanic: 'ground-slam', combo: AttackCombo.AirHold,
      icon: 'arrow-down', color: COMBAT_COLOR, animationKey: 'warrior-ground-slam',
      description: 'Dive down from the air and send a shockwave around where you land: the higher the fall, the bigger the hit.',
      damageMult: 1, maxTargets: 10, mpCost: 10, cooldownMs: 4000,
      curves: { radius: { stat: 'str', min: 60, max: 140, half: 60 } },
    }),
    // Parked for a rework (the user will bring them back reworked): Power Strike, Rising Uppercut,
    // Heavy Hands, Executioner, Dragon Roar. Their mechanics and animations are still in the engine.
    // warriorSkill({
    //   id: 'warrior-power-strike', name: 'Power Strike', branch: 'combat', tier: 1, column: 1, parents: [],
    //   type: SkillType.Active, mechanic: 'strike',
    //   icon: 'sword', color: COMBAT_COLOR, animationKey: 'warrior-power-strike',
    //   description: 'A heavy blow on the zombie in front of you that sends it flying.',
    //   damageMult: 2.2, maxTargets: 1, mpCost: 4, cooldownMs: 600,
    //   curves: { knockback: { stat: 'str', min: 8, max: 18, half: 60 } },
    // }),
    // warriorSkill({
    //   id: 'warrior-uppercut', name: 'Rising Uppercut', branch: 'combat', tier: 2, column: 2, parents: ['warrior-power-strike'],
    //   type: SkillType.Active, mechanic: 'uppercut',
    //   icon: 'arrow-up', color: COMBAT_COLOR, animationKey: 'warrior-uppercut',
    //   description: 'Launches a zombie into the air. It lands stunned; hit it on the way down.',
    //   damageMult: 1.5, maxTargets: 1, mpCost: 6, cooldownMs: 3000,
    //   curves: { launch: { stat: 'str', min: 50, max: 110, half: 50 }, cooldownCut: { stat: 'dex', min: 0, max: 0.4, half: 60 } },
    // }),
    // warriorSkill({
    //   id: 'warrior-heavy-hands', name: 'Heavy Hands', branch: 'combat', tier: 3, column: 2, parents: ['warrior-uppercut'],
    //   type: SkillType.Passive, mechanic: 'heavy-hands',
    //   icon: 'fist', color: COMBAT_COLOR,
    //   description: 'Basic hits stagger zombies and hit staggered, stunned or airborne zombies harder.',
    //   curves: { percent: { stat: 'str', min: 10, max: 35, half: 60 } },
    // }),
    // warriorSkill({
    //   id: 'warrior-executioner', name: 'Executioner', branch: 'combat', tier: 4, column: 1, parents: ['warrior-ground-slam', 'warrior-heavy-hands'],
    //   type: SkillType.Reactive, mechanic: 'executioner',
    //   icon: 'skull', color: COMBAT_COLOR, animationKey: 'warrior-executioner',
    //   description: 'Hitting a stunned zombie that is low on HP finishes it outright. Bosses are immune.',
    //   curves: { percent: { stat: 'str', min: 10, max: 25, half: 80 } },
    // }),
    // warriorSkill({
    //   id: 'warrior-dragon-roar', name: 'Dragon Roar', branch: 'combat', tier: 5, column: 1, parents: ['warrior-executioner'],
    //   type: SkillType.Active, mechanic: 'roar',
    //   icon: 'dragon', color: COMBAT_COLOR, animationKey: 'warrior-dragon-roar',
    //   description: 'A huge roar that hits everything around you and stuns whatever survives it. Costs HP.',
    //   damageMult: 2.4, maxTargets: 15, mpCost: 20, hpCostPercent: 30, minHpPercent: 50, cooldownMs: 20000, capstone: true,
    //   curves: { range: { stat: 'str', min: 160, max: 400, half: 80 }, stunMs: { stat: 'str', min: 1000, max: 3000, half: 60 } },
    // }),

    // ═══ Agility ═══
    warriorSkill({
      id: 'warrior-shoulder-charge', name: 'Shoulder Charge', branch: 'agility', tier: 1, column: 0, parents: [],
      type: SkillType.Active, mechanic: 'shoulder-charge',
      icon: 'boot', color: AGILITY_COLOR, animationKey: 'warrior-shoulder-charge',
      description: 'Barrel forward through zombies and knock them down.',
      damageMult: 1.2, maxTargets: 6, mpCost: 6, cooldownMs: 2500,
      curves: { knockback: { stat: 'str', min: 6, max: 14, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-carry-1', name: 'Carry 1', branch: 'agility', tier: 1, column: 1, parents: [],
      type: SkillType.Passive, mechanic: 'carry',
      icon: 'bag', color: AGILITY_COLOR,
      description: `Strong back: carry ${GAME_CONSTANTS.CORPSE_CARRY_BASE + GAME_CONSTANTS.CORPSE_CARRY_SKILL_EXTRA} corpses or props overhead at once instead of ${GAME_CONSTANTS.CORPSE_CARRY_BASE}.`,
    }),
    warriorSkill({
      id: 'warrior-backstep', name: 'Backstep', branch: 'agility', tier: 1, column: 2, parents: [],
      type: SkillType.Active, mechanic: 'backstep',
      icon: 'arrow-left', color: AGILITY_COLOR, animationKey: 'warrior-backstep',
      description: 'Hop back untouchable, still facing the enemy.',
      cooldownMs: 800,
      curves: { distance: { stat: 'dex', min: 50, max: 110, half: 40 }, iframesMs: { stat: 'dex', min: 150, max: 350, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-carry-2', name: 'Carry 2', branch: 'agility', tier: 2, column: 1, parents: ['warrior-carry-1'],
      type: SkillType.Passive, mechanic: 'carry',
      icon: 'zombie', color: AGILITY_COLOR,
      description: `Stack one more: carry ${GAME_CONSTANTS.CORPSE_CARRY_BASE + 2 * GAME_CONSTANTS.CORPSE_CARRY_SKILL_EXTRA} corpses or props overhead at once.`,
    }),
    warriorSkill({
      id: 'warrior-monster-magnet', name: 'Monster Magnet', branch: 'agility', tier: 3, column: 0, parents: ['warrior-shoulder-charge'],
      type: SkillType.Active, mechanic: 'pull',
      icon: 'magnet', color: AGILITY_COLOR, animationKey: 'warrior-monster-magnet',
      description: 'Reels every zombie in range to your feet and stuns them. Bosses resist.',
      mpCost: 14, cooldownMs: 8000,
      curves: {
        range: { stat: 'str', min: 200, max: 700, half: 80 },
        stunMs: { stat: 'str', min: 1000, max: 2000, half: 60 },
        cooldownCut: { stat: 'dex', min: 0, max: 0.3, half: 60 },
      },
    }),
    warriorSkill({
      id: 'warrior-leap-strike', name: 'Leap Strike', branch: 'agility', tier: 3, column: 2, parents: ['warrior-backstep'],
      type: SkillType.Active, mechanic: 'leap-strike',
      icon: 'spring', color: AGILITY_COLOR, animationKey: 'warrior-leap-strike',
      description: 'Leap forward and crash onto the zombies where you land.',
      damageMult: 1.8, maxTargets: 4, mpCost: 8, cooldownMs: 3000,
      curves: { distance: { stat: 'dex', min: 100, max: 200, half: 50 } },
    }),
    warriorSkill({
      id: 'warrior-adrenaline', name: 'Adrenaline', branch: 'agility', tier: 4, column: 1, parents: ['warrior-monster-magnet', 'warrior-leap-strike'],
      type: SkillType.Passive, mechanic: 'adrenaline',
      icon: 'spark', color: AGILITY_COLOR,
      description: 'Kills in quick succession stack up attack speed and move speed.',
      curves: { percent: { stat: 'dex', min: 4, max: 12, half: 40 } },
    }),
    warriorSkill({
      id: 'warrior-rampage', name: 'Rampage', branch: 'agility', tier: 5, column: 1, parents: ['warrior-adrenaline'],
      type: SkillType.Passive, mechanic: 'rampage',
      icon: 'star', color: AGILITY_COLOR, animationKey: 'warrior-rampage',
      description: 'Tap attack as a dash ends to chain up to 2 more. A kill during a dash refunds its cooldown.',
      mpCost: 6, capstone: true,
      curves: { windowMs: { stat: 'dex', min: 300, max: 500, half: 40 } },
    }),

    // ═══ Grit ═══
    warriorSkill({
      id: 'warrior-iron-recovery', name: 'Iron Recovery', branch: 'grit', tier: 1, column: 0, parents: [],
      type: SkillType.Passive, mechanic: 'hp-recovery',
      icon: 'heal', color: GRIT_COLOR,
      description: 'Standing still heals a share of your max HP every 3 seconds.',
      curves: { healPercent: { stat: 'str', min: 2, max: 5, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-auto-potion', name: 'Auto Potion', branch: 'grit', tier: 1, column: 2, parents: [],
      type: SkillType.Passive, mechanic: 'auto-potion',
      icon: 'flask', color: GRIT_COLOR,
      description: 'Drinks a potion by itself when HP drops below 50% or MP below 30%.',
      curves: { chance: { stat: 'luk', min: 30, max: 90, half: 30 } },
    }),
    warriorSkill({
      id: 'warrior-power-stance', name: 'Power Stance', branch: 'grit', tier: 2, column: 0, parents: ['warrior-iron-recovery'],
      type: SkillType.Buff, mechanic: 'buff',
      icon: 'shield', color: GRIT_COLOR, animationKey: 'warrior-power-stance',
      description: 'Brace: no knockback and more defense for a minute.',
      mpCost: 20, cooldownMs: 60000,
      curves: { percent: { stat: 'str', min: 10, max: 40, half: 60 } },
      buff: { stat: 'defense', durationMs: 60000, valueCurve: 'percent', percentOfDerived: true, allyRadius: 0, extra: { stat: 'knockbackResist', value: 100 } },
    }),
    warriorSkill({
      id: 'warrior-hyper-body', name: 'Hyper Body', branch: 'grit', tier: 2, column: 2, parents: ['warrior-auto-potion'],
      type: SkillType.Buff, mechanic: 'buff',
      icon: 'heart', color: GRIT_COLOR, animationKey: 'warrior-hyper-body',
      description: 'Raises max HP and MP of you and every ally close by for a minute.',
      mpCost: 30, cooldownMs: 90000,
      curves: { percent: { stat: 'str', min: 15, max: 60, half: 60 } },
      buff: { stat: 'maxHpMaxMpPercent', durationMs: 60000, valueCurve: 'percent', percentOfDerived: false, allyRadius: 300, extra: null },
    }),
    warriorSkill({
      id: 'warrior-counter', name: 'Counter', branch: 'grit', tier: 3, column: 1, parents: ['warrior-power-stance', 'warrior-hyper-body'],
      type: SkillType.Active, mechanic: 'counter',
      icon: 'eclipse', color: GRIT_COLOR, animationKey: 'warrior-counter',
      description: 'Press just before a hit lands: you take nothing, the zombie is stunned and you strike back with a crit.',
      damageMult: 1.8, maxTargets: 1,
      curves: { windowMs: { stat: 'dex', min: 200, max: 350, half: 40 } },
    }),
    warriorSkill({
      id: 'warrior-second-wind', name: 'Second Wind', branch: 'grit', tier: 4, column: 0, parents: ['warrior-counter'],
      type: SkillType.Reactive, mechanic: 'second-wind',
      icon: 'moon', color: GRIT_COLOR, animationKey: 'warrior-second-wind',
      description: 'Once per floor a killing blow leaves you at 1 HP, untouchable for a moment, then heals you.',
      curves: { healPercent: { stat: 'str', min: 10, max: 30, half: 60 } },
    }),
    warriorSkill({
      id: 'warrior-rally', name: 'Rally', branch: 'grit', tier: 4, column: 2, parents: ['warrior-counter'],
      type: SkillType.Reactive, mechanic: 'rally',
      icon: 'revive', color: GRIT_COLOR, animationKey: 'warrior-rally',
      description: 'Revive allies faster, and they get back up with more HP.',
      curves: { percent: { stat: 'str', min: 30, max: 60, half: 60 }, healPercent: { stat: 'luk', min: 25, max: 60, half: 30 } },
    }),
    warriorSkill({
      id: 'warrior-last-stand', name: 'Last Stand', branch: 'grit', tier: 5, column: 1, parents: ['warrior-second-wind', 'warrior-rally'],
      type: SkillType.Reactive, mechanic: 'last-stand',
      icon: 'holy', color: GRIT_COLOR, animationKey: 'warrior-last-stand',
      description: 'Below a quarter of your HP you hit harder and every hit heals you.',
      capstone: true,
      curves: { percent: { stat: 'str', min: 15, max: 40, half: 60 }, lifestealPercent: { stat: 'luk', min: 3, max: 8, half: 30 } },
    }),
  ],
};

export const SKILL_TREES: Partial<Record<CharacterClass, ClassSkillTree>> = {
  [CharacterClass.Warrior]: WARRIOR_SKILL_TREE,
};

/** The class's skill tree, or null for a class that still uses SKILLS levels. */
export function getSkillTree(classId: CharacterClass): ClassSkillTree | null {
  return SKILL_TREES[classId] ?? null;
}

export function findTreeSkill(id: string): TreeSkill | null {
  for (const tree of Object.values(SKILL_TREES)) {
    const skill: TreeSkill | undefined = tree?.skills.find((s: TreeSkill): boolean => s.id === id);
    if (skill) return skill;
  }
  return null;
}

/** Skill points a class gets per level up. */
export function skillPointsPerLevel(classId: CharacterClass): number {
  return getSkillTree(classId) ? GAME_CONSTANTS.TREE_SKILL_POINTS_PER_LEVEL : GAME_CONSTANTS.SKILL_POINTS_PER_LEVEL;
}

/** Skill points a new character of the class starts with. */
export function startingSkillPoints(classId: CharacterClass): number {
  return getSkillTree(classId) ? GAME_CONSTANTS.TREE_STARTING_SKILL_POINTS : 0;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  jump: [' '],
  attack: ['j', 'mouseleft'],
  skill1: ['1'],
  skill2: ['2'],
  skill3: ['3'],
  skill4: ['4'],
  skill5: ['5'],
  skill6: ['6'],
  openStats: ['p'],
  openSkills: ['o'],
  useHpPotion: ['7'],
  useMpPotion: ['8'],
  openShop: ['b'],
  openInventory: ['i'],
  revive: ['f'],
  carry: ['e'],
  confirmDrop: ['y'],
  declineDrop: ['n'],
  quickSlot1: ['shift'],
  quickSlot2: ['insert'],
  quickSlot3: ['home'],
  quickSlot4: ['pageup'],
  quickSlot5: ['alt'],
  quickSlot6: ['delete'],
  quickSlot7: ['end'],
  quickSlot8: ['pagedown'],
  // Slots 9-12 start empty on the other mouse buttons: drop a skill or potion on them to cast it by mouse.
  quickSlot9: ['mouseright'],
  quickSlot10: ['mousemiddle'],
  quickSlot11: ['mouseback'],
  quickSlot12: ['mouseforward'],
};

// ─── Default Quick Slot Assignments ─────────────

const DEFAULT_ENTRIES: [QuickSlotAction, QuickSlotEntry][] = [
  ['quickSlot1', { type: 'keybind', id: 'attack' }],
  ['quickSlot2', { type: 'keybind', id: 'skill1' }],
  ['quickSlot3', { type: 'keybind', id: 'skill2' }],
  ['quickSlot4', { type: 'keybind', id: 'skill3' }],
  ['quickSlot5', { type: 'keybind', id: 'useHpPotion' }],
  ['quickSlot6', { type: 'keybind', id: 'useMpPotion' }],
  ['quickSlot7', { type: 'keybind', id: 'skill4' }],
  ['quickSlot8', { type: 'keybind', id: 'skill5' }],
];

export const DEFAULT_QUICK_SLOTS: Record<string, QuickSlotEntry | null> = (() => {
  const result: Record<string, QuickSlotEntry | null> = {};
  for (const action of QUICK_SLOT_ACTIONS) {
    result[action] = null;
  }
  for (const [action, entry] of DEFAULT_ENTRIES) {
    result[action] = entry;
  }
  return result;
})();

// ─── Potion Definitions ─────────────────────────

export const POTION_DEFINITIONS: PotionDefinition[] = [
  {
    id: 'hp-potion-1',
    name: 'HP Potion',
    description: `Restores ${GAME_CONSTANTS.HP_POTION_RESTORE} HP.`,
    icon: 'potion-hp-s',
    category: 'hp',
    mode: 'flat',
    value: GAME_CONSTANTS.HP_POTION_RESTORE,
    shopPrice: GAME_CONSTANTS.SHOP_HP_POTION_PRICE,
  },
  {
    id: 'hp-potion-2',
    name: 'HP Potion II',
    description: `Restores ${GAME_CONSTANTS.HP_POTION_2_RESTORE} HP.`,
    icon: 'potion-hp-m',
    category: 'hp',
    mode: 'flat',
    value: GAME_CONSTANTS.HP_POTION_2_RESTORE,
    shopPrice: GAME_CONSTANTS.SHOP_HP_POTION_2_PRICE,
  },
  {
    id: 'hp-elixir',
    name: 'HP Elixir',
    description: `Restores ${GAME_CONSTANTS.HP_ELIXIR_RESTORE_PERCENT}% of max HP.`,
    icon: 'potion-hp-l',
    category: 'hp',
    mode: 'percent',
    value: GAME_CONSTANTS.HP_ELIXIR_RESTORE_PERCENT,
    shopPrice: GAME_CONSTANTS.SHOP_HP_ELIXIR_PRICE,
  },
  {
    id: 'mp-potion-1',
    name: 'MP Potion',
    description: `Restores ${GAME_CONSTANTS.MP_POTION_RESTORE} MP.`,
    icon: 'potion-mp-s',
    category: 'mp',
    mode: 'flat',
    value: GAME_CONSTANTS.MP_POTION_RESTORE,
    shopPrice: GAME_CONSTANTS.SHOP_MP_POTION_PRICE,
  },
  {
    id: 'mp-potion-2',
    name: 'MP Potion II',
    description: `Restores ${GAME_CONSTANTS.MP_POTION_2_RESTORE} MP.`,
    icon: 'potion-mp-m',
    category: 'mp',
    mode: 'flat',
    value: GAME_CONSTANTS.MP_POTION_2_RESTORE,
    shopPrice: GAME_CONSTANTS.SHOP_MP_POTION_2_PRICE,
  },
  {
    id: 'mp-elixir',
    name: 'MP Elixir',
    description: `Restores ${GAME_CONSTANTS.MP_ELIXIR_RESTORE_PERCENT}% of max MP.`,
    icon: 'elixir',
    category: 'mp',
    mode: 'percent',
    value: GAME_CONSTANTS.MP_ELIXIR_RESTORE_PERCENT,
    shopPrice: GAME_CONSTANTS.SHOP_MP_ELIXIR_PRICE,
  },
];

export function getPotionById(potionId: string): PotionDefinition | undefined {
  return POTION_DEFINITIONS.find((p: PotionDefinition): boolean => p.id === potionId);
}

export function getPotionRestoreAmount(potionId: string, maxHp: number, maxMp: number): number {
  const def: PotionDefinition | undefined = getPotionById(potionId);
  if (!def) return 0;
  if (def.mode === 'percent') {
    const maxStat: number = def.category === 'hp' ? maxHp : maxMp;
    return Math.floor((def.value / 100) * maxStat);
  }
  return def.value;
}

export function getPotionsByCategory(category: PotionCategory): PotionDefinition[] {
  return POTION_DEFINITIONS.filter((p: PotionDefinition): boolean => p.category === category);
}

export function getTotalPotionsByCategory(potions: Record<string, number>, category: PotionCategory): number {
  const categoryPotions: PotionDefinition[] = getPotionsByCategory(category);
  let total: number = 0;
  for (const def of categoryPotions) {
    total += potions[def.id] ?? 0;
  }
  return total;
}

export function resolveAutoPotionId(
  configuredId: string | null,
  potions: Record<string, number>,
  category: PotionCategory,
): string | null {
  if (configuredId && (potions[configuredId] ?? 0) > 0) {
    return configuredId;
  }
  const categoryPotions: PotionDefinition[] = getPotionsByCategory(category);
  for (const def of categoryPotions) {
    if ((potions[def.id] ?? 0) > 0) return def.id;
  }
  return null;
}

// ─── Shop Items ─────────────────────────────────

export const SHOP_ITEMS: ShopItemDefinition[] = POTION_DEFINITIONS.map(
  (p: PotionDefinition): ShopItemDefinition => ({
    id: `shop-${p.id}`,
    name: p.name,
    description: p.description,
    icon: p.icon,
    price: p.shopPrice,
    potionId: p.id,
  }),
);
