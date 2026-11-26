import { MESSAGE_TYPES, type NetworkMessage } from "../messages";
import { validateEventPayload } from "./events";
import { validateInputPayload } from "./input";
import { validateEndEnvelope, validateReadyEnvelope } from "./match";
import {
  validateLobbyEnvelope,
  validateRejectPayload,
  validateWelcomePayload,
} from "./lobby";
import { validateSnapPayload } from "./snap";
import { validateStart } from "./start";
import { validatePingPayload, validatePongPayload } from "./sync";
import { fail, isRecord, type ParseResult } from "./primitives";

function isKnownMessageType(raw: unknown): boolean {
  return MESSAGE_TYPES.some((type) => type === raw);
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
    case "lobby":
      return validateLobbyEnvelope(raw);
    case "ready":
      return validateReadyEnvelope(raw);
    case "end":
      return validateEndEnvelope(raw);
    case "ping":
      return validatePingPayload(raw);
    case "pong":
      return validatePongPayload(raw);
    case undefined:
      return fail("field:t");
    default:
      if (isKnownMessageType(raw.t)) return fail("not-implemented");
      return typeof raw.t === "string" ? fail("unknown-type") : fail("field:t");
  }
}
