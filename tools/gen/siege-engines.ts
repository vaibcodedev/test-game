/**
 * Осада форта (задача 132, шаг 15): лист тарана и камень камнемёта. Только эти кадры — общий npm run assets не нужен:
 *   npx tsx tools/gen/siege-engines.ts  →  client/public/assets/siege/ram.png (64×72, ряд 0 — Сольгард, ряд 1 — Умбрат; кадры 0–3 — ход,
 *   4–7 — удар: бревно оттянуто, затем выброшено вперёд), stone.png (14×14). Клиент грузит их сам (client/src/game/siegeView.ts).
 * Вид — сзади-сверху, как объекты карты: таран идёт к воротам «вверх» по экрану. Двускатная кровля из сырых шкур на дощатом остове,
 * колёса со спицами, в тёмном нутре — торец бревна на цепях; вымпел цвета фракции на коньке.
 */
import path from "node:path";
import { PC, hex, mix, ramp, sheet, shade, withA, hash01, type RGBA } from "./canvas";

const OUT: RGBA = hex("#141018");
const WOOD = ramp("#24160d", "#3f2716", "#5d3b20", "#7d522b", "#9f6c3a", "#c08a50");
const HIDE = ramp("#2e1c12", "#4a2e1c", "#6a4428", "#8a5a36", "#a77446", "#c4925e");
const IRON = ramp("#1e1e24", "#3a3a44", "#5c5c68", "#8a8a96", "#b8b8c4");
const PEN = { sol: ramp("#7a4a10", "#c08020", "#ffc850", "#ffe6a0"), umb: ramp("#3c2466", "#6a48a8", "#b890ff", "#e2d2ff") };
const FW = 64, FH = 72;

function wheel(c: PC, cx: number, cy: number, r: number, phase: number, dark: number) {
  const k = (col: RGBA) => shade(col, dark);
  c.ellipse(cx, cy, r, r, k(WOOD[1]));
  c.ellipse(cx, cy, r - 1.2, r - 1.2, k(WOOD[3]));
  c.ellipse(cx, cy, r - 2.4, r - 2.4, k(WOOD[1]));
  for (let i = 0; i < 4; i++) {
    const a = phase + (i * Math.PI) / 4;
    c.line(cx - Math.cos(a) * (r - 2), cy - Math.sin(a) * (r - 2), cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), k(WOOD[4]));
  }
  c.ellipse(cx, cy, 1.6, 1.6, k(IRON[3]));
  c.set(cx - 1, cy - 1, k(IRON[4]));
  // обод: оковка сверху
  for (let a = -2.6; a < -0.5; a += 0.08) c.set(cx + Math.cos(a) * (r - 0.5), cy + Math.sin(a) * (r - 0.5), k(IRON[3]));
}

/** Скат кровли из шкур: ряды внахлёст, швы, светлее левый (свет слева). */
function slope(c: PC, pts: [number, number][], lit: boolean, seed: number) {
  c.poly(pts, (x, y) => {
    const row = Math.floor((y + (lit ? 0 : 2)) / 5), fy = (y + (lit ? 0 : 2)) % 5;
    let v = (lit ? 3.1 : 2.1) + (hash01(row, Math.floor(x / 9), seed) - 0.5) * 0.9 - (fy === 4 ? 1.2 : fy === 0 ? -0.3 : 0);
    if (hash01(x, y, seed + 3) < 0.05) v -= 0.6;
    const i = Math.max(0, Math.min(HIDE.length - 1, Math.round(v)));
    return HIDE[i];
  });
}

function ram(f: number, fac: "sol" | "umb"): PC {
  const c = new PC(FW, FH);
  const strike = f >= 4, sf = f - 4;
  const roll = strike ? 0 : f;
  const jy = strike ? (sf === 2 ? 1 : 0) : roll % 2;
  const pull = strike ? [-2, -4, 3, 1][sf] : 0; // −: бревно оттянуто к нам, +: выброшено вперёд
  const phase = (roll * Math.PI) / 8;
  // тень на земле
  c.ellipse(32, 66, 28, 6, [10, 6, 16, 110]);
  // дальние колёса (передняя пара)
  wheel(c, 11, 46 + jy, 6, phase, 0.62);
  wheel(c, 53, 46 + jy, 6, phase, 0.62);
  // остов: брус по низу и стойки
  c.shadedRect(6, 52 + jy, 52, 6, WOOD);
  for (const x of [7, 54]) c.shadedRect(x, 30 + jy, 4, 26, WOOD);
  // нутро и бревно
  c.poly([[9, 38 + jy], [55, 38 + jy], [55, 53 + jy], [9, 53 + jy]], hex("#120a07"));
  const ly = 45 + jy - pull * 0.6, lr = 6.4 - pull * 0.25;
  // цепи от балки к бревну
  for (const [x0, x1] of [[18, 26], [46, 38]] as const) for (let t = 0; t <= 1; t += 0.12) c.set(Math.round(x0 + (x1 - x0) * t), Math.round(38 + jy + (ly - lr - 38 - jy) * t), t * 10 % 2 < 1 ? IRON[2] : IRON[3]);
  c.shadedEllipse(32, ly, lr, lr * 0.92, WOOD);
  for (const rr of [lr * 0.62, lr * 0.3]) for (let a = 0; a < Math.PI * 2; a += 0.2) c.set(Math.round(32 + Math.cos(a) * rr), Math.round(ly + Math.sin(a) * rr * 0.92), WOOD[2]);
  c.set(32, Math.round(ly), WOOD[1]);
  // кольцо оковки торца
  for (let a = 0; a < Math.PI * 2; a += 0.12) c.set(Math.round(32 + Math.cos(a) * (lr + 0.4)), Math.round(ly + Math.sin(a) * (lr + 0.4) * 0.92), a > 3.6 && a < 5.8 ? IRON[3] : IRON[1]);
  // кровля: два ската к коньку (уходят «вверх» — вперёд), задний фронтон из досок
  slope(c, [[32, 18 + jy], [32, 5 + jy], [7, 23 + jy], [4, 38 + jy]], true, 11);
  slope(c, [[32, 18 + jy], [32, 5 + jy], [57, 23 + jy], [60, 38 + jy]], false, 12);
  c.line(32, 5 + jy, 32, 18 + jy, HIDE[5]);
  c.poly([[32, 19 + jy], [6, 38 + jy], [58, 38 + jy]], (x, y) => {
    const plank = Math.floor((x + 1) / 5), v = 2.2 + (hash01(plank, 0, 7) - 0.5) * 0.9 + ((x + 1) % 5 === 0 ? -0.9 : 0) + (y - 19 - jy) * 0.03;
    return WOOD[Math.max(0, Math.min(WOOD.length - 1, Math.round(v)))];
  });
  // бахрома шкур по свесу и ремни
  for (let x = 4; x <= 60; x++) { const d = Math.round(hash01(x, 1, 5) * 2); for (let k = 0; k <= d; k++) c.set(x, 38 + jy + k, k === d ? HIDE[0] : HIDE[2]); }
  for (const x of [17, 32, 47]) c.line(x, 22 + jy + (x === 32 ? -3 : 0), x, 39 + jy, mix(HIDE[1], WOOD[1], 0.5));
  // ближние колёса (задняя пара)
  wheel(c, 9, 58 + jy, 8, phase, 1);
  wheel(c, 55, 58 + jy, 8, phase, 1);
  // вымпел фракции на коньке
  const P = PEN[fac], wave = Math.sin((f * Math.PI) / 2);
  c.line(32, 1 + jy, 32, 18 + jy, WOOD[1]);
  for (let x = 0; x < 11; x++) for (let y = 0; y < 6 - Math.floor(x / 3); y++) {
    const yy = 2 + jy + y + Math.round(Math.sin(x * 0.7 + wave) * 0.8) + Math.floor(x / 6);
    c.set(33 + x, yy, y === 0 ? P[3] : x > 7 ? P[1] : P[2]);
  }
  c.outline(OUT);
  // удар: щепа и пыль у колёс в кадре выброса
  if (strike && sf === 2) for (let i = 0; i < 7; i++) c.set(14 + Math.round(hash01(i, 2, 9) * 36), 64 + Math.round(hash01(i, 3, 9) * 4), withA(hex("#b49a78"), 200));
  return c;
}

function stone(): PC {
  const c = new PC(14, 14);
  c.shadedEllipse(7, 7, 5.6, 5.2, ramp("#2c2a2e", "#4a4650", "#6c6872", "#908a94", "#b8b2ba"));
  c.set(5, 8, hex("#3a363e")); c.set(6, 9, hex("#3a363e")); c.set(9, 5, hex("#3a363e"));
  c.outline(OUT);
  return c;
}

const dir = path.resolve("client/public/assets/siege");
sheet([0, 1].map((r) => Array.from({ length: 8 }, (_, f) => ram(f, r ? "umb" : "sol"))), FW, FH).save(path.join(dir, "ram.png"));
stone().save(path.join(dir, "stone.png"));
console.log("siege: ram.png (8×2 кадров 64×72), stone.png");
