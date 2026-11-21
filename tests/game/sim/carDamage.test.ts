import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { MatchSimulation } from "../../../src/game/sim/MatchSimulation";
import { placeCarForTest } from "../../../src/game/sim/testing";
import type { MatchSetup, MatchSnapshot } from "../../../src/types/game";

const SETUP: MatchSetup = {
  gameMode: "cash",
  seed: 7,
  humanPlayerIds: [0, 1],
  botPlayerIds: [],
  botDifficulty: "normal",
  matchSeconds: 180,
};
const MAX_STEPS = 600;

function hpOf(snap: MatchSnapshot, pid: number): number {
  const car = snap.cars.find((entry) => entry.pid === pid);
  if (car === undefined) throw new Error(`no car ${pid}`);
  return car.hp;
}

describe("car damage attribution", () => {
  it("rammer takes rammerDamageShare of the victim's damage in a head-on hit", () => {
    const sim = new MatchSimulation(SETUP);
    placeCarForTest(sim, 0, 500, 800, 0);
    placeCarForTest(sim, 1, 700, 800, Math.PI);

    const start = sim.snapshot();
    let end = start;
    for (let i = 0; i < MAX_STEPS; i += 1) {
      sim.setInput(0, { aimX: 1, aimY: 0, action: false, seq: sim.tick });
      sim.step();
      end = sim.snapshot();
      if (hpOf(end, 0) < hpOf(start, 0) || hpOf(end, 1) < hpOf(start, 1)) break;
    }

    const rammerDrop = hpOf(start, 0) - hpOf(end, 0);
    const victimDrop = hpOf(start, 1) - hpOf(end, 1);
    expect(rammerDrop).toBeGreaterThan(0);
    expect(victimDrop).toBeGreaterThan(rammerDrop);
    expect(rammerDrop / victimDrop).toBeCloseTo(
      gameConfig.rammerDamageShare,
      2,
    );
  });

  it("cars hitting the same wall at equal speed take equal damage", () => {
    const sim = new MatchSimulation(SETUP);
    placeCarForTest(sim, 0, 400, 500, Math.PI);
    placeCarForTest(sim, 1, 400, 1100, Math.PI);

    const start = sim.snapshot();
    let end = start;
    for (let i = 0; i < MAX_STEPS; i += 1) {
      sim.setInput(0, { aimX: 1, aimY: 0, action: false, seq: sim.tick });
      sim.setInput(1, { aimX: 1, aimY: 0, action: false, seq: sim.tick });
      sim.step();
      end = sim.snapshot();
      if (hpOf(end, 0) < hpOf(start, 0) && hpOf(end, 1) < hpOf(start, 1)) break;
    }

    const drop0 = hpOf(start, 0) - hpOf(end, 0);
    const drop1 = hpOf(start, 1) - hpOf(end, 1);
    expect(drop0).toBeGreaterThan(0);
    expect(drop0).toBeCloseTo(drop1, 6);
  });
});
