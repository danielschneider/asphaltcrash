// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeMessage } from "../../../src/network/protocol/codec";
import { buildStart } from "../../../src/network/match/startMessage";
import type { MatchSetup } from "../../../src/types/game";

const SETUP: MatchSetup = {
  gameMode: "cash",
  seed: 42,
  humanPlayerIds: [0, 1],
  botPlayerIds: [],
  botDifficulty: "normal",
  matchSeconds: 180,
};

describe("decodeMessage start and ready", () => {
  it("accepts the JSON of a buildStart message", () => {
    const text = JSON.stringify(buildStart(SETUP, 7));
    const result = decodeMessage(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.t).toBe("start");
  });

  it("accepts a valid ready message", () => {
    const result = decodeMessage('{"v":1,"t":"ready","mid":7}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.t).toBe("ready");
  });
});
