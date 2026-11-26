import { describe, expect, it, vi } from "vitest";
import { createDebugLog, debugLog } from "../../src/config/debugLog";

describe("createDebugLog", () => {
  it("writes the tag prefix and message when enabled", () => {
    const write = vi.fn();
    createDebugLog(true, write)("mp:host", "createRoom ok");
    expect(write).toHaveBeenCalledWith("[mp:host] createRoom ok");
  });

  it("evaluates a thunk message and writes its result", () => {
    const write = vi.fn();
    createDebugLog(true, write)("mp:frame", () => "n=60");
    expect(write).toHaveBeenCalledWith("[mp:frame] n=60");
  });

  it("neither writes nor evaluates the thunk when disabled", () => {
    const write = vi.fn();
    const build = vi.fn(() => "unused");
    createDebugLog(false, write)("mp:net", build);
    expect(build).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("debugLog", () => {
  it("is exported as a function", () => {
    expect(typeof debugLog).toBe("function");
  });
});
