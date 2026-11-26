import { gameConfig } from "../../../config/gameConfig";
import type { SnapBillItem, SnapCarItem, SnapMessage } from "../messages";
import { PROTOCOL_VERSION } from "../messages";
import {
  ANGLE_WIRE_LIMIT,
  FLAGS_MAX,
  POS_LIMIT,
  SCORE_MAX,
  SEQ_MAX,
  VEL_LIMIT,
  checkEnvelope,
  fail,
  isBillValue,
  isBoundedNumber,
  isInt,
  isRecord,
  isValidPid,
  validateList,
  type ParseResult,
} from "./primitives";

// Bills on field are capped by BillSpawner, but destroyed cars drop cargo as field bills without that cap,
// so a snapshot can carry up to maxBillsOnField plus every car's full cargo.
export const MAX_SNAP_BILLS =
  gameConfig.maxBillsOnField + gameConfig.maxCars * gameConfig.cargoCapacity;

function validateCarItem(raw: unknown): ParseResult<SnapCarItem> {
  if (!Array.isArray(raw) || raw.length !== 10) {
    return fail("field:car");
  }
  const [pid, x, y, a, vx, vy, hp, flags, cargo, score] = raw;
  if (!isValidPid(pid)) {
    return fail("pid-range");
  }
  if (!isBoundedNumber(x, POS_LIMIT) || !isBoundedNumber(y, POS_LIMIT)) {
    return fail("field:pos");
  }
  if (!isInt(a, -ANGLE_WIRE_LIMIT, ANGLE_WIRE_LIMIT)) {
    return fail("field:angle");
  }
  if (!isInt(vx, -VEL_LIMIT, VEL_LIMIT) || !isInt(vy, -VEL_LIMIT, VEL_LIMIT)) {
    return fail("field:vel");
  }
  if (!isInt(hp, 0, 100)) {
    return fail("field:hp");
  }
  if (!isInt(flags, 0, FLAGS_MAX)) {
    return fail("field:flags");
  }
  if (!isInt(cargo, 0, gameConfig.cargoCapacity)) {
    return fail("field:cargo");
  }
  if (!isInt(score, 0, SCORE_MAX)) {
    return fail("field:score");
  }
  return { ok: true, value: [pid, x, y, a, vx, vy, hp, flags, cargo, score] };
}

function validateBillItem(raw: unknown): ParseResult<SnapBillItem> {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return fail("field:bill");
  }
  const [id, x, y, value] = raw;
  if (!isInt(id, 0, SEQ_MAX)) {
    return fail("field:bill-id");
  }
  if (!isBoundedNumber(x, POS_LIMIT) || !isBoundedNumber(y, POS_LIMIT)) {
    return fail("field:bill-pos");
  }
  if (!isBillValue(value)) {
    return fail("field:bill-value");
  }
  return { ok: true, value: [id, x, y, value] };
}

export function validateSnapPayload(raw: unknown): ParseResult<SnapMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "snap");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.k, 0, SEQ_MAX)) {
    return fail("field:k");
  }
  if (!isInt(raw.ak, 0, SEQ_MAX)) {
    return fail("field:ak");
  }
  if (!isInt(raw.tm, 0, SEQ_MAX)) {
    return fail("field:tm");
  }
  const cars = validateList(
    raw.cars,
    gameConfig.maxCars,
    validateCarItem,
    "field:cars",
  );
  if (!cars.ok) {
    return cars;
  }
  const bills = validateList(
    raw.bills,
    MAX_SNAP_BILLS,
    validateBillItem,
    "field:bills",
  );
  if (!bills.ok) {
    return bills;
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "snap",
      k: raw.k,
      ak: raw.ak,
      tm: raw.tm,
      cars: cars.value,
      bills: bills.value,
    },
  };
}
