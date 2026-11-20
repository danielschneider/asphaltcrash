import { describe, expect, it } from "vitest";
import { createLocalPair } from "../../../src/network/transport/LocalTransport";
import type { InputMessage } from "../../../src/network/protocol/messages";

function inputMessage(s: number): InputMessage {
  return { v: 1, t: "in", s, ax: 50, ay: -20, a: 0 };
}

function runLossySession(
  dropRate: number,
  seed: number,
): { received: number; dropped: number } {
  const [a, b] = createLocalPair({ dropRate, seed });
  let received = 0;
  b.transport.onMessage(() => {
    received += 1;
  });
  for (let s = 0; s < 3600; s += 1) {
    a.transport.send(inputMessage(s), "unreliable");
  }
  return { received, dropped: a.stats().dropped };
}

describe("LocalTransport", () => {
  it("delivers a message from A to B with channel forwarded", () => {
    const [a, b] = createLocalPair();
    const received: Array<{ msg: unknown; from: string }> = [];
    b.transport.onMessage((msg, from) => received.push({ msg, from }));
    a.transport.send(inputMessage(3), "reliable");
    expect(received).toEqual([{ msg: inputMessage(3), from: "local-a" }]);
    expect(a.transport.role).toBe("local");
  });

  it("counts and drops undecodable payloads without throwing", () => {
    const [a, b] = createLocalPair();
    let calls = 0;
    b.transport.onMessage(() => {
      calls += 1;
    });
    expect(() => a.sendRaw("{broken", "reliable")).not.toThrow();
    expect(calls).toBe(0);
    expect(b.stats().decodeFailures).toBe(1);
    expect(b.invalid.count("local-a")).toBe(1);
  });

  it("sendTo delivers only to the matching end", () => {
    const [a, b] = createLocalPair();
    const inboxA: unknown[] = [];
    const inboxB: unknown[] = [];
    a.transport.onMessage((msg) => inboxA.push(msg));
    b.transport.onMessage((msg) => inboxB.push(msg));
    a.transport.sendTo("local-b", inputMessage(5), "reliable");
    a.transport.sendTo("local-x", inputMessage(6), "reliable");
    expect(inboxB).toEqual([inputMessage(5)]);
    expect(inboxA).toEqual([]);
  });

  it("delivers nothing after close", () => {
    const [a, b] = createLocalPair();
    let calls = 0;
    b.transport.onMessage(() => {
      calls += 1;
    });
    a.transport.close();
    a.transport.send(inputMessage(1), "reliable");
    expect(calls).toBe(0);
  });

  it("drops deterministically with a seeded dropRate", () => {
    const first = runLossySession(0.05, 42);
    const second = runLossySession(0.05, 42);
    expect(first).toEqual(second);
    expect(first.dropped).toBeGreaterThan(100);
    expect(first.dropped).toBeLessThan(250);
    expect(first.received + first.dropped).toBe(3600);
  });

  it("never drops reliable messages", () => {
    const [a, b] = createLocalPair({ dropRate: 1, seed: 7 });
    let calls = 0;
    b.transport.onMessage(() => {
      calls += 1;
    });
    for (let s = 0; s < 50; s += 1) {
      a.transport.send(inputMessage(s), "reliable");
    }
    expect(calls).toBe(50);
  });
});
