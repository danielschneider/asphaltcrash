export const SESSION_STATE = {
  idle: "idle",
  playingSolo: "playingSolo",
  ended: "ended",
  endedNetwork: "endedNetwork",
  hostingLobby: "hostingLobby",
  joining: "joining",
  joinedLobby: "joinedLobby",
  playingNetwork: "playingNetwork",
  reconnecting: "reconnecting",
} as const;

export type SessionState = (typeof SESSION_STATE)[keyof typeof SESSION_STATE];
