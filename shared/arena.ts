/** PvP-арена: режимы, ранги, Elo, сезоны, карта арены и типы сообщений. */
import { TILE } from "./constants";
import type { ClassId } from "./classes";
import { CELL_BLOCK, CELL_WALL, T, TOWN, Zone, type WorldMap } from "./map";
import { GP } from "./gameplay";
import { T as TX } from "./texts";
import { ARENA_IDS, type ArenaId } from "./arenaCrowd";

/** Распорядитель арены в городе: у врат арены во дворе восточного квартала (shared/town.ts). */
export const ARENA_NPC = {
  x: (TOWN.x + 17) * TILE,
  y: (TOWN.y + 6) * TILE + 16,
};

export type ArenaMode = "1v1" | "2v2";
export const ARENA_MODES: ArenaMode[] = ["1v1", "2v2"];
export const MODE_NAMES: Record<ArenaMode, string> = {
  "1v1": "1×1",
  "2v2": "2×2",
};
export const TEAM_SIZE: Record<ArenaMode, number> = { "1v1": 1, "2v2": 2 };

/**
 * Запреты арены — единый источник для сервера и клиента. Сумка на арене не сохраняется (после боя герой берётся из базы),
 * поэтому предметы (зелья, еда, печати) запрещены целиком; маунт и питомец — тоже. Сервер отвечает на эти сообщения
 * тостом ARENA_BLOCKED_TEXT (ArenaRoom), клиент показывает такие слоты и кнопки серыми с замком (ui/hotbar.ts, ui/hud.ts).
 */
export const ARENA_BLOCKED_MSGS = ["use", "use:base", "equip", "unequip", "swap", "pickup", "mount:toggle", "mount:select", "pet:toggle", "pet:select"] as const;
export const ARENA_BLOCKED_ACTIONS: readonly string[] = ["mount", "pet"];
export const ARENA_BLOCKED_TEXT = TX("ui.arena.blocked");
/** Слот панели запрещён на арене: любой предмет или действие из ARENA_BLOCKED_ACTIONS. */
export function arenaBlocked(ref: object | null | undefined): boolean {
  if (!ref) return false;
  if ("i" in ref) return true;
  return "a" in ref && ARENA_BLOCKED_ACTIONS.includes(String((ref as { a: unknown }).a));
}

/** Урон и лечение героя по герою — модель PvP в data/balance.json pvp (shared/balance.ts): устойчивость по уровню, потолки крита и удара. */
export const START_RATING = GP.arena.startRating;
/** Бой с ботами (соперник не нашёлся): рейтинг меняется слабее — доля от обычного Elo. История и таблица — как обычно. */
export const BOT_RATING_MULT = GP.arena.botRatingMul;
export const ELO_K = GP.arena.eloK;
/** Окно подбора по рейтингу: ±100, затем +50 каждые 10 с ожидания, не больше ±1000. */
export const QUEUE_WINDOW_BASE = GP.arena.queueWindowBase;
export const QUEUE_WINDOW_STEP = GP.arena.queueWindowStep;
export const QUEUE_WINDOW_EVERY_MS = GP.arena.queueWindowEveryMs;
export const QUEUE_WINDOW_MAX = GP.arena.queueWindowMax;
export const ACCEPT_MS = GP.arena.acceptMs;
export const COUNTDOWN_MS = GP.arena.countdownMs;
/** Лимит матча: по времени побеждает бо́льший % здоровья. 90 с (было 180): бой танка с лекарем не тянется бесконечно, дуэль бойцов ~15–20 с. */
export const MATCH_MS = GP.arena.matchMs;
/** Одних и тех же соперников нельзя получить больше 3 раз подряд. */
export const MAX_REPEAT = GP.arena.maxRepeat;
export const SEASON_DAYS = GP.arena.seasonDays;
/** Мягкий сброс в конце сезона: рейтинг сдвигается к 1000 на половину расстояния. */
export const SEASON_RESET_KEEP = GP.arena.seasonResetKeep;
export const HISTORY_SIZE = GP.arena.historySize;
export const LEADERBOARD_SIZE = GP.arena.leaderboardSize;

export function queueWindow(waitedMs: number): number {
  return Math.min(
    QUEUE_WINDOW_MAX,
    QUEUE_WINDOW_BASE +
      Math.floor(waitedMs / QUEUE_WINDOW_EVERY_MS) * QUEUE_WINDOW_STEP,
  );
}

/** Ожидаемый результат по Elo для рейтинга a против b. */
export function eloExpected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}
/** Изменение рейтинга: score 1 — победа, 0.5 — ничья, 0 — поражение. */
export function eloDelta(my: number, opp: number, score: number): number {
  return Math.round(ELO_K * (score - eloExpected(my, opp)));
}

export interface RankDef {
  id: string;
  name: string;
  min: number;
  color: string;
  title: string;
  /** Уникальный предмет — награда за сезон. */
  reward: string;
}
export const RANKS: RankDef[] = [
  {
    id: "bronze",
    name: "Бронза",
    min: 0,
    color: "#c8844e",
    title: "Бронзовый боец",
    reward: "arena_bronze",
  },
  {
    id: "silver",
    name: "Серебро",
    min: 1100,
    color: "#c9d2de",
    title: "Серебряный дуэлянт",
    reward: "arena_silver",
  },
  {
    id: "gold",
    name: "Золото",
    min: 1300,
    color: "#f0c050",
    title: "Золотой гладиатор",
    reward: "arena_gold",
  },
  {
    id: "platinum",
    name: "Платина",
    min: 1500,
    color: "#6fe0cc",
    title: "Платиновый чемпион",
    reward: "arena_platinum",
  },
  {
    id: "diamond",
    name: "Алмаз",
    min: 1700,
    color: "#8ab8ff",
    title: "Алмазная легенда",
    reward: "arena_diamond",
  },
];
export function rankOf(rating: number): RankDef {
  let r = RANKS[0];
  for (const x of RANKS) if (rating >= x.min) r = x;
  return r;
}
export const rankById = (id: string) => RANKS.find((r) => r.id === id);

// ---------- сообщения ----------
export interface ModeRating {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  rank: string;
  place: number | null;
}
export interface QueueStatus {
  mode: ArenaMode;
  waitedMs: number;
  window: number;
  withParty: boolean;
  note?: string;
}
export interface PartyMember {
  name: string;
  cls: ClassId;
  level: number;
  online: boolean;
}
export interface PartyState {
  members: PartyMember[];
}
export interface ArenaInfo {
  season: { id: number; endsAt: number; now: number };
  ratings: Record<ArenaMode, ModeRating>;
  queue: QueueStatus | null;
  pending: boolean;
  party: PartyState | null;
  titles: string[];
  title: string;
  frame: string;
}
export interface MatchFoundMsg {
  mode: ArenaMode;
  ms: number;
  teams: { name: string; cls: ClassId; level: number; rating: number }[][];
  accepted: string[];
  /** Предложение боя с ботом (без рейтинга). */
  bot?: boolean;
}
export interface ArenaPlayerResult {
  name: string;
  cls: ClassId;
  team: number;
  damage: number;
  healing: number;
  kills: number;
  deaths: number;
  left: boolean;
  won: boolean;
  draw: boolean;
  ratingBefore: number;
  ratingAfter: number;
}
export interface ArenaResultMsg {
  mode: ArenaMode;
  winner: number; // 0 — ничья, 1 или 2 — номер команды
  reason: "kill" | "time" | "leave";
  durationMs: number;
  players: ArenaPlayerResult[];
  /** Бой с ботами — рейтинг не менялся. */
  bot?: boolean;
}
export interface LeaderRow {
  place: number;
  name: string;
  cls: ClassId;
  rating: number;
  wins: number;
  losses: number;
}
export interface HistoryRow {
  id: number;
  mode: ArenaMode;
  at: number;
  result: "win" | "loss" | "draw";
  delta: number;
  rating: number;
  allies: string[];
  enemies: string[];
  damage: number;
  healing: number;
  durationMs: number;
  /** Бой с ботами: рейтинг ×BOT_RATING_MULT. */
  bot?: boolean;
}
export interface Reservation {
  sessionId: string;
  room: { name: string; roomId: string; processId: string };
}

/** Событие боя для толпы (сервер → все в матче): first — первая кровь, kill — убийство, win — победа, draw — ничья; name — убийца или победитель. */
export interface ArenaEvMsg { k: "first" | "kill" | "win" | "draw"; name?: string }

// ---------- карты арены ----------
/** Арена-амфитеатр: песок — эллипс rx×ry px с центром (w/2·TILE, arenaCy); арт и толпа — client/public/assets/arena (tools/gen/arena-art.ts). */
export interface ArenaVariant {
  id: ArenaId;
  name: string;
  mode: ArenaMode;
  w: number;
  h: number;
  rx: number;
  ry: number;
  /** Укрытия: смещения от центра, px; симметрично слева-справа. */
  cover: [number, number][];
}
export const ARENA_VARIANTS: Record<ArenaId, ArenaVariant> = {
  ash: { id: "ash", name: "Пепельный колизей", mode: "2v2", w: 38, h: 28, rx: 430, ry: 250, cover: [[-125, -78], [125, -78], [-125, 78], [125, 78]] },
  sun: { id: "sun", name: "Солнечный амфитеатр", mode: "2v2", w: 38, h: 28, rx: 430, ry: 250, cover: [[-125, -78], [125, -78], [-125, 78], [125, 78]] },
  pit: { id: "pit", name: "Бойцовская яма", mode: "1v1", w: 26, h: 20, rx: 262, ry: 168, cover: [[-70, 0], [70, 0]] },
  frost: { id: "frost", name: "Ледяной круг", mode: "1v1", w: 26, h: 20, rx: 250, ry: 160, cover: [[-62, -52], [62, -52], [-62, 52], [62, 52]] },
};
export const arenaCy = (v: ArenaVariant) => Math.round(v.h * TILE * 0.54);
/** Карты режима: матч получает случайную из них. */
export function arenasOf(mode: ArenaMode): ArenaId[] {
  return ARENA_IDS.filter((id) => ARENA_VARIANTS[id].mode === mode);
}
export const pickArena = (mode: ArenaMode): ArenaId => {
  const l = arenasOf(mode);
  return l[Math.floor(Math.random() * l.length)];
};
export const isArenaId = (v: unknown): v is ArenaId => typeof v === "string" && (ARENA_IDS as readonly string[]).includes(v);
/** Объект-укрытие (колонна, обломок, глыба) в атласе: arena_cover_<id>. */
export const arenaCoverKind = (id: ArenaId) => `arena_cover_${id}`;

/** Овальная арена: ходить можно только по песку, укрытия — клетки-преграды. */
export function generateArenaMap(id: ArenaId = "ash"): WorldMap {
  const v = ARENA_VARIANTS[id], w = v.w, h = v.h, cx = (w * TILE) / 2, cy = arenaCy(v);
  const vtx = new Uint8Array((w + 1) * (h + 1)).fill(T.Floor);
  const cell = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h).fill(Zone.Arena);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = ((x + 0.5) * TILE - cx) / (v.rx - 12), dy = ((y + 0.5) * TILE - cy) / (v.ry - 12);
      if (dx * dx + dy * dy > 1) cell[y * w + x] |= CELL_BLOCK | CELL_WALL;
    }
  const objects: WorldMap["objects"] = [];
  for (const [dx, dy] of v.cover) {
    const px = cx + dx, py = cy + dy;
    cell[Math.floor((py - 6) / TILE) * w + Math.floor(px / TILE)] |= CELL_BLOCK | CELL_WALL;
    objects.push({ kind: arenaCoverKind(id), x: px, y: py + 4 });
  }
  return {
    w, h, seed: 0, vtx, cell, zone, objects, spawns: [], bosses: [], nodes: [],
    playerSpawn: { x: cx - (v.rx - 70), y: cy }, merchant: { x: -1000, y: -1000 }, merchants: [],
  };
}
/** Точки появления: команда 1 слева, команда 2 справа. */
export function arenaSpawn(team: number, slot: number, id: ArenaId = "ash"): { x: number; y: number } {
  const v = ARENA_VARIANTS[id], cx = (v.w * TILE) / 2;
  return { x: team === 1 ? cx - (v.rx - 70) : cx + (v.rx - 70), y: arenaCy(v) - 48 + slot * 96 };
}
