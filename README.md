# AsphaltCrash

Top-down 2D multiplayer vehicle combat and cash-collection arena game designed for tablet browsers, hosted statically on GitHub Pages.

## 1. Game Concept & Core Loop
- **Genre:** Top-Down Arena Car Combat / Arcade (inspired by *GTA 1* camera perspective and *Destruction Derby* physics).
- **Target Platform & Controls:** Mobile/tablet web browsers, landscape orientation only (portrait shows a "rotate device" hint). Up to 4 human players by default (configurable, not hard-locked); empty slots are filled with CPU bots. Controlled exclusively via a touch-based **on-screen virtual joystick** plus one action button (boost). Players cannot exit their vehicles.
- **Gameplay Mechanics:**
  - **Vehicle Combat & Physics:** Players steer cars around an enclosed arena, ramming opponents and obstacles to inflict and receive structural damage.
  - **Objective (Cash Collection):** Cash bills spawn dynamically in the arena. Players collect bills on contact and deliver them to their designated **Home Base** (a rectangular drop-off zone positioned near their spawn/joystick area) to score.
- **Camera & Visuals:**
  - **Perspective:** Top-down 2D view. The arena may exceed the viewport dimensions, requiring smooth dynamic camera panning and zooming.
  - **Art Style:** Clean, modern 2D vector/sprite graphics (explicitly **not** pixel art) enhanced with dynamic particle effects (e.g., exhaust smoke, collision sparks).

## 2. Technical Architecture
- **Deployment:** 100% client-side static web application deployed via **GitHub Pages** (zero custom backend infrastructure).
- **Networking (Decentralized P2P):**
  - Uses **WebRTC** via `peerjs` (relying on the public PeerJS signaling server only for initial ICE/SDP handshake).
  - Host-authoritative star topology: one browser (the host, also used for solo CPU mode) runs the simulation; other players connect to it. Players join by sharing a short room code (QR code optional).
- STUN only in v1; no TURN relay. Connections that cannot traverse the NAT fail with a clear message.
  - Synchronizes vehicle transforms (position, velocity, rotation), health/damage states, cash pickups, and scores across peers.
- **Decoupled Game Loop & UI:**
  - **React Layer:** Renders non-real-time UI overlays (lobby/matchmaking, Peer ID sharing, HUD, scoreboards, and the touch joystick input emitter).
  - **Simulation & Render Loop:** Runs independently inside a `requestAnimationFrame` loop outside React's state lifecycle to prevent reconciliation overhead. Each tick steps the physics world and updates the graphics scene graph.

## 3. Tech Stack & Dependencies
- **Language:** TypeScript (strict mode recommended for reliable state/network payload typing)
- **Build Tool:** Vite (static bundling for GitHub Pages)
- **Core Packages:**
  - `react` & `react-dom`: UI components, lobby screens, HUD, and touch input controls.
  - `peerjs`: WebRTC peer-to-peer data channels for multiplayer state sync.
  - `matter-js` (`@types/matter-js`): 2D rigid-body physics engine handling vehicle momentum, friction, wall/car collisions, and impulse-based damage calculation.
  - `pixi.js`: 2D WebGL renderer for smooth sprite rendering, camera transforms (zoom/pan), and particle systems (exhaust smoke).

## 4. Recommended Project Structure (AI Context)
```text
src/
├── components/     # React UI (Lobby, HUD, VirtualJoystick)
├── game/
│   ├── Engine.ts   # Main requestAnimationFrame loop coordinating physics, render, and net sync
│   ├── Physics.ts  # Matter.js world, car bodies, arena boundaries, collision event handlers
│   ├── Renderer.ts # PixiJS stage, camera zoom/follow logic, car sprites, smoke particle emitter
│   └── Entities.ts # Data models for Car, CashBill, HomeBase, and Arena
├── network/
│   └── PeerManager.ts # PeerJS connection lifecycle, serialization, and state broadcast/reconciliation
└── types/          # Shared TypeScript interfaces for game state and P2P network packets