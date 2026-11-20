import { describe, expect, it } from "vitest";
import { createPeerJsFactory } from "../../../src/network/transport/peerJsFactory";

describe("createPeerJsFactory", () => {
  it("returns a factory without opening a signalling connection", () => {
    expect(typeof createPeerJsFactory()).toBe("function");
  });
});
