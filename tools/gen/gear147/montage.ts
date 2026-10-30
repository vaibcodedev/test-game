/**
 * Монтаж для владельца: npx tsx tools/gen/gear147/montage.ts → tools/out/gear147/knight-chaos.png (+ части knight-chaos-*.png)
 * Разделы: референс | наш (зум 3); анимации сета (покой, ходьба, удар двуручным; вниз/вверх/вбок/влево); иконки 48×48 (герб Сольгарда и Умбрата);
 * «обычные латы 1 ур.» для контраста редкости; сцена днём и ночью на зуме 2 и 3. В игру не включено.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, type RGBA } from "../canvas";
import { P as PAL } from "../palette";
import { text } from "../mobs/lib";
import { FR, FY, NF, type AnimId, type Look } from "../hero147/base_b";
import { dress, renderView, setOf, SLOTS, type CrestId, type View4 } from "./gear";
import { cell as iconCell, icon } from "./icons";

const OUT = path.resolve("tools/out/gear147"); fs.mkdirSync(OUT, { recursive: true });
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255], RED: RGBA = [255, 110, 90, 255];
const KN = setOf("chaos-knight"), RC = setOf("recruit-plate");
const SOL: Look = { fac: "sol", sex: "m", hair: "tousled" }, UMB: Look = { fac: "umb", sex: "f", hair: "loose" };
type V4 = View4;
type Pack = { img: PC; emis: [number, number, RGBA][] };
const cache = new Map<string, Pack>();
function fr(l: Look, set: any, crest: CrestId, v: V4, a: AnimId, i: number): Pack {
  const key = JSON.stringify([l, set?.name, crest, v, a, i]);
  let p = cache.get(key);
  if (!p) {
    const f = renderView(dress(l, set, crest), v, a, i), cv = f.img;
    const img = new PC(FR, FR); for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (cv.has(x, y)) { const q = cv.get(x, y); img.set(x, y, [q[0], q[1], q[2], 255]); }
    p = { img, emis: f.emis.map(([x, y, c]) => [x, y, [c[0], c[1], c[2], 255]] as [number, number, RGBA]) };
    cache.set(key, p);
  }
  return p;
}
function blit(d: PC, s: PC, ox: number, oy: number, k = 1, x0 = 0, y0 = 0, w = s.w, h = s.h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const c = s.get(x, y); if (!c || !c[3]) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) d.set(ox + (x - x0) * k + a, oy + (y - y0) * k + b, c); }
}
const fill = (c: PC, x: number, y: number, w: number, h: number, col: RGBA) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, col); };
function shadow(c: PC, cx: number, cy: number, rx: number, ry: number, a = 90) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) { const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (d <= 1) c.set(x, y, [14, 10, 18, d < 0.45 ? a + 30 : a]); }
}
function ground(w: number, h: number, seed = 1): PC {
  const g = new PC(w, h), gr = PAL.grass;
  const n = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (x: number, y: number, cell: number) => { const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; const l = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t)); return l(l(n(x0, y0), n(x0 + 1, y0), tx), l(n(x0, y0 + 1), n(x0 + 1, y0 + 1), tx), ty); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = sm(x, y, 18) * 0.6 + sm(x >> 1, y >> 1, 3) * 0.4; g.set(x, y, gr[v < 0.36 ? 0 : v < 0.52 ? 1 : v < 0.7 ? 2 : 3]); }
  for (let i = 0; i < (w * h) / 60; i++) { const x = Math.floor(n(i, 3) * w), y = Math.floor(n(i, 7) * h); g.set(x, y, gr[3]); g.set(x, y - 1, gr[4] ?? gr[3]); }
  return g;
}
function loadScaled(f: string, H: number): PC {
  const p = PNG.sync.read(fs.readFileSync(f)), k = p.height / H, W = Math.round(p.width / k), o = new PC(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) { const i = (yy * p.width + xx) * 4; r += p.data[i]; g += p.data[i + 1]; b += p.data[i + 2]; n++; }
    o.set(x, y, [r / n, g / n, b / n, 255].map(Math.round) as RGBA);
  }
  return o;
}
const cell = (c: PC, x: number, y: number, w: number, h: number, alt = false) => fill(c, x, y, w, h, alt ? [40, 48, 54, 255] : [44, 54, 40, 255]);
const blocks: { h: number; w: number; file?: string; draw: (c: PC, y: number) => void }[] = [];
const V4S: V4[] = ["down", "up", "side", "left"], VN: Record<V4, string> = { down: "ВНИЗ", up: "ВВЕРХ", side: "ВПРАВО", left: "ВЛЕВО" };

// ---------- 1. референс | наш, зум 3 ----------
{
  const ref = loadScaled(path.resolve("refs/gear/sets/309.png"), 300), K = 3, cw = 40 * K;
  const w = 40 + ref.w + 40 + 4 * cw + 40 + 2 * 40 * 6 + 40;
  blocks.push({ w, h: 360, file: "knight-chaos-ref.png", draw: (c, y0) => {
    text(c, "РЕФЕРЕНС 309", 20, y0, 2, DIM); text(c, "НАШ · ЗУМ 3 · ВНИЗ ВВЕРХ ВБОК ВЛЕВО", 60 + ref.w, y0, 2, GOLD); text(c, "НАШ · ЗУМ 6 (ДЕТАЛИ)", 100 + ref.w + 4 * cw, y0, 2, GOLD);
    blit(c, ref, 20, y0 + 30);
    const gy = y0 + 30 + 300 - 44 * K;
    V4S.forEach((v, i) => { const x = 60 + ref.w + i * cw; const g = ground(40, 44, 2 + i); blit(c, g, x, gy, K); shadow(c, x + 20 * K, gy + (FY - 4) * K, 7 * K, 2.4 * K, 80); blit(c, fr(SOL, KN, "sol", v, "idle", 0).img, x, gy, K, 4, 4, 40, 44); });
    (["down", "side"] as V4[]).forEach((v, i) => { const K6 = 6, x = 100 + ref.w + 4 * cw + i * 40 * K6, yy = y0 + 30 + 300 - 44 * K6 + 36; const g = ground(40, 44, 9 + i); blit(c, g, x, yy, K6); shadow(c, x + 20 * K6, yy + (FY - 4) * K6, 7 * K6, 2.4 * K6, 80); blit(c, fr(SOL, KN, "sol", v, "idle", 0).img, x, yy, K6, 4, 4, 40, 44); });
  } });
}
// ---------- 2. анимации ----------
for (const [a, nm] of [["idle", "ПОКОЙ"], ["walk", "ХОДЬБА"], ["atk2h", "УДАР ДВУРУЧНЫМ"]] as [AnimId, string][]) {
  const n = NF(a), K = 2, fw = FR * K, lw = 110;
  const w = lw + n * fw + 20;
  blocks.push({ w, h: 30 + V4S.length * fw, file: `knight-chaos-${a}.png`, draw: (c, y0) => {
    text(c, `${nm} · ${n} КАДРОВ · ЗУМ 2 · ВНИЗ | ВВЕРХ | ВПРАВО | ВЛЕВО`, 20, y0, 2, GOLD);
    V4S.forEach((v, r) => { const y = y0 + 26 + r * fw; text(c, VN[v], 10, y + fw / 2 - 6, 2); for (let i = 0; i < n; i++) { const x = lw + i * fw; cell(c, x, y, fw - 2, fw - 2, r % 2 === 1); shadow(c, x + 24 * K, y + (FY - 1) * K, 6 * K, 2 * K, 70); blit(c, fr(SOL, KN, "sol", v, a, i).img, x, y, K); } });
  } });
}
// ---------- 2а. правша: меч в правой руке, порядок слоёв по направлению ----------
{
  const K = 3, cw = 44 * K, AN: [AnimId, number][] = [["idle", 0], ["atk2h", 3], ["atk2h", 8]];
  const NOTE: Record<V4, string> = { down: "ВНИЗ: ПРАВАЯ — СЛЕВА, МЕЧ СПЕРЕДИ", up: "ВВЕРХ: ПРАВАЯ — СПРАВА, РУКОЯТЬ ЗА КОРПУСОМ", side: "ВПРАВО: ПРАВАЯ БЛИЖНЯЯ — МЕЧ ПЕРЕД ТЕЛОМ", left: "ВЛЕВО: ПРАВАЯ ДАЛЬНЯЯ — МЕЧ ЗА ТЕЛОМ" };
  blocks.push({ w: 40 + 4 * (3 * cw + 20), h: 40 + 44 * K + 30, file: "knight-chaos-hands.png", draw: (c, y0) => {
    text(c, "ГЕРОЙ-ПРАВША · КАМЕРА С ЮГА · ДВУРУЧНИК ОБЕИМИ РУКАМИ, ПРАВАЯ ВЫШЕ · СВЕТ СВЕРХУ-СЛЕВА ВО ВСЕХ НАПРАВЛЕНИЯХ · ЗУМ 3", 20, y0, 2, GOLD);
    V4S.forEach((v, j) => {
      const x0 = 20 + j * (3 * cw + 20);
      text(c, NOTE[v], x0, y0 + 24, 1, DIM);
      AN.forEach(([a, i], k) => { const x = x0 + k * cw, y = y0 + 38; const g = ground(44, 44, 30 + j * 3 + k); blit(c, g, x, y, K); shadow(c, x + 22 * K, y + (FY - 2) * K, 7 * K, 2.4 * K, 80); blit(c, fr(SOL, KN, "sol", v, a, i).img, x, y, K, 2, 2, 44, 44); });
    });
  } });
}
// ---------- 2б. позы без удара: урон, гибель, сбор, верхом ----------
{
  const K = 2, fw = FR * K, lw = 110, AN: [AnimId, string][] = [["hurt", "УРОН — МЕЧ В РУКЕ"], ["death", "ГИБЕЛЬ — МЕЧ ПАДАЕТ РЯДОМ"], ["gather", "СБОР — МЕЧ ЗА СПИНОЙ"], ["ride", "ВЕРХОМ — МЕЧ ЗА СПИНОЙ"]];
  const w = lw + 12 * fw + 20, VV: V4[] = ["down", "up", "side", "left"];
  blocks.push({ w, h: AN.length * (30 + VV.length * fw), file: "knight-chaos-poses.png", draw: (c, y0) => {
    AN.forEach(([a, nm], k) => {
      const yb = y0 + k * (30 + VV.length * fw), n = NF(a);
      text(c, `${nm} · ${n} КАДРОВ · ЗУМ 2`, 20, yb, 2, GOLD);
      VV.forEach((v, r) => { const y = yb + 26 + r * fw; text(c, VN[v], 10, y + fw / 2 - 6, 2); for (let i = 0; i < n; i++) { const x = lw + i * fw; cell(c, x, y, fw - 2, fw - 2, r % 2 === 1); shadow(c, x + 24 * K, y + (FY - 1) * K, 6 * K, 2 * K, 70); blit(c, fr(SOL, KN, "sol", v, a, i).img, x, y, K); } });
    });
  } });
}
// ---------- 3. иконки ----------
{
  const K = 3, list = SLOTS.filter((s) => KN.items[s]), cw = 48 * K + 30;
  const pack = ["lg_chaos_horns_helm", "lg_crimson_rite_mantle", "lg_cuirass_steel_dawn", "lg_grave_bone_plate", "lg_dawn_sabatons", "lg_dawn_sun_cloak", "lg_doom_blade"].map((n) => { const q = PNG.sync.read(fs.readFileSync(path.resolve("client/public/assets/icons", n + ".png"))); const o = new PC(q.width, q.height); o.data.set(q.data); return o; });
  blocks.push({ w: 40 + list.length * cw + 40, h: 40 + 3 * (48 * K + 50), file: "knight-chaos-icons.png", draw: (c, y0) => {
    const yp = y0 + 30 + 2 * (48 * K + 50);
    text(c, "ЭТАЛОН — ЛУЧШИЕ ЛЕГЕНДАРНЫЕ ИКОНКИ НАШЕГО ПАКА, ТОТ ЖЕ ЗУМ", 20, yp - 22, 2, DIM);
    pack.forEach((im, i) => { const x = 20 + i * cw; fill(c, x - 2, yp - 2, 48 * K + 4, 48 * K + 4, [34, 24, 30, 255]); blit(c, im, x, yp, K); });
    text(c, "ИКОНКИ 48×48 · ЗУМ 3 · ГЕРБ — МАСКА ФРАКЦИИ ИГРОКА (СОЛНЦЕ | ЛУНА), ЦВЕТ СЕТА НЕ МЕНЯЕТСЯ", 20, y0, 2, GOLD);
    (["sol", "umb"] as CrestId[]).forEach((cr, r) => list.forEach((s, i) => {
      const x = 20 + i * cw, y = y0 + 30 + r * (48 * K + 50);
      blit(c, iconCell(icon(s, KN.items[s], cr).img, KN.rarity), x, y, K);
      if (r === 0) text(c, KN.items[s].name.split(" ")[0], x, y + 48 * K + 10, 1, DIM);
    }));
  } });
}
// ---------- 4. контраст редкости ----------
{
  const K = 3, cw = 40 * K, list = SLOTS.filter((s) => RC.items[s]);
  const w = 40 + 8 * cw + 80;
  blocks.push({ w: Math.max(w, 60 + 4 * cw + 7 * 104 + 20), h: 40 + 44 * K + 30 + 48 * 2 + 40 + 110, file: "knight-chaos-rarity.png", draw: (c, y0) => {
    text(c, "ОБЫЧНЫЕ ЛАТЫ 1 УР. (ЛАТЫ НОВОБРАНЦА)", 20, y0, 2, DIM); text(c, "ЛЕГЕНДАРНЫЕ 100 УР. (РОГАТЫЙ РЫЦАРЬ ХАОСА)", 60 + 4 * cw, y0, 2, RED);
    for (const [j, set] of [[0, RC], [1, KN]] as [number, any][]) V4S.forEach((v, i) => {
      const x = 20 + j * (4 * cw + 40) + i * cw, y = y0 + 26; const g = ground(40, 44, 20 + i); blit(c, g, x, y, K); shadow(c, x + 20 * K, y + (FY - 4) * K, 7 * K, 2.4 * K, 80); blit(c, fr(SOL, set, "sol", v, "idle", 0).img, x, y, K, 4, 4, 40, 44);
    });
    const yi = y0 + 26 + 44 * K + 20;
    list.forEach((s, i) => { blit(c, iconCell(icon(s, RC.items[s]).img, RC.rarity), 20 + i * 56, yi, 1); blit(c, iconCell(icon(s, RC.items[s]).img, RC.rarity), 20 + i * 104, yi + 60, 2); });
    SLOTS.forEach((s, i) => { blit(c, iconCell(icon(s, KN.items[s]).img, KN.rarity), 60 + 4 * cw + i * 56, yi, 1); blit(c, iconCell(icon(s, KN.items[s]).img, KN.rarity), 60 + 4 * cw + i * 104, yi + 60, 2); });
    text(c, "ИКОНКИ ×1 И ×2 · РЕДКОСТЬ — ФОН И РАМКА ЯЧЕЙКИ", 20, yi + 168, 2, DIM);
  } });
}
// ---------- 5. сцена день / ночь, зум 2 и 3 ----------
function scene(night: boolean): PC {
  const SW = 220, SH = 90, g = ground(SW, SH, 7), c = new PC(SW, SH); c.data.set(g.data);
  const items: { x: number; y: number; p: Pack }[] = [
    { x: 40, y: 70, p: fr(SOL, RC, "sol", "down", "idle", 0) },
    { x: 78, y: 74, p: fr(SOL, KN, "sol", "down", "idle", 3) },
    { x: 112, y: 66, p: fr(UMB, KN, "umb", "side", "walk", 2) },
    { x: 146, y: 76, p: fr(SOL, KN, "sol", "down", "atk2h", 8) },
    { x: 182, y: 70, p: fr(UMB, KN, "umb", "up", "idle", 0) },
  ].sort((a, b) => a.y - b.y);
  const emis: [number, number, RGBA][] = [];
  for (const it of items) { const ox = it.x - 24, oy = it.y - FY; shadow(c, it.x, it.y, 6.5, 2.4, 85); blit(c, it.p.img, ox, oy); for (const [x, y, col] of it.p.emis) emis.push([ox + x, oy + y, col]); }
  if (night) {
    for (let i = 0; i < c.data.length; i += 4) { c.data[i] *= 0.34; c.data[i + 1] *= 0.36; c.data[i + 2] *= 0.56; }
    const glow = new Float32Array(SW * SH * 3);
    for (const [x, y, col] of emis) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const d = Math.hypot(dx, dy); if (d > 6) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= SW || yy >= SH) continue; const k = 0.05 * (1 - d / 6) ** 2; const q = (yy * SW + xx) * 3; glow[q] += col[0] * k; glow[q + 1] += col[1] * k * 0.8; glow[q + 2] += col[2] * k * 0.5; }
    for (let p = 0; p < SW * SH; p++) { c.data[p * 4] = Math.min(255, c.data[p * 4] + glow[p * 3]); c.data[p * 4 + 1] = Math.min(255, c.data[p * 4 + 1] + glow[p * 3 + 1]); c.data[p * 4 + 2] = Math.min(255, c.data[p * 4 + 2] + glow[p * 3 + 2]); }
    for (const [x, y, col] of emis) c.set(x, y, col);
  }
  return c;
}
{
  const day = scene(false), nig = scene(true);
  const w = 60 + day.w * 2 * 2;
  blocks.push({ w, h: 40 + day.h * 2 + 40 + 60 * 3, file: "knight-chaos-scene.png", draw: (c, y0) => {
    text(c, "СЦЕНА · ЗУМ 2 · ДЕНЬ | НОЧЬ · ОБЫЧНЫЕ ЛАТЫ, ЗАТЕМ СЕТ ×4", 20, y0, 2);
    blit(c, day, 20, y0 + 26, 2); blit(c, nig, 40 + day.w * 2, y0 + 26, 2);
    const y1 = y0 + 26 + day.h * 2 + 16;
    text(c, "ЗУМ 3 · ДЕНЬ | НОЧЬ", 20, y1, 2);
    blit(c, day, 20, y1 + 26, 3, 56, 16, 104, 64); blit(c, nig, 40 + 104 * 3, y1 + 26, 3, 56, 16, 104, 64);
  } });
}
// ---------- сборка ----------
function stack(list: typeof blocks, w: number, title?: string): PC {
  const H = list.reduce((s, r) => s + r.h + 20, 20) + (title ? 70 : 0);
  const c = new PC(w, H); fill(c, 0, 0, w, H, BG);
  let y = 20;
  if (title) { text(c, title, 20, y, 3, GOLD); text(c, "ПРОБА СИСТЕМЫ СНАРЯЖЕНИЯ НА ОСНОВЕ Б · 7 СЛОТОВ НА 18 ТОЧКАХ СКЕЛЕТА · ЛИСТЫ СЛОЁВ ПО НАПРАВЛЕНИЯМ · В ИГРУ НЕ ВКЛЮЧЕНО", 20, y + 34, 2, DIM); y += 70; }
  for (const r of list) { r.draw(c, y); y += r.h + 20; }
  return c;
}
for (const b of blocks) if (b.file) stack([b], b.w).save(path.join(OUT, b.file));
stack(blocks, Math.max(...blocks.map((b) => b.w)), "ЛЕГЕНДАРНЫЕ ЛАТЫ РОГАТОГО РЫЦАРЯ ХАОСА · 100 УР.").save(path.join(OUT, "knight-chaos.png"));
console.log("→ tools/out/gear147/knight-chaos.png");
