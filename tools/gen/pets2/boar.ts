/**
 * Бронированный кабан (проход 4): кадр 48, копыта y≈44,5. Виды: вниз, вверх, вбок (рыло вправо; влево — зеркало).
 * Части: тело с высоким загривком и щетиной-гривой по хребту, поверх — клёпаные стальные пластины внахлёст (лобовая — на загривке),
 * подпруга под брюхом, тонкие ноги с раздвоенными копытами, голова клином: налобник с заклёпкой, пятачок с ноздрями,
 * окованные клыки, ухо, глаз с бликом. Пыль из-под копыта и пар из пятачка — пиксели поверх.
 */
import { Frame2, Sh, shiftCv, R, add, clamp, hash, ik2, lerp, nrm, rot, sh, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 48;
const FUR = R("#110c09", "#211812", "#35271d", "#4d3a2b", "#68513c", "#856b50");
const FURD = R("#0c0907", "#18120e", "#271d16", "#3a2c21", "#4f3d2e", "#66503d");
const MANE = R("#0a0807", "#17110d", "#261c16", "#3a2c22", "#54412f");
const STEEL = R("#0b0d10", "#171b20", "#262c33", "#3a424b", "#545e69", "#7a8591", "#b4bfca");
const LEATH = R("#1a0d07", "#341b0e", "#522d17", "#734424", "#935d34");
const HOOF = R("#0c0b0a", "#1e1b18", "#34302b", "#4c4740");
const SNOUT = R("#22100f", "#3e1d1b", "#5e302b", "#7e4840", "#9c6458");
const IVORY = R("#3a3226", "#6e624c", "#a89878", "#d8cba8", "#f4ecd4");
const EYE_D = hx("#0a0605"), EYE_G = hx("#e0a050"), MOUTH = hx("#2a0c0a");
const DUST = [hx("#5e4a38"), hx("#87705a"), hx("#ad977e")], STEAM = [hx("#9a9ca4"), hx("#c8cad0"), hx("#eceef2")];

export interface BoP {
  bob: number; br: number; hd: V2; ht: number; jaw: number; ear: number; blink: number;
  legs: [V2, V2, V2, V2]; // FN, FF, HN, HF: [вперёд, подъём]
  lean: number; dy: number; sway: number; tail: number; sink: number; dust: number; steam: number; ph: number;
}
export const REST: BoP = { bob: 0, br: 0, hd: [0, 0], ht: 0, jaw: 0, ear: 0, blink: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], lean: 0, dy: 0, sway: 0, tail: 0, sink: 0, dust: 0, steam: 0, ph: 0 };
const furB = (flow: V2, seed: number, len = 3, k = 0.85) => ({ flow, len: len + 0.6, k, seed, gx: 4, gy: 3 });

/** верхний край маски в 1× для столбца x */
function topOf(m: Sh, x: number): number {
  const cx = clamp(Math.round(x * 2), 0, m.w - 1);
  for (let y = 0; y < m.h; y++) if (m.d[y * m.w + cx]) return y / 2;
  return 99;
}
function rivet(f: Frame2, p: V2) { f.px(p, STEEL[6]); f.px(add(p, [1, 0]), STEEL[4]); f.px(add(p, [0, 1]), STEEL[2]); f.px(add(p, [1, 1]), STEEL[1]); }
/** пластина-«седло» по верхнему краю тела от xa до xb, глубина dep, нижняя кромка зубчатая; заклёпки по кромке */
function lame(f: Frame2, body: Sh, xa: number, xb: number, dep: number, bias: number, grp: string, rv = true, lift = 0.8) {
  const top: V2[] = [], bot: V2[] = [];
  for (let x = xa; x <= xb + 0.01; x += 0.5) { const t = topOf(body, x); if (t > 90) continue; top.push([x, t - lift]); bot.push([x, t + dep + 0.5 * SIN(x * 1.9)]); }
  if (top.length < 2) return;
  const m = sh(N).P([...top, ...bot.reverse()]);
  f.add(m, STEEL, { grp, bias, amp: 2.2, dome: 3, occ: 1.4, rim: 0.6 });
  // блик-полоса по выпуклости пластины (левее середины — свет слева)
  for (let i = 1; i < Math.ceil(top.length * 0.55); i++) f.px(add(top[i], [0, 1.6]), STEEL[5]);
  if (rv) { const bb = bot.slice().reverse(); for (let i = 3; i < bb.length - 2; i += 6) rivet(f, add(bb[i], [-0.5, -2.2])); }
}
function hoof(f: Frame2, p: V2, grp: string, wide = false) {
  f.add(sh(N).E(p, wide ? 2.2 : 2.0, 1.35), HOOF, { grp, amp: 1.4, dome: 1, bias: 0.3 });
  if (wide) f.px(add(p, [0, 0.4]), HOOF[0]);
}
function puffs(f: Frame2, at: V2, k: number, cols: C[], dirx: number, seed: number) {
  if (k <= 0.02) return;
  for (let i = 0; i < 9; i++) {
    const a = hash(i, seed) * PI, r = 1 + k * (2 + 3 * hash(seed, i));
    const p: V2 = [at[0] + dirx * COS(a) * r * 1.3, at[1] - SIN(a) * r * 0.8];
    f.px(p, cols[i % 3]); if (i % 2) f.px(add(p, [1, 0]), cols[(i + 1) % 3]);
  }
}

// ================= ВБОК (рыло вправо) =================
function side(p: BoP): Frame2 {
  const f = new Frame2(N);
  const B = (x: number, y: number): V2 => [x + p.lean, y + p.bob + p.sink * clamp((46 - y) / 16, 0, 1)];
  const neck = B(32, 30);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), neck, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  const leg = (top: V2, hoofAt: V2, l1: number, l2: number, pole: V2, w: [number, number, number], ramp: C[], bias: number, grp: string, hind: boolean) => {
    const kn = ik2(top, hoofAt, l1, l2, pole);
    const m = sh(N).L(top, kn, w[0], w[1]).L(kn, hoofAt, w[1], w[2]);
    if (hind) m.E(add(top, [0.3, -0.6]), 4.8, 5.6, -0.2);
    f.add(m, ramp, { bias, grp, amp: 1.8, dome: 2, occ: 1.3, fur: furB([-0.2, 1], hind ? 5 : 9, 2.4) });
    hoof(f, add(hoofAt, [0.6, 0.9]), grp + "h");
  };
  const fn: V2 = [31.6 + L[0][0] + p.lean, 43.4 - L[0][1]], ff: V2 = [27.6 + L[1][0] + p.lean * 0.8, 43.2 - L[1][1]];
  const hn: V2 = [14.2 + L[2][0] + p.lean * 0.4, 43.4 - L[2][1]], hf: V2 = [18.2 + L[3][0] + p.lean * 0.4, 43.2 - L[3][1]];
  leg(B(18.4, 33.5), hf, 5.2, 5.4, [1, 0], [5, 3.6, 3], FURD, -0.5, "far", true);
  leg(B(27.8, 33), ff, 5.6, 5.2, [-1, 0.2], [4.8, 3.4, 3], FURD, -0.5, "far", false);
  // хвост с кисточкой
  const tb = B(8.4, 28.2), tt = add(tb, [-1.6 + p.tail * 0.6, 3.4]);
  f.add(sh(N).L(tb, tt, 1.3, 0.9).D(add(tt, [-0.2, 1]), 1.1).tufts([0, 1], 1.1, 3, 2, 0.4), MANE, { grp: "tail", bias: 0.4 });
  // тело: круп, бочка, высокий загривок, шея, брюхо
  const body = sh(N).E(B(13.2, 30.2), 6.8, 7).E(B(21, 31.4), 11.2, 7.2 + p.br * 0.3).E(B(27.4, 26.8), 7.4, 6.6).E(B(31.8, 29.4), 5, 6.2).E(B(21, 34.8), 9, 4);
  const clean = sh(N).or(body);
  body.tufts([0, 1], 1.8, 2, 2, 0.45).tufts([-1, 0.2], 1.4, 7, 2.4, 0.5);
  f.add(body, FUR, { grp: "B", amp: 1.9, dome: 6, occ: 1.5, fur: furB(nrm([-0.4, 0.9]), 3, 3) });
  // подпруга
  f.add(sh(N).P([B(23.4, 28), B(26.2, 28), B(25.4, 39), B(22.6, 39)]).and(clean), LEATH, { grp: "strap", inherit: true, bias: 0.3, occ: 1 });
  f.px(B(24.4, 37.2), STEEL[5]); f.px(B(25.4, 37.2), STEEL[3]); f.px(B(24.4, 38.2), STEEL[2]);
  // пластины внахлёст: от крупа к загривку (передняя ложится поверх задней)
  lame(f, clean, 7.6, 16.4, 6.2, -0.15, "L1");
  lame(f, clean, 15.4, 24.4, 6.8, 0.05, "L2");
  lame(f, clean, 23.4, 33, 7.2, 0.3, "L3");
  // грива-щетина по хребту: торчит из-под пластин и вдоль шеи
  const mane = sh(N);
  for (let x = 9.5; x <= 34.5; x += 1.6) { const t = topOf(clean, x); if (t < 90) mane.L([x, t - 0.2], [x - 1.2, t - 1.8 - 1.6 * hash(x, 3) - (x > 22 ? 0.7 : 0)], 1.1, 0.4); }
  mane.L(B(33.4, 24.6), B(36, 26.4), 1.6);
  f.add(mane, MANE, { grp: "mane", bias: 0.6, amp: 1.4, dome: 1, occ: 0.6 });
  // ближние ноги
  leg(B(14.4, 33.2), hn, 5.4, 5.6, [1, 0], [5.8, 4, 3.3], FUR, 0.3, "HN", true);
  leg(B(31, 33.2), fn, 5.8, 5.4, [-1, 0.2], [5.4, 3.8, 3.2], FUR, 0.35, "FN", false);
  // голова клином
  const ear = sh(N).P([Hd(33.4, 27.2 - p.ear * 0.4), Hd(33.8 - p.ear * 0.8, 21.8 - p.ear), Hd(36.6, 26.4)]);
  f.add(ear, FUR, { grp: "ear", bias: 0.2, amp: 1.4, dome: 1 });
  f.px(Hd(34.4, 25), FUR[0]); f.px(Hd(34.6, 24), FUR[1]);
  const jawA = p.jaw * 0.32, hinge = Hd(37, 34);
  if (p.jaw > 0.05) {
    f.add(sh(N).P([Hd(37.4, 33.6), Hd(44, 34.2), rot(Hd(43, 36), hinge, jawA), rot(Hd(37.4, 36), hinge, jawA)]), R("#1e0707", "#3e1210", "#62201c"), { grp: "mo", flat: true, bias: -0.2 });
    f.add(sh(N).P([rot(Hd(37, 35), hinge, jawA), rot(Hd(43.2, 35.4), hinge, jawA), rot(Hd(42.4, 36.8), hinge, jawA), rot(Hd(37, 37), hinge, jawA)]), FUR, { grp: "jaw", bias: -0.2 });
  }
  const head = sh(N).E(Hd(36.2, 30.2), 5.4, 5).P([Hd(37, 26.6), Hd(44.8, 31), Hd(45, 34.6), Hd(38, 35.8), Hd(33.6, 33.6)]).tufts([-0.4, 1], 1.4, 21, 2, 0.4).tufts([-1, 0], 1.2, 23, 2.4, 0.5);
  f.add(head, FUR, { grp: "H", amp: 1.9, dome: 3, bias: 0.3, occ: 1.4, fur: furB([-1, 0.35], 25, 2.4) });
  // налобник
  f.add(sh(N).P([Hd(34.6, 25.8), Hd(39, 26.2), Hd(43.6, 29.2), Hd(43.6, 30.4), Hd(39.8, 28.6), Hd(35.6, 28)]), STEEL, { grp: "chf", bias: 0.4, amp: 2, dome: 1, occ: 1.1, rim: 0.8 });
  rivet(f, Hd(37.4, 26.6)); f.px(Hd(41, 28.4), STEEL[6]);
  // пятачок
  f.add(sh(N).E(Hd(45.1, 32.9), 1.25, 2.1), SNOUT, { grp: "sn", amp: 1.4, dome: 1, bias: 0.3 });
  f.px(Hd(45.4, 32.4), SNOUT[0]); f.px(Hd(45.4, 33.6), SNOUT[1]);
  if (p.jaw <= 0.05) { for (let x = 38; x <= 43; x++) f.px(Hd(x, 35 + (x - 38) * 0.06), MOUTH); }
  // окованный клык: изгиб вверх, стальной колпачок
  const tk0 = Hd(41.2, 35.2), tk1 = Hd(42.6, 33.2), tk2 = Hd(42.2, 30.8);
  f.add(sh(N).L(tk0, tk1, 1.6, 1.3).L(tk1, tk2, 1.3, 0.9), IVORY, { grp: "tusk", amp: 1.6, dome: 1, bias: 0.3, occ: 0.9 });
  f.px(tk2, STEEL[5]); f.px(add(tk2, [0, 1]), STEEL[3]);
  // глаз
  const e = Hd(38.2, 29.6);
  if (p.blink > 0.5) { f.px(e, FUR[1]); f.px(add(e, [1, 0]), FUR[1]); } else { f.px(e, EYE_G); f.px(add(e, [1, 0]), EYE_D); f.px(add(e, [0, -1]), FUR[0]); f.px(add(e, [1, -1]), FUR[0]); }
  puffs(f, add(fn, [1.5, 0.6]), p.dust, DUST, 1, 3 + Math.floor(p.ph * 5));
  puffs(f, Hd(46.2, 33.4), p.steam, STEAM, 1, 11 + Math.floor(p.ph * 5));
  return f;
}

// ================= ВНИЗ =================
function front(p: BoP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + p.sink * clamp((46 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 34), p.ht * 0.3); return [q[0] + p.hd[0], q[1] + p.hd[1] + p.ht * 4]; };
  const L = p.legs;
  // задние ноги по бокам
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 10.2, hf: V2 = [x, 42.8 - lg[1] - lg[0] * 0.3];
    f.add(sh(N).L(B(x, 34.5), hf, 4.2, 3).tufts([s, 0.5], 1, 3 + s, 2.6, 0.4), FURD, { bias: -0.6, grp: "far", fur: furB([0, 1], 3, 2) });
    hoof(f, add(hf, [0, 0.7]), "farh" + s, true);
  }
  // тело (загривок и спина уходят вдаль)
  const body = sh(N).E(B(cx, 23.6), 9.6, 5.4).E(B(cx, 28.4), 11.6, 7 + p.br * 0.3).E(B(cx - 7, 31.6), 5, 5).E(B(cx + 7, 31.6), 5, 5);
  const clean = sh(N).or(body);
  body.tufts([1, 0.3], 1.4, 5, 2.4, 0.6).tufts([-1, 0.3], 1.4, 6, 2.4, 0.6);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 6, occ: 1.5, bias: -0.3, fur: furB([0, 1], 9, 3) });
  // пластины поперёк спины: дальняя (выше) — первой
  const band = (off: number, h: number, bias: number, grp: string) => {
    const top: V2[] = [], bot: V2[] = [];
    for (let x = cx - 8.5; x <= cx + 8.5; x += 0.5) { const t = topOf(clean, x); if (t > 90) continue; top.push([x, t + off - (off === 0 ? 0.7 : 0)]); bot.push([x, t + off + h + 0.5 * SIN(x * 2.1) - Math.abs(x - cx) * 0.12]); }
    const m = sh(N).P([...top, ...bot.reverse()]).and(sh(N).or(clean).D(B(cx, 18), 0.1).E(B(cx, 23.6), 10.4, 6.2));
    f.add(m, STEEL, { grp, bias, amp: 2, dome: 2, occ: 1.3, rim: 0.8 });
    const bb = bot.slice().reverse(); for (let i = 4; i < bb.length - 3; i += 7) rivet(f, add(bb[i], [-0.5, -2]));
  };
  band(0.6, 3.6, -0.1, "L1"); band(3.8, 3.8, 0.15, "L2");
  for (const s of [-1, 1]) {
    f.add(sh(N).E(B(cx + s * 8.6, 29.6), 4.2, 3.2, s * 0.35), STEEL, { grp: "pd" + s, bias: s < 0 ? 0.5 : 0, amp: 2, dome: 2, occ: 1.2, rim: 0.8 });
    rivet(f, B(cx + s * 8.6 - 0.5, 29));
  }
  // грива по хребту
  const mane = sh(N);
  for (let y = 16.8; y <= 25; y += 1.1) mane.L(B(cx + (hash(y, 2) - 0.5) * 1.6, y + 0.8), B(cx + (hash(y, 5) - 0.5) * 3.4, y - 1.8), 1.8, 0.5);
  f.add(mane, MANE, { grp: "mane", bias: 0.6, amp: 1.2, dome: 1, occ: 0.6 });
  // передние ноги
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[0] : L[1], x = cx + s * 6, hf: V2 = [x + p.sway * 0.5, 43.2 - lg[1] + lg[0] * 0.25];
    f.add(sh(N).L(B(x, 34.6), hf, 4.8, 3.4).tufts([s, 0.5], 1.2, 7 + s, 2.4, 0.4), FUR, { grp: "F" + s, bias: s < 0 ? 0.35 : 0, fur: furB([0, 1], 11 + s, 2.4) });
    hoof(f, add(hf, [0, 0.8]), "Fh" + s, true);
  }
  // голова
  for (const s of [-1, 1]) {
    const er = s > 0 ? p.ear : 0;
    f.add(sh(N).P([Hd(cx + s * 4.6, 28.6), Hd(cx + s * (8.6 + er * 0.6), 23.8 - er), Hd(cx + s * 7.6, 29.6)]), FUR, { grp: "ear" + s, bias: 0.3, amp: 1.4, dome: 1 });
    f.px(Hd(cx + s * 6.8 - (s > 0 ? 1 : 0), 26.6), FUR[0]);
  }
  const head = sh(N).E(Hd(cx, 31.2), 6.4, 5.8).E(Hd(cx, 35.4), 4.6, 3.4).tufts([1, 0.4], 1.6, 13, 2, 0.55).tufts([-1, 0.4], 1.6, 17, 2, 0.55).tufts([0, 1], 1.2, 19, 2.2, 0.5);
  f.add(head, FUR, { grp: "H", amp: 1.9, dome: 4, bias: 0.45, occ: 1.4, fur: furB([0, 1], 23, 2.4) });
  f.add(sh(N).P([Hd(cx - 3.6, 26.4), Hd(cx + 3.6, 26.4), Hd(cx + 3, 31.4), Hd(cx, 33.4), Hd(cx - 3, 31.4)]), STEEL, { grp: "chf", bias: 0.45, amp: 2, dome: 2, occ: 1.1, rim: 0.8 });
  rivet(f, Hd(cx - 0.5, 28));
  const jo = p.jaw * 1.6;
  if (p.jaw > 0.05) f.add(sh(N).E(Hd(cx, 38.8 + jo * 0.3), 2.6, 0.8 + jo * 0.5), R("#1e0707", "#3e1210", "#62201c"), { grp: "mo", flat: true, bias: -0.3 });
  f.add(sh(N).E(Hd(cx, 36.4), 3.2, 2.3), SNOUT, { grp: "sn", amp: 1.6, dome: 2, bias: 0.4 });
  f.px(Hd(cx - 1.4, 36.4), SNOUT[0]); f.px(Hd(cx + 1, 36.4), SNOUT[0]); f.px(Hd(cx - 1.4, 35.4), SNOUT[4]);
  for (const s of [-1, 1]) {
    const a = Hd(cx + s * 3.2, 38.2), b = Hd(cx + s * 5.2, 36.2), c = Hd(cx + s * 5.4, 33.4);
    f.add(sh(N).L(a, b, 1.6, 1.3).L(b, c, 1.3, 0.9), IVORY, { grp: "tusk" + s, amp: 1.6, dome: 1, bias: s < 0 ? 0.5 : 0.1, occ: 0.9 });
    f.px(c, STEEL[5]); f.px(add(c, [0, 1]), STEEL[3]);
    const e = Hd(cx + s * 3.8 - (s > 0 ? 1 : 0), 30.6);
    if (p.blink > 0.5) { f.px(e, FUR[1]); f.px(add(e, [1, 0]), FUR[1]); } else { f.px(e, s < 0 ? EYE_G : EYE_D); f.px(add(e, [1, 0]), s < 0 ? EYE_D : EYE_G); f.px(add(e, [0, -1]), FUR[0]); f.px(add(e, [1, -1]), FUR[0]); }
  }
  puffs(f, B(cx - 6, 44), p.dust, DUST, -1, 3 + Math.floor(p.ph * 5));
  puffs(f, Hd(cx - 3, 38), p.steam, STEAM, -1, 11 + Math.floor(p.ph * 5));
  puffs(f, Hd(cx + 3, 38), p.steam, STEAM, 1, 17 + Math.floor(p.ph * 5));
  return f;
}

// ================= ВВЕРХ =================
function back(p: BoP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + p.sink * clamp((46 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => [B(x, y)[0] + p.hd[0], B(x, y)[1] + p.hd[1] + p.ht * 3];
  const L = p.legs;
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], x = cx + s * 9, hf: V2 = [x, 42.4 - lg[1] - lg[0] * 0.3];
    f.add(sh(N).L(B(x, 31), hf, 4, 3).tufts([s, 0.5], 1, 5 + s, 2.6, 0.4), FURD, { bias: -0.6, grp: "far", fur: furB([0, 1], 7, 2) });
    hoof(f, add(hf, [0, 0.7]), "farh" + s, true);
  }
  // голова за загривком: уши и макушка
  for (const s of [-1, 1]) f.add(sh(N).P([Hd(cx + s * 2.4, 22.6), Hd(cx + s * (6.6 + (s > 0 ? p.ear : 0) * 0.6), 17.4 - (s > 0 ? p.ear : 0)), Hd(cx + s * 6, 22.8)]), FUR, { grp: "ear" + s, bias: 0.3, amp: 1.4, dome: 1 });
  f.add(sh(N).E(Hd(cx, 21.8), 5.4, 3.4), FUR, { grp: "H", bias: 0.2, amp: 1.6, dome: 3, fur: furB([0, 1], 11, 2) });
  const body = sh(N).E(B(cx, 25.8), 10.6, 5.6).E(B(cx, 30.4), 12, 7.2 + p.br * 0.3).E(B(cx, 34), 10.2, 6.6);
  const clean = sh(N).or(body);
  body.tufts([0, 1], 1.6, 3, 2.2, 0.5).tufts([1, 0.2], 1.4, 5, 2.4, 0.7).tufts([-1, 0.2], 1.4, 6, 2.4, 0.7);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 7, occ: 1.5, fur: furB([0, 1], 19, 3) });
  // пластины: ближняя к зрителю (ниже) — поверх
  const band = (off: number, h: number, bias: number, grp: string) => {
    const top: V2[] = [], bot: V2[] = [];
    for (let x = cx - 9; x <= cx + 9; x += 0.5) { const t = topOf(clean, x); if (t > 90) continue; top.push([x, t + off - (off === 0 ? 0.7 : 0)]); bot.push([x, t + off + h + 0.5 * SIN(x * 2.1) - Math.abs(x - cx) * 0.1]); }
    const m = sh(N).P([...top, ...bot.reverse()]).and(sh(N).or(clean).E(B(cx, 25.8), 11.2, 6.4));
    f.add(m, STEEL, { grp, bias, amp: 2, dome: 2, occ: 1.3, rim: 0.8 });
    const bb = bot.slice().reverse(); for (let i = 4; i < bb.length - 3; i += 7) rivet(f, add(bb[i], [-0.5, -2]));
  };
  band(0.4, 3.8, 0.1, "L1"); band(3.8, 4, 0.0, "L2"); band(7.2, 3.6, -0.1, "L3");
  const mane = sh(N);
  for (let y = 19.2; y <= 30; y += 1.1) mane.L(B(cx + (hash(y, 2) - 0.5) * 1.6, y + 0.8), B(cx + (hash(y, 5) - 0.5) * 3.4, y - 1.8), 1.8, 0.5);
  f.add(mane, MANE, { grp: "mane", bias: 0.6, amp: 1.2, dome: 1, occ: 0.6 });
  // задние ноги и окорока
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 5.8, top = B(x, 36.4), hf: V2 = [x + s * 0.4 + p.sway * 0.4, 43.4 - lg[1] + lg[0] * 0.2];
    f.add(sh(N).E(add(top, [s * 0.4, -0.6]), 4.8, 5).L(top, hf, 5, 3.4).tufts([s, 0.5], 1.2, 9 + s, 2.4, 0.4), FUR, { grp: "H" + s, bias: 0.15, fur: furB([0, 1], 29 + s, 2.4) });
    hoof(f, add(hf, [0, 0.8]), "Hh" + s, true);
  }
  // хвост-завиток с кисточкой
  const tb = B(cx, 31.4), tt = add(tb, [0.8 + p.tail * 0.8, 3.6]);
  f.add(sh(N).L(tb, tt, 1.3, 0.9).D(add(tt, [0, 0.9]), 1.1).tufts([0, 1], 1, 3, 2, 0.4), MANE, { grp: "tail", bias: 0.5 });
  puffs(f, B(cx + 6, 44), p.dust, DUST, 1, 3 + Math.floor(p.ph * 5));
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: BoP) {
  const r = (v === "side" ? side(p) : v === "front" ? front(p) : back(p)).resolve();
  return v === "side" ? { img: shiftCv(r.img, -1), emis: shiftCv(r.emis, -1) } : r;
}

// ================= анимации =================
export function idle(): BoP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.4 * SIN(ph), br: 0.6 + 0.6 * SIN(ph), hd: [0.3 * SIN(ph * 0.5), 0.3 * SIN(ph - 0.7)] as V2, ht: 0.03 * SIN(ph - 1), ear: i === 4 || i === 5 ? 1 : 0, blink: i === 9 ? 1 : 0, tail: SIN(ph * 2), steam: i === 1 ? 0.4 : 0, ph: i / 12 };
  });
}
export function walk(v: View): BoP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [3.2 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))] : [1.4 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI), a(0)], bob: 0.6 * COS(2 * t) - 0.2, hd: [v === "side" ? 0.3 * COS(t) : 0.4 * SIN(t), 0.5 * COS(2 * t + 0.7)] as V2, sway: v === "side" ? 0 : 0.5 * SIN(t), br: 0.5, tail: SIN(2 * t), ph: i / 12 };
  });
}
export function act(v: View): BoP[] {
  // роет землю передним копытом (3 раза), опустив голову, затем фыркает паром
  return Array.from({ length: 16 }, (_, i) => {
    const dig = i >= 1 && i <= 9, ph = ((i - 1) / 3) * 2 * PI;
    const scr: V2 = dig ? [v === "side" ? -2.4 * SIN(ph) - 0.6 : 0.8 * SIN(ph), 1.6 + 1.4 * COS(ph)] : [0, 0];
    const low = dig ? 1 : i === 10 ? 0.6 : i >= 11 ? 0.2 : 0;
    return { ...REST, legs: [scr, [0, 0], [0, 0], [0, 0]] as BoP["legs"], ht: 0.18 * low, hd: [0, 0.8 * low] as V2, lean: dig && v === "side" ? 0.6 : 0,
      dust: dig && COS(ph) < -0.2 ? 0.9 : dig ? 0.3 : 0, steam: i >= 11 && i <= 14 ? [0.5, 1, 0.8, 0.4][i - 11] : 0, jaw: i === 12 ? 0.3 : 0, bob: i === 11 ? -0.6 : 0.2 * SIN(i),
      ear: i === 12 ? 1 : 0, tail: SIN(i * 1.7), ph: i / 16, br: i === 11 ? 1.2 : 0.4 };
  });
}
export function attack(v: View): BoP[] {
  const fwd = v === "side" ? 2.6 : 0, dy = v === "front" ? 1.6 : v === "back" ? -2.5 : 0;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { lean: v === "side" ? -1.6 : 0, dy: -dy * 0.3, ht: 0.22, hd: [0, 1.2] as V2, legs: [[1.5, 1], [0, 0], [-1, 0], [0, 0]] as BoP["legs"], dust: 0.6, steam: 0.6, ph: 0.2 } },
    { f: 4, p: { lean: fwd, dy, ht: 0.3, hd: [0.6, 1.6] as V2, legs: [[3, 1.6], [2, 0.8], [-2.4, 0.6], [-2, 0]] as BoP["legs"], dust: 1, steam: 0, ph: 0.5 } },
    { f: 5, p: { lean: fwd + 0.6, dy: dy * 1.1, ht: -0.28, hd: [1.2, -1.4] as V2, jaw: 0.8, legs: [[2, 0], [1.4, 0], [-1.6, 0], [-1, 0]] as BoP["legs"], dust: 0.8, ph: 0.7 } },
    { f: 7, p: { lean: fwd * 0.5, dy: dy * 0.5, ht: -0.1, hd: [0.4, -0.4] as V2, jaw: 0.3, legs: [[0, 0], [0, 0], [0, 0], [0, 0]] as BoP["legs"], dust: 0.3 } },
    { f: 9, p: { lean: 0, dy: 0, ht: 0, hd: [0, 0] as V2, jaw: 0, dust: 0 } },
  ], 10);
}
export function hurt(v: View): BoP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1 : 0, -0.8] as V2, ht: -0.14, blink: 1, jaw: 0.6, bob: -0.6, sway: v === "side" ? 0 : 0.8, steam: 0.5 } },
    { f: 3, p: { hd: [-0.5, -0.4] as V2, ht: -0.06, blink: 1, jaw: 0.3, sway: -0.4, steam: 0.2 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, blink: 0, jaw: 0, bob: 0, sway: 0, steam: 0 } },
  ], 8);
}
export function death(v: View): BoP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: [0, -0.6] as V2, ht: -0.15, jaw: 0.7, blink: 1, steam: 0.6 } },
    { f: 6, p: { sink: v === "side" ? 6.5 : 4.5, hd: [v === "side" ? 0.6 : 0, v === "side" ? 2 : 0.6] as V2, ht: 0.3, jaw: 0.2, blink: 1, steam: 0, tail: 1 } },
    { f: 11, p: { sink: v === "side" ? 7 : 5, hd: [v === "side" ? 0.8 : 0, v === "side" ? 2.4 : 0.8] as V2, ht: v === "side" ? 0.34 : 0.2, jaw: 0, blink: 1 } },
  ], 12);
}

export const pet: PetDef<BoP> = {
  id: "iron_boar", ru: "БРОНИРОВАННЫЙ КАБАН", N, shadow: 13, fx: ["#4a2e0a", "#d6a84b", "#fff0b8"],
  act: "РОЕТ ЗЕМЛЮ, ФЫРКАЕТ", atk: "ТАРАН И УДАР КЛЫКАМИ",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side" },
};
