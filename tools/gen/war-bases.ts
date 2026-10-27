/** Основания «Знамён Предела» в игру (задача 132, шаг 14; отзыв пользователя — «постамент объёмнее»): постамент в 3/4 как дома 141 и
 *  статуи — три ступени, тело с филёнкой, карниз и шапка, правая грань в тени, контактная тень (tools/gen/shadow.ts через volume-lib),
 *  кованый хомут мачты с косынками, ворот с цепью; мачта — дерево в железных кольцах с наконечником и шкивом. Щиток с гербом владельца —
 *  отдельные листы war-plate-sol/umb (у ничьего основания видны высеченные мечи). Знамёна захвата — модели задачи 130 (standards.ts).
 *  Эффекты: war-dot (мягкая точка), war-swords (скрещённые мечи спора), war-beam (луч вдоль мачты). Кольцо круга — tools/gen/war-rings.ts.
 *  Клиент (client/src/game/bannerBases.ts): мачта сзади, знамя на оси mast[0] на высоте от mast[2] (вывешено) до mast[1] (поднято), постамент спереди.
 *  Запуск отдельно: npx tsx tools/gen/war-bases.ts [--preview] (превью — tools/out/banners-event/v2-plinth.png); в сборке — writeWarBasesGame. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { royalSolgard, royalUmbrath, strip, paintGround, label, scaleNN, type Anim } from "./standards";
import { PC, hex, OUT, box, cylV, depth, face, fillPoly, shadowBox, STONE, IRON, WOOD, type Mat, type Tex } from "./volume-lib";
import { factionEmblem } from "./heraldry";
import { mix, type RGBA } from "./canvas";
import { writeWarRingsGame } from "./war-rings";

const FW = 112, FH = 216, GY = 208;
/** Центр следа нижней ступени (x 8…90, глубина 24 → сдвиг (14, −13)): середина фасада плюс половина глубины. */
const FOOT_C: [number, number] = [8 + 82 / 2 + 7, GY - 6.5];
/** Ось мачты, верх (знамя поднято) и низ (вывешено: низ полотнища за постаментом у земли). */
const MAST_X = 56, MAST_TOP = 30, MAST_LOW = 110;
/** Щиток с гербом: левый верх на постаменте. */
const PLATE: [number, number] = [37, 154];
const GOLD = ["#3a2408", "#6a4210", "#a8681c", "#e0a630", "#ffd864", "#fff2b0"].map((c) => hex(c));

/** Тёсаный камень: ряды по 6 px, перевязка швов по 13 px; швы темнее, редкие сколы. */
const ashlar = (ox: number): Tex => (x, y) => {
  const row = Math.floor((y + 2) / 6), col = Math.floor((x + ox + (row % 2) * 6) / 13);
  if ((y + 2) % 6 === 0 || (x + ox + (row % 2) * 6) % 13 === 0) return -0.85;
  return ((col * 7 + row * 13) % 5) * 0.08 - 0.12 + (((x * 31 + y * 17) % 23) === 0 ? -0.5 : 0);
};
const smooth: Tex = (x, y) => (((x * 13 + y * 7) % 19) === 0 ? -0.35 : 0);

function plinthLayer(): PC {
  const pc = new PC(FW, FH);
  const st: Mat = { r: STONE, tex: ashlar(0) }, top: Mat = { r: STONE, tex: smooth };
  // контактная тень под нижней ступенью
  shadowBox(pc, 8, 90, GY, depth(24), 70);
  box(pc, 8, GY - 10, 82, 10, 24, st, st, top);               // ступень 1
  box(pc, 15, GY - 21, 70, 9, 20, st, st, top);               // ступень 2
  box(pc, 22, GY - 58, 56, 35, 16, { r: STONE, tex: ashlar(3) }, { r: STONE, tex: ashlar(5) }, top); // тело
  box(pc, 18, GY - 65, 64, 7, 19, { r: STONE, tex: smooth }, { r: STONE, tex: smooth }, top);       // карниз
  box(pc, 24, GY - 70, 52, 5, 15, { r: STONE, tex: smooth }, { r: STONE, tex: smooth }, top);       // шапка
  // филёнка на фасаде тела: утоплена (тень сверху и слева, свет снизу и справа)
  const px0 = PLATE[0] - 3, py0 = PLATE[1] - 3, pw = 32, ph = 34;
  for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) {
    const edgeT = y === py0 || x === px0, edgeB = y === py0 + ph - 1 || x === px0 + pw - 1;
    pc.set(x, y, edgeT ? STONE[0] : edgeB ? STONE[4] : STONE[2]);
  }
  // высеченное знамя на древке (видно, когда щитка нет): канавка темнее, нижне-правая кромка канавки светлее
  const cut = (x: number, y: number) => { pc.set(x, y, STONE[0]); if (pc.get(x + 1, y + 1)?.[0] === STONE[2][0]) pc.set(x + 1, y + 1, STONE[4]); };
  const bx = px0 + 9, by = py0 + 5;
  for (let y = by - 2; y < by + 25; y++) cut(bx, y);                       // древко
  cut(bx - 1, by - 3); cut(bx, by - 3); cut(bx + 1, by - 3);               // навершие
  for (let x = bx + 1; x < bx + 15; x++) { cut(x, by); }                   // верх полотнища
  for (let y = by; y < by + 14; y++) cut(bx + 14, y);                      // правая кромка
  for (let k = 0; k < 7; k++) { cut(bx + 14 - k, by + 14 + Math.floor(k / 2)); cut(bx + 1 + k, by + 17 - Math.floor(k / 2)); } // ласточкин хвост
  for (let y = by + 4; y < by + 10; y++) for (let x = bx + 5; x < bx + 10; x++) if (Math.hypot(x - bx - 7, y - by - 7) < 2.6) cut(x, y); // солнце-диск
  // кованый хомут мачты на шапке и косынки
  const topY = GY - 70 - 4;
  cylV(pc, MAST_X, topY - 14, topY, 6, IRON, { cap: IRON, ao: 2 });
  for (const s of [-1, 1]) fillPoly(pc, [[MAST_X + s * 6, topY - 12], [MAST_X + s * 6, topY], [MAST_X + s * 12, topY]], (x, y) => (y === topY ? IRON[1] : s < 0 ? IRON[4] : IRON[2]) as RGBA);
  for (const y of [topY - 11, topY - 5]) { pc.set(MAST_X - 4, y, GOLD[4]); pc.set(MAST_X + 3, y, GOLD[2]); } // заклёпки
  // ворот на правой грани тела: барабан и рукоять
  const wx = 22 + 56 + 3, wy = GY - 40;
  face(pc, [[wx - 2, wy - 5], [wx + 5, wy - 9], [wx + 5, wy + 1], [wx - 2, wy + 5]], IRON, [1, 0, 0.6]);
  for (let k = 0; k < 7; k++) pc.set(wx + 6 + Math.round(k * 0.5), wy - 4 + k, IRON[4]);
  pc.set(wx + 9, wy + 3, WOOD[4]); pc.set(wx + 10, wy + 3, WOOD[3]); pc.set(wx + 10, wy + 4, WOOD[2]);
  pc.outline(OUT);
  return pc;
}

function mastLayer(): PC {
  const pc = new PC(FW, FH);
  const topY = GY - 74;
  // древко: дерево, железные кольца каждые 22 px
  cylV(pc, MAST_X, 18, topY, 3, WOOD, { cap: null, tex: (phi, y) => (((y * 7) % 11) === 0 ? -0.4 : 0) + Math.sin(phi * 3) * 0.1 });
  for (let y = 34; y < topY - 4; y += 22) cylV(pc, MAST_X, y, y + 2, 4, IRON, { cap: null });
  // шкив у макушки (справа) и наконечник-навершие
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j <= 9) pc.set(MAST_X + 6 + i, 22 + j, i * i + j * j <= 2 ? IRON[1] : i + j < 0 ? IRON[4] : IRON[2]);
  cylV(pc, MAST_X, 14, 18, 4, IRON, { cap: IRON });
  fillPoly(pc, [[MAST_X, 1], [MAST_X + 3, 9], [MAST_X, 14], [MAST_X - 3, 9]], (x) => (x < MAST_X ? GOLD[4] : GOLD[2]) as RGBA);
  // цепь от шкива вниз к вороту
  for (let y = 25; y < GY - 44; y++) pc.set(MAST_X + 9, y, (y % 3 === 0 ? IRON[1] : y % 3 === 1 ? IRON[4] : IRON[3]));
  pc.outline(OUT);
  return pc;
}

/** Щиток с гербом владельца: кованая рамка-щит и малая эмблема (s20). */
function plate(fac: "solgard" | "umbrath"): PC {
  const pc = new PC(26, 28);
  const field: RGBA = fac === "solgard" ? hex("#1c3a72") : hex("#2a1838");
  const inShield = (x: number, y: number) => y < 18 ? x >= 0 && x < 26 : Math.abs(x + 0.5 - 13) <= 13 - (y - 18) * 1.25;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 26; x++) {
    if (!inShield(x, y)) continue;
    const edge = !inShield(x - 1, y) || !inShield(x + 1, y) || !inShield(x, y - 1) || !inShield(x, y + 1) || !inShield(x - 2, y) || !inShield(x + 2, y) || !inShield(x, y + 2);
    pc.set(x, y, edge ? (fac === "solgard" ? GOLD[x + y < 26 ? 4 : 2] : IRON[x + y < 26 ? 4 : 2]) : field);
  }
  const em = factionEmblem(fac, "s20");
  pc.blit(em, Math.round((26 - em.w) / 2), Math.max(2, Math.round((24 - em.h) / 2)));
  pc.outline(OUT);
  return pc;
}

function softDot(n: number): PC {
  const pc = new PC(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    if (d < 1) pc.set(x, y, [255, 255, 255, Math.round(255 * Math.pow(1 - d, 1.8))]);
  }
  return pc;
}
function beam(): PC {
  const w = 40, h = 220, pc = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.abs(x + 0.5 - w / 2) / (w / 2), v = y / h;
    const a = Math.pow(Math.max(0, 1 - dx), 2.2) * Math.pow(v, 0.7) * (dx < 0.12 ? 1.2 : 1);
    if (a > 0.01) pc.set(x, y, [255, 255, 255, Math.min(255, Math.round(255 * a))]);
  }
  return pc;
}
/** Скрещённые мечи (значок спора) 24×24: сталь с бликом, золотые гарды. */
function swords(): PC {
  const pc = new PC(24, 24);
  for (const s of [1, -1]) {
    for (let t = 0; t < 17; t++) {
      const x = s > 0 ? 3 + t : 20 - t, y = 3 + t;
      pc.set(x, y, IRON[5]); pc.set(x + (s > 0 ? 1 : -1), y, IRON[3]); pc.set(x, y + 1, IRON[2]);
    }
    const gx = s > 0 ? 16 : 7, gy = 16;
    for (let k = -3; k <= 3; k++) pc.set(gx + k, gy - k * s, GOLD[k < 0 ? 4 : 2]);
    pc.set(s > 0 ? 19 : 4, 19, hex("#6a3a1c")); pc.set(s > 0 ? 20 : 3, 20, hex("#6a3a1c")); pc.set(s > 0 ? 21 : 2, 21, GOLD[3]);
  }
  pc.outline(OUT);
  return pc;
}

/**
 * Значки оснований для карты мира (client/public/ui/war/): круглая плашка с тёмным контуром и ободом цвета владельца, на ней знамя на древке —
 * Сольгард: синее полотнище в золотой кайме с солнцем; Умбрат: пурпурное в серебре с черепом в короне; ничья — серое со скрещёнными мечами.
 * Сердце — плашка крупнее (28 px), двойной обод и корона над знаменем. 24 px — читается на общем плане.
 */
type IconF = "sol" | "umb" | "none";
function mapIcon(f: IconF, heart: boolean): PC {
  const n = heart ? 30 : 24, pc = new PC(n, n + (heart ? 4 : 0)), cx = n / 2, cy = n / 2 + (heart ? 4 : 0), r = n / 2 - 1.5;
  const rim = f === "sol" ? GOLD : f === "umb" ? ["#2a1838", "#4a2a66", "#7a52a8", "#b890ff", "#dcc8ff", "#f4ecff"].map((c) => hex(c)) : STONE;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) continue;
    const lit = (x - cx) + (y - cy) < 0;
    if (d > r - 2.2) pc.set(x, y, rim[lit ? 4 : 2]);
    else if (heart && d > r - 3.4) pc.set(x, y, hex("#120c14"));
    else if (heart && d > r - 4.6) pc.set(x, y, rim[lit ? 3 : 1]);
    else pc.set(x, y, mix(hex("#1a141e"), hex("#2a2230"), (y - cy + r) / (2 * r)));
  }
  // древко и полотнище
  const pw = heart ? 13 : 11, ph = heart ? 15 : 13, px = Math.round(cx - pw / 2) + 1, py = Math.round(cy - ph / 2) - 1;
  for (let y = py - 3; y < py + ph + 4; y++) pc.set(px - 2, y, GOLD[y < py ? 5 : 3]);
  pc.set(px - 2, py - 4, GOLD[5]);
  const cloth = f === "sol" ? hex("#1c3a72") : f === "umb" ? hex("#3a1f55") : hex("#55515c");
  const edge = f === "sol" ? GOLD[4] : f === "umb" ? hex("#c8c4d0") : STONE[4];
  for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
    const tail = y >= py + ph - 3 && Math.abs(x + 0.5 - (px + pw / 2)) < (y - (py + ph - 3)) * 1.6; // ласточкин хвост
    if (tail) continue;
    const border = y === py || x === px || x === px + pw - 1 || (y >= py + ph - 3 && !(y >= py + ph - 4 && Math.abs(x + 0.5 - (px + pw / 2)) < (y + 1 - (py + ph - 3)) * 1.6 + 1 && y < py + ph - 1 ? false : true) && y === py + ph - 1);
    pc.set(x, y, border ? edge : cloth);
  }
  const ex = Math.round(px + pw / 2), ey = Math.round(py + ph / 2) - 1;
  if (f === "sol") {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) pc.set(ex + i - 1, ey + j, GOLD[i + j < 0 ? 5 : 4]);
    for (const [i, j] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) pc.set(ex - 1 + i, ey + j, GOLD[3]);
  } else if (f === "umb") {
    const W: RGBA = hex("#ece6f4"), K: RGBA = hex("#0c0810");
    for (let j = 0; j <= 3; j++) for (let i = -2; i <= 1; i++) pc.set(ex + i, ey + j, W);
    pc.set(ex - 2, ey + 1, K); pc.set(ex + 1, ey + 1, K); pc.set(ex - 1, ey + 3, K); pc.set(ex, ey + 3, K);
    for (const i of [-2, 0, 1]) pc.set(ex + i, ey - 2, hex("#9a96a8"));
    for (let i = -2; i <= 1; i++) pc.set(ex + i, ey - 1, hex("#6a6678"));
  } else {
    for (let t = -3; t <= 3; t++) { pc.set(ex - 1 + t, ey + t, STONE[1]); pc.set(ex - 1 - t, ey + t, STONE[1]); }
  }
  if (heart) { // корона над плашкой
    const C = f === "umb" ? rim : GOLD, y0 = 1;
    for (let i = -6; i <= 6; i++) { pc.set(Math.round(cx) + i, y0 + 4, C[3]); pc.set(Math.round(cx) + i, y0 + 5, C[2]); }
    for (const k of [-6, -3, 0, 3, 6]) for (let j = 0; j < (k === 0 ? 4 : 3); j++) pc.set(Math.round(cx) + k, y0 + 3 - j + (k === 0 ? 0 : 1), C[4]);
    pc.set(Math.round(cx), y0 - 1, f === "sol" ? hex("#5fa8ff") : f === "umb" ? hex("#8fd46a") : STONE[4]);
  }
  pc.outline(OUT);
  return pc;
}
// ---------------------------------------------------------------- варианты значка карты (на выбор пользователя, в игру не идут)
const CROWN = (pc: PC, cx: number, y0: number, C: RGBA[]) => {
  for (let i = -5; i <= 5; i++) { pc.set(cx + i, y0 + 4, C[3]); pc.set(cx + i, y0 + 5, C[2]); }
  for (const k of [-5, -2, 2, 5]) for (let j = 0; j < 3; j++) pc.set(cx + k, y0 + 3 - j + 1, C[4]);
  for (let j = 0; j < 4; j++) pc.set(cx, y0 + 3 - j, C[5]);
};
const clothOf = (f: IconF): [RGBA, RGBA, RGBA] => f === "sol" ? [hex("#1c3a72"), GOLD[4], GOLD[5]] : f === "umb" ? [hex("#3a1f55"), hex("#c8c4d0"), hex("#ece6f4")] : [hex("#55515c"), STONE[4], STONE[3]];
/** A — развевающийся вымпел на древке с золотым навершием. */
function iconA(f: IconF, heart: boolean): PC {
  const k = heart ? 1.3 : 1, w = Math.round(22 * k), h = Math.round(26 * k) + (heart ? 6 : 0), pc = new PC(w, h);
  const [cl, ed, em] = clothOf(f), top = heart ? 8 : 2, px = 4, cw = Math.round(14 * k), ch = Math.round(11 * k);
  for (let y = top; y < h - 1; y++) { pc.set(px, y, GOLD[2]); pc.set(px + 1, y, GOLD[4]); }
  pc.set(px, top - 1, GOLD[5]); pc.set(px + 1, top - 1, GOLD[5]); pc.set(px, top - 2, GOLD[4]);
  for (let x = 0; x < cw; x++) {
    const wave = Math.round(Math.sin(x / cw * Math.PI * 1.6) * 1.6 * k), len = ch - Math.round((x / cw) * 3 * k) * (x > cw * 0.6 ? 1 : 0);
    for (let j = 0; j < len; j++) {
      const y = top + 1 + j + wave, X = px + 2 + x;
      const tail = x > cw - 4 && Math.abs(j - len / 2) < (x - (cw - 4)) * 0.9;
      if (tail) continue;
      pc.set(X, y, j === 0 || j === len - 1 || x === cw - 1 ? ed : (Math.sin(x * 0.9) > 0.6 ? mix(cl, hex("#ffffff"), 0.12) : cl));
    }
  }
  const ex = px + 2 + Math.round(cw * 0.42), ey = top + 1 + Math.round(ch / 2);
  if (f !== "none") for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (Math.abs(i) + Math.abs(j) < 2 || f === "sol") pc.set(ex + i, ey + j + Math.round(Math.sin((ex - px - 2) / cw * Math.PI * 1.6) * 1.6 * k), em);
  if (heart) CROWN(pc, px + 1, 0, f === "umb" ? IRON : GOLD);
  pc.outline(OUT);
  return pc;
}
/** B — геральдический щит с гербом фракции и тонкой золотой рамкой (ничья — чистое поле). */
function iconB(f: IconF, heart: boolean): PC {
  const w = heart ? 24 : 20, sh = heart ? 26 : 22, h = sh + (heart ? 7 : 0), pc = new PC(w, h), top = heart ? 7 : 0;
  const field = f === "sol" ? hex("#1c3a72") : f === "umb" ? hex("#2a1838") : STONE[1];
  const inS = (x: number, y: number) => y >= 0 && x >= 0 && x < w && (y < sh * 0.6 ? y < sh : Math.abs(x + 0.5 - w / 2) <= w / 2 - (y - sh * 0.6) * (w / 2) / (sh * 0.4));
  for (let y = 0; y < sh; y++) for (let x = 0; x < w; x++) {
    if (!inS(x, y)) continue;
    const edge = !inS(x - 1, y) || !inS(x + 1, y) || !inS(x, y - 1) || !inS(x, y + 1);
    pc.set(x, y + top, edge ? GOLD[x + y < w ? 4 : 2] : field);
  }
  if (f !== "none") { const em = factionEmblem(f === "sol" ? "solgard" : "umbrath", "s16"); pc.blit(em, Math.round((w - em.w) / 2), top + Math.max(1, Math.round((sh - 4 - em.h) / 2))); }
  if (heart) CROWN(pc, Math.round(w / 2) - 1, 0, GOLD);
  pc.outline(OUT);
  return pc;
}
/** D — постамент в 3/4 с его знаменем (как в мире). */
function iconD(f: IconF, heart: boolean): PC {
  const w = heart ? 26 : 22, h = heart ? 32 : 28, pc = new PC(w, h);
  const st: Mat = { r: STONE }, gy = h - 1;
  box(pc, 2, gy - 4, 14, 4, 6, st, st, st);
  box(pc, 4, gy - 10, 10, 6, 5, st, st, st);
  const mx = 10;
  for (let y = 2; y < gy - 10; y++) { pc.set(mx, y, WOOD[3]); pc.set(mx + 1, y, WOOD[1]); }
  pc.set(mx, 1, GOLD[5]); pc.set(mx + 1, 1, GOLD[3]); pc.set(mx, 0, GOLD[4]);
  const [cl, ed, em] = clothOf(f), cw = heart ? 12 : 10, ch = heart ? 12 : 10, x0 = mx - Math.floor(cw / 2) + 1, y0 = 3;
  for (let x = x0 - 1; x <= x0 + cw; x++) pc.set(x, y0, GOLD[3]);
  for (let y = y0 + 1; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
    if (y >= y0 + ch - 2 && Math.abs(x + 0.5 - (x0 + cw / 2)) < (y - (y0 + ch - 2) + 1) * 1.5) continue;
    pc.set(x, y, x === x0 || x === x0 + cw - 1 ? ed : cl);
  }
  if (f !== "none") { pc.set(x0 + cw / 2 - 1, y0 + 4, em); pc.set(x0 + cw / 2, y0 + 4, em); pc.set(x0 + cw / 2 - 1, y0 + 5, em); pc.set(x0 + cw / 2, y0 + 5, em); }
  if (heart) { pc.set(mx - 2, 1, GOLD[4]); pc.set(mx + 3, 1, GOLD[4]); }
  pc.outline(OUT);
  return pc;
}
/** Лист вариантов: строки A–D, в каждой ничья / Сольгард / Умбрат и те же Сердца — ×1 на подложке карты, затем ×3. */
function iconVariants(file: string) {
  const V: [string, (f: IconF, h: boolean) => PC][] = [["1 ВЫМПЕЛ НА ДРЕВКЕ", iconA], ["2 ГЕРАЛЬДИЧЕСКИЙ ЩИТ", iconB], ["3 ПЕЧАТЬ-МЕДАЛЬОН, СЕЙЧАС В ИГРЕ", mapIcon], ["4 ПОСТАМЕНТ СО ЗНАМЕНЕМ", iconD], ["4+ ВЫБРАН: КРУПНОЕ ЗНАМЯ С ГЕРБОМ", (f: IconF, h: boolean) => iconMap(f, h, false)], ["4+ МИНИ-КАРТА", (f: IconF, h: boolean) => iconMap(f, h, true)]];
  const cells: [IconF, boolean][] = [["none", false], ["sol", false], ["umb", false], ["none", true], ["sol", true], ["umb", true]];
  const RW = 6 * 40 + 20, ZW = 6 * 110, rowH = 120, W = 20 + RW + ZW + 20;
  const out = new PC(W, 50 + V.length * rowH);
  out.rect(0, 0, W, out.h, [22, 19, 26, 255]);
  label(out, "ЗНАЧОК ОСНОВАНИЯ НА КАРТЕ: 4 ВАРИАНТА. НИЧЬЯ / СОЛЬГАРД / УМБРАТ, ЗАТЕМ СЕРДЦА; X1 СЛЕВА, X3 СПРАВА", 20, 16, [236, 230, 244, 255], 2);
  V.forEach(([name, fn], r) => {
    const y = 50 + r * rowH;
    label(out, name, 20, y, [255, 216, 74, 255], 2);
    const bg = new PC(RW, 70); paintGround(bg, 0, 0, RW, 70, "dirt");
    for (let yy = 0; yy < 70; yy++) for (let xx = 0; xx < RW; xx++) { const c = bg.get(xx, yy)!; bg.set(xx, yy, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 255]); } // как подложка карты
    cells.forEach(([f, h], i) => { const ic = fn(f, h); bg.blit(ic, 10 + i * 40 + Math.round((30 - ic.w) / 2), Math.round((70 - ic.h) / 2)); });
    out.blit(bg, 20, y + 22);
    cells.forEach(([f, h], i) => { const ic = scaleNN(fn(f, h), 3); out.blit(ic, 20 + RW + 10 + i * 110 + Math.round((100 - ic.w) / 2), y + 18); });
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  out.save(file);
}

/**
 * Значок карты (выбор пользователя — вариант 4, «постамент со знаменем», крупнее): знамя ~60% высоты с гербом на полотнище
 * (солнце / череп в короне / чистое у ничьей), под ним постамент 3/4, тёмный контур всего значка; у Сердца — корона над навершием.
 * mini — для мини-карты: то же, меньше.
 */
function iconMap(f: IconF, heart: boolean, mini: boolean): PC {
  const H = mini ? (heart ? 19 : 16) : heart ? 34 : 30, W = mini ? 13 : heart ? 26 : 22, pc = new PC(W, H);
  const [cl, ed] = clothOf(f), cx = Math.floor(W / 2);
  const crownH = heart ? (mini ? 3 : 5) : 0;
  // постамент: две ступени в 3/4
  const st: Mat = { r: STONE }, gy = H - 1;
  if (mini) { box(pc, cx - 5, gy - 3, 9, 3, 3, st, st, st); }
  else { box(pc, cx - 8, gy - 4, 14, 4, 6, st, st, st); box(pc, cx - 5, gy - 8, 8, 4, 4, st, st, st); }
  const top = crownH + (mini ? 1 : 2);                         // навершие
  const barY = top + (mini ? 1 : 2), cw = mini ? 9 : heart ? 16 : 14, ch = mini ? 9 : heart ? 18 : 16;
  const x0 = cx - Math.floor(cw / 2);
  const poleBot = gy - (mini ? 3 : 8);
  for (let y = top; y <= poleBot; y++) { pc.set(cx, y, WOOD[3]); if (!mini) pc.set(cx + 1, y, WOOD[1]); }
  pc.set(cx, top - 1, GOLD[5]); if (!mini) { pc.set(cx + 1, top - 1, GOLD[3]); pc.set(cx, top - 2, GOLD[4]); }
  for (let x = x0 - 1; x <= x0 + cw; x++) pc.set(x, barY, GOLD[x < cx ? 4 : 2]);
  for (let y = barY + 1; y <= barY + ch; y++) for (let x = x0; x < x0 + cw; x++) {
    const tail = y > barY + ch - (mini ? 2 : 4) && Math.abs(x + 0.5 - (x0 + cw / 2)) < (y - (barY + ch - (mini ? 2 : 4))) * 1.4;
    if (tail) continue;
    const edge = x === x0 || x === x0 + cw - 1 || (!mini && y === barY + 1);
    pc.set(x, y, edge ? ed : x < x0 + cw / 2 ? mix(cl, hex("#ffffff"), 0.08) : cl);
  }
  // герб на полотнище
  const ex = x0 + Math.floor(cw / 2), ey = barY + Math.round(ch * 0.45);
  if (f === "sol") {
    const r = mini ? 1 : 2;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 1) pc.set(ex + i - (mini ? 0 : 1), ey + j, GOLD[i + j < 0 ? 5 : 4]);
    if (!mini) for (const [i, j] of [[-4, 0], [3, 0], [-1, -4], [-1, 4], [-3, -3], [1, -3], [-3, 3], [1, 3]]) pc.set(ex + i, ey + j, GOLD[3]);
  } else if (f === "umb") {
    const Wt: RGBA = hex("#ece6f4"), K: RGBA = hex("#0c0810"), Cr: RGBA = hex("#9a96a8");
    if (mini) { pc.set(ex - 1, ey, Wt); pc.set(ex, ey, Wt); pc.set(ex - 1, ey + 1, Wt); pc.set(ex, ey + 1, Wt); pc.set(ex - 1, ey - 1, Cr); pc.set(ex, ey - 1, Cr); }
    else {
      for (let j = 0; j <= 4; j++) for (let i = -2; i <= 2; i++) if (!(j === 4 && Math.abs(i) === 2)) pc.set(ex + i - 1 + 1, ey + j - 1, Wt);
      pc.set(ex - 1, ey + 1, K); pc.set(ex + 1, ey + 1, K); pc.set(ex, ey + 3, K);
      for (const i of [-2, 0, 2]) { pc.set(ex + i, ey - 3, Cr); pc.set(ex + i, ey - 4, Cr); }
      for (let i = -2; i <= 2; i++) pc.set(ex + i, ey - 2, hex("#6a6678"));
    }
  }
  if (heart) { // корона над навершием
    const C = f === "umb" ? IRON : GOLD, w2 = mini ? 2 : 4;
    for (let i = -w2; i <= w2; i++) pc.set(cx + i, crownH - 1, C[3]);
    for (const k of mini ? [-2, 0, 2] : [-4, -2, 0, 2, 4]) for (let j = 1; j < (k === 0 ? crownH : crownH - 1); j++) pc.set(cx + k, crownH - 1 - j, C[4]);
  }
  pc.outline(OUT);
  return pc;
}

export function writeWarIcons(uiRoot: string): string[] {
  const dir = path.join(uiRoot, "war");
  fs.mkdirSync(dir, { recursive: true });
  const ids: string[] = [];
  for (const f of ["sol", "umb", "none"] as IconF[]) for (const heart of [false, true]) {
    const id = `icon-${f}${heart ? "-heart" : ""}`;
    iconMap(f, heart, false).save(path.join(dir, `${id}.png`));
    iconMap(f, heart, true).save(path.join(dir, `mini-${f}${heart ? "-heart" : ""}.png`));
    ids.push(id);
  }
  return ids;
}

export function writeWarBasesGame(assetsRoot: string): string[] {
  writeWarIcons(path.join(assetsRoot, "..", "ui"));
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* манифеста ещё нет */ }
  const one = (id: string, pc: PC, anchor: [number, number], extra: Record<string, unknown> = {}) => {
    pc.save(path.join(dir, `${id}.png`));
    m[id] = { frameW: pc.w, frameH: pc.h, frames: 1, fps: 1, anchor, blend: "normal", ...extra };
  };
  // якорь — центр следа постамента на земле (середина нижней ступени с учётом глубины 3/4): он ставится в центр круга захвата
  const anc: [number, number] = [+(FOOT_C[0] / FW).toFixed(4), +(FOOT_C[1] / FH).toFixed(4)];
  one("war-plinth", plinthLayer(), anc, { plate: PLATE });
  one("war-mast", mastLayer(), anc, { mast: [MAST_X, MAST_TOP, MAST_LOW] });
  one("war-plate-sol", plate("solgard"), [0, 0]);
  one("war-plate-umb", plate("umbrath"), [0, 0]);
  one("war-dot", softDot(32), [0.5, 0.5]);
  one("war-beam", beam(), [0.5, 1]);
  one("war-swords", swords(), [0.5, 0.5]);
  const anim = (id: string, a: Anim) => {
    strip(a.frames).save(path.join(dir, `${id}.png`));
    m[id] = { frameW: a.w, frameH: a.h, frames: a.frames.length, fps: a.fps || 1, anchor: [+a.anchor[0].toFixed(4), +a.anchor[1].toFixed(4)], blend: "normal" };
  };
  anim("war-royal-sol", royalSolgard());
  anim("war-royal-umb", royalUmbrath());
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
  return ["war-plinth", "war-mast", "war-plate-sol", "war-plate-umb", "war-dot", "war-beam", "war-swords", "war-royal-sol", "war-royal-umb", ...writeWarRingsGame(assetsRoot)];
}

/** Превью постамента: ничей, со знаменем Сольгарда на середине и наверху, Умбрата наверху; ×1 и ×3. */
function preview(file: string) {
  const plinth = plinthLayer(), mast = mastLayer(), rs = royalSolgard(), ru = royalUmbrath();
  const pS = plate("solgard"), pU = plate("umbrath");
  const scene = (banner: Anim | null, h: number, pl: PC | null) => {
    const g = new PC(FW + 40, FH + 10);
    paintGround(g, 0, 0, g.w, g.h, "dirt");
    const ox = 20, oy = 2;
    g.blit(mast, ox, oy);
    if (banner) {
      const y = MAST_LOW + (MAST_TOP - MAST_LOW) * h;
      g.blit(banner.frames[3], Math.round(ox + MAST_X - banner.anchor[0] * banner.w), Math.round(oy + y - banner.anchor[1] * banner.h));
    }
    g.blit(plinth, ox, oy);
    if (pl) g.blit(pl, ox + PLATE[0], oy + PLATE[1]);
    return g;
  };
  const cells = [scene(null, 0, null), scene(rs, 0.5, null), scene(rs, 1, pS), scene(ru, 1, pU)];
  const k = 3, W1 = cells.reduce((s, c) => s + c.w + 10, 10);
  const out = new PC(Math.max(W1, 2 * cells[0].w * k + 30), 40 + cells[0].h + 20 + cells[0].h * k + 10);
  out.rect(0, 0, out.w, out.h, [22, 19, 26, 255]);
  label(out, "ПОСТАМЕНТ ЗНАМЕНИ: НИЧЕЙ / ПОДЪЁМ / СОЛЬГАРД / УМБРАТ. X1 И X3", 10, 12, [236, 230, 244, 255], 2);
  let x = 10; for (const c of cells) { out.blit(c, x, 40); x += c.w + 10; }
  out.blit(scaleNN(cells[0], k), 10, 60 + cells[0].h);
  out.blit(scaleNN(cells[2], k), 20 + cells[0].w * k, 60 + cells[0].h);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  out.save(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  if (process.argv.includes("--preview")) preview(path.join(root, "tools/out/banners-event/v2-plinth.png"));
  else if (process.argv.includes("--icon-variants")) iconVariants(path.join(root, "tools/out/banners-event/v2-map-icons.png"));
  else if (process.argv.includes("--icons")) console.log("значки:", writeWarIcons(path.join(root, "client/public/ui")).join(", "));
  else console.log("основания:", writeWarBasesGame(path.join(root, "client/public/assets")).join(", "));
}
