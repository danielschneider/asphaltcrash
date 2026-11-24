# AsphaltCrash – Architecture

Status: draft v1. Derived from `docs/ANALYSIS.md` (decisions D1–D14).
Target: Safari on iPadOS (primary), desktop browsers (secondary, for development).

---

## 1. Architectural drivers
1. **Browser-only, static hosting.** No backend code. Everything ships as static files from GitHub Pages over HTTPS.
2. **iOS Safari limits.** Background suspension, audio gating, viewport quirks, memory and GPU budget, no orientation lock.
3. **One simulation, configurable rules.** Cash Run and Crashfest share the same simulation; solo, multiplayer and mixed rosters use identical game logic.
4. **Authoritative host.** Exactly one simulation instance decides the truth per match.
5. **Separation of concerns.** React never touches per-frame data. Simulation never imports React or Pixi.
6. **Testability.** Simulation, protocol and bots are pure TypeScript with no DOM dependency and run under Vitest in Node.

---

## 2. System context

```
 ┌──────────────────────┐        WebRTC data channel (DTLS/SCTP)        ┌──────────────────────┐
 │  Browser (iPad) HOST │◄─────────────────────────────────────────────►│  Browser (iPad) CLIENT│
 │  authoritative sim   │                                               │  render + input      │
 └──────────┬───────────┘                                               └──────────┬───────────┘
            │  signaling (SDP/ICE only)                                            │
            ▼                                                                      ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 │ PeerJS public signaling cloud  (0.peerjs.com)   +   STUN (no TURN in v1)                 │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
            ▲
            │  static files (HTML/JS/CSS/assets) over HTTPS
 ┌──────────┴───────────┐
 │  GitHub Pages        │
 └──────────────────────┘
```

Game traffic never passes through a server. Signaling traffic is tiny and stops once the data channel is open. Connections that need a TURN relay are not supported in v1 (ADR-011).

---

## 3. Runtime topology

### 3.1 Roles
| Role | Who | Responsibilities |
|------|-----|------------------|
| **Host** | Room creator, or the device in solo mode | Owns the `MatchSimulation`. Runs physics, bots, bills, damage, scoring. Broadcasts snapshots and events. Accepts inputs. |
| **Client** | Joined players (1–3 per room) | Sends input. Runs a local shadow simulation for its own car. Renders interpolated remote state. |
| **Solo host** | Single device, zero remote peers | Same as host, transport is `LocalTransport` (in-memory). |

### 3.2 Who simulates what

| Entity | Host | Client |
|--------|------|--------|
| Own car | Authoritative | Predicted (shadow simulation), corrected by snapshots |
| Remote human car | Authoritative | Interpolated from snapshots |
| Bot car | Authoritative | Interpolated from snapshots |
| Cash bills | Authoritative | Interpolated/static from snapshots |
| Walls and arena | Authoritative | Static local copy (from `start` message seed/layout) |
| Score, timer, health | Authoritative | Received via snapshot and events |

---

## 4. Layered architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ L5 Presentation (React 19)                                             │
│    screens: Start, Lobby, Match HUD, Scoreboard, Settings, Error       │
│    overlays: JoystickPad, RotateHint, ConnectionBanner   │
├────────────────────────────────────────────────────────────────────────┤
│ L4 Application / Session controller                                    │
│    SessionController (state machine: idle→creating→lobby→playing→end)  │
│    MatchController (start/stop, bot slots, mode selection)             │
├────────────────────────────────────────────────────────────────────────┤
│ L3 Game runtime                                                        │
│    Engine (rAF loop, fixed-step accumulator, interpolation clock)      │
│    Input (joystick buffer → InputFrame)                                │
├────────────────────────────────────────────────────────────────────────┤
│ L2 Domain / simulation (pure TypeScript, no DOM)                       │
│    MatchSimulation  →  Physics (Matter.js)  +  Rules (damage, cash,    │
│                        scoring, respawn)  +  Bots (FSM)                │
├────────────────────────────────────────────────────────────────────────┤
│ L1 Networking                                                          │
│    Transport interface → PeerTransport | LocalTransport               │
│    Protocol (encode/decode, versioning), Snapshot buffer, Clock sync   │
├────────────────────────────────────────────────────────────────────────┤
│ L0 Platform                                                            │
│    PixiJS renderer (WebGL2, Canvas fallback), WebRTC, Pointer Events,  │
│    Wake Lock, visibilitychange, sessionStorage, AudioContext           │
└────────────────────────────────────────────────────────────────────────┘
```

Dependency rule: a layer may only depend on layers below it. L2 must not import from L0, L1, L3, L4 or L5. Enforce with an ESLint `no-restricted-imports` rule (see section 12).

---

## 5. Proposed source tree

The README tree is kept as the baseline and extended.

```
asphaltcrash/
├── AGENTS.md
├── README.md
├── docs/
│   ├── ANALYSIS.md
│   ├── ARCHITECTURE.md
│   ├── NETWORK_PROTOCOL.md
│   ├── GAMEPLAY.md
│   └── ROADMAP.md
├── index.html
├── vite.config.ts              # base: '/asphaltcrash/' for GitHub Pages
├── tsconfig.json               # strict: true
├── eslint.config.mjs              # ESLint flat config (not .ts, see section 12)
├── .github/workflows/pages.yml    # only non-TypeScript file, CI/deploy
├── public/
│   └── manifest.webmanifest    # P5
├── src/
│   ├── main.tsx                # React root, mounts App
│   ├── App.tsx                 # screen router only
│   ├── components/             # React UI, no game logic
│   │   ├── lobby/              # StartScreen, LobbyScreen, RoomCode, JoinQr
│   │   ├── hud/                # Hud, Scoreboard, ConnectionBanner, TimerBadge
│   │   ├── controls/           # JoystickPad, RotateHint
│   │   └── common/             # Button, Modal (only if reused)
│   ├── game/
│   │   ├── Engine.ts           # rAF loop, fixed-step accumulator, frame orchestration
│   │   ├── Physics.ts          # Matter.js world wrapper (L2 adapter, see 6.3)
│   │   ├── Renderer.ts         # PixiJS stage, camera, sprite pool (L0)
│   │   ├── Camera.ts           # follow, clamp to arena, zoom limits
│   │   ├── Effects.ts          # smoke, sparks; ParticleContainer pools (L0)
│   │   ├── Entities.ts         # Car, CashBill, HomeBase, Arena (plain data)
│   │   ├── sim/
│   │   │   ├── MatchSimulation.ts  # tick(): inputs → physics → rules → events
│   │   │   ├── Rules.ts        # damage model, cash pickup/delivery, respawn
│   │   │   ├── BillSpawner.ts  # seeded RNG, spawn budget, respawn timer
│   │   │   ├── Scoring.ts      # score and win condition
│   │   │   └── Rng.ts          # seeded PRNG (mulberry32)
│   │   ├── bots/
│   │   │   ├── BotController.ts    # FSM, produces InputFrame
│   │   │   └── BotProfiles.ts      # easy/normal/hard parameters
│   │   ├── input/
│   │   │   ├── InputBuffer.ts      # latest joystick/button state, no React
│   │   │   └── InputFrame.ts       # type + clamp helpers
│   │   └── shadow/
│   │       ├── ShadowCar.ts        # local prediction world (own car only)
│   │       └── Reconciler.ts       # rewind/replay, error smoothing
│   ├── network/
│   │   ├── PeerManager.ts      # PeerJS lifecycle (creates peer, connections)
│   │   ├── transport/
│   │   │   ├── Transport.ts        # interface
│   │   │   ├── PeerTransport.ts    # PeerJS implementation
│   │   │   └── LocalTransport.ts   # in-memory, for solo mode and tests
│   │   ├── protocol/
│   │   │   ├── messages.ts         # message unions, versioning
│   │   │   ├── codec.ts            # encode/decode, quantization
│   │   │   └── validate.ts         # runtime validation of inbound data
│   │   ├── sync/
│   │   │   ├── SnapshotBuffer.ts   # ring buffer, interpolation sampling
│   │   │   └── ClockSync.ts        # RTT and host time offset
│   │   └── room/
│   │       ├── roomCode.ts         # generate/validate codes, PeerJS id mapping
│   │       └── Reconnect.ts        # token storage, rejoin window
│   ├── session/
│   │   ├── SessionController.ts    # state machine across screens
│   │   ├── HostSession.ts          # host-side lobby + match orchestration
│   │   └── ClientSession.ts        # client-side lobby + match orchestration
│   ├── store/
│   │   └── hudStore.ts             # external store for 10 Hz HUD values
│   ├── hooks/                      # useHud, useSession, useJoystick (use* prefix)
│   ├── config/
│   │   ├── gameConfig.ts           # all tunables (GAMEPLAY.md values)
│   │   └── env.ts                  # VITE_* reads, TURN config
│   ├── types/
│   │   ├── game.ts                 # shared domain types
│   │   └── network.ts              # shared network types
│   └── test/
│       ├── fixtures/
│       └── msw/                    # mock handlers for HTTP-level calls (if any)
└── tests/                          # Vitest suites (mirrors src/)
```

Notes:
- `src/game/Entities.ts` and `src/game/sim/*` are L2 domain. They must not import Pixi or Matter types directly except through `Physics.ts`.
- The README tree had no `session/`, `store/`, `hooks/`, `config/`, `network/transport/`, `network/protocol/` or `network/sync/`. These are added because the analysis requires them. The README tree remains valid as the high-level grouping.

---

## 6. Core components

### 6.1 Engine (L3)
- Runs `requestAnimationFrame`.
- Fixed simulation step: `STEP = 1/60 s`. Accumulator pattern: `acc += min(frameDelta, 0.25)`; while `acc >= STEP`: `sim.tick(STEP)`, `acc -= STEP`. Render alpha: `alpha = acc / STEP` after the step loop. Solo `Engine` and host `MatchHost` keep the sim state before and after the last fixed step (`StateInterpolator` in `src/game/sim/`) and render `lerp(prev, curr, alpha)` for positions and shortest-arc angles; hp, flags, cargo and score switch at alpha 0.5; bills come from the nearer state. The sim state is never written by the renderer. Clients still use snapshot interpolation for remote cars (6.7).
- Frame order each rAF:
  1. Read `InputBuffer` (latest values).
  2. Drain network inbox (`SnapshotBuffer.push`, events).
  3. Host: `sim.tick` for each due step, broadcast snapshot every 3rd tick (20 Hz).
  4. Client: `ShadowCar.step` for each due step, `Reconciler.apply` on new authoritative snapshot.
  5. Renderer updates sprites from current state (host: sim; client: interpolated remote + shadow local).
  6. Camera update, effects update.
  7. HUD store push every 6th frame (10 Hz).
- Pause conditions: `document.visibilityState === 'hidden'` → loop stops, host broadcasts `pause` event if it is host (see R-04).
- Delta clamp: frames longer than 250 ms are clamped, so tab resume does not explode the simulation.

### 6.2 MatchSimulation (L2)
Pure class. Public surface:
```ts
interface MatchSimulation {
  readonly tick: number;
  readonly state: MatchState;               // cars, bills, scores, timer
  setInput(carId: CarId, input: InputFrame): void;
  step(dtSeconds: number): SimEvents;       // exactly one fixed step
  snapshot(): MatchSnapshot;                // plain data, serializable
}
```
Step order (fixed, deterministic within host):
1. Apply bot inputs (`BotController.decide` for each bot car, uses state from previous tick).
2. Apply car inputs to Physics (throttle force, steering torque, lateral grip).
3. Physics step (Matter `Engine.update` with fixed delta).
4. Consume collision events (`collisionStart`, `collisionActive` impulse sums).
5. Rules: damage and car destruction. Cash Run respawns destroyed cars; Crashfest permanently eliminates them and ends when one or zero cars remain.
6. Cash Run rules: cash pickup and delivery to the car's own home base.
7. Cash Run BillSpawner: spawn bills when below budget and respawn timer elapsed.
8. Scoring: Cash Run updates timer and score; Crashfest counts attributed kills and ends by elimination.
9. Emit `SimEvents` (pickup, deliver, destroy, respawn, scoreboard change, end).

Rules are side-effect free functions where possible, which makes them unit-testable without Matter.js: `applyDamage(health, impulse, config)`, `canDeliver(car, base)`, `nextSpawnTime(now, config)`.

### 6.3 Physics adapter
`Physics.ts` wraps Matter.js. It owns the `Matter.Engine`, body creation and removal, and translates Matter collision events to `PhysicsContact` plain objects. No other module imports `matter-js`. This keeps the engine swappable (planck.js, Rapier) with the cost of one file.

Engine settings (verified against matter-js 0.20.0 `Engine.create` defaults):
- Gravity must be disabled for top-down play. Default `gravity` is `{x:0, y:1, scale:0.001}`, which pulls every body down. Set `gravity: { x: 0, y: 0, scale: 0 }`. `Engine.create` merges options over defaults, so this must be passed explicitly.
- `positionIterations` default 6, `velocityIterations` default 4, `constraintIterations` default 2. Tune in P1.
- `enableSleeping: false`.
- Fixed step 1/60 s. `Engine.update` warns when delta exceeds 1000/60 ms.
- Substeps 2–4 for fast cars, measured in P1.8. Matter.js `Engine.update` performs no sweep (continuous) collision step, so tunneling must be controlled by speed cap and substeps.

### 6.4 Renderer (L0)
- Single `Application` (PixiJS 8.23.0 pinned at P0). Scene graph:
  ```
  stage
  ├── worldContainer          (camera transform applied here only)
  │   ├── arenaLayer          (static floor, walls, home bases)
  │   ├── billLayer           (pooled sprites)
   │   ├── carLayer            (pooled car containers: body, shadow, name label)
  │   └── effectsLayer        (ParticleContainer for smoke and sparks; capped pool)
  └── (HUD is React DOM, not Pixi)
  ```
- Particles use Pixi's built-in `ParticleContainer` (subpath `pixi.js/particle-container` in 8.x, pipes registered for WebGL, WebGPU and Canvas). No custom emitter is required. Exact class and option names to be confirmed against the 8.23 API when P1.3 is implemented.
- Sprite pooling for bills and effects. No allocation in the frame loop.
- Camera: follows the local player's car (or host's chosen focus in solo). Clamp to arena bounds. Zoom factor range 0.6–1.2 derived from car speed. Zoom out on pinch is optional (P5).
- Resolution: `resolution = min(devicePixelRatio, 2)`, `autoDensity = true`.

### 6.5 Input
- `InputBuffer` holds `{ aimX: -1..1, aimY: -1..1, action: boolean }` (aim clamped to the unit circle) written by pointer events, read by Engine.
- The joystick DOM component writes to the buffer through a ref/callback; it does not set React state on each move.
- Dead zone 0.12. The joystick sends the absolute stick direction as an aim vector. The host converts it to steer and throttle relative to the car heading (`aimDrive.ts`). On touch down, the floating stick anchors at the thumb position within the lower-left control zone.
- Host input for local player is written straight into `sim.setInput`; client input is sent as `InputFrame` at 30 Hz plus immediately on button edge.

### 6.6 Bots
- `BotController` per bot car. Input: read-only snapshot of `MatchState` from the previous tick. Output: `InputFrame`.
- FSM transitions from distance to nearest bill, distance to own home base when carrying cargo, presence of enemy car within attack radius, own health below threshold.
- Attack decisions lead moving targets and score targets by distance, health and wall pressure. Each engagement picks a seeded flank side, with flank strength controlled by the difficulty profile.
- Bot runs only on the host. Clients never simulate bots.
- Profile parameters in `BotProfiles.ts`: `reactionDelayTicks`, `aimNoiseRad`, `aggression`, `flankFactor`.

### 6.7 Networking (L1)

#### Transport interface
```ts
interface Transport {
  readonly role: 'host' | 'client' | 'local';
  send(message: OutboundMessage, channel: 'reliable' | 'unreliable'): void;
  onMessage(handler: (msg: InboundMessage, fromPeerId: PeerId) => void): Unsubscribe;
  onPeerChange(handler: (event: PeerEvent) => void): Unsubscribe;
  close(): void;
}
```
- `PeerTransport`: wraps PeerJS. Host has N connections, client has one connection to host.
- `LocalTransport`: in-memory pair/loop, used in solo and unit tests. Uses the same encode/decode path to catch serialization bugs.

#### Channels
Verified against PeerJS 1.5.5 source (`lib/dataconnection/DataConnection.ts`): the `reliable` flag is a property of the whole `DataConnection`, read from `options.reliable` at construction and sent in the negotiation payload. It is not per message.

Consequence: the reliable and unreliable channels are two separate `DataConnection` objects per remote peer.

| Channel | Connection option | Used for |
|---------|-------------------|----------|
| reliable | `connect(id, { reliable: true, serialization: 'json' })` | lobby, start, end, events, resume, bye, ping/pong |
| unreliable | `connect(id, { reliable: false, serialization: 'json' })` | snapshot, input |

Both are opened by the client on connect, and the host accepts both through the `connection` event. Track them together per peer, and close both on disconnect.

Serialization note: the `json` serializer rejects encoded messages at or above `util.chunkedMTU` bytes and emits `MessageToBig`. The limit is `chunkedMTU` = 16300 bytes (PeerJS 1.5.5 `bundler.mjs`). Snapshots are far below it: about 500 bytes is a bandwidth estimate (NETWORK_PROTOCOL 4.2.3), not an MTU limit. The `binary` serializer is the PeerJS default; choose one serializer for both channels in P2.2 and record it here.

The "unordered, no retransmit" behavior of `reliable: false` is the intended meaning of the flag, but the browser-level delivery semantics on iPadOS are still assumption A-02 (device test in P2.1).

#### Protocol versioning
Every message carries `v: 1`. Host rejects clients with a different `v` with `reject` reason `version`. See `NETWORK_PROTOCOL.md`.

#### Snapshot buffer and interpolation
- Client keeps last 8 snapshots (about 400 ms at 20 Hz).
- Render time = `estimatedHostTime - INTERP_DELAY` (100 ms).
- Interpolate position linearly, angle with shortest-arc lerp.
- If render time is beyond the newest snapshot by more than 200 ms, freeze at newest (no extrapolation for remote cars in v1).

#### Clock sync
Client sends `ping` every 2 s over reliable channel. `pong` returns host time. Client maintains `hostTimeOffset` (median of last 5 samples) and `rtt`. Used for interpolation time and for HUD ping display.

### 6.8 Shadow simulation and reconciliation (own car)
- `ShadowCar` = local Matter world with: own car body, static arena walls, and remote cars as kinematic bodies at their interpolated positions (so the local car can bump into them visually).
- On each input: store `{seq, input, dt}` in pending list. Apply to shadow immediately.
- On authoritative snapshot with `ackSeq` (last input applied by host for this car):
  1. Set shadow body state to host state at `ackSeq`.
  2. Replay pending inputs with `seq > ackSeq`.
  3. Compute position error = replayed shadow position − current shadow position before rewind. If error > 0.5 px, blend displayed position toward the new state over 150 ms. If error > 80 px, hard snap (teleport correction).
- Host applies inputs in arrival order; if an input arrives late it is applied on the next tick (no rollback on host).

### 6.9 Session and lobby (L4)
State machine (`SessionController`):
```
idle ──createRoom──► hosting(lobby) ──startMatch──► playing ──matchEnd──► ended ──backToLobby──► hosting(lobby)
idle ──joinRoom──► joining ──accepted──► joined(lobby) ──start──► playing ──end──► ended ──► joined(lobby)
playingNetwork ──match end (host finish or client end)──► endedNetwork ──Back to lobby (returnToLobby)──► hostingLobby / joinedLobby
endedNetwork ──Leave room (backToIdle)──► idle        (host closes the room; clients get "Host left the room")
any playing ──disconnect(host)──► ended(hostLost)
client playing ──disconnect(self, temporary)──► reconnecting(45 s) ──ok──► playing
                                                                     └─timeout──► ended(disconnected)
```
- Network match end: `MatchHost.finish()` sends `end` (reliable) and calls `onFinished(scores)`. The controller stops the host frame loop and the client `MatchClient`, pushes end scores to `hudStore`, and enters `endedNetwork`. `MatchClient` calls `onEnd` on the same path, so clients leave the running state too. The host stops emitting snapshots after finish. The lobby transport and roster stay open: `returnToLobby()` re-enters `hostingLobby` (host) or `joinedLobby` (client) and the host can start another match. `backToIdle()` is the only path that closes the room.
- Host lobby: list of human players (max 4) with names and colors, game mode, bot count (0 to 4 bots, total cars ≤ 8), start button enabled with at least 1 car (solo) or at least 2 cars (multi). Decision: solo CPU mode allows 1 human + bots; multi requires ≥ 2 humans or 1 human + ≥ 1 bot.
- Host decides arena seed and spawn order; sends in `start`.

### 6.10 React UI (L5)
- `App.tsx` chooses screen from `SessionController` state. No game logic in components.
- Screens: `StartScreen` (Play vs CPU / Host multiplayer / Join with code), `LobbyScreen` (room code, QR, player list, bots slider, start), `MatchScreen` (canvas container, joystick, HUD), `ResultScreen`.
- `MatchScreen` mounts the Pixi canvas inside a `div` ref and calls `Engine.start()` in `useEffect`; unmounts on leave.
- HUD: `useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot)`. Store updates at 10 Hz.
- Component size limit: 300 lines (owner rule). Logic in hooks (`useSession`, `useHud`, `useJoystick`).

---

## 7. Data flow (multiplayer, per frame)

```
Client                                              Host
──────                                              ────
Joystick → InputBuffer
  │ every 33 ms (30 Hz) or edge
   └── input{seq,aimX,aimY,action} ───────────► InputQueue[carId]
  │
  ShadowCar.apply(input) (immediate)                MatchSimulation.step (60 Hz)
  │                                                   │
  │                                                   ├─ bots, physics, rules, spawns
  │                                                   │
  │                                                   every 3rd tick:
  │◄────────────────────── snap{tick,ackSeq,cars,bills,score} (20 Hz, unreliable)
  │ SnapshotBuffer.push                               │
  │ Reconciler (own car)                              │
  │ Interpolator (remote cars, bills)                 │
  │                                                   │ on event:
  │◄────────────────────── ev{pickup|deliver|destroy|respawn} (reliable)
  │ Effects (sparks, smoke) + HUD store
```

---

## 8. Mode composition

| Match rules | Roster | Host transport | Clients | Bots | Arena / outcome |
|--------------|--------|----------------|---------|------|-----------------|
| Cash Run | Solo vs CPU | `LocalTransport` | 0 | 1–7 | 3200 × 2400; timer and cash score |
| Cash Run | Multiplayer or mixed | `PeerTransport` | 1–3 | 0–(16−humans) | 3200 × 2400; timer and cash score |
| Crashfest | Solo vs CPU, multiplayer or mixed | `LocalTransport` or `PeerTransport` | 0–3 | 0–(16−humans) | 1600 × 1200; no bases, bills, timer or respawns; last survivor wins |

Solo mode with a local car: the local car is simulated by the same host instance; no shadow sim is needed because there is no latency.
The host sends `gameMode` in `start.cfg`; clients use it to create the matching arena and rules.

---

## 9. Platform specifics (iPadOS Safari)

| Concern | Mechanism | Where |
|---------|-----------|-------|
| Viewport height | CSS `height: 100dvh` with `100vh` fallback | `index.html` / global CSS |
| Safe areas | `env(safe-area-inset-*)` padding on HUD | CSS |
| Scroll/zoom gestures | `touch-action: none` on game canvas and joystick; lobby content scrolls vertically when it exceeds the viewport; `overscroll-behavior: none` on body; `user-scalable=no` in meta (ignored in some iOS settings, so `touch-action` is the real guard) | CSS, `index.html` |
| Audio unlock | First tap on Start resumes `AudioContext` | `StartScreen` |
| Background suspension | `visibilitychange` pauses loop; host broadcasts pause | `Engine.ts`, `SessionController` |
| Screen sleep | `navigator.wakeLock.request('screen')` if available, released on hide | `session/HostSession.ts` |
| Orientation | No lock on web; portrait shows `RotateHint` | `RotateHint` (CSS media query + `matchMedia`) |
| Memory | Pixi resolution cap, pooled sprites, texture atlas | `Renderer.ts` |
| Storage | `sessionStorage` for reconnection token only | `Reconnect.ts` |
| Hosting | GitHub Pages over HTTPS, no server-side routes | `vite.config.ts`, `pages.yml` |
| Fullscreen | Not relied on. Optional PWA standalone. | P5 |

Items marked "verify on device" in the roadmap must be tested on a real iPad before the feature is accepted.

---

## 10. Configuration
All tunables live in `src/config/gameConfig.ts` as a single typed object (const, no enums). Values are listed in `GAMEPLAY.md` section 9. Network constants (`SNAPSHOT_HZ=20`, `INPUT_HZ=30`, `INTERP_DELAY_MS=100`, `RECONNECT_WINDOW_MS=45000`, `MAX_HUMANS=4`, `MAX_CARS=16`, i.e. `gameConfig.maxCars`) are in the same file.

Environment (build-time, Vite):
| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_BASE_PATH` | Vite `base`, e.g. `/asphaltcrash/` | yes for Pages |
| `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE` | Optional self-hosted PeerServer | no |
| `VITE_TURN_URLS`, `VITE_TURN_USER`, `VITE_TURN_CRED` | Optional TURN | no |

Vite exposes only `VITE_*` variables to the client bundle. Do not put server secrets there.

---

## 11. Build and deployment
- `npm run dev` – Vite dev server. For iPad testing on LAN use `vite --host` and open `https://` via tunnel (WebRTC and Wake Lock need secure context; `http://<lan-ip>` is not a secure context on iOS). Use a tunnel such as the provider of choice, verified at P2.
- `npm run build` – `tsc -b` then `vite build` → `dist/`.
- `npm run test` – Vitest (unit, Node environment for sim/protocol, jsdom for React components).
- GitHub Pages: deployment from `dist/` via GitHub Actions. Workflow file lives in `.github/workflows/pages.yml` (to be created in P0). Pages serves over HTTPS, so device tests against the deployed URL are in a secure context (WebRTC, Wake Lock).
- No client-side routes: Pages returns 404 for unknown paths. Join links use a query parameter (`?join=CODE`), never a path segment.
- Game code is TypeScript only. The GitHub Actions YAML is the only non-TypeScript file expected.
- `index.html` must not reference absolute paths; all asset URLs go through Vite `base`.

---

## 12. Quality gates and enforcement
| Gate | Tool | Rule |
|------|------|------|
| Types | `tsc --noEmit` with `strict: true`, `noUncheckedIndexedAccess: true` | No `any` without comment justification |
| Lint | ESLint with `typescript-eslint`, `react-hooks`, `no-restricted-imports` | L2 must not import `pixi.js`, `matter-js`, `peerjs`, `react` |
| Format | Prettier | Repository default |
| Unit tests | Vitest | Sim rules, codec round trip, bot FSM, reconciler, room code |
| HTTP mocks | msw | Only where HTTP is used (e.g. optional TURN credential fetch). WebRTC is not mockable with msw; use `LocalTransport` instead. |
| Component size | Lint rule or review | Components ≤ 300 lines |
| Device test | Manual checklist in ROADMAP | iPad Safari on Wi-Fi and mobile data |
| Import cycles | `eslint-plugin-import-x` (`import-x/no-cycle`, `import-x/no-duplicates`) | No circular imports between modules; no duplicate import statements |
| Cognitive complexity | `eslint-plugin-sonarjs` (`sonarjs/cognitive-complexity` at 15 for `src/game/sim/**`, `Physics.ts`, `Rules.ts`; off elsewhere) | Strict limit only in deterministic core |
| Component size | ESLint `max-lines` (300, blank lines and comments skipped) on `src/components/**` and `src/hooks/**` | Hard lint error, replaces review-only check |
| Restricted properties | ESLint `no-restricted-properties` | `Math.random`, `Date.now`, `performance.now`, `process.env` forbidden per layer (sim, bots, config, Physics, Rules; `process.env` also in game and components) |
| Enum and React.FC ban | ESLint `no-restricted-syntax` on `src/**` | No `enum` declarations; no `React.FC` / `FC` type references |
| No explicit any | `@typescript-eslint/no-explicit-any` on `src/**` and `tests/**` | Error; any use requires a justification comment |
| Unused code | `knip` (`npm run knip`) | No unused files, exports or dependencies |
| Coverage | `@vitest/coverage-v8` (`npm run test:coverage`) | Reported only; no coverage threshold yet |
| Layer scanner test | `tests/architecture/layers.test.ts` (Vitest) | Scans imports against the layer table in section 3 |
| Config sync test | `tests/docs/configSync.test.ts` (Vitest) | Every `gameConfig` key is documented in GAMEPLAY section 9 or allowlisted; no stale entries |

Not in use:
- `eslint-plugin-boundaries` was skipped: install failed with ETARGET (`@boundaries/config@1.0.3` not found). Layer rules are enforced by `no-restricted-imports` plus the layer scanner test instead.
- `dependency-cruiser` (18.8.0) is installed as a devDependency but not wired into any script or config.

ESLint config format: the config is `eslint.config.mjs`, not `eslint.config.ts`. ESLint 10 needs `jiti` to load TypeScript config files on Node 26, and `jiti` is not an approved dependency (AGENTS 2). The layer rules (`no-restricted-imports`) are defined in `eslint.config.mjs`.

---

## 13. Assumptions and verification status
| ID | Assumption | Status |
|----|------------|--------|
| A-01 | PeerJS public cloud is reachable from iPadOS Safari and supports data channels. | Not verified on device (P2.6). Unit tests use fake peers only. |
| A-02 | PeerJS `reliable: false` yields unordered, non-retransmitted delivery on iPadOS Safari. Source confirms the flag is per connection (PeerJS 1.5.5). | Partly verified (source). Device test P2.1 |
| A-03 | `navigator.wakeLock` is available on iPadOS 16.4+. | To verify on device |
| A-04 | `100dvh` is supported on target iPadOS version. | To verify on device |
| A-05 | Matter.js 60 Hz fixed step with 2–4 substeps is stable for 4 fast cars. | Partly measured: sim step 0.02 ms mean desktop Node (4 cars); substep tunneling not yet tested (P1.8) |
| A-06 | PixiJS v8 WebGL2 on iPad maintains 60 FPS with 8 cars, 12 bills and effects. | Pending: not measured on desktop headless; device P1.9 |
| A-07 | Matter.js contact impulse reading is available via `collisionActive` pairs. | Workaround: impulse derived from normal-velocity change times reduced mass (Matter 0.20.0 pair has no impulse field, verified in build/matter.js). Device/feel check P1.7 pending |
| A-09 | Matter.js has no continuous collision detection in `Engine.update`. | Partly verified (engine source has no sweep step); no sweep in Engine.update; tunneling test P1.8 pending |
| A-10 | PixiJS 8.23.0 `ParticleContainer` is available for smoke and sparks. | Verified (package subpath exports and pipe registration in source) |
| A-08 | Browsers do not allow orientation lock; landscape enforced only by UI hint. | Known platform behavior |
| A-11 | Snapshot JSON worst case about 667 bytes (8 cars, 12 bills) vs 500 byte estimate in NETWORK_PROTOCOL 4.2.3. | Owner decision needed |

---

## 14. Decision records (summary)
| ADR | Decision | Status |
|-----|----------|--------|
| ADR-001 | Host-authoritative star over mesh and lockstep | Accepted |
| ADR-002 | PeerJS as transport (README) | Accepted |
| ADR-003 | Matter.js 0.20.0 as physics (README) with Physics adapter, gravity disabled | Accepted |
| ADR-004 | PixiJS 8.23.0 as renderer (README), `ParticleContainer` for effects | Accepted |
| ADR-013 | Two PeerJS `DataConnection`s per peer: reliable and unreliable | Accepted (source-verified) |
| ADR-005 | React 19 overlays, HUD at 10 Hz via external store | Accepted |
| ADR-006 | Snapshot interpolation for remote entities, local shadow sim for own car | Accepted, prototype gate at P3 |
| ADR-007 | Rule-based FSM bots on host | Accepted |
| ADR-008 | Default 4 human players, configurable via `maxHumans`, not hard-locked (README said 2–5) | Accepted (owner Q-01) |
| ADR-009 | Host loss ends match in v1 | Accepted |
| ADR-010 | 45 s reconnect window with token in `sessionStorage` | Accepted |
| ADR-011 | STUN only in v1; TURN postponed. Optional TURN build-time env kept as a hook, not used. Own free relay server only if P2.6 shows real failures. | Accepted (owner Q-02) |
| ADR-012 | No backend in v1 | Accepted |
| ADR-014 | Exact pinned versions: react 19.3.1, react-dom 19.3.1, pixi.js 8.23.0, matter-js 0.20.0, @types/matter-js 0.20.0, @types/react 19.3.0, @types/react-dom 19.3.0, typescript 5.9.3 (typescript-eslint 8.73.0 peer requires typescript <6.1), vite 8.3.8, @vitejs/plugin-react 6.3.0, vitest 5.1.1, jsdom 31.0.1, msw 3.0.7, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, eslint 10.15.0, typescript-eslint 8.73.0, eslint-plugin-react-hooks 7.1.1, prettier 3.10.1. Node v26.13.1, npm 12.0.2 | Accepted |
| ADR-015 | Node 26 / ESLint 10: `eslint.config.mjs` instead of `.ts` (jiti not approved) | Accepted |
| ADR-016 | Transport seam: `LocalTransport` loopback through JSON codec; `PeerTransport` stub (throws until P2) | Accepted |
| ADR-017 | Simulation seam: `MatchSimulation.step()` takes no args (fixed step), `setInput(pid)`, `MatchSnapshot` uses full names mapped to wire names in codec only | Accepted |
| ADR-018 | Physics seam: only `Physics.ts` imports matter-js, plain contact events, impulse derived | Accepted |
| ADR-019 | Renderer seam: `WorldView` input; `ParticleContainer` imported from `pixi.js` main entry (subpath has no .d.ts) | Accepted |
| ADR-020 | `SessionController`: solo states; network lobby and match states; `endedNetwork` returns to the lobby (`returnToLobby`) and keeps the room open | Accepted |
| ADR-021 | Static checks: import-x (cycles, duplicates), sonarjs (complexity in sim core), knip (unused code), coverage-v8 (report only, no threshold); eslint-plugin-boundaries skipped (ETARGET `@boundaries/config@1.0.3`), dependency-cruiser installed but unused | Accepted |
| ADR-022 | PeerJS 1.5.5 pinned; injected PeerFactory; one reliable plus one unreliable DataConnection per peer; JSON serialization; handshake in src/network/session | Accepted |
