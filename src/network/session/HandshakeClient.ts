import type { PeerId } from "../../types/network";
import {
  PROTOCOL_VERSION,
  type HelloMessage,
  type NetworkMessage,
  type RejectReason,
} from "../protocol/messages";
import type { Transport, Unsubscribe } from "../transport/Transport";

export type HandshakeOutcome =
  | { readonly kind: "welcome"; readonly pid: number }
  | { readonly kind: "reject"; readonly reason: RejectReason };

export function sendHello(
  transport: Transport,
  name: string,
  token: string,
): void {
  const hello: HelloMessage = {
    v: PROTOCOL_VERSION,
    t: "hello",
    name,
    token,
  };
  transport.send(hello, "reliable");
}

export interface HandshakeClient {
  readonly outcome: () => HandshakeOutcome | null;
  onOutcome(handler: (outcome: HandshakeOutcome) => void): Unsubscribe;
  dispose(): void;
}

export function attachHandshakeClient(
  transport: Transport,
  hostPeerId: PeerId,
): HandshakeClient {
  let current: HandshakeOutcome | null = null;
  const listeners = new Set<(outcome: HandshakeOutcome) => void>();

  const settle = (outcome: HandshakeOutcome): void => {
    if (current !== null) {
      return;
    }
    current = outcome;
    for (const listener of listeners) {
      listener(outcome);
    }
  };

  const unsubscribe = transport.onMessage((msg: NetworkMessage, from) => {
    if (from !== hostPeerId) {
      return;
    }
    if (msg.t === "welcome") {
      settle({ kind: "welcome", pid: msg.pid });
    } else if (msg.t === "reject") {
      settle({ kind: "reject", reason: msg.reason });
    }
  });

  return {
    outcome: () => current,
    onOutcome(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}
