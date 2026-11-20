import type { InputFrame } from "./InputFrame";

export interface InputSource {
  readonly playerId: number;
  latest(): InputFrame;
}
