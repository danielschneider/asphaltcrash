import type {
  ChannelKind,
  PeerEvent,
  PeerId,
  PeerRole,
} from "../../types/network";
import type { NetworkMessage } from "../protocol/messages";

export type Unsubscribe = () => void;

export interface Transport {
  readonly role: PeerRole;
  send(message: NetworkMessage, channel: ChannelKind): void;
  onMessage(
    handler: (msg: NetworkMessage, fromPeerId: PeerId) => void,
  ): Unsubscribe;
  onPeerChange(handler: (event: PeerEvent) => void): Unsubscribe;
  close(): void;
}
