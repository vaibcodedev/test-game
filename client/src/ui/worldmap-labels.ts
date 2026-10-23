/** Подписи зон карты мира (без DOM, чтобы проверять офлайн): каждая связная часть зоны подписывается один раз, зоны сторон — зеркальными парами. */
import type { FactionId } from "../../../shared/factions";
import { ZONES, isTownZone, type WorldMap } from "../../../shared/map";

const STEP = 4; // шаг сетки поиска частей зоны, тайлы
const MIN_CELLS = 30; // меньше — часть не подписывается (клетки по STEP×STEP тайлов)
const ROWS = [0.14, 0.38, 0.62, 0.86]; // высоты подписей поясов (доля высоты карты): соседние пояса идут лесенкой

export interface Label {
  x: number; y: number; text: string;
  /** Опасность зоны: кольцо 40–80 — «Небезопасная зона», Поля 80–100 — «Опасная зона». */ danger?: "unsafe" | "deadly";
  /** Безопасные земли фракции 1–40: «Земли Сольгарда / Умбрата». */ land?: FactionId;
  /** Номер зоны (Zone). */ zone: number;
  /** Индекс зеркальной подписи на другой стороне карты (рисуются парой: обе или ни одной). */ pair?: number;
}

interface Comp { z: number; cells: number[]; cx: number; cy: number }

export function buildZoneLabels(m: WorldMap): { zoneLabels: Label[]; landLabels: { x: number; y: number; land: FactionId }[] } {
  const zoneLabels: Label[] = [];
  const landLabels: { x: number; y: number; land: FactionId }[] = [];
  if (m.w <= 200) return { zoneLabels, landLabels };
  const gw = Math.ceil(m.w / STEP), gh = Math.ceil(m.h / STEP);
  const zAt = (x: number, y: number) => m.zone[Math.min(m.h - 1, Math.max(0, Math.floor(y))) * m.w + Math.min(m.w - 1, Math.max(0, Math.floor(x)))];
  const g = new Int16Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = zAt(x * STEP, y * STEP);
  const seen = new Uint8Array(gw * gh);
  const comps: Comp[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (seen[i]) continue;
    const z = g[i], st = [i], cells: number[] = [];
    seen[i] = 1;
    while (st.length) {
      const c = st.pop()!;
      cells.push(c);
      const x = c % gw, y = (c / gw) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (!seen[j] && g[j] === z) { seen[j] = 1; st.push(j); }
      }
    }
    const zi = ZONES[z];
    if (cells.length < MIN_CELLS || !zi || zi.unused || isTownZone(z)) continue;
    let sx = 0, sy = 0;
    for (const c of cells) { sx += c % gw; sy += (c / gw) | 0; }
    comps.push({ z, cells, cx: (sx / cells.length) * STEP, cy: (sy / cells.length) * STEP });
  }
  /** Тайл части зоны, ближайший к точке (по сетке поиска). */
  const nearest = (c: Comp, tx: number, ty: number) => {
    let best = c.cells[0], bd = 1e18;
    for (const k of c.cells) { const d = ((k % gw) * STEP - tx) ** 2 + (((k / gw) | 0) * STEP - ty) ** 2; if (d < bd) { bd = d; best = k; } }
    return { x: (best % gw) * STEP + STEP / 2, y: ((best / gw) | 0) * STEP + STEP / 2 };
  };
  const axis = m.w / 2;
  const add = (z: number, x: number, y: number, pair?: number) => {
    const zi = ZONES[z];
    zoneLabels.push({ x, y, text: zi.name, danger: zi.danger, land: zi.land, zone: z, pair });
  };
  // центральные зоны (Поля, залы данжа, вулкан) — по центру части; пояса сторон — зеркальными парами лесенкой по высоте
  for (const c of comps) if (Math.abs(c.cx - axis) < 30) { const p = nearest(c, c.cx, c.cy); add(c.z, p.x, p.y); }
  const west = comps.filter((c) => c.cx < axis - 30).sort((a, b) => a.cx - b.cx);
  const east = comps.filter((c) => c.cx > axis + 30);
  west.forEach((c, k) => {
    const ty = (m.h - 1) * ROWS[k % ROWS.length];
    const e = east.slice().sort((a, b) => Math.abs(a.cx - (m.w - 1 - c.cx)) - Math.abs(b.cx - (m.w - 1 - c.cx)))[0];
    east.splice(east.indexOf(e), 1);
    const pw = nearest(c, c.cx, ty);
    let pe = { x: m.w - 1 - pw.x, y: pw.y };
    if (zAt(pe.x, pe.y) !== e.z) pe = nearest(e, m.w - 1 - c.cx, ty);
    const i = zoneLabels.length;
    add(c.z, pw.x, pw.y, i + 1);
    add(e.z, pe.x, pe.y, i);
  });
  const lands = new Map<FactionId, { x: number; n: number }>();
  for (const z of zoneLabels) if (z.land) {
    const a = lands.get(z.land) ?? { x: 0, n: 0 };
    a.x += z.x; a.n++;
    lands.set(z.land, a);
  }
  for (const [land, a] of lands) landLabels.push({ x: a.x / a.n, y: Math.round(m.h * 0.27), land }); // по высоте — между рядами подписей зон, вне линии городов
  return { zoneLabels, landLabels };
}
