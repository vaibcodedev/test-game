/**
 * Цитадель Хаоса v2 (рейд, флаг клиента __citadelV2 — client/src/game/citadelV2.ts): вся архитектура зала одной картинкой на карту
 * и объекты с объёмом. Клетки карты (проходимость) не меняются — рисунок повторяет их (docs/art-perspective.md):
 *  - зал на уровне 0, помост босса +8 px (ступень 4 + 4) по кругу, печать рун на нём;
 *  - лава в чаше на 14 px ниже пола: под дальним берегом видна внутренняя стенка с отсветом, у ближнего — только кромка;
 *  - север — стена цитадели 104 px с зубцами, шипами, знамёнами, бойницами, огненными чашами и вратами; по краям — башни с рогатыми крышами;
 *  - юг — каменный берег чаши и обрыв в пропасть (торец плит, темнота, багровый отсвет снизу); мост с парапетами, Преддверие над пропастью;
 *  - объекты: колонны 2×2 с плинтом, врата моста, жаровни; огонь — лист 12 кадров (клиент), свечение — слой _emit.
 * Пишет client/public/assets/citadel/*.png и data/citadel.json (объекты карты, огни). Запуск под замком: npx tsx tools/gen/citadel.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, hex, mix, ramp, type RGBA, type Ramp } from "./canvas";
import { vn, dq } from "./floors";
import { paintMap } from "./floors-maps";
import { CELL_BLOCK, T, type MapObject, type WorldMap } from "../../shared/map";
import { generateRaidMap, RAID, RAID_PILLARS } from "../../shared/raid";

const S = 32, OUT = path.resolve("client/public/assets/citadel"), PREV = path.resolve("tools/out/citadel");
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const put = (pc: PC, x: number, y: number, c: RGBA) => { if (!pc.inside(x, y)) return; const i = (y * pc.w + x) * 4; pc.data[i] = c[0]; pc.data[i + 1] = c[1]; pc.data[i + 2] = c[2]; pc.data[i + 3] = c[3]; };
/** Свечение в слой _emit: максимум по альфе. */
const glowPx = (e: PC, x: number, y: number, c: RGBA, a: number) => { const o = e.get(x, y); if (!o) return; const na = Math.round(clamp(a) * 255); if (na > o[3]) put(e, x, y, [c[0], c[1], c[2], na]); };
const tint = (c: RGBA, k: number, warm: RGBA, t: number): RGBA => { const d = mix(c, warm, clamp(t)); return [clamp(d[0] * k, 0, 255), clamp(d[1] * k, 0, 255), clamp(d[2] * k, 0, 255), c[3]].map(Math.round) as RGBA; };

// ---------------------------------------------------------------- палитра хаоса (латы босса: docs/raid.md §8)
const STONE = ramp("#0b090d", "#141016", "#241c22", "#3a2c30", "#54403c", "#6e5650");
const DSTONE = ramp("#08070a", "#100d12", "#1a1519", "#271f24", "#382b2e");
const IRON = ramp("#0a090d", "#17151c", "#28242e", "#3e3844", "#5c5462", "#857a86");
const EMBER = ramp("#3a0806", "#7a140a", "#c0300e", "#ff6a1a", "#ffb04a", "#ffe8a0");
const CLOTH = ramp("#12050a", "#2a0a10", "#4a1016", "#6e1a1a", "#922a1e");
const GOLD = ramp("#4a2a0c", "#8a5214", "#c8862a", "#f0b84a");
const VOID: RGBA = hex("#060409");
const LAVA_LIGHT: RGBA = [255, 110, 36, 255];
const EM_RED: RGBA = [255, 70, 24, 255], EM_ORANGE: RGBA = [255, 140, 50, 255];

// ---------------------------------------------------------------- геометрия (как клетки карты)
const m0 = generateRaidMap();
const MAP = RAID.map;
const W = m0.w * S, H = m0.h * S;
const HX = MAP.hall.x, HY = MAP.hall.y, RX = MAP.hall.rx, RY = MAP.hall.ry, LAVA = MAP.lava;
const BOSS = { x: MAP.bossHome.x * S, y: MAP.bossHome.y * S };
const pillarCells = new Set<number>();
for (const p of RAID_PILLARS) for (let j = -1; j < 1; j++) for (let i = -1; i < 1; i++) pillarCells.add((p.y / S + j) * m0.w + p.x / S + i);
const walkCell = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < m0.w && cy < m0.h && (!(m0.cell[cy * m0.w + cx] & CELL_BLOCK) || pillarCells.has(cy * m0.w + cx));

/** Сглаженная маска проходимых клеток (Гаусс σ≈10 px на сетке 4 px): граница — по краю клеток, углы скруглены. */
const G4 = 4, GW = W / G4, GH = H / G4;
const walkF = (() => {
  const a = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) a[y * GW + x] = walkCell(Math.floor((x * G4 + 2) / S), Math.floor((y * G4 + 2) / S)) ? 1 : 0;
  const sig = 2.4, R = 6, k: number[] = [];
  for (let i = -R; i <= R; i++) k.push(Math.exp(-(i * i) / (2 * sig * sig)));
  const ks = k.reduce((s, v) => s + v, 0);
  const b = new Float32Array(GW * GH), c = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let s = 0; for (let i = -R; i <= R; i++) s += a[y * GW + clamp(x + i, 0, GW - 1)] * k[i + R]; b[y * GW + x] = s / ks; }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let s = 0; for (let i = -R; i <= R; i++) s += b[clamp(y + i, 0, GH - 1) * GW + x] * k[i + R]; c[y * GW + x] = s / ks; }
  return (x: number, y: number) => {
    const gx = (x + 0.5) / G4 - 0.5, gy = (y + 0.5) / G4 - 0.5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const g = (i: number, j: number) => c[clamp(j, 0, GH - 1) * GW + clamp(i, 0, GW - 1)];
    return g(ix, iy) * (1 - fx) * (1 - fy) + g(ix + 1, iy) * fx * (1 - fy) + g(ix, iy + 1) * (1 - fx) * fy + g(ix + 1, iy + 1) * fx * fy;
  };
})();
const ell = (tx: number, ty: number, pad: number) => ((tx - HX) / (RX + pad)) ** 2 + ((ty - HY) / (RY + pad)) ** 2;
/** «Насколько на севере» точка (0 — середина зала, 1 — верх). */
const northK = (ty: number) => clamp((HY - ty) / (RY + 3));
/** Ширина чаши лавы от края зала (тайлы): на севере узкий ров у стены, к башням и на юге — 2.5. */
const basinPad = (ty: number) => LAVA - 1.5 * sstep(0.2, 0.55, northK(ty));
const WALL_K = 0.1; // севернее — стена цитадели
const WALL_H = 104, PARA_H = 14, LAVA_D = 14, CLIFF_D = 44;
const B = MAP.bridge, A = MAP.antechamberRect;
const BR = { x0: (B.x0 - 1) * S, x1: (B.x1 + 1) * S, y0: 31.5 * S, y1: 36 * S }; // основание моста с парапетами
const PARA = [{ x0: BR.x0 + 3, x1: B.x0 * S }, { x0: B.x1 * S - 0, x1: BR.x1 - 3 }].map((r) => ({ ...r, y0: 32 * S + PARA_H, y1: 34 * S }));
const PADS = [{ x0: 19 * S, x1: 21 * S, y0: 34 * S, y1: 36 * S }, { x0: 27 * S, x1: 29 * S, y0: 34 * S, y1: 36 * S }];
const FENCE = [{ x0: (A.x0) * S + 4, x1: (A.x0 + 1) * S }, { x0: (A.x1 - 1) * S, x1: A.x1 * S - 4 }].map((r) => ({ ...r, y0: A.y0 * S, y1: (A.y1 - 1) * S }));
const inR = (r: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
/** Башни: центр основания (px), радиус, высота стены башни. */
const TOWERS = [-1, 1].map((s) => ({ x: (HX + s * 19.3) * S, y: 17.4 * S, r: 2.35 * S, h: 150 }));

const enum K { Void, Floor, Lava, Rim, Wall, Bridge, Pad, Fence }
const cls = new Uint8Array(W * H);
/** Материал пола: 0 зал, 1 берег/Преддверие, 2 мост. */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const tx = (x + 0.5) / S, ty = (y + 0.5) / S;
  let k: K;
  const f = walkF(x, y) + (vn(x, y, 6, 6, 77) - 0.5) * 0.08;
  if (f >= 0.5) k = K.Floor;
  else if (inR(BR, x, y)) k = K.Bridge;
  else if (PADS.some((r) => inR(r, x, y))) k = K.Pad;
  else if (FENCE.some((r) => inR(r, x, y))) k = K.Fence;
  else if (ell(tx, ty, basinPad(ty)) <= 1) k = K.Lava;
  else if (northK(ty) > WALL_K) k = K.Wall;
  else if (ell(tx, ty, LAVA + 1.15 + (vn(x, y, 10, 10, 5) - 0.5) * 0.25) <= 1) k = K.Rim;
  else k = K.Void;
  cls[y * W + x] = k;
}
// проверка: ни один пиксель проходимой клетки (кроме края сглаживания 8 px) не ушёл в лаву, стену или пропасть
{
  let bad = 0;
  for (let cy = 0; cy < m0.h; cy++) for (let cx = 0; cx < m0.w; cx++) {
    if (!walkCell(cx, cy) || pillarCells.has(cy * m0.w + cx)) continue;
    for (let ly = 8; ly < S - 8; ly++) for (let lx = 8; lx < S - 8; lx++) if (cls[(cy * S + ly) * W + cx * S + lx] !== K.Floor) bad++;
  }
  let over = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cls[y * W + x] === K.Floor && !walkCell(Math.floor(x / S), Math.floor(y / S))) { const cx = Math.floor(x / S), cy = Math.floor(y / S), lx = x - cx * S, ly = y - cy * S; if (Math.min(lx, ly, S - 1 - lx, S - 1 - ly) >= 8) over++; }
  console.log(`проверка следа: проходимых пикселей вне пола ${bad}, пола в глубине непроходимых клеток ${over}`);
  if (bad || over) throw new Error("рисунок пола не совпадает с клетками");
}
const ground = (k: number) => k === K.Floor || k === K.Rim || k === K.Bridge || k === K.Pad || k === K.Fence;
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? K.Void : cls[y * W + x]);

// ---------------------------------------------------------------- объекты v2 (data/citadel.json)
type Fire = { x: number; y: number; s: number; d: number };
const objects: MapObject[] = [];
const fires: Fire[] = [];
const glows: { x: number; y: number; c: number; s: number; a: number; f?: boolean }[] = [];
for (const p of RAID_PILLARS) { objects.push({ kind: "cit_pillar", x: p.x, y: p.y + S }); fires.push({ x: p.x, y: p.y + S - 134, s: 1, d: p.y + S + 1 }); glows.push({ x: p.x, y: p.y + S - 140, c: 0xff6a2a, s: 1.6, a: 0.55, f: true }); }
objects.push({ kind: "cit_gate", x: 24 * S, y: 36 * S });
for (const gx of [-128, 128]) { fires.push({ x: 24 * S + gx, y: 36 * S - 128, s: 1.2, d: 36 * S + 1 }); glows.push({ x: 24 * S + gx, y: 36 * S - 134, c: 0xff6a2a, s: 2, a: 0.6, f: true }); }
const braziers: { x: number; y: number }[] = [];
for (const deg of [16, 40, 62, 118, 140, 164]) {
  const a = (deg * Math.PI) / 180, r = LAVA + 0.6;
  braziers.push({ x: Math.round((HX + Math.cos(a) * (RX + r)) * S), y: Math.round((HY + Math.sin(a) * (RY + r)) * S) });
}
braziers.push({ x: A.x0 * S + 16, y: (A.y1 - 1) * S - 2 }, { x: (A.x1 - 1) * S + 16, y: (A.y1 - 1) * S - 2 });
for (const b of braziers) { objects.push({ kind: "cit_brazier", x: b.x, y: b.y }); fires.push({ x: b.x, y: b.y - 27, s: 1, d: b.y + 1 }); glows.push({ x: b.x, y: b.y - 30, c: 0xff7a30, s: 2.2, a: 0.6, f: true }); }
// с прежней карты: кости и черепа у края пола, портал; огонь и холмики в лаве — уже не нужны (лава ниже пола)
for (const o of m0.objects) if (o.kind === "raid_portal" || o.kind === "bones" || o.kind === "bone_pile" || o.kind.startsWith("v_volcano_skull") || o.kind === "v_volcano_ribs") {
  if (o.kind !== "raid_portal" && Math.hypot(o.x - BOSS.x, o.y - BOSS.y) < 6 * S) continue;
  objects.push(o);
}

// ---------------------------------------------------------------- пол (tools/gen/floors-maps.ts) — три материала, выбор по классу
const lightObjs: MapObject[] = [...braziers.map((b) => ({ kind: "brazier", x: b.x, y: b.y }))];
const fake = (t: number): WorldMap => ({ ...m0, vtx: new Uint8Array(m0.vtx.length).fill(t), cell: new Uint8Array(m0.cell.length), objects: lightObjs });
console.log("пол…");
const FL = [paintMap(fake(T.Obsidian), "cit_hall", 303, false, true), paintMap(fake(T.Basalt), "cit_rim", 304, false), paintMap(fake(T.Cobble), "cit_bridge", 305, false, true)];
const bg = new PC(W, H), emit = new PC(W, H);
const matOf = (x: number, y: number, k: number) => (k === K.Bridge || k === K.Pad || (k === K.Floor && y >= 31.5 * S && y < A.y0 * S && x > BR.x0 && x < BR.x1) ? 2 : k === K.Rim || k === K.Fence || (k === K.Floor && y >= A.y0 * S) ? 1 : 0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = cls[y * W + x]; if (!ground(k)) continue;
  const mi = matOf(x, y, k), c = FL[mi].floor.get(x, y)!;
  // берег темнее и грубее зала, Преддверие — чуть теплее
  put(bg, x, y, mi === 1 ? tint(c, 0.82, hex("#2a1a1a"), 0.15) : mi === 2 ? tint(c, 0.62, hex("#3a2626"), 0.25) : c);
  const e = FL[mi].emit.get(x, y)!; if (e[3]) put(emit, x, y, e);
}

// ---------------------------------------------------------------- помост босса: круг, ступень 4 + 4, печать рун
{
  const RS = 5.6 * S, RD = RS - 12, cx = BOSS.x, cy = BOSS.y;
  const plate = (x: number, gy: number) => {
    // пластины помоста: кольца и секторы, швы тёмные, верх светлее у северо-западного края
    const dx = x - cx, dy = gy - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ring = r < 34 ? 0 : r < 92 ? 1 : r < 140 ? 2 : 3;
    const sect = ring === 0 ? 0 : Math.floor(((a + Math.PI) / (Math.PI * 2)) * [1, 8, 16, 24][ring] + (ring === 2 ? 0.5 : 0));
    const edgeR = [0, 34, 92, 140][ring], nb = [34, 92, 140, RD][ring];
    const sa = ((a + Math.PI) / (Math.PI * 2)) * [1, 8, 16, 24][ring] + (ring === 2 ? 0.5 : 0);
    const seam = (ring > 0 && (Math.abs(r - edgeR) < 1.2)) || (ring > 0 && Math.abs(sa - Math.round(sa)) * ((Math.PI * 2 * r) / [1, 8, 16, 24][ring]) < 0.9);
    let v = 2.5 + (hash01(ring, sect, 9) - 0.5) * 0.6 + (vn(x, gy, 9, 9, 31) - 0.5) * 0.5 - (dx + dy) / (RD * 6);
    if (Math.abs(r - (nb - 2)) < 1) v -= 0.6; else if (Math.abs(r - edgeR - 2) < 1) v += 0.5;
    if (seam) return { c: STONE[0], glow: 0 };
    // печать: кольцо рун на радиусе 148–162 (печать r 5–6 клеток), лучи раскалённых жил к центру
    let glow = 0;
    if (r > 146 && r < 164) {
      const t = ((a + Math.PI) / (Math.PI * 2)) * 48, ti = Math.floor(t), u = t - ti, rr = (r - 146) / 18;
      const g = hash01(ti, 3, 41), stroke = (g < 0.33 ? Math.abs(u - 0.5) < 0.12 : g < 0.66 ? Math.abs(rr - 0.5) < 0.12 && u > 0.2 && u < 0.8 : Math.abs(u - rr) < 0.12) && rr > 0.15 && rr < 0.85;
      if (Math.abs(r - 146.5) < 1 || Math.abs(r - 163.5) < 1) return { c: EMBER[1], glow: 0.35 };
      v -= 0.8;
      if (stroke) glow = 1;
    }
    const ang = ((a + Math.PI) / (Math.PI * 2)) * 6;
    if (r > 30 && r < 140 && Math.abs(ang - Math.round(ang)) * r * 1.05 < 1.3 - r / 260 + (vn(x, gy, 3, 3, 8) - 0.5) * 0.8) glow = Math.max(glow, 0.85 - r / 300);
    if (r < 30 && Math.abs(r - 24) < 1.4) glow = 0.9;
    return { c: dq(STONE, v, x, gy), glow };
  };
  for (let x = Math.floor(cx - RS - 1); x <= cx + RS + 1; x++) {
    const dx = x - cx;
    if (Math.abs(dx) > RS) continue;
    const hs = Math.sqrt(RS * RS - dx * dx), hd = Math.abs(dx) <= RD ? Math.sqrt(RD * RD - dx * dx) : -1;
    // ступень: проступь (ширина кольца RS−RD) и подступёнок 4 px
    for (let sy = Math.floor(cy - hs - 4); sy <= cy + hs + 2; sy++) {
      const gy = sy + 4;
      if (Math.hypot(dx, gy - cy) <= RS) {
        const nearEdge = RS - Math.hypot(dx, gy - cy) < 1.2;
        put(bg, x, sy, nearEdge && gy - cy < 0 ? STONE[4] : dq(STONE, 2.9 - (dx + gy - cy) / (RS * 4) + (vn(x, sy, 5, 5, 3) - 0.5) * 0.4, x, sy));
      } else if (sy > cy && sy <= cy + hs) {
        // подступёнок: темнее верха, светлее слева
        const k = sy - (cy + hs - 4);
        put(bg, x, sy, k <= 1 ? STONE[4] : dq(STONE, 1.6 - dx / (RS * 2.2) - k * 0.08, x, sy));
        glowPx(emit, x, sy, EM_RED, 0);
      } else if (sy > cy + hs && sy <= cy + hs + 2) {
        const c = bg.get(x, sy)!; put(bg, x, sy, tint(c, sy - (cy + hs) === 1 ? 0.55 : 0.75, c, 0));
      }
    }
    if (hd < 0) continue;
    for (let sy = Math.floor(cy - hd - 8); sy <= cy + hd - 4; sy++) {
      const gy = sy + 8;
      if (Math.hypot(dx, gy - cy) <= RD) {
        const p = plate(x, gy);
        const edge = RD - Math.hypot(dx, gy - cy) < 1.2;
        put(bg, x, sy, edge ? STONE[5] : p.c);
        if (p.glow > 0) { put(bg, x, sy, mix(p.c, EMBER[p.glow > 0.8 ? 4 : 3], 0.75 * p.glow)); glowPx(emit, x, sy, EM_ORANGE, 0.6 * p.glow); }
      } else if (sy > cy) {
        const k = sy - (cy + hd - 8);
        put(bg, x, sy, k <= 1 ? STONE[4] : dq(STONE, 1.5 - dx / (RD * 2.2) - k * 0.1, x, sy));
      }
    }
    // тень ступени на проступь под верхним подступёнком
    const ty = Math.round(cy + hd - 4) + 1;
    if (hd > 0) for (const yy of [ty, ty + 1]) { const c = bg.get(x, yy); if (c) put(bg, x, yy, tint(c, yy === ty ? 0.6 : 0.8, c, 0)); }
  }
}

// ---------------------------------------------------------------- лава ниже пола, обрыв в пропасть, кромки
const stoneBlock = (x: number, k: number, salt: number, rowH = 9) => {
  // кладка торца: ряды rowH px, блоки 14–30 px, верх блока светлее, низ — шов
  const row = Math.floor(k / rowH), ly = k - row * rowH;
  const off = Math.floor(hash01(row, salt, 13) * 30);
  const bw = 14 + Math.floor(hash01(row, salt, 17) * 16), bx = Math.floor((x + off) / bw), lx = x + off - bx * bw;
  if (ly === rowH - 1 || lx === 0) return { v: -1.2, seam: true, id: bx * 31 + row };
  return { v: (ly === 0 ? 0.5 : 0) + (lx === 1 ? 0.25 : 0) + (lx === bw - 1 ? -0.3 : 0) + (hash01(bx, row, salt) - 0.5) * 0.5, seam: false, id: bx * 31 + row };
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = cls[y * W + x];
  if (k === K.Lava) {
    // внутренняя стенка: над пикселем на расстоянии ≤ LAVA_D — берег или стена
    let d = 0;
    for (let j = 1; j <= LAVA_D; j++) { const q = at(x, y - j); if (q !== K.Lava) { if (ground(q) || q === K.Wall) d = j; break; } }
    if (d) {
      const b = stoneBlock(x, d - 1, 3, 7), t = d / LAVA_D;
      let c = b.seam ? STONE[0] : dq(STONE, 2.0 + b.v - t * 1.2, x, y);
      c = tint(c, 1, EMBER[3], t ** 1.6 * 0.75);
      if (d >= LAVA_D - 1) c = mix(EMBER[4], EMBER[3], d - LAVA_D + 1);
      put(bg, x, y, c);
      glowPx(emit, x, y, EM_ORANGE, t ** 2 * 0.7);
    } else {
      // лава: прозрачно (анимированная лава слоя тайлов), у кромки — тёмная корка и тень стенки
      let below = 99;
      for (let j = LAVA_D + 1; j <= LAVA_D + 5; j++) if (at(x, y - j) !== K.Lava) { below = j - LAVA_D; break; }
      let edge = 99;
      for (let j = 1; j <= 5; j++) if (at(x, y + j) !== K.Lava || at(x - j, y) !== K.Lava || at(x + j, y) !== K.Lava) { edge = j; break; }
      if (below <= 4) put(bg, x, y, [40, 8, 4, Math.round(200 - below * 40)]);
      else if (edge <= 4) put(bg, x, y, [60, 14, 6, Math.round(230 - edge * 50)]);
    }
  } else if (k === K.Void) {
    let d = 0;
    for (let j = 1; j <= CLIFF_D; j++) { const q = at(x, y - j); if (q !== K.Void) { if (ground(q)) d = j; break; } }
    if (d) {
      // торец плит: верхние 3 px — плита, ниже кладка, уходит в черноту; снизу багровый отсвет
      const t = d / CLIFF_D;
      const b = stoneBlock(x, d - 1, 7, 10);
      let c = d <= 3 ? dq(STONE, 2.6 - d * 0.4, x, y) : b.seam ? DSTONE[0] : dq(STONE, 2.0 + b.v - t * 2.4, x, y);
      c = mix(c, VOID, sstep(0.45, 1, t));
      c = tint(c, 1, [120, 20, 10, 255], sstep(0.6, 1, t) * 0.35);
      put(bg, x, y, c);
    } else {
      const n = vn(x, y, 90, 70, 21) * 0.6 + vn(x, y, 30, 24, 22) * 0.4;
      let c = mix(VOID, hex("#2a0709"), clamp((n - 0.35) * 1.4) * 0.8);
      const h = hash01(x >> 1, y >> 1, 23);
      if (h < 0.0016 && ((x ^ y) & 1) === 0) { c = mix(c, EMBER[3], 0.7); glowPx(emit, x, y, EM_ORANGE, 0.5); }
      put(bg, x, y, c);
    }
  } else if (ground(k)) {
    // кромки: юг (дальше торец вниз) — светлая кромка, север у лавы — губа, бока — свет слева/тень справа
    const s = at(x, y + 1), n = at(x, y - 1), w = at(x - 1, y), e = at(x + 1, y);
    const c = bg.get(x, y)!;
    if (!ground(s) && s !== K.Wall) put(bg, x, y, mix(c, STONE[5], 0.7));
    else if (!ground(n) && n !== K.Wall) put(bg, x, y, mix(c, STONE[5], 0.45));
    else if (!ground(w) && w !== K.Wall) put(bg, x, y, mix(c, STONE[4], 0.5));
    else if (!ground(e) && e !== K.Wall) put(bg, x, y, mix(c, STONE[0], 0.5));
    else if (!ground(at(x, y + 2)) && at(x, y + 2) !== K.Wall) put(bg, x, y, mix(c, STONE[4], 0.25));
  }
}
// отсвет лавы на пол и берег у края чаши (радиус 36 px)
{
  const dist = new Float32Array(W * H).fill(1e9);
  for (let i = 0; i < W * H; i++) if (cls[i] === K.Lava) dist[i] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y) dist[i] = Math.min(dist[i], dist[i - W] + 1); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!ground(cls[i]) || dist[i] > 36) continue;
    const t = (1 - dist[i] / 36) ** 2;
    put(bg, x, y, tint(bg.get(x, y)!, 1 + t * 0.35, LAVA_LIGHT, t * 0.3));
    glowPx(emit, x, y, EM_ORANGE, t * 0.35);
  }
}

// ---------------------------------------------------------------- парапеты моста и решётка Преддверия
for (const r of PARA) {
  for (let x = r.x0; x < r.x1; x++) for (let gy = r.y0; gy < r.y1; gy++) {
    const sy = gy - PARA_H, lx = x - r.x0, w = r.x1 - r.x0;
    put(bg, x, sy, lx === 0 ? STONE[5] : lx === w - 1 ? STONE[1] : dq(STONE, 3.1 - lx / w + (vn(x, gy, 4, 6, 9) - 0.5) * 0.4, x, sy));
  }
  // торец на юге (к вратам) и тень от парапета на мост справа
  for (let x = r.x0; x < r.x1; x++) for (let k = 0; k < PARA_H; k++) { const sy = r.y1 - PARA_H + k, b = stoneBlock(x, k, 11, 7); put(bg, x, sy, b.seam ? STONE[0] : dq(STONE, 1.9 + b.v - k / PARA_H * 0.5, x, sy)); }
  for (let x = r.x0; x < r.x1; x++) { put(bg, x, r.y0 - PARA_H, STONE[5]); }
  if (r.x1 <= B.x0 * S) for (let gy = r.y0 - PARA_H; gy < r.y1; gy++) for (let j = 0; j < 4; j++) { const c = bg.get(r.x1 + j, gy); if (c && cls[gy * W + r.x1 + j] === K.Floor) put(bg, r.x1 + j, gy, tint(c, 0.6 + j * 0.1, c, 0)); }
}
for (const r of FENCE) {
  // кованая решётка: прутья 2 px через 6 px, острия, поперечины; основание — плинт 6 px
  const cx0 = r.x0, w = r.x1 - r.x0;
  for (let gy = r.y0; gy < r.y1; gy++) for (let x = cx0; x < r.x1; x++) {
    const lx = x - cx0; put(bg, x, gy, lx === 0 || lx === w - 1 ? STONE[1] : dq(STONE, 2.6 - lx / w * 0.8, x, gy));
  }
  for (let gy = r.y0 + 4; gy <= r.y1; gy += 6) {
    const bx = cx0 + Math.floor(w / 2);
    for (let h = 0; h < 22; h++) { put(bg, bx, gy - h, IRON[h > 18 ? 4 : 3]); put(bg, bx + 1, gy - h, IRON[1]); }
    put(bg, bx, gy - 22, IRON[5]);
  }
  for (const hh of [6, 16]) for (let gy = r.y0; gy < r.y1; gy++) { const bx = cx0 + Math.floor(w / 2); put(bg, bx - 1, gy - hh, IRON[2]); put(bg, bx + 2, gy - hh, IRON[1]); }
}

// ---------------------------------------------------------------- северная стена цитадели
const baseY = new Int32Array(W).fill(-1); // основание фасада (последний ряд стены) по столбцу
for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (cls[y * W + x] === K.Wall) { baseY[x] = y; break; }
// гладкость основания для знамён и врат
const flat = (x: number, r: number) => { let mn = 1e9, mx = -1e9; for (let i = -r; i <= r; i++) { const b = baseY[clamp(x + i, 0, W - 1)]; if (b < 0) return 1e9; mn = Math.min(mn, b); mx = Math.max(mx, b); } return mx - mn; };
const GATE_X = 24 * S, GATE_W = 112, GATE_H = 74;
const banners: number[] = [], bowls: number[] = [];
const underTower = (x: number, pad = 14) => TOWERS.some((t) => Math.abs(x - t.x) < t.r + pad);
{
  for (let x = 120; x < W - 120; x += 8) {
    if (Math.abs(x - GATE_X) < GATE_W / 2 + 40) continue;
    if (banners.length && x - banners[banners.length - 1] < 150) continue;
    if (flat(x, 14) < 18 && baseY[x] > 60 && !underTower(x)) banners.push(x);
  }
  banners.push(GATE_X - GATE_W / 2 - 26, GATE_X + GATE_W / 2 + 26);
  for (let i = 0; i < banners.length; i++) for (const s of [-1, 1]) {
    const x = banners[i] + s * 58;
    if (Math.abs(x - GATE_X) < GATE_W / 2 + 10 || bowls.some((b) => Math.abs(b - x) < 40) || banners.some((b) => Math.abs(b - x) < 34) || underTower(x) || x < 60 || x > W - 60 || flat(x, 6) > 20) continue;
    bowls.push(x);
  }
}
for (let x = 0; x < W; x++) {
  const b = baseY[x]; if (b < 0) continue;
  // верх стены (дорожка за зубцами) — по следу стены, сдвинут на высоту
  for (let gy = 0; gy <= b; gy++) {
    if (cls[gy * W + x] !== K.Wall) continue;
    const sy = gy - WALL_H, depthIn = b - gy; if (sy < 0) continue;
    const c = depthIn < 3 ? STONE[4] : depthIn < 34 ? dq(STONE, 2.3 + (vn(x, gy, 14, 8, 51) - 0.5) * 0.5 - (Math.floor(gy / 10) % 2 ? 0 : 0.2), x, sy) : depthIn < 40 ? STONE[1] : mix(dq(DSTONE, 1.6 + (vn(x, gy, 20, 12, 52) - 0.5) * 1.2, x, sy), VOID, clamp((depthIn - 40) / 60) * 0.85);
    put(bg, x, sy, c);
  }
  // фасад: кладка, контрфорсы, железный пояс, отсвет лавы снизу
  for (let k = 0; k <= WALL_H; k++) {
    const sy = b - WALL_H + k; if (sy < 0) continue;
    const bt = stoneBlock(x, k, 21, 12);
    const but = ((x + 40) % 176 + 176) % 176, isBut = but < 26 && Math.abs(x - GATE_X) > GATE_W / 2 + 12;
    let v = 2.1 + bt.v - (k / WALL_H) * 0.7 + (vn(x, sy, 12, 18, 61) - 0.5) * 0.4;
    if (isBut) v += but < 3 ? 1.1 : but > 22 ? -0.9 : 0.45;
    else if (but >= 26 && but < 31) v -= 0.8 - (but - 26) * 0.15; // тень контрфорса справа
    let c = bt.seam && !(isBut && but < 3) ? STONE[0] : dq(STONE, v, x, sy);
    if (k >= 46 && k <= 50) c = k === 46 ? IRON[4] : k === 50 ? IRON[0] : dq(IRON, 2.6 - k * 0.0, x, sy); // железный пояс
    if (k >= 46 && k <= 50 && (x % 22 === 0) && k === 48) c = IRON[5];
    if (k < 4) c = k === 0 ? STONE[5] : dq(STONE, 3.2 - k * 0.3, x, sy); // карниз
    const glow = sstep(0.55, 1, k / WALL_H);
    c = tint(c, 1, EMBER[3], glow ** 2 * 0.55);
    put(bg, x, sy, c);
    if (glow > 0.3) glowPx(emit, x, sy, EM_ORANGE, glow ** 3 * 0.5);
  }
  // зубцы над карнизом: 10 px через 6, с шипами
  const ztop = b - WALL_H;
  const zx = ((x % 16) + 16) % 16;
  if (zx < 10) for (let h = 1; h <= 8; h++) { const sy = ztop - h; if (sy >= 0) put(bg, x, sy, h === 8 ? STONE[5] : zx === 0 ? STONE[4] : zx === 9 ? STONE[1] : dq(STONE, 2.6 - zx * 0.08, x, sy)); }
  if (zx === 4 || zx === 5) { const sp = Math.floor(x / 16) % 3 === 0 ? 9 : 0; for (let h = 9; h < 9 + sp; h++) { const sy = ztop - h; if (sy >= 0 && (h < 9 + sp - 2 || zx === 4)) put(bg, x, sy, zx === 4 ? IRON[4] : IRON[1]); } }
}
// бойницы с огнём внутри
for (let x = 60; x < W - 60; x += 88) {
  const b = baseY[x]; if (b < 0 || underTower(x) || Math.abs(x - GATE_X) < GATE_W / 2 + 20 || banners.some((q) => Math.abs(q - x) < 24) || bowls.some((q) => Math.abs(q - x) < 20) || flat(x, 4) > 6) continue;
  for (let k = 0; k < 14; k++) for (let i = -1; i <= 1; i++) {
    const sy = b - WALL_H + 22 + k; if (sy < 0) continue;
    const c = i === -1 ? STONE[0] : k < 2 ? EMBER[2] : EMBER[k > 10 ? 2 : 3];
    put(bg, x + i, sy, i === 1 ? STONE[1] : c);
    if (i === 0) glowPx(emit, x, sy, EM_RED, 0.8);
  }
}
// знамёна хаоса: штанга, полотно со складками, рваный низ, знак — кольцо с рогами
for (const bx of banners) {
  const b = baseY[clamp(Math.round(bx), 0, W - 1)]; if (b < 0) continue;
  const top = b - WALL_H + 8, Wd = 22, L = 62;
  for (let i = -Wd / 2 - 3; i <= Wd / 2 + 3; i++) { put(bg, bx + i, top - 1, IRON[4]); put(bg, bx + i, top, IRON[1]); }
  put(bg, bx - Wd / 2 - 4, top - 1, IRON[5]); put(bg, bx + Wd / 2 + 4, top - 1, IRON[5]);
  for (let i = -Wd / 2; i < Wd / 2; i++) {
    const tear = L - 6 + Math.round(Math.abs(((i + Wd / 2) % 8) - 4) * 1.6) + (hash01(i, bx, 5) < 0.2 ? -2 : 0);
    for (let j = 1; j <= tear; j++) {
      const fold = Math.sin(((i + Wd / 2) / Wd) * Math.PI * 3) * 0.7;
      let v = 2.4 + fold - (i + Wd / 2) / Wd * 0.6 - j / L * 0.5;
      if (i === -Wd / 2) v = 1.2; else if (i === Wd / 2 - 1) v = 0.6;
      let c = dq(CLOTH, v, bx + i, top + j);
      if (j >= tear - 1) c = mix(c, EMBER[2], 0.6);
      // кайма и знак
      if (j === 4 || j === 5) c = j === 4 ? GOLD[2] : GOLD[1];
      const sx = i + 0.5, sj = j - 26, rr = Math.hypot(sx, sj * 1.05);
      if (Math.abs(rr - 6.5) < 1.1) c = rr < 6.5 ? GOLD[3] : GOLD[1];
      if (sj < -4 && sj > -14 && Math.abs(Math.abs(sx) - (6 + (sj + 4) * -0.45 + (sj + 9) ** 2 * -0.03)) < 1) c = GOLD[sx < 0 ? 3 : 2];
      if (rr < 2.2) c = EMBER[4];
      put(bg, bx + i, top + j, c);
      if (rr < 2.2) glowPx(emit, bx + i, top + j, EM_ORANGE, 0.6);
    }
  }
  // тень полотна на стене справа
  for (let j = 2; j < L - 2; j++) for (let t = 0; t < 2; t++) { const x = bx + Wd / 2 + t, c = bg.get(x, top + j); if (c) put(bg, x, top + j, tint(c, 0.62, c, 0)); }
}
// огненные чаши на кронштейнах (огонь — лист клиента)
for (const x of bowls) {
  const b = baseY[clamp(Math.round(x), 0, W - 1)]; if (b < 0) continue;
  const y = b - WALL_H + 40;
  for (let k = 0; k < 10; k++) { put(bg, x, y + k, IRON[3]); put(bg, x + 1, y + k, IRON[1]); }
  for (let i = -6; i <= 6; i++) for (let j = -3; j <= 2; j++) {
    if ((i / 6.5) ** 2 + ((j + 0.5) / 3.2) ** 2 > 1) continue;
    put(bg, x + i, y + j, j === -3 ? IRON[5] : j < 0 ? (i < 0 ? IRON[4] : IRON[3]) : i < -2 ? IRON[3] : IRON[1]);
  }
  for (let i = -4; i <= 4; i++) put(bg, x + i, y - 3, EMBER[i % 2 ? 4 : 3]);
  fires.push({ x, y: y - 2, s: 0.9, d: b + 2 });
  glows.push({ x, y: y - 8, c: 0xff7a30, s: 1.6, a: 0.55, f: true });
  for (let j = -12; j <= 30; j++) for (let i = -30; i <= 30; i++) { const d = Math.hypot(i / 30, j / 24); if (d < 1) glowPx(emit, x + i, y + j, EM_ORANGE, (1 - d) ** 2 * 0.45); }
}
// врата хаоса в середине стены: арка, решётка, печать
{
  const b = baseY[GATE_X]; const x0 = GATE_X - GATE_W / 2;
  for (let x = x0 - 10; x < x0 + GATE_W + 10; x++) for (let k = 0; k <= WALL_H; k++) {
    const sy = b - WALL_H + k, lx = x - x0, cxr = lx - GATE_W / 2, hk = WALL_H - k; // высота над основанием
    const archTop = GATE_H - 14 + Math.sqrt(Math.max(0, (GATE_W / 2) ** 2 - cxr * cxr)) * (14 / (GATE_W / 2));
    const inner = lx >= 8 && lx < GATE_W - 8 && hk <= archTop - 8;
    const frame = lx >= -2 && lx < GATE_W + 2 && hk <= archTop + 4 && !inner;
    if (inner) {
      // глубина проёма: багровая тьма, решётка, печать
      const dd = clamp(hk / (archTop - 8));
      let c = mix(hex("#4a0a08"), hex("#12040a"), dd);
      const bar = ((lx - 8) % 12 + 12) % 12 < 2 || (hk % 16 < 2 && hk > 8);
      if (bar) c = ((lx - 8) % 12 === 0 || hk % 16 === 0) ? IRON[3] : IRON[1];
      const sx = cxr, syy = hk - 34, rr = Math.hypot(sx, syy);
      if (!bar && Math.abs(rr - 13) < 1.5) { c = EMBER[4]; glowPx(emit, x, sy, EM_RED, 0.9); }
      if (!bar && rr < 13 && Math.abs(Math.atan2(syy, sx) % (Math.PI / 4)) < 0.12) { c = EMBER[3]; glowPx(emit, x, sy, EM_RED, 0.7); }
      glowPx(emit, x, sy, EM_RED, (1 - dd) * 0.45);
      put(bg, x, sy, c);
    } else if (frame && hk >= 0) {
      const ring = Math.min(lx + 2, GATE_W + 1 - lx, archTop + 4 - hk);
      const vb = stoneBlock(Math.round(Math.atan2(hk, cxr) * 40), Math.round(ring), 33, 4);
      put(bg, x, sy, ring < 1 ? STONE[5] : vb.seam ? STONE[0] : dq(STONE, 2.8 + vb.v - (lx > GATE_W / 2 ? 0.5 : 0), x, sy));
    }
  }
  // рога над аркой
  for (const s of [-1, 1]) for (let t = 0; t < 1; t += 0.01) {
    const px = GATE_X + s * (GATE_W / 2 - 6 + t * 26 + Math.sin(t * 2.4) * 6), py = b - GATE_H - 8 - t * 22 + t * t * 18;
    const th = Math.round(4 * (1 - t)) + 1;
    for (let i = 0; i < th; i++) put(bg, Math.round(px), Math.round(py) - i, i === th - 1 ? IRON[5] : t > 0.85 ? EMBER[3] : IRON[s < 0 ? 3 : 2]);
  }
}
// цепи с зубцов вниз к лаве
for (let x = 90; x < W - 90; x += 132) {
  const b = baseY[x]; if (b < 0 || underTower(x) || Math.abs(x - GATE_X) < GATE_W / 2 + 30 || banners.some((q) => Math.abs(q - x) < 22) || bowls.some((q) => Math.abs(q - x) < 16)) continue;
  for (let k = 2; k < WALL_H + LAVA_D - 2; k++) {
    const sy = b - WALL_H + k, link = Math.floor(k / 4) % 2;
    if (link) { put(bg, x - 1, sy, IRON[4]); put(bg, x + 1, sy, IRON[1]); } else put(bg, x, sy, k % 4 === 0 ? IRON[5] : IRON[3]);
  }
}
// башни: цилиндр (ряды по кругу), зубцы, крыша-конус с рогами, окна-бойницы
for (const t of TOWERS) {
  const R = t.r, Ht = t.h;
  // тень башни на берег справа-снизу
  for (let y = Math.floor(t.y - R * 0.3); y < t.y + R * 0.9; y++) for (let x = Math.floor(t.x); x < t.x + R * 1.6; x++) {
    const d = ((x - t.x - R * 0.55) / (R * 1.05)) ** 2 + ((y - t.y - R * 0.25) / (R * 0.55)) ** 2;
    if (d < 1 && ground(at(x, y))) { const c = bg.get(x, y)!; put(bg, x, y, tint(c, 0.55 + d * 0.45, c, 0)); }
  }
  for (let x = Math.floor(t.x - R); x <= t.x + R; x++) {
    const dx = x - t.x, hs = Math.sqrt(Math.max(0, R * R - dx * dx)), nx = dx / R;
    const yf = t.y + hs, ytop = t.y - hs;
    // верх (площадка) — диск, сдвинутый на высоту
    for (let gy = Math.floor(ytop); gy <= yf; gy++) put(bg, x, gy - Ht, dq(DSTONE, 3 - (gy - ytop) / (2 * hs + 1) * 0.6, x, gy));
    // стена-цилиндр
    const ang = Math.asin(clamp(nx, -1, 1)) * R;
    for (let k = 0; k <= Ht; k++) {
      const sy = Math.round(yf - Ht + k);
      const bt = stoneBlock(Math.round(ang), k, 71, 12);
      let v = 2.9 - (nx + 1) * 0.9 + bt.v - (k / Ht) * 0.5;
      if (Math.abs(nx) > 0.93) v -= 0.8;
      let c = bt.seam ? STONE[0] : dq(STONE, v, x, sy);
      if (k < 4) c = k === 0 ? STONE[5] : dq(STONE, 3.2 - (nx + 1) * 0.7, x, sy);
      if (k > 60 && k < 66) c = k === 61 ? IRON[4] : dq(IRON, 2.4 - (nx + 1) * 0.6, x, sy);
      c = tint(c, 1, EMBER[3], sstep(0.7, 1, k / Ht) ** 2 * 0.45);
      put(bg, x, sy, c);
    }
    // окна-бойницы
    for (const wy of [30, 96]) if (Math.abs(nx + 0.15) < 0.09) for (let k = 0; k < 16; k++) { const sy = Math.round(yf - Ht + wy + k); put(bg, x, sy, Math.abs(nx + 0.15) < 0.04 ? EMBER[k < 2 ? 2 : 3] : STONE[0]); glowPx(emit, x, sy, EM_RED, 0.85); }
    // зубцы по краю площадки
    const zx = ((Math.round(ang) % 14) + 14) % 14;
    if (zx < 9) for (let h = 1; h <= 9; h++) put(bg, x, Math.round(yf - Ht - h), h === 9 ? STONE[5] : dq(STONE, 2.9 - (nx + 1) * 0.8, x, yf - Ht - h));
  }
  // крыша: конус тёмного металла от площадки (r 0.8R) к шпилю, по бокам рога
  const apex = { x: t.x, y: t.y - Ht - 96 }, rr = R * 0.9;
  for (let y = Math.floor(apex.y); y <= t.y - Ht + rr * 0.4; y++) for (let x = Math.floor(t.x - rr); x <= t.x + rr; x++) {
    const v2 = (y - apex.y) / (t.y - Ht - apex.y); if (v2 < 0) continue;
    const half = rr * clamp(v2) ** 0.9; const dx = x - t.x;
    const ell2 = y > t.y - Ht ? (dx / rr) ** 2 + ((y - (t.y - Ht)) / (rr * 0.4)) ** 2 <= 1 : Math.abs(dx) <= half;
    if (!ell2) continue;
    const nx = dx / Math.max(1, half);
    const rib = ((Math.round((Math.asin(clamp(nx, -1, 1)) / Math.PI) * 10) % 2) + 2) % 2;
    let v = 3.0 - (nx + 1) * 1.35 + (rib ? 0.3 : -0.2) + (Math.floor((y - apex.y) / 7) % 2 ? 0 : -0.15);
    if (Math.abs(Math.abs(nx) - 1) < 0.08) v = 0.4;
    put(bg, x, y, dq(IRON, v, x, y));
  }
  for (let k = 0; k < 18; k++) { put(bg, t.x, apex.y - k, IRON[k > 14 ? 5 : 4]); put(bg, t.x + 1, apex.y - k, IRON[1]); }
  for (const s of [-1, 1]) for (let q = 0; q < 1; q += 0.008) {
    const px = t.x + s * (rr * 0.55 + q * 34 - q * q * 6), py = t.y - Ht - 40 - q * 54 + (q - 0.6) ** 2 * 30 - 10;
    const th = Math.max(2, Math.round(8 * (1 - q)));
    for (let i = 0; i < th; i++) for (let jx = 0; jx < 2; jx++) put(bg, Math.round(px) + jx, Math.round(py) + i, q > 0.86 ? EMBER[q > 0.94 ? 5 : 4] : i === 0 ? IRON[5] : i === th - 1 ? IRON[0] : s < 0 ? IRON[3] : IRON[2]);
    if (q > 0.88) glowPx(emit, Math.round(px), Math.round(py), EM_ORANGE, 0.7);
  }
  glows.push({ x: t.x - R * 0.15, y: t.y - Ht + 40, c: 0xff4a20, s: 1.0, a: 0.4 }, { x: t.x - R * 0.15, y: t.y - Ht + 104, c: 0xff4a20, s: 1.0, a: 0.4 });
}

// ---------------------------------------------------------------- спрайты объектов
const sprite = (w: number, h: number) => new PC(w, h);
const ao = (pc: PC, x0: number, x1: number, yb: number) => { for (let x = x0 - 1; x <= x1 + 1; x++) { pc.set(x, yb + 1, [12, 8, 18, 150]); pc.set(x, yb + 2, [12, 8, 18, 65]); } };
/** Блок 3/4: верх (глубина top px) и лицо (h px) прямоугольника, свет слева. */
function block(pc: PC, x0: number, x1: number, yb: number, h: number, top: number, r: Ramp, salt: number, rowH = 8) {
  const w = x1 - x0;
  for (let x = x0; x < x1; x++) {
    const lx = x - x0;
    for (let k = 0; k < h; k++) {
      const y = yb - h + k, bt = stoneBlock(x, k, salt, rowH);
      let v = 2.3 + bt.v - lx / w * 1.1 - k / h * 0.3;
      if (lx === 0) v += 0.8; if (lx === w - 1) v = 0.5;
      pc.set(x, y, k === 0 ? r[4] : bt.seam ? r[0] : dq(r, v, x, y));
    }
    for (let j = 0; j < top; j++) {
      const y = yb - h - top + j;
      pc.set(x, y, j === 0 ? r[5] ?? r[4] : lx === 0 || lx === w - 1 ? r[2] : dq(r, 3.4 - j / top * 0.6 - lx / w * 0.5 + (vn(x, y, 5, 4, salt) - 0.5) * 0.4, x, y));
    }
  }
}
function outlineDark(pc: PC) {
  // контур 1 px тёмным тоном материала
  const src = pc.clone();
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (src.alpha(x, y) > 0) continue;
    const n = [src.get(x - 1, y), src.get(x + 1, y), src.get(x, y - 1)].find((c) => c && c[3] > 200);
    if (n && y < pc.h - 3) pc.set(x, y, [Math.round(n[0] * 0.35), Math.round(n[1] * 0.3), Math.round(n[2] * 0.35), 255]);
  }
}
// колонна 2×2: плинт 62×(24 верх + 10 лицо), ствол 34, капитель 46, рогатая корона с огнём
function pillar(): PC {
  const w = 76, h = 168, pc = sprite(w, h), cx = w / 2, yb = h - 3;
  block(pc, cx - 31, cx + 31, yb, 10, 24, STONE, 81);
  block(pc, cx - 25, cx + 25, yb - 10 - 24 + 12, 6, 6, STONE, 82);
  // ствол: каннелюры, железные обручи, руны
  const s0 = yb - 34 - 4, s1 = s0 - 92;
  for (let x = cx - 17; x < cx + 17; x++) {
    const nx = (x - cx + 0.5) / 17, fl = Math.floor((x - cx + 17) / 5);
    for (let y = s1; y < s0; y++) {
      let v = 3.0 - (nx + 1) * 1.15 + ((x - cx + 17) % 5 === 0 ? -0.6 : (x - cx + 17) % 5 === 1 ? 0.35 : 0) + (vn(x, y, 3, 9, 83 + fl) - 0.5) * 0.5;
      if (Math.abs(nx) > 0.9) v -= 0.7;
      let c = dq(STONE, v, x, y);
      for (const by of [s0 - 8, s1 + 22]) if (y >= by && y < by + 5) c = y === by ? IRON[5] : dq(IRON, 3 - (nx + 1) * 1.2, x, y);
      pc.set(x, y, c);
    }
  }
  // руны: три знака, раскалены
  const rune = (ry: number, kind: number) => {
    const pts: [number, number][] = kind === 0 ? [[0, -6], [0, 6], [-3, -2], [3, 2]] : kind === 1 ? [[-3, -6], [3, 0], [-3, 6], [0, -2], [0, 2]] : [[0, -6], [-4, 0], [0, 6], [4, 0], [0, -6]];
    for (let i = 0; i + 1 < pts.length; i += kind === 0 ? 2 : 1) {
      const [a, b] = [pts[i], pts[i + 1]];
      for (let t = 0; t <= 1; t += 0.08) { const x = Math.round(cx + a[0] + (b[0] - a[0]) * t), y = Math.round(ry + a[1] + (b[1] - a[1]) * t); pc.set(x, y, EMBER[4]); pc.set(x + 1, y, EMBER[2]); }
    }
  };
  rune(s1 + 42, 0); rune(s1 + 60, 1); rune(s1 + 78, 2);
  // капитель
  block(pc, cx - 23, cx + 23, s1, 9, 7, STONE, 84, 5);
  // корона из 4 рогов и чаша с углями
  const cy = s1 - 16;
  for (let i = -12; i <= 12; i++) for (let j = -4; j <= 3; j++) { if ((i / 12.5) ** 2 + ((j + 0.5) / 4) ** 2 > 1) continue; pc.set(cx + i, cy + j, j <= -3 ? IRON[5] : i < -3 ? IRON[4] : i < 5 ? IRON[3] : IRON[1]); }
  for (let i = -10; i <= 10; i++) pc.set(cx + i, cy - 4, EMBER[Math.abs(i) % 3 ? 3 : 4]);
  for (const [ox, lean, len] of [[-12, -1, 22], [12, 1, 22], [-6, -0.4, 16], [6, 0.4, 16]] as const) for (let t = 0; t < 1; t += 0.02) {
    const x = Math.round(cx + ox + lean * (t * 10 + t * t * 4)), y = Math.round(cy - 1 - t * len + t * t * 3);
    const th = Math.max(1, Math.round(3 * (1 - t)));
    for (let k = 0; k < th; k++) pc.set(x + (lean < 0 ? k : -k), y, t > 0.85 ? EMBER[3] : k === 0 ? IRON[4] : IRON[2]);
  }
  outlineDark(pc);
  ao(pc, cx - 31, cx + 31, yb);
  return pc;
}
// врата моста: две башенки-опоры 2×2 по краям, арка над мостом, рога и печать
function gate(): PC {
  const w = 352, h = 190, pc = sprite(w, h), cx = w / 2, yb = h - 3;
  const legs = [cx - 160, cx + 96];
  for (const lx of legs) {
    block(pc, lx + 1, lx + 63, yb, 10, 22, STONE, 91);
    block(pc, lx + 6, lx + 58, yb - 32, 96, 10, STONE, 92, 12);
  }
  // арка: перемычка 22 px над пролётом, нижний край — дуга
  const a0 = cx - 104, a1 = cx + 104, topY = yb - 32 - 96 - 4;
  for (let x = a0; x < a1; x++) {
    const u = (x - cx) / 104, low = topY + 30 - Math.round((1 - u * u) * 10) + 4;
    for (let y = topY; y < low; y++) {
      const k = y - topY, bt = stoneBlock(Math.round(Math.atan2(y - (topY + 60), x - cx) * 60), Math.min(k, low - y), 93, 6);
      let c = k === 0 ? STONE[5] : bt.seam ? STONE[0] : dq(STONE, 2.6 + bt.v - (x - a0) / 208 * 0.9 - k / 34 * 0.4, x, y);
      if (y === low - 1) c = STONE[1];
      pc.set(x, y, c);
    }
    for (let j = 1; j <= 8; j++) pc.set(x, topY - j, dq(STONE, 3.4 - j * 0.1 - (x - a0) / 208 * 0.6, x, topY - j)); // верх перемычки
  }
  // зубцы и шипы на перемычке
  for (let x = a0; x < a1; x++) { const zx = ((x - a0) % 14 + 14) % 14; if (zx < 8) for (let hh = 9; hh <= 15; hh++) pc.set(x, topY - hh, hh === 15 ? STONE[5] : zx === 0 ? STONE[4] : zx === 7 ? STONE[1] : STONE[3]); }
  // печать хаоса — замковый камень с кольцом и рогами
  const ky = topY + 14;
  for (let i = -13; i <= 13; i++) for (let j = -13; j <= 13; j++) {
    const r = Math.hypot(i, j); if (r > 13) continue;
    let c = r > 11.5 ? IRON[4] : dq(IRON, 2.6 - (i + j) / 20, cx + i, ky + j);
    if (Math.abs(r - 7) < 1.2) c = EMBER[4]; else if (r < 2) c = EMBER[5];
    pc.set(cx + i, ky + j, c);
  }
  for (const s of [-1, 1]) for (let t = 0; t < 1; t += 0.01) {
    const x = Math.round(cx + s * (10 + t * 26)), y = Math.round(ky - 8 - t * 34 + t * t * 26);
    const th = Math.max(1, Math.round(5 * (1 - t)));
    for (let k = 0; k < th; k++) pc.set(x, y + k, t > 0.86 ? EMBER[4] : k === 0 ? IRON[5] : s < 0 ? IRON[3] : IRON[2]);
  }
  // жаровни на опорах (огонь — клиент)
  for (const lx of legs) {
    const bx = lx + 32, by = yb - 32 - 96 - 10;
    for (let i = -9; i <= 9; i++) for (let j = -4; j <= 3; j++) { if ((i / 9.5) ** 2 + ((j + 0.5) / 4) ** 2 > 1) continue; pc.set(bx + i, by + j, j <= -3 ? IRON[5] : i < -3 ? IRON[4] : i < 4 ? IRON[3] : IRON[1]); }
    for (let i = -7; i <= 7; i++) pc.set(bx + i, by - 4, EMBER[Math.abs(i) % 3 ? 3 : 4]);
    // знамя на опоре
    for (let i = -8; i < 8; i++) for (let j = 0; j < 46 + (Math.abs(i % 6) < 2 ? -4 : 0); j++) {
      const y = yb - 32 - 92 + 18 + j; let c = dq(CLOTH, 2.6 + Math.sin((i + 8) / 16 * Math.PI * 2) * 0.6 - j / 60, bx + i, y);
      if (j < 2) c = GOLD[2]; if (Math.hypot(i + 0.5, j - 20) < 3) c = EMBER[4];
      pc.set(bx + i, y, c);
    }
  }
  outlineDark(pc);
  for (const lx of legs) ao(pc, lx + 1, lx + 63, yb);
  return pc;
}
function brazier(): PC {
  const w = 34, h = 40, pc = sprite(w, h), cx = 17, yb = h - 3;
  block(pc, cx - 11, cx + 11, yb, 4, 8, STONE, 95);
  // треножник и чаша
  for (const s of [-1, 0, 1]) for (let k = 0; k < 16; k++) { const x = Math.round(cx + s * (7 - k * 0.3)), y = yb - 12 - k; pc.set(x, y, s < 0 ? IRON[4] : IRON[2]); if (s) pc.set(x + s, y, IRON[1]); }
  for (let i = -11; i <= 11; i++) for (let j = -5; j <= 3; j++) {
    if ((i / 11.5) ** 2 + ((j + 1) / 4.8) ** 2 > 1) continue;
    pc.set(cx + i, yb - 30 + j, j <= -4 ? IRON[5] : i < -4 ? IRON[4] : i < 4 ? IRON[3] : IRON[1]);
  }
  for (let i = -9; i <= 9; i++) pc.set(cx + i, yb - 35, EMBER[Math.abs(i) % 3 ? 3 : 4]);
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) pc.set(cx + s * (11 + Math.floor(k / 2)), yb - 33 - k, k > 4 ? IRON[5] : IRON[3]);
  outlineDark(pc);
  ao(pc, cx - 11, cx + 11, yb);
  return pc;
}
/** Пламя: 12 кадров 20×30, языки с easing, ядро светлое. */
function flameSheet(): PC {
  const fw = 20, fh = 30, n = 12, pc = new PC(fw * n, fh);
  for (let f = 0; f < n; f++) {
    const ph = (f / n) * Math.PI * 2;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const u = (x - fw / 2 + 0.5) / (fw / 2), v = 1 - y / (fh - 1); // v: 0 низ, 1 верх
      const sway = Math.sin(ph + v * 3.2) * 0.22 * v + Math.sin(ph * 2 + v * 5) * 0.08 * v;
      const width = (1 - v) ** 0.7 * (0.95 - 0.1 * Math.sin(ph * 3 + v * 6)) * (v < 0.15 ? 0.7 + v * 2 : 1);
      const d = Math.abs(u - sway) / Math.max(0.05, width);
      const tongue = vn(x * 2, y * 2 + f * 10, 4, 5, 7 + f) * 0.4;
      const t = 1 - d - tongue * v;
      if (t <= 0 || v > 0.98) continue;
      const hot = t * (1 - v * 0.6);
      const c = hot > 0.75 ? EMBER[5] : hot > 0.5 ? EMBER[4] : hot > 0.28 ? EMBER[3] : hot > 0.12 ? EMBER[2] : EMBER[1];
      pc.set(f * fw + x, y, c);
    }
  }
  return pc;
}

// ---------------------------------------------------------------- запись
fs.mkdirSync(OUT, { recursive: true });
bg.save(path.join(OUT, "citadel_bg.png"));
emit.save(path.join(OUT, "citadel_emit.png"));
const SPR: Record<string, PC> = { cit_pillar: pillar(), cit_gate: gate(), cit_brazier: brazier() };
for (const [k, pc] of Object.entries(SPR)) pc.save(path.join(OUT, `${k}.png`));
flameSheet().save(path.join(OUT, "cit_flame.png"));
const data = {
  _doc: "Цитадель Хаоса v2 (tools/gen/citadel.ts → client/src/game/citadelV2.ts): objects — объекты карты рейда вместо прежних (клетки те же); fires — огонь (лист cit_flame, s — масштаб, d — глубина); glows — ореолы света (цвет, масштаб, альфа, f — мерцание).",
  objects: objects.map((o) => ({ kind: o.kind, x: Math.round(o.x), y: Math.round(o.y) })),
  fires: fires.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), s: f.s, d: Math.round(f.d) })),
  glows: glows.map((g) => ({ ...g, x: Math.round(g.x), y: Math.round(g.y) })),
};
fs.writeFileSync(path.resolve("data/citadel.json"), JSON.stringify(data, null, 1) + "\n");

// ---------------------------------------------------------------- предпросмотр без движка: картинка + объекты по глубине + огонь, кадры как в игре
{
  const comp = bg.clone();
  const fl = flameSheet();
  const items = [...objects.filter((o) => SPR[o.kind]).map((o) => ({ y: o.y, draw: () => { const s = SPR[o.kind]; comp.blit(s, Math.round(o.x - s.w / 2), Math.round(o.y - s.h)); } })),
    ...fires.map((f) => ({ y: f.d, draw: () => { for (let y = 0; y < 30; y++) for (let x = 0; x < 20; x++) { const c = fl.get(x + 20 * 3, y); if (c && c[3]) comp.set(Math.round(f.x - 10 + x), Math.round(f.y - 28 + y), c); } } }))];
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  // свечение сложением (как в клиенте, альфа 0.8)
  for (let i = 0; i < comp.data.length; i += 4) { const a = (emit.data[i + 3] / 255) * 0.8; for (let k = 0; k < 3; k++) comp.data[i + k] = Math.min(255, comp.data[i + k] + emit.data[i + k] * a * 0.6); }
  // лава под картинкой — для предпросмотра заливка
  const full = new PC(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = vn(x, y, 14, 10, 3); full.set(x, y, n > 0.62 ? EMBER[4] : n > 0.45 ? EMBER[3] : n > 0.3 ? EMBER[2] : EMBER[1]); }
  full.blit(comp, 0, 0);
  fs.mkdirSync(PREV, { recursive: true });
  full.save(path.join(PREV, "preview_full.png"));
  console.log(`citadel: ${W}×${H}, объектов ${objects.length}, огней ${fires.length}, знамён ${banners.length}, чаш ${bowls.length}`);
}
