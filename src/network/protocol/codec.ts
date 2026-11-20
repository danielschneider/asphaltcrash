import type { InputFrame } from "../../game/input/InputFrame";
import type {
  BillSnapshot,
  CarSnapshot,
  MatchSnapshot,
} from "../../types/game";
import {
  PROTOCOL_VERSION,
  type InputMessage,
  type NetworkMessage,
  type SnapBillItem,
  type SnapCarItem,
  type SnapMessage,
} from "./messages";
import {
  validateInputPayload,
  validateMessage,
  validateSnapPayload,
  type ParseResult,
} from "./validate";

export type DecodeResult<T> = ParseResult<T>;

export interface DecodedSnapshot {
  readonly snapshot: MatchSnapshot;
  readonly ackSeq: number;
}

const TWO_PI = Math.PI * 2;
const ANGLE_WIRE_LIMIT = 3142;
const THROTTLE_WIRE_LIMIT = 100;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function normalizeAngle(rad: number): number {
  const wrapped = ((((rad + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return wrapped;
}

// Quantized to 0.001 rad; clamped to the wire range -3142..3142 per NETWORK_PROTOCOL 4.2.1.
export function encodeAngle(rad: number): number {
  const wire = Math.round(normalizeAngle(rad) * 1000);
  return Math.min(ANGLE_WIRE_LIMIT, Math.max(-ANGLE_WIRE_LIMIT, wire));
}

export function decodeAngle(wire: number): number {
  return wire / 1000;
}

function encodeCar(car: CarSnapshot): SnapCarItem {
  return [
    car.pid,
    roundTo(car.x, 0.1),
    roundTo(car.y, 0.1),
    encodeAngle(car.angle),
    Math.round(car.vx),
    Math.round(car.vy),
    Math.round(car.hp),
    car.flags,
    car.cargo,
    Math.round(car.score),
  ];
}

function encodeBill(bill: BillSnapshot): SnapBillItem {
  return [bill.id, Math.round(bill.x), Math.round(bill.y), bill.value];
}

export function toSnapMessage(
  snapshot: MatchSnapshot,
  ackSeq: number,
): SnapMessage {
  return {
    v: PROTOCOL_VERSION,
    t: "snap",
    k: snapshot.tick,
    ak: ackSeq,
    tm: Math.max(0, Math.round(snapshot.timeRemainingMs)),
    cars: snapshot.cars.map(encodeCar),
    bills: snapshot.bills.map(encodeBill),
  };
}

export function fromSnapMessage(message: SnapMessage): MatchSnapshot {
  return {
    tick: message.k,
    timeRemainingMs: message.tm,
    cars: message.cars.map(
      ([pid, x, y, a, vx, vy, hp, flags, cargo, score]): CarSnapshot => ({
        pid,
        x,
        y,
        angle: decodeAngle(a),
        vx,
        vy,
        hp,
        flags,
        cargo,
        score,
      }),
    ),
    bills: message.bills.map(([id, x, y, value]): BillSnapshot => ({
      id,
      x,
      y,
      value,
    })),
  };
}

export function encodeSnapshot(
  snapshot: MatchSnapshot,
  ackSeq: number,
): string {
  return JSON.stringify(toSnapMessage(snapshot, ackSeq));
}

export function decodeSnapshot(text: string): DecodeResult<DecodedSnapshot> {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return parsed;
  }
  const result = validateSnapPayload(parsed.value);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      ackSeq: result.value.ak,
      snapshot: fromSnapMessage(result.value),
    },
  };
}

export function toInputMessage(frame: InputFrame): InputMessage {
  return {
    v: PROTOCOL_VERSION,
    t: "in",
    s: Math.max(0, Math.floor(frame.seq)),
    ax: quantizeUnit(frame.aimX),
    ay: quantizeUnit(frame.aimY),
    a: frame.action ? 1 : 0,
  };
}

export function encodeInput(frame: InputFrame): string {
  return JSON.stringify(toInputMessage(frame));
}

export function decodeInput(text: string): DecodeResult<InputFrame> {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return parsed;
  }
  const result = validateInputPayload(parsed.value);
  if (!result.ok) {
    return result;
  }
  const message = result.value;
  return {
    ok: true,
    value: {
      aimX: message.ax / THROTTLE_WIRE_LIMIT,
      aimY: message.ay / THROTTLE_WIRE_LIMIT,
      action: message.a === 1,
      seq: message.s,
    },
  };
}

export function encodeMessage(message: NetworkMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage(text: string): DecodeResult<NetworkMessage> {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return parsed;
  }
  return validateMessage(parsed.value);
}

function quantizeUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const wire = Math.round(value * THROTTLE_WIRE_LIMIT);
  return Math.min(THROTTLE_WIRE_LIMIT, Math.max(-THROTTLE_WIRE_LIMIT, wire));
}

function parseJson(text: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "json" };
  }
}
