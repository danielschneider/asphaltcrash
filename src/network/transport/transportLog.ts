import { debugLog } from "../../config/debugLog";
import type { ChannelKind } from "../../types/network";
import type { NetworkMessage } from "../protocol/messages";

type HighFrequencyTag = "in" | "snap";
type TagCounts = Record<HighFrequencyTag, number>;

const LOG_EVERY = 60;

export interface TransportLog {
  logSend(message: NetworkMessage, channel: ChannelKind, open: boolean): void;
  logRecv(message: NetworkMessage): void;
}

function isHighFrequency(message: NetworkMessage): message is NetworkMessage & {
  t: HighFrequencyTag;
} {
  return message.t === "in" || message.t === "snap";
}

// Per-tag counters for high-frequency messages; other tags are logged individually.
export function createTransportLog(): TransportLog {
  const sendCounts: TagCounts = { in: 0, snap: 0 };
  const recvCounts: TagCounts = { in: 0, snap: 0 };
  return {
    logSend(message, channel, open) {
      if (isHighFrequency(message)) {
        sendCounts[message.t] += 1;
        if (sendCounts[message.t] % LOG_EVERY === 0) {
          debugLog(
            "mp:net",
            () => `send ${message.t} n=${sendCounts[message.t]} open=${open}`,
          );
        }
        return;
      }
      debugLog(
        "mp:net",
        () => `send t=${message.t} ch=${channel} open=${open}`,
      );
    },
    logRecv(message) {
      if (isHighFrequency(message)) {
        recvCounts[message.t] += 1;
        if (recvCounts[message.t] % LOG_EVERY === 0) {
          debugLog(
            "mp:net",
            () => `recv ${message.t} n=${recvCounts[message.t]}`,
          );
        }
        return;
      }
      debugLog("mp:net", () => `recv t=${message.t}`);
    },
  };
}
