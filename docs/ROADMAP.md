# AsphaltCrash – Roadmap

Status: draft v1. Phases are gated: a phase is complete only when its exit gate is met and recorded in this file.
Device targets: iPad (current iPadOS, Safari) primary; desktop Chrome for development.

---

## 0. Pre-work decisions (blocking)

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| T-00 | Update `README.md` section 1: "2–5 players" → "1–4 human players, bots fill slots" (C-01). Update section 2 topology wording to host-authoritative star (C-02). | Dev | Open, after Q-01 |
| Q-01 | Default 4 human cap, configurable, not hard-locked. | Owner | Decided |
| Q-02 | STUN only in v1, no TURN. Own free relay postponed. | Owner | Decided |
| Q-03 | 180 s default, configurable; highest score wins. | Owner | Decided |
| Q-04 | Second button (boost) on right thumb. | Owner | Decided: yes |
| Q-06 | Default CPU difficulty. | Owner | Proposed Normal |
| Q-07 | Landscape-only with rotate hint. | Owner | Decided: yes |
| Q-08 | Apply `Unittests.md` workspace rule to this repo? | Owner | Proposed no |

---

## 1. Phase P0 – Project foundation

**Goal:** empty app builds, deploys to GitHub Pages, tests run.

| # | Task | Done when |
|---|------|-----------|
| P0.1 | Scaffold Vite + React 19 + TypeScript strict project in repo root. **Status: done** | `npm run build` produces `dist/`. |
| P0.2 | Add `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`), ESLint with `eslint.config.ts` (typescript-eslint, react-hooks, `no-restricted-imports` for layer rules), Prettier. Confirm the Node version supports a TypeScript ESLint config. **Status: done** (eslint config is .mjs, see ARCHITECTURE 12) | `npm run lint` and `npm run typecheck` pass. |
| P0.3 | Add Vitest, jsdom, msw. **Status: done** | `npm test` runs one smoke test. |
| P0.4 | Set Vite `base` for GitHub Pages. **Status: done** | Built `index.html` references `/asphaltcrash/` assets. |
| P0.5 | GitHub Actions workflow `.github/workflows/pages.yml`: install, lint, test, build, deploy. Not started (owner confirmation needed). | Pages site loads from GitHub. |
| P0.6 | Global CSS: `100dvh`, `touch-action: none`, `overscroll-behavior: none`, safe-area insets. **Status: done** | Blank page fills iPad viewport without scroll bounce. |
| P0.7 | Add `RotateHint` for portrait. **Status: done** | Portrait shows hint on iPad. |
| P0.8 | Create folder structure from ARCHITECTURE section 5. **Status: done** | Empty modules with barrel-free imports compile. |

**Exit gate G0:** deployed blank app opens on iPad Safari from GitHub Pages URL; CI green.

---

## 2. Phase P1 – Single-device game core (solo, no network)

**Goal:** a playable car in a walled arena on one device, with physics feel tuned.

| # | Task | Done when |
|---|------|-----------|
| P1.1 | `Physics.ts` adapter around Matter.js 0.20.0: world with gravity disabled (`gravity.scale = 0`), car body, walls, sensors. **Status: done (desktop)** | Car drives with joystick input. |
| P1.2 | Car handling model (GAMEPLAY 4). **Status: done (desktop)** | Steering, braking, reverse, lateral grip behave per 4.2 on iPad. |
| P1.3 | `Renderer.ts` with PixiJS v8: arena, car sprites, camera follow, zoom. **Status: done (desktop)** | 60 FPS on iPad with 4 cars (measured, record in this file). |
| P1.4 | `JoystickPad` and `InputBuffer`. **Status: done (desktop)** | Multi-touch works: steer and action simultaneously. |
| P1.5 | `MatchSimulation` skeleton and fixed-step `Engine`. **Status: done (desktop)** | Deterministic step order; unit tests for step order pass. |
| P1.6 | Bills: spawn, pickup, delivery, cargo, score (GAMEPLAY 3). **Status: done (desktop)** | Unit tests G-03 pass; manual check on iPad. |
| P1.7 | Damage model and respawn (GAMEPLAY 5). **Status: done (desktop)** | Unit tests for `applyDamage`, cooldown, attribution. G-04, G-05 pass manually. |
| P1.8 | Measure: Matter.js tunneling at max speed with 2 and 4 substeps. **Status: pending (device)**; desktop Node measurement only; tunneling test not performed. | Result recorded in ARCHITECTURE section 13 (A-05). |
| P1.9 | Measure: Pixi frame time with 8 cars, 12 bills, effects on iPad. **Status: pending (device)**; Pixi measurement pending. | Result recorded (A-06). |

**Exit gate G1:** solo driving, collecting and ramming feels acceptable on iPad (owner sign-off). Tuning values committed to `gameConfig.ts`.

**Risk checks:** R-05, R-06, R-07 in ANALYSIS section 5.

---

## 3. Phase P2 – Networking spike

**Goal:** prove PeerJS connectivity between two browsers including iPad Safari, before building gameplay on top.

| # | Task | Done when |
|---|------|-----------|
| P2.1 | Confirm for the pinned PeerJS version: create peer, connect, `reliable` option per connection, close events. Source already read for 1.5.5 (`reliable` per connection). Device test for A-01 and A-02. | ARCHITECTURE section 13 updated with source URLs and device results. Status: source read; device test pending. |
| P2.2 | `Transport` interface, `PeerTransport`, `LocalTransport`. | Unit tests pass for `LocalTransport`. Status: implemented, device test pending. |
| P2.3 | Room code generation and `asph-` mapping. | Unit tests for alphabet, length, collision retry. Status: implemented, device test pending. |
| P2.4 | Minimal ping/pong between host and one client, on desktop and iPad. | RTT displayed. Status: implemented, device test pending. |
| P2.5 | Device tests use the GitHub Pages deployment (HTTPS, secure context). A tunnel is only needed for local `npm run dev` on iPad, if used at all. | Documented in `docs/ARCHITECTURE.md` section 11. |
| P2.6 | Connection test on iPad over Wi-Fi and mobile data, STUN only. Record success rate per network type. | Results table added to this file. |

**Exit gate G2:** iPad connects to desktop host over mobile data (with TURN if needed). If mobile data fails without TURN, record it and go to decision with owner on Q-02.

---

## 4. Phase P3 – Multiplayer sync (2 players)

**Goal:** two humans drive and fight, host authoritative.

| # | Task | Done when |
|---|------|-----------|
| P3.1 | Protocol messages and codec (NETWORK_PROTOCOL 4), validation (section 7). | Round-trip and validation tests pass. |
| P3.2 | Host session: lobby, `hello`, `welcome`, `lobby` broadcast, `start`, `ready`. | Two clients join and see the lobby. Status: lobby UI done, desktop two-tab test pending. |
| P3.3 | Input path: `in` 30 Hz, zero-order hold, 500 ms timeout to neutral. | Unit tests pass. |
| P3.4 | Snapshot broadcast 20 Hz, `SnapshotBuffer`, remote interpolation at 100 ms. | Remote car motion smooth on iPad. |
| P3.5 | Shadow simulation and reconciliation for own car (ARCHITECTURE 6.8). | Prototype: own car steering feels responsive at simulated 100 ms RTT (use a network throttle in dev). |
| P3.6 | Clock sync (`ping`/`pong`). | Offset stable within ±20 ms in test. |
| P3.7 | Events: pick, deliver, hit, kill, respawn, timer. | Sparks, scores and feed update on both clients. |
| P3.8 | `end` message and results screen. | Both clients show identical scores. |

**Exit gate G3:** 2 humans complete a 180 s match, scores match on all screens, own car feels responsive at 100 ms simulated RTT.

**Fallback if P3.5 fails:** option 1 from ANALYSIS 3.2.1 (interpolate own car too) plus a ping display. Owner decides whether to accept.

---

## 5. Phase P4 – Full multiplayer and CPU mix

**Goal:** 4 humans, bots, reconnect, lobby polish.

| # | Task | Done when |
|---|------|-----------|
| P4.1 | Support up to 4 humans (G-06). | Four browsers complete a match. |
| P4.2 | Bot FSM (`BotController`) with `BotProfiles` (Easy, Normal, Hard). | Bots collect bills, deliver, attack and evade in test arena. |
| P4.3 | Mixed lobby: bot count slider, slot fill (G-07). Note: CPU count in lobby UI done; not yet used by the match. | 2 humans + 2 bots completes a match. |
| P4.4 | Solo vs CPU mode from start screen (no network). | G-01 passes on iPad. |
| P4.5 | Reconnect with token (NETWORK_PROTOCOL 8), 45 s window. | Disconnect and rejoin test passes. Bot takes slot in window expiry. |
| P4.6 | Host-loss handling: banner, return to start, cleared storage. | Test passes. |
| P4.7 | Connection failure messages (G-08). | Clear message on connect timeout. |
| P4.8 | Host wake lock and `visibilitychange` pause. | Documented iPad behavior recorded. |
| P4.9 | Bot-only performance: 7 bots + 1 human at 60 FPS. | Measured on iPad. |

**Exit gate G4:** all G-01 to G-08 pass on real devices. Test session notes recorded.

---

## 6. Phase P5 – Polish and PWA

| # | Task | Done when |
|---|------|-----------|
| P5.1 | Effects: smoke, sparks, destruction burst, optional tire marks, quality settings. | Budget respected (GAMEPLAY 8.3). |
| P5.2 | QR code display (host) and QR scanning is **not** required; join by code plus `?join=` link. | Scanning with iPad camera opens join URL. |
| P5.3 | Optional audio (GAMEPLAY 8.4). Unlock on first tap. | Mute works. |
| P5.4 | PWA manifest and icons for "Add to Home Screen" standalone mode. | Installs on iPad; standalone layout checked. |
| P5.5 | Service worker: decide per ADR. Default: none, to avoid stale-cache issues. | Decision recorded. |
| P5.6 | Arena barrier props (optional). | Only if G4 is green and time remains. |

**Exit gate G5:** owner playtest sign-off.

---

## 7. Phase P6 – Post-v1 options (not scheduled)
- Host migration (ADR-009 revisit).
- Binary snapshot encoding (v2 protocol) if bandwidth measured above 20 KB/s.
- Dedicated relay or server (requires relaxing R-06).
- Utility-AI bots, A* navigation for obstacles.
- Procedural arenas.
- Weapons and power-ups.
- Desktop keyboard controls.

---

## 8. Test matrix (manual, per release)

| Device | Browser | Network | Scenario |
|--------|---------|---------|----------|
| iPad (current iPadOS) | Safari | Wi-Fi | Solo CPU 180 s |
| iPad (current iPadOS) | Safari | Wi-Fi | Solo Crashfest last-car-standing match |
| iPad | Safari | Mobile data | Join desktop host |
| iPad | Safari | Wi-Fi | Host, 4 humans |
| Desktop | Chrome | Wi-Fi | Host, 4 humans (2 tabs) |
| iPad | Chrome (iOS) | Wi-Fi | Smoke test (WebKit) |
| Any | Any | Network throttled 100 ms / 2 % loss | Sync quality |

---

## 9. Measured results (fill during development)

| Date | Item | Result | Device |
|------|------|--------|--------|
| 2026-11-20 | Matter sim.step mean/p95 (4 cars, 7 bills, 1200 steps) | 0.0215 ms mean, 0.0439 ms p95; tunneling (P1.8) pending | desktop, Node, not iPad |
| 2026-11-20 | Pixi frame time 8 cars (P1.9) | pending, headless not measurable | desktop Chrome pending, not iPad |
| 2026-11-20 | P2 unit tests only (fake peers, no real network) | Handshake hello/welcome/reject and transport tests pass; no real-network result | desktop and iPad: pending |
| – | PeerJS connect over mobile data (P2.6) | pending | – |
| – | Snapshot bandwidth (P3) | pending | – |
