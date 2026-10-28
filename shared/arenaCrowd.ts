/** Зрители арены: палитры тем и рисунок фигурки 7×9 (общий для генератора tools/gen/arena-art.ts и клиента game/arenaCrowd.ts). */
export type RGBA = [number, number, number, number];
export interface Sink { rect(x: number, y: number, w: number, h: number, c: RGBA): void; set(x: number, y: number, c: RGBA): void }

const h = (s: string): RGBA => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const R = (...s: string[]) => s.map(h);
const shade = (c: RGBA, k: number): RGBA => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), c[3]];

export const ARENA_IDS = ["ash", "sun", "pit", "frost"] as const;
export type ArenaId = (typeof ARENA_IDS)[number];

export interface CrowdLook { shirts: RGBA[]; flags: RGBA[]; confetti: RGBA; fur: boolean }
export const CROWD_LOOK: Record<ArenaId, CrowdLook> = {
  ash: { shirts: R("#7a2026", "#a8262c", "#4a4452", "#2c2833", "#8a6a3a", "#5a3a2a", "#6a1a2a", "#3a3a44", "#b4552e", "#262230"), flags: R("#c8302e", "#e8a23a", "#c8302e"), confetti: h("#e8a23a"), fur: false },
  sun: { shirts: R("#f2efe6", "#e8e2d0", "#3a6ac0", "#f0cc5a", "#c8d6ee", "#e8b0a0", "#7aa0d8", "#fff8e0", "#9ab87a", "#d89a4a"), flags: R("#2f5fb0", "#f0cc5a", "#f2efe6"), confetti: h("#f0cc5a"), fur: false },
  pit: { shirts: R("#6a4a2a", "#8a5a30", "#4a5a3a", "#7a3a2a", "#5a5a5a", "#a0783a", "#3a4a5a", "#8a2a2a", "#6a6a4a", "#4a3a2a"), flags: R("#a8402a", "#e8a23a", "#6a8a3a"), confetti: h("#e8a23a"), fur: false },
  frost: { shirts: R("#5a4a3a", "#7a6a58", "#3a4a5a", "#8a3a3a", "#c8c0b0", "#4a5a6a", "#6a5040", "#a89a86", "#2e3a48", "#6a7a8a"), flags: R("#5aa0d8", "#e8f0ff", "#c8402e"), confetti: h("#bfe6ff"), fur: true },
};
export const SKIN = R("#f0c8a0", "#d8a478", "#a8744c", "#7a4e32");
export const HAIR = R("#1c1410", "#4a3020", "#c8a050", "#9a9a9a", "#8a3a20");
/** Типов зрителей на тему: рубашка × кожа × волосы × шапка кодируются числом 0..CROWD_TYPES−1. */
export const CROWD_TYPES = 24;
export interface Look { shirt: number; skin: number; hair: number; hat: number; flag: number }
export function lookOfType(t: number): Look { return { shirt: t % 10, skin: Math.floor(t / 10) % 4 + (t % 7 === 0 ? 1 : 0), hair: (t * 3) % 5, hat: t % 4 === 0 ? 1 : 0, flag: t % 3 }; }

/** Позы: 0 сидит, 1 стоит, 2 руки вверх, 3 флажок (кадр A), 4 флажок (кадр B), 5 подброшенная шапка. */
export const POSES = 6;
/** Фигурка в ногах (x, y): рисуется в ячейке 11×15, ноги в (5, 13). */
export function drawSpectator(pc: Sink, x: number, y: number, look: Look, id: ArenaId, pose: number, lift = 0) {
  const cl = CROWD_LOOK[id], sh = cl.shirts[look.shirt % cl.shirts.length], dark = shade(sh, 0.7), skin = SKIN[look.skin % 4], hair = HAIR[look.hair % 5];
  const up = pose === 0 ? 0 : 2, bodyTop = y - 5 - up;
  pc.rect(x - 2, bodyTop, 5, pose === 0 ? 3 : 4, sh);
  pc.rect(x - 2, bodyTop + (pose === 0 ? 2 : 3), 5, 1, dark);
  if (pose !== 0) { pc.set(x - 1, y - 1, dark); pc.set(x + 1, y - 1, dark); }
  if (cl.fur) pc.rect(x - 2, bodyTop - 1, 5, 1, [235, 232, 224, 255]); // меховой воротник
  const hy = bodyTop - 3;
  pc.rect(x - 1, hy, 3, 3, skin);
  if (pose === 5) pc.rect(x - 1, hy, 3, 1, hair);
  else if (look.hat === 1) pc.rect(x - 2, hy - (cl.fur ? 1 : 0), 5, cl.fur ? 2 : 1, cl.fur ? [214, 206, 192, 255] : shade(sh, 1.25));
  else pc.rect(x - 1, hy, 3, 1, hair);
  if (pose >= 2) { pc.rect(x - 3, hy, 1, 4, skin); pc.rect(x + 3, hy, 1, 4, skin); }
  if (pose === 3 || pose === 4) {
    const f = cl.flags[look.flag % cl.flags.length], sw = pose === 4 ? 1 : 0;
    pc.rect(x + 3, hy - 3, 1, 4, [58, 42, 26, 255]); pc.rect(x + 4, hy - 3 + sw, 3, 2, f); pc.set(x + 4, hy - 3 + sw, shade(f, 1.3));
  }
  if (pose === 5) {
    const c = cl.flags[(look.flag + 1) % cl.flags.length];
    pc.rect(x - 2, hy - 4 - lift, 3, 1, c); pc.set(x - 1, hy - 5 - lift, shade(c, 1.3));
    pc.set(x + 4, hy - 6 - (lift >> 1), cl.confetti); pc.set(x - 4, hy - 5 - lift, shade(cl.confetti, 1.2));
  }
}
