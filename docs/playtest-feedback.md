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

## Suggested order

1. Exit gate (progression is impossible today).
2. Zombie wind-up telegraph and attack tokens (fairness).
3. A level-1 attack skill, plus hit-stop, hit flash and damage number feedback.
4. Coyote time and variable jump.
5. Revive tuning, a non-blocking special-drop prompt, and the attack key default.

Each change ships with an e2e spec (see the `game-e2e` skill). Re-run `npm run e2e:lab` to compare against these numbers.
