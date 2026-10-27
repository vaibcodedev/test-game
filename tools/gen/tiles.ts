/**
 * Тайлсет поверхностей по схеме dual grid: для каждой поверхности 15 масок углов
 * (TL=1, TR=2, BR=4, BL=8) плюс 3 дополнительных варианта сплошного тайла.
 * Раскладка: строка = индекс поверхности, столбец (mask-1) для масок 1..15, 15..17 — доп. варианты.
 * Строка TERRAIN_COUNT — стены данжа: 0–1 верх стены, 2–5 лицевая сторона.
 */
import { PC, hash01, mix, pnoise, ramp, rng, shade, withA, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { TERRAIN_COUNT } from "../../shared/map";

export const TILESET_COLS = 18;
const S = 32;

type Texel = (x: number, y: number, v: number) => RGBA;

const pick = (r: Ramp, t: number) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
const interior = (x: number, y: number, m = 2) => x >= m && y >= m && x < S - m && y < S - m;

/** Пятна деталей внутри тайла: детерминированные по варианту, не касаются краёв. */
function sprinkle(v: number, seed: number, count: number) {
  const r = rng(seed * 977 + v * 131 + 7);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) pts.push([3 + Math.floor(r() * (S - 6)), 3 + Math.floor(r() * (S - 6)), r()]);
  return pts;
}
function detailMap(v: number, seed: number, count: number, stamp: (m: Map<number, RGBA>, x: number, y: number, k: number) => void) {
  const m = new Map<number, RGBA>();
  for (const [x, y, k] of sprinkle(v, seed, count)) stamp(m, x, y, k);
  return m;
}
const key = (x: number, y: number) => y * 64 + x;

function noiseBase(r: Ramp, seed: number, lo = 0.2, hi = 0.75): Texel {
  return (x, y) => {
    const n = pnoise(x, y, 8, S, seed) * 0.6 + pnoise(x, y, 4, S, seed + 1) * 0.3 + hash01(x, y, seed + 2) * 0.1;
    return pick(r, lo + n * (hi - lo));
  };
}

function grass(): Texel {
  const base = noiseBase(P.grass, 11, 0.25, 0.78);
  const cache = new Map<number, Map<number, RGBA>>();
  return (x, y, v) => {
    if (!cache.has(v)) cache.set(v, detailMap(v, 11, v === 0 ? 10 : 14, (m, px, py, k) => {
      // пучок травы: светлые травинки с тёмным основанием
      m.set(key(px, py), P.grass[4]);
      m.set(key(px, py + 1), P.grass[3]);
      m.set(key(px + 1, py + 1), P.grass[1]);
      if (k > 0.5) { m.set(key(px - 1, py + 1), P.grass[4]); m.set(key(px - 1, py + 2), P.grass[1]); }
      if (v === 2 && k > 0.75) { m.set(key(px + 2, py - 1), [244, 236, 160, 255]); m.set(key(px + 3, py - 1), [236, 120, 150, 255]); }
      if (v === 3 && k < 0.2) { m.set(key(px, py), [230, 230, 240, 255]); }
    }));
    return cache.get(v)!.get(key(x, y)) ?? base(x, y, v);
  };
}
function forest(): Texel {
  const base = noiseBase(P.forest, 21, 0.3, 0.68);
  const cache = new Map<number, Map<number, RGBA>>();
  return (x, y, v) => {
    if (!cache.has(v)) cache.set(v, detailMap(v, 21, 12, (m, px, py, k) => {
      if (k < 0.45) { m.set(key(px, py), P.leafAutumn[k < 0.2 ? 2 : 1]); m.set(key(px + 1, py), P.leafAutumn[0]); }
      else if (k < 0.8) { m.set(key(px, py), P.forest[4]); m.set(key(px, py + 1), P.forest[3]); }
      else { m.set(key(px, py), P.moss[2]); m.set(key(px + 1, py), P.moss[1]); m.set(key(px, py + 1), P.moss[1]); }
    }));
    return cache.get(v)!.get(key(x, y)) ?? base(x, y, v);
  };
}
function dirt(): Texel {
  const base = noiseBase(P.dirt, 31, 0.2, 0.75);
  const cache = new Map<number, Map<number, RGBA>>();
  return (x, y, v) => {
    if (!cache.has(v)) cache.set(v, detailMap(v, 31, 9, (m, px, py, k) => {
      // камешек: светлая верхушка и тень
      m.set(key(px, py), P.dirt[4]);
      if (k > 0.4) m.set(key(px + 1, py), P.dirt[3]);
      m.set(key(px, py + 1), P.dirt[0]);
      if (k > 0.4) m.set(key(px + 1, py + 1), P.dirt[0]);
    }));
    return cache.get(v)!.get(key(x, y)) ?? base(x, y, v);
  };
}
function sand(): Texel {
  const base = noiseBase(P.sand, 41, 0.25, 0.8);
  return (x, y, v) => {
    const h = hash01(x, y, 41 + v * 3);
    if (interior(x, y) && h < 0.05) return P.sand[0];
    if (interior(x, y) && h > 0.965) return P.sand[4];
    // лёгкая рябь от ветра
    const w = pnoise(x * 2, y, 8, S, 43);
    if (w > 0.78) return P.sand[3];
    return base(x, y, v);
  };
}
function bog(): Texel {
  const base = noiseBase(P.bog, 51, 0.15, 0.8);
  const cache = new Map<number, Map<number, RGBA>>();
  return (x, y, v) => {
    if (!cache.has(v)) cache.set(v, detailMap(v, 51, 6, (m, px, py, k) => {
      if (k < 0.5) {
        // лужица
        for (let dx = -1; dx <= 2; dx++) m.set(key(px + dx, py), [44, 64, 60, 255]);
        m.set(key(px, py - 1), [44, 64, 60, 255]); m.set(key(px + 1, py - 1), [70, 96, 86, 255]);
      } else { m.set(key(px, py), P.moss[2]); m.set(key(px, py + 1), P.bog[1]); }
    }));
    return cache.get(v)!.get(key(x, y)) ?? base(x, y, v);
  };
}
function ash(): Texel {
  const base = noiseBase(P.ash, 61, 0.2, 0.8);
  return (x, y, v) => {
    const c = pnoise(x, y, 8, S, 63 + (v % 2));
    if (c > 0.47 && c < 0.5 && interior(x, y, 1)) return v >= 2 ? [180, 70, 30, 255] : P.ash[0];
    const h = hash01(x, y, 61 + v);
    if (h < 0.05) return P.ash[0];
    if (h > 0.97) return P.ash[4];
    return base(x, y, v);
  };
}
function lava(): Texel {
  return (x, y) => {
    const n = pnoise(x, y, 8, S, 71) * 0.6 + pnoise(x, y, 4, S, 72) * 0.4;
    const crust = pnoise(x, y, 4, S, 73);
    if (crust > 0.62) return crust > 0.7 ? [46, 22, 20, 255] : [80, 30, 20, 255];
    return pick(P.lava, 0.3 + n * 0.7);
  };
}
/** Брусчатка: ячейки Вороного в периодическом пространстве. */
function cobble(): Texel {
  const r = rng(81);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) pts.push([r() * S, r() * S, r()]);
  const nearest = (x: number, y: number) => {
    let d1 = 1e9, d2 = 1e9, id = 0, tone = 0;
    for (const [px, py, t] of pts)
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x + 0.5 - (px + ox * S), dy = y + 0.5 - (py + oy * S), d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; id = px * 1000 + py; tone = t; } else if (d < d2) d2 = d;
      }
    return { edge: d2 - d1, id, tone };
  };
  return (x, y, v) => {
    const a = nearest(x, y);
    if (a.edge < 1.3) return P.cobble[0];
    const up = nearest(x, (y - 1 + S) % S), dn = nearest(x, (y + 1) % S);
    let idx = 2 + (a.tone > 0.66 ? 1 : a.tone < 0.25 ? -1 : 0);
    if (up.edge < 1.3) idx = Math.min(4, idx + 1);
    else if (dn.edge < 1.3) idx = Math.max(1, idx - 1);
    let c = P.cobble[idx];
    if (v === 2 && hash01(x, y, 85) < 0.04) c = P.moss[1];
    return c;
  };
}
/** Плиты пола данжа 16×16 с фаской и трещинами. */
function floor(): Texel {
  return (x, y, v) => {
    const lx = x % 16, ly = y % 16;
    const slab = Math.floor(x / 16) + Math.floor(y / 16) * 2;
    if (lx === 0 || ly === 0) return P.floor[0];
    if (ly === 1 || lx === 1) return P.floor[3];
    if (ly === 15 || lx === 15) return P.floor[1];
    const n = pnoise(x, y, 4, S, 91 + slab);
    let c = n > 0.62 ? P.floor[3] : n < 0.3 ? P.floor[1] : P.floor[2];
    if (v >= 1) {
      const crack = pnoise(x, y, 4, S, 95 + v);
      if (crack > 0.49 && crack < 0.52 && interior(lx, ly, 2) && slab === v % 4) c = P.floor[0];
    }
    if (v === 3 && hash01(x, y, 97) < 0.03) c = [70, 60, 54, 255];
    return c;
  };
}

function snow(): Texel {
  const base = noiseBase(P.snow, 111, 0.35, 0.9);
  return (x, y, v) => {
    const h = hash01(x, y, 111 + v);
    if (interior(x, y) && h < 0.04) return P.snow[1];
    if (interior(x, y) && h > 0.975) return P.snow[4];
    const w = pnoise(x, y * 2, 8, S, 113);
    if (w > 0.8) return P.snow[4];
    return base(x, y, v);
  };
}
function ice(): Texel {
  const base = noiseBase(P.ice, 121, 0.2, 0.85);
  return (x, y, v) => {
    // трещины и блики
    const c = pnoise(x, y, 8, S, 123 + (v % 2)), d = pnoise(x, y, 4, S, 125);
    if (c > 0.47 && c < 0.495 && interior(x, y, 1)) return P.ice[0];
    if (d > 0.66 && d < 0.69) return P.ice[4];
    return base(x, y, v);
  };
}
function obsidian(): Texel {
  const base = noiseBase(P.obsidian, 131, 0.15, 0.85);
  return (x, y, v) => {
    const c = pnoise(x, y, 8, S, 133 + (v % 3));
    if (c > 0.5 && c < 0.525 && interior(x, y, 1)) return v >= 2 ? [220, 90, 30, 255] : P.obsidian[4];
    const h = hash01(x, y, 135 + v);
    if (h > 0.97) return P.obsidian[4];
    return base(x, y, v);
  };
}
function dune(): Texel {
  const base = noiseBase(P.dune, 141, 0.3, 0.8);
  return (x, y, v) => {
    // гребни барханов: тёмная и светлая полоса
    const w = pnoise(x + y * 0.6, y * 1.5, 16, S, 143 + (v % 2));
    if (w > 0.6 && w < 0.64) return P.dune[1];
    if (w > 0.64 && w < 0.69) return P.dune[4];
    const h = hash01(x, y, 145 + v);
    if (interior(x, y) && h < 0.03) return P.dune[1];
    return base(x, y, v);
  };
}
function seabed(): Texel {
  const base = noiseBase(P.seabed, 151, 0.2, 0.8);
  return (x, y, v) => {
    // каустика: светлая сеть линий
    const a = pnoise(x, y, 8, S, 153 + (v % 2)), b = pnoise(x, y, 8, S, 157);
    if (Math.abs(a - b) < 0.035) return P.seabed[4];
    const h = hash01(x, y, 159 + v);
    if (interior(x, y) && h < 0.03) return P.seabed[0];
    return base(x, y, v);
  };
}

// ---------- данж (задача 139): собор → переход → склеп ----------
const MARB = ramp("#141a22", "#202b36", "#33414e", "#4c5d6c", "#6a7e8e", "#92a8b8");
const MARBW = ramp("#10161e", "#1c2630", "#2c3a46", "#42525f", "#5d707e", "#7c92a2");
const BAS = ramp("#0b0910", "#17131e", "#241e2d", "#352d40", "#4a4058", "#655a74");
const BASW = ramp("#08060c", "#120e18", "#1e1826", "#2c2438", "#3e344c", "#54486a");
const MOSSD: RGBA[] = [[28, 58, 32, 255], [44, 90, 48, 255], [74, 138, 64, 255]];
const LAVAH: RGBA[] = [[160, 42, 16, 255], [224, 84, 18, 255], [255, 154, 42, 255], [255, 226, 122, 255]];
const ASHT: RGBA[] = [[42, 36, 38, 255], [60, 52, 54, 255], [84, 74, 76, 255]];
const tn = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
/** Плиты 16×16: ровный светлый тон с едва заметными швами (пол спокойный и светлее стен). base — средний тон рампы, shift(slab) — сдвиг тона плиты. */
function slabs(r: Ramp, seed: number, shift: (slab: number) => number, x: number, y: number, base = 3.3): number {
  const lx = x % 16, ly = y % 16, slab = Math.floor(x / 16) + Math.floor(y / 16) * 2;
  let v = base + shift(slab) * 0.5 + (pnoise(x, y, 8, S, seed + slab) - 0.5) * 0.3 + (hash01(x, y, seed + 7) - 0.5) * 0.1;
  if (lx === 0 || ly === 0) v -= 0.55;
  return Math.max(0, Math.min(r.length - 1, v));
}
/** Трещина-жила по шумовой полосе: возвращает глубину в трещине 0..1 или 0. */
const crackAt = (x: number, y: number, seed: number, w = 0.022) => { const n = pnoise(x, y, 8, S, seed); return Math.abs(n - 0.5) < w ? 1 - Math.abs(n - 0.5) / w : 0; };

/** Мрамор собора: ровные светлые плиты с тонкими швами (v: 0–3 — слегка разный тон, редкий мох у варианта 2). */
function marble(): Texel {
  return (x, y, v) => {
    let c = tn(MARB, slabs(MARB, 601, (sl) => ((sl + Math.floor(sl / 2)) % 2 ? 0.5 : -0.2), x, y, 3.4 + (v === 3 ? -0.15 : 0)));
    if (v === 2 && hash01(x, y, 650) < 0.08 && pnoise(x, y, 8, S, 651) > 0.62) c = MOSSD[hash01(x, y, 652) < 0.5 ? 1 : 0];
    return c;
  };
}
/** Треснувший мрамор перехода: тот же светлый пол с пеплом и редкой жилой лавы (v: 0 пепел, 1 жила, 2 жила шире, 3 плита потемнее). */
function crackedMarble(): Texel {
  return (x, y, v) => {
    let c = tn(MARB, slabs(MARB, 701, (sl) => ((sl + Math.floor(sl / 2)) % 2 ? 0.2 : -0.4), x, y, 3.1 + (v === 3 ? -0.3 : 0)));
    if (pnoise(x, y, 8, S, 710) > 0.66) c = mix(c, ASHT[hash01(x, y, 711) < 0.3 ? 2 : 1], 0.55);
    const ck = crackAt(x, y, 720 + v, v === 2 ? 0.02 : 0.012);
    if (ck > 0 && (v === 1 || v === 2)) c = ck > 0.6 ? LAVAH[2] : LAVAH[1];
    return c;
  };
}
/** Базальт склепа: ровные тёмно-фиолетовые плиты, светлее стен (v: 0 гладкий, 1 лёгкие пятна, 2 тонкий скол, 3 редкая жила лавы). */
function basalt(): Texel {
  return (x, y, v) => {
    let c = tn(BAS, slabs(BAS, 801, (sl) => ((sl + Math.floor(sl / 2)) % 2 ? 0.08 : -0.08), x, y, 3.45));
    if (v === 1 && pnoise(x, y, 8, S, 810) > 0.7) c = shade(c, 0.88);
    if (v === 2 && crackAt(x, y, 822, 0.008) > 0) c = BAS[1];
    if (v === 3) { const ck = crackAt(x, y, 823, 0.008); if (ck > 0) c = ck > 0.6 ? LAVAH[2] : LAVAH[1]; }
    return c;
  };
}
/** Вытертая дорожка: ещё светлее плиты, без трещин. */
function worn(): Texel {
  return (x, y, v) => {
    let k = slabs(BAS, 840, (sl) => ((sl + Math.floor(sl / 2)) % 2 ? 0.06 : -0.06), x, y, 4.2);
    if (v === 3 && hash01(x, y, 845) < 0.03) k -= 0.4;
    return tn(BAS, k);
  };
}

/** Стены данжа по стилю s (0 собор, 1 переход, 2 склеп): верх (v 0–1) — тёмная сплошная масса; лицо (v 0–3) — светлая кромка сверху, тёмная кладка, тёмная полоса у основания. */
function wallTopS(s: number, v: number): PC {
  const out = new PC(S, S), R = s === 2 ? BASW : MARBW;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let k = 0.9 + (pnoise(x, y, 8, S, 300 + v + s * 20) - 0.5) * 0.5;
    if (s === 1 && crackAt(x, y, 340 + v, 0.012) > 0) k = 0.3;
    out.set(x, y, tn(R, k));
  }
  return out;
}
function wallFaceS(s: number, v: number): PC {
  const out = new PC(S, S), R = s === 2 ? BASW : MARBW, CAP = s === 2 ? BAS : MARB;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // светлая кромка-карниз: две строки почти белого верха и строка тени под ней
    if (y < 2) { out.set(x, y, tn(CAP, y === 0 ? 5 : 4.2)); continue; }
    if (y === 2) { out.set(x, y, tn(R, 0.4)); continue; }
    const row = Math.floor((y - 3) / 7), off = row % 2 ? 8 : 0, bx = (x + off) % 16, by = (y - 3) % 7;
    let k = 1.55 + (pnoise(x, y, 8, S, 400 + s * 9 + v) - 0.5) * 0.4 + (hash01(Math.floor((x + off) / 16), row, 31 + v + s * 5) > 0.5 ? 0.18 : -0.1);
    if (by === 6 || bx === 0) k -= 0.7; else if (by === 0) k += 0.3;
    if (y >= S - 5) k = 0.4 + (y - (S - 5)) * -0.05; // тёмная полоса у основания
    let c = tn(R, k);
    if (s === 0) {
      if (v === 1 && y > 21 && y < S - 5 && hash01(x, y, 40) < 0.35 * (y - 21) / 10) c = MOSSD[hash01(x, y, 41) < 0.3 ? 1 : 0];
      if (v === 3 && (y === 10 || y === 12) && x % 4 < 3) c = tn(GLDW, y === 10 ? 2.4 : 1);
    } else if (s === 1) {
      if (v >= 2 && crackAt(x, y, 440 + v, 0.02) > 0 && y > 8 && y < S - 5) c = LAVAH[v === 3 ? 3 : 2];
    } else {
      if (v === 3 && (by === 3 || by === 4) && y > 12 && y < 26) c = tn(IRNW, by === 3 ? 3.2 : 1.2);
      if (v === 2 && crackAt(x, y, 460, 0.018) > 0 && y > 8 && y < S - 5) c = LAVAH[2];
    }
    out.set(x, y, c);
  }
  return out;
}
const GLDW = ramp("#3a2410", "#6e4a1c", "#b07a2a", "#e0b040", "#fff0a0");
const IRNW = ramp("#0e0e14", "#1e1e28", "#34344a", "#50506c", "#74749a", "#a0a0c4");

interface TerrainSpec {
  tex: Texel;
  rimIn?: number; // множитель яркости внутренней кромки
  rimOut?: RGBA; // цвет внешней кромки (поверх нижней поверхности)
  hi?: boolean; // светлая полоска сверху от кромки
}
export const TERRAIN_SPECS: TerrainSpec[] = [
  { tex: () => P.water[2] }, // вода рисуется отдельной анимированной текстурой
  { tex: lava(), rimIn: 0.6 },
  { tex: sand(), rimIn: 0.88, rimOut: [214, 236, 250, 150] },
  { tex: bog(), rimIn: 0.75 },
  { tex: ash(), rimIn: 0.7, rimOut: [30, 18, 16, 150] },
  { tex: dirt(), rimIn: 0.78 },
  { tex: grass(), rimIn: 0.72, hi: true },
  { tex: forest(), rimIn: 0.7, hi: true },
  { tex: cobble(), rimIn: 0.65 },
  { tex: floor(), rimIn: 0.6, rimOut: [20, 12, 14, 170] },
  { tex: snow(), rimIn: 0.8, rimOut: [200, 220, 240, 120], hi: true },
  { tex: ice(), rimIn: 0.72, rimOut: [220, 245, 255, 150] },
  { tex: obsidian(), rimIn: 0.7, rimOut: [10, 8, 14, 170] },
  { tex: dune(), rimIn: 0.82, rimOut: [90, 60, 30, 120] },
  { tex: seabed(), rimIn: 0.75, rimOut: [200, 240, 255, 150] },
  { tex: marble(), rimIn: 0.6, rimOut: [12, 16, 22, 170] }, // данж: собор
  { tex: crackedMarble(), rimIn: 0.6, rimOut: [20, 12, 12, 170] }, // данж: переход
  { tex: basalt(), rimIn: 0.6, rimOut: [6, 4, 10, 190] }, // данж: склеп
  { tex: worn(), rimIn: 0.7, rimOut: [6, 4, 10, 120] }, // данж: вытертая дорожка зала босса
];

/** Покрытие тайла маской углов с шумной границей. */
function coverage(mask: number, x: number, y: number, seed: number) {
  const u = Math.max(0, Math.min(1, (x + 0.5) / S)), v = Math.max(0, Math.min(1, (y + 0.5) / S));
  const tl = mask & 1 ? 1 : 0, tr = mask & 2 ? 1 : 0, br = mask & 4 ? 1 : 0, bl = mask & 8 ? 1 : 0;
  const f = tl * (1 - u) * (1 - v) + tr * u * (1 - v) + br * u * v + bl * (1 - u) * v;
  const n = (pnoise(x, y, 8, S, seed) - 0.5) * 0.55 + (pnoise(x, y, 4, S, seed + 1) - 0.5) * 0.25;
  return f + n;
}

export function terrainTile(t: number, mask: number, variant: number): PC {
  const spec = TERRAIN_SPECS[t];
  const out = new PC(S, S);
  const seed = 500 + t * 17;
  const inside = (x: number, y: number) => (mask === 15 ? true : coverage(mask, x, y, seed) > 0.5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (inside(x, y)) {
      let c = spec.tex(x, y, variant);
      if (mask !== 15) {
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const edgeBelow = !inside(x, y + 1) || !inside(x, y + 2);
        if (edge && spec.rimIn) c = shade(c, spec.rimIn);
        else if (edgeBelow && spec.rimIn) c = shade(c, (1 + spec.rimIn) / 2);
        else if (spec.hi && !inside(x, y - 2)) c = mix(c, [255, 255, 220, 255], 0.12);
      }
      out.set(x, y, c);
    } else if (spec.rimOut && mask !== 0) {
      const near = inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
      if (near) out.set(x, y, spec.rimOut);
    }
  }
  return out;
}

/** Стены данжа. */
function wallTop(v: number): PC {
  const out = new PC(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = pnoise(x, y, 8, S, 300 + v);
    out.set(x, y, P.wallTop[n > 0.6 ? 3 : n > 0.4 ? 2 : 1]);
  }
  return out;
}
function wallFace(v: number): PC {
  const out = new PC(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // верхний срез стены
    if (y < 6) { out.set(x, y, y === 5 ? P.wallFace[4] : P.wallTop[2 + (hash01(x, y, 7) > 0.7 ? 1 : 0)]); continue; }
    const row = Math.floor((y - 6) / 7);
    const off = row % 2 ? 8 : 0;
    const bx = (x + off) % 16, by = (y - 6) % 7;
    let c: RGBA;
    if (by === 6 || bx === 0) c = P.wallFace[0];
    else if (by === 0) c = P.wallFace[3];
    else if (bx === 15) c = P.wallFace[1];
    else c = P.wallFace[hash01(Math.floor((x + off) / 16), row, 31 + v) > 0.5 ? 2 : 1];
    if (y >= S - 3) c = shade(c, 0.7);
    if (v === 1 && hash01(x, y, 40) < 0.08 && y > 20) c = P.moss[1 + (y % 2)];
    if (v === 2 && Math.abs(x - 12 - (y - 14) * 0.5) < 0.6 && y > 10 && y < 26) c = P.wallFace[0];
    out.set(x, y, c);
  }
  return out;
}

export function buildTileset(): PC {
  const out = new PC(TILESET_COLS * S, (TERRAIN_COUNT + 1) * S);
  for (let t = 1; t < TERRAIN_SPECS.length; t++) {
    for (let mask = 1; mask <= 15; mask++) out.blit(terrainTile(t, mask, 0), (mask - 1) * S, t * S);
    for (let v = 1; v <= 3; v++) out.blit(terrainTile(t, 15, v), (14 + v) * S, t * S);
  }
  // стены данжа по стилям: собор — столбцы 0–5, переход — 6–11, склеп — 12–17 (верх 0–1, лицо 2–5 в каждом)
  for (let st = 0; st < 3; st++) {
    for (let v = 0; v < 2; v++) out.blit(wallTopS(st, v), (st * 6 + v) * S, TERRAIN_COUNT * S);
    for (let v = 0; v < 4; v++) out.blit(wallFaceS(st, v), (st * 6 + 2 + v) * S, TERRAIN_COUNT * S);
  }
  return out;
}

/** Бесшовная вода 64×64 для фонового слоя: волны и блики. */
export function buildWater(frame: number): PC {
  const W = 64;
  const out = new PC(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const n = pnoise(x, y, 16, W, 900) * 0.6 + pnoise(x, y, 8, W, 901) * 0.4;
    let c = pick(P.water, 0.15 + n * 0.6);
    const wv = pnoise(x + frame * 4, y * 2, 16, W, 905);
    if (wv > 0.62 && wv < 0.66) c = P.water[3];
    if (wv > 0.66 && wv < 0.675) c = P.water[4];
    out.set(x, y, c);
  }
  return out;
}
export function buildLavaGlow(): PC {
  const out = new PC(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = pnoise(x, y, 16, 64, 950);
    out.set(x, y, withA(P.lava[4], n > 0.6 ? 90 : 0));
  }
  return out;
}
