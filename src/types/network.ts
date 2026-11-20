export type PeerRole = "host" | "client" | "local";

// Named alias documents intent across the network layer; it is not a redundant alias.
// eslint-disable-next-line sonarjs/redundant-type-aliases
export type PeerId = string;

export type ChannelKind = "reliable" | "unreliable";

export interface PeerEvent {
  readonly kind: "open" | "close" | "error";
  readonly peerId: PeerId;
  readonly detail?: string;
}
