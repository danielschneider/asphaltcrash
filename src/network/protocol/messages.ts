import type { BillValue } from "../../types/game";

export const PROTOCOL_VERSION = 1 as const;

export const EVENT_KINDS = [
  "pick",
  "drop",
  "deliv",
  "hit",
  "kill",
  "respawn",
  "billNew",
  "timer",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export type SnapCarItem = readonly [
  pid: number,
  x: number,
  y: number,
  a: number,
  vx: number,
  vy: number,
  hp: number,
  flags: number,
  cargo: number,
  score: number,
];

export type SnapBillItem = readonly [
  id: number,
  x: number,
  y: number,
  v: BillValue,
];

export interface SnapMessage {
  readonly v: typeof PROTOCOL_VERSION;
  readonly t: "snap";
  readonly k: number;
  readonly ak: number;
  readonly tm: number;
  readonly cars: readonly SnapCarItem[];
  readonly bills: readonly SnapBillItem[];
}

export interface InputMessage {
  readonly v: typeof PROTOCOL_VERSION;
  readonly t: "in";
  readonly s: number;
  readonly th: number;
  readonly st: number;
  readonly a: 0 | 1;
}

interface EventEnvelope<K extends EventKind, D extends readonly unknown[]> {
  readonly v: typeof PROTOCOL_VERSION;
  readonly t: "ev";
  readonly k: K;
  readonly d: D;
}

export type PickEventMessage = EventEnvelope<
  "pick",
  readonly [pid: number, billId: number, value: BillValue]
>;
export type DropEventMessage = EventEnvelope<
  "drop",
  readonly [pid: number, count: number]
>;
export type DelivEventMessage = EventEnvelope<
  "deliv",
  readonly [pid: number, amount: number]
>;
export type HitEventMessage = EventEnvelope<
  "hit",
  readonly [attackerPid: number, victimPid: number, impulse: number]
>;
export type KillEventMessage = EventEnvelope<
  "kill",
  readonly [attackerPid: number, victimPid: number]
>;
export type RespawnEventMessage = EventEnvelope<
  "respawn",
  readonly [pid: number, x: number, y: number, a: number]
>;
export type BillNewEventMessage = EventEnvelope<
  "billNew",
  readonly [id: number, x: number, y: number, v: BillValue]
>;
export type TimerEventMessage = EventEnvelope<
  "timer",
  readonly [remainingMs: number]
>;

export type EventMessage =
  | PickEventMessage
  | DropEventMessage
  | DelivEventMessage
  | HitEventMessage
  | KillEventMessage
  | RespawnEventMessage
  | BillNewEventMessage
  | TimerEventMessage;

export type NetworkMessage =
  SnapMessage | InputMessage | EventMessage | ControlMessage;

export type NetworkMessageType = NetworkMessage["t"];

export const CONTROL_MESSAGE_TYPES = [
  "hello",
  "welcome",
  "reject",
  "lobby",
  "cfg",
  "start",
  "ready",
  "pause",
  "end",
  "bye",
  "ping",
  "pong",
  "resume",
  "resumeOk",
] as const;

export const MESSAGE_TYPES = [
  "snap",
  "in",
  "ev",
  ...CONTROL_MESSAGE_TYPES,
] as const;

export type ControlMessageType = (typeof CONTROL_MESSAGE_TYPES)[number];

export type RejectReason = "version" | "full" | "running" | "invalid";
export type LobbyKind = "h" | "b";
export type ConfigValue = number | boolean | string;
export type MatchConfigShape = Readonly<Record<string, ConfigValue>>;
export type PauseReason = "host" | "player";

export type LobbyPlayer = readonly [
  pid: number,
  name: string,
  kind: LobbyKind,
  ready: boolean,
];

export type SpawnItem = readonly [
  pid: number,
  x: number,
  y: number,
  angle: number,
];

export type ScoreItem = readonly [
  pid: number,
  cash: number,
  kills: number,
  delivered: number,
];

interface ControlEnvelope<T extends ControlMessageType> {
  readonly v: typeof PROTOCOL_VERSION;
  readonly t: T;
}

export interface HelloMessage extends ControlEnvelope<"hello"> {
  readonly name: string;
  readonly token: string;
}

export interface WelcomeMessage extends ControlEnvelope<"welcome"> {
  readonly pid: number;
  readonly lobby: LobbyMessageBody;
}

export interface RejectMessage extends ControlEnvelope<"reject"> {
  readonly reason: RejectReason;
}

export interface LobbyMessageBody {
  readonly players: readonly LobbyPlayer[];
  readonly bots: number;
  readonly cfg: MatchConfigShape;
}

export interface LobbyMessage extends ControlEnvelope<"lobby"> {
  readonly players: readonly LobbyPlayer[];
  readonly bots: number;
  readonly cfg: MatchConfigShape;
}

export interface CfgMessage extends ControlEnvelope<"cfg"> {
  readonly cfg: MatchConfigShape;
}

export interface StartMessage extends ControlEnvelope<"start"> {
  readonly mid: number;
  readonly seed: number;
  readonly cfg: MatchConfigShape;
  readonly spawns: readonly SpawnItem[];
}

export interface ReadyMessage extends ControlEnvelope<"ready"> {
  readonly mid: number;
}

export interface PauseMessage extends ControlEnvelope<"pause"> {
  readonly on: boolean;
  readonly why: PauseReason;
}

export interface EndMessage extends ControlEnvelope<"end"> {
  readonly mid: number;
  readonly scores: readonly ScoreItem[];
  readonly winners: readonly number[];
}

export interface ByeMessage extends ControlEnvelope<"bye"> {
  readonly why: string;
}

export interface PingMessage extends ControlEnvelope<"ping"> {
  readonly c: number;
}

export interface PongMessage extends ControlEnvelope<"pong"> {
  readonly c: number;
  readonly h: number;
}

export interface ResumeMessage extends ControlEnvelope<"resume"> {
  readonly token: string;
  readonly mid: number;
}

export interface ResumeOkMessage extends ControlEnvelope<"resumeOk"> {
  readonly pid: number;
  readonly tick: number;
}

export type ControlMessage =
  | HelloMessage
  | WelcomeMessage
  | RejectMessage
  | LobbyMessage
  | CfgMessage
  | StartMessage
  | ReadyMessage
  | PauseMessage
  | EndMessage
  | ByeMessage
  | PingMessage
  | PongMessage
  | ResumeMessage
  | ResumeOkMessage;
