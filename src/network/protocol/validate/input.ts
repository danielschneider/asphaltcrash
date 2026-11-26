import type { InputMessage } from "../messages";
import { PROTOCOL_VERSION } from "../messages";
import {
  SEQ_MAX,
  checkEnvelope,
  fail,
  isInt,
  isRecord,
  type ParseResult,
} from "./primitives";

export function validateInputPayload(raw: unknown): ParseResult<InputMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "in");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.s, 0, SEQ_MAX)) {
    return fail("field:s");
  }
  if (typeof raw.ax !== "number" || !Number.isInteger(raw.ax)) {
    return fail("field:ax");
  }
  if (typeof raw.ay !== "number" || !Number.isInteger(raw.ay)) {
    return fail("field:ay");
  }
  if (raw.ax < -100 || raw.ax > 100 || raw.ay < -100 || raw.ay > 100) {
    return fail("range");
  }
  if (raw.a !== 0 && raw.a !== 1) {
    return fail("field:a");
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "in",
      s: raw.s,
      ax: raw.ax,
      ay: raw.ay,
      a: raw.a,
    },
  };
}
