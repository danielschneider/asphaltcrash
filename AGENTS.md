# AGENTS.md – AsphaltCrash

Instructions for AI coding agents working in this repository.
Required reading before any change: this file only. Read the other docs on demand, using the table below and the module map in section 3.1.

| Read when touching | Read |
|--------------------|------|
| Network messages, validation, codec, handshake | `docs/NETWORK_PROTOCOL.md` sections 4, 7, 9 |
| Gameplay rules, tunable values | `docs/GAMEPLAY.md` section 9 and `src/config/gameConfig.ts` |
| Layering, new module, folder placement | `docs/ARCHITECTURE.md` sections 4, 5, 12 |
| Physics (Matter.js adapter, handling) | `docs/ARCHITECTURE.md` section 6.3 |
| Session and screen flow | `docs/ARCHITECTURE.md` section 6.9 |
| iPad Safari limits | `docs/ARCHITECTURE.md` section 9 |
| Roadmap task status, exit gates, device checks | `docs/ROADMAP.md` |
| Decisions, assumptions, scope | `docs/ANALYSIS.md`, `docs/ARCHITECTURE.md` sections 13, 14 |

---

## 1. Project in one paragraph
AsphaltCrash is a top-down 2D car combat and cash-collection arena game for iPad Safari. Up to 4 human players connect via WebRTC (PeerJS). Bots (CPU) fill slots and provide a solo mode. The host browser runs the authoritative simulation. Deployed as static files on GitHub Pages. No backend.

---

## 2. Non-negotiable constraints
1. No backend code. No server process in the repo. Static hosting only.
2. Target is iPadOS Safari. Every feature must be considered against Safari limits (see ARCHITECTURE section 9).
3. Host-authoritative simulation. Clients never decide physics, damage, bills, or score.
4. Default 4 human players, configurable via `maxHumans` in `gameConfig.ts`. Do not hard-lock the value. Max 16 cars total (4 humans + up to 12 CPU).
5. Libraries: `react`, `react-dom`, `peerjs` (1.5.5), `matter-js` (0.20.0), `pixi.js` (8.23.0), `vite`, TypeScript. Pin exact versions at P0. Adding a dependency requires a note in ANALYSIS or ARCHITECTURE and owner approval.
5a. The entire game is TypeScript. The only expected non-TypeScript file is the GitHub Actions workflow YAML.
5b. Hosting is GitHub Pages only. No client-side routes; join links use `?join=CODE`.
6. Do not generate the roadmap phases out of order. Respect exit gates in `docs/ROADMAP.md`.
7. Do not edit `.kilo/agent-manager.json`.

---

## 3. Layer rules (enforced by ESLint once P0 is done)

| Layer | Path | May import | Must not import |
|-------|------|-----------|-----------------|
| Layer | Path | May import | Must not import |
|-------|------|-----------|-----------------|
| L2 domain | `src/game/sim/**`, `src/game/Rules.ts`, `src/game/WorldView.ts`, `src/game/bots/**`, `src/types/**`, `src/config/**` | TypeScript only, other L2 modules | `react`, `pixi.js`, `matter-js`, `peerjs`, `src/network/**`, `src/components/**` |
| Physics adapter | `src/game/Physics.ts`, `src/game/physics/**` | `matter-js`, L2 | `react`, `pixi.js`, `peerjs`, `src/network/**`, `src/components/**` |
| L0 renderer | `src/game/Renderer.ts`, `src/game/Effects.ts`, `src/game/Camera.ts`, `src/game/render/**` | `pixi.js`, L2 types | `react`, `matter-js`, `peerjs`, `src/network/**`, `src/components/**` |
| L1 network | `src/network/**` | `peerjs`, L2 types, `src/types/network.ts` | `react`, `pixi.js`, `matter-js`, `src/components/**` |
| L3 runtime | `src/game/Engine.ts`, `src/game/input/**` | L2, L1 interfaces, L0 renderer | `react`, `pixi.js`, `matter-js`, `peerjs`, `src/components/**` |
| L4 session | `src/session/**` | L3, L1 | `pixi.js`, `matter-js`, `peerjs` |
| L5 UI | `src/components/**`, `src/hooks/**`, `src/App.tsx`, `src/main.tsx` | React, L4, `src/store/**` | `matter-js`, `peerjs`, `src/game/sim/**`, `src/game/Engine.ts` |

Enforcement: `eslint.config.mjs` (`LAYER_FILES`, `no-restricted-imports`) and `tests/architecture/layers.test.ts` check only the files listed above. Unclassified files (`src/game/audio/**`, `src/game/shaders/**`, `src/game/ground/**`, `src/game/arena.ts`, `carDesign.ts`, `carLabel.ts`) are covered only by the global ESLint rule: no `pixi.js`, `matter-js` or `peerjs` imports anywhere in `src/**` outside the layers that allow them.

Keep the dependency direction downward. If a feature needs an upward dependency, add an interface in a lower layer and inject the implementation.

### 3.1 Module map

Symptom or feature to starting files and tests. Paths verified against the tree; "(none)" = no test.

| Symptom / feature | Source file(s) | Tests |
|-------------------|----------------|-------|
| Car handling, steering, walls | `src/game/Physics.ts`, `src/game/physics/*`, `src/game/sim/aimDrive.ts` | `tests/game/Physics.test.ts`, `tests/game/physics/vec.test.ts` |
| Collision damage, kills | `src/game/sim/damageResolver.ts`, `src/game/Rules.ts` (`applyDamage`, attribution) | `tests/game/sim/carDamage.test.ts`, `tests/game/Rules.test.ts` |
| Respawn, destruction | `src/game/sim/respawn.ts`, `src/game/sim/CarState.ts` | `tests/game/sim/CarState.test.ts`, `tests/game/sim/MatchSimulation.test.ts` |
| Bills, cargo, delivery | `src/game/sim/billFlow.ts`, `src/game/sim/BillSpawner.ts`, `src/game/Rules.ts` (`canDeliver`, `canPickUp`) | `tests/game/sim/BillSpawner.test.ts`, `tests/game/sim/MatchSimulation.test.ts` |
| Match timer, scores, winners | `src/game/sim/Scoring.ts`, `src/game/WorldView.ts` (`resolveWinners`), `src/game/sim/MatchSimulation.ts` | `tests/game/sim/Scoring.test.ts` |
| Simulation step order | `src/game/sim/MatchSimulation.ts`, `src/game/sim/matchConstants.ts`, `src/game/sim/time.ts` | `tests/game/sim/MatchSimulation.test.ts`, `tests/game/sim/time.test.ts` |
| Determinism (golden digest) | `src/game/sim/MatchSimulation.ts`, `src/game/sim/Rng.ts` | `tests/game/sim/MatchSimulationDeterminism.test.ts` (update digest only for intended behaviour change) |
| Bots | `src/game/bots/*`, `src/game/sim/botPerception.ts` | `tests/game/bots/BotController.test.ts`, `tests/game/bots/BotProfiles.test.ts` |
| Rendering, sprites, particles | `src/game/Renderer.ts`, `src/game/render/*`, `src/game/Effects.ts` | `tests/game/Effects.test.ts`, `tests/session/matchRenderer.test.ts` |
| Camera | `src/game/Camera.ts` | `tests/game/Camera.test.ts` |
| Car damage visuals | `src/game/shaders/*` | `tests/game/shaders/carDamage.test.ts` |
| Audio | `src/game/audio/*` | `tests/game/audio/audioMath.test.ts` |
| Input, joystick, keyboard | `src/game/input/*`, `src/hooks/useJoystick.ts`, `src/hooks/useKeyboardInput.ts`, `src/components/controls/JoystickPad.tsx` | `tests/game/input/InputFrame.test.ts`, `tests/hooks/useJoystick.test.ts` (keyboard: none) |
| Game loop, fixed step | `src/game/Engine.ts` | `tests/game/Engine.test.ts` |
| Arena layout, ground | `src/game/arena.ts`, `src/game/ground/groundLayout.ts` | `tests/game/ground/groundLayout.test.ts` |
| HUD | `src/components/hud/*`, `src/store/hudStore.ts`, `src/session/sessionHud.ts`, `src/session/networkHud.ts` | `tests/components/MatchScreen.test.tsx`, `tests/store/hudStore.test.ts`, `tests/network/match/MatchClock.test.ts` |
| Lobby UI | `src/components/lobby/*`, `src/store/lobbyStore.ts` | `tests/components/LobbyScreen.test.tsx`, `tests/components/StartScreen.test.tsx`, `tests/store/lobbyStore.test.ts` |
| Session state machine | `src/session/SessionController.ts`, `src/session/sessionState.ts`, `src/session/sessionDeps.ts`, `src/session/startArena.ts` | `tests/session/SessionController.test.ts` |
| Solo flow | `src/session/soloSession.ts` | `tests/session/SessionController.solo.test.ts` |
| Host lobby, roster | `src/session/hostLobby.ts`, `src/session/lobbyRoster.ts`, `src/session/playerNames.ts` | `tests/session/hostRoster.test.ts`, `tests/session/lobbyRoster.test.ts`, `tests/session/playerNames.test.ts` |
| Client join, lobby connection | `src/session/clientLobby.ts`, `src/session/lobbyConnection.ts`, `src/session/roomCodeRules.ts`, `src/hooks/useJoinLinkCode.ts` | `tests/session/SessionController.network.test.ts`, `tests/session/lobby.test.ts`, `tests/components/MultiplayerPanel.test.tsx` |
| Network match, host side | `src/session/networkMatchRunner.ts`, `src/session/MatchHost.ts`, `src/network/match/SnapshotPump.ts`, `src/network/match/startMessage.ts` | `tests/session/MatchHost.test.ts`, `tests/network/match/SnapshotPump.test.ts`, `tests/session/matchStartDelivery.test.ts` |
| Network match, client side | `src/session/MatchClient.ts`, `src/network/match/InputSender.ts`, `src/network/match/InputReceiver.ts`, `src/network/match/MatchClock.ts` | `tests/session/MatchClient.test.ts`, `tests/network/match/InputSender.test.ts`, `tests/network/match/InputReceiver.test.ts` |
| Connectivity indicator (RTT, jitter) | `src/session/hostConnectivity.ts`, `src/network/sync/PingPong.ts`, `src/components/hud/ConnectivitySignal.tsx` | `tests/session/hostConnectivity.test.ts`, `tests/network/sync/PingPong.test.ts` |
| Message validation | `src/network/protocol/validate/*` | `tests/network/protocol/validate.test.ts`, `tests/network/protocol/validateEvents.test.ts` |
| Wire codec, message types | `src/network/protocol/codec.ts`, `src/network/protocol/messages.ts` | `tests/network/protocol/codec.test.ts`, `tests/network/protocol/messageTypes.test.ts` |
| Handshake (hello, welcome, reject) | `src/network/session/*` | `tests/network/session/Handshake.test.ts` |
| Transport, PeerJS | `src/network/transport/*` | `tests/network/transport/PeerTransport.test.ts`, `tests/network/transport/LocalTransport.test.ts`, `tests/network/transport/peerJsFactory.test.ts` |
| Room codes | `src/network/room/roomCode.ts`, `src/session/roomCodeRules.ts` | `tests/network/room/roomCode.test.ts` |
| Snapshot interpolation | `src/network/sync/SnapshotBuffer.ts`, `src/network/match/RemoteView.ts`, `src/game/sim/interpolate.ts`, `src/game/sim/StateInterpolator.ts` | `tests/network/sync/SnapshotBuffer.test.ts`, `tests/network/match/RemoteView.test.ts`, `tests/game/sim/interpolate.test.ts` |
| Tunables | `src/config/gameConfig.ts`, `src/config/gameConfigShape.ts`, `docs/GAMEPLAY.md` section 9 | `tests/docs/configSync.test.ts` |
| Debug logs | `src/config/debugLog.ts`, `src/network/transport/transportLog.ts` | `tests/config/debugLog.test.ts` |
| Layer rules | `eslint.config.mjs` | `tests/architecture/layers.test.ts` |
| Result screen | `src/components/result/ResultScreen.tsx` | (none) |
| Portrait hint, pause on orientation | `src/components/controls/RotateHint.tsx`, `src/hooks/useOrientationPause.ts` | (none) |

---

## 4. Coding standards

### 4.1 TypeScript and React (from owner rules)
- TypeScript strict mode. No `any` unless commented with the reason.
- Prefer `interface` over `type` for object shapes.
- No `enum`. Use `as const` objects with a derived union type.
- Use `satisfies` for config validation.
- Named exports for components. Avoid `React.FC`. Always declare a `Props` interface; no inline prop types in parameters.
- Hooks start with `use`. Event handlers start with `handle`. Booleans start with `is`, `has`, `should`.
- Early returns. No nested ternaries. No deep prop drilling (use the `hudStore` or a context).
- No global mutable variables. Module-level `const` only.
- Files ≤ 300 lines: ESLint `max-lines` (error, blank lines and comments skipped) applies to all `src/**`. Extract logic into hooks or modules when near the limit.
- No business logic inside JSX.
- Structure a file as: exports, subcomponents, helpers, types.
- Use functional and declarative patterns. Keep functions small.
- Do not add comments that restate code. Comment only non-obvious reasoning (physics constants, protocol quirks).

### 4.2 Game loop rules
- No React state updates inside the rAF loop. HUD values go through `hudStore` at 10 Hz.
- No allocations in the per-frame hot path where avoidable (reuse vectors, pool sprites and particles).
- The fixed step is `1/60 s`. Never use wall-clock delta directly inside the simulation.
- Use the seeded RNG (`sim/Rng.ts`) for anything the host must reproduce. Never `Math.random()` inside `sim/`.

### 4.3 Networking rules
- Every inbound message passes `src/network/protocol/validate/*` before use.
- Messages are versioned (`v: 1`). Bump only per NETWORK_PROTOCOL section 9.
- Two PeerJS `DataConnection`s per remote peer: reliable (`reliable: true`) for control and events, unreliable (`reliable: false`) for `in` and `snap`. The flag is per connection in PeerJS 1.5.5, not per message.
- Never trust client-supplied positions, scores, or bill ids.
- Log and count invalid messages; do not throw from the message handler.

### 4.4 Naming
- Files: `PascalCase.ts` for classes and components, `camelCase.ts` for modules of functions, `*.test.ts` for tests in `tests/` mirroring `src/`.
- Constants: `UPPER_SNAKE_CASE` for true global constants; tunables live in `gameConfig.ts` in camelCase.
- Message type discriminator field is `t`; event kind field is `k` on `ev`.

### 4.5 Formatting
- Prettier defaults of the repository, once P0.2 is merged.
- Two-space indentation in JSON and CSS. Four-space is not used.

---

## 5. Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and bundle to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint incl. layer rules |
| `npm test` | Vitest |
| `npm run test:watch` | Vitest watch mode |
| `npm run check` | Full static gate: typecheck, lint, format check, knip, tests with coverage. Must be green. |

`npm run check` must be green before any task is reported done and before any commit. It runs typecheck, lint, format:check, knip, and test:coverage.

Logging: use `debugLog` (`src/config/debugLog.ts`, prints only in dev builds) for diagnostics. Do not add `console.log` to `src/**`. `console.error` is reserved for unexpected failures.

Run all of `typecheck`, `lint`, `test`, `build` before reporting a task as complete.

---

## 6. Testing rules
- Simulation, rules, bots, codec, validation and room codes are unit-tested in Node with Vitest. `MatchSimulationDeterminism.test.ts` is a golden digest test; update its digest only for an intended behaviour change.
- React components are tested with jsdom and Testing Library.
- HTTP calls (if any, e.g. optional TURN config fetch) are mocked with msw. WebRTC is not mocked with msw; use `LocalTransport`.
- Physics tests use fixed steps. Do not rely on real time.
- Every bug fix comes with a regression test where feasible.
- Device-only behaviors (Safari viewport, Wake Lock, audio unlock, real network) are verified manually and recorded in `docs/ROADMAP.md` section 9. Do not claim they work from desktop tests.

---

## 7. Documentation rules
- Documents are the source of truth. If code and docs disagree, fix the doc in the same change or ask the owner.
- Facts about external libraries (PeerJS API, Matter.js behavior, Safari support) must be verified against the pinned version or current docs before being written as fact. Otherwise mark them as assumptions (ARCHITECTURE section 13).
- Do not create new markdown files unless asked. Extend the existing `docs/` set.
- Tunable numbers belong in `docs/GAMEPLAY.md` section 9 and `src/config/gameConfig.ts`. Keep both in sync.

---

## 8. Open items the agent must not silently decide
| ID | Topic | Default in docs | Action |
|----|-------|-----------------|--------|
| Q-01 | Human player cap | 4 | Ask owner before changing |
| Q-02 | TURN and credentials | STUN only, TURN postponed (decided) | Do not add TURN without owner; never commit real credentials |
| Q-03 | Win condition and match length | 180 s, highest score | Ask owner before changing |
| Q-04 | Boost button | removed (owner decision) | Human boost removed; CPU boost kept |
| Q-06 | Default bot difficulty | Normal | |
| Q-07 | Landscape hint | yes | |
| Q-08 | Workspace rule in `Unittests.md` | no | Do not run commands against other workspaces |
| C-01 | README says 2–5 players | to fix (T-00) | Update README only after Q-01 confirmed |

---

## 9. Security and secrets
- Never commit TURN credentials, API keys, or `.env` files with real values. Use `.env.example` with placeholders.
- Room codes are not secrets but must not be logged in production builds.
- Do not log peer IDs or player names to any external service.
- Input from peers is untrusted (see NETWORK_PROTOCOL section 7).

---

## 10. Git and delivery
- Work in small commits, one per roadmap task ID where possible (for example `P1.2: car handling model`).
- Do not commit until the owner asks, unless the current task explicitly says so.
- Do not force-push. Do not rewrite history on `main`.
- Mandatory gate: `npm run check` (section 5) must be green for every PR/commit and must also update `docs/ROADMAP.md` status for the task IDs it completes.

---

## 11. When unsure
1. Check the docs above.
2. Check the open items list (section 8).
3. If the question is about an external library, read the pinned version's documentation.
4. If still unsure, ask the owner with a concrete question and a recommended default. Do not guess silently.
