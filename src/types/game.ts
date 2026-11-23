export const BOT_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

export function isBotDifficulty(raw: unknown): raw is BotDifficulty {
  return BOT_DIFFICULTIES.some((level) => level === raw);
}

export const GAME_MODES = ["cash", "crashfest"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export function isGameMode(raw: unknown): raw is GameMode {
  return GAME_MODES.some((mode) => mode === raw);
}

export const BILL_VALUES = [10, 20, 50] as const;
export type BillValue = (typeof BILL_VALUES)[number];

export const CAR_FLAG = {
  destroyed: 1,
  respawning: 2,
  boosting: 4,
  braking: 8,
  carrying: 16,
} as const;

export interface CarSnapshot {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly vx: number;
  readonly vy: number;
  readonly hp: number;
  readonly flags: number;
  readonly cargo: number;
  readonly score: number;
}

export interface BillSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: BillValue;
}

export interface MatchSnapshot {
  readonly tick: number;
  readonly timeRemainingMs: number;
  readonly cars: readonly CarSnapshot[];
  readonly bills: readonly BillSnapshot[];
}

export interface PickEvent {
  readonly k: "pick";
  readonly pid: number;
  readonly billId: number;
  readonly value: BillValue;
}

export interface DelivEvent {
  readonly k: "deliv";
  readonly pid: number;
  readonly amount: number;
}

export interface DropEvent {
  readonly k: "drop";
  readonly pid: number;
  readonly count: number;
}

export interface HitEvent {
  readonly k: "hit";
  readonly attackerPid: number;
  readonly victimPid: number;
  readonly impulse: number;
}

export interface KillEvent {
  readonly k: "kill";
  readonly attackerPid: number;
  readonly victimPid: number;
}

export interface RespawnEvent {
  readonly k: "respawn";
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface BillNewEvent {
  readonly k: "billNew";
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: BillValue;
}

export interface TimerEvent {
  readonly k: "timer";
  readonly remainingMs: number;
}

export type SimEvent =
  | PickEvent
  | DelivEvent
  | DropEvent
  | HitEvent
  | KillEvent
  | RespawnEvent
  | BillNewEvent
  | TimerEvent;

export type SimEvents = readonly SimEvent[];

export interface CarView {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly hp: number;
  readonly flags: number;
  readonly cargo: number;
  readonly isLocal: boolean;
  readonly name: string;
}

export interface BillView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: BillValue;
}

export interface BaseView {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArenaView {
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
  readonly bases: readonly BaseView[];
}

export interface WorldView {
  readonly cars: readonly CarView[];
  readonly bills: readonly BillView[];
  readonly arena: ArenaView;
}

export interface MatchSetup {
  readonly gameMode: GameMode;
  readonly seed: number;
  readonly humanPlayerIds: readonly number[];
  readonly botPlayerIds: readonly number[];
  readonly botDifficulty: BotDifficulty;
  readonly matchSeconds: number;
}
