# AsphaltCrash – Gameplay Specification

Status: draft v1. All numeric values are **initial tuning values**, held in `src/config/gameConfig.ts`, and must be tuned on a real iPad in phase P1/P4.
Open decisions reference `ANALYSIS.md` section 7 (Q-xx).

---

## 1. Match overview
- Arena: enclosed rectangle, walls on all sides, optional interior static obstacles (none in v1 except walls and bases).
- Players: 1–4 humans, 0–7 bots, total cars ≤ 8.
- Each car has a **Home Base** (rectangle) placed next to its spawn point.
- Cash bills spawn in the arena. Players collect bills by driving over them and deliver them to their own Home Base.
- Cars fight by ramming. Damage reduces health. Destroyed cars drop their cargo and respawn.
- Match ends when the timer reaches zero (Q-03 recommended default: 180 s). Highest score wins. Ties share the win.

---

## 2. Win condition and scoring (Q-03 proposed)

| Rule | Value |
|------|-------|
| Match length | 180 s (configurable: 90 / 180 / 300 s) |
| Score = | cash delivered to own Home Base |
| Kill bonus | +50 cash to the attacker, when the attacker's impact destroyed the victim |
| Self-destruct / wall death | no bonus |
| Winner | highest score at timer zero. Ties: all tied players are winners. |
| Early end | none in v1 |

Score values are integers. Cash is shown as currency units (`$`).

---

## 3. Cash bills

| Property | Value |
|----------|-------|
| Values | 10 (70 %), 20 (20 %), 50 (10 %) weighted random from seeded RNG |
| Max bills on field | 12 |
| Spawn rate | one bill every 2.5 s while below max |
| Spawn location | random point inside arena, at least 120 px from any Home Base, not inside a wall |
| Pickup | car body overlaps bill sensor → bill is collected |
| Cargo capacity | 5 bills per car |
| Overflow | pickup rejected when cargo is full |
| Delivery | car body overlaps own Home Base sensor with cargo > 0 → all cargo converted to score |
| Delivery to other base | not allowed (no effect) |
| Destroyed car | all cargo dropped as field bills at the car position, values preserved |

Bills are visible to all players. Pickup and delivery are determined by the host only.

---

## 4. Vehicle handling

### 4.1 Controls (virtual joystick, README R-02)
| Input | Effect |
|-------|--------|
| Joystick up | throttle forward |
| Joystick down | brake, then reverse when speed ≈ 0 |
| Joystick left/right | steer left/right |
| Action button (right thumb, Q-04) | boost (short forward impulse, 2 s cooldown) |

- Joystick: fixed position in the lower-left quadrant, radius 72 px (CSS units), dead zone 12 %.
- Steering is proportional to joystick X and scaled by speed: full steer at low speed, reduced at high speed (`steerScale = 1 - 0.5 * speedFraction`).

### 4.2 Physics feel (targets, verified only on device)
| Parameter | Initial value |
|-----------|---------------|
| Max forward speed | 260 px/s |
| Max reverse speed | 120 px/s |
| Acceleration | 420 px/s² |
| Braking | 600 px/s² |
| Lateral grip | 0.9 (fraction of sideways velocity removed per second) |
| Air friction | 0.02 |
| Boost | +160 px/s on top of max speed, duration 0.6 s, cooldown 2 s |
| Max collision impulse considered | capped to avoid tunneling |

Lateral grip creates the "car, not box" feel. Lower grip = more drift. Tuning is a P1 task.

---

## 5. Combat and damage

### 5.1 Damage model
- Damage is based on **collision impulse** magnitude, not on speed alone.
- `damage = clamp((impulse - impulseThreshold) * damageFactor, 0, maxDamagePerHit)`
- Initial values: `impulseThreshold = 0.8`, `damageFactor = 9`, `maxDamagePerHit = 40`.
- Wall hits use the same formula with the wall as "attacker" but no attacker bonus.
- Each car pair has a **contact cooldown of 300 ms** so one continuous scrape does not deal damage every frame.
- Car health: 100 HP.
- A car reaching 0 HP is **destroyed**.

### 5.2 Attacker attribution
- The car whose impact produced the largest impulse in the last 1 second gets credit for destruction.
- If no other car hit in the last 1 s, destruction is credited to nobody (wall death).

### 5.3 Destruction and respawn
| Step | Value |
|------|-------|
| Destroyed | car stops, invulnerable 0 ms, cargo dropped |
| Respawn delay | 3 s |
| Respawn location | the car's spawn point. If occupied by a car within 80 px, the nearest free point along the arena is used. |
| Respawn state | 100 HP, empty cargo, invulnerable 2 s (visual blink) |

### 5.4 Hit feedback
- Impulse above `hitEventThreshold` (0.5) → `hit` event → spark effect at contact point and short camera shake (≤ 4 px, 150 ms).
- Health bar above each car.
- Attack feed on HUD: last 3 events as text (for example "A destroyed B").

---

## 6. Arena

| Property | Value |
|----------|-------|
| Size | 2400 × 1600 px (world units) |
| Walls | thickness 40 px, static |
| Spawn points | 4 for humans + up to 4 for bots, placed symmetrically around the arena |
| Home Base | 160 × 120 px rectangle, next to each spawn point, drawn in the owner's color |
| Obstacles | none in v1. Optional barrier props in P5. |
| Arena layout | Single fixed layout in v1, seed only varies bill positions and bot names. |

Arena size and spawn layout are authored constants, not procedural. Procedural maps are out of scope for v1.

---

## 7. Camera and HUD

### 7.1 Camera
- Follows the local player's car with smoothing (lerp factor 6 per second).
- Zoom: 0.6 at high speed, 1.0 at rest. Smoothed.
- Clamped to arena bounds. If the viewport is larger than the arena, the arena is centered.
- Spectator mode (solo host with no local car, not in v1).

### 7.2 HUD (React DOM)
| Element | Location | Update |
|---------|----------|--------|
| Timer | top center | 10 Hz |
| Score and cargo | top left | 10 Hz |
| Health bar (own car) | bottom right above action button | 10 Hz |
| Scoreboard (all cars) | top right, collapsible | 10 Hz |
| Attack feed | top, below timer | on event |
| Ping indicator | top right corner, debug or multiplayer only | 1 Hz |
| Connection banner | full width, top | on state change |

### 7.3 Layout (iPad landscape)
- Left thumb: joystick, lower-left.
- Right thumb: action button, lower-right.
- Center: game world. HUD does not overlay the car center.
- Safe-area insets respected.

---

## 8. Visual and audio requirements

### 8.1 Art
- Clean vector-style sprites, no pixel art (README R-05).
- Car: rounded rectangle body, windshield indicator, color per player.
- Bill: green rectangle with value label.
- Home base: outlined rectangle with color of owner.
- Floor: subdued gray asphalt texture (single tile texture).

### 8.2 Effects
| Effect | Trigger | Budget |
|--------|---------|--------|
| Exhaust smoke | Car throttle > 50 % | Max 1 `ParticleContainer` emitter per car, max 8 particles each |
| Collision sparks | `hit` event | Max 20 particles in flight (ParticleContainer pool) |
| Destruction burst | `kill` event | 30 particles, once |
| Tire marks | Lateral slip above threshold | Max 200 segments in ring buffer, optional on low-end |

Total particle budget: 200 at once. Above that, new effects are skipped.

### 8.3 Performance budget (iPad)
| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS; acceptable 30 FPS floor on oldest supported iPad |
| Sim step | < 4 ms per tick on host |
| JS heap | < 150 MB during match |
| Renderer resolution | `min(dpr, 2)` |

Quality toggles in Settings: `Effects: full | reduced`, `Tire marks: on | off`. Reduced = no tire marks, half particle count.

### 8.4 Audio (optional in v1, not blocking)
- Engine hum (pitch = speed), crash, pickup chime, delivery cash, countdown beep.
- Unlocked by the first user gesture (iOS requirement).
- Mute toggle in Settings.

---

## 9. Configuration constants (summary, for `gameConfig.ts`)

| Key | Value | Notes |
|-----|-------|-------|
| `matchSeconds` | 180 | Q-03 |
| `maxHumans` | 4 | default, configurable, not hard-locked (Q-01) |
| `maxCars` | 8 | humans + bots |
| `startCountdownSeconds` | 3 | |
| `respawnSeconds` | 3 | |
| `invulnerableAfterRespawnSeconds` | 2 | |
| `maxHealth` | 100 | |
| `maxDamagePerHit` | 40 | |
| `damageThresholdImpulse` | 0.8 | |
| `damageFactor` | 9 | |
| `contactCooldownMs` | 300 | |
| `attributionWindowSeconds` | 1 | |
| `cargoCapacity` | 5 | |
| `maxBillsOnField` | 12 | |
| `billSpawnIntervalSeconds` | 2.5 | |
| `killBonus` | 50 | |
| `boostSeconds` | 0.6 | |
| `boostCooldownSeconds` | 2 | |
| `snapshotHz` | 20 | |
| `inputHz` | 30 | |
| `interpDelayMs` | 100 | |
| `reconnectWindowMs` | 45000 | |
| `inputTimeoutMs` | 500 | |
| `hostSilenceTimeoutMs` | 15000 | |

---

## 10. Game modes

### 10.1 Solo vs CPU
- Host = local device. Human count = 1. Bots = 1–7 (default 3).
- Difficulty: Easy / Normal (default) / Hard (bot profile).
- No network is used. No room code.

### 10.2 Multiplayer (humans only)
- 2–4 humans. Bots = 0 by default.
- Start requires at least 2 human cars.

### 10.3 Mixed
- 1–4 humans plus bots, total cars ≤ 8.
- Start requires at least 1 human and at least 2 cars total.
- Host can set bot count in lobby (0–7 minus humans).

### 10.4 Lobby rules
- Host creates room → 6-character code and QR code shown.
- Clients join by typing code or scanning QR.
- Each player picks a name (≤ 16 chars). Colors are assigned by slot order (no picker in v1).
- Host can kick a player (v1 optional, P4).
- Room locks when match starts. New joins are rejected with `running`.

---

## 11. Non-goals (v1)
- Weapons, power-ups, oil slicks, mines.
- Procedural or user-made arenas.
- Spectators, late joins, bot takeover by humans.
- Persistent progress, accounts, leaderboards.
- Desktop-only controls.

---

## 12. Acceptance criteria (gameplay)

| ID | Criterion |
|----|-----------|
| G-01 | Solo vs 3 CPU runs for full 180 s on iPad without freezing. |
| G-02 | A car can be driven, steered, braked and reversed with the joystick only. |
| G-03 | Collecting and delivering a bill adds the value to the score exactly once. |
| G-04 | Ramming a car deals damage; scraping a wall does not destroy a car at normal speed. |
| G-05 | Destroyed car drops its cargo and respawns after 3 s. |
| G-06 | Four human players can join, play a full match, and see the same scoreboard at the end. |
| G-07 | Mixed mode: 2 humans + 2 bots works and bots fill their slots. |
| G-08 | A client on mobile data can complete a match, or the join fails with a clear message. |
| G-09 | Portrait orientation shows the "rotate device" hint and pauses the match. |
