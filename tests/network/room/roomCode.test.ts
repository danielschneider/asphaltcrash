import { describe, expect, it } from "vitest";
import {
  ROOM_ALPHABET,
  defaultRandomBytes,
  generateRoomCode,
  generateUniqueRoomCode,
  hostPeerIdFor,
  roomCodeFromPeerId,
  validateRoomCode,
} from "../../../src/network/room/roomCode";

function fromSequence(bytes: number[]): (count: number) => Uint8Array {
  const queue = [...bytes];
  return (count) => Uint8Array.from(queue.splice(0, count));
}

describe("roomCode", () => {
  it("uses the documented alphabet without 0 O 1 I L", () => {
    expect(ROOM_ALPHABET).toHaveLength(31);
    for (const forbidden of ["0", "O", "1", "I", "L"]) {
      expect(ROOM_ALPHABET).not.toContain(forbidden);
    }
  });

  it("generates 6-character codes from the alphabet using crypto randomness", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(validateRoomCode(code)).toBe(true);
    }
    expect(defaultRandomBytes(4)).toHaveLength(4);
  });

  it("rejects bytes at or above 248 instead of biasing the alphabet", () => {
    const source = fromSequence([248, 255, 0, 1, 2, 3, 4, 5]);
    expect(generateRoomCode(source)).toBe("ABCDEF");
  });

  it("maps accepted bytes modulo 31", () => {
    const source = fromSequence([247, 0, 1, 2, 3, 4, 5]);
    expect(generateRoomCode(source)).toBe("9ABCDE");
  });

  it("fails loudly when the byte source only yields rejected values", () => {
    const rejectAll = (count: number): Uint8Array =>
      new Uint8Array(count).fill(255);
    expect(() => generateRoomCode(rejectAll)).toThrow();
  });

  it("validates format strictly", () => {
    expect(validateRoomCode("ABCDEF")).toBe(true);
    expect(validateRoomCode("ABCDE")).toBe(false);
    expect(validateRoomCode("ABCDE0")).toBe(false);
    expect(validateRoomCode("abcdef")).toBe(false);
    expect(validateRoomCode("ABCDEFG")).toBe(false);
  });

  it("builds and parses host peer ids", () => {
    expect(hostPeerIdFor("ABCDEF")).toBe("asph-ABCDEF");
    expect(roomCodeFromPeerId("asph-ABCDEF")).toBe("ABCDEF");
    expect(roomCodeFromPeerId("other-ABCDEF")).toBeNull();
    expect(roomCodeFromPeerId("asph-ABCD0F")).toBeNull();
  });

  it("returns a code that is not taken", () => {
    const code = generateUniqueRoomCode(() => false);
    expect(code).not.toBeNull();
    expect(validateRoomCode(code ?? "")).toBe(true);
  });

  it("retries on collision and returns null after max attempts", () => {
    let draws = 0;
    const source = (count: number): Uint8Array => {
      draws += 1;
      return new Uint8Array(count);
    };
    const code = generateUniqueRoomCode(() => true, 5, source);
    expect(code).toBeNull();
    expect(draws).toBe(5);
  });

  it("returns the first free code within the retry budget", () => {
    const taken = new Set(["AAAAAA"]);
    const code = generateUniqueRoomCode(
      (candidate) => taken.has(candidate),
      3,
      (count) => new Uint8Array(count),
    );
    expect(code).toBeNull();
    const freeCode = generateUniqueRoomCode(
      () => false,
      1,
      (count) => new Uint8Array(count),
    );
    expect(freeCode).toBe("AAAAAA");
  });
});
