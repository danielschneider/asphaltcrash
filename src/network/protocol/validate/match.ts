import {
  PROTOCOL_VERSION,
  type EndMessage,
  type ReadyMessage,
  type ScoreItem,
} from "../messages";
import {
  SCORE_MAX,
  SEQ_MAX,
  checkEnvelope,
  fail,
  isInt,
  isRecord,
  type Dict,
  type ParseResult,
} from "./primitives";

export function validateReady(
  raw: unknown,
  expectedMid: number,
): ParseResult<ReadyMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "ready");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.mid, 0, SEQ_MAX)) {
    return fail("field:mid");
  }
  if (raw.mid !== expectedMid) {
    return fail("mid-mismatch");
  }
  return { ok: true, value: { v: PROTOCOL_VERSION, t: "ready", mid: raw.mid } };
}

export function validateReadyEnvelope(raw: Dict): ParseResult<ReadyMessage> {
  const envelopeError = checkEnvelope(raw, "ready");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.mid, 0, SEQ_MAX)) {
    return fail("field:mid");
  }
  return { ok: true, value: { v: PROTOCOL_VERSION, t: "ready", mid: raw.mid } };
}

function isScoreItem(raw: unknown): raw is ScoreItem {
  return (
    Array.isArray(raw) &&
    raw.length === 4 &&
    raw.every((value) => isInt(value, 0, SCORE_MAX))
  );
}

export function validateEndEnvelope(raw: Dict): ParseResult<EndMessage> {
  const envelopeError = checkEnvelope(raw, "end");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.mid, 0, SEQ_MAX)) {
    return fail("field:mid");
  }
  if (!Array.isArray(raw.scores) || !raw.scores.every(isScoreItem)) {
    return fail("field:scores");
  }
  if (
    !Array.isArray(raw.winners) ||
    !raw.winners.every((pid) => isInt(pid, 0, SEQ_MAX))
  ) {
    return fail("field:winners");
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "end",
      mid: raw.mid,
      scores: raw.scores,
      winners: raw.winners,
    },
  };
}
