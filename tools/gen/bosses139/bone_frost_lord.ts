/**
 * Задача 139, босс кольца: Ледяной владыка (восток, слот r65n, Костяной хребет, ур. 65, группа 4–5; карточка — docs/bosses-139.md,
 * раздел 3.3 п. 13 и «Раскладка референсов»: топот, ледяные копья, носильщики). Образ — референс tools/out/refs/bosses-139/08.jpg
 * (высокий синекожий владыка в чёрной короне с двумя рогами, серебряные волосы, меховой ворот, угольные наплечники в сосульках,
 * тёмный длинный сюртук с бирюзовой каймой и ледяным подолом, посох с ледяной звездой, огромный плащ-хвост, тянущийся по земле) —
 * только для сравнения: чужой арт в игру и в git не идёт.
 *
 * Метод — как у капеллана (sol_fallen_chaplain.ts): общий движок tools/gen/mobs/lib.ts, тело в двойном разрешении (160×160) сводится
 * в кадр 80×80, ступни на y = 75; 5 тонов на материал, выборочный контур 1 px, холодный контровой свет по краю. Светится ночью:
 * ядро на груди, кристалл и звезда посоха, глаза, самоцвет короны, ледяной иней.
 *
 * Эффекты льда (листы): кольцо топота, ледяное копьё, ледяной круг сборки. Кадры умений — топот, копья, сборка (призыв), гибель.
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/bone_frost_lord.ts [--quick|--sil] →
 *   tools/out/bosses139/r65n-e-compare.png («наш | референс»), frost-sheet.png, frost-glow.png, frost-fx-*.png.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PC, PX, R, Scene, VIEWS, add, clamp, cross, crop, depthOf, easeIn, easeInOut, easeOut, fill, fromView,
  groundBg, hash01, hex, ik, lerp, lerpV, linear, loadPC, mat, mix, mul, nightRect, norm, perp, renderScene, rot, scaleNN,
  scr, sealPinholes, shadowBlob, snapPx, stackRows, stampRows, sub, text, thicken, toView, TAU,
  type Cam, type Mat, type RGBA, type Row, type StampPx, type V3, type View,
} from "../mobs/lib";
import { OUT, selout } from "../mobs/rig";

export const ID = "umb_frost_lord";
export const FRAME = 80;
export const FRAME_H = 80;
const FW = FRAME, FH = FRAME_H;
const N = FW;
const CAM: Cam = { N: FW, CX: 40, GY: 75.4 };
const RS = 2;
const CAMR: Cam = { N: 160, CX: 80, GY: 150.8 };
const RX0 = 0;
/** Модель → пиксели кадра 1×: макушка короны 58 → ≈ 64 px, навершие посоха ≈ 72 px. */
const K = 1.15;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Угольная сталь наплечников, короны, посоха: холодные тени, блик — сизый. */
const STEEL = R("#06080c", "#10151d", "#1e2733", "#34455a", "#6f88a6");
/** Мех воротника — холодный уголь. */
const FUR = R("#0a0c10", "#181c22", "#292f38", "#3f4854", "#5d6a7a");
/** Сюртук — глубокая синева; бирюзовая кайма — ICE. */
const ROBE = R("#070913", "#0e1328", "#192342", "#273660", "#3b5388");
const CLOAK = R("#06080b", "#0e1217", "#171d25", "#232d39", "#364555");
/** Кожа владыки — ледяная синева. */
const SKIN = R("#0b2a4c", "#15508c", "#2e82cc", "#60b6ee", "#a6e4fb");
const HAIR = R("#4a5058", "#7f858e", "#b2b8c2", "#dde2ea", "#ffffff");
/** Лёд тела: кайма, сосульки, подол (не светится). */
const ICE = R("#093650", "#106a8a", "#22a0ba", "#5ccedc", "#b4f2f4");
/** Свет льда: ядро груди, кристалл посоха, звезда, глаза (светится). */
const GLOWC = R("#06344a", "#0c7aa0", "#18c4e0", "#7cf0f8", "#ecffff");
/** Иней, вспышки, блики. */
const FIRE = R("#3e6a88", "#80b4d0", "#b8dcee", "#e2f4fc", "#ffffff");
/** Снежная пыль у земли. */
const SAND = R("#2a3a48", "#506a80", "#7c98ae", "#aac4d6", "#d6e8f2");
/** Зелёный самоцвет короны (светится). */
const GEM = R("#04301c", "#0a6a3a", "#18b068", "#60e8a0", "#c8ffe0");
const DEAD = R("#101214", "#202427", "#363b40", "#4e555b", "#6a737b");
const VOID = hex("#05080c");

const M = {
  steel: mat("сталь", STEEL, { base: 1.55, gain: 2.3, hi: 4 }),
  fur: mat("мех", FUR, { base: 1.8, gain: 2.2 }),
  robe: mat("сюртук", ROBE, { base: 1.7, gain: 2.3 }),
  cloak: mat("плащ", CLOAK, { base: 1.8, gain: 2.3 }),
  skin: mat("кожа", SKIN, { base: 2.0, gain: 2.2 }),
  hair: mat("волосы", HAIR, { base: 2.3, gain: 2.0 }),
  ice: mat("лёд", ICE, { base: 2.2, gain: 2.0, crisp: true }),
  glow: mat("свет льда", GLOWC, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
  gem: mat("самоцвет", GEM, { base: 2.6, gain: 1.2, glow: true, crisp: true }),
};
const WCACHE = new Map<string, Mat>();
function wm(m: Mat, w: number): Mat {
  const s = Math.round(clamp(w, 0, 1) * 3);
  if (!s) return m;
  const key = `${m.name}:${s}`;
  let q = WCACHE.get(key);
  if (!q) {
    q = { ...m, ramp: m.ramp.map((c, i) => mix(c, DEAD[Math.min(i, 4)], (s / 3) * 0.5)), glow: m.glow && s < 2 };
    WCACHE.set(key, q);
  }
  return q;
}
const isEmisCol = (() => {
  const s = new Set<string>();
  for (const c of [...GLOWC, ...GEM, ...FIRE]) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки [правый — хват посоха, левый — раскрытая ладонь]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** посох: [хват, направление к навершию]; sg — от пятки до хвата; held — в руке */
  stf: [V3, V3]; sg: number; held: number;
  armLift: [number, number];
  /** волна по плащу, размах, отлёт хвоста; шаг (колени) и подъём стопы под сюртуком [пр, лев] */
  wave: number; waveAmp: number; flare: number; kick: [number, number]; foot: [number, number];
  /** свет льда 0..1,6; звезда налита светом 0..1,5; увядание; уход тела вниз; сюртук оседает 0..1; корона падает */
  glow: number; charge: number; wither: number; sink: number; collapse: number; crownOff: number;
  /** иней у ладони 0..1, позёмка у ног 0..1, искры вокруг навершия 0..1, осколки гибели 0..1 */
  palm: number; mist: number; sparks: number; shards: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number];
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 25;
const NECK: V3 = [0, 0.4, 45];
const ARM: [number, number] = [10.5, 10.5];
const STAFF_L = 58;
const staffAt = (butt: V3, dir: V3, sg: number): [V3, V3] => {
  const d = norm(dir);
  return [add(butt, mul(d, sg)), d];
};
const STF_FRONT = staffAt([14.6, 3.0, 0], [0.02, 0.03, 1], 30);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.08, yaw: 0, roll: 0.02, hp: -0.04, hy: 0, hr: 0,
  hand: [STF_FRONT[0], [-17, 9, 30]], pole: [[1, -0.4, -0.8], [-1, -0.6, -0.5]],
  stf: STF_FRONT, sg: 30, held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, flare: 0, kick: [0, 0], foot: [0, 0],
  glow: 1, charge: 0.5, wither: 0, sink: 0, collapse: 0, crownOff: 0,
  palm: 0.5, mist: 0.5, sparks: 0.4, shards: 0,
  ring: 0, flash: 0, dust: [0, 0], t: 0, seed: 1,
};
const STF_SIDE = staffAt([9.0, 9.0, 0], [0, 0.03, 1], 30);
const REST_SIDE: Pose = { ...REST_FRONT, hand: [STF_SIDE[0], [-6.5, 11.5, 31]], pole: [[1, -0.4, -0.8], [-1, 0.2, -0.6]], stf: STF_SIDE };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.sink]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
/** Строки штампа → двойное разрешение (каждый знак — блок 2×2). */
const rowsOf2 = (rs: string[], x0: number, y0: number): StampPx[] => stampRows(rs.flatMap((r) => { const w = [...r].map((c) => c + c).join(""); return [w, w]; }), x0 * 2, y0 * 2);
const ST_FACE: Partial<Record<View, StampPx[]>> = {
  down: rowsOf2(["ddd..ddd", "3cc..cc3", "3cc..cc3", "........", "...kk..."], -4, -1),
  side: rowsOf2(["ddd", "3cc", "3cc", "...", "kk."], -1, -1),
};
const ST_CORE: Partial<Record<View, StampPx[]>> = {
  down: rowsOf2(["...2...", "..232..", ".23432.", "..232..", "...2..."], -3, -2),
  side: rowsOf2(["2", "3", "4", "3", "2"], 0, -2),
};
function stampKeys(glow: number, wither: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  const b = (c: RGBA) => mix(c, DEAD[2], wither * 0.8);
  return { d: SKIN[0], k: b(SKIN[1]), c: lv(4), "2": lv(2), "3": lv(3), "4": lv(4) };
}
const GLOW_KEYS = ["c", "2", "3", "4"];

// ---------------- сцена ----------------
interface Extra {
  rings: { c: V3; r: number; k: number }[];
  flash: { at: V3; k: number } | null;
  dust: { at: V3; k: number }[];
  glints: V3[];
  /** искры: центр, сила, радиус орбиты (px), число; иней ладони */
  sparks: { at: V3; k: number; r: number; n: number }[];
  palm: { at: V3; k: number } | null;
  shards: { at: V3; k: number }[];
  mist: number; mistAt: V3;
}
type Tex = (c: { l: V3; edge: boolean }) => number | { mat: Mat; d: number };

/** Навершие: центр звезды на высоте SC от пятки. */
const SC = 57;
const ID3: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Ледяной владыка в координатах модели (затем ×K·RS). */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { rings: [], flash: null, dust: [], glints: [], sparks: [], palm: null, shards: [], mist: 0, mistAt: [0, 0, 0] };
  // вбок: корпус и голова чуть к зрителю (три четверти) — видны ядро и лицо
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.24, hy: p0.hy - 0.12 } : p0;
  const W = p.wither;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PXM, hz = p.headZ * PXM;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 32): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.25, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const keys = stampKeys(p.glow, W);
  const col = p.collapse;
  const alive = p.sink < 30;
  const wv = (i: number, amp = 1) => Math.round(p.waveAmp * amp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.23)))) * PXM;
  const folds: Tex = (c) => {
    if (c.edge) return 0;
    const f = Math.sin(Math.atan2(c.l[1], c.l[0]) * 9 + 0.6);
    return f > 0.82 ? -0.9 : f < -0.9 ? 0.45 : 0;
  };
  const furTex: Tex = (c) => {
    const f = Math.sin(c.l[0] * 3.3 + Math.sin(c.l[2] * 2.1) * 1.3) * Math.sin(c.l[1] * 2.6 + c.l[2] * 1.7);
    return f > 0.45 ? 0.8 : f < -0.5 ? -0.8 : 0;
  };

  // ---------- плащ-хвост: длинная лента от левого плеча, шире у плеча, острая на конце, лежит по земле; второй, короткий лоскут ----------
  {
    const g = S.group(1.3);
    const fl = p.flare, sw = Math.round(p.waveAmp * 1.4 * Math.sin(TAU * p.wave)) * PXM;
    const ribbon = (P0: V3, P1: V3, P2: V3, w0: number, segs: number, seed: number, tone: number, tipIce: boolean) => {
      const B = (u: number): V3 => {
        const a = lerpV(P0, P1, u), b = lerpV(P1, P2, u);
        const q = lerpV(a, b, u);
        const wob = wv(Math.round(u * 6) + seed, 1.2) * u;
        const lat = Math.round(p.waveAmp * 0.9 * Math.sin(TAU * (p.wave + u * 1.2 + seed * 0.2)) * u) * PXM;
        const z = lerp(q[2], Math.max(0.6, q[2] * 0.15), col) + wob;
        return [q[0] + sw * u * 0.5 + lat * 0.4, q[1] + lat, Math.max(0.5, z)];
      };
      const n0At = (u: number): V3 => norm(lerpV([0.35, 0.9, 0.25], [0.1, 0.25, 1], clamp((u - 0.25) / 0.6, 0, 1)));
      const rp = S.newPart();
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs, u1 = (i + 1) / segs, um = (u0 + u1) / 2;
        const a = B(u0), b = B(u1), c = lerpV(a, b, 0.5);
        const t = norm(sub(b, a)), wd = norm(cross(t, n0At(um))), nn = norm(cross(wd, t));
        const w = Math.max(0.9, w0 * (1 - Math.pow(um, 1.5)) + 0.9);
        const len = Math.hypot(...sub(b, a)) * 0.66 + 0.5;
        const tx: Tex = (cc) => {
          const f = Math.sin(cc.l[2] * 1.5 + seed * 2 + i * 0.4);
          return f > 0.55 ? 0.55 + tone : f < -0.6 ? -0.65 + tone : tone;
        };
        S.ell(g, wm(M.cloak, W), c, [len, 0.95, w], [t, nn, wd], { tex: tx as never, big: true, part: rp, tone: (i % 2 ? 0.06 : -0.06) + tone });
        if (i > 1 && (i % 2 === 0 || tipIce)) for (const sg of Math.abs(wd[2]) > 0.3 ? [wd[2] < 0 ? 1 : -1] : [1, -1]) {
          const e0 = add(c, mul(wd, sg * w * 0.92));
          S.cone(g, wm(M.ice, W), e0, 0.85, add(add(e0, mul(wd, sg * (1.8 + 0.6 * (i % 3)))), [0, 0, -1.0]), 0.1, { part: S.newPart(), tone: (i % 3) * 0.3 });
        }
      }
      if (tipIce) {
        const e = B(1), t = norm(sub(B(1), B(0.85)));
        for (let k = -2; k <= 2; k++) {
          const wd = norm(cross(t, n0At(0.9)));
          const b0 = add(B(0.8 + 0.04 * Math.abs(k)), mul(wd, k * 0.9));
          S.cone(g, wm(M.ice, W), add(b0, [0, 0, 0.3]), 0.7, add(add(e, mul(wd, k * 1.3)), [0, -0.5, 0.2]), 0.12, { part: S.newPart(), tone: 0.2 + (k % 2) * 0.3 });
        }
      }
    };
    const sh0 = T([-7.6, -3.0, 43.6]);
    ribbon(sh0, [pel[0] - 19 - fl * 2, pel[1] - 10 - fl, 16 + shift[2]], [pel[0] - 41 + sw, pel[1] - 36 - fl * 2, 1.0], 8.4, 26, 0, 0, true);
    ribbon(add(sh0, [2.0, -1.0, -0.8]), [pel[0] - 11 - fl, pel[1] - 8, 10 + shift[2]], [pel[0] - 26 - sw, pel[1] - 25 - fl, 1.0], 4.6, 16, 3, -0.4, false);
    // спина: широкое полотнище от плеч до земли
    S.cone(g, wm(M.cloak, W), T([0, -3.8, 43.0]), 5.4, [pel[0], pel[1] - 5.6, 3.0], 6.4, { tex: folds as never, big: true, tone: -0.2 });
  }

  // ---------- сюртук: до сапог, складки; бирюзовая кайма по фронту и ледяной подол ----------
  {
    const g = S.group(1.6);
    const topZ = lerp(pel[2] + 0.5, 3.0, col);
    const rb = lerp(5.8, 10.4, col), ra = lerp(3.8, 8.0, col);
    const c0: V3 = [pel[0], pel[1], Math.max(topZ, 0.5)];
    if (col < 0.75) S.cone(g, wm(M.robe, W), c0, ra, [pel[0], pel[1] + 0.4, 3.4], rb, { tex: folds as never, ref: [1, 0, 0], big: true });
    if (col < 0.6) {
      // боковые клинья подола: ломают силуэт
      for (const [s, y, l] of [[1, 0.0, 3.4], [-1, 0.0, 3.8], [1, 5.0, 2.2], [-1, 5.4, 2.6]] as [number, number, number][]) {
        S.cone(g, wm(M.robe, W), [pel[0] + s * (rb - 1.6), pel[1] + y, 6.4], 1.8, [pel[0] + s * (rb + l), pel[1] + y - 0.6, 0.4], 0.35, { ref: [1, 0, 0] });
      }
      // бирюзовая кайма: две ленты по фронту, от груди до подола
      for (const s of [1, -1]) {
        const a = PV([s * 2.2, 3.2, 29.5]);
        const b: V3 = [pel[0] + s * 3.6, pel[1] + 4.8, 4.6];
        S.cone(g, wm(M.ice, W), a, 0.7, b, 0.85, { part: S.newPart(), tone: -0.5 });
        for (let q = 1; q < 7; q++) S.ball(g, wm(M.ice, W), add(lerpV(a, b, q / 7.5), [-s * 1.6, 0.3, 0]), 0.42, { part: S.newPart(), tone: 0.0 });
      }
      // ледяной подол: венец сосулек, длиннее с левой (хвостовой) стороны
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + 0.15;
        const ca = Math.cos(a), sa = Math.sin(a);
        const L = 2.6 + 3.6 * hash01(i, 3, 17) + (ca < -0.3 ? 2.4 : 0);
        const ry = 0.92;
        const b0: V3 = [pel[0] + ca * (rb - 0.4), pel[1] + sa * (rb - 0.4) * ry + 0.4, 5.2];
        const b1: V3 = [pel[0] + ca * (rb + L * 0.38), pel[1] + sa * (rb + L * 0.38) * ry + 0.4, 0.5 + 1.3 * hash01(i, 5, 19)];
        S.cone(g, wm(M.ice, W), b0, 1.15, b1, 0.1, { part: S.newPart(), tone: (i % 3) * 0.35 - 0.1 });
      }
    }
    if (col > 0.02) {
      const lumps: [number, number, number, number, number, number, Mat][] = [
        [0, 0, 8.5, 6.5, 3.4, 0.2, M.robe], [5.5, -2.5, 6, 4.5, 2.5, 0.6, M.cloak], [-6, 1, 5.5, 4.5, 2.7, -0.4, M.robe],
        [2.5, 4.5, 5, 3.2, 2.1, 0.9, M.cloak], [-3.5, -4.5, 6.2, 3.6, 2.2, -0.8, M.cloak], [8.5, 2.5, 3.4, 2.4, 1.5, 0.3, M.ice],
      ];
      for (const [x, y, rx, ry, rz, yaw, m] of lumps) {
        S.ell(g, wm(m, W), [pel[0] + x * col, pel[1] + y * col, 0], [rx * col + 0.5, ry * col + 0.5, rz * col + 0.3], [rot([1, 0, 0], 0, yaw), rot([0, 1, 0], 0, yaw), [0, 0, 1]], { tex: folds as never });
      }
    }
  }
  // ---------- ноги: сапоги с острым носком под подолом ----------
  if (alive && col < 0.6) {
    const g = S.group(0.9);
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i], fo = p.foot[i];
      const ft: V3 = [pel[0] + s * 3.6, pel[1] + 2.0 + 2.6 * k + 1.4 * fo, Math.max(0, 0.4 + 1.8 * k + 3.4 * fo)];
      S.ell(g, wm(M.steel, W), add(ft, [0, 3.6, 1.7]), [2.8, 4.4, 2.0], ID3, { part: S.newPart(), tone: 0.1 });
      S.cone(g, wm(M.steel, W), add(ft, [0, 6.0, 1.6]), 2.0, add(ft, [0, 10.2, 0.7]), 0.3, { part: S.newPart(), tone: 0.35 });
      S.cone(g, wm(M.ice, W), add(ft, [0, 4.2, 3.0]), 0.55, add(ft, [0, 9.0, 2.4]), 0.2, { part: S.newPart(), tone: 0.6 });
    }
  }

  // ---------- корпус: чёрная кираса с ледяным ядром, пояс ----------
  if (alive) {
    const g = S.group(1.0);
    S.ell(g, wm(M.robe, W), T([0, 0.3, 36.2]), [4.2, 3.2, 7.4], axes(TV), { tex: folds as never, big: true });
    S.ell(g, wm(M.steel, W), T([0, 2.0, 37.4]), [3.2, 2.1, 5.6], axes(TV), { part: S.newPart(), tone: 0.0 });
    // ядро: ледяной кристалл в вырезе груди
    S.ell(g, wm(M.glow, W), T([0, 3.7, 38.8]), [1.5, 0.8, 2.6], axes(TV), { part: S.newPart(), tone: Math.round(p.glow * 0.8) - 1.4 });
    S.stamps.push({ at: T([0, 5.2, 38.4]), n: TV([0, 1, 0]), px: ST_CORE, colors: stampKeys(p.glow * 0.55, W), glow: GLOW_KEYS, halo: GLOWC[2], depthTol: 2.6, minFacing: 0.1 });
    // пояс и пряжка
    S.ell(g, wm(M.steel, W), PV([0, 0.3, 28.8]), [5.6, 4.4, 1.2], axes(PR), { part: S.newPart(), tone: 0.1 });
    S.ball(g, wm(M.gem, W), PV([0, 4.6, 28.8]), 0.8, { part: S.newPart(), tone: 0.4 });
  }

  // ---------- посох: древко, кольца, кристалл, звезда с лучами и ледяными отростками ----------
  const held = p.held >= 0.5;
  const sd = norm(p.stf[1]);
  const liftR = pxM(view, 0, -p.armLift[0]);
  const gripW: V3 = add(p.stf[0], held ? add(shift, liftR) : [0, 0, 0]);
  const butt = sub(gripW, mul(sd, p.sg));
  const starC = add(butt, mul(sd, SC));
  {
    const g = S.group(0.4);
    const e0 = perp(sd, [1, 0.2, 0]), e1 = cross(sd, e0);
    const shine: Tex = (q) => (q.edge ? 0 : q.l[0] < -0.35 ? 0.9 : q.l[0] > 0.5 ? -0.7 : 0);
    S.cone(g, wm(M.steel, W), butt, 0.8, add(butt, mul(sd, 42)), 0.95, { tex: shine as never, ref: norm(perp(sd, [-1, 0.2, 0.6])), big: true });
    for (const z of [6, 15, 24, 33, 40]) S.ell(g, wm(M.steel, W), add(butt, mul(sd, z)), [1.25, 1.25, 0.8], [e0, e1, sd], { part: S.newPart(), tone: 0.4 });
    S.cone(g, wm(M.steel, W), add(butt, mul(sd, 1.8)), 0.8, sub(butt, mul(sd, 2.6)), 0.1, { part: S.newPart(), tone: 0.1 });
    // кристалл-свеча под звездой
    S.cone(g, wm(M.glow, W), add(butt, mul(sd, 42)), 1.2, add(butt, mul(sd, 51)), 1.0, { part: S.newPart(), tone: Math.round(p.charge) - 0.6 });
    S.cone(g, wm(M.steel, W), add(butt, mul(sd, 50.6)), 1.0, add(butt, mul(sd, 53.4)), 2.0, { part: S.newPart(), tone: 0.2 });
    // звезда: тёмная сталь + ледяные лучи; в плоскости (e0, sd) и короткие вперёд-назад
    const pi = S.newPart();
    S.ball(g, wm(M.steel, W), starC, 2.4, { part: pi, tone: 0.2 });
    const ray = (dir: V3, len: number, r: number, m: Mat, tone: number) => S.cone(g, wm(m, W), add(starC, mul(dir, 1.4)), r, add(starC, mul(dir, len)), 0.1, { part: pi, tone });
    ray(sd, 6.4, 1.3, M.steel, 0.5);
    ray(mul(sd, -1), 4.0, 1.2, M.steel, 0.0);
    ray(e0, 7.4, 1.2, M.steel, 0.4);
    ray(mul(e0, -1), 7.4, 1.2, M.steel, 0.2);
    for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) ray(norm(add(mul(e0, a), mul(sd, b))), 5.4, 0.9, M.ice, 0.4);
    ray(e1, 4.6, 0.9, M.ice, 0.5);
    ray(mul(e1, -1), 4.6, 0.9, M.ice, 0.1);
    S.ball(g, wm(M.glow, W), add(starC, mul(e1, 1.1)), 1.35, { part: S.newPart(), tone: Math.round(p.charge * 1.2) - 0.2 });
    // сосульки на боковых лучах и ледяные кристаллы по краям
    for (const s of [1, -1]) {
      const at = add(starC, mul(e0, s * 5.4));
      S.cone(g, wm(M.ice, W), at, 0.7, add(at, mul(sd, -3.8)), 0.1, { part: S.newPart(), tone: 0.3 });
      const at2 = add(starC, mul(e0, s * 3.2));
      S.cone(g, wm(M.ice, W), at2, 0.6, add(at2, mul(sd, -2.4)), 0.1, { part: S.newPart(), tone: 0.1 });
      S.cone(g, wm(M.ice, W), add(starC, mul(e0, s * 1.8)), 0.6, add(add(starC, mul(e0, s * 4.4)), mul(sd, 4.8)), 0.1, { part: S.newPart(), tone: 0.6 });
    }
    if (p.charge > 0.9) X.glints.push(add(starC, mul(sd, 6.2)));
    if (p.sparks > 0.03 && W < 0.5) X.sparks.push({ at: starC, k: p.sparks, r: 9, n: Math.round(3 + 4 * p.sparks) });
  }

  // ---------- руки: рукав, чёрный наруч, синяя кисть; левая раскрыта ладонью ----------
  if (alive) for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
    const g = S.group(0.9);
    const lift = pxM(view, 0, -p.armLift[i]);
    const sh = add(T([s * 6.2, 0.2, 41.6]), lift);
    const fist = i === 0 && held ? gripW : add(add(p.hand[i], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, wm(M.robe, W), sh, 2.8, el, 2.3, { tone: 0.0, big: true });
    S.cone(g, wm(M.robe, W), el, 2.3, fist, 1.9, { tone: 0.0, big: true });
    const fd = norm(sub(fist, el));
    const wr = sub(fist, mul(fd, 1.6));
    for (let q = 0; q < 2; q++) S.cone(g, wm(M.steel, W), add(el, mul(sub(wr, el), 0.4 + 0.28 * q)), 2.7, add(el, mul(sub(wr, el), 0.64 + 0.3 * q)), 2.5, { part: S.newPart(), tone: 0.2 + 0.3 * q });
    S.ell(g, wm(M.steel, W), el, [2.7, 2.7, 2.7], ID3, { part: S.newPart(), tone: 0.3 });
    S.cone(g, wm(M.ice, W), el, 0.7, add(add(el, mul(fd, -2.4)), mul(perp(fd, p.pole[i]), 1.8)), 0.1, { part: S.newPart(), tone: 0.4 });
    const e0 = perp(fd, [0, 0, 1]), e1 = cross(fd, e0);
    const pf = S.newPart();
    S.ell(g, wm(M.skin, W), fist, [1.7, 1.2, 1.8], [e0, e1, fd], { part: pf, tone: 0.0 });
    if (i === 1) {
      // раскрытая ладонь: четыре длинных пальца веером и большой
      const upW: V3 = [0, 0, 1];
      [-1.6, -0.55, 0.55, 1.6].forEach((o, k) => {
        const dir = norm(add(add(mul(fd, 0.6), mul(upW, 0.5)), mul(e0, o * 0.4)));
        const b0 = add(fist, add(mul(fd, 1.0), mul(e0, o * 0.55)));
        const b1 = add(b0, mul(dir, 2.4 + (k === 1 || k === 2 ? 0.7 : 0)));
        S.cone(g, wm(M.skin, W), b0, 0.55, b1, 0.4, { part: pf });
        S.cone(g, wm(M.ice, W), b1, 0.4, add(b1, mul(dir, 1.1)), 0.12, { part: pf, tone: 0.5 });
      });
      if (p.palm > 0.03 && W < 0.6) X.palm = { at: add(fist, add(mul(fd, 1.2), [0, 0, 1.2])), k: p.palm };
    } else {
      S.ell(g, wm(M.skin, W), add(fist, mul(e1, 0.9)), [1.6, 0.8, 1.3], [e0, e1, fd], { part: pf, tone: 0.1 });
      S.cone(g, wm(M.ice, W), add(fist, mul(fd, 0.6)), 0.5, add(add(fist, mul(fd, 0.6)), mul(e1, 2.0)), 0.12, { part: pf, tone: 0.5 });
    }
  }

  // ---------- наплечники: угольные пластины с ледяными сосульками; мех на плечах и вороте ----------
  if (alive) {
    const g = S.group(0.7);
    for (const s of [1, -1]) {
      S.ell(g, wm(M.steel, W), T([s * 7.3, -0.3, 43.4]), [4.0, 3.6, 2.2], axes(TV, s * 0.4), { part: S.newPart(), tone: 0.15 });
      S.ell(g, wm(M.steel, W), T([s * 8.0, -0.2, 41.0]), [3.6, 3.3, 1.4], axes(TV, s * 0.75), { part: S.newPart(), tone: -0.2 });
      S.cone(g, wm(M.steel, W), T([s * 6.8, -0.6, 44.6]), 2.2, T([s * 10.6, -1.0, 47.6]), 0.2, { part: S.newPart(), tone: 0.55 });
      // сосульки свисают с нижнего края
      for (let k = 0; k < 5; k++) {
        const x = 6.2 + k * 1.2;
        const b = T([s * x, 0.4 + 0.2 * (k % 2), 40.4 - 0.6 * k]);
        S.cone(g, wm(M.ice, W), b, 0.75, add(b, [0, 0, -(3.0 + 2.2 * hash01(k, s + 3, 23))]), 0.1, { part: S.newPart(), tone: (k % 2) * 0.4 });
      }
      // белый мех по верху плеча
      S.ell(g, wm(M.hair, W), T([s * 7.4, 0.0, 45.6]), [4.0, 3.4, 1.9], axes(TV, s * 0.4), { tex: furTex as never, part: S.newPart(), tone: 0.1, big: true });
      for (let k = 0; k < 7; k++) {
        const b = T([s * (5.6 + k * 0.95), 1.8 - 0.3 * k, 45.2]);
        S.cone(g, wm(M.hair, W), b, 1.1, add(b, TV([s * 0.6, 0.6, 2.4 + 1.2 * hash01(k, s + 5, 37)])), 0.15, { part: S.newPart(), tone: (k % 2) * 0.3 });
      }
      // ледяные кристаллы на плече
      for (const [dx, h] of [[6.6, 8.2], [8.4, 6.4], [10.2, 4.6]] as [number, number][]) {
        const b = T([s * dx, -0.2, 45.4]);
        S.cone(g, wm(M.ice, W), b, 0.8, add(b, TV([s * 0.8, 0, h])), 0.1, { part: S.newPart(), tone: 0.5 });
      }
    }
    // меховой ворот: широкая масса с косматыми клочьями; спереди остаётся вырез
    const gf = S.group(1.1);
    S.ell(gf, wm(M.fur, W), T([0, -1.4, 44.8]), [6.4, 4.2, 2.6], axes(TV), { tex: furTex as never, big: true, tone: -0.1 });
    for (const s of [1, -1]) S.ell(gf, wm(M.fur, W), T([s * 4.4, 2.2, 43.6]), [3.0, 2.8, 3.2], axes(TV, s * 0.3), { tex: furTex as never, part: S.newPart(), tone: 0.05 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const b = T([Math.cos(a) * 6.6, Math.sin(a) * 3.8 - 1.2, 44.6]);
      S.cone(gf, wm(M.fur, W), b, 1.5, add(b, TV([Math.cos(a) * 1.6, Math.sin(a) * 0.8, 2.4 + 2.2 * hash01(i, 2, 29)])), 0.2, { part: S.newPart(), tone: (i % 3) * 0.3 - 0.2 });
    }
  }

  // ---------- голова: синее лицо, серебряные волосы, чёрная корона с двумя рогами ----------
  const HC = 50.4;
  if (alive) {
    const g = S.group(0.6);
    S.cone(g, wm(M.skin, W), T([0, 0.4, 43], true), 1.8, H([0, 0.6, 47]), 1.9, { part: S.newPart(), tone: -0.3 });
    S.ell(g, wm(M.skin, W), H([0, 0.8, HC]), [4.3, 4.4, 5.2], axes(HV), { tone: 0.1 });
    S.ell(g, wm(M.skin, W), H([0, 1.5, HC - 3.2]), [2.2, 2.4, 1.8], axes(HV), { part: S.newPart(), tone: -0.1 });
    S.stamps.push({ at: H([0, 5.4, HC + 0.2]), n: sub(H([0, 1, 0]), H([0, 0, 0])), px: ST_FACE, colors: keys, glow: GLOW_KEYS, halo: GLOWC[1], depthTol: 2.4, minFacing: 0.25 });
    // серебряные волосы: шапка сзади и две длинные пряди по груди
    const gh = S.group(0.9);
    // шлем-обрамление: тёмная сталь вокруг лица (затылок, виски, нащёчники), лицо открыто спереди
    S.ell(gh, wm(M.steel, W), H([0, -0.9, HC + 0.6]), [4.9, 4.7, 5.6], axes(HV), { cut: { n: [0, 1, 0], d: 1.6 }, tone: 0.2, big: true });
    for (const s of [1, -1]) {
      S.ell(gh, wm(M.steel, W), H([s * 4.3, 1.6, HC + 0.4]), [1.3, 2.6, 4.6], axes(HV, s * 0.15), { part: S.newPart(), tone: 0.3 });
      S.ell(gh, wm(M.steel, W), H([s * 3.4, 3.0, HC - 3.4]), [1.0, 2.0, 2.0], axes(HV), { part: S.newPart(), tone: 0.1 });
    }
    S.ell(gh, wm(M.steel, W), H([0, 2.8, HC + 4.9]), [3.6, 2.2, 1.0], axes(HV), { part: S.newPart(), tone: 0.4 });
    for (const s of [1, -1]) {
      const a = T([s * 5.6, 3.8, 44.6]);
      const m = T([s * 6.0, 5.6, 40.0]);
      const b = T([s * 4.2, 5.8, 29.5]);
      S.cone(gh, wm(M.hair, W), a, 1.9, m, 2.1, { part: S.newPart(), tone: s > 0 ? 0.2 : 0.5 });
      S.cone(gh, wm(M.hair, W), m, 2.1, b, 0.3, { part: S.newPart(), tone: s > 0 ? 0.0 : 0.4 });
    }
  }
  {
    // корона: обруч, два высоких рога наружу, центральный шип с самоцветом, ледяные кристаллы позади
    const crownC: V3 = [0, 0.2, 53.8];
    const tf = (v: V3): V3 => {
      if (p.crownOff <= 0) return H(v);
      const e = easeIn(clamp(p.crownOff, 0, 1));
      const from = H(crownC);
      const to = add([pel[0] - shift[0], pel[1] - shift[1], 1.4], fromView(view, [-8, 14, 0]));
      const c = add(lerpV(from, to, e), [0, 0, 5 * Math.sin(Math.PI * Math.min(1, e * 1.15))]);
      return add(c, rot(sub(v, crownC), -0.2 * e, 0, 0.5 * e));
    };
    if (alive || p.crownOff > 0) {
      const g = S.group(0.3);
      const o = tf(crownC);
      const ax: [V3, V3, V3] = [norm(sub(tf(add(crownC, [1, 0, 0])), o)), norm(sub(tf(add(crownC, [0, 1, 0])), o)), norm(sub(tf(add(crownC, [0, 0, 1])), o))];
      S.ell(g, wm(M.steel, W), o, [3.6, 3.8, 1.2], ax, { tone: 0.2 });
      S.ell(g, wm(M.steel, W), tf([0, 3.2, 52.6]), [2.4, 1.1, 1.8], ax, { part: S.newPart(), tone: 0.45 });
      S.ball(g, wm(M.gem, W), tf([0, 4.1, 54.0]), 0.8, { part: S.newPart(), tone: 0.5 });
      const ps = S.newPart();
      const spike = (x: number, y: number, len: number, lean: number, r: number, m: Mat, tone: number) => {
        const b = [x, y, 54.0] as V3;
        const md = [x + lean * 0.4, y - 0.2, 54.0 + len * 0.55] as V3;
        const t = [x + lean, y - 0.4, 54.0 + len] as V3;
        S.cone(g, wm(m, W), tf(b), r, tf(md), r * 0.62, { part: ps, tone });
        S.cone(g, wm(m, W), tf(md), r * 0.62, tf(t), 0.1, { part: ps, tone: tone + 0.2 });
      };
      // шлем: лобная пластина с высоким центральным пиком, пики по бокам, ледяные шипы-сосульки по краям
      S.ell(g, wm(M.steel, W), tf([0, 2.6, 53.2]), [3.4, 1.6, 2.2], ax, { part: S.newPart(), tone: 0.35 });
      spike(0, 2.2, 10.5, 0, 1.3, M.steel, 0.45);
      for (const s of [1, -1]) {
        spike(s * 1.9, 1.4, 7.4, s * 0.6, 1.0, M.steel, 0.35);
        spike(s * 3.3, 0.2, 5.2, s * 1.6, 0.9, M.ice, 0.5);
        spike(s * 3.9, -1.0, 3.4, s * 1.8, 0.8, M.ice, 0.3);
      }
      // ледяные кристаллы позади рогов
      for (const s of [1, -1]) {
        S.cone(g, wm(M.ice, W), tf([s * 3.2, -1.4, 54.4]), 0.9, tf([s * 4.8, -2.0, 59.6]), 0.1, { part: S.newPart(), tone: 0.5 });
        S.cone(g, wm(M.ice, W), tf([s * 2.4, -1.8, 54.4]), 0.8, tf([s * 2.8, -2.6, 58.4]), 0.1, { part: S.newPart(), tone: 0.2 });
      }
    }
  }

  // ---------- эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 24 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? starC, k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: [pel[0] + (i ? -7 : 7), pel[1] + 6, 0], k: p.dust[i] });
  if (p.mist > 0.03) { X.mist = p.mist; X.mistAt = [pel[0] - shift[0], pel[1] - shift[1], 0]; }
  if (p.shards > 0.02) for (let k = 0; k < 10; k++) {
    const f = clamp(p.shards, 0, 1);
    const a = (k / 10) * TAU + 0.4, rr = 5 + 20 * easeOut(f) * (0.6 + 0.4 * hash01(k, 1, 31));
    X.shards.push({ at: [pel[0] - shift[0] + Math.cos(a) * rr, pel[1] - shift[1] + Math.sin(a) * rr * 0.7, 10 + 18 * hash01(k, 2, 31) - 26 * f * f * (0.5 + hash01(k, 3, 31))], k: 1 - f * 0.7 });
  }
  return finalize(S, X);
}
/** Тело — в двойном разрешении (K·RS), слои 2D — в пикселях кадра 1× (K). */
function finalize(S: Scene, X: Extra): { S: Scene; X: Extra } {
  scaleScene(S, K * RS);
  const sk = (v: V3) => mul(v, K);
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
  X.sparks.forEach((s) => (s.at = sk(s.at)));
  if (X.palm) X.palm.at = sk(X.palm.at);
  X.shards.forEach((s) => (s.at = sk(s.at)));
  X.mistAt = sk(X.mistAt);
  X.glints = X.glints.map(sk);
  return { S, X };
}

function scaleScene(S: Scene, s: number) {
  for (const q of S.prims) {
    q.a = mul(q.a, s); q.b = mul(q.b, s); q.anc = mul(q.anc, s);
    q.ra *= s; q.rb *= s; q.r = mul(q.r, s); q.rr *= s;
    if (q.cut) q.cut = { n: q.cut.n, d: q.cut.d * s };
  }
  S.gk = S.gk.map((k) => k * s);
  for (const st of S.stamps) st.at = mul(st.at, s);
}
type Ctx = { img: PC; emis: PC; t: Float32Array; prim: Int32Array; view: View };
const put = (c: Ctx, x: number, y: number, col: RGBA, dz: number, glow = false) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1) return;
  const i = y * FW + x;
  if (c.prim[i] >= 0 && c.t[i] < dz - 1) return;
  c.img.set(x, y, col);
  if (glow) c.emis.set(x, y, col);
};
function drawRing(c: Ctx, r: { c: V3; r: number; k: number }, back: boolean) {
  const steps = Math.ceil(r.r * 10);
  const cv = toView(c.view, r.c);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * TAU;
    if (Math.sin(a * 5 + r.r * 0.4) < -1.2 + 1.3 * (1 - r.k)) continue;
    const pv = toView(c.view, [r.c[0] + Math.cos(a) * r.r, r.c[1] + Math.sin(a) * r.r, 0]);
    if (pv[1] < cv[1] !== back) continue;
    const [sx, sy] = scr(CAM, pv);
    const x = Math.floor(sx), y = Math.floor(Math.min(sy, CAM.GY + 2));
    if (x < 1 || y < 2 || x >= FW - 1 || y >= FH - 1) continue;
    const i = y * FW + x;
    if (!back && c.prim[i] >= 0 && c.t[i] < depthOf(pv) - 0.5) continue;
    if (back && c.img.alpha(x, y)) continue;
    c.img.set(x, y - 1, FIRE[r.k > 0.55 ? 4 : 3]);
    c.img.set(x, y, ICE[r.k > 0.3 ? 3 : 2]);
  }
}
function drawFlash(c: Ctx, f: { at: V3; k: number }) {
  const v = toView(c.view, f.at);
  const [sx, sy] = scr(CAM, v);
  const L = Math.round(2 + 3 * f.k);
  const x = clamp(Math.floor(sx), L + 2, FW - 3 - L), y = clamp(Math.floor(sy), L + 2, FH - 4);
  const dz = depthOf(v);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(c, x + dx * r, y + dy * Math.min(r, 2), FIRE[tone], dz, true);
  }
  if (f.k > 0.5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(c, x + dx * 2, y + dy, FIRE[3], dz, true);
  put(c, x, y, FIRE[4], dz, true);
}
/** Огненный след посоха — полумесяц: изогнутая дуга, яркая белая сердцевина, расширяется к голове и истончается в хвост, искры по краю. */
function drawTrail(c: Ctx, pts: V3[]) {
  const vp = pts.map((q) => toView(c.view, q));
  const sp0 = vp.map((q) => scr(CAM, q));
  const [fx, fy] = sp0[0], [lx, ly] = sp0[sp0.length - 1];
  const cl = Math.hypot(lx - fx, ly - fy) || 1;
  const nx = -(ly - fy) / cl, ny = (lx - fx) / cl;
  const sign = ny > 0 ? -1 : 1;
  const sp = sp0.map(([x, y], i) => { const u = i / (sp0.length - 1); const b = 0.3 * cl * Math.sin(Math.PI * u) * sign; return [x + nx * b, y + ny * b] as [number, number]; });
  const total = sp.length - 1;
  for (let k = 0; k < total; k++) {
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      const w = 0.4 + 2.8 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.1)), 1.4) * (0.3 + 0.7 * u);
      const dz = lerp(depthOf(vp[k]), depthOf(vp[k + 1]), s / steps);
      for (let dy = -w; dy <= w + 0.01; dy += 0.5) for (let dx = -w; dx <= w + 0.01; dx += 0.5) {
        if (dx * dx + dy * dy > w * w) continue;
        const e = Math.hypot(dx, dy) / Math.max(0.5, w);
        const tone = u < 0.3 ? (e < 0.5 ? 2 : 1) : e < 0.35 ? 4 : e < 0.65 ? 3 : 2;
        if (u < 0.3 && ((Math.floor(x) + Math.floor(y)) & 1)) continue;
        put(c, x + dx, y + dy, FIRE[tone], dz, true);
      }
      if (u > 0.35 && hash01(k, s, 41) < 0.12) put(c, x + (hash01(k, s, 7) - 0.5) * 9, y + (hash01(k, s, 9) - 0.5) * 7, FIRE[4], dz, true);
    }
  }
}
function drawDust(c: Ctx, d: { at: V3; k: number }) {
  const [cx, cy0] = scr(CAM, toView(c.view, d.at));
  const cy = Math.min(cy0, CAM.GY + 1);
  const t = 1 - d.k;
  for (let j = 0; j < 2; j++) {
    const dir = j ? 1 : -1;
    const px = cx + dir * (3 + 5 * t), py = cy - t * 1.4;
    const rx = 1.8 + 1.5 * d.k, ry = Math.max(1, rx * 0.55);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1 || x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1) continue;
      c.img.set(x, y, SAND[dy > 0.25 ? 2 : dx + dy < -0.5 ? 4 : 3]);
    }
  }
}
function drawGlint(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  const dz = depthOf(v) - 2;
  put(c, x - 1, y - 2, GLOWC[4], dz, true);
}
const colEq = (q: RGBA | null, o: RGBA) => !!q && q[3] > 120 && q[0] === o[0] && q[1] === o[1] && q[2] === o[2];

/**
 * Тело (160×160, двойное разрешение) → кадр 64×80: блок 2×2 даёт пиксель, если в нём ≥ 2 цветных (не контурных) точек; цвет — самый частый,
 * светящийся — вне конкуренции. Контур 1 px строится заново на кадре 1× (selout), глубина и призма — из первой точки блока.
 */
function downscale(R0: ReturnType<typeof renderScene>): { img: PC; emis: PC; t: Float32Array; prim: Int32Array } {
  const img = new PC(FW, FH), emis = new PC(FW, FH);
  const t = new Float32Array(FW * FH), prim = new Int32Array(FW * FH).fill(-1);
  const RN = CAMR.N;
  for (let Y = 0; Y < FH; Y++) for (let X = 0; X < FW; X++) {
    const votes = new Map<string, { n: number; c: RGBA; first: number }>();
    let opaque = 0, em: RGBA | null = null, first = -1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const rx = RX0 + X * 2 + dx, ry = Y * 2 + dy;
      const q = R0.body.get(rx, ry);
      if (!q || q[3] < 128) continue;
      const e = R0.emis.get(rx, ry);
      if (e && e[3] > 0) { em = e; if (first < 0) first = ry * RN + rx; continue; }
      if (colEq(q, OUT)) continue;
      opaque++;
      if (first < 0) first = ry * RN + rx;
      const key = q.join(",");
      const v = votes.get(key);
      if (v) v.n++; else votes.set(key, { n: 1, c: q, first: opaque });
    }
    if (em) { img.set(X, Y, em); emis.set(X, Y, em); }
    else if (opaque >= 2) {
      let best: { n: number; c: RGBA; first: number } | null = null;
      for (const v of votes.values()) if (!best || v.n > best.n || (v.n === best.n && v.c[0] + v.c[1] + v.c[2] < best.c[0] + best.c[1] + best.c[2])) best = v;
      img.set(X, Y, best!.c);
    } else continue;
    prim[Y * FW + X] = R0.gb.prim[first];
    t[Y * FW + X] = R0.gb.t[first];
  }
  return { img, emis, t, prim };
}

/** Искры льда вокруг навершия: мелкие мерцающие точки по эллипсу, ярче и крупнее — на пике заряда. */
function drawSparks(c: Ctx, s: { at: V3; k: number; r: number; n: number }, ph: number) {
  const [x0, y0] = scr(CAM, toView(c.view, s.at));
  for (let i = 0; i < s.n; i++) {
    const a = (i / s.n) * TAU + ph * TAU * (i % 2 ? 1 : -1);
    const r = s.r * (0.7 + 0.3 * Math.sin(a * 2 + i));
    const x = x0 + Math.cos(a) * r, y = y0 - 1 + Math.sin(a) * r * 0.75;
    const tw = Math.sin(ph * TAU * 2 + i * 1.7);
    put(c, x, y, tw > 0.2 ? FIRE[4] : GLOWC[3], -99, true);
    if (s.k > 0.6 && tw > 0.6) { put(c, x + 1, y, GLOWC[2], -99, true); put(c, x, y - 1, GLOWC[2], -99, true); }
  }
}
/** Иней у ладони: облачко из пяти точек, поднимается и тает. */
function drawPalm(c: Ctx, g: { at: V3; k: number }, ph: number) {
  const [x0, y0] = scr(CAM, toView(c.view, g.at));
  for (let i = 0; i < 6; i++) {
    const f = (ph * 2 + i / 6) % 1;
    const x = x0 + Math.sin(i * 2.3 + f * 3) * (1.5 + 2.0 * f), y = y0 - 1 - f * (5 + 3 * g.k);
    put(c, x, y, f < 0.3 ? FIRE[4] : f < 0.65 ? GLOWC[3] : GLOWC[1], -99, f < 0.7);
  }
  put(c, x0, y0, GLOWC[3], -99, true); put(c, x0 + 1, y0, GLOWC[2], -99, true); put(c, x0, y0 - 1, FIRE[4], -99, true);
}
/** Осколки льда при гибели: ромбики, светлее к центру. */
function drawShards(c: Ctx, s: { at: V3; k: number }) {
  const [x0, y0] = scr(CAM, toView(c.view, s.at));
  const x = Math.round(x0), y = Math.round(y0);
  put(c, x, y, FIRE[4], -99, true);
  if (s.k > 0.5) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(c, x + dx, y + dy, ICE[dx + dy > 0 ? 2 : 4], -99, true);
}
/** Позёмка: низкие облачка снега у ног, дрейфуют по фазе (на пустых пикселях, после контура). */
function drawMist(c: Ctx, X: Extra, ph: number) {
  const [cx, cy] = scr(CAM, toView(c.view, X.mistAt));
  const n = Math.round(6 + 8 * X.mist);
  for (let i = 0; i < n; i++) {
    const a = hash01(i, 4, 83) * TAU;
    const drift = ((ph + i * 0.137) % 1);
    const x = cx + Math.cos(a) * (12 + 14 * hash01(i, 5, 85)) + Math.round((drift - 0.5) * 3);
    const y = Math.min(CAM.GY - 0.6, cy + Math.sin(a) * 5.0) - (hash01(i, 6, 87) < 0.3 ? 1 : 0);
    const len = 2 + Math.floor(hash01(i, 7, 89) * 3);
    for (let k = 0; k < len; k++) {
      const xx = Math.floor(x) + k, yy = Math.floor(y);
      if (xx < 2 || xx >= FW - 2 || yy < 2 || yy >= FH - 2 || c.img.alpha(xx, yy)) continue;
      c.img.set(xx, yy, SAND[k === 0 || k === len - 1 ? 1 : (i + k) % 3 === 0 ? 3 : 2]);
    }
  }
}

/** Кадр владыки: { img, emis } 80×80. */
function finishFrame(S: Scene, X: Extra, view: View, pose: { trail?: V3[]; t: number }): { img: PC; emis: PC } {
  const R0 = renderScene(CAMR, S, view, OUT);
  const D = downscale(R0);
  const img = D.img;
  const emis = D.emis;
  const c: Ctx = { img, emis, t: D.t, prim: D.prim, view };
  for (const r of X.rings) drawRing(c, r, true);
  thicken(img, OUT, 3, [...GLOWC, ...FIRE, ...GEM, ...SAND]);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  const isOut = (q: RGBA | null) => colEq(q, OUT);
  const kill: [number, number][] = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!isOut(img.get(x, y))) continue;
    let body = false;
    for (let dy = -1; dy <= 1 && !body; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = img.get(x + dx, y + dy);
      if (q && q[3] > 120 && !isOut(q)) { body = true; break; }
    }
    if (!body) kill.push([x, y]);
  }
  for (const [x, y] of kill) { img.clear(x, y); emis.clear(x, y); }
  for (let x = 0; x < FW; x++) {
    if (!img.alpha(x, FH - 1)) continue;
    const q = img.get(x, FH - 2)!;
    if (q[3] > 120 && !isOut(q)) img.set(x, FH - 1, OUT); else img.clear(x, FH - 1);
    emis.clear(x, FH - 1);
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const q = img.get(x, y)!;
    if (q[3] && isEmisCol(q) && !emis.alpha(x, y)) emis.set(x, y, q);
    if (!q[3] || !isEmisCol(q)) emis.clear(x, y);
  }
  // контровой свет: холодная светлая кромка 1 px по внешнему силуэту — сильнее сверху и слева
  {
    const RIM: RGBA = [150, 224, 255, 255];
    const snap = img.clone();
    const gone = (x: number, y: number) => { const q = snap.get(x, y); return !q || q[3] < 120 || isOut(q); };
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
      const q = snap.get(x, y)!;
      if (q[3] < 200 || isOut(q) || isEmisCol(q)) continue;
      const tl = gone(x, y - 1) || gone(x - 1, y), other = gone(x + 1, y) || gone(x, y + 1);
      if (!tl && !other) continue;
      const m = mix(q, RIM, tl ? 0.6 : 0.34);
      img.set(x, y, [m[0], m[1], m[2], 255]);
    }
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (x !== 0 && y !== 0 && x !== FW - 1 && y !== FH - 1) continue;
    const q = img.get(x, y)!;
    if (q[3] && !isOut(q)) { img.clear(x, y); emis.clear(x, y); }
  }
  if (X.mist > 0.03) drawMist(c, X, pose.t);
  for (const r of X.rings) drawRing(c, r, false);
  if (pose.trail) drawTrail(c, pose.trail.map((q) => mul(q, K)));
  for (const g of X.glints) drawGlint(c, g);
  for (const s of X.sparks) drawSparks(c, s, pose.t);
  if (X.palm) drawPalm(c, X.palm, pose.t);
  for (const s of X.shards) drawShards(c, s);
  if (X.flash) drawFlash(c, X.flash);
  for (const d of X.dust) drawDust(c, d);
  return { img, emis };
}
export function renderFrost(view: View, pose: Pose): { img: PC; emis: PC } {
  // хвост плаща уходит назад и в сторону: тело сдвинуто в кадре, чтобы шлейф помещался
  const cx = view === "side" ? 47 : view === "up" ? 49 : 29;
  CAM.CX = cx; CAMR.CX = cx * 2;
  const { S, X } = build(pose, view);
  return finishFrame(S, X, view, pose);
}

// ---------------- анимации ----------------
type Num = number | V3 | [V3, V3] | [number, number] | V3[] | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "trail" || k === "flashAt" || k === "ringAt") continue;
    o[k] = lerpAny(a[k] as Num, b[k] as Num, t);
  }
  return o as unknown as Pose;
}
interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
function poseAt(base: Pose, keys: Key[], f: number): Pose {
  const full = keys.map((k) => ({ ...base, ...k.p }) as Pose);
  let j = 0;
  while (j < keys.length - 2 && f >= keys[j + 1].f) j++;
  const a = keys[j], b = keys[j + 1];
  const u = clamp((f - a.f) / (b.f - a.f), 0, 1);
  return lerpPose(full[j], full[j + 1], (b.ease ?? easeInOut)(u));
}
const keyed = (base: Pose, keys: Key[], n: number, seed: number): Pose[] =>
  Array.from({ length: n }, (_, i) => ({ ...poseAt(base, keys, i), t: i / n, seed: seed + i }));
const TREMBLE = [0, 1, 0, -1];
const windPoses = (R0: Pose, wind: Partial<Pose>, seed: number, n = 4) => keyed(R0, [{ f: 0, p: {} }, { f: n - 1, p: wind, ease: easeInOut }], n, seed);
function holdPoses(R0: Pose, wind: Partial<Pose>, seed: number, n: number, mod: (i: number) => Partial<Pose>) {
  const base = { ...R0, ...wind } as Pose;
  return Array.from({ length: n }, (_, i) => ({ ...base, t: i / n, seed: seed + i, ...mod(i) }));
}
const sv = <T,>(view: View, front: T, side: T): T => (view === "side" ? side : front);

/** Покой: дыхание по пикселю (грудь, голова, ладонь), волна по плащу, свет ядра и звезды пульсирует, позёмка. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const hand = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i],
      hand: [R0.hand[0], add(R0.hand[1], [0, 0, hand[i] * PXM])] as [V3, V3],
      wave: t, waveAmp: 1, flare: 0.4 + 0.4 * Math.sin(ph), glow: 1 + 0.2 * Math.sin(ph), charge: 0.55 + 0.3 * Math.sin(ph + 1.2),
    };
  });
}
/** Ходьба: размеренный тяжёлый шаг под сюртуком, посох-опора идёт дугой, плащ тянется и подрагивает. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const sway = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  const b0 = sub(R0.stf[0], mul(R0.stf[1], R0.sg));
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const PL = 0.58;
    let y: number, z: number;
    if (u < PL) { y = 4.5 - (9 * u) / PL; z = 0; }
    else { const s = (u - PL) / (1 - PL); y = -4.5 + 9 * easeInOut(s); z = 2.6 * Math.sin(Math.PI * s); }
    const butt: V3 = side ? [b0[0], b0[1] + y, z] : [b0[0], b0[1] + y * 0.6, z];
    const stf = staffAt(butt, [0.04, 0.03 - y * 0.03, 1], R0.sg);
    const kr = Math.max(0, Math.sin(TAU * u)), kl = Math.max(0, Math.sin(TAU * u + Math.PI));
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : sway[i] / K, 0, 0] as V3, bob: bob[i] * PXM,
      stf, kick: [kr, kl] as [number, number], foot: [kr * 0.5, kl * 0.5] as [number, number],
      hand: [stf[0], add(R0.hand[1], [0, 1.4 * Math.sin(TAU * u), 0.5 * Math.cos(TAU * u)])] as [V3, V3],
      wave: u * 2, waveAmp: 1.4, flare: side ? 2.4 : 1.4,
      dust: [i === 0 ? 1 : i === 1 ? 0.5 : 0, 0] as [number, number],
      glow: 1 + 0.15 * Math.sin(u * TAU), charge: 0.5, mist: 0.8,
    };
  });
}
/** «Топот»: левая нога вверх, посох вскинут над головой и вбит пяткой в землю вместе со стопой (кадр 2), кольцо инея. */
function stompKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = {
    pitch: -0.1, hp: -0.16, bob: 2 * PXM, foot: [0, 1], kick: [0, 0.8], glow: 1.3, charge: 1.1, sparks: 0.8, mist: 0.9,
    stf: side ? staffAt([9, 6.5, 12], [0, 0.15, 1], 30) : staffAt([10.5, 3.5, 12], [0.12, 0.05, 1], 30), flare: 1.6, waveAmp: 1.4,
    hand: [R0.hand[0], side ? [-6, 10, 40] : [-14, 6, 40]], pole: [[1, -0.4, 0.5], [-1, -0.3, 0.2]],
  };
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.14, hp: 0.06, bob: -2 * PXM, foot: [0, 0], kick: [0, 0], glow: 1.6, charge: 1.5, flash: 1, ring: 0.06, dust: [1, 1], sparks: 1,
    stf: side ? staffAt([9, 9.5, -3], [0, 0.1, 1], 30) : staffAt([12.6, 3, -3], [0.02, 0.06, 1], 30),
    hand: [R0.hand[0], side ? [-6.5, 12.5, 28] : [-14, 9, 28]], flare: 3, mist: 1,
  };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 3 * PXM }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.35, dust: [0.6, 0.6], charge: 1.1 }, ease: linear },
    { f: 4, p: { ...hit, flash: 0, ring: 0.62, dust: [0.3, 0.3], charge: 0.9, bob: -1 * PXM }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0.88, dust: [0, 0], charge: 0.7, bob: -1 * PXM }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], charge: 0.6, bob: -1 * PXM, sparks: 0.5 }, ease: linear },
    { f: 7, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function stompStrikePoses(view: View): Pose[] {
  const { R0, keys } = stompKeys(view);
  const poses = keyed(R0, keys, 8, 540);
  poses[2].flashAt = add(sub(poses[2].stf[0], mul(norm(poses[2].stf[1]), poses[2].sg)), add(bodyShift(view, poses[2]), [0, 0, 1.2]));
  return poses;
}
/** «Ледяные копья»: звезда отведена за плечо и налита светом; удар — посох вперёд-вниз, ладонь выброшена, вспышка (кадр 2). */
function spearKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = {
    yaw: side ? 0.1 : -0.22, pitch: -0.06, hp: -0.1, glow: 1.4, charge: 1.3, sparks: 1, bob: 1 * PXM, mist: 0.8, palm: 1,
    stf: side ? staffAt([9, 9, 12.5], [0, -0.55, 0.85], 30) : staffAt([4, 14, 10.6], [0.3, -0.5, 0.8], 30),
    hand: [R0.hand[0], side ? [-6, 12, 38] : [-14, 7, 37]], pole: [[1, -0.5, 0.3], [-1, -0.3, 0.2]], flare: 1.4,
  };
  const hit: Partial<Pose> = {
    ...wind, yaw: side ? -0.05 : 0.18, pitch: 0.2, hp: 0.05, bob: -2 * PXM, glow: 1.6, charge: 1.5, flash: 1,
    stf: side ? staffAt([9, -22, 36], [0, 0.82, -0.3], 32) : staffAt([24, -8.4, 30], [-0.6, 0.62, -0.15], 30), sg: side ? 32 : 30,
    hand: [R0.hand[0], side ? [-6, 18, 32] : [-9, 15, 31]], flare: 2.6,
  };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM, charge: 1.5 }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, charge: 1.2 }, ease: easeOut }, { f: 5, p: { ...hit, flash: 0, bob: -1 * PXM, charge: 0.9, pitch: 0.12 }, ease: easeInOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function spearCastPoses(view: View): Pose[] {
  const { R0, keys } = spearKeys(view);
  const poses = keyed(R0, keys, 8, 740);
  const sdv = norm(poses[2].stf[1]);
  const butt = sub(add(poses[2].stf[0], bodyShift(view, poses[2])), mul(sdv, poses[2].sg));
  poses[2].flashAt = add(butt, mul(sdv, SC));
  return poses;
}
/** «Сборка»: обе руки к небу, звезда горит, у ног расходится иней — носильщики встают из льда; удар — посох оземь (кадр 2). */
function summonKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = {
    pitch: -0.1, hp: -0.26, bob: 1 * PXM, glow: 1.5, charge: 1.4, sparks: 1, mist: 1, palm: 1, flare: 2.2, waveAmp: 1.6,
    stf: side ? staffAt([9, 5, 6], [0, 0.2, 1], 30) : staffAt([9, 2.5, 6], [0.2, 0.03, 1], 30),
    hand: [R0.hand[0], side ? [-5, 8, 43] : [-15, 3, 41]], pole: [[1, -0.3, 0.4], [-1, -0.3, -0.4]],
  };
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.18, hp: 0.08, bob: -2 * PXM, flash: 1, ring: 0.05, glow: 1.6, charge: 1.5,
    stf: side ? staffAt([9, 9.5, -2.5], [0, 0.1, 1], 30) : staffAt([12.8, 3.4, -2.5], [0.02, 0.1, 1], 30),
    hand: [R0.hand[0], side ? [-6, 14, 27] : [-14, 9, 27]], dust: [1, 1], flare: 3,
  };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 3 * PXM, hp: -0.32 }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.35, dust: [0.5, 0.5] }, ease: linear },
    { f: 4, p: { ...hit, flash: 0, ring: 0.62, dust: [0.2, 0.2] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0.9, dust: [0, 0], bob: -1 * PXM }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], bob: -1 * PXM, charge: 0.9 }, ease: linear },
    { f: 7, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function summonStrikePoses(view: View): Pose[] {
  const { R0, keys } = summonKeys(view);
  const poses = keyed(R0, keys, 8, 940);
  poses[2].flashAt = add(sub(poses[2].stf[0], mul(norm(poses[2].stf[1]), poses[2].sg)), add(bodyShift(view, poses[2]), [0, 0, 1.2]));
  return poses;
}
/**
 * Гибель: отшатнулся, звезда вспыхнула и погасла; посох выпал; владыка оседает в сюртук, плащ растекается лужей; корона
 * скатывается на землю; лёд тела трескается — осколки разлетаются и тают; свет гаснет, всё выцветает.
 */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall = staffAt(Wv([-12, -3, 0]), Wv([0.55, -0.45, 0.7]), R0.sg);
  const lying = staffAt(Wv([-20, -2, 1.0]), Wv([0.7, -0.71, 0.02]), R0.sg);
  const recoil: Partial<Pose> = { pitch: -0.16, hp: -0.36, bob: 1 * PXM, glow: 1.6, charge: 1.5, flash: 0, sparks: 1 };
  const stagger: Partial<Pose> = { ...recoil, pitch: 0.12, hp: 0.12, bob: 0, glow: 1.1, charge: 0.8 };
  const down = (o: Partial<Pose>): Partial<Pose> => ({ ...stagger, held: 0, stf: lying, sparks: 0, palm: 0, mist: 0.3, ...o });
  const keys: Key[] = [
    { f: 0, p: { glow: 1.2 } }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: stagger, ease: easeInOut },
    { f: 3, p: down({ stf: fall, glow: 0.9, sink: 3, collapse: 0.08, wither: 0.1, pitch: 0.2, shards: 0.1 }), ease: easeIn },
    { f: 4, p: down({ glow: 0.7, sink: 8, collapse: 0.25, wither: 0.2, pitch: 0.26, dust: [0.9, 0.9], shards: 0.25, charge: 0.5 }), ease: easeIn },
    { f: 5, p: down({ glow: 0.5, sink: 14, collapse: 0.45, wither: 0.32, crownOff: 0.22, shards: 0.4, charge: 0.4, dust: [0.5, 0.5] }), ease: linear },
    { f: 6, p: down({ glow: 0.35, sink: 21, collapse: 0.65, wither: 0.45, crownOff: 0.55, shards: 0.55, charge: 0.3 }), ease: linear },
    { f: 7, p: down({ glow: 0.2, sink: 28, collapse: 0.82, wither: 0.55, crownOff: 0.85, shards: 0.7, charge: 0.2 }), ease: linear },
    { f: 8, p: down({ glow: 0.1, sink: 36, collapse: 0.95, wither: 0.65, crownOff: 1, shards: 0.8, charge: 0.1, dust: [0.8, 0.8] }), ease: linear },
    { f: 10, p: down({ glow: 0.05, sink: 44, collapse: 1, wither: 0.8, crownOff: 1, shards: 0.92, charge: 0, dust: [0, 0] }), ease: easeOut },
    { f: 13, p: down({ glow: 0, sink: 44, collapse: 1, wither: 0.95, crownOff: 1, shards: 1, charge: 0, dust: [0, 0], mist: 0.6 }), ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].held = 0; if (i >= 4) poses[i].stf = lying; }
  return poses;
}

export type FrostAnim = "idle" | "walk" | "stompWind" | "stompHold" | "stomp" | "spearWind" | "spearHold" | "spearCast"
  | "summonWind" | "summonHold" | "summon" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: FrostAnim; hit?: number };
const ANIM_ORDER: [FrostAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["stompWind", { n: 4, fps: 12, loop: false, ru: "замах топота", next: "stompHold" }],
  ["stompHold", { n: 4, fps: 12, loop: true, ru: "удержание топота", next: "stomp" }],
  ["stomp", { n: 8, fps: 12, loop: false, ru: "топот", hit: 2 }],
  ["spearWind", { n: 4, fps: 12, loop: false, ru: "замах копий", next: "spearHold" }],
  ["spearHold", { n: 4, fps: 12, loop: true, ru: "удержание копий", next: "spearCast" }],
  ["spearCast", { n: 8, fps: 12, loop: false, ru: "ледяные копья", hit: 2 }],
  ["summonWind", { n: 4, fps: 12, loop: false, ru: "замах сборки", next: "summonHold" }],
  ["summonHold", { n: 4, fps: 12, loop: true, ru: "удержание сборки", next: "summon" }],
  ["summon", { n: 8, fps: 12, loop: false, ru: "сборка: носильщики", hit: 2 }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const FROST_ANIMS = {} as Record<FrostAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { FROST_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const FROST_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export const FROST_SKILLS: Record<string, { windup: [FrostAnim, FrostAnim]; strike: FrostAnim }> = {
  stomp: { windup: ["stompWind", "stompHold"], strike: "stomp" },
  ice_spears: { windup: ["spearWind", "spearHold"], strike: "spearCast" },
  assemble: { windup: ["summonWind", "summonHold"], strike: "summon" },
};
const POSES: Record<FrostAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v),
  stompWind: (v) => { const { R0, wind } = stompKeys(v); return windPoses(R0, wind, 500); },
  stompHold: (v) => { const { R0, wind } = stompKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], wave: i / 4 })); },
  stomp: stompStrikePoses,
  spearWind: (v) => { const { R0, wind } = spearKeys(v); return windPoses(R0, wind, 600); },
  spearHold: (v) => { const { R0, wind } = spearKeys(v); return holdPoses(R0, wind, 620, 4, (i) => ({ armLift: [TREMBLE[i] * 0.5, 0], glow: [1.5, 1.7, 1.55, 1.7][i], wave: i / 4 })); },
  spearCast: spearCastPoses,
  summonWind: (v) => { const { R0, wind } = summonKeys(v); return windPoses(R0, wind, 700); },
  summonHold: (v) => { const { R0, wind } = summonKeys(v); return holdPoses(R0, wind, 720, 4, (i) => ({ armLift: [TREMBLE[i] * 0.5 + 1, 1], glow: [1.5, 1.7, 1.55, 1.7][i], wave: i / 4 })); },
  summon: summonStrikePoses, death: deathPoses,
};

// ---------------- эффекты льда (листы мира: строки — 0 под юнитами, 1 над) ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<"ring" | "spear" | "circle", FxDef> = {
  ring: { w: 240, h: 240, ax: 120, ay: 120, n: 8, fps: 12, hit: 1 },
  spear: { w: 48, h: 80, ax: 24, ay: 66, n: 8, fps: 12, hit: 3 },
  circle: { w: 96, h: 96, ax: 48, ay: 48, n: 8, fps: 8, hit: 0 },
};
const rgba = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], Math.round(a)];
const fxSheet = (F: FxDef) => new PC(F.w * F.n, F.h * 2);
/** Кольцо топота: от стопы расходится ледяная волна — полоса инея с зубцами наружу, внутри тающая заливка, искры и блики. */
function buildRingFx(): PC {
  const F = FX.ring;
  const c = fxSheet(F);
  const radii = [26, 42, 66, 86, 102, 112, 118, 120];
  for (let f = 0; f < F.n; f++) {
    const x0 = f * F.w, cx = F.ax, cy = F.ay, r = radii[f], k = 1 - f / (F.n - 1);
    const px = (x: number, y: number, col: RGBA) => { if (x > 0 && x < F.w - 1 && y > 0 && y < F.h - 1) c.set(x0 + x, y, col); };
    // заливка полосой за гребнем
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r || d < r - 26) continue;
      const t = (r - d) / 26;
      if (((x + y) & 1) && t > 0.35) continue;
      px(x, y, rgba(ICE[t < 0.3 ? 3 : 2], 150 * k * (1 - t) + 30));
    }
    // гребень: три ряда иней-свет, зубцы наружу
    for (let a = 0; a < 1400; a++) {
      const th = (a / 1400) * TAU;
      const tooth = Math.sin(th * 22 + f) > 0.25 ? 1 : 0;
      const hi = Math.cos(th - 2.3) > 0.2;
      for (let t = 0; t < 5 + tooth * 3; t++) {
        const rr = r - 2 + t * (t < 5 ? -0.8 : 1.0);
        const x = Math.round(cx + Math.cos(th) * (t < 5 ? r - t * 0.9 : r + (t - 4) * 1.2)), y = Math.round(cy + Math.sin(th) * (t < 5 ? r - t * 0.9 : r + (t - 4) * 1.2));
        void rr;
        px(x, y, t === 0 ? (hi ? FIRE[4] : FIRE[3]) : t === 1 ? GLOWC[4] : t === 2 ? GLOWC[3] : t === 3 ? GLOWC[2] : t === 4 ? ICE[2] : ICE[3]);
      }
    }
    // искры и осколки над гребнем (ряд 1)
    for (let i = 0; i < 40; i++) {
      const th = hash01(i, f, 7) * TAU, rr = r * (0.55 + 0.45 * hash01(i, f, 9)), lift = 2 + 8 * hash01(i, f, 13) * (1 - k * 0.3);
      const x = Math.round(cx + Math.cos(th) * rr), y = Math.round(cy + Math.sin(th) * rr - lift);
      if (k > 0.12 && x > 1 && x < F.w - 2 && y > 1 && y < F.h - 2) {
        const q = hash01(i, f, 11) > 0.55 ? FIRE[4] : GLOWC[3];
        c.set(x0 + x, F.h + y, q); c.set(x0 + x + 1, F.h + y, GLOWC[2]); c.set(x0 + x, F.h + y - 1, FIRE[3]);
      }
    }
  }
  return c;
}
/** Ледяное копьё: из земли вырастает гранёный шип с бликом и кустом малых, замирает, раскалывается на осколки. */
function buildSpearFx(): PC {
  const F = FX.spear;
  const c = fxSheet(F);
  const hts = [8, 22, 46, 62, 62, 60, 52, 36];
  for (let f = 0; f < F.n; f++) {
    const x0 = f * F.w, cx = F.ax, gy = F.ay;
    const H = hts[f], shatter = f >= 6 ? f - 5 : 0;
    const spike = (dx: number, hh: number, w0: number, dst: number) => {
      for (let y = 0; y < hh; y++) {
        const v = y / Math.max(1, hh);
        const hw = Math.max(0.4, w0 * Math.pow(1 - v, 0.85) + (y < 3 ? 1 : 0));
        for (let x = Math.floor(-hw); x <= Math.ceil(hw); x++) {
          if (Math.abs(x + 0.5) > hw) continue;
          if (shatter && hash01(x + 9 + dx, y, 40 + f) < 0.1 * shatter) continue;
          const e = (x + 0.5) / hw;
          const tone = e < -0.55 ? 4 : e < -0.05 ? 3 : e < 0.55 ? 2 : 1;
          const col = v > 0.86 ? FIRE[4] : tone === 4 ? FIRE[3] : y % 9 === 4 && tone > 1 ? ICE[4] : ICE[tone];
          const X = Math.round(cx + dx + x + shatter * (hash01(y >> 2, dx + 5, 13) - 0.5) * 3), Y = Math.round(gy - y + shatter * (y > hh * 0.55 ? -dst : 0.6));
          if (X > 0 && X < F.w - 1 && Y > 0 && Y < F.h - 1) c.set(x0 + X, Y, col);
        }
      }
    };
    spike(0, H, 7.2, 1.6);
    for (const [dx, hh] of [[-10, 16], [-6, 26], [7, 22], [11, 14]] as [number, number][]) spike(dx, Math.round(hh * Math.min(1, H / 40)), 2.6, 1.0);
    // трещины льда по земле и осколки у основания
    for (let i = 0; i < 9; i++) {
      const dx = Math.round((hash01(i, f, 3) - 0.5) * (30 + 8 * shatter)), dy = Math.round((hash01(i, f, 5) - 0.5) * 6);
      const X = cx + dx, Y = gy + 1 + dy;
      if (f > 0 && X > 1 && X < F.w - 3 && Y > 1 && Y < F.h - 2) { c.set(x0 + X, Y, ICE[4]); c.set(x0 + X + 1, Y, ICE[2]); c.set(x0 + X, F.h + Y - 2, FIRE[4]); }
    }
  }
  return c;
}
/** Ледяной круг сборки: два рунных кольца, шесть лучей, ледяные щепки встают по кругу; пульс света. */
function buildCircleFx(): PC {
  const F = FX.circle;
  const c = fxSheet(F);
  for (let f = 0; f < F.n; f++) {
    const x0 = f * F.w, cx = F.ax, cy = F.ay, ph = f / F.n, pulse = 0.5 + 0.5 * Math.sin(ph * TAU);
    const px = (x: number, y: number, col: RGBA, row = 0) => { if (x > 0 && x < F.w - 1 && y > 0 && y < F.h - 1) c.set(x0 + x, row * F.h + y, col); };
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 38 && ((x + y) & 1) === 0) px(x, y, rgba(ICE[1], 70 + 50 * pulse));
    }
    for (const [rad, tone] of [[42, 3], [34, 2]] as [number, number][]) for (let a = 0; a < 900; a++) {
      const th = (a / 900) * TAU;
      if (Math.sin(th * 12 + ph * TAU * (tone === 3 ? 1 : -1)) < -0.55) continue;
      px(Math.round(cx + Math.cos(th) * rad), Math.round(cy + Math.sin(th) * rad), tone === 3 ? (pulse > 0.5 ? GLOWC[4] : GLOWC[3]) : ICE[tone + 1]);
      if (tone === 3) px(Math.round(cx + Math.cos(th) * (rad - 1)), Math.round(cy + Math.sin(th) * (rad - 1)), GLOWC[2]);
    }
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * TAU + ph * TAU * 0.25;
      for (let t = 0; t < 12; t++) { const rr = 8 + t * 2.4; px(Math.round(cx + Math.cos(th) * rr), Math.round(cy + Math.sin(th) * rr), t < 8 ? ICE[2 + (t & 1)] : GLOWC[3]); }
    }
    for (let i = 0; i < 6; i++) {
      const hh = Math.round(4 + 12 * ((ph + i / 6) % 1)), th = i * 1.047 + 0.3;
      const x = Math.round(cx + Math.cos(th) * 24), y0 = Math.round(cy + Math.sin(th) * 24);
      for (let y = 0; y < hh; y++) { px(x, y0 - y, y > hh - 3 ? FIRE[4] : GLOWC[2 + (y & 1)], 1); if (y < hh - 4) px(x + 1, y0 - y, ICE[2], 1); }
    }
  }
  return c;
}

// ---------------- носильщик (моб-спутник Ф2): оттаявший страж со щитом из льда; лист как у мобов — 12 столбцов × 3 вида ----------------
/** Лист: «ходьба» 0–3 и «атака» 4–7 — шаг со щитом перед собой, 8–11 — гибель: щит падает, страж оседает. */
export const BEARER_UNIT = { frame: FRAME, frameH: FRAME_H, cols: 12 };
function bearerScene(ph: number, death: number): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { rings: [], flash: null, dust: [], glints: [], sparks: [], palm: null, shards: [], mist: 0, mistAt: [0, 0, 0] };
  const st = Math.sin(ph * TAU), sink = death * 17, dz = -sink;
  const lean = death * 0.9;
  const ax: [V3, V3, V3] = [rot([1, 0, 0], lean, 0, 0), rot([0, 1, 0], lean, 0, 0), rot([0, 0, 1], lean, 0, 0)];
  const g = S.group(1.2);
  // ряса до земли и сапоги
  if (death < 0.85) {
    S.cone(g, M.robe, [0, 0, 22 + dz], 3.8, [0, 0.4, Math.max(2.4, 3.0 + dz * 0.2)], 6.2 - 2 * death, { big: true });
    for (const s of [1, -1]) S.ell(g, M.steel, [s * 2.4, 2.4 + st * 3.0 * s * (death ? 0 : 1), 1.4 + Math.max(0, st * s) * 1.6 * (1 - death)], [1.9, 3.0, 1.5], undefined, { part: S.newPart(), tone: 0.1 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, L = 1.6 + 2.2 * hash01(i, 3, 17);
      const b0: V3 = [Math.cos(a) * 5.6, Math.sin(a) * 5.6 + 0.4, 3.6], b1: V3 = [Math.cos(a) * (5.6 + L * 0.4), Math.sin(a) * (5.6 + L * 0.4) + 0.4, 0.4];
      S.cone(g, M.ice, b0, 0.8, b1, 0.1, { part: S.newPart(), tone: (i % 3) * 0.3 });
    }
  } else S.ell(g, M.robe, [0, 0, 1.6], [6.5 - death, 5.4, 2.2 - death], undefined, { tone: -0.2 });
  // торс, плечи, капюшон и синее лицо с холодными глазами
  const tz = 27 + dz;
  S.ell(g, M.robe, [0, 0.2 + death * 2.0, tz], [3.9, 3.0, 4.8], ax, { big: true });
  for (const s of [1, -1]) S.ell(g, M.steel, [s * 4.6, 0, tz + 3.2], [2.2, 2.4, 1.2], undefined, { part: S.newPart(), tone: 0.2 });
  S.ell(g, M.fur, [0, 0.4 + death * 2.4, 33.6 + dz * 1.1], [3.5, 3.4, 3.4], undefined, { part: S.newPart(), tone: 0.1, big: true });
  S.ell(g, M.skin, [0, 1.6 + death * 2.4, 33.0 + dz * 1.1], [2.3, 2.1, 2.5], undefined, { part: S.newPart(), tone: 0.0 });
  if (death < 0.7) for (const s of [1, -1]) S.ball(g, M.glow, [s * 1.0, 3.4, 33.6 + dz], 0.55, { part: S.newPart(), tone: 0.4 });
  // щит из льда: стальная рама, ледяная пластина, светлый кант, ядро; падает вперёд при гибели
  const gs = S.group(0.8);
  const sy = 7.0 + death * 4.0, sz = 16.5 - death * 11.0;
  S.ell(gs, M.steel, [0, sy - 0.8, sz], [7.6, 1.3, 9.6], ax, { part: S.newPart(), tone: -0.3, big: true });
  S.ell(gs, M.ice, [0, sy, sz], [6.8, 1.7, 8.8], ax, { part: S.newPart(), tone: 0.3, big: true });
  S.ell(gs, M.ice, [-1.8, sy + 0.8, sz + 2.0], [2.6, 1.0, 4.4], ax, { part: S.newPart(), tone: 1.0 });
  if (death < 0.85) S.ball(gs, M.glow, [0, sy + 1.6, sz], 1.5, { part: S.newPart(), tone: 0.3 });
  for (const [dx, h] of [[-4.4, 4.8], [0, 6.4], [4.4, 4.4]] as [number, number][]) S.cone(gs, M.ice, [dx * 0.8, sy, sz + 8.4], 1.1, [dx, sy, sz + 8.4 + h * 0.8], 0.1, { part: S.newPart(), tone: 0.5 });
  // руки держат щит по краям
  if (death < 0.6) for (const s of [1, -1]) {
    const sh: V3 = [s * 4.4, 0, tz + 2.4], el: V3 = [s * 6.8, 3.8, tz - 1], hd: V3 = [s * 8.2, 6.4, sz + 1.6];
    S.cone(g, M.robe, sh, 1.6, el, 1.4, { part: S.newPart() });
    S.cone(g, M.robe, el, 1.4, hd, 1.2, { part: S.newPart() });
    S.ball(g, M.skin, hd, 1.3, { part: S.newPart() });
  }
  return { S, X };
}
function renderBearer(view: View, ph: number, death: number): { img: PC; emis: PC } {
  CAM.CX = 40; CAMR.CX = 80;
  const { S, X } = bearerScene(ph, death);
  const f = finalize(S, X);
  return finishFrame(f.S, f.X, view, { t: ph });
}
export function buildBearerUnit(): PC {
  const out = new PC(FW * 12, FH * 3);
  for (let i = 0; i < 12; i++) for (let row = 0; row < 3; row++) {
    const v = VIEWS[row];
    const f = i < 8 ? renderBearer(v, (i % 4) / 4, 0) : renderBearer(v, 0, (i - 7) / 4);
    out.blit(f.img, i * FW, row * FH);
  }
  return out;
}

// ---------------- листы, проверки, монтажи ----------------
function animSheets(only?: FrostAnim[], maxFrames = 99): { img: Record<FrostAnim, PC>; emis: Record<FrostAnim, PC> } {
  const img = {} as Record<FrostAnim, PC>, emis = {} as Record<FrostAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, FH * 3), E = new PC(N * d.n, FH * 3);
    if (!only || only.includes(a)) VIEWS.forEach((v, row) => POSES[a](v).slice(0, Math.min(d.n, maxFrames)).forEach((p, i) => {
      const r = renderFrost(v, p);
      I.blit(r.img, i * N, row * FH);
      E.blit(r.emis, i * N, row * FH);
    }));
    img[a] = I;
    emis[a] = E;
  }
  return { img, emis };
}
function relight(c: PC, emis: PC, x: number, y: number, k: number, flip = false) {
  const big = scaleNN(emis, k, flip);
  c.blit(big, x, y);
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -3 * k; dy <= 3 * k; dy++) for (let dx = -3 * k; dx <= 3 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (3.2 * k);
      if (dd > 1 || !c.inside(X, Y) || big.alpha(X - x, Y - y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.035 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
interface Assets { hero: PC; terrain: PC; ref: PC | null }
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
type Sheets = { img: Record<FrostAnim, PC>; emis: Record<FrostAnim, PC> };
type Item = { img: PC; emis: PC | null; flip?: boolean };
const REF_W = 560;

/** Кадры галереи: покой в четыре стороны, топот, копья (вниз, вбок), сборка, гибель (середина и конец). */
function gallery(sheets: Sheets): { label: string; items: Item[] } {
  const idle = (row: number, flip = false): Item => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (p: Pose, v: View, flip = false): Item => ({ ...renderFrost(v, p), flip });
  return {
    label: "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | ТОПОТ | КОПЬЯ (ВНИЗ, ВБОК) | СБОРКА (ВНИЗ, ВБОК) | ГИБЕЛЬ (СЕРЕДИНА, КОНЕЦ) | НОСИЛЬЩИК (ВНИЗ, ВБОК)",
    items: [idle(0), idle(1), idle(2), idle(2, true), pose(POSES.stomp("down")[2], "down"), pose(POSES.spearCast("down")[2], "down"),
      pose(POSES.spearCast("side")[2], "side"), pose(POSES.summon("down")[2], "down"), pose(POSES.summon("side")[2], "side"),
      pose(POSES.death("down")[6], "down"), pose(POSES.death("down")[13], "down"), { ...renderBearer("down", 0.25, 0) }, { ...renderBearer("side", 0.25, 0) }],
  };
}
/** «Наш | референс»: ×1 и ×3 с героем на земле, галерея умений ×3 день/ночь, эффекты льда, большие кадры ×5 (4 стороны) рядом с образцом 08. */
function buildCompare(sheets: Sheets, A: Assets, fx: { name: string; sheet: PC; w: number; h: number; k: number }[]): PC {
  const k5 = 5;
  const H5 = FH * k5;
  const RH = A.ref ? A.ref.h : H5;
  const rowH = Math.max(H5, RH);
  const gal = gallery(sheets);
  const bw = 4 * (N * k5 + 12);
  const W = Math.max(gal.items.length * (N * 3 + 8) + 48, 24 + bw + 40 + (A.ref ? A.ref.w : 500) + 24, 1700);
  const y1 = 12, y3 = y1 + 22 + 92 + 12, yg = y3 + 22 + 90 * 3 + 12, yx = yg + 22 + 2 * (FH * 3 + 6) + 16;
  const fxH = Math.max(...fx.map((f) => f.h * f.k)) + 8;
  const yb = yx + 22 + fxH + 16;
  const c = new PC(W, yb + 2 * (rowH + 70) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  for (const [kk, y0] of [[1, y1], [3, y3]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · ВЛАДЫКА ВНИЗ, ВВЕРХ, ВБОК, ВЛЕВО`, 24, y0, 2);
    const yb0 = y0 + 22 + 88 * kk;
    groundBg(c, A.terrain, 24, y0 + 20, Math.min(W - 48, (34 + 86 * 4 + 40) * kk + 40), 90 * kk, kk, "dirt");
    let x = 40;
    const put1 = (img: PC, feet: number, w: number, flip = false) => {
      shadowBlob(c, x + (img.w / 2) * kk, yb0 - 0.5 * kk, Math.min(18, (img.w / 32) * 6.5) * kk, 2.6 * kk);
      c.blit(scaleNN(img, kk, flip), x, Math.round(yb0 - feet * kk));
      x += w * kk;
    };
    put1(heroAt(A, 0), 30.4, 34);
    put1(crop(sheets.img.idle, 0, 0, N, FH), CAM.GY, 86);
    put1(crop(sheets.img.idle, 0, FH, N, FH), CAM.GY, 86);
    put1(crop(sheets.img.idle, 0, 2 * FH, N, FH), CAM.GY, 86);
    put1(crop(sheets.img.idle, 0, 2 * FH, N, FH), CAM.GY, 86, true);
  }
  text(c, gal.label + "  (×3, ДЕНЬ / НОЧЬ)", 24, yg, 2);
  const gw = gal.items.length * (N * 3 + 8) + 8;
  for (const [ni, night] of [false, true].entries()) {
    const yy = yg + 22 + ni * (FH * 3 + 6);
    fill(c, 24, yy, gw, FH * 3, night ? [38, 46, 74, 255] : [120, 104, 84, 255]);
    gal.items.forEach((it, i) => {
      const ix = 24 + 8 + i * (N * 3 + 8);
      c.blit(scaleNN(it.img, 3, it.flip), ix, yy);
      if (night && it.emis) { nightRect(c, ix, yy, N * 3, FH * 3); relight(c, it.emis, ix, yy, 3, it.flip); }
    });
  }
  text(c, "ЭФФЕКТЫ ЛЬДА ×2: " + fx.map((f) => f.name).join(" · "), 24, yx, 2);
  {
    fill(c, 24, yx + 22, W - 48, fxH, [60, 56, 48, 255]);
    let fxx = 32;
    for (const f of fx) {
      const take = Math.min(8, Math.floor((W - 48 - (fxx - 32)) / (f.w * f.k + 4)));
      for (let i = 0; i < Math.min(take, f.k === 1 ? 3 : 4); i++) { c.blit(scaleNN(crop(f.sheet, i * f.w + 0, 0, f.w, f.h), f.k), fxx, yx + 26); fxx += f.w * f.k + 4; }
      fxx += 16;
    }
  }
  for (const night of [false, true]) {
    const y = yb + 48 + (night ? rowH + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 08", 24 + bw + 40, y - 36, 3);
    const oy = y + rowH - H5;
    fill(c, 24, oy, bw, H5, night ? [38, 46, 74, 255] : [120, 104, 84, 255]);
    const parts: [number, boolean][] = [[0, false], [1, false], [2, false], [2, true]];
    parts.forEach(([j, flip], i) => c.blit(scaleNN(crop(sheets.img.idle, 0, j * FH, N, FH), k5, flip), 24 + i * (N * k5 + 12), oy));
    if (night) {
      nightRect(c, 24, oy, bw, H5);
      parts.forEach(([j, flip], i) => relight(c, crop(sheets.emis.idle, 0, j * FH, N, FH), 24 + i * (N * k5 + 12), oy, k5, flip));
    }
    fill(c, 24 + bw + 16, y, 4, rowH, [240, 232, 214, 255]);
    if (A.ref) c.blit(A.ref, 24 + bw + 40, y + rowH - A.ref.h);
  }
  return c;
}
/** Референс 08 → png 560×560 (через System.Drawing; чужой арт остаётся в tools/out, не в игре). */
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-08.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "08.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap ${REF_W},${REF_W}; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,${REF_W},${REF_W}); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

export function writeFrostArt(root: string, outDir: string, quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const sheets = animSheets(quick ? ["idle"] : undefined, quick ? 1 : 99);
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    ref: ensureRef(root),
  };
  if (process.argv.includes("--sil")) {
    const sc = new PC(N * 5 * 4 + 60 + REF_W, REF_W + 10);
    fill(sc, 0, 0, sc.w, sc.h, [214, 220, 226, 255]);
    [[0, false], [1, false], [2, false], [2, true]].forEach(([j, flip], i) => {
      const fr = crop(sheets.img.idle, 0, (j as number) * FH, N, FH);
      for (let y = 0; y < FH; y++) for (let x = 0; x < N; x++) if (fr.alpha(x, y)) fr.set(x, y, [16, 20, 28, 255]);
      sc.blit(scaleNN(fr, 5, flip as boolean), i * (N * 5 + 6), REF_W - FH * 5);
    });
    if (A.ref) {
      const r = A.ref.clone();
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const q = r.get(x, y)!; r.set(x, y, q[0] > 238 && q[1] > 238 && q[2] > 238 ? [214, 220, 226, 255] : [16, 20, 28, 255]); }
      sc.blit(r, N * 5 * 4 + 40, 0);
    }
    save(sc, "r65n-e-sil.png");
    return files;
  }
  if (process.argv.includes("--death")) {
    const fr = [6, 9, 13].map((i) => renderFrost("down", POSES.death("down")[i]).img).concat([6, 13].map((i) => renderFrost("side", POSES.death("side")[i]).img));
    const sc = new PC(fr.length * (N * 6 + 8), FH * 6);
    fill(sc, 0, 0, sc.w, sc.h, [120, 104, 84, 255]);
    fr.forEach((f, i) => sc.blit(scaleNN(f, 6), i * (N * 6 + 8), 0));
    save(sc, "r65n-e-death.png");
    return files;
  }
  const fx = [
    { name: "КОЛЬЦО ТОПОТА", sheet: buildRingFx(), w: FX.ring.w, h: FX.ring.h, k: 1 },
    { name: "КОПЬЁ", sheet: buildSpearFx(), w: FX.spear.w, h: FX.spear.h, k: 3 },
    { name: "КРУГ СБОРКИ", sheet: buildCircleFx(), w: FX.circle.w, h: FX.circle.h, k: 2 },
  ];
  save(buildCompare(sheets, A, fx), "r65n-e-compare.png");
  if (quick) return files;
  const sheet = new PC(N * FROST_COLS, FH * 3), glow = new PC(N * FROST_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], FROST_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], FROST_ANIMS[a].col * N, 0); }
  save(sheet, "frost-sheet.png");
  save(buildBearerUnit(), "frost-bearer.png");
  save(glow, "frost-glow.png");
  for (const f of fx) save(f.sheet, `frost-fx-${f.name === "КОЛЬЦО ТОПОТА" ? "ring" : f.name === "КОПЬЁ" ? "spear" : "circle"}.png`);
  const rowsN = ["вниз", "вверх", "вбок"];
  const bad: string[] = [];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < FROST_COLS; cI++) {
    let hits = 0;
    for (let k2 = 0; k2 < FH; k2++) for (const [x, y] of [[0, k2], [N - 1, k2]]) { const q = sheet.get(cI * N + x, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    for (let k2 = 0; k2 < N; k2++) for (const y of [0, FH - 1]) { const q = sheet.get(cI * N + k2, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    if (hits) bad.push(`лист, ${rowsN[r]}, кадр ${cI + 1}: ${hits} px не цветом контура на краю`);
  }
  console.log(`  ${ID}: ${FROST_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/bone_frost_lord.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeFrostArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick") || process.argv.includes("--sil") || process.argv.includes("--death"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross; void easeIn; void stackRows; void depthOf; void sealPinholes; void perp; void lerpV; void ik; void rot; void sub; void snapPx;
void lerp; void clamp; void mat; void PX; void add; void norm; void toView; void fromView; void hash01; void easeInOut; void easeOut;
