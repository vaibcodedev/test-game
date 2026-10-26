/** Обмен между игроками: константы и формат состояния окна. */
import type { Item } from "./items";
import { GP } from "./gameplay";

export const TRADE_SLOTS = GP.trade.slots;
export const TRADE_RANGE_TILES = GP.ranges.tradeTiles;
export const TRADE_REQUEST_MS = GP.trade.requestMs;
export const TRADE_CONFIRM_DELAY_MS = GP.trade.confirmDelayMs;

export interface TradeSideView {
  name: string;
  items: (Item | null)[];
  /** Индексы ячеек сумки владельца (-1 — пусто). */
  index: number[];
  gold: number;
  ready: boolean;
  confirm: boolean;
  /** Слоты, изменённые этим обновлением. */
  changed: number[];
  goldChanged: boolean;
}
export interface TradeView {
  mine: TradeSideView;
  theirs: TradeSideView;
  /** Вы ничего не отдаёте, но получаете — подарок. */
  gift: boolean;
  /** Через сколько мс станет доступна кнопка «Обменять». */
  confirmIn: number;
}
