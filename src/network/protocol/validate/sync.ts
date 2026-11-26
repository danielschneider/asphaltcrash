import {
  PROTOCOL_VERSION,
  type PingMessage,
  type PongMessage,
} from "../messages";
import { checkEnvelope, fail, isRecord, type ParseResult } from "./primitives";

function isFiniteNumber(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isFinite(raw);
}

export function validatePingPayload(raw: unknown): ParseResult<PingMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "ping");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isFiniteNumber(raw.c)) {
    return fail("field:c");
  }
  return { ok: true, value: { v: PROTOCOL_VERSION, t: "ping", c: raw.c } };
}

export function validatePongPayload(raw: unknown): ParseResult<PongMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "pong");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isFiniteNumber(raw.c)) {
    return fail("field:c");
  }
  if (!isFiniteNumber(raw.h)) {
    return fail("field:h");
  }
  return {
    ok: true,
    value: { v: PROTOCOL_VERSION, t: "pong", c: raw.c, h: raw.h },
  };
}
