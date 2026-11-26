import { gameConfig } from "../../../config/gameConfig";
import { isBotDifficulty, isGameMode } from "../../../types/game";
import {
  PROTOCOL_VERSION,
  type NameItem,
  type SpawnItem,
  type StartMessage,
} from "../messages";
import {
  POS_LIMIT,
  SEQ_MAX,
  checkEnvelope,
  fail,
  isBoundedNumber,
  isInt,
  isRecord,
  isValidPid,
  validateList,
  type ParseResult,
} from "./primitives";
import { validateConfig } from "./lobby";

const SEED_MAX = 0xffff_ffff;
const MATCH_SECONDS_MIN = 1;
const MATCH_SECONDS_MAX = 600;
const NAME_ITEM_MAX_CHARS = 16;

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

function validateNameItem(raw: unknown): ParseResult<NameItem> {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return fail("field:name-item");
  }
  const [pid, name] = raw;
  if (!isValidPid(pid)) {
    return fail("pid-range");
  }
  if (typeof name !== "string" || name.length > NAME_ITEM_MAX_CHARS) {
    return fail("field:name");
  }
  return { ok: true, value: [pid, name] };
}

function validateNames(raw: unknown): ParseResult<readonly NameItem[]> {
  if (raw === undefined) {
    return { ok: true, value: [] };
  }
  return validateList(raw, gameConfig.maxCars, validateNameItem, "field:names");
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
  if (!isBotDifficulty(cfg.value.botDifficulty)) {
    return fail("field:botDifficulty");
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
  const names = validateNames(raw.names);
  if (!names.ok) {
    return names;
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
      names: names.value,
    },
  };
}
