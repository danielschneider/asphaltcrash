import { gameConfig } from "../../../config/gameConfig";
import { isBotDifficulty, isGameMode } from "../../../types/game";
import {
  PROTOCOL_VERSION,
  type ConfigValue,
  type LobbyKind,
  type LobbyMessage,
  type LobbyMessageBody,
  type LobbyPlayer,
  type MatchConfigShape,
  type RejectMessage,
  type RejectReason,
  type WelcomeMessage,
} from "../messages";
import {
  checkEnvelope,
  fail,
  isInt,
  isRecord,
  isValidPid,
  validateList,
  type ParseResult,
} from "./primitives";

export interface HelloFields {
  readonly name: string;
  readonly token: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9]{16}$/;
const CONTROL_CHAR_PATTERN = /\p{Cc}/u;
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

export function validateConfig(raw: unknown): ParseResult<MatchConfigShape> {
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

export function validateWelcomePayload(
  raw: unknown,
): ParseResult<WelcomeMessage> {
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

export function validateRejectPayload(
  raw: unknown,
): ParseResult<RejectMessage> {
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

export function validateLobbyEnvelope(raw: unknown): ParseResult<LobbyMessage> {
  if (!isRecord(raw)) {
    return fail("not-object");
  }
  const envelopeError = checkEnvelope(raw, "lobby");
  if (envelopeError !== null) {
    return fail(envelopeError);
  }
  const body = validateLobbyBody(raw);
  if (!body.ok) {
    return body;
  }
  if (!isGameMode(body.value.cfg.gameMode)) {
    return fail("field:gameMode");
  }
  if (!isBotDifficulty(body.value.cfg.botDifficulty)) {
    return fail("field:botDifficulty");
  }
  return {
    ok: true,
    value: {
      v: PROTOCOL_VERSION,
      t: "lobby",
      players: body.value.players,
      bots: body.value.bots,
      cfg: body.value.cfg,
    },
  };
}
