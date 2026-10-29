/**
 * Пепельная саламандра (проход 4): кадр 32, низкая длинная ящерица на четырёх расставленных лапках, длина с хвостом ~27 px вбок.
 * Тело — цепь эллипсов по изогнутому хребту (хвост волной), тёмная пепельная кожа, светлое брюхо (тот же объём, другой материал),
 * тлеющие трещины по бокам и гребень-шипы по хребту (свечение, пульсирует), глаза-угли на темени, плоская голова с пастью.
 * Живое действие — пробует воздух раздвоенным языком, раздувает гребень; атака — плевок пламенем: огненный сгусток у пасти.
 */
import { Frame2, shiftCv, R, add, clamp, lerp, nrm, rot, sh, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 32;
const SKIN = R("#120d0c", "#221918", "#362926", "#4e3b34", "#6a5247", "#8a6e5e");
const SKIND = R("#0b0808", "#161010", "#241a18", "#352722", "#48362e", "#5e483c");
const BELLY = R("#2e1a10", "#4e2e18", "#76482a", "#9c6a3e", "#c08e58");
const EMB = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const CREST = R("#3a0e06", "#7a240a", "#c84a16", "#ff9636", "#ffdc86");
const MOUTH = R("#2a0606", "#5a1010", "#8a2418", "#c04020");
const TONG = R("#4a0c14", "#8a1c2a", "#c83a48", "#f07080");
const DARK = hx("#0a0606");

export interface SP {
  bob: number; sway: number; tw: number; tamp: number; hd: V2; ht: number; jaw: number; tongue: number; crest: number;
  legs: [V2, V2, V2, V2]; fire: number; fx: number; g: number; blink: number; flat: number;
}
export const REST: SP = { bob: 0, sway: 0, tw: 0, tamp: 0.6, hd: [0, 0], ht: 0, jaw: 0, tongue: 0, crest: 1, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], fire: 0, fx: 0, g: 0.5, blink: 0, flat: 0 };

/** тлеющая трещина: ломаная из пикселей, цвет по пульсу g */
function crack(f: Frame2, pts: V2[], g: number) {
  const c = EMB[clamp(Math.round(0.6 + g * 2), 0, 3)], c2 = EMB[clamp(Math.round(g * 1.6), 0, 2)];
  for (let i = 0; i < pts.length - 1; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])));
    for (let k = 0; k <= n; k++) f.px(lerp(pts[i], pts[i + 1], k / n), i === 0 || k < n / 2 ? c : c2, true);
  }
  if (g > 0.35) f.halo(pts[Math.floor(pts.length / 2)], EMB[0]);
}
function eyeG(f: Frame2, p: V2, blink: number, g: number) {
  if (blink > 0.5) { f.px(p, SKIN[0]); f.px(add(p, [1, 0]), SKIN[0]); return; }
  f.px(p, g > 0.2 ? EMB[4] : EMB[2], true); f.px(add(p, [1, 0]), EMB[3], true); f.px(add(p, [0, -1]), DARK); f.px(add(p, [1, -1]), DARK);
  if (g > 0.2) f.halo(p, EMB[0]);
}
/** огненный сгусток: ореол, пламя, ядро; хвост искр назад */
function fireball(f: Frame2, c: V2, k: number, back: V2) {
  if (k <= 0.05) return;
  f.add(sh(N).D(c, 2 * k).E(add(c, back, 1.4 * k), 1.6 * k, 1.1 * k), EMB, { grp: "fb", glow: true, bias: 0.6, amp: 1, dome: 1 });
  f.add(sh(N).D(c, 1.2 * k), EMB, { grp: "fb2", glow: true, bias: 1.6, flat: true });
  f.px(c, EMB[4], true);
  for (let i = 1; i <= 3; i++) f.px(add(c, back, 2 + i * 1.2 * k), EMB[i < 2 ? 3 : 2], true);
  f.halo(c, EMB[1]);
}
function toes(f: Frame2, foot: V2, dirs: V2[], col: C) { for (const d of dirs) f.px(add(foot, d), col); }

// ================= ВБОК (морда вправо) =================
const spineY = (x: number, p: SP) => {
  if (x >= 21) return 23.4;
  if (x >= 10.5) return 23.9 - 0.6 * SIN(((x - 10.5) / 10.5) * PI);
  return 24 + (10.5 - x) * 0.16 + p.tamp * SIN(p.tw + x * 0.75) * ((10.5 - x) / 8.5);
};
const radius = (x: number) => (x >= 21 ? 2.9 : x >= 13 ? 3.1 + 0.55 * SIN(((x - 13) / 8) * PI) : x >= 10.5 ? 3 : Math.max(0.7, 0.7 + (x - 3) * 0.3));
function side(p: SP): Frame2 {
  const f = new Frame2(N);
  const sk = 1 - p.flat * 0.25, dy = p.bob + p.flat * 0.9;
  const S = (x: number): V2 => [x, spineY(x, p) + dy];
  const Hd = (x: number, y: number): V2 => { const q = rot([x, y + dy], [22.5, 24 + dy], p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  const leg = (sh0: V2, foot: V2, knee: V2, ramp: C[], bias: number, grp: string, front: boolean) => {
    f.add(sh(N).L(sh0, knee, 2.6, 2).L(knee, foot, 1.9, 1.5).E(add(foot, [front ? 0.6 : -0.2, 0.2]), 1.7, 0.9), ramp, { grp, bias, amp: 1.5, dome: 1, occ: 1.2 });
    toes(f, foot, front ? [[1.6, 0.4], [0.6, 0.9]] : [[1.2, 0.5], [-1, 0.5]], ramp[4]);
  };
  const footY = 29.3;
  // дальние лапы
  { const fo: V2 = [21.2 + L[1][0], footY - L[1][1] - 0.4]; leg([20.2, 24.6 + dy], fo, [21.8 + L[1][0] * 0.5, 26.8 + dy - L[1][1] * 0.5], SKIND, -0.4, "lf", true); }
  { const fo: V2 = [14.6 + L[3][0], footY - L[3][1] - 0.4]; leg([13.4, 25 + dy], fo, [13 + L[3][0] * 0.5, 27.3 + dy - L[3][1] * 0.5], SKIND, -0.4, "lh", false); }
  // хвост и тело: цепь эллипсов по хребту
  const body = sh(N);
  for (let x = 3.2; x <= 22.5; x += 0.5) { const r = radius(x); body.E(S(x), r * 1.15, r * 0.84 * sk); }
  f.add(body, SKIN, { grp: "B", amp: 1.9, dome: 2.5, bias: 0.1 });
  // брюхо: светлый низ того же объёма
  const belly = sh(N);
  for (let x = 6; x <= 22; x += 0.5) { const r = radius(x); belly.E(add(S(x), [0, r * 0.6 * sk]), r * 1.05, r * 0.5); }
  belly.and(body);
  f.add(belly, BELLY, { grp: "B", inherit: true, bias: 0.7 });
  // гребень: шипы по хребту, наклонены назад
  for (let i = 0; i < 9; i++) {
    const x = 21.6 - i * 1.7, r = radius(x), base = add(S(x), [0, -r * 0.8 * sk + 0.4]);
    const h = (1.1 + 1.1 * SIN(((i + 0.5) / 9) * PI)) * p.crest;
    f.add(sh(N).P([add(base, [-1, 0.5]), add(base, [1, 0.5]), add(base, [-0.7 - h * 0.35, -h])]), CREST, { grp: "cr" + (i % 2), glow: true, bias: -1.7 + p.g * 1.5, amp: 1.6, dome: 1 });
  }
  // трещины по боку
  for (const [x0, k] of [[17.6, 0], [12.4, 1], [7.8, 3]] as [number, number][]) {
    const a = S(x0), r = radius(x0);
    crack(f, [add(a, [-1.6, -r * 0.05]), add(a, [-0.2, r * 0.3]), add(a, [1.4, r * 0.15])], clamp(p.g + (k % 2 ? -0.15 : 0.1), 0, 1));
  }
  // ближние лапы
  { const fo: V2 = [22.8 + L[0][0], footY - L[0][1]]; leg([21.4, 25 + dy], fo, [23 + L[0][0] * 0.5, 27.2 + dy - L[0][1] * 0.5], SKIN, 0.2, "nf", true); }
  { const fo: V2 = [11.4 + L[2][0], footY - L[2][1]]; leg([12, 25.4 + dy], fo, [10.6 + L[2][0] * 0.5, 27.6 + dy - L[2][1] * 0.5], SKIN, 0.2, "nh", false); }
  // голова: плоская, широкая; нижняя челюсть открывается
  const hinge = Hd(23.4, 24.6), ja = p.jaw * 0.45;
  if (p.jaw > 0.05) {
    f.add(sh(N).P([Hd(23.4, 24.5), Hd(27.6, 24.4), rot(Hd(27.2, 25.5), hinge, ja), rot(Hd(23.6, 25.6), hinge, ja)]), MOUTH, { grp: "mo", glow: p.fire > 0.1, bias: p.fire * 1.5, amp: 0.8 });
    f.add(sh(N).E(rot(Hd(25.4, 25.6), hinge, ja), 2.4, 0.9, ja), SKIN, { grp: "jaw", bias: -0.2 });
  }
  f.add(sh(N).E(Hd(24.6, 23.2), 3.4, 2.5).E(Hd(26.9, 23.8), 1.5, 1.5).E(Hd(22.6, 23.6), 2.2, 2.5), SKIN, { grp: "H", amp: 1.8, dome: 1.5, bias: 0.4 });
  f.px(Hd(27.2, 22.9), SKIN[5]); f.px(Hd(26.2, 22.5), SKIN[4]);
  if (p.jaw <= 0.05) for (let x = 23.6; x < 27.8; x += 1) f.px(Hd(x, 24.7 - (x - 23.6) * 0.08), SKIN[0]);
  eyeG(f, Hd(24.4, 21.8), p.blink, p.g);
  // язык: раздвоенный
  if (p.tongue > 0.05) {
    const t0 = Hd(27.4, 24.6), t1 = add(t0, [1.5 * p.tongue, 0.1]);
    f.add(sh(N).L(t0, t1, 0.9, 0.7), TONG, { grp: "tg", bias: 0.4, flat: true });
    if (p.tongue > 0.6) { f.px(add(t1, [0.6, -0.6]), TONG[3]); f.px(add(t1, [0.6, 0.6]), TONG[2]); }
  }
  fireball(f, add(Hd(27.2, 24.6), [0.6 * p.fx, -0.2]), p.fire, [-1, 0]);
  return f;
}

// ================= ВНИЗ (мордой к зрителю) / ВВЕРХ (хвостом к зрителю) =================
function frontBack(p: SP, back: boolean): Frame2 {
  const f = new Frame2(N), cx = 16, L = p.legs;
  const sw = (y: number, k = 1) => p.sway * SIN(y * 0.35 + p.tw) * k;
  if (!back) {
    const dy = p.bob + p.flat * 0.3;
    const T = (y: number): V2 => { const u = clamp((18 - y) / 12, 0, 1); return [cx + sw(y, 0.4) + (0.8 + p.tamp) * 2 * SIN(p.tw + y * 0.5) * u, y + dy]; };
    // хвост уходит вдаль (вверх по экрану) волной
    const tail = sh(N);
    for (let y = 6; y <= 18; y += 0.5) tail.D(T(y), Math.max(0.7, 0.7 + (y - 6) * 0.2));
    f.add(tail, SKIN, { grp: "B", amp: 1.8, dome: 2, bias: 0 });
    // задние лапы (дальше)
    for (const s of [-1, 1]) {
      const lg = s < 0 ? L[2] : L[3], hip: V2 = [cx + s * 2.4 + sw(18), 18.4 + dy], foot: V2 = [cx + s * 6.2, 21.2 - lg[1] + lg[0] * 0.3];
      f.add(sh(N).L(hip, add(hip, [s * 2.6, 0.8]), 2, 1.6).L(add(hip, [s * 2.6, 0.8]), foot, 1.6, 1.3).E(foot, 1.3, 0.8), SKIND, { grp: "lh" + s, bias: -0.3, amp: 1.4, dome: 1, occ: 1.1 });
      toes(f, foot, [[s * 1.2, 0.4], [0, 0.9]], SKIND[4]);
    }
    const body = sh(N).E([cx + sw(20), 20 + dy], 4, 4.6).E([cx + sw(23.4), 23.2 + dy], 3.3, 2.6);
    f.add(body, SKIN, { grp: "B", amp: 1.9, dome: 3, bias: 0.15 });
    // гребень по хребту сверху: ряд ромбов
    for (let i = 0; i < 8; i++) {
      const y = 22.2 - i * 1.7, c = i < 3 ? ([cx + sw(y), y + dy] as V2) : T(y), h = (0.9 + 0.5 * SIN(((i + 0.5) / 8) * PI)) * p.crest;
      f.add(sh(N).P([add(c, [0, -h * 1.2]), add(c, [h * 0.7, 0]), add(c, [0, h * 0.5]), add(c, [-h * 0.7, 0])]), CREST, { grp: "cr" + (i % 2), glow: true, bias: -1.5 + p.g * 1.5, amp: 1.6, dome: 1 });
    }
    for (const s of [-1, 1]) crack(f, [[cx + s * 1.6 + sw(18), 18.4 + dy], [cx + s * 2.6 + sw(19.4), 19.4 + dy], [cx + s * 2.4 + sw(21), 20.8 + dy]], clamp(p.g - 0.2 + s * 0.1, 0, 1));
    // передние лапы (ближе), в стороны
    for (const s of [-1, 1]) {
      const lg = s < 0 ? L[0] : L[1], sh0: V2 = [cx + s * 2.4 + sw(24), 24.6 + dy], el: V2 = add(sh0, [s * 3, 0.6]), foot: V2 = [cx + s * 6.8, 28.2 - lg[1] + lg[0] * 0.3];
      f.add(sh(N).L(sh0, el, 2.3, 1.8).L(el, foot, 1.8, 1.4).E(foot, 1.5, 0.9), SKIN, { grp: "lf" + s, bias: 0.2, amp: 1.4, dome: 1, occ: 1.1 });
      toes(f, foot, [[s * 1.4, 0.3], [s * 0.4, 1], [-s * 0.8, 0.8]], SKIN[4]);
    }
    // голова: плоская, широкая морда к зрителю
    const hc: V2 = [cx + p.hd[0] + sw(26), 25.4 + dy + p.hd[1]];
    const H = (x: number, y: number): V2 => rot([hc[0] + x, hc[1] + y], hc, p.ht * 0.4);
    if (p.jaw > 0.05) {
      f.add(sh(N).E(H(0, 1.8 + p.jaw * 0.5), 2.8, 0.7 + p.jaw * 0.8), MOUTH, { grp: "mo", glow: p.fire > 0.1, bias: p.fire * 1.5, amp: 0.6 });
      f.add(sh(N).E(H(0, 2.4 + p.jaw * 1.4), 2.6, 0.9), SKIN, { grp: "jaw", bias: -0.3 });
    }
    f.add(sh(N).E(H(0, 0), 4.1, 2.8).E(H(0, 1.3), 3.2, 1.5), SKIN, { grp: "H", amp: 1.8, dome: 1.6, bias: 0.4 });
    if (p.jaw <= 0.05) for (let x = -2; x <= 2; x++) f.px(H(x, 2.5 - Math.abs(x) * 0.2), SKIN[0]);
    f.px(H(-0.6, 1.4), SKIN[1]); f.px(H(0.6, 1.4), SKIN[1]);
    for (const s of [-1, 1]) f.add(sh(N).D(H(s * 2.6, -1.5), 1.3), SKIN, { grp: "eb" + s, bias: 0.7, amp: 1.6, dome: 1 });
    eyeG(f, H(-3.2, -1.6), p.blink, p.g); eyeG(f, H(2.2, -1.6), p.blink, p.g);
    if (p.tongue > 0.05) {
      const t0 = H(0, 2.4), t1 = add(t0, [0, 1.1 * p.tongue]);
      f.add(sh(N).L(t0, t1, 0.9, 0.7), TONG, { grp: "tg", bias: 0.4, flat: true });
      if (p.tongue > 0.6) { f.px(add(t1, [-0.6, 0.6]), TONG[3]); f.px(add(t1, [0.6, 0.6]), TONG[2]); }
    }
    fireball(f, H(0, 2.6 + 0.6 * p.fx), p.fire * 0.9, [0, -1]);
  } else {
    const dy = p.bob + p.flat * 0.8;
    const T = (y: number): V2 => { const u = clamp((y - 18) / 10, 0, 1); return [cx + sw(y, 0.4) + (0.8 + p.tamp) * 2 * SIN(p.tw + y * 0.5) * u, y + dy]; };
    // голова вдали (вверху), огонь — перед головой, за ней
    const hc: V2 = [cx + p.hd[0] * 0.5 + sw(11), 10.8 + dy - p.hd[1] * 0.3];
    fireball(f, add(hc, [0, -2.8 - 0.4 * p.fx]), p.fire * 0.9, [0, 1]);
    for (const s of [-1, 1]) {
      const lg = s < 0 ? L[1] : L[0], sh0: V2 = [cx + s * 2.2 + sw(13), 13 + dy], foot: V2 = [cx + s * 6.4, 15.6 - lg[1] - lg[0] * 0.3];
      f.add(sh(N).L(sh0, add(sh0, [s * 2.8, 0.6]), 2, 1.6).L(add(sh0, [s * 2.8, 0.6]), foot, 1.6, 1.3).E(foot, 1.3, 0.8), SKIND, { grp: "lf" + s, bias: -0.3, amp: 1.4, dome: 1, occ: 1.1 });
      toes(f, foot, [[s * 1.2, -0.4], [0, -0.8]], SKIND[4]);
    }
    f.add(sh(N).E(hc, 3.6, 2.6).E(add(hc, [0, 1.8]), 2.7, 1.7), SKIN, { grp: "H", amp: 1.8, dome: 1.6, bias: 0.25 });
    for (const s of [-1, 1]) f.add(sh(N).D(add(hc, [s * 2.2, -0.8]), 1.2), SKIN, { grp: "eb" + s, bias: 0.6, amp: 1.6, dome: 1 });
    eyeG(f, add(hc, [-2.8, -1]), p.blink, p.g); eyeG(f, add(hc, [1.8, -1]), p.blink, p.g);
    const body = sh(N).E([cx + sw(15), 15.6 + dy], 4, 4.6).E([cx + sw(19), 19.2 + dy], 3.3, 2.8);
    f.add(body, SKIN, { grp: "B", amp: 1.9, dome: 3, bias: 0.1 });
    for (const s of [-1, 1]) crack(f, [[cx + s * 1.6 + sw(14), 14 + dy], [cx + s * 2.6 + sw(15.4), 15.2 + dy], [cx + s * 2.4 + sw(17), 16.8 + dy]], clamp(p.g - 0.2 + s * 0.1, 0, 1));
    // задние лапы (ближе)
    for (const s of [-1, 1]) {
      const lg = s < 0 ? L[2] : L[3], hip: V2 = [cx + s * 2.4 + sw(19.6), 19.8 + dy], el = add(hip, [s * 3, 0.8]), foot: V2 = [cx + s * 6.8, 22.8 - lg[1] + lg[0] * 0.3];
      f.add(sh(N).L(hip, el, 2.3, 1.8).L(el, foot, 1.8, 1.4).E(foot, 1.5, 0.9), SKIN, { grp: "lh" + s, bias: 0.15, amp: 1.4, dome: 1, occ: 1.1 });
      toes(f, foot, [[s * 1.4, 0.3], [s * 0.4, 1], [-s * 0.8, 0.8]], SKIN[4]);
    }
    // хвост к зрителю волной
    const tail = sh(N);
    for (let y = 19; y <= 28.4; y += 0.5) tail.D(T(y), Math.max(0.8, 2.8 - (y - 19) * 0.2));
    f.add(tail, SKIN, { grp: "T", amp: 1.8, dome: 2, bias: 0.15, occ: 1 });
    for (let i = 0; i < 9; i++) {
      const y = 11.8 + i * 1.75, c: V2 = y < 19 ? [cx + sw(y), y + dy] : T(y), h = (0.9 + 0.5 * SIN(((i + 0.5) / 9) * PI)) * p.crest * (y > 22 ? 0.75 : 1);
      f.add(sh(N).P([add(c, [0, -h * 0.6]), add(c, [h * 0.7, 0]), add(c, [0, h * 1.1]), add(c, [-h * 0.7, 0])]), CREST, { grp: "cr" + (i % 2), glow: true, bias: -1.5 + p.g * 1.5, amp: 1.6, dome: 1 });
    }
  }
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: SP) {
  const r = (v === "side" ? side(p) : frontBack(p, v === "back")).resolve();
  return v === "side" ? { img: shiftCv(r.img, 0, -1), emis: shiftCv(r.emis, 0, -1) } : r;
}

export function idle(v: View): SP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, bob: 0.25 * SIN(t), tw: t, tamp: 0.5, sway: 0.4 * SIN(t), hd: [0.2 * SIN(t * 0.5), 0.2 * SIN(t)] as V2, g: 0.5 + 0.45 * SIN(t), blink: i === 8 ? 1 : 0, crest: 1 + 0.06 * SIN(t) };
  });
}
export function walk(v: View): SP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [1.6 * COS(t + q), 1.2 * Math.max(0, SIN(t + q))] : [0.9 * COS(t + q), 1.3 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI), a(0)], bob: 0.3 * COS(2 * t), tw: t * 1, tamp: 0.9, sway: 1.1 * SIN(t), hd: [v === "side" ? 0.3 * COS(t) : -0.6 * SIN(t), 0] as V2, g: 0.6 + 0.3 * SIN(t * 2) };
  });
}
export function act(v: View): SP[] {
  // пробует воздух языком (два раза), затем раздувает гребень и поднимает голову
  return Array.from({ length: 16 }, (_, i) => {
    const t = (2 * PI * i) / 16;
    const tongue = i >= 1 && i <= 6 ? [0, 0.6, 1, 0.3, 0.9, 0.4][i - 1] : 0;
    const puff = i >= 8 ? Math.sin(((i - 8) / 8) * PI) : 0;
    return { ...REST, tongue, crest: 1 + 0.75 * puff, g: 0.45 + 0.55 * puff, hd: [0, -0.8 * puff] as V2, ht: -0.12 * puff, tw: t, tamp: 0.5, sway: 0.3 * SIN(t), bob: -0.4 * puff, jaw: i === 12 ? 0.25 : 0 };
  });
}
export function attack(v: View): SP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: v === "side" ? [-1.4, -0.6] as V2 : [0, -1.2] as V2, ht: -0.2, jaw: 0.4, crest: 1.4, g: 0.9, fire: 0.25, bob: -0.3 } },
    { f: 3, p: { hd: v === "side" ? [-1.6, -0.8] as V2 : [0, -1.4] as V2, ht: -0.25, jaw: 0.5, crest: 1.5, g: 1, fire: 0.35 } },
    { f: 4, p: { hd: v === "side" ? [0.2, 0.1] as V2 : [0, -0.4] as V2, ht: 0.05, jaw: 1, crest: 1.3, g: 1, fire: 1, fx: 0 } },
    { f: 6, p: { hd: v === "side" ? [0.1, 0] as V2 : [0, -0.4] as V2, ht: 0.02, jaw: 0.8, crest: 1.2, g: 0.9, fire: 0.8, fx: 1 } },
    { f: 7, p: { jaw: 0.4, fire: 0, fx: 0, crest: 1.1, g: 0.7 } },
    { f: 9, p: { hd: [0, 0] as V2, ht: 0, jaw: 0, crest: 1, g: 0.5, bob: 0 } },
  ], 10).map((q, i) => (i >= 7 ? { ...q, fire: 0 } : q));
}
export function hurt(v: View): SP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: v === "side" ? [-1, -0.6] as V2 : [0.6, -0.8] as V2, ht: -0.15, jaw: 0.6, blink: 1, crest: 0.7, g: 1, bob: -0.4, sway: 0.8 } },
    { f: 3, p: { hd: [-0.4, -0.2] as V2, ht: -0.06, jaw: 0.3, blink: 1, crest: 0.85, g: 0.8, sway: -0.5 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, jaw: 0, blink: 0, crest: 1, g: 0.5, bob: 0, sway: 0 } },
  ], 8);
}
export function death(v: View): SP[] {
  // распластывается, гребень гаснет, голова ложится
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: [0, -0.6] as V2, ht: -0.15, jaw: 0.7, blink: 1, crest: 1.2, g: 1 } },
    { f: 6, p: { flat: 1, hd: [0, v === "side" ? 0.8 : 0.2] as V2, ht: 0.1, jaw: 0.2, blink: 1, crest: 0.6, g: 0.2, tamp: 0.2 } },
    { f: 11, p: { flat: 1, hd: [0, v === "side" ? 0.9 : 0.2] as V2, ht: 0.12, jaw: 0, blink: 1, crest: 0.5, g: 0, tamp: 0 } },
  ], 12);
}

export const pet: PetDef<SP> = {
  id: "ash_salamander", ru: "ПЕПЕЛЬНАЯ САЛАМАНДРА", N, shadow: 9, fx: ["#5a1404", "#f06a14", "#ffd890"],
  act: "ПРОБУЕТ ВОЗДУХ ЯЗЫКОМ, РАЗДУВАЕТ ГРЕБЕНЬ", atk: "ПЛЕВОК ПЛАМЕНЕМ",
  render, anims: { idle, act, walk, attack, hurt, death },
  icon: { view: "side", zoom: 2, focus: [21, 23] },
};
void nrm;
