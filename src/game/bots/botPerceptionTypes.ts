import type { GameMode } from "../../types/game";

export interface BotSelfView {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speed: number;
  readonly hp: number;
  readonly cargo: number;
  readonly pid: number;
  readonly baseX: number;
  readonly baseY: number;
}

export interface BotBillView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface BotEnemyView {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hp: number;
}

export interface BotPerception {
  readonly gameMode: GameMode;
  readonly self: BotSelfView;
  readonly bills: readonly BotBillView[];
  readonly enemies: readonly BotEnemyView[];
  readonly tick: number;
  readonly fallback: { readonly x: number; readonly y: number };
}
