import { gameConfig } from "../../../config/gameConfig";
import { BILL_VALUES, type BillValue } from "../../../types/game";
import { PROTOCOL_VERSION, type NetworkMessage } from "../messages";

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export type Dict = Record<string, unknown>;

export const PID_MAX = gameConfig.maxCars - 1;
export const POS_LIMIT = 100000;
export const VEL_LIMIT = 10000;
export const ANGLE_WIRE_LIMIT = 3142;
export const SCORE_MAX = 1_000_000_000;
export const FLAGS_MAX = 31;
export const SEQ_MAX = Number.MAX_SAFE_INTEGER;

export function fail(reason: string): {
  readonly ok: false;
  readonly reason: string;
} {
  return { ok: false, reason };
}

export function isRecord(raw: unknown): raw is Dict {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

export function isInt(raw: unknown, min: number, max: number): raw is number {
  return (
    typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max
  );
}

export function isBoundedNumber(raw: unknown, limit: number): raw is number {
  return (
    typeof raw === "number" && Number.isFinite(raw) && Math.abs(raw) <= limit
  );
}

export function isBillValue(raw: unknown): raw is BillValue {
  return BILL_VALUES.some((value) => value === raw);
}

export function isValidPid(raw: unknown): raw is number {
  return isInt(raw, 0, PID_MAX);
}

export function checkEnvelope(
  raw: Dict,
  type: NetworkMessage["t"],
): string | null {
  if (raw.v !== PROTOCOL_VERSION) {
    return "version";
  }
  if (raw.t !== type) {
    return "wrong-type";
  }
  return null;
}

export function validateList<T>(
  raw: unknown,
  maxLength: number,
  validateItem: (item: unknown) => ParseResult<T>,
  listReason: string,
): ParseResult<readonly T[]> {
  if (!Array.isArray(raw) || raw.length > maxLength) {
    return fail(listReason);
  }
  const items: T[] = [];
  for (const item of raw) {
    const result = validateItem(item);
    if (!result.ok) {
      return result;
    }
    items.push(result.value);
  }
  return { ok: true, value: items };
}

export function expectArray(
  raw: unknown,
  length: number,
): readonly unknown[] | null {
  if (!Array.isArray(raw) || raw.length !== length) {
    return null;
  }
  return raw;
}
