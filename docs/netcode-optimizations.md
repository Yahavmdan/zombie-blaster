# Online sync: measurements and optimization backlog

Measured 2026-09-30 with `npm run e2e:net` (bots fighting on floor 5, local server, JSON over `ws`).
Re-measure after every netcode change; `e2e/specs/online/network-budget.spec.ts` attaches the numbers.

## Baseline

| Scenario  | Host upstream          | Guest upstream | Guest downstream       | `game-sync` frame (avg / max) |
| --------- | ---------------------- | -------------- | ---------------------- | ----------------------------- |
| 2 players | 137 KB/s (~1.1 Mbit/s) | 18 KB/s        | 137 KB/s               | 6.8 KB / 13 KB                |
| 4 players | 224 KB/s (~1.8 Mbit/s) | 18 KB/s        | 263 KB/s (~2.1 Mbit/s) | 11.2 KB / 21 KB               |

- Host sends `game-sync` 20/s. Each guest sends `player-state` 20/s (~0.9 KB), relayed to every other player.
- Server relays everything as-is and re-serializes each message once per recipient.
- Pickable props (barrels, boxes) ride in `game-sync` as `props`, but only the ones away from their layout spawn spot (carried, flying, thrown elsewhere): untouched floors add an empty array.

## Correctness bugs found and fixed (2026-09-30)

Each one has a regression test. The spec named in brackets fails if the bug comes back.

- **C1** The sync loop drained the outbound queues (VFX, zombie hits on guests, revives) into snapshots that were then dropped while the socket was down. It also logged "Cannot send" 20 times a second. Fix: the sync tick is skipped unless `WebSocketService.isOpen`, and queued VFX are capped at `MAX_PENDING_VFX_EVENTS`. [resilience.spec.ts: effects queued while disconnected]
- **C2** The host drew every guest hit twice (`applyRemoteDamage` plus the replayed guest broadcast) and re-broadcast it, so third players saw it twice too. Fix: `applyRemoteDamage` only applies damage. [visual-sync.spec.ts: exactly one damage number]
- **C3** No payload validation: a bad shape threw inside a handler and left that socket deaf (8 message types). Fix: `zombie-blaster-api/src/validation.ts` checks every message and rejects bad ones with `INVALID_PAYLOAD`. Dispatch is wrapped, so a handler that throws answers `INTERNAL_ERROR`. [server-fuzz.spec.ts]
- **C4** A kick left the player mapped to the old room, so they could not create or join another. Fix: the kick goes through `RoomManager.leaveRoom`, and the room gets `player-left` when a game is running. [lobby.spec.ts, server-fuzz.spec.ts]
- **C5** In solo, the outbound queues were never drained and grew all session. Fix: `GameEngine.discardOutboundEvents()` runs every tick in single player. [chaos.spec.ts: outbound queues]
- **C6** When a guest picked up a special drop, the host played the buff particles, flash and shake at its own player. Fix: the host calls `applyRemoteSpecialEffect`, which changes state only. [visual-sync.spec.ts: special drop]

## Bandwidth / latency backlog (highest win first)

1. **Enable `perMessageDeflate` on the server** (one option in `new WebSocketServer`). Repetitive JSON zombie arrays compress very well. Expect 70–85% less traffic, with no protocol change. Watch the server CPU cost at 4 players.
2. **Split `game-sync` into dynamic and static zombie fields.** About 40 fields per zombie are sent every tick. Fields like `type`, `maxHp`, `instanceSpeed`, `instanceDamage*`, `instanceWidth/Height`, `instanceXpReward`, `orbitOffset` and `hesitationRange` never change after spawn. Send them once (spawn event or first sighting); per tick send `id, x, y, vx, vy, hp, facing, flags`. Expect `game-sync` to shrink by roughly 60%.
3. **Quantize numbers.** Positions and velocities go out with full float precision (`523.4839201`). Round to 1 decimal (or ints) before sending. Expect about 20–30% off every frame.
4. **Slim `player-state`.** Send position, velocity, facing and animation flags at 20 Hz. Send the full `CharacterState` (stats, derived, skillLevels, inventory, activeBuffs) only when it changes. Expect ~0.9 KB → ~0.15 KB per message, times N-1 recipients.
5. **Send corpses and projectile trails on change only.** Corpses are static after death. Spitter `trail` arrays are pure visuals that each client can rebuild.
6. **Serialize once per broadcast on the server.** `broadcastToRoom` calls `send()`, which runs `JSON.stringify` per recipient. Stringify once and reuse the string. This saves server CPU and scales with room size.
7. **Add a server `maxPayload`** (e.g. 64 KB). Today a 3 MB frame is accepted and relayed to the whole room, which amplifies abuse.
8. **Tick-stamped snapshots and a real interpolation buffer.** Clients interpolate over 3 ticks (60 ms) while snapshots arrive every 50 ms, so any network jitter falls into extrapolation (visible zombie stutter). Stamp snapshots with the host tick and render about 100 ms behind (2 snapshots). The send rate could then drop to 10–15 Hz for zombies without visible loss.
9. **Detect a silent host faster.** A host that vanishes without closing its socket (crash, Wi-Fi loss) is only noticed by the 30 s heartbeat (up to 60 s), and the world freezes meanwhile. Use a shorter in-game heartbeat, or let clients report "no `game-sync` for 3 s".
10. **Don't broadcast no-op effects.** `assassin-claw-mastery`, `assassin-lucky-seven` and `assassin-magic-twin` push `skill-animation` events whose keys have no `SKILL_ANIMATIONS` entry. Every receiver replays nothing. Omit empty arrays (`revives`, `pullEvents`, `vfxEvents`) from payloads too.
11. **Binary encoding later.** After 1–5, a schema'd binary format (e.g. MessagePack) is the next step. It's only worth it if the budgets still bind.

## How to verify a change

```
npm run e2e:net        # numbers attached to the report; budgets in network-budget.spec.ts
npm run e2e:online     # nothing regressed (sync, visual replay, resilience)
npm run e2e:bugs       # a fixed bug shows as "unexpected pass" → remove its test.fail pin
```
