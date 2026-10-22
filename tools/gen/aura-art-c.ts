/** Обозначения, часть C (задача 129): эффекты зон на каждом юните внутри (знамя, круг света, гимн, покров, купель, туман, пелена, дым, огонь, время).
 *  Значки — двойной плотности над подписью (до 16 px), облака и огонь — плотности 1 у ног и по краям силуэта. */
import {
  PC, TAU, RP, INK, Mask, Cv, L1, L2, EASE, shade, outline, flat, ellScan, glow, sparkle, flame, flameMask, flameFill, cloud, hex, withA, rng,
  easeOut, easeIn, easeInOut, bell, stepTone, rimLight, puff, bayer, type Art, type Layer, type RGBA, type Ramp,
} from "./aura-lib";
import { emblemLayer } from "./aura-art-a";

const one = (id: string, layers: Layer[], extra: Partial<Art> = {}): Art => ({ id, layers, ease: EASE, ...extra });
const icon = (id: string, W: number, H: number, n: number, fps: number, draw: (c: Cv, t: number, u: number) => void, extra: Partial<Layer> = {}) =>
  L2(id, W, H, n, fps, "head", "top", [0.5, 1], draw, extra);
const fillM = (c: Cv, m: Mask, col: RGBA) => { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) c.f.set(x, y, col); };

/** Знамя защиты в круге: утверждённый герб фракции (малая эмблема из heraldry.ts), за ним дышит свет, вверх поднимаются искры; покачивание — в коде. */
function banner(fac: "solgard" | "umbrath"): Art {
  const lay = emblemLayer(fac, "head");
  const spark = fac === "solgard" ? [hex("#fffbe8"), hex("#ffd254"), hex("#d89a2a")] : [hex("#f0e8ff"), hex("#c8b0ff"), hex("#9a78e0")];
  // искры: дорисовать к кадрам ореола (плотности 2 и 3)
  const add = (frames: PC[], D: number) => frames.map((f, t) => {
    const c = new Cv(16, 16, D); c.f = f;
    for (let k = 0; k < 3; k++) { const p = (t / 12 + k / 3) % 1, x = 3 + k * 5 + Math.sin((p + k) * TAU) * 0.6, y = 15 - easeOut(p) * 9; if (bell(p, 0.2, 0.4) > 0.3) c.dot(x, y, 1, bell(p) > 0.8 ? spark[0] : spark[1]); }
    return c.f;
  });
  lay.frames = add(lay.frames, 2); lay.hi = add(lay.hi!, 3);
  lay.anchor = [0.5, 1]; lay.bob = { amp: 1, period: 2000 }; lay.variant = undefined;
  return one(`zone_banner_${fac}`, [lay]);
}
export const zoneBannerSol = () => banner("solgard");
export const zoneBannerUmb = () => banner("umbrath");

/** Круг света (как столб в HeavensFury, кадры 5–7): за героем по краям силуэта из земли бьют узкие лучи — главные 3 px, внешние 2 px,
 *  непрозрачные, в 4 тона (белое ядро, крем, золото, тёплая кромка); к верху сужаются и гаснут дизером, высота дышит, по каждому лучу
 *  вверх бежит светлая волна. На земле — пятно света: три кольца дышат в 5 ступеней (easing). Спереди опускаются пылинки 2×2. */
export function zoneCircle(): Art {
  const C = [hex("#ffffff"), hex("#fff4cc"), hex("#ffd466"), hex("#e0906a")], W = 44, H = 40, base = 36;
  const rays = [{ x: -11.5, w: 3, h: 25, ph: 0 }, { x: 11.5, w: 3, h: 24, ph: 0.5 }, { x: -16.5, w: 2, h: 16, ph: 0.25 }, { x: 16.5, w: 2, h: 17, ph: 0.75 }];
  const beam = L1("rays", W, H, 12, 12, "feet", "under", [0.5, base / H], (f, t, u) => {
    for (const r of rays) {
      const e = easeInOut(0.5 + 0.5 * Math.sin((u + r.ph) * TAU)), h = Math.round(r.h * (0.8 + 0.2 * e)), x0 = Math.round(W / 2 + r.x - r.w / 2);
      const wave = ((u * 2 + r.ph) % 1) * (h + 6) - 3;   // светлая волна поднимается по лучу
      for (let j = 0; j <= h; j++) {
        const y = base - j, q = j / h, w = q < 0.6 ? r.w : Math.max(2, r.w - 1);
        if (q > 0.68 && bayer(x0 + j, y) < (q - 0.68) / 0.32) continue;   // вершина гаснет дизером
        const lit = Math.abs(j - wave) < 2;
        for (let i = 0; i < w; i++) {
          // свет слева: левый край — крем, середина — белое ядро, правый край — тёплая кромка; у узкого луча — ядро и золото
          const k = w === 3 ? [1, 0, 3][i] : [0, 2][i];
          f.set(x0 + i + (w < r.w && r.x > 0 ? 1 : 0), y, C[Math.max(0, k - (lit ? 1 : 0))]);
        }
        // у земли луч расходится вспышкой: по пикселю тёплой кромки с боков (3 ряда)
        if (j < 3 && r.w === 3) { f.set(x0 - 1, y, C[j < 2 ? 2 : 3]); f.set(x0 + w, y, C[j < 2 ? 2 : 3]); }
      }
    }
    // световые шарики (как в HeavensFury): поднимаются вдоль главных лучей, ядро белое, кромка крем и золото, в конце — дизером
    for (const [rx0, ph] of [[-14, 0.15], [14, 0.65]] as const) {
      const p = (u + ph) % 1, x = W / 2 + rx0 + Math.sin(p * TAU) * 1.0, y = base - 4 - easeOut(p) * 22;
      const c = new Cv(W, H, 1); puff(c, [[x, y, 1.6]], [C[2], C[1], C[0]], C[3], p > 0.7 ? (p - 0.7) / 0.3 : 0); f.blit(c.f, 0, 0);
    }
  });
  // пятно света на земле: три кольца (тёплое, кремовое, белое ядро) дышат в 5 ступеней — быстрый подъём, медленный спад
  const pool = L1("pool", 32, 12, 12, 12, "feet", "ground", [0.5, 0.5], (f, t, u) => {
    const v = u < 0.3 ? easeOut(u / 0.3) : 1 - easeInOut((u - 0.3) / 0.7), lv = Math.round(v * 4);
    const bands: [number, number, RGBA, number][] = [[12 + lv * 0.6, 4.4 + lv * 0.2, C[2], 0.38 + lv * 0.05], [8.5 + lv * 0.5, 3.0 + lv * 0.15, C[2], 0.55 + lv * 0.06], [4.5 + lv * 0.5, 1.6 + lv * 0.12, C[1], 0.75 + lv * 0.06]];
    for (const [rx, ry, col, a] of bands) for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) if (((x + 0.5 - 16) / rx) ** 2 + ((y + 0.5 - 6) / ry) ** 2 <= 1) f.set(x, y, withA(col, 255 * Math.min(1, a)));
    if (lv >= 3) for (let x = 14; x < 18; x++) f.set(x, 6, C[0]);
    // блик 2 px обходит пятно по кромке — кадры не повторяются
    const ga = u * TAU, gx = Math.round(16 + Math.cos(ga) * (10.5 + lv * 0.6)), gy = Math.round(6 + Math.sin(ga) * (3.6 + lv * 0.2));
    f.set(gx, gy, C[0]); f.set(gx + 1, gy, C[1]);
  });
  const motes = L1("motes", W, H, 12, 12, "feet", "over", [0.5, base / H], (f, t, u) => {
    for (let k = 0; k < 3; k++) {
      const p = (u + [0, 0.36, 0.7][k]) % 1, x = Math.round(W / 2 + [-9.5, 9.5, -14][k] + Math.sin((p + k) * TAU) * 1.0), y = Math.round(4 + easeIn(p) * 30);
      if (p < 0.12 || (p > 0.85 && bayer(x, y) < (p - 0.85) / 0.15)) continue;
      f.set(x, y, C[0]); f.set(x + 1, y, C[2]); f.set(x, y + 1, C[2]); f.set(x + 1, y + 1, C[3]);
    }
  });
  return one("zone_circle", [beam, pool, motes]);
}

/** Гимн исцеления: золотые ноты (восьмая и пара со связкой, 3 тона, контур) поднимаются по краям силуэта, покачиваются и гаснут. */
export function zoneHymn(): Art {
  const G = RP.gold;
  const lay = L2("notes", 34, 34, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    [[-13, 6, 0, 0], [12.5, 2, 0.33, 1], [-11, -8, 0.66, 0]].forEach(([dx, dy, ph, kind]) => {
      const p = (u + ph) % 1, al = bell(p, 0.2, 0.4), x = 17 + dx + Math.sin((p * 1.5 + ph) * TAU) * 1.0, y = 17 + dy + 5 - easeOut(p) * 9;
      const m = c.mask();
      if (kind === 0) { m.ell(x - 0.9, y + 2.4, 1.6, 1.15, -0.4).rect(x + 0.2, y - 3.2, 0.95, 5.6).poly([[x + 0.2, y - 3.4], [x + 3.0, y - 1.6], [x + 2.8, y - 0.6], [x + 0.9, y - 1.9]]); }
      else { m.ell(x - 2.2, y + 2.5, 1.45, 1.05, -0.4).ell(x + 2.0, y + 1.7, 1.45, 1.05, -0.4).rect(x - 1.1, y - 2.6, 0.9, 5.0).rect(x + 3.1, y - 3.4, 0.9, 5.0).poly([[x - 1.1, y - 2.6], [x + 4.0, y - 3.4], [x + 4.0, y - 2.2], [x - 1.1, y - 1.4]]); }
      const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, [G[1], G[2], G[3], G[4], G[5]], { out: hex("#3a1e04"), bevel: 0.5 }); c.f.blit(tmp, 0, 0, false, al);
    });
  });
  return one("zone_hymn", [lay]);
}

/** Покров веры: золотой нимб (кольцо с фаской и контуром) с двумя крыльями из трёх перьев; крылья чуть взмахивают (easing), свет обходит нимб. */
export function zoneAegis(): Art {
  const G = RP.gold, Wt = [hex("#8a7a58"), hex("#c8b888"), hex("#f0e4b4"), hex("#fff8d8"), hex("#ffffff")];
  const lay = icon("halo", 18, 10, 12, 12, (c, t, u) => {
    const cx = 9, cy = 5.6, flap = easeInOut(0.5 + 0.5 * Math.sin(u * TAU));
    glow(c, cx, cy, 6.4, 3.8, G[4], 0.12 + 0.08 * flap, 2);
    for (const sg of [-1, 1]) {
      const wm = c.mask();
      for (let i = 0; i < 3; i++) { const a = -0.35 - i * 0.38 + flap * 0.22, L = 4.6 - i * 0.9, x0 = cx + sg * 3.6; wm.cap(x0, cy + 0.6, x0 + sg * Math.cos(a) * L, cy + 0.6 + Math.sin(a) * L, 0.95 - i * 0.12, 0.32); }
      shade(c.f, wm, Wt, { out: hex("#3a2a10"), bevel: 0.5 });
    }
    const ring = c.mask().ell(cx, cy, 4.4, 2.0).ell(cx, cy, 3.0, 1.0, 0, "sub");
    shade(c.f, ring, [G[1], G[2], G[3], G[4], G[5]], { out: hex("#3a1e04"), bevel: 0.5 });
    rimLight(c.f, ring, u * TAU, 0.5, hex("#ffffff"), c.D - 1);
  });
  return one("zone_aegis", [lay]);
}

/** Багровая купель: золотой кубок (фаска, контур) с кровью — поверхность колышется бликом, снизу в кубок поднимаются капли; покачивание — в коде. */
export function zonePool(): Art {
  const G = RP.gold, B = RP.crimson;
  const lay = icon("chalice", 12, 15, 12, 12, (c, t, u) => {
    for (let k = 0; k < 2; k++) { const p = (u + k * 0.5) % 1, y = 14.5 - easeOut(p) * 9, x = 6 + (k ? 2.6 : -2.6) * (1 - p), al = bell(p, 0.2, 0.3); if (al > 0.2) { const m = c.mask().disc(x, y, 0.85); const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, [B[1], B[2], B[3], B[4], B[5]], { mode: "round", out: hex("#1a0206") }); c.f.blit(tmp, 0, 0, false, al); } }
    const cup = c.mask().fill((x, y) => y >= 1.6 && y <= 6.8 && Math.abs(x - 6) <= 4.9 * Math.sqrt(Math.max(0, 1 - ((y - 1.6) / 5.4) ** 2.2)));
    const stem = c.mask().rect(5.2, 6.6, 1.6, 3.6), base = c.mask().ell(6, 10.8, 3.2, 1.1);
    const gold = cup.clone().union(stem).union(base);
    shade(c.f, gold, [G[1], G[2], G[3], G[4], G[5]], { out: INK, bevel: 0.7 });
    const blood = c.mask().ell(6, 2.2, 4.0, 1.05);
    shade(c.f, blood, [B[1], B[2], B[3], B[4], B[5]], { out: null, mode: "round" });
    const gx = 3.2 + easeInOut(0.5 + 0.5 * Math.sin(u * TAU)) * 4.6; c.dot(gx, 2.0, 0.8, B[5]); c.dot(gx + 0.8, 2.0, 0.6, hex("#ffffff"));
  }, { bob: { amp: 1, period: 1900 } });
  return one("zone_pool", [lay]);
}

/** Дымовая завеса: плотные клубы дыма, как в паках, — непрозрачные, в 3 тона (тень, середина, свет сверху слева) с тёмной кромкой 1 px —
 *  стелются у ног: семь клубов по эллипсу медленно обходят ноги (за цикл клуб встаёт на место соседа), каждый «кипит» — его доли
 *  перекатываются и дышат; задние — за героем, передние — перед ним, не выше щиколотки. Дважды за цикл от клуба отрывается клочок,
 *  поднимается, сжимается и растворяется дизером (без альфы). Фазы зависят только от места на эллипсе — стык цикла без рывка. */
export function zoneSmoke(): Art {
  const T: [RGBA, RGBA, RGBA] = [hex("#7e8498"), hex("#b9bfcd"), hex("#f0f2f7")], OUT = hex("#454a5c");
  const W = 54, H = 30, cx = 27, cy = 20, rx = 16, ry = 5.2, N = 8;
  const wisps = [{ x: -11, y: -4, ph: 0, front: false }, { x: 12, y: 2.5, ph: 0.5, front: true }];
  const make = (front: boolean) => L1(front ? "front" : "back", W, H, 12, 12, "feet", front ? "over" : "under", [0.5, cy / H], (f, t, u) => {
    const c = new Cv(W, H, 1);
    const items = Array.from({ length: N }, (_, i) => { const a = ((i + u) / N) * TAU + 0.2; return { a, s: Math.sin(a) }; }).sort((p, q) => p.s - q.s);
    for (const it of items) {
      if ((it.s >= 0) !== front) continue;
      const x = cx + Math.cos(it.a) * rx, y = cy + it.s * ry - 1.6, r = 3.4 + it.s * 0.6 + 0.45 * Math.sin(3 * it.a + u * TAU), b = 2 * it.a + u * TAU;
      puff(c, [[x - Math.cos(b) * r * 0.72, y + 0.9 - Math.sin(b) * 0.4, r * 0.7], [x + Math.cos(b) * r * 0.78, y + 0.7 + Math.sin(b) * 0.5, r * 0.76], [x, y - 0.4, r]], T, OUT);
    }
    for (const w of wisps) {
      if (w.front !== front) continue;
      const p = (u + w.ph) % 1, x = cx + w.x + Math.sin(p * TAU) * 0.8, y = cy + w.y - 1 - easeOut(p) * 10, r = 2.3 * (1 - 0.45 * p);
      puff(c, [[x + r * 0.6, y + r * 0.45, r * 0.62], [x, y, r]], T, OUT, p > 0.55 ? 0.2 + ((p - 0.55) / 0.45) * 0.8 : 0);
    }
    f.blit(c.f, 0, 0);
  });
  return one("zone_smoke", [make(false), make(true)]);
}

/** Чумной туман: на земле — лужа миазмов (болотная зелень в 3 тона, внизу глубже, глянец сверху слева; тёмно-зелёный контур 1 px), край
 *  колышется; в луже всплывают и лопаются пузыри. За героем по бокам из лужи поднимаются два языка скверны (3 тона, контур, как облака
 *  у черепа в PoisonMagicEffect), с вершины отрывается и тает дизером клочок; перед героем поднимаются споры 2×2. Альфы нет. */
export function zoneDoom(): Art {
  const OUT = hex("#0c1e08"), D = [hex("#1c300a"), hex("#33520e"), hex("#5a7c16"), hex("#9ab82e"), hex("#d0e858"), hex("#f4ffb0")];
  const W = 48, H = 22, cx = 24, cy = 11, rx = 15, ry = 5.4;
  const poolMask = (u: number) => new Mask(W, H, 1).fill((x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, th = Math.atan2(dy, dx);
    return Math.hypot(dx, dy) <= 1 + 0.07 * Math.sin(3 * th + u * TAU) + 0.045 * Math.sin(5 * th - 2 * u * TAU);
  });
  const bubbles = [{ x: -9, y: 1.2, ph: 0 }, { x: 8.5, y: 1.8, ph: 0.4 }, { x: -2.5, y: 3.2, ph: 0.72 }];
  const pool = L1("pool", W, H, 12, 12, "feet", "ground", [0.5, cy / H], (f, t, u) => {
    const m = poolMask(u), d = m.dist(4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m.has(x, y)) continue;
      const k = d[y * W + x], up = y + 0.5 < cy - 1.2, left = x + 0.5 < cx + 4;
      f.set(x, y, k <= 1 ? (up && left ? D[3] : D[2]) : k <= 2.2 ? (up && left ? D[2] : D[1]) : D[0]);
    }
    outline(f, m, OUT);
    const c = new Cv(W, H, 1);
    for (const b of bubbles) {
      const p = (u + b.ph) % 1, x = cx + b.x, y = cy + b.y;
      if (p < 0.72) puff(c, [[x, y - easeOut(p / 0.72) * 0.8, 0.8 + easeOut(p / 0.72) * 1.3]], [D[2], D[4], D[5]], OUT);
      else if (p < 0.9) { const q = (p - 0.72) / 0.18, rr = new Mask(W, H, 1).disc(x, y - 0.8, 1.8 + q * 1.2).disc(x, y - 0.8, 0.9 + q * 1.2, "sub"); flat(c.f, rr, D[4]); }
    }
    f.blit(c.f, 0, 0);
  });
  // языки скверны за героем: изгиб по синусу, вершина отрывается клочком
  const TH = 34, base = 30;
  const tongues = L1("tongues", W, TH, 12, 12, "feet", "under", [0.5, base / TH], (f, t, u) => {
    const c = new Cv(W, TH, 1);
    for (const [dx, h, ph] of [[-12.5, 12, 0], [12.5, 14, 0.5]] as const) {
      // язык — цепочка клубов (снизу толще), по ней вверх бежит волна изгиба; клубы одной маской: 3 тона и контур
      const hh = h * (0.9 + 0.1 * Math.sin((u * 2 + ph) * TAU)), lean = dx < 0 ? -1.4 : 1.4, discs: [number, number, number][] = [];
      let tx = 0, ty = 0;
      for (let i = 0; i < 5; i++) {
        const s = i / 4, sw = Math.sin((u + ph) * TAU - s * 2.4) * 1.5 * s;
        tx = cx + dx + sw + lean * s; ty = base - 1 - s * hh;
        discs.push([tx, ty, 2.9 - s * 1.7]);
      }
      const tm = c.mask(); for (const [x, y, r] of discs) tm.disc(x, y, r);
      const tmp = new PC(W, TH); shade(tmp, tm, [D[2], D[2], D[3], D[4], D[4]], { mode: "round", out: OUT, th: [-0.2, 0.42, 0.8, 1.1], light: [-0.55, -0.8] }); c.f.blit(tmp, 0, 0);
      const p = (u + ph) % 1, wx = tx + lean * 0.5 + Math.sin(p * 4) * 1.0, wy = ty - 2.2 - easeOut(p) * 7;
      puff(c, [[wx, wy, 1.8 * (1 - p * 0.4)], [wx + 1.0, wy + 0.8, 1.2 * (1 - p * 0.4)]], [D[2], D[3], D[4]], OUT, p > 0.5 ? 0.2 + ((p - 0.5) / 0.5) * 0.8 : 0);
    }
    f.blit(c.f, 0, 0);
  });
  // споры перед героем: 2×2 (свет сверху слева), поднимаются по синусу, в конце пути — дизером
  const spores = L1("spores", W, TH, 12, 12, "feet", "over", [0.5, base / TH], (f, t, u) => {
    for (let k = 0; k < 4; k++) {
      const p = (u + k / 4) % 1, x = Math.round(cx + [-9, 7, -4, 11][k] + Math.sin((p + k * 0.3) * TAU) * 1.2), y = Math.round(base - 1 - easeOut(p) * 12);
      if (p > 0.82 && bayer(x, y) < (p - 0.82) / 0.18 + 0.2) continue;
      f.set(x, y, D[5]); f.set(x + 1, y, D[4]); f.set(x, y + 1, D[4]); f.set(x + 1, y + 1, D[3]);
    }
  });
  return one("zone_doom", [pool, tongues, spores]);
}

/** Пелена тьмы: полумесяц (шар в 4 тона, контур) и три звезды ночи — мерцают по очереди (6 ступеней), полумесяц дышит ореолом. */
export function zoneVeil(): Art {
  const Lc = RP.lilac;
  const lay = icon("moon", 16, 12, 12, 12, (c, t, u) => {
    const e = 0.5 + 0.5 * Math.sin(u * TAU);
    glow(c, 6, 6.5, 5.4, 5.4, Lc[3], 0.12 + e * 0.1, 2);
    const m = c.mask().disc(6, 6.5, 4.6).disc(8.1, 5.2, 3.9, "sub");
    shade(c.f, m, [Lc[1], Lc[2], Lc[3], Lc[4], Lc[5]], { mode: "round", out: INK });
    [[11.6, 2.4, 0], [13.6, 7.6, 0.33], [9.6, 9.8, 0.66]].forEach(([x, y, ph]) => {
      const v = 0.5 - 0.5 * Math.cos((u + ph) * TAU), lv = Math.round(v * 5);
      if (lv === 0) { c.dot(x, y, 1, Lc[3]); return; }
      sparkle(c, x, y, 0.9 + lv * 0.42, [lv >= 4 ? hex("#ffffff") : Lc[5], Lc[4], Lc[3]], { thick: 0.5 });
    });
  });
  return one("zone_veil", [lay]);
}

/** Огненная стена: на земле под юнитом — горящая кромка (кольцо мелких языков, тлеющая земля), искры летят вверх (слой над героем). */
export function zoneFire(): Art {
  const Fl = RP.flame, W = 46, H = 22, cx = 23, cy = 14, rx = 15, ry = 5.5;
  const ground = L1("edge", W, H, 12, 12, "feet", "ground", [0.5, cy / H], (f, t, u) => {
    const c = new Cv(W, H, 1);
    glow(c, cx, cy, rx + 1, ry + 1, hex("#ff5a14"), 0.3, 3); glow(c, cx, cy, rx - 3, ry - 1.5, hex("#2a0a04"), 0.35, 2);
    const n = 14;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.sin((a * TAU) / n) - Math.sin((b * TAU) / n));
    for (const i of order) {
      const a = (i * TAU) / n, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry + 1, ph = (i * 0.37) % 1;
      const h = 3.2 + 2.2 * (0.5 + 0.5 * Math.sin((u + ph) * TAU)) + (Math.sin(a) > 0 ? 0.8 : 0);
      flame(c, x, y, h, 1.45, Math.sin((u * 2 + ph) * TAU) * 0.7, [Fl[0], Fl[1], Fl[2], Fl[3], Fl[4]], 1);
    }
    f.blit(c.f, 0, 0);
  });
  const sparks = L1("sparks", W, 34, 12, 12, "feet", "over", [0.5, 30 / 34], (f, t, u) => {
    for (let k = 0; k < 5; k++) {
      const p = (u + k / 5) % 1, x = cx + [-13, 12, -6, 7, 15][k] + Math.sin((p * 2 + k) * TAU) * 1.2, y = 30 - easeOut(p) * 22, al = bell(p, 0.1, 0.5);
      if (al < 0.2) continue;
      f.set(Math.round(x), Math.round(y), withA(p < 0.4 ? Fl[4] : Fl[3], 255 * al));
      if (p < 0.35) f.set(Math.round(x), Math.round(y) + 1, withA(Fl[2], 200 * al));
    }
  });
  return one("zone_fire", [ground, sparks]);
}

/** Искажение времени (в поле): песочные часы — рамка (фаска, контур), стекло, золотой песок пересыпается за цикл, струйка песка; покачивание — в коде. */
export function zoneTime(): Art {
  const A = RP.arcane, G = RP.gold;
  const lay = icon("hourglass", 10, 14, 12, 12, (c, t, u) => {
    const glass = c.mask().fill((x, y) => { const q = Math.abs(y - 7) / 5.2; if (y < 1.8 || y > 12.2) return false; const w = 0.7 + 3.0 * Math.pow(q, 0.8); return Math.abs(x - 5) <= w; });
    flat(c.f, glass, withA(hex("#e0f0ff"), 70));
    const top = 1 - u, sandT = c.mask().fill((x, y) => glass.has(Math.floor(x * c.D), Math.floor(y * c.D)) && y < 7 && y > 7 - 4.6 * top + 0.2);
    const sandB = c.mask().fill((x, y) => glass.has(Math.floor(x * c.D), Math.floor(y * c.D)) && y > 12.0 - 4.4 * Math.max(0.12, u) && y > 7.5);
    shade(c.f, sandT.union(sandB), [G[1], G[2], G[3], G[4], G[5]], { out: null, mode: "round" });
    if (u < 0.94) { for (let y = 7; y < 12; y += 1) c.dot(5, y + ((t % 2) * 0.5), 0.5, G[4]); }
    outline(c.f, glass, withA(INK, 200));
    const frame = c.mask().rect(0.8, 0.4, 8.4, 1.6).rect(0.8, 12.0, 8.4, 1.6).rect(1.2, 1.8, 1.0, 10.4).rect(7.8, 1.8, 1.0, 10.4);
    shade(c.f, frame, [A[1], A[2], A[3], A[4], A[5]], { out: INK, bevel: 0.5 });
  }, { bob: { amp: 1, period: 2100 } });
  return one("zone_time", [lay]);
}
void ellScan; void flameMask; void flameFill; void rng; void stepTone; void fillM; void sparkle; void easeIn;
