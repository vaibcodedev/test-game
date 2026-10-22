/** Штандарт «Знамя защиты» (tp_banner, задача 127, шаг 4; задача 130 — утверждённый герб и ветер штандартов мира): большое знамя
 *  на высоком древке, колышется на ветру, кольцо ауры радиуса баффа и пыль установки.
 *  Символика по data/factions.json и утверждённым гербам (tools/gen/heraldry.ts, малая эмблема 24 px, рисунок не меняется).
 *  Сольгард: полотнище слоновой кости с широкой золотой каймой; герб «Восход над Оплотом» — щит лежит на нашитом медальоне лазури:
 *  стена с воротами на слоновой кости иначе сливалась с тканью того же тона. Дерево и золото: древко, перекладина, золотые набалдашники,
 *  кольца, бандажи и кисти, ленты золотая и лазурная, навершие — солнечный диск.
 *  Умбрат: чёрно-фиолетовое полотнище, пурпурная кайма, герб «Корона над гробом». Фурнитура — как на карточке герба (heraldry.ts, bannerCard)
 *  и у штандарта своих земель: древко и перекладина чернёного пурпура, набалдашники, кольца и бандажи — серебро, кисти сиреневые
 *  с зелёной искрой, ленты пурпурная и ядовито-зелёная, навершие — зубцы сиреневой короны.
 *  Холст 48×88, основание древка в точке привязки (0.5, 0.955). Ветер — модель штандартов мира (tools/gen/standards.ts): цикл 12 кадров,
 *  12 к/с; полотнище нарисовано плоско, в кадре строки сдвигаются целыми пикселями по плану на весь цикл (шаг ≤ 1 px за кадр, без
 *  возвратов через кадр, волна бежит от перекладины вниз), складки — сдвиг тона по рампе своего материала (цвета не выходят из палитры),
 *  кромки рябят. Герб — целиком и одним тоном (складки на него не ложатся), сдвигается вместе со строкой на своей середине.
 *  Ленты и кисти — по тем же правилам, с запаздыванием; кисть висит на углу полотнища, сдвинутом ветром в этом же кадре.
 *  Запуск отдельно: tsx tools/gen/vfx-banner.ts — tools/out/vfx-preview/banner-raw.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, OUTLINE, rng, hex, type RGBA } from "./canvas";
import { P } from "./palette";
import { storyboard, stackV } from "./vfx-lib";
import type { Gen } from "./vfx-gen";
import { factionEmblem, azureMedallion, SOLGARD_SHIELD_TOP } from "./heraldry";
import { WIND_FRAMES as N, WIND_FPS as FPS, WIND_HOME, windPlan, windCloth, planShifts, toneFn, layer, stamp, type Wind, type ToneFn, type ClothOut } from "./standards";

type Col = RGBA;
type Fac = "solgard" | "umbrath";
const TAU = Math.PI * 2;
const W = 48, H = 88, CX = 24, BASE_Y = 84;
const CW = 32, CH = 46, X0 = CX - CW / 2, Y0 = 19;   // полотнище: размер плоской текстуры и положение под перекладиной
/** Верх герба на полотнище: под каймой и внутренней линией. */
const EMBLEM_Y = 5;
const put = (f: PC, x: number, y: number, c: Col) => f.set(Math.round(x), Math.round(y), c);

// ---------------------------------------------------------------- палитра (tools/gen/palette.ts и цвета утверждённых гербов)
const G = P.gold;                                                                           // #6a4210 #a8681c #e0a630 #ffd864 #fff2b0
const GLOW = hex("#fff4c8");
const AZ = [hex("#12365e"), hex("#1f5a96"), hex("#3a86c8"), hex("#7ec8ff")];               // лазурь герба
/** Слоновая кость: тень (контур ворот герба), полутень (кость гербов Умбрата), тон, свет (стена герба), блик. */
const IV = [hex("#7a6a4c"), hex("#8f8468"), hex("#bfae88"), hex("#d6c8a4"), hex("#ece4cc")];
const UK = [hex("#0a0612"), hex("#100a1a"), hex("#22163a"), hex("#382858")];               // чернь Умбрата
const UP = [hex("#2a1846"), hex("#46265e"), hex("#6a3c8a"), hex("#9a62b8"), hex("#d0b4f0"), hex("#f4f0ff")];   // пурпур → сирень → жемчуг
const UG = [hex("#3fcf45"), hex("#7aff6a"), hex("#dcffd0")];                                 // ядовитая зелень
const SIL = [hex("#2c2838"), hex("#545066"), hex("#8a87a0"), hex("#c4c2d4")];               // серебро
const SOUT = hex("#3a2208"), UOUT = hex("#05030a");                                       // контур золота и черни
const WOOD = P.wood, STONE = P.stone, VG = P.magic.green, VP = P.magic.purple;

/** Набор фракции: полотнище (цвет по «лучевому» расстоянию до края d, 1 — край), ветер и тона складок, фурнитура, ленты, кисти, кольцо ауры. */
interface Kit {
  cloth: (x: number, y: number, d: number) => Col;
  /** Кайма, просвет и внутренняя линия — d ≤ lineD; медальон и герб держат от внутренней линии ≥ 1 px поля. */
  lineD: number;
  tone: ToneFn; wind: Wind;
  /** Древко (свет, тон, тень), бандажи и кольца (свет, тон, тень), перекладина — 4 строки сверху вниз, набалдашник — рампа тёмный → светлый. */
  pole: [Col, Col, Col]; band: [Col, Col, Col]; bar: [Col, Col, Col, Col]; knob: Col[];
  /** Контур металла (кольца, кисти, набалдашники). */
  metalOut: Col;
  /** Ленты (свет, тон, тень): левая и правая. */
  ribA: [Col, Col, Col]; ribB: [Col, Col, Col];
  /** Кисть: Y — блик, G — свет, g — тон, h — тень, e — искра в узле; шнур. */
  tassel: Record<string, Col>; cord: Col;
  /** Кольцо ауры: тёмный → светлый. */
  ring: Col[];
}
/** Ветер «Знамени защиты»: полотнище 46 строк. Снос мал, качание к низу до ~2 px, запаздывание ~1 цикла на высоту — волна бежит вниз,
 *  за кадр сдвигается малая часть строк (без общего толчка). Складки круче (наклон 0.3): на мелкой лесенке меньше миганий. Герб — один тон. */
const WIND: Wind = { ...WIND_HOME, lean: 0.5, sway: 1.8, lag: 6, slant: 0.3, embFlat: true };

const KITS: Record<Fac, Kit> = {
  solgard: {
    // кайма: золото 3 px с пунктиром шитья, просвет, внутренняя линия; поле — слоновая кость (как на утверждённой карточке)
    cloth: (x, y, d) => (d <= 3 || y < 4 ? (d === 1 || y === 0 ? G[3] : d === 3 ? G[1] : (x + y) % 4 === 0 ? G[4] : G[3]) : d === 5 ? G[1] : IV[2]),
    lineD: 5,
    tone: toneFn([IV, [G[0], G[1], G[2], G[3], G[4]]], [SOUT, OUTLINE]),
    wind: { ...WIND, fieldD: 6 },
    pole: [WOOD[3], WOOD[2], WOOD[1]], band: [G[3], G[2], G[1]], bar: [WOOD[3], WOOD[2], WOOD[1], WOOD[0]], knob: [G[1], G[2], G[3], G[4]],
    metalOut: SOUT,
    ribA: [G[3], G[2], G[1]], ribB: [AZ[3], AZ[2], AZ[1]],
    tassel: { Y: G[4], G: G[3], g: G[2], h: G[1], e: G[4] }, cord: G[2],
    ring: [G[0], G[1], G[2], G[3], GLOW],
  },
  umbrath: {
    // кайма: пурпур 2 px с сиреневым пунктиром, просвет, внутренняя линия; поле — чернь
    cloth: (x, y, d) => (d <= 2 || y < 3 ? (d === 1 || y === 0 ? UP[3] : d === 2 ? UP[2] : (x + y) % 4 === 0 ? UP[4] : UP[3]) : d === 4 ? UP[2] : UK[2]),
    lineD: 4,
    tone: toneFn([UK, UP], [UOUT, OUTLINE, ...UG]),
    wind: { ...WIND, fieldD: 5 },
    pole: [UP[2], UP[1], UK[1]], band: [SIL[3], SIL[2], SIL[1]], bar: [UP[2], UP[1], UP[0], UK[1]], knob: [SIL[0], SIL[1], SIL[2], SIL[3]],
    metalOut: UOUT,
    ribA: [UP[4], UP[3], UP[2]], ribB: [VG[2], VG[1], VG[0]],
    tassel: { Y: UP[4], G: UP[3], g: UP[2], h: UP[1], e: UG[1] }, cord: UP[3],
    ring: [UP[0], VP[1], VP[2], VP[3], UP[5]],
  },
};

/** Вариант Б для Сольгарда (на выбор пользователю, в игру не идёт): поле — белый шёлк, как у штандартов своих земель; герб без медальона. */
const WH = P.cloth.white;                                                                   // #7a7480 #aaa4ae #d6d0d8 #f6f2f8
const SILK_KIT: Kit = {
  ...KITS.solgard,
  cloth: (x, y, d) => (d <= 3 || y < 4 ? KITS.solgard.cloth(x, y, d) : d === 5 ? G[1] : WH[2]),
  tone: toneFn([WH, [G[0], G[1], G[2], G[3], G[4]]], [SOUT, OUTLINE]),
};

// ---------------------------------------------------------------- полотнище
/** Граница снизу: ласточкин хвост (V-вырез 11 строк). */
const bottom = (x: number) => CH - 1 - Math.round(11 * (1 - Math.abs((2 * x) / (CW - 1) - 1)));
const inCloth = (x: number, y: number) => x >= 0 && y >= 0 && x < CW && y < CH && y <= bottom(x);
/** «Лучевое» расстояние до края по 4 направлениям (до 9): кайма и внутренняя линия ложатся вдоль среза выреза ровной лесенкой. */
const rayD = (x: number, y: number) => { for (let d = 1; d <= 8; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (!inCloth(x + dx, y + dy)) return d; return 9; };

interface Cloth { tex: PC; emb: { pc: PC; x: number; y: number }; lineD: number }
function clothOf(fac: Fac, k: Kit): Cloth {
  const tex = new PC(CW, CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inCloth(x, y)) tex.set(x, y, k.cloth(x, y, rayD(x, y)));
  const em = factionEmblem(fac, "s24"), ex = Math.floor((CW - em.w) / 2);
  if (fac === "umbrath" || k === SILK_KIT) return { tex, emb: { pc: em, x: ex, y: EMBLEM_Y }, lineD: k.lineD };
  // нашитый медальон лазури под щитом (heraldry.ts): не ближе 1 px поля к внутренней линии каймы — в широкой части щита он уже
  const med = azureMedallion(em, SOLGARD_SHIELD_TOP.s24, (i, j) => rayD(ex - 2 + i, EMBLEM_Y - 2 + j) >= k.lineD + 2);
  return { tex, emb: { pc: med, x: ex - 2, y: EMBLEM_Y - 2 }, lineD: k.lineD };
}

// ---------------------------------------------------------------- кадр
/** Кисть на углу полотнища: шнур 1 px от угла (сдвинутого ветром в этом кадре) к узлу, кисть 3×4 (узел с бликом и искрой, перехват,
 *  юбка), свет сверху слева. Узел и юбка отстают от угла на кадр — качание с запаздыванием, не больше 1 px за кадр. */
const TASSEL = ["YeG", "hhh", "Ggh", "Ggh"];
function tassel(l: PC, k: Kit, ax: number, ay: number, kx: number) {
  // шнур: от угла (ax, ay) вниз 3 строки к узлу над kx; |kx − ax| ≤ 1 — ступенька не больше 1 px, линия непрерывна
  for (let j = 0; j < 3; j++) l.set(j < 2 ? ax : kx, ay + j, k.cord);
  stamp(l, kx - 1, ay + 3, TASSEL, k.tassel);
}

/** Ленты под полотнищем (слева и справа от древка): 3 px, свет слева; качаются с запаздыванием вниз по ленте, шаг ≤ 1 px за кадр;
 *  конец заострён (крайние столбцы на 2 строки короче). */
const RIB_Y = 50, RIB_LEN = 26;
const ribPlans = [0, 1].map((i) => planShifts(RIB_LEN, (t, v) => { const q = v / (RIB_LEN - 1); return 1.8 * q * q * Math.sin((TAU * t) / N - 1.1 - q * 2.4 - i * 0.7); }));
function ribbons(l: PC, k: Kit, t: number) {
  for (const i of [0, 1]) {
    const c = i ? k.ribB : k.ribA, x0 = CX + (i ? 3 : -6), plan = ribPlans[i][t];
    for (let v = 0; v < RIB_LEN; v++) for (let x = 0; x < 3; x++) {
      if (x !== 1 && v >= RIB_LEN - 2) continue;
      l.set(x0 + x + plan[v], RIB_Y + v, c[x]);
    }
  }
}

function bannerFrame(fac: Fac, k: Kit, t: number, cloth: Cloth): { f: PC; chk: ReturnType<typeof check> } {
  const f = new PC(W, H);
  // ----- тень на земле, каменное основание (свет сверху слева), древко с бандажами
  f.ellipse(CX, BASE_Y, 11, 3.4, hex("#10101a"));
  layer(f, (l) => {
    for (let y = 18; y <= BASE_Y - 4; y++) { l.set(CX - 1, y, k.pole[0]); l.set(CX, y, k.pole[1]); l.set(CX + 1, y, k.pole[2]); }
    for (const y of [70, 76]) for (let x = -1; x <= 1; x++) l.set(CX + x, y, k.band[x + 1]);
    for (let y = BASE_Y - 7; y <= BASE_Y; y++) {
      const half = 4 + Math.round((y - (BASE_Y - 7)) * 0.55);
      for (let x = -half; x <= half; x++) l.set(CX + x, y, y === BASE_Y - 7 ? STONE[4] : y === BASE_Y ? STONE[0] : x < -half + 2 ? STONE[3] : x > half - 2 ? STONE[1] : STONE[2]);
    }
  });
  // ----- ленты (за полотнищем)
  layer(f, (l) => ribbons(l, k, t));
  // ----- полотнище с ветром: строки по плану, складки по рампам, герб целиком одним тоном
  const co = windCloth(cloth.tex, cloth.emb, t, k.wind, k.tone);
  const chk = check(cloth, co);
  co.L.outline(OUTLINE);
  f.blit(co.L, X0 - co.M, Y0);
  // ----- кисти на нижних углах (кончики хвостов): угол — по сдвигу последней строки в этом кадре, узел отстаёт на кадр
  layer(f, (l) => {
    const last = CH - 1, sxAt = (q: number) => windShift(cloth, k, q, last);
    for (const u of [0, CW - 1]) tassel(l, k, X0 + u + sxAt(t), Y0 + CH, X0 + u + sxAt(t - 1));
  }, k.metalOut);
  // ----- перекладина с набалдашниками, кольца
  layer(f, (l) => {
    for (let x = 4; x <= W - 5; x++) for (let r = 0; r < 4; r++) l.set(x, 14 + r, k.bar[r]);
    for (const kx of [3, W - 4]) l.shadedEllipse(kx + 0.5, 15.5, 2.6, 3.2, k.knob);
    for (const rx of [X0 + 3, X0 + 11, X0 + CW - 12, X0 + CW - 4]) for (let y = 17; y <= 19; y++) { l.set(rx, y, k.band[0]); l.set(rx + 1, y, k.band[2]); }
  }, k.metalOut);
  // ----- навершие
  layer(f, (l) => {
    if (fac === "solgard") {
      // золотой солнечный диск с короткими лучами на стержне
      for (let q = 0; q < 8; q++) { const a = (q / 8) * TAU; put(l, CX + Math.cos(a) * 5.4, 7 + Math.sin(a) * 5.4, G[q % 2 ? 2 : 3]); put(l, CX + Math.cos(a) * 4.4, 7 + Math.sin(a) * 4.4, G[3]); }
      l.ellipse(CX, 7, 3.4, 3.4, G[2]); l.ellipse(CX - 0.4, 6.6, 2.6, 2.6, G[3]); put(l, CX - 1, 5, G[4]); put(l, CX, 5, G[4]);
      for (let y = 11; y <= 13; y++) { l.set(CX - 1, y, G[3]); l.set(CX, y, G[2]); }
    } else {
      // зубцы сиреневой короны с зелёным камнем
      for (const dx of [-4, 0, 4]) {
        l.poly([[CX + dx - 2, 13], [CX + dx + 2, 13], [CX + dx, dx === 0 ? 2 : 5]], UP[3]);
        put(l, CX + dx, dx === 0 ? 2 : 5, UP[4]); l.line(CX + dx, dx === 0 ? 3 : 6, CX + dx - 1, 12, UP[4], 1);
      }
      l.ellipse(CX, 13.5, 5, 1.6, UP[2]); put(l, CX, 12, VG[3]);
    }
  }, fac === "solgard" ? SOUT : UOUT);
  return { f, chk };
}
/** Сдвиг строки v полотнища в кадре t (по плану ветра; кадр берётся по кругу). */
function windShift(cloth: Cloth, k: Kit, t: number, v: number) {
  return windPlan(cloth.tex, k.wind).sx[((t % N) + N) % N][v];
}

/** Проверка кадра (до контура): герб с медальоном целиком (missing — пикселей герба нет на ткани), не наезжает на кайму и внутреннюю линию
 *  (over) и сколько его пикселей касается их (touch — допустимо: рябь кромки или строка, сдвинутая на 1 px против середины герба,
 *  на кадр-другой закрывает просвет поля между медальоном и внутренней линией). */
function check(cloth: Cloth, co: ClothOut) {
  const { tex, emb, lineD } = cloth, line = new Set<number>();
  for (let v = 0; v < CH; v++) for (let u = 0; u < CW; u++) if (tex.alpha(u, v) && rayD(u, v) <= lineD) { const X = co.at(u, v); if (X >= 0) line.add(v * 1000 + X); }
  let over = 0, touch = 0, missing = 0;
  for (let j = 0; j < emb.pc.h; j++) for (let i = 0; i < emb.pc.w; i++) {
    if (!emb.pc.alpha(i, j)) continue;
    const X = co.M + emb.x + i + co.edx, Y = emb.y + j;
    if (!co.L.alpha(X, Y)) missing++;
    if (line.has(Y * 1000 + X)) over++;
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => line.has((Y + b) * 1000 + X + a))) touch++;
  }
  return { over, touch, missing };
}

function banner(fac: Fac, k: Kit = KITS[fac]): Gen {
  const cloth = clothOf(fac, k);
  const frames: PC[] = [];
  for (let t = 0; t < N; t++) {
    const { f, chk } = bannerFrame(fac, k, t, cloth);
    if (chk.over || chk.missing) console.warn(`banner-${fac}: кадр ${t + 1} — герб наезжает на кайму (${chk.over} px) или неполон (${chk.missing} px)`);
    if (process.env.BANNER_DEBUG) console.log(`banner-${fac} ${t + 1}: касание ${chk.touch} px`);
    frames.push(f);
  }
  return { id: `banner-${fac}`, pack: "gen", role: "aura", frames, w: W, h: H, anchor: [0.5, BASE_Y / H], fps: FPS, blend: "normal", hero: "warrior" };
}

/** Кольцо ауры под знаменем: эллипс 0.7 радиуса баффа (D — диаметр, 2r умения, 130 → 260). Цикл 12 кадров, 12 к/с:
 *  ровное тройное кольцо (свет снаружи, тень внутри), по наружной линии медленно идут четыре блика (четверть оборота за цикл),
 *  засечки ползут по кругу на шаг за цикл (около 2 px за кадр) одним цветом — шов цикла чистый, внутри мерцают искры. */
function bannerRing(fac: Fac, D = 260): Gen {
  const R = KITS[fac].ring, rx = D / 2, ry = Math.round(rx * 0.7), w = D + 4, h = ry * 2 + 4, cx = w / 2, cy = h / 2, r = rng(77);
  const dots = Array.from({ length: 90 }, () => ({ a: r() * TAU, d: Math.sqrt(r()), ph: r() }));
  const steps = Math.round(rx * 7), TICKS = 28, SHEEN = 4;
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(w, h), ph = t / N;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU, c = Math.cos(a), s = Math.sin(a);
      const sheen = ((((a / TAU) * SHEEN - ph) % 1) + 1) % 1 < 0.22;                 // блик: доля 0.22 каждой четверти, ползёт на четверть за цикл
      put(f, cx + c * rx, cy + s * ry, R[sheen ? 3 : 2]); put(f, cx + c * (rx - 1.5), cy + s * (ry - 1), R[1]); put(f, cx + c * (rx - 3.5), cy + s * (ry - 2.5), R[0]);
    }
    for (let q = 0; q < TICKS; q++) { const a = ((q + ph) / TICKS) * TAU; for (let z = 0; z < 4; z++) put(f, cx + Math.cos(a) * (rx - 5 - z * 0.7), cy + Math.sin(a) * (ry - 3.5 - z * 0.5), z === 0 ? R[4] : R[3]); }
    for (const d of dots) if ((d.ph + ph) % 1 < 0.34) put(f, cx + Math.cos(d.a) * d.d * (rx - 8), cy + Math.sin(d.a) * d.d * (ry - 6), R[2]);
    return f;
  });
  return { id: `banner-ring-${fac}`, pack: "gen", role: "aoe", frames, w, h, anchor: [0.5, 0.5], fps: FPS, blend: "normal", hero: "warrior" };
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
/** Вариант Б Сольгарда (белый шёлк, без медальона) — только для превью и выбора. */
export function BANNER_SILK(): Gen {
  return { ...banner("solgard", SILK_KIT), id: "banner-solgard-silk" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/banner-raw.png");
  stackV(GENERATED_BANNER().filter((g) => g.id.startsWith("banner-s") || g.id.startsWith("banner-u") || g.id === "dust-puff").map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f ${g.fps}fps`, 3))).save(out);
  console.log(out);
}
