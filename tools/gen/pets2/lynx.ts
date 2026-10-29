/**
 * Рысь утёсов (проход 4): кадр 48, ступни y≈44. Виды: вниз, вверх, вбок (морда вправо; влево — зеркало).
 * Части: поджарое тело (грудь, бочка, высокий круп), длинные лапы по IK (задние — бедро, голень, плюсна), широкие лапы-«снегоступы»,
 * пятна, светлое брюхо и горло, голова с бакенбардами, высокие уши с чёрными кисточками, янтарные глаза с вертикальным зрачком,
 * короткий хвост с чёрным кончиком. Когти выпускает только в атаке.
 */
import { Frame2, R, add, clamp, ik2, lerp, nrm, rot, sh, streak, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 48;
const FUR = R("#1c1a20", "#36313a", "#58504f", "#7e7369", "#a3968a", "#c6baac");
const FURD = R("#141217", "#28242a", "#423c3e", "#60574f", "#80766c", "#9e9488");
const CREAM = R("#2e2824", "#4e463e", "#766a5c", "#a0927e", "#c8bba4", "#e2d8c4");
const BLK = R("#09080a", "#151316", "#221f23", "#332e33");
const NOSE = R("#140c0e", "#2a1a1c", "#46302e", "#644440");
const MOUTH = R("#1a0606", "#3e1010", "#6a1e1e", "#9a3a34", "#c06a5c");
const CLAW = R("#3a342c", "#6a6052", "#a89c88", "#e4dccb");
const EYE = hx("#d8b040"), EYE2 = hx("#f0d070"), PUP = hx("#0c0806"), TOOTH = hx("#f0e8d4"), SPOT = hx("#1e181b");

export interface LP {
  bob: number; br: number; hd: V2; ht: number; jaw: number; ear: number; blink: number;
  legs: [V2, V2, V2, V2]; // FN, FF, HN, HF: [вперёд, подъём]
  lean: number; sink: number; tail: number; sway: number;
  sit: number; crouch: number; air: number; dx: number; dy: number; pitch: number; reach: number; claws: number; swipe: number;
}
export const REST: LP = { bob: 0, br: 0, hd: [0, 0], ht: 0, jaw: 0, ear: 0, blink: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], lean: 0, sink: 0, tail: 0, sway: 0, sit: 0, crouch: 0, air: 0, dx: 0, dy: 0, pitch: 0, reach: 0, claws: 0, swipe: 0 };
const fur = (flow: V2, seed: number, len = 3, k = 0.8) => ({ flow: nrm(flow), len: len + 0.6, k, seed, gx: 4, gy: 3 });

function eyeSide(f: Frame2, p: V2, blink: number) {
  if (blink > 0.5) { f.px(p, BLK[1]); f.px(add(p, [1, 0]), BLK[1]); return; }
  f.px(add(p, [0, -1]), BLK[1]); f.px(add(p, [1, -1]), BLK[2]);
  f.px(p, EYE2); f.px(add(p, [1, 0]), PUP); f.px(add(p, [1, 1]), BLK[1]);
}
function eyeFront(f: Frame2, p: V2, blink: number, s: number) {
  if (blink > 0.5) { f.px(p, BLK[1]); f.px(add(p, [1, 0]), BLK[1]); return; }
  f.px(add(p, [0, -1]), BLK[1]); f.px(add(p, [1, -1]), BLK[1]);
  f.px(p, s < 0 ? EYE2 : EYE); f.px(add(p, [1, 0]), s < 0 ? EYE : EYE2);
  f.px(add(p, [s < 0 ? 1 : 0, 0]), PUP);
  f.px(add(p, [s < 0 ? 1 : 0, 1]), BLK[1]); // слёзная полоска
}
function spots(f: Frame2, pts: V2[], T: (x: number, y: number) => V2) {
  for (const [x, y] of pts) { const q = T(x, y); f.px(q, SPOT); f.px(add(q, [1, 0]), FUR[1]); f.px(add(q, [0, 1]), FUR[2]); }
}
/** ухо: треугольник от основания (a,b) к кончику tip, чёрная кисточка вверх */
function ear(f: Frame2, a: V2, b: V2, tip: V2, ramp: C[], inner: boolean, grp: string, bias = 0.2) {
  f.add(sh(N).P([a, tip, b]).L(a, tip, 1.4, 0.8).L(b, tip, 1.4, 0.8), ramp, { grp, bias, amp: 1.5, dome: 1 });
  if (inner) { const m = lerp(lerp(a, b, 0.5), tip, 0.35); f.px(m, CREAM[3]); f.px(add(m, [0, -1]), CREAM[2]); }
  const d = nrm([tip[0] - (a[0] + b[0]) / 2, tip[1] - (a[1] + b[1]) / 2]);
  for (let i = 0; i < 3; i++) f.px(add(tip, d, i), i < 2 ? BLK[1] : BLK[2]);
}

// ================= ВБОК (морда вправо) =================
function side(p: LP): Frame2 {
  const f = new Frame2(N);
  const B = (x: number, y: number): V2 => {
    let q: V2 = [x, y];
    if (p.sit > 0) { q = rot(q, [30, 43], -p.sit * 0.34); if (x < 24) q = [q[0] + p.sit * 1.6, q[1] + p.sit * ((24 - x) / 10) * 1.4]; }
    if (p.pitch) q = rot(q, [24, 30], -p.pitch);
    return [q[0] + p.dx + p.lean, q[1] + p.dy + p.bob + p.sink * clamp((46 - y) / 16, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1)];
  };
  const neck = B(32, 24.5);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y - 1.6), neck, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs, air = p.air;
  const gnd = (x: number, i: number): V2 => [x + L[i][0] + p.lean, 43.3 - L[i][1]];
  // передняя лапа: плечо → локоть → лапа
  const front = (top: V2, paw: V2, ramp: C[], bias: number, grp: string, near: boolean) => {
    const el = ik2(top, paw, 7.9, 7.7, [-1, 0.15]);
    const m = sh(N).L(top, el, 4.6, 3.6).L(el, paw, 3.6, 3).E(add(paw, [0.9, 0.2]), 2.8, 1.5).tufts([0, 1], 1, near ? 3 : 4, 2.6, 0.5);
    f.add(m, ramp, { grp, bias, amp: 1.8, dome: 2, occ: 1.3, fur: fur([-0.15, 1], near ? 11 : 13, 2.6, 0.7) });
    f.px(add(paw, [1.6, 0.8]), ramp[1]); f.px(add(paw, [2.7, 0.8]), ramp[1]);
    if (p.claws > 0.3) for (let i = 0; i < (near ? 3 : 2); i++) { const c = add(paw, [3.6, -0.6 + i * 0.9]); f.px(c, CLAW[3]); f.px(add(c, [1, 0.4]), CLAW[2]); }
    if (near) spots(f, [[0, 0]], () => lerp(top, el, 0.6));
  };
  // задняя: бедро → колено → скакательный сустав → лапа
  const hind = (hip: V2, paw: V2, hock: V2, ramp: C[], bias: number, grp: string, near: boolean) => {
    const kn = ik2(hip, hock, 7, 6.8, [1, 0]);
    const m = sh(N).E(add(hip, [0.4, 0.6]), 4.2, 5, -0.3).L(hip, kn, 4.8, 3.8).L(kn, hock, 3.6, 2.8).L(hock, paw, 2.8, 2.6).E(add(paw, [0.9, 0.2]), 2.8, 1.5).tufts([-1, 0.6], 1.2, near ? 5 : 6, 2.4, 0.4);
    f.add(m, ramp, { grp, bias, amp: 1.8, dome: 3, occ: 1.3, fur: fur([-0.3, 1], near ? 17 : 19, 2.8, 0.7) });
    f.px(add(paw, [1.6, 0.8]), ramp[1]); f.px(add(paw, [2.7, 0.8]), ramp[1]);
    if (near) { const q = lerp(hip, kn, 0.5); f.px(q, SPOT); f.px(add(q, [-2, 1]), SPOT); }
  };
  const reachP = (base: V2, k: number): V2 => add(base, [p.reach * 6 * k, -p.reach * 7 * k]);
  const pawFN: V2 = air > 0 ? lerp(gnd(30.2, 0), reachP(add(B(30.2, 39), [1, 0]), 1), air) : gnd(30.2, 0);
  const pawFF: V2 = air > 0 ? lerp(gnd(26, 1), reachP(add(B(26.5, 39), [0, 0]), 0.8), air) : gnd(26, 1);
  const sitP = (x: number): V2 => [x + 6 * p.sit, 43.3];
  let pawHN: V2 = gnd(14.4, 2), pawHF: V2 = gnd(19.4, 3);
  if (p.sit > 0) { pawHN = lerp(pawHN, sitP(14.4), p.sit); pawHF = lerp(pawHF, sitP(19.4), p.sit); }
  if (air > 0) { pawHN = lerp(pawHN, add(B(10, 40), [-2, 0]), air); pawHF = lerp(pawHF, add(B(15, 40), [-2, 0]), air); }
  const hockOf = (paw: V2): V2 => (p.sit > 0.3 ? lerp(add(paw, [-2.4, -5]), [paw[0] - 5.8, 42.6], clamp((p.sit - 0.3) / 0.7, 0, 1)) : air > 0.3 ? add(paw, [1.8, -4.6]) : add(paw, [-2.4, -5]));
  // дальние
  hind(B(18.6, 27.6), pawHF, hockOf(pawHF), FURD, -0.6, "far", false);
  front(B(26.4, 28.4), pawFF, FURD, -0.6, "far", false);
  // хвост: короткий, чёрный кончик
  const tb = B(9.8, 23.8), tt = add(B(6.4, 25.4 - p.tail * 1.2), [0, p.tail * 0.6]);
  f.add(sh(N).L(tb, tt, 3, 2.4), FUR, { grp: "tail", bias: 0.2, amp: 1.4, fur: fur([-1, 0.4], 3, 2) });
  f.add(sh(N).D(tt, 1.3), BLK, { grp: "tail", bias: 0.3 });
  // тело
  const body = sh(N).E(B(14.6, 26.4), 5.6, 5).E(B(21.5, 27.4), 8, 4.2 + p.br * 0.3).E(B(28.4, 27.2), 5, 5.2).E(B(31.8, 24.2), 3.2, 4, 0.3);
  body.tufts([-0.2, 1], 1.2, 2, 2.4, 0.5);
  f.add(body, FUR, { grp: "B", amp: 1.9, dome: 6, occ: 1.5, fur: fur([-1, 0.35], 3, 3.2) });
  f.add(sh(N).E(B(21.5, 31), 7.6, 1.8).E(B(29.6, 29.6), 2.8, 3.2).and(body), CREAM, { grp: "B", inherit: true, bias: 0.4, fur: fur([0, 1], 7, 2) });
  spots(f, [[12, 24], [16.5, 23.5], [19, 26.4], [23.5, 25], [26.5, 27.6], [15, 28.4], [21.5, 29], [11, 27.5], [28, 24.6], [18.5, 29.6]], B);
  // ближние
  hind(B(14.6, 27.2), pawHN, hockOf(pawHN), FUR, 0.3, "HN", true);
  front(B(29.2, 28.2), pawFN, FUR, 0.4, "FN", true);
  // голова: уши, череп, бакенбарды, морда
  const ef = p.ear * 0.25;
  ear(f, Hd(33.4, 19.4), Hd(35.4, 19.0), rot(Hd(33.8, 15.2), Hd(34.4, 19.2), ef - 0.12), FURD, false, "earF", -0.2);
  const skull = sh(N).E(Hd(36, 21.6), 4.6, 4.2).E(Hd(34.4, 23.8), 3.8, 3.4);
  f.add(skull, FUR, { grp: "H", amp: 1.9, dome: 3, bias: 0.4, fur: fur([-1, 0.2], 23, 2.2, 0.6) });
  const ruff = sh(N).P([Hd(32.8, 22), Hd(37.2, 24.2), Hd(38.8, 26.6), Hd(37.8, 29), Hd(36, 28.2), Hd(34.6, 30), Hd(33.2, 28.4), Hd(32.2, 26.4)]).tufts([-0.2, 1], 1.6, 31, 1.8, 0.2).tufts([-1, 0.4], 1.2, 33, 2, 0.4);
  f.add(ruff, CREAM, { grp: "ruff", amp: 1.6, dome: 2, bias: 0.1, occ: 1, fur: fur([-0.3, 1], 29, 2.4, 0.9) });
  f.px(Hd(35.6, 25.4), BLK[2]); f.px(Hd(34.6, 25.9), FUR[1]);
  ear(f, Hd(34.4, 19.2), Hd(36.8, 18.9), rot(Hd(35.8, 14.6), Hd(35.6, 19), ef), FUR, true, "earN", 0.3);
  // морда, пасть
  const hinge = Hd(37.2, 24.2), ja = p.jaw * 0.55;
  if (p.jaw > 0.05) {
    f.add(sh(N).P([Hd(37.4, 23.6), Hd(42.2, 23.6), rot(Hd(41.6, 25.2), hinge, ja), rot(Hd(37.6, 25.4), hinge, ja)]), MOUTH, { grp: "mo", bias: -0.5, amp: 0.8 });
    f.add(sh(N).E(rot(Hd(39.6, 25.2), hinge, ja), 2.6, 1.0, ja), CREAM, { grp: "jaw", bias: -0.3 });
    const t1 = rot(Hd(41, 25.1), hinge, ja); f.px(t1, TOOTH); f.px(Hd(41.2, 24.2), TOOTH);
    f.px(rot(Hd(39.4, 24.6), hinge, ja * 0.5), MOUTH[4]);
  }
  f.add(sh(N).E(Hd(39.4, 23.1), 2.5, 1.9).E(Hd(38.2, 23.8), 2.2, 1.7), CREAM, { grp: "M", amp: 1.4, dome: 2, bias: 0.3 });
  f.add(sh(N).E(Hd(41.3, 22.4), 1, 0.9), NOSE, { grp: "N", bias: 0.4, amp: 1.2, dome: 1 });
  f.px(Hd(41.1, 21.9), NOSE[3]);
  if (p.jaw <= 0.05) { f.px(Hd(40.4, 24.2), CREAM[0]); f.px(Hd(41.4, 24.0), CREAM[0]); }
  for (let i = 0; i < 2; i++) f.px(Hd(39 + i * 1.2, 23.1 + i * 0.4), CREAM[1]); // точки вибрисс
  eyeSide(f, Hd(37.6, 20.8), p.blink);
  f.px(Hd(36.4, 18.8), FUR[5]); f.px(Hd(35.2, 19.2), FUR[4]); // лоб
  if (p.swipe > 0.05) for (let k = 0; k < 3; k++) streak(f, add(pawFN, [0.5 + k * 1.4, -5 + k]), add(pawFN, [3.4 + k * 1.1, 0.6 + k * 0.6]), [hx("#f4ecd8"), hx("#c8b898"), hx("#8a7a62")]);
  return f;
}

// ================= ВНИЗ (к зрителю) =================
function front(p: LP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const lift = -p.air * 6 - p.sit * 2.6;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + lift * clamp((44 - y) / 18, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y - 1.6), B(cx, 30), p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  // задние лапы по бокам (дальше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * (5.2 - p.sit * 0.6);
    let paw: V2 = [x + p.sway * 0.5, 42.8 - lg[1] - lg[0] * 0.3 + p.sit * 0.6];
    if (p.air > 0) paw = lerp(paw, add(B(x, 36.5), [s * 0.6, 0]), p.air);
    f.add(sh(N).E(B(x - s * 0.6, 30.6), 3, 3.8).L(B(x, 31), paw, 3, 2.4).E(add(paw, [0, 0.3]), 2.4, 1.3), FURD, { bias: -0.9, grp: "far", fur: fur([s * 0.2, 1], 3, 2.4) });
  }
  // спина, круп (вдаль), плечи
  const body = sh(N).E(B(cx, 22.4), 4.8, 3.4).E(B(cx, 26.4), 6.2, 4.8 + p.br * 0.3).E(B(cx - 3.8, 29.6), 3.2, 3.8).E(B(cx + 3.8, 29.6), 3.2, 3.8);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 5, occ: 1.4, bias: -0.25, fur: fur([0, 1], 9, 3) });
  spots(f, [[cx - 4, 24], [cx + 3, 23], [cx - 1, 26.6], [cx + 4.4, 27], [cx - 5.4, 27.6]], B);
  // хвост за спиной: виден кончик над крупом
  if (p.sit < 0.5) { const t = B(cx + 1.6 + p.tail, 19.6); f.add(sh(N).L(B(cx + 0.6, 21.8), t, 2.4, 2), FUR, { grp: "tail", bias: 0.3 }); f.add(sh(N).D(t, 1.1), BLK, { grp: "tail" }); }
  // передние лапы
  const raisedSide = p.reach > 0.3;
  const drawF = (s: number) => {
    const lg = s < 0 ? L[0] : L[1], x = cx + s * 3.8;
    let paw: V2 = [x + p.sway * 0.6, 43.4 - lg[1] + lg[0] * 0.25];
    const top = B(x, 30.5);
    if (p.air > 0) paw = lerp(paw, add(B(x + s * 1.5, 37), [s * p.reach * 3, -p.reach * 7]), p.air);
    const m = sh(N).L(top, paw, 3.9, 3.1).E(add(paw, [0, 0.3]), 2.7, 1.5).tufts([s, 0.4], 1, 7 + s, 2.6, 0.4);
    f.add(m, FUR, { grp: "F" + s, bias: s < 0 ? 0.3 : 0, fur: fur([s * 0.2, 1], 13 + s, 2.6) });
    f.px(add(paw, [-1, 1]), FUR[1]); f.px(add(paw, [1, 1]), FUR[1]);
    if (p.claws > 0.3) for (let i = 0; i < 3; i++) { const c = add(paw, [-1.4 + i * 1.4, p.reach > 0.3 ? -2 : 1.8]); f.px(c, CLAW[3]); }
    spots(f, [[0, 0]], () => lerp(top, paw, 0.45));
  };
  drawF(-1); drawF(1);
  void raisedSide;
  // грудь — светлая
  f.add(sh(N).E(B(cx, 33.4), 2.6, 3.6).tufts([0, 1], 1.4, 11, 2, 0.4), CREAM, { grp: "chest", bias: 0, fur: fur([0, 1], 29, 2.6) });
  // голова
  const ef = p.ear * 0.25;
  for (const s of [-1, 1]) {
    const a = Hd(cx + s * 1.6, 23.2), b = Hd(cx + s * 5.2, 24.6), tip = rot(Hd(cx + s * 4.6, 17.8), Hd(cx + s * 3.6, 24), s * (s > 0 ? ef : -ef * 0.4));
    ear(f, a, b, tip, FUR, true, "ear" + s, 0.4);
  }
  const skull = sh(N).E(Hd(cx, 27.2), 5.4, 4.6).E(Hd(cx, 29.8), 4.4, 3);
  f.add(skull, FUR, { grp: "H", amp: 1.9, dome: 4, bias: 0.55, occ: 1.3, fur: fur([0, 1], 23, 2.2, 0.6) });
  // бакенбарды: светлые клинья в стороны и вниз
  for (const s of [-1, 1]) {
    const m = sh(N).P([Hd(cx + s * 3.4, 27.6), Hd(cx + s * 7.8, 31.4), Hd(cx + s * 6.2, 31.6), Hd(cx + s * 6.8, 33.4), Hd(cx + s * 4.4, 32.4), Hd(cx + s * 2, 31.4)]).tufts([s, 0.6], 1.4, 31 + s, 1.8, 0.2);
    f.add(m, CREAM, { grp: "ruff" + s, bias: s < 0 ? 0.3 : -0.1, amp: 1.5, dome: 2, fur: fur([s * 0.6, 1], 37 + s, 2.2, 0.9) });
    f.px(Hd(cx + s * 5, 30.4), BLK[2]); f.px(Hd(cx + s * 5.6, 31.4), BLK[1]);
  }
  const jo = p.jaw * 2;
  if (p.jaw > 0.05) {
    f.add(sh(N).E(Hd(cx, 31.4 + jo * 0.4), 2.2, 1 + jo * 0.5), MOUTH, { grp: "mo", bias: -0.3, amp: 0.8 });
    f.add(sh(N).E(Hd(cx, 32 + jo), 2, 0.9), CREAM, { grp: "jaw", bias: -0.4 });
    f.pxs(Hd(cx, 31.2), [[-2, 0, TOOTH], [1, 0, TOOTH]]);
    f.px(Hd(cx, 31.6 + jo * 0.6), MOUTH[4]);
  }
  f.add(sh(N).E(Hd(cx, 30.2), 2.8, 1.9), CREAM, { grp: "M", amp: 1.3, dome: 2, bias: 0.4 });
  f.add(sh(N).P([Hd(cx - 1.2, 28.6), Hd(cx + 1.2, 28.6), Hd(cx, 29.8)]), NOSE, { grp: "N", bias: 0.4, flat: true });
  f.px(Hd(cx - 0.6, 28.6), NOSE[3]);
  if (p.jaw <= 0.05) f.pxs(Hd(cx, 30.4), [[0, 0, CREAM[0]], [-1, 0.6, CREAM[1]], [1, 0.6, CREAM[1]]]);
  for (const s of [-1, 1]) f.px(Hd(cx + s * 2.1, 30.2), CREAM[1]);
  eyeFront(f, Hd(cx - 3.2, 26.2), p.blink, -1); eyeFront(f, Hd(cx + 1.8, 26.2), p.blink, 1);
  f.px(Hd(cx - 0.6, 24.2), FUR[5]); f.px(Hd(cx + 0.4, 24.6), FUR[4]); f.px(Hd(cx, 25.6), BLK[2]);
  if (p.swipe > 0.05) for (let k = 0; k < 3; k++) streak(f, B(cx - 6 + k * 2.6, 25 + k), B(cx - 3 + k * 2.6, 33 + k), [hx("#f4ecd8"), hx("#c8b898"), hx("#8a7a62")]);
  return f;
}

// ================= ВВЕРХ (спиной) =================
function back(p: LP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const lift = -p.air * 5;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + lift * clamp((44 - y) / 18, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1) + p.sit * clamp((y - 26) / 8, 0, 1) * 2.2];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 26), -p.ht * 0.7); return [q[0] + p.hd[0], q[1] + p.hd[1] - p.sit * 1.5]; };
  const L = p.legs;
  // передние лапы по бокам (дальше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], x = cx + s * 5.4;
    let paw: V2 = [x + p.sway * 0.5, 42.6 - lg[1] - lg[0] * 0.3];
    if (p.air > 0) paw = lerp(paw, add(B(x - s * 1.2, 30), [0, -4 * p.reach]), p.air);
    f.add(sh(N).L(B(x, 29), paw, 3.4, 2.8).E(add(paw, [0, 0.3]), 2.5, 1.3), FURD, { bias: -0.6, grp: "far", fur: fur([s * 0.2, 1], 7 + s, 2.4) });
  }
  // голова сзади, уши с кисточками
  const ef = p.ear * 0.25;
  const head = sh(N).E(Hd(cx, 21.4), 4.4, 3.6).E(Hd(cx, 23.4), 5, 2.2).tufts([1, 0.6], 1.2, 7, 2.2, 0.5).tufts([-1, 0.6], 1.2, 8, 2.2, 0.5);
  f.add(head, FUR, { grp: "H", bias: 0.2, amp: 1.7, dome: 3, fur: fur([0, 1], 11, 2.2) });
  for (const s of [-1, 1]) {
    const a = Hd(cx + s * 1.4, 19.8), b = Hd(cx + s * 4.4, 20.8), tip = rot(Hd(cx + s * 4.2, 15.6), Hd(cx + s * 3.2, 21.2), s * (s > 0 ? ef : -ef * 0.4));
    ear(f, a, b, tip, FURD, false, "ear" + s, 0.1);
    const w = lerp(lerp(a, b, 0.5), tip, 0.4); f.px(w, CREAM[4]); f.px(add(w, [0, 1]), CREAM[3]); // светлое пятно на тыльной стороне уха
  }
  // спина и круп
  const body = sh(N).E(B(cx, 27.6), 5.4, 4.4).E(B(cx, 32.2), 6.2, 4.2 + p.br * 0.3);
  body.tufts([1, 0.3], 1.1, 5, 2.4, 0.7).tufts([-1, 0.3], 1.1, 6, 2.4, 0.7);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 6, occ: 1.5, fur: fur([0, 1], 19, 3.2) });
  for (let y = 26; y < 33; y++) if (y % 2) f.px(B(cx + (y % 4 === 1 ? 0 : 0.6), y), FUR[2]);
  spots(f, [[cx - 4, 28], [cx + 3.4, 27.4], [cx - 2, 31.6], [cx + 4.6, 32], [cx - 5.4, 33.6], [cx + 1, 35]], B);
  // задние лапы
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 3.6;
    const top = B(x, 34.4);
    let paw: V2 = [x + s * 0.6 + p.sway * 0.4, 44 - lg[1] + lg[0] * 0.2];
    if (p.air > 0) paw = lerp(paw, add(B(x, 41), [s * 0.5, 1]), p.air);
    if (p.sit > 0) paw = lerp(paw, add(paw, [s * 1.6, -0.4]), p.sit);
    const hk = lerp(top, paw, 0.6);
    f.add(sh(N).E(add(top, [s * 0.5, -0.6]), 3.2, 3.8 - p.sit * 0.6).L(top, hk, 3.8, 3).L(hk, paw, 2.8, 2.6).E(add(paw, [0, 0.1]), 2.5, 1.4).tufts([s, 0.5], 1.2, 9 + s, 2.4, 0.4), FUR, { grp: "H" + s, bias: 0.1, fur: fur([s * 0.2, 1], 29 + s, 2.6) });
    if (lg[1] > 1) f.pxs(paw, [[-1, 0, NOSE[1]], [0, 0, NOSE[1]], [1, 0, NOSE[0]], [-1, -1, NOSE[0]], [1, -1, NOSE[0]]]);
  }
  // хвост
  const tb = B(cx, 30.4), tt = add(B(cx + p.tail * 1.4, 34.2 + p.sit * 2), [0, 0]);
  f.add(sh(N).L(tb, tt, 2.8, 2.4), FUR, { grp: "tail", bias: 0.4, amp: 1.3, fur: fur([0, 1], 3, 2) });
  f.add(sh(N).D(tt, 1.3), BLK, { grp: "tail", bias: 0.3 });
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: LP) { const f = v === "side" ? side(p) : v === "front" ? front(p) : back(p); return f.resolve(); }

// ================= анимации =================
export function idle(): LP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.35 * SIN(ph), br: 0.6 + 0.6 * SIN(ph), hd: [0.3 * SIN(ph * 0.5), 0.3 * SIN(ph - 0.7)] as V2, ht: 0.03 * SIN(ph - 1), ear: i === 4 || i === 5 ? 1 : 0, blink: i === 9 ? 1 : 0, tail: 0.6 * SIN(ph * 2) };
  });
}
export function walk(v: View): LP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [3.4 * COS(t + q), 2.4 * Math.max(0, SIN(t + q))] : [1.4 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI * 0.9), a(-PI * 0.1)], bob: 0.5 * COS(2 * t) - 0.2, hd: [v === "side" ? 0.3 * COS(t) : 0.4 * SIN(t), 0.4 * COS(2 * t + 0.7)] as V2, sway: v === "side" ? 0 : 0.5 * SIN(t), br: 0.5, tail: 0.8 * SIN(2 * t) };
  });
}
export function act(v: View): LP[] {
  // садится, поводит ушами, зевает, встаёт
  const fr = keyed(REST, [
    { f: 0, p: {} },
    { f: 4, p: { sit: 1, ht: v === "back" ? 0 : -0.06, tail: 0.4 } },
    { f: 8, p: { sit: 1, ear: 1 } },
    { f: 10, p: { sit: 1, jaw: 1, ht: -0.22, hd: [0, -0.6] as V2, blink: 1 } },
    { f: 12, p: { sit: 1, jaw: 0, ht: 0, hd: [0, 0] as V2, blink: 0 } },
    { f: 15, p: { sit: 0, ear: 0, tail: 0 } },
  ], 16);
  return fr.map((q, i) => ({ ...q, ear: i === 5 || i === 7 ? 1 : i === 6 ? -1 : q.ear > 0.5 && i < 9 ? 1 : 0, blink: i >= 9 && i <= 11 ? 1 : q.blink > 0.5 ? 1 : 0 }));
}
export function attack(v: View): LP[] {
  const side = v === "side";
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { crouch: 2.4, lean: side ? -1 : 0, ht: 0.06, ear: -1, tail: 0.8 } },
    { f: 4, p: { crouch: 0, air: 1, dy: side ? -5 : -1, dx: side ? 2.4 : 0, pitch: side ? 0.22 : 0, reach: 1, claws: 1, jaw: 1, lean: 0, ht: -0.1, ear: -1 } },
    { f: 5, p: { air: 1, dy: side ? -3 : 0, dx: side ? 3.2 : 0, pitch: side ? 0.05 : 0, reach: 0.8, claws: 1, jaw: 1, swipe: 1, ht: 0.05 } },
    { f: 7, p: { air: 0, dy: 0, dx: side ? 1.4 : 0, pitch: 0, reach: 0, claws: 0.5, jaw: 0.3, swipe: 0, crouch: 1 } },
    { f: 9, p: { dx: 0, crouch: 0, claws: 0, jaw: 0, ht: 0, ear: 0, tail: 0 } },
  ], 10).map((q, i) => ({ ...q, swipe: i === 5 ? 1 : i === 6 ? 0.5 : 0 }));
}
export function hurt(v: View): LP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1.2 : 0, -0.6] as V2, ht: -0.14, blink: 1, jaw: 0.6, ear: -1, crouch: 1, sway: v === "side" ? 0 : 0.8 } },
    { f: 3, p: { hd: [-0.5, -0.3] as V2, ht: -0.06, blink: 1, jaw: 0.3, ear: -1, crouch: 0.6, sway: -0.4 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, blink: 0, jaw: 0, ear: 0, crouch: 0, sway: 0 } },
  ], 8);
}
export function death(v: View): LP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: [0, -0.5] as V2, ht: -0.12, jaw: 0.7, blink: 1, ear: -1 } },
    { f: 6, p: { sink: 7.5, hd: [v === "side" ? 0.6 : 0, 2.4] as V2, ht: 0.28, jaw: 0.2, blink: 1, ear: -1, tail: 1 } },
    { f: 11, p: { sink: 8, hd: [v === "side" ? 0.8 : 0, 2.8] as V2, ht: 0.32, jaw: 0, blink: 1, ear: -1, tail: 1 } },
  ], 12);
}

export const pet: PetDef<LP> = {
  id: "cliff_lynx", ru: "РЫСЬ УТЁСОВ", N, shadow: 11, fx: ["#4a3410", "#d6a84b", "#fff0b8"],
  act: "САДИТСЯ, ПОВОДИТ УШАМИ, ЗЕВАЕТ", atk: "ПРЫЖОК С КОГТЯМИ И УКУС",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side", zoom: 2, focus: [33, 24] },
};
