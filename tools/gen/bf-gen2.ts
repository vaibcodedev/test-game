/** Свой арт шага 9 задачи 132, часть 2: тела павших, павшая лошадь, разбитые повозки, требушет (анимация), таран, осадная башня,
 *  воткнутое оружие, колья, стойка щитов, стол с картой, кровь и гарь. Тот же стиль и палитра, что в bf-gen.ts. */
import { PC, OUTLINE, mix, rng, hex, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { STONE_SOL, STONE_UMB, type Fac } from "./bf-gen";
import type { Anim } from "./battlefield";
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const BLOOD = hex("#4a1218"), BLOOD2 = hex("#6a1a20");
const t = (r: Ramp, i: number) => r[Math.max(0, Math.min(r.length - 1, i))];
const dark = hex("#0e0b13");

/** Лужа крови (плоская, под телом): тёмный край, чуть светлее середина; неровная по hash. */
function pool(pc: PC, cx: number, cy: number, rx: number, ry: number, seed: number, a = 190) {
  const r = rng(seed);
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy + (Math.sin(x * 0.9 + seed) + Math.cos(y * 1.3)) * 0.06;
    if (d > 1) continue;
    pc.set(x, y, [...(d > 0.55 ? BLOOD : BLOOD2).slice(0, 3), a] as RGBA);
  }
  for (let i = 0; i < 3; i++) pc.rect(Math.round(cx + (r() - 0.5) * rx * 2), Math.round(cy + (r() - 0.3) * ry), 2, 1, [...BLOOD.slice(0, 3), a] as RGBA); // брызги блоками
}

interface Kit { armor: Ramp; tabard: Ramp; trim: Ramp; helm: Ramp }
const KIT: Record<Fac, Kit> = {
  solgard: { armor: P.steel, tabard: P.cloth.white, trim: P.gold, helm: P.steel },
  umbrath: { armor: P.darkSteel, tabard: P.cloth.purple, trim: P.magic.purple, helm: P.darkSteel },
};

/** Павший воин, лежит на спине (pose 0) или на боку лицом вниз (pose 1). Холст 46×24; голова слева. */
export function fallen(fac: Fac, pose: number): PC {
  const K = KIT[fac], pc = new PC(48, 26);
  pool(pc, 24, 17, 19, 6, fac === "solgard" ? 5 : 6);
  const leg = (x: number, y: number, w: number, h: number, i: number) => { pc.rect(x, y, w, h, P.cloth.brown[i]); pc.rect(x, y, w, 1, P.cloth.brown[Math.min(3, i + 1)]); pc.rect(x + w - 3, y - 1, 4, h + 2, dark); pc.rect(x + w - 3, y, 3, h, P.leather[1]); };
  if (pose === 0) {
    leg(26, 12, 17, 4, 2); leg(27, 17, 16, 4, 1); // ноги с сапогами
    pc.rect(11, 9, 17, 12, K.armor[2]); pc.rect(11, 9, 17, 2, K.armor[4]); pc.rect(11, 19, 17, 2, K.armor[0]); pc.rect(11, 9, 2, 12, K.armor[3]); // кираса
    pc.rect(16, 11, 8, 8, K.tabard[2]); pc.rect(16, 11, 2, 8, K.tabard[3]); pc.rect(22, 11, 2, 8, K.tabard[1]); pc.rect(16, 16, 8, 1, K.trim[2]); // табард с каймой
    pc.rect(12, 21, 14, 1, K.armor[0]);
    pc.rect(14, 6, 11, 3, K.armor[3]); pc.rect(14, 6, 11, 1, K.armor[4]); pc.rect(25, 7, 7, 3, K.armor[2]); // рука вдоль тела вверх
    pc.rect(30, 7, 3, 3, P.skin[2]);
    pc.shadedEllipse(7, 15, 5, 5, P.skin, [-0.5, -0.6], false); // голова
    pc.rect(3, 12, 9, 3, K.helm[3]); pc.rect(4, 11, 7, 1, K.helm[4]); pc.rect(10, 12, 2, 5, K.helm[2]); // шлем сдвинут
    pc.rect(5, 16, 1, 1, OUTLINE); pc.rect(8, 16, 1, 1, OUTLINE); pc.rect(6, 18, 3, 1, P.skin[1]);
    pc.line(2, 4, 30, 5, K.armor[3], 1); pc.rect(30, 3, 2, 3, K.trim[2]); pc.rect(1, 3, 2, 3, K.armor[1]); // меч рядом
  } else {
    leg(24, 12, 15, 4, 1); pc.line(37, 11, 42, 7, P.cloth.brown[2], 3); pc.rect(40, 5, 5, 3, dark); // согнутая нога
    leg(27, 17, 16, 4, 2);
    pc.rect(10, 8, 17, 13, K.armor[1]); pc.rect(10, 8, 17, 2, K.armor[3]); pc.rect(10, 19, 17, 2, K.armor[0]); // спина
    pc.rect(15, 10, 9, 9, K.tabard[1]); pc.rect(15, 10, 2, 9, K.tabard[2]);
    pc.line(19, 4, 21, 14, P.wood[3], 1); pc.line(19, 4, 21, 14, P.wood[2], 1); pc.rect(17, 2, 5, 3, P.cloth.rag[3]); // стрела в спине с оперением
    pc.rect(8, 12, 4, 6, K.armor[2]); // плечо
    pc.rect(2, 17, 13, 3, K.armor[2]); pc.rect(2, 17, 13, 1, K.armor[4]); pc.rect(0, 17, 3, 3, P.skin[2]); // рука вперёд
    pc.shadedEllipse(8, 11, 4, 4, K.helm, [-0.5, -0.6], true);
    // щит круглый рядом
    pc.shadedEllipse(36, 5, 6, 4, K.tabard, [-0.5, -0.6], false); pc.ellipse(36, 5, 2, 1, K.trim[3]);
  }
  return pc.outline();
}

/** Скелет в доспехе: рёбра в проржавевшей кирасе, череп, кости рук, шлем рядом. Холст 44×24. */
export function skeletonArmor(): PC {
  const pc = new PC(44, 26), B = P.bone;
  pool(pc, 22, 18, 14, 4, 9, 120);
  pc.rect(10, 10, 15, 10, P.darkSteel[2]); pc.rect(10, 10, 15, 2, P.darkSteel[4]); pc.rect(10, 18, 15, 2, P.darkSteel[0]); pc.rect(10, 10, 2, 10, P.darkSteel[3]); // кираса
  pc.rect(14, 12, 7, 5, dark); for (let i = 0; i < 3; i++) pc.rect(14, 12 + i * 2, 7, 1, B[2]); pc.rect(17, 11, 1, 8, B[3]); // рёбра в проломе
  pc.rect(25, 12, 14, 2, B[2]); pc.rect(25, 12, 14, 1, B[3]); pc.rect(36, 10, 4, 4, B[2]); pc.rect(26, 17, 13, 2, B[1]); pc.rect(37, 16, 4, 3, B[2]); // кости ног
  pc.rect(10, 6, 12, 3, B[2]); pc.rect(10, 6, 12, 1, B[3]); pc.rect(22, 5, 4, 3, B[3]); // рука
  pc.shadedEllipse(6, 14, 5, 5, B, [-0.5, -0.6], false); pc.rect(4, 13, 2, 2, dark); pc.rect(8, 13, 2, 2, dark); pc.rect(5, 17, 4, 2, B[1]); pc.rect(5, 17, 1, 2, dark); pc.rect(7, 17, 1, 2, dark);
  pc.shadedEllipse(7, 22, 5, 2, P.darkSteel, [-0.5, -0.6], true); // шлем рядом
  pc.line(14, 2, 38, 3, P.steel[2], 1); pc.rect(37, 1, 2, 3, P.gold[1]); // ржавый меч
  return pc.outline();
}

/** Павшая лошадь на боку (масть гнедая, попона цвета фракции). Холст 72×40. */
export function fallenHorse(fac: Fac): PC {
  const pc = new PC(72, 40), H = P.leather, K = KIT[fac];
  pool(pc, 34, 31, 28, 7, 21);
  // ноги, торчащие вправо и вверх (две ближние слегка согнуты)
  const lg = (x0: number, y0: number, x1: number, y1: number, i: number) => { pc.line(x0, y0, x1, y1, H[i], 3); pc.rect(x1 - 1, y1 - 1, 4, 4, dark); pc.rect(x1, y1, 2, 2, P.bone[1]); };
  lg(50, 18, 64, 12, 1); lg(48, 24, 66, 22, 2); lg(26, 14, 22, 6, 1); lg(30, 28, 36, 36, 0);
  pc.shadedEllipse(40, 22, 22, 11, H, [-0.5, -0.65], false); // туловище
  pc.rect(28, 14, 20, 2, H[3]); // блик по хребту
  // попона и седло
  pc.rect(34, 14, 14, 12, K.tabard[2]); pc.rect(34, 14, 14, 2, K.tabard[3]); pc.rect(34, 24, 14, 2, K.tabard[0]); pc.rect(34, 20, 14, 1, K.trim[2]); pc.rect(36, 12, 10, 3, P.leather[2]);
  // шея и вытянутая голова на земле влево
  pc.poly([[24, 12], [14, 22], [16, 32], [26, 30]], H[2]); pc.poly([[24, 12], [14, 22], [16, 24], [25, 16]], H[3]); // шея
  pc.poly([[1, 31], [10, 22], [19, 24], [17, 34], [6, 37], [1, 35]], (x, y) => (y < 28 ? H[3] : y < 33 ? H[2] : H[1]));
  pc.rect(2, 33, 4, 3, H[0]); pc.rect(1, 31, 2, 2, dark); pc.rect(11, 25, 2, 2, dark); pc.rect(9, 27, 4, 1, P.bone[3]); // ноздря, глаз, лысина
  pc.poly([[14, 22], [16, 17], [18, 23]], H[1]); // ухо
  pc.line(25, 11, 14, 21, P.hair.black[2], 3); pc.line(24, 12, 13, 20, P.hair.black[1], 1); // грива
  pc.line(60, 22, 70, 30, P.hair.black[1], 2); // хвост
  return pc.outline();
}

// ---------- повозки ----------
function wheel(pc: PC, cx: number, cy: number, r: number, flat = false) {
  const ry = flat ? r * 0.45 : r;
  pc.ellipse(cx, cy, r + 1, ry + 1, P.wood[0]);
  pc.ellipse(cx, cy, r, ry, P.wood[2]);
  pc.ellipse(cx - 0.5, cy - 0.5, r - 2, ry - 2, P.wood[1]);
  pc.ellipse(cx, cy, r - 3, Math.max(1, ry - 3), P.dirt[0]);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; pc.line(cx - Math.cos(a) * (r - 1), cy - Math.sin(a) * (ry - 1), cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (ry - 1), P.wood[3]); }
  pc.ellipse(cx, cy, 2, flat ? 1 : 2, P.darkSteel[3]);
}
function sack(pc: PC, cx: number, cy: number, s: number, i = 2) {
  pc.shadedEllipse(cx, cy, 5 * s, 4 * s, P.cloth.rag, [-0.5, -0.6], false); pc.rect(Math.round(cx - 1), Math.round(cy - 4 * s - 1), 3, 2, P.cloth.rag[1]);
  pc.line(cx - 2, cy, cx + 2, cy + 1, P.cloth.rag[0]);
}
function crate(pc: PC, x: number, y: number, w: number, h: number) {
  pc.shadedRect(x, y, w, h, P.wood); pc.rect(x + 1, y + h / 2, w - 2, 1, P.wood[0]); pc.line(x + 1, y + 1, x + w - 2, y + h - 2, P.wood[0]);
}
/** Разбитая повозка. a — на боку с сорванным колесом и рассыпанными мешками; b — перевёрнута днищем вверх, колесо торчит. Холст 92×58. */
export function brokenWagon(v: "a" | "b"): PC {
  const pc = new PC(96, 60);
  pc.ellipse(48, 52, 40, 5, [0, 0, 0, 60]);
  if (v === "a") {
    // борт кузова с наклоном: параллелограмм из досок
    pc.poly([[14, 38], [62, 30], [66, 46], [18, 52]], (x, y) => (Math.floor((y - 30 + (x - 14) * 0.16) / 5) % 2 ? P.wood[1] : P.wood[2]));
    pc.line(14, 38, 62, 30, P.wood[3], 1); pc.line(18, 52, 66, 46, P.wood[0], 1);
    for (const x of [24, 40, 56]) pc.line(x, 37 - (x - 14) * 0.16, x + 3, 51 - (x - 14) * 0.12, P.wood[0], 1);
    // разломанный задний борт и торчащие доски
    pc.poly([[62, 30], [72, 24], [80, 33], [70, 38]], P.wood[1]); pc.line(66, 28, 74, 20, P.wood[3], 2); pc.line(70, 30, 84, 28, P.wood[2], 2);
    wheel(pc, 22, 50, 10); // целое колесо
    wheel(pc, 78, 52, 10, true); // сорванное колесо лежит плашмя
    pc.line(8, 46, 2, 54, P.wood[2], 3); // сломанное дышло
    sack(pc, 44, 28, 1.2); sack(pc, 56, 24, 1); sack(pc, 36, 56, 1); crate(pc, 60, 50, 10, 8);
    pc.line(82, 26, 90, 22, P.wood[1], 2);
  } else {
    // днище вверх: доски с поперечными брусьями, наклон на колесо
    pc.poly([[10, 34], [70, 24], [76, 42], [14, 52]], (x, y) => (Math.floor((x - 10) / 6) % 2 ? P.wood[1] : P.wood[2]));
    pc.line(10, 34, 70, 24, P.wood[3], 1); pc.line(14, 52, 76, 42, P.wood[0], 1);
    for (const y of [34, 44]) pc.line(12, y, 74, y - 9, P.wood[0], 2); // брусья
    pc.rect(34, 40, 6, 3, P.darkSteel[2]); pc.rect(54, 34, 6, 3, P.darkSteel[2]);
    wheel(pc, 80, 36, 12); // колесо на ребре, торчит вверх
    pc.line(78, 26, 78, 14, P.wood[2], 3); pc.line(77, 26, 77, 14, P.wood[3], 1); // торчащая ось
    wheel(pc, 18, 54, 8, true);
    sack(pc, 8, 50, 1.2); sack(pc, 86, 52, 1); crate(pc, 70, 50, 12, 8); crate(pc, 28, 56, 8, 5);
  }
  return pc.outline();
}

// ---------- осадные машины ----------
const beam = (pc: PC, x0: number, y0: number, x1: number, y1: number, w = 4) => {
  pc.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, P.wood[0], w);
  pc.line(x0, y0, x1, y1, P.wood[2], w);
  pc.line(x0 - 1, y0 - 1, x1 - 1, y1 - 1, P.wood[3], Math.max(1, w - 3));
};
/** Требушет: кадр цикла p (0..1), анимация 12 кадров: замах (противовес поднят, плечо опущено), бросок и успокоение. */
export function trebuchetFrame(i: number, n = 12): PC {
  const pc = new PC(160, 120), px = 60, py = 36;
  pc.ellipse(60, 112, 52, 5, [0, 0, 0, 60]);
  // плавная фаза: 0–3 покой заряжен, 4–8 бросок (easeInOut), 9–11 успокоение с затуханием колебаний
  const k = i < 4 ? 0 : i <= 8 ? easeInOut((i - 4) / 4) : 1;
  const settle = i > 8 ? Math.sin((i - 8) * 1.9) * 0.16 * (12 - i) / 4 : 0;
  const a = (-125 + 205 * k) * (Math.PI / 180) + settle; // от вертикали вверх, по часовой
  const L = 66, S = 24;
  const ux = Math.sin(a), uy = -Math.cos(a);
  const lx = px + ux * L, ly = py + uy * L, sx = px - ux * S, sy = py - uy * S;
  // основание: два полоза
  beam(pc, 8, 106, 112, 106, 5); beam(pc, 16, 98, 104, 98, 3);
  // задняя рама (тёмнее)
  pc.line(32, 100, px - 1, py + 4, P.wood[0], 4); pc.line(90, 100, px + 1, py + 4, P.wood[0], 4);
  // плечо
  beam(pc, Math.round(sx), Math.round(sy), Math.round(lx), Math.round(ly), 5);
  // противовес: ящик на шарнире за короткий конец, свисает вниз
  const cwx = Math.round(sx), cwy = Math.round(sy) + 5 + Math.round(settle * 12);
  pc.line(Math.round(sx), Math.round(sy), cwx, cwy, P.darkSteel[3], 1);
  pc.shadedRect(cwx - 9, cwy, 18, 17, P.wood); pc.rect(cwx - 9, cwy + 5, 18, 2, P.darkSteel[2]); pc.rect(cwx - 9, cwy + 11, 18, 2, P.darkSteel[2]); pc.rect(cwx - 6, cwy + 3, 3, 1, P.stone[3]);
  // праща и снаряд
  const sl = 22, ang = a + (i < 4 ? 0.5 : -0.9 * k);
  const bx = lx - Math.sin(ang) * -1 * 0 + Math.cos(ang) * 0, bxx = Math.round(lx + Math.sin(ang + 2.4) * sl * 0.9), byy = Math.round(ly + Math.cos(ang + 2.4) * sl * 0.9 * -1 + (i < 4 ? 14 : 4));
  void bx;
  pc.line(Math.round(lx), Math.round(ly), bxx, byy, P.cloth.rag[2], 1);
  if (i < 8) pc.shadedEllipse(bxx, byy + 2, 5, 5, P.stone, [-0.5, -0.6], false);
  // передняя рама (светлее)
  pc.line(26, 102, px - 3, py, P.wood[2], 5); pc.line(94, 102, px + 3, py, P.wood[2], 5); pc.line(27, 102, px - 2, py + 1, P.wood[3], 1); pc.line(95, 102, px + 4, py + 1, P.wood[3], 1);
  pc.line(40, 80, 82, 80, P.wood[1], 3); pc.line(46, 66, 76, 66, P.wood[1], 3);
  pc.ellipse(px, py, 5, 5, P.darkSteel[3]); pc.ellipse(px - 1, py - 1, 3, 3, P.darkSteel[4]); // ось
  wheel(pc, 20, 108, 7, true); wheel(pc, 100, 108, 7, true);
  return pc.outline();
}
/** Таран: крытая рама на колёсах, подвешенное бревно с железным оголовком. 104×56. */
export function ram(): PC {
  const pc = new PC(112, 64);
  pc.ellipse(54, 58, 44, 4, [0, 0, 0, 60]);
  // рама и стойки
  pc.rect(14, 50, 76, 4, P.wood[1]); pc.rect(14, 50, 76, 1, P.wood[3]);
  for (const x of [16, 36, 56, 76]) { pc.rect(x, 20, 4, 32, P.wood[2]); pc.rect(x, 20, 1, 32, P.wood[3]); pc.rect(x + 3, 20, 1, 32, P.wood[0]); }
  // кровля: двускатная из шкур
  pc.poly([[8, 22], [52, 6], [96, 22], [92, 26], [52, 12], [12, 26]], P.leather[2]);
  pc.poly([[8, 22], [52, 6], [52, 12], [12, 26]], P.leather[3]); pc.poly([[52, 6], [96, 22], [92, 26], [52, 12]], P.leather[1]);
  for (let x = 14; x < 92; x += 10) pc.line(x, 24 - Math.abs(x - 52) * 0.34, x, 20 - Math.abs(x - 52) * 0.2 + 5, P.leather[0], 1);
  pc.rect(8, 22, 88, 3, P.wood[2]); pc.rect(8, 22, 88, 1, P.wood[3]);
  // бревно на цепях, оголовок
  pc.line(26, 24, 26, 40, P.darkSteel[3], 1); pc.line(70, 24, 70, 40, P.darkSteel[3], 1);
  pc.shadedRect(2, 38, 98, 9, P.wood); pc.rect(2, 38, 98, 1, P.wood[3]);
  pc.shadedRect(92, 36, 14, 13, P.darkSteel); pc.rect(94, 38, 8, 2, P.darkSteel[4]); pc.rect(100, 40, 4, 6, P.darkSteel[2]);
  pc.rect(22, 38, 3, 9, P.darkSteel[2]); pc.rect(66, 38, 3, 9, P.darkSteel[2]);
  wheel(pc, 22, 54, 8); wheel(pc, 80, 54, 8);
  return pc.outline();
}
/** Осадная башня: деревянный короб на колёсах, обитый шкурами и железом, лестница, площадка с зубцами. 72×132. */
export function siegeTower(): PC {
  const pc = new PC(80, 136);
  pc.ellipse(40, 128, 34, 5, [0, 0, 0, 60]);
  const bx = 12, bw = 52;
  // короб
  pc.shadedRect(bx, 32, bw, 94, P.wood);
  for (let y = 36; y < 124; y += 11) { pc.rect(bx + 1, y, bw - 2, 1, P.wood[0]); }
  // шкуры по бокам-яруса
  for (const [y, h] of [[40, 28], [80, 28]] as const) {
    pc.rect(bx + 4, y, bw - 8, h, P.leather[2]); pc.rect(bx + 4, y, bw - 8, 2, P.leather[3]); pc.rect(bx + 4, y + h - 2, bw - 8, 2, P.leather[0]); pc.rect(bx + bw - 8, y, 4, h, P.leather[1]);
    for (let x = bx + 8; x < bx + bw - 8; x += 9) pc.rect(x, y + 3, 2, 2, P.darkSteel[3]);
    pc.line(bx + 4, y + h / 2, bx + bw - 5, y + h / 2, P.leather[0], 1);
  }
  // бойница-щель и железные полосы
  pc.rect(bx + 20, 70, 12, 3, dark);
  for (const y of [34, 76, 118]) { pc.rect(bx, y, bw, 3, P.darkSteel[2]); pc.rect(bx, y, bw, 1, P.darkSteel[4]); }
  // лестница сбоку
  pc.rect(bx + bw + 1, 40, 2, 84, P.wood[1]); pc.rect(bx + bw + 8, 40, 2, 84, P.wood[1]);
  for (let y = 44; y < 122; y += 8) pc.rect(bx + bw + 1, y, 9, 2, P.wood[2]);
  // площадка и зубцы
  pc.rect(bx - 6, 24, bw + 12, 9, P.wood[2]); pc.rect(bx - 6, 24, bw + 12, 1, P.wood[3]); pc.rect(bx - 6, 32, bw + 12, 1, P.wood[0]);
  for (let i = 0; i < 6; i++) { const mx = bx - 6 + i * 10; pc.shadedRect(mx, 12, 7, 13, P.wood); pc.poly([[mx, 12], [mx + 3.5, 6], [mx + 7, 12]], P.wood[2]); }
  // откидной мостик (поднят) с цепями
  pc.shadedRect(bx + 4, 8, 44, 4, P.wood);
  // колёса
  wheel(pc, 22, 126, 9, true); wheel(pc, 56, 128, 9, true);
  return pc.outline();
}

// ---------- мелочь ----------
const sword = (blade: Ramp, grip: Ramp): PC => {
  const pc = new PC(14, 32);
  pc.rect(6, 4, 3, 17, blade[2]); pc.rect(6, 4, 1, 17, blade[4]); pc.rect(8, 4, 1, 17, blade[1]); pc.poly([[6, 4], [7.5, 0], [9, 4]], blade[3]); // клинок
  pc.rect(2, 20, 11, 3, grip[2]); pc.rect(2, 20, 11, 1, grip[4]); // гарда
  pc.rect(6, 23, 3, 6, P.leather[2]); pc.rect(5, 29, 5, 3, grip[2]); // рукоять и навершие
  const o = pc.rotated(0.18, 7, 30);
  return o.outline();
};
function spikeBarrier(): PC {
  const pc = new PC(44, 36);
  pc.ellipse(22, 31, 18, 3, [0, 0, 0, 55]);
  const log = (x0: number, y0: number, x1: number, y1: number) => {
    pc.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, P.wood[0], 4); pc.line(x0, y0, x1, y1, P.wood[2], 4); pc.line(x0 - 1, y0 - 1, x1 - 1, y1 - 1, P.wood[3], 1);
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    pc.poly([[x1 - dy / l * 2 + dx / l * 1, y1 + dx / l * 2 + dy / l * 1], [x1 + dx / l * 5, y1 + dy / l * 5], [x1 + dy / l * 2 + dx / l * 1, y1 - dx / l * 2 + dy / l * 1]], P.wood[3]);
  };
  log(6, 28, 36, 6); log(8, 8, 38, 28); log(5, 18, 40, 18);
  pc.rect(19, 15, 6, 6, P.darkSteel[2]); pc.rect(19, 15, 6, 1, P.darkSteel[4]); // стяжка
  return pc.outline();
}
function arrowsPlanted(): PC {
  const pc = new PC(30, 30);
  for (const [x, y, a] of [[8, 28, -0.28], [15, 29, 0.05], [22, 28, 0.3]] as const) {
    const one = new PC(30, 30);
    one.rect(x - 1, y - 22, 2, 21, P.wood[3]); one.rect(x - 1, y - 22, 1, 21, P.wood[3]); one.rect(x, y - 22, 1, 21, P.wood[2]);
    one.poly([[x - 2, y - 26], [x, y - 22], [x + 2, y - 26], [x + 2, y - 22], [x - 2, y - 22]], P.cloth.rag[3]); one.rect(x - 2, y - 27, 4, 1, P.cloth.rag[2]); // оперение
    pc.blit(one.rotated(a, x, y), 0, 0);
  }
  pc.rect(5, 27, 20, 2, P.dirt[1]);
  return pc.outline();
}
function shieldStand(): PC {
  const pc = new PC(52, 40);
  pc.ellipse(26, 36, 22, 3, [0, 0, 0, 55]);
  pc.rect(3, 14, 3, 24, P.wood[2]); pc.rect(46, 14, 3, 24, P.wood[2]); pc.rect(3, 14, 1, 24, P.wood[3]); pc.rect(46, 14, 1, 24, P.wood[3]);
  pc.rect(3, 16, 46, 3, P.wood[2]); pc.rect(3, 16, 46, 1, P.wood[3]); pc.rect(3, 30, 46, 3, P.wood[1]);
  const sh = (cx: number, base: Ramp, trim: Ramp) => { pc.shadedEllipse(cx, 24, 8, 9, base, [-0.5, -0.6], false); pc.ellipse(cx, 24, 2, 2, trim[3]); pc.rect(cx - 8, 24, 16, 1, trim[2]); pc.rect(cx, 15, 1, 18, trim[2]); };
  sh(14, P.cloth.white, P.gold); sh(26, P.cloth.purple, P.magic.purple); sh(38, P.cloth.blue, P.gold);
  return pc.outline();
}
function mapTable(): PC {
  const pc = new PC(52, 38);
  pc.ellipse(26, 34, 22, 3, [0, 0, 0, 55]);
  for (const [x, y] of [[4, 24], [44, 24], [8, 30], [40, 30]] as const) pc.rect(x, y, 3, 9, P.wood[1]);
  pc.poly([[2, 18], [14, 10], [50, 10], [48, 22], [4, 26]], (x, y) => P.wood[y < 14 ? 3 : 2]);
  pc.poly([[8, 18], [16, 12], [44, 12], [42, 20], [10, 23]], P.cloth.rag[3]); // карта
  pc.line(14, 19, 24, 15, P.cloth.red[2], 1); pc.line(24, 15, 36, 17, P.cloth.red[2], 1); pc.line(20, 21, 34, 19, P.cloth.blue[2], 1);
  pc.rect(28, 13, 3, 3, P.cloth.blue[2]); pc.rect(16, 18, 3, 3, P.cloth.purple[2]); pc.rect(37, 15, 2, 4, P.gold[3]); // фишки
  pc.rect(42, 8, 3, 3, P.stone[3]); // тяжёлый камень на углу
  return pc.outline();
}
function decal(w: number, h: number, seed: number, col: RGBA, col2: RGBA): PC {
  const pc = new PC(w, h), r = rng(seed);
  for (let k = 0; k < 5; k++) {
    const cx = w / 2 + (r() - 0.5) * w * 0.45, cy = h / 2 + (r() - 0.5) * h * 0.35, rx = w * (0.18 + r() * 0.16), ry = h * (0.22 + r() * 0.16);
    pc.ellipse(cx, cy, rx, ry, col);
    if (k < 2) pc.ellipse(cx, cy, rx * 0.55, ry * 0.55, col2);
  }
  return pc;
}

export const OBJECTS: Record<string, () => PC> = {
  bf_fallen_sol_a: () => fallen("solgard", 0), bf_fallen_sol_b: () => fallen("solgard", 1),
  bf_fallen_umb_a: () => fallen("umbrath", 0), bf_fallen_umb_b: () => fallen("umbrath", 1),
  bf_skeleton_armor: skeletonArmor,
  bf_horse_fallen_sol: () => fallenHorse("solgard"), bf_horse_fallen_umb: () => fallenHorse("umbrath"),
  bf_wagon_broken_a: () => brokenWagon("a"), bf_wagon_broken_b: () => brokenWagon("b"),
  bf_ram: ram, bf_siege_tower: siegeTower,
  bf_sword_planted: () => sword(P.steel, P.gold), bf_sword_planted_dark: () => sword(P.darkSteel, P.magic.purple),
  bf_arrows_planted: arrowsPlanted, bf_spike_barrier: spikeBarrier, bf_shield_stand: shieldStand, bf_map_table: mapTable,
  bf_blood_a: () => decal(40, 22, 3, [...BLOOD.slice(0, 3), 200] as RGBA, [...BLOOD2.slice(0, 3), 200] as RGBA),
  bf_blood_b: () => decal(30, 18, 8, [...BLOOD.slice(0, 3), 200] as RGBA, [...BLOOD2.slice(0, 3), 200] as RGBA),
  bf_scorch: () => decal(44, 24, 5, [20, 16, 24, 215], [38, 31, 36, 215]),
};

/** Требушет: 12 кадров, 10 кадров/с (покой 4 такта, бросок 5, успокоение 3 с затуханием). */
export function ANIMS(): Anim[] {
  const frames = Array.from({ length: 12 }, (_, i) => trebuchetFrame(i));
  return [{ id: "bf-trebuchet", frames, fps: 10, anchor: [0.375, 0.95] }];
}
void mix; void STONE_SOL; void STONE_UMB; void t;
