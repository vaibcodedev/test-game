/**
 * Пепельный медведь (пилот прохода 4): кадр 48, ступни y≈45. Виды: вниз, вверх, вбок (морда вправо; влево — зеркало).
 * Части: туловище с горбом и пепельной мантией (пряди, угли), лапы 2 сегмента по IK с подушкой и когтями, голова — череп, щёки-брыли,
 * светлая морда, нос с бликом, глаза с бликом, уши с тёмной ушной раковиной, пасть с клыками и языком.
 */
import { Frame2, shiftCv, R, add, clamp, ik2, lerp, nrm, rot, sh, streak, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 48;
// ---- рампы (0 тёмный … светлый) ----
const FUR = R("#120a07", "#22140d", "#382114", "#53321d", "#714829", "#8e6139");
const FURD = R("#0e0806", "#1b100a", "#2c1a10", "#432818", "#5c3a22", "#764e2e");
const ASH = R("#1a1512", "#2e2620", "#473b32", "#64574b", "#867a6c", "#a89d8e");
const MUZ = R("#24140b", "#422814", "#654125", "#8a6340", "#ad8960");
const NOSE = R("#080607", "#171214", "#2c2427", "#4a4044", "#7c7074");
const CLAW = R("#2a241e", "#5a5046", "#9c907e", "#d6ccb6", "#f2ead8");
const MOUTH = R("#1a0505", "#3e0e0e", "#6a1c1a", "#94322c", "#b85448");
const EAR_IN = hx("#1c0f0a"), EAR_IN2 = hx("#3a2216");
const EMB = R("#6a1a06", "#b4380c", "#f0761a", "#ffbc4a", "#fff0b4");
const EYE_D = hx("#0c0605"), EYE_G = hx("#c89a64"), EYE_B = hx("#3a1a0c"), BROW = hx("#1e120b");
const TOOTH = hx("#efe6d0"), TOOTH2 = hx("#b8ac92");

export interface BP {
  bob: number; br: number; hd: V2; ht: number; jaw: number; ear: number; blink: number;
  legs: [V2, V2, V2, V2]; // FN, FF, HN, HF: [вперёд, подъём]
  rear: number; paw: V2; lean: number; swipe: number; tail: number; emb: number; sway: number;
  /** тело опускается к земле (гибель, лёжа), лапы стоят и складываются */
  sink: number;
}
export const REST: BP = { bob: 0, br: 0, hd: [0, 0], ht: 0, jaw: 0, ear: 0, blink: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], rear: 0, paw: [0, 0], lean: 0, swipe: 0, tail: 0, emb: 0.5, sway: 0, sink: 0 };

const furB = (flow: V2, seed: number, len = 3, k = 0.9) => ({ flow, len: len + 0.8, k: k * 0.85, seed, gx: 4, gy: 4 });

/** нижний край мантии зубцами-прядями: точки справа налево */
function teeth(x1: number, x0: number, y: (x: number) => number, step: number, depth: number, T: (x: number, y: number) => V2): V2[] {
  const out: V2[] = []; let i = 0;
  for (let x = x1; x >= x0; x -= step / 2, i++) out.push(T(x, y(x) + (i % 2 ? depth * (0.7 + 0.5 * Math.abs(SIN(x * 3.1))) : -0.6)));
  return out;
}
function claws(f: Frame2, base: V2, n: number, step: V2, d: V2) {
  for (let i = 0; i < n; i++) {
    const b = add(base, step, i);
    f.px(b, CLAW[3]); f.px(add(b, d), CLAW[2]);
  }
}
function eye(f: Frame2, p: V2, blink: number, side = false) {
  if (blink > 0.5) { f.px(p, BROW); f.px(add(p, [1, 0]), BROW); return; }
  f.px(add(p, [0, -1]), BROW); f.px(add(p, [1, -1]), BROW);
  f.px(p, EYE_G); f.px(add(p, [1, 0]), EYE_D);
  if (!side) f.px(add(p, [0, 1]), EYE_D), f.px(add(p, [1, 1]), EYE_B);
  else f.px(add(p, [1, 1]), EYE_B);
}
function embers(f: Frame2, pts: V2[], ph: number) {
  pts.forEach((p, i) => {
    const k = 0.5 + 0.5 * SIN(ph * 2 * PI + i * 2.1);
    const c = EMB[clamp(Math.round(1 + k * 3), 0, 4)];
    f.px(p, c, true);
    if (k > 0.55) { f.px(add(p, [1, 0]), EMB[1], true); f.halo(p, EMB[0]); }
  });
}

// ================= ВБОК (морда вправо) =================
function side(p: BP): Frame2 {
  const f = new Frame2(N);
  const piv: V2 = [12, 44];
  const B = (x: number, y: number): V2 => { const q = rot([x, y], piv, -p.rear); return [q[0] + p.lean + p.rear * 15, q[1] + p.bob * (1 - Math.min(1, p.rear * 3)) + p.sink * clamp((46 - y) / 16, 0, 1)]; };
  const neck = B(33, 29);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), neck, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const ground = (q: V2): V2 => q;
  // ноги: плечо/бедро → локоть/колено → лапа
  const leg = (top: V2, paw: V2, l1: number, l2: number, pole: V2, w: [number, number, number], ramp: C[], bias: number, grp: string, near: boolean, hind: boolean) => {
    const el = ik2(top, paw, l1, l2, pole);
    const m = sh(N).L(top, el, w[0], w[1]).L(el, paw, w[1], w[2]);
    if (hind) m.E(add(top, [0.5, -1]), 6.2, 6.8, -0.2);
    m.E(add(paw, [1.2, 0.3]), 3.7, 1.9).tufts([0, 1], 1.3, near ? 3 : 4, 2.6, 0.5);
    f.add(m, ramp, { bias, grp, amp: 1.9, dome: 3, occ: 1.4, fur: furB(nrm([-0.25, 1]), near ? 11 : 13, 3) });
    // пальцы — тёмные щели на лапе, когти вперёд
    const tip = add(paw, [4.3, 0.9]);
    if (paw[1] > 42.5 || near) { f.px(add(paw, [2.5, 1]), ramp[1]); f.px(add(paw, [3.6, 1]), ramp[1]); }
    claws(f, tip, near ? 3 : 2, [0, 0.8], [0.9, 0.3]);
    void ground;
  };
  const L = p.legs;
  const pawFN: V2 = p.rear > 0.02 || p.paw[0] || p.paw[1] ? add(B(30.8, 43.4), p.paw) : [30.8 + L[0][0] + p.lean, 43.4 - L[0][1]];
  const pawFF: V2 = p.rear > 0.02 ? add(B(26, 43.2), [p.paw[0] * 0.4, p.paw[1] * 0.5]) : [26 + L[1][0] + p.lean * 0.8, 43.2 - L[1][1]];
  const pawHN: V2 = [12.8 + L[2][0], 43.6 - L[2][1]], pawHF: V2 = [18 + L[3][0], 43.3 - L[3][1]];
  // дальние ноги
  leg(B(18, 33), pawHF, 6, 6.2, [1, 0], [6.5, 5.4, 4.6], FURD, -0.6, "far", false, true);
  leg(B(26.2, 31), pawFF, 7.2, 6.4, [-1, 0.2], [6.6, 5.4, 4.8], FURD, -0.6, "far", false, false);
  // хвост
  f.add(sh(N).E(add(B(5.4, 27.6), [0, p.tail]), 2.4, 1.9, -0.4).tufts([-1, 0.6], 1.2, 5), FUR, { bias: 0.3, grp: "tail", fur: furB([-0.8, 0.6], 5, 2) });
  // туловище: круп, бочка, горб над плечами, шея, отвисшее брюхо
  const br = p.br;
  const body = sh(N).E(B(13, 30.5), 8.6, 8.2).E(B(22, 31), 12.2, 8.6 + br * 0.4).E(B(27.3, 25.9), 7.6, 5.8).E(B(32.5, 29), 5.6, 6.2).E(B(21, 35 + br * 0.3), 10.2, 4.8);
  body.tufts(nrm([-0.2, 1]), 2.0, 2, 2.0, 0.45).tufts([-1, 0.3], 1.6, 9, 2.4, 0.5);
  f.add(body, FUR, { grp: "B", amp: 1.9, dome: 7, occ: 1.6, fur: furB(nrm([-0.5, 0.85]), 3, 3.5) });
  // пепельная мантия по хребту: рваный нижний край
  const wave = sh(N).P([B(2, 10), B(40, 10), ...teeth(37, 3, (x) => 23.6 + (x < 20 ? 0.6 : 0) + (x > 31 ? (x - 31) * 0.5 : 0), 2.8, 2.6, B)]);
  const mant = sh(N).E(B(13, 30.5), 8.6, 8.2).E(B(22, 31), 12.2, 8.6).E(B(27.3, 25.9), 7.6, 5.8).E(B(32.5, 29), 5.6, 6.2).and(wave);
  mant.tufts([-1, -0.2], 1.4, 21, 2.2, 0.5);
  f.add(mant, ASH, { grp: "B", inherit: true, bias: 0.1, fur: furB(nrm([-0.6, 0.8]), 17, 3.2, 1.0) });
  // ближние ноги
  leg(B(13.6, 32.6), pawHN, 6.2, 6.2, [1, 0], [7.4, 6, 5.2], FUR, 0.35, "HN", true, true);
  leg(B(29.8, 31), pawFN, 7.4, 6.6, [-1, 0.2], [7.8, 6.4, 5.6], FUR, 0.45, "FN", true, false);
  // голова
  const earF = Hd(34.2, 22.6 - p.ear * 0.6), earN = Hd(35.6, 22.9 - p.ear);
  f.add(sh(N).D(earF, 2.0), FURD, { grp: "earF", bias: -0.3 });
  const head = sh(N).E(Hd(37.4, 27.4), 6.2, 5.6).E(Hd(34.8, 30.8), 5, 3.8).tufts([-0.6, 1], 1.8, 31, 2, 0.35).tufts([-1, -0.2], 1.4, 37, 2.4, 0.5);
  f.add(head, FUR, { grp: "H", amp: 1.8, dome: 4, bias: 0.25, fur: furB(nrm([-1, 0.45]), 23, 2.6) });
  f.add(sh(N).D(earN, 2.3), FUR, { grp: "earN", bias: 0.2, fur: furB([-0.5, 1], 41, 2) });
  f.px(add(earN, [0, 0.2]), EAR_IN); f.px(add(earN, [-1, 0.2]), EAR_IN2);
  // морда: светлая, пасть открывается вниз
  const jawA = p.jaw * 0.5, hinge = Hd(38.2, 31);
  if (p.jaw > 0.05) {
    f.add(sh(N).P([Hd(38.4, 30.4), Hd(45, 30.2), rot(Hd(44.6, 32.2), hinge, jawA), rot(Hd(38.6, 32.6), hinge, jawA)]), MOUTH, { grp: "mo", bias: -0.6, amp: 0.8 });
    f.add(sh(N).E(rot(Hd(41.6, 32.3), hinge, jawA), 3.6, 1.4, jawA).D(rot(Hd(38.6, 31.8), hinge, jawA), 1.7), MUZ, { grp: "jaw", bias: -0.5 });
    const t1 = rot(Hd(43.6, 32.1), hinge, jawA);
    f.px(t1, TOOTH); f.px(add(t1, [0, -1]), TOOTH2);
  }
  const muz = sh(N).E(Hd(41.7, 30), 4.1, 2.7, 0.05).E(Hd(39.2, 29), 2.6, 2.4);
  f.add(muz, MUZ, { grp: "M", amp: 1.4, dome: 2, bias: 0.25, fur: { flow: [1, 0.2], len: 2, k: 0.5, seed: 7, gx: 3, gy: 2 } });
  f.add(sh(N).E(Hd(45.3, 29.3), 1.6, 1.25), NOSE, { grp: "N", amp: 1.6, dome: 1, bias: 0.2 });
  f.px(Hd(45, 28.7), NOSE[4]);
  if (p.jaw > 0.05) { const t2 = Hd(44, 31.1); f.px(t2, TOOTH); f.px(add(t2, [-2, 0]), TOOTH2); }
  else { f.px(Hd(42.6, 31.4), MUZ[0]); f.px(Hd(43.6, 31.3), MUZ[0]); f.px(Hd(44.5, 31.0), MUZ[0]); }
  eye(f, Hd(39.4, 26.5), p.blink, true);
  embers(f, [B(24, 22.4), B(18, 24.4), B(29.5, 21.6)], p.emb);
  if (p.swipe > 0.05) {
    const a = pawFN, s = p.swipe;
    for (let k = 0; k < 3; k++) streak(f, add(a, [-1 + k * 1.5, -6 + k * 1.1]), add(a, [2.6 + k * 1.1 - 2 * (1 - s), -1.5 + k * 0.6]), [hx("#f4e2c0"), hx("#c8a878"), hx("#8a6a48")]);
  }
  return f;
}

// ================= ВНИЗ (к зрителю) и ВВЕРХ (спиной) =================
function front(p: BP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const up = -p.rear * 12;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + up * clamp((44 - y) / 20, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 34), p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  // задние лапы (по бокам, дальше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 11.6;
    const top = B(x, 34), paw: V2 = [x + p.sway * 0.5, 42.6 - lg[1] - lg[0] * 0.3];
    f.add(sh(N).L(top, paw, 6, 5).E(add(paw, [0, 0.4]), 3.4, 1.7).tufts([s, 0.6], 1.2, 3 + s, 2.6, 0.4), FURD, { bias: -0.7, grp: "far", fur: furB([s * 0.3, 1], 3, 2.5) });
    claws(f, add(paw, [-1.5, 2]), 3, [1.4, 0], [0, 0.7]);
  }
  // спина и круп (сверху, уходят вдаль), плечи
  const br = p.br;
  const body = sh(N).E(B(cx, 22.6), 9, 5).E(B(cx, 27.6), 12.2, 8 + br * 0.4).E(B(cx - 8.3, 31.4), 6.2, 6).E(B(cx + 8.3, 31.4), 6.2, 6);
  body.tufts([0, -1], 1.2, 5, 2.6, 0.6);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 7, occ: 1.5, bias: -0.35, fur: furB(nrm([0, 1]), 9, 3.5) });
  // пепел по хребту: узкая рваная полоса, ниже и уже к шее, шерсть просвечивает в прорехах
  const edge = (s: number): V2[] => Array.from({ length: 9 }, (_, i) => { const y = 14 + i * 1.3; return B(cx + s * (6.2 - i * 0.25 + (i % 2 ? 1.3 : -0.5)), y); });
  const band = sh(N).P([...edge(-1), ...teeth(cx + 4.8, cx - 4.8, (x) => 25.4 - Math.abs(x - cx) * 0.35, 2.2, 3.2, B).reverse(), ...edge(1).reverse()]);
  const mant = sh(N).E(B(cx, 22.6), 9, 5).E(B(cx, 27.6), 12.2, 8).and(band);
  for (const [hx0, hy0] of [[-3.5, 19.5], [2.5, 21], [-1, 23.5], [4, 17.5], [-5, 22.6]] as V2[]) mant.cut(sh(N).D(B(cx + hx0, hy0), 0.9));
  f.add(mant, ASH, { grp: "B", inherit: true, bias: 0.1, fur: furB([0, 1], 19, 3.2, 1.0) });
  // передние лапы
  const legsF: { s: number; top: V2; paw: V2 }[] = [];
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[0] : L[1], x = cx + s * 8.2;
    let paw: V2 = [x + p.sway * 0.6, 43.4 - lg[1] + lg[0] * 0.25];
    const top = B(x, 33.5);
    if (s > 0 && (p.rear > 0.02 || p.paw[1] !== 0)) paw = add(B(x, 43.4), p.paw);
    else if (p.rear > 0.02) paw = add(B(x, 43.4), [0, -p.rear * 4]);
    legsF.push({ s, top, paw });
  }
  const drawF = (q: { s: number; top: V2; paw: V2 }) => {
    const { s, top, paw } = q;
    const m = sh(N).L(top, paw, 7.8, 6.2).E(add(paw, [0, 0.3]), 4.3, 2.1).tufts([s, 0.4], 1.5, 7 + s, 2.4, 0.4);
    f.add(m, FUR, { grp: "F" + s, bias: s < 0 ? 0.25 : -0.1, fur: furB(nrm([s * 0.25, 1]), 13 + s, 3) });
    f.px(add(paw, [-1.2, 1]), FUR[1]); f.px(add(paw, [1.2, 1]), FUR[1]);
    claws(f, add(paw, [-2.4, 2.1]), 4, [1.6, 0], [0, 0.8]);
  };
  const raised = legsF.find((q) => q.paw[1] < 38);
  for (const q of legsF) if (q !== raised) drawF(q);
  // грудь между лап
  f.add(sh(N).E(B(cx, 39.6), 5, 4.6).tufts([0, 1], 1.8, 11, 2, 0.4), FURD, { grp: "chest", bias: -0.2, fur: furB([0, 1], 29, 3) });
  // голова: брыли, череп, уши, морда, нос, глаза, пасть
  for (const s of [-1, 1]) f.add(sh(N).D(Hd(cx + s * 7, 24.6 - (s > 0 ? p.ear : 0)), 2.8), FUR, { grp: "ear" + s, bias: 0.5, fur: furB([0, 1], 41 + s, 2) });
  for (const s of [-1, 1]) { const e = Hd(cx + s * 7, 24.9 - (s > 0 ? p.ear : 0)); f.px(e, EAR_IN); f.px(add(e, [s * -1, 0]), EAR_IN2); f.px(add(e, [0, 1]), EAR_IN2); }
  const head = sh(N).E(Hd(cx, 30.2), 7.7, 6.4).E(Hd(cx, 33.8), 9.2, 4.6).tufts([0, 1], 1.8, 3, 2, 0.3);
  head.tufts([1, 0.4], 1.6, 13, 2.2, 0.6).tufts([-1, 0.4], 1.6, 17, 2.2, 0.6);
  f.add(head, FUR, { grp: "H", amp: 1.9, dome: 5, bias: 0.45, occ: 1.4, fur: furB([0, 1], 23, 2.6) });
  // лоб светлее (свет сверху), надбровья
  const jo = p.jaw * 2.4;
  if (p.jaw > 0.05) {
    f.add(sh(N).E(Hd(cx, 37 + jo * 0.4), 3.2, 1.4 + jo * 0.55), MOUTH, { grp: "mo", bias: -0.3, amp: 0.8 });
    f.add(sh(N).E(Hd(cx, 37.6 + jo), 3.1, 1.3), MUZ, { grp: "jaw", bias: -0.6 });
    f.pxs(Hd(cx, 36.4), [[-2, 0, TOOTH], [2, 0, TOOTH], [-2, 1, TOOTH2], [2, 1, TOOTH2]]);
    f.pxs(Hd(cx, 37.4 + jo * 0.6), [[-1, 0, MOUTH[4]], [0, 0, MOUTH[4]]]);
  }
  f.add(sh(N).E(Hd(cx, 35.2), 4.1, 2.9).E(Hd(cx, 33.2), 2.5, 2.2), MUZ, { grp: "M", amp: 1.3, dome: 2, bias: 0.3, fur: { flow: [0, 1], len: 2, k: 0.4, seed: 5, gx: 3, gy: 2 } });
  f.add(sh(N).E(Hd(cx, 34.2), 2.3, 1.35), NOSE, { grp: "N", amp: 1.8, dome: 1, bias: 0.2 });
  f.pxs(Hd(cx - 1, 33.5), [[0, 0, NOSE[4]], [1, 0, NOSE[3]]]);
  if (p.jaw <= 0.05) f.pxs(Hd(cx, 36), [[0, 0, MUZ[0]], [0, 1, MUZ[0]], [-1, 1.4, MUZ[1]], [1, 1.4, MUZ[1]]]);
  eye(f, Hd(cx - 4.6, 29.8), p.blink); eye(f, Hd(cx + 3.1, 29.8), p.blink);
  if (raised) drawF(raised);
  embers(f, [B(cx - 3, 21), B(cx + 5, 22.5), B(cx - 8, 24)], p.emb);
  if (p.swipe > 0.05 && raised) for (let k = 0; k < 3; k++) streak(f, add(raised.paw, [-3 + k * 2.2, -8 + 4 * (1 - p.swipe)]), add(raised.paw, [-5 + k * 2.2, 2]), [hx("#fff4d8"), hx("#e0c8a0"), hx("#a08868")]);
  return f;
}

function back(p: BP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const up = -p.rear * 10;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + up * clamp((44 - y) / 22, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => [B(x, y)[0] + p.hd[0], B(x, y)[1] + p.hd[1]];
  const L = p.legs;
  // передние лапы (дальше, по бокам)
  const fl: { s: number; top: V2; paw: V2 }[] = [];
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], x = cx + s * 10.2;
    let paw: V2 = [x + p.sway * 0.5, 42.4 - lg[1] - lg[0] * 0.3];
    if (s > 0 && (p.rear > 0.02 || p.paw[1] !== 0)) paw = add(B(x, 42.4), [p.paw[0], p.paw[1]]);
    else if (p.rear > 0.02) paw = add(B(x, 42.4), [0, -p.rear * 4]);
    fl.push({ s, top: B(x, 30), paw });
  }
  const raised = fl.find((q) => q.paw[1] < 36);
  for (const { s, top, paw } of fl) {
    if (raised && raised.s === s) continue;
    f.add(sh(N).L(top, paw, 6.4, 5.4).E(add(paw, [0, 0.3]), 3.6, 1.8).tufts([s, 0.5], 1.2, 5 + s, 2.6, 0.4), FURD, { bias: -0.6, grp: "far", fur: furB([s * 0.2, 1], 7 + s, 2.6) });
  }
  // голова сзади: затылок за горбом, уши
  for (const s of [-1, 1]) f.add(sh(N).D(Hd(cx + s * 5, 19.2 - (s > 0 ? p.ear : 0)), 2.1), FUR, { grp: "ear" + s, bias: 0.3 });
  const head = sh(N).E(Hd(cx, 22.6), 6, 4.6).tufts([0, -1], 1, 7, 2.6, 0.5);
  f.add(head, FUR, { grp: "H", bias: 0.1, amp: 1.7, dome: 4, fur: furB([0, 1], 11, 2.6) });
  // туловище со спины: горб, спина, круп
  const body = sh(N).E(B(cx, 28.2), 11.6, 5.8).E(B(cx, 32), 12.8, 7.8 + p.br * 0.4).E(B(cx, 35.6), 10.6, 6.4);
  body.tufts([0, 1], 1.8, 3, 2.2, 0.5).tufts([1, 0.2], 1.5, 5, 2.4, 0.7).tufts([-1, 0.2], 1.5, 6, 2.4, 0.7);
  f.add(body, FUR, { grp: "B", amp: 1.8, dome: 7, occ: 1.5, fur: furB([0, 1], 19, 3.6) });
  const wave = sh(N).P([[0, 0], [48, 0], ...teeth(46, 2, (x) => 30 - Math.abs(x - cx) * 0.38, 2.6, 3.6, B)]);
  const mant = sh(N).E(B(cx, 28.2), 11.6, 5.8).E(B(cx, 32), 13, 8).and(wave);
  f.add(mant, ASH, { grp: "B", inherit: true, bias: 0.1, fur: furB([0, 1], 23, 3.4, 1.0) });
  // хребет — тёмная борозда
  // задние лапы (ближе, крупно), пятки с подушками при шаге
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 6.6;
    const top = B(x, 37.4), paw: V2 = [x + s * 0.6 + p.sway * 0.4, 44.2 - lg[1] + lg[0] * 0.2];
    f.add(sh(N).E(add(top, [s * 0.4, -0.4]), 5.4, 5.6).L(top, paw, 7.2, 5.6).E(add(paw, [0, 0.1]), 3.8, 1.9).tufts([s, 0.5], 1.4, 9 + s, 2.4, 0.4), FUR, { grp: "H" + s, bias: 0.1, fur: furB([s * 0.2, 1], 29 + s, 3) });
    if (lg[1] > 1) { f.pxs(add(paw, [0, 0]), [[-1, 0, NOSE[2]], [0, 0, NOSE[2]], [1, 0, NOSE[1]], [-2, -1, NOSE[1]], [0, -1, NOSE[1]], [2, -1, NOSE[1]]]); }
  }
  f.add(sh(N).E(B(cx, 38 + p.tail * 0.5), 2.5, 2.1).tufts([0, 1], 1, 4), FUR, { grp: "tail", bias: 0.6, fur: furB([0, 1], 3, 2) });
  if (raised) {
    const { s, top, paw } = raised;
    f.add(sh(N).L(top, paw, 6.8, 5.8).E(paw, 3.8, 2.4).tufts([s, -0.3], 1.3, 3, 2.4, 0.4), FUR, { bias: 0.2, grp: "raised", fur: furB([0, 1], 37, 2.6) });
    claws(f, add(paw, [-2, -2.4]), 4, [1.4, 0], [0, -0.8]);
  }
  embers(f, [B(cx - 4, 27), B(cx + 6, 29), B(cx - 1, 32)], p.emb);
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: BP) {
  const f = v === "side" ? side(p) : v === "front" ? front(p) : back(p), r = f.resolve();
  return v === "side" ? { img: shiftCv(r.img, -1, -1), emis: shiftCv(r.emis, -1, -1) } : { img: shiftCv(r.img, 0, -1), emis: shiftCv(r.emis, 0, -1) };
}

// ================= анимации =================
export function idle(): BP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.45 * SIN(ph), br: 0.6 + 0.6 * SIN(ph), hd: [0.4 * SIN(ph * 0.5 + 0.4), 0.35 * SIN(ph - 0.7)] as V2, ht: 0.03 * SIN(ph - 1), ear: i === 7 || i === 8 ? 1 : 0, blink: i === 10 ? 1 : 0, tail: 0.4 * SIN(ph * 2), emb: i / 12 };
  });
}
export function walk(v: View): BP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [3.6 * COS(t + q), 2.6 * Math.max(0, SIN(t + q))] : [1.6 * COS(t + q), 2.4 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI), a(0)], bob: 0.6 * COS(2 * t) - 0.2, hd: [v === "side" ? 0.4 * COS(t) : 0.5 * SIN(t), 0.5 * COS(2 * t + 0.7)] as V2, sway: v === "side" ? 0 : 0.6 * SIN(t), br: 0.5, tail: 0.5 * SIN(2 * t), emb: i / 12 };
  });
}
export function act(v: View): BP[] {
  // встаёт на дыбы, нюхает воздух (нос подёргивается), опускается
  const up = v === "side" ? 0.42 : 0.5;
  const fr = keyed(REST, [
    { f: 0, p: {} },
    { f: 4, p: { rear: up, paw: v === "side" ? [2, -3] as V2 : [0, -3] as V2, ht: -0.28, hd: [0, -1] as V2, ear: 1, emb: 0.8 } },
    { f: 11, p: { rear: up, paw: v === "side" ? [2, -3] as V2 : [0, -3] as V2, ht: -0.32, hd: [0.3, -1.2] as V2, ear: 1, emb: 0.9 } },
    { f: 15, p: { rear: 0, paw: [0, 0] as V2, ht: 0, hd: [0, 0] as V2, ear: 0, emb: 0.5 } },
  ], 16);
  return fr.map((q, i) => (i >= 5 && i <= 10 ? { ...q, hd: [q.hd[0] + (i % 2 ? 0.5 : -0.2), q.hd[1] + (i % 2 ? -0.4 : 0)] as V2, jaw: i === 8 ? 0.25 : 0, br: 0.8 + 0.4 * SIN(i) } : q));
}
export function hurt(v: View): BP[] {
  const back = 0;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { lean: back, hd: [v === "side" ? -1.2 : 0, -0.8] as V2, ht: -0.12, blink: 1, jaw: 0.5, bob: -0.6, sway: v === "side" ? 0 : 0.8 } },
    { f: 3, p: { lean: back * 0.7, hd: [-0.6, -0.4] as V2, ht: -0.06, blink: 1, jaw: 0.3, sway: -0.4 } },
    { f: 7, p: { lean: 0, hd: [0, 0] as V2, ht: 0, blink: 0, jaw: 0, bob: 0, sway: 0 } },
  ], 8);
}
export function death(v: View): BP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: [0, -0.6] as V2, ht: -0.1, jaw: 0.6, blink: 1, emb: 1 } },
    { f: 6, p: { sink: 8, hd: [v === "side" ? 0.6 : 0, 2.2] as V2, ht: 0.25, jaw: 0.2, blink: 1, emb: 0.3, tail: 0.6 } },
    { f: 11, p: { sink: 8.5, hd: [v === "side" ? 0.8 : 0, 2.6] as V2, ht: 0.3, jaw: 0, blink: 1, emb: 0 } },
  ], 12);
}
export function attack(v: View): BP[] {
  const up: V2 = v === "side" ? [4, -7] : v === "front" ? [2, -16] : [1, -15];
  const hit: V2 = v === "side" ? [6.5, 0.5] : v === "front" ? [0, 2.5] : [0, 1];
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { rear: 0.18, paw: [up[0] * 0.5, up[1] * 0.5] as V2, jaw: 0.5, ht: -0.12, hd: [-0.5, -0.5] as V2, bob: -0.3 } },
    { f: 4, p: { rear: 0.26, paw: up, jaw: 1, ht: -0.08, hd: [-1, -1] as V2, emb: 0.9 } },
    { f: 5, p: { rear: 0.0, paw: hit, lean: 1.2, jaw: 1, ht: 0.12, hd: [1.2, 0.8] as V2, swipe: 1, bob: 0.6, emb: 1 } },
    { f: 7, p: { rear: 0.0, paw: [hit[0] * 0.6, hit[1] * 0.6] as V2, lean: 0.7, jaw: 0.5, ht: 0.05, hd: [0.6, 0.3] as V2, swipe: 0.3 } },
    { f: 9, p: { rear: 0, paw: [0, 0] as V2, lean: 0, jaw: 0, ht: 0, hd: [0, 0] as V2, swipe: 0, emb: 0.5 } },
  ], 10).map((q, i) => (i === 5 || i === 6 ? q : { ...q, swipe: i === 5 ? 1 : q.swipe > 0.6 ? 0 : q.swipe }));
}

export const pet: PetDef<BP> = {
  id: "ash_bear", ru: "ПЕПЕЛЬНЫЙ МЕДВЕДЬ", N, shadow: 15, fx: ["#6a1a06", "#f0761a", "#ffd890"],
  act: "ВСТАЁТ НА ДЫБЫ, НЮХАЕТ ВОЗДУХ", atk: "НА ДЫБЫ И УДАР ЛАПОЙ",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side" },
};
