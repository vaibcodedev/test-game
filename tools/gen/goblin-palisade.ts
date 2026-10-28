/** Частокол лагеря гоблинов (v_basic_palisade_5/2/1): заострённые брёвна с корой, сучками, перевязью (A — верёвка и череп, B — перекладина и гвозди).
 *  Свет сверху слева, тень вправо-вниз, опора — низ. Заменяет вырезку из пака Basic (плоские доски). */
import { PC, OUTLINE, hex, hash01, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";

const W: Ramp = P.wood;
const HEMP: Ramp = [hex("#3a2d1a"), hex("#5e4a2a"), hex("#8c7444"), hex("#b8a066")];
const BONE: Ramp = [hex("#6e6656"), hex("#a49c88"), hex("#d2cab4"), hex("#ece6d2")];
const RAG: Ramp = [hex("#4a1814"), hex("#7a2a1e"), hex("#a8402a")];
const LOGW = 11;

/** Одно бревно: x0 — левый край, top/bot — верх острия и низ (в земле). */
function logPost(pc: PC, x0: number, top: number, bot: number, seed: number, tipDx: number) {
  const tipY = top, shoulder = top + 9;
  const apexX = x0 + Math.round(LOGW / 2) + tipDx;
  // острие: левая грань светлая, правая тёмная, на срезе блик
  pc.poly([[x0, shoulder], [apexX, tipY], [x0 + LOGW, shoulder + 1]], (x, y) => {
    const side = x < apexX ? 3 : 1;
    return W[Math.max(0, side - (y > shoulder - 2 ? 0 : 0))];
  });
  pc.line(apexX, tipY, x0, shoulder, W[3]); pc.line(apexX, tipY, x0 + LOGW - 1, shoulder, W[0]);
  pc.set(apexX, tipY + 1, hex("#d8b27a")); pc.set(apexX - 1, tipY + 3, hex("#c89a62"));
  // ствол
  for (let y = shoulder; y < bot; y++) for (let x = x0; x < x0 + LOGW; x++) {
    const u = (x - x0) / (LOGW - 1);
    let t = u < 0.2 ? 3 : u < 0.5 ? 2 : u < 0.82 ? 1 : 0;
    // волокна: вертикальные полосы разной длины
    const g = hash01(x, Math.floor((y + seed * 7) / 5), seed);
    if (g < 0.2 && t > 0) t--; else if (g > 0.9 && t < 3) t++;
    // кора: короткие горизонтальные трещины
    if (hash01(x >> 1, y, seed + 3) < 0.05) t = Math.max(0, t - 1);
    pc.set(x, y, W[t]);
  }
  // сучок
  const ky = shoulder + 8 + Math.floor(hash01(seed, 1, 5) * (bot - shoulder - 26)), kx = x0 + 3 + Math.floor(hash01(seed, 2, 5) * 3);
  pc.rect(kx, ky, 3, 3, W[0]); pc.rect(kx, ky, 3, 1, W[1]); pc.set(kx + 1, ky + 1, hex("#1e130c"));
  // скол у острия
  pc.rect(x0 + 1, shoulder + 2, 1, 4, W[3]);
}

function build(n: number, variant: "a" | "b"): PC {
  const cw = n === 5 ? 64 : 32, H = 64, pc = new PC(cw, H);
  const total = n * LOGW + (n - 1) * 0, x00 = Math.round((cw - total) / 2) - (n === 1 ? 0 : 0);
  const base = H - 6;
  // тень вправо-вниз и бугор земли
  pc.ellipse(x00 + total / 2 + 3, base + 2, total / 2 + 5, 4, [0, 0, 0, 70]);
  const tops = [14, 10, 6, 12, 8].slice(0, n).map((t, i) => (n === 5 ? t : [12, 8][i] ?? 10));
  const orderTop = n === 5 ? [13, 9, 5, 11, 7] : n === 2 ? [11, 7] : [9];
  const tipDx = [-1, 1, 0, -1, 1];
  for (let i = 0; i < n; i++) logPost(pc, x00 + i * LOGW, orderTop[i] ?? tops[i], base + 1 - (i % 2), 11 + i * 5 + n, tipDx[i]);
  const xl = x00, xr = x00 + total;
  const bands = [orderTop[0] + 22, base - 14];
  if (variant === "a") {
    for (const by of bands) {
      pc.rect(xl, by, total, 3, HEMP[2]); pc.rect(xl, by, total, 1, HEMP[3]); pc.rect(xl, by + 2, total, 1, HEMP[0]);
      for (let x = xl + 1; x < xr; x += 3) { pc.set(x, by + 1, HEMP[1]); pc.set(x + 1, by, HEMP[1]); }
      // косые витки и свисающий конец
      for (let i = 0; i < n; i++) { const c = x00 + i * LOGW; pc.line(c + 2, by - 2, c + 8, by + 4, HEMP[1]); }
      pc.line(xr - 3, by + 3, xr - 3, by + 8, HEMP[2]); pc.line(xr - 2, by + 3, xr - 2, by + 7, HEMP[1]);
    }
    if (n >= 3) { // череп на среднем бревне
      const cx = x00 + 2 * LOGW + 3, cy = orderTop[2] + 12;
      pc.rect(cx, cy, 6, 5, BONE[2]); pc.rect(cx, cy, 6, 1, BONE[3]); pc.rect(cx, cy + 1, 1, 3, BONE[3]); pc.rect(cx + 5, cy + 1, 1, 4, BONE[1]);
      pc.rect(cx + 1, cy + 5, 4, 1, BONE[1]); pc.rect(cx + 1, cy + 2, 2, 2, OUTLINE); pc.rect(cx + 4, cy + 2, 1, 2, OUTLINE); pc.set(cx + 2, cy + 5, OUTLINE); pc.set(cx + 4, cy + 5, OUTLINE);
    } else { // клок красной тряпки
      const cx = xr - 4, cy = orderTop[0] + 14;
      pc.rect(cx, cy, 3, 6, RAG[1]); pc.rect(cx, cy, 1, 6, RAG[2]); pc.rect(cx + 1, cy + 6, 2, 3, RAG[0]);
    }
  } else {
    // поперечная перекладина-доска с гвоздями и косой раскос
    const by = bands[0] + 1, by2 = bands[1];
    const beam = (y: number, h: number, seed: number) => {
      for (let y2 = y; y2 < y + h; y2++) for (let x = xl - 2; x < xr + 2; x++) {
        let t = y2 === y ? 3 : y2 === y + h - 1 ? 0 : y2 < y + h / 2 ? 2 : 1;
        if (hash01(x >> 2, y2, seed) < 0.18 && t > 0) t--;
        pc.set(x, y2, W[t]);
      }
      pc.rect(xl - 2, y, 1, h, W[3]); pc.rect(xr + 1, y, 1, h, W[0]);
      pc.rect(xl - 2, y + h, xr - xl + 4, 1, [0, 0, 0, 70]);
    };
    beam(by, 5, 4); beam(by2, 5, 9);
    for (const y of [by + 1, by2 + 1]) for (let i = 0; i < n; i++) { const nx = x00 + i * LOGW + 4; pc.rect(nx, y, 2, 2, P.steel[3]); pc.set(nx, y, P.steel[4]); pc.set(nx + 1, y + 1, P.darkSteel[2]); }
    // косой раскос между перекладинами
    for (let k = 0; k < by2 - by - 5; k++) { const x = xl + 3 + Math.round(k * (total - 8) / (by2 - by - 5)); pc.rect(x, by + 5 + k, 3, 1, W[2]); pc.set(x, by + 5 + k, W[3]); pc.set(x + 2, by + 5 + k, W[0]); }
    // трофейный клык-обломок и тряпка на острие
    if (n >= 3) { const cx = x00 + 4 * LOGW + 8, cy = orderTop[4] + 8; pc.rect(cx, cy, 2, 7, RAG[1]); pc.rect(cx, cy, 1, 7, RAG[2]); pc.rect(cx + 1, cy + 6, 1, 3, RAG[0]); }
  }
  // земля у основания: бугорок и камешки
  for (let x = xl - 2; x < xr + 3; x++) { const h = hash01(x, 3, 77) < 0.5 ? 2 : 3; pc.rect(x, base + 1, 1, h, x < xl + total / 2 ? P.dirt[2] : P.dirt[1]); }
  pc.rect(xl - 1, base + 1, total + 2, 1, P.dirt[3]);
  return pc.outline();
}

export const GOBLIN_PALISADE: Record<"a" | "b", Record<string, () => PC>> = {
  a: { v_basic_palisade_5: () => build(5, "a"), v_basic_palisade_2: () => build(2, "a"), v_basic_palisade_1: () => build(1, "a") },
  b: { v_basic_palisade_5: () => build(5, "b"), v_basic_palisade_2: () => build(2, "b"), v_basic_palisade_1: () => build(1, "b") },
};

/** Для OBJECT_ART: вариант A — прежние имена, B — с суффиксом _b (вариант выбирается по лагерю в shared/map.ts). */
export const GOBLIN_PALISADE_ART: Record<string, () => PC> = {
  ...GOBLIN_PALISADE.a,
  ...Object.fromEntries(Object.entries(GOBLIN_PALISADE.b).map(([k, v]) => [k + "_b", v])),
};
