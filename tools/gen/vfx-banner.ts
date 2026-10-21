/** Штандарт «Знамя защиты» (tp_banner, задача 127, шаг 4): большое знамя на высоком древке, колышется на ветру, кольцо ауры радиуса баффа и пыль установки.
 *  Символика по data/factions.json. Сольгард («Восходящее солнце над щитом»): полотнище слоновой кости с широкой золотой каймой, золотое восходящее солнце над
 *  небесно-голубым щитом с золотым ободом, золотые кисти и ленты, навершие — золотой солнечный диск. Умбрат («Чёрная корона с черепом»): чёрно-фиолетовое полотнище,
 *  фиолетовая кайма, чёрная корона над костяным черепом с зелёными глазами, навершие — зубцы короны.
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
  /** Ширина каймы, px; навершие: солнечный диск (Сольгард) или зубцы короны (Умбрат). */
  trimW: number; finial: "sun" | "crown";
}
const FAC: Record<"solgard" | "umbrath", Fac> = {
  solgard: {
    // слоновая кость с тёплыми серо-бежевыми складками, широкая золотая кайма (золото и тёплый белый фракции)
    field: [hex("#7a6a4c"), hex("#bfae88"), hex("#d6c8a4")],
    trim: [P.gold[1], P.gold[3], P.gold[4]],
    mark: [P.gold[2], P.gold[3], P.gold[4]],
    ribA: [P.gold[1], P.gold[3]], ribB: [hex("#2c6ca8"), hex("#7ec8ff")],
    ring: [P.gold[0], P.gold[1], P.gold[2], P.gold[3], hex("#fff4c8")],
    trimW: 3, finial: "sun",
  },
  umbrath: {
    field: [hex("#100a1a"), hex("#22163a"), hex("#382858")],
    trim: [P.cloth.purple[2], P.cloth.purple[3], hex("#d0b4f0")],
    mark: [P.magic.green[1], P.magic.green[2], P.magic.green[3]],
    ribA: [hex("#46265e"), hex("#6a3c8a")], ribB: [P.magic.green[1], P.magic.green[2]],
    ring: [hex("#2a1846"), hex("#5a34a0"), hex("#8a5ce0"), hex("#b890ff"), hex("#e0ccff")],
    trimW: 2, finial: "crown",
  },
};

/** Плоская текстура полотнища: фигурный низ (ласточкин хвост), кайма, внутренняя линия, эмблема. Возвращает цвета и маску. */
function clothTexture(fac: "solgard" | "umbrath") {
  const F = FAC[fac], tex = new PC(CW, CH), mask: boolean[][] = Array.from({ length: CH }, () => Array(CW).fill(false));
  const bottom = (x: number) => CH - 1 - Math.round(11 * (1 - Math.abs((2 * x) / (CW - 1) - 1)));   // граница снизу: V-вырез
  for (let x = 0; x < CW; x++) for (let y = 0; y <= bottom(x); y++) mask[y][x] = true;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < CW && y < CH && mask[y][x];
  // расстояние до края (по 4 соседям, до 5)
  const dist = (x: number, y: number) => { for (let d = 1; d <= 5; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (!inside(x + dx, y + dy)) return d; return 9; };
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (!mask[y][x]) continue;
    const d = dist(x, y);
    let c: RGBA = (x + y) % 9 === 0 && d > 5 ? F.field[2] : F.field[1];
    if (d <= F.trimW || y < F.trimW + 1) c = d === 1 || y === 0 ? F.trim[1] : d === F.trimW ? F.trim[0] : (x + y) % 4 === 0 ? F.trim[2] : F.trim[1];   // кайма
    else if (d === F.trimW + 2) c = F.trim[0];                                       // внутренняя линия
    tex.set(x, y, c);
  }
  // эмблема (крупно, контрастно, без мелочи)
  const em = new PC(CW, CH), ex = CW / 2;
  if (fac === "solgard") {
    // восходящее солнце (полудиск с лучами) над щитом
    const G = P.gold, sky = [hex("#12365e"), hex("#1f5a96"), hex("#3a86c8"), hex("#7ec8ff")], sy = 17;
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI + (k / 6) * Math.PI, len = k % 2 === 0 ? 5 : 3.5, r1 = 6.8, px = -Math.sin(a), py = Math.cos(a);
      em.poly([[ex + Math.cos(a) * r1 + px * 1.4, sy + Math.sin(a) * r1 + py * 1.4], [ex + Math.cos(a) * r1 - px * 1.4, sy + Math.sin(a) * r1 - py * 1.4], [ex + Math.cos(a) * (r1 + len), sy + Math.sin(a) * (r1 + len)]], k % 2 ? G[2] : G[3]);
    }
    for (let y = sy - 6; y <= sy; y++) for (let x = -6; x <= 6; x++) { const d = Math.hypot(x, y - sy); if (d <= 5.6) put(em, ex + x, y, d < 3.2 ? G[4] : d < 4.6 ? G[3] : G[2]); }
    for (let x = -8; x <= 8; x++) { put(em, ex + x, sy + 1, G[3]); put(em, ex + x, sy + 2, G[1]); }                 // линия горизонта
    // щит: небесно-голубой, золотой обод
    const top = 20, bot = 33, hw = (y: number) => (y < 25 ? 9 : Math.max(0, 9 - (y - 25) * 1.15));
    for (let y = top; y <= bot; y++) for (let x = -10; x <= 10; x++) {
      const w = hw(y);
      if (Math.abs(x) > w + 0.2 || w <= 0) continue;
      const rim = Math.abs(x) > w - 1.3 || y === top || y === bot || (y > 25 && Math.abs(x) > w - 1.8);
      put(em, ex + x, y, rim ? (x < 0 ? G[3] : G[2]) : y > bot - 4 ? sky[0] : x < -2 ? sky[2] : x > 3 ? sky[0] : sky[1]);
    }
    for (const [dx, dy] of [[0, 25], [0, 26], [-1, 26], [1, 26], [0, 27], [-3, 24], [3, 24]]) put(em, ex + dx, dy, G[3]);   // золотая звезда
    put(em, ex - 4, top + 2, sky[3]); put(em, ex - 4, top + 3, sky[3]);
  } else {
    // чёрная корона над костяным черепом со светящимися зелёными глазами
    const lil = [hex("#6a3c8a"), hex("#9a62b8"), hex("#d0b4f0")], bone = P.bone, gr = P.magic.green, dark = hex("#0a0612");
    for (const cxs of [8.5, 16, 23.5]) {
      const apex = cxs === 16 ? 3 : 5;
      em.poly([[cxs - 3.6, 12], [cxs + 3.6, 12], [cxs, apex]], lil[1]); em.line(cxs, apex + 1, cxs - 2.4, 11, lil[2], 1);
      put(em, cxs, apex, lil[2]); put(em, cxs, apex + 1, lil[2]);
    }
    for (let x = -9; x <= 9; x++) { for (let y = 11; y <= 15; y++) put(em, ex + x, y, dark); put(em, ex + x, 11, lil[2]); put(em, ex + x, 15, lil[1]); }
    for (const gx of [-6, 0, 6]) { put(em, ex + gx, 12, gr[3]); put(em, ex + gx, 13, gr[3]); put(em, ex + gx, 14, gr[2]); }
    // череп
    em.ellipse(ex, 22, 7.6, 6.8, bone[1]); em.ellipse(ex - 0.6, 21.4, 6.9, 6.1, bone[2]); em.ellipse(ex - 2.4, 19.6, 3.2, 2.2, bone[3]);
    for (let y = 26; y <= 31; y++) for (let x = -4; x <= 4; x++) put(em, ex + x, y, x > 2 ? bone[1] : bone[2]);
    for (const tx of [-2, 0, 2]) for (let y = 28; y <= 31; y++) put(em, ex + tx, y, dark);
    for (let x = -4; x <= 4; x++) put(em, ex + x, 27, bone[0]);
    for (const sx of [-3.4, 3.4]) { em.ellipse(ex + sx, 22, 2.9, 2.7, gr[0]); em.ellipse(ex + sx, 22, 2.1, 2.1, dark); em.ellipse(ex + sx, 22.2, 1.3, 1.3, gr[3]); put(em, ex + sx - 0.5, 21.5, gr[4]); }
    em.poly([[ex, 24], [ex - 1.6, 26.2], [ex + 1.6, 26.2]], dark);
  }
  em.outline(fac === "solgard" ? hex("#3a2208") : hex("#05030a"), true);   // тёмный контур эмблемы: читается с одного взгляда
  tex.blit(em, 0, 0);
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
  if (F.finial === "sun") {
    // золотой солнечный диск с короткими лучами
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; put(f, CX + Math.cos(a) * 5.4, 7 + Math.sin(a) * 5.4, gold[k % 2 ? 2 : 3]); put(f, CX + Math.cos(a) * 4.4, 7 + Math.sin(a) * 4.4, gold[3]); }
    f.ellipse(CX, 7, 3.4, 3.4, gold[2]); f.ellipse(CX - 0.4, 6.6, 2.6, 2.6, gold[3]); put(f, CX - 1, 5, gold[4]); put(f, CX, 5, gold[4]);
    f.ellipse(CX, 13.5, 3, 1.6, gold[1]);
  } else {
    // зубцы чёрной короны
    const lil = [hex("#6a3c8a"), hex("#9a62b8"), hex("#d0b4f0")];
    for (const dx of [-4, 0, 4]) { f.poly([[CX + dx - 2, 13], [CX + dx + 2, 13], [CX + dx, dx === 0 ? 2 : 5]], lil[1]); put(f, CX + dx, dx === 0 ? 2 : 5, lil[2]); f.line(CX + dx, dx === 0 ? 3 : 6, CX + dx - 1, 12, lil[2], 1); }
    f.ellipse(CX, 13.5, 5, 1.6, lil[0]); put(f, CX, 12, P.magic.green[3]);
  }
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
