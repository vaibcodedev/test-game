/**
 * Пепельнорождённые — стража Эмберхолла (data/ember-guard.json, лор — data/factions.json neutral.ember): тлеющие трещины в латах,
 * глаза-угли в прорези шлема, искры и пепел. Чистые функции без Phaser: возвращают прямоугольники 1 px, генератор
 * tools/gen/npc-sets.ts и игра рисуют их одинаково. Цикл data fx.frames кадров (12 к/с), пульс и полёт — с easing.
 *
 * Подключено в GearLayers для геральдики с ash (shared/npcGear.ts HERALDRY.ember — стража Эмберхолла, kind Guard):
 *  - тело: лист nude_ashborn_<класс> (npm run assets, tools/gen/ashborn-body.ts) вместо nude_<класс> — UnitView;
 *  - end(slot, …): после рисования детали — ashCracks(пиксели детали без табарда/герба, slot, t, seed) — GearLayers.cracks;
 *  - draw(): в конце, во front — ashEyes(view, t) и ashEmbers(t, seed) через R (flip, наклон и шаг учтены);
 *  - glow: true — светится: ночью ещё раз поверх затемнения (GearLayers.glow) и мягкий отсвет (bloom, ADD).
 */
import data from "../../../data/ember-guard.json";

export interface AshRect { x: number; y: number; w: number; h: number; c: string; a: number; glow: boolean }
const FX = data.fx;
export const ASH_FRAMES = FX.frames, ASH_FPS = FX.fps, ASH_HALO = FX.halo;
const PERIOD = (FX.frames / FX.fps) * 1000;

const h32 = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
/** Фаза цикла 0…1 по времени, мс. */
const phase = (t: number, off = 0) => ((((t / PERIOD) + off) % 1) + 1) % 1;
/** Мягкое дыхание 0…1: cos с easeInOutSine — долгие пики и провалы, середина проходит быстро. */
const breathe = (u: number) => easeInOutSine(0.5 - 0.5 * Math.cos(2 * Math.PI * u));

const KEY = (x: number, y: number) => (y + 512) * 2048 + (x + 1024);
type Crack = [number, number][];

/** Трещины детали: старт — внутренний пиксель (все 4 соседа в детали), путь вниз с изломом 3–4 px; между стартами ≥ 4 px.
 *  Набор зависит только от силуэта детали и seed (стабилен по кадрам). Кэш по силуэту. */
const crackCache = new Map<string, Crack[]>();
function cracksOf(px: [number, number][], slot: string, seed: number): Crack[] {
  const n = (FX.cracks as Record<string, number>)[slot] ?? 0;
  if (!n || px.length < 12) return [];
  let x0 = Infinity, y0 = Infinity;
  for (const [x, y] of px) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
  const ck = `${slot}:${seed}:` + px.map(([x, y]) => `${x - x0},${y - y0}`).sort().join(";");
  let rel = crackCache.get(ck);
  if (!rel) {
    const set = new Set(px.map(([x, y]) => KEY(x, y)));
    const inner = (x: number, y: number) => set.has(KEY(x, y)) && set.has(KEY(x - 1, y)) && set.has(KEY(x + 1, y)) && set.has(KEY(x, y - 1)) && set.has(KEY(x, y + 1));
    const cand = px.filter(([x, y]) => inner(x, y)).sort((a, b) => h32(a[0] - x0, a[1] - y0, seed) - h32(b[0] - x0, b[1] - y0, seed));
    const out: Crack[] = [];
    for (const [sx, sy] of cand) {
      if (out.length >= n) break;
      if (out.some((c) => Math.abs(c[0][0] - sx) + Math.abs(c[0][1] - sy) < 4)) continue;
      const len = FX.crackLen[0] + Math.floor(h32(sx, sy, seed + 1) * (FX.crackLen[1] - FX.crackLen[0] + 1));
      const path: Crack = [[sx, sy]];
      let x = sx, y = sy;
      for (let i = 1; i < len; i++) {
        const r = h32(x - x0, y - y0, seed + i * 7), dx = r < 0.3 ? -1 : r > 0.7 ? 1 : 0;
        const nx = x + (i % 2 ? dx : 0), ny = y + 1;                     // излом через шаг: ступенька, а не диагональ в 1 px
        if (!inner(nx, ny) || path.some(([px2, py2]) => px2 === nx && py2 === ny)) break;
        if (nx !== x && inner(x, ny)) path.push([x, ny]);                  // ступенька сплошная — без разрывов по диагонали
        x = nx; y = ny; path.push([x, y]);
      }
      if (path.length >= 3) out.push(path);
    }
    rel = out.map((c) => c.map(([x, y]) => [x - x0, y - y0] as [number, number]));
    crackCache.set(ck, rel);
  }
  return rel.map((c) => c.map(([x, y]) => [x + x0, y + y0] as [number, number]));
}

/** Тлеющие трещины детали: px — её пиксели (те же координаты, что вернутся), slot — helm/armor/boots/offhand, t — мс.
 *  Сердцевина дышит по рампе fire (концы на ступень темнее), край слева/сверху — обугленный, справа/снизу — отсвет. */
export function ashCracks(px: [number, number][], slot: string, t: number, seed = 0): AshRect[] {
  const cracks = cracksOf(px, slot, seed);
  if (!cracks.length) return [];
  const set = new Set(px.map(([x, y]) => KEY(x, y))), out: AshRect[] = [];
  cracks.forEach((c, ci) => {
    const I = breathe(phase(t, h32(ci, seed, 3)));
    const on = new Set(c.map(([x, y]) => KEY(x, y)));
    for (const [x, y] of c) {
      if (!on.has(KEY(x - 1, y)) && set.has(KEY(x - 1, y))) out.push({ x: x - 1, y, w: 1, h: 1, c: data.fx.char, a: 0.85, glow: false });
      for (const [hx, hy] of [[x + 1, y], [x, y + 1]]) if (!on.has(KEY(hx, hy)) && set.has(KEY(hx, hy))) out.push({ x: hx, y: hy, w: 1, h: 1, c: FX.halo, a: 0.12 + 0.28 * I, glow: true });
    }
    c.forEach(([x, y], i) => {
      const end = i === 0 || i === c.length - 1 ? 1 : 0;
      const k = Math.max(0, Math.min(FX.fire.length - 1, 1 + Math.round(2.6 * I + 0.4) - end));
      out.push({ x, y, w: 1, h: 1, c: FX.fire[k], a: 1, glow: true });
    });
  });
  return out;
}

/** Глаза-угли (кадровые координаты 32×32; view: 0 спереди, 1 сзади, 2 сбоку): ядро 2×1 по рампе eyeCore, снизу и по бокам — отсвет. */
export function ashEyes(view: number, t: number): AshRect[] {
  const eyes = (FX.eyes as Record<string, number[][]>)[String(view)];
  if (!eyes) return [];
  const I = 0.55 + 0.45 * breathe(phase(t, 0.2)), out: AshRect[] = [];
  const set = new Set(eyes.map(([x, y]) => KEY(x, y)));
  for (const [x, y] of eyes) {
    out.push({ x, y: y + 1, w: 1, h: 1, c: FX.halo, a: 0.25 + 0.3 * I, glow: true });
    for (const dx of [-1, 1]) if (!set.has(KEY(x + dx, y))) out.push({ x: x + dx, y, w: 1, h: 1, c: FX.halo, a: 0.2 + 0.25 * I, glow: true });
  }
  for (const [x, y] of eyes) out.push({ x, y, w: 1, h: 1, c: FX.eyeCore[Math.min(2, Math.round(I * 2))], a: 1, glow: true });
  return out;
}

/** Искры и пепел (кадровые координаты): поднимаются из области emberArea на emberRise px (easeOutCubic), сносятся вбок по синусу;
 *  цвет остывает по возрасту — жёлтая искра → оранжевая → красный уголь → серый пепел (пепел не светится и тает). */
export function ashEmbers(t: number, seed = 0): AshRect[] {
  const [, ay0, , ay1] = FX.emberArea, out: AshRect[] = [];
  for (let i = 0; i < FX.embers; i++) {
    const off = (i + h32(i, seed, 9) * 0.6) / FX.embers, u = phase(t, off);
    // каждый новый круг — новая точка вылета (по номеру круга), чтобы искры не ходили по одной дорожке
    const lap = Math.floor((t / PERIOD) + off);
    // вылет — с плеч и рук по бокам (полосы emberBands), не над шлемом: искра у лица читалась бы третьим глазом
    const band = FX.emberBands[(i + lap) % FX.emberBands.length];
    const sx = band[0] + h32(i, lap, seed) * (band[1] - band[0]), sy = ay0 + h32(lap, i, seed + 5) * (ay1 - ay0);
    const rise = FX.emberRise[0] + h32(i, seed, lap + 2) * (FX.emberRise[1] - FX.emberRise[0]);
    const e = easeOutCubic(u);
    const x = Math.round(sx + 1.6 * Math.sin(2 * Math.PI * (u * 0.9 + i * 0.37)) * e), y = Math.round(sy - rise * e);
    if (u < 0.18) out.push({ x, y, w: 1, h: 1, c: FX.fire[4], a: 1, glow: true });
    else if (u < 0.42) out.push({ x, y, w: 1, h: 1, c: FX.fire[3], a: 1, glow: true });
    else if (u < 0.62) out.push({ x, y, w: 1, h: 1, c: FX.fire[2], a: 0.9, glow: true });
    else if (u < 0.92) out.push({ x, y, w: 1, h: 1, c: FX.ashColor, a: 0.85 - (u - 0.62) * 1.6, glow: false });
  }
  return out;
}
