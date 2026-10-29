/**
 * Земля, раунд 2 (на утверждение, в игру по умолчанию не идёт): почва без сетки штрихов, брусчатка трёх стилей (Аурелион — светлый известняк,
 * Мортхейм — тёмный камень с фиолетовым, Эмберхолл — тёплый), снег с настом, следами и бликами, лёд, песок; выжженная трава вокруг гари.
 * Формат строк тот же, что tools/gen/ground.ts (dual grid). groundRows2(out) — перерисовать строки почвы, песка, снега, льда;
 * cobbleRow(стиль) — строка брусчатки 18 тайлов.
 */
import { PC, hash01, hex, mix, pnoise, rng, shade, withA, ramp, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { T } from "../../shared/map";
import { DARK, ashSurf, blob, bogSurf, clump, crack, grassSurf, makeTile, pebble, ripple, tuft, voro, type Surface } from "./ground";

const S = 32;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Пятно-маска в тайле: заливка цветом по функции (x, y, верх-край, низ-край). */
function patch(pc: PC, seed: number, cx: number, cy: number, rx: number, ry: number, col: (x: number, y: number, top: boolean, bot: boolean) => RGBA | null) {
  const inside = blob(seed, cx, cy, rx, ry);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (!inside(x, y)) continue;
    const c = col(x, y, !inside(x, y - 1), !inside(x, y + 1));
    if (c) pc.set(x, y, c);
  }
}
/** Цепочка следов: пары вмятин вдоль линии с шагом, тень в вмятине и светлый бортик снизу. */
function steps(pc: PC, x0: number, y0: number, n: number, dx: number, dy: number, dent: RGBA, rim: RGBA) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = Math.round(x0 + dx * i - dy * side * 1.2), y = Math.round(y0 + dy * i + dx * side * 0.6);
    pc.set(x, y, dent); pc.set(x + 1, y, dent); pc.set(x, y + 1, rim); pc.set(x + 1, y + 1, rim);
  }
}
const clod = (pc: PC, x: number, y: number, R: Ramp, w: number) => {
  for (let i = 0; i < w; i++) { pc.set(x + i, y, i === 0 ? R[4] : R[3]); pc.set(x + i, y + 1, R[1]); pc.set(x + i + 1, y + 2, withA(DARK, 60)); }
};

/** Почва: ровная основа без штрихов; вариант 1 — сырое тёмное пятно и камни, 2 — вытоптанная светлая плешь со следами, 3 — трещины, комья, пучок. */
function dirt2(): Surface {
  const R = P.dirt;
  return {
    base: () => mix(R[2], R[3], 0.45), // светлее: стекло читается ночью на зуме 3
    n: 7,
    minD: 6,
    shared: 2,
    kind(k, v, shared) {
      if (shared) return "pebble";
      if (v === 0) return k < 0.5 ? "pebble" : "clod";
      if (v === 1) return k < 0.5 ? "stones" : "pebble";
      if (v === 2) return k < 0.6 ? "clod" : "pebble";
      return k < 0.35 ? "crack" : k < 0.65 ? "clod" : k < 0.8 ? "tuft" : "pebble";
    },
    under(pc, v) {
      if (v === 1) patch(pc, 3101, 15, 16, 7, 4, (_x, _y, top) => (top ? R[1] : mix(R[1], R[2], 0.45)));
      if (v === 2) {
        patch(pc, 3102, 16, 15, 8, 4.5, (_x, _y, top, bot) => (bot ? R[2] : top ? R[4] : mix(R[2], R[3], 0.6)));
        steps(pc, 8, 13, 5, 4, 1, R[1], R[3]);
      }
      if (v === 3) patch(pc, 3103, 10, 20, 4, 2.4, (_x, _y, top) => (top ? R[1] : mix(R[1], R[2], 0.5)));
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "pebble") pebble(pc, x, y, k < 0.5 ? P.stone : [R[0], R[1], R[3], R[4]], k < 0.3 ? 3 : 2, 2);
      else if (s.kind === "stones") { pebble(pc, x, y, P.stone, 3, 2); pebble(pc, x + 4, y + 1, P.stone, 2, 2); pebble(pc, x + 1, y + 3, [R[1], R[2], R[3], R[4]], 2, 2); }
      else if (s.kind === "clod") clod(pc, x, y, R, 2 + Math.floor(k * 3));
      else if (s.kind === "crack") crack(pc, x - 3, y, 4 + Math.floor(k * 6), Math.floor(k * 1e6), R[0], R[3]);
      else tuft(pc, x, y, P.grass, 3, 4, k);
    },
    edge: "fray",
    rimIn: R[1],
    shadow: [20, 10, 6, 50],
  };
}

/** Песок: рябь, сырое тёмное пятно (1), цепочка следов (2), россыпь камешков (3). */
function sand2(): Surface {
  const R = P.sand;
  return {
    base: () => R[2],
    n: 7,
    minD: 6,
    shared: 2,
    kind(k, v, shared) { return shared ? "ripple" : k < 0.55 ? "ripple" : k < 0.75 ? "fleck" : v === 3 ? "pebble" : "shell"; },
    under(pc, v) {
      if (v === 1) patch(pc, 4101, 15, 16, 7, 3.6, (_x, _y, top) => (top ? R[1] : mix(R[1], R[2], 0.5)));
      if (v === 2) steps(pc, 6, 18, 6, 4, -1, R[1], R[4]);
      if (v === 3) { pebble(pc, 12, 14, [R[0], R[1], R[3], R[4]], 3, 2); pebble(pc, 17, 16, P.stone, 2, 2); pebble(pc, 14, 19, [R[0], R[1], R[3], R[4]], 2, 2); }
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "ripple") ripple(pc, x, y, 4 + Math.floor(k * 6), R[4], R[1], k);
      else if (s.kind === "fleck") { pc.set(x, y, R[1]); pc.set(x + 1, y, R[1]); pc.set(x + 1, y - 1, R[3]); }
      else if (s.kind === "pebble") pebble(pc, x, y, [R[0], R[1], R[3], R[4]], 2, 2);
      else { pc.set(x, y, [244, 232, 216, 255]); pc.set(x + 1, y, [226, 196, 180, 255]); pc.set(x - 1, y, [200, 160, 150, 255]); pc.set(x, y + 1, withA(DARK, 50)); }
    },
    edge: "rim",
    rimIn: R[1],
    rimOut: [214, 236, 250, 150],
  };
}

const BLUE: RGBA = [92, 116, 168, 255];
const DEEPB: RGBA = [70, 92, 150, 255];
/** Сугроб: объём в 3 тона (свет сверху слева), синяя тень вправо-вниз. */
function mound(pc: PC, x: number, y: number, w: number, h: number, R: Ramp, B: RGBA) {
  pc.ellipse(x + 2, y + 1.6, w, h * 0.8, withA(DEEPB, 120));
  pc.ellipse(x, y, w, h, mix(B, BLUE, 0.25));
  pc.ellipse(x - 0.6, y - 0.6, w - 1, h - 0.7, R[3]);
  pc.ellipse(x - 1.6, y - 1.2, w - 2.6, h - 1.4, R[4]);
}
/** Снег: наст с глянцем и тенью кромки (1), глубокая цепочка следов (2), надув с крупным сугробом (3); сугробы, искры, рябь. */
function snow2(): Surface {
  const R = P.snow, B = R[2];
  const spark = (pc: PC, x: number, y: number) => { pc.set(x, y, [255, 255, 255, 255]); pc.set(x - 1, y, R[4]); pc.set(x + 1, y, R[4]); pc.set(x, y - 1, R[4]); pc.set(x, y + 1, R[4]); };
  return {
    base: () => B,
    n: 7,
    minD: 7,
    shared: 2,
    kind(k, _v, shared) { return shared ? (k < 0.5 ? "drift" : "glint") : k < 0.35 ? "drift" : k < 0.55 ? "spark" : k < 0.7 ? "mound" : "glint"; },
    under(pc, v) {
      if (v === 1) patch(pc, 5101, 15, 15, 9, 4.5, (x, y, top, bot) => (bot ? mix(B, DEEPB, 0.5) : top ? [255, 255, 255, 255] : (x - y + 40) % 6 === 0 ? R[4] : R[3])); // наст: глянец, блик, тень кромки
      if (v === 2) steps(pc, 4, 21, 7, 4, -1.6, mix(B, DEEPB, 0.7), R[4]);
      if (v === 3) { patch(pc, 5103, 15, 19, 10, 3.2, (_x, _y, top) => (top ? R[3] : mix(B, BLUE, 0.35))); mound(pc, 14, 14, 6, 3, R, B); }
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "drift") ripple(pc, x, y, 4 + Math.floor(k * 5), R[4], mix(B, BLUE, 0.5), k);
      else if (s.kind === "spark") spark(pc, x, y);
      else if (s.kind === "glint") { pc.set(x, y, R[4]); pc.set(x + 1, y, [255, 255, 255, 255]); }
      else mound(pc, x, y, 3.5 + k * 2.5, 2 + k * 0.8, R, B);
    },
    edge: "lip",
    lip: [mix(R[1], BLUE, 0.4), mix(R[0], DEEPB, 0.3)],
    hi: R[4],
    shadow: [50, 70, 130, 110],
  };
}

/** Лёд: прозрачная глубина — тёмное окно с градиентом и бликом (1), сеть трещин с инеем (2, 3); длинные косые блики, пузырьки; у берега — иней. */
function ice2(): Surface {
  const R = P.ice;
  const streak = (pc: PC, x: number, y: number, len: number) => { for (let i = 0; i < len; i++) { pc.set(x + i, y - i, R[4]); pc.set(x + i + 1, y - i, R[3]); if (i < len - 2) pc.set(x + i + 3, y - i, R[3]); } };
  return {
    base: () => R[2],
    n: 6,
    minD: 7,
    shared: 2,
    kind(k, _v, shared) { return shared ? "glint" : k < 0.35 ? "crack" : k < 0.6 ? "streak" : k < 0.8 ? "bubble" : "glint"; },
    under(pc, v) {
      if (v === 1) { patch(pc, 6101, 15, 16, 8, 5, (_x, y, top, bot) => (top ? R[1] : bot ? R[3] : y < 14 ? R[0] : y < 17 ? mix(R[0], R[1], 0.5) : R[1])); streak(pc, 10, 19, 5); }
      if (v === 2) { crack(pc, 4, 14, 22, 6202, [250, 254, 255, 255], R[1]); crack(pc, 12, 20, 12, 6203, R[4], R[1]); }
      if (v === 3) { crack(pc, 5, 10, 20, 6301, R[4], R[1]); crack(pc, 9, 21, 14, 6302, R[4], R[1]); streak(pc, 20, 26, 4); }
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "crack") crack(pc, x - 3, y, 5 + Math.floor(k * 7), Math.floor(k * 1e6), R[4], R[1]);
      else if (s.kind === "streak") streak(pc, x, y, 3 + Math.floor(k * 3));
      else if (s.kind === "glint") { pc.set(x, y, R[4]); pc.set(x + 1, y - 1, R[4]); }
      else { pc.set(x, y, R[4]); pc.set(x + 1, y, R[3]); pc.set(x, y + 1, R[3]); pc.set(x + 3, y + 2, R[4]); }
    },
    edge: "rim",
    rimIn: [236, 248, 255, 255], // иней у берега
    rimOut: [250, 254, 255, 170],
  };
}

export type CobbleStyle = "solgard" | "umbrath" | "ember" | "plain";
const COBBLE: Record<CobbleStyle, { R: Ramp; mortar: RGBA; moss: RGBA[]; accent?: Ramp }> = {
  plain: { R: P.cobble, mortar: P.cobble[0], moss: [P.moss[1], P.moss[2]] }, // форты, поселения, дороги
  solgard: { R: ramp("#5c5850", "#888276", "#aca594", "#cbc4b2", "#e8e2d0"), mortar: hex("#46423a"), moss: [P.moss[1], P.moss[2]] },
  umbrath: { R: ramp("#3c3842", "#565060", "#6e6878", "#888292", "#a6a0ae"), mortar: hex("#24202a"), moss: [hex("#2a3a34"), hex("#3a5046")], accent: ramp("#2e2838", "#463e56", "#5e5474", "#786c90", "#9488aa") },
  ember: { R: ramp("#3e3430", "#5c4f48", "#74665c", "#8c7d70", "#a69686"), mortar: hex("#2a2220"), moss: [P.moss[0], P.moss[1]] },
};
/** Брусчатка стиля: камни-ячейки с фаской (3 ступени света), разный тон и редкие камни «акцента», мох в швах (сильнее у варианта 2), износ (вариант 3 — гладкие светлые камни), трещинки. */
function cobble2(style: CobbleStyle): Surface {
  const st = COBBLE[style], R = st.R;
  const near = voro(811, 4, 5, 7);
  return {
    base(x, y, v) {
      const a = near(x, y, v);
      if (a.e < 1.3) {
        const mossy = hash01(Math.floor(x / 2), Math.floor(y / 2), 880 + v) < (v === 2 ? 0.3 : 0.05);
        return mossy ? st.moss[hash01(x, y, 881) < 0.4 ? 1 : 0] : st.mortar;
      }
      const tone = a.t, rr = st.accent && tone > 0.93 ? st.accent : R;
      let k = 2 + (style === "ember" ? (tone > 0.6 ? 0.3 : 0) : tone > 0.66 ? 0.5 : tone < 0.3 ? -0.5 : 0); // у Эмберхолла 2–3 близких тона
      const worn = v === 3 || tone > 0.8;
      const lit = (x + 0.5 - a.cx) + (y + 0.5 - a.cy) < 0;
      if (a.e < 2.2) k += lit ? (worn ? 0.8 : 1.4) : (worn ? -0.6 : -1.1); // фаска
      else if (a.e < 3.4) k += lit ? 0.5 : -0.35; // вторая ступень — объём
      if (worn && a.e > 3) k += 0.4; // вытертая середина
      // трещинка по камню
      if (!worn && hash01(Math.round(a.cx), Math.round(a.cy), 890) < 0.18 && Math.abs((x - a.cx) - (y - a.cy) * 0.6) < 0.6 && a.e > 2.4) k = 0.6;
      return rr[clamp(Math.round(k), 0, 4)];
    },
    n: 2,
    minD: 9,
    kind: (_k, v, shared) => (!shared && v === 2 ? "weed" : null),
    draw(pc, s) { tuft(pc, s.x, s.y, P.grass, 3, 3, s.k, false); },
    // бордюр: ровная кромка, полоса камня 3 px со стыками, торец 3 px вниз и тень (площадь чуть выше земли)
    edge: "lip",
    calm: 0.4,
    band: { w: 3, top: R[3], lit: R[4], seam: st.mortar, joint: 7 },
    lip: [R[2], R[1], st.mortar],
    shadow: [10, 8, 14, 100],
  };
}

function row(sf: Surface, t: number): PC {
  const out = new PC(18 * S, S);
  for (let mask = 1; mask <= 15; mask++) out.blit(makeTile(sf, t, mask, 0), (mask - 1) * S, 0);
  for (let v = 1; v <= 3; v++) out.blit(makeTile(sf, t, 15, v), (14 + v) * S, 0);
  return out;
}
/** Строка брусчатки стиля (18 тайлов). */
export const cobbleRow = (style: CobbleStyle) => row(cobble2(style), T.Cobble);
/** Перерисовать строки почвы, песка, снега, льда вариантом раунда 2. */
// ---------- трава с берегом, болото, вулкан ----------
/** Луг: дёрн поднят над тропой и водой — бровка 4 px (дёрн + земляная стенка), как берег выше воды. */
function grass2(): Surface { return { ...grassSurf(P.grass, 210), lip: [P.grass[1], P.dirt[2], P.dirt[1], P.dirt[0]] }; }
/** Болото: трясина с кочками; окна тёмной воды разной формы с ряской и осокой по краю; топкий берег 2 px. */
function bog2(): Surface {
  const base = bogSurf(), R = P.bog;
  const W0: RGBA = [22, 34, 34, 255], W1: RGBA = [30, 46, 46, 255], WH: RGBA = [92, 118, 108, 255], DW: RGBA[] = [P.moss[2], hex("#6a8a3a")];
  // окна воды: эллипс с шумной кромкой (не выходит за 1,15 радиуса — целиком внутри тайла); 1 — большое, 2 — среднее и малое, 3 — вытянутое
  const POOLS: Record<number, [number, number, number, number][]> = { 1: [[16, 16, 12, 7]], 2: [[10, 10, 7, 4], [23, 23, 4.5, 2.6]], 3: [[16, 18, 11, 4.5]] };
  return {
    ...base,
    extra(pc, v) {
      for (const [i, [cx, cy, rx, ry]] of (POOLS[v] ?? []).entries()) {
        const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + (pnoise(x, y, 8, S, 5100 + v * 31 + i) - 0.5) * 0.6 < 1;
        for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
          if (!inside(x, y)) { if (inside(x, y - 1) || inside(x - 1, y) || inside(x + 1, y)) pc.set(x, y, R[1]); continue; }
          const up = inside(x, y - 1), up2 = inside(x, y - 2), up3 = inside(x, y - 3), dn = inside(x, y + 1);
          let c: RGBA = !up ? R[0] : !up2 ? hex("#2a2a1e") : !up3 ? W0 : !dn ? WH : W1; // топкий край, внутренняя стенка, тёмная вода, отсвет у ближнего края
          if (up3 && dn && hash01(x >> 1, y >> 1, 5300 + v) < 0.1) c = DW[hash01(x, y, 5301) < 0.5 ? 0 : 1]; // ряска
          pc.set(x, y, c);
        }
        if (rx > 4) { tuft(pc, Math.round(cx - rx + 2), Math.round(cy - ry + 1), [R[0], R[2], R[4], mix(R[4], P.grass[4], 0.4)], 4, 6, 0.3); clump(pc, Math.round(cx + rx - 5), Math.round(cy + ry), [R[1], R[2], R[3], R[4], mix(R[4], P.moss[2], 0.5)], 6, 0.6); }
      }
    },
    edge: "lip",
    lip: [R[1], hex("#2a2a1e")],
    shadow: [8, 12, 8, 80],
  };
}
/** Пепел вулкана: корка поднята над лавой — торец 3 px (пепел → базальт), снизу отсвет лавы. */
function ash2(): Surface { return { ...ashSurf(), edge: "lip", lip: [P.ash[1], P.ash[0], hex("#1a1418")], shadow: [255, 120, 40, 60] }; }
/** Обсидиан и застывшая лава: гладкое тёмное стекло без плиток — крупные пятна тона внутри варианта, косые блики, редкие трещины; жилы магмы — трещины у варианта 2; край над лавой — торец и отсвет. */
function obsidian2(): Surface {
  const R = P.obsidian;
  const GL: RGBA[] = [hex("#a8341a"), hex("#ee6a22"), hex("#ffc060")];
  const streak = (pc: PC, x: number, y: number, len: number) => { for (let i = 0; i < len; i++) { pc.set(x + i, y - i, R[4]); if (i < len - 1) pc.set(x + i + 1, y - i, R[3]); } };
  return {
    base: () => R[2],
    n: 6,
    minD: 7,
    shared: 2,
    kind: (k, v, shared) => (shared ? (k < 0.6 ? "glint" : "chip") : v === 2 && k < 0.3 ? "vein" : k < 0.5 ? "streak" : k < 0.65 ? "crack" : k < 0.8 ? "chip" : "glint"), // больше бликов — стекло, а не клякса
    under(pc, v) {
      if (v === 1) patch(pc, 1331, 15, 15, 9, 5, (x, y, top, bot) => (top ? R[4] : bot ? R[1] : (x + y) % 5 === 0 ? R[3] : mix(R[2], R[3], 0.5))); // стеклянная линза: блик по кромке и косые отсветы
      if (v === 3) patch(pc, 1333, 16, 17, 8, 4, (_x, _y, top, bot) => (top ? R[3] : bot ? R[1] : R[2]));
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "streak") streak(pc, x, y, 3 + Math.floor(k * 3));
      else if (s.kind === "glint") { pc.set(x, y, R[4]); pc.set(x + 1, y - 1, R[3]); }
      else if (s.kind === "chip") pebble(pc, x, y, [R[0], R[1], R[3], R[4]], 2, 2);
      else if (s.kind === "vein") crack(pc, x - 3, y, 6 + Math.floor(k * 6), Math.floor(k * 1e6), GL[0], null, [GL[1], GL[2]]);
      else crack(pc, x - 2, y, 4 + Math.floor(k * 6), Math.floor(k * 1e6), R[0], R[3]);
    },
    edge: "lip",
    lip: [R[2], R[1], R[0]],
    hi: R[4],
    shadow: [255, 120, 40, 70],
  };
}

// ---------- выжженная земля (на утверждении): опалённая трава → обугленная → пепелище, переходы — тем же dual grid, что трава ↔ земля ----------
const BR = {
  singed: ramp("#1e2412", "#3a4422", "#5c5e2c", "#7e7038", "#2a2016"), // пучок: тёмное основание, оливково-бурое тело, чёрный кончик
  char: ramp("#0e0b0a", "#1a1412", "#261d18", "#3a2d24", "#52412f"),
  soil: ramp("#1c1612", "#2a211a", "#372b22", "#46372b"),
  ash: ramp("#3e3936", "#57514c", "#726a63", "#8f867d", "#ada39a"),
  ember: ramp("#5a1a10", "#b0381a", "#f07028", "#ffc060"),
};
/** Тлеющий уголёк: 2–3 px, яркая середина, тёмный край. */
function coal(pc: PC, x: number, y: number, k: number) {
  pc.set(x, y, BR.ember[k > 0.5 ? 2 : 1]); pc.set(x + 1, y, BR.ember[0]);
  if (k > 0.7) { pc.set(x, y - 1, BR.ember[3]); pc.set(x - 1, y, BR.ember[1]); }
}
/** Нанос пепла: неровный плоский бугор, светлый верх, тень снизу. */
function drift(pc: PC, x: number, y: number, rx: number, ry: number, k: number) {
  const seed = Math.floor(k * 1e6), inside = (X: number, Y: number) => ((X + 0.5 - x) / rx) ** 2 + ((Y + 0.5 - y) / ry) ** 2 + (pnoise(X + 64, Y + 64, 4, 8192, seed) - 0.5) * 0.8 < 1;
  for (let Y = Math.floor(y - ry - 2); Y <= y + ry + 2; Y++) for (let X = Math.floor(x - rx - 2); X <= x + rx + 2; X++) {
    if (!inside(X, Y)) { if (inside(X - 1, Y - 1)) pc.set(X, Y, withA(DARK, 50)); continue; }
    pc.set(X, Y, !inside(X, Y - 1) ? BR.ash[3] : !inside(X, Y + 1) ? BR.ash[0] : BR.ash[2]);
  }
}
/** Опалённая трава: бурые пучки с чёрными кончиками на тёмно-оливковой земле; край — отдельные опалённые пучки в живую траву. */
function singed(): Surface {
  const R = BR.singed, B = mix(mix(R[1], R[2], 0.35), P.grass[1], 0.45); // ближе к живой траве — мягкий переход
  return {
    base: () => B,
    n: 18, minD: 4, shared: 9,
    kind: (k, v, shared) => (shared ? (k < 0.5 ? "tuft" : "mark") : v === 2 && k < 0.2 ? "char" : k < 0.6 ? "tuft" : k < 0.85 ? "mark" : "dry"),
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "tuft") tuft(pc, x, y, [R[0], R[1], R[2], R[3], R[4]], 4 + Math.floor(k * 2), 4 + Math.floor(k * 3), k);
      else if (s.kind === "dry") tuft(pc, x, y, [R[0], R[2], R[3], hex("#9a8444")], 3, 4, k);
      else if (s.kind === "char") tuft(pc, x, y, BR.char, 3, 3, k);
      else { pc.set(x, y, R[0]); pc.set(x + 1, y - 1, R[0]); pc.set(x + 2, y, R[0]); pc.set(x, y - 1, R[3]); }
    },
    edge: "fray",
    rimIn: R[0],
    shadow: [12, 10, 6, 60],
    strays: "tuft",
  };
}
/** Обугленная трава: спёкшаяся тёмная земля, стоящая чёрная стерня с тенью, хлопья пепла, редкие угольки и головешки. */
function charred(): Surface {
  const R = BR.char, S0 = BR.soil;
  return {
    base: (x, y) => (pnoise(x, y, 8, S, 2410) > 0.6 ? S0[2] : S0[1]),
    n: 16, minD: 4, shared: 8,
    kind: (k, v, shared) => (shared ? (k < 0.65 ? "stub" : "flake") : v === 1 && k < 0.18 ? "coal" : v === 3 && k < 0.2 ? "brand" : k < 0.6 ? "stub" : k < 0.85 ? "flake" : "coal"),
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "stub") tuft(pc, x, y, R, 3 + Math.floor(k * 3), 3 + Math.floor(k * 3), k);
      else if (s.kind === "flake") { pc.set(x, y, BR.ash[2]); pc.set(x + 1, y, BR.ash[1]); if (k > 0.5) pc.set(x, y - 1, BR.ash[3]); }
      else if (s.kind === "coal") coal(pc, x, y, k);
      else { // головешка с тенью
        for (let i = 0; i < 6; i++) { pc.set(x - 3 + i + 1, y + 2, withA(DARK, 100)); pc.set(x - 3 + i, y, i % 3 ? R[1] : R[0]); pc.set(x - 3 + i, y - 1, R[3]); pc.set(x - 3 + i, y + 1, R[0]); }
        pc.set(x + 3, y, BR.ember[1]);
      }
    },
    edge: "fray",
    rimIn: S0[0],
    shadow: [8, 6, 4, 70],
    strays: "stub",
  };
}
/** Пепелище: серые наносы пепла с мягким рельефом, чёрные угли и тлеющие точки, обломки головешек. */
function ashField(): Surface {
  const A = BR.ash;
  return {
    base: (x, y) => (pnoise(x, y, 8, S, 2510) > 0.55 ? A[1] : mix(A[0], A[1], 0.5)),
    n: 8, minD: 7, shared: 3,
    kind: (k, v, shared) => (shared ? (k < 0.6 ? "drift" : "cinder") : k < 0.45 ? "drift" : k < 0.7 ? "cinder" : v > 0 && k < 0.85 ? "coal" : "stub"),
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "drift") drift(pc, x, y, 4 + k * 3, 1.8 + k, k);
      else if (s.kind === "cinder") { pc.set(x, y, BR.char[0]); pc.set(x + 1, y, BR.char[1]); pc.set(x, y - 1, BR.char[3]); pc.set(x + 1, y + 1, withA(DARK, 60)); }
      else if (s.kind === "coal") coal(pc, x, y, k);
      else tuft(pc, x, y, BR.char, 2, 3, k);
    },
    edge: "soft",
    rimIn: A[0],
    shadow: [10, 8, 6, 50],
  };
}

export function groundRows2(out: PC) {
  const sfs: [T, Surface][] = [[T.Dirt, dirt2()], [T.Sand, sand2()], [T.Snow, snow2()], [T.Ice, ice2()], [T.Grass, grass2()], [T.Bog, bog2()], [T.Ash, ash2()], [T.Obsidian, obsidian2()], [T.Cobble, cobble2("plain")],
    [T.CobbleSol, cobble2("solgard")], [T.CobbleUmb, cobble2("umbrath")], [T.CobbleEmber, cobble2("ember")],
    [T.Singed, singed()], [T.Charred, charred()], [T.AshField, ashField()]];
  for (const [t, sf] of sfs) {
    out.data.fill(0, t * S * out.w * 4, (t + 1) * S * out.w * 4);
    out.blit(row(sf, t), 0, t * S);
  }
}

void mix;
