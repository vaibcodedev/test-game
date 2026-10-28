/**
 * Правила декора: какой декор допустим на какой поверхности и в каком биоме (data/decor-rules.json).
 * Модуль не зависит от map.ts: карта передаёт поверхность вершины, биом и «безопасность» клетки через DecorCtx.
 * Генератор (shared/map.ts) снимает нарушителей, тест tests/decor-rules.ts и аудит tools/decor-audit.ts — считают их.
 */
import RULES from "../data/decor-rules.json";
import { TILE } from "./constants";

interface Rule { on?: string[]; need?: string[]; notOn?: string[]; biomes?: string[]; notSafe?: boolean; nearWater?: boolean; fire?: boolean }
const RULE = RULES.rules as Record<string, Rule>;
const GROUP_OF = new Map<string, string>();
for (const [g, kinds] of Object.entries(RULES.groups as Record<string, string[]>)) for (const k of kinds) GROUP_OF.set(k, g);
const WATER_OK = new Set(RULES.waterOk);
/** Сгоревшее: рядом с ним огонь и дым уместны (агент земли рисует вокруг выжженную траву). */
export const BURNT_KINDS = new Set(RULES.fire.burnt);
const FIRE_R = RULES.fire.radius * TILE;
const FIRE_ON = new Set(RULES.fire.fireOn);

/** Группа правил вида декора (undefined — постройка, не проверяется). */
export const decorGroup = (kind: string) => GROUP_OF.get(kind);

export interface DecorCtx {
  /** Поверхность вершины dual grid (ключ TERRAIN_KEYS) или null за краем карты. */
  surf(vx: number, vy: number): string | null;
  /** Биом клетки: стиль зоны (Meadow, Snow…), Fields — Поля вечных битв, Town — города, форты и столицы. */
  biome(cx: number, cy: number): string;
  /** Безопасное место клетки: город или двор поселения (кости и черепа туда не кладутся). */
  safe(cx: number, cy: number): boolean;
}

export type DecorViolation = "surface" | "water" | "biome" | "safe" | "dry" | "fire";
export const VIOLATION_TEXT: Record<DecorViolation, string> = {
  surface: "не та поверхность",
  water: "основание в воде или лаве",
  biome: "не свой биом",
  safe: "кости в безопасном месте",
  dry: "камыш без воды рядом",
  fire: "огонь без сгоревшего и не на пепле",
};

/** Вершины под основанием спрайта (нижняя середина o.x, o.y ± ширина основания). */
export function footVerts(px: number, py: number): [number, number][] {
  const vy = Math.round((py + RULES.sample.dy) / TILE);
  const a = Math.round((px - RULES.sample.dx) / TILE), b = Math.round((px + RULES.sample.dx) / TILE);
  return a === b ? [[a, vy]] : [[a, vy], [b, vy]];
}

/**
 * Нарушение правил для объекта kind с основанием (px, py) в пикселях; null — всё в порядке или это не декор.
 * burntNear — есть ли рядом сгоревшее (для огня); не задан — огонь проверяется только по поверхности.
 */
export function checkDecor(ctx: DecorCtx, kind: string, px: number, py: number, burntNear?: (px: number, py: number, r: number) => boolean): DecorViolation | null {
  const g = GROUP_OF.get(kind);
  if (!g) return null;
  const rule = RULE[g];
  const verts = footVerts(px, py);
  const surfs = verts.map(([x, y]) => ctx.surf(x, y) ?? "water");
  const cx = Math.floor(px / TILE), cy = Math.floor((py - 2) / TILE);
  if (!WATER_OK.has(kind) && surfs.some((s) => s === "water" || s === "lava")) return "water";
  if (rule.fire) {
    if (surfs.every((s) => FIRE_ON.has(s))) return null;
    return burntNear && burntNear(px, py, FIRE_R) ? null : "fire";
  }
  if (rule.on && !surfs.every((s) => rule.on!.includes(s))) return "surface";
  if (rule.need && !surfs.some((s) => rule.need!.includes(s))) return "surface";
  if (rule.notOn && surfs.some((s) => rule.notOn!.includes(s))) return "surface";
  if (rule.biomes && !rule.biomes.includes(ctx.biome(cx, cy))) return "biome";
  if (rule.notSafe && ctx.safe(cx, cy)) return "safe";
  if (rule.nearWater) {
    let wet = false;
    for (let j = -1; j <= 2 && !wet; j++) for (let i = -1; i <= 2 && !wet; i++) if (ctx.surf(cx + i, cy + j) === "water") wet = true;
    if (!wet) return "dry";
  }
  return null;
}

const TALL = new Set(RULES.clear.tall);
export const CLEAR = { door: RULES.clear.door, gate: RULES.clear.gate, npc: RULES.clear.npc, road: RULES.clear.road };
/** Стоячий декор: не должен заслонять двери, ворота, NPC и дороги. */
export const isTallDecor = (kind: string) => TALL.has(GROUP_OF.get(kind) ?? "");

/** Поиск сгоревшего рядом по списку объектов (сетка-ведро, чтобы не перебирать весь мир). */
export function burntIndex(objects: { kind: string; x: number; y: number }[]) {
  const B = 8 * TILE, bucket = new Map<number, { x: number; y: number }[]>();
  for (const o of objects) {
    if (!BURNT_KINDS.has(o.kind)) continue;
    const k = Math.floor(o.x / B) * 65536 + Math.floor(o.y / B);
    (bucket.get(k) ?? bucket.set(k, []).get(k)!).push(o);
  }
  return (px: number, py: number, r: number) => {
    const bx = Math.floor(px / B), by = Math.floor(py / B);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const o of bucket.get((bx + i) * 65536 + by + j) ?? []) if ((o.x - px) ** 2 + (o.y - py) ** 2 <= r * r) return true;
    return false;
  };
}
