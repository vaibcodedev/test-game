/**
 * Третий проход объёма 1030: частокол pal_*, мосты bridge_* и v_bridges_*_v, дома Умбрата (umb_house, umb_crypt, umb_ziggurat).
 * Пишет ТОЛЬКО эти id в client/public/assets/objects; размеры кадров прежние. Без npm run assets. Затем: npx tsx tools/gen/atlas.ts
 * Кадры берутся из прежних генераторов (walls141-game, factions.BRIDGE_PIECES) и дорабатываются поверх; вендорные мосты — из tools/out/volume-1030c/before.
 * Запуск: npx tsx tools/volume-install-1030c.ts [pal|bridge|vbridge|umb]
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, shade, mix, withA, type RGBA, type Ramp } from "./gen/canvas";
import { ROOT, readPng, writePng } from "./gen/vendor-lib";
import { LOOKS, OUT, tone } from "./gen/walls141-lib";
import { walls141Art } from "./gen/walls141-game";
import { BRIDGE_PIECES } from "./gen/factions";
import { P } from "./gen/palette";

const OBJ = path.join(ROOT, "client/public/assets/objects");
const BEFORE = path.join(ROOT, "tools/out/volume-1030c/before");
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "client/public/assets/manifest.json"), "utf8")).objects;
const only = process.argv.slice(2);
const want = (g: string) => !only.length || only.includes(g);
const lum = (c: RGBA) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const dist = (a: RGBA, b: RGBA) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function save(id: string, pc: PC) {
  const m = man[id];
  if (!m || m.w !== pc.w || m.h !== pc.h) { console.log("ПРОПУСК", id, `${pc.w}x${pc.h}`, m ? `${m.w}x${m.h}` : "нет в манифесте"); return; }
  writePng(pc, path.join(OBJ, id + ".png"));
}
const empty = (c: PC, x: number, y: number) => c.inside(x, y) && !c.alpha(x, y);
/** Мягкий слой: ставит цвет с альфой, если там пусто или слабее. */
function soft(c: PC, x: number, y: number, col: RGBA) {
  if (!c.inside(x, y)) return;
  const e = c.get(x, y);
  if (!e || e[3] === 0 || (e[3] < 255 && lum(e) < 60 && col[3] > e[3])) c.set(x, y, col);
}
const firstY = (c: PC, x: number) => { for (let y = 0; y < c.h; y++) if (c.alpha(x, y)) return y; return -1; };
const lastY = (c: PC, x: number) => { for (let y = c.h - 1; y >= 0; y--) if ((c.get(x, y)?.[3] ?? 0) > 200) return y; return -1; };

// ───────────── 1. частокол ─────────────
function palisade(id: string, c: PC) {
  const base = id.split("__")[0], faction = base.includes("umb") ? "umb" : base.includes("ember") || id.includes("ember") ? "ember" : "sol";
  const W: Ramp = (faction === "ember" ? LOOKS.ember : faction === "umb" ? LOOKS.umb_settle : LOOKS.sol_settle).wood;
  const pal: Ramp = [shade(W[0], 0.6), W[0], W[1], W[2], W[3], W[4]];
  const side = /(^|[-_])w-/.test(id) ? "w" : "e";
  const kind = base.startsWith("pal_h") ? "h" : base.startsWith("pal_v") ? "v" : base.startsWith("pal_post") ? "post" : base.startsWith("pal_corner") ? "corner" : "gate";
  const logs: [number, number][] = kind === "h" ? [[0, 8], [8, 8], [16, 8], [24, 8]] : kind === "v" ? [[16, 8]] : kind === "post" ? [[11, 10]]
    : kind === "corner" ? [[15, 10], ...(side === "e" ? [[24, 8], [32, 8]] : [[0, 8], [8, 8]]) as [number, number][]]
    : [[0, 16], [16, 16], [128, 16], [144, 16], ...Array.from({ length: 12 }, (_, k) => [32 + 8 * k, 8] as [number, number])];
  const src = c.clone();
  // 1) цилиндр: свет слева, тень справа, затемнение к земле; тон прилипает к 6-тоновой рампе дерева
  const done = new Set<number>();
  for (const [x0, w] of logs) for (let i = 0; i < w; i++) {
    const x = x0 + i; if (x < 0 || x >= c.w || done.has(x)) continue; done.add(x);
    const yt = firstY(src, x), yb = lastY(src, x); if (yt < 0) continue;
    for (let y = yt + 7; y <= yb; y++) {
      const o = src.get(x, y); if (!o || o[3] < 200) continue;
      if (kind === "gate" && w === 8 && y < 34) continue; // не трогаем вывеску
      if (o[0] < o[2] + 8) continue; // не дерево (камень насыпи, мох)
      let k = 1.18 - 0.56 * Math.pow((i + 0.5) / w, 1.1) + (i === 0 ? 0.1 : 0) + (i === w - 1 ? -0.14 : 0) + (faction === "umb" ? 0.3 * (1 - (i + 0.5) / w) : 0);
      const ao = yb - y; if (ao < 8) k *= 1 - 0.4 * (1 - ao / 8);
      let nc = shade(o, k), bi = 0, bd = 1e9;
      pal.forEach((p, j) => { const d = dist(nc, p); if (d < bd) { bd = d; bi = j; } });
      if (bd < 46) nc = pal[bi];
      nc[3] = 255; c.set(x, y, nc);
    }
  }
  // 2) контур — тёмный тон дерева, не чистый почти-чёрный
  const s2 = c.clone();
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const o = s2.get(x, y); if (!o || o[3] < 200 || dist(o, OUT) > 16) continue;
    let near = false, r = 0, g = 0, b = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = s2.get(x + dx, y + dy);
      if (!s2.inside(x + dx, y + dy) || !q || q[3] < 200) near = true;
      else if (dist(q, OUT) > 16) { r += q[0]; g += q[1]; b += q[2]; n++; }
    }
    if (near && n) c.set(x, y, [Math.round(r / n * 0.42 + 8), Math.round(g / n * 0.36 + 5), Math.round(b / n * 0.34 + 6), 255]);
  }
  // 3) контактная полоса и брошенная вправо тень на пустых пикселях у основания
  const yb0: number[] = []; for (let x = 0; x < c.w; x++) yb0[x] = lastY(src, x);
  for (let x = 0; x < c.w; x++) {
    const yb = yb0[x]; if (yb < 0) continue;
    for (let dx = 1; dx <= 7; dx++) for (let dy = 0; dy <= 2; dy++) {
      const px = x + dx, py = yb - dy + (dx > 3 ? 0 : 1);
      if (px < c.w && empty(c, px, py)) { const a = 120 - dx * 13 - dy * 28; if (a > 14) soft(c, px, py, withA([14, 10, 8, 255], a)); }
    }
    for (let dy = 1; dy <= 2; dy++) if (empty(c, x, yb + dy)) soft(c, x, yb + dy, withA([14, 10, 8, 255], 170 - dy * 60));
  }
}

// ───────────── 2. мосты ─────────────
const WD = P.wood;
const DARKW: RGBA = [6, 12, 28, 255];
function bridge(id: string, c: PC) {
  const horizontal = id.startsWith("bridge_h"), piece = id.endsWith("_end_w") || id.endsWith("_end_n") ? "endA" : id.endsWith("_end_e") || id.endsWith("_end_s") ? "endB" : id.endsWith("_mid2") ? "mid2" : id.endsWith("_mid") ? "mid" : "center";
  const along = piece === "center" ? 192 : 32, end = piece === "endA" || piece === "endB", rev = piece === "endB";
  const put = (a: number, b: number, col: RGBA, over = false) => { const A = rev ? along - 1 - a : a, x = horizontal ? A : b, y = horizontal ? b : A; if (over || empty(c, x, y)) c.set(x, y, col); };
  const softp = (a: number, b: number, col: RGBA) => { const A = rev ? along - 1 - a : a; soft(c, horizontal ? A : b, horizontal ? b : A, col); };
  const a0 = piece === "center" ? 0 : piece === "mid" ? 200 : piece === "mid2" ? 232 : 264, deckFrom = end ? 13 : 0;
  // въезд: утоптанная земля мягко растворяется в дороге (рваный край, сужение по бокам) — до порога
  if (end) for (let a = 0; a < 10; a++) for (let b = 8; b < (horizontal ? 72 : 88); b++) {
    const A = rev ? along - 1 - a : a, x = horizontal ? A : b, y = horizontal ? b : A, o = c.get(x, y); if (!o || !o[3]) continue;
    const lat = Math.min(b - 10, (horizontal ? 69 : 85) - b), t = (a + 0.5) / 9;
    const keep = hash01(a, b, 61) < Math.min(1, t * 1.05 + 0.12) && (lat >= 4 || hash01(a, b, 62) < 0.25 + lat * 0.18 + t * 0.4);
    if (!keep) c.clear(x, y); else c.set(x, y, [o[0], o[1], o[2], Math.min(255, Math.round(70 + t * 230))]);
  }
  if (horizontal) {
    // брус-лежень под торцом настила с торцами досок; плотная тень на воде под мостом
    for (let a = deckFrom; a < along; a++) {
      const pa = (a + a0) % 8;
      put(a, 78, pa === 7 ? WD[0] : WD[1]); put(a, 79, WD[0]);
      for (let b = 80; b < 94; b++) softp(a, b, withA(DARKW, Math.max(0, Math.round(215 - (b - 80) * 15 - (pa === 7 ? 0 : 0)))));
    }
    const piles = piece === "center" ? [14, 58, 102, 146] : piece === "mid2" ? [13] : [];
    for (const a of piles) {
      for (let b = 92; b < 96; b++) for (let k = -1; k < 8; k++) softp(a + k, b, withA(DARKW, 150 - (b - 92) * 30)); // отражение сваи
      for (let k = 0; k < 6; k++) { put(a + k, 77, k === 0 ? WD[3] : WD[2], true); } // шапка сваи у лежня
    }
    if (piece === "center") for (let i = 0; i < 3; i++) for (let a = piles[i] + 6; a < piles[i + 1]; a++) { // раскос между сваями
      const t = (a - piles[i] - 6) / (piles[i + 1] - piles[i] - 6), b = Math.round(81 + t * 7);
      put(a, b, WD[1]); put(a, b + 1, WD[0]);
    }
    if (end) for (let a = 22; a < 30; a++) for (let b = 92; b < 96; b++) softp(a, b, withA(DARKW, 140 - (b - 92) * 30)); // тень устоя на воде
  } else {
    // правая грань (в тени): брус с торцами досок и тень на воде справа
    for (let a = deckFrom; a < along; a++) {
      const pa = (a + a0) % 8;
      put(a, 88, pa === 7 ? WD[0] : WD[2]); put(a, 89, WD[1]); put(a, 90, WD[0]);
      for (let b = 91; b < 96; b++) softp(a, b, withA(DARKW, 190 - (b - 91) * 36));
    }
    for (let a = deckFrom; a < along; a += 1) for (let b = 0; b < 2; b++) softp(a, b, withA(DARKW, 40));
    const piles = piece === "center" ? [20, 68, 116, 164] : piece === "mid2" ? [12] : [];
    for (const a of piles) for (let k = 0; k < 6; k++) { put(a + k, 5, k === 0 ? WD[2] : WD[0]); softp(a + k + 1, 6, withA(DARKW, 110)); }
  }
}

// ───────────── 3. вендорные мосты _v ─────────────
function vbridge(id: string): PC {
  const c = readPng(path.join(BEFORE, id + ".png")), rope = id.includes("rope");
  let x0 = c.w, x1 = -1; for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const src = c.clone();
  // правая грань настила/парапета в тени (3 px), левая кромка светлее
  for (let y = 0; y < c.h; y++) {
    for (let i = 0; i < 3; i++) { const o = src.get(x1 - i, y); if (o && o[3] > 200) c.set(x1 - i, y, shade(o, 0.78 - i * 0.12 - (i === 0 ? 0 : 0))); }
    const l = src.get(x0 + 1, y); if (l && l[3] > 200) c.set(x0 + 1, y, shade(l, 1.15));
  }
  // сваи/устои уходят в воду по краям, тень на воде от настила
  const pier = rope ? [WD[3], WD[2], WD[1], WD[0]] : [P.stone[3], P.stone[2], P.stone[1], P.stone[0]];
  for (let y = 0; y < c.h; y++) {
    const yy = y;
    for (const side of [1, -1]) {
      const xe = side > 0 ? x1 : x0, room = side > 0 ? c.w - 1 - x1 : x0;
      for (let d = 1; d <= room; d++) { const x = xe + side * d; if (empty(c, x, yy)) { const s = yy > 4 ? src.get(xe, yy - 4) : null; if (s && s[3] > 200) soft(c, x, yy, withA(DARKW, Math.round((side > 0 ? 190 : 90) - d * 28))); } }
    }
  }
  for (let a = 44; a < c.h - 20; a += 56) for (const side of [1, -1]) {
    const xe = side > 0 ? x1 : x0, room = Math.min(4, side > 0 ? c.w - 1 - x1 : x0);
    for (let d = 1; d <= room; d++) for (let k = 0; k < 10; k++) { const x = xe + side * d; c.set(x, a + k, k === 0 ? pier[0] : d === (side > 0 ? room : 1) ? pier[1] : k > 7 ? pier[3] : pier[2]); }
    for (let d = -1; d <= room + 1; d++) { const x = xe + side * d; if (empty(c, x, a + 10)) c.set(x, a + 10, withA(P.water[4], 200)); }
    for (let d = 0; d <= room; d++) { const x = xe + side * d; if (empty(c, x, a + 11)) c.set(x, a + 11, withA(DARKW, 110)); }
  }
  return c;
}

// ───────────── 4. дома Умбрата ─────────────
const bright = (r: Ramp, k: number, tintC: RGBA, t: number): Ramp => r.map((c) => mix(shade(c, k), tintC, t));
function umbLooks() {
  // стены — средний холодный серо-фиолетовый камень; кровля — глубже и темнее стен (три зоны яркости)
  const wall = (r: Ramp) => bright(r, 1.9, [150, 140, 175, 255], 0.1);
  for (const id of ["umb_capital", "umb_fort", "umb_settle"]) {
    const L = LOOKS[id];
    L.stone = wall(L.stone); L.mortar = shade(L.mortar, 1.2);
    L.roofs = L.roofs.map((r) => bright(r, 0.62, [30, 14, 48, 255], 0.14));
    L.glass = [L.glass[0], mix(L.glass[1], [150, 80, 255, 255], 0.4), [248, 220, 255, 255]];
  }
}
const isGlass = (o: RGBA) => o[3] > 200 && o[2] > 170 && o[2] > o[1] + 55 && o[0] < o[2] - 10;
function umbHouse(id: string, c: PC) {
  const src = c.clone(), zig = id.startsWith("umb_ziggurat");
  // низ тела: самая частая нижняя строка среди колонок
  const cnt = new Map<number, number>(); for (let x = 0; x < c.w; x++) { const y = lastY(src, x); if (y > 0) cnt.set(y, (cnt.get(y) ?? 0) + 1); }
  let yBase = 0, best = 0; for (const [y, n] of cnt) if (n > best || (n === best && y > yBase)) { best = n; yBase = y; }
  // 1) цоколь — самая светлая зона: светлая кромка, лицо, тёмный низ
  for (let x = 0; x < c.w; x++) {
    const yb = lastY(src, x); if (yb < yBase - 2) continue;
    for (let y = yBase - 6; y <= yBase; y++) {
      const o = src.get(x, y); if (!o || o[3] < 200 || isGlass(o)) continue;
      c.set(x, y, y === yBase - 6 ? shade(o, 1.75) : y === yBase ? shade(o, 0.7) : shade(mix(o, [190, 182, 205, 255], 0.16), 1.3));
    }
  }
  // 2) карниз: тень от свеса на стену, светлая кромка на нижнем ряду кровли
  if (!zig) for (let x = 0; x < c.w; x++) {
    let yr = -1;
    for (let y = firstY(src, x); y >= 0 && y < yBase - 10; y++) {
      const o = src.get(x, y); if (!o || o[3] < 200) continue;
      let m0 = 0, m1 = 0; for (let k = 0; k < 4; k++) { m0 += lum(src.get(x, y - 1 - k) ?? [0, 0, 0, 0]); m1 += lum(src.get(x, y + k) ?? [0, 0, 0, 0]); }
      if (y > firstY(src, x) + 5 && m0 / 4 < 40 && m1 / 4 > 52) { yr = y; break; }
    }
    if (yr < 0) continue;
    const r = src.get(x, yr - 1); if (r) c.set(x, yr - 1, shade(r, 1.9));
    for (let k = 0; k < 6; k++) { const o = src.get(x, yr + k); if (o && o[3] > 200 && !isGlass(o)) c.set(x, yr + k, shade(o, 0.45 + k * 0.09)); }
  }
  // 3) освещённые окна: яркое ядро и ореол на стене (ночью читаются как источник света)
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const o = src.get(x, y); if (!o || !isGlass(o)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = src.get(x + dx, y + dy); if (!q || q[3] < 200 || isGlass(q)) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)), cur = c.get(x + dx, y + dy)!;
      c.set(x + dx, y + dy, mix(cur, [120, 60, 220, 255], d === 1 ? 0.3 : 0.12));
    }
  }
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const o = src.get(x, y); if (o && isGlass(o)) c.set(x, y, mix(o, [255, 235, 255, 255], 0.22)); }
}

// ───────────── запуск ─────────────
if (want("pal") || want("umb")) {
  if (want("umb")) umbLooks();
  const art = walls141Art();
  for (const [id, f] of Object.entries(art)) {
    const isPal = id.startsWith("pal_"), isUmb = /^umb_(house|crypt|ziggurat)(__|$)/.test(id);
    if (!(isPal && want("pal")) && !(isUmb && want("umb"))) continue;
    const c = f();
    if (isPal) palisade(id, c); else umbHouse(id, c);
    save(id, c);
  }
}
if (want("bridge")) for (const [id, f] of Object.entries(BRIDGE_PIECES)) { const c = f(); bridge(id, c); save(id, c); }
if (want("vbridge")) for (const id of ["v_bridges_stone_v", "v_bridges_rope_v", "v_bridges_brick_v"]) save(id, vbridge(id));
console.log("готово");
