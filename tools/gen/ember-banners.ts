/** Знамёна Эмберхолла (нейтральный город, стража — Пепельнорождённые; data/ember-guard.json banners): как у фракций
 *  (tools/gen/standards.ts — штандарт своих земель и королевские знамёна захвата), но чуть богаче — густое бронзовое шитьё с бирюзой,
 *  навершие, бахрома и кисти; эмблема — пламя очага над наковальней. Два знамени: штандарт города (висит на стенах и воротах: брус
 *  на крюке, якорь — крюк) и знамя знаменосца стражи (древко, якорь — низ подтока, хват — grip). Два варианта на выбор:
 *  1 «Горн» — бирюзовое поле в бронзовой раме с бирюзовыми кабошонами, прямой низ с бахромой, навершие — наковальня с пламенем;
 *  2 «Жаровня» — бронзовая парча в главе над алой выпушкой, герб в бронзовом медальоне, низ тремя языками с кистями,
 *  навершие — жаровня с живым огнём и искрами. Ветер — модель штандартов (windCloth, 12 кадров, 12 к/с), огонь — плавно (easing).
 *  Запуск: npx tsx tools/gen/ember-banners.ts → tools/out/standards/ember-banners.png (сравнение с фракционными), листы ember-*.png,
 *  ember-banners.json (кадры, якоря). В игру — выбранный вариант 2 «Жаровня»: npm run assets → writeEmberBannersGame (vfx ember-std, ember-bearer). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hex, OUTLINE, type RGBA } from "./canvas";
import { P } from "./palette";
import EMBER from "../../data/ember-guard.json";
import {
  WIND_FRAMES as N, WIND_FPS as FPS, windPlan, windCloth, toneFn, clothTex, distMap, stamp, layer, WIND_HOME, type Wind,
  homeSolgard, homeUmbrath, royalSolgard, royalUmbrath, captureBase, scene, board, previewRow, stackRows, strip, onMast, anchorPx,
  scaleNN, paintGround, label, readPng, crop, BGC, DIM, INK, type Anim,
} from "./standards";

type Col = RGBA;
const c = (s: string) => hex(s);
const TAU = Math.PI * 2;
const BR = ["#3a2210", "#6a4218", "#9a6428", "#c88a40", "#f0b860", "#fff0c0"].map(c);       // бронза (тёмн. → блик)
const TQ = ["#0e2a28", "#1e4a46", "#2e6e66", "#3f9a8c", "#6fd0bc", "#bff4e6"].map(c);       // бирюза
const FI = ["#7a1c10", "#c23a12", "#f06a1a", "#ffb03a", "#ffe88a", "#fff6d0"].map(c);       // огонь очага (светится — складки не затеняют)
const RED = ["#3a0e0c", "#6a1c16", "#9a2e1e", "#c84a2a"].map(c);                            // алая выпушка
const EOUT = c("#2a1608");                                                                   // контур бронзы и эмблемы
const WOOD = P.wood;
const TONE = toneFn([TQ, BR, RED, WOOD], [EOUT, OUTLINE, ...FI]);
const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const hash = (a: number, b: number) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------- эмблема: пламя очага над наковальней
/** Язык пламени: капля, широкая внизу, кончик загибается по ветру (lean); цвет по расстоянию до края — красный край, оранжевый,
 *  жёлтый, у основания — светлое ядро. Возвращает маску-рисунок W×H (без контура). */
function flameShape(W: number, H: number, lean = 0.6, tongues = true): PC {
  const pc = new PC(W, H), cx = W / 2, wmax = W * 0.42;
  const inMain = (x: number, y: number) => {
    const t = (y + 0.5) / H;                                                  // 0 — кончик, 1 — основание
    const hw = t < 0.7 ? wmax * Math.pow(t / 0.7, 0.75) : wmax * (1 - 0.45 * Math.pow((t - 0.7) / 0.3, 2));
    const sx = cx + lean * 2.2 * Math.pow(1 - t, 2);
    return Math.abs(x + 0.5 - sx) <= hw;
  };
  const inTongue = (x: number, y: number, tx: number, top: number, w: number) => {
    const t = (y + 0.5 - top) / (H - top);
    if (t < 0 || t > 1) return false;
    const hw = w * Math.pow(t, 0.8) * (1 - 0.4 * t);
    return Math.abs(x + 0.5 - tx - (1 - t) * (tx < cx ? -0.8 : 0.8)) <= hw;
  };
  const inside = (x: number, y: number) => inMain(x, y) || (tongues && (inTongue(x, y, cx - W * 0.3, H * 0.4, W * 0.16) || inTongue(x, y, cx + W * 0.3, H * 0.48, W * 0.14)));
  const d = distMap(W, H, inside);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = d[y * W + x];
    if (!k) continue;
    const core = y > H * 0.55 && Math.abs(x + 0.5 - cx) < W * 0.14 && k >= 3;
    pc.set(x, y, core ? FI[5] : k === 1 ? FI[1] : k === 2 ? FI[2] : k === 3 ? FI[3] : FI[4]);
  }
  return pc;
}
/** Наковальня W×h: рог влево, плоская лицевая грань (блик), талия, широкая стопа; свет сверху слева. */
function anvil(W: number, h: number): PC {
  const pc = new PC(W, h);
  const rows: [number, number][] = [];                                        // [от, до] в долях ширины
  for (let j = 0; j < h; j++) {
    const t = j / (h - 1);
    rows.push(t < 0.2 ? [0, 0.94] : t < 0.36 ? [0.14, 0.9] : t < 0.62 ? [0.34, 0.68] : t < 0.8 ? [0.22, 0.8] : [0.1, 0.9]);
  }
  rows.forEach(([a, b], j) => {
    const x0 = Math.round(a * (W - 1)), x1 = Math.round(b * (W - 1));
    for (let x = x0; x <= x1; x++) {
      const top = j === 0 || (j > 0 && (x < Math.round(rows[j - 1][0] * (W - 1)) || x > Math.round(rows[j - 1][1] * (W - 1))));
      const col = top ? (x < W * 0.6 ? BR[5] : BR[4]) : x === x0 ? BR[3] : x >= x1 - 1 ? BR[1] : j >= h - 2 ? BR[2] : BR[3];
      pc.set(x, j, col);
    }
  });
  // рог — по нижней кромке темнее
  for (let x = 0; x < W * 0.14; x++) if (pc.alpha(x, 1)) pc.set(x, 1, BR[2]);
  return pc;
}
/** Эмблема «Пламя очага над наковальней»: пламя стоит на лицевой грани наковальни, контур — тёмная бронза. */
function emberEmblem(W: number, H: number): PC {
  const ah = Math.max(5, Math.round(H * 0.32)), fh = H - ah + 1;
  const pc = new PC(W + 2, H + 2);
  const fl = flameShape(W - 4, fh, 0.6), an = anvil(W, ah);
  pc.blit(fl, 3, 1);
  pc.blit(an, 1, 1 + H - ah);
  pc.outline(EOUT);
  return pc;
}

// ---------------------------------------------------------------- шитьё, кабошоны, кисти, навершия
/** Бирюзовый кабошон 2×2 / 3×3 в бронзе. */
function tqGem(l: PC, x: number, y: number, big = false) {
  if (big) stamp(l, x, y, ["hAa", "Aad", "add"], { h: TQ[5], A: TQ[4], a: TQ[3], d: TQ[1] });
  else stamp(l, x, y, ["Aa", "ad"], { A: TQ[4], a: TQ[3], d: TQ[1] });
}
/** Шар торца бруса: бирюза 5×5 в бронзовой оправе. */
function tqKnob(l: PC, x: number, y: number) {
  stamp(l, x, y, [".gGg.", "gAAag", "GAhad", "gaadg", ".ggh."], { h: TQ[5], A: TQ[4], a: TQ[3], d: TQ[1], G: BR[4], g: BR[2] });
}
const TASSEL = ["..g..", "..g..", ".gYg.", ".GgG.", ".hgh.", ".GgG.", "GgGgh", "GgGgh", "gGgGh", "hh.hh"];
const TASSEL_S = ["..g..", ".gYg.", ".GgG.", "GgGgh", "gGgGh", "hh.hh"];
const BRL = { Y: BR[5], G: BR[4], g: BR[2], h: BR[1] };
/** Кайма-валик густого бронзового шитья шириной bw: наружный скат на свету у верхней и левой сторон, внутренний в тени. */
function bronzeBorder(x: number, y: number, d: number, w: number, h: number, bw: number): Col | null {
  const lit = Math.min(x, y) <= Math.min(w - 1 - x, h - 1 - y);
  if (bw >= 4) {
    if (d === 1) return lit ? BR[2] : BR[1];
    if (d === 2) return lit ? BR[5] : BR[3];
    if (d === bw - 1) return BR[4];
    if (d === bw) return lit ? BR[1] : BR[4];
    if (d < bw) return BR[3];
    if (d === bw + 1) return TQ[1];
    return null;
  }
  if (d === 1) return lit ? BR[2] : BR[1];
  if (d === 2) return lit ? BR[5] : BR[3];
  if (d === 3) return lit ? BR[1] : BR[4];
  if (d === 4) return TQ[1];
  return null;
}
/** Живое пламя навершия (жаровня варианта 2): высота и снос кончика дышат по easeInOutSine, искры взлетают (easeOutCubic) и гаснут. */
function liveFlame(l: PC, cx: number, by: number, t: number, w = 7, h = 9) {
  const u = t / N, br = easeInOutSine(0.5 - 0.5 * Math.cos(TAU * u));
  const hh = Math.round(h - 1 + 2 * br), lean = 0.9 * Math.sin(TAU * u + 0.6);
  const fl = flameShape(w, hh, lean, false);
  l.blit(fl, cx - Math.floor(w / 2), by - hh + 1);
  for (let i = 0; i < 3; i++) {
    const p = ((u + i / 3) % 1), e = easeOutCubic(p);
    const x = Math.round(cx + (i - 1) * 2 + 1.2 * Math.sin(TAU * p + i)), y = Math.round(by - hh - 1 - e * 9);
    if (p < 0.75) l.set(x, y, p < 0.3 ? FI[4] : p < 0.55 ? FI[3] : FI[2]);
  }
}
/** Навершие варианта 1: бронзовая наковальня с пламенем (пламя чуть дышит — кончик на 1 px). */
function finialAnvil(l: PC, cx: number, by: number, t: number) {
  const av = anvil(11, 5);
  l.blit(av, cx - 5, by - 5);
  const u = t / N, hh = 7 + Math.round(easeInOutSine(0.5 - 0.5 * Math.cos(TAU * u)));
  l.blit(flameShape(7, hh, 0.5 * Math.sin(TAU * u), false), cx - 3, by - 5 - hh + 1);
}
/** Навершие варианта 2: жаровня на ножке — бронзовая чаша с бирюзовым поясом, в ней живой огонь. */
function finialBrazier(l: PC, cx: number, by: number, t: number) {
  stamp(l, cx - 5, by - 6, ["GGGGGGGGGGg", "gAAaAAaAAad", ".gGGGGGGgh.", "..hgggggh..", "....gGh....", "...gGGgh..."], { G: BR[4], g: BR[2], h: BR[1], A: TQ[4], a: TQ[3], d: TQ[1] });
  liveFlame(l, cx, by - 7, t, 7, 9);
}

// ---------------------------------------------------------------- сборка
interface Spec {
  id: string; title: string; v: 1 | 2; kind: "city" | "bearer";
  CW: number; CH: number;
}
const CITY_WIND: Wind = { ...WIND_HOME, lean: 0.25, sway: 1.25, lag: 7, slant: 0, f0: 0.02, f1: 0.32, lightT: 0.6, darkT: 0.25, deepT: 0.75, embT: 0.8, rip: N, ripT: 0.45, fieldD: 6, stiff: 4 };
const BEARER_WIND: Wind = { ...WIND_HOME, f0: 0.03, f1: 0.4, embT: 0.8, fieldD: 5, stiff: 3 };

/** Полотнище варианта: маска (низ), рисунок поля, место эмблемы; кабошоны кладутся поверх текстуры. */
function cloth(s: Spec) {
  const { CW, CH, v } = s, city = s.kind === "city";
  const notch = city ? 8 : 6;
  // низ: вариант 1 — прямой (бахрома ниже); вариант 2 — три языка (два выреза-угла)
  const tongueBottom = (x: number) => {
    if (v === 1) return CH - 1;
    // вырезы — между языками: на 1/3 и 2/3 ширины, глубина notch
    const k = CW / 3;
    let cut = 0;
    for (const cxN of [k, 2 * k]) cut = Math.max(cut, notch - Math.abs(x + 0.5 - cxN) * (notch / (k / 2)));
    return CH - 1 - Math.round(Math.max(0, cut));
  };
  const inside = (x: number, y: number) => y <= tongueBottom(x);
  const bw = city ? (v === 1 ? 5 : 4) : (v === 1 ? 4 : 3);
  const chief = v === 2 ? (city ? 11 : 8) : 0;
  const gems: [number, number, boolean][] = [];
  if (v === 1) {
    const step = city ? 8 : 7;
    for (let gx = step; gx < CW - step / 2; gx += step) gems.push([gx - 1, 1, false]);
    for (let gy = step + 2; gy < CH - step; gy += step) gems.push([1, gy, false], [CW - 3, gy, false]);
    if (city) gems.push([0, 0, true], [CW - 3, 0, true], [0, CH - 3, true], [CW - 3, CH - 3, true]);
  }
  const gemSet = new Set<number>();
  for (const [gx, gy, big] of gems) for (let j = 0; j < (big ? 3 : 2); j++) for (let i = 0; i < (big ? 3 : 2); i++) gemSet.add((gy + j) * CW + gx + i);
  const d0 = distMap(CW, CH, (x, y) => (v === 1 ? true : y <= tongueBottom(x)));
  const tex = clothTex(CW, CH, inside, (x, y) => {
    if (gemSet.has(y * CW + x)) return null;
    const d = d0[y * CW + x] || 99;
    const b = bronzeBorder(x, y, d, CW, CH, bw);
    if (b) return b;
    if (v === 2 && y < chief) {
      // глава — бронзовая парча: ромбическая сетка светлой нити с шагом 4 по тёмной бронзе
      if (y === chief - 1) return RED[2];
      if (y === chief - 2) return RED[1];
      const a = (x + y) % 4 === 0, q = (x - y + 400) % 4 === 0;
      return a && q ? BR[4] : a || q ? BR[3] : BR[2];
    }
    // поле — бирюзовый дамаст: светлые крестики шитья с шагом 6 (в шахматном порядке), чтобы поле не было пустым
    const gx = (x + (Math.floor(y / 6) % 2) * 3) % 6, gy = y % 6;
    if ((gx === 3 && gy >= 2 && gy <= 4) || (gy === 3 && gx >= 2 && gx <= 4)) return gx === 3 && gy === 3 ? TQ[3] : TQ[3];
    return TQ[2];
  });
  for (const [gx, gy, big] of gems) tqGem(tex, gx, gy, big);
  // эмблема: вариант 1 — на поле; вариант 2 — в бронзовом медальоне под главой
  const EW = city ? 20 : 13, EH = city ? 24 : 16;
  let em = emberEmblem(EW, EH);
  if (v === 2) {
    const R = Math.ceil(Math.max(em.w, em.h) / 2) + 2, md = new PC(2 * R + 1, 2 * R + 1);
    for (let y = 0; y < md.h; y++) for (let x = 0; x < md.w; x++) {
      const r = Math.hypot(x - R, y - R);
      if (r > R + 0.3) continue;
      const lit = x + y < 2 * R;
      md.set(x, y, r > R - 0.9 ? (lit ? BR[3] : BR[1]) : r > R - 1.9 ? (lit ? BR[5] : BR[3]) : r > R - 2.6 ? EOUT : TQ[1]);
    }
    md.blit(em, Math.round((md.w - em.w) / 2), Math.round((md.h - em.h) / 2));
    em = md;
  }
  const ex = Math.round((CW - em.w) / 2), ey = v === 2 ? chief + 1 : (city ? 9 : 6);
  // поле под эмблемой — без дамаста (рисунок читается)
  for (let y = 0; y < em.h; y++) for (let x = 0; x < em.w; x++) if (em.alpha(x, y) || em.alpha(x - 1, y) || em.alpha(x + 1, y) || em.alpha(x, y - 1) || em.alpha(x, y + 1)) {
    const q = tex.get(ex + x, ey + y);
    if (q && q[3] && (q[0] === TQ[3][0] && q[1] === TQ[3][1] && q[2] === TQ[3][2])) tex.set(ex + x, ey + y, TQ[2]);
  }
  return { tex, emb: { pc: em, x: ex, y: ey }, bottom: tongueBottom };
}

function build(s: Spec): Anim & { grip?: number } {
  const { CW, CH, v } = s, city = s.kind === "city";
  const { tex, emb, bottom } = cloth(s);
  const wind = city ? CITY_WIND : BEARER_WIND;
  const plan = windPlan(tex, wind);
  const FW = CW + 28, X0 = 14;
  const BAR = city ? 20 : 15, Y0 = BAR + 4, poleX = X0 + Math.round(CW / 2) - 2;
  const tail = v === 1 ? 7 : 11;                                                 // бахрома / кисти под полотнищем
  const GY = city ? 0 : Y0 + CH + tail + 22;
  const FH = city ? Y0 + CH + tail + 2 : GY + 3;
  const frames: PC[] = [];
  const bottomRow = (u: number) => Math.min(CH - 1, bottom(u));
  for (let t = 0; t < N; t++) {
    const f = new PC(FW, FH);
    // древко знаменосца: тёмное дерево с бронзовыми кольцами, подток бронзовый
    if (!city) layer(f, (l) => {
      for (let y = BAR - 3; y <= GY - 4; y++) { l.set(poleX, y, WOOD[3]); l.set(poleX + 1, y, WOOD[2]); l.set(poleX + 2, y, WOOD[2]); l.set(poleX + 3, y, WOOD[1]); }
      for (const by of [Y0 + CH + 6, GY - 16]) stamp(l, poleX - 1, by, ["gYGGgh", "hggghh"], BRL);
      stamp(l, poleX, GY - 3, ["GYGg", "GGgh", ".gh.", ".h.."], BRL);
    }, EOUT);
    const co = windCloth(tex, emb, t, wind, TONE);
    co.L.outline(OUTLINE);
    f.blit(co.L, X0 - co.M, Y0);
    const sxB = (k: number, row: number) => plan.sx[((k % N) + N) % N][row];
    if (v === 1) {
      // бахрома: нити 2 px через просвет 2 (шаг 4 — при сдвиге не мигает), длинная и короткая чередуются; низ отстаёт на кадр
      const row = CH - 1, lag1 = sxB(t - 1, row) - sxB(t, row), bx = X0 - co.M + co.at(0, row), len0 = city ? 4 : 3;
      for (let u = 1; u <= CW - 2; u++) {
        if ((u - 1) % 4 >= 2) continue;
        const left = (u - 1) % 4 === 0, len = len0 + (((u - 1) >> 2) % 2);
        for (let j = 1; j <= len; j++) f.set(bx + u + (j >= 3 ? lag1 : 0), Y0 + row + 1 + j, j === len ? BR[1] : left ? BR[4] : BR[2]);
      }
    }
    // кисти: вариант 1 — на углах, вариант 2 — на концах трёх языков; каждая строка повторяет сдвиг с запаздыванием
    layer(f, (l) => {
      const T = city ? TASSEL : TASSEL_S;
      const tips = v === 1 ? [0, CW - 1] : [Math.round(CW / 6), Math.round(CW / 2), Math.round((5 * CW) / 6)].map((u) => Math.min(CW - 1, u));
      tips.forEach((u, side) => {
        const row = bottomRow(u), Xc = X0 - co.M + co.at(u, row) - sxB(t, row), by = Y0 + row + 1;
        T.forEach((r, j) => stamp(l, Xc - 2 + sxB(t - Math.round(j / 3) - (side % 2), row), by + j, [r], BRL));
      });
    }, EOUT);
    // брус: бронза, торцы — бирюзовые шары; кольца держат полотнище; муфта (крюк у городского, древко у знаменосца)
    layer(f, (l) => {
      for (let x = X0 - 4; x <= X0 + CW + 3; x++) { l.set(x, BAR, BR[5]); l.set(x, BAR + 1, BR[4]); l.set(x, BAR + 2, BR[3]); l.set(x, BAR + 3, BR[1]); }
      tqKnob(l, X0 - 9, BAR - 1); tqKnob(l, X0 + CW + 4, BAR - 1);
      const ringStep = city ? 8 : 7;
      for (let u = 2; u < CW - 2; u += ringStep) for (let y = BAR - 1; y <= BAR + 5; y++) { l.set(X0 + u, y, BR[4]); l.set(X0 + u + 1, y, y === BAR - 1 ? BR[5] : BR[2]); l.set(X0 + u + 2, y, BR[1]); }
      const CX = poleX + 2;
      for (let y = BAR - 2; y <= BAR + 4; y++) for (let x = CX - 3; x <= CX + 2; x++) l.set(x, y, x === CX - 3 ? BR[2] : x === CX - 2 ? BR[5] : x >= CX + 1 ? BR[1] : BR[3]);
      tqGem(l, CX - 2, BAR, false);
    }, EOUT);
    // навершие над муфтой
    layer(f, (l) => {
      const CX = poleX + 2;
      for (let y = BAR - 5; y <= BAR - 3; y++) { l.set(CX - 1, y, BR[4]); l.set(CX, y, BR[2]); }
      if (v === 1) finialAnvil(l, CX, BAR - 5, t);
      else finialBrazier(l, CX, BAR - 5, t);
    }, EOUT);
    frames.push(f);
  }
  // запас сверху у навершия: кадры уже начинаются с 0 — проверка, что ничего не срезано
  const CX = poleX + 2;
  return city
    ? { id: s.id, title: s.title, frames, w: FW, h: FH, anchor: [CX / FW, (BAR - 2) / FH], fps: FPS, fac: "solgard", hero: "warrior", stand: FH - 2 }
    : { id: s.id, title: s.title, frames, w: FW, h: FH, anchor: [(poleX + 2) / FW, GY / FH], fps: FPS, fac: "solgard", hero: "warrior", grip: GY - 14 };
}

const SPECS: Spec[] = [
  { id: "ember-city-1", title: "ШТАНДАРТ ГОРОДА, ВАРИАНТ 1 «ГОРН»", v: 1, kind: "city", CW: 34, CH: 52 },
  { id: "ember-bearer-1", title: "ЗНАМЯ ЗНАМЕНОСЦА, ВАРИАНТ 1 «ГОРН»", v: 1, kind: "bearer", CW: 24, CH: 30 },
  { id: "ember-city-2", title: "ШТАНДАРТ ГОРОДА, ВАРИАНТ 2 «ЖАРОВНЯ»", v: 2, kind: "city", CW: 36, CH: 58 },
  { id: "ember-bearer-2", title: "ЗНАМЯ ЗНАМЕНОСЦА, ВАРИАНТ 2 «ЖАРОВНЯ»", v: 2, kind: "bearer", CW: 24, CH: 34 },
];

// ---------------------------------------------------------------- в игру
/** Листы выбранного варианта (data/ember-guard.json banners.variant, game.citySheet/bearerSheet) в assets/vfx и записи в vfx/manifest.json
 *  (остальные записи не трогаются). Штандарт города — объект карты на башнях стен Эмберхолла (shared/map.ts buildTown): якорь — низ кадра
 *  (крюк приходится под зубцы башни, полотнище — по её лицевой стене); знамя знаменосца — якорь у подтока (UnitView.bearerFlag). */
export function writeEmberBannersGame(assetsRoot: string): void {
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* манифеста ещё нет */ }
  const v = EMBER.banners.variant, G = EMBER.game;
  for (const [kind, id] of [["city", G.citySheet], ["bearer", G.bearerSheet]] as const) {
    const a = build(SPECS.find((s) => s.v === v && s.kind === kind)!);
    strip(a.frames).save(path.join(dir, `${id}.png`));
    const anchor = kind === "city" ? [+a.anchor[0].toFixed(4), 1] : [+a.anchor[0].toFixed(4), +a.anchor[1].toFixed(4)];
    m[id] = { frameW: a.w, frameH: a.h, frames: a.frames.length, fps: a.fps, anchor, blend: "normal" };
  }
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
}

// ---------------------------------------------------------------- превью
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tools/out/standards");
const EMB_COL = c("#f0a050");

/** Городской штандарт на стене: кладка стены (камень), штандарт на крюке, герой у подножия стены. */
function onWall(a: Anim, frame: number, k: number): PC {
  const pad = 8, W = a.w + 2 * pad + 36, H = a.h + 26;
  const base = new PC(W, H), S = P.stone, wallH = a.h + 6;
  paintGround(base, 0, 0, W, H, "grass");
  for (let y = 0; y < wallH; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor(y / 6), off = row % 2 ? 6 : 0, bx = (x + off) % 12, by = y % 6;
    const seam = by === 5 || bx === 11, top = by === 0 || bx === 0;
    base.set(x, y, seam ? S[0] : top ? S[3] : (hash(Math.floor((x + off) / 12), row) < 0.5 ? S[2] : S[1]));
  }
  for (let x = 0; x < W; x++) { base.set(x, wallH, S[0]); base.set(x, wallH + 1, [20, 24, 18, 120]); }
  const ax = Math.round(a.anchor[0] * a.w), ay = Math.round(a.anchor[1] * a.h);
  // крюк в стене
  stamp(base, pad + ax - 1, 2 + ay - 2, ["gGg", "hgh"], BRL);
  base.blit(a.frames[frame], pad, 2);
  // герой у подножия стены — для масштаба
  const hero = crop(readPng(path.join(ROOT, "client/public/assets/units/warrior.png")), 0, 0, 32, 32);
  base.blit(hero, pad + a.w + 2, wallH + 14 - 30);
  return scaleNN(base, k);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const anims = SPECS.map(build);
  const meta: Record<string, object> = {};
  for (const a of anims) {
    strip(a.frames).save(path.join(OUT, `${a.id}.png`));
    const city = a.id.includes("city");
    meta[a.id] = {
      file: `${a.id}.png`, frameW: a.w, frameH: a.h, frames: a.frames.length, fps: a.fps, loop: true, anchor: anchorPx(a), title: a.title,
      note: city ? "штандарт города: на стены и ворота Эмберхолла; якорь — крюк над муфтой бруса" : "знамя знаменосца стражи: якорь — низ подтока (на земле); grip — строка хвата",
      ...((a as { grip?: number }).grip ? { grip: (a as { grip?: number }).grip } : {}),
    };
  }
  fs.writeFileSync(path.join(OUT, "ember-banners.json"), JSON.stringify({ cycle: { frames: N, fps: FPS }, sheets: meta }, null, 1));

  const rows: PC[] = [];
  const head = new PC(1500, 48);
  head.rect(0, 0, head.w, head.h, BGC);
  label(head, "ЗНАМЕНА ЭМБЕРХОЛЛА - 2 ВАРИАНТА НА ВЫБОР, РЯДОМ ФРАКЦИОННЫЕ", 0, 0, INK, 3);
  label(head, "ЭМБЛЕМА: НАКОВАЛЬНЯ, НАД НЕЮ ПЛАМЯ ОЧАГА. БРОНЗА И БИРЮЗА. ПИКСЕЛЬ ЛИСТА = ПИКСЕЛЬ МИРА, 12 КАДРОВ, 12 К/С", 0, 22, DIM, 2);
  rows.push(head);
  // фракционные для сравнения
  const base = captureBase();
  const hs = homeSolgard(), hu = homeUmbrath(), rs = royalSolgard(), ru = royalUmbrath();
  rows.push(previewRow("ДЛЯ СРАВНЕНИЯ: ФРАКЦИОННЫЕ", "ШТАНДАРТЫ СВОИХ ЗЕМЕЛЬ И КОРОЛЕВСКИЕ ЗНАМЕНА ЗАХВАТА (СОЛЬГАРД, УМБРАТ)", INK,
    [scene(hs, 3, "grass", 2), scene(hu, 3, "grass", 2), scene(onMast(base, rs, 3), 0, "dirt", 2), scene(onMast(base, ru, 3), 0, "dirt", 2)]));
  for (const v of [1, 2]) {
    const [city, bearer] = anims.filter((a) => a.id.endsWith(`-${v}`));
    const name = v === 1 ? "ВАРИАНТ 1 «ГОРН»" : "ВАРИАНТ 2 «ЖАРОВНЯ»";
    const sub = v === 1
      ? "БИРЮЗОВЫЙ ДАМАСТ, РАМА БРОНЗОВОГО ШИТЬЯ, КАБОШОНЫ, БАХРОМА"
      : "ПАРЧОВАЯ ГЛАВА, ГЕРБ В МЕДАЛЬОНЕ, ТРИ ЯЗЫКА, ЖАРОВНЯ";
    rows.push(previewRow(`${name}: ГОРОД И ЗНАМЕНОСЕЦ`, sub, EMB_COL,
      [onWall(city, 3, 2), scene(bearer, 3, "grass", 2), scene(bearer, 3, "grass", 3)]));
    rows.push(previewRow(`${name}: РАСКАДРОВКА`, `ГОРОД ${city.w}X${city.h}, ЗНАМЕНОСЕЦ ${bearer.w}X${bearer.h}`, EMB_COL,
      [board(city, 2, 6), board(bearer, 2, 6)]));
  }
  stackRows(rows).save(path.join(OUT, "ember-banners.png"));
  console.log(OUT);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
