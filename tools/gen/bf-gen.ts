/** Свой арт шага 9 задачи 132, часть 1: башни стен с лучником, шатры фракций, ворота частокола.
 *  Планка: объём, 3–5 тонов на материал, контур 1 px, свет сверху слева, без одиночных пикселей, пиксель — пиксель мира (как у Basic).
 *  Сольгард — белый камень с золотом и синим, Умбрат — тёмный камень с фиолетовым; рампы из tools/gen/palette.ts. */
import { PC, OUTLINE, mix, rng, hex, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";

export type Fac = "solgard" | "umbrath";
export const STONE_SOL: Ramp = P.cloth.white, STONE_UMB: Ramp = [hex("#16121c"), hex("#241e2e"), hex("#342c42"), hex("#463c58"), hex("#5a4e70")];
export const GOLD = P.gold, PURP = P.magic.purple, BLUE = P.cloth.blue;
const pick = (r: Ramp, i: number) => r[Math.max(0, Math.min(r.length - 1, i))];
export const lit = (r: Ramp) => r[r.length - 1], dim = (r: Ramp) => r[0];

/** Каменная кладка: заливка тонами со светом слева сверху, ряды по 5 px, швы со сдвигом, правая и нижняя грань темнее. */
export function brick(pc: PC, x: number, y: number, w: number, h: number, r: Ramp, seed = 1, course = 5, bw = 9) {
  const rnd = rng(seed);
  const mid = Math.floor(r.length / 2);
  pc.rect(x, y, w, h, pick(r, mid));
  for (let row = 0, yy = y; yy < y + h; row++, yy += course) {
    const hh = Math.min(course, y + h - yy);
    // светлая верхняя кромка ряда, тёмный шов снизу
    pc.rect(x, yy, w, 1, pick(r, mid + 1));
    if (hh > 1) pc.rect(x, yy + hh - 1, w, 1, pick(r, mid - 1));
    for (let xx = x + (row % 2 ? Math.floor(bw / 2) : 0); xx < x + w; xx += bw) if (xx > x) pc.rect(xx, yy + 1, 1, Math.max(1, hh - 1), pick(r, mid - 1));
    // несколько камней чуть светлее или темнее — без одиночных пикселей: блок 3×2
    for (let k = 0; k < 2; k++) {
      const bx = x + 1 + Math.floor(rnd() * Math.max(1, w - 5)), up = rnd() < 0.5;
      pc.rect(bx, yy + 1, 3, Math.max(1, hh - 2), pick(r, mid + (up ? 1 : -1)));
    }
  }
  pc.rect(x, y, 2, h, pick(r, mid + 1)); // освещённая левая грань
  pc.rect(x + w - 3, y, 3, h, pick(r, mid - 1)); // тень справа
  pc.rect(x + w - 1, y, 1, h, pick(r, 0));
  pc.rect(x, y + h - 2, w, 2, pick(r, 0)); // низ
}
/** Зубцы: n зубцов шириной mw с промежутком gap, высота mh; верх светлее, правая грань темнее. */
export function merlons(pc: PC, x: number, y: number, n: number, mw: number, gap: number, mh: number, r: Ramp) {
  for (let i = 0; i < n; i++) {
    const mx = x + i * (mw + gap);
    pc.rect(mx, y, mw, mh, pick(r, Math.floor(r.length / 2)));
    pc.rect(mx, y, mw, 1, lit(r));
    pc.rect(mx, y, 1, mh, pick(r, r.length - 2));
    pc.rect(mx + mw - 1, y, 1, mh, pick(r, 1));
  }
}

/** Лучник на стене: 10×21, шлем, лицо, туника цвета фракции, лук натянут влево. */
export function archer(pc: PC, x: number, y: number, fac: Fac) {
  const tunic = fac === "solgard" ? P.cloth.blue : P.cloth.purple;
  const steel = fac === "solgard" ? P.steel : P.darkSteel;
  pc.rect(x + 3, y + 8, 5, 9, tunic[2]); pc.rect(x + 3, y + 8, 1, 9, tunic[3]); pc.rect(x + 7, y + 8, 1, 9, tunic[1]); // торс
  pc.rect(x + 3, y + 13, 5, 1, P.leather[1]); // пояс
  pc.rect(x + 3, y + 17, 2, 4, P.cloth.brown[1]); pc.rect(x + 6, y + 17, 2, 4, P.cloth.brown[0]); // ноги
  pc.rect(x + 3, y + 3, 5, 5, P.skin[2]); pc.rect(x + 3, y + 3, 1, 5, P.skin[3]); pc.rect(x + 7, y + 4, 1, 4, P.skin[1]); // лицо
  pc.rect(x + 3, y + 1, 5, 3, steel[3]); pc.rect(x + 3, y, 4, 1, steel[4]); pc.rect(x + 7, y + 1, 1, 3, steel[2]); pc.rect(x + 3, y + 3, 5, 1, steel[1]); // шлем
  pc.rect(x + 5, y + 5, 1, 1, OUTLINE); // глаз
  pc.rect(x + 8, y + 9, 2, 2, P.skin[2]); pc.rect(x + 1, y + 9, 3, 2, tunic[2]); // руки
  // лук
  for (let i = 0; i < 12; i++) { const bx = x - 1 + Math.round(Math.sin((i / 11) * Math.PI) * 3); pc.set(bx, y + 4 + i, P.wood[2]); pc.set(bx - 1 > x - 2 ? bx : bx, y + 4 + i, P.wood[3]); }
  pc.line(x - 1, y + 4, x - 1, y + 15, P.cloth.rag[3]);
}

/** Башня стены (опора — низ): 52×~112. Квадратное тело, пояс, бойницы, стяг, зубчатая площадка с лучником. */
export function wallTower(fac: Fac): PC {
  const S = fac === "solgard" ? STONE_SOL : STONE_UMB;
  const accent = fac === "solgard" ? GOLD : PURP;
  const W = 52, H = 118, pc = new PC(W, H);
  const bx = 5, bw = 42, top = 44; // тело
  // тень на земле
  pc.ellipse(W / 2, H - 3, 24, 4, [0, 0, 0, 70]);
  brick(pc, bx, top, bw, H - top - 4, S, fac === "solgard" ? 3 : 4);
  // цоколь
  pc.rect(bx - 2, H - 12, bw + 4, 9, pick(S, 2)); pc.rect(bx - 2, H - 12, bw + 4, 1, lit(S)); pc.rect(bx - 2, H - 4, bw + 4, 1, dim(S));
  pc.rect(bx - 2, H - 12, 2, 9, pick(S, 3)); pc.rect(bx + bw, H - 12, 2, 9, pick(S, 1));
  // пояс (карниз) под площадкой
  pc.rect(bx - 3, top - 3, bw + 6, 5, pick(S, 3)); pc.rect(bx - 3, top - 3, bw + 6, 1, lit(S)); pc.rect(bx - 3, top + 1, bw + 6, 1, dim(S));
  pc.rect(bx - 3, top - 3, 2, 5, lit(S)); pc.rect(bx + bw + 1, top - 3, 2, 5, pick(S, 1));
  if (fac === "solgard") pc.rect(bx - 3, top - 1, bw + 6, 1, accent[3]); else pc.rect(bx - 3, top - 1, bw + 6, 1, accent[2]);
  // бойницы
  for (const sx of [14, 34]) { pc.rect(bx + sx - 2, top + 16, 4, 12, pick(S, 0)); pc.rect(bx + sx - 1, top + 17, 2, 10, OUTLINE); pc.rect(bx + sx - 2, top + 15, 4, 1, lit(S)); }
  // дверь (арка) и ступень
  pc.rect(bx + 15, H - 28, 12, 18, OUTLINE);
  pc.poly([[bx + 15, H - 28], [bx + 21, H - 34], [bx + 27, H - 28]], OUTLINE);
  pc.rect(bx + 16, H - 27, 10, 17, P.wood[1]); pc.rect(bx + 16, H - 27, 5, 17, P.wood[2]); pc.rect(bx + 21, H - 27, 1, 17, P.wood[0]);
  pc.rect(bx + 24, H - 19, 1, 2, accent[3]);
  // стяг на стене
  const bxx = bx + bw - 17, by = top + 4, col = fac === "solgard" ? P.cloth.blue : P.cloth.purple;
  pc.rect(bxx - 1, by - 2, 12, 2, P.wood[2]);
  pc.poly([[bxx, by], [bxx + 10, by], [bxx + 10, by + 19], [bxx + 5, by + 15], [bxx, by + 19]], (x, y) => (x < bxx + 3 ? col[3] : x > bxx + 7 ? col[1] : col[2]));
  if (fac === "solgard") { pc.ellipse(bxx + 5, by + 6, 3, 3, accent[3]); pc.rect(bxx + 4, by + 2, 3, 1, accent[4]); } else { pc.rect(bxx + 3, by + 4, 5, 4, PURP[3]); pc.rect(bxx + 4, by + 8, 3, 2, PURP[3]); pc.rect(bxx + 4, by + 5, 1, 1, OUTLINE); pc.rect(bxx + 6, by + 5, 1, 1, OUTLINE); }
  // площадка с зубцами; лучник стоит в проёме между зубцами
  const py = top - 3;
  pc.rect(bx - 3, py - 8, bw + 6, 8, pick(S, 2)); // парапет-основа
  merlons(pc, bx - 3, py - 15, 5, 7, 4, 8, S);
  pc.rect(bx - 3, py - 8, bw + 6, 1, lit(S)); pc.rect(bx - 3, py - 1, bw + 6, 1, dim(S));
  if (fac === "umbrath") for (let i = 0; i < 5; i++) { const mx = bx - 3 + i * 11 + 3; pc.poly([[mx - 1, py - 15], [mx + 2, py - 20], [mx + 5, py - 15]], accent[1]); pc.rect(mx + 1, py - 18, 1, 3, accent[2]); }
  archer(pc, bx - 3 + 11 * 2 - 2, py - 27, fac); // над зубцами в среднем проёме
  pc.rect(bx - 3 + 11 * 2 - 3, py - 15, 4, 7, pick(S, 2));
  return pc.outline();
}

// ---------- шатры ----------
interface TentOpt { w: number; h: number; a: Ramp; b: Ramp; trim: Ramp; door: boolean; flag?: Ramp; torn?: boolean; burnt?: boolean; seed: number; stripes: number }
/** Шатёр спереди-сбоку: полотнище клином (полосы двух тонов цвета фракции), тёмный вход с отвёрнутыми полами, коньковая жердь, колья и растяжки. */
function tent(o: TentOpt): PC {
  const { w, h } = o, pad = 12, pc = new PC(w + pad * 2, h + pad), cx = pad + w / 2, base = h + pad - 5, rnd = rng(o.seed);
  const ap = o.burnt ? 0.62 : 1;
  const apexY = Math.round(base - h * ap);
  pc.ellipse(cx, base + 1, w / 2 + 6, 4, [0, 0, 0, 60]);
  const sw = Math.max(5, Math.round(w / o.stripes));
  const charcoal = P.ash;
  const cloth = (x: number, y: number): RGBA => {
    const t = (x - (cx - w / 2)) / w; // 0..1
    const st = Math.floor((x - (cx - w / 2)) / sw) % 2 === 0 ? o.a : o.b;
    let i = t < 0.18 ? 3 : t < 0.55 ? 2 : t < 0.8 ? 1 : 0;
    if (y < apexY + 4) i = Math.min(3, i + 1); // верх светлее
    if (o.burnt) return charcoal[Math.min(charcoal.length - 1, Math.max(0, i + (st === o.a ? 0 : -1) + (rnd() < 0.08 ? 1 : 0)))];
    return st[Math.min(st.length - 1, i)];
  };
  // полотнище-клин
  pc.poly([[cx - w / 2, base], [cx, apexY], [cx + w / 2, base]], cloth);
  // нижняя кромка (подол) и складки от вершины к низу
  pc.rect(cx - w / 2, base - 2, w, 2, o.trim[o.burnt ? 0 : 1]);
  for (let k = -2; k <= 2; k++) { if (!k) continue; const fx = cx + k * (w / 6); pc.line(Math.round(cx + k * 1), apexY + 6, Math.round(fx), base - 3, (o.burnt ? charcoal[0] : o.a[0]) as RGBA); }
  // вход: тёмный клин, края-полы светлее
  if (o.door) {
    const dw = Math.round(w * 0.3), dh = Math.round(h * 0.55);
    pc.poly([[cx - dw / 2, base - 2], [cx, base - dh], [cx + dw / 2, base - 2]], OUTLINE);
    pc.poly([[cx - dw / 2 + 2, base - 2], [cx, base - dh + 4], [cx + dw / 2 - 2, base - 2]], hex("#0e0b13"));
    pc.line(cx - dw / 2, base - 2, cx - 1, base - dh + 1, o.trim[3]); pc.line(cx + dw / 2, base - 2, cx + 1, base - dh + 1, o.trim[1]);
  }
  // жердь на вершине и вымпел
  pc.rect(Math.round(cx) - 1, apexY - 9, 2, 11, P.wood[2]); pc.rect(Math.round(cx) - 1, apexY - 9, 1, 11, P.wood[3]);
  if (o.flag && !o.burnt) pc.poly([[cx + 1, apexY - 9], [cx + 13, apexY - 6], [cx + 1, apexY - 3]], (x) => o.flag![x > cx + 8 ? 1 : 2]);
  // колья и растяжки по краям
  for (const sx of [-1, 1]) { const px = Math.round(cx + sx * (w / 2 + 5)); pc.line(Math.round(cx + sx * w / 2) - sx, base - 3, px, base - 1, P.cloth.rag[2]); pc.rect(px - 1, base - 5, 2, 6, P.wood[2]); pc.rect(px - 1, base - 5, 1, 5, P.wood[3]); }
  // порванное: треугольные проломы с видом на каркас, лоскуты
  if (o.torn) {
    const holes: [number, number, number][] = [[-0.22, 0.45, 9], [0.2, 0.3, 7], [0.08, 0.75, 6]];
    for (const [fx, fy, s] of holes) {
      const hx = Math.round(cx + fx * w), hy = Math.round(base - h * fy);
      pc.poly([[hx - s / 2, hy + s], [hx, hy - s / 2], [hx + s / 2, hy + s * 0.6], [hx + 1, hy + s]], hex("#16111c"));
      pc.line(hx - 1, hy - s / 2, hx - 1, hy + s, P.wood[1]);
      pc.line(hx + s / 2, hy + s * 0.6, hx + s / 2 + 2, hy + s + 3, o.a[1]); // болтающийся лоскут
    }
    // зубчатый подол
    for (let x = cx - w / 2 + 3; x < cx + w / 2 - 6; x += 9) pc.poly([[x, base - 2], [x + 4, base - 2], [x + 2, base - 6]], hex("#16111c"));
  }
  // обгорелое: красный жар в проломах и сажа сверху
  if (o.burnt) {
    for (let i = 0; i < 7; i++) { const hx = Math.round(cx + (rnd() - 0.5) * w * 0.7), hy = Math.round(base - h * (0.2 + rnd() * 0.4)); pc.rect(hx, hy, 3, 2, P.lava[3 - (i % 2)]); pc.rect(hx - 1, hy + 2, 2, 1, P.lava[1]); }
    pc.poly([[cx - 6, apexY + 1], [cx - 2, apexY - 3], [cx + 2, apexY + 2], [cx + 6, apexY - 1], [cx + 9, apexY + 6], [cx - 9, apexY + 6]], hex("#16111c")); // обрушенная вершина
    pc.line(cx - 6, apexY + 3, cx - 16, apexY + 14, P.wood[0], 2); // обгоревшая жердь
  }
  return pc.outline();
}

export const TENTS: Record<string, () => PC> = {
  bf_tent_sol: () => tent({ w: 64, h: 52, a: P.cloth.white, b: GOLD.map((c, i) => (i < 4 ? mix(c, P.cloth.white[2], 0.25) : c)) as Ramp, trim: GOLD, door: true, flag: P.cloth.blue, seed: 11, stripes: 6 }),
  bf_tent_sol_cmd: () => tent({ w: 92, h: 70, a: P.cloth.white, b: GOLD, trim: GOLD, door: true, flag: P.cloth.blue, seed: 12, stripes: 8 }),
  bf_tent_umb: () => tent({ w: 64, h: 52, a: [hex("#14111a"), hex("#221c2c"), hex("#322a42"), hex("#463c5a")], b: P.cloth.purple, trim: PURP, door: true, flag: P.cloth.purple, seed: 13, stripes: 6 }),
  bf_tent_umb_cmd: () => tent({ w: 92, h: 70, a: [hex("#14111a"), hex("#221c2c"), hex("#322a42"), hex("#463c5a")], b: P.cloth.purple, trim: PURP, door: true, flag: P.cloth.purple, seed: 14, stripes: 8 }),
  bf_tent_torn: () => tent({ w: 64, h: 52, a: P.cloth.rag, b: P.cloth.brown, trim: P.cloth.rag, door: true, torn: true, seed: 15, stripes: 6 }),
  bf_tent_burnt: () => tent({ w: 64, h: 52, a: P.cloth.rag, b: P.cloth.brown, trim: P.cloth.rag, door: false, burnt: true, seed: 16, stripes: 6 }),
};

/** Двустворчатые ворота частокола (96×80): два столба-башенки из заострённых брёвен, створки с накладками, перекладина. Опора — низ. */
export function palisadeGate(): PC {
  const W = 80, H = 76, pc = new PC(W, H);
  pc.ellipse(W / 2, H - 3, 36, 4, [0, 0, 0, 60]);
  const log = (x: number, y: number, w: number, h: number, tip: boolean) => {
    pc.rect(x, y, w, h, P.wood[2]); pc.rect(x, y, 2, h, P.wood[3]); pc.rect(x + w - 2, y, 2, h, P.wood[1]); pc.rect(x + w - 1, y, 1, h, P.wood[0]);
    for (let k = 8; k < h; k += 9) pc.rect(x + 1, y + k, w - 2, 1, P.wood[1]); // перевязь
    if (tip) pc.poly([[x, y], [x + w / 2, y - 7], [x + w, y]], (xx) => (xx < x + w / 2 ? P.wood[3] : P.wood[2]));
  };
  // боковые заострённые столбы (по 3 бревна), правый ниже/выше — для живости
  for (let i = 0; i < 3; i++) { log(2 + i * 7, 14 + (i === 1 ? -4 : 0), 7, 56 + (i === 1 ? 4 : 0), true); log(W - 23 + i * 7, 14 + (i === 1 ? -4 : 0), 7, 56 + (i === 1 ? 4 : 0), true); }
  // перекладина над проёмом и створки
  pc.rect(23, 14, 34, 7, P.wood[2]); pc.rect(23, 14, 34, 1, P.wood[3]); pc.rect(23, 20, 34, 1, P.wood[0]);
  for (const x0 of [24, 40]) {
    pc.rect(x0, 22, 16, 48, P.wood[1]);
    for (let k = 0; k < 4; k++) pc.rect(x0 + k * 4, 22, 3, 48, k % 2 ? P.wood[1] : P.wood[2]);
    pc.rect(x0, 30, 16, 3, P.darkSteel[2]); pc.rect(x0, 58, 16, 3, P.darkSteel[2]); pc.rect(x0, 30, 16, 1, P.darkSteel[4]); pc.rect(x0, 58, 16, 1, P.darkSteel[4]);
    for (const yy of [31, 59]) for (const xx of [x0 + 2, x0 + 12]) pc.rect(xx, yy, 2, 2, P.steel[3]);
  }
  pc.rect(39, 22, 2, 48, P.wood[0]); // щель между створками
  pc.rect(36, 44, 3, 5, P.darkSteel[3]); pc.rect(41, 44, 3, 5, P.darkSteel[3]); // кольца-засов
  pc.rect(22, 66, 36, 4, P.dirt[1]); pc.rect(22, 66, 36, 1, P.dirt[3]); // порог
  return pc.outline();
}

export const OBJECTS: Record<string, () => PC> = {
  bf_wall_tower_sol: () => wallTower("solgard"),
  bf_wall_tower_umb: () => wallTower("umbrath"),
  ...TENTS,
  bf_palisade_gate: palisadeGate,
};
