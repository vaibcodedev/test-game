/**
 * Маунты, задача 142 (пилот): общая часть генераторов tools/gen/mounts/<id>.ts.
 *
 * Тело рисует библиотека мобов (tools/gen/mobs/lib.ts, поведение не меняется): объёмные примитивы, луч на пиксель, свет сверху
 * слева, 5–6 тонов на материал, тень, швы, контур. Камера маунта круче, чем у моба (14° + TILT): сцену перед отрисовкой
 * поворачиваем вокруг экранной оси X и поднимаем, а точку земли возвращаем на строку GY — так видна спина и длина корпуса
 * (как у прежних маунтов), а свет и контур остаются библиотечными.
 *
 * Виды: вниз, вверх, вправо и влево — левый вид настоящий (модель повёрнута на 180°), герб и знамя не зеркалятся.
 * Слои (как у прежних маунтов, UnitView): «задний» — весь зверь; «передний» — части, которые рисуются поверх всадника
 * (вид вниз — голова, шея, грудь; вверх — круп, хвост, знамя; вбок — ближний крыл седла). Деталь помечается видами в Built.bits.
 * Седло: точка таза всадника по каждому кадру и виду (seat) — экранный сдвиг от (центр, GY), как в manifest.mounts.
 *
 * Знамя на древке — плоское полотнище «Свои земли» в малом размере: полотно, кайма, эмблема утверждённого герба (s16),
 * ветер из tools/gen/standards.ts (windCloth: складки бегут по 1 px за кадр, цикл 12 кадров); древко и перекладина — фракции.
 * Знамя закрывается телом по глубине луча (gb.t).
 */
import path from "node:path";
import fs from "node:fs";
import {
  PC, Scene, renderScene, toView, fromView, scr, depthOf, CS, rad, crop, scaleNN, fill, groundBg, shadowBlob, nightRect, text, stackRows,
  loadPC, pngDataUrl, frameEdgeCuts, frameHoles, hex, mix, R, sealPinholes, TAU,
  type Cam, type V3, type View, type Prim, type RGBA, type Row, type StampPx, type Mat,
} from "../mobs/lib";
import { windCloth, clothTex, toneFn, WIND_HOME, type Wind } from "../standards";
import { factionEmblem } from "../heraldry";

export type Fac = "solgard" | "umbrath";
export type Anim = "run" | "idle";
export const RUN_N = 12, IDLE_N = 24;
/** Виды листа: вниз, вверх, вправо («side» библиотеки) и влево — настоящий вид с левого бока (модель повёрнута на 180°,
 *  свет тот же), а не зеркало: герб и знамя не отражаются. */
export type MView = View | "left";
export const VIEWS4: MView[] = ["down", "up", "side", "left"];
export const VB: Record<MView, number> = { down: 1, up: 2, side: 4, left: 8 };
/** Строка героя (warrior.png: 0 вниз, 1 вверх, 2 вбок вправо) и отражение для вида листа. */
export const HERO_ROW: Record<MView, [number, boolean]> = { down: [0, false], up: [1, false], side: [2, false], left: [2, true] };
export const OUT_COL = hex("#170f0a");

// ---------------- камера маунта ----------------
/** Дополнительный наклон камеры маунта: 14° моба + 22° = 36°. */
export const TILT = rad(22);
const TC = Math.cos(TILT), TS = Math.sin(TILT);
/** Подъём сцены после поворота: ближние к зрителю копыта не уходят под срез земли библиотеки (z < 0). */
const LIFT = 20;
const tv = (view: View, p: V3): V3 => {
  const v = toView(view, p);
  return fromView(view, [v[0], v[1] * TC + v[2] * TS, -v[1] * TS + v[2] * TC + LIFT]);
};
const td = (view: View, d: V3): V3 => {
  const v = toView(view, d);
  return fromView(view, [v[0], v[1] * TC + v[2] * TS, -v[1] * TS + v[2] * TC]);
};
/** Камера библиотеки для кадра N×N: центр X, земля (z = 0 под центром зверя) — на строке GY. */
export const camOf = (N: number, GY: number): Cam => ({ N, CX: N / 2, GY: GY + CS * LIFT });
/** Точка модели → [x, y] кадра (дробные) и глубина вдоль луча (как gb.t). */
export function project(view: View, cam: Cam, p: V3): [number, number, number] {
  const v = toView(view, tv(view, p));
  const [x, y] = scr(cam, v);
  return [x, y, depthOf(v)];
}
function tiltScene(sc: Scene, view: View) {
  for (const q of sc.prims) {
    q.a = tv(view, q.a);
    q.b = tv(view, q.b);
    q.anc = tv(view, q.anc);
    q.ref = td(view, q.ref);
    q.ax = [td(view, q.ax[0]), td(view, q.ax[1]), td(view, q.ax[2])];
  }
  for (const st of sc.stamps) {
    st.at = tv(view, st.at);
    st.n = td(view, st.n);
  }
}

// ---------------- модель кадра ----------------
export interface Banner {
  fac: Fac;
  /** гнездо древка у седла и верх древка (низ перекладины) — точки модели */
  base: V3;
  top: V3;
  /** кадр ветра 0..11 */
  t: number;
  run: boolean;
  /** полотнище от древка: +1 вправо по экрану, −1 влево — по виду */
  hang: Record<MView, 1 | -1>;
  /** вид: полотнище на перекладине (знамя) или длинная лента-вымпел (парадный конь, ref 07) */
  kind?: "flag" | "streamer";
}
export interface Built {
  sc: Scene;
  /** деталь → виды (VB), в которых она поверх всадника */
  bits: Map<Prim, number>;
  seat: V3;
  banner?: Banner;
}
/** Пометить детали, добавленные в fn, видами переднего слоя. */
export function front(b: { sc: Scene; bits: Map<Prim, number> }, mask: number, fn: () => void) {
  const n0 = b.sc.prims.length;
  fn();
  for (let i = n0; i < b.sc.prims.length; i++) b.bits.set(b.sc.prims[i], (b.bits.get(b.sc.prims[i]) ?? 0) | mask);
}
export interface Frame { anim: Anim; i: number; n: number }
export interface MountSpec {
  id: string;
  ru: string;
  N: number;
  GY: number;
  fly?: number;
  /** масштаб модели (детали заданы в «пикселях» исходного размера) */
  scale?: number;
  build: (f: Frame, view: MView) => Built;
}
/** Поворот модели на 180° вокруг вертикали: вид «вбок» тогда показывает левый бок, морда влево. */
function turnBuilt(b: Built) {
  const P = (p: V3): V3 => [-p[0], -p[1], p[2]];
  for (const q of b.sc.prims) { q.a = P(q.a); q.b = P(q.b); q.anc = P(q.anc); q.ref = P(q.ref); q.ax = [P(q.ax[0]), P(q.ax[1]), P(q.ax[2])]; }
  for (const st of b.sc.stamps) { st.at = P(st.at); st.n = P(st.n); }
  b.seat = P(b.seat);
  if (b.banner) { b.banner.base = P(b.banner.base); b.banner.top = P(b.banner.top); }
}
function scaleBuilt(b: Built, k: number) {
  if (k === 1) return;
  const S = (p: V3): V3 => [p[0] * k, p[1] * k, p[2] * k];
  for (const q of b.sc.prims) {
    q.a = S(q.a); q.b = S(q.b); q.anc = S(q.anc);
    q.ra *= k; q.rb *= k; q.r = S(q.r); q.rr *= k;
    if (q.cut) q.cut = { n: q.cut.n, d: q.cut.d * k };
  }
  for (const st of b.sc.stamps) st.at = S(st.at);
  b.seat = S(b.seat);
  if (b.banner) { b.banner.base = S(b.banner.base); b.banner.top = S(b.banner.top); }
}
export interface Layers { back: PC; front: PC; eb: PC; ef: PC; seat: [number, number] }

/** Один кадр одного вида: задний и передний слои, светящееся (ночь), посадка. */
export function renderMount(spec: MountSpec, f: Frame, mview: MView): Layers {
  const b = spec.build(f, mview);
  scaleBuilt(b, spec.scale ?? 1);
  if (mview === "left") turnBuilt(b);
  const view: View = mview === "left" ? "side" : mview;
  const cam = camOf(spec.N, spec.GY);
  const N = spec.N;
  const sp = project(view, cam, b.seat);
  tiltScene(b.sc, view);
  const r = renderScene(cam, b.sc, view, OUT_COL);
  const back = r.body, eb = r.emis;
  const frontPC = new PC(N, N), ef = new PC(N, N);
  const isF = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const pi = r.gb.prim[i];
    if (pi < 0) continue;
    if ((b.bits.get(r.prims[pi]) ?? 0) & VB[mview]) isF[i] = 1;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let on = isF[i] === 1;
    if (!on && r.gb.prim[i] < 0 && back.alpha(x, y)) {
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N && isF[yy * N + xx]) { on = true; break; }
      }
    }
    if (!on) continue;
    frontPC.set(x, y, back.get(x, y)!);
    const e = eb.get(x, y)!;
    if (e[3]) ef.set(x, y, e);
  }
  if (b.banner) {
    const lay = bannerLayer(b.banner, view, b.banner.hang[mview], cam, N);
    const inFront = view === "up";
    composite(lay, inFront ? frontPC : back, r.gb.prim, r.gb.t, back, N);
    if (inFront) composite(lay, back, r.gb.prim, r.gb.t, back, N);
  }
  sealPinholes(back, OUT_COL, true, 4);
  return { back, front: frontPC, eb, ef, seat: [Math.round((sp[0] - N / 2) * 10) / 10, Math.round((sp[1] - spec.GY) * 10) / 10] };
}

// ---------------- знамя ----------------
const G6 = R("#4a2c0a", "#6a4210", "#a8681c", "#e0a630", "#ffd864", "#fff2b0");
const AZ = [hex("#12365e"), hex("#1f5a96"), hex("#3a86c8"), hex("#7ec8ff")];
const WH = [hex("#7a7480"), hex("#aaa4ae"), hex("#d6d0d8"), hex("#f6f2f8")];
const WOOD = [hex("#3a2216"), hex("#5e3a22"), hex("#8a5a34"), hex("#b07e4c")];
const STEEL = [hex("#3a3f4c"), hex("#5e6678"), hex("#8f99ad"), hex("#c8d0de"), hex("#f2f6ff")];
const UK = [hex("#0a0612"), hex("#100a1a"), hex("#22163a"), hex("#382858")];
const UP = [hex("#2a1846"), hex("#46265e"), hex("#6a3c8a"), hex("#9a62b8"), hex("#d0b4f0")];
const BONE = [hex("#4e4638"), hex("#8f8468"), hex("#c8bc9c"), hex("#ece4cc")];
const TONE = {
  solgard: toneFn([WH, AZ, G6.slice(1), WOOD, STEEL]),
  umbrath: toneFn([UK, UP, BONE]),
};
const CW = 18, CH = 24;
const texCache = new Map<Fac, PC>();
function clothOf(fac: Fac): PC {
  let t = texCache.get(fac);
  if (t) return t;
  if (fac === "solgard") {
    // белое полотно, лазурная кайма, острый низ (как штандарт своих земель Сольгарда)
    const pointY = 18;
    const inside = (x: number, y: number) => y <= pointY || Math.abs(x + 0.5 - CW / 2) <= CW / 2 - 1.6 * (y - pointY);
    t = clothTex(CW, CH, inside, (_x, _y, d) => (d === 1 ? AZ[1] : d === 2 ? AZ[2] : d === 3 ? WH[1] : WH[2]));
  } else {
    // чёрно-пурпурное полотно с гробовой стопой
    const footY = 16;
    const inset = (y: number) => (y <= footY ? 0 : Math.ceil((y - footY) / 2));
    t = clothTex(CW, CH, (x, y) => x >= inset(y) && x <= CW - 1 - inset(y), (_x, _y, d) => (d === 1 ? UP[2] : d === 2 ? UP[1] : d === 3 ? UK[1] : UK[2]));
  }
  texCache.set(fac, t);
  return t;
}
const windCache = new Map<string, Wind>();
function windOf(run: boolean, dir: 1 | -1): Wind {
  const k = `${run}${dir}`;
  let w = windCache.get(k);
  if (!w) {
    w = run ? { ...WIND_HOME, lean: dir * 3.4, sway: 1.8, f1: 0.36 } : { ...WIND_HOME, lean: dir * 0.6, sway: 1.4 };
    windCache.set(k, w);
  }
  return w;
}
function put(l: PC, D: Float32Array, x: number, y: number, c: RGBA, d: number) {
  if (!l.inside(x, y)) return;
  l.set(x, y, c);
  D[y * l.w + x] = d;
}
function stampD(l: PC, D: Float32Array, x0: number, y0: number, rows: string[], lg: Record<string, RGBA>, d: number) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { const c = lg[ch]; if (c) put(l, D, x0 + i, y0 + j, c, d); }));
}
interface BLayer { pc: PC; D: Float32Array }
function bannerLayer(B: Banner, view: View, hang: 1 | -1, cam: Cam, N: number): BLayer {
  const l = new PC(N, N), D = new Float32Array(N * N).fill(Infinity);
  const [bx, by, bd] = project(view, cam, B.base), [tx, ty, td2] = project(view, cam, B.top);
  const sol = B.fac === "solgard";
  const px = Math.round(tx) - 1, top = Math.round(ty), bot = Math.round(by);
  // древко 3 px: свет слева
  const pole = sol ? [WOOD[3], WOOD[2], WOOD[1]] : [BONE[3], BONE[2], BONE[1]];
  for (let y = top - 1; y <= bot; y++) {
    const u = (y - top) / Math.max(1, bot - top);
    const d = td2 + (bd - td2) * u, xx = Math.round(tx + (bx - tx) * u) - 1;
    for (let k = 0; k < 3; k++) put(l, D, xx + k, y, pole[k], d);
  }
  if (sol) for (let y = top + 18; y <= top + 19; y++) stampD(l, D, px - 1, y, [y === top + 18 ? "gYGg" + "h" : "hggh" + "h"], { Y: G6[5], G: G6[4], g: G6[3], h: G6[2] }, td2);
  else for (let y = top + 12; y < bot - 2; y += 9) stampD(l, D, px - 1, y, [".LMD.", "LMMDb", ".bbb."], { L: BONE[3], M: BONE[2], D: BONE[1], b: BONE[0] }, td2);
  if (B.kind === "streamer") {
    // лента-вымпел: ласточкин хвост, волна бежит от древка (ровно цикл за 12 кадров), в беге вытягивается
    const LEN = 26, HH = 5, ph = (TAU * (B.t % 12)) / 12;
    const field = sol ? AZ : [UP[0], UP[1], UP[2], UP[3]], edge = sol ? [G6[2], G6[3], G6[4]] : [BONE[1], BONE[2], BONE[3]];
    const rib = new PC(N, N), RD = new Float32Array(N * N).fill(Infinity);
    for (let x = 0; x < LEN; x++) {
      const u = x / (LEN - 1);
      const dy = Math.round(Math.sin(ph - x * 0.5) * (0.6 + 2.2 * u) + (B.run ? 0 : u * 3.5));
      const fork = u > 0.82 ? Math.round((u - 0.82) / 0.18 * 2.4) : 0;
      for (let y = 0; y < HH; y++) {
        if (fork && y >= HH / 2 - fork / 2 && y < HH / 2 + fork / 2) continue;
        const fold = Math.cos(ph - x * 0.5);
        const c = y === 0 ? edge[2] : y === HH - 1 ? edge[0] : field[Math.max(0, Math.min(field.length - 1, 2 + (fold > 0.4 ? 1 : fold < -0.4 ? -1 : 0) - (y === HH - 2 ? 1 : 0)))];
        const X = hang > 0 ? px + 3 + x : px - 1 - x;
        put(rib, RD, X, top + 2 + y + dy, c, td2 + 0.2);
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = rib.get(x, y)!; if (c[3]) put(l, D, x, y, c, RD[y * N + x]); }
    // навершие-скипетр: кольцо и камень
    const lg = sol ? { Y: G6[5], G: G6[4], g: G6[3], h: G6[2], c: AZ[3], C: AZ[2] } : { Y: BONE[3], G: BONE[2], g: BONE[1], h: BONE[0], c: UP[4], C: UP[3] };
    stampD(l, D, px - 2, top - 8, [".GYG.", "Gg.gG", "G.c.G", "gGCGg", ".gGg.", "..g..", ".hgh.", ".hgh."], lg, td2 - 0.2);
  } else {
  // полотнище под перекладиной: от древка в сторону hang, с ветром
  const tex = clothOf(B.fac);
  const em = factionEmblem(B.fac, "s16");
  const co = windCloth(tex, { pc: em, x: Math.floor((CW - em.w) / 2), y: 2 }, B.t % 12, windOf(B.run, hang), TONE[B.fac], 8);
  co.L.outline(OUT_COL);
  const X0 = hang > 0 ? px + 3 : px - CW, Y0 = top + 3;
  for (let y = 0; y < co.L.h; y++) for (let x = 0; x < co.L.w; x++) {
    const c = co.L.get(x, y)!;
    if (c[3]) put(l, D, X0 - co.M + x, Y0 + y, c, td2 + 0.2);
  }
  // перекладина с торцами и петли
  const x0 = Math.min(px, X0) - 1, x1 = Math.max(px + 2, X0 + CW);
  for (let x = x0; x <= x1; x++) {
    if (sol) { put(l, D, x, top + 1, WOOD[3], td2); put(l, D, x, top + 2, WOOD[1], td2); }
    else { put(l, D, x, top + 1, BONE[3], td2); put(l, D, x, top + 2, BONE[1], td2); }
  }
  const capLg = sol ? { Y: G6[5], G: G6[4], g: G6[3], h: G6[2] } : { Y: BONE[3], G: BONE[2], g: BONE[1], h: BONE[0] };
  stampD(l, D, x0 - 2, top, ["GY", "gG", "hg"], capLg, td2 - 0.1);
  stampD(l, D, x1 + 1, top, ["YG", "Gg", "gh"], capLg, td2 - 0.1);
  const tie = sol ? [AZ[3], AZ[2], AZ[1]] : [UP[2], UP[1], UP[0]];
  for (const u of [1, Math.floor(CW / 2) - 1, CW - 3]) for (let k = 0; k < 2; k++) {
    put(l, D, X0 + u + k, top + 1, tie[k], td2 - 0.1); put(l, D, X0 + u + k, top + 2, tie[k + 1], td2 - 0.1); put(l, D, X0 + u + k, top + 3, tie[k + 1], td2 - 0.1);
  }
  // навершие: Сольгард — наконечник копья над золотым кольцом; Умбрат — череп
  if (sol) stampD(l, D, px - 1, top - 9, ["..H..", ".LHM.", ".LHM.", "LLHMD", ".LHM.", "..H..", ".LHM.", "gYGgh", "hgggh"], { H: STEEL[4], L: STEEL[3], M: STEEL[2], D: STEEL[1], Y: G6[5], G: G6[4], g: G6[3], h: G6[2] }, td2 - 0.2);
  else stampD(l, D, px - 1, top - 7, [".LLL.", "LLLMM", "LKLKD", "LKMKD", ".MKD.", ".DMD.", "..D.."], { L: BONE[3], M: BONE[2], D: BONE[1], K: UK[0] }, td2 - 0.2);
  }
  // контур слоя (глубина контура — ближайшего соседа)
  const src = l.clone();
  l.outline(OUT_COL);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (src.alpha(x, y) || !l.alpha(x, y)) continue;
    let d = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N) d = Math.min(d, D[yy * N + xx]);
    }
    D[y * N + x] = d;
  }
  return { pc: l, D };
}
/** Слой знамени на кадр: пиксель виден, если тело дальше по лучу (или тела нет). */
function composite(lay: BLayer, dst: PC, prim: Int32Array, t: Float32Array, body: PC, N: number) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = lay.pc.get(x, y)!;
    if (!c[3]) continue;
    const i = y * N + x, d = lay.D[i];
    if (prim[i] >= 0) { if (t[i] < d) continue; }
    else if (body.alpha(x, y)) {
      // контур тела: за телом ли знамя — по соседям
      let hid = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * N + x + dx;
        if (j >= 0 && j < N * N && prim[j] >= 0 && t[j] < d) hid = true;
      }
      if (hid) continue;
    }
    dst.set(x, y, c);
  }
}

// ---------------- штампы ----------------
/** Рисунок PC (эмблема) → пиксели штампа и цвета по ключам; центр рисунка — в точке штампа. */
export function pcStamp(pc: PC): { px: StampPx[]; colors: Record<string, RGBA> } {
  const keys = new Map<string, string>();
  const colors: Record<string, RGBA> = {};
  const px: StampPx[] = [];
  const x0 = -Math.floor(pc.w / 2), y0 = -Math.floor(pc.h / 2);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const c = pc.get(x, y)!;
    if (!c[3]) continue;
    const k0 = c.slice(0, 3).join(",");
    let k = keys.get(k0);
    if (!k) { k = String.fromCharCode(65 + keys.size); keys.set(k0, k); colors[k] = [c[0], c[1], c[2], 255]; }
    px.push([x0 + x, y0 + y, k]);
  }
  return { px, colors };
}

// ---------------- лист и проверки ----------------
export interface SheetOut { sheet: PC; emis: PC; meta: { frame: number; gy: number; fly: number; cols: number; run: number; idle: number; seat: [number, number][][] }; problems: string[] }
/** Лист: столбцы 0..11 — бег, 12..35 — покой; строки 0–3 задний слой (вниз, вверх, вправо, влево), 4–7 передний. */
export function buildSheet(spec: MountSpec, name: string): SheetOut {
  const N = spec.N, cols = RUN_N + IDLE_N;
  const sheet = new PC(cols * N, 8 * N), emis = new PC(cols * N, 8 * N);
  const seat: [number, number][][] = [[], [], [], []];
  VIEWS4.forEach((view, v) => {
    for (let c = 0; c < cols; c++) {
      const f: Frame = c < RUN_N ? { anim: "run", i: c, n: RUN_N } : { anim: "idle", i: c - RUN_N, n: IDLE_N };
      const L = renderMount(spec, f, view);
      sheet.blit(L.back, c * N, v * N);
      sheet.blit(L.front, c * N, (v + 4) * N);
      emis.blit(L.eb, c * N, v * N);
      emis.blit(L.ef, c * N, (v + 4) * N);
      seat[v].push(L.seat);
    }
  });
  const rows = ["вниз", "вверх", "вправо", "влево", "вниз·перед", "вверх·перед", "вправо·перед", "влево·перед"];
  const problems = [...frameEdgeCuts(sheet, N, OUT_COL, name, rows), ...frameHoles(crop(sheet, 0, 0, sheet.w, 4 * N), N, name, rows, 4)];
  return { sheet, emis, meta: { frame: N, gy: spec.GY, fly: spec.fly ?? 0, cols, run: RUN_N, idle: IDLE_N, seat }, problems };
}

// ---------------- превью ----------------
export interface Assets { terrain: PC; heroes: Record<string, PC>; root: string }
export function loadAssets(root: string): Assets {
  const u = (n: string) => loadPC(path.join(root, "client", "public", "assets", "units", `${n}.png`));
  return { root, terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")), heroes: { warrior: u("warrior"), deathknight: u("deathknight") } };
}
/** Кадр с всадником (как UnitView): задний слой, герой (кадр покоя вида, ступни на seat + 9), передний слой. */
export function withRider(sheet: PC, N: number, GY: number, col: number, row: number, seat: [number, number], hero: PC | null, emis?: PC): { img: PC; emis: PC } {
  const img = new PC(N, N), em = new PC(N, N);
  const [hr, hf] = HERO_ROW[VIEWS4[row]];
  img.blit(crop(sheet, col * N, row * N, N, N), 0, 0);
  if (hero) img.blit(crop(hero, 0, hr * 32, 32, 32), N / 2 + Math.round(seat[0]) - 16, GY + Math.round(seat[1]) + 9 - 30, hf);
  img.blit(crop(sheet, col * N, (row + 4) * N, N, N), 0, 0);
  if (emis) { em.blit(crop(emis, col * N, row * N, N, N), 0, 0); em.blit(crop(emis, col * N, (row + 4) * N, N, N), 0, 0); }
  return { img, emis: em };
}
/** Старый маунт из client/public/assets/mounts (кадр покоя 8) с героем. */
export function oldFrame(root: string, id: string, row: number, hero: PC | null): { img: PC; N: number; GY: number } {
  const im = loadPC(path.join(root, "client", "public", "assets", "mounts", `${id}.png`));
  const m = JSON.parse(fs.readFileSync(path.join(root, "client", "public", "assets", "manifest.json"), "utf8")).mounts[id];
  const F = m.frame;
  const img = new PC(F, F);
  img.blit(crop(im, 8 * F, row * F, F, F), 0, 0);
  if (hero) img.blit(crop(hero, 0, row * 32, 32, 32), F / 2 + Math.round(m.seat[row][8][0]) - 16, m.gy + Math.round(m.seat[row][8][1]) + 9 - 30 - (m.fly || 0));
  img.blit(crop(im, 8 * F, (row + 3) * F, F, F), 0, 0);
  return { img, N: F, GY: m.gy };
}
function relight(c: PC, emis: PC, x: number, y: number, k: number, flip: boolean) {
  const big = scaleNN(emis, k, flip);
  c.blit(big, x, y);
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -3 * k; dy <= 4 * k; dy++) for (let dx = -3 * k; dx <= 4 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (3.5 * k);
      if (dd > 1 || !c.inside(X, Y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.06 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
export interface Cell { img: PC; emis?: PC; GY: number; flip?: boolean; label?: string }
/** Строка превью: земля, клетки с подписью; все клетки ставятся на одну линию земли. */
export function sceneRow(title: string, cells: Cell[], A: Assets, night: boolean, W: number, k: number, H: number, ground: "grass" | "dirt" = "grass"): Row {
  const maxUp = Math.max(...cells.map((c) => c.GY)), maxDn = Math.max(...cells.map((c) => c.img.h - c.GY));
  const hh = Math.min(H, maxUp + maxDn);
  return {
    h: hh * k + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, A.terrain, 16, y, W - 32, hh * k, k, ground);
      const gl = y + maxUp * k;
      let x = 24;
      const pos: [number, number][] = [];
      for (const cell of cells) {
        if (cell.label === "|") { x += 10 * k; continue; }
        const top = gl - cell.GY * k;
        shadowBlob(c, x + (cell.img.w / 2) * k, gl, cell.img.w * 0.2 * k, 4 * k);
        c.blit(scaleNN(cell.img, k, cell.flip), x, top);
        pos.push([x, top]);
        x += cell.img.w * k - 16 * k;
      }
      if (night) {
        nightRect(c, 16, y, W - 32, hh * k);
        cells.filter((q) => q.label !== "|").forEach((cell, i) => cell.emis && relight(c, cell.emis, pos[i][0], pos[i][1], k, !!cell.flip));
      }
    },
  };
}
export function refRow(title: string, refs: PC[], H: number): Row {
  return {
    h: H + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      let x = 16;
      for (const r of refs) {
        const w = Math.round((r.w * H) / r.h);
        const o = new PC(w, H);
        const kx = r.w / w, ky = r.h / H;
        for (let y = 0; y < H; y++) for (let xx = 0; xx < w; xx++) {
          let s0 = 0, s1 = 0, s2 = 0, n = 0;
          for (let j = Math.floor(y * ky); j < Math.floor((y + 1) * ky); j++) for (let i = Math.floor(xx * kx); i < Math.floor((xx + 1) * kx); i++) {
            const q = r.get(i, j)!; s0 += q[0]; s1 += q[1]; s2 += q[2]; n++;
          }
          if (n) o.data.set([s0 / n, s1 / n, s2 / n, 255], (y * w + xx) * 4);
        }
        c.blit(o, x, y0 + 34);
        x += w + 16;
      }
    },
  };
}
export { stackRows, pngDataUrl, fill, crop, scaleNN, text };
export type { Mat };
