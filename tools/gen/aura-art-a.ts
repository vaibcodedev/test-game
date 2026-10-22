/** Обозначения, часть A (задача 129): круги под ногами (плотность 1, эллипс 48×22 — как кольцо выбора) и предметы орбит
 *  (двойная плотность; орбиту, слои и покачивание клиент считает каждый кадр — в листе только сам предмет со своими кадрами мерцания).
 *  Кольца: полоса 2–3 px в 3 тона с тёмным контуром с обеих сторон, блики бегут по кругу, детали — с объёмом и контуром. */
import {
  PC, TAU, RP, INK, Mask, Cv, L1, L2, EASE, shade, outline, flat, ellScan, adist, ang, glow, sparkle, flame, cloud, hex, withA, mix, rng,
  easeOut, easeIn, easeInOut, bell, smooth, puff, bayer, dissolve, type Art, type Layer, type RGBA, type Ramp,
} from "./aura-lib";
import { factionEmblem } from "./heraldry";

const RW = 52, RH = 28, CX = 26, CY = 14, RX = 24, RY = 11;
const ringArt = (id: string, layers: Layer[], ease = EASE): Art => ({ id, layers, ease });
/** Полоса эллипса шириной w (по радиусу) на холсте плотности 1: pick(θ) — где есть полоса, tone(θ, k) — цвет (k = 0 — внешний край).
 *  Возвращает маску полосы; контур out — снаружи маски (и на торцах дуг). */
function band(f: PC, cx: number, cy: number, rx: number, ry: number, w: number, pick: (th: number) => boolean, tone: (th: number, k: number) => RGBA | null, out: RGBA | null = INK): Mask {
  const m = new Mask(f.w, f.h, 1), col: (RGBA | null)[] = [];
  ellScan(f.w, f.h, cx, cy, rx, ry, w + 1, (x, y, th, d) => {
    if (d > 0 || d <= -w || !pick(th)) return;
    const c = tone(th, Math.min(w - 1, Math.floor(-d)));
    if (c) { m.put(x, y, true); col[y * f.w + x] = c; }
  });
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = col[y * f.w + x]; if (c) f.set(x, y, c); }
  if (out) outline(f, m, out);
  return m;
}
const pt = (a: number, kx = 1, ky = kx, cx = CX, cy = CY, rx = RX, ry = RY): [number, number] => [cx + Math.cos(a) * rx * kx, cy + Math.sin(a) * ry * ky];
/** Два блика бегут по кругу навстречу часовой (за цикл — полоборота, у полосы с симметрией 2). */
const glint = (th: number, u: number, width = 0.32, off = 0) => Math.min(adist(th, u * Math.PI + off), adist(th, u * Math.PI + Math.PI + off)) < width;

// ====================================================================== храмовник
/** Знамя защиты (у храмовника, поставившего знамя): кольцо из флажков — шесть вымпелов на золотых древках стоят по эллипсу вокруг ног
 *  (задние — за кольцом, боковые и передние — перед ним), их соединяет витой золотой шнур 2 px (три тона наискось, контур, бегут два блика);
 *  флажки-«ласточкины хвосты» слоновой кости в 3 тона с контуром смотрят наружу и полощутся (свободный край ходит по синусу, фазы разнесены).
 *  На передней кромке — малая эмблема фракции знамени (утверждённый герб, отдельный слой двойной плотности, вариант по фракции). */
export function ringStandard(): Art {
  const G = RP.gold, OUT = hex("#3a1e06"), IV = [hex("#a8956a"), hex("#e2d6b8"), hex("#fff8e8")];
  const W = 62, H = 38, cx = 31, cy = 24, rx = 22, ry = 9.5;
  const flags = [1.25 * Math.PI, 1.75 * Math.PI, Math.PI, 0, 0.72 * Math.PI, 0.28 * Math.PI];   // задние, боковые, передние
  const ring = L1("ring", W, H, 12, 12, "feet", "ground", [0.5, cy / H], (f, t, u) => {
    const pennant = (a: number, i: number) => {
      const [bx, by] = pt(a, 1, 1, cx, cy, rx, ry), x0 = Math.round(bx) - 1, top = Math.round(by) - 10, sg = Math.cos(a) < -0.01 ? -1 : 1;
      const m = new Mask(W, H, 1), tmp = new PC(W, H);
      for (let y = top + 1; y <= Math.round(by); y++) { tmp.set(x0, y, G[4]); tmp.set(x0 + 1, y, G[2]); m.put(x0, y, true); m.put(x0 + 1, y, true); }
      tmp.set(x0, top, G[5]); tmp.set(x0 + 1, top, G[4]); m.put(x0, top, true); m.put(x0 + 1, top, true);
      // флажок наружу от героя: свободный край и вырез ходят по синусу
      const w1 = Math.sin((u + i * 0.17) * TAU), w2 = Math.sin((u + i * 0.17) * TAU - 1.2), fy = top + 1, hx = sg > 0 ? x0 + 2 : x0, X = (d: number) => hx + sg * d;
      const fm = new Mask(W, H, 1).poly([[X(0), fy], [X(5.6), fy + 0.4 + w1 * 0.9], [X(3.6), fy + 2.2 + w2 * 0.7], [X(5.6), fy + 4.2 + w1 * 0.9], [X(0), fy + 4.4]]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fm.has(x, y)) { const q = (y - fy) / 4.4 - Math.abs(x - hx) * 0.04; tmp.set(x, y, q < 0.3 ? IV[2] : q < 0.68 ? IV[1] : IV[0]); m.put(x, y, true); }
      outline(tmp, m, OUT);
      f.blit(tmp, 0, 0);
    };
    flags.forEach((a, i) => { if (Math.sin(a) < -0.1) pennant(a, i); });
    // витой шнур: пряди наискось (позиция вдоль кольца + слой), два блика бегут навстречу часовой
    band(f, cx, cy, rx, ry, 2, () => true, (th, k) => {
      if (glint(th, u, 0.18, 0.6)) return G[5];
      const along = Math.floor(ang(th) * ((rx + ry) / 2) + k * 1.5) % 3;
      return [G[4], G[3], G[2]][along];
    }, OUT);
    flags.forEach((a, i) => { if (Math.sin(a) >= -0.1) pennant(a, i); });
  });
  return ringArt("tp_banner", [ring, emblemLayer("solgard", "feet", undefined, ry + 1), emblemLayer("umbrath", "feet", undefined, ry + 1)]);
}
/** Малая эмблема фракции на передней кромке круга (двойная плотность: s24 → 10×12 мира; ×3: s20, растянутая ×2), мягкий ореол дышит. */
export function emblemLayer(fac: "solgard" | "umbrath", at: "feet" | "head" = "feet", glowCol?: RGBA, dy = RY + 1): Layer {
  const e2 = factionEmblem(fac, "s24"), e3 = factionEmblem(fac, "s20"), gc = glowCol ?? (fac === "solgard" ? hex("#ffd870") : hex("#b070ff"));
  const W = 16, H = 16, n = 12;
  const build = (D: number) => Array.from({ length: n }, (_, t) => {
    // ореол дышит несимметрично (быстрый подъём, медленный спад), по гербу раз в цикл проходит косой блеск — кадры не повторяются
    const c = new Cv(W, H, D), u = t / n, br = u < 0.3 ? easeOut(u / 0.3) : 1 - easeInOut((u - 0.3) / 0.7);
    glow(c, W / 2, H / 2, 6.5 + br * 0.8, 7 + br * 0.8, gc, 0.16 + 0.16 * br, 3);
    const em = new PC(W * D, H * D);
    if (D === 2) em.blit(e2, Math.round((W * 2 - e2.w) / 2), Math.round((H * 2 - e2.h) / 2));
    else { const big = new PC(e3.w * 2, e3.h * 2); for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const q = e3.get(x >> 1, y >> 1)!; if (q[3]) big.set(x, y, q); } em.blit(big, Math.round((W * 3 - big.w) / 2), Math.round((H * 3 - big.h) / 2)); }
    const sp = -0.3 + u * 1.9;   // положение блеска по диагонали (0..1 — на гербе)
    for (let y = 0; y < em.h; y++) for (let x = 0; x < em.w; x++) {
      const q = em.get(x, y)!; if (q[3] < 200) continue;
      const dd = Math.abs((x / D + y / D * 0.7) / (W * 1.7) - sp);
      if (dd < 0.035) em.set(x, y, mix(q, hex("#ffffff"), 0.55));
      else if (dd < 0.07) em.set(x, y, mix(q, hex("#ffffff"), 0.25));
    }
    c.f.blit(em, 0, 0);
    return c.f;
  });
  return { id: `emblem-${fac}`, frames: build(2), w: W * 2, h: H * 2, dens: 2, hi: build(3), hw: W * 3, hh: H * 3, fps: 12, anchor: [0.5, 0.5], at, dy: at === "feet" ? dy : 0, z: at === "feet" ? "ground" : "top", variant: fac };
}

// ====================================================================== кровоплёт
/** Кровный круг: не тонкое кольцо, а лужа — внутри тёмная кровь (глубже к середине, глянцевый блик сверху слева), по краю — жила 2 px
 *  (тёмный край, светлая середина, контур) с шестью узлами-каплями; по жиле раз за цикл обходит волна пульса: жила светлеет, узел
 *  набухает (easing) и опадает. */
export function ringBloodCircle(): Art {
  const B = RP.crimson, OUT = hex("#14020a"), rx = 21.5, ry = 9.4;
  const knots = Array.from({ length: 6 }, (_, k) => (k * TAU) / 6 + 0.26);
  const ring = L1("pool", RW, RH, 12, 12, "feet", "ground", [0.5, 0.5], (f, t, u) => {
    const crestA = u * TAU, wav = (th: number) => Math.exp(-((adist(th, crestA) / 0.6) ** 2));
    const m = new Mask(RW, RH, 1).fill((x, y) => { const dx = (x - CX) / rx, dy = (y - CY) / ry, th = Math.atan2(dy, dx); return Math.hypot(dx, dy) <= 1 + 0.035 * Math.sin(5 * th + 1.3); });
    const d = m.dist(5);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (!m.has(x, y)) continue;
      const k = d[y * RW + x], th = Math.atan2((y + 0.5 - CY) / ry, (x + 0.5 - CX) / rx), w = wav(th);
      f.set(x, y, k <= 1 ? (w > 0.5 ? B[3] : B[2]) : k <= 2.2 ? (w > 0.45 ? B[5] : w > 0.15 ? B[4] : B[3]) : k <= 3.4 ? B[1] : B[0]);
    }
    outline(f, m, OUT);
    // глянец: короткий блик сверху слева чуть скользит
    const gx = Math.round(CX - 9 + Math.sin(u * TAU) * 1.2), gy = CY - 4;
    for (const [a, b, c] of [[0, 0, B[4]], [1, 0, B[4]], [2, 0, B[3]], [-2, 1, B[3]], [-1, 1, B[3]]] as const) if (m.has(gx + a, gy + b)) f.set(gx + a, gy + b, c);
    // узлы-капли на жиле: набухают, когда через них проходит волна
    for (const a of knots) {
      const w = wav(a), [x, y] = pt(a, (rx - 1.1) / RX, (ry - 1.1) / RY), r = 1.5 + 0.8 * easeInOut(w);
      const km = new Mask(RW, RH, 1).disc(x, y + 0.2, r).poly([[x - r * 0.8, y], [x + r * 0.8, y], [x, y - r * 1.9]]);
      const tmp = new PC(RW, RH); shade(tmp, km, w > 0.5 ? [B[2], B[3], B[4], B[5], hex("#ffffff")] : [B[1], B[2], B[3], B[4], B[5]], { mode: "round", out: OUT }); f.blit(tmp, 0, 0);
    }
  });
  return ringArt("blood_circle", [ring]);
}

// ====================================================================== тёмный следопыт
/** Мастер теней: сиреневое кольцо 2 px с тёмным контуром, по нему скользят три полумесяца (орбита по земле в коде), на передней кромке — два пера. */
export function ringMeld(): Art {
  const Lc = RP.lilac, OUT = hex("#10061e");
  const ring = L1("ring", RW, RH + 4, 12, 12, "feet", "ground", [0.5, CY / (RH + 4)], (f, t, u) => {
    band(f, CX, CY, RX, RY, 2, () => true, (th, k) => (glint(th, u, 0.26) ? Lc[5] : k === 0 ? Lc[3] : Lc[4]), OUT);
    for (const sg of [-1, 1]) {
      const c = new Cv(RW, RH + 4, 1), m = c.mask(), [x, y] = pt(Math.PI / 2 + sg * 0.42, 1, 1);
      m.path([[x - sg * 0.5, y - 1], [x + sg * 2.5, y + 1.6], [x + sg * 5.2, y + 2.6]], 1.25, 0.5);
      const tmp = new PC(RW, RH + 4); shade(tmp, m, [Lc[1], Lc[2], Lc[3], Lc[4], Lc[5]], { mode: "round", out: OUT });
      f.blit(tmp, 0, 0);
      f.set(Math.round(x + sg * 2), Math.round(y + 1), Lc[5]);
    }
  });
  const moon = L2("moons", 8, 8, 8, 12, "feet", "ground", [0.5, 0.5], (c, t, u) => {
    const pu = 0.5 + 0.5 * Math.sin(u * TAU);
    glow(c, 4, 4, 3.8, 3.8, Lc[4], 0.12 + 0.12 * pu, 2);
    const m = c.mask().disc(4, 4, 3).disc(5.6, 3.3, 2.5, "sub");
    shade(c.f, m, pu > 0.6 ? [Lc[2], Lc[3], Lc[4], Lc[5], hex("#ffffff")] : [Lc[1], Lc[2], Lc[3], Lc[4], Lc[5]], { mode: "round", out: OUT });
  }, { orbit: { n: 3, kinds: 1, rx: RX - 2, ry: RY - 1, oy: 0, period: -5200, bob: 0, bobPeriod: 1000, backAlpha: 1, face: "shimmer", ground: true } });
  return ringArt("meld", [ring, moon]);
}

// ====================================================================== потрошитель
/** Кровавое безумие: рваное кольцо 2–4 px (багрянец в 4 тона, контур), на передней кромке — четыре стальных клинка-зубца (стоят на месте);
 *  пульс яркости в 5 ступеней (нарастание 3 кадра, спад 9, easing), брызги 2×2 разлетаются наружу и гаснут дизером. */
export function ringFrenzy(): Art {
  const B = RP.crimson, S = RP.steel, OUT = hex("#1a0206"), r = rng(7);
  const jag = Array.from({ length: 24 }, () => r());
  const thick = (th: number) => { const q = (ang(th) / TAU) * 24, i = Math.floor(q), fr = q - i; return 2 + Math.round((jag[i % 24] * (1 - fr) + jag[(i + 1) % 24] * fr) * 2); };
  const H = 32;
  const ring = L1("ring", RW, H, 12, 12, "feet", "ground", [0.5, CY / H], (f, t, u) => {
    // пульс: нарастание за 3 кадра и спад за 9 (easing), 5 ступеней яркости; форма кольца и зубья не двигаются
    const v = u < 0.25 ? easeInOut(u / 0.25) : 1 - easeInOut((u - 0.25) / 0.75), lv = Math.round(v * 4), s = 1;
    const K0 = [B[1], B[1], B[1], B[2], B[2]][lv], K1 = [B[2], B[2], B[3], B[3], B[4]][lv], K2 = [B[3], B[3], B[3], B[4], B[4]][lv], KL = [B[3], B[4], B[4], B[4], B[5]][lv];
    const m = new Mask(RW, H, 1), col: RGBA[] = [];
    ellScan(RW, H, CX, CY, RX * s, RY * s, 6, (x, y, th, d) => { const w = thick(th); if (d <= 0.6 && d > -w) { m.put(x, y, true); const k = Math.floor(-d + 0.6); col[y * RW + x] = k <= 0 ? K0 : k === 1 ? K1 : adist(th, (5 * Math.PI) / 4) < 0.9 ? KL : K2; } });
    for (let y = 0; y < H; y++) for (let x = 0; x < RW; x++) if (m.has(x, y)) f.set(x, y, col[y * RW + x]);
    outline(f, m, OUT);
    // клинки на передней кромке
    for (const a of [0.95, 1.35, 1.8, 2.2]) {
      const c = new Cv(RW, H, 1), mm = c.mask(), [x, y] = pt(a, 1.0 * s, 1.0 * s), dx = Math.cos(a), dy = Math.sin(a) * 0.9, L = a > 1.2 && a < 2 ? 5.5 : 4.2;
      mm.poly([[x - dy * 1.6, y + dx * 0.9], [x + dy * 1.6, y - dx * 0.9], [x + dx * L * 0.55, y + dy * L]]);
      const tmp = new PC(RW, H); shade(tmp, mm, lv >= 3 ? [S[2], S[3], S[4], S[5], hex("#ffffff")] : [S[1], S[2], S[3], S[4], S[5]], { out: OUT, bevel: 0.8 }); f.blit(tmp, 0, 0);
    }
    // брызги 2×2 разлетаются и гаснут дизером (без альфы)
    for (let k = 0; k < 6; k++) {
      const p = (u + k / 6 + (k % 2) * 0.07) % 1, al = bell(p, 0.1, 0.5); if (al < 0.2) continue;
      const a = (k * TAU) / 6 + 0.5, e = easeOut(p), x = Math.round(CX + Math.cos(a) * RX * (1.04 + e * 0.24)), y = Math.round(CY + Math.sin(a) * RY * (1.04 + e * 0.24) - e * 3 - Math.sin(p * Math.PI) * 2);
      if (bayer(x, y) < 1 - Math.min(1, al * 1.4)) continue;
      f.set(x, y, B[4]); f.set(x + 1, y, B[3]); f.set(x, y + 1, B[3]); f.set(x + 1, y + 1, B[2]);
    }
  });
  return ringArt("frenzy", [ring]);
}
/** Кровавая бойня: вихрь — две дуги-взмаха (стальная кромка, багровый след, хвост гаснет альфой) носятся вокруг ног;
 *  задняя половина — слой за героем, передняя — перед ним. 12 кадров на пол-оборота (симметрия 2). */
export function ringMassacre(): Art {
  const B = RP.crimson, S = RP.steel, W = 54, H = 32, cx = 27, cy = 17, rx = 22, ry = 9;
  const draw = (front: boolean) => (f: PC, t: number, u: number) => {
    const head0 = u * Math.PI, SPAN = 2.5;
    ellScan(W, H, cx, cy, rx, ry, 6, (x, y, th, d) => {
      if ((Math.sin(th) >= 0) !== front) return;
      for (let i = 0; i < 2; i++) {
        const hd = head0 + i * Math.PI, lag = ang(hd - th);   // насколько пиксель отстаёт от кромки взмаха
        if (lag > SPAN) continue;
        const q = lag / SPAN, w = 6.8 * (q < 0.12 ? 0.4 + 0.6 * easeOut(q / 0.12) : Math.pow(1 - (q - 0.12) / 0.88, 0.8));
        if (d > 0.4 || d < -w) continue;
        const outer = d > -1.1, inner = d < -w + 1;
        const c = q < 0.06 ? hex("#ffffff") : outer ? (q < 0.3 ? S[5] : q < 0.55 ? S[4] : B[3]) : inner ? B[1] : q < 0.25 ? B[4] : q < 0.55 ? B[3] : B[2];
        f.set(x, y, withA(c, 255 * (q < 0.5 ? 1 : Math.max(0, 1 - (q - 0.5) / 0.5))));
      }
    });
  };
  const back = L1("back", W, H, 12, 15, "feet", "under", [0.5, cy / H], draw(false), { dy: -3 });
  const front = L1("front", W, H, 12, 15, "feet", "over", [0.5, cy / H], draw(true), { dy: -3 });
  return ringArt("massacre", [back, front]);
}

// ====================================================================== следопыт
/** Ловкий отскок: светлое кольцо 2 px с тёмным контуром (видно на траве и брусчатке), по нему скользят шесть листьев (орбита по земле в коде);
 *  лист 6×4 в 3 тона с жилкой и контуром, покачивается (8 кадров). */
export function ringTrickroll(): Art {
  const Lf = RP.leaf, OUT = hex("#0a1e0c");
  const ring = L1("ring", RW, RH, 12, 12, "feet", "ground", [0.5, 0.5], (f, t, u) => {
    band(f, CX, CY, RX, RY, 2, () => true, (th, k) => (glint(th, u, 0.24) ? Lf[5] : k === 0 ? Lf[3] : Lf[4]), OUT);
  });
  const leaf = L2("leaves", 9, 7, 8, 12, "feet", "ground", [0.5, 0.5], (c, t, u) => {
    const k = Math.floor(t / 8), rot = -0.5 + 0.38 * Math.sin(u * TAU * 1), ca = Math.cos(rot), sa = Math.sin(rot), P = (x: number, y: number): [number, number] => [4.5 + x * ca - y * sa, 3.5 + x * sa + y * ca];
    const m = c.mask().poly([P(-3.4, 0), P(-2, -1.5), P(0, -2), P(2.2, -1.3), P(3.6, 0), P(2.2, 1.3), P(0, 2), P(-2, 1.5)]);
    shade(c.f, m, k ? [Lf[1], Lf[2], Lf[3], Lf[4], Lf[5]] : [hex("#3a5a10"), hex("#6a8a1e"), hex("#a8c03a"), hex("#d8e86a"), hex("#f4ffb0")], { mode: "round", out: OUT });
    const v = c.mask().cap(P(-2.6, 0)[0], P(-2.6, 0)[1], P(2.6, 0)[0], P(2.6, 0)[1], 0.26, 0.2);
    for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) if (v.has(x, y) && m.has(x, y)) c.f.set(x, y, Lf[1]);
  });
  // два вида листа: блоки по 8 кадров
  leaf.frames = [...leaf.frames, ...leaf.frames.map((f) => recolor(f, 1))];
  leaf.hi = [...leaf.hi!, ...leaf.hi!.map((f) => recolor(f, 1))];
  leaf.orbit = { n: 6, kinds: 2, rx: RX - 0.5, ry: RY - 0.3, oy: 0, period: 6400, bob: 0, bobPeriod: 1000, backAlpha: 1, face: "shimmer", ground: true };
  return ringArt("trickroll", [ring, leaf]);
}
/** Второй вид листа — желтее (осенний). */
function recolor(f: PC, _k: number): PC {
  const o = f.clone();
  return o.map((c) => (c[1] > c[0] && c[1] > 60 ? [Math.min(255, c[0] + 46), c[1], Math.max(0, c[2] - 10), c[3]] : c));
}
/** Стойка стрелка: кольцо-прицел из коры (2 px, контур) с четырьмя зелёными засечками-наконечниками внутрь; засечки сходятся к герою и расходятся (easing). */
export function ringSteady(): Art {
  const Bk = RP.bark, Lf = RP.leaf, OUT = hex("#140a04");
  const H = 32, cy = 16;
  const ring = L1("ring", RW, H, 12, 12, "feet", "ground", [0.5, cy / H], (f, t, u) => {
    band(f, CX, cy, RX, RY, 2, () => true, (th, k) => (glint(th, u, 0.22, 0.4) ? Bk[5] : k === 0 ? Bk[3] : Bk[4]), OUT);
    // засечки прицела: 4 штриха 2 px поперёк кольца (снаружи → внутрь), сходятся к герою и расходятся; у кончика — светлый наконечник
    const e = easeInOut(0.5 + 0.5 * Math.cos(u * TAU)), wob = 0.25 * Math.sin(u * TAU * 2 + 0.7), m = new Mask(RW, H, 1), tips = new Mask(RW, H, 1);
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const sh = 0.4 + (1 - e) * 2.8 + wob, ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
      // сбоку штрих горизонтальный 7.5 px, спереди и сзади — вертикальный 4.5 px (ракурс эллипса)
      const xo = CX + ca * (RX + 3.0 - sh), yo = cy + sa * (RY + 2.2 - sh * 0.46), L = ca ? 7.5 : 4.5, xi = xo - ca * L, yi = yo - sa * L;
      m.cap(xo, yo, xi, yi, 1.0);
      tips.cap(xi + ca * 1.4, yi + sa * 1.0, xi, yi, 1.05);
    }
    const tmp = new PC(RW, H); shade(tmp, m, [Lf[1], Lf[2], Lf[3], Lf[4], Lf[5]], { out: OUT, bevel: 0.6 });
    for (let y = 0; y < H; y++) for (let x = 0; x < RW; x++) if (tips.has(x, y) && m.has(x, y)) tmp.set(x, y, e > 0.5 ? hex("#f4ffb0") : Lf[4]);
    f.blit(tmp, 0, 0);
  });
  return ringArt("steady", [ring]);
}

// ====================================================================== маг
/** Искажение времени (баф мага): тайный циферблат — кольцо 2 px с 12 засечками внутрь; свет перескакивает с засечки на засечку (тик часов),
 *  за ним два затухающих следа; внутри две дуги 2 px идут навстречу друг другу. */
export function ringTimewarp(): Art {
  const Ac = RP.arcane, Az = RP.azure, OUT = hex("#120830");
  const ring = L1("ring", RW, RH, 12, 12, "feet", "ground", [0.5, 0.5], (f, t, u) => {
    band(f, CX, CY, RX, RY, 2, () => true, (th, k) => (k === 0 ? Ac[2] : Ac[3]), OUT);
    // четыре внутренние дуги-стрелки (симметрия 4: за цикл — четверть оборота, 7.5° за кадр)
    const q4 = (th: number, a0: number, w: number) => [0, 1, 2, 3].some((i) => adist(th, a0 + (i * TAU) / 4) < w);
    band(f, CX, CY, RX - 6.5, RY - 3.2, 2, (th) => q4(th, u * (TAU / 4), 0.42), (th, k) => (k === 0 ? Az[3] : Az[4]), withA(OUT, 200));
    const m = new Mask(RW, RH, 1), col: RGBA[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12 - Math.PI / 2, age = (t - i + 12) % 12, lit = age === 0 ? 3 : age === 1 ? 2 : age === 2 ? 1 : 0;
      const [x0, y0] = pt(a, (RX - 2) / RX, (RY - 1.4) / RY), [x1, y1] = pt(a, (RX - 4.2) / RX, (RY - 2.6) / RY);
      const mm = new Mask(RW, RH, 1).cap(x0, y0, x1, y1, i % 3 === 0 ? 0.95 : 0.7);
      for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (mm.has(x, y)) { m.put(x, y, true); col[y * RW + x] = [Ac[3], Az[4], Az[5], hex("#ffffff")][lit]; }
      if (lit === 3) { const c = new Cv(RW, RH, 1); glow(c, (x0 + x1) / 2, (y0 + y1) / 2, 3.2, 2.2, Az[4], 0.45, 2); f.blit(c.f, 0, 0); }
    }
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (m.has(x, y)) f.set(x, y, col[y * RW + x]);
    outline(f, m, OUT);
  });
  return ringArt("timewarp", [ring]);
}

// ====================================================================== дебафы-круги
/** Замедление: кольцо инея 2 px (контур), на передней кромке — пять ледяных кристаллов (4 тона, грани, блики, контур); блик перебегает
 *  с кристалла на кристалл, по кольцу — два блика. 12 кадров, 12 к/с, стык цикла без повтора кадра. */
export function ringSlow(): Art {
  const I = RP.ice, OUT = hex("#081428"), H = 30;
  const crystals = [[1.02, 5, 2.0, -0.25], [1.3, 7.5, 2.4, -0.1], [1.57, 9, 2.6, 0], [1.84, 7, 2.3, 0.12], [2.12, 5.5, 2.0, 0.28]] as const;
  const ring = L1("ring", RW, H, 12, 12, "feet", "ground", [0.5, (CY + 2) / H], (f, t, u) => {
    const cy = CY + 2;
    band(f, CX, cy, RX, RY, 2, () => true, (th, k) => (glint(th, u, 0.22) ? I[5] : k === 0 ? I[3] : I[4]), OUT);
    crystals.forEach(([a, h, w, lean], i) => {
      const [x, y] = pt(a, 1, 1, CX, cy), tip: [number, number] = [x + lean * h, y - h];
      const m = new Mask(RW, H, 1).poly([[x - w, y + 0.6], [x - w * 0.9, y - h * 0.45], tip, [x + w * 0.9, y - h * 0.45], [x + w, y + 0.6]]);
      const tmp = new PC(RW, H);
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < RW; xx++) {
        if (!m.has(xx, yy)) continue;
        const rel = xx + 0.5 - (x + lean * (y - yy - 0.5));   // слева от ребра — светлая грань
        tmp.set(xx, yy, rel < -0.6 ? I[4] : rel < 0.4 ? I[5] : I[2]);
      }
      // блик по очереди: кристалл i горит в кадрах около i·2.4
      const g = (t - i * 2.4 + 12) % 12;
      if (g < 2) for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < RW; xx++) if (m.has(xx, yy) && Math.abs(yy - (y - h * (0.35 + g * 0.25))) < 1) tmp.set(xx, yy, hex("#ffffff"));
      outline(tmp, m, OUT); f.blit(tmp, 0, 0);
    });
  });
  return ringArt("slow", [ring]);
}
/** Корни: на земле — тёмная трещина, бугорки земли и два заострённых корня по бокам с шипами (кора в 4 тона, контур); перед героем — корни
 *  обвивают сапоги. Корни дышат: петли у сапог сжимаются и разжимаются по синусу в 3 ступени и подрагивают, боковые корни качаются, шипы
 *  мерцают по очереди, с петель осыпаются комья земли 2×2 и пылят у ног — кадры не повторяются. */
export function ringRoot(): Art {
  const K = RP.bark, Lf = RP.leaf, OUT = hex("#120804"), DIRT = [hex("#2e1e10"), hex("#4a3218"), hex("#6a4a26")];
  const W = RW, H = 30, cy = 18;
  const jit = [0, 0.35, -0.2, 0.3, -0.35, 0.15, -0.3, 0.25, -0.15, 0.35, -0.25, 0.1];   // дрожь по кадрам (px мира)
  const tips = (u: number) => [[-9.5, 7.5, -1, 0], [9.8, 8.5, 1, 0.45]].map(([dx, h, sg, ph]) => ({ dx, h, sg, sw: Math.sin((u + ph) * TAU) * 1.3 }));
  const ground = L1("ground", W, H, 12, 12, "feet", "ground", [0.5, cy / H], (f, t, u) => {
    const c = new Cv(W, H, 1); glow(c, CX, cy + 0.5, 13, 4.8, hex("#1a0e06"), 0.55, 3); f.blit(c.f, 0, 0);
    const m = new Mask(W, H, 1);
    for (const r of tips(u)) {
      const x0 = CX + r.dx, y0 = cy + 0.8, pts: [number, number][] = [];
      for (let s = 0; s <= 6; s++) { const q = s / 6; pts.push([x0 + r.sg * Math.sin(q * 1.6) * 1.6 + r.sw * q * q + jit[t] * q, y0 - q * r.h]); }
      m.path(pts, 1.6, 0.35);
    }
    const dirt = new Mask(W, H, 1);
    for (const [dx, dy, rr] of [[-9.5, 1, 2.2], [9.8, 1, 2.2], [-6.8, 1.6, 1.5], [6.8, 1.6, 1.5], [-1.2, 2.0, 1.3], [1.4, 2.0, 1.3]] as const) dirt.ell(CX + dx, cy + dy, rr, rr * 0.55);
    const tmp = new PC(W, H);
    shade(tmp, dirt, [hex("#1a1008"), hex("#2e1e10"), hex("#4a3218"), hex("#6a4a26"), hex("#8a6434")], { mode: "round", out: null });
    shade(tmp, m, [K[1], K[2], K[3], K[4], K[5]], { mode: "round", out: OUT });
    // шипы 2 px на боковых корнях: мерцают по очереди (кончик светлеет)
    tips(u).forEach((r, i) => {
      const x = Math.round(CX + r.dx + r.sg * 1.4 + r.sw * 0.3), y = Math.round(cy - r.h * 0.5), on = (t + i * 3) % 6 < 2;
      tmp.set(x + r.sg, y, K[5]); tmp.set(x + r.sg * 2, y - 1, on ? hex("#f4e0b0") : K[4]); tmp.set(x + r.sg * 2, y, OUT); tmp.set(x + r.sg * 3, y - 1, OUT);
    });
    f.blit(tmp, 0, 0);
    leafBud(f, CX - 12.5, cy + 0.8, Lf, OUT); leafBud(f, CX + 12.8, cy - 0.2, Lf, OUT);
    // комья земли падают с петель у сапог и пылят у ног
    for (const [dx, ph] of [[-4.5, 0], [4.8, 0.5]] as const) {
      const p = (u + ph) % 1, x = Math.round(CX + dx + p * (dx < 0 ? -1.5 : 1.5)), y = Math.round(cy - 3 + easeIn(Math.min(1, p / 0.6)) * 4.5);
      if (p < 0.6) { f.set(x, y, DIRT[2]); f.set(x + 1, y, DIRT[1]); f.set(x, y + 1, DIRT[1]); f.set(x + 1, y + 1, DIRT[0]); }
      else if (p < 0.85) { const q = (p - 0.6) / 0.25; for (const [a, b] of [[-1 - Math.round(q), 0], [2 + Math.round(q), 0], [0, -1], [1, -1]]) if (bayer(x + a, y + b) > q * 0.8) f.set(x + a, y + 1 + b, DIRT[2]); }
    }
  });
  const over = L1("wrap", W, H, 12, 12, "feet", "over", [0.5, cy / H], (f, t, u) => {
    // ком земли срывается с правой петли спереди и падает к ногам (каждый кадр свой)
    const pc = u, cxl = Math.round(CX + 2.2 + pc * 1.2), cyl = Math.round(cy - 2.5 + easeIn(pc) * 4.5);
    // петли сжимаются по синусу в 3 ступени (0, 0.5, 1 px) и подрагивают
    const sq = Math.round((0.5 + 0.5 * Math.sin(u * TAU)) * 2) * 0.5, j = jit[t] * 0.6;
    const m = new Mask(W, H, 1);
    for (const [bx, sg] of [[-3.0, -1], [3.0, 1]] as const) {
      const x0 = CX + bx + j;
      m.path([[x0 + sg * 3.4, cy + 1.2], [x0 + sg * 2.8, cy - 1.4 + sq * 0.4], [x0 + sg * 0.6, cy - 2.8 + sq], [x0 - sg * 1.5, cy - 2.1 + sq * 0.8], [x0 - sg * 2.0, cy + 1.4]], 1.05, 0.85);
    }
    const tmp = new PC(W, H); shade(tmp, m, [K[1], K[2], K[3], K[4], K[5]], { mode: "round", out: OUT });
    f.blit(tmp, 0, 0);
    if (pc < 0.85) { f.set(cxl, cyl, DIRT[2]); f.set(cxl + 1, cyl, DIRT[1]); f.set(cxl, cyl + 1, DIRT[1]); f.set(cxl + 1, cyl + 1, DIRT[0]); }
  });
  return ringArt("root", [ground, over]);
}
function leafBud(f: PC, x: number, y: number, Lf: Ramp, out: RGBA) {
  const m = new Mask(f.w, f.h, 1).ell(x, y, 1.6, 1.1, -0.6);
  const tmp = new PC(f.w, f.h); shade(tmp, m, [Lf[1], Lf[2], Lf[3], Lf[4], Lf[5]], { mode: "round", out }); f.blit(tmp, 0, 0);
}

// ====================================================================== предметы орбит (двойная плотность)
const orbitLayer = (id: string, W: number, H: number, frames: number, fps: number, draw: (c: Cv, t: number, u: number) => void, orbit: NonNullable<Layer["orbit"]>, at: Layer["at"] = "body", z: Layer["z"] = "over", anchor: [number, number] = [0.5, 0.5]) =>
  L2(id, W, H, frames, fps, at, z, anchor, draw, { orbit });

/** Благословение: золотые четырёхлучевые искры (ядро белое, 3 тона) мерцают — растут и сжимаются (easing), мягкий ореол. Орбита над плечами. */
export function orbSparks(): Art {
  const G = RP.gold;
  // мерцание: быстрая вспышка и медленное угасание, искра чуть поворачивается (за цикл — 45°, симметрия 90°: вид каждого кадра свой)
  const lay = orbitLayer("sparks", 12, 12, 8, 12, (c, t, u) => {
    const e = u < 0.25 ? easeOut(u / 0.25) : 1 - easeInOut((u - 0.25) / 0.75) * 0.85, r = 2.6 + 2.8 * e;
    glow(c, 6, 6, r * 0.8, r * 0.8, G[4], 0.12 + 0.18 * e, 2);
    sparkle(c, 6, 6, r, [hex("#ffffff"), G[4], G[3]], { thick: 0.42, rot: (u * Math.PI) / 4 });
  }, { n: 4, kinds: 1, rx: 13, ry: 4.5, oy: -5, period: 3800, bob: 0.6, bobPeriod: 1700, backAlpha: 0.7, face: "shimmer" });
  return { id: "bless", layers: [lay], ease: EASE };
}
/** Стихийный ритм: сферы огня, льда и арканума 6 px (шар в 5 тонов, контур, блик), внутри переливается завиток; число сфер — по зарядам. */
export function orbArcane(): Art {
  const kinds: Ramp[] = [RP.flame, RP.ice, RP.arcane], N = 8;
  const lay = L2("orbs", 9, 9, N * 3, 12, "body", "over", [0.5, 0.5], (c, t, u0) => {
    const k = Math.floor(t / N), R = kinds[k], u = (t % N) / N;
    glow(c, 4.5, 4.5, 4.4, 4.4, R[3], 0.22, 2);
    const m = c.mask().disc(4.5, 4.5, 3.1);
    shade(c.f, m, [R[1], R[2], R[3], R[4], R[5]], { mode: "round", out: INK, th: [0.0, 0.38, 0.66, 0.9] });
    // завиток: дуга яркого тона внутри шара поворачивается
    const sw = c.mask();
    for (let i = 0; i <= 10; i++) { const a = u * TAU + i * 0.28, r = 1.0 + i * 0.12; sw.disc(4.5 + Math.cos(a) * r, 4.5 + Math.sin(a) * r, 0.42); }
    for (let y = 0; y < sw.h; y++) for (let x = 0; x < sw.w; x++) if (sw.has(x, y) && m.has(x, y)) c.f.set(x, y, R[4]);
    c.dot(3.4, 3.3, 0.9, hex("#ffffff"));
    void u0;
  }, { orbit: { n: 3, stacks: true, kinds: 3, rx: 14, ry: 5, oy: 1, period: 2900, bob: 0.5, bobPeriod: 1500, backAlpha: 0.7, face: "shimmer" } });
  return { id: "rhythm", layers: [lay], ease: EASE };
}
/** Танец теней: сюрикен (4 изогнутых лезвия, сталь в 4 тона с фаской, контур, фиолетовый сердечник) — 8 кадров на четверть оборота. */
export function orbBlades(): Art {
  const S = RP.steel, F = RP.lilac;
  const lay = orbitLayer("shuriken", 9, 9, 8, 15, (c, t, u) => {
    const rot = u * (TAU / 4), m = c.mask();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * TAU) / 4, ca = Math.cos(a), sa = Math.sin(a), P = (r: number, w: number): [number, number] => [4.5 + ca * r - sa * w, 4.5 + sa * r + ca * w];
      m.poly([P(0.6, -1.7), P(4.3, 0.55), P(1.6, 1.4)]);
    }
    m.disc(4.5, 4.5, 1.9);
    shade(c.f, m, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.7 });
    const hole = c.mask().disc(4.5, 4.5, 0.85); for (let y = 0; y < hole.h; y++) for (let x = 0; x < hole.w; x++) if (hole.has(x, y)) c.f.set(x, y, F[4]);
  }, { n: 4, kinds: 1, rx: 15, ry: 5, oy: 0, period: -1500, bob: 0.4, bobPeriod: 1100, backAlpha: 0.7, face: "shimmer" });
  return { id: "dance", layers: [lay], ease: EASE };
}
/** Алый прилив: сфера крови 6.5 px (4 тона, блик, тёмный край) чуть дышит; снизу набухает капля 2×3, срывается, падает и гаснет. */
export function orbBlood(): Art {
  const B = RP.crimson;
  const lay = orbitLayer("drops", 9, 15, 8, 12, (c, t, u) => {
    const w = 0.18 * Math.sin(u * TAU * 2), m = c.mask().ell(4.5, 4.5, 3.2 + w, 3.2 - w);
    // капля: набухает (0–0.3), падает (0.3–0.85), гаснет
    const dm = c.mask();
    if (u < 0.3) { const g = easeOut(u / 0.3); dm.disc(4.5, 7.6 + g * 0.6, 0.6 + g * 0.6); }
    else if (u < 0.92) { const p = (u - 0.3) / 0.62, y = 8.9 + easeIn2(p) * 4.5; dm.disc(4.5, y, 1.0).poly([[3.6, y - 0.2], [5.4, y - 0.2], [4.5, y - 1.9]]); }
    const tmp = new PC(c.f.w, c.f.h);
    shade(tmp, m.clone().union(u < 0.3 ? dm : new Mask(m.w, m.h, m.D)), [B[0], B[1], B[2], B[3], B[4], B[5]], { mode: "round", out: hex("#14020a"), spec: 0.93 });
    if (u >= 0.3 && u < 0.92) { const tmp2 = new PC(c.f.w, c.f.h); shade(tmp2, dm, [B[1], B[2], B[3], B[4], B[5]], { mode: "round", out: hex("#14020a") }); tmp.blit(tmp2, 0, 0, false, u > 0.75 ? 1 - (u - 0.75) / 0.2 : 1); }
    c.f.blit(tmp, 0, 0);
  }, { n: 3, kinds: 1, rx: 13, ry: 4.5, oy: 2, period: 3300, bob: 0.5, bobPeriod: 1600, backAlpha: 0.7, face: "shimmer" }, "body", "over", [0.5, 4.5 / 15]);
  return { id: "tide", layers: [lay], ease: EASE };
}
const easeIn2 = (t: number) => t * t;
/** Осколки душ: череп (кость в 4 тона, контур, глазницы с зелёным огнём) с хвостом зелёного пламени против полёта; два блока кадров — летит вправо и влево. */
export function orbSouls(): Art {
  const Bo = RP.bone2, Fe = RP.fel, N = 8, W = 14, H = 10;
  const skull = (c: Cv, t: number, u: number, dir: number) => {
    const sx = dir > 0 ? 9.2 : W - 9.2, sy = 5;
    // хвост пламени — назад по полёту
    for (let i = 0; i < 3; i++) {
      const q = i / 3, x0 = sx - dir * (2.2 + q * 2.4), fl = Math.sin(u * TAU + i * 1.9) * 0.7;
      const m = c.mask().cap(x0, sy + fl * 0.4, x0 - dir * 3.8, sy - 1.6 + fl, 2.5 - q * 0.7, 0.4);
      const tone = i === 0 ? Fe[4] : i === 1 ? Fe[3] : Fe[2];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) c.f.set(x, y, withA(tone, 255 * (1 - q * 0.45)));
    }
    const m = c.mask().disc(sx, sy - 0.6, 3.3).rect(sx - 2.1, sy + 1.4, 4.2, 2.1);
    const tmp = new PC(c.f.w, c.f.h);
    shade(tmp, m, [Bo[1], Bo[2], Bo[3], Bo[4], Bo[5]], { mode: "round", out: INK });
    const eye = (ex: number) => { const e = c.mask().disc(ex, sy - 0.2, 0.95); for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (e.has(x, y)) tmp.set(x, y, hex("#0c1a0a")); };
    eye(sx - 1.3); eye(sx + 1.3);
    const lit = 0.5 + 0.5 * Math.sin(u * TAU);
    const cv2 = new Cv(W, H, c.D); cv2.f = tmp;
    cv2.dot(sx - 1.3 + dir * 0.2, sy - 0.3, 0.9, lit > 0.5 ? Fe[5] : Fe[4]); cv2.dot(sx + 1.3 + dir * 0.2, sy - 0.3, 0.9, lit > 0.5 ? Fe[5] : Fe[4]);
    for (let i = -1; i <= 1; i++) cv2.dot(sx + i * 1.1, sy + 2.6, 0.5, Bo[1]);
    c.f.blit(tmp, 0, 0);
  };
  const lay = L2("skulls", W, H, N * 2, 12, "body", "over", [0.5, 0.5], (c, t) => skull(c, t % N, (t % N) / N, t < N ? 1 : -1),
    { orbit: { n: 3, stacks: true, kinds: 1, rx: 15, ry: 5, oy: -3, period: 3100, bob: 0.7, bobPeriod: 1900, backAlpha: 0.62, face: "lr" } });
  return { id: "shards", layers: [lay], ease: EASE };
}
/** Оглушение: три жёлтые звезды (5 лучей, 3 тона, блик, контур) кружат над подписью, мерцают. */
export function orbStun(): Art {
  const G = RP.gold;
  // звезда крутится (за 8 кадров — 72°, симметрия 5), яркость дышит в 4 ступени
  const lay = L2("stars", 8, 8, 8, 12, "head", "top", [0.5, 0.5], (c, t, u) => {
    const e = 0.5 + 0.5 * Math.sin(u * TAU), pts: [number, number][] = [], rot = (u * TAU) / 5, lv = Math.round(e * 3);
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + (i * TAU) / 10, r = i % 2 ? 1.5 : 3.5; pts.push([4 + Math.cos(a) * r, 4.1 + Math.sin(a) * r]); }
    const m = c.mask().poly(pts);
    const R: Ramp = [G[1 + Math.min(1, lv)], G[2 + Math.min(1, lv)], G[3], G[4], lv >= 2 ? hex("#ffffff") : G[5]];
    shade(c.f, m, R, { out: hex("#3a1e04"), bevel: 0.8 });
  }, { orbit: { n: 3, kinds: 1, rx: 9, ry: 2.6, oy: -4, period: 1300, bob: 0.3, bobPeriod: 900, backAlpha: 0.7, face: "shimmer" } });
  return { id: "stun", layers: [lay], ease: { fadeIn: 120, fadeOut: 200, scaleIn: 0.7 } };
}
/** Броня из костей: три костяных щитка-наплечника 7×9 (кость в 5 тонов: свет сверху слева, тень снизу справа, фаска; гребень посередине
 *  со светлой кромкой и тёмной канавкой, иней по верхнему краю) медленно кружат у пояса — орбита шире и ниже (rx 17), спереди проходят
 *  у бёдер и закрывают героя меньше; по гребню стекает морозный блик. Задние — без приглушения альфой (не зеленеют на траве). */
export function orbBones(): Art {
  const Bo = RP.bone2, I = RP.ice;
  const lay = orbitLayer("plates", 9, 11, 8, 12, (c, t, u) => {
    const m = c.mask().poly([[1.0, 3.2], [1.9, 1.6], [3.4, 0.9], [5.6, 0.9], [7.1, 1.6], [8.0, 3.2], [7.6, 6.3], [6.2, 8.7], [4.5, 10.1], [2.8, 8.7], [1.4, 6.3]]);
    shade(c.f, m, [Bo[1], Bo[2], Bo[3], Bo[4], Bo[5]], { out: INK, bevel: 1.1, grad: 0.3 });
    const groove = c.mask().cap(5.25, 2.4, 5.0, 8.4, 0.38), ridge = c.mask().cap(4.25, 1.9, 4.35, 8.9, 0.42);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { if (!m.has(x, y)) continue; if (groove.has(x, y)) c.f.set(x, y, Bo[1]); else if (ridge.has(x, y)) c.f.set(x, y, Bo[5]); }
    // иней по верхней кромке (слева светлее)
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y) && !m.has(x, y - Math.round(c.D * 1.2)) && (y + 0.5) / c.D < 3.0) c.f.set(x, y, (x + 0.5) / c.D < 5 ? I[5] : I[4]);
    // морозный блик стекает по гребню
    const gy = 2.2 + easeInOut(u) * 6.2; c.dot(4.3, gy, 1.0, u > 0.85 ? I[4] : hex("#ffffff"));
  }, { n: 3, kinds: 1, rx: 17, ry: 4.5, oy: -1, period: 5000, bob: 0.6, bobPeriod: 2300, backAlpha: 1, face: "shimmer" });
  return { id: "bone", layers: [lay], ease: EASE };
}
/** Ураганный огонь: стрела (наконечник сталь, древко, зелёное оперение, лёгкий след) — 16 кадров по направлению полёта. */
export function orbArrows(): Art {
  const S = RP.steel, Bk = RP.bark, Lf = RP.leaf, DIRS = 16, RYX = 5.5 / 16, K = 1.2;
  // кадр k — стрела в точке орбиты под углом a = k·22.5°: направление полёта в 3D (−sin a, cos a) на плоскости, на экране y сжат как эллипс орбиты;
  // в краях орбиты стрела летит на зрителя или от него — короче (ракурс)
  const lay = L2("arrows", 16, 16, DIRS, 12, "body", "over", [0.5, 0.5], (c, t) => {
    const a = (t / DIRS) * TAU, vx = -Math.sin(a), vy = Math.cos(a) * RYX, len = Math.hypot(vx, vy), dx = vx / len, dy = vy / len, k = Math.max(0.42, len);
    const P = (s0: number, w0: number): [number, number] => { const s = s0 * K, w = w0 * K; return [8 + dx * s * k - dy * w, 8 + dy * s * k + dx * w]; };
    // след
    for (const [off, al] of [[0.9, 120], [-0.9, 80]] as const) { const tr = c.mask().cap(...P(-5.6, off), ...P(-9.6, off), 0.42, 0.15); for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) if (tr.has(x, y)) c.f.set(x, y, withA(hex("#e8fff0"), al)); }
    const shaft = c.mask().cap(...P(-5.0, 0), ...P(3.4, 0), 0.55);
    shade(c.f, shaft, [Bk[2], Bk[3], Bk[4], Bk[5], Bk[5]], { out: INK, bevel: 0.5 });
    const head = c.mask().poly([P(6.0, 0), P(2.7, -2.0), P(3.3, 0), P(2.7, 2.0)]);
    shade(c.f, head, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.6 });
    const fl = c.mask().poly([P(-5.8, 0), P(-3.4, -2.2), P(-2.0, -0.2), P(-2.0, 0.2), P(-3.4, 2.2)]);
    shade(c.f, fl, [Lf[1], Lf[2], Lf[3], Lf[4], Lf[5]], { out: INK, bevel: 0.6 });
  }, { orbit: { n: 3, kinds: 1, rx: 16, ry: 5.5, oy: -1, period: 1500, bob: 0.3, bobPeriod: 1000, backAlpha: 0.7, face: "angle", dirs: DIRS } });
  return { id: "barrage", layers: [lay], ease: EASE };
}
void flame; void cloud; void mix; void smooth; void Cv;
