import { gameConfig } from "../../../config/gameConfig";
import {
  EVENT_KINDS,
  PROTOCOL_VERSION,
  type EventKind,
  type EventMessage,
} from "../messages";
import {
  POS_LIMIT,
  SCORE_MAX,
  SEQ_MAX,
  checkEnvelope,
  expectArray,
  fail,
  isBillValue,
  isBoundedNumber,
  isInt,
  isRecord,
  isValidPid,
  type ParseResult,
} from "./primitives";

type EventOf<K extends EventKind> = Extract<EventMessage, { readonly k: K }>;

interface EventSpec {
  readonly arity: number;
  readonly check: (d: readonly unknown[]) => boolean;
}

const EVENT_SPECS = {
  pick: {
    arity: 3,
    check: ([pid, billId, value]) =>
      isValidPid(pid) && isInt(billId, 0, SEQ_MAX) && isBillValue(value),
  },
  drop: {
    arity: 2,
    check: ([pid, count]) =>
      isValidPid(pid) && isInt(count, 0, gameConfig.cargoCapacity),
  },
  deliv: {
    arity: 2,
    check: ([pid, amount]) => isValidPid(pid) && isInt(amount, 0, SCORE_MAX),
  },
  hit: {
    arity: 3,
    check: ([attackerPid, victimPid, impulse]) =>
      isValidPid(attackerPid) &&
      isValidPid(victimPid) &&
      typeof impulse === "number" &&
      Number.isFinite(impulse),
  },
  kill: {
    arity: 2,
    check: ([attackerPid, victimPid]) =>
      isValidPid(attackerPid) && isValidPid(victimPid),
  },
  respawn: {
    arity: 4,
    check: ([pid, x, y, a]) =>
      isValidPid(pid) &&
      isBoundedNumber(x, POS_LIMIT) &&
      isBoundedNumber(y, POS_LIMIT) &&
      typeof a === "number" &&
      Number.isFinite(a),
  },
  billNew: {
    arity: 4,
    check: ([id, x, y, value]) =>
      isInt(id, 0, SEQ_MAX) &&
      isBoundedNumber(x, POS_LIMIT) &&
      isBoundedNumber(y, POS_LIMIT) &&
      isBillValue(value),
  },
  timer: {
    arity: 1,
    check: ([remainingMs]) => isInt(remainingMs, 0, SEQ_MAX),
  },
} as const satisfies Record<EventKind, EventSpec>;

function isEventKind(raw: unknown): raw is EventKind {
  return EVENT_KINDS.some((kind) => kind === raw);
}

function parseEventPayload<K extends EventKind>(
  kind: K,
  payload: unknown,
): ParseResult<EventOf<K>> {
  const spec = EVENT_SPECS[kind];
  const d = expectArray(payload, spec.arity);
  if (d === null || !spec.check(d)) {
    return fail("field:d");
  }
  const event = { v: PROTOCOL_VERSION, t: "ev", k: kind, d: [...d] };
  return { ok: true, value: event as unknown as EventOf<K> };
}

export function validateEventPayload(raw: unknown): ParseResult<EventMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "ev");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isEventKind(raw.k)) {
    return fail("field:k");
  }
  return parseEventPayload(raw.k, raw.d);
}
