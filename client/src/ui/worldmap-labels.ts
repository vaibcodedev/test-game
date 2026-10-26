/** Подписи зон карты мира (без DOM, чтобы проверять офлайн): каждая связная часть зоны подписывается один раз, зоны сторон — зеркальными парами.
 *  Точка подписи — центр её блока (строка уровней, название, у поясов кольца — опасность). */
import { CITIES } from "../../../shared/cities";
import { landLabel, type FactionId } from "../../../shared/factions";
import { PLACES, ZONES, isTownZone, type WorldMap } from "../../../shared/map";
import { GP } from "../../../shared/gameplay";

const STEP = GP.ui.mapLabelStep; // шаг сетки поиска частей зоны, тайлы
const MIN_CELLS = GP.ui.mapLabelMinCells; // меньше — часть не подписывается (клетки по STEP×STEP тайлов)
const ROWS = [0.14, 0.34, 0.62, 0.86]; // высоты подписей поясов кольца (доля высоты карты): соседние пояса идут лесенкой
/** Пикселей экрана на тайл на общем плане (окно 1440 px): по нему подписи земель раскладываются без наложений на общем плане. */
const PX = GP.ui.mapLabelScale;

export interface Label {
  x: number; y: number; text: string;
  /** Опасность зоны: кольцо 40–80 — «Небезопасная зона», Поля 80–100 — «Опасная зона». */ danger?: "unsafe" | "deadly";
  /** Безопасные земли фракции 1–40: «Земли Сольгарда / Умбрата». */ land?: FactionId;
  /** Номер зоны (Zone). */ zone: number;
  /** Индекс зеркальной подписи на другой стороне карты (рисуются парой: обе или ни одной). */ pair?: number;
}

interface Comp { z: number; cells: number[]; cx: number; cy: number }
/** Прямоугольник подписи на общем плане, тайлы: центр и полуразмеры. */
interface Box { x: number; y: number; hw: number; hh: number }
/** Насколько коробки разведены: ≥ 1 — не пересекаются (по худшей оси, в долях суммы полуразмеров). */
const apart = (a: Box, b: Box) => Math.max(Math.abs(a.x - b.x) / (a.hw + b.hw), Math.abs(a.y - b.y) / (a.hh + b.hh));
/** Коробка подписи зоны на общем плане: lines строк, ширина — по названию. */
const zoneBox = (text: string, x: number, y: number, lines: number): Box => ({ x, y, hw: (Math.max(text.length * 7.2, 52) / 2 + 4) / PX, hh: (lines * 16 + 4) / 2 / PX });

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
  // центральные зоны (Поля, залы данжа, вулкан) — по центру части
  for (const c of comps) if (Math.abs(c.cx - axis) < 30) { const p = nearest(c, c.cx, c.cy); add(c.z, p.x, p.y); }
  // части сторон: западная и её зеркальная восточная
  const west = comps.filter((c) => c.cx < axis - 30).sort((a, b) => a.cx - b.cx);
  const east = comps.filter((c) => c.cx > axis + 30);
  const side: { c: Comp; e: Comp; k: number }[] = [];
  west.forEach((c, k) => {
    const e = east.slice().sort((a, b) => Math.abs(a.cx - (m.w - 1 - c.cx)) - Math.abs(b.cx - (m.w - 1 - c.cx)))[0];
    if (!e) return;
    east.splice(east.indexOf(e), 1);
    side.push({ c, e, k });
  });
  const pairUp = (c: Comp, e: Comp, pw: { x: number; y: number }) => {
    let pe = { x: m.w - 1 - pw.x, y: pw.y };
    if (zAt(pe.x, pe.y) !== e.z) pe = nearest(e, m.w - 1 - c.cx, pw.y);
    const i = zoneLabels.length;
    add(c.z, pw.x, pw.y, i + 1);
    add(e.z, pe.x, pe.y, i);
  };
  // помехи общего плана (восточные — отражены на запад, раскладка одна на обе стороны): города (значок и название над ним), поселения (точка и название над ней), уже поставленные подписи
  const busy: Box[] = [];
  const wx = (x: number) => (x < axis ? x : m.w - 1 - x);
  for (const c of CITIES) busy.push({ x: wx(c.x), y: c.y - 14 / PX, hw: (c.name.length * 11 + 12) / 2 / PX, hh: 19 / PX });
  for (const p of PLACES) if (p.kind === "settlement") busy.push({ x: wx(p.x), y: p.y - 14 / PX, hw: (p.name.length * 8 + 8) / 2 / PX, hh: 10 / PX });
  /** Название пары, что длиннее: по нему ширина коробки (одна точка на обе стороны). */
  const longer = (c: Comp, e: Comp) => (ZONES[c.z].name.length >= ZONES[e.z].name.length ? ZONES[c.z].name : ZONES[e.z].name);
  /** Лучшая точка среди клеток: дальше всех от помех, подпись над своей землёй (inside) и в пределах западной половины. */
  const place = (cells: number[], box: (x: number, y: number) => Box, inside: (x: number, y: number) => boolean) => {
    const b0 = box(0, 0);
    let best: { x: number; y: number } | null = null, bs = -1e9;
    for (const k of cells) {
      const x = Math.min(Math.max((k % gw) * STEP + STEP / 2, b0.hw + 3), axis - 30 - b0.hw);
      const y = Math.min(Math.max(((k / gw) | 0) * STEP + STEP / 2, b0.hh + 3), m.h - 4 - b0.hh);
      if (!inside(x, y)) continue;
      const b = box(x, y);
      let free = 9;
      for (const o of busy) free = Math.min(free, apart(b, o));
      let cov = 0;
      for (let i = 0; i <= 8; i++) if (inside(b.x - b.hw + (i * b.hw) / 4, y)) cov++;
      const sc = Math.min(free, 1.3) + 0.4 * (cov / 9);
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    return best;
  };
  // пояса кольца — лесенкой по высоте
  for (const { c, e, k } of side) if (!ZONES[c.z].land) {
    const pw = nearest(c, c.cx, (m.h - 1) * ROWS[k % ROWS.length]);
    pairUp(c, e, pw);
    busy.push(zoneBox(longer(c, e), pw.x, pw.y, 3));
  }
  // зоны земель (вложенные пояса вокруг столицы): с меньших, каждая — в свободное место над собой, мимо городов, поселений и поставленных подписей
  const lands = side.filter((q) => ZONES[q.c.z].land);
  for (const { c, e } of lands.slice().sort((a, b) => a.c.cells.length - b.c.cells.length)) {
    const name = longer(c, e);
    const pw = place(c.cells, (x, y) => zoneBox(name, x, y, 2), (x, y) => zAt(x, y) === c.z && zAt(m.w - 1 - x, y) === e.z) ?? nearest(c, c.cx, c.cy);
    pairUp(c, e, pw);
    busy.push(zoneBox(name, pw.x, pw.y, 2));
  }
  // «Земли Сольгарда / Умбрата»: по одной на сторону, над своей землёй, мимо подписей зон; восток — зеркало запада
  if (lands.length) {
    const land = ZONES[lands[0].c.z].land!, other = ZONES[lands[0].e.z].land;
    const n = Math.max(landLabel(land).length, other ? landLabel(other).length : 0);
    const lb = (x: number, y: number): Box => ({ x, y, hw: (n * 11 + 8) / 2 / PX, hh: 12 / PX });
    const p = place(lands.flatMap((q) => q.c.cells), lb, (x, y) => !!ZONES[zAt(x, y)]?.land || isTownZone(zAt(x, y)));
    if (p) {
      landLabels.push({ x: p.x, y: p.y, land });
      if (other) landLabels.push({ x: m.w - 1 - p.x, y: p.y, land: other });
    }
  }
  return { zoneLabels, landLabels };
}
