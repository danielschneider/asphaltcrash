import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { InputSender } from "../../../src/network/match/InputSender";
import type { InputFrame } from "../../../src/game/input/InputFrame";

function recorder(): { sent: InputFrame[]; send: (f: InputFrame) => void } {
  const sent: InputFrame[] = [];
  return { sent, send: (f) => sent.push(f) };
}

describe("InputSender", () => {
  it("sends nothing before the first sample", () => {
    const rec = recorder();
    const sender = new InputSender(rec.send);
    sender.tick(0);
    expect(rec.sent).toHaveLength(0);
  });

  it("caps new samples at inputHz", () => {
    const rec = recorder();
    const sender = new InputSender(rec.send);
    for (let t = 0; t <= 1000; t += 1) {
      sender.setLatest(0.5, t / 1000, false);
      sender.tick(t);
    }
    expect(gameConfig.inputHz).toBe(30);
    expect(rec.sent.length).toBeGreaterThanOrEqual(29);
    expect(rec.sent.length).toBeLessThanOrEqual(31);
  });

  it("sends immediately on action edge, bypassing the rate cap", () => {
    const rec = recorder();
    const sender = new InputSender(rec.send);
    sender.setLatest(1, 0, false);
    sender.tick(0);
    sender.setLatest(1, 0, true);
    sender.tick(1);
    expect(rec.sent.map((f) => f.action)).toEqual([false, true]);
  });

  it("increments seq per new sample and clamps values", () => {
    const rec = recorder();
    const sender = new InputSender(rec.send);
    sender.setLatest(2, -3, false);
    sender.tick(0);
    sender.setLatest(0, 0, false);
    sender.tick(40);
    expect(rec.sent[0]).toMatchObject({ seq: 1, throttle: 1, steer: -1 });
    expect(rec.sent[1]?.seq).toBe(2);
  });

  it("keeps a 10 Hz heartbeat with increasing seq when idle", () => {
    const rec = recorder();
    const sender = new InputSender(rec.send);
    sender.setLatest(0, 0, false);
    sender.tick(0);
    for (let t = 1; t <= 1000; t += 1) {
      sender.tick(t);
    }
    expect(rec.sent.length).toBeGreaterThanOrEqual(10);
    expect(rec.sent.length).toBeLessThanOrEqual(11);
    const seqs = rec.sent.map((f) => f.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
