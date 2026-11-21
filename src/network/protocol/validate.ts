import { gameConfig } from "../../config/gameConfig";
import {
  BILL_VALUES,
  GAME_MODES,
  type BillValue,
  type GameMode,
} from "../../types/game";
import {
  EVENT_KINDS,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  type ConfigValue,
  type EventMessage,
  type InputMessage,
  type LobbyKind,
  type LobbyMessageBody,
  type LobbyPlayer,
  type MatchConfigShape,
  type NetworkMessage,
  type RejectMessage,
  type ReadyMessage,
  type RejectReason,
  type SnapBillItem,
  type SnapCarItem,
  type SnapMessage,
  type SpawnItem,
  type StartMessage,
  type WelcomeMessage,
} from "./messages";
import type { PeerId } from "../../types/network";

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export interface HelloFields {
  readonly name: string;
  readonly token: string;
}

export interface InvalidCounter {
  record(peerId: PeerId, nowMs: number): void;
  count(peerId: PeerId): number;
  shouldDisconnect(peerId: PeerId, nowMs: number): boolean;
}

export const INVALID_WINDOW_MS = 5000;
export const INVALID_DISCONNECT_COUNT = 3;

const PID_MAX = gameConfig.maxCars - 1;
const POS_LIMIT = 100000;
const VEL_LIMIT = 10000;
const ANGLE_WIRE_LIMIT = 3142;
const SCORE_MAX = 1_000_000_000;
const FLAGS_MAX = 31;
const SEQ_MAX = Number.MAX_SAFE_INTEGER;
const TOKEN_PATTERN = /^[A-Za-z0-9]{16}$/;
const CONTROL_CHAR_PATTERN = /\p{Cc}/u;

type Dict = Record<string, unknown>;

function fail(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason };
}

function isRecord(raw: unknown): raw is Dict {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function isInt(raw: unknown, min: number, max: number): raw is number {
  return (
    typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max
  );
}

function isBoundedNumber(raw: unknown, limit: number): raw is number {
  return (
    typeof raw === "number" && Number.isFinite(raw) && Math.abs(raw) <= limit
  );
}

function isBillValue(raw: unknown): raw is BillValue {
  return BILL_VALUES.some((value) => value === raw);
}

function isGameMode(raw: unknown): raw is GameMode {
  return GAME_MODES.some((mode) => mode === raw);
}

function isEventKind(raw: unknown): raw is EventMessage["k"] {
  return EVENT_KINDS.some((kind) => kind === raw);
}

export function isValidPid(raw: unknown): raw is number {
  return isInt(raw, 0, PID_MAX);
}

function checkEnvelope(raw: Dict, type: NetworkMessage["t"]): string | null {
  if (raw.v !== PROTOCOL_VERSION) {
    return "version";
  }
  if (raw.t !== type) {
    return "wrong-type";
  }
  return null;
}

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

function validateList<T>(
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
    gameConfig.maxBillsOnField,
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

function expectArray(raw: unknown, length: number): readonly unknown[] | null {
  if (!Array.isArray(raw) || raw.length !== length) {
    return null;
  }
  return raw;
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
  const badPayload = fail("field:d");
  switch (raw.k) {
    case "pick": {
      const d = expectArray(raw.d, 3);
      if (d === null) return badPayload;
      const [pid, billId, value] = d;
      if (!isValidPid(pid) || !isInt(billId, 0, SEQ_MAX) || !isBillValue(value))
        return badPayload;
      return {
        ok: true,
        value: {
          v: PROTOCOL_VERSION,
          t: "ev",
          k: "pick",
          d: [pid, billId, value],
        },
      };
    }
    case "drop": {
      const d = expectArray(raw.d, 2);
      if (d === null) return badPayload;
      const [pid, count] = d;
      if (!isValidPid(pid) || !isInt(count, 0, gameConfig.cargoCapacity))
        return badPayload;
      return {
        ok: true,
        value: { v: PROTOCOL_VERSION, t: "ev", k: "drop", d: [pid, count] },
      };
    }
    case "deliv": {
      const d = expectArray(raw.d, 2);
      if (d === null) return badPayload;
      const [pid, amount] = d;
      if (!isValidPid(pid) || !isInt(amount, 0, SCORE_MAX)) return badPayload;
      return {
        ok: true,
        value: { v: PROTOCOL_VERSION, t: "ev", k: "deliv", d: [pid, amount] },
      };
    }
    case "hit": {
      const d = expectArray(raw.d, 3);
      if (d === null) return badPayload;
      const [attackerPid, victimPid, impulse] = d;
      if (!isValidPid(attackerPid) || !isValidPid(victimPid)) return badPayload;
      if (typeof impulse !== "number" || !Number.isFinite(impulse))
        return badPayload;
      return {
        ok: true,
        value: {
          v: PROTOCOL_VERSION,
          t: "ev",
          k: "hit",
          d: [attackerPid, victimPid, impulse],
        },
      };
    }
    case "kill": {
      const d = expectArray(raw.d, 2);
      if (d === null) return badPayload;
      const [attackerPid, victimPid] = d;
      if (!isValidPid(attackerPid) || !isValidPid(victimPid)) return badPayload;
      return {
        ok: true,
        value: {
          v: PROTOCOL_VERSION,
          t: "ev",
          k: "kill",
          d: [attackerPid, victimPid],
        },
      };
    }
    case "respawn": {
      const d = expectArray(raw.d, 4);
      if (d === null) return badPayload;
      const [pid, x, y, a] = d;
      if (
        !isValidPid(pid) ||
        !isBoundedNumber(x, POS_LIMIT) ||
        !isBoundedNumber(y, POS_LIMIT)
      ) {
        return badPayload;
      }
      if (typeof a !== "number" || !Number.isFinite(a)) return badPayload;
      return {
        ok: true,
        value: {
          v: PROTOCOL_VERSION,
          t: "ev",
          k: "respawn",
          d: [pid, x, y, a],
        },
      };
    }
    case "billNew": {
      const d = expectArray(raw.d, 4);
      if (d === null) return badPayload;
      const [id, x, y, value] = d;
      if (
        !isInt(id, 0, SEQ_MAX) ||
        !isBoundedNumber(x, POS_LIMIT) ||
        !isBoundedNumber(y, POS_LIMIT)
      ) {
        return badPayload;
      }
      if (!isBillValue(value)) return badPayload;
      return {
        ok: true,
        value: {
          v: PROTOCOL_VERSION,
          t: "ev",
          k: "billNew",
          d: [id, x, y, value],
        },
      };
    }
    case "timer": {
      const d = expectArray(raw.d, 1);
      if (d === null) return badPayload;
      const [remainingMs] = d;
      if (!isInt(remainingMs, 0, SEQ_MAX)) return badPayload;
      return {
        ok: true,
        value: { v: PROTOCOL_VERSION, t: "ev", k: "timer", d: [remainingMs] },
      };
    }
  }
}

export function validateMessage(raw: unknown): ParseResult<NetworkMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  switch (raw.t) {
    case "snap":
      return validateSnapPayload(raw);
    case "in":
      return validateInputPayload(raw);
    case "ev":
      return validateEventPayload(raw);
    case "welcome":
      return validateWelcomePayload(raw);
    case "reject":
      return validateRejectPayload(raw);
    case "start":
      return validateStart(raw);
    case "ready":
      return validateReadyEnvelope(raw);
    case undefined:
      return fail("field:t");
    default:
      if (isKnownMessageType(raw.t)) return fail("not-implemented");
      return typeof raw.t === "string" ? fail("unknown-type") : fail("field:t");
  }
}

function isKnownMessageType(raw: unknown): boolean {
  return MESSAGE_TYPES.some((type) => type === raw);
}

const REJECT_REASONS: readonly RejectReason[] = [
  "version",
  "full",
  "running",
  "invalid",
];

function isRejectReason(raw: unknown): raw is RejectReason {
  return REJECT_REASONS.some((reason) => reason === raw);
}

function isLobbyKind(raw: unknown): raw is LobbyKind {
  return raw === "h" || raw === "b";
}

function validateLobbyPlayer(raw: unknown): ParseResult<LobbyPlayer> {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return fail("field:player");
  }
  const [pid, name, kind, ready] = raw;
  if (!isValidPid(pid) || typeof name !== "string") {
    return fail("field:player");
  }
  if (!isLobbyKind(kind) || typeof ready !== "boolean") {
    return fail("field:player");
  }
  return { ok: true, value: [pid, name, kind, ready] };
}

function validateConfig(raw: unknown): ParseResult<MatchConfigShape> {
  if (!isRecord(raw)) {
    return fail("field:cfg");
  }
  const cfg: Record<string, ConfigValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value !== "number" &&
      typeof value !== "boolean" &&
      typeof value !== "string"
    ) {
      return fail("field:cfg");
    }
    cfg[key] = value;
  }
  return { ok: true, value: cfg };
}

function validateLobbyBody(raw: unknown): ParseResult<LobbyMessageBody> {
  if (!isRecord(raw)) {
    return fail("field:lobby");
  }
  const players = validateList(
    raw.players,
    gameConfig.maxCars,
    validateLobbyPlayer,
    "field:players",
  );
  if (!players.ok) {
    return players;
  }
  if (!isInt(raw.bots, 0, gameConfig.maxCars)) {
    return fail("field:bots");
  }
  const cfg = validateConfig(raw.cfg);
  if (!cfg.ok) {
    return cfg;
  }
  return {
    ok: true,
    value: { players: players.value, bots: raw.bots, cfg: cfg.value },
  };
}

function validateWelcomePayload(raw: unknown): ParseResult<WelcomeMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "welcome");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isValidPid(raw.pid)) {
    return fail("field:pid");
  }
  const lobby = validateLobbyBody(raw.lobby);
  if (!lobby.ok) {
    return lobby;
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "welcome",
      pid: raw.pid,
      lobby: lobby.value,
    },
  };
}

function validateRejectPayload(raw: unknown): ParseResult<RejectMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "reject");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isRejectReason(raw.reason)) {
    return fail("field:reason");
  }
  return {
    ok: true,
    value: { v: PROTOCOL_VERSION, t: "reject", reason: raw.reason },
  };
}

export function validateHello(raw: unknown): ParseResult<HelloFields> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  if (raw.v !== PROTOCOL_VERSION) {
    return fail("version");
  }
  if (typeof raw.name !== "string") {
    return fail("field:name");
  }
  const name = raw.name.trim();
  if (name.length < 1 || name.length > 16 || CONTROL_CHAR_PATTERN.test(name)) {
    return fail("field:name");
  }
  if (typeof raw.token !== "string" || !TOKEN_PATTERN.test(raw.token)) {
    return fail("field:token");
  }
  return { ok: true, value: { name, token: raw.token } };
}

const SEED_MAX = 0xffff_ffff;
const MATCH_SECONDS_MIN = 1;
const MATCH_SECONDS_MAX = 600;

function validateSpawnItem(raw: unknown): ParseResult<SpawnItem> {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return fail("field:spawn");
  }
  const [pid, x, y, angle] = raw;
  if (!isValidPid(pid)) {
    return fail("pid-range");
  }
  if (!isBoundedNumber(x, POS_LIMIT) || !isBoundedNumber(y, POS_LIMIT)) {
    return fail("field:spawn-pos");
  }
  if (typeof angle !== "number" || !Number.isFinite(angle)) {
    return fail("field:spawn-angle");
  }
  return { ok: true, value: [pid, x, y, angle] };
}

export function validateStart(raw: unknown): ParseResult<StartMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "start");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.mid, 0, SEQ_MAX)) {
    return fail("field:mid");
  }
  if (!isInt(raw.seed, 0, SEED_MAX)) {
    return fail("field:seed");
  }
  const cfg = validateConfig(raw.cfg);
  if (!cfg.ok) {
    return cfg;
  }
  const gameMode = cfg.value.gameMode ?? "cash";
  if (!isGameMode(gameMode)) {
    return fail("field:gameMode");
  }
  const matchSeconds = cfg.value.matchSeconds;
  if (
    typeof matchSeconds !== "number" ||
    !Number.isFinite(matchSeconds) ||
    matchSeconds < MATCH_SECONDS_MIN ||
    matchSeconds > MATCH_SECONDS_MAX
  ) {
    return fail("field:matchSeconds");
  }
  const spawns = validateList(
    raw.spawns,
    gameConfig.maxCars,
    validateSpawnItem,
    "field:spawns",
  );
  if (!spawns.ok) {
    return spawns;
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "start",
      mid: raw.mid,
      seed: raw.seed,
      cfg: { ...cfg.value, gameMode },
      spawns: spawns.value,
    },
  };
}

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

function validateReadyEnvelope(raw: Dict): ParseResult<ReadyMessage> {
  const envelopeError = checkEnvelope(raw, "ready");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  if (!isInt(raw.mid, 0, SEQ_MAX)) {
    return fail("field:mid");
  }
  return { ok: true, value: { v: PROTOCOL_VERSION, t: "ready", mid: raw.mid } };
}

export function createInvalidCounter(): InvalidCounter {
  const totals = new Map<PeerId, number>();
  const recent = new Map<PeerId, number[]>();

  return {
    record(peerId, nowMs) {
      totals.set(peerId, (totals.get(peerId) ?? 0) + 1);
      const times = recent.get(peerId) ?? [];
      times.push(nowMs);
      if (times.length > INVALID_DISCONNECT_COUNT) {
        times.shift();
      }
      recent.set(peerId, times);
    },
    count(peerId) {
      return totals.get(peerId) ?? 0;
    },
    shouldDisconnect(peerId, nowMs) {
      const times = recent.get(peerId);
      if (times === undefined || times.length < INVALID_DISCONNECT_COUNT) {
        return false;
      }
      const oldest = times[times.length - INVALID_DISCONNECT_COUNT];
      return oldest !== undefined && nowMs - oldest <= INVALID_WINDOW_MS;
    },
  };
}
