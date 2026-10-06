# Playtest feedback: what would make Zombie Blaster better

Source: 7 co-op AI matches of 2–8 minutes each (`npm run e2e:demo`), the playtest lab (`npm run e2e:lab`,
raw data in `e2e/.results/lab/findings.jsonl`), side-by-side screenshots, and web research on
platformer game feel (Celeste movement values, hit-stop/screen-shake practice, MapleStory skill pacing,
DOOM 2016 attack tokens). Date: 2026-09-30. Items are ordered by impact.

## Already fixed during the playtest

- Corpses showed half-standing death frames and looked different on each screen. Frozen corpses now always use the last death frame, and clients copy the host's pose. Test: `visual-sync.spec.ts`, "corpses rest fully fallen…".
- Attack is on Ctrl, so attacking while moving fired browser shortcuts (Ctrl+A selected the page, Ctrl+D bookmarked, Ctrl+P printed). All keys bound to game actions now `preventDefault`. Test: `ui.spec.ts`, "…browser shortcuts".

## 1. Progression is blocked: nobody can reach the exit

**Observed:**

- Floors end only when a player stands on the EXIT, which is 200 px above the top platform. Single jump reaches 116 px and the assassin double jump reaches 192 px.
- Each corpse raises a pile by only 5 px, and zombies rarely die on the top platform. In 3 minutes of trying (lab) neither class got up, and all 7 demo matches stayed on floor 1 for 8 minutes.
- The exit rope was removed earlier ("deleted test rope").

**Suggestions (pick one):**

- **Kill quota opens the exit.** After N kills (for example 25 + 5 per floor), a rope or ladder drops to the exit, with a HUD progress bar and an arrow. This is the standard pattern from the research.
- **Lower the exit to about y 220** so a double jump or a small corpse pile works, and give non-assassins a way up (spring pad, ladder).
- **Taller corpse piles** (5 px → 12–15 px per corpse), so dying zombies reliably build a ramp. This keeps the "climb the dead" idea, but it needs zombies to die near the top platform.

## 2. Early game is too punishing and the burst is unfair

**Observed:**

- A level-1 solo warrior with good AI (drinks potions, flees) died within 3 minutes on floor 1.
- Idling anywhere, level 1 players were hit within 5–26 s, and 5 of 7 idle spots died within 60 s.
- Floor-1 zombie hits deal 24–85 against 120–230 max HP, and the attack animation gives only ~120 ms warning (12-tick swing, hit on tick 6).
- Crowds hit at the same time, and one burst downed a full-HP assassin.

**Suggestions:**

- **Telegraph attacks.** Give zombies a 0.4–0.6 s wind-up (raise the arm, flash) before the hit frame. Human reaction time is about 0.25 s.
- **Attack tokens.** Allow at most 1–2 zombies to melee the same player at once; the others shuffle and hesitate. This removes unfair crowd bursts but keeps pressure.
- **Floor-1 damage** of about 8–20, scaling up with floor; keep the current numbers from floor 4 on.
- Keep the i-frames (1.8 s with blinking, which is good), and show the i-frame state on remote players too.

## 3. Skills: first ones arrive late and feel weak

**Observed:**

- The first warrior active skill needs level 3, while level-1 skill points can only go into passives (auto-potion). My AI put all its points into auto-potion and played 8 minutes without a single active skill.
- At level 50 on floor 3, power-strike and slash-blast killed 0 of the 4 zombies within 200 px. Their reach is short, and 120 ms after casting there were no damage numbers and no screen shake.
- Power-strike reads as a small white ring. Power-dash was the only skill that felt strong (7 kills).

**Suggestions:**

- An attack skill at level 1 (MapleStory gives one at level 1–3). Move `power-strike` to level 1.
- **Hit-stop:** freeze 35 ms on a normal skill hit and 70–90 ms on crits or big skills, capped at 120 ms. Apply it once per cast, not per target.
- **Trauma-based screen shake:** 4 px on a light hit, 8 px on a heavy one, decaying over 0.2–0.3 s; kick along the hit direction.
- **White hit flash** on zombies for 2–4 frames on every hit.
- **Stacked damage numbers per hit** (MapleStory style) that pop on crits.
- Make hit areas match the VFX: slash-blast's fire arc should damage everything it visibly covers. Power-strike needs a forward slash sprite instead of a ring.
- Buffs (hyper-body, power-stance, claw-mastery, magic-twin) show no lasting indicator. Add a caster aura and HUD icons with a countdown.
- `assassin-claw-mastery`, `lucky-seven` and `magic-twin` have no `SKILL_ANIMATIONS` entry, so their cast animation is empty for everyone. Give them one.

## 4. Movement feel (numbers from Celeste)

- **Coyote time: none today.** Allow a jump for about 100 ms (5 ticks) after walking off a ledge.
- **Variable jump height: none today.** Releasing jump early should cut upward velocity (×0.5), so short hops are possible for dodging.
- **Apex hang:** half gravity near the top of the jump for a floatier, more controllable peak.
- **Ropes:**
  - Attacking while climbing already works (good, but MapleStory disallows it). Decide whether that's intended.
  - You can't turn on a rope, so attacks there only go one way. Allow turning while climbing.
  - Jump alone drops you off. MapleStory needs direction + jump, which prevents accidental falls.

## 5. Co-op and readability

- **Other players' effects:** all 10 side-by-side checks per match were consistent after the corpse fix. Consider drawing allies' effects at 60–75% opacity so your own read first.
- **Revives rarely happen:** zombies keep swarming the downed player, and any hit cancels the 3 s channel. Options:
  - Pause the bleed-out timer while someone channels.
  - Give the reviver damage reduction during the channel.
  - Shorten the channel to 2 s.
- **Menus don't pause** (correct for co-op), but opening the shop mid-fight is deadly. Add a brief "shopping shield", or allow buying potions from the quick slots.
- The special-drop Y/N prompt pops up mid-combat and dims the screen. Show it as a small non-blocking toast.

## 6. Controls and UI

- The How-to-Play panel says **J** attacks, but the default binding is **Ctrl**. Update the panel, or make J the default.
- **Ctrl as attack is risky: Ctrl+W (up + attack) closes the tab**, and browsers don't let pages block it. Consider J, X or K as the default attack key.
- The HUD "FLOOR" and "SCORE" got a blue selection highlight from Ctrl+A. That's fixed now, but the canvas also needs `user-select: none`.
- **Dev builds start with 1,000,000 gold**, which hides economy problems in testing. Measured on floor 1: 185 gold/min earned vs ~40 gold/min of potions (30 each). The balance is fine for production.

## Round 2 (2026-10-01): what shipped and what the replay found

**Exit: the dead build the way up (kept the "climb the corpses" idea).**

- The exit sits over one of three ground corridors and casts a 160 px **beam** down to the ground.
- Zombies slain in the beam, **or slain by a player standing in it**, become **stack steps**:
  - A switchback stair of bodies (44 px per step solo, alternating ±36 px, wide footholds), drawn as one pile down to the ground.
  - Bodies are held (no death fling).
  - Ranged classes build by shooting from the light.
- The HUD meter shows "Slay in the beam n/N", then "Stack ready — climb!" with a gold CLIMB! marker.
- While the stack is unfinished:
  - The exit **calls the dead**: half the spawns rise on the ground beside the beam, never inside it.
  - Wandering zombies drift toward the beam.
- Once the stack is finished:
  - The call goes quiet, so climbers aren't buried under a crowd.
  - The beam **steadies climbers** (no knockback on or between steps).
  - Zombies can't stand on the stack.
- Floor 1 needs 9 beam kills solo. Each kill adds 1/N of a step with N players, because co-op kills (and spawns) N times faster.
- Measured (maxed warrior bot, godmode, 5 parallel browsers):
  - Before: 7 of 11 steps after 6 min.
  - After: stack done in ~100–160 s, including climbing.
  - Specs: `exit.spec.ts`, beacon unit tests in `zombie-system.spec.ts`.

**Also shipped:**

- Fairness: a 0.3 s wind-up telegraph before melee hits, at most 2 melee attackers per player, floor-1 damage ×0.4 ramping to full by floor 5.
- Feel:
  - Hit-stop (solo only), hit flash, screen shake on skill hits, buff aura.
  - Power-strike available at level 1 (range 70), lucky-seven at level 1, slash-blast range 140.
  - Cast animations for the assassin skills.
- Movement: coyote time, variable jump height, apex hang, air control; turning on ropes, and direction + jump to let go.
- Co-op:
  - The revive channel is 2 s and pauses the bleed-out.
  - A menu shield cuts damage by 70% for 4 s after opening a menu.
  - Allies' effects are drawn at 70% opacity.
  - Special drops show as a toast, not a dimming prompt.
- Controls: J attacks (Ctrl no longer does), the How-to-Play panel shows the real keys and explains the beam, and the canvas has `user-select: none`.

**Found in the round-2 replay:**

- The first stack **looked like floating shelves**: each body was drawn at the bottom of its tall step box, 44 px below where you stand. Now the body lies on the step and darker bodies fill the pile down to the ground.
- A crowd gathered at the stack base (the beacon kept luring after the stack was done) and knocked climbers off between steps. Fixed by silencing the lure once the stack is ready and steadying anywhere in the column.
- A unit test "flake" was really a missing `setFinalFrame` mock that threw whenever the random pose branch ran.
- **Co-op raced through floors:** 2 bots reached floor 16 in 8 min at level 5–6. Stack steps now shrink with the player count; the next run reached floor 8 in 6 min.
- **Levels fell behind floors:** the kill XP bonus was a hard-coded +10% per floor, against a ×1.6 XP curve. It is now `ZOMBIE_XP_SCALE_PER_WAVE` = +20% per floor.
- **Ranged classes couldn't build the stack:**
  - Before the fix: a fresh assassin got 0 of 9 steps in 6 min (55 kills).
  - Its knives killed zombies before they reached the beam.
  - Fix: kills made from inside the beam count; a guest's relayed kills carry the killer id from the server.
- **The co-op pile turned into a black mass:** every step's filler reached the ground, so layers grew quadratically. Each step now fills only down to the same-side step two below, with a lighter shade.
- Solo pacing (lab, fresh characters, no godmode): a level-1 warrior reached floor 2 in 34 s (17 kills, no potions).

**Proposals (not changed yet; need a design call):**

- **MP regen:** the game has none. The assassin sat at 2/65 MP for most of both demos and cast half as many skills as the warrior. MapleStory regenerates a little MP over time (scaling with INT); something like 1 MP/s would keep skills usable without potions.
- **Floor length:** about 30–45 s per floor makes the map feel like a corridor. If floors should feel like grinding maps, raise `EXIT_STACK_STEP_DECAY_PER_FLOOR` or lower `EXIT_BEACON_SPAWN_CHANCE` (0.5) to slow the stack.
- **XP curve:** ×1.6 per level is steep for a game whose floors last under a minute. ×1.35–1.4 would keep levels near the floor number.
- **The chaos "dialog + resize storm" test** sometimes ends with the player unable to move (0 px in 400 ms, no dialog open). It only happens under heavy parallel load; the assertion now prints the player state for the next occurrence.

## Round 3 (2026-10-04): your feedback on round 2

- **No visible hint under the exit.** The light column and the "Slay in the beam n/N" meter are gone; the exit just says EXIT. The zone where kills count is still there, invisible. How to Play only says the exit is out of jump reach "...but the dead pile up."
- **One kill, one body.** The pile no longer draws filler bodies (each kill used to look like 5–6 corpses). Each body adds 16 px, about one lying body.
- **The exit is lower and shortcut-proof.**
  - y 310 on floor 1 (was 130), so floor 1 needs about 14 kills solo.
  - It rises 12 px per floor and 64 px per extra player.
  - The two upper platforms and their ropes are gone; the rest of the level is mirrored, so the exit alternates right/left over open ground.
  - No double jump from the ground or any platform reaches it (`exit.spec` checks every launch spot).
- **Monster magnet drags instead of teleporting.** Zombies brace briefly (longer when farther), then are lifted and pulled along an accelerating arc into the warrior's spot with purple drag streaks, then drop. The drag is host-simulated and synced, so every screen sees it. It's the warrior's tool for piling bodies under the exit.

## Round 3 (2026-10-06): natural pile, safe spot instead of menu shield

- **The exit pile is ordinary now.** The user found the arranged pile unnatural. Removed: the invisible
  zone that snapped bodies into a left/center/right heap of 16 px steps, the wide footholds, the
  knockback hold, kills counted "from inside the zone", the lure (wanderers drifting to the exit, half
  the spawns rising beside it) and the climb steadying. Corpses under the exit now fall, stack and
  look like corpses anywhere else (5 px per body, narrow footholds). The exit height is unchanged, so
  floor 1 solo needs ~40+ bodies landing under it (was 14): much harder by design.
  - Open question: re-measure with `npm run e2e:lab -- -g exit`. If floors take far too long, tune
    the exit height (`EXIT_PLATFORM_Y`, `EXIT_RISE_PER_*`) rather than bringing assistance back.
- **Safe spot instead of the menu shield.** Menus no longer cut damage. Every floor has one high
  ledge with its own ladder, on the far side from the exit (lantern + "SAFE" sign). Zombies can't
  land there, don't target anyone resting there and their shots pass through; players can't attack
  or use attack skills from it (buffs work), so it is for stats/skills/shop, not for sniping.
  Getting up the exposed ladder is how players earn the rest.
  Specs: `safe-spot.spec.ts`, `safe-spot-coop.spec.ts`, `exit.spec.ts`, level rules in `level-generator.spec.ts`.

## Suggested order

1. Exit gate (progression is impossible today).
2. Zombie wind-up telegraph and attack tokens (fairness).
3. A level-1 attack skill, plus hit-stop, hit flash and damage number feedback.
4. Coyote time and variable jump.
5. Revive tuning, a non-blocking special-drop prompt, and the attack key default.

Each change ships with an e2e spec (see the `game-e2e` skill). Re-run `npm run e2e:lab` to compare against these numbers.
