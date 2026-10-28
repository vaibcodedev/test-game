/**
 * Задача 139, босс кольца: минотавр-латник (запад, слот r65n, ур. 65, группа 4–5; референс 25 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — 2D-пиксель-арт слоями-штампами (части и поза — mino_pose.ts, общий код — mino_lib.ts): тело в 2× (160×160) сводится в кадр 80×80, ступни y=76,
 * контур 1 px; анимация — сдвигом и поворотом частей по ключевым позам, руки по IK (кулак идёт по траектории удара, без «недотяга»).
 * Виды: вниз, вверх, вбок (строки листа), влево — зеркало вбок (в игре). Свечение — глаза (лист mino-glow.png).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/cliff_minotaur_knight.ts [--quick] [--only=idle,walk]
 *   → tools/out/bosses139/mino-sheet.png, mino-glow.png, r65n-w-compare.png («наш | референс»).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { Cv, C, SIL, hx, label, OUTL } from "./mino_lib";
import { Pose, REST, ViewId, flip, keyed, renderFrame } from "./mino_pose";

export const ID = "sol_cliff_minotaur";
export const FRAME = 80;
export const FRAME_H = 80;
const N = FRAME, FH = FRAME_H;
const VIEWS: ViewId[] = ["front", "back", "side"]; // строки листа: вниз, вверх, вбок
const SIN = Math.sin, PI = Math.PI;

// ---------------- позы ----------------
const P = (o: Partial<Pose>): Partial<Pose> => o;
const WIND_CLAW = P({ fh: [3, -6], ha: 0.6, sw: 0.9, lean: 0.1, head: [1, 0], squat: 1, bob: 0.3, legB: [1, 0], nh: [2, -2], glow: 1.3 });
const SLAM_UP = P({ fh: [6, -16], ha: -1.0, sw: 1.9, lean: 0.02, head: [1, -1], bob: -1, legA: [2, 0], nh: [3, -6], glow: 1.4 });
const DASH = P({ lean: 0.45, dx: -2, squat: 1, head: [-4, 3], sw: 1.0, fh: [4, -3], nh: [3, -3], glow: 1.5, streak: 0.9 });

function idlePoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => { const ph = (2 * PI * i) / 12; return { ...REST, bob: 0.6 * SIN(ph), head: [0, 0.5 * SIN(ph - 0.6)] as [number, number], nh: [0, 0.4 * SIN(ph - 1)] as [number, number], sw: -0.1 + 0.05 * SIN(ph + 1), glow: 1 + 0.15 * SIN(ph) }; });
}
function walkPoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => {
    const f = (2 * PI * i) / 12;
    return { ...REST, legA: [-3.5 * Math.cos(f), -3 * Math.max(0, SIN(f))] as [number, number], legB: [3.5 * Math.cos(f), -3 * Math.max(0, -SIN(f))] as [number, number],
      bob: 0.8 * Math.cos(2 * f) - 0.3, lean: 0.17 + 0.02 * Math.cos(f), head: [0, -0.4 * Math.cos(2 * f)] as [number, number],
      nh: [3 * Math.cos(f), 0] as [number, number], fh: [-2.5 * Math.cos(f), 0] as [number, number], sw: -0.1 + 0.2 * SIN(f), glow: 1.1 };
  });
}
const attackPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 2, p: P({ fh: [6, -8], ha: -0.6, sw: 1.8, bob: 0.5, head: [2, 0], lean: 0.1, nh: [2, -2] }) },
  { f: 4, p: P({ fh: [8, -12], ha: -0.9, sw: 2.0, lean: 0.08, head: [3, -1], legB: [2, 0], nh: [3, -4], glow: 1.4 }) },
  { f: 6, p: P({ fh: [-5, -3], ha: 3.3, sw: -1.2, lean: 0.32, head: [-3, 2], bob: 1, legA: [-3, 0], legB: [-2, 0], nh: [-3, -1], flash: 0.7, dust: [0, 0.5], glow: 1.5 }) },
  { f: 8, p: P({ fh: [-3, 0], ha: 3.0, sw: -0.2, lean: 0.22, head: [-2, 1], legA: [-2, 0] }) },
  { f: 9, p: {} },
], 10);
const clawWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: WIND_CLAW }], 4);
const clawHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...WIND_CLAW, nh: [2, -2 + [0, 0.5, 0, -0.5][i]] as [number, number], glow: [1.3, 1.5, 1.35, 1.5][i], sw: 0.9 + [0, 0.06, 0, -0.06][i] } as Pose));
const clawStrike = (): Pose[] => keyed([
  { f: 0, p: WIND_CLAW },
  { f: 2, p: P({ fh: [-3, -2], ha: 3.0, sw: 0, lean: 0.25, head: [-2, 1] }) },
  { f: 3, p: P({ fh: [-7, -4], ha: 3.3, sw: -1.4, lean: 0.32, head: [-3, 2], bob: 1, legA: [-3, 0], nh: [-3, -1], flash: 0.8, dust: [0, 0.6], glow: 1.5 }) },
  { f: 5, p: P({ fh: [-6, -2], ha: 3.2, sw: -1.1, lean: 0.3, head: [-3, 2], flash: 0.2 }) },
  { f: 7, p: P({ fh: [3, -4], ha: 0.6, sw: 0.9, lean: 0.12, head: [2, 0], squat: 1, nh: [1, -2] }) },
  { f: 9, p: P({ fh: [-2, -2], ha: 3.0, sw: -0.2, lean: 0.24, head: [-2, 1] }) },
  { f: 10, p: P({ fh: [-7, -4], ha: 3.3, sw: -1.3, lean: 0.34, head: [-3, 2], bob: 1, legB: [-3, 0], nh: [-3, -1], flash: 0.8, dust: [0.5, 0], glow: 1.5 }) },
  { f: 11, p: P({ fh: [-2, -1], ha: 3.1, sw: -0.2, lean: 0.2 }) },
], 12);
const rushWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: P({ squat: 3, lean: 0.38, head: [-3, 3], legA: [3, 0], legB: [-1, 0], fh: [3, -3], sw: 1.0, nh: [2, -3], glow: 1.4 }) }], 4);
const rushHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => ({ ...REST, squat: 3 + [0, 0.4, 0, -0.4][i], lean: 0.38, head: [-3, 3], legA: [3, 0], legB: [[-2, -3], [-3, 0], [-1, -1], [-1, 0]][i] as [number, number], fh: [3, -3], sw: 1.0, nh: [2, -3], glow: [1.5, 1.7, 1.55, 1.7][i], dust: [0, [0, 0.6, 0.2, 0][i]] } as Pose));
const rushDash = (): Pose[] => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...DASH, bob: [-1, -0.2, -1, -0.2][i], legA: (i % 2 ? [-4, 0] : [4, -3]) as [number, number], legB: (i % 2 ? [4, -3] : [-4, 0]) as [number, number], dust: [[0.4, 0], [0, 0.4], [0.4, 0], [0, 0.4]][i], streak: 0.8 + 0.1 * (i % 2) } as Pose));
const rushStrike = (): Pose[] => keyed([
  { f: 0, p: DASH },
  { f: 1, p: P({ lean: 0.5, dx: -3, head: [-5, 3], squat: 2, flash: 1.0, flashAt: "head", shards: 0.3, dust: [0.6, 0.8], sw: 0.8, glow: 1.6, fh: [4, -3] }) },
  { f: 2, p: P({ lean: 0.48, dx: -3, head: [-5, 3], squat: 2, flash: 0.6, flashAt: "head", shards: 0.6, dust: [0.9, 1], sw: 0.6, glow: 1.5 }) },
  { f: 3, p: P({ lean: 0.4, dx: -2, head: [-4, 2], squat: 1.5, shards: 0.9, dust: [0.7, 0.8], bob: 0.5 }) },
  { f: 5, p: P({ lean: 0.25, dx: 0, head: [-1, 1], squat: 0.5, dust: [0.3, 0.3] }) },
], 6);
const callWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: P({ nh: [4, -27], fh: [0, -10], sw: 0.6, head: [0, -1], htilt: -0.3, lean: 0.0, bob: -1, glow: 1.4 }) }], 4);
const callHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => ({ ...REST, nh: [4, -27], fh: [0, -10], sw: 0.6 + 0.05 * TR[i], head: [0, -1.5], htilt: -0.45, open: i % 2 ? 1 : 0, lean: 0, bob: -1 + 0.4 * TR[i], glow: [1.5, 1.7, 1.55, 1.7][i], waves: [0.1, 0.3, 0.2, 0.4][i] } as Pose));
const TR = [0, 1, 0, -1];
const callCast = (): Pose[] => keyed([
  { f: 0, p: P({ nh: [4, -27], fh: [0, -10], sw: 0.6, head: [0, -1.5], htilt: -0.45, open: 1, lean: 0, bob: -1, glow: 1.5 }) },
  { f: 2, p: P({ nh: [8, -25], fh: [-6, -14], sw: 0.2, head: [1, -2.5], htilt: -0.6, open: 1, lean: -0.05, bob: -1.5, glow: 1.6, waves: 0.2, ring: 0.2, dust: [0.5, 0.5] }) },
  { f: 4, p: P({ nh: [8, -25], fh: [-6, -14], sw: 0.2, head: [1, -2.5], htilt: -0.6, open: 1, bob: -2, glow: 1.6, waves: 0.55, ring: 0.5, dust: [0.7, 0.7] }) },
  { f: 6, p: P({ nh: [6, -20], head: [0, -1], htilt: -0.3, open: 0.6, glow: 1.4, waves: 0.9, ring: 0.85 }) },
  { f: 7, p: P({ glow: 1.1, ring: 1 }) },
], 8);
const slamWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: SLAM_UP }], 4);
const slamHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...SLAM_UP, fh: [6, -16 + 0.5 * TR[i]], glow: [1.4, 1.6, 1.45, 1.6][i], bob: -1 + 0.2 * TR[i] } as Pose));
const slamStrike = (): Pose[] => keyed([
  { f: 0, p: SLAM_UP },
  { f: 1, p: P({ fh: [-2, -14], ha: 3.4, sw: -1.9, lean: 0.25, head: [-2, 1], glow: 1.5 }) },
  { f: 2, p: P({ fh: [-8, 2], ha: 2.9, sw: -0.15, lean: 0.35, head: [-4, 3], bob: 1, squat: 1, legA: [-2, 0], flash: 0.8, shards: 0.3, dust: [0.5, 1], ring: 0.2, glow: 1.6 }) },
  { f: 3, p: P({ fh: [-8, 2], ha: 2.9, sw: -0.15, lean: 0.35, head: [-4, 3], bob: 1, squat: 1, flash: 0.4, shards: 0.6, dust: [0.5, 1], ring: 0.5 }) },
  { f: 4, p: P({ fh: [-7, 1], ha: 2.9, sw: -0.2, lean: 0.32, head: [-3, 2], shards: 0.9, dust: [0.3, 0.7], ring: 0.8 }) },
  { f: 5, p: P({ fh: [-5, 0], ha: 3.0, sw: -0.2, lean: 0.25, ring: 1 }) },
  { f: 7, p: {} },
], 8);
const stunPoses = (): Pose[] => Array.from({ length: 8 }, (_, i) => { const ph = (2 * PI * i) / 8; return { ...REST, lean: 0.25, squat: 1.5, tilt: 0.04 * SIN(ph), head: [-1 + SIN(ph), 3] as [number, number], htilt: 0.15 * SIN(ph + 1), nh: [1, 3] as [number, number], fh: [-2, 4] as [number, number], sw: -0.1 + 0.3 * SIN(ph), legA: [SIN(ph), 0] as [number, number], legB: [-SIN(ph), 0] as [number, number], glow: 0.4 + 0.3 * SIN(ph) } as Pose; });
const deathPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 2, p: P({ lean: 0.3, head: [-2, 2], glow: 0.6, squat: 1 }) },
  { f: 5, p: P({ squat: 5, lean: 0.5, head: [-4, 5], fh: [3, -2], nh: [0, 3], glow: 0.2, legA: [3, 0], tilt: 0.1 }) },
  { f: 8, p: P({ squat: 9, lean: 0.65, tilt: 0.25, sy: 0.9, head: [-5, 8], glow: 0, dust: [1, 1], fh: [4, 2], sw: 0.4 }) },
  { f: 11, p: P({ squat: 11, lean: 0.7, tilt: 0.45, sy: 0.75, head: [-5, 9], glow: 0, dust: [0.5, 0.5], sw: 0.5 }) },
  { f: 13, p: P({ squat: 12, lean: 0.7, tilt: 0.5, sy: 0.65, head: [-5, 9], glow: 0, sw: 0.5 }) },
], 14);

export type MinoAnim = "idle" | "walk" | "attack" | "clawWind" | "clawHold" | "clawStrike" | "rushWind" | "rushHold" | "rushDash" | "rushStrike"
  | "callWind" | "callHold" | "callCast" | "slamWind" | "slamHold" | "slamStrike" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MinoAnim; hit?: number };
const ANIM_ORDER: [MinoAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар кистенём (обычный)", hit: 6 }],
  ["clawWind", { n: 4, fps: 12, loop: false, ru: "замах вправо", next: "clawHold" }],
  ["clawHold", { n: 4, fps: 12, loop: true, ru: "кистень отведён", next: "clawStrike" }],
  ["clawStrike", { n: 12, fps: 12, loop: false, ru: "два удара подряд (Когти)", hit: 3 }],
  ["rushWind", { n: 4, fps: 12, loop: false, ru: "пригнулся, рога вперёд", next: "rushHold" }],
  ["rushHold", { n: 4, fps: 12, loop: true, ru: "копытом бьёт землю", next: "rushDash" }],
  ["rushDash", { n: 4, fps: 12, loop: true, ru: "порыв (таран)", next: "rushStrike" }],
  ["rushStrike", { n: 6, fps: 12, loop: false, ru: "конец порыва, толчок", hit: 1 }],
  ["callWind", { n: 4, fps: 12, loop: false, ru: "вскинул кулак", next: "callHold" }],
  ["callHold", { n: 4, fps: 12, loop: true, ru: "набирает рёв", next: "callCast" }],
  ["callCast", { n: 8, fps: 12, loop: false, ru: "рёв, зов стада", hit: 2 }],
  ["slamWind", { n: 4, fps: 12, loop: false, ru: "кистень над спиной", next: "slamHold" }],
  ["slamHold", { n: 4, fps: 12, loop: true, ru: "кистень вскинут", next: "slamStrike" }],
  ["slamStrike", { n: 8, fps: 12, loop: false, ru: "удар о землю, россыпь", hit: 2 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const MINO_ANIMS = {} as Record<MinoAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { MINO_ANIMS[k] = { ...a, col }; col += a.n; } }
export const MINO_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export const MINO_SKILLS: Record<string, { windup: [MinoAnim, MinoAnim]; strike: MinoAnim }> = {
  claws: { windup: ["clawWind", "clawHold"], strike: "clawStrike" },
  gust: { windup: ["rushWind", "rushHold"], strike: "rushStrike" },
  herd_call: { windup: ["callWind", "callHold"], strike: "callCast" },
  blade_scatter: { windup: ["slamWind", "slamHold"], strike: "slamStrike" },
};
const POSES: Record<MinoAnim, () => Pose[]> = {
  idle: idlePoses, walk: walkPoses, attack: attackPoses, clawWind, clawHold, clawStrike, rushWind, rushHold, rushDash, rushStrike,
  callWind, callHold, callCast, slamWind, slamHold, slamStrike, stun: stunPoses, death: deathPoses,
};
const poseOf = (a: MinoAnim, v: ViewId, i: number): Pose => POSES[a]()[i];

// ---------------- листы ----------------
function cvToPng(c: Cv): PNG { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); return p; }
const savePng = (c: Cv, f: string) => fs.writeFileSync(f, PNG.sync.write(cvToPng(c)));
const loadPng = (p: string) => PNG.sync.read(fs.readFileSync(p));
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-25.png");
  if (!fs.existsSync(f)) return null;
  const p = loadPng(f), x0 = Math.round(p.width * 0.078), x1 = Math.round(p.width * 0.86), y0 = Math.round(p.height * 0.034), y1 = Math.round(p.height * 0.962);
  const sc = (y1 - y0) / h, w = Math.round((x1 - x0) / sc), o = new Cv(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * sc); j < Math.max(Math.floor(y * sc) + 1, Math.floor((y + 1) * sc)); j++) for (let i = Math.floor(x * sc); i < Math.max(Math.floor(x * sc) + 1, Math.floor((x + 1) * sc)); i++) { const q = ((y0 + j) * p.width + x0 + i) * 4; r += p.data[q]; g += p.data[q + 1]; b += p.data[q + 2]; n++; }
    o.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  return o;
}
const blitSub = (dst: Cv, src: Cv, sx: number, sy: number, w: number, h: number, ox: number, oy: number, k = 1) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.has(sx + x, sy + y)) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) dst.set(ox + x * k + a, oy + y * k + b, src.get(sx + x, sy + y));
};
const GROUND = hx("#7d6a52"), PANEL = hx("#322f38"), NIGHT = hx("#161c34");
function nightTint(c: Cv, x: number, y: number, w: number, h: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.has(x + i, y + j)) { const q = c.get(x + i, y + j); c.set(x + i, y + j, [Math.round(q[0] * 0.45), Math.round(q[1] * 0.5), Math.round(q[2] * 0.75)]); } }

export function writeMinoArt(root: string, outDir: string, only?: MinoAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const sheet = new Cv(N * MINO_COLS, FH * 3), glow = new Cv(N * MINO_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = renderFrame(v, p), x0 = (MINO_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      const eh: Record<string, number> = { left: 0, right: 0, top: 0, bottom: 0 };
      const nz = (x: number, y: number) => r.img.has(x, y) && r.img.get(x, y).join() !== OUTL.join();
      for (let k = 0; k < FH; k++) { if (nz(0, k)) eh.left++; if (nz(N - 1, k)) eh.right++; }
      for (let k = 0; k < N; k++) { if (nz(k, 0)) eh.top++; if (nz(k, FH - 1)) eh.bottom++; }
      const hits = eh.left + eh.right + eh.top + eh.bottom;
      if (hits) bad.push(`${a} ${v} кадр ${i + 1}: ${JSON.stringify(eh)}`);
    }));
  }
  savePng(sheet, path.join(outDir, "mino-sheet.png")); savePng(glow, path.join(outDir, "mino-glow.png"));
  // compare: покой ×3 во всех видах рядом с референсом, затем по две анимации в ряд (вбок, выборка кадров ×2, день и ночь у покоя)
  const ref = refCrop(root, 228);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), RW = 1360, rowH = 176;
  const c = new Cv(RW, 330 + 40 + rows * rowH);
  c.rect(0, 0, RW, c.h, hx("#26242b"));
  label(c, 10, 8, "ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 25", 2);
  const idle = (row: number, flipIt = false): Cv => { const f = new Cv(N, FH); blitSub(f, sheet, 0, row * FH, N, FH, 0, 0); return flipIt ? flip(f) : f; };
  [idle(0), idle(1), idle(2), idle(2, true)].forEach((f, i) => { c.rect(10 + i * 244, 30, 240, 240, GROUND); c.blit(f, 10 + i * 244, 30, 3); });
  c.rect(10, 280, 4 * 244 - 4, 42, GROUND);
  [idle(0), idle(1), idle(2), idle(2, true)].forEach((f, i) => { c.blit(f, 10 + i * 244 + 80, 282, 0 + 1); });
  if (ref) { c.rect(1000, 30, ref.w + 8, 240, PANEL); c.blit(ref, 1004, 34, 1); }
  const y0 = 340;
  const nightIdle = new Cv(N, FH); blitSub(nightIdle, sheet, 0, 2 * FH, N, FH, 0, 0);
  c.rect(1000 + 0, 280, 340, 42, NIGHT); c.blit(nightIdle, 1000, 282, 1); nightTint(c, 1000, 282, N, FH);
  blitSub(c, glow, 0, 2 * FH, N, FH, 1000, 282, 1);
  shown.forEach(([a, d], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2), ox = 10 + col * 680, oy = y0 + row * rowH;
    c.rect(ox, oy, 670, rowH - 6, PANEL);
    label(c, ox + 4, oy + 3, `${a} ${MINO_ANIMS[a].ru}`.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx = ox + 4 + k * 166;
      c.rect(fx, oy + 18, 162, 150, GROUND);
      blitSub(c, sheet, (MINO_ANIMS[a].col + fi) * N, 2 * FH, N, FH, fx + 1, oy + 18 - 5, 2);
    }
  });
  savePng(c, path.join(outDir, "r65n-w-compare.png"));
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${MINO_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return [path.join(outDir, "mino-sheet.png"), path.join(outDir, "mino-glow.png"), path.join(outDir, "r65n-w-compare.png")];
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/cliff_minotaur_knight.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? (onlyArg.slice(7).split(",") as MinoAnim[]) : undefined;
  const files = writeMinoArt(root, path.join(root, "tools", "out", "bosses139"), only, process.argv.includes("--quick"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void poseOf; void OUTL; void SIL; void ({} as C);
