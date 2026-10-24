/** Штандарты для мира (задача 130; в игру — шаги 9–10 задачи 132, docs/map-rework.md, решения 5 и 7; docs/faction-war.md, раздел 10).
 *  Гербы — утверждённые (tools/gen/heraldry.ts): Сольгард «Восход над Оплотом», Умбрат «Корона над гробом»; рисунок гербов не меняется,
 *  малые эмблемы берутся готовыми (s20 — штандарт своих земель, s16 — повреждённые), королевские знамёна несут полный герб без ленты.
 *  Состав: штандарт своих земель (70 и 68 px — 2,4 роста героя 29 px); спорные земли — порванный в стрелах, обгоревший, сломанный
 *  в грязи с телом павшего (слои: земля под героями и стоящий обломок); основание захвата (тумба и мачта — отдельные слои) и два
 *  королевских знамени, которые едут по мачте; эмблема игры «Пепельный Предел» — 3 варианта и итог (вариант 2 с короной перед городом в печати, logoFinal).
 *  Планка: объём, 3–5 тонов на материал, контур 1 px, свет сверху слева, без одиночных пикселей; пиксель листа — пиксель мира.
 *  Ветер: полотнище рисуется плоско, затем в кадре строки сдвигаются целыми пикселями (снос и качание, к низу сильнее, с запаздыванием),
 *  складки — полосы светотени по тонам своего материала, бегут ровно на 1 px за кадр (длина волны = числу кадров), кромки рябят.
 *  План ветра считается на весь цикл сразу: сдвиг строки и кромка (сдвиг ± вынутый рябью пиксель) меняются не больше чем на 1 px
 *  за кадр (и на шве цикла), без возвратов через кадр. Запаздывание фазы к низу — около цикла: волна бежит от бруса вниз, за кадр
 *  сдвигается малая часть строк, толчка всего полотнища нет (изменённых пикселей за кадр ≤ 1,5 медианы). Герб кладётся целиком
 *  (как у «Знамени защиты») и сдвигается в том же кадре, что строка на его середине; там снос и качание < 0.5 px — герб стоит,
 *  складки его затеняют. Мелкие узоры на ткани (бахрома, пунктиры) — с шагом не меньше 3 px: при сдвиге на 1 px не мигают.
 *  Цикл 12 кадров, 12 кадров/с. Модель ветра общая со «Знаменем защиты» (tools/gen/vfx-banner.ts).
 *  Запуск: npx tsx tools/gen/standards.ts → tools/out/standards/ (листы, sheets.json, preview.png, logo.png, итог эмблемы logo-final*.png)
 *  и эмблема экрана загрузки client/public/ui/logo-emblem.png; с --logo — только эмблема. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { PC, hex, pnoise, OUTLINE, type RGBA } from "./canvas";
import { P } from "./palette";
import { ARMS, factionEmblem, azureMedallion, SOLGARD_SHIELD_TOP } from "./heraldry";

type Col = RGBA;
type Fac = "solgard" | "umbrath";
const c = (s: string) => hex(s);
const TAU = Math.PI * 2;
/** Кадров в цикле и скорость: 12 кадров по 1/12 с. */
const N = 12, FPS = 12;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------- PNG и холсты (свои: генератор не тянет модуль карты через vendor-lib)
function readPng(file: string): PC {
  const png = PNG.sync.read(fs.readFileSync(file)), pc = new PC(png.width, png.height);
  pc.data.set(png.data);
  return pc;
}
function crop(src: PC, x: number, y: number, w: number, h: number): PC {
  const out = new PC(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!src.inside(x + i, y + j)) continue;
    const s = ((y + j) * src.w + x + i) * 4, d = (j * w + i) * 4;
    for (let q = 0; q < 4; q++) out.data[d + q] = src.data[s + q];
  }
  return out;
}
function scaleNN(src: PC, k: number): PC {
  const out = new PC(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4, d = (y * out.w + x) * 4;
    for (let q = 0; q < 4; q++) out.data[d + q] = src.data[s + q];
  }
  return out;
}
function fill(pc: PC, col: RGBA) {
  for (let i = 0; i < pc.data.length; i += 4) { pc.data[i] = col[0]; pc.data[i + 1] = col[1]; pc.data[i + 2] = col[2]; pc.data[i + 3] = col[3]; }
}

// ---------------------------------------------------------------- палитра (tools/gen/palette.ts и цвета утверждённых гербов)
const G = P.gold;                                                              // #6a4210 #a8681c #e0a630 #ffd864 #fff2b0
const GLOW = c("#fff4c8");
const AZ = [c("#12365e"), c("#1f5a96"), c("#3a86c8"), c("#7ec8ff")];          // лазурь герба
const WH = P.cloth.white;                                                      // #7a7480 #aaa4ae #d6d0d8 #f6f2f8
const IV = [c("#7a6a4c"), c("#bfae88"), c("#d6c8a4")];                         // кость-камень герба Сольгарда
const WOOD = P.wood;                                                           // #3a2216 #5e3a22 #8a5a34 #b07e4c
const STEEL = P.steel;                                                         // #3a3f4c … #f2f6ff
const SOUT = c("#3a2208");                                                     // контур золота Сольгарда
const UK = [c("#0a0612"), c("#100a1a"), c("#22163a"), c("#382858")];          // чернь Умбрата
const UP = [c("#2a1846"), c("#46265e"), c("#6a3c8a"), c("#9a62b8"), c("#d0b4f0"), c("#f4f0ff")];   // пурпур → сирень → жемчуг
const UG = [c("#3fcf45"), c("#7aff6a"), c("#dcffd0")];                         // ядовитая зелень (светится — складки не затеняют)
const BONE = [c("#4e4638"), c("#8f8468"), c("#c8bc9c"), c("#ece4cc")];
const SIL = [c("#2c2838"), c("#545066"), c("#8a87a0"), c("#c4c2d4")];
const UOUT = c("#05030a");
const IRON = P.darkSteel;                                                      // чёрное железо #1e1e2a … #9a98b8

// ---------------------------------------------------------------- тона: сдвиг цвета по своей рампе (складки не выводят из палитры)
type ToneFn = (col: Col, d: number) => Col;
const ckey = (q: Col) => (q[0] << 16) | (q[1] << 8) | q[2];
/** Рампы (тёмный → светлый) материалов: цвет сдвигается на d ступеней внутри своей рампы; чужие цвета и fixed не меняются. */
function toneFn(ramps: Col[][], fixed: Col[] = []): ToneFn {
  const map = new Map<number, [Col[], number]>();
  for (const r of ramps) r.forEach((q, i) => { if (!map.has(ckey(q))) map.set(ckey(q), [r, i]); });
  const fx = new Set(fixed.map(ckey));
  return (col, d) => {
    if (!d || !col[3] || fx.has(ckey(col))) return col;
    const m = map.get(ckey(col));
    if (!m) return col;
    const [r, i] = m;
    return r[Math.max(0, Math.min(r.length - 1, i + d))];
  };
}
const TONE: Record<Fac, ToneFn> = {
  solgard: toneFn([WH, AZ, [G[0], G[1], G[2], G[3], G[4]], [G[3], GLOW], IV, WOOD, STEEL], [SOUT, OUTLINE]),
  umbrath: toneFn([UK, UP, BONE, SIL, IRON], [UOUT, OUTLINE, ...UG]),
};

// ---------------------------------------------------------------- общие помощники
/** Рисунок по сетке символов: «.» и пробел — прозрачно. */
function stamp(pc: PC, x0: number, y0: number, rows: string[], legend: Record<string, Col>, flipX = false) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    const col = legend[ch];
    if (col) pc.set(flipX ? x0 + r.length - 1 - i : x0 + i, y0 + j, col);
  }));
}
/** Расстояние до края маски по 4 соседям: 1 — крайний пиксель, 0 — вне маски. */
function distMap(w: number, h: number, inside: (x: number, y: number) => boolean): Int16Array {
  const d = new Int16Array(w * h), q: number[] = [];
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!has(x, y)) continue;
    if (!has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1)) { d[y * w + x] = 1; q.push(y * w + x); }
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i], x = p % w, y = (p - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!has(nx, ny)) continue;
      const n = ny * w + nx;
      if (d[n] === 0) { d[n] = d[p] + 1; q.push(n); }
    }
  }
  return d;
}
/** Слой: рисуем, обводим контуром, кладём на холст. */
function layer(dst: PC, draw: (l: PC) => void, out: Col = OUTLINE, x = 0, y = 0) {
  const l = new PC(dst.w, dst.h);
  draw(l);
  l.outline(out);
  dst.blit(l, x, y);
  return l;
}
/** Карта тонов без одиночек: пиксель, у которого нет соседа того же тона, а ≥ 3 соседа одного тона, берёт их тон. */
function despeckleTones(tm: Int8Array, w: number, h: number, on: (x: number, y: number) => boolean) {
  const fix: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const v = tm[y * w + x];
    const nb: number[] = [];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (nx >= 0 && ny >= 0 && nx < w && ny < h && on(nx, ny)) nb.push(tm[ny * w + nx]);
    if (nb.includes(v)) continue;
    for (const cand of nb) if (nb.filter((q) => q === cand).length >= Math.min(3, nb.length)) { fix.push([y * w + x, cand]); break; }
  }
  for (const [i, v] of fix) tm[i] = v;
}
/** Убрать одиночные пиксели цвета в готовом слое (без соседа своего цвета, ≥ 3 соседа одного цвета). */
function despeckle(pc: PC, keep: Col[] = []) {
  const same = (a: Col | null, b: Col | null) => !!a && !!b && a[3] > 0 && b[3] > 0 && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const fix: [number, number, Col][] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const c0 = pc.get(x, y)!;
    if (!c0[3] || keep.some((k) => same(k, c0))) continue;
    const n = [pc.get(x - 1, y), pc.get(x + 1, y), pc.get(x, y - 1), pc.get(x, y + 1)];
    if (n.some((q) => same(q, c0))) continue;
    for (const cand of n) if (cand && cand[3] && n.filter((q) => same(q, cand)).length >= 3) { fix.push([x, y, cand]); break; }
  }
  for (const [x, y, col] of fix) pc.set(x, y, col);
  return pc;
}

/** Убрать пиксели-островки: непрозрачный пиксель без единого соседа по 4 направлениям. */
function dropIslands(pc: PC) {
  const lone: [number, number][] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) && !pc.alpha(x - 1, y) && !pc.alpha(x + 1, y) && !pc.alpha(x, y - 1) && !pc.alpha(x, y + 1)) lone.push([x, y]);
  for (const [x, y] of lone) pc.clear(x, y);
  return pc;
}

// ---------------------------------------------------------------- полотнище и ветер
/** Плоская текстура полотнища: маска и цвет по расстоянию до края d (1 — крайний пиксель). */
function clothTex(w: number, h: number, inside: (x: number, y: number) => boolean, color: (x: number, y: number, d: number) => Col | null): PC {
  const pc = new PC(w, h), d = distMap(w, h, inside);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = d[y * w + x];
    if (!k) continue;
    const col = color(x, y, k);
    if (col) pc.set(x, y, col);
  }
  return pc;
}
interface Wind {
  /** Средний снос низа по ветру и размах качания низа, px. Качание < 1.9 px: при 12 кадрах строка сдвигается ≤ 1 px за кадр.
   *  На середине герба снос + качание < 0.5 px: герб не сдвигается (рисунок крупный — его сдвиг дал бы толчок на весь кадр). */
  lean: number; sway: number;
  /** Запаздывание фазы к низу, рад: около цикла и больше — волна бежит от бруса вниз, за кадр сдвигается малая часть строк
   *  (при 2 рад пороги округления совпадали, и почти всё полотнище сдвигалось в одном кадре — толчок раз в цикл). */
  lag: number;
  /** Длина волны складок (px) — равна числу кадров: складки бегут ровно на 1 px за кадр; наклон складок — сдвиг по u на строку. */
  lambda: number; slant: number;
  /** Сила складок: 0 выше доли высоты f0, полная ниже f1. */
  f0: number; f1: number;
  /** Пороги тонов: свет, тень, глубокая тень; герб темнеет только глубже embT. */
  lightT: number; darkT: number; deepT: number; embT: number;
  /** Рябь кромок: волна бежит вниз по боковым кромкам (длина rip строк, ровно 1 строка за кадр при rip = N), кромка уходит внутрь на 1 px
   *  во впадине (порог ripT). Пиксель вынимается из ровного поля у каймы — кайма и её внутренняя линия остаются целыми. 0 — без ряби. */
  rip: number; ripT: number;
  /** Рябь только на внешних ripOuter px кромки (1 — во впадине уходит крайний пиксель каймы): тонкая внутренняя линия и просвет
   *  каймы не дёргаются относительно ткани. Не задано — вынимается пиксель ровного поля, кайма сдвигается внутрь целиком. */
  ripOuter?: number;
  /** С какого расстояния до края начинается ровное поле (рябь вынимает пиксели только из него): кайма и шитьё целы. */
  fieldD: number;
  /** Жёсткая кайма: пиксели ближе stiff к краю (густое шитьё) темнеют только в глубине складки, как герб; 0 — нет. */
  stiff?: number;
  /** Тень от перекладины: сколько верхних строк на тон темнее. */
  topShade: number;
  /** Герб без светотени складок — один тон на весь рисунок (у «Знамени защиты» и в эмблеме игры герб Сольгарда лежит прямо на шёлке). */
  embFlat?: boolean;
  /** Смена сдвига строки держится не меньше 2 кадров (holdShifts): иначе на быстром качании (2 px за 2 кадра) тонкие линии каймы
   *  проходят пиксель за кадр и мигают «через кадр». Размах и цикл качания те же. */
  hold?: boolean;
}
const WIND_HOME: Wind = { lean: 0.4, sway: 1.6, lag: 7, lambda: N, slant: 0.18, f0: 0.04, f1: 0.42, lightT: 0.62, darkT: 0.3, deepT: 2, embT: 0.75, rip: N, ripT: 0.35, fieldD: 4, topShade: 1 };
interface Emb { pc: PC; x: number; y: number }
interface ClothOut {
  L: PC; M: number;
  /** Сдвиг строки текстуры v в кадре (без ряби кромок). */
  sx: number[];
  /** Сдвиг герба. */
  edx: number;
  /** Экранный столбец слоя для пикселя текстуры (u, v) или −1, если пиксель вынут рябью. */
  at: (u: number, v: number) => number;
}
/** Сдвиги строк без одиночных выступов: строка, отличная от двух равных соседей, берёт их значение (кромка — чистая лесенка). */
function smoothRuns(a: number[]) {
  for (let i = 1; i < a.length - 1; i++) if (a[i - 1] === a[i + 1] && a[i] !== a[i - 1]) a[i] = a[i - 1];
  return a;
}
/** План ветра на весь цикл: сдвиги строк sx[t][v] и рябь кромок eL/eR[t][v] (1 — у кромки вынут пиксель поля, кромка ушла внутрь).
 *  Сдвиг строки и сама кромка (сдвиг ± вынутый пиксель) меняются не больше чем на 1 px за кадр, включая шов цикла: если рябь
 *  совпала со шагом строки в ту же сторону, она ждёт кадр. С Wind.hold смена сдвига строки держится не меньше 2 кадров. */
interface WindPlan { sx: number[][]; eL: number[][]; eR: number[][] }
/** Без рывков: значение, державшееся один кадр и вернувшееся (0,1,0), снимается; после — снова без одиночных строк в кадре. */
function noReturns(arrs: number[][][], H: number) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const arr of arrs) for (let v = 0; v < H; v++) for (let t = 0; t < N; t++) {
      const p0 = arr[(t + N - 1) % N][v], q = arr[(t + 1) % N][v];
      if (p0 === q && arr[t][v] !== p0) { arr[t][v] = p0; changed = true; }
    }
    for (const arr of arrs) for (let t = 0; t < N; t++) smoothRuns(arr[t]);
    if (!changed) break;
  }
}
/** Шаг сдвига строки — не больше 1 px за кадр, включая шов цикла. */
function stepLimit(sx: number[][], H: number) {
  for (let v = 0; v < H; v++) for (let pass = 0; pass < 4; pass++) for (let t = 0; t < N; t++) {
    const a = sx[t][v], t1 = (t + 1) % N, b = sx[t1][v];
    if (Math.abs(b - a) > 1) sx[t1][v] = a + Math.sign(b - a);
  }
}
/** План целых сдвигов на цикл для H строк по непрерывной val(t, v) (лент, шнуров, кистей): те же правила, что у строк полотнища —
 *  без одиночных строк в кадре, без возвратов A→B→A через кадр, шаг не больше 1 px за кадр. */
function planShifts(H: number, val: (t: number, v: number) => number): number[][] {
  const sx = Array.from({ length: N }, (_, t) => smoothRuns(Array.from({ length: H }, (_, v) => Math.round(val(t, v)))));
  noReturns([sx], H);
  stepLimit(sx, H);
  return sx;
}
const planCache = new WeakMap<PC, Map<Wind, WindPlan>>();
function windPlan(tex: PC, w: Wind): WindPlan {
  let cache = planCache.get(tex);
  if (!cache) { cache = new Map(); planCache.set(tex, cache); }
  const hit = cache.get(w);
  if (hit) return hit;
  const H = tex.h, TW = tex.w, d = distMap(TW, H, (u, v) => tex.alpha(u, v) > 0);
  const strength = (v: number) => clamp01((v / (H - 1) - w.f0) / (w.f1 - w.f0));
  const first = Array.from({ length: H }, (_, v) => { for (let u = 0; u < TW; u++) if (tex.alpha(u, v)) return u; return -1; });
  const last = Array.from({ length: H }, (_, v) => { for (let u = TW - 1; u >= 0; u--) if (tex.alpha(u, v)) return u; return -1; });
  const straight = (e: number[], v: number) => v > 0 && v < H - 1 && e[v] >= 0 && e[v - 1] === e[v] && e[v + 1] === e[v];
  // вынуть можно, только если в строке есть два соседних пикселя ровного поля (кайма и шитьё целы)
  const canCut = Array.from({ length: H }, (_, v) => { for (let u = 0; u < TW - 1; u++) if (tex.alpha(u, v) && tex.alpha(u + 1, v) && d[v * TW + u] >= w.fieldD && d[v * TW + u + 1] >= w.fieldD) return true; return false; });
  const sx: number[][] = [], eL: number[][] = [], eR: number[][] = [];
  for (let t = 0; t < N; t++) {
    const ph = (TAU * t) / N;
    const swayAt = (vn: number) => w.lean * Math.pow(vn, 1.4) + w.sway * Math.pow(vn, 1.6) * Math.sin(ph - w.lag * vn);
    sx.push(smoothRuns(Array.from({ length: H }, (_, v) => Math.round(swayAt(v / (H - 1))))));
    const rip = (side: number) => smoothRuns(Array.from({ length: H }, (_, v) => {
      if (!w.rip) return 0;
      const r = strength(v) * Math.cos((TAU * v) / w.rip - ph + side * 2.4);
      return r < -w.ripT ? 1 : 0;
    }));
    eL.push(rip(0).map((q, v) => (q && canCut[v] && straight(first, v) ? 1 : 0)));
    eR.push(rip(1).map((q, v) => (q && canCut[v] && straight(last, v) ? 1 : 0)));
  }
  noReturns([sx, eL, eR], H);
  stepLimit(sx, H);
  if (w.hold) holdShifts(sx, H);
  for (const [e, sgn, edge] of [[eL, 1, first], [eR, -1, last]] as [number[][], number, number[]][]) for (let v = 0; v < H; v++) {
    if (!canCut[v] || !straight(edge, v)) continue;
    const at = (t: number) => sx[(t + N) % N][v] + sgn * e[(t + N) % N][v];
    for (let pass = 0; pass < 8; pass++) {
      let ok = true;
      for (let t = 0; t < N; t++) {
        const t1 = (t + 1) % N, a = at(t), b = at(t1);
        if (Math.abs(b - a) > 1) { e[t1][v] = e[t][v]; ok = false; }
      }
      // кромка целиком (сдвиг строки ± вынутый пиксель) — без возвратов A→B→A: рябь подстраивается под шаг строки
      for (let t = 0; t < N; t++) {
        const p0 = at(t - 1), q = at(t + 1), want = (p0 - sx[t][v]) * sgn;
        if (p0 === q && at(t) !== p0 && (want === 0 || want === 1)) { e[t][v] = want; ok = false; }
      }
      if (ok) break;
    }
  }
  const plan = { sx, eL, eR };
  cache.set(w, plan);
  return plan;
}
/** Цикл значений без рывков: шаг ≤ 1 (и на шве цикла), каждое значение держится не меньше 2 кадров. */
function heldTwo(a: number[]) {
  const n = a.length;
  if (a.every((q) => q === a[0])) return true;
  for (let t = 0; t < n; t++) {
    const p = a[(t + n - 1) % n], q = a[t], r = a[(t + 1) % n];
    if (Math.abs(r - q) > 1 || (p !== q && q !== r)) return false;
  }
  return true;
}
/** Wind.hold: строка, где сдвиг держится один кадр (2 px за 2 кадра), заменяется ближайшей последовательностью с удержанием ≥ 2 кадров —
 *  каждый кадр отличается от плана не больше чем на 1 px, размах строки тот же, изменённых кадров меньше всего; при равенстве — ближе
 *  к строке выше (волна по-прежнему бежит вниз), перепад между соседними строками ≤ 1 px. */
function holdShifts(sx: number[][], H: number) {
  for (let v = 0; v < H; v++) {
    const old = sx.map((r) => r[v]);
    if (heldTwo(old)) continue;
    const up = v > 0 ? sx.map((r) => r[v - 1]) : null, lo = Math.min(...old), hi = Math.max(...old);
    let best: number[] | null = null, bestCost = Infinity;
    const cur: number[] = [];
    const walk = (t: number, cost: number) => {
      if (cost >= bestCost) return;
      if (t === N) {
        if (!heldTwo(cur)) return;
        let c = cost + (Math.min(...cur) !== lo || Math.max(...cur) !== hi ? 50 : 0);
        if (up) for (let i = 0; i < N; i++) { const g = Math.abs(cur[i] - up[i]); c += g > 1 ? 1000 : g * 0.01; }
        if (c < bestCost) { bestCost = c; best = [...cur]; }
        return;
      }
      for (const dv of [0, -1, 1]) {
        const q = old[t] + dv;
        if (t > 0 && Math.abs(q - cur[t - 1]) > 1) continue;
        if (t >= 2 && q !== cur[t - 1] && cur[t - 1] !== cur[t - 2]) continue;      // прежнее значение держалось бы один кадр
        cur.push(q);
        walk(t + 1, cost + (dv ? 10 : 0));
        cur.pop();
      }
    };
    walk(0, 0);
    if (best) for (let t = 0; t < N; t++) sx[t][v] = best[t];
  }
}
/** Кадр t полотнища с ветром. Слой шире текстуры на M с каждой стороны и на 3 строки ниже; текстура (0, 0) → слой (M, 0). */
function windCloth(tex: PC, emb: Emb | null, t: number, w: Wind, tone: ToneFn, M = 8): ClothOut {
  const ph = (TAU * t) / N, H = tex.h, TW = tex.w;
  const L = new PC(TW + 2 * M, H + 3);
  const plan = windPlan(tex, w), tt = ((t % N) + N) % N;
  const sx = plan.sx[tt], eL = plan.eL[tt], eR = plan.eR[tt];
  const strength = (v: number) => clamp01((v / (H - 1) - w.f0) / (w.f1 - w.f0));
  const fold = (us: number, v: number) => strength(v) * Math.cos((TAU * (us + 0.5 - w.slant * v)) / w.lambda - ph);
  const d = distMap(TW, H, (u, v) => tex.alpha(u, v) > 0);
  const pos = new Int16Array(TW * H).fill(-1);
  const isCloth = new Uint8Array(L.w * L.h), dl = new Int16Array(L.w * L.h);
  // крайние пиксели строк: рябь только на прямых участках кромки (на косом срезе низа лесенка ломалась бы)
  const first = Array.from({ length: H }, (_, v) => { for (let u = 0; u < TW; u++) if (tex.alpha(u, v)) return u; return -1; });
  const last = Array.from({ length: H }, (_, v) => { for (let u = TW - 1; u >= 0; u--) if (tex.alpha(u, v)) return u; return -1; });
  const straight = (e: number[], v: number) => v > 0 && v < H - 1 && e[v] >= 0 && e[v - 1] === e[v] && e[v + 1] === e[v];
  for (let v = 0; v < H; v++) {
    const us: number[] = [];
    for (let u = 0; u < TW; u++) if (tex.alpha(u, v)) us.push(u);
    if (!us.length) continue;
    let cutL = -1, cutR = -1;
    if (w.ripOuter) {
      // рябь только у края: вынимается пиксель на расстоянии ripOuter от кромки, внешние сдвигаются внутрь — линия и просвет каймы стоят
      if (eL[v] && straight(first, v)) cutL = w.ripOuter - 1;
      if (eR[v] && straight(last, v)) cutR = us.length - w.ripOuter;
    } else {
      // вынуть по пикселю ровного поля у левой и правой каймы (d ≥ 4, сосед тоже поле)
      const inner = (k: number) => d[v * TW + us[k]] >= w.fieldD && d[v * TW + us[k + 1]] >= w.fieldD && us[k + 1] === us[k] + 1;
      if (eL[v] && straight(first, v)) for (let k = 0; k < us.length - 1; k++) if (inner(k)) { cutL = k; break; }
      if (eR[v] && straight(last, v)) for (let k = us.length - 2; k >= 0; k--) if (inner(k) && k !== cutL) { cutR = k + 1; break; }
    }
    for (let k = 0; k < us.length; k++) {
      if (k === cutL || k === cutR) continue;
      const shiftIn = cutL >= 0 && k < cutL ? 1 : cutR >= 0 && k > cutR ? -1 : 0;
      const X = M + us[k] + sx[v] + shiftIn;
      pos[v * TW + us[k]] = X;
      L.set(X, v, tex.get(us[k], v)!);
      isCloth[v * L.w + X] = 1;
      dl[v * L.w + X] = d[v * TW + us[k]];
    }
  }
  // складки в экранных столбцах (рябь вынимает поле, полосы не дёргаются); тень от перекладины; без одиночных пикселей тона
  const tm = new Int8Array(L.w * L.h), fv = new Float32Array(L.w * L.h);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < L.w; X++) {
    if (!isCloth[Y * L.w + X]) continue;
    const f = fold(X - M - sx[Y], Y);
    fv[Y * L.w + X] = f;
    tm[Y * L.w + X] = Y < w.topShade ? -1 : dl[Y * L.w + X] < (w.stiff ?? 0) ? (f < -w.embT ? -1 : 0)
      : f > w.lightT ? 1 : f < -w.deepT ? -2 : f < -w.darkT ? -1 : 0;
  }
  despeckleTones(tm, L.w, L.h, (X, Y) => isCloth[Y * L.w + X] === 1);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < L.w; X++) if (isCloth[Y * L.w + X]) L.set(X, Y, tone(L.get(X, Y)!, tm[Y * L.w + X]));
  // герб целиком: сдвиг — в том же кадре и на столько же, что у строки на его середине (по плану: шаг ≤ 1 px, без возвратов);
  //  темнеет только в глубине складки (или не темнеет вовсе — embFlat)
  let edx = 0;
  if (emb) {
    edx = sx[Math.max(0, Math.min(H - 1, Math.round(emb.y + (emb.pc.h - 1) / 2)))];
    // тень глубокой складки на гербе — полосой не уже 2 px (тонкая полоса на мелком рисунке рябит)
    const deep = (X: number, Y: number) => isCloth[Y * L.w + X] === 1 && fv[Y * L.w + X] < -w.embT;
    for (let j = 0; j < emb.pc.h; j++) for (let i = 0; i < emb.pc.w; i++) {
      const col = emb.pc.get(i, j)!;
      if (!col[3]) continue;
      const X = M + emb.x + i + edx, Y = emb.y + j;
      if (!isCloth[Y * L.w + X]) continue;
      L.set(X, Y, w.embFlat ? col : tone(col, deep(X, Y) || deep(X + 1, Y) ? -1 : 0));
    }
  }
  return { L, M, sx, edx, at: (u, v) => (u >= 0 && v >= 0 && u < TW && v < H ? pos[v * TW + u] : -1) };
}

// ---------------------------------------------------------------- набор деталей фракции: древко, перекладина, петли, навершие, подток
interface Kit {
  fac: Fac; tone: ToneFn;
  /** Ширина древка: у Сольгарда 4 px (чётная эмблема), у Умбрата 3 px. */
  poleW: number;
  /** Древко x0..x0+poleW−1, строки y0..y1; burnt — обугленные строки [от, до]. */
  pole(l: PC, x0: number, y0: number, y1: number, burnt?: [number, number]): void;
  /** Подток — нижние 4 строки до gy. */
  foot(l: PC, x0: number, gy: number): void;
  /** Брус перекладины x0..x1 (3 строки от y) с торцами; cut — торец отломан/сгорел (left/right). */
  bar(l: PC, x0: number, x1: number, y: number, cut?: "left" | "right", burnt?: boolean): void;
  /** Петля через брус: столбцы x..x+w−1, строки y0..y1. */
  tie(l: PC, x: number, w: number, y0: number, y1: number): void;
  /** Навершие над древком (x0 — левый столбец древка), нижняя строка — y; soot — закопчено. */
  finial(l: PC, x0: number, y: number, soot?: boolean): void;
  /** Высота навершия, px. */
  finialH: number;
  /** Цвета стрел врага: древко (свет, тень), оперение (свет, тень). */
  arrow: { s: [Col, Col]; f: [Col, Col] };
  /** Цвета полотна: кайма, внутренняя линия, поле. */
  cloth(d: number): Col;
}
const CHAR = [c("#1c1618"), c("#272326"), c("#463e40"), c("#58504e")];   // уголь и пепел (P.ash)
const FIRE = P.magic.fire;                                              // #7a1c10 #c23a12 #f06a1a #ffb03a #ffe88a
/** Закопчённый цвет — на ступень (k < 0.5) или две темнее по рампе своего материала: без смешивания, цвет остаётся в палитре. */
const SOOT_TONE = toneFn([[G[0], G[1], G[2], G[3], G[4]], STEEL, WOOD, BONE, UP, SIL, IRON]);
const sooty = (q: Col, k = 0.55) => SOOT_TONE(q, k < 0.5 ? -1 : -2);
const ASH = P.ash;                                                      // #272326 #363034 #463e40 #58504e #6c6460

const SOL: Kit = {
  fac: "solgard", tone: TONE.solgard, poleW: 4, finialH: 10,
  pole(l, x0, y0, y1, burnt = [-1, -1]) {
    for (let y = y0; y <= y1; y++) {
      const b = y >= burnt[0] && y <= burnt[1];
      l.set(x0, y, b ? CHAR[3] : WOOD[3]); l.set(x0 + 1, y, b ? CHAR[2] : WOOD[2]); l.set(x0 + 2, y, b ? CHAR[2] : WOOD[2]); l.set(x0 + 3, y, b ? CHAR[1] : WOOD[1]);
    }
  },
  foot(l, x0, gy) { stamp(l, x0, gy - 3, ["LHMD", "LHMD", ".MD.", ".KD."], { H: STEEL[4], L: STEEL[3], M: STEEL[2], D: STEEL[1], K: STEEL[0] }); },
  bar(l, x0, x1, y, cut, burnt) {
    for (let x = x0; x <= x1; x++) {
      const sc = burnt && (cut === "right" ? x > x1 - 6 : x < x0 + 6);
      l.set(x, y, sc ? CHAR[3] : WOOD[3]); l.set(x, y + 1, sc ? CHAR[2] : WOOD[2]); l.set(x, y + 2, sc ? CHAR[1] : WOOD[1]);
    }
    const cap = ["GY", "GG", "gG", "gg", "hg"], lg = { Y: G[4], G: G[3], g: G[2], h: G[1] };
    if (cut !== "left") stamp(l, x0 - 2, y - 1, cap, lg);
    if (cut !== "right") stamp(l, x1 + 1, y - 1, cap, lg);
  },
  tie(l, x, w, y0, y1) {
    for (let k = 0; k < w; k++) for (let y = y0; y <= y1; y++) l.set(x + k, y, y === y0 || k === 0 ? AZ[3] : k === w - 1 ? AZ[1] : AZ[2]);
  },
  finial(l, x0, y, soot) {
    const lg: Record<string, Col> = { H: STEEL[4], L: STEEL[3], M: STEEL[2], D: STEEL[1], Y: G[4], G: G[3], g: G[2], h: G[1] };
    if (soot) for (const k of Object.keys(lg)) lg[k] = sooty(lg[k], k === "H" || k === "Y" ? 0.45 : 0.6);
    stamp(l, x0 - 1, y - 9, [
      "..HM..",
      ".LHMD.",
      ".LHMD.",
      "LLHMDD",
      "LLHMDD",
      ".LHMD.",
      "..HM..",
      ".LHMD.",
      "gYGGgh",
      "hggghh",
    ], lg);
  },
  arrow: { s: [IRON[3], IRON[1]], f: [UP[4], UP[2]] },                    // стрелы Умбрата: древко чёрного железа, сиреневое оперение
  cloth: (d) => (d <= 2 ? AZ[2] : d === 3 ? WH[1] : WH[2]),
};
const UMB: Kit = {
  fac: "umbrath", tone: TONE.umbrath, poleW: 3, finialH: 8,
  pole(l, x0, y0, y1, burnt = [-1, -1]) {
    for (let y = y0; y <= y1; y++) {
      const b = y >= burnt[0] && y <= burnt[1];
      l.set(x0, y, b ? sooty(BONE[3]) : BONE[3]); l.set(x0 + 1, y, b ? sooty(BONE[2]) : BONE[2]); l.set(x0 + 2, y, b ? sooty(BONE[1]) : BONE[1]);
    }
    // суставы через 11 px снизу вверх
    for (let y = y1 - 15; y >= y0 + 2; y -= 11) {
      const b = y + 1 >= burnt[0] && y + 1 <= burnt[1], q = (k: Col) => (b ? sooty(k) : k);
      stamp(l, x0 - 1, y, [".LMD.", "LLMDD", "DMMDb", ".bbb."], { L: q(BONE[3]), M: q(BONE[2]), D: q(BONE[1]), b: q(BONE[0]) });
    }
  },
  foot(l, x0, gy) { stamp(l, x0, gy - 3, ["LMD", "LMD", ".M.", ".D."], { L: BONE[3], M: BONE[2], D: BONE[1] }); },
  bar(l, x0, x1, y, cut, burnt) {
    for (let x = x0; x <= x1; x++) {
      const sc = burnt && (cut === "right" ? x > x1 - 6 : x < x0 + 6), q = (k: Col) => (sc ? sooty(k) : k);
      l.set(x, y, q(BONE[3])); l.set(x, y + 1, q(BONE[2])); l.set(x, y + 2, q(BONE[1]));
    }
    const knob = [".LL.", "LLMD", "LMMD", "LMDD", ".DD."], lg = { L: BONE[3], M: BONE[2], D: BONE[1] };
    if (cut !== "left") stamp(l, x0 - 3, y - 1, knob, lg);
    if (cut !== "right") stamp(l, x1, y - 1, knob, lg, true);
  },
  tie(l, x, w, y0, y1) {
    for (let k = 0; k < w; k++) for (let y = y0; y <= y1; y++) l.set(x + k, y, y === y0 || k === 0 ? UP[2] : k === w - 1 ? UP[0] : UP[1]);
  },
  finial(l, x0, y, soot) {
    const lg: Record<string, Col> = { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0] };
    if (soot) for (const k of ["L", "M", "D"]) lg[k] = sooty(lg[k], 0.5);
    stamp(l, x0 - 2, y - 7, [
      "..LLL..",
      ".LLLMM.",
      "LLLLMMD",
      "LKKLKKD",
      "LKKMKKD",
      ".MMKMD.",
      ".DMDMD.",
      "..DDD..",
    ], lg);
  },
  arrow: { s: [WOOD[3], WOOD[1]], f: [WH[3], AZ[2]] },                     // стрелы Сольгарда: светлое древко, бело-голубое оперение
  cloth: (d) => (d === 1 ? UP[2] : d === 2 ? UP[1] : d === 3 ? UK[1] : UK[2]),
};
const KIT: Record<Fac, Kit> = { solgard: SOL, umbrath: UMB };

/** Стрела, торчащая из ткани или древка: пробоина в (x, y), древко 2 px по диагонали (свет сверху), оперение у хвоста; слой стрел
 *  обводится контуром — стрела читается и на белом полотне, и на тёмном древке. dir: 1 — хвост вверх-вправо, −1 — вверх-влево. */
function arrowAt(l: PC, x: number, y: number, dir: 1 | -1, k: Kit, len = 5) {
  const rows = len === 5
    ? ["......ab", ".....sab", "....sd..", "...sd...", "..sd....", ".sd.....", "kd......"]
    : [".....ab", "....sab", "...sd..", "..sd...", ".sd....", "kd....."];
  const lg = { k: UK[0], s: k.arrow.s[0], d: k.arrow.s[1], a: k.arrow.f[0], b: k.arrow.f[1] };
  stamp(l, dir > 0 ? x : x - rows[0].length + 1, y - rows.length + 1, rows, lg, dir < 0);
}

// ---------------------------------------------------------------- сборка штандарта
interface Anim {
  id: string; title: string; frames: PC[]; w: number; h: number; anchor: [number, number]; fps: number; fac: Fac; hero?: string;
  /** Превью: строка земли, на которой стоит герой (по умолчанию — якорь). */
  stand?: number;
}
interface StdSpec {
  kit: Kit;
  FW: number; FH: number;
  /** Левый столбец древка, верхняя строка бруса, земля (последняя строка подтока). */
  poleX: number; bar: number; gy: number;
  /** Полотнище: текстура, положение (X0 — левый столбец, Y0 — верх), герб, ветер, петли (u, ширина). */
  tex: PC; X0: number; Y0: number; emb: Emb | null; wind: Wind; ties: [number, number][];
  /** Брус: продолжение за край полотнища и повреждения. */
  barOver: number; barCut?: "left" | "right"; barBurnt?: boolean;
  /** Кольцо на древке (строка) — у Сольгарда золотое. */
  band?: number;
  /** Обугленные строки древка [от, до]; закопчённое навершие. */
  burnt?: [number, number]; soot?: boolean;
  /** Пост-обработка полотнища (до контура): ожоги, тлеющий край. at(u, v) — экранный столбец пикселя текстуры. */
  post?: (L: PC, co: ClothOut, t: number) => void;
  /** Поверх всего: стрелы, дым. */
  front?: (f: PC, co: ClothOut, t: number) => void;
}
function buildStandard(s: StdSpec): PC[] {
  const k = s.kit, frames: PC[] = [];
  for (let t = 0; t < N; t++) {
    const f = new PC(s.FW, s.FH);
    layer(f, (l) => {
      k.pole(l, s.poleX, s.bar - 3, s.gy - 4, s.burnt);
      if (s.band) stamp(l, s.poleX - 1, s.band, ["gYGGgh", "hggghh"], { Y: G[4], G: G[3], g: G[2], h: G[1] });
      k.foot(l, s.poleX, s.gy);
    });
    const co = windCloth(s.tex, s.emb, t, s.wind, k.tone);
    s.post?.(co.L, co, t);
    co.L.outline(OUTLINE);
    f.blit(co.L, s.X0 - co.M, s.Y0);
    layer(f, (l) => {
      k.bar(l, s.X0 - s.barOver, s.X0 + s.tex.w - 1 + s.barOver, s.bar, s.barCut, s.barBurnt);
      for (const [u, w] of s.ties) k.tie(l, s.X0 + u, w, s.bar - 1, s.Y0);
    });
    layer(f, (l) => k.finial(l, s.poleX, s.bar - 1, s.soot));
    s.front?.(f, co, t);
    frames.push(f);
  }
  return frames;
}

// ---------------------------------------------------------------- штандарт своих земель
/** Сольгард: белое полотно 26×36 с голубой каймой и острым низом, эмблема s20 «Восход над Оплотом»; древко 4 px, наконечник копья. */
function homeSolgard(): Anim {
  const FW = 42, FH = 71, CW = 26, CH = 36, pointY = 29;
  const inside = (x: number, y: number) => y <= pointY || Math.abs(x + 0.5 - CW / 2) <= CW / 2 - 2 * (y - pointY);
  const tex = clothTex(CW, CH, inside, (_x, _y, d) => SOL.cloth(d));
  const em = factionEmblem("solgard", "s20");
  const frames = buildStandard({
    kit: SOL, FW, FH, poleX: 19, bar: 11, gy: 68, band: 54,
    tex, X0: 8, Y0: 14, emb: { pc: em, x: (CW - em.w) / 2, y: 3 }, wind: WIND_HOME, ties: [[1, 3], [11, 4], [22, 3]], barOver: 3,
  });
  return { id: "home-solgard", title: "СВОИ ЗЕМЛИ", frames, w: FW, h: FH, anchor: [0.5, 68 / FH], fps: FPS, fac: "solgard", hero: "warrior" };
}
/** Умбрат: тусклое чёрно-пурпурное полотно 27×36 с гробовой стопой, эмблема s20 «Корона над гробом»; костяное древко, череп. */
function homeUmbrath(): Anim {
  const FW = 41, FH = 71, CW = 27, CH = 36, footY = 25;
  const inset = (y: number) => (y <= footY ? 0 : Math.ceil((y - footY) / 2));
  const tex = clothTex(CW, CH, (x, y) => x >= inset(y) && x <= CW - 1 - inset(y), (_x, _y, d) => UMB.cloth(d));
  const em = factionEmblem("umbrath", "s20");
  const frames = buildStandard({
    kit: UMB, FW, FH, poleX: 19, bar: 11, gy: 68,
    tex, X0: 7, Y0: 14, emb: { pc: em, x: (CW - em.w) / 2, y: 3 }, wind: WIND_HOME, ties: [[1, 3], [12, 3], [23, 3]], barOver: 2,
  });
  return { id: "home-umbrath", title: "СВОИ ЗЕМЛИ", frames, w: FW, h: FH, anchor: [20.5 / FW, 68 / FH], fps: FPS, fac: "umbrath", hero: "deathknight" };
}

/** Ветер у стены: полотнище висит вплотную к камню — без сноса, лёгкое качание низа (±1 px), складки мягче и реже, чем на древке;
 *  смена сдвига строки держится 2 кадра (hold) — колыхание, а не трепет. */
const WIND_WALL: Wind = { lean: 0, sway: 1.2, lag: 6, lambda: N, slant: 0.12, f0: 0.12, f1: 0.75, lightT: 0.72, darkT: 0.42, deepT: 2, embT: 0.85, rip: N, ripT: 0.55, fieldD: 4, topShade: 1, hold: true };
// ---------------------------------------------------------------- висящие знамёна (стены, башни и ворота столиц, фортов, постов у мостов)
//  Редизайн (пользователь: прежнее настенное знамя на брусе повторяло штандарт на древке — рядом выглядело дублем). Та же семья (палитра
//  и герб общие), другая подача. В игре: А — вымпел с ласточкиным хвостом и бахромой на шнуре — на угловых башнях и башнях постов у мостов,
//  В — драпировка с фестонами и кистями — над аркой ворот (выбор пользователя). С — лента с медальоном на кольцах — только в превью.
//  Тень на стене запечена в кадр (полупрозрачная, свет сверху слева). Превью вариантов: npx tsx tools/gen/standards.ts --redesign
//  → tools/out/banners-redesign/.
type Variant = "A" | "B" | "C";
/** Тень на камне: силуэт кадра, сдвинутый вниз-вправо, полупрозрачный — под непрозрачными пикселями не видна. */
const WALL_SHADOW: Col = [14, 10, 20, 92];
function wallShadow(f: PC, dx = 1, dy = 2): PC {
  const out = new PC(f.w, f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.alpha(x - dx, y - dy) > 200) out.set(x, y, WALL_SHADOW);
  out.blit(f, 0, 0);
  return out;
}
/** Текстура с запасом прозрачных строк снизу: бахрома и кисти рисуются в слое полотнища (общий контур, общий сдвиг строк). */
function padTex(tex: PC, rows: number): PC {
  const out = new PC(tex.w, tex.h + rows);
  out.blit(tex, 0, 0);
  return out;
}
/** Последняя строка ткани в столбце u (−1 — пусто). */
const lastRow = (tex: PC, u: number) => { for (let v = tex.h - 1; v >= 0; v--) if (tex.alpha(u, v)) return v; return -1; };
/** Металл фракции: Сольгард — золото, Умбрат — серебро на чёрном железе. */
const metal = (fac: Fac) => (fac === "solgard" ? { H: G[4], L: G[3], M: G[2], D: G[1], K: G[0] } : { H: SIL[3], L: SIL[2], M: SIL[1], D: IRON[1], K: IRON[0] });
/** Бахрома по нижней кромке (only — какие строки низа): сплошная светлая плетёная строка, под ней нити — 2 из 3 столбцов (шаг 3 px — при сдвиге на 1 px
 *  не мигает), длина len с плетёнкой; на зуме 2 читается и на светлой, и на тёмной кладке (общий контур слоя обводит нити). */
function fringeAt(L: PC, co: ClothOut, tex: PC, fac: Fac, len = 3, only: (v: number) => boolean = () => true) {
  const m = metal(fac);
  for (let u = 0; u < tex.w; u++) {
    const v = lastRow(tex, u), X = v >= 0 ? co.at(u, v) : -1;
    if (X < 0 || !only(v)) continue;
    L.set(X, v + 1, m.H);
    if (u % 3 === 2) continue;
    for (let k = 2; k <= len; k++) L.set(X, v + k, k === 2 ? (u % 3 === 0 ? m.L : m.M) : u % 3 === 0 ? m.M : m.D);
  }
}
/** Кисть под столбцом u: шнур, узел-навершие, нити (5 строк). */
function tasselAt(L: PC, co: ClothOut, tex: PC, fac: Fac, u: number) {
  const v = lastRow(tex, u), X = v >= 0 ? co.at(u, v) : -1;
  if (X < 0) return;
  const m = metal(fac), thread = fac === "solgard" ? { f: G[2], F: G[3] } : { f: UP[2], F: UP[3] };
  stamp(L, X - 1, v + 1, [".c.", "kHk", "kLD", "FfF", "F.f"], { c: m.M, H: m.H, k: m.L, L: m.M, D: m.D, F: thread.F, f: thread.f });
}
/** Пруток с навершиями (2 строки, x0..x1): Сольгард — золотой с шарами-солнцами, Умбрат — чёрное железо с ромбами-наконечниками. */
function rodAt(l: PC, fac: Fac, x0: number, x1: number, y: number) {
  const m = metal(fac);
  for (let x = x0; x <= x1; x++) { l.set(x, y, fac === "solgard" ? m.L : IRON[3]); l.set(x, y + 1, fac === "solgard" ? m.D : IRON[1]); }
  const cap = fac === "solgard" ? [".HL.", "HLLM", "LMMD", ".DD."] : [".H.", "HLM", "LMD", ".D."];
  const w = cap[0].length;
  stamp(l, x0 - w, y - 1, cap, m);
  stamp(l, x1 + 1, y - 1, cap, m, true);
}
interface HangSpec {
  id: string; title: string; fac: Fac; tex: PC; emb: Emb | null; wind: Wind;
  /** Кадр, положение текстуры, якорь (точка крепления к стене). */
  FW: number; FH: number; X0: number; Y0: number; anchor: [number, number];
  /** В слое полотнища до контура: бахрома, кисти. */
  post?: (L: PC, co: ClothOut) => void;
  /** Крепёж поверх ткани (обводится): пруток, кольца, крюки. */
  front?: (l: PC) => void;
  /** Без контура, поверх всего: тонкий шнур. */
  cords?: (f: PC) => void;
}
function buildHang(s: HangSpec): Anim {
  const frames: PC[] = [];
  for (let t = 0; t < N; t++) {
    const f = new PC(s.FW, s.FH);
    const co = windCloth(s.tex, s.emb, t, s.wind, TONE[s.fac]);
    s.post?.(co.L, co);
    co.L.outline(OUTLINE);
    f.blit(co.L, s.X0 - co.M, s.Y0);
    if (s.front) layer(f, s.front);
    s.cords?.(f);
    frames.push(wallShadow(f));
  }
  return { id: s.id, title: s.title, frames, w: s.FW, h: s.FH, anchor: [s.anchor[0] / s.FW, s.anchor[1] / s.FH], fps: FPS, fac: s.fac };
}

/** А — вымпел: длинное узкое полотнище с ласточкиным хвостом и бахромой, цвета обращены относительно штандарта (поле — лазурь / пурпур,
 *  кайма — золотая / серебряная строчка), поперечная перевязь у хвоста; висит на прутке, пруток — на шнуре с крюка (якорь — крюк). */
function pennant(fac: Fac, gate: boolean): Anim {
  const sol = fac === "solgard", CW = gate ? 22 : 18, CH = gate ? 40 : 34, notch = gate ? 9 : 7, rodY = gate ? 6 : 5;
  const notchHalf = (y: number) => (y < CH - notch ? -1 : ((y - (CH - notch) + 1) * (CW / 2 - 4)) / notch);
  const inside = (x: number, y: number) => Math.abs(x + 0.5 - CW / 2) > notchHalf(y);
  const bandY = CH - notch - (gate ? 7 : 6);
  const col = (_x: number, y: number, d: number): Col => {
    if (sol) return d === 1 ? AZ[2] : d === 2 ? G[3] : y >= bandY && y < bandY + 3 ? (y === bandY + 1 ? G[3] : WH[2]) : AZ[1];
    return d === 1 ? UP[2] : d === 2 ? SIL[2] : y >= bandY && y < bandY + 3 ? (y === bandY + 1 ? SIL[2] : UK[1]) : UP[1];
  };
  const tex = padTex(clothTex(CW, CH, inside, (x, y, d) => col(x, y, d)), 5);
  const em = factionEmblem(fac, gate ? "s20" : "s16");
  const side = 7, X0 = side, FW = CW + 2 * side, FH = rodY + 1 + tex.h + 4, cx = X0 + CW / 2 - 0.5;
  return buildHang({
    id: `pennant-${fac}${gate ? "-gate" : ""}`, title: gate ? "А. ВЫМПЕЛ НАД ВОРОТАМИ" : "А. ВЫМПЕЛ НА СТЕНЕ И БАШНЕ", fac, tex, wind: { ...WIND_WALL, stiff: 3, fieldD: 3 },
    emb: { pc: em, x: Math.floor((CW - em.w) / 2), y: 3 }, FW, FH, X0, Y0: rodY + 1, anchor: [Math.round(cx), 0],
    post: (L, co) => fringeAt(L, co, tex, fac, 4, (v) => v === CH - 1),   // бахрома — только под концами хвоста (на косом вырезе рябила)
    front: (l) => { rodAt(l, fac, X0 - 2, X0 + CW + 1, rodY); stamp(l, Math.round(cx) - 1, 0, ["LM", "MD"], sol ? { L: STEEL[3], M: STEEL[2], D: STEEL[1] } : { L: IRON[3], M: IRON[2], D: IRON[1] }); },
    cords: (f) => {
      const m = metal(fac), hx = Math.round(cx);
      f.line(X0 - 1, rodY - 1, hx - 1, 1, m.M);
      f.line(X0 + CW, rodY - 1, hx, 1, m.M);
    },
  });
}

/** В — драпировка: широкое короткое полотнище во всю ширину проёма (над воротами — 62 px), верхний клапан-рукав на прутке, низ фестонами,
 *  кисти на стыках фестонов, по краям полосы; герб посередине. Силуэт широкий и низкий — противоположность высокому штандарту. */
function drape(fac: Fac, gate: boolean): Anim {
  const sol = fac === "solgard", CW = gate ? 62 : 34, CH0 = gate ? 27 : 21, depth = gate ? 6 : 5, k = 3, val = gate ? 5 : 4;
  const sw = CW / k;
  const bottom = (x: number) => CH0 + depth * Math.sin((Math.PI * ((x + 0.5) % sw)) / sw);
  const CH = CH0 + depth + 1;
  const stripe = (x: number) => { const e = Math.min(x, CW - 1 - x); return e === 4 || e === 5; };
  const col = (x: number, y: number, d: number): Col => {
    if (sol) return y < val - 1 ? AZ[2] : y === val - 1 ? G[3] : d === 1 ? AZ[2] : d === 2 ? G[2] : stripe(x) ? AZ[3] : WH[2];
    return y < val - 1 ? UP[1] : y === val - 1 ? SIL[2] : d === 1 ? UP[2] : d === 2 ? SIL[1] : stripe(x) ? UP[1] : UK[2];
  };
  const tex = padTex(clothTex(CW, CH, (x, y) => y < bottom(x), col), 6);
  // Сольгард: герб на белом шёлке сливался с полем — щит кладётся на лазурный медальон (как на штандарте Эмберхолла и в превью герба);
  //  у медальона поле 2 px с каждой стороны, рисунок герба тот же. Число фестонов нечётное — герб над серединой фестона, а не над стыком.
  const size = gate ? "s20" : "s16", em0 = factionEmblem(fac, size), em = sol ? azureMedallion(em0, SOLGARD_SHIELD_TOP[size]) : em0, emY = sol ? val - 1 : val + 1;
  const side = 8, X0 = side, rodY = 2, FW = CW + 2 * side, FH = rodY + 1 + tex.h + 4;
  const joints = Array.from({ length: k + 1 }, (_, i) => Math.max(0, Math.min(CW - 1, Math.round(i * sw))));
  const iron = sol ? { L: STEEL[3], M: STEEL[2], D: STEEL[1] } : { L: IRON[3], M: IRON[2], D: IRON[1] };
  return buildHang({
    id: `drape-${fac}${gate ? "-gate" : ""}`, title: gate ? "В. ДРАПИРОВКА НАД ВОРОТАМИ" : "В. ДРАПИРОВКА НА СТЕНЕ И БАШНЕ", fac, tex,
    wind: { ...WIND_WALL, sway: 1.0, stiff: 3, fieldD: 4, f0: 0.25, darkT: 0.5, deepT: 9 },
    emb: { pc: em, x: Math.floor((CW - em.w) / 2), y: emY }, FW, FH, X0, Y0: rodY + 1, anchor: [FW / 2, rodY],
    post: (L, co) => { for (const u of joints) tasselAt(L, co, tex, fac, u); },
    front: (l) => {
      for (const hx of [X0 + 2, X0 + CW - 4]) stamp(l, hx, rodY - 2, ["LM", "MD"], iron);
      rodAt(l, fac, X0 - 2, X0 + CW + 1, rodY);
    },
  });
}

/** С — лента с медальоном: узкая лента (8–10 px) с раздвоенным хвостом и кистями, вверху — крупный круглый медальон с гербом в металлической
 *  оправе (оправа объёмная: свет сверху слева); висит на трёх кольцах на коротком прутке. Медальон стоит, колышется только хвост ленты. */
function medallion(fac: Fac, gate: boolean): Anim {
  const sol = fac === "solgard", RW = gate ? 10 : 8, R = gate ? 14 : 12, CH = gate ? 46 : 38, notch = gate ? 6 : 5;
  const TW = 2 * R, cy = R + 4, ccx = TW / 2;
  const inRib = (x: number, y: number) => {
    const ax = Math.abs(x + 0.5 - ccx);
    if (ax > RW / 2 || y >= CH) return false;
    return !(y >= CH - notch && ax < ((y - (CH - notch) + 1) * (RW / 2 - 1.5)) / notch);
  };
  const r = (x: number, y: number) => Math.hypot(x + 0.5 - ccx, y + 0.5 - cy);
  const inDisk = (x: number, y: number) => r(x, y) <= R;
  const m = metal(fac);
  const col = (x: number, y: number, d: number): Col => {
    if (inDisk(x, y)) {
      const rr = r(x, y), lit = x + 0.5 - ccx + (y + 0.5 - cy) < 0;
      if (rr > R - 1.2) return lit ? m.L : m.D;
      if (rr > R - 2.4) return lit ? m.H : m.M;
      if (rr > R - 3.4) return lit ? m.D : m.L;
      return sol ? AZ[1] : UK[1];
    }
    const ax = Math.abs(x + 0.5 - ccx);
    if (sol) return d === 1 ? G[2] : ax < 1.5 ? WH[2] : AZ[2];
    return d === 1 ? SIL[1] : ax < 1.5 ? UP[2] : UK[2];
  };
  const tex = padTex(clothTex(TW, CH, (x, y) => inRib(x, y) || inDisk(x, y), col), 6);
  const em = factionEmblem(fac, gate ? "s20" : "s16");
  const side = 6, X0 = side, rodY = 1, Y0 = rodY + 4, FW = TW + 2 * side, FH = Y0 + tex.h + 4, rx = X0 + ccx;
  const tails = [Math.floor(ccx - RW / 2) + 1, Math.ceil(ccx + RW / 2) - 2];
  return buildHang({
    id: `medallion-${fac}${gate ? "-gate" : ""}`, title: gate ? "С. ЛЕНТА С МЕДАЛЬОНОМ НАД ВОРОТАМИ" : "С. ЛЕНТА С МЕДАЛЬОНОМ НА СТЕНЕ И БАШНЕ", fac, tex,
    wind: { ...WIND_WALL, sway: 1.4, f0: 0.55, f1: 0.98, fieldD: 3, rip: 0 },
    emb: { pc: em, x: Math.floor(ccx - em.w / 2), y: Math.round(cy - em.h / 2) }, FW, FH, X0, Y0, anchor: [Math.round(rx), rodY],
    post: (L, co) => { for (const u of tails) tasselAt(L, co, tex, fac, u); },
    front: (l) => {
      rodAt(l, fac, Math.round(rx - RW / 2) - 3, Math.round(rx + RW / 2) + 2, rodY);
      for (const ux of [Math.round(rx - RW / 2), Math.round(rx) - 1, Math.round(rx + RW / 2) - 2]) stamp(l, ux, rodY + 1, ["MLM", "L.D", "M.D", "DDD"], m);
    },
  });
}
/** Три варианта: настенное и надвратное для обеих фракций. */
function REDESIGN(): Record<Variant, { wall: Record<Fac, Anim>; gate: Record<Fac, Anim> }> {
  const mk = (f: (fac: Fac, gate: boolean) => Anim) => ({ wall: { solgard: f("solgard", false), umbrath: f("umbrath", false) }, gate: { solgard: f("solgard", true), umbrath: f("umbrath", true) } });
  return { A: mk(pennant), B: mk(drape), C: mk(medallion) };
}

// ---------------------------------------------------------------- повреждённые штандарты спорных земель (походный размер, эмблема s16)
/** Порванный, в стрелах. Полотно-основа (Сольгард — прямоугольник 22×28, Умбрат — гробовая стопа 23×29) режется: лохмотья низа,
 *  большой вырванный клок, дыра, разрыв от кромки, оторванная петля (угол провис). Кайма считается по целому контуру — рваные края
 *  открывают поле. Залп пришёл с одной стороны: две стрелы в полотне (ниже герба), одна в древке; стрелы врага. */
function torn(fac: Fac): Anim {
  const k = KIT[fac], sol = fac === "solgard";
  const CW = sol ? 22 : 23, CH = sol ? 28 : 29, FW = sol ? 38 : 39, FH = 64, gy = 62, poleX = sol ? 17 : 18;
  const X0 = 8, Y0 = 15, bar = 12;
  // у Умбрата рисунок зеркален: провис, клок и разрыв слева
  const mx = (x: number) => (sol ? x : CW - 1 - x);
  const sag = (x: number) => { const e = mx(x) - (CW - 5); return e < 0 ? 0 : Math.min(4, Math.ceil(e * 0.9)); };
  const inset = (y: number) => (sol || y <= 20 ? 0 : Math.ceil((y - 20) / 2));
  const whole = (x: number, y: number) => y >= sag(x) && x >= inset(y) && x <= CW - 1 - inset(y);
  // лохмотья низа (по столбцам, для Сольгарда слева направо): две длинные ленты с остатком нижней каймы, справа вырван большой клок
  const RAG = [24, 25, 27, 27, 26, 22, 21, 23, 26, 27, 25, 23, 22, 21, 20, 20, 21, 22, 21, 19, 18, 17, 17];
  const rag = (x: number) => RAG[mx(x)];
  const flip = (p: number[]) => [mx(p[0]), p[1]];
  const hole = [[9, 20], [8, 21], [9, 21], [10, 21], [9, 22], [10, 22]].map(flip);
  const slit = [[21, 8], [20, 9], [19, 10], [19, 11]].map(flip);
  const cut = new Set([...hole, ...slit].map(([x, y]) => y * CW + x));
  const tex0 = clothTex(CW, CH, whole, (_x, _y, d) => k.cloth(d));
  const tex = new PC(CW, CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (tex0.alpha(x, y) && y <= rag(x) && !cut.has(y * CW + x)) tex.set(x, y, tex0.get(x, y)!);
  despeckle(tex);
  const em = factionEmblem(fac, "s16");
  const emb = { pc: em, x: Math.floor((CW - em.w) / 2), y: 3 };
  const wind: Wind = { ...WIND_HOME, sway: 1.6, lean: 0.3, ripT: 0.3 };
  // стрелы: хвостом к стрелку (Сольгард обстреляли справа, Умбрат — слева)
  const dir: 1 | -1 = sol ? 1 : -1;
  const inCloth: [number, number][] = [[mx(3), 24], [mx(18), 16]];
  const frames = buildStandard({
    kit: k, FW, FH, poleX, bar, gy, band: sol ? 54 : undefined,
    tex, X0, Y0, emb, wind, ties: sol ? [[1, 3], [10, 3]] : [[CW - 4, 3], [10, 3]], barOver: sol ? 3 : 2,
    front: (f, co) => {
      const l = new PC(f.w, f.h);
      for (const [u, v] of inCloth) arrowAt(l, X0 + u + co.sx[v], Y0 + v, dir, k);         // по сдвигу строки: рябь кромок стрелу не прячет
      arrowAt(l, sol ? poleX + 3 : poleX, 51, dir, k, 4);
      arrowAt(l, sol ? X0 + CW + 1 : X0 - 2, bar + 2, dir, k, 4);                       // и одна — в брусе
      l.outline(OUTLINE);
      f.blit(l, 0, 0);
    },
  });
  return { id: `torn-${fac}`, title: "ПОРВАННЫЙ, В СТРЕЛАХ", frames, w: FW, h: FH, anchor: [(poleX + k.poleW / 2) / FW, gy / FH], fps: FPS, fac };
}

/** Клуб дыма — непрозрачный круг радиуса r в 3 тона пепла (свет сверху слева); контур (мягкий, пеплом) кладёт слой — клубы одной
 *  струи перекрываются и сливаются в столб. */
function smokePuff(l: PC, px: number, py: number, r: number) {
  for (let yy = Math.floor(py - r - 1); yy <= py + r + 1; yy++) for (let xx = Math.floor(px - r - 1); xx <= px + r + 1; xx++) {
    const dx = xx + 0.5 - px, dy = yy + 0.5 - py;
    if (dx * dx + dy * dy > r * r) continue;
    const s = (dx + dy) / Math.max(r, 1);
    l.set(xx, yy, s < -0.5 ? ASH[4] : s > 0.5 ? ASH[2] : ASH[3]);
  }
}
/** Радиус клуба по шагу жизни s (0…N−1): растёт от 0.8 до 1.7, к концу сжимается и исчезает (без полупрозрачности). */
const puffR = (s: number) => (s < 8 ? 0.8 + s * 0.13 : 1.7 - (s - 7) * 0.42);

/** Обгоревший: полотно сгорело снизу по неровной линии ниже герба, по бокам огонь лизнул выше (кайма съедена); у края — угольная
 *  кромка, по ней бежит огонёк, выше — пепел и копоть ступенями рампы угля и пепла (герб у ожога темнеет по своим рампам). У бруса
 *  сгорел торец, древко под полотнищем обуглено, навершие закопчено; от тлеющих боков поднимаются струйки дыма (непрозрачные клубы
 *  пепла) и сносятся ветром, над кромкой вылетают искры. Все цвета — палитра, без полупрозрачности. */
function burned(fac: Fac): Anim {
  const k = KIT[fac], sol = fac === "solgard";
  const CW = sol ? 22 : 23, CH = 24, FW = sol ? 38 : 39, FH = 64, gy = 62, poleX = sol ? 17 : 18;
  const X0 = 8, Y0 = 15, bar = 12;
  const inset = (y: number) => (sol || y <= 20 ? 0 : Math.ceil((y - 20) / 2));
  const whole = (x: number, y: number) => x >= inset(y) && x <= CW - 1 - inset(y);
  // линия огня: нижняя строка по столбцам; под гербом ≥ 19, по бокам языки вверх
  const EDGE = [12, 14, 16, 19, 20, 21, 20, 19, 20, 21, 22, 22, 21, 20, 21, 22, 21, 20, 19, 17, 15, 13, 12];
  const edge = (x: number) => EDGE[sol ? x : CW - 1 - x];
  const keep = (x: number, y: number) => whole(x, y) && y <= edge(x);
  const tex0 = clothTex(CW, CH, whole, (_x, _y, d) => k.cloth(d));
  const tex = new PC(CW, CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (keep(x, y)) tex.set(x, y, tex0.get(x, y)!);
  despeckle(tex);
  // расстояние до сгоревшего (по 4 соседям внутри полотна): 1 — тлеющий край, 2 — уголь, 3 — пепел, 4–5 — копоть
  const bd = new Int16Array(CW * CH);
  {
    const q: number[] = [];
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      if (!tex.alpha(x, y)) continue;
      const nb = [[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]].some(([a, b]) => (whole(a, b) && b < CH && !keep(a, b)) || (b >= CH && whole(a, CH - 1)));
      if (nb) { bd[y * CW + x] = 1; q.push(y * CW + x); }
    }
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % CW, y = (p - x) / CW;
      for (const [a, b] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (a < 0 || b < 0 || a >= CW || b >= CH || !tex.alpha(a, b) || bd[b * CW + a]) continue;
        bd[b * CW + a] = bd[p] + 1; q.push(b * CW + a);
      }
    }
  }
  const em = factionEmblem(fac, "s16");
  const emb = { pc: em, x: Math.floor((CW - em.w) / 2), y: 3 };
  const wind: Wind = { ...WIND_HOME, sway: 1.2, lean: 0.3, rip: 0 };
  // точки дыма: верхушки боковых языков огня; искры: столбец кромки и кадр вылета (по одной раз в 4 кадра)
  const emit: [number, number][] = [[0, edge(0)], [CW - 1, edge(CW - 1)]];
  const sparkAt: [number, number][] = [[sol ? 5 : CW - 6, 0], [sol ? 15 : CW - 16, 4], [sol ? 9 : CW - 10, 8]];
  const bottom = Y0 + Math.max(...EDGE);
  const frames = buildStandard({
    kit: k, FW, FH, poleX, bar, gy, band: sol ? 54 : undefined,
    tex, X0, Y0, emb, wind, ties: sol ? [[1, 3], [10, 3]] : [[CW - 4, 3], [10, 3]], barOver: sol ? 3 : 2,
    barCut: sol ? "right" : "left", barBurnt: true, burnt: [bottom - 2, bottom + 6], soot: true,
    // у края: тлеющая кромка (бегущий огонёк), уголь, пепел, копоть — ступенями рампы угля и пепла (у белого полотна ещё полутень ткани),
    //  без смешивания цветов: 3–4 тона, цвета палитры
    post: (L, co, t) => {
      const soot = sol ? [CHAR[1], CHAR[3], ASH[4], WH[1]] : [CHAR[1], CHAR[2], ASH[1]];
      for (let v = 0; v < CH; v++) for (let u = 0; u < CW; u++) {
        const b = bd[v * CW + u];
        if (!b || b > soot.length + 1) continue;
        const X = co.at(u, v);
        if (X < 0 || !L.alpha(X, v)) continue;
        if (b === 1) {
          // огонёк бежит вдоль края вправо (по ветру): период 8 px за цикл — меньше 1 px за кадр
          const ph = ((u / 8 - t / N) % 1 + 1) % 1;
          L.set(X, v, ph < 0.18 ? FIRE[4] : ph < 0.36 ? FIRE[3] : ph < 0.54 ? FIRE[2] : ph < 0.7 ? FIRE[1] : CHAR[0]);
        } else if (b > 2 && emb.pc.alpha(X - co.M - emb.x - co.edx, v - emb.y)) {
          L.set(X, v, k.tone(L.get(X, v)!, b === 3 ? -2 : -1));                 // герб у ожога темнеет по своим рампам, рисунок цел
        } else L.set(X, v, soot[b - 2]);
      }
    },
    // дым: две струйки от тлеющих боков — по 3 непрозрачных клуба в 3 тона пепла, растут и поднимаются ровно на 1 px за кадр, сносятся
    //  по ветру и тают сжатием; клуб помнит, где вылетел (кромка в кадре рождения), — с полотнищем не качается.
    //  Искры: 3 штуки по 1–2 px над кромкой огня — ожог сразу отличим от порванного
    front: (f, co, t) => {
      const plan = windPlan(tex, wind), at0 = (u: number, v: number, t0: number) => X0 + u + plan.sx[((t0 % N) + N) % N][v];
      layer(f, (l) => {
        for (const [ei, [u, v]] of emit.entries()) for (let i = 0; i < 3; i++) {
          const s = (t + (i * N) / 3 + ei * 2) % N, x0 = at0(u, v, t - s), r = puffR(s);
          if (r >= 0.6) smokePuff(l, x0 + 0.5 + Math.round(s * 0.5), Y0 + v - 2 - s, r);
        }
      }, ASH[1]);
      for (const [k2, [u, start]] of sparkAt.entries()) {
        const s = ((t - start) % N + N) % N;
        if (s > 4) continue;
        const v = edge(u), x = at0(u, v, t - s) + Math.round(s * 0.5) + (k2 % 2), y = Y0 + v - 2 - s;
        f.set(x, y, s < 2 ? FIRE[4] : s < 3 ? FIRE[3] : s < 4 ? FIRE[2] : FIRE[1]);
        if (s < 2) f.set(x, y + 1, FIRE[3]);
      }
    },
  });
  return { id: `burned-${fac}`, title: "ОБГОРЕВШИЙ", frames, w: FW, h: FH, anchor: [(poleX + k.poleW / 2) / FW, gy / FH], fps: FPS, fac };
}

// ---------------------------------------------------------------- сломанный в грязи, рядом тело павшего (спорные земли)
//  Плоское (грязь, лежащее знамя, тело) — слой земли, под героями; обломок древка с лоскутом стоит — отдельный слой, 12 кадров.
//  Земля нарисована как в игре: лежащее видно сверху без сжатия (как ковёр), стоящее — спереди.
const MUD = [c("#1d140e"), c("#2b1f16"), c("#3b2a1e"), c("#523c2b"), c("#6e553d")];    // мокрая грязь: P.dirt темнее и серее
const POOL = [c("#2c3139"), c("#4a525d"), c("#7f8994"), c("#bcc5cc")];                 // лужа: отражение пасмурного неба
const SPLIT = [c("#7a5634"), c("#b48a5c"), c("#dcc094")];                               // свежий излом дерева
/** Цилиндр от (x0, y0) до (x1, y1) полутолщины r: тон по нормали к оси, свет сверху слева (как shadedEllipse). */
function capsule(l: PC, x0: number, y0: number, x1: number, y1: number, r: number, ramp: Col[], spec = false) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1, L = [-0.55, -0.65, 0.55], ll = Math.hypot(L[0], L[1], L[2]);
  for (let y = Math.floor(Math.min(y0, y1) - r - 1); y <= Math.max(y0, y1) + r + 1; y++)
    for (let x = Math.floor(Math.min(x0, x1) - r - 1); x <= Math.max(x0, x1) + r + 1; x++) {
      const px = x + 0.5, py = y + 0.5, t = clamp01(((px - x0) * dx + (py - y0) * dy) / len2);
      const ox = (px - x0 - t * dx) / r, oy = (py - y0 - t * dy) / r, q = ox * ox + oy * oy;
      if (q > 1) continue;
      const lum = (ox * L[0] + oy * L[1] + Math.sqrt(1 - q) * L[2]) / ll;
      let i = Math.max(0, Math.min(ramp.length - 1, Math.floor(((lum + 0.6) / 1.5) * (ramp.length - (spec ? 0.4 : 1)))));
      if (!spec && i === ramp.length - 1 && ramp.length > 2) i = ramp.length - 2;
      l.set(x, y, ramp[i]);
    }
}
/** Плоская фигура по маске (координаты холста): цвет по расстоянию до края d. */
function flat(l: PC, inside: (x: number, y: number) => boolean, color: (x: number, y: number, d: number) => Col | null) {
  l.blit(clothTex(l.w, l.h, inside, color), 0, 0);
}

interface MudSpec { cx: number; cy: number; rx: number; ry: number; seed: number; pools: [number, number, number, number][]; prints: [number, number][] }
/** Грязь: неровное пятно; по краю губа размешанной грязи (свет сверху слева: дальняя губа светлая, под ней тень), тёмная мокрая
 *  середина с пятнами посуше, лужи с отражением неба (берег сверху бросает тень, блик снизу), следы сапог. Без контура — это декаль. */
function mudPatch(w: number, h: number, s: MudSpec): PC {
  const pc = new PC(w, h);
  const r = (x: number, y: number) => { const dx = (x + 0.5 - s.cx) / s.rx, dy = (y + 0.5 - s.cy) / s.ry; return [dx, dy, Math.hypot(dx, dy)]; };
  const inside = (x: number, y: number) => {
    const [dx, dy, q] = r(x, y), a = Math.atan2(dy, dx);
    return q <= 0.8 + 0.3 * pnoise((a / TAU) * 40, 0.5, 6, 40, s.seed);
  };
  flat(pc, inside, (x, y, d) => {
    const [dx, dy] = r(x, y), lit = dx * 0.55 + dy * 0.85 < 0;
    if (d === 1) return lit ? MUD[4] : MUD[2];
    if (d === 2) return lit ? MUD[0] : MUD[3];
    return pnoise(x, y * 1.7, 7, 4096, s.seed + 3) > 0.6 ? MUD[2] : MUD[1];
  });
  for (const [px, py, prx, pry] of s.pools) {
    const inP = (x: number, y: number) => ((x + 0.5 - px) / prx) ** 2 + ((y + 0.5 - py) / pry) ** 2 <= 1;
    for (let y = Math.floor(py - pry); y <= py + pry; y++) for (let x = Math.floor(px - prx); x <= px + prx; x++) {
      if (!inP(x, y) || !pc.alpha(x, y)) continue;
      const top = !inP(x, y - 1), bot = !inP(x, y + 1);
      const streak = y === Math.floor(py + pry * 0.35) && x >= px - prx * 0.55 && x < px + prx * 0.25;
      pc.set(x, y, top ? POOL[0] : streak ? (x < px - prx * 0.2 ? POOL[3] : POOL[2]) : POOL[1]);
      if (bot && pc.alpha(x, y + 1)) pc.set(x, y + 1, MUD[3]);
    }
  }
  for (const [px, py] of s.prints) stamp(pc, px, py, ["aaa.aa", "aaa.aa", ".bbb.bb"], { a: MUD[0], b: MUD[3] });
  return despeckle(pc);
}

/** Обломок древка 4 px (Сольгард, дерево) или 3 px (Умбрат, кость) с изломом сверху; низ уходит в грязь. Наклон — 1 px на 6 строк вправо.
 *  Возвращает точку справа под изломом, где к щепе привязан лоскут. */
function stumpDraw(l: PC, fac: Fac, x0: number, gy: number, h: number): [number, number] {
  const sol = fac === "solgard", sh = (i: number) => Math.floor(i / 6);
  for (let i = 0; i < h; i++) {
    const y = gy - i, x = x0 + sh(i);
    if (sol) { l.set(x, y, WOOD[3]); l.set(x + 1, y, WOOD[2]); l.set(x + 2, y, WOOD[2]); l.set(x + 3, y, WOOD[1]); }
    else { l.set(x, y, BONE[3]); l.set(x + 1, y, BONE[2]); l.set(x + 2, y, BONE[1]); }
  }
  const tx = x0 + sh(h), ty = gy - h;
  if (sol) {
    stamp(l, x0 + sh(4) - 1, gy - 5, ["gYGGgh", "hggghh"], { Y: G[4], G: G[3], g: G[2], h: G[1] });   // золотое кольцо у земли
    stamp(l, tx, ty - 3, [".a..", ".ab.", "aabb", "bbcc"], { a: SPLIT[2], b: SPLIT[1], c: SPLIT[0] });  // щепа: левая выше
    return [tx + 4, ty + 1];
  }
  stamp(l, x0 + sh(5) - 1, gy - 6, [".LMD.", "LLMDD", "DMMDb", ".bbb."], { L: BONE[3], M: BONE[2], D: BONE[1], b: BONE[0] });   // сустав
  stamp(l, tx, ty - 3, ["L..", "LM.", "LkM", "MkD"], { L: BONE[3], M: BONE[2], D: BONE[1], k: BONE[0] });   // излом кости: острый край, тёмный канал
  return [tx + 3, ty + 1];
}
/** Лоскут полотнища, привязанный к обломку справа: 3 px шириной, len строк; ветер вправо, как у штандартов (кадр t: строки сдвигаются
 *  не больше чем на 1 px за кадр, верх неподвижен), низ рваный. */
function scrap(l: PC, fac: Fac, ax: number, ay: number, len: number, t: number) {
  const sol = fac === "solgard", ph = (TAU * t) / N;
  const cols: Col[] = sol ? [AZ[2], WH[2], WH[1]] : [UP[2], UP[1], UK[2]];
  const end = [len, len - 2, len - 1];                                    // рваный низ по столбцам
  for (let v = 0; v < len; v++) {
    const k = v / (len - 1), dx = Math.round(0.9 * k + 1.5 * Math.pow(k, 1.2) * Math.sin(ph - 2.2 * k));
    for (let i = 0; i < 3; i++) if (v < end[i]) l.set(ax + i + dx, ay + v, v === 0 ? cols[0] : cols[i]);
  }
}

/** Транспонирование (x ↔ y): стоящее знамя ложится на землю верхом влево; свет сверху слева остаётся сверху слева. */
function transpose(src: PC): PC {
  const o = new PC(src.h, src.w);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const q = src.get(x, y)!; if (q[3]) o.set(y, x, q); }
  return o;
}

/** Павший латник Сольгарда, 35×18, без внешнего контура: лежит на спине головой влево; закинутая за голову левая рука в латной
 *  перчатке держит обломок древка (кулак — столбцы 0–2, строки 8–10, середина — строка 9); шлем-ведро со смотровой щелью и золотым
 *  крестом, белый табард с голубой каймой и золотым солнцем, пояс с пряжкой, раскинутые латные ноги носками вверх, синий плащ под телом. */
const KNIGHT = [
  "...................................",
  ".BBBBBBBBABBB......................",
  ".BCDDDDDDDDDDBBC...................",
  ".BD.........BABCD..bbbbbb.......B..",
  ".BD..BBBBBB.BBCCDbbbbbbbb....BBBCC.",
  ".BD.BAAKCCCD.DDDbbbbbbbbbbBBACCCCD.",
  ".BD.BAAKCCCDECbbbbbbbbLlnnCCCDDDD..",
  ".BD.BCCKCCDDECWWWWGYWWLlwbDDD......",
  "BBC.BCCKCCDDECwwwGYYGwLGwb.........",
  "BCD.YGGGGGghDCwwwgGGgwlgvb.........",
  "CDD.BCCKCCDDEDwwwwggwwllvb.........",
  "....CCCKCDDEEDvvvvvvvvllvbCCC......",
  "....CCDKDDDE.CCDnnnnnnllnnCBCCCCCC.",
  ".....DDDDDD.CBCDEnnnnnnnnnDDDDDDDD.",
  "............DCDDECCCCCCBCm...EEEE..",
  ".............EEE.DDDDDDCD..........",
  ".......................DE..........",
  "...................................",
]
const KNIGHT_LG: Record<string, Col> = {
  A: STEEL[4], B: STEEL[3], C: STEEL[2], D: STEEL[1], E: STEEL[0], K: OUTLINE,
  Y: G[4], G: G[3], g: G[2], h: G[1], W: WH[3], w: WH[2], v: WH[1], b: AZ[2], n: AZ[1], m: AZ[0], L: c("#94613a"), l: c("#6a4228"),
};

/** Рассыпавшийся скелет Умбрата в чёрной броне, 34×18 (каждая часть — свой слой с контуром, чтобы кость на кости читалась): кисть-кость
 *  держит обломок древка (кулак — x 0–2, середина — строка 9), кости руки к рёбрам; хребет с четырьмя парами рёбер, таз, бедро и нога
 *  в чёрной поноже; кираса чёрного железа с пурпурной окантовкой и сиреневой короной сползла с рёбер вверх; череп откатился, шлем
 *  с зубцами короны лежит внизу; под всем — рваный пурпурный плащ. (bx, by) — левый верх. */
function skeletonUmbrath(dst: PC, bx: number, by: number) {
  const I = IRON, B = BONE;
  const lgB = { L: B[3], M: B[2], D: B[1], d: B[0], K: UK[0] };
  const lgI = { a: I[3], b: I[2], c: I[1], e: I[0], f: UK[0], q: UP[2], p: UP[1], o: UP[0], r: UP[3], s: UP[4] };   // чёрное железо: тёмная половина рампы
  layer(dst, (l) => flat(l, (x, y) => {                                                   // рваный плащ
    const u = x - bx, v = y - by;
    if (u < 9 || u > 31 || v < 4 || v > 16) return false;
    const rag = [0, 2, 1, 3, 0, 1, 2, 0][Math.floor((u - 9) / 3) % 8];
    return v <= 16 - (u > 15 ? rag : 0) && v >= 4 + (u > 22 ? [2, 0, 1][u % 3] : 0);
  }, (_x, y, d) => (y - by <= 5 ? UP[2] : d === 1 && y - by >= 14 ? UP[0] : UP[1])));
  layer(dst, (l) => {
    stamp(l, bx + 25, by + 11, ["abbbbbc.", "bccccce.", "ceeeeeeff", ".fff.fff."], lgI);   // нога в поноже
    stamp(l, bx + 25, by + 4, ["....LLM", ".LLMMD.", "LMDD...", "MD....."], lgB);          // бедро
  });
  layer(dst, (l) => {
    // хребет и рёбра: позвонки через пиксель, рёбра дугой к ногам
    for (let u = 11; u <= 21; u++) { l.set(bx + u, by + 9, u % 2 ? B[3] : B[2]); l.set(bx + u, by + 10, u % 2 ? B[2] : B[1]); }
    for (const u of [12, 14, 16, 18]) {
      for (const [du, dv] of [[0, 8], [0, 7], [1, 6], [1, 5], [2, 4]]) l.set(bx + u + du, by + dv, dv < 6 ? B[3] : B[2]);
      for (const [du, dv] of [[0, 11], [0, 12], [1, 13], [1, 14], [2, 15]]) l.set(bx + u + du, by + dv, dv > 13 ? B[1] : B[2]);
    }
    stamp(l, bx + 21, by + 7, [".LM.", "LLMD", "MddD", "LMMD", ".DD."], lgB);             // таз
  });
  layer(dst, (l) => stamp(l, bx + 15, by + 0, [
    "..qqqqqqq..",
    ".qaabbbccp.",
    "qabcsrsrscp",
    "qbccrrrrrep",
    "qcccccccceep",
    ".pceeeeeefp",
    "..ppppppp..",
  ], lgI));                                                                                // кираса, сползшая с рёбер
  layer(dst, (l) => {
    stamp(l, bx + 3, by + 9, ["LLLLLLLLM", "DDDDDDDDd"], lgB);                            // кости руки
    stamp(l, bx, by + 7, ["L.M", "LdM", "MdD", "L.D", "M.D"], lgB);                        // пальцы вокруг древка
  });
  layer(dst, (l) => stamp(l, bx + 3, by + 2, [".LLL.", "LLLMD", "LKMKD", "MMKMD", ".DDD."], lgB));   // череп
  layer(dst, (l) => stamp(l, bx + 2, by + 12, [".s.s.s.", "rrrrrrr", "abbbcce", "bcccccf", ".eeeff."], lgI));   // шлем короны
}

/** Сломанное знамя в грязи с телом павшего. Слои: ground — грязь, лежащее знамя (стоящее, транспонированное: верхом влево, свет
 *  остаётся сверху слева; складки, грязь на крае, след сапога) и тело; stump — обломок древка, воткнутый в грязь за телом,
 *  на щепе бьётся лоскут (12 кадров). */
function fallen(fac: Fac): Anim & { ground: PC; stump: PC[] } {
  const k = KIT[fac], sol = fac === "solgard", FW = 90, FH = 56;
  // стоящее знамя в своих координатах (без ветра): навершие, перекладина, полотнище, древко до излома
  const CW = sol ? 22 : 23, CH = sol ? 28 : 29, SW = CW + 12, X0s = 6, bar = 11, Y0s = bar + 3, poleXs = X0s + (sol ? 9 : 10), tailS = Y0s + CH + 3;
  const SH = tailS + 5;
  const inset = (y: number) => (sol ? 0 : y <= 20 ? 0 : Math.ceil((y - 20) / 2));
  const pointY = 22;
  const whole = (x: number, y: number) => (sol ? y <= pointY || Math.abs(x + 0.5 - CW / 2) <= CW / 2 - 2 * (y - pointY) : x >= inset(y) && x <= CW - 1 - inset(y));
  const tex = clothTex(CW, CH, whole, (_x, _y, d) => k.cloth(d));
  const em = factionEmblem(fac, "s16");
  tex.blit(em, Math.floor((CW - em.w) / 2), 3);
  const poleS = new PC(SW, SH), hwS = new PC(SW, SH), finS = new PC(SW, SH), clothS = new PC(SW, SH);
  k.pole(poleS, poleXs, bar - 3, tailS);
  stamp(poleS, poleXs, tailS + 1, sol ? ["ab.a", ".b..", ".a.."] : ["a.b", "ab.", ".a."], sol ? { a: SPLIT[2], b: SPLIT[1] } : { a: BONE[3], b: BONE[1] });
  clothS.blit(tex, X0s, Y0s);
  k.bar(hwS, X0s - (sol ? 3 : 2), X0s + CW - 1 + (sol ? 3 : 2), bar, sol ? "right" : "left");
  for (const [u, w] of [[1, 3], [10, 3], [CW - 4, 3]] as [number, number][]) k.tie(hwS, X0s + u, w, bar - 1, Y0s);
  k.finial(finS, poleXs, bar - 1);
  // на земле: транспонировано со смещением (ox, oy); ось древка — строка yc
  const ox = 2, oy = 14, yc = oy + poleXs + k.poleW / 2 - 0.5;
  const cloth = transpose(clothS);
  // складки на лежащем полотнище (экранные координаты): тёмная линия, над ней светлая полоса
  const LX = Y0s, LY = X0s;                                                             // левый верх полотнища в транспонированном слое
  const creases: [number, number, number, number][] = sol
    ? [[LX + 17, LY, LX + 21, LY + CW - 1], [LX + 2, LY + 15, LX + 9, LY + CW - 1], [LX + 23, LY + 2, LX + 26, LY + 9]]
    : [[LX + 18, LY, LX + 22, LY + CW - 1], [LX + 2, LY + 16, LX + 8, LY + CW - 1], [LX + 24, LY + 3, LX + 27, LY + 9]];
  const sm = new Int8Array(cloth.w * cloth.h);
  for (const [ax, ay, bx2, by2] of creases) {
    const dx = bx2 - ax, dy = by2 - ay, len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }                                              // нормаль — к свету (вверх-влево)
    for (let y = 0; y < cloth.h; y++) for (let x = 0; x < cloth.w; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, t = (px * dx + py * dy) / (len * len);
      if (t < -0.05 || t > 1.05) continue;
      const s = px * nx + py * ny;
      if (s > -0.5 && s <= 0.5) sm[y * cloth.w + x] = -1;
      else if (s > 0.5 && s <= 1.5 && !sm[y * cloth.w + x]) sm[y * cloth.w + x] = 1;
    }
  }
  for (let y = 0; y < cloth.h; y++) for (let x = 0; x < cloth.w; x++) if (cloth.alpha(x, y) && sm[y * cloth.w + x]) cloth.set(x, y, k.tone(cloth.get(x, y)!, sm[y * cloth.w + x]));
  // грязь: конец полотнища и нижний край ушли в лужу
  for (let y = 0; y < cloth.h; y++) for (let x = 0; x < cloth.w; x++) {
    if (!cloth.alpha(x, y)) continue;
    const u = x - LX, v = y - LY;
    const sink = u > CH - 7 + Math.round(1.5 * Math.sin(v * 0.8)) || (v > CW - 3 + Math.round(1.2 * Math.sin(u * 0.7 + 1)) && u > 8);
    if (sink) cloth.set(x, y, MUD[1]);
  }
  stamp(cloth, LX + 18, LY + (sol ? 13 : 14), ["aa.aaa", "aa.aaa", "...aa."], { a: sol ? c("#8a7a6a") : UK[0] });   // след сапога
  despeckle(cloth);
  const ground = new PC(FW, FH);
  ground.blit(mudPatch(FW, FH, {
    cx: 44, cy: yc + 2, rx: 43, ry: 18, seed: sol ? 11 : 23,
    pools: sol ? [[20, yc + 16, 6, 1.6], [74, yc + 13, 5, 1.5], [70, yc - 11, 4, 1.3]] : [[24, yc + 16, 6, 1.6], [76, yc + 12, 5, 1.5], [66, yc - 12, 4, 1.3]],
    prints: sol ? [[46, yc - 13], [36, yc + 15], [58, yc + 14]] : [[44, yc - 14], [38, yc + 15], [60, yc + 15]],
  }), 0, 0);
  const put = (src: PC) => { const l = new PC(FW, FH); l.blit(src, ox, oy); return l; };
  for (const part of [put(transpose(poleS)), put(cloth), put(transpose(hwS)), put(transpose(finS))]) { part.outline(OUTLINE); ground.blit(part, 0, 0); }
  // тело павшего: кулак на обломке древка
  const tailX = ox + tailS;                                                              // последний столбец древка
  if (sol) layer(ground, (l) => stamp(l, tailX - 3, Math.round(yc - 9), KNIGHT, KNIGHT_LG));
  else skeletonUmbrath(ground, tailX - 3, Math.round(yc - 9));
  // обломок древка с лоскутом — за телом
  const sx = tailX + 6, gy = Math.round(yc - 9);
  const stump = Array.from({ length: N }, (_, t) => {
    const s = new PC(FW, FH);
    layer(s, (l) => { const [ax, ay] = stumpDraw(l, fac, sx, gy, 14); scrap(l, fac, ax, ay, 8, t); });
    return s;
  });
  const frames = stump.map((s) => { const f = ground.clone(); f.blit(s, 0, 0); return f; });
  return { id: `fallen-${fac}`, title: "СЛОМАННЫЙ В ГРЯЗИ, С ПАВШИМ", frames, w: FW, h: FH, anchor: [(sx + 2) / FW, gy / FH], fps: FPS, fac, ground, stump, stand: Math.round(yc + 14) };
}

// ---------------------------------------------------------------- королевские знамёна захвата (война фракций): полотнище с перекладиной,
//  едет по мачте основания; якорь — середина бруса (там муфта на мачте). Несут полный утверждённый герб без ленты (строки 0–59 из 64×72).
const SILK = [...WH, c("#ffffff")];                                                       // белый шёлк: блик до чисто-белого
const VELVET = [UK[0], UK[1], UK[2], UK[3], UP[1]];                                       // чёрный бархат: отлив в пурпур на гребнях
const OLDG = [c("#422915"), c("#73471b"), c("#995f1c")];                                  // потускневшее золото истлевшей парчи (золото к черни)
const TONE_ROYAL: Record<Fac, ToneFn> = {
  solgard: toneFn([SILK, AZ, [G[0], G[1], G[2], G[3], G[4]], [G[3], GLOW], IV, STEEL], [SOUT, OUTLINE]),
  umbrath: toneFn([VELVET, UP, BONE, SIL, IRON, OLDG, [G[0], G[1], G[2]]], [UOUT, OUTLINE, ...UG]),
};
/** Полный герб без ленты (строки 0–59), обрезанный по рисунку. */
function armsCrop(id: string, x0: number, x1: number): PC {
  const full = ARMS.find((a) => a.id === id)!.full();
  return crop(full, x0, 0, x1 - x0 + 1, 60);
}
/** Сапфир-кабошон 2×2 или 3×3 (свет сверху слева). */
function gem(l: PC, x: number, y: number, big = false) {
  if (big) stamp(l, x, y, ["hAa", "Aad", "add"], { h: c("#d8f0ff"), A: AZ[3], a: AZ[2], d: AZ[1] });
  else stamp(l, x, y, ["Aa", "ad"], { A: AZ[3], a: AZ[2], d: AZ[1] });
}
/** Шар-навершие торца: сапфир 5×5 в золотой оправе. */
function gemKnob(l: PC, x: number, y: number) {
  stamp(l, x, y, [".gGg.", "gAAag", "GAhad", "gaadg", ".ggh."], { h: c("#d8f0ff"), A: AZ[3], a: AZ[2], d: AZ[1], G: G[3], g: G[2] });
}

/** «Королевский штандарт Рассвета»: белый шёлк 52×76, кайма 6 px густым золотым шитьём с сапфирами (инкрустация), по полю — лучи
 *  рассвета золотой нитью от солнца герба, герб «Восход над Оплотом» целиком; золотая бахрома и кисти, позолоченный брус с сапфировыми
 *  шарами на торцах, золотые кольца; навершие — солнце с сапфиром. */
function royalSolgard(): Anim {
  const FW = 76, FH = 120, CW = 52, CH = 76, X0 = 12, BAR = 25, Y0 = BAR + 4, CX = 38;
  const arms = armsCrop("solgard-1", 14, 49);                                            // 36×60
  const AX = (CW - arms.w) / 2, AY = 8;                                                  // герб на полотнище
  const sun = [AX + 32 - 14 - 0.0, AY + 18];                                             // центр солнца герба в координатах полотнища
  const gems = new Set<number>();
  const gemAt: [number, number, boolean][] = [];
  for (const gx of [9, 17, 25, 33, 41]) { gemAt.push([gx, 2, false], [gx, CH - 4, false]); }
  for (const gy of [12, 22, 32, 42, 52, 62]) { gemAt.push([2, gy, false], [CW - 4, gy, false]); }
  for (const [gx, gy] of [[1, 1], [CW - 4, 1], [1, CH - 4], [CW - 4, CH - 4]]) gemAt.push([gx, gy, true]);
  for (const [gx, gy, big] of gemAt) for (let j = 0; j < (big ? 3 : 2); j++) for (let i = 0; i < (big ? 3 : 2); i++) gems.add((gy + j) * CW + gx + i);
  const tex = clothTex(CW, CH, () => true, (x, y, d) => {
    if (gems.has(y * CW + x)) return null;                                               // место под сапфир — кладётся отдельно
    // кайма — выпуклый валик шитья: у верхней и левой сторон наружный скат на свету, внутренний в тени; у нижней и правой — наоборот
    const lit = Math.min(x, y) <= Math.min(CW - 1 - x, CH - 1 - y);
    if (d === 1) return lit ? G[2] : G[1];
    if (d === 2) return lit ? G[4] : G[2];
    if (d === 3 || d === 4) return G[3];
    if (d === 5) return lit ? G[1] : G[4];
    if (d === 6) return lit ? AZ[1] : AZ[2];
    // лучи рассвета золотой нитью: 16 лучей от солнца герба
    const dx = x + 0.5 - sun[0], dy = y + 0.5 - sun[1], r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx), k = Math.round((a / TAU) * 16), da = a - (k / 16) * TAU;
    if (r > 14 && Math.abs(da) * r < 0.55) return k % 2 ? G[2] : G[3];
    return SILK[3];
  });
  for (const [gx, gy, big] of gemAt) gem(tex, gx, gy, big);
  const emb: Emb = { pc: arms, x: AX, y: AY };
  // тяжёлый шёлк: складки отвесные (на косой лесенке мелкие полосы мигали), глубокая тень не уже 2 px; герб на середине полотнища
  //  не сдвигается — снос и качание там < 0.5 px
  const wind: Wind = { ...WIND_HOME, lean: 0.2, sway: 1.2, lag: 7, slant: 0, f0: 0.02, f1: 0.3, lightT: 0.6, darkT: 0.25, deepT: 0.7, embT: 0.8, rip: N, ripT: 0.45, fieldD: 7, stiff: 6 };
  const frames: PC[] = [], plan = windPlan(tex, wind);
  for (let t = 0; t < N; t++) {
    const f = new PC(FW, FH);
    const co = windCloth(tex, emb, t, wind, TONE_ROYAL.solgard);
    const L = co.L, bottomRow = CH - 1;
    L.outline(OUTLINE);
    f.blit(L, X0 - co.M, Y0);
    // бахрома под контуром низа: нити по 2 px (свет слева, тень справа, кончик темнее) через просвет 2 px — шаг узора 4: при сдвиге
    //  низа на 1 px нить переходит на соседний столбец, а не мигает (гребёнка с шагом 2 менялась местами с просветами и рябила);
    //  длинная (5) и короткая (4) чередуются; нижняя часть отстаёт от низа на кадр (шаг ≤ 1 px за кадр). Без контура — между нитями земля.
    const sxB = (k: number) => plan.sx[((k % N) + N) % N][bottomRow], lag1 = sxB(t - 1) - sxB(t);
    const bx = X0 - co.M + co.at(0, bottomRow);
    for (let u = 1; u <= CW - 2; u++) {
      if ((u - 1) % 4 >= 2) continue;
      const left = (u - 1) % 4 === 0, len = 4 + (((u - 1) >> 2) % 2);
      for (let j = 1; j <= len; j++) f.set(bx + u + (j >= 3 ? lag1 : 0), Y0 + bottomRow + 1 + j, j === len ? G[1] : left ? G[3] : G[2]);
    }
    // кисти на нижних углах: шнур, узел, юбка нитей — каждая строка повторяет сдвиг угла с запаздыванием (ниже — позже)
    layer(f, (l) => {
      const TASSEL = ["..g..", "..g..", ".gYg.", ".GgG.", ".hgh.", ".GgG.", "GgGgh", "GgGgh", "gGgGh", "hh.hh"];   // низ юбки без пунктира через 1 px
      for (const side of [0, 1]) {
        const u = side ? CW - 1 : 0, Xc = X0 - co.M + co.at(u, bottomRow) - sxB(t);
        const by = Y0 + bottomRow + 1;
        TASSEL.forEach((r, j) => stamp(l, Xc - 2 + sxB(t - Math.round(j / 3) - side), by + j, [r], { Y: G[4], G: G[3], g: G[2], h: G[1] }));
      }
    }, SOUT);
    // брус: позолоченный, сапфировые шары на торцах; золотые кольца держат полотнище
    layer(f, (l) => {
      for (let x = X0 - 4; x <= X0 + CW + 3; x++) { l.set(x, BAR, G[4]); l.set(x, BAR + 1, G[3]); l.set(x, BAR + 2, G[2]); l.set(x, BAR + 3, G[1]); }
      gemKnob(l, X0 - 9, BAR - 1); gemKnob(l, X0 + CW + 4, BAR - 1);
      for (const u of [2, 11, 20, 29, 38, 47]) for (let y = BAR - 1; y <= BAR + 5; y++) { l.set(X0 + u, y, G[3]); l.set(X0 + u + 1, y, y === BAR - 1 ? G[4] : G[2]); l.set(X0 + u + 2, y, G[1]); }
      // муфта на мачте: широкое золотое кольцо в середине бруса
      for (let y = BAR - 2; y <= BAR + 4; y++) for (let x = CX - 3; x <= CX + 2; x++) l.set(x, y, x === CX - 3 ? G[2] : x === CX - 2 ? G[4] : x >= CX + 1 ? G[1] : G[3]);
    }, SOUT);
    // навершие: восходящее солнце, как на гербе, — купол над золотой чертой горизонта, семь лучей (длинный и короткий чередуются),
    //  в куполе — сапфир; стержень с муфтой
    layer(f, (l) => {
      for (let y = BAR - 7; y <= BAR - 2; y++) { l.set(CX - 2, y, G[3]); l.set(CX - 1, y, G[4]); l.set(CX, y, G[2]); l.set(CX + 1, y, G[1]); }
      const hy = BAR - 9, R = 7.2;                                                // черта горизонта (2 строки) и купол над ней
      for (let x = CX - 9; x <= CX + 8; x++) { l.set(x, hy, x < CX ? G[4] : G[3]); l.set(x, hy + 1, x < CX ? G[2] : G[1]); }
      const rays: [number, number, number][] = [[22.5, 3.6, 1.0], [45, 6.4, 1.3], [67.5, 3.6, 1.0], [90, 7.4, 1.5]];
      for (let y = hy - 16; y < hy; y++) for (let x = CX - 16; x <= CX + 15; x++) {
        const dx = x + 0.5 - CX, dy = hy - (y + 0.5), r = Math.hypot(dx, dy);
        if (r <= R) { l.set(x, y, dx + (R - dy) * 0.4 < -2.5 ? G[4] : dx < 2.5 ? G[3] : G[2]); continue; }
        for (const [a, len, hw] of rays) {
          const ua = (a * Math.PI) / 180, along = Math.abs(dx) * Math.cos(ua) + dy * Math.sin(ua), perp = Math.abs(-Math.abs(dx) * Math.sin(ua) + dy * Math.cos(ua));
          if (along > R + 0.8 && along < R + len && perp <= hw * (1 - (along - R) / (len + 0.6))) { l.set(x, y, a === 90 || a === 45 ? G[3] : G[2]); break; }
        }
      }
      gem(l, CX - 2, hy - 5, true);
    }, SOUT);
    frames.push(f);
  }
  return { id: "royal-solgard", title: "КОРОЛЕВСКИЙ ШТАНДАРТ РАССВЕТА", frames, w: FW, h: FH, anchor: [CX / FW, (BAR + 1) / FH], fps: FPS, fac: "solgard", hero: "warrior" };
}

/** Цепь вертикально (3 px): звено лицом и звено ребром по очереди; x — средний столбец. */
function chainV(l: PC, x: number, y0: number, y1: number, col: [Col, Col, Col], swing: (y: number) => number = () => 0) {
  for (let y = y0; y <= y1; y++) {
    const k = (y - y0) % 4, sx = x + swing(y);
    if (k === 0) l.set(sx, y, col[0]);
    else if (k === 1 || k === 2) { l.set(sx - 1, y, k === 1 ? col[0] : col[1]); l.set(sx + 1, y, col[2]); }
    else l.set(sx, y, col[1]);
  }
}
/** Череп-лампада 7×7: кость, глазницы светятся зелёным (g — яркость 0…2). */
function skullLamp(l: PC, x: number, y: number, g: number) {
  const e = UG[Math.max(0, Math.min(2, g))];
  stamp(l, x, y, ["..LLL..", ".LLLMM.", "LLLLMMD", "LEELEED", "LEEMEED", ".MMKMD.", "..DDD.."], { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0], E: e });
}

/** «Саван Короны»: чёрный бархат 57×86 из истлевшей парчи — сквозь него проступает прежнее золото (ромбическая сетка, местами
 *  истлевшая); кайма — серебряная нить и пунктир старого золота; низ — рваные языки, по краю тлеет призрачный зелёный огонь.
 *  Герб «Корона над гробом» целиком. Брус чёрного железа с шипами, на торцах цепи с черепами-лампадами; навершие — Мёртвая Корона
 *  из чёрного железа на черепе, глазницы горят зелёным. */
function royalUmbrath(): Anim {
  const FW = 81, FH = 130, CW = 57, CH = 86, X0 = 12, BAR = 28, Y0 = BAR + 4, CX = 40, BODY = 72;
  const arms = armsCrop("umbrath-1", 9, 55);                                             // 47×60
  const AX = (CW - arms.w) / 2, AY = 7;
  // рваные языки низа: 7 языков разной длины, края неровные
  const TONGUE = [9, 13, 7, 12, 10, 13, 8];
  const jit = [0, 1, 0, -1, 0, 0, 1, 0, -1, 1, 0, 0, -1, 0, 1, 0];
  const bottom = (x: number) => {
    const w = CW / TONGUE.length, i = Math.min(TONGUE.length - 1, Math.floor(x / w)), p = (x + 0.5 - i * w) / w;
    return BODY + Math.round(TONGUE[i] * (1 - Math.pow(Math.abs(2 * p - 1), 1.6))) + jit[x % jit.length];
  };
  const whole = (_x: number, y: number) => y <= BODY + 1;                                // целый контур — для каймы
  const d0 = distMap(CW, CH, whole);
  const decay = (x: number, y: number) => { const s = Math.floor((x + y) / 8) * 31 + Math.floor((x - y + 200) / 8) * 17; return ((s * 2654435761) >>> 0) % 100 < 30 + Math.max(0, y - 40); };
  const tex = clothTex(CW, CH, (x, y) => y <= bottom(x), (x, y) => {
    const d = d0[y * CW + x] || 99;
    if (y <= BODY + 1) {
      if (d === 1) return UP[1];
      if (d === 2) return SIL[2];
      if (d === 3) return VELVET[1];
      if (d === 4) return (x + y) % 4 < 2 ? OLDG[2] : VELVET[1];
    }
    // истлевшая парча: ромбическая сетка старого золота с узелками, местами выпала (к низу — больше)
    const a = (x + y) % 8 === 0, b = (x - y + 800) % 8 === 0;
    if ((a || b) && !decay(x, y)) return a && b ? OLDG[1] : OLDG[0];
    return VELVET[1];
  });
  const emb: Emb = { pc: arms, x: AX, y: AY };
  // герб на середине полотнища не сдвигается — снос и качание там < 0.5 px; волна бежит от бруса вниз
  const wind: Wind = { ...WIND_HOME, lean: 0.3, sway: 1.3, lag: 7, slant: 0.1, f0: 0.02, f1: 0.3, lightT: 0.62, darkT: 0.2, deepT: 0.9, embT: 0.8, rip: N, ripT: 0.45, fieldD: 5, stiff: 3 };
  const frames: PC[] = [];
  for (let t = 0; t < N; t++) {
    const f = new PC(FW, FH), ph = (TAU * t) / N;
    const co = windCloth(tex, emb, t, wind, TONE_ROYAL.umbrath);
    const L = co.L;
    L.outline(OUTLINE);
    f.blit(L, X0 - co.M, Y0);
    // призрачный огонь: языки пламени растут от концов рваных языков ткани вверх по бархату — у основания широкие и самые светлые,
    //  к кончику тоньше и темнее; высота дышит по своей фазе (2 волны за цикл, не больше 1 px за кадр), кончик качается;
    //  бархат вокруг основания подсвечен пурпуром
    {
      const l = new PC(f.w, f.h), wT = CW / TONGUE.length;
      // тлеющая кромка: нижний пиксель каждого столбца — зелёный уголь, пунктир бежит по ветру на 1 px за кадр
      for (let u = 0; u < CW; u++) {
        const v = Math.min(bottom(u), CH - 1), X = co.at(u, v);
        if (X >= 0 && f.alpha(X0 - co.M + X, Y0 + v)) f.set(X0 - co.M + X, Y0 + v, ((u - t) % 4 + 4) % 4 < 2 ? UG[0] : c("#1e5a1a"));
      }
      for (let i = 0; i < TONGUE.length; i++) {
        const u = Math.min(CW - 1, Math.round((i + 0.5) * wT)), v = bottom(u), X = co.at(u, Math.min(v, CH - 1));
        if (X < 0) continue;
        const h = 4 + Math.round(1.5 + 1.5 * Math.sin(ph * 2 - i * 2.1)), bx = X0 - co.M + X, by = Y0 + v;
        for (const dx of [-2, 2]) for (let j = 0; j < 3; j++) if (f.alpha(bx + dx, by - j) && !l.alpha(bx + dx, by - j)) f.set(bx + dx, by - j, UP[2]);
        for (let j = 0; j < h; j++) {
          const yy = by - j, sw = j >= 3 ? Math.round(0.8 * ((j - 2) / h) * Math.sin(ph * 2 - i * 1.7)) : 0;
          if (j < 3) { l.set(bx - 1, yy, j ? UG[0] : UG[1]); l.set(bx, yy, j < 2 ? UG[2] : UG[1]); l.set(bx + 1, yy, j ? UG[1] : UG[0]); }
          else l.set(bx + sw, yy, j === h - 1 ? UG[0] : UG[1]);
        }
      }
      f.blit(l, 0, 0);
    }
    // брус чёрного железа с заклёпками и шипами на торцах
    const barL = X0 - 3, barR = X0 + CW + 2;
    layer(f, (l) => {
      for (let x = barL; x <= barR; x++) { l.set(x, BAR, IRON[3]); l.set(x, BAR + 1, (x - barL) % 6 === 3 ? IRON[4] : IRON[2]); l.set(x, BAR + 2, IRON[1]); l.set(x, BAR + 3, IRON[0]); }
      for (const [x0, dir] of [[barL - 1, -1], [barR + 1, 1]] as [number, number][]) for (let i = 0; i < 6; i++) {
        const h = i < 2 ? 2 : i < 4 ? 1 : 0;
        for (let j = -h; j <= h + 1; j++) l.set(x0 + dir * i, BAR + 1 + j, j < 0 ? IRON[3] : j === 0 ? IRON[2] : IRON[1]);
      }
      for (const u of [3, 14, 25, 31, 42, 53]) for (let y = BAR - 1; y <= BAR + 5; y++) { l.set(X0 + u, y, IRON[3]); l.set(X0 + u + 1, y, IRON[1]); }
      for (let y = BAR - 2; y <= BAR + 4; y++) for (let x = CX - 3; x <= CX + 3; x++) l.set(x, y, x === CX - 3 ? IRON[3] : x === CX - 2 ? IRON[4] : x >= CX + 2 ? IRON[0] : IRON[2]);
    });
    // цепи с черепами-лампадами на торцах: качаются маятником, глазницы мерцают
    layer(f, (l) => {
      for (const [side, x] of [[0, barL + 2], [1, barR - 2]] as [number, number][]) {
        const swing = (y: number) => Math.round(1.3 * ((y - BAR - 4) / 16) * Math.sin(ph - 1.6 - side * 0.8));
        chainV(l, x, BAR + 4, BAR + 19, [SIL[2], SIL[1], SIL[0]], swing);
        const g = Math.round(1 + Math.sin(ph * 2 + side * 2));
        skullLamp(l, x - 3 + swing(BAR + 20), BAR + 20, g);
      }
    });
    // навершие: Мёртвая Корона чёрного железа на черепе, глазницы горят зелёным
    layer(f, (l) => {
      const g = Math.round(1 + Math.sin(ph));
      for (let y = BAR - 6; y <= BAR - 3; y++) { l.set(CX - 1, y, IRON[3]); l.set(CX, y, IRON[2]); l.set(CX + 1, y, IRON[0]); }
      stamp(l, CX - 5, BAR - 17, [
        "...LLLLL...",
        "..LLLLLMM..",
        ".LLLLLLMMD.",
        ".LEEELEEED.",
        ".LEgELEgED.",
        ".LEEEMEEED.",
        "..MMMKMMD..",
        "..DMDMDMD..",
        "...DDDDD...",
      ], { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0], E: UK[0], g: UG[g] });
      stamp(l, CX - 6, BAR - 27, [
        "......A......",
        ".....aAb.....",
        "..A..aAb..A..",
        ".aAb.aAb.aAb.",
        ".aAbAaAbAaAb.",
        "aaAbaaAbaaAbb",
        "AAAAAAaaaaaab",
        "cGcccGcccGccd",
        "ddddddddddddd",
      ], { A: IRON[4], a: IRON[3], b: IRON[1], c: IRON[2], d: IRON[0], G: UG[1] });
    });
    frames.push(f);
  }
  return { id: "royal-umbrath", title: "САВАН КОРОНЫ", frames, w: FW, h: FH, anchor: [(CX + 0.5) / FW, (BAR + 1) / FH], fps: FPS, fac: "umbrath", hero: "deathknight" };
}

// ---------------------------------------------------------------- основание захвата (одно на обе фракции): каменная тумба, мачта, ворот с цепью
//  Слои одного размера: тумба с воротом (спереди), мачта с цепью и шкивом на макушке (сзади). Без знамени — законченное и ничьё:
//  на тумбе высечен круг со скрещёнными мечами, цепь поднята к шкиву, крюк свободен. Знамя едет по мачте: его якорь (середина бруса)
//  ставится на линию мачты — от верхней точки MAST_TOP (поднято) до нижней MAST_LOW (вывешено: низ полотнища у земли за тумбой).
const BASE_W = 72, BASE_H = 176, BASE_GY = 172, MAST_X = 34;                     // мачта — столбцы 34–37, ось 36.0
const MAST_TOP: [number, number] = [36, 30], MAST_LOW: [number, number] = [36, 78];
const STONE = P.stone;                                                           // #2e2c34 #46444e #625e6a #827c88 #a4a0aa
const TIMBER = [c("#2e1c14"), c("#45291c"), c("#5e3a26"), WOOD[2]];

/** Тумба: подошва из крупных блоков, кладка цоколя со швами вразбежку, карниз со свесом и тенью, верхняя площадка; рельеф — круг
 *  со скрещёнными мечами; железная обойма мачты; ворот — барабан с намотанной цепью на двух стойках и рукоять. */
function plinthLayer(): PC {
  const l = new PC(BASE_W, BASE_H);
  const S = STONE;
  // подошва: 2 ряда блоков 4+5 строк, верх светлый, низ тёмный
  for (let y = 164; y <= BASE_GY; y++) for (let x = 3; x <= 68; x++) {
    const row = y < 168 ? 0 : 1, bx = (x - 3 + (row ? 8 : 0)) % 16;
    let col = y === 164 ? S[4] : y === 168 ? S[1] : bx === 15 ? S[1] : bx === 0 ? S[3] : x > 62 ? S[2] : S[3];
    if (y === BASE_GY) col = S[1];
    if (x === 3 || x === 68) col = x === 3 ? S[3] : S[1];
    l.set(x, y, col);
  }
  // цоколь: 4 ряда блоков по 6 строк, швы вразбежку; свет слева, правый край в тени; часть блоков темнее (камень разный)
  for (let y = 140; y <= 163; y++) for (let x = 8; x <= 63; x++) {
    const r = Math.floor((y - 140) / 6), k = (y - 140) % 6, bx = (x - 8 + (r % 2 ? 7 : 0)) % 14, bi = Math.floor((x - 8 + (r % 2 ? 7 : 0)) / 14);
    const dark = (r * 5 + bi * 3) % 7 === 2;
    let col = k === 5 || bx === 13 ? S[1] : k === 0 ? (dark ? S[3] : S[4]) : bx === 0 ? (dark ? S[3] : S[4]) : k === 4 ? S[2] : dark ? S[2] : S[3];
    if (x >= 60 && k !== 5 && bx !== 13) col = k === 0 ? S[3] : S[2];
    if (x === 8) col = S[4];
    l.set(x, y, col);
  }
  for (const [x, y] of [[13, 143], [14, 144], [14, 145], [15, 146], [55, 155], [56, 156], [56, 157], [57, 158]] as [number, number][]) l.set(x, y, S[1]);   // трещины
  // рельеф: пустой щит (место владельца) на скрещённых мечах — плита под рельефом гладкая, бороздки тёмные, их нижний правый край светлый
  for (let y = 141; y <= 162; y++) for (let x = 23; x <= 48; x++) l.set(x, y, x >= 47 ? S[2] : S[3]);
  const relief = new PC(BASE_W, BASE_H);
  const RX = 36, RY = 141;                                                       // левый верх рельефа 26×21 → ось 36.0
  const sword = (flip: boolean) => {
    const P0 = (i: number, j: number) => relief.set(flip ? RX + 12 - i - 1 + 0 : RX - 13 + i, RY + j, S[1]);
    for (let k = 0; k < 19; k++) P0(3 + k, 2 + k);                               // клинок
    P0(1, 0); P0(2, 1); P0(2, 0); P0(1, 1);                                     // навершие
    for (const [i, j] of [[1, 5], [2, 4], [3, 3], [4, 2], [5, 1]]) P0(i + 1, j + 1);   // гарда поперёк клинка
  };
  sword(false); sword(true);
  const shHW = (y: number) => (y < 4 || y > 18 ? -1 : y <= 10 ? 6 : Math.max(0, 6 - Math.round(((y - 10) / 8) ** 1.4 * 6)));
  for (let y = 0; y < 21; y++) for (let x = -8; x < 8; x++) {
    const hw = shHW(y);
    if (hw < 0 || Math.abs(x + 0.5) > hw + 0.5) continue;
    const edge = Math.abs(x + 0.5) > hw - 0.5 || y === 4 || shHW(y + 1) < 0 || Math.abs(x + 0.5) > shHW(y + 1) + 0.5;
    if (edge) relief.set(RX + x, RY + y, S[1]);
    else relief.clear(RX + x, RY + y);
  }
  for (let y = 0; y < 21; y++) for (let x = -8; x < 8; x++) {
    const hw = shHW(y);
    if (hw < 0 || Math.abs(x + 0.5) > hw - 0.5 || y === 4 || shHW(y + 1) < 0 || Math.abs(x + 0.5) > shHW(y + 1) + 0.5) continue;
    relief.set(RX + x, RY + y, y === 5 || x === -hw ? S[1] : x >= hw - 1 || shHW(y + 2) < 0 ? S[4] : S[2]);   // утопленное поле щита
  }
  for (let y = 0; y < BASE_H; y++) for (let x = 0; x < BASE_W; x++) {
    const q = relief.get(x, y)!;
    if (!q[3]) continue;
    l.set(x, y, q);
    if (q[0] === S[1][0] && !relief.alpha(x + 1, y + 1) && y + 1 <= 162) l.set(x + 1, y + 1, S[4]);
  }
  // карниз: свес на 2 px, верх светлый, под свесом — тень на цоколе
  for (let y = 134; y <= 139; y++) for (let x = 5; x <= 66; x++) {
    const col = y === 134 ? S[4] : y === 139 ? S[1] : y === 137 ? S[2] : y === 138 ? (x <= 6 ? S[3] : S[2]) : x <= 6 ? S[4] : x >= 64 ? S[2] : S[3];
    l.set(x, y, col);
  }
  for (let x = 8; x <= 63; x++) l.set(x, 140, S[1]);
  // верхняя площадка (видна сверху): плиты, светлее к свету
  for (let y = 130; y <= 133; y++) for (let x = 7 + (133 - y); x <= 64 - (133 - y); x++) l.set(x, y, (x - 7) % 15 === 0 ? S[2] : y === 130 ? S[4] : x < 36 ? S[4] : S[3]);
  // обойма мачты: ступенчатый железный башмак
  for (let y = 124; y <= 131; y++) {
    const hw = y < 127 ? 4 : y < 130 ? 5 : 6;
    for (let x = 36 - hw; x < 36 + hw; x++) l.set(x, y, y === 124 || y === 127 || y === 130 ? IRON[4] : x < 36 - hw + 2 ? IRON[3] : x >= 36 + hw - 2 ? IRON[0] : IRON[2]);
  }
  for (const [x, y] of [[32, 125], [39, 125], [31, 128], [40, 128]] as [number, number][]) l.set(x, y, IRON[4]);
  // ворот: две стойки, барабан с намотанной цепью, рукоять справа
  for (const bx of [42, 54]) for (let y = 118; y <= 131; y++) { l.set(bx, y, WOOD[3]); l.set(bx + 1, y, WOOD[1]); }
  for (let y = 120; y <= 127; y++) for (let x = 44; x <= 53; x++) {
    const k = y - 120, wrap = (x + k) % 3 === 0;
    l.set(x, y, k === 0 ? IRON[3] : k === 7 ? IRON[0] : wrap ? (k < 4 ? SIL[3] : SIL[2]) : k < 3 ? IRON[3] : k < 6 ? IRON[2] : IRON[1]);
  }
  stamp(l, 55, 117, ["..aa", "..ab", "..b.", "..b.", ".ab.", "aab.", "bb.."], { a: IRON[3], b: IRON[1] });
  stamp(l, 58, 114, ["WW", "Wd", "Wd", "dd"], { W: WOOD[3], d: WOOD[1] });
  l.outline(OUTLINE);
  return l;
}

/** Мачта: тёмное дерево 4 px, железные бандажи с заклёпками через 22 px, на макушке — шкив в железной обойме и шпиль;
 *  цепь от барабана ворота поднимается справа от мачты к шкиву, слева свисает свободный конец с крюком. */
function mastLayer(): PC {
  const l = new PC(BASE_W, BASE_H);
  for (let y = 8; y <= 130; y++) for (let i = 0; i < 4; i++) l.set(MAST_X + i, y, TIMBER[[3, 2, 1, 0][i]]);
  for (let y = 26; y <= 118; y += 22) stamp(l, MAST_X - 1, y, ["aAaaab", "cdcccd", "eeeeee"], { A: IRON[4], a: IRON[3], b: IRON[1], c: IRON[2], d: IRON[4], e: IRON[0] });
  // макушка: обойма шкива 8×7 со щелью, шкив виден в щели, шпиль
  stamp(l, MAST_X - 2, 0, [
    "...ab...",
    "...ab...",
    "..aAcb..",
    ".aAAccb.",
    "aAsSssce",
    "aAsHhsce",
    "aAsSssce",
    ".accccb.",
    "..eeee..",
  ], { A: IRON[4], a: IRON[3], c: IRON[2], b: IRON[1], e: IRON[0], s: SIL[1], S: SIL[2], H: SIL[3], h: SIL[0] });
  // цепь: справа от мачты — от шкива до барабана; слева — свободный конец с крюком
  const ch: [Col, Col, Col] = [SIL[3], SIL[2], SIL[1]];
  chainV(l, 41, 7, 119, ch);
  chainV(l, 31, 7, 20, ch);
  stamp(l, 30, 21, [".a.", "a.b", "a.b", ".bb"], { a: SIL[3], b: SIL[1] });
  l.outline(OUTLINE);
  return l;
}
function captureBase(): Anim {
  const plinth = plinthLayer(), mast = mastLayer();
  const full = new PC(BASE_W, BASE_H);
  full.blit(mast, 0, 0); full.blit(plinth, 0, 0);
  return { id: "capture-base", title: "ОСНОВАНИЕ ЗАХВАТА", frames: [full, plinth, mast], w: BASE_W, h: BASE_H, anchor: [0.5, BASE_GY / BASE_H], fps: 0, fac: "solgard" };
}

export { homeSolgard, homeUmbrath, pennant, drape, medallion, REDESIGN, torn, burned, fallen, royalSolgard, royalUmbrath, captureBase, readPng, crop, scaleNN, paintGround, logoSheet, LOGOS, logoFinal, label };
/** Модель ветра — общая со «Знаменем защиты» (tools/gen/vfx-banner.ts). */
export { N as WIND_FRAMES, FPS as WIND_FPS, windPlan, windCloth, planShifts, toneFn, clothTex, distMap, stamp, layer, despeckle, WIND_HOME, type Wind, type Emb, type ToneFn, type ClothOut };

// ---------------------------------------------------------------- подписи: пиксельный шрифт 3×5 (кириллица, как в heraldry.ts)
const GLYPHS: Record<string, string> = {
  А: ".#./#.#/###/#.#/#.#", Б: "###/#../##./#.#/##.", В: "##./#.#/##./#.#/##.", Г: "###/#../#../#../#..",
  Д: ".###./.#.#./.#.#./#####/#...#", Е: "###/#../##./#../###", Ж: "#.#.#/#.#.#/.###./#.#.#/#.#.#", З: "##./..#/.#./..#/##.",
  И: "#..#/#..#/#.##/##.#/#..#", Й: ".##./#..#/#.##/##.#/#..#", К: "#.#/#.#/##./#.#/#.#", Л: ".##/#.#/#.#/#.#/#.#",
  М: "#...#/##.##/#.#.#/#...#/#...#", Н: "#.#/#.#/###/#.#/#.#", О: ".#./#.#/#.#/#.#/.#.", П: "###/#.#/#.#/#.#/#.#",
  Р: "##./#.#/##./#../#..", С: ".##/#../#../#../.##", Т: "###/.#./.#./.#./.#.", У: "#.#/#.#/.##/..#/##.", Ф: ".#./###/#.#/###/.#.",
  Х: "#.#/#.#/.#./#.#/#.#", Ц: "#.#./#.#./#.#./####/...#", Ч: "#.#/#.#/.##/..#/..#", Ш: "#.#.#/#.#.#/#.#.#/#.#.#/#####",
  Щ: "#.#.#/#.#.#/#.#.#/#####/....#", Ъ: "##../.#../.##./.#.#/.##.", Ы: "#...#/#...#/##..#/#.#.#/##..#", Ь: "#../#../##./#.#/##.",
  Э: "##./..#/.##/..#/##.", Ю: "#..#./#.#.#/###.#/#.#.#/#..#.", Я: ".###/#..#/.###/.#.#/#..#",
  "0": "###/#.#/#.#/#.#/###", "1": ".#./##./.#./.#./###", "2": "##./..#/.#./#../###", "3": "###/..#/.##/..#/###",
  "4": "#.#/#.#/###/..#/..#", "5": "###/#../##./..#/##.", "6": ".##/#../###/#.#/###", "7": "###/..#/.#./.#./.#.",
  "8": "###/#.#/###/#.#/###", "9": "###/#.#/###/..#/##.",
  ".": "././././#", ",": "./././#/#", "-": "../../##/../..", ":": "./#/./#/.", "×": ".../#.#/.#./#.#/...",
  "«": "..../.#.#/#.#./.#.#/....", "»": "..../#.#./.#.#/#.#./....", "(": ".#/#./#./#./.#", ")": "#./.#/.#/.#/#.", "/": "..#/..#/.#./#../#..",
  "+": ".../.#./###/.#./...", "!": "#/#/#/./#", "?": "##./..#/.#./.../.#.", "—": "..../..../####/..../....", "Ё": "###/#../##./#../###",
  X: "#.#/#.#/.#./#.#/#.#", F: "###/#../##./#../#..", P: "##./#.#/##./#../#..", S: ".##/#../.#./..#/##.",
  "=": ".../###/.../###/...", ";": "./#/./#/#",
};
/** Подпись шрифтом 3×5, пиксель шрифта — k; возвращает ширину. */
function label(pc: PC, s: string, x: number, y: number, col: Col, k = 2): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    if (ch === " ") { cx += 3 * k; continue; }
    const rows = (GLYPHS[ch] ?? GLYPHS["?"]).split("/");
    rows.forEach((r, j) => [...r].forEach((p, i) => { if (p === "#") pc.rect(cx + i * k, y + j * k, k, k, col); }));
    cx += (rows[0].length + 1) * k;
  }
  return cx - x;
}

// ---------------------------------------------------------------- эмблема игры «Пепельный Предел» (лого экрана загрузки), 3 варианта и итог
//  Тот же стиль, что у гербов и штандартов: контур 1 px, 3–5 тонов на материал, свет сверху слева, палитра P. Надпись — свой
//  крупный шрифт (заглавные 12 px, штрих 2 px, засечки 1 px): заливка градиентом по строкам, скос (верх-лево светлее, низ-право темнее),
//  контур и тень вниз-вправо.
const TITLE_GLYPHS: Record<string, string[]> = {
  П: ["##########", "##########", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", "####..####"],
  Е: ["#########", "#########", ".##....##", ".##.....#", ".##......", ".######..", ".######..", ".##......", ".##.....#", ".##....##", "#########", "#########"],
  Л: ["..########", "..########", "...##..##.", "...##..##.", "...##..##.", "...##..##.", "...##..##.", "..##...##.", "..##...##.", ".##....##.", "##.....##.", "#.....####"],
  Ь: ["####.....", "####.....", ".##......", ".##......", ".##......", ".#######.", ".########", ".##....##", ".##....##", ".##....##", ".########", "########."],
  Н: ["####..####", ".##....##.", ".##....##.", ".##....##.", ".##....##.", ".########.", ".########.", ".##....##.", ".##....##.", ".##....##.", ".##....##.", "####..####"],
  Ы: ["####.....####", ".##.......##.", ".##.......##.", ".##.......##.", ".##.......##.", ".######...##.", ".#######..##.", ".##...##..##.", ".##...##..##.", ".##...##..##.", ".#######..##.", "#######..####"],
  Й: ["..##..##..", "...####...", "..........", "####..####", ".##....##.", ".##..####.", ".##..####.", ".##.##.##.", ".##.##.##.", ".####..##.", ".####..##.", ".##....##.", ".##....##.", ".##....##.", "####..####"],
  Р: ["########.", "#########", ".##....##", ".##....##", ".##....##", ".########", ".#######.", ".##......", ".##......", ".##......", ".##......", "####....."],
  Д: ["..########.", "..########.", "...##...##.", "...##...##.", "...##...##.", "..##....##.", "..##....##.", ".##.....##.", ".##.....##.", "###########", "###########", "##.......##", "#.........#"],
};
/** Сколько строк у буквы над линией заглавных (бревис Й). */
const TITLE_ASC: Record<string, number> = { Й: 3 };
/** Надпись крупным шрифтом: ramp — тона заливки по строкам 0–11 (сверху вниз), out — контур, shadow — тень. */
export function wordmark(text: string, ramp: Col[], out: Col = OUTLINE, shadow: Col = c("#0a070c"), gap = 2): PC {
  const glyphs = [...text].map((ch) => ({ ch, rows: TITLE_GLYPHS[ch] ?? [], asc: TITLE_ASC[ch] ?? 0 }));
  const width = glyphs.reduce((s, g) => s + (g.ch === " " ? 6 : g.rows[0].length + gap), 0) - gap;
  const W = width + 4, H = 3 + 12 + 2 + 3 + 2, body = new PC(W, H);
  const top = 4;                                                              // строка 0 заглавных
  let x = 2;
  for (const g of glyphs) {
    if (g.ch === " ") { x += 6; continue; }
    g.rows.forEach((r, j) => [...r].forEach((p, i) => { if (p === "#") body.set(x + i, top - g.asc + j, ramp[Math.max(0, Math.min(ramp.length - 1, j - g.asc))]); }));
    x += g.rows[0].length + gap;
  }
  // скос: край к свету на тон светлее, край от света — темнее (по своей рампе)
  const tone = toneFn([ramp.filter((q, i) => ramp.findIndex((r) => ckey(r) === ckey(q)) === i)]);
  const src = body.clone();
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
    const q = src.get(x2, y)!;
    if (!q[3]) continue;
    const lit = !src.alpha(x2, y - 1) || !src.alpha(x2 - 1, y), dark = !src.alpha(x2, y + 1) || !src.alpha(x2 + 1, y);
    if (lit && !dark) body.set(x2, y, tone(q, -1));
    else if (dark && !lit) body.set(x2, y, tone(q, 1));
  }
  body.outline(out);
  const res = new PC(W + 1, H + 1);
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) if (body.alpha(x2, y)) res.set(x2 + 1, y + 1, shadow);
  res.blit(body, 0, 0);
  return res;
}

interface Logo { id: string; title: string; draw: () => PC }
/** Золото надписи: свет сверху, к низу — тёплая тень (тона P.gold и тёмная бронза). */
const TITLE_GOLD = [G[4], G[3], G[3], c("#f4c048"), G[2], G[2], c("#c8862a"), G[1], G[1], c("#8a4a18"), c("#6a3010"), c("#4a2010")];
/** Пепел надписи: холодный светлый камень, к низу — тлеющий низ. */
const TITLE_ASH = [c("#f4f0ec"), c("#dcd6d2"), c("#dcd6d2"), c("#c4bcba"), c("#aca4a4"), c("#aca4a4"), c("#948c8e"), c("#7c7478"), c("#7c7478"), c("#9a3a1c"), c("#7a1c10"), c("#4a120c")];
/** Две строки названия по центру ширины W: «ПЕПЕЛЬНЫЙ» и «ПРЕДЕЛ». */
function title2(dst: PC, y: number, ramp1: Col[], ramp2: Col[] = ramp1) {
  const a = wordmark("ПЕПЕЛЬНЫЙ", ramp1), b = wordmark("ПРЕДЕЛ", ramp2);
  dst.blit(a, Math.round((dst.w - a.w) / 2), y);
  dst.blit(b, Math.round((dst.w - b.w) / 2), y + 17);
}
/** Кольцо-печать из камня (свет сверху слева) с бронзовым ободком внутри и тёмным диском: диск полосами от пепельной ночи к зареву внизу. */
function sealDisc(l: PC, cx: number, cy: number, R: number, ring = 5) {
  const S = P.stone, glow = [c("#151018"), c("#1c1219"), c("#261418"), c("#361612"), c("#4c1a0e"), c("#6a1e0e")];
  for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > R) continue;
    const lit = -(dx / r) * 0.6 - (dy / r) * 0.8;
    if (r > R - ring) l.set(x, y, r <= R - ring + 1 ? (lit > 0 ? S[0] : S[2]) : lit > 0.55 ? S[4] : lit > 0.05 ? S[3] : lit > -0.5 ? S[2] : S[1]);
    else if (r > R - ring - 2 && R > 24) l.set(x, y, r > R - ring - 1 ? (lit > 0 ? G[0] : G[1]) : glow[0]);   // бронзовый ободок и тень под ним
    else {
      const k = Math.max(0, Math.min(glow.length - 1, Math.floor(((dy + R - ring) / (2 * (R - ring))) * glow.length * 1.15 - 0.6)));
      l.set(x, y, glow[k]);
    }
  }
}
/** Искры и пепел: s = 2 — квадрат 2×2, 1 и 0 — штрих 1×2 (ярче и тусклее), −1 — хлопья пепла 2×1. Одиночных пикселей нет. */
function sparks(l: PC, list: [number, number, number][]) {
  for (const [x, y, s] of list) {
    if (s === 2) { l.set(x, y, FIRE[4]); l.set(x + 1, y, FIRE[3]); l.set(x, y + 1, FIRE[3]); l.set(x + 1, y + 1, FIRE[2]); }
    else if (s === -1) { l.set(x, y, P.ash[4]); l.set(x + 1, y, P.ash[3]); }
    else { l.set(x, y, FIRE[s === 1 ? 4 : 3]); l.set(x, y + 1, FIRE[2]); }
  }
}
/** Пламя из трёх языков разной высоты и изгиба (главный чуть правее, кончик загнут влево; левый ниже и клонится влево; правый — вправо)
 *  и язычка, оторвавшегося над главным. Жар — по расстоянию до края и высоте: кромка FIRE[1], затем FIRE[2], FIRE[3], ядро FIRE[4]
 *  у основания; (cx, by) — низ, h — высота, w — полуширина главного языка. Контур кладёт слой. */
function flame(l: PC, cx: number, by: number, h: number, w: number) {
  const tongues = [
    { ox: 0.6, th: h, tw: w * 0.95, bend: -2.4 },
    { ox: -w * 0.62, th: h * 0.6, tw: w * 0.58, bend: -2.8 },
    { ox: w * 0.62, th: h * 0.76, tw: w * 0.52, bend: 2.6 },
  ];
  const m = new PC(l.w, l.h), vAt = new Float32Array(l.w * l.h).fill(1);
  const fill = (xc: number, y: number, half: number, v: number) => {
    for (let x = Math.floor(xc - half - 1); x <= xc + half + 1; x++) if (Math.abs(x + 0.5 - xc) <= half && m.inside(x, y)) { m.set(x, y, FIRE[2]); vAt[y * l.w + x] = Math.min(vAt[y * l.w + x], v); }
  };
  for (const t of tongues) for (let y = Math.floor(by - t.th); y <= by; y++) {
    const v = Math.max(0, (by - (y + 0.5)) / t.th);
    const half = t.tw * (v < 0.28 ? 0.35 + 0.65 * Math.sqrt(v / 0.28) : 1 - Math.pow((v - 0.28) / 0.72, 0.8));
    fill(cx + t.ox * (1 - v * 0.3) + t.bend * v * v, y, half, v);
  }
  // оторвавшийся язычок над главным: капля 3×4 чуть левее кончика
  for (let j = 0; j < 4; j++) fill(cx - 1.2 - j * 0.15, by - h - 2 - j, j === 0 || j === 3 ? 0.6 : 1.3, 0.95);
  const d = distMap(l.w, l.h, (x, y) => m.alpha(x, y) > 0);
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const k = d[y * l.w + x];
    if (!k) continue;
    const heat = k * (1.15 - vAt[y * l.w + x]);
    l.set(x, y, k === 1 ? FIRE[1] : heat < 1.9 ? FIRE[2] : heat < 3.4 ? FIRE[3] : FIRE[4]);
  }
}

/** Вариант 1 «Расколотая корона»: каменная печать с ночью и заревом пожара; корона расколота трещиной, из которой бьёт жар: левая
 *  половина — золото Сольгарда с сапфиром и шарами на зубцах, правая — чёрное железо Умбрата с зелёным камнем и сиреневыми остриями. */
function logoCrown(): PC {
  const W = 160, H = 140, cx = 80, cy = 50, pc = new PC(W, H);
  layer(pc, (l) => sealDisc(l, cx, cy, 46, 6));
  // в зареве — силуэт руин павших королевств: башни с обломанными верхами, обрывки знамён на шестах; по верху — отсвет пожара
  {
    const R2 = 38, ground = (u: number) => cy + 33 + Math.round(1.2 * Math.sin(u * 0.45));
    const towers: [number, number, number][] = [[-33, -28, 22], [-24, -20, 26], [-13, -8, 20], [7, 11, 24], [16, 22, 17], [26, 30, 25]];
    const top = (u: number) => {
      let t = ground(u);
      for (const [a, b, h] of towers) if (u >= a && u <= b) t = Math.min(t, cy + h + ((u - a) % 3 === 1 ? 2 : 0) + (u === b ? 1 : 0));
      return t;
    };
    const l = new PC(W, H);
    for (let u = -R2; u <= R2; u++) for (let y = top(u); y <= cy + R2; y++) {
      const x = cx + u, r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r > R2 + 0.5) continue;
      l.set(x, y, y === top(u) ? c("#5a1a0e") : c("#0c080c"));
    }
    for (const [u, h, fl] of [[-17, 14, -1], [3, 12, 1]] as [number, number, number][]) {
      for (let y = cy + h; y < ground(u); y++) l.set(cx + u, y, c("#0c080c"));
      for (let j = 0; j < 2; j++) for (let i = 1; i <= 3; i++) l.set(cx + u + fl * i, cy + h + j + (i === 3 ? 1 : 0), c("#0c080c"));
    }
    pc.blit(l, 0, 0);
  }
  // корона: обруч y 56–68, пять зубцов; трещина по оси, половины разведены
  const BT = 56, BB = 68;
  const teeth: [number, number][] = [[-27, 42], [-14, 33], [0, 24], [14, 33], [27, 42]];   // смещение зубца, строка острия
  const inCrown = (u: number, y: number) => {
    if (y >= BT && y <= BB && Math.abs(u + 0.5) <= 31) return true;
    for (const [tu, ty] of teeth) { const hw = 5.4 * ((y + 0.5 - ty) / (BT - ty)); if (y >= ty && y < BT && Math.abs(u + 0.5 - tu) <= hw) return true; }
    return false;
  };
  const crack = (y: number) => [0, 0, 1, 1, 1, 0, -1, -1, -1, 0, 0, 1, 1, 0, -1, 0][((y % 16) + 16) % 16];
  const half = (side: -1 | 1) => (l: PC) => {
    const ramp = side < 0 ? [G[0], G[1], G[2], G[3], G[4]] : [UK[1], IRON[1], IRON[2], IRON[3], IRON[4]];
    for (let y = 20; y <= BB; y++) for (let u = -32; u <= 32; u++) {
      if (!inCrown(u, y)) continue;
      const cu = crack(y);
      if (side < 0 ? u > cu - 2 : u < cu + 1) continue;
      const tooth = teeth.find(([tu, ty]) => y < BT && y >= ty && Math.abs(u - tu) <= 6);
      let k: number;
      if (tooth) {
        // зубец — гранёный шип: левая грань на свету, ребро с бликом, правая грань в тени, у правой кромки темнее; у обруча — тень
        const [tu, ty] = tooth, hw = Math.max(0.6, 5.4 * ((y + 0.5 - ty) / (BT - ty))), rel = (u + 0.5 - tu) / hw;
        k = rel < -0.25 ? 3 : rel <= 0.2 ? 4 : rel < 0.65 ? 2 : 1;
        if (y >= BT - 2 && k > 1) k--;
      } else {
        // обруч: сверху и снизу зубчатый обод (бусины через желобок), под ободом — желобок; по полю — гравировка зигзагом
        const r = y - BT, zz = 4 + Math.abs(((u + 64) % 6) - 3);
        if (r === 0) k = (u + 64) % 3 === 0 ? 2 : 4;
        else if (r === 1) k = 3;
        else if (r === 2 || r === 9) k = 1;
        else if (r === 10) k = (u + 64) % 3 === 0 ? 1 : 3;
        else if (r >= 11) k = r === 11 ? 1 : 0;
        else k = r === zz ? 1 : r === zz - 1 && r > 3 ? 4 : r <= 5 ? 3 : 2;
      }
      l.set(cx + u + side, y, ramp[k]);
    }
    if (side < 0) {
      stamp(l, cx - 19, 59, [".hA.", "hAAa", "Aaad", ".dd."], { h: c("#d8f0ff"), A: AZ[3], a: AZ[2], d: AZ[1] });
      for (const [tu, ty] of teeth.filter(([tu]) => tu < 0)) stamp(l, cx + tu - 3 + side, ty - 5, [".YG.", "YYGg", "GGgh", ".gh."], { Y: G[4], G: G[3], g: G[2], h: G[1] });
    } else {
      stamp(l, cx + 16, 59, [".ab.", "abbc", "bccd", ".dd."], { a: UG[2], b: UG[1], c: UG[0], d: c("#1e5a1a") });
      for (const [tu, ty] of teeth.filter(([tu]) => tu > 0)) stamp(l, cx + tu - 1 + side, ty - 6, [".s.", "sL.", "sLp", "LLp", ".p."], { s: UP[4], L: UP[3], p: UP[2] });
    }
  };
  layer(pc, half(-1), SOUT);
  layer(pc, half(1), UOUT);
  // жар из трещины: ядро 2 px, искры и пепел над короной
  {
    const l = new PC(W, H);
    for (let y = 21; y <= BB + 1; y++) {
      const x = cx + crack(y);
      l.set(x - 1, y, y > 26 ? FIRE[3] : FIRE[2]); l.set(x, y, y > 24 ? FIRE[4] : FIRE[3]);
    }
    for (let x = cx - 3; x <= cx + 3; x++) l.set(x, BB + 2, Math.abs(x - cx) <= 1 ? FIRE[3] : FIRE[2]);
    sparks(l, [[cx - 3, 15, 2], [cx + 4, 10, 1], [cx - 7, 7, 0], [cx + 9, 17, 0], [cx - 11, 20, 1], [cx + 12, 9, 2], [cx - 16, 12, -1], [cx + 18, 22, -1], [cx + 1, 4, 0], [cx - 21, 26, 0],
      [cx + 24, 14, 0], [cx - 26, 17, -1], [cx + 6, 20, -1]]);
    pc.blit(l, 0, 0);
  }
  title2(pc, 100, TITLE_GOLD);
  return pc;
}

/** Навершие-череп Умбрата для итоговой эмблемы (масштаб 1.25): 9×10, глазницы скошены к носу, зубы через пиксель. */
const SKULL9 = [
  "..LLLLM..",
  ".LLLLLMM.",
  "LLLLLLMMD",
  "LKKLLKKMD",
  "LKKKLKKKD",
  "LLKLMLKMD",
  ".LMMKMMD.",
  ".MDMDMDD.",
  "..MDMDD..",
  "...DDD...",
];
/** Скрещённые штандарты Сольгарда и Умбрата за печатью (вариант 2 и итог): древки, навершия, полотнища с утверждёнными гербами на ветру;
 *  у Сольгарда белый шёлк, герб лежит прямо на нём, без медальона.
 *  K — масштаб композиции: 1 — вариант 2 (полотнища 28×36, гербы s20), 1.25 — итог (полотнища 36 и 35 × 45, гербы s24: доля герба на ткани
 *  та же, ширина под чётный и нечётный герб — по центру; череп 9×10); брус, петли и кайма — те же пиксели. */
function bannerPair(pc: PC, K = 1) {
  const big = K > 1.1, size = big ? "s24" : "s20";
  const poles: { fac: Fac; a: [number, number]; b: [number, number] }[] = [
    { fac: "solgard", a: [100 * K, 97 * K], b: [50 * K, 12 * K] },
    { fac: "umbrath", a: [60 * K, 97 * K], b: [110 * K, 12 * K] },
  ];
  for (const { fac, a, b } of poles) {
    const k = KIT[fac], sol = fac === "solgard";
    const at = (y: number) => a[0] + ((b[0] - a[0]) * (a[1] - y)) / (a[1] - b[1]);
    layer(pc, (l) => {
      capsule(l, a[0], a[1], b[0], b[1] + 5 * K, 1.6 * K, sol ? [WOOD[0], WOOD[1], WOOD[2], WOOD[3]] : [BONE[0], BONE[1], BONE[2], BONE[3]]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      capsule(l, a[0] - ux * K, a[1] - uy * K, a[0] + ux * 4 * K, a[1] + uy * 4 * K, 1.9 * K, sol ? [STEEL[0], STEEL[1], STEEL[2], STEEL[3]] : [IRON[0], IRON[1], IRON[2], IRON[3]]);   // подток
      if (sol) {                                                                          // наконечник копья по оси древка: ромб, левая грань светлая
        const tip: [number, number] = [b[0] + ux * 4 * K, b[1] + uy * 4 * K], base: [number, number] = [b[0] - ux * 7 * K, b[1] - uy * 7 * K], mid: [number, number] = [b[0] - ux * 2 * K, b[1] - uy * 2 * K], hw = 3.4 * K;
        l.poly([base, [mid[0] - uy * hw, mid[1] + ux * hw], tip, [mid[0] + uy * hw, mid[1] - ux * hw]], (x, y) => ((x + 0.5 - base[0]) * -uy + (y + 0.5 - base[1]) * ux > 0 ? STEEL[3] : STEEL[1]));
        capsule(l, b[0] - ux * 7 * K, b[1] - uy * 7 * K, b[0] - ux * 8.5 * K, b[1] - uy * 8.5 * K, 1.9 * K, [G[1], G[2], G[3], G[4]]);
      } else if (big) stamp(l, Math.round(b[0]) - 4, Math.round(b[1]) - 6, SKULL9, { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0] });
      else stamp(l, b[0] - 3, b[1] - 5, ["..LLL..", ".LLLMM.", "LLLLMMD", "LKKLKKD", "LKKMKKD", ".MMKMD.", ".DMDMD.", "..DDD.."], { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0] });
    });
    // полотнище на перекладине: кадр ветра штандарта своих земель, ветер наружу
    const CW = Math.round(28 * K) + (big && sol ? 1 : 0), CH = Math.round(36 * K), bar = Math.round(24 * K), X0 = Math.round(at(bar)) - Math.floor(CW / 2);
    const P = Math.round(29 * K), Q = Math.round(25 * K);
    const inside = sol ? (x: number, y: number) => y <= P || Math.abs(x + 0.5 - CW / 2) <= CW / 2 - 2 * (y - P) : (x: number, y: number) => x >= (y <= Q ? 0 : Math.ceil((y - Q) / 2)) && x <= CW - 1 - (y <= Q ? 0 : Math.ceil((y - Q) / 2));
    const tex = clothTex(CW, CH, inside, (_x, _y, d) => k.cloth(d));
    const em = factionEmblem(fac, size), ex = Math.floor((CW - em.w) / 2);
    // герб у обеих фракций прямо на ткани; у Сольгарда — на белом шёлке без медальона (решение пользователя, вариант Б — как у штандарта
    //  своих земель и «Знамени защиты»), на прежнем месте
    const emb: Emb = { pc: em, x: ex, y: big ? 5 : 4 };
    const co = windCloth(tex, emb, sol ? 2 : 8, { ...WIND_HOME, lean: (sol ? -1.3 : 1.3) * K, sway: 0.8 * K, lag: 2.2, embFlat: sol }, k.tone);
    co.L.outline(OUTLINE);
    pc.blit(co.L, X0 - co.M, bar + 3);
    layer(pc, (l) => {
      k.bar(l, X0 - 2, X0 + CW + 1, bar);
      for (const u of [2, Math.floor(CW / 2) - 1, CW - 4]) k.tie(l, X0 + u, 2, bar - 1, bar + 3);
    });
  }
}
/** Вариант 2 «Два знамени»: скрещённые штандарты Сольгарда и Умбрата (полотнища с утверждёнными гербами колышутся) за круглым
 *  щитом-печатью, в которой горит пепельный огонь. */
function logoBanners(): PC {
  const W = 160, H = 140, pc = new PC(W, H);
  bannerPair(pc);
  // щит-печать с пепельным огнём на перекрестье древков
  layer(pc, (l) => sealDisc(l, 80, 76, 21, 5));
  layer(pc, (l) => flame(l, 80, 88, 21, 7.5), c("#3a0c08"));
  sparks(pc, [[73, 58, 0], [86, 53, 1], [79, 49, 2], [69, 64, -1], [91, 62, -1]]);
  title2(pc, 102, TITLE_ASH, TITLE_GOLD);
  return pc;
}

/** Вариант 3 «Тлеющий клинок»: меч старого королевства вонзён в курган пепла, клинок у пепла раскалён; на концах гарды висят
 *  обрывки знамён Сольгарда и Умбрата, над курганом поднимаются искры и хлопья пепла. */
function logoSword(): PC {
  const W = 160, H = 140, cx = 80, pc = new PC(W, H), MT = 84;                       // MT — верх кургана у клинка
  // обрывки знамён на гарде: рваный низ, колышутся
  for (const fac of ["solgard", "umbrath"] as Fac[]) {
    const L0 = [17, 19, 22, 24, 20, 23, 26, 28, 27], sol = fac === "solgard", x0 = sol ? cx - 27 : cx + 18, len = sol ? L0 : [...L0].reverse();
    layer(pc, (l) => {
      for (let i = 0; i < 9; i++) for (let y = 0; y < len[i]; y++) {
        const edge = i === 0 || i === 8 || y <= 1, mark = i >= 3 && i <= 5 && y >= 7 && y <= 12 && !(y === 7 && i !== 4) && !(y === 12 && i !== 4);
        const col = sol ? (edge ? (y <= 1 ? AZ[3] : AZ[2]) : mark ? (i === 4 ? G[3] : G[2]) : y > len[i] - 5 ? WH[1] : i < 3 ? WH[3] : WH[2])
          : (edge ? (y <= 1 ? UP[3] : UP[2]) : mark ? (i === 4 ? UP[4] : UP[3]) : y > len[i] - 5 ? UK[1] : i < 3 ? UK[3] : UK[2]);
        l.set(x0 + i + Math.round(Math.sin(y * 0.22 + (sol ? 0 : 2)) * 1.2), 32 + y, col);
      }
    });
  }
  // меч: навершие с сапфиром, рукоять в коже, гарда с загнутыми концами, клинок с долом; у пепла клинок раскалён
  layer(pc, (l) => {
    l.shadedEllipse(cx, 9, 5, 5, [G[1], G[2], G[3], G[4]]);
    stamp(l, cx - 1, 8, ["hA", "Ad"], { h: c("#d8f0ff"), A: AZ[3], d: AZ[1] });
    for (let y = 15; y <= 26; y++) for (let i = -2; i <= 1; i++) l.set(cx + i, y, (y + (i < 0 ? 0 : 1)) % 3 === 0 ? c("#3e2618") : i < 0 ? c("#94613a") : c("#6a4228"));
    for (let y = 27; y <= 33; y++) for (let x = cx - 28; x <= cx + 27; x++) {
      const u = Math.abs(x + 0.5 - cx), curl = u > 21 ? Math.round((u - 21) / 2) : 0;
      if (y < 27 + curl || y > 30 + curl - (u > 25 ? 1 : 0)) continue;
      l.set(x, y, y === 27 + curl ? G[4] : y === 28 + curl ? G[3] : y === 29 + curl ? G[2] : G[1]);
    }
    // перекрестье гарды: литая бляха с сапфиром, свет сверху слева
    l.shadedEllipse(cx - 0.5, 29, 5.2, 4.4, [G[1], G[2], G[3], G[4]]);
    gem(l, cx - 2, 28, true);
    // клинок 8 px: светлая левая фаска, плоскость, дол (левая стенка в тени), правая плоскость, тёмная правая кромка — 5 тонов стали,
    //  блик у гарды. У пепла клинок раскалён: ступени жара FIRE[0…4] сверху вниз по 4 строки, на стыке ступеней — шахматный дизер,
    //  столбцы держат светотень (левая фаска на ступень жарче, дол и правая кромка — на ступень темнее)
    const COLD = [4, 3, 3, 1, 2, 2, 1, 0], HOFF = [1, 0, 0, -1, 0, 0, -1, -1], HS = MT - 22;
    for (let y = 31; y <= MT + 6; y++) for (let i = 0; i < 8; i++) {
      const x = cx - 4 + i, t = y - HS, L = t < 0 ? 0 : Math.min(5, Math.floor(t / 4) + 1);
      const lvl = t >= 0 && t % 4 === 0 && (x + y) % 2 === 1 ? L - 1 : L;              // дизер на стыке ступеней
      l.set(x, y, lvl <= 0 ? STEEL[COLD[i]] : FIRE[Math.max(0, Math.min(4, lvl - 1 + HOFF[i]))]);
    }
    for (let y = 34; y <= 37; y++) l.set(cx - 4, y, y === 35 || y === 36 ? c("#ffffff") : STEEL[4]);   // блик
  });
  // курган пепла: объём (свет сверху слева), камни, угли и трещины жара от клинка
  layer(pc, (l) => {
    const A = P.ash, S = P.stone;
    // склоны — верх эллипса; низ не срезан: скруглён и неровен (осыпь), по нему — полоса тени
    const bot = (x: number) => 100 + Math.round(1 + 1.2 * Math.sin(x * 0.41) + 0.8 * Math.sin(x * 1.13 + 1.7));
    const inM = (x: number, y: number) => {
      const dx = (x + 0.5 - cx) / 46, dy = (y + 0.5 - 99) / (y <= 99 ? 16 : 4.5);
      return y <= bot(x) && dx * dx + dy * dy <= 1 + 0.1 * Math.sin(x * 0.55) + 0.05 * Math.sin(x * 1.7);
    };
    flat(l, inM, (x, y, d) => {
      const nx = (x + 0.5 - cx) / 46, ny = (y + 0.5 - 99) / 16, lum = -nx * 0.55 - ny * 0.8, low = !inM(x, y + 2);
      if (d === 1) return low ? A[0] : lum > 0.2 ? A[4] : A[2];
      if (low) return A[1];
      return lum > 0.55 ? A[4] : lum > 0.2 ? A[3] : lum > -0.15 ? A[2] : A[1];
    });
    for (const [x, y, w] of [[46, 93, 6], [62, 88, 5], [99, 89, 6], [113, 94, 5], [38, 97, 4], [121, 97, 4], [74, 95, 4]] as [number, number, number][])
      for (let j = 0; j < 3; j++) for (let i = 0; i < w - (j === 2 ? 1 : 0); i++) l.set(x + i - (j === 0 ? 0 : 0), y + j, j === 0 ? (i < 2 ? S[4] : S[3]) : j === 1 ? (i === 0 ? S[3] : S[2]) : S[1]);
    for (const [x0, y0, dx, n] of [[cx - 5, MT + 1, -1, 12], [cx + 4, MT + 1, 1, 13], [cx - 3, MT + 5, -1, 7], [cx + 2, MT + 6, 1, 8]] as [number, number, number, number][])
      for (let i = 0; i < n; i++) l.set(x0 + dx * i, y0 + Math.round(i * 0.33), i < 4 ? FIRE[3] : FIRE[2]);
    for (let x = cx - 6; x <= cx + 5; x++) { l.set(x, MT, Math.abs(x + 0.5 - cx) < 3 ? FIRE[4] : FIRE[3]); l.set(x, MT - 1, Math.abs(x + 0.5 - cx) < 2 ? FIRE[3] : A[3]); }
    for (const [x, y] of [[54, 96], [104, 97], [88, 99], [66, 99]] as [number, number][]) { l.set(x, y, FIRE[3]); l.set(x + 1, y, FIRE[2]); }
    dropIslands(l);
  });
  sparks(pc, [[cx - 10, 72, 2], [cx + 9, 63, 1], [cx - 14, 55, 0], [cx + 13, 77, 0], [cx + 16, 46, 0], [cx - 8, 44, 1], [cx + 22, 60, -1], [cx - 24, 68, -1], [cx - 19, 40, -1], [cx + 6, 38, 0]]);
  title2(pc, 104, TITLE_GOLD, TITLE_ASH);
  return pc;
}

/** Сцена печати итоговой эмблемы: расколотая корона перед городом, нарисованная под круг сцены радиуса rho = 22 (в варианте 1 круг 38 —
 *  тут не уменьшение, а свой рисунок: детали не мельче 2 px). Корона стоит внизу, на огне у земли: обруч и зубцы закрывают нижнюю часть
 *  зданий, как в варианте 1. Небо — полосы по строкам от ночи наверху к зареву между башнями. Город — шесть крупных зданий шириной
 *  6–8 px из пепельного камня (P.ash: основа, свет сверху и слева, тень справа, контур 1 px у каждого): две башни с зубцами 2×2 через
 *  2 px и один шпиль, по краям башни пониже, посередине два дома с плоскими крышами; без одиночных пиков. Огонь — в трёх окнах 2×3 и
 *  узкой полосой у земли. Корона: обруч 6 строк (ободки с бусинами через 3 px, камни 3×3), пять зубцов-шипов (свет слева, ребро с
 *  бликом, тень справа, у обруча на тон темнее); трещина по оси, половины разведены на 1 px: левая — золото Сольгарда с сапфиром и
 *  шарами на зубцах, правая — чёрное железо Умбрата с зелёным камнем и сиреневыми остриями; из трещины бьёт жар, над короной —
 *  искры и хлопья пепла. crownTop — строка верха обруча (v считается от центра печати вниз). */
function crownScene(pc: PC, cx: number, cy: number, rho: number, crownTop: number) {
  const inScene = (x: number, y: number) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rho * rho;
  const SIL = c("#0c080c");
  // ----- небо: полосы по строкам (v — строка от центра печати), ярче всего за низкими крышами
  const BANDS: [number, Col][] = [[-17, c("#151018")], [-14, c("#261418")], [-12, c("#4c1a0e")], [-10, c("#6a1e0e")], [-7, FIRE[0]], [-5, FIRE[1]]];
  const sky = (v: number) => (BANDS.find(([lim]) => v <= lim) ?? [0, FIRE[2]])[1];
  for (let y = cy - rho; y <= cy + rho; y++) for (let x = cx - rho; x <= cx + rho; x++) if (inScene(x, y)) pc.set(x, y, sky(y - cy));
  // ----- город слева направо: [левая колонка u, ширина, верх v, крыша, тон камня]; верх — верх зубцов, между зубцами крыша на 2 px ниже,
  //  шпиль — пирамида на 3 строки; здания стоят на земле v = GROUND, свет сверху и слева, тень справа, контур 1 px
  const GROUND = 13;
  const ASH = [c("#1e1a1c"), ...P.ash, c("#8c8078")];                                                  // рампа камня: от тени до кромки
  type Roof = "cren" | "crenR" | "flat" | "spire";
  const CITY: [number, number, number, Roof, number][] = [
    [-21, 7, -7, "cren", 3],
    [-14, 6, -12, "cren", 4],
    [-8, 8, -4, "flat", 2],
    [0, 8, -4, "flat", 2],
    [8, 6, -12, "spire", 4],
    [14, 7, -7, "crenR", 3],
  ];
  for (const [u0, w, top, roof, tone] of CITY) {
    const cols: number[] = [];
    for (let i = 0; i < w; i++) {
      const d = Math.abs(i - (w - 1) / 2);
      cols.push(roof === "cren" ? top + (i % 4 < 2 ? 0 : 2) : roof === "crenR" ? top + ((w - 1 - i) % 4 < 2 ? 0 : 2) : roof === "spire" ? top + Math.floor(d) : top);
    }
    const has = (i: number, v: number) => i >= 0 && i < w && v >= cols[i] && v <= GROUND;
    layer(pc, (l) => {
      for (let i = 0; i < w; i++) for (let v = cols[i]; v <= GROUND; v++) {
        if (!inScene(cx + u0 + i, cy + v)) continue;
        l.set(cx + u0 + i, cy + v, !has(i, v - 1) ? ASH[tone + 2] : !has(i - 1, v) ? ASH[tone + 1] : !has(i + 1, v) ? ASH[tone - 1] : ASH[tone]);
      }
    }, SIL);
  }
  // окна 2×3: тлеющие в левой башне, шпиле и левой крайней башне, под ними и в правой крайней — тёмные щели
  for (const [u, v] of [[-12, -3], [10, -2], [17, -3]] as [number, number][]) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) pc.set(cx + u + i, cy + v + j, SIL);
  for (const [u, v] of [[-12, -8], [10, -7], [-19, -3]] as [number, number][]) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) pc.set(cx + u + i, cy + v + j, j === 2 ? FIRE[1] : FIRE[2]);
  }
  // узкая полоса огня у земли (две яркие строки и отсвет), под ней чёрная земля
  const EMBER = [FIRE[3], FIRE[2], FIRE[0], c("#4c1a0e")];
  for (let u = -rho; u <= rho; u++) for (let v = GROUND; v <= rho; v++) if (inScene(cx + u, cy + v)) pc.set(cx + u, cy + v, EMBER[v - GROUND] ?? SIL);
  // ----- корона: обруч v BT…BT+5, зубцы над ним; трещина cu(v) по оси
  const BT = crownTop, BB = BT + 5, DV = BT + 7;                                      // DV — сдвиг короны вниз от исходного положения (обруч v −7…−2)
  /** Зубцы: ось tu и полуширины строк от острия до обруча (острие — 1 px, у обруча 5 и 7 px). */
  const OUTER = [0, 0, 1, 1, 2], MID = [0, 0, 1, 1, 1, 2, 2], CENTER = [0, 0, 1, 1, 2, 2, 2, 3, 3];
  const teeth = [{ tu: -13, hw: OUTER }, { tu: -7, hw: MID }, { tu: 0, hw: CENTER }, { tu: 7, hw: MID }, { tu: 13, hw: OUTER }].map((t) => ({ ...t, tv: BT - t.hw.length }));
  const CRACK = [0, 0, 1, 1, 0, -1, -1, 0, 0, 1, 1, 0, -1, -1, 0, 0, 1, 1];
  const crack = (v: number) => CRACK[(v - DV + 17 + CRACK.length) % CRACK.length];
  /** Индекс тона (0 — тень … 4 — блик) пикселя короны (u, v) до раскола или −1. */
  const toneAt = (u: number, v: number): number => {
    if (v >= BT && v <= BB) {
      if (Math.abs(u) > 15) return -1;
      const r = v - BT, bead = (u + 64) % 3 === 0;
      return r === 0 ? (bead ? 2 : 4) : r === 1 ? 3 : r <= 3 ? 2 : r === 4 ? (bead ? 1 : 3) : 0;
    }
    for (const t of teeth) {
      if (v < t.tv || v >= BT) continue;
      const hw = t.hw[v - t.tv], o = u - t.tu;
      if (Math.abs(o) > hw) continue;
      let k = o < 0 ? 3 : o === 0 ? 4 : o === hw ? 1 : 2;
      if (v === BT - 1 && k > 1) k--;                                                   // у обруча зубец в тени ободка
      return k;
    }
    return -1;
  };
  const half = (side: -1 | 1) => (l: PC) => {
    const ramp = side < 0 ? [G[0], G[1], G[2], G[3], G[4]] : [UK[1], IRON[1], IRON[2], IRON[3], IRON[4]];
    for (let v = BT - CENTER.length; v <= BB; v++) for (let u = -15; u <= 15; u++) {
      const cu = crack(v);
      if (side < 0 ? u > cu - 2 : u < cu + 1) continue;
      const k = toneAt(u, v);
      if (k >= 0) l.set(cx + u + side, cy + v, ramp[k]);
    }
    if (side < 0) {
      stamp(l, cx - 10, cy + BT + 1, ["hA.", "Aad", ".d."], { h: c("#d8f0ff"), A: AZ[3], a: AZ[2], d: AZ[1] });
      for (const t of teeth.filter((q) => q.tu < 0)) stamp(l, cx + t.tu - 2, cy + t.tv - 2, [".Y.", "YGg", ".g."], { Y: G[4], G: G[3], g: G[2], h: G[1] });
    } else {
      stamp(l, cx + 8, cy + BT + 1, ["ab.", "bcd", ".d."], { a: UG[2], b: UG[1], c: UG[0], d: c("#1e5a1a") });
      for (const t of teeth.filter((q) => q.tu > 0)) stamp(l, cx + t.tu + 1, cy + t.tv - 3, ["s", "L", "p"], { s: UP[4], L: UP[3], p: UP[2] });
    }
  };
  layer(pc, half(-1), SOUT);
  layer(pc, half(1), UOUT);
  // ----- жар из трещины: ядро 2 px (к острию тусклее), под обручем — отсвет
  {
    const l = new PC(pc.w, pc.h);
    for (let v = BT - CENTER.length + 1; v <= BB; v++) {
      const x = cx + crack(v);
      l.set(x - 1, cy + v, v - DV > -12 ? FIRE[3] : FIRE[2]); l.set(x, cy + v, v - DV > -13 ? FIRE[4] : FIRE[3]);
    }
    sparks(l, [[cx + 2, cy - 11, 2], [cx - 4, cy - 9, 1], [cx + 5, cy - 7, 0], [cx - 1, cy - 13, 0]]);
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) if (l.alpha(x, y) && !inScene(x, y)) l.clear(x, y);
    pc.blit(l, 0, 0);
  }
}

/** Итоговая эмблема (решение пользователя): вариант 2 «Два знамени», в печати вместо огня — расколотая корона из варианта 1 на фоне
 *  города, нарисованного под круг заново (crownScene). Чтобы корона и город читались, композиция целиком перерисована в 1.25 раза
 *  крупнее (полотнища 36 и 35 × 45 с гербами s24 — пропорции варианта 2), печать R 30 (по пропорции 26 — на 4 px больше: в сцену 44 px
 *  помещаются корона 33 px и город с башнями; размер эмблемы остаётся 105×118). withTitle = false — эмблема для игры без надписи,
 *  обрезанная по рисунку. */
const FINAL_K = 1.25;
function logoFinal(withTitle = true): PC {
  const W = 200, H = 175, cx = 100, cy = 95, R = 30, ring = 6, pc = new PC(W, H);
  bannerPair(pc, FINAL_K);
  layer(pc, (l) => sealDisc(l, cx, cy, R, ring));
  crownScene(pc, cx, cy, R - ring - 2, 6);
  // искры над печатью между знамёнами (как у огня варианта 2)
  sparks(pc, [[cx - 6, cy - 33, 0], [cx + 6, cy - 38, 1], [cx - 1, cy - 42, 2], [cx - 11, cy - 30, -1], [cx + 12, cy - 31, -1]]);
  if (!withTitle) return trimAlpha(pc);
  title2(pc, 129, TITLE_ASH, TITLE_GOLD);
  return pc;
}
/** Обрезка по непрозрачным пикселям. */
function trimAlpha(src: PC): PC {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? src : crop(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

const LOGOS: Logo[] = [
  { id: "logo-1", title: "1. РАСКОЛОТАЯ КОРОНА", draw: logoCrown },
  { id: "logo-2", title: "2. ДВА ЗНАМЕНИ", draw: logoBanners },
  { id: "logo-3", title: "3. ТЛЕЮЩИЙ КЛИНОК", draw: logoSword },
];
/** Лист вариантов эмблемы: каждый ×3 с подписью; рядом — ×1 (как в игре). */
function logoSheet(): PC {
  const k = 3, pad = 16, parts = LOGOS.map((l) => ({ l, pc: l.draw() }));
  const W = parts.reduce((s, p) => s + p.pc.w * k + pad, pad), H = pad + 30 + Math.max(...parts.map((p) => p.pc.h)) * k + pad;
  const out = new PC(W, H);
  fill(out, BGC);
  let x = pad;
  for (const { l, pc } of parts) {
    label(out, l.title, x, pad, INK, 2);
    out.blit(scaleNN(pc, k), x, pad + 30);
    x += pc.w * k + pad;
  }
  return out;
}

// ---------------------------------------------------------------- листы и превью
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tools/out/standards");
/** Земля для превью: тайлы client/public/assets/tiles/terrain.png (как groundTile/paintGround в vendor-lib: центральный тайл
 *  в колонке 14, варианты в 15–17). Строка — по списку TERRAIN_KEYS из shared/map.ts, прочитанному как текст: модуль карты
 *  при импорте сверяется с data/world.json, а превью штандартов от мира не зависит. */
let terrain: { atlas: PC; keys: string[] } | null = null;
function paintGround(dst: PC, x: number, y: number, w: number, h: number, name = "grass") {
  if (!terrain) {
    const src = fs.readFileSync(path.join(ROOT, "shared/map.ts"), "utf8").match(/TERRAIN_KEYS\s*=\s*\[([^\]]*)\]/);
    const keys = src ? [...src[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    terrain = { atlas: readPng(path.join(ROOT, "client/public/assets/tiles/terrain.png")), keys };
  }
  const row = terrain.keys.indexOf(name);
  if (row < 0) { const q = new PC(w, h); fill(q, [58, 64, 50, 255]); dst.blit(q, x, y); return; }
  const tiles = [0, 1, 2, 3].map((v) => crop(terrain!.atlas, (14 + v) * 32, row * 32, 32, 32));
  for (let ty = 0; ty < Math.ceil(h / 32); ty++) for (let tx = 0; tx < Math.ceil(w / 32); tx++) {
    const hsh = ((tx * 73856093) ^ (ty * 19349663)) >>> 0, t = tiles[hsh % 7 < 4 ? 0 : 1 + (hsh % 3)];
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const X = x + tx * 32 + i, Y = y + ty * 32 + j;
      if (X >= x + w || Y >= y + h || !dst.inside(X, Y)) continue;
      const s = (j * 32 + i) * 4, d = (Y * dst.w + X) * 4;
      dst.data[d] = t.data[s]; dst.data[d + 1] = t.data[s + 1]; dst.data[d + 2] = t.data[s + 2]; dst.data[d + 3] = 255;
    }
  }
}
const heroCache = new Map<string, PC>();
function hero(name: string): PC {
  let h = heroCache.get(name);
  if (!h) { h = crop(readPng(path.join(ROOT, `client/public/assets/units/${name}.png`)), 0, 0, 32, 32); heroCache.set(name, h); }
  return h;
}
/** Лист кадров в строку (пиксель листа — пиксель мира). */
function strip(frames: PC[]): PC {
  const out = new PC(frames.length * frames[0].w, frames[0].h);
  frames.forEach((f, i) => out.blit(f, i * f.w, 0));
  return out;
}
const BGC: Col = [22, 19, 26, 255], PANEL: Col = [44, 40, 52, 255], DIM: Col = [168, 162, 180, 255], INK: Col = [236, 230, 244, 255];
const FAC_COL: Record<Fac, Col> = { solgard: c("#e8b84a"), umbrath: c("#b890ff") };
/** Сцена в масштабе игры: земля, предмет по якорю, герой 32×32 справа на той же линии земли; k — увеличение. */
function scene(a: Anim, frame: number, ground: string, k: number): PC {
  const f = a.frames[frame], ay = Math.round(a.anchor[1] * a.h), st = a.stand ?? ay;
  const pad = 6, gap = 4, heroW = 32, below = 10;
  const W = pad + a.w + gap + heroW + pad, H = Math.max(a.h, ay + below, st + below) + 4;
  const base = new PC(W, H);
  paintGround(base, 0, 0, W, H, ground);
  const gy = Math.min(H - below, ay + 4), top = gy - ay;                 // линия земли под якорем
  base.blit(f, pad, top);
  const h = hero(a.hero ?? (a.fac === "solgard" ? "warrior" : "deathknight"));
  let feet = 31; while (feet > 0 && ![...Array(32).keys()].some((x) => h.alpha(x, feet))) feet--;
  base.blit(h, pad + a.w + gap, top + st - feet);
  return scaleNN(base, k);
}
/** Знамя на мачте основания: мачта сзади, знамя (якорь — середина бруса) в точке at на оси мачты, тумба с воротом спереди. */
function onMast(base: Anim, banner: Anim, frame: number, at: [number, number] = MAST_TOP): Anim {
  const bx = Math.round(banner.anchor[0] * banner.w), by = Math.round(banner.anchor[1] * banner.h);
  const left = Math.max(0, bx - at[0]), right = Math.max(0, banner.w - bx - (base.w - at[0])), top = Math.max(0, by - at[1]);
  const W = base.w + left + right, H = base.h + top + Math.max(0, banner.h - by - (base.h - at[1]));
  const out = new PC(W, H);
  out.blit(base.frames[2], left, top);
  out.blit(banner.frames[frame], left + at[0] - bx, top + at[1] - by);
  out.blit(base.frames[1], left, top);
  return { id: `${banner.id}-on-base`, title: banner.title, frames: [out], w: W, h: H, anchor: [(left + base.w / 2) / W, (top + BASE_GY) / H], fps: 0, fac: banner.fac, hero: banner.hero };
}
/** Раскадровка: кадры ×k, по cols в ряд, номер кадра над каждым. */
function board(a: Anim, k: number, cols = a.frames.length): PC {
  const pad = 4, n = a.frames.length, cw = a.w * k + pad, ch = a.h * k + 14 + pad, rows = Math.ceil(n / cols);
  const out = new PC(Math.min(n, cols) * cw + pad, rows * ch + pad);
  fill(out, PANEL);
  a.frames.forEach((f, i) => {
    const x = pad + (i % cols) * cw, y = pad + Math.floor(i / cols) * ch + 14;
    out.rect(x, y, a.w * k, a.h * k, [30, 27, 36, 255]);
    out.blit(scaleNN(f, k), x, y);
    label(out, String(i + 1), x + 2, y - 12, DIM, 2);
  });
  return out;
}
/** Строка превью: заголовок (цвет фракции), подпись, части в ряд по нижнему краю. */
function previewRow(title: string, sub: string, col: Col, parts: PC[]): PC {
  const gap = 10, head = 30, W = parts.reduce((s, p) => s + p.w + gap, 0), H = head + Math.max(...parts.map((p) => p.h));
  const out = new PC(Math.max(W, 10), H);
  fill(out, BGC);
  label(out, title, 0, 2, col, 2);
  label(out, sub, 0, 16, DIM, 2);
  let x = 0;
  for (const p of parts) { out.blit(p, x, H - p.h); x += p.w + gap; }
  return out;
}
function stackRows(rows: PC[], gap = 18, margin = 16): PC {
  const W = Math.max(...rows.map((r) => r.w)) + margin * 2, H = rows.reduce((s, r) => s + r.h + gap, margin * 2 - gap);
  const out = new PC(W, H);
  fill(out, BGC);
  let y = margin;
  for (const r of rows) { out.blit(r, margin, y); y += r.h + gap; }
  return out;
}
const FAC_NAME: Record<Fac, string> = { solgard: "СОЛЬГАРД", umbrath: "УМБРАТ" };
const anchorPx = (a: Anim): [number, number] => [Math.round(a.anchor[0] * a.w * 10) / 10, Math.round(a.anchor[1] * a.h * 10) / 10];

// для знамён Эмберхолла (tools/gen/ember-banners.ts): те же сцены, раскадровки и строки превью
export { scene, board, previewRow, stackRows, strip, onMast, anchorPx, MAST_TOP, BGC, DIM, INK, type Anim };

/** Все штандарты задачи 130. Листы — кадры в строку, пиксель листа — пиксель мира. */
export function STANDARDS() {
  const home = [homeSolgard(), homeUmbrath()];
  const torns = [torn("solgard"), torn("umbrath")], burns = [burned("solgard"), burned("umbrath")], falls = [fallen("solgard"), fallen("umbrath")];
  const royal = [royalSolgard(), royalUmbrath()], base = captureBase();
  const walls = [pennant("solgard", false), pennant("umbrath", false), drape("solgard", true), drape("umbrath", true)];
  return { home, torns, burns, falls, royal, base, walls };
}


/** Эмблема игры: лист вариантов (logo.png, ×3) и каждый вариант ×1; итог (решение пользователя) — превью с надписью ×3 (logo-final.png),
 *  исходник ×1 (logo-final-x1.png), сравнение «вариант 1 | вариант 2 | итог» ×3 (logo-final-compare.png), «вариант 1 | итог» ×2 (logo-final-vs-1-x2.png) и эмблема без надписи для экрана
 *  загрузки — client/public/ui/logo-emblem.png: прозрачный фон, пиксель картинки = 1 px, только непрозрачные и пустые пиксели (показывать
 *  целым множителем, image-rendering: pixelated). */
function writeLogos() {
  logoSheet().save(path.join(OUT, "logo.png"));
  for (const l of LOGOS) l.draw().save(path.join(OUT, `${l.id}.png`));                  // каждый вариант ×1 — исходник для экрана загрузки
  const fin = logoFinal(true), emblem = logoFinal(false), k = 3, pad = 16;
  fin.save(path.join(OUT, "logo-final-x1.png"));
  const prev = new PC(fin.w * k + pad * 2, fin.h * k + pad * 2);
  fill(prev, BGC);
  prev.blit(scaleNN(fin, k), pad, pad);
  prev.save(path.join(OUT, "logo-final.png"));
  /** Сравнение: рисунки ×z рядом, над каждым подпись. */
  const compare = (list: { t: string; pc: PC }[], z: number, file: string) => {
    const top = pad + 30, maxH = Math.max(...list.map((p) => p.pc.h));
    const cmp = new PC(list.reduce((w, p) => w + p.pc.w * z + pad, pad), top + maxH * z + pad);
    fill(cmp, BGC);
    let x = pad;
    for (const p of list) {
      label(cmp, p.t, x, pad, INK, 2);
      cmp.blit(scaleNN(p.pc, z), x, top);
      x += p.pc.w * z + pad;
    }
    cmp.save(path.join(OUT, file));
  };
  const parts = [{ t: "1. РАСКОЛОТАЯ КОРОНА", pc: logoCrown() }, { t: "2. ДВА ЗНАМЕНИ", pc: logoBanners() }, { t: "ИТОГ: ДВА ЗНАМЕНИ, КОРОНА НА ФОНЕ ГОРОДОВ", pc: fin }];
  compare(parts, k, "logo-final-compare.png");
  compare([parts[0], parts[2]], 2, "logo-final-vs-1-x2.png");                          // «вариант 1 | итог» ×2 — как на экране загрузки при ×2
  for (let i = 3; i < emblem.data.length; i += 4) if (emblem.data[i] && emblem.data[i] < 255) throw new Error("logo-emblem: полупрозрачный пиксель");
  emblem.save(path.join(ROOT, "client/public/ui/logo-emblem.png"));
}

// ---------------------------------------------------------------- превью редизайна висящих знамён (--redesign → tools/out/banners-redesign/)
//  Кадры игры: tools/out/banners-world/thin-*-s-day.png (зум 2, нижняя половина — текущее состояние). Старые знамёна стираются чистым
//  спрайтом ворот и башен (с подбором дневного освещения кадра), новые кладутся по тем же точкам крепления; штандарты у входа остаются.
const RED_OUT = path.join(ROOT, "tools/out/banners-redesign");
/** Сцена: кадр, ворота и угловые башни (левый верх спрайта ×2 в кадре, подобрано по рисунку), рамка вырезки. */
const RED_SCENES: Record<Fac, { shot: string; city: string; gate: [number, number]; towers: [number, number][]; crop: [number, number, number, number] }> = {
  solgard: { shot: "thin-aurelion-s-day.png", city: "АУРЕЛИОН", gate: [704, 1389], towers: [[576, 1364], [896, 1364]], crop: [400, 1320, 800, 400] },
  umbrath: { shot: "thin-morthaim-s-day.png", city: "МОРТХЕЙМ", gate: [704, 1389], towers: [[576, 1364], [896, 1364]], crop: [400, 1320, 800, 400] },
};
/** Уточнить положение спрайта ×2 в кадре: перебор ±r по сумме разностей непрозрачных пикселей. */
function locate(shot: PC, spr: PC, hint: [number, number], r = 3): [number, number] {
  let best = Infinity, at = hint;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    let s = 0;
    for (let y = 0; y < spr.h; y += 2) for (let x = 0; x < spr.w; x += 2) {
      const q = spr.get(x, y)!;
      if (q[3] < 255) continue;
      const p = shot.get(hint[0] + dx + x * 2, hint[1] + dy + y * 2);
      if (p) s += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    }
    if (s < best) { best = s; at = [hint[0] + dx, hint[1] + dy]; }
  }
  return at;
}
/** Освещение кадра: по каналу shot = a·src + b (наименьшие квадраты по непрозрачным пикселям спрайта вне вырезов). */
function fitLight(shot: PC, items: { spr: PC; at: [number, number]; skip: (x: number, y: number) => boolean }[]) {
  const S = [0, 0, 0].map(() => ({ n: 0, x: 0, y: 0, xx: 0, xy: 0 }));
  for (const { spr, at, skip } of items) for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    const q = spr.get(x, y)!;
    if (q[3] < 255 || skip(x, y)) continue;
    const p = shot.get(at[0] + x * 2, at[1] + y * 2);
    if (!p) continue;
    for (let k = 0; k < 3; k++) { const s = S[k]; s.n++; s.x += q[k]; s.y += p[k]; s.xx += q[k] * q[k]; s.xy += q[k] * p[k]; }
  }
  const ab = S.map((s) => { const a = (s.n * s.xy - s.x * s.y) / (s.n * s.xx - s.x * s.x); return [a, (s.y - a * s.x) / s.n]; });
  return (c0: Col): Col => [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round(ab[k][0] * c0[k] + ab[k][1])))).concat(c0[3]) as Col;
}
/** Кадр знамени ×2 в точке крепления (мир ×2), со светом сцены. */
function pasteBanner(dst: PC, a: Anim, frame: number, attach: [number, number], light: (c0: Col) => Col) {
  const f = a.frames[frame], ax = Math.round(a.anchor[0] * a.w), ay = Math.round(a.anchor[1] * a.h);
  const x0 = attach[0] - ax * 2, y0 = attach[1] - ay * 2;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const q = f.get(x, y)!;
    if (!q[3]) continue;
    const lit = light(q);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) dst.set(x0 + x * 2 + i, y0 + y * 2 + j, lit);
  }
}
/** Подготовленная сцена фракции: кадр без старых настенных знамён, точки крепления, свет. */
function redesignScene(fac: Fac) {
  const sc = RED_SCENES[fac], k = fac === "solgard" ? "sol" : "umb";
  const shot = readPng(path.join(ROOT, "tools/out/banners-world", sc.shot));
  const gateSpr = readPng(path.join(ROOT, `client/public/assets/objects/${k}_gate.png`));
  const towSpr = readPng(path.join(ROOT, `client/public/assets/objects/${k}_tower.png`));
  const gate = locate(shot, gateSpr, sc.gate), towers = sc.towers.map((t) => locate(shot, towSpr, t));
  // крепление (мир): ворота — 86 px над основанием, башня — 44 px (как std-gate-*/std-wall-* в tools/gen/standards-to-game.ts)
  const gAttach: [number, number] = [gate[0] + gateSpr.w, gate[1] + gateSpr.h * 2 - 86 * 2];
  const tAttach = towers.map((t): [number, number] => [t[0] + towSpr.w, t[1] + towSpr.h * 2 - 44 * 2]);
  // прямоугольники старых знамён в мире ×2 (кадр 46×47 / 42×41, брус на 2 px ниже верха кадра) и в координатах спрайта
  const oldG = { x: gAttach[0] - 46, y: gAttach[1] - 4, w: 92, h: 94 }, oldT = tAttach.map((t) => ({ x: t[0] - 42, y: t[1] - 4, w: 84, h: 82 }));
  const inR = (r: { x: number; y: number; w: number; h: number }, X: number, Y: number) => X >= r.x && Y >= r.y && X < r.x + r.w && Y < r.y + r.h;
  const light = fitLight(shot, [
    { spr: gateSpr, at: gate, skip: (x, y) => inR(oldG, gate[0] + x * 2, gate[1] + y * 2) },
    ...towers.map((t, i) => ({ spr: towSpr, at: t, skip: (x: number, y: number) => inR(oldT[i], t[0] + x * 2, t[1] + y * 2) })),
  ]);
  const clean = shot.clone();
  const erase = (spr: PC, at: [number, number], r: { x: number; y: number; w: number; h: number }) => {
    for (let Y = r.y; Y < r.y + r.h; Y++) for (let X = r.x; X < r.x + r.w; X++) {
      const q = spr.get(Math.floor((X - at[0]) / 2), Math.floor((Y - at[1]) / 2));
      if (q && q[3] === 255) clean.set(X, Y, light(q));
      else if (q) { const p = shot.get(X, r.y + r.h + 2 + ((Y - r.y) % 8)); if (p) clean.set(X, Y, p); }   // проём арки: брусчатка снизу
    }
  };
  erase(gateSpr, gate, oldG);
  towers.forEach((t, i) => erase(towSpr, t, oldT[i]));
  return { sc, shot, clean, light, gAttach, tAttach };
}
/** Вырезка сцены ×2 с вариантом знамён (кадр frame); v = null — текущее состояние. */
function redesignPanel(s: ReturnType<typeof redesignScene>, set: { wall: Anim; gate: Anim } | null, frame: number): PC {
  const [cx, cy, cw, ch] = s.sc.crop;
  if (!set) return crop(s.shot, cx, cy, cw, ch);
  const pc = s.clean.clone();
  pasteBanner(pc, set.gate, frame, s.gAttach, s.light);
  for (const t of s.tAttach) pasteBanner(pc, set.wall, frame, t, s.light);
  return crop(pc, cx, cy, cw, ch);
}

// ---- минимальный кодировщик GIF89a (палитра до 256 цветов на ролик, LZW, повтор бесконечно)
function encodeGif(frames: PC[], delayCs: number): Buffer {
  const W = frames[0].w, H = frames[0].h;
  // палитра: частоты цветов по 5 бит на канал, 256 самых частых; пиксель → ближайший цвет палитры
  const freq = new Map<number, number>();
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) {
    const key = ((f.data[i] >> 3) << 10) | ((f.data[i + 1] >> 3) << 5) | (f.data[i + 2] >> 3);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const pal = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k0]) => [((k0 >> 10) & 31) * 8 + 4, ((k0 >> 5) & 31) * 8 + 4, (k0 & 31) * 8 + 4]);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const near = new Map<number, number>();
  const idxOf = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = near.get(key);
    if (v === undefined) {
      let best = Infinity; v = 0;
      const R0 = (r >> 3) * 8 + 4, G0 = (g >> 3) * 8 + 4, B0 = (b >> 3) * 8 + 4;
      for (let i = 0; i < 256; i++) { const d = (pal[i][0] - R0) ** 2 + (pal[i][1] - G0) ** 2 + (pal[i][2] - B0) ** 2; if (d < best) { best = d; v = i; } }
      near.set(key, v);
    }
    return v;
  };
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  for (const ch of "GIF89a") out.push(ch.charCodeAt(0));
  u16(W); u16(H); out.push(0xf7, 0, 0);
  for (const p of pal) out.push(p[0], p[1], p[2]);
  out.push(0x21, 0xff, 11, ..."NETSCAPE2.0".split("").map((ch) => ch.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0); u16(delayCs); out.push(0, 0);
    out.push(0x2c); u16(0); u16(0); u16(W); u16(H); out.push(0, 8);
    const idx = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) idx[i] = idxOf(f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]);
    // LZW
    const bytes: number[] = [];
    let cur = 0, nbits = 0, size = 9, next = 258;
    const emit = (code: number) => { cur |= code << nbits; nbits += size; while (nbits >= 8) { bytes.push(cur & 255); cur >>>= 8; nbits -= 8; } };
    let dict = new Map<number, number>();
    emit(256);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const kk = idx[i], key = prefix * 256 + kk, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(256); dict = new Map(); size = 9; next = 258; }
      else { if (next >= 1 << size) size++; dict.set(key, next++); }
      prefix = kk;
    }
    emit(prefix); emit(257);
    if (nbits > 0) bytes.push(cur & 255);
    for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); }
    out.push(0);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

function writeRedesign() {
  fs.mkdirSync(RED_OUT, { recursive: true });
  const R = REDESIGN(), facs: Fac[] = ["solgard", "umbrath"], vars: Variant[] = ["A", "B", "C"];
  const VNAME: Record<Variant, string> = { A: "А — ВЫМПЕЛ С ЛАСТОЧКИНЫМ ХВОСТОМ", B: "В — ДРАПИРОВКА С ФЕСТОНАМИ И КИСТЯМИ", C: "С — ЛЕНТА С МЕДАЛЬОНОМ НА КОЛЬЦАХ" };
  const meta: Record<string, object> = {};
  // листы кадров (пиксель листа — пиксель мира) и раскадровки ×3
  for (const v of vars) {
    const rows: PC[] = [];
    for (const fac of facs) for (const kind of ["wall", "gate"] as const) {
      const a = R[v][kind][fac];
      strip(a.frames).save(path.join(RED_OUT, `${a.id}.png`));
      meta[a.id] = { file: `${a.id}.png`, frameW: a.w, frameH: a.h, frames: a.frames.length, fps: a.fps, anchor: anchorPx(a), faction: fac, variant: v, kind };
      rows.push(previewRow(`${FAC_NAME[fac]} — ${a.title}`, `${a.w}×${a.h}, ${a.frames.length} КАДРОВ, ${a.fps} К/С, ТЕНЬ НА СТЕНЕ В КАДРЕ`, FAC_COL[fac], [board(a, 3, 12)]));
    }
    stackRows(rows).save(path.join(RED_OUT, `sheet-${v}.png`));
  }
  fs.writeFileSync(path.join(RED_OUT, "sheets.json"), JSON.stringify({ stage: "редизайн висящих знамён, этап 1 (превью)", cycle: { frames: N, fps: FPS }, sheets: meta }, null, 1));
  // сравнение на воротах столиц: СЕЙЧАС | А | В | С, по строке на фракцию
  const scenes = { solgard: redesignScene("solgard"), umbrath: redesignScene("umbrath") };
  const gap = 12, head = 26, [, , cw, ch] = RED_SCENES.solgard.crop;
  const W = gap + 4 * (cw + gap), H = 40 + 2 * (head + ch + gap) + gap;
  const sheetPc = new PC(W, H);
  fill(sheetPc, BGC);
  label(sheetPc, "ВИСЯЩИЕ ЗНАМЁНА — ВАРИАНТЫ (ЭТАП 1, В ИГРУ НЕ СТАВИЛИСЬ). ЗУМ 2, ДЕНЬ; ШТАНДАРТЫ У ВХОДА — КАК В ИГРЕ", gap, 10, INK, 2);
  facs.forEach((fac, r) => {
    const y = 40 + r * (head + ch + gap);
    const cols: [string, { wall: Anim; gate: Anim } | null][] = [["СЕЙЧАС", null], ...vars.map((v): [string, { wall: Anim; gate: Anim }] => [VNAME[v], { wall: R[v].wall[fac], gate: R[v].gate[fac] }])];
    cols.forEach(([t, set], i) => {
      const x = gap + i * (cw + gap);
      label(sheetPc, `${scenes[fac].sc.city}: ${t}`, x, y + 6, set ? FAC_COL[fac] : DIM, 2);
      sheetPc.blit(redesignPanel(scenes[fac], set, 0), x, y + head);
    });
  });
  sheetPc.save(path.join(RED_OUT, "variants.png"));
  // ролик на вариант: Аурелион | Мортхейм, ворота с башнями крупно, 12 кадров, 12 к/с (8 сотых — ближайшее в GIF)
  for (const v of vars) {
    const frames: PC[] = [];
    for (let t = 0; t < N; t++) {
      const parts = facs.map((fac) => crop(redesignPanel(scenes[fac], { wall: R[v].wall[fac], gate: R[v].gate[fac] }, t), 140, 30, 520, 340));
      const f = new PC(parts[0].w * 2 + gap * 3, parts[0].h + head + gap);
      fill(f, BGC);
      label(f, VNAME[v], gap, 8, INK, 2);
      parts.forEach((p, i) => f.blit(p, gap + i * (p.w + gap), head));
      frames.push(f);
    }
    fs.writeFileSync(path.join(RED_OUT, `variant-${v}.gif`), encodeGif(frames, 8));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // --redesign — только превью вариантов висящих знамён (tools/out/banners-redesign/), листы штандартов не пишутся
  if (process.argv.includes("--redesign")) { writeRedesign(); console.log(RED_OUT); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  // --logo — только эмблема игры (варианты, итог и эмблема для экрана загрузки), без листов штандартов
  if (process.argv.includes("--logo")) { writeLogos(); console.log(OUT); process.exit(0); }
  for (const f of ["_debug.png", "_debug_capture.png"]) fs.rmSync(path.join(OUT, f), { force: true });   // черновые листы прошлого прогона
  const { home, torns, burns, falls, royal, base, walls } = STANDARDS();
  const meta: Record<string, object> = {};
  const save = (a: Anim, extra: object = {}) => {
    strip(a.frames).save(path.join(OUT, `${a.id}.png`));
    meta[a.id] = { file: `${a.id}.png`, frameW: a.w, frameH: a.h, frames: a.frames.length, fps: a.fps, loop: a.fps > 0, anchor: anchorPx(a), faction: a.fac, title: a.title, ...extra };
  };
  for (const a of home) save(a, { note: "якорь — низ подтока (точка на земле)" });
  for (const a of [...torns, ...burns]) save(a, { note: "без основания; якорь — низ подтока" });
  for (const a of walls) save(a, { note: "висящее, без древка: вымпел (башни) и драпировка (над воротами); якорь — точка крепления к стене (крюк вымпела, верх прутка драпировки); тень на стене в кадре" });
  for (const a of falls) {
    save(a, { note: "сборка: земля + обломок; в игре — два слоя", layers: { ground: `${a.id}-ground.png`, stump: `${a.id}-stump.png` } });
    a.ground.save(path.join(OUT, `${a.id}-ground.png`));
    strip(a.stump).save(path.join(OUT, `${a.id}-stump.png`));
  }
  for (const a of royal) save(a, { note: "знамя без основания; якорь — муфта на брусе, ставится на ось мачты (capture-base: mastLow → mastTop)" });
  strip(base.frames).save(path.join(OUT, `${base.id}.png`));
  meta[base.id] = {
    file: `${base.id}.png`, frameW: base.w, frameH: base.h, frames: 3, fps: 0, anchor: anchorPx(base),
    layers: ["0 — целиком", "1 — тумба с воротом (спереди знамени)", "2 — мачта с цепью и шкивом (за знаменем)"], mastTop: MAST_TOP, mastLow: MAST_LOW,
    title: base.title,
  };
  fs.writeFileSync(path.join(OUT, "sheets.json"), JSON.stringify({ task: 130, cycle: { frames: N, fps: FPS }, sheets: meta }, null, 1));

  // ---- превью: сцена ×2 и ×3 с героем 32×32 на земле, раскадровка ×2
  const rows: PC[] = [];
  const head = new PC(1200, 34);
  fill(head, BGC);
  label(head, "ШТАНДАРТЫ МИРА — ЗАДАЧА 130", 0, 0, INK, 3);
  label(head, "ПИКСЕЛЬ ЛИСТА = ПИКСЕЛЬ МИРА. СЦЕНА ×2 И ×3 С ГЕРОЕМ 32×32, РАСКАДРОВКА ×2. ЦИКЛ 12 КАДРОВ, 12 К/С.", 0, 22, DIM, 2);
  rows.push(head);
  const animRow = (a: Anim, ground: string, what: string, cols?: number) => {
    const k = a.frames.length > 1 ? 3 : 0;
    rows.push(previewRow(`${FAC_NAME[a.fac]} — ${what}`, `${a.w}×${a.h}, ${a.frames.length} КАДРОВ, ${a.fps} К/С`,
      FAC_COL[a.fac], [scene(a, k, ground, 2), scene(a, k, ground, 3), board(a, 2, cols)]));
  };
  for (const a of home) animRow(a, "grass", "ШТАНДАРТ СВОИХ ЗЕМЕЛЬ");
  for (const a of walls) rows.push(previewRow(`${FAC_NAME[a.fac]} — ${a.title}`, `${a.w}×${a.h}, ${a.frames.length} КАДРОВ, ${a.fps} К/С`,
    FAC_COL[a.fac], [board({ ...a, frames: [a.frames[0]] }, 4), board(a, 2)]));
  for (const a of torns) animRow(a, "dirt", "СПОРНЫЕ ЗЕМЛИ: ПОРВАННЫЙ, В СТРЕЛАХ");
  for (const a of burns) animRow(a, "dirt", "СПОРНЫЕ ЗЕМЛИ: ОБГОРЕВШИЙ");
  for (const a of falls) animRow(a, "dirt", "СПОРНЫЕ ЗЕМЛИ: СЛОМАННЫЙ В ГРЯЗИ, С ПАВШИМ", 6);
  // захват: пустое основание (слои), королевские знамёна наверху мачты, знамя едет по мачте
  rows.push(previewRow("ОСНОВАНИЕ ЗАХВАТА (ОДНО НА ОБЕ ФРАКЦИИ)", `${base.w}×${base.h}, ЛИСТ ОТДЕЛЬНО ОТ ЗНАМЕНИ: ЦЕЛИКОМ, ТУМБА, МАЧТА`, INK,
    [scene(base, 0, "dirt", 2), scene(base, 0, "dirt", 3), board(base, 2)]));
  for (const a of royal) {
    const top = onMast(base, a, 3);
    rows.push(previewRow(`${FAC_NAME[a.fac]} — ${a.title}`, `ЗНАМЯ ${a.w}×${a.h}, ${a.frames.length} КАДРОВ, ${a.fps} К/С; НА МАЧТЕ ОСНОВАНИЯ`, FAC_COL[a.fac],
      [scene(top, 0, "dirt", 2), scene(top, 0, "dirt", 3), board(a, 2, 6)]));
  }
  {
    const at = (a: Anim, f: number, y: number) => scene(onMast(base, a, f, [MAST_TOP[0], y]), 0, "dirt", 2);
    const mid = Math.round((MAST_TOP[1] + MAST_LOW[1]) / 2);
    rows.push(previewRow("ЗНАМЯ ЕДЕТ ПО МАЧТЕ (ПОДЪЁМ — ПОЗЖЕ, ЗАДАЧА 84)", "ВНИЗУ, НА СЕРЕДИНЕ, НАВЕРХУ: ЯКОРЬ ЗНАМЕНИ НА ОСИ МАЧТЫ", INK,
      [at(royal[0], 0, MAST_LOW[1]), at(royal[0], 4, mid), at(royal[1], 8, mid), at(royal[1], 2, MAST_TOP[1])]));
  }
  stackRows(rows).save(path.join(OUT, "preview.png"));
  writeLogos();
  console.log(OUT);
}
