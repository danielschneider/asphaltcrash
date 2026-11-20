# AGENTS.md – AsphaltCrash

Instructions for AI coding agents working in this repository.
Read in this order before any change: this file, `docs/ANALYSIS.md`, `docs/ARCHITECTURE.md`, `docs/NETWORK_PROTOCOL.md`, `docs/GAMEPLAY.md`, `docs/ROADMAP.md`.

---

## 1. Project in one paragraph
AsphaltCrash is a top-down 2D car combat and cash-collection arena game for iPad Safari. Up to 4 human players connect via WebRTC (PeerJS). Bots (CPU) fill slots and provide a solo mode. The host browser runs the authoritative simulation. Deployed as static files on GitHub Pages. No backend.

---

## 2. Non-negotiable constraints
1. No backend code. No server process in the repo. Static hosting only.
2. Target is iPadOS Safari. Every feature must be considered against Safari limits (see ARCHITECTURE section 9).
3. Host-authoritative simulation. Clients never decide physics, damage, bills, or score.
4. Default 4 human players, configurable via `maxHumans` in `gameConfig.ts`. Do not hard-lock the value. Max 8 cars total.
5. Libraries: `react`, `react-dom`, `peerjs` (1.5.5), `matter-js` (0.20.0), `pixi.js` (8.23.0), `vite`, TypeScript. Pin exact versions at P0. Adding a dependency requires a note in ANALYSIS or ARCHITECTURE and owner approval.
5a. The entire game is TypeScript. The only expected non-TypeScript file is the GitHub Actions workflow YAML.
5b. Hosting is GitHub Pages only. No client-side routes; join links use `?join=CODE`.
6. Do not generate the roadmap phases out of order. Respect exit gates in `docs/ROADMAP.md`.
7. Do not edit `.kilo/agent-manager.json`.

---

## 3. Layer rules (enforced by ESLint once P0 is done)

| Layer | Path | May import | Must not import |
|-------|------|-----------|-----------------|
| L2 domain | `src/game/sim/**`, `src/game/Entities.ts`, `src/game/bots/**`, `src/types/**`, `src/config/**` | TypeScript only, other L2 modules | `react`, `pixi.js`, `matter-js`, `peerjs`, DOM APIs, `src/network/**`, `src/components/**` |
| Physics adapter | `src/game/Physics.ts` | `matter-js`, L2 | Everything else |
| L0 renderer | `src/game/Renderer.ts`, `src/game/Effects.ts`, `src/game/Camera.ts` | `pixi.js`, L2 types | `peerjs`, `react`, `src/network/**` |
| L1 network | `src/network/**` | `peerjs`, L2 types, `src/types/network.ts` | `react`, `pixi.js`, `src/components/**` |
| L3 runtime | `src/game/Engine.ts`, `src/game/input/**`, `src/game/shadow/**` | L2, L1 interfaces, L0 renderer | `react` |
| L4 session | `src/session/**` | L3, L1 | `pixi.js` directly |
| L5 UI | `src/components/**`, `src/hooks/**`, `src/App.tsx`, `src/main.tsx` | React, L4, `src/store/**` | `matter-js`, `peerjs` directly |

Keep the dependency direction downward. If a feature needs an upward dependency, add an interface in a lower layer and inject the implementation.

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
- Components ≤ 300 lines. Extract logic into hooks when near the limit.
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
- Every inbound message passes `validate.ts` before use.
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
(Scripts are defined in P0. Until then, these commands do not exist.)

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and bundle to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint incl. layer rules |
| `npm test` | Vitest |
| `npm run test:watch` | Vitest watch mode |

Run all of `typecheck`, `lint`, `test`, `build` before reporting a task as complete.

---

## 6. Testing rules
- Simulation, rules, bots, codec, validation, room codes and reconciler are unit-tested in Node with Vitest.
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
| Q-04 | Boost button | yes | Ask owner before removing |
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
- Each PR/commit must pass the commands in section 5 and update `docs/ROADMAP.md` status for the task IDs it completes.

---

## 11. When unsure
1. Check the docs above.
2. Check the open items list (section 8).
3. If the question is about an external library, read the pinned version's documentation.
4. If still unsure, ask the owner with a concrete question and a recommended default. Do not guess silently.
