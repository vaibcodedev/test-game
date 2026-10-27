/**
 * Павшие боевые кони Полей из настоящей модели боевого коня (tools/gen/mounts/war_horse.ts, поза warHorseDead): корпус на боку, ноги вытянуты вдоль земли
 * или подогнуты, шея и голова лежат; броня, попона с гербом, седло и стремена — как у живого коня своей фракции (Сольгард, Умбрат).
 * Кадр берётся видом «вбок» камеры маунтов, сверху — контактная тень (shadow.ts), кровь, стрелы и дышло; всадника нет.
 */
import fs from "node:fs";
import { PC, hex, type RGBA } from "./canvas";
import { renderMount, setTilt, TILT, type Fac } from "./mounts/lib";
import { warHorseDead, type DeadOpt } from "./mounts/war_horse";
import { shadowDisc } from "./shadow";
import { frame32 } from "./volume-lib";

/** Кадр коня по позе: обрезка по содержимому. */
export function deadHorseFrame(fac: Fac, o: DeadOpt, view: "side" | "left" = "side", tilt = 0.95): PC {
  const spec = warHorseDead(fac, o);
  setTilt(tilt);
  try { return renderMount(spec, { anim: "idle", i: 0, n: 24 }, view).back; } finally { setTilt(TILT); }
}
function crop(pc: PC): PC {
  let x0 = pc.w, y0 = pc.h, x1 = -1, y1 = -1;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const o = new PC(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, pc.get(x0 + x, y0 + y)!);
  return o;
}
const WOODC = [hex("#3a2216"), hex("#5e3a22"), hex("#8a5a34"), hex("#b07e4c")];
const BLOOD: RGBA = [86, 18, 24, 215];
interface V { view: "side" | "left"; o: DeadOpt; ex?: "arrows" | "shaft" }
const VARS: V[] = [
  { view: "side", o: { roll: 1.45, legs: "stretch", neck: "flat", bob: -14 } },
  { view: "left", o: { roll: 1.45, legs: "fold", neck: "flat", tail: -0.5, bob: -14 } },
  { view: "side", o: { roll: 1.4, legs: "stretch", neck: "back", tail: 0.9, bob: -14 } },
  { view: "left", o: { roll: 1.5, legs: "stretch", neck: "flat", bob: -14.5 }, ex: "arrows" },
  { view: "side", o: { roll: 1.45, legs: "fold", neck: "lift", bob: -14 }, ex: "shaft" },
];
/** Павший боевой конь: v 0..4 (на боку; зеркально, ноги подогнуты; голова запрокинута; со стрелами и кровью; со сломанным дышлом). */
export function deadHorse(fac: Fac, v: number): PC {
  const V = VARS[v], raw = crop(deadHorseFrame(fac, V.o, V.view));
  const M = 12, pc = new PC(raw.w + M * 2, raw.h + 14);
  const cx = M + raw.w / 2, bot = 6 + raw.h;
  pc.ellipse(cx + 2, bot - 5, raw.w * 0.5, 8, [10, 6, 18, 120]); pc.ellipse(cx + 1, bot - 6, raw.w * 0.42, 6, [10, 6, 18, 150]);
  shadowDisc(pc, cx, bot - 4, raw.w * 0.46, 5.5, 28);
  if (V.ex === "arrows") { pc.ellipse(cx, bot - 5, raw.w * 0.4, 4.5, BLOOD); pc.ellipse(cx - 3, bot - 5, raw.w * 0.26, 3, [64, 12, 18, 215]); }
  pc.blit(raw, M, 6);
  if (V.ex === "arrows") {
    for (const [fx, len, lean] of [[0.3, 15, -0.35], [0.5, 17, 0.1], [0.7, 14, 0.4]] as const) {
      const x = M + raw.w * fx, y = 6 + raw.h * 0.42, x1 = x + lean * len, y1 = y - len;
      pc.line(x, y, x1, y1, WOODC[2], 1.5); pc.line(x - 0.4, y - 0.4, x1 - 0.4, y1 - 0.4, WOODC[3], 1);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1]] as const) pc.set(Math.round(x1) + dx, Math.round(y1) + dy, [226, 218, 200, 255]);
      pc.set(Math.round(x), Math.round(y), BLOOD); pc.set(Math.round(x) + 1, Math.round(y) + 1, BLOOD);
    }
  }
  if (V.ex === "shaft") {
    const x0 = M + raw.w * 0.12, y0 = 6 + raw.h * 0.92, x1 = M + raw.w * 0.8, y1 = 6 + raw.h * 0.3;
    pc.line(x0, y0 + 1, x1, y1 + 1, WOODC[0], 3.4); pc.line(x0, y0, x1, y1, WOODC[2], 3); pc.line(x0, y0 - 1, x1, y1 - 1, WOODC[3], 1);
    for (const [dx, dy] of [[-2, 0], [-1, 2], [0, -2], [-3, 1]] as const) pc.line(x0 + dx, y0 + dy, x0 + dx - 2, y0 + dy + 2, WOODC[1], 1.2); // расщеплённый конец
    for (const t of [0.3, 0.55]) { const sx = x0 + (x1 - x0) * t, sy = y0 + (y1 - y0) * t; pc.line(sx, sy - 2, sx + 1, sy + 3, [58, 36, 22, 255], 1); } // ремни упряжи
  }
  return frame32(pc);
}
void fs;
