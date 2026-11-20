import Peer from "peerjs";
import type {
  ConnectOptions,
  DataConnectionLike,
  PeerFactory,
  PeerLike,
} from "./PeerTransport";
import type { PeerId } from "../../types/network";

// Thin adapter over the real PeerJS 1.5.5 Peer; the only module that touches the peerjs runtime.
export function createPeerJsFactory(): PeerFactory {
  return (id?: PeerId): PeerLike => {
    const peer = id === undefined ? new Peer() : new Peer(id);
    return {
      on: (event, handler) => {
        peer.on(event, handler as never);
      },
      connect: (peerId: PeerId, options: ConnectOptions) =>
        peer.connect(peerId, options) as unknown as DataConnectionLike,
      destroy: () => {
        peer.destroy();
      },
    };
  };
}
