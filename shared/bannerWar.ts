/** «Знамёна Предела» (задача 132, шаг 14): данные ивента (data/faction-war.json), основания на Полях, расписание и сообщения сервер ↔ клиент. */
import data from "../data/faction-war.json";
import { TILE } from "./constants";

export type WarFaction = "solgard" | "umbrath";
export const WAR_FACTIONS: WarFaction[] = ["solgard", "umbrath"];
export type WarPhase = "idle" | "prep" | "battle" | "result";
export type SideBonus = "xpGold" | "respawn" | "mats";
export type HeartBonus = "speed" | "squads" | "dungeon";

export const WAR = data;
export interface WarBaseDef {
  id: string;
  name: string;
  kind: "side" | "heart";
  front: string;
  /** Центр в тайлах (непрерывные) и в пикселях. */
  tx: number;
  ty: number;
  x: number;
  y: number;
  /** Королевское знамя во дворе форта (осада, шаг 15): свой радиус круга, px; видно только в осаде этого форта. */
  siege?: { fort: string; r: number };
}
export interface WarFrontDef { id: string; name: string; side: SideBonus; heart: HeartBonus; bases: WarBaseDef[] }

export const WAR_FRONTS: WarFrontDef[] = data.fronts.map((f) => ({
  id: f.id, name: f.name, side: f.side as SideBonus, heart: f.heart as HeartBonus,
  bases: f.bases.map((b) => ({ id: b.id, name: b.name, kind: b.kind as "side" | "heart", front: f.id, tx: b.x, ty: b.y, x: b.x * TILE, y: b.y * TILE })),
}));
export const WAR_BASES: WarBaseDef[] = WAR_FRONTS.flatMap((f) => f.bases);
export const warFront = (id: string) => WAR_FRONTS.find((f) => f.id === id);
export const warBase = (id: string) => WAR_BASES.find((b) => b.id === id);
/** Радиус круга захвата, px. */
export const WAR_RADIUS = data.capture.radius * TILE;

/** Время подъёма знамени (с) при перевесе n ≥ 1 (больше maxEdge не ускоряет). */
export function raiseSec(kind: "side" | "heart", n: number): number {
  const t = data.capture.raiseSec[kind];
  return t[Math.max(1, Math.min(data.capture.maxEdge, n, t.length)) - 1];
}

/** Ключ недели (дата понедельника по местному времени сервера): недельный потолок Знаков, победы недели, «Перемирие». */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // 0 — понедельник
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

/** Ближайшее начало «Часа войны» строго позже after (мс, местное время сервера); siege — воскресная битва в 20:00 уступает осаде форта (шаг 15: есть нападающий). */
export function nextWarStart(after: number, siege = false): number {
  const S = data.schedule;
  const d0 = new Date(after);
  for (let k = 0; k < 9; k++) {
    const day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k);
    const dow = day.getDay(), weekend = dow === 0 || dow === 6;
    const times = [...S.daily, ...(weekend ? S.weekend : [])].filter((t) => !(siege && S.sundaySiege && dow === 0 && t === "20:00"));
    const starts = times.map((t) => { const [h, mi] = t.split(":").map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi).getTime(); }).sort((a, b) => a - b);
    for (const s of starts) if (s > after) return s;
  }
  return after + 86400000;
}

/** Состояние основания для клиента. */
export interface WarBaseView {
  id: string;
  /** Владелец (знамя поднято до конца), чьё знамя на мачте, высота знамени 0…1. */
  o: WarFaction | "";
  b: WarFaction | "";
  h: number;
  /** Сколько героев каждой стороны в круге [Сольгард, Умбрат]. */
  n: [number, number];
  /** Спор: в круге обе стороны. */
  c: boolean;
  /** Печать: осталось мс. */
  s: number;
  /** Вывешивание идёт: чья фракция и доля 0…1. */
  hf: WarFaction | "";
  hp: number;
  /** Сорванное знамя лежит у основания (до конца битвы). */
  fl: WarFaction | "";
  /** Сердце закрыто (до heartOpenMin-й минуты). */
  lock: boolean;
}
/** war — состояние ивента: всем в мире (раз в 0,5 с в битве и при смене, иначе реже). */
export interface WarStateMsg {
  ph: WarPhase;
  front: string;
  /** Начало и конец битвы, время сервера (мс), и «сейчас» сервера — для отсчёта у клиента. */
  t0: number;
  t1: number;
  now: number;
  score: [number, number];
  heart: boolean;
  bases: WarBaseView[];
}
/** war:say — объявление на экране (и в чате, если общее). */
export interface WarSayMsg { text: string; sub?: string; kind: "start" | "capture" | "tear" | "alarm" | "end" | "info"; f?: WarFaction | "" }
export interface WarTopRow { name: string; cls: string; contrib: number }
/** war:result — итог битвы для героя. */
export interface WarResultMsg {
  front: string;
  win: WarFaction | "";
  rout: boolean;
  score: [number, number];
  durationMs: number;
  me: { faction: WarFaction; contrib: number; marks: number; capped: boolean; chest: { name: string; qty: number }[] } | null;
  top: { solgard: WarTopRow[]; umbrath: WarTopRow[] };
  stats: { captures: number; tears: number; kills: number };
}
