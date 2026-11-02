/**
 * Осада форта (задача 132, шаг 15): числа (data/siege.json), ворота городов с фракцией и проходимость, расписание и сообщения сервер ↔ клиент.
 * Ворота — проём |dx| ≤ 1 в северной и южной стене (cities.ts isGateOf): клетки проёма на карте проходимы (CELL_BLOCK нет), а закрытые
 * для чужих ворота — отдельная проверка moveGated поверх moveWithCollision: свои (герои, стража, отряды фракции ворот) проходят, чужие
 * упираются; сломанные (GATE_BROKEN) пропускают всех. Сервер и клиент двигают героя одной функцией — предсказание не расходится с сервером.
 */
import { gateAllows } from "./gates";
import data from "../data/siege.json";
import { CITIES, layoutOf } from "./cities";
import { TILE } from "./constants";
import { moveWithCollision, type WorldMap } from "./map";
import type { PathBlock } from "./path";
import type { WarBaseView, WarFaction, WarTopRow } from "./bannerWar";

export const SIEGE = data;
export type GateSide = "n" | "s";
export interface GateDef {
  id: string;
  city: string;
  faction: WarFaction;
  side: GateSide;
  /** Клетки проёма (тайлы): x0…x1, ряд стены ty. */
  tx0: number;
  tx1: number;
  ty: number;
  /** Прямоугольник проёма, px. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Середина проёма и точка перед воротами снаружи, px; y объекта арки на карте. */
  x: number;
  y: number;
  ox: number;
  oy: number;
  objY: number;
  /** Ворота форта — их ломают в осаде. */
  siege: boolean;
}

export const GATES: GateDef[] = data.gates.cities.flatMap((id) => {
  const c = CITIES.find((x) => x.id === id);
  if (!c?.style) return [];
  const L = layoutOf(c);
  return (["n", "s"] as GateSide[]).map((side) => {
    const ty = c.y + (side === "n" ? -L.wall.y : L.wall.y), out = side === "n" ? -1 : 1;
    return {
      id: `${id}_${side}`, city: id, faction: c.style as WarFaction, side, tx0: c.x - 1, tx1: c.x + 1, ty,
      x0: (c.x - 1) * TILE, x1: (c.x + 2) * TILE, y0: ty * TILE, y1: (ty + 1) * TILE,
      x: c.x * TILE + 16, y: ty * TILE + 16, ox: c.x * TILE + 16, oy: ty * TILE + 16 + out * 2 * TILE, objY: (ty + 1) * TILE - 2,
      siege: data.gates.siegeOf.includes(id),
    };
  });
});
export const gateById = (id: string) => GATES.find((g) => g.id === id);
/** Сломанные ворота (id): пропускают всех. Сервер правит в осаде, клиент — по сообщению siege. */
export const GATE_BROKEN = new Set<string>();

/** Упирается ли тело (как walkable: ±r по x, ±r/2 по y) в закрытые для этой фракции ворота. */
export function gateBlocks(x: number, y: number, r: number, faction: string): boolean {
  for (const g of GATES) {
    if (gateAllows(g.faction, faction, GATE_BROKEN.has(g.id))) continue;
    if (x + r > g.x0 && x - r < g.x1 && y + r * 0.5 > g.y0 && y - r * 0.5 < g.y1) return true;
  }
  return false;
}
/**
 * Шаг с учётом стен и ворот — тот же moveWithCollision (скольжение по осям, 3 деления пополам у кромки, выход из воды) с воротами поверх карты.
 * Уже стоящего в проёме (ворота починили) выпускает.
 */
export function moveGated(m: WorldMap, x: number, y: number, dx: number, dy: number, r: number, faction: string) {
  if (gateBlocks(x, y, r, faction)) return moveWithCollision(m, x, y, dx, dy, r);
  return moveWithCollision(m, x, y, dx, dy, r, (px, py) => gateBlocks(px, py, r, faction));
}
/** Клетки проёмов ворот (ty * 65536 + tx → ворота): быстрый отказ в A* для всех прочих клеток. */
const GATE_CELLS = new Map<number, GateDef>();
for (const g of GATES) for (let tx = g.tx0; tx <= g.tx1; tx++) GATE_CELLS.set(g.ty * 65536 + tx, g);
/** Закрыта ли клетка (тайлы) воротами для фракции. */
export function gateCellBlocks(cx: number, cy: number, faction: string): boolean {
  const g = GATE_CELLS.get(cy * 65536 + cx);
  return !!g && !gateAllows(g.faction, faction, GATE_BROKEN.has(g.id));
}
/** Ворота для поиска пути (shared/path.ts PathBlock): A* и прямая видимость обходят закрытые для фракции ворота, как шаг moveGated. */
export function gateBlocker(faction: string): PathBlock {
  return { cell: (cx, cy) => gateCellBlocks(cx, cy, faction), at: (x, y, r) => gateBlocks(x, y, r, faction) };
}
/**
 * Куда тянуть створки на экране (0 — закрыто, 1 — открыто): у сломанных — 0 (кадр пролома), открываются, только когда свой у ворот (ownNear)
 * и смотрящий сам может пройти. Чужой видит ворота закрытыми всегда — картинка совпадает с проходимостью (2026-11-02).
 */
export function gateVisTarget(gateFaction: string, viewerFaction: string | undefined, broken: boolean, ownNear: boolean): 0 | 1 {
  if (broken) return 0;
  return ownNear && gateAllows(gateFaction, viewerFaction) ? 1 : 0;
}
/**
 * Чужой заперт в городе с воротами: точка внутри стен (|dx| < wall.x, |dy| < wall.y от центра), ворота закрыты для фракции, пролома нет.
 * Возвращает точку перед ближайшими воротами снаружи (куда вывести), иначе null. Сервер выводит так чужих после починки ворот (конец осады)
 * и при входе в мир (сохранились внутри) — иначе герой стоял бы в форте без выхода (2026-11-02, tests/unit/gates.ts).
 */
export function trappedOut(x: number, y: number, faction: string): { x: number; y: number } | null {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (const id of data.gates.cities) {
    const c = CITIES.find((q) => q.id === id);
    if (!c) continue;
    const L = layoutOf(c);
    if (Math.abs(tx - c.x) >= L.wall.x || Math.abs(ty - c.y) >= L.wall.y) continue;
    const gs = GATES.filter((g) => g.city === id);
    if (!gs.length || gs.some((g) => gateAllows(g.faction, faction, GATE_BROKEN.has(g.id)))) return null;
    const g = gs.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
    return { x: g.ox, y: g.oy };
  }
  return null;
}
/** Прошёл ли отрезок (рывок, прыжок) сквозь закрытые для фракции ворота. */
export function crossesGate(x0: number, y0: number, x1: number, y1: number, faction: string): GateDef | null {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 1 || d > data.gates.dashTiles * TILE) return null;
  for (const g of GATES) {
    if (gateAllows(g.faction, faction, GATE_BROKEN.has(g.id))) continue;
    // ряд стены пересечён между точками и в пределах проёма
    const a = y0 < g.y0 ? -1 : y0 > g.y1 ? 1 : 0, b = y1 < g.y0 ? -1 : y1 > g.y1 ? 1 : 0;
    if (a === b || a === 0 || b === 0) continue;
    const t = ((g.y0 + g.y1) / 2 - y0) / (y1 - y0), xc = x0 + (x1 - x0) * t;
    if (xc > g.x0 - 8 && xc < g.x1 + 8) return g;
  }
  return null;
}

/** Ближайшее начало осады строго позже after (мс, местное время сервера). */
export function nextSiegeStart(after: number): number {
  const [h, mi] = data.schedule.time.split(":").map(Number);
  const d0 = new Date(after);
  for (let k = 0; k < 9; k++) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k, h, mi);
    if (d.getDay() === data.schedule.day && d.getTime() > after) return d.getTime();
  }
  return after + 7 * 86400000;
}
/** Кто нападает: фракция с большим числом побед недели; поровну — осады нет (null). */
export function siegeAttacker(wins: [number, number]): WarFaction | null {
  return wins[0] > wins[1] ? "solgard" : wins[1] > wins[0] ? "umbrath" : null;
}
/** Центр королевского знамени во дворе форта, px. */
export function siegeBannerAt(fortId: string): { x: number; y: number; tx: number; ty: number } {
  const c = CITIES.find((x) => x.id === fortId)!;
  const tx = c.x + data.banner.dx + 0.5, ty = c.y + data.banner.dy + 0.5;
  return { x: tx * TILE, y: ty * TILE, tx, ty };
}

export type SiegePhase = "idle" | "prep" | "siege" | "result";
export interface SiegeGateView { id: string; hp: number; broken: boolean }
/** siege — состояние осады: всем в мире (раз в 0,5 с в осаде и при смене, иначе реже). */
export interface SiegeStateMsg {
  ph: SiegePhase;
  /** Осаждаемый форт (id города), нападающие и обороняющиеся. */
  fort: string;
  att: WarFaction | "";
  def: WarFaction | "";
  t0: number;
  t1: number;
  /** До какого времени надо сломать ворота. */
  breach: number;
  now: number;
  gates: SiegeGateView[];
  /** Все сломанные ворота (проходимость у клиента). */
  broken: string[];
  /** Королевское знамя во дворе (как основание «Знамён»). */
  banner: WarBaseView | null;
  /** Неделя после осады: чьё знамя над воротами какого форта и кому бонус до until. */
  week: { fort: string; flag: WarFaction; bonus: WarFaction; until: number } | null;
}
/** siege:fx — удар тарана (x, y — низ арки ворот), полёт камня (из x, y в tx, ty за ms), пролом ворот, починка (gates). */
export type SiegeFxMsg =
  | { k: "ram"; x: number; y: number; from: string; gate: string }
  | { k: "stone"; x: number; y: number; tx: number; ty: number; ms: number; from: string; gate: string }
  | { k: "breach"; x: number; y: number; gate: string }
  | { k: "repair"; gates: string[] };
/** siege:result — итог осады для героя. */
export interface SiegeResultMsg {
  fort: string;
  att: WarFaction;
  win: WarFaction;
  /** Чем кончилось: взят (знамя), ворота устояли, время вышло. */
  how: "taken" | "gates" | "time";
  durationMs: number;
  me: { faction: WarFaction; contrib: number; marks: number; capped: boolean; chest: { name: string; qty: number }[]; title: string } | null;
  top: { solgard: WarTopRow[]; umbrath: WarTopRow[] };
  stats: { breaches: number; engines: number; kills: number };
}
