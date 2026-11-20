import type { InputBuffer } from "./InputBuffer";
import type { InputFrame } from "./InputFrame";
import type { InputSource } from "./InputSource";

export function createInputBufferSource(
  playerId: number,
  buffer: InputBuffer,
): InputSource {
  return {
    playerId,
    latest(): InputFrame {
      return buffer.latest();
    },
  };
}
