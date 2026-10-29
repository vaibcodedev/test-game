/**
 * Ящер трясины (проход 4): кадр 40, лапы на y≈37 (земля 37,5). Виды: вниз, вверх, вбок (морда вправо; влево — зеркало).
 * Приземистый болотный ящер: зелёно-бурая чешуя рядами (тёмная нижняя кромка пластин), бородавчатый гребень и бородавки по бокам,
 * светлое брюхо и горловой мешок (дышит), широкая плоская голова с надглазными буграми, жёлтые глаза-щёлки, пасть с зубами
 * и раздвоенным языком; ядовитые железы на шее (зелёные, слабо светятся) и капли яда. Лапы растопырены, 2 сегмента, 3 когтя.
 */
import { Frame2, shiftCv, R, add, clamp, ik2, lerp, nrm, rot, sh, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 40;
const SKIN = R("#0d130a", "#1b2512", "#2d3a1b", "#445426", "#5e6e32", "#808c48");
const SKIND = R("#0a0f08", "#151d0e", "#232e15", "#36421e", "#4c5828", "#687238");
const WART = R("#1a1009", "#34210f", "#56391a", "#7a5628", "#9e7638", "#c09a56");
const BELLY = R("#2c2812", "#55502a", "#837a42", "#ada25e", "#d0c682");
const MOUTH = R("#1e0606", "#4a1214", "#7a2a28", "#a84a40");
const POI = R("#16300e", "#2e6a14", "#5cb424", "#a8e848", "#e4ffa0");
const CLAW = hx("#c8bc96"), CLAW2 = hx("#7e745a"), TOOTH = hx("#e8e2c4"), TONGUE = hx("#c04858"), TONGUE2 = hx("#e07888");
const EYE = hx("#e0d84a"), EYE2 = hx("#a89a20"), PUP = hx("#0c0c04");

export interface LP {
  bob: number; br: number; hd: V2; ht: number; jaw: number; tongue: number; blink: number;
  legs: [V2, V2, V2, V2]; lean: number; sway: number; tail: number; gl: number; spit: number; sink: number;
}
export const REST: LP = { bob: 0, br: 0, hd: [0, 0], ht: 0, jaw: 0, tongue: 0, blink: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], lean: 0, sway: 0, tail: 0, gl: 0, spit: 0, sink: 0 };
const SC = { k: 0.75, s: 3 };

function claws(f: Frame2, foot: V2, d: V2, n = 3) {
  const q = nrm(d), pp: V2 = [-q[1], q[0]];
  for (let i = 0; i < n; i++) { const b = add(add(foot, q, 1.2), pp, (i - (n - 1) / 2) * 1.1); f.px(b, CLAW); if (Math.abs(q[1]) < 0.5) f.px(add(b, q, 0.9), CLAW2); }
}
function warts(f: Frame2, pts: [V2, number][], bias = 0) {
  for (const [c, r] of pts) {
    f.add(sh(N).D(c, r), WART, { grp: "wart", bias: bias - 0.1, amp: 1.7, dome: 1, occ: 0.5 });
    if (r > 1) f.px(add(c, [-0.4, -0.5]), WART[5]);
  }
}
function gland(f: Frame2, c: V2, r: number, gl: number) {
  f.add(sh(N).E(c, r, r * 0.85), POI, { glow: true, grp: "gl", bias: -0.6 + gl * 1.2, amp: 1.4, dome: 1 });
  f.px(add(c, [-0.4, -0.4]), POI[4], true);
  if (gl > 0.3) f.halo(c, POI[0]);
}
function spitGlob(f: Frame2, from: V2, d: V2, k: number, len = 4) {
  if (k <= 0.02) return;
  const q = nrm(d), end = add(from, q, 1.5 + k * len);
  for (let i = 0; i < 5; i++) { const pt = lerp(from, end, i / 4); if (i > 0) f.px(pt, POI[i < 3 ? 1 : 2], true); }
  f.add(sh(N).D(end, 1.3), POI, { glow: true, grp: "spit", bias: 0.8, flat: true });
  f.px(add(end, [-0.4, -0.4]), POI[4], true); f.halo(end, POI[1]);
  for (const s of [-1, 1]) f.px(add(add(end, q, -2), [-q[1] * s * 1.6, q[0] * s * 1.6]), POI[2], true);
}

// ================= ВБОК (морда вправо) =================
function side(p: LP): Frame2 {
  const f = new Frame2(N);
  const B = (x: number, y: number): V2 => [x + p.lean, y + p.bob + p.sink * clamp((37 - y) / 9, 0, 1)];
  const neck = B(28, 28.6);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), neck, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  const leg = (top: V2, foot: V2, l1: number, l2: number, pole: V2, w: [number, number, number], ramp: C[], bias: number, grp: string) => {
    const el = ik2(top, foot, l1, l2, pole);
    f.add(sh(N).L(top, el, w[0], w[1]).L(el, foot, w[1], w[2]).E(add(foot, [0.6, 0.1]), 2.2, 0.95), ramp, { bias, grp, amp: 1.7, dome: 2, occ: 1.2, scales: { k: 0.5, s: 2 } });
    claws(f, add(foot, [0.8, 0.3]), [1, 0.15]);
  };
  // хвост: толстый у тела, кончик лежит на земле
  const tw = p.tail;
  const t0 = B(12.5, 29.6), t1: V2 = [8 + p.lean * 0.5, 32.6 + tw * 0.5], t2: V2 = [4.2, 35.2 - tw * 0.8];
  f.add(sh(N).L(t0, t1, 5.6, 3.6).L(t1, t2, 3.6, 1.2), SKIN, { grp: "tail", bias: -0.1, amp: 1.7, dome: 2, scales: SC });
  // дальние лапы
  leg(B(25.4, 30.8), [26.6 + L[1][0], 36 - L[1][1]], 3.4, 3.6, [-1, 0.3], [3, 2.4, 2], SKIND, -0.3, "far");
  leg(B(15.6, 31), [17.2 + L[3][0], 36 - L[3][1]], 3.6, 3.8, [1, 0.3], [3.4, 2.6, 2], SKIND, -0.3, "far");
  // тело
  const body = sh(N).E(B(19, 29), 8.6, 4.9 + p.br * 0.3).E(B(25, 28.4), 4.4, 4.6).E(B(13.6, 29.4), 4.2, 4.2);
  f.add(body, SKIN, { grp: "B", amp: 2, dome: 4, occ: 1.3, scales: SC });
  f.add(sh(N).E(B(19.5, 32.8), 7.2, 1.8).E(B(25.5, 32.4), 2.6, 1.6), BELLY, { grp: "B", inherit: true, bias: 0.6, scales: { k: 0.5, s: 2 } });
  // бородавчатый гребень и бородавки на боку
  warts(f, [[B(13, 25.6), 0.9], [B(16, 24.6), 1.3], [B(19.2, 24.4), 1.1], [B(22.2, 24.2), 1.4], [B(25.2, 24.4), 1], [B(17.8, 27.2), 0.8], [B(21.2, 28.2), 1], [B(14.6, 28.8), 0.8], [B(24.6, 27.6), 0.9], [B(18.6, 30.4), 0.7]]);
  // ближние лапы
  leg(B(14, 31), [13.4 + L[2][0], 36.2 - L[2][1]], 3.8, 4, [1, 0.3], [4, 3, 2.4], SKIN, 0.2, "HN");
  leg(B(24.4, 31), [25 + L[0][0], 36.2 - L[0][1]], 3.6, 3.8, [-1, 0.3], [3.6, 2.8, 2.2], SKIN, 0.3, "FN");
  // голова: шея с железами, плоский череп, надглазье, морда, челюсть
  f.add(sh(N).E(B(28.2, 28.4), 3.6, 3.3), SKIN, { grp: "Hn", amp: 1.8, dome: 2, bias: 0.1, scales: SC });
  gland(f, B(27.6, 26.6), 1.4, p.gl); gland(f, B(25.8, 27.4), 1.1, p.gl);
  const jawA = p.jaw * 0.5, hinge = Hd(30.4, 29.2);
  const J = (x: number, y: number): V2 => rot(Hd(x, y), hinge, jawA);
  f.add(sh(N).P([J(30, 28.9), J(36.4, 29), J(35.6, 30.6), J(30.4, 31.6)]).E(J(30.6, 30.6), 2.2, 1.2 + p.br * 0.2), BELLY, { grp: "jaw", amp: 1.4, dome: 1, bias: -0.1 });
  if (p.jaw > 0.05) {
    f.add(sh(N).P([Hd(30.4, 28.6), Hd(36.6, 28.8), J(36.2, 29.2), J(30.4, 29.6)]), MOUTH, { grp: "mo", flat: true, bias: 0.6 });
    for (let i = 0; i < 3; i++) { f.px(Hd(32.4 + i * 1.5, 29.1), TOOTH); f.px(J(33 + i * 1.4, 28.9), TOOTH); }
  }
  const skull = sh(N).E(Hd(31.2, 27.2), 4.8, 3).P([Hd(31, 25.2), Hd(35.4, 25.9), Hd(37.4, 27.3), Hd(37.2, 28.9), Hd(30.6, 29.4)]);
  f.add(skull, SKIN, { grp: "H", amp: 1.9, dome: 2, bias: 0.35, scales: { k: 0.55, s: 2 } });
  f.add(sh(N).E(Hd(31.8, 25.4), 2.5, 1.6), WART, { grp: "brow", bias: 0.3, amp: 1.7, dome: 1 });
  warts(f, [[Hd(34, 26.4), 0.7], [Hd(28.8, 25.6), 0.8]], 0.1);
  if (p.jaw <= 0.05) for (let x = 30.6; x <= 36.4; x += 1) f.px(Hd(x, 28.9 + (x - 30.6) * 0.02), SKIN[0]);
  f.px(Hd(36.4, 27.3), SKIN[0]);
  if (p.blink > 0.5) { f.px(Hd(31, 25.6), WART[1]); f.px(Hd(32, 25.6), WART[1]); f.px(Hd(33, 25.8), WART[1]); }
  else { f.px(Hd(31, 25.6), EYE, true); f.px(Hd(32, 25.6), PUP); f.px(Hd(33, 25.7), EYE2, true); f.px(Hd(32, 26.5), WART[1]); f.px(Hd(31, 24.6), WART[0]); f.px(Hd(32, 24.5), WART[0]); f.px(Hd(33, 24.7), WART[0]); }
  if (p.tongue > 0.05) { const a = Hd(36.6, 29), b = add(a, [p.tongue * 3.2, 0.2]); for (let i = 0; i <= 3; i++) f.px(lerp(a, b, i / 3), i < 2 ? TONGUE : TONGUE2); f.px(add(b, [1, -0.7]), TONGUE2); f.px(add(b, [1, 0.8]), TONGUE2); }
  spitGlob(f, Hd(37.4, 29.2), [1, 0.12], p.spit, 1.6);
  // капля яда с желёз
  if (p.gl > 0.3) f.px(B(27.6, 28.6 + p.gl * 1.2), POI[3], true);
  return f;
}

// ================= ВНИЗ / ВВЕРХ =================
function front(p: LP): Frame2 {
  const f = new Frame2(N), cx = 20;
  const B = (x: number, y: number): V2 => [x + p.sway * clamp((33 - y) / 10, 0, 1), y + p.bob + p.sink * clamp((37 - y) / 9, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = B(x, y); return [q[0] + p.hd[0] - p.sway * 0.5, q[1] + p.hd[1] + p.ht * 4]; };
  const L = p.legs;
  // хвост за спиной вверх
  const tw = p.tail;
  f.add(sh(N).L(B(cx + 3, 25), B(cx + 8.6, 21.4 + tw * 0.4), 4.6, 3).L(B(cx + 8.6, 21.4 + tw * 0.4), B(cx + 13 + tw * 0.6, 22.2 - tw), 3, 1.2), SKIND, { grp: "tail", bias: 0, amp: 1.7, dome: 2, scales: SC });
  // задние лапы (дальше, выше), растопырены
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], top = B(cx + s * 5.4, 25.4), foot: V2 = [cx + s * 9.6 + p.sway * 0.4, 30.2 - lg[1] - lg[0] * 0.2];
    const el = ik2(top, foot, 3.2, 3.2, [s, -0.6]);
    f.add(sh(N).L(top, el, 3.2, 2.4).L(el, foot, 2.4, 2).E(foot, 1.8, 0.9), SKIND, { grp: "far" + s, bias: -0.3, amp: 1.5, dome: 2 });
    claws(f, add(foot, [0, 0.2]), [s * 0.3, 1]);
  }
  // спина
  f.add(sh(N).E(B(cx, 25.4), 7.4, 5.4 + p.br * 0.3).E(B(cx, 21.6), 5.2, 3), SKIN, { grp: "B", amp: 2, dome: 5, occ: 1.3, bias: -0.15, scales: SC });
  warts(f, [[B(cx - 0.6, 20.4), 1], [B(cx + 1.2, 23), 1.3], [B(cx - 1.4, 25.6), 1.1], [B(cx - 4.4, 22.8), 0.9], [B(cx + 4.6, 24.4), 1], [B(cx - 5.6, 27), 0.8], [B(cx + 3, 27.8), 0.7]]);
  // передние лапы растопырены
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[0] : L[1], top = B(cx + s * 5.4, 31), foot: V2 = [cx + s * 8.8 + p.sway * 0.4, 35.8 - lg[1] + lg[0] * 0.25];
    const el = ik2(top, foot, 3.6, 3.6, [s, -0.4]);
    f.add(sh(N).L(top, el, 4, 3).L(el, foot, 3, 2.4).E(add(foot, [0, 0.1]), 2.2, 1), SKIN, { grp: "F" + s, bias: s < 0 ? 0.3 : 0, amp: 1.7, dome: 2, scales: { k: 0.5, s: 2 } });
    claws(f, add(foot, [0, 0.3]), [s * 0.25, 1]);
  }
  // железы на шее
  for (const s of [-1, 1]) gland(f, Hd(cx + s * 6.4, 29.6), 1.3, p.gl);
  // голова: широкая плоская, горло, пасть
  const jo = p.jaw * 2.2;
  f.add(sh(N).E(Hd(cx, 33.6 + jo * 0.6), 5.6, 2.1 + p.br * 0.3), BELLY, { grp: "jaw", amp: 1.4, dome: 2, bias: -0.1 });
  if (p.jaw > 0.05) {
    f.add(sh(N).E(Hd(cx, 33.4 + jo * 0.3), 4.6, 0.8 + jo * 0.55), MOUTH, { grp: "mo", flat: true, bias: 0.5 });
    for (let i = -2; i <= 2; i++) { f.px(Hd(cx + i * 1.7, 33), TOOTH); f.px(Hd(cx + i * 1.7, 33.6 + jo * 0.75), TOOTH); }
    if (p.tongue > 0.05) { f.px(Hd(cx, 34 + jo * 0.3), TONGUE); f.px(Hd(cx - 0.6, 35 + jo * 0.3 + p.tongue), TONGUE2); f.px(Hd(cx + 0.6, 35 + jo * 0.3 + p.tongue), TONGUE2); }
  }
  f.add(sh(N).E(Hd(cx, 30.8), 6.6, 2.7).E(Hd(cx, 32.2), 5.8, 1.4), SKIN, { grp: "H", amp: 1.9, dome: 3, bias: 0.35, scales: { k: 0.55, s: 2 } });
  if (p.jaw <= 0.05) for (let x = -5; x <= 5; x++) f.px(Hd(cx + x, 33.1 - Math.abs(x) * 0.1), SKIN[0]);
  f.pxs(Hd(cx, 31.2), [[-1.2, 0, SKIN[0]], [1.2, 0, SKIN[0]]]);
  for (const s of [-1, 1]) {
    const e = Hd(cx + s * 4.4, 28.6);
    f.add(sh(N).E(e, 2, 1.5), WART, { grp: "brow" + s, bias: 0.2, amp: 1.6, dome: 1 });
    if (p.blink > 0.5) { f.px(e, WART[1]); f.px(add(e, [s * -1, 0]), WART[1]); }
    else { f.px(add(e, [s * -0.6, 0.2]), EYE, true); f.px(add(e, [s * 0.5, 0.2]), EYE2, true); f.px(add(e, [0, 0.2]), PUP); f.px(add(e, [0, -0.9]), WART[0]); }
  }
  spitGlob(f, Hd(cx + 3, 33.8), [1, 0.15], p.spit, 3);
  return f;
}
function back(p: LP): Frame2 {
  const f = new Frame2(N), cx = 20;
  const B = (x: number, y: number): V2 => [x + p.sway * clamp((y - 20) / 12, 0, 1), y + p.bob + p.sink * clamp((37 - y) / 9, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = B(x, y); return [q[0] + p.hd[0] - p.sway * 0.4, q[1] + p.hd[1] + p.ht * 3]; };
  const L = p.legs;
  // передние лапы (дальше, выше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], top = B(cx + s * 5.4, 23.6), foot: V2 = [cx + s * 9.4 + p.sway * 0.3, 28.4 - lg[1] - lg[0] * 0.2];
    const el = ik2(top, foot, 3, 3, [s, -0.6]);
    f.add(sh(N).L(top, el, 3, 2.4).L(el, foot, 2.4, 2).E(foot, 1.8, 0.9), SKIND, { grp: "far" + s, bias: -0.3, amp: 1.5, dome: 2 });
    claws(f, foot, [s * 0.4, -0.6]);
  }
  // голова сзади
  f.add(sh(N).E(Hd(cx, 20.6), 5.6, 2.8).E(Hd(cx, 22.4), 4.4, 1.8), SKIN, { grp: "H", amp: 1.8, dome: 2, bias: 0.25, scales: { k: 0.55, s: 2 } });
  for (const s of [-1, 1]) f.add(sh(N).E(Hd(cx + s * 4.2, 19.4), 1.8, 1.3), WART, { grp: "brow" + s, bias: 0.3, amp: 1.6, dome: 1 });
  for (const s of [-1, 1]) gland(f, Hd(cx + s * 5.6, 23.2), 1.2, p.gl);
  // спина
  f.add(sh(N).E(B(cx, 27), 7.6, 5.4 + p.br * 0.3).E(B(cx, 30.4), 5.6, 3.4), SKIN, { grp: "B", amp: 2, dome: 5, occ: 1.3, scales: SC });
  warts(f, [[B(cx + 0.4, 23.4), 1], [B(cx - 1, 26), 1.4], [B(cx + 1.2, 28.6), 1.2], [B(cx - 0.4, 31), 0.9], [B(cx - 4.4, 25), 1], [B(cx + 4.4, 26.6), 0.9], [B(cx - 5.2, 29.2), 0.8], [B(cx + 5.6, 29.8), 0.8]]);
  // задние лапы (ближе)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], top = B(cx + s * 5.6, 30.4), foot: V2 = [cx + s * 9.4 + p.sway * 0.3, 35.8 - lg[1] + lg[0] * 0.2];
    const el = ik2(top, foot, 3.8, 3.8, [s, -0.4]);
    f.add(sh(N).E(add(top, [s * 0.6, -0.3]), 3, 2.8).L(top, el, 4.2, 3.2).L(el, foot, 3.2, 2.4).E(foot, 2.2, 1), SKIN, { grp: "H" + s, bias: 0.15, amp: 1.7, dome: 2, scales: { k: 0.5, s: 2 } });
    if (lg[1] > 0.6) f.pxs(foot, [[-1, 0, BELLY[1]], [0, 0, BELLY[2]], [1, 0, BELLY[1]]]);
    else claws(f, add(foot, [0, 0.3]), [s * 0.4, 0.6]);
  }
  // хвост к зрителю, кончик на земле
  const tw = p.tail;
  f.add(sh(N).L(B(cx, 30.2), B(cx + 1 + tw * 0.6, 33.6), 5, 3.4).L(B(cx + 1 + tw * 0.6, 33.6), [cx + 3.4 + tw * 1.6, 35.8], 3.4, 1.4), SKIN, { grp: "tail", bias: 0.2, amp: 1.7, dome: 2, scales: SC });
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: LP) {
  const r = (v === "side" ? side(p) : v === "front" ? front(p) : back(p)).resolve();
  return v === "side" ? { img: shiftCv(r.img, -1), emis: shiftCv(r.emis, -1) } : r;
}

// ================= анимации =================
export function idle(): LP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.25 * SIN(ph), br: 0.5 + 0.5 * SIN(ph * 2), hd: [0.2 * SIN(ph * 0.5), 0.2 * SIN(ph - 0.8)] as V2, tail: 0.7 * SIN(ph), blink: i === 9 ? 1 : 0, tongue: i === 4 ? 0.6 : i === 5 ? 1 : 0, gl: 0.3 + 0.2 * SIN(ph) };
  });
}
export function act(v: View): LP[] {
  // шипит: поднимает голову, раздувается, разевает пасть, язык мелькает
  void v;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 3, p: { ht: -0.16, hd: [0, -0.6] as V2, br: 1.6, gl: 0.8, bob: -0.4 } },
    { f: 5, p: { ht: -0.2, hd: [0.3, -0.8] as V2, br: 1.8, jaw: 1, gl: 1, bob: -0.5 } },
    { f: 11, p: { ht: -0.2, hd: [0.3, -0.8] as V2, br: 1.8, jaw: 1, gl: 1, bob: -0.5 } },
    { f: 15, p: { ht: 0, hd: [0, 0] as V2, br: 0.5, jaw: 0, gl: 0.3, bob: 0 } },
  ], 16).map((q, i) => ({ ...q, tongue: i >= 6 && i <= 10 ? (i % 2 ? 1 : 0.4) : 0, tail: 0.9 * SIN(i * 0.8), br: q.br + (i >= 5 && i <= 11 ? 0.2 * SIN(i * 2) : 0) }));
}
export function walk(v: View): LP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [2.2 * COS(t + q), 1.5 * Math.max(0, SIN(t + q))] : [1 * COS(t + q), 1.5 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI), a(0)], bob: 0.35 * COS(2 * t), sway: v === "side" ? 0 : 0.9 * SIN(t), tail: -1.2 * SIN(t), hd: [v === "side" ? 0 : 0.5 * SIN(t + 0.6), 0.2 * COS(2 * t)] as V2, br: 0.4, gl: 0.3 };
  });
}
export function attack(v: View): LP[] {
  // бросок с укусом и ядовитый плевок
  const lun = v === "side" ? 2.4 : 0;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { lean: -1, ht: -0.2, hd: [-0.4, -0.6] as V2, jaw: 0.6, gl: 0.8, br: 1.2 } },
    { f: 4, p: { lean: lun, ht: 0.08, hd: [v === "side" ? 1 : 0, v === "front" ? 0 : 0.3] as V2, jaw: 1, gl: 1, br: 1, spit: 0.3 } },
    { f: 6, p: { lean: lun * 0.8, ht: 0.05, jaw: 0.8, spit: 1, gl: 0.6 } },
    { f: 9, p: { lean: 0, ht: 0, hd: [0, 0] as V2, jaw: 0, spit: 0, gl: 0.3, br: 0.4 } },
  ], 10).map((q, i) => ({ ...q, spit: i >= 4 && i <= 7 ? [0.3, 0.6, 1, 1][i - 4] : 0 }));
}
export function hurt(v: View): LP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1 : 0, -0.7] as V2, ht: -0.15, blink: 1, jaw: 0.6, bob: -0.4, sway: v === "side" ? 0 : 0.8, tail: 1.2 } },
    { f: 3, p: { hd: [-0.5, -0.3] as V2, ht: -0.06, blink: 1, jaw: 0.3, sway: -0.4, tail: -0.6 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, blink: 0, jaw: 0, bob: 0, sway: 0, tail: 0 } },
  ], 8);
}
export function death(v: View): LP[] {
  void v;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { ht: -0.18, hd: [0, -0.6] as V2, jaw: 0.8, blink: 1, gl: 0.8 } },
    { f: 6, p: { sink: 2.2, ht: 0.2, hd: [0, v === "front" ? 0.2 : 1.2] as V2, jaw: 0.3, blink: 1, gl: 0.2, tail: 0.8, br: 0 } },
    { f: 11, p: { sink: 2.4, ht: 0.25, hd: [0, v === "front" ? 0.3 : 1.4] as V2, jaw: 0.15, blink: 1, gl: 0, tail: 0.9 } },
  ], 12);
}

export const pet: PetDef<LP> = {
  id: "bog_lizard", ru: "ЯЩЕР ТРЯСИНЫ", N, shadow: 12, fx: ["#16300e", "#5cb424", "#d8f8b8"],
  act: "ШИПИТ, РАЗЕВАЕТ ПАСТЬ", atk: "ЯДОВИТЫЙ УКУС И ПЛЕВОК",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side" },
};
