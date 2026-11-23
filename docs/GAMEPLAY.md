# AsphaltCrash – Gameplay Specification

Status: draft v1. All numeric values are **initial tuning values**, held in `src/config/gameConfig.ts`, and must be tuned on a real iPad in phase P1/P4.
Open decisions reference `ANALYSIS.md` section 7 (Q-xx).

---

## 1. Match overview
- Modes: **Cash Run** (timed cash collection) and **Crashfest** (untimed last-car-standing derby). Crashfest is the default mode in solo and lobby setup.
- Cash Run arena: enclosed rectangle, walls on all sides, optional interior static obstacles (none in v1 except walls and bases).
- Players: 1–4 humans, 0–12 bots, total cars ≤ 16.
- In Cash Run, each car has a **Home Base** (rectangle) placed next to its spawn point.
- In Cash Run, bills spawn in the arena. Players collect them by driving over them and deliver them to their own Home Base.
- In Cash Run, cars fight by ramming; destroyed cars drop their cargo and respawn.
- Cash Run ends when the timer reaches zero (Q-03 recommended default: 180 s). Highest score wins. Ties share the win.
- Crashfest uses a separate 1600 × 1200 px arena, has no timer, bases or bills, and eliminates cars permanently. The last surviving car wins; simultaneous elimination is a draw.

---

## 2. Win condition and scoring (Cash Run, Q-03 proposed)

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

## 3. Cash bills (Cash Run)

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
| Joystick direction | car turns until its nose points along the stick direction, then drives |
| Joystick released | car coasts to a stop, no steering |
| Stick pointing away from heading | car brakes, then pivots in place toward the stick; no forward drive until within `aimDriveAngleRad` |
| Action button (right thumb, Q-04) | boost (short forward impulse, 2 s cooldown) |

- Joystick: floating control anchored at the initial touch within a broad lower-left zone, radius 72 px (CSS units), dead zone 12 %.
- The stick sends an absolute aim vector (`aimX`, `aimY`, unit circle), not steer and throttle. Pushing up always means "face up and drive up", regardless of the car's current heading.
- Aim is turned into steer and throttle on the host (`src/game/sim/aimDrive.ts`). Steer is the heading error divided by `aimTurnFullAngleRad`. Throttle is applied only when the heading error is within `aimDriveAngleRad`, and the magnitude of the stick sets the throttle.
- A car that is misaligned and moving forward brakes. A stationary car pivots in place at `aimPivotRateRadPerSec`.
- Steering always turns the car toward the world-space aim, even if its momentum temporarily points opposite its heading during a sharp direction change.
- Steering response ramps from pivot rate at rest to the rolling rate at full engagement (25 % of max forward speed), then is reduced at high speed (`steerScale = 1 - 0.5 * speedFraction`).

### 4.2 Physics feel (targets, verified only on device)
| Parameter | Initial value |
|-----------|---------------|
| Max forward speed | 360 px/s |
| Max reverse speed | 120 px/s |
| Acceleration | 650 px/s² |
| Braking | 100 px/s² |
| Lateral grip | 0.25 (sideways velocity damping per second; lower values create more drift) |
| Air friction | 0.0025 (Matter damping coefficient applied each fixed step) |
| Boost | +200 px/s on top of max speed, duration 0.6 s, cooldown 2 s |
| Max collision impulse considered | capped to avoid tunneling |

Lateral grip creates the "car, not box" feel. Lower grip = more drift. Tuning is a P1 task.
Forward and reverse speed caps limit powered motion; they do not truncate existing momentum during a turn.

---

## 5. Combat and damage

### 5.1 Damage model
- Damage is based on **collision impulse** magnitude, not on speed alone.
- `damage = clamp((impulse - impulseThreshold) * damageFactor, 0, maxDamagePerHit)`
- Initial values: `impulseThreshold = 0.8`, `damageFactor = 9`, `maxDamagePerHit = 40`.
- Wall hits use the same impulse formula with the wall as "attacker" but no attacker bonus. Damage is multiplied by the squared front-facing impact component: a head-on front hit keeps full damage, while a side or rear hit deals only 10%.
- Car-car hits: the **rammer** (the car whose pre-step velocity has the larger component along the contact normal toward the other car) takes `damage * rammerDamageShare` (0.25), the victim takes full `damage`.
- Each car pair has a **contact cooldown of 300 ms** so one continuous scrape does not deal damage every frame.
- Car health: 100 HP.
- A car reaching 0 HP is **destroyed**.

### 5.2 Attacker attribution
- The car whose impact produced the largest impulse in the last 1 second gets credit for destruction.
- If no other car hit in the last 1 s, destruction is credited to nobody (wall death).

### 5.3 Destruction and respawn
Cash Run uses the following destruction and respawn rules:

| Step | Value |
|------|-------|
| Destroyed | car stops, invulnerable 0 ms, cargo dropped |
| Respawn delay | 3 s |
| Respawn location | the car's spawn point. If occupied by a car within 80 px, the nearest free point along the arena is used. |
| Respawn state | 100 HP, empty cargo, invulnerable 2 s (visual blink) |

Crashfest cars do not respawn. A destroyed car remains out for the rest of the match; the match ends when one or zero cars remain alive. In Crashfest, the scoreboard counts attributed kills rather than cash.

### 5.4 Hit feedback
- Impulse above `hitEventThreshold` (0.5) → `hit` event → spark effect at contact point and short camera shake (≤ 4 px, 150 ms).
- Player name above each car (not the own car). Upright, white, always readable. Truncated to 20 characters.
- Attack feed on HUD: last 3 events as text (for example "A destroyed B").

---

## 6. Arena

Cash Run uses the arena below:

| Property | Value |
|----------|-------|
| Size | 3200 × 2400 px (world units) |
| Walls | thickness 40 px, static |
| Spawn points | 4 for humans (corners) + 12 for bots (edges and inner columns), mirror-symmetric on both axes |
| Home Base | 160 × 120 px rectangle, next to each spawn point, drawn in the owner's color |
| Obstacles | none in v1. Optional barrier props in P5. |
| Arena layout | Single fixed layout in v1, seed only varies bill positions and bot names. |

Arena size and spawn layout are authored constants, not procedural. Procedural maps are out of scope for v1.

Crashfest uses a 1600 × 1200 px arena. Its spawn positions are scaled from the authored Cash Run layout; no Home Bases are created or drawn.

---

## 7. Camera and HUD

### 7.1 Camera
- Follows the local player's car with smoothing (`cameraFollowLerp` 6 per second).
- Zoom: closer at rest, further out at speed (GTA-like). Target = `cameraZoomRest` 1.5 × (`cameraZoomMoving` 0.55 / 1.5)^speedFraction, a geometric blend so each speed step changes the visible area by the same proportion. speedFraction = car speed / (`maxForwardSpeed` + `boostSpeedBonus`), clamped to 0..1. Zoom is a scale factor: larger = closer. Smoothed with `cameraFollowLerp` (6/s) when closing in (braking) and with `cameraZoomOutLerp` (10/s) when widening the view (speeding up), so the view opens quickly at speed and settles slowly when braking.
- Visible area at full speed is about 2.7× the rest area (1.5 / 0.55).
- Clamped to arena bounds using the visible area in world units (viewport / zoom). If the viewport is larger than the arena, the arena is centered.
- Spectator mode (solo host with no local car, not in v1).

### 7.2 HUD (React DOM)
| Element | Location | Update |
|---------|----------|--------|
| Timer | top center | 10 Hz |
| Score and cargo | top left | 10 Hz |
| Health bar (own car) | bottom right above action button | 10 Hz |
| Scoreboard (all cars) | top right, collapsible and scrollable within a viewport-bounded panel | 10 Hz |
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
- Ground detail: a static layout (`src/game/ground/groundLayout.ts`) of asphalt speckle dots, a few lighter/darker patch tiles and a dark curb strip along the inner wall edges. It is drawn once in world space under the bases and cars, so it scrolls under the car as the camera follows. Counts are set by `groundSpeckleCount`, `groundPatchCount` and `groundCurbWidth`.
- Car damage: the car paint is never tinted or desaturated. The tone-only shader pass is off (`carDamageShaderEnabled: false`); it used to grey out the whole car. Damage = 1 - hp / maxHealth, smoothed per frame, and only drives the damage marks below.
- Damage marks: `carDamageScratchCount` dark scratches (stroke width 1.5 to 2.5 px, fully opaque), crack polylines and grime dots are drawn in car-local coordinates inside the car container, so they rotate with the car body and stay fixed on it while steering. Layout is fixed per car slot from `visualSeed`. Each mark fades in when damage passes its own threshold (ramp `carDamageMarkRamp`). Marks are hidden for destroyed cars.

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

### 8.4 Audio
Implemented with the browser Web Audio API only (no audio library). Pure math lives in `src/game/audio/audioMath.ts`; the browser voice code is `src/game/audio/CarAudio.ts`.
- Engine: sawtooth oscillator per car, lowpass filtered. Pitch rises with speed and slightly with throttle (`audioEngineIdleHz` to `audioEngineMaxHz`). Loudness rises with speed and throttle from `audioEngineIdleGain` (never silent at rest). Throttle is smoothed asymmetrically: it ramps up in `audioThrottleAttackSeconds` and winds down in `audioThrottleReleaseSeconds`, so when the joystick is released pitch and loudness ramp down rather than cutting out.
- Acceleration: filtered noise "push" layer, active only when throttle is above `audioAccelThreshold` (boost counts as full throttle).
- Tyre squeal: filtered noise at about 2.5 kHz, active on sharp turns at speed (yaw rate above `audioSqueakTurnRate`, speed fraction above `audioSqueakMinSpeedFraction`), full at `audioSqueakFullTurnRate`.
- Own car is played at `audioOwnCarGain`. Other cars are played at `audioOtherCarGain` and fade linearly with distance to the local car, silent at `audioHearingRadiusPx`. Destroyed cars are silent.
- Speed, throttle and yaw rate are derived per car from position and angle changes between frames (CarView has no velocity).
- Unlock: `sessionController.unlockAudio()` runs synchronously in the Play tap handler (iOS Safari requirement). Voices are created on first update and released when a car is gone.
- Mute: `CarAudio.setMuted(on)` exists. No Settings UI yet.
- Not implemented yet: crash, pickup chime, delivery cash and countdown sounds.

---

## 9. Configuration constants (summary, for `gameConfig.ts`)

| Key | Value | Notes |
|-----|-------|-------|
| `matchSeconds` | 180 | Q-03 |
| `maxHumans` | 4 | default, configurable, not hard-locked (Q-01) |
| `maxCars` | 16 | humans + bots (4 + up to 12) |
| `startCountdownSeconds` | 3 | |
| `respawnSeconds` | 3 | |
| `invulnerableAfterRespawnSeconds` | 2 | |
| `maxHealth` | 100 | |
| `maxDamagePerHit` | 40 | |
| `rammerDamageShare` | 0.25 | Share of damage the rammer takes in car-car hits (section 5.1) |
| `damageThresholdImpulse` | 0.8 | |
| `damageFactor` | 9 | |
| `wallSideDamageMultiplier` | 0.1 | Minimum wall damage multiplier for side/rear impacts; frontal impact damage is unchanged. |
| `humanDamageTakenMultiplier` | easy 0.4 / normal 0.6 / hard 1 | Scales damage taken by human cars per bot difficulty (section 5.1). Bots are not scaled. |
| `contactCooldownMs` | 300 | |
| `attributionWindowSeconds` | 1 | |
| `cargoCapacity` | 5 | |
| `maxBillsOnField` | 12 | |
| `billSpawnIntervalSeconds` | 2.5 | |
| `billRadius` | 12 | Bill pickup sensor radius in px (added for Physics.ts) |
| `killBonus` | 50 | |
| `boostSeconds` | 0.6 | |
| `boostCooldownSeconds` | 2 | |
| `snapshotHz` | 20 | |
| `inputHz` | 30 | |
| `interpDelayMs` | 100 | |
| `reconnectWindowMs` | 45000 | |
| `inputTimeoutMs` | 500 | |
| `hostSilenceTimeoutMs` | 15000 | |
| `matchReadyTimeoutMs` | 5000 | Host starts the match after this wait even if some clients have not sent `ready` |
| `lobbyConnectTimeoutMs` | 10000 | Lobby join timeout in ms; join is reported as failed if no welcome arrives |
| `botAttackRadiusPx` | 500 | Bot attacks an enemy within this distance (hp >= 15) |
| `botEvadeRadiusPx` | 200 | Bot evades an enemy within this distance when hp < 40 and not attacking |
| `timerWarningSeconds` | [30, 10, 0] | Remaining-time thresholds for timer warnings |
| `fixedStepHz` | 60 | Fixed simulation step rate (1/60 s) |
| `maxFrameDeltaMs` | 250 | Frame delta clamp for the Engine accumulator |
| `hudHz` | 10 | HUD store update rate |
| `visualSeed` | 1337 | Seed for bill positions and visual variation |
| `botSeedStride` | 7919 | Seed offset per bot RNG |
| `billPlacementAttempts` | 20 | Attempts to find a valid bill spawn point |
| `billMinDistanceFromBase` | 120 | Minimum bill distance from any Home Base in px |
| `billValues` | [10, 20, 50] | Bill values |
| `billWeightsPct` | [70, 20, 10] | Spawn weights in percent, matching `billValues` |
| `hitEventThreshold` | 0.5 | Impulse above which a `hit` event is emitted |
| `cameraShakePx` | 4 | Camera shake amplitude in px |
| `cameraShakeMs` | 150 | Camera shake duration in ms |
| `cameraZoomRest` | 1.5 | Camera zoom factor at rest (larger = closer), section 7.1 |
| `cameraZoomMoving` | 0.55 | Camera zoom factor at full speed, section 7.1 |
| `cameraFollowLerp` | 6 | Camera follow and zoom-in smoothing rate per second, section 7.1 |
| `cameraZoomOutLerp` | 10 | Camera zoom-out (widen view) smoothing rate per second, section 7.1 |
| `arenaWidth` | 3200 | Arena width in world units (px) |
| `arenaHeight` | 2400 | Arena height in world units (px) |
| `crashfestArenaWidth` | 1600 | Crashfest arena width in world units (px) |
| `crashfestArenaHeight` | 1200 | Crashfest arena height in world units (px) |
| `wallThickness` | 40 | Static wall thickness in px |
| `wallFriction` | 0.1 | Wall body friction |
| `wallRestitution` | 0.45 | Wall body restitution (bounciness); also used for the wall deflection of car velocity |
| `carWidth` | 48 | Car body width in px |
| `carHeight` | 24 | Car body height in px |
| `carNameMaxChars` | 20 | Max characters of a car name label |
| `carNameFontSize` | 12 | Car name label font size in px |
| `carNameGap` | 6 | Gap in px between car top edge and name label |
| `carMass` | 1.2 | Matter.js body mass (see gameConfig comment) |
| `carFriction` | 0.05 | Car body friction |
| `carRestitution` | 0.35 | Car body restitution (bounciness) |
| `baseWidth` | 160 | Home Base width in px |
| `baseHeight` | 120 | Home Base height in px |
| `humanSpawns` | 4 points (x, y, angle) | Human spawn points, angle in rad toward arena centre |
| `botSpawns` | 12 points (x, y, angle) | Bot spawn points, angle in rad toward arena centre |
| `maxForwardSpeed` | 360 | Max forward speed in px/s (section 4.2) |
| `maxReverseSpeed` | 120 | Max reverse speed in px/s (section 4.2) |
| `acceleration` | 650 | Acceleration in px/s² (section 4.2) |
| `braking` | 100 | Braking in px/s² (section 4.2) |
| `lateralGrip` | 0.25 | Lateral velocity damping per second (section 4.2) |
| `airFriction` | 0.0025 | Matter air-damping coefficient per fixed step (section 4.2) |
| `boostSpeedBonus` | 200 | Boost speed bonus in px/s (section 4.2) |
| `steerRateRadPerSec` | 3.4 | Full-lock steer rate at full engagement in rad/s |
| `steerSpeedPenalty` | 0.4 | Steer reduction at top speed (section 4.1) |
| `steerFullEngagementSpeedFraction` | 0.25 | Speed fraction at which full steering response is reached (section 4.1) |
| `joystickRadiusPx` | 72 | Virtual joystick radius in px (section 4.1) |
| `joystickDeadZone` | 0.12 | Joystick dead zone fraction (section 4.1) |
| `aimTurnFullAngleRad` | 0.6 | Heading error at which steering reaches full lock (section 4.1) |
| `aimDriveAngleRad` | 0.5 | Heading error within which the car drives forward (section 4.1) |
| `aimBrakeSpeedPxs` | 20 | Forward speed above which a misaligned car brakes (section 4.1) |
| `aimPivotRateRadPerSec` | 2.6 | Turn rate for a stationary car pivoting toward the aim (section 4.1) |
| `botDefaultCount` | 8 | Default bot count in every mode: solo and lobby (host) |
| `botProfiles` | easy / normal / hard | Bot profile parameters (`reactionDelayTicks`, `aimNoiseRad`, `aggression`) |
| `playerColors` | 16 hex colours | Car colours assigned by slot order |
| `carDamageShaderEnabled` | false | Enables the car damage tone filter (section 8.1). Off: damage shows as marks only, paint stays unchanged |
| `carDamageMaxStrength` | 0.85 | Shader strength at full damage (0..1) |
| `carDamageSmoothingRate` | 4 | Damage smoothing rate per second |
| `carDamageScratchCount` | 10 | Number of damage marks per car (scratches, cracks, grime dots) drawn on the car body (section 8.1) |
| `carDamageMarkRamp` | 0.35 | Damage span over which each mark fades from 0 to full alpha (section 8.1) |
| `groundSpeckleCount` | 900 | Static asphalt speckle dots on the arena floor, fixed in world space (section 8.1) |
| `groundPatchCount` | 14 | Slightly lighter or darker asphalt tiles on the floor (section 8.1) |
| `groundCurbWidth` | 16 | Width of the dark curb strip along the inner wall edges (section 8.1) |
| `audioEnabled` | true | Master switch for car audio (section 8.4) |
| `audioMasterVolume` | 0.6 | Master gain for all car audio (section 8.4) |
| `audioOwnCarGain` | 1 | Gain multiplier for the local player's car (section 8.4) |
| `audioOtherCarGain` | 0.35 | Gain multiplier for other cars, before distance fade (section 8.4) |
| `audioHearingRadiusPx` | 1400 | Distance from the local car at which other cars become silent (section 8.4) |
| `audioEngineIdleHz` | 38 | Engine oscillator frequency at rest (section 8.4) |
| `audioEngineMaxHz` | 120 | Engine oscillator frequency at top speed (section 8.4) |
| `audioEngineIdleGain` | 0.18 | Engine gain at rest (section 8.4) |
| `audioEngineMaxGain` | 0.6 | Engine gain at top speed and full throttle (section 8.4) |
| `audioThrottleAttackSeconds` | 0.08 | Time constant for engine throttle rising (section 8.4) |
| `audioThrottleReleaseSeconds` | 0.7 | Time constant for engine throttle falling after release (section 8.4) |
| `audioAccelThreshold` | 0.6 | Throttle above which the acceleration layer starts (section 8.4) |
| `audioAccelMaxGain` | 0.35 | Acceleration layer gain at full throttle (section 8.4) |
| `audioSqueakTurnRate` | 1.6 | Yaw rate in rad/s above which tyre squeal starts (section 8.4) |
| `audioSqueakMaxGain` | 0.45 | Tyre squeal gain at full level (section 8.4) |
| `audioSqueakMinSpeedFraction` | 0.35 | Speed fraction below which no tyre squeal is heard (section 8.4) |
| `audioSqueakFullTurnRate` | 3 | Yaw rate in rad/s at which tyre squeal reaches full gain (section 8.4) |

---

## 10. Game modes

### 10.1 Solo vs CPU
- Host = local device. Human count = 1. Bots = 1–12 (default 3).
- Difficulty: Easy / Normal (default) / Hard (bot profile).
- No network is used. No room code.

### 10.2 Multiplayer (humans only)
- 2–4 humans. Bots = 0 by default.
- Start requires at least 2 human cars.

### 10.3 Mixed
- 1–4 humans plus bots, total cars ≤ 16.
- Start requires at least 1 human and at least 2 cars total.
- Host can set bot count in lobby (0–12).

### 10.4 Crashfest
- Available in solo vs CPU and multiplayer; starts with at least two cars.
- Uses the 1600 × 1200 px arena, with no bills or Home Bases.
- Destruction is permanent. No respawn, match timer, or cash scoring.
- Each attributed kill counts as one kill on the scoreboard. The last surviving car wins; zero survivors is a draw.
- Bots actively attack surviving opponents.

### 10.5 Lobby rules
- Host creates room → 6-character code and QR code shown.
- Host selects the game mode and sets CPU players in multiplayer (range 0..12, default 0); total cars (humans + CPU) must stay ≤ 16.
- Clients join by typing code or scanning QR.
  - Each player picks a name (≤ 16 chars). If left empty, a name is generated as "<Adjective>-<Animal>-<NN>" (e.g. "Awesome-Squirrel-42"), where NN is a two-digit number 10..99; if that exceeds 16 chars the shorter form "<Animal>-<NN>" (e.g. "Squirrel-42") is used; a refresh button next to the name field generates a new name; the host assigns a generated unique name when a client sends an invalid one. Colors are assigned by slot order (no picker in v1).
- Host can kick a player (v1 optional, P4).
- Room locks when match starts. New joins are rejected with `running`.
- Host/join lobby screen exists (P3.2); the match start itself arrives in P3.3+ and the start button stays disabled until then.

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
| G-10 | Crashfest has no bases, bills, timer, or respawns; one survivor wins and simultaneous elimination is a draw. |
| G-11 | Crashfest works in solo and multiplayer, using a 1600 × 1200 px arena. |
