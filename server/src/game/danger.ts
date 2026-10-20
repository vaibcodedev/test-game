/**
 * Опасные зоны для ИИ ботов (рейд, симулятор баланса tools/balance/sim.ts): телеграфы и лужи — где опасно и куда уйти.
 * Формы как у World.telegraph и телеграфов рейда: circle, ring (r..r2), cone (угол a, раствор w), line (длина r по углу a, полуширина w).
 */
import { PLAYER_RADIUS } from "../../../shared/constants";
import { walkable } from "../../../shared/map";
import type { Player } from "./Player";
import type { Actor, World } from "./World";

/** Телеграф или лужа: at — когда появилась (реакция бота), until — когда сработает/исчезнет; id — атака (рейд). */
export interface Danger { shape: "circle" | "cone" | "ring" | "line"; x: number; y: number; r: number; r2?: number; a?: number; w?: number; at: number; until: number; id?: string }

/** Точка (x, y) в зоне d с запасом m px. */
export function inDanger(d: Danger, x: number, y: number, m: number): boolean {
  const dx = x - d.x, dy = y - d.y, dist = Math.hypot(dx, dy);
  if (d.shape === "circle") return dist <= d.r + PLAYER_RADIUS * 0.5 + m;
  if (d.shape === "ring") return dist >= d.r - m && dist <= (d.r2 ?? d.r * 2) + m;
  if (d.shape === "line") {
    const a = d.a ?? 0, c = Math.cos(a), s = Math.sin(a);
    const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
    return along >= -m - PLAYER_RADIUS && along <= d.r + m && across <= (d.w ?? 30) + PLAYER_RADIUS * 0.5 + m;
  }
  let da = Math.atan2(dy, dx) - (d.a ?? 0);
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return dist <= d.r + m && Math.abs(da) <= (d.w ?? 1) / 2 + m / Math.max(dist, 30);
}

/** Записывает телеграфы мира (w.telegraph) и лужи (w.hazards): список опасных зон на текущий момент. */
export function trackDanger(w: World): () => Danger[] {
  let list: Danger[] = [];
  const orig = w.telegraph.bind(w);
  w.telegraph = (owner, shape, x, y, r, ms, onHit, extra = {}) => {
    list.push({ shape, x, y, r, r2: extra.r2, a: extra.a, w: extra.w, at: w.time, until: w.time + ms });
    orig(owner, shape, x, y, r, ms, onHit, extra);
  };
  return () => {
    list = list.filter((d) => d.until >= w.time);
    return [...list, ...w.hazards.map((h): Danger => ({ shape: "circle", x: h.x, y: h.y, r: h.r, at: -1e9, until: h.until }))];
  };
}

/**
 * Ближайшая безопасная точка (по возможности — в пределах атаки по цели). anchor — центр и радиус арены: дальше половины
 * радиуса — штраф. cost — добавочная цена точки (рейд: держаться своей позиции, не лезть под конус). unsafe — своя проверка
 * точки вместо «внутри любой зоны» (рейд: зона сработает уже после прибытия; r — сколько бежать).
 */
export function findSafe(
  w: World, p: Player, zones: Danger[], target: Actor | undefined,
  anchor: { x: number; y: number; r: number } | null = null, cost?: (x: number, y: number) => number,
  unsafe?: (x: number, y: number, r: number) => boolean,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bestCost = Infinity;
  const want = target ? p.attackRange() + w.radiusOf(target) : 0;
  for (const r of [24, 40, 60, 85, 115, 150, 190, 240, 300, 360]) for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const x = p.x + Math.cos(ang) * r, y = p.y + Math.sin(ang) * r;
    if (!walkable(w.map, x, y, PLAYER_RADIUS) || (unsafe ? unsafe(x, y, r) : zones.some((z) => inDanger(z, x, y, 10)))) continue;
    let c = r;
    if (target) { const dt = Math.hypot(x - target.x, y - target.y); if (dt > want) c += (dt - want) * 0.6; }
    if (anchor) c += Math.max(0, Math.hypot(x - anchor.x, y - anchor.y) - anchor.r * 0.5) * 1.5;
    if (cost) c += cost(x, y);
    if (c < bestCost) { bestCost = c; best = { x, y }; }
  }
  return best;
}
