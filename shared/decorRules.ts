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

// ---------- след непроходимого: не «парит», не на дороге и не на площадке входа ----------
const PAD = RULES.clear.pad;
const BUILDING_DOOR = RULES.clear.buildings as Record<string, string>;
const ENTRANCE = new Set(RULES.clear.entrances);
const STRUCTURE = RULES.clear.structure;
const GATE_RE = /(^|_)gate($|_)|gate_arch|^pal_gate/;
/** Постройка (стены, ворота, ограды, дома, обрывы): её след сам образует проход и не проверяется. */
export const isStructure = (kind: string) => STRUCTURE.some((s) => kind.includes(s));

export type FootViolation = "float" | "road" | "pad";
export const FOOT_TEXT: Record<FootViolation, string> = { float: "основание висит над водой или лавой", road: "след на дороге", pad: "след на площадке входа" };
type Obj = { kind: string; x: number; y: number };
type Fp = { w: number; h: number } | undefined;
/** Привязка следа (левая нижняя клетка) по нижней середине спрайта, как в place() (дрожание меньше полклетки). */
export const footAnchor = (o: Obj, fp: { w: number }) => [Math.round(o.x / TILE - fp.w / 2), Math.round((o.y + 2) / TILE) - 1] as const;

/** Проверяется ли след вида: непроходимое, не постройка, не сам вход или ворота. */
export const footChecked = (kind: string, fp: Fp) => !!fp && !isStructure(kind) && !ENTRANCE.has(kind) && !GATE_RE.test(kind);

/**
 * Проверка следов непроходимых объектов. surf — поверхность вершины, road — расстояние до оси дороги (тайлы), fpOf — след вида.
 * Площадки входа: перед дверью зданий и цоколя (середина нижнего ряда следа), у лестниц и лазов, по обе стороны ворот.
 * at(kind, x0, y0) — нарушение следа с привязкой x0, y0 (левая нижняя клетка); all() — все нарушения: индекс объекта → вид.
 */
export function footChecker(objects: Obj[], fpOf: (kind: string) => Fp, surf: (vx: number, vy: number) => string | null, road: (x: number, y: number) => number) {
  const pad = new Set<number>(), key = (x: number, y: number) => y * 65536 + x;
  const addRect = (x0: number, x1: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pad.add(key(x, y)); };
  for (const o of objects) {
    const fp = fpOf(o.kind);
    if (fp && (BUILDING_DOOR[o.kind] || ENTRANCE.has(o.kind))) {
      const [x0, y0] = footAnchor(o, fp);
      const d0 = x0 + Math.floor((fp.w - 1) / 2), d1 = x0 + Math.ceil((fp.w - 1) / 2);
      addRect(d0 - PAD.half, d1 + PAD.half, y0 + 1, y0 + PAD.depth);
    } else if (ENTRANCE.has(o.kind)) {
      const fx = Math.floor(o.x / TILE), fy = Math.floor((o.y - 2) / TILE);
      addRect(fx - PAD.half, fx + PAD.half, fy - 1, fy + PAD.depth);
    } else if (GATE_RE.test(o.kind)) {
      const gx = Math.floor(o.x / TILE), gy = Math.floor((o.y - 2) / TILE);
      addRect(gx - PAD.half, gx + PAD.half, gy - PAD.depth, gy + PAD.depth);
    }
  }
  const at = (kind: string, x0: number, y0: number): FootViolation | null => {
    const fp = fpOf(kind);
    if (!fp || !footChecked(kind, fp)) return null;
    for (let vx = x0; vx <= x0 + fp.w; vx++) { const s = surf(vx, y0 + 1); if (s === "water" || s === "lava" || s === null) return "float"; }
    for (let j = 0; j < fp.h; j++) for (let k = 0; k < fp.w; k++) {
      if (pad.has(key(x0 + k, y0 - j))) return "pad";
      if (road(x0 + k + 0.5, y0 - j + 0.5) < RULES.clear.road) return "road";
    }
    return null;
  };
  const all = () => {
    const out = new Map<number, FootViolation>();
    objects.forEach((o, i) => {
      const fp = fpOf(o.kind);
      if (!fp) return;
      const v = at(o.kind, ...footAnchor(o, fp));
      if (v) out.set(i, v);
    });
    return out;
  };
  return { at, all };
}
