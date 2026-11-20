# AsphaltCrash – Solution Space Analysis

Status: draft v1
Source of requirements: `README.md` plus the additional requirements stated by the project owner (listed in section 1).

---

## 1. Requirements

### 1.1 Stated in README.md
| ID | Requirement |
|----|-------------|
| R-01 | Top-down 2D arena car combat with cash collection. |
| R-02 | Controlled exclusively by an on-screen touch joystick. Players cannot leave vehicles. |
| R-03 | Cash bills spawn dynamically, are collected on contact and delivered to a rectangular Home Base near the player's spawn. |
| R-04 | Arena may be larger than the viewport: smooth camera follow, pan and zoom. |
| R-05 | Clean vector/sprite art, not pixel art; particle effects (exhaust, sparks). |
| R-06 | 100% client-side static app, hosted on GitHub Pages. No custom backend. |
| R-07 | Multiplayer via WebRTC using `peerjs`; PeerJS public signaling server used only for the handshake. |
| R-08 | Peers find each other via out-of-band shared IDs (room codes or QR codes). |
| R-09 | Synchronize transform, health/damage, cash pickups and scores across peers. |
| R-10 | React for UI overlays; simulation and rendering in a separate `requestAnimationFrame` loop. |
| R-11 | TypeScript (strict), Vite, `react`, `peerjs`, `matter-js`, `pixi.js`. |

### 1.2 Additional requirements from the project owner
| ID | Requirement | Interpretation |
|----|-------------|----------------|
| O-01 | Playable on an iOS tablet in the browser (Safari / iPadOS). | Safari is the binding constraint for every technical decision. Chrome on iOS is WebKit underneath and inherits the same limits. |
| O-02 | Multiplayer, up to 4 human players. | Hard cap: 4 human players per match. |
| O-03 | Players "fight" against each other. | Combat (ramming, damage, destruction) is a core mechanic, not only a cash race. |
| O-04 | CPU mode when no other players are available. | Bot cars controlled by the game, usable in solo mode. |
| O-05 | Combination of humans and CPU players is possible. | Bots fill free slots in multiplayer matches. Human count and bot count are independent. |
| O-06 | Detailed solution-space analysis, detailed architecture, MD documents, AGENTS.md. | Delivered as the files under `docs/` and `AGENTS.md`. |

### 1.3 Conflicts and ambiguities found in the inputs (must be resolved)
| # | Source | Conflict | Resolution used in this analysis |
|---|--------|----------|----------------------------------|
| C-01 | README section 1 says "2–5 players". Owner says "up to 4". | Player cap differs. | **Cap = 4 human players.** README line must be updated (see ROADMAP task T-00). Owner to confirm. |
| C-02 | README section 2 says "mesh or host-authoritative topology". | Two different topologies. | **Host-authoritative star.** Reason in section 3.1. |
| C-03 | README says "PeerJS public signaling server only for ICE/SDP". | Public PeerJS cloud has no SLA; mobile networks often need TURN relay. | Accepted for v1 with a TURN fallback path (section 3.4). Risk R-03. |
| C-04 | README section 1 says "Players cannot exit their vehicles" and "Home Base near spawn/joystick area". | Neutral. | Adopted as stated. |
| C-05 | README does not define win condition, scoring, damage numbers, bill count, match length. | Gaps. | Defined as initial values in `GAMEPLAY.md`, all marked tunable. |
| C-06 | Owner wants "fight" plus cash. Win condition unspecified. | Gap. | Proposed in `GAMEPLAY.md`; owner to confirm. |
| C-07 | A user-level test rule names a workspace path that is not this repository. | That path is a different workspace than `D:\privat\asphaltcrash`. | Not applied here. Owner to confirm whether the rule should apply to this repo. |

---

## 2. Solution space dimensions

The problem decomposes into independent decision dimensions. Each dimension lists the options considered. Section 3 evaluates them; section 4 gives the chosen combination.

| Dim | Dimension | Options |
|-----|-----------|---------|
| D1 | Network topology | Full mesh (peer-authoritative), lockstep mesh, host-authoritative star, dedicated server |
| D2 | Simulation authority | Each client simulates everything, host simulates, per-car ownership |
| D3 | Sync model | Lockstep input exchange, state snapshots + interpolation, snapshots + client prediction, delta compression |
| D4 | Transport | Raw WebRTC with own signaling, PeerJS, Trystero, WebSocket relay, third-party realtime backend |
| D5 | Signaling and discovery | PeerJS cloud, self-hosted PeerServer, serverless (Trystero strategies), QR/room code exchange |
| D6 | NAT traversal | STUN only, STUN + TURN, TURN only |
| D7 | Physics engine | Matter.js, planck.js (Box2D port), Rapier (WASM), custom arcade physics |
| D8 | Renderer | PixiJS v8, Phaser 3 (with Matter), Canvas 2D, Three.js orthographic |
| D9 | UI layer | React overlays, plain DOM, Preact |
| D10 | CPU opponents | Rule-based state machine on host, A* grid pathfinding, utility AI, ML policy |
| D11 | Local control | Virtual joystick only, joystick plus buttons, tilt (gyro) |
| D12 | Packaging | Plain static SPA, PWA (manifest + service worker), Capacitor native wrapper |
| D13 | Host loss handling | End match, host migration, dedicated server fallback |
| D14 | Reconnection | None, same-slot rejoin with token, state transfer |

---

## 3. Evaluation per dimension

### 3.1 D1/D2 – Topology and authority

**A. Full mesh with lockstep simulation.** All peers run identical deterministic simulation and exchange only inputs per frame.
- Pro: minimal bandwidth, no authority, no cheating from a host.
- Con: requires bit-identical physics on all devices. Matter.js uses floating-point math, `Math.*` functions differ between JavaScriptCore (iOS) and V8 (Chrome/Android), and iPad vs desktop differ. Any drift desyncs the match permanently. Lockstep also makes every peer's latency the match's latency and stalls on any dropped peer.
- Verdict: **rejected** (unless physics is replaced by fixed-point deterministic code, which is high cost).

**B. Full mesh, peer-authoritative per car.** Each driver authoritative for its own car; collisions resolved by the peer owning the faster/hitting car.
- Pro: low latency for own car, no host bottleneck.
- Con: collisions between two remote cars need arbitration; disagreements produce visible "teleports" and double-counted damage. Scoring and bill pickup races need a tie-breaker authority anyway.
- Verdict: **rejected for v1**. Complexity exceeds benefit with at most 4 players.

**C. Host-authoritative star (chosen).** One peer (the room creator, or the local device in solo mode) runs the authoritative simulation, including all bots. Other peers send inputs and render received snapshots.
- Pro: single source of truth for physics, damage, bills and score. Bots run on the host with the same code path as humans. Solo mode is the same code with zero remote peers. Upload load on the host is small (max 3 remote clients, about 4 KB/s each, see `NETWORK_PROTOCOL.md`).
- Con: host cheating is possible (acceptable for a casual game between known players). Host device must stay awake and foregrounded. Host departure ends the match in v1 (D13).
- Verdict: **chosen**.

**D. Dedicated headless server (Node/Deno, WebSocket).**
- Pro: best reliability, no host-device dependency, anti-cheat possible.
- Con: violates R-06 (no backend). Also violates the "zero custom backend" intent of the README.
- Verdict: **rejected** by constraint. Documented as the upgrade path if R-06 is relaxed (ROADMAP phase P7).

### 3.2 D3 – Sync model

**Lockstep input exchange** – requires determinism; rejected with A.

**Snapshot + interpolation for remote cars (chosen for remote entities).** Host sends snapshots at 20 Hz. Clients render remote cars about 100 ms in the past, interpolating between the two snapshots bracketing that time.
- Pro: simple, robust, tolerant of packet loss and jitter, no physics on clients for remote cars.
- Con: remote cars appear 100 ms+ late. Acceptable for opponents, tolerable for ramming if the displayed collision is shown from the host's authoritative result.

**Client-side prediction for the local car (chosen for own car, see 3.2.1).**

**Delta compression.** Not in v1. Snapshot size is small enough (about 200 bytes for 8 cars and 12 bills). Revisit only if measured bandwidth exceeds 15 KB/s per client.

#### 3.2.1 Own-car latency
Own car input at 100–150 ms latency feels unplayable. Options:
1. **Pure interpolation for own car too.** Simple, but steering lag is a known UX failure in driving games.
2. **Local shadow simulation (chosen).** Client runs a local Matter.js world with only the local car, plus static walls and last-known opponent positions as kinematic obstacles. It applies local input immediately. When an authoritative snapshot arrives for its own car, it rewinds to the snapshot, replays unacknowledged inputs, and blends the error over about 150 ms (error smoothing, not a hard snap).
3. **Pure extrapolation with dead reckoning.** Less accurate under collisions.

Option 2 is the only one that feels right at 100 ms RTT. It is the most complex piece of the networking layer and is marked as **prototype first** in ROADMAP phase P3. Fallback if the prototype fails: option 1 with a visible "ping" indicator.

### 3.3 D4/D5 – Transport and signaling

**Raw WebRTC with own signaling.** Requires a signaling server, so rejected by R-06 unless we use a public one ourselves.

**PeerJS (chosen, per README R-07).**
- Pro: wraps `RTCPeerConnection`, handles data channels, gives readable peer IDs, works in Safari/iOS, MIT licensed.
- Con: the public cloud server (`0.peerjs.com`) has no SLA and rate limits. Peer IDs are unauthenticated: anyone who knows a room code can attempt to join (acceptable, see R-08 and section 5 risks).
- Verified against PeerJS 1.5.5 source: `reliable` is set per `DataConnection`, not per message. Two connections per peer are needed (see ARCHITECTURE 6.7).

**Trystero (alternative).** Serverless WebRTC with signaling over public relays (BitTorrent trackers, Nostr, MQTT). Removes the PeerJS cloud dependency but the relays are third-party and their availability varies. Kept as fallback behind the same `Transport` interface (see ARCHITECTURE section 6).

**Third-party realtime (Firebase, Supabase, Ably, PartyKit).** These are backends. Rejected by R-06 spirit. Not evaluated further.

**Discovery (D5).** Room codes: host's PeerJS ID is `asph-` plus a 6-character code from an unambiguous alphabet (no `0/O/1/I/L`). Clients connect to `asph-<code>`. QR code encodes the URL `https://<pages>/?join=<code>`. No discovery server beyond PeerJS signaling is needed. Code collision on creation is handled by retry.

### 3.4 D6 – NAT traversal

- **STUN only:** works for many home Wi-Fi setups. Fails frequently on cellular (CGNAT) and corporate networks. An iPad on mobile data is a realistic test case.
- **STUN only (chosen for v1, owner decision Q-02):** public STUN, no TURN. Own free relay server postponed; revisit only if P2.6 shows real failures on mobile data.
- Without TURN, a match between two networks that cannot traverse NAT fails. The app must show a clear "connection failed, try another network" message (GAMEPLAY/ROADMAP P4.7, acceptance G-08).

### 3.5 D7 – Physics engine

| Engine | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Matter.js** (README) | Pure JS, simple API, good 2D rigid bodies, sensors, collision events, widely used. | No continuous collision detection (fast thin bodies can tunnel). Not deterministic across platforms (irrelevant with host authority). Mediocre stacking, not needed here. | **Chosen** (README). Mitigate tunneling with speed cap and substeps. |
| planck.js | Box2D port, more robust contacts, CCD available. | Smaller community, less documentation for top-down car tricks. | Alternative if Matter tunneling or contact jitter becomes a problem. |
| Rapier 2D (WASM) | Fast, robust, CCD. | WASM loading adds startup cost on iOS. More integration work. | Alternative, not chosen for v1. |
| Custom arcade physics | Full control, trivially fast. | Collision response and wall handling must be built and tested from scratch. | Rejected for v1. |

Top-down car technique (applies to any engine):
- Car = one dynamic rectangle body (about 48×24 px) with `frictionAir` tuned for rolling resistance.
- Each step, decompose velocity into forward and lateral components relative to the car angle. Remove most of the lateral component (lateral grip factor 0.85–0.95) to prevent drifting like a box. Apply throttle as force along the forward axis. Steering rotates the target angle or applies torque proportional to forward speed.
- Impact damage uses the collision impulse magnitude (`pair.collision` and contact impulse via `collisionStart`/`afterUpdate` deltas), not raw speed, so that scraping walls does not destroy cars.

### 3.6 D8 – Renderer

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **PixiJS 8.23.0** (README) | WebGL2 with Canvas fallback, fast sprite batching, containers for camera transforms, built-in `ParticleContainer` for effects. | Camera and HUD separation is manual. | **Chosen** (README). |
| Phaser 3 | Includes Matter.js integration, camera, particles, scenes. | Opinionated framework, duplicates what README architecture wants React to own, larger bundle. | Alternative if integration cost of Pixi + Matter is too high. Revisit at P1 gate. |
| Canvas 2D | No dependency, simple. | Slow with many particles on older iPads, no batching. | Rejected. |
| Three.js orthographic | 3D-capable. | Overkill for 2D. | Rejected. |

Renderer rules for iOS:
- Cap renderer resolution at `min(devicePixelRatio, 2)`.
- Texture atlas with a single sheet. Keep total GPU memory under about 64 MB (Safari tab limits are stricter than desktop).
- Use `antialias` only if frame time budget allows (decide at P1 with real iPad measurement).

### 3.7 D9 – UI layer
React 19 for lobby, room code, QR display, scoreboard, pause/settings and the joystick DOM element. HUD values (time, score, health) pushed from the simulation at **10 Hz** via an external store (`useSyncExternalStore`), not per frame. The joystick emits to a non-React input buffer; React does not re-render on every touch move.

Plain DOM and Preact were considered. React is kept because the README and the owner's TypeScript/React rules assume it.

### 3.8 D10 – CPU opponents

- **Rule-based FSM on host (chosen).** States: `SeekBill`, `DeliverCash`, `Attack`, `Evade`, `Recover`. Input is produced as the same struct the joystick produces. Deterministic enough, cheap, tunable, testable with unit tests.
- **A\* on a grid.** Needed only if arena has complex static obstacles. Start without it; add in P5 if bots get stuck.
- **Utility AI.** Better behavior, more tuning effort. Post-v1.
- **ML policy.** Out of scope.

Bot difficulty levels: `easy`, `normal`, `hard` as parameters (reaction delay, aim error, steering precision), not separate code.

### 3.9 D11 – Controls
- **Virtual joystick only (README).** Left thumb: analog direction. Mapping: up = throttle, down = brake/reverse, left/right = steer. Joystick is a DOM/Pointer element in a broad lower-left touch zone and floats to the initial thumb position.
- **Second control: boost/handbrake button (right thumb).** Recommended because drifting and handbrake are key for fighting. Not part of README; flagged as Q-04.
- **Tilt/gyro.** Requires `DeviceOrientationEvent.requestPermission()` on iOS. Rejected for v1.

Multi-touch works on iPad Safari. Touch handling uses Pointer Events with `setPointerCapture`.

### 3.10 D12 – Packaging
- **Static SPA (chosen for v1).** Vite build, GitHub Pages, `base` set to repository name.
- **PWA manifest (v1 nice-to-have).** `display: standalone` via "Add to Home Screen" removes Safari browser chrome, gives more play area and fullscreen-like behavior on iPad. Service worker caching is optional; careful with stale caches during development.
- **Capacitor native wrapper.** Rejected: owner wants browser.

### 3.11 D13 – Host loss
- **End the match (chosen for v1).** Remaining clients see "Host disconnected" and return to the lobby screen with a retry button.
- **Host migration.** Requires state transfer and re-election; post-v1 (P6).
- **Dedicated server.** See 3.1 D.

### 3.12 D14 – Reconnection
- v1: on temporary disconnect, the client stores `{roomCode, playerToken}` in `sessionStorage` and re-joins within 45 seconds. The host keeps the car slot reserved, the car becomes idle (no input) and is vulnerable. After 45 s the slot is released and the car becomes a bot until the player returns or the match ends. Rationale: iPad Safari suspends backgrounded tabs and this is the most common disconnect cause.

---

## 4. Chosen combination (recommended solution)

| Dim | Choice |
|-----|--------|
| D1/D2 | Host-authoritative star, host = room creator or local solo device |
| D3 | 20 Hz snapshots (unreliable, unordered), remote interpolation at 100 ms, own-car local shadow simulation with reconciliation |
| D4 | PeerJS |
| D5 | Room code `asph-XXXXXX` as PeerJS ID, QR with `?join=` |
| D6 | STUN only (no TURN in v1, Q-02) |
| D7 | Matter.js with fixed 60 Hz step and substeps |
| D8 | PixiJS 8.23.0 with a single camera container and `ParticleContainer` effects |
| D9 | React 19 overlays, HUD at 10 Hz |
| D10 | Rule-based FSM bots on host |
| D11 | Left-side virtual joystick, right-side action button (boost/handbrake) |
| D12 | Vite SPA on GitHub Pages, optional PWA manifest |
| D13 | End match on host loss in v1 |
| D14 | 45 s reconnect window with token |

Modes supported by this combination:
- **Solo vs CPU:** host = local device, 0 remote peers, N bots.
- **Multiplayer 2–4 humans:** host + up to 3 remote peers, bots optional to fill slots.
- **Mixed:** any number of humans from 1 to 4 plus bots up to the total car cap (8).

All three modes use the same simulation code. Only the transport differs (`LocalTransport` or `PeerTransport`).

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-01 | Own-car lag feels bad at 100+ ms RTT | High | High | Local shadow simulation (3.2.1); prototype gate in P3; fallback option 1 with ping display. |
| R-02 | PeerJS cloud signaling unavailable or rate-limited | Medium | High | Transport interface; self-hosted PeerServer option; Trystero fallback. |
| R-03 | Connection fails on cellular / CGNAT without TURN | High | High | Optional TURN config; clear error message; acceptance test on mobile data. |
| R-04 | iPad Safari suspends backgrounded tab → disconnect or frozen host | High | High | Pause on `visibilitychange`; Wake Lock API where available (iOS 16.4+); reconnect token; host-loss message. Document host-must-stay-foreground rule. |
| R-05 | Matter.js tunneling at high speed | Medium | Medium | Speed cap, 2–4 substeps, thick walls, measure in P1. |
| R-06 | Matter.js car drift / jitter feels wrong | Medium | Medium | Lateral friction model (3.5), tuned in P1 with a test scene. |
| R-07 | Performance on older iPads with many particles | Medium | Medium | Particle budget (GAMEPLAY 8.3), resolution cap, frame time HUD in debug mode. |
| R-08 | Host cheating | Low (casual game) | Low | Accepted. Documented. |
| R-09 | Room code guessed by strangers | Low | Low | 6 chars from 30-char alphabet ≈ 7×10^8 combinations; room lock once match starts; optional "lock room" button. |
| R-10 | iOS audio requires user gesture | High | Low | Start-screen tap unlocks `AudioContext`. |
| R-11 | Browser viewport jumps (Safari toolbar) | High | Medium | `100dvh`, `touch-action: none`, `overscroll-behavior: none`, safe-area insets. |
| R-12 | Scope creep (weapons, power-ups, map editor) | High | High | Non-goals list in ROADMAP. |

---

## 6. Rejected or deferred features (explicit non-goals for v1)
- Weapons, power-ups, pickups other than cash.
- More than 4 human players.
- Spectators, late join during a running match.
- Accounts, persistence, leaderboards across sessions.
- Host migration.
- Native app wrapper.
- Desktop keyboard controls (may be added later; not required).

---

## 7. Open questions for the owner

| ID | Question | Recommended default |
|----|----------|--------------------|
| Q-01 | Player cap: 4 (your request) or 5 (README)? | **Decided: default 4, configurable (`maxHumans`), not hard-locked.** |
| Q-02 | TURN relay: free service with public credential, or STUN only? | **Decided: STUN only in v1, no TURN. Own free relay server postponed; revisit only if P2.6 shows real failures.** |
| Q-03 | Win condition: timer with highest cash, or first to target cash, or elimination count? | **Decided: timer, 180 s default and configurable, highest score wins.** |
| Q-04 | Add a second button (boost/handbrake) to the right thumb? | **Decided: yes.** |
| Q-05 | Is the host allowed to be a phone, or tablet only? | Any device with a modern browser; tablet recommended. |
| Q-06 | Solo CPU mode difficulty default? | Normal |
| Q-07 | Is landscape-only acceptable? (Browsers cannot lock orientation on iOS.) | **Decided: landscape only, with "rotate device" overlay in portrait.** |
| Q-08 | Should `Unittests.md` workspace path rule apply to this repo? (C-07) | No |

---

## 8. Verification plan for the analysis itself
Each decision that depends on an external fact must be verified before it is coded:
- PeerJS version API and data channel options: read docs of the pinned version.
- Safari/iPadOS support for Wake Lock, `100dvh`, Pointer Events and `visibilitychange` behavior: check current WebKit/Can I Use data on the target iPadOS version.
- Matter.js tunneling threshold and substep count: measured in a P1 test scene.
- Real network test: match on iPad over mobile data with and without TURN.

Facts not verified at the time of writing are marked as assumptions in `ARCHITECTURE.md` section 13.
