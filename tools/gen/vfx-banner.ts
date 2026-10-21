/** Штандарт «Знамя защиты» (tp_banner, задача 127, шаг 4): большое знамя на высоком древке, колышется на ветру, кольцо ауры радиуса баффа и пыль установки.
 *  Две фракции по caster: Сольгард — тёмно-синее полотнище, золотая кайма и золотое солнце; Умбрат — чёрно-фиолетовое полотнище, фиолетовая кайма, зелёное око.
 *  Холст 48×88, основание древка в точке привязки (0.5, 0.955); 10 кадров цикла, 9 fps. Палитра — tools/gen/palette.ts (P), золото как --gold.
 *  Ветер: полотнище нарисовано плоско (кайма, внутренняя линия, эмблема, фигурный низ — ласточкин хвост), затем каждый кадр искажается: строки сдвигаются
 *  по горизонтали (сильнее к низу), столбцы по вертикали (волна вдоль ширины); светотень складок бежит вместе с волной; ленты и кисти отстают по фазе.
 *  Запуск отдельно: tsx tools/gen/vfx-banner.ts — tools/out/vfx-preview/banner-raw.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, OUTLINE, rng, shade, hex, type RGBA } from "./canvas";
import { P } from "./palette";
import { storyboard, stackV } from "./vfx-lib";
import type { Gen } from "./vfx-gen";

const TAU = Math.PI * 2;
const W = 48, H = 88, CX = 24, BASE_Y = 84, N = 10;
const CW = 32, CH = 46, X0 = CX - CW / 2, Y0 = 19; // полотнище: размер плоской текстуры и положение под перекладиной
const put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);

interface Fac {
  field: [RGBA, RGBA, RGBA];     // полотнище: тень, тон, свет
  trim: [RGBA, RGBA, RGBA];      // кайма
  mark: [RGBA, RGBA, RGBA];      // эмблема
  ribA: [RGBA, RGBA]; ribB: [RGBA, RGBA];
  ring: RGBA[];
}
const FAC: Record<"solgard" | "umbrath", Fac> = {
  solgard: {
    field: [hex("#16243e"), hex("#24407a"), hex("#3a62a8")],
    trim: [P.gold[1], P.gold[3], P.gold[4]],
    mark: [P.gold[2], P.gold[3], P.gold[4]],
    ribA: [hex("#24407a"), hex("#3a62a8")], ribB: [hex("#a8a2b0"), hex("#e8e4ee")],
    ring: [P.gold[0], P.gold[1], P.gold[2], P.gold[3], P.gold[4]],
  },
  umbrath: {
    field: [hex("#100a1a"), hex("#22163a"), hex("#382858")],
    trim: [P.cloth.purple[2], P.cloth.purple[3], hex("#d0b4f0")],
    mark: [P.magic.green[1], P.magic.green[2], P.magic.green[3]],
    ribA: [hex("#46265e"), hex("#6a3c8a")], ribB: [P.magic.green[1], P.magic.green[2]],
    ring: [hex("#2a1846"), hex("#5a34a0"), hex("#8a5ce0"), hex("#b890ff"), hex("#e0ccff")],
  },
};

/** Плоская текстура полотнища: фигурный низ (ласточкин хвост), кайма, внутренняя линия, эмблема. Возвращает цвета и маску. */
function clothTexture(fac: "solgard" | "umbrath") {
  const F = FAC[fac], tex = new PC(CW, CH), mask: boolean[][] = Array.from({ length: CH }, () => Array(CW).fill(false));
  const bottom = (x: number) => CH - 1 - Math.round(11 * (1 - Math.abs((2 * x) / (CW - 1) - 1)));   // граница снизу: V-вырез
  for (let x = 0; x < CW; x++) for (let y = 0; y <= bottom(x); y++) mask[y][x] = true;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < CW && y < CH && mask[y][x];
  // расстояние до края (манхэттенское по 4 соседям, до 5)
  const dist = (x: number, y: number) => { for (let d = 1; d <= 5; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (!inside(x + dx, y + dy)) return d; return 9; };
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (!mask[y][x]) continue;
    const d = dist(x, y);
    let c: RGBA = (x + y) % 9 === 0 && d > 5 ? F.field[2] : F.field[1];
    if (d <= 2 || y < 3) c = d === 1 || y === 0 ? F.trim[1] : F.trim[0];            // кайма: 2 px по краю и 3 px сверху
    else if (d === 4) c = F.trim[0];                                                 // внутренняя линия
    tex.set(x, y, c);
  }
  // эмблема
  const ex = CW / 2, ey = 19;
  if (fac === "solgard") {
    // солнце: диск с бликом, 12 лучей (длинные и короткие через один)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU - Math.PI / 2, len = k % 2 === 0 ? 5 : 3, r1 = 6.2, px = -Math.sin(a), py = Math.cos(a);
      tex.poly([[ex + Math.cos(a) * r1 + px * 1.3, ey + Math.sin(a) * r1 + py * 1.3], [ex + Math.cos(a) * r1 - px * 1.3, ey + Math.sin(a) * r1 - py * 1.3], [ex + Math.cos(a) * (r1 + len), ey + Math.sin(a) * (r1 + len)]], F.mark[k % 2 ? 0 : 1]);
    }
    tex.ellipse(ex, ey, 5.2, 5.2, F.mark[0]); tex.ellipse(ex, ey, 4.2, 4.2, F.mark[1]);
    tex.ellipse(ex - 1, ey - 1, 2, 2, F.mark[2]);
  } else {
    // око: миндалевидный контур, радужка, зрачок, блик и три луча сверху
    for (let x = -9; x <= 9; x++) {
      const h = 4.6 * Math.pow(1 - (x / 9.4) ** 2, 0.7);
      for (let y = -Math.ceil(h); y <= Math.ceil(h); y++) if (Math.abs(y) <= h) put(tex, ex + x, ey + y, Math.abs(y) >= h - 1 ? F.mark[0] : F.field[0]);
      put(tex, ex + x, ey - Math.round(h) - 1, F.mark[1]); put(tex, ex + x, ey + Math.round(h) + 1, F.mark[0]);
    }
    tex.ellipse(ex, ey, 3.7, 3.7, F.mark[1]); tex.ellipse(ex, ey, 1.9, 1.9, F.field[0]); put(tex, ex - 1.5, ey - 1.5, F.mark[2]);
    for (const dx of [-6, 0, 6]) { tex.line(ex + dx, ey - 8, ex + dx * 1.4, ey - 12, F.mark[1], 1); }
    for (const dx of [-4, 4]) put(tex, ex + dx, ey + 9, F.mark[0]);
  }
  return { tex, mask, bottom };
}

/** Один кадр знамени (t — кадр цикла). */
function bannerFrame(fac: "solgard" | "umbrath", t: number, cloth: ReturnType<typeof clothTexture>): PC {
  const F = FAC[fac], f = new PC(W, H), phi = (t / N) * TAU;
  const wood = P.wood, stone = P.stone, gold = P.gold;
  // ----- древко и каменное основание
  for (let y = 18; y <= BASE_Y - 4; y++) { put(f, CX - 1, y, wood[1]); put(f, CX, y, wood[2]); put(f, CX + 1, y, wood[3]); }
  for (const y of [70, 76]) for (let x = -1; x <= 1; x++) put(f, CX + x, y, x === 1 ? gold[3] : gold[1]);
  f.ellipse(CX, BASE_Y, 11, 3.4, hex("#10101a"));                                    // тень на земле
  for (let y = BASE_Y - 7; y <= BASE_Y; y++) { const half = 4 + Math.round((y - (BASE_Y - 7)) * 0.55); for (let x = -half; x <= half; x++) put(f, CX + x, y, x < -half + 2 ? stone[1] : x > half - 2 ? stone[4] : y === BASE_Y - 7 ? stone[4] : stone[3]); }
  for (let x = -5; x <= 5; x++) put(f, CX + x, BASE_Y, stone[0]);
  // ----- ленты под полотнищем (отстают по фазе)
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const c = i ? F.ribB : F.ribA, x0 = CX + (side < 0 ? -5 : 2);
    for (let y = 50; y <= 75; y++) {
      const k = (y - 50) / 25, dx = Math.round(2.2 * k * k * Math.sin(phi - 1.1 - k * 2.4 - i * 0.7)), end = 75 - (y > 72 ? Math.abs(1 - (x0 % 2)) : 0);
      for (let x = 0; x < 3; x++) if (y <= end - Math.round(Math.abs(x - 1) * 1.5)) put(f, x0 + x + dx, y, x === 2 ? c[1] : c[0]);
    }
  }
  // ----- полотнище с ветром
  const L = new PC(W, H);
  for (let Y = Y0; Y < Y0 + CH + 6; Y++) for (let X = X0 - 6; X < X0 + CW + 6; X++) {
    const v = Math.max(0, Math.min(1.15, (Y - Y0) / CH));
    const dxs = 3.4 * Math.pow(v, 1.3) * Math.sin(phi - v * 3.2 + 0.4);                       // строки уходят вбок сильнее к низу
    const u = (X - X0 - dxs) / CW;
    const dyc = 3.2 * v * Math.sin(phi - u * 7.0);                                           // волна вдоль ширины (низ колышется)
    const sx = Math.floor(X - X0 - dxs), sy = Math.floor(Y - Y0 - dyc);
    if (sx < 0 || sy < 0 || sx >= CW || sy >= CH || !cloth.mask[sy][sx]) continue;
    const c = cloth.tex.get(sx, sy)!;
    const fold = Math.sin(phi - u * 8.5 + v * 1.2);                                          // светотень складок бежит вместе с волной
    L.set(X, Y, fold < -0.45 ? shade(c, 0.72) : fold > 0.5 ? shade(c, 1.16) : c);
  }
  L.outline(OUTLINE);
  f.blit(L, 0, 0);
  // ----- кисти на нижних углах (золотые шнурки, отстают)
  for (const [i, bx] of [[0, X0 + 1], [1, X0 + CW - 2]] as const) {
    const by = Y0 + cloth.bottom(i ? CW - 1 : 0) + 2;
    for (let k = 0; k < 5; k++) put(f, bx + Math.round(0.8 * Math.sin(phi - 1.8 - k * 0.5 + i)), by + k, k % 2 ? gold[2] : gold[3]);
    for (let s = -1; s <= 1; s++) for (let k = 0; k < 4; k++) put(f, bx + s + Math.round(1.2 * Math.sin(phi - 2.2 - k * 0.4 + i + s)), by + 5 + k, gold[k < 2 ? 3 : 1]);
  }
  // ----- перекладина с золотыми набалдашниками, кольца и навершие
  for (let x = 4; x <= W - 5; x++) { put(f, x, 14, wood[3]); put(f, x, 15, wood[2]); put(f, x, 16, wood[1]); put(f, x, 17, wood[0]); }
  for (const ex of [2, W - 4]) { f.ellipse(ex + 1, 15.5, 2.6, 3.4, gold[1]); f.ellipse(ex + 0.6, 14.8, 1.6, 2.2, gold[3]); put(f, ex, 14, gold[4]); }
  for (const rx of [X0 + 3, X0 + 11, X0 + CW - 12, X0 + CW - 4]) { put(f, rx, 18, gold[3]); put(f, rx + 1, 18, gold[2]); put(f, rx, 19, gold[2]); put(f, rx + 1, 19, gold[1]); }
  f.poly([[CX - 2, 13], [CX + 2, 13], [CX + 1, 6], [CX, 3], [CX - 1, 6]], gold[2]); f.line(CX, 4, CX, 12, gold[4], 1); put(f, CX - 1, 8, gold[3]);
  f.ellipse(CX, 13.5, 3, 1.6, gold[1]);
  f.outline(OUTLINE);
  return f;
}

function banner(fac: "solgard" | "umbrath"): Gen {
  const cloth = clothTexture(fac);
  const frames = Array.from({ length: N }, (_, t) => bannerFrame(fac, t, cloth));
  return { id: `banner-${fac}`, pack: "gen", role: "aura", frames, w: W, h: H, anchor: [0.5, BASE_Y / H], fps: 9, blend: "normal", hero: "warrior" };
}

/** Кольцо ауры под знаменем: эллипс 0.7, мягкое мерцание, ползущие засечки; D — диаметр (2r умения, 130 → 260). 8 кадров цикла. */
function bannerRing(fac: "solgard" | "umbrath", D = 260): Gen {
  const R = FAC[fac].ring, rx = D / 2, ry = Math.round(rx * 0.7), w = D + 4, h = ry * 2 + 4, cx = w / 2, cy = h / 2, n = 8, r = rng(77);
  const dots = Array.from({ length: 90 }, () => ({ a: r() * TAU, d: Math.sqrt(r()), ph: r() }));
  const frames = Array.from({ length: n }, (_, t) => {
    const f = new PC(w, h), glow = 0.5 + 0.5 * Math.sin((t / n) * TAU);
    const steps = Math.round(rx * 7);
    for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU, c = Math.cos(a), s = Math.sin(a); put(f, cx + c * rx, cy + s * ry, R[glow > 0.5 ? 3 : 2]); put(f, cx + c * (rx - 1.5), cy + s * (ry - 1), R[1]); put(f, cx + c * (rx - 3.5), cy + s * (ry - 2.5), R[0]); }
    for (let k = 0; k < 28; k++) { const a = ((k + t / n) / 28) * TAU; for (let q = 0; q < 4; q++) put(f, cx + Math.cos(a) * (rx - 5 - q * 0.7), cy + Math.sin(a) * (ry - 3.5 - q * 0.5), k % 2 ? R[3] : R[4]); }
    for (const d of dots) { const on = ((d.ph + t / n) % 1) < 0.35; if (on) put(f, cx + Math.cos(d.a) * d.d * (rx - 8), cy + Math.sin(d.a) * d.d * (ry - 6), R[2]); }
    return f;
  });
  return { id: `banner-ring-${fac}`, pack: "gen", role: "aoe", frames, w, h, anchor: [0.5, 0.5], fps: 8, blend: "normal", hero: "warrior" };
}

/** Пыль у основания при установке: два облачка расходятся и тают. 6 кадров, один проход. */
function dustPuff(): Gen {
  const w = 44, h = 18, n = 6, c1 = hex("#d8c8a0"), c2 = hex("#a89870"), c3 = hex("#7a6c50");
  const frames = Array.from({ length: n }, (_, t) => {
    const f = new PC(w, h), k = t / (n - 1);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = w / 2 + side * (4 + k * 15 + i * 2.5), y = h - 5 - k * 5 - (i % 2) * 2, rr = Math.max(0.6, (2.6 - i * 0.4) * (1 - k * 0.55));
      f.ellipse(x, y + 0.7, rr + 0.6, rr * 0.8, c3); f.ellipse(x, y, rr, rr * 0.8, i % 2 ? c2 : c1);
    }
    if (t >= n - 2) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x * 3 + y * 5 + t) % 3 === 0) f.clear(x, y);
    return f;
  });
  return { id: "dust-puff", pack: "gen", role: "hit", frames, w, h, anchor: [0.5, 0.78], fps: 14, blend: "normal", hero: "warrior" };
}

export function GENERATED_BANNER(): Gen[] {
  return [banner("solgard"), banner("umbrath"), bannerRing("solgard"), bannerRing("umbrath"), dustPuff()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/banner-raw.png");
  stackV(GENERATED_BANNER().filter((g) => g.id.startsWith("banner-s") || g.id.startsWith("banner-u") || g.id === "dust-puff").map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
}
