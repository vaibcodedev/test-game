/**
 * Задача 142, пилот: боевой конь в гербовой броне со знаменем на древке (референсы tools/out/refs/mounts/20-banner_armored_horse,
 * 07-banner_parade_horse, 03-spiked_armored_horse). Два варианта по фракции всадника:
 *   Сольгард — серый в яблоках конь, сталь с золотом, лазурная попона с золотым подолом, знамя «Восход над Оплотом»;
 *   Умбрат — вороной конь, чёрное железо с серебром, чёрно-пурпурная попона, костяное древко, знамя «Корона над гробом».
 * Герб — на попоне (бок, круп), медальон на нагруднике, на знамени. Светятся камни налобника и нагрудника (ночью видно).
 *
 * Анимации: бег — галоп 12 кадров (копыта по очереди: задние, затем передние, качание корпуса, грива и хвост по ветру,
 * знамя сносит назад); покой — 24 кадра: стоит, роет землю правым передним копытом (два удара), встряхивает гривой и головой,
 * поводит ухом и хвостом. Тело в покое между действиями не шевелится (рисунок не «кипит»).
 */
import {
  Scene, R, mat, add, mul, norm, lerpV, ik, rot, rotAxis, easeInOut, clamp, lerp, TAU, hash01, hex,
  type V3, type View, type Mat, type Prim, type TexFn, type RGBA,
} from "../mobs/lib";
import { factionEmblem } from "../heraldry";
import { front, pcStamp, VB, type Built, type Fac, type Frame, type MountSpec, type MView } from "./lib";

// ---------------- материалы ----------------
interface Kit {
  coat: Mat; coatDk: Mat; mane: Mat; hoof: Mat; metal: Mat; trim: Mat; cloth: Mat; hem: Mat; leather: Mat; gem: Mat; eye: string;
}
/** Блик металла: две ступени к свету. */
const spec = (m: () => Mat, at = 0.66): TexFn => (c) => (c.edge ? 0 : c.lum > 0.86 ? 2 : c.lum > at ? 1 : 0);
void spec;
function kitOf(fac: Fac): Kit {
  if (fac === "solgard") return {
    coat: mat("гнедая шерсть", R("#1e0e08", "#3a1e10", "#5e321a", "#864c28", "#ac6c3a", "#cc9058"), { base: 2.0, gain: 2.5, hi: 5 }),
    coatDk: mat("гнедая тень", R("#160a06", "#2c160c", "#4a2814", "#6a3c20", "#8c5630"), { base: 1.8, gain: 2.3, hi: 4 }),
    mane: mat("чёрная грива", R("#0a0806", "#1a1410", "#2e241c", "#463a2e", "#625444"), { base: 2.0, gain: 2.3 }),
    hoof: mat("копыто", R("#120c0a", "#241a14", "#3a2c22", "#54402e", "#6e5640"), { base: 1.6, gain: 2.2 }),
    metal: mat("сталь", R("#1a1e26", "#2c313c", "#464e5e", "#68728a", "#929db4", "#c4cee0", "#f4f8ff"), { base: 1.9, gain: 3.0, hi: 6 }),
    trim: mat("золото", R("#3a2006", "#5e380c", "#8e5816", "#c48424", "#eab040", "#ffd86a", "#fff4c0"), { base: 2.6, gain: 2.8, hi: 6 }),
    cloth: mat("лазурь", R("#0c2444", "#12365e", "#1f5a96", "#3a86c8", "#7ec8ff"), { base: 1.9, gain: 2.2 }),
    hem: mat("белое сукно", R("#5a5462", "#7a7480", "#aaa4ae", "#d6d0d8", "#f6f2f8"), { base: 2.0, gain: 2.2 }),
    leather: mat("кожа", R("#24160e", "#3e2618", "#6a4228", "#94613a", "#bb8a58"), { base: 1.9, gain: 2.3 }),
    gem: mat("лазурный камень", R("#1a3a8a", "#2e6ad0", "#5aa8ff", "#a8dcff", "#ffffff"), { base: 2.6, gain: 1.4, crisp: true, glow: true }),
    eye: "#a8dcff",
  };
  return {
    coat: mat("вороная шерсть", R("#07060b", "#120f19", "#211b2b", "#33293f", "#4a3c5a", "#66547a"), { base: 2.0, gain: 2.5, hi: 5 }),
    coatDk: mat("вороная тень", R("#050409", "#0e0b14", "#1a1522", "#2a2234", "#3c3048"), { base: 1.7, gain: 2.2, hi: 4 }),
    mane: mat("чёрная грива", R("#08060c", "#16101e", "#271c34", "#3d2a50", "#5a3e74"), { base: 2.0, gain: 2.3 }),
    hoof: mat("копыто", R("#0a0808", "#1a1412", "#2c2420", "#40362e", "#56483c"), { base: 1.6, gain: 2.2 }),
    metal: mat("чёрное железо", R("#08080e", "#14141e", "#24243a", "#3a3a56", "#56547a", "#7c7aa0", "#b0aed0"), { base: 1.9, gain: 3.0, hi: 6 }),
    trim: mat("серебро", R("#14121c", "#26222e", "#423e52", "#6a6680", "#9a97b0", "#cac8dc", "#f4f4fc"), { base: 2.6, gain: 2.8, hi: 6 }),
    cloth: mat("чернь", R("#07040c", "#100a1a", "#22163a", "#382858", "#4e3a72"), { base: 1.9, gain: 2.2 }),
    hem: mat("пурпур", R("#1a0e2c", "#2a1846", "#46265e", "#6a3c8a", "#9a62b8"), { base: 2.0, gain: 2.2 }),
    leather: mat("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), { base: 1.9, gain: 2.3 }),
    gem: mat("ядовитый камень", R("#1e5a1a", "#3fcf45", "#7aff6a", "#c0ff9a", "#efffe0"), { base: 2.6, gain: 1.4, crisp: true, glow: true }),
    eye: "#7aff6a",
  };
}

// ---------------- текстуры ----------------
const hairTex: TexFn = (c) => (c.edge ? 0 : (Math.floor(c.l[0] * 1.6 + c.l[1] * 0.9 + 40) % 3 === 0 ? -0.7 : 0.15));
const dapple = (amt: number): TexFn => (c) => {
  if (c.edge) return 0;
  const h = hash01(Math.floor(c.l[0] * 0.55 + 30), Math.floor(c.l[1] * 0.55 + 30) * 7 + Math.floor(c.l[2] * 0.55 + 30), 11);
  return h < amt ? -0.75 : 0;
};
/** Пластина с каймой: край эллипсоида/бруска — золото (серебро), середина — металл с бликом. */
const rimTex = (trim: Mat, k = 0.72): TexFn => (c) => {
  if (!c.edge && c.lum > 0.86) return 2;
  if (c.lum > 0.66 && !c.edge) return 1;
  return Math.abs(c.u) > k ? { mat: trim, d: 0 } : 0;
};

// ---------------- поза ----------------
interface Leg { foot: V3; fold: number }
interface Pose {
  bob: number; pitch: number; roll: number;
  neckP: number; neckY: number; headP: number; headR: number;
  legs: Leg[]; // 0 перед-лев, 1 перед-прав, 2 зад-лев, 3 зад-прав
  maneSw: number[]; maneBack: number; maneDrop: number;
  tailY: number; tailLift: number; tailWave: number; tailPh: number;
  ear: number; run: boolean;
}
const FX = 4.2, HX = 4.6, FY = 12.2, HY = -11.6;
const stand = (): Leg[] => [
  { foot: [-FX, FY, 0], fold: 0 }, { foot: [FX, FY, 0], fold: 0 }, { foot: [-HX, HY, 0], fold: 0 }, { foot: [HX, HY, 0], fold: 0 },
];
/** Галоп: фазы копыт (задние, затем передние), опора 40 % цикла. */
function runPose(t: number): Pose {
  const S = 0.42 * 0.85;
  const ph = [0.5, 0.6, 0.0, 0.1];
  const legs = stand().map((l, i) => {
    const front = i < 2;
    const reach = (front ? 7.2 : 6.6) * 1.3, lift = (front ? 5.2 : 3.8) * 1.15;
    const u = (((t + ph[i]) % 1) + 1) % 1;
    let dy = 0, z = 0, fold = 0;
    if (u < S) dy = reach * (1 - (2 * u) / S);
    else {
      const s = (u - S) / (1 - S);
      dy = -reach + 2 * reach * easeInOut(s);
      z = lift * Math.sin(Math.PI * s);
      fold = (front ? 1.9 : 1.3) * Math.sin(Math.PI * Math.min(1, s * 1.15));
    }
    return { foot: [l.foot[0], l.foot[1] + dy, z] as V3, fold };
  });
  const w = TAU * t;
  return {
    bob: 1.3 * Math.sin(w + 2.2), pitch: 0.075 * Math.sin(w + 0.4), roll: 0,
    neckP: 0.12 + 0.1 * Math.sin(w - 0.6), neckY: 0, headP: 0.05 * Math.sin(w - 1), headR: 0,
    legs, maneSw: [0, 1, 2, 3, 4, 5].map((k) => 0.6 * Math.sin(w * 2 - k * 0.9)), maneBack: 3.2, maneDrop: 0.9,
    tailY: 0, tailLift: 0.75, tailWave: 1, tailPh: w * 2, ear: -0.5, run: true,
  };
}
/** Ключи «рытья» правым передним: [доля, dy, z, излом]. */
const PAW: [number, number, number, number][] = [
  [0.0, 0, 0, 0], [0.1, 2.0, 3.6, 1.2], [0.22, 3.4, 2.4, 0.7], [0.3, 1.8, 0.2, 0.2], [0.4, -0.6, 0.0, 0.0],
  [0.5, 2.0, 3.6, 1.2], [0.62, 3.4, 2.4, 0.7], [0.7, 1.8, 0.2, 0.2], [0.8, -0.6, 0, 0], [1.0, 0, 0, 0],
];
function keyed(keys: [number, number, number, number][], s: number): [number, number, number] {
  for (let k = 0; k + 1 < keys.length; k++) {
    const a = keys[k], b = keys[k + 1];
    if (s <= b[0]) { const e = easeInOut((s - a[0]) / (b[0] - a[0])); return [lerp(a[1], b[1], e), lerp(a[2], b[2], e), lerp(a[3], b[3], e)]; }
  }
  const z = keys[keys.length - 1];
  return [z[1], z[2], z[3]];
}
const win = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);
function idlePose(i: number, n: number): Pose {
  const u = i / n;
  const legs = stand();
  // рытьё: кадры 2..11
  const sp = win(u, 2 / 24, 12 / 24);
  let neckP = 0;
  if (sp > 0 && sp < 1) {
    const [dy, z, f] = keyed(PAW, sp);
    legs[1] = { foot: [FX, FY + dy, z], fold: f };
    neckP = 0.2 * Math.sin(Math.PI * sp);
  }
  // встряхивание: кадры 14..22 — поворот шеи и крен головы, затухает; грива запаздывает
  const ss = win(u, 14 / 24, 22 / 24);
  const shake = (s: number) => (s <= 0 || s >= 1 ? 0 : Math.sin(TAU * 2 * s) * Math.pow(1 - s, 0.8) * Math.sin(Math.PI * Math.min(1, s * 4)));
  const neckY = 0.32 * shake(ss);
  const sLag = (k: number) => shake(win(u - (k * 0.35) / 24, 14 / 24, 22 / 24));
  const maneSw = [0, 1, 2, 3, 4, 5].map((k) => -3.2 * sLag(k + 1));
  // ухо — кадры 0..2 и 12..13; хвост — взмах в кадрах 8..14
  const ear = u < 3 / 24 ? Math.sin((Math.PI * u * 24) / 3) : 0;
  const ts = win(u, 8 / 24, 15 / 24);
  return {
    bob: 0, pitch: 0, roll: 0, neckP: neckP - 0.08 * Math.sin(Math.PI * ss), neckY, headP: 0, headR: 0.25 * shake(win(u - 0.6 / 24, 14 / 24, 22 / 24)),
    legs, maneSw, maneBack: 0, maneDrop: 1,
    tailY: 0.5 * Math.sin(TAU * ts) * Math.sin(Math.PI * ts), tailLift: 0, tailWave: 0.25, tailPh: 0, ear, run: false,
  };
}


// ---------------- павший конь (объекты Полей: tools/gen/bf-horses.ts) ----------------
/** Поза павшего коня: корпус опрокинут на бок (roll), ноги вытянуты вдоль земли или подогнуты, шея и голова лежат. */
export interface DeadOpt {
  /** крен корпуса, рад: знак — на какой бок лёг (верхний бок — к камере у +), 1.1 ≈ 63° */
  roll: number;
  legs: "stretch" | "fold";
  neck: "flat" | "lift" | "back";
  /** смещение хвоста вбок */
  tail?: number;
  /** стрелы в боку и дышло — рисует bf-horses поверх кадра */
  bob?: number;
}
function deadPose(o: DeadOpt): Pose {
  const s = Math.sign(o.roll) || 1;
  const neck = o.neck === "flat" ? { neckP: 1.25, headP: -0.9, neckY: 0.0 } : o.neck === "lift" ? { neckP: 0.9, headP: -0.7, neckY: 0.12 * s } : { neckP: 0.3, headP: -0.2, neckY: -0.25 * s };
  return {
    bob: o.bob ?? -13.5, pitch: 0, roll: o.roll, ...neck, headR: 0.15 * s,
    legs: stand(), maneSw: [0.6, 0.9, 1.1, 1.2, 1.3, 1.4].map((v) => v * s), maneBack: 0, maneDrop: 0.55,
    tailY: (o.tail ?? 0.6) * s, tailLift: 0, tailWave: 0.1, tailPh: 0.5, ear: -0.6, run: false,
  };
}
/** Копыто мёртвого коня: лёжа на боку ноги — вытянутые вдоль земли (stretch) или подогнутые (fold); hip — мировая точка бедра. */
function deadLeg(o: DeadOpt, i: number, hip: V3): { foot: V3; fold: number; bend: V3 } {
  const out = Math.sign(o.roll) || 1, fr = i < 2, k = i % 2;
  if (o.legs === "stretch") {
    // вытянуты веером: передние вперёд, задние назад, дальняя нога дальше в сторону — ноги не сливаются с корпусом
    const dx = k ? 8.5 : 2.5, dy = fr ? (k ? 15 : 21) : -(k ? 14 : 20);
    return { foot: [hip[0] + out * dx, hip[1] + dy, 1.8], fold: 0, bend: [out * 0.2, 0, 1] };
  }
  // подогнуты: копыта под брюхо, колени торчат в стороны веером
  const dx = k ? 11 : 6, dy = fr ? (k ? -2 : -6) : (k ? 2 : 6);
  return { foot: [hip[0] + out * dx, hip[1] + dy, 1.8], fold: 0.9, bend: [out * 0.6, fr ? 0.9 : -0.9, 0.6] };
}

// ---------------- сборка ----------------
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
const HOOF_LIGHT: Mat = mat("копыто (светлая кромка)", R("#4a3a2c", "#7a6650", "#a8926e", "#d0be98", "#f0e4c4"), { base: 2.2, gain: 2.4 });
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function warHorse(fac: Fac): MountSpec { return makeHorse(fac); }
/** Павший конь той же модели (броня, попона, седло, голова — как у живого): поза deadPose, без знамени. */
export function warHorseDead(fac: Fac, dead: DeadOpt): MountSpec { return makeHorse(fac, dead); }
function makeHorse(fac: Fac, dead?: DeadOpt): MountSpec {
  const K = kitOf(fac);
  const em = pcStamp(factionEmblem(fac, "s16"));
  const sol = fac === "solgard";
  // медальон нагрудника 9×9: Сольгард — восходящее солнце на лазури; Умбрат — корона над черепом
  const medal: { rows: string[]; colors: Record<string, RGBA> } = sol
    ? { rows: ["..YYYYY..", ".YGgggGY.", "YGgYYYgGY", "YgYWWWYgY", "YgYWWWYgY", "YgaaaaagY", "YGabbbaGY", ".YGgggGY.", "..YYYYY.."],
        colors: { Y: hex("#ffd864"), G: hex("#e0a630"), g: hex("#a8681c"), W: hex("#fff2b0"), a: hex("#3a86c8"), b: hex("#1f5a96") } }
    : { rows: ["..p.p.p..", ".ppPpPpp.", ".PPPPPPP.", ".bBBBBBb.", ".BkBBkBB.", ".BkBBkBb.", "..BBkBB..", "..bBBBb..", "...bbb..."],
        colors: { p: hex("#6a3c8a"), P: hex("#9a62b8"), B: hex("#c8bc9c"), b: hex("#8f8468"), k: hex("#7aff6a") } };
  const build = (f: Frame, view: MView): Built => {
    void view;
    const p = dead ? deadPose(dead) : f.anim === "run" ? runPose(f.i / f.n) : idlePose(f.i, f.n);
    const sc = new Scene();
    const b = { sc, bits: new Map<Prim, number>() };
    // корпус: наклон вокруг центра и подъём
    const PIV: V3 = [0, 0, 22];
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const T = (q: V3): V3 => {
      const x = q[0] * cr - (q[2] - PIV[2]) * sr, y = q[1], z = q[0] * sr + (q[2] - PIV[2]) * cr;
      const c = Math.cos(p.pitch), s = Math.sin(p.pitch);
      return [x, y * c - z * s, PIV[2] + z * c + y * s + p.bob];
    };
    const TD = (d: V3): V3 => { const x = d[0] * cr - d[2] * sr, z0 = d[0] * sr + d[2] * cr; const c = Math.cos(p.pitch), s = Math.sin(p.pitch); return [x, d[1] * c - z0 * s, z0 * c + d[1] * s]; };
    const ax = (a: V3, b2: V3, c: V3): [V3, V3, V3] => [TD(a), TD(b2), TD(c)];

    // ---- ноги ----
    const legG: number[] = [];
    for (let i = 0; i < 4; i++) {
      const fr = i < 2, sx = i % 2 === 0 ? -1 : 1;
      const g = sc.group(0.7);
      legG.push(g);
      let L = p.legs[i];
      const hip = T(fr ? [sx * FX, 11.4, 19.6] : [sx * HX, -11.4, 20.6]);
      let bendV: V3 = fr ? [0, 1, -0.2] : [0, -1, -0.2];
      if (dead) { const d = deadLeg(dead, i, hip); L = { foot: d.foot, fold: d.fold }; bendV = d.bend; }
      // путовая кость: от копыта к щётке; в махе подгибается назад
      const pd = dead ? mul(norm(add(hip, mul(L.foot, -1))), 3.3) : rotAxis([0, -0.9, 3.2], X, -L.fold);
      const hoof = L.foot;
      const fet = add(hoof, pd);
      const lk = dead ? 1.3 : 1, l1 = (fr ? 9.3 : 11.4) * lk, l2 = (fr ? 7.3 : 8.2) * lk;
      const knee = ik(hip, fet, l1, l2, bendV);
      const m = sx > 0 ? K.coat : K.coatDk;
      const mk = (q: Prim) => q;
      if (fr) {
        mk(sc.cone(g, m, hip, 3.4, knee, 2.1));
        sc.cone(g, m, knee, 2.0, fet, 1.65);
      } else {
        sc.cone(g, m, hip, 3.8, knee, 2.0);
        sc.cone(g, m, knee, 1.85, fet, 1.6);
      }
      // наколенник (передние) и щиток скакательного сустава (задние)
      front(b, fr ? VB.down : VB.up, () => {
        const kc = add(knee, fr ? [0, 1.1, 0.2] : [0, -1.0, 0.3]);
        sc.ball(sc.group(0), K.metal, kc, 2.25, { tex: rimTex(K.trim, 0.55) });
        if (sol) sc.ball(sc.group(0), K.trim, add(kc, [0, fr ? 1.9 : -1.9, 0.2]), 0.8, { tex: spec(() => K.trim) });
        else sc.cone(sc.group(0), K.trim, add(kc, [0, fr ? 1.6 : -1.6, 0.4]), 0.8, add(kc, [0, fr ? 3.6 : -3.6, 1.4]), 0.15, { tex: spec(() => K.trim) });
      });
      // поножи: металлический сапог на нижней трети пясти, кайма сверху
      const bt = lerpV(knee, fet, 0.3);
      sc.cone(sc.group(0.2), K.metal, bt, 2.35, add(fet, [0, 0, -0.4]), 2.45, { tex: rimTex(K.trim, 0.78) });
      sc.ball(sc.group(0), K.gem, add(lerpV(bt, fet, 0.5), [0, 2.3, 0]), 0.7);
      // щётка и путо
      sc.ball(g, K.mane, add(fet, [0, -0.5, -0.6]), 2.1, { tex: hairTex });
      const hc = add(hoof, mul(norm(pd), 1.3));
      sc.cone(g, m, fet, 1.6, hc, 1.75);
      const hd = norm(pd);
      const hs = norm([1, 0, 0]);
      const hs2: V3 = dead ? norm([-hd[1], hd[0], 0.001]) : hs;
      sc.box(sc.group(0), dead ? HOOF_LIGHT : K.hoof, add(hoof, mul(hd, 0.9)), dead ? [2.8, 3.1, 1.5] : [1.95, 2.25, 1.0], dead ? [hs2, norm(cross3(hd, hs2)), hd] : [hs, norm(rotAxis(Y, X, -L.fold)), hd], 0.45, { big: false });
    }

    // ---- корпус ----
    const gb = sc.group(2.6);
    const coatT: TexFn | undefined = undefined;
    sc.ell(gb, K.coat, T([0, -0.5, 22.2]), [8.0, 13.6, 7.0], ax(X, Y, Z), { tex: coatT });
    sc.ell(gb, K.coat, T([0, 10.6, 22.4]), [7.8, 6.6, 6.6], ax(X, Y, Z), { tex: coatT });
    sc.ell(gb, K.coat, T([0, -10.6, 23.2]), [8.2, 6.9, 6.9], ax(X, Y, Z), { tex: coatT });
    for (const sx of [-1, 1]) {
      sc.ell(gb, K.coat, T([sx * 3.9, 10.4, 21.2]), [3.2, 4.4, 6.2], ax(X, Y, Z), { tex: coatT });
      sc.ell(gb, K.coat, T([sx * 4.3, -11.6, 21.6]), [3.4, 5.6, 6.8], ax(X, Y, Z), { tex: coatT });
    }
    sc.ball(gb, K.coat, T([0, 8.4, 28.4]), 3.6);

    // ---- шея, голова, грива (поверх всадника при взгляде вниз) ----
    const NB = T([0, 12.4, 25.6]);
    const neckK = dead ? 1.45 : 1, hk = dead ? 1.6 : 1.15;
    const neckAx = (v: V3): V3 => TD(rot(v, p.neckP, p.neckY));
    const neckDir = (v: V3): V3 => mul(neckAx(v), neckK);
    const poll = add(NB, neckDir([0, 7.2, 12.4]));
    front(b, VB.down, () => {
      const gn = sc.group(2.2);
      sc.cone(gn, K.coat, NB, 6.0, add(NB, neckDir([0, 4.2, 5.6])), 4.6);
      sc.cone(gn, K.coat, add(NB, neckDir([0, 4.2, 5.6])), 4.6, add(poll, neckDir([0, 0.4, -1.2])), 3.1);
      sc.cone(gn, K.coat, add(NB, neckDir([0, -3.2, 4.8])), 3.6, add(poll, neckDir([0, -1.2, 0.2])), 2.7);
      // голова: оси — вниз-вперёд (w), лицом вперёд-вверх (fv), вбок (s)
      const hrot = (v: V3) => neckAx(rotAxis(rotAxis(v, X, p.headP), [0, 0.62, -0.78], p.headR));
      const w = norm(hrot([0, 0.62, -0.78])), fv = norm(hrot([0, 0.78, 0.62])), s = norm(hrot(X));
      const H = (a: number, c: number, d: number): V3 => add(poll, add(mul(w, a), add(mul(fv, c), mul(s, d))));
      const head0 = sc.prims.length, st0 = sc.stamps.length;
      const gh = sc.group(1.4);
      sc.ell(gh, K.coat, H(2.4, 0.3, 0), [2.9, 3.0, 3.8], [s, fv, w]);
      sc.ball(gh, K.coat, H(3.8, -1.8, 0), 2.8);
      sc.cone(gh, K.coat, H(5.0, 0.1, 0), 2.5, H(10.4, -0.3, 0), 2.05);
      sc.ell(gh, sol ? K.coatDk : K.coat, H(10.6, -0.6, 0), [2.2, 2.2, 1.9], [s, fv, w]);
      // уши
      for (const sx of [-1, 1]) {
        const e0 = H(-0.4, -0.4, sx * 1.35);
        const up = norm(add(mul(fv, 0.15 + (sx > 0 ? p.ear * 0.5 : 0)), add(mul(w, -1), mul(s, sx * 0.3))));
        sc.cone(sc.group(0.4), K.coat, e0, 0.9, add(e0, mul(up, 3.2)), 0.3);
      }
      // глаза
      for (const sx of [-1, 1]) sc.stamps.push({ at: H(2.6, 0.7, sx * 2.6), n: norm(add(mul(s, sx), mul(fv, 0.3))), colors: { K: hex("#0a0608"), E: hex(K.eye) }, glow: ["E"], halo: hex(K.eye), px: { side: [[0, 0, "K"], [1, 0, "E"]], down: [[0, 0, "E"]] }, depthTol: 2.5 });
      // налобник: пластина по лбу и носу, гребень, камень, шип/рога
      const gm = sc.group(0.3);
      sc.box(gm, K.metal, H(5.4, 1.75, 0), [2.0, 0.6, 4.9], [s, fv, w], 0.5, { tex: rimTex(K.trim, 0.85) });
      for (const sx of [-1, 1]) sc.ell(gm, K.metal, H(2.2, 0.8, sx * 2.3), [0.6, 1.6, 1.8], [s, fv, w], { tex: spec(() => K.metal) });
      sc.cone(sc.group(0), K.trim, H(1.0, 2.5, 0), 0.7, H(9.4, 2.1, 0), 0.55, { tex: spec(() => K.trim) });
      sc.ball(sc.group(0), K.gem, H(2.4, 2.75, 0), 0.95);
      // гребень налобника: три пера-шипа назад-вверх
      for (let k = 0; k < 3; k++) {
        const c0 = H(0.4 + k * 1.5, 2.5 - k * 0.05, 0);
        sc.cone(sc.group(0.2), K.trim, c0, 0.85 - k * 0.12, add(c0, add(mul(fv, 1.4 - k * 0.3), mul(w, -2.8 + k * 0.6))), 0.15, { tex: spec(() => K.trim) });
      }
      if (sol) for (const sx of [-1, 1]) {
        const h0 = H(1.4, 1.4, sx * 2.4);
        sc.cone(sc.group(0.2), K.trim, h0, 0.6, add(h0, add(mul(s, sx * 1.6), add(mul(w, -1.2), mul(fv, 0.6)))), 0.12, { tex: spec(() => K.trim) });
      }
      else for (const sx of [-1, 1]) {
        const h0 = H(0.2, 1.8, sx * 1.6);
        sc.cone(sc.group(0.2), K.trim, h0, 0.85, add(h0, add(mul(w, -3.6), add(mul(s, sx * 1.2), mul(fv, -1.2)))), 0.15, { tex: spec(() => K.trim) });
      }
      // уздечка
      for (const sx of [-1, 1]) sc.ball(sc.group(0), K.trim, H(9.0, -0.8, sx * 1.9), 0.55);
      // голова крупнее (боевой конь): всё от затылка ×1.15
      for (let k = head0; k < sc.prims.length; k++) {
        const q = sc.prims[k], S = (v: V3): V3 => add(poll, mul(add(v, mul(poll, -1)), hk));
        q.a = S(q.a); q.b = S(q.b); q.anc = S(q.anc); q.ra *= hk; q.rb *= hk; q.r = mul(q.r, hk); q.rr *= hk;
      }
      for (let k = st0; k < sc.stamps.length; k++) sc.stamps[k].at = add(poll, mul(add(sc.stamps[k].at, mul(poll, -1)), hk));
      // цепь от удил к нагруднику (провисает)
      const HS = (a: number, c: number, d: number): V3 => add(poll, mul(add(H(a, c, d), mul(poll, -1)), hk));
      for (const sx of [-1, 1]) {
        const a0 = HS(9.0, -0.8, sx * 2.1), a1 = T([sx * 6.8, 15.6, 25.2]);
        const n = 8;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const q = add(lerpV(a0, a1, t), [0, 0, -2.6 * 4 * t * (1 - t)]);
          sc.ball(sc.group(0), k % 2 ? K.metal : K.trim, q, k % 2 ? 0.6 : 0.5, { big: false });
        }
      }
      // гривна (шейные пластины)
      const crest = (t: number): V3 => lerpV(add(NB, neckDir([0, -2.6, 6.0])), add(poll, neckDir([0, -1.6, 1.2])), t);
      {
        const c0 = crest(0.0), c1 = crest(0.62);
        const along = norm(add(c1, mul(c0, -1))), nrm = norm([0, -along[2], along[1]]);
        const band: TexFn = (c) => (c.lum > 0.72 && !c.edge ? 1 : ((c.u * 3.2) % 1) < 0.16 ? { mat: K.trim, d: 0.3 } : 0);
        sc.cone(sc.group(0), K.metal, add(c0, mul(nrm, 0.9)), 3.4, add(c1, mul(nrm, 0.7)), 2.7, { tex: band });
      }
      // грива: пряди из-под пластин на правую сторону, чёлка
      for (let k = 0; k < 9; k++) {
        const t = 0.02 + k * 0.11;
        const sw = p.maneSw[Math.min(5, Math.floor(k * 0.66))] ?? 0;
        for (const layer of [0, 1]) {
          const r0 = add(crest(t + layer * 0.05), [0.9 + layer * 0.9, 0, -0.3 - layer * 0.6]);
          const len = 1 + 0.25 * Math.sin(k * 2.3 + layer);
          const tip = add(r0, [1.2 + layer * 0.6 + sw * 0.7, (-1.0 - p.maneBack) * len, -3.6 * p.maneDrop * len]);
          const mid = add(lerpV(r0, tip, 0.5), [sw * 0.45 + 0.5, 0, 0.4]);
          const gmn = sc.group(0.6);
          const m = layer ? K.mane : { ...K.mane, base: K.mane.base - 0.5 } as Mat;
          sc.cone(gmn, m, r0, 1.6, mid, 1.35, { tex: hairTex });
          sc.cone(gmn, m, mid, 1.35, tip, 0.5, { tex: hairTex });
        }
      }
      sc.cone(sc.group(0.3), K.mane, H(0.4, 1.2, 0.2), 1.0, H(2.2, 2.9, 0.4), 0.55, { tex: hairTex });
      // нагрудник с медальоном и камнем
      const gp = sc.group(0.8);
      const pc0 = T([0, 14.5, 21.4]);
      const pax = ax(X, norm([0, 0.96, -0.28]), norm([0, 0.28, 0.96]));
      sc.ell(gp, K.metal, pc0, [8.8, 2.6, 5.6], [pax[0], pax[1], pax[2]], { tex: (c) => (c.lum > 0.74 && !c.edge ? 1 : Math.hypot(c.l[0] / 8.8, c.l[2] / 5.6) > 0.82 ? { mat: K.trim, d: 0 } : 0) });
      sc.stamps.push({ at: add(pc0, add(mul(pax[1], 2.6), mul(pax[2], 0.6))), n: pax[1], colors: em.colors, px: { down: em.px }, depthTol: 3 });
      sc.ball(sc.group(0), K.gem, add(pc0, add(mul(pax[1], 2.0), mul(pax[2], -4.6))), 0.9);
      // наплечники: пластины с медальоном, камнем и шипом (Умбрат)
      for (const sx of [-1, 1]) {
        const pc1 = T([sx * 8.3, 11.0, 25.2]);
        sc.ell(sc.group(0.3), K.metal, pc1, [1.9, 5.0, 4.4], ax(norm([1, 0, sx * 0.0]), Y, Z), { tex: rimTex(K.trim, 0.8) });
        sc.stamps.push({ at: add(pc1, [sx * 1.9, 0, 0.2]), n: TD([sx, 0, 0.2]), colors: medal.colors, px: { side: rowsPx(medal.rows) }, depthTol: 3, minFacing: 0.3 });
        sc.ball(sc.group(0), K.gem, add(pc1, TD([sx * 1.4, 3.6, 2.4])), 0.75);
        if (!sol) sc.cone(sc.group(0), K.trim, add(pc1, TD([sx * 1.2, -0.5, 3.4])), 0.9, add(pc1, TD([sx * 2.6, -1.8, 7.0])), 0.15, { tex: spec(() => K.trim) });
      }
    });

    // ---- попона: передняя и задняя часть (задняя — поверх всадника со спины), подол ----
    const hemTex: TexFn = (c) => {
      const zb = c.l[2];
      if (zb < -6.0) return { mat: K.trim, d: ((c.x + 40) % 3 === 0 ? -1.2 : 0) + (c.lum > 0.6 ? 0.6 : 0) };
      if (zb < -4.7) return { mat: K.hem, d: 0 };
      return 0;
    };
    const capAx = ax(X, Y, Z).map((v) => v) as [V3, V3, V3];
    // ось z бруска — вверх: местное l[2] — высота от центра
    const capBox = (cy: number, hy: number) => sc.box(sc.group(0), K.cloth, T([0, cy, 21.4]), [9.3, hy, 7.2], [capAx[0], capAx[1], capAx[2]], 4.4, { tex: hemTex });
    capBox(3.2, 6.6);
    front(b, VB.up, () => capBox(-9.0, 6.6));
    // гербы на попоне: бока (вбок), круп (вверх)
    for (const sx of [-1, 1]) sc.stamps.push({ at: T([sx * 9.3, -9.6, 22.4]), n: TD([sx, 0, 0]), colors: em.colors, px: { side: em.px }, depthTol: 3, minFacing: 0.3 });
    sc.stamps.push({ at: T([0, -15.6, 22.6]), n: TD([0, -1, 0]), colors: em.colors, px: { up: em.px }, depthTol: 3, minFacing: 0.3 });

    // ---- круп и хвост (поверх всадника со спины) ----
    front(b, VB.up, () => {
      const base = T([0, -16.8, 26.4]);
      const pts: V3[] = [base];
      let cur = base;
      for (let k = 1; k <= 8; k++) {
        const s = k / 8;
        const sw = Math.sin(p.tailPh - k * 0.7) * p.tailWave * s;
        const dz = p.tailLift ? 0.35 - 0.6 * s : 0.5 - 3.4 * s;
        const dir: V3 = norm([sw * 0.7 + p.tailY * 1.4 * s, -1.0 + (p.tailLift ? 0 : 0.35 * s), dz]);
        cur = add(cur, mul(dir, 3.0));
        pts.push(cur);
      }
      const RR = [2.2, 2.7, 2.8, 2.6, 2.3, 1.9, 1.5, 1.1, 0.7];
      for (const [ox, k0, dz] of [[0, 1, 0], [-1.3, 0.75, 0.6], [1.3, 0.75, 0.6]] as [number, number, number][]) {
        const gt = sc.group(0.9);
        const off = (k: number): V3 => [ox * (k / 8) * 1.4 + Math.sin(p.tailPh - k * 0.9 + ox) * 0.35 * (k / 8), 0, dz * (k / 8)];
        for (let k = 0; k + 1 < pts.length; k++) sc.cone(gt, ox ? { ...K.mane, base: K.mane.base - 0.4 } as Mat : K.mane, add(pts[k], off(k)), RR[k] * k0, add(pts[k + 1], off(k + 1)), RR[k + 1] * k0, { tex: hairTex });
      }
      // кринка: пластина на крупе
    });

    // ---- седло ----
    const gs = sc.group(0.6);
    sc.ell(gs, K.leather, T([0, -0.8, 30.0]), [5.8, 5.8, 1.6], ax(X, Y, Z));
    sc.box(gs, K.trim, T([0, 4.6, 31.4]), [2.6, 0.9, 1.4], ax(X, Y, Z), 0.6, { tex: spec(() => K.trim) });
    sc.box(gs, K.trim, T([0, -6.0, 32.0]), [3.8, 0.9, 1.9], ax(X, norm([0, 0.9, 0.4]), norm([0, -0.4, 0.9])), 0.6, { tex: spec(() => K.trim) });
    // крылья седла и стремена: ближнее — поверх всадника сбоку
    for (const sx of [-1, 1]) {
      const add1 = () => {
        sc.box(sc.group(0.2), K.leather, T([sx * 9.6, -0.6, 25.6]), [0.6, 3.4, 4.0], ax(X, Y, Z), 0.4, { tex: (c) => (Math.abs(c.l[1]) > 2.7 || c.l[2] < -3.3 ? { mat: K.trim, d: 0 } : 0) });
        sc.cone(sc.group(0), K.trim, T([sx * 10.1, 0, 21.0]), 0.9, T([sx * 10.1, 0, 19.6]), 0.9);
      };
      front(b, sx > 0 ? VB.side : VB.left, add1);
    }
    // гнездо древка за седлом
    const sock = T([3.6, -7.6, 29.0]);
    if (!dead) {
      sc.cone(sc.group(0.2), K.leather, sock, 1.3, add(sock, [0, 0, 2.6]), 1.2);
      sc.ball(sc.group(0), K.trim, add(sock, [0, 0, 2.6]), 1.1);
    }
    return {
      sc: b.sc, bits: b.bits,
      seat: T([0, -0.8, 31.4]),
      stride: (2 * 7.2 * 1.3) / (0.42 * 0.85),
      ...(dead ? {} : { banner: { fac, base: add(sock, [0, 0, 2]), top: T([3.6, -7.6, 56]), t: Math.round((f.i * 12) / f.n) % 12, run: f.anim === "run", hang: { down: -1, up: 1, side: -1, left: 1 } } }),
    };
  };
  return { id: `war_horse_${fac}`, ru: sol ? "Боевой конь Сольгарда" : "Боевой конь Умбрата", N: 120, GY: 98, scale: dead ? 1.45 : 1.15, build };
}
function rowsPx(rows: string[]): [number, number, string][] {
  const out: [number, number, string][] = [];
  const x0 = -Math.floor(rows[0].length / 2), y0 = -Math.floor(rows.length / 2);
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
}
