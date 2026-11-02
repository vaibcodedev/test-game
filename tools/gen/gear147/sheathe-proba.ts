/**
 * ПРОБА (не в игре): оружие вне боя / в бою для героя Б — где носится убранное оружие, анимация «достать / убрать»,
 * призыв и растворение сфер мага, бег с убранным оружием во все 4 стороны.
 *   npx tsx tools/gen/gear147/sheathe-proba.ts [weapon...]  → tools/out/gear147/sheathe/ (index.html, <вариант>.png, sheathe.png)
 * Основа и снаряжение — tools/gen/hero147/base_b.ts и tools/gen/gear147/gear.ts (только чтение): убранное оружие рисуется
 * тем же описанием вещи (gear.ts → dress, слот weapon/offhand) в другой точке скелета; ножны, колчан, перевязь и сферы — здесь.
 * Правило правой руки: оружие — в правой (у основы рука L, ось +A), щит и второй кинжал — в левой.
 */
import fs from "node:fs";
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { hx, type C } from "../bosses139/mino_lib";
import { solve, type AnimId, type GearCtx, type Look, type Part, type Pose, type Sk, type V3 } from "../hero147/base_b";
import { dress, ramp, renderView, setOf, VIEWS4, type SetDef, type View4 } from "./gear";

const OUT = path.resolve("tools/out/gear147/sheathe");
const F64 = 64;
const LOOK: Look = { fac: "sol", sex: "m", hair: "tousled", frame: F64 };

// ---- векторы ----
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
const sum = (...v: V3[]): V3 => v.reduce((s, x) => add(s, x), [0, 0, 0] as V3);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = (t: number) => { t = cl(t); return t * t * (3 - 2 * t); };
const ph = (t: number, a: number, b: number) => sm((t - a) / (b - a));
/** поворот направления a → b с выходом через «вверх», если они почти противоположны */
const slerp = (a: V3, b: V3, e: number, up: V3): V3 => nrm(add(lerp(a, b, e), mul(up, dot(a, b) < 0 ? 0.9 * Math.sin(Math.PI * e) : 0)));
/** точка в кадре торса (A — к правой руке героя, U — вверх, F — вперёд) */
const at = (sk: Sk, o: V3, a: number, u: number, f: number): V3 => sum(o, mul(sk.A, a), mul(sk.U, u), mul(sk.F, f));
/** то же в кадре таза */
const atP = (sk: Sk, o: V3, a: number, u: number, f: number): V3 => sum(o, mul(sk.Ap, a), mul(sk.Up, u), mul(sk.Fp, f));
const dirT = (sk: Sk, a: number, u: number, f: number): V3 => nrm(sum(mul(sk.A, a), mul(sk.U, u), mul(sk.F, f)));
const dirP = (sk: Sk, a: number, u: number, f: number): V3 => nrm(sum(mul(sk.Ap, a), mul(sk.Up, u), mul(sk.Fp, f)));

// ---- оружие пробы ----
const SWORD = { name: "Меч стражи", kind: "one", blade: "dagger_steel", edge: "dagger_steel", hilt: "brass", grip: "leather_dark", accent: "brass", length: 11, width: 2.4, fuller: true };
const GREAT = setOf("plate60-common").items.weapon;
const AXE1 = setOf("axe1-rare").items.weapon;
const AXE2 = setOf("axe2-common").items.weapon;
const DAG = setOf("leather-novice").items.weapon;
const SHIELD = setOf("shield-knight").items.offhand;
const armorOf = (id: string, weapon?: any, offhand?: any): SetDef => { const noHelm = id.endsWith("!"), id0 = id.replace("!", ""), s = id0 === "none" ? { name: "", rarity: "common", level: 1, items: {} } as SetDef : setOf(id0), it = { ...s.items } as any; delete it.weapon; delete it.offhand; if (noHelm) delete it.helm; if (weapon) it.weapon = weapon; if (offhand) it.offhand = offhand; return { ...s, items: it }; };

const LEATHER: C[] = ramp("leather"), RIM: C[] = ["#0a0608", "#120a0e", "#1a0e14", "#22121a", "#2a1620"].map(hx);
// сферы мага: зеленовато-бирюзовое «пепельное пламя» — тон ≥ 40° от цветов редкости и заточки (gear.md §5)
const ORB: C[] = ["#0b2a22", "#13513f", "#1f8a66", "#4fd49a", "#b8ffd9"].map(hx), ORB_RIM: C[] = ["#05140f", "#08201a", "#0c2a20", "#103426", "#143c2c"].map(hx);
const BLADE_G = /^w_(rim|edge|blade|blik|fire|crack|fuller|rune)$/;

type Mount = "back" | "front" | "hand";
interface Stow { G: V3; d: V3; mount: Mount; sheath?: boolean; /** точка хвата вдоль оси от G (лук — за верхнее плечо) */ grab?: number }
type WKind = "blade" | "great" | "axe" | "axe2" | "dual" | "bow" | "staff" | "orbs" | "shield";
interface Spec {
  id: string; w: string; wName: string; tag: string; label: string; idea: string;
  kind: WKind; item?: any; armor: string; combat: SetDef;
  stow: (sk: Sk) => { main?: Stow; off?: Stow };
  strap?: boolean; quiver?: "back" | "hip"; shieldBack?: boolean; orbHip?: boolean; bowChest?: boolean;
}

// ---- точки крепления (кадр торса/таза) ----
const dS = (sk: Sk) => sk.b.shW * 0.46, dW = (sk: Sk) => sk.b.waist * 0.62;
/** ножны на левом бедре (пояс): рукоять вперёд-вверх, клинок назад-вниз — правая рука достаёт крест-накрест */
const hipLeft = (sk: Sk): Stow => ({ G: atP(sk, sk.waist, -(sk.b.waist + 1.5), 0.6, dW(sk) * 0.6 + 0.6), d: dirP(sk, -0.18, -0.85, -0.5), mount: "front", sheath: true });
/** на спине наискосок: рукоять над правым плечом, остриё к левому бедру */
const backDiag = (sk: Sk, up = 2.0, sheath = true): Stow => ({ G: sum(sk.shL, mul(sk.U, up), mul(sk.A, -0.9), mul(sk.F, -(dS(sk) + 1.3))), d: dirT(sk, -0.55, -1, -0.1), mount: "back", sheath });
/** на плече: кисть у правой груди, клинок через плечо назад */
const onShoulder = (sk: Sk): Stow => { const H = at(sk, sk.chest, sk.b.shW * 0.55, -3.0, dS(sk) + 1.6); return { G: H, d: nrm(sub(sum(sk.shL, mul(sk.U, 1.7), mul(sk.F, -3.2)), H)), mount: "hand" }; };

const SPECS: Spec[] = [
  { id: "sword-A", w: "sword", wName: "Меч", tag: "A", label: "Ножны на левом бедре", idea: "WoW, Aion, Lineage 2: одноручный меч в ножнах на поясе, достаёт правой рукой крест-накрест", kind: "blade", item: SWORD, armor: "plate60-common", combat: armorOf("plate60-common", SWORD), stow: (sk) => ({ main: hipLeft(sk) }) },
  { id: "sword-B", w: "sword", wName: "Меч", tag: "B", label: "Ножны на спине", idea: "WoW (часть мечей), BDO: ножны наискосок, рукоять над правым плечом, перевязь через грудь", kind: "blade", item: SWORD, armor: "plate60-common", combat: armorOf("plate60-common", SWORD), stow: (sk) => ({ main: backDiag(sk, 1.6) }), strap: true },
  { id: "sword-C", w: "sword", wName: "Меч", tag: "C", label: "На плече", idea: "Lost Ark, Warspear: клинок лежит на плече, рука на рукояти — быстрый переход в бой", kind: "blade", item: SWORD, armor: "plate60-common", combat: armorOf("plate60-common", SWORD), stow: (sk) => ({ main: onShoulder(sk) }) },
  { id: "great-A", w: "great", wName: "Двуручник", tag: "A", label: "На спине наискосок", idea: "WoW, BDO, GW2: двуручник на спине наискосок на перевязи, достаёт через плечо", kind: "great", item: GREAT, armor: "plate60-common", combat: armorOf("plate60-common", GREAT), stow: (sk) => ({ main: backDiag(sk, 2.4, false) }), strap: true },
  { id: "great-B", w: "great", wName: "Двуручник", tag: "B", label: "На плече", idea: "Lost Ark (берсерк), Warspear: двуручник на плече одной рукой", kind: "great", item: GREAT, armor: "plate60-common", combat: armorOf("plate60-common", GREAT), stow: (sk) => ({ main: onShoulder(sk) }) },
  { id: "axe-A", w: "axe", wName: "Топор", tag: "A", label: "В петле на правом бедре", idea: "WoW, Albion: топор головкой вверх в петле пояса", kind: "axe", item: AXE1, armor: "plate60-common", combat: armorOf("plate60-common", AXE1), stow: (sk) => ({ main: { G: atP(sk, sk.waist, sk.b.waist + 1.1, -((AXE1.length ?? 11) - 3.4), 0.6), d: dirP(sk, 0.06, 1, 0.14), mount: "front" } }) },
  { id: "axe-B", w: "axe", wName: "Топор", tag: "B", label: "На спине", idea: "WoW, GW2: топор на спине топорищем к правому плечу", kind: "axe", item: AXE1, armor: "plate60-common", combat: armorOf("plate60-common", AXE1), stow: (sk) => ({ main: backDiag(sk, 1.4, false) }), strap: true },
  { id: "axe-C", w: "axe", wName: "Топор", tag: "C", label: "На плече", idea: "Warspear, Lost Ark: топор на плече лезвием назад", kind: "axe", item: AXE1, armor: "plate60-common", combat: armorOf("plate60-common", AXE1), stow: (sk) => ({ main: onShoulder(sk) }) },
  { id: "axe2-A", w: "axe2", wName: "Секира", tag: "A", label: "На спине наискосок", idea: "WoW, BDO: двуручная секира на спине", kind: "axe2", item: AXE2, armor: "plate60-common", combat: armorOf("plate60-common", AXE2), stow: (sk) => ({ main: backDiag(sk, 2.2, false) }), strap: true },
  { id: "axe2-B", w: "axe2", wName: "Секира", tag: "B", label: "На плече", idea: "Lost Ark, Warspear: секира на плече одной рукой", kind: "axe2", item: AXE2, armor: "plate60-common", combat: armorOf("plate60-common", AXE2), stow: (sk) => ({ main: onShoulder(sk) }) },
  { id: "dagger-A", w: "dagger", wName: "Кинжалы", tag: "A", label: "Крест-накрест на пояснице", idea: "WoW (разбойник), BDO: парные кинжалы в ножнах на пояснице", kind: "dual", item: DAG, armor: "none", combat: armorOf("none", DAG), stow: (sk) => ({ main: { G: at(sk, sk.waist, sk.b.waist * 0.55 + 0.6, 0.5, -(dW(sk) + 1.1)), d: dirT(sk, -1, -0.5, -0.05), mount: "back", sheath: true }, off: { G: at(sk, sk.waist, -(sk.b.waist * 0.55 + 0.6), 1.1, -(dW(sk) + 1.3)), d: dirT(sk, 1, -0.5, -0.05), mount: "back", sheath: true } }) },
  { id: "dagger-B", w: "dagger", wName: "Кинжалы", tag: "B", label: "На бёдрах", idea: "Aion, Lineage 2, GW2: по кинжалу в ножнах на каждом бедре", kind: "dual", item: DAG, armor: "none", combat: armorOf("none", DAG), stow: (sk) => ({ main: { G: atP(sk, sk.hipL, 2.1, -0.2, 0.3), d: dirP(sk, 0.12, -1, -0.28), mount: "front", sheath: true }, off: { G: atP(sk, sk.hipR, -2.1, -0.2, 0.3), d: dirP(sk, -0.12, -1, -0.28), mount: "front", sheath: true } }) },
  { id: "bow-A", w: "bow", wName: "Лук", tag: "A", label: "За спиной, колчан на спине", idea: "WoW, GW2, Albion: лук наискосок за спиной рядом с колчаном", kind: "bow", armor: "none", combat: armorOf("none"), stow: (sk) => ({ main: { G: at(sk, sk.chest, 0, -2.2, -(dS(sk) + 1.7)), d: dirT(sk, 0.5, 1, -0.05), mount: "back", grab: 6.5 } }), quiver: "back" },
  { id: "bow-B", w: "bow", wName: "Лук", tag: "B", label: "Через грудь, колчан на бедре", idea: "Lineage 2, Aion: лук надет через плечо тетивой поперёк груди", kind: "bow", armor: "none", combat: armorOf("none"), stow: (sk) => ({ main: { G: at(sk, sk.chest, 0, -2.0, -(dS(sk) + 1.6)), d: dirT(sk, -0.55, 1, -0.05), mount: "back", grab: 6.5 } }), quiver: "hip", bowChest: true },
  { id: "shield-A", w: "shield", wName: "Меч и щит", tag: "A", label: "Щит на спине", idea: "WoW, GW2: щит за спиной, меч в ножнах; в бою — щит на руку", kind: "shield", item: SWORD, armor: "plate60-common", combat: armorOf("plate60-common", SWORD, SHIELD), stow: (sk) => ({ main: hipLeft(sk) }), shieldBack: true },
  { id: "shield-B", w: "shield", wName: "Меч и щит", tag: "B", label: "Щит на руке", idea: "Lineage 2, Aion, Warspear: щит всегда на руке, убирается только меч", kind: "shield", item: SWORD, armor: "plate60-common", combat: armorOf("plate60-common", SWORD, SHIELD), stow: (sk) => ({ main: hipLeft(sk) }) },
  { id: "staff-A", w: "staff", wName: "Посох", tag: "A", label: "Всегда в руке", idea: "WoW, L2, Warspear: посох не убирается — в покое как опора, в бою поднят", kind: "staff", armor: "none", combat: armorOf("none"), stow: () => ({}) },
  { id: "orbs-A", w: "orbs", wName: "Сферы мага", tag: "A", label: "Растворяются", idea: "GW2 (оружие из магии), Lost Ark (призыв): вне боя сфер нет, в бою собираются из искр", kind: "orbs", armor: "none", combat: armorOf("none"), stow: () => ({}) },
  { id: "orbs-B", w: "orbs", wName: "Сферы мага", tag: "B", label: "Тлеют у пояса", idea: "Свой вариант: вне боя сферы гаснут до угольков и висят у бёдер, в бою разгораются и летят к рукам", kind: "orbs", armor: "none", combat: armorOf("none"), stow: () => ({}), orbHip: true },
];

// ---- состояние кадра ----
type Mode = { m: "stow" } | { m: "combat" } | { m: "draw"; t: number };
interface Cur { mode: Mode; main?: { Hd: V3 | null; d: V3; stowed: boolean; fist: boolean }; off?: { Hd: V3 | null; d: V3; stowed: boolean }; shield?: { cen: V3 | null; n: V3; stowed: boolean }; orb?: number }
const SHIELD_N: V3 = nrm([-0.6, 0, 0.8]);

function staffPose(P: Pose, arm: number, combat: boolean, u: number) {
  const bob = 0.2 * Math.sin(2 * Math.PI * u);
  if (combat) { P.hL = { rel: [1.3, arm * 0.55 + bob, 2.4], pole: [0.6, 0.2, -1] }; P.weapon = { kind: "staff", dir: nrm([0.25, -1, 0.5]), glow: 0.7 }; }
  else { P.hL = { rel: [1.6, arm * 0.7 + bob * 0.5, 1.3], pole: [0.6, 0.2, -1] }; P.weapon = { kind: "staff", dir: nrm([0.12, -1, 0.22]), glow: 0 }; }
}
function orbHands(P: Pose, arm: number, u: number, e = 1) {
  const bob = 0.25 * Math.sin(2 * Math.PI * u);
  const r = (s: number): V3 => [s * (1.0 + 1.4 * e), arm * (0.9 - 0.42 * e) + bob * e, 0.4 + 3.0 * e];
  P.hL = { rel: r(1), pole: [0.6, 0.3, -1] }; P.hR = { rel: r(-1), pole: [-0.6, 0.3, -1] };
}
function bowHand(P: Pose, arm: number) { P.hL = { rel: [1.3, arm * 0.8, 1.4], pole: [0.6, 0.2, -1] }; }

function lookOf(sp: Spec, mode: Mode): Look {
  const combatLook = dress(LOOK, sp.combat, "sol");
  const offOnArm = sp.kind === "shield" && !sp.shieldBack;
  const stowLook = dress(LOOK, armorOf(sp.armor, undefined, offOnArm ? SHIELD : undefined), "sol");
  const blade = sp.kind === "blade" || sp.kind === "great" || sp.kind === "axe" || sp.kind === "axe2" || sp.kind === "shield";
  const posePatch: Look["posePatch"] = (P, k) => {
    const cur: Cur = { mode };
    (P as any).__sh = cur;
    if (mode.m === "combat") {
      if (blade || sp.kind === "dual") combatLook.posePatch?.(P, k);
      else if (sp.kind === "staff") staffPose(P, k.arm, true, k.u);
      else if (sp.kind === "orbs") { orbHands(P, k.arm, k.u); cur.orb = 1; }
      else if (sp.kind === "bow") bowHand(P, k.arm);
      return;
    }
    const sk = solve(LOOK, P), st = sp.stow(sk);
    if (mode.m === "stow") {
      if (sp.kind === "staff") staffPose(P, k.arm, false, k.u);
      if (sp.kind === "orbs") cur.orb = 0;
      if (st.main?.mount === "hand") { P.hL = { abs: st.main.G, pole: [0.6, 0.4, -1] }; cur.main = { Hd: null, d: st.main.d, stowed: false, fist: true }; }
      if (offOnArm) delete P.shield;
      return;
    }
    // ---- достать (t: 0 → 1); убрать — те же кадры в обратном порядке ----
    const t = mode.t, e1 = ph(t, 0, 0.36), e2 = ph(t, 0.36, 0.62), e3 = ph(t, 0.62, 1);
    const Pc: Pose = structuredClone({ ...P, G: undefined }) as Pose;
    if (blade || sp.kind === "dual") combatLook.posePatch?.(Pc, k);
    else if (sp.kind === "staff") staffPose(Pc, k.arm, true, k.u);
    else if (sp.kind === "orbs") orbHands(Pc, k.arm, k.u);
    else if (sp.kind === "bow") bowHand(Pc, k.arm);
    const skC = solve(LOOK, Pc), skR = sk;
    P.twist += 0.14 * Math.sin(Math.PI * t);
    if (sp.kind === "staff") {
      const Ps: Pose = structuredClone({ ...P, G: undefined }) as Pose; staffPose(Ps, k.arm, false, k.u);
      const sS = solve(LOOK, Ps), e = sm(t);
      P.hL = { abs: lerp(sS.hdL, skC.hdL, e), pole: [0.6, 0.2, -1] };
      P.weapon = { kind: "staff", dir: slerp(Ps.weapon!.dir, Pc.weapon!.dir, e, sk.U), glow: 0.7 * e };
      return;
    }
    if (sp.kind === "orbs") { orbHands(P, k.arm, k.u, sm(t)); cur.orb = t; return; }
    const m = st.main!;
    const dReady: V3 = sp.kind === "bow" ? dirT(skC, 0, 1, 0.35) : Pc.weapon ? nrm(Pc.weapon.dir) : dirT(skC, 0, 1, 0.3);
    if (m.mount === "hand") {
      const e = sm(t);
      P.hL = { abs: lerp(m.G, skC.hdL, e), pole: [0.6, 0.4, -1] };
      cur.main = { Hd: null, d: slerp(m.d, dReady, e, sk.U), stowed: false, fist: true };
      if (sp.kind === "great" && e > 0.85) { P.weapon = { kind: "great", dir: cur.main.d }; P.twoHand = true; P.hR = Pc.hR; }
    } else {
      const grab = m.grab ?? 0, Gp = add(m.G, mul(m.d, grab));
      const pull = m.sheath ? add(mul(m.d, -((sp.item?.length ?? 10) * 0.75)), mul(sk.F, 1.4)) : add(mul(m.d, -3.2), mul(sk.F, 1.6));
      const handPt = t < 0.36 ? lerp(skR.hdL, Gp, e1) : t < 0.62 ? add(Gp, mul(pull, e2)) : lerp(add(Gp, pull), skC.hdL, e3);
      P.hL = { abs: handPt, pole: [0.6, 0.4, -1] };
      if (t < 0.36) cur.main = { Hd: null, d: m.d, stowed: true, fist: false };
      else {
        const d = t < 0.62 ? m.d : slerp(m.d, dReady, e3, sk.U), off = t < 0.62 ? grab : grab * (1 - e3);
        cur.main = { Hd: null, d, stowed: false, fist: off < 0.6 };
        (cur.main as any).off = off;
        if ((sp.kind === "great" || sp.kind === "axe2") && e3 > 0.8) { P.weapon = { kind: "great", dir: d }; P.twoHand = true; P.hR = Pc.hR; }
      }
    }
    // вторая рука: второй кинжал или щит со спины
    const o = st.off;
    if (sp.kind === "dual" && o) {
      const pull = add(mul(o.d, -((sp.item?.length ?? 10) * 0.75)), mul(sk.F, 1.4));
      const h2 = t < 0.36 ? lerp(skR.hdR, o.G, e1) : t < 0.62 ? add(o.G, mul(pull, e2)) : lerp(add(o.G, pull), skC.hdR, e3);
      P.hR = { abs: h2, pole: [-0.6, 0.4, -1] };
      const d2r: V3 = (Pc as any).weapon2 ? nrm((Pc as any).weapon2.dir) : o.d;
      cur.off = { Hd: null, d: t < 0.62 ? o.d : slerp(o.d, d2r, e3, sk.U), stowed: t < 0.36 };
    }
    if (sp.shieldBack) {
      const Cs = at(sk, sk.chest, 0, -1.6, -(dS(sk) + 2.0)), grabS = add(Cs, mul(sk.U, 3.4));
      const h2 = t < 0.36 ? lerp(skR.hdR, grabS, e1) : t < 0.62 ? add(grabS, mul(sk.U, 2.2 * e2)) : lerp(add(grabS, mul(sk.U, 2.2)), skC.hdR, e3);
      if (t >= 0.62) P.hR = { ...Pc.hR, rel: undefined, abs: h2 }; else P.hR = { abs: h2, pole: [-0.6, 0.4, -1] };
      const nB = mul(sk.F, -1);
      if (t < 0.36) cur.shield = { cen: Cs, n: nB, stowed: true };
      else if (t < 0.62) cur.shield = { cen: add(Cs, mul(sk.U, 2.2 * e2)), n: nB, stowed: false };
      else cur.shield = { cen: null, n: slerp(nB, Pc.shield?.n ?? SHIELD_N, e3, sk.U), stowed: false };
      (cur.shield as any).from = add(Cs, mul(sk.U, 2.2)); (cur.shield as any).e = e3;
    }
  };

  const gear = (ctx: GearCtx) => {
    const cur: Cur = (ctx.P as any).__sh ?? { mode };
    const st = sp.stow(ctx.sk);
    if (cur.mode.m === "combat") {
      combatLook.gear?.(ctx);
    } else {
      stowLook.gear?.(ctx);
      if (blade || sp.kind === "dual") for (let k = ctx.parts.length - 1; k >= 0; k--) if ((ctx.parts[k].g === "weapon" || /^w_(fist|fistL|thumb)$/.test(ctx.parts[k].g)) && !ctx.parts[k].slot) ctx.parts.splice(k, 1);
      const m = st.main;
      if (m && sp.item && (blade || sp.kind === "dual")) {
        const c = cur.main;
        if (m.mount === "hand" || (c && !c.stowed)) {
          const d = c?.d ?? m.d, off = (c as any)?.off ?? 0, Hd = sub(ctx.sk.hdL, mul(d, off));
          drawItem(ctx, sp.item, Hd, d, { fist: c?.fist ?? true, twoHand: !!ctx.P.twoHand });
        } else drawItem(ctx, sp.item, m.G, m.d, { fist: false, hideBlade: m.sheath, layer: stowLayer(ctx, m) });
        if (sp.kind === "dual" && st.off) {
          const o = st.off, c2 = cur.off;
          if (c2 && !c2.stowed) drawItem(ctx, sp.item, ctx.sk.hdR, c2.d, { fist: true, hand: "R" });
          else drawItem(ctx, sp.item, o.G, o.d, { fist: false, hideBlade: o.sheath, layer: stowLayer(ctx, o) });
        }
      }
      if (sp.kind === "bow" && m) {
        const c = cur.main;
        if (c && !c.stowed) { const off = (c as any).off ?? 0; drawBow(ctx, sub(ctx.sk.hdL, mul(c.d, off)), c.d, null, sp); }
        else drawBow(ctx, m.G, m.d, stowLayer(ctx, m), sp);
      }
      if (sp.shieldBack) {
        const s = cur.shield;
        if (!s || s.stowed) drawShield(ctx, at(ctx.sk, ctx.sk.chest, 0, -1.6, -(dS(ctx.sk) + 2.0)), mul(ctx.sk.F, -1), true);
        else if (s.cen) drawShield(ctx, add(s.cen, sub(ctx.sk.hdR, ctx.sk.hdR)), s.n, false);
        else { const real = add(lerp(ctx.sk.elR, ctx.sk.hdR, 0.55), mul(s.n, 1.1)), e = (s as any).e ?? 1; drawShield(ctx, lerp((s as any).from, real, e), s.n, false); }
      }
    }
    // пустые ножны, перевязь, колчан — всегда на месте
    for (const o of [st.main, st.off]) if (o?.sheath && sp.item) sheath(ctx, o, sp.item, stowLayer(ctx, o));
    if (sp.strap) strap(ctx);
    if (sp.quiver) quiver(ctx, sp.quiver);
    if (sp.kind === "bow" && cur.mode.m === "combat") drawBow(ctx, ctx.sk.hdL, dirT(ctx.sk, 0, 1, 0.35), null, sp);
    if (sp.kind === "orbs") orbs(ctx, sp, cur);
  };
  return { ...combatLook, frame: F64, posePatch, gear };
}

/** слой убранной вещи: на спине — за телом (вниз, вбок) или поверх плаща и спины (вверх); спереди — по глубине относительно пояса */
function stowLayer(ctx: GearCtx, o: Stow): (p: Part) => number {
  const mid = add(o.G, mul(o.d, 5));
  let base: number;
  if (o.mount === "back") base = ctx.v === "up" ? 5.9 : 0.9;
  else base = ctx.D(add(o.G, mul(o.d, 2))) - ctx.D(ctx.sk.waist) > -0.4 ? 4.9 : 0.9;
  return (p) => { const near = [1.2, 5.25, 6.45, 1.31, 5.31, 5.32, 1.32].reduce((a, b) => (Math.abs(p.layer - b) < Math.abs(p.layer - a) ? b : a)); return base + (p.layer - near); };
}

/** Вещь из описания gear.ts в произвольной точке: Hd — хват, d — от рукояти к острию; без кулака — убранная (кадр «гибель» в gear.ts не рисует кулак). */
function drawItem(ctx: GearCtx, item: any, Hd: V3, d: V3, o: { fist: boolean; hideBlade?: boolean; layer?: (p: Part) => number; twoHand?: boolean; hand?: "L" | "R" }) {
  const wk = item.kind === "dual" ? { ...item, kind: "one" } : item;
  const set: SetDef = { name: "", rarity: "common", level: 1, items: { weapon: wk } };
  const parts: Part[] = [];
  const sk = { ...ctx.sk, hdL: Hd } as Sk;
  const c2 = { ...ctx, anim: (o.fist ? (ctx.anim === "death" ? "idle" : ctx.anim) : "death") as AnimId, P: { ...ctx.P, weapon: { kind: wk.kind === "great" ? "great" : "sword", dir: d }, twoHand: !!o.twoHand }, sk, parts, arm: { L: { ...ctx.arm.L }, R: { ...ctx.arm.R } } } as GearCtx;
  c2.push = (p) => parts.push(p);
  dress(LOOK, set, "sol", ["weapon"]).gear!(c2);
  for (const p of parts) { if (o.hideBlade && BLADE_G.test(p.g)) continue; ctx.parts.push({ ...p, slot: "weapon", layer: o.layer ? o.layer(p) : p.layer }); }
}

/** Ножны: тёмная обводка, кожа, металлическое устье, обойма и наконечник (цвет гарды вещи). */
function sheath(ctx: GearCtx, o: Stow, item: any, lay: (p: Part) => number) {
  const { PJ, push } = ctx, bl = item.length ?? 10, W = (item.width ?? 2.4) + 0.7, L = lay({ layer: 1.2 } as Part);
  const p = (k: number) => PJ(add(o.G, mul(o.d, k))), hilt = ramp(item.hilt ?? "brass");
  const small = bl < 12;
  push({ g: "sh_rim", slot: "weapon", ramp: RIM, o: { dome: 1 }, layer: L - 0.004, m: (z) => z.seg(p(1.4), p(bl + 2.4), W * 0.3 + 0.55, W * 0.22 + 0.5) });
  push({ g: "sh_body", slot: "weapon", ramp: LEATHER, o: { dome: 2, amp: 1.4, bias: 0.3 }, layer: L - 0.003, m: (z) => z.seg(p(1.5), p(bl + 2.1), W * 0.3, W * 0.22) });
  push({ g: "sh_seam", slot: "weapon", ramp: LEATHER, o: { dome: 1, bias: -1.2 }, layer: L - 0.0028, m: (z) => z.seg(p(3.0), p(bl + 0.6), 0.25) });
  push({ g: "sh_metal", slot: "weapon", ramp: hilt, o: { dome: 1, amp: 1.6, bias: 0.6 }, layer: L - 0.0025, m: (z) => { z.seg(p(1.4), p(small ? 2.0 : 2.4), W * 0.34); if (!small) z.seg(p(bl * 0.5), p(bl * 0.5 + 0.6), W * 0.32); z.seg(p(bl + 1.3), p(bl + 2.4), W * 0.26, 0.4); } });
}

/** Перевязь через грудь (вид спереди — поверх кирасы, со спины — поверх спины под оружием). */
function strap(ctx: GearCtx) {
  const { sk, PJ, push, facing } = ctx, a = sum(sk.shL, mul(sk.U, -0.3)), b = at(sk, sk.waist, -(sk.b.waist + 0.3), 0.6, 0);
  const fr = facing(sk.F) > 0.2, bk = facing(sk.F) < -0.2, fd = fr ? dS(sk) + 0.55 : -(dS(sk) + 0.7);
  if (!fr && !bk) return;
  const A = add(a, mul(sk.F, fd * 0.7)), B = add(b, mul(sk.F, fr ? dW(sk) + 0.7 : -(dW(sk) + 0.7))), M = add(lerp(A, B, 0.5), mul(sk.F, fr ? 1.0 : -1.0));
  const L = fr ? 3.95 : 5.18;
  push({ g: "st_rim", slot: "weapon", ramp: RIM, o: { dome: 1 }, layer: L, m: (z) => z.bz(PJ(A), PJ(M), PJ(B), 1.6) });
  push({ g: "st_band", slot: "weapon", ramp: LEATHER, o: { dome: 1, bias: 0.6 }, layer: L + 0.0001, m: (z) => z.bz(PJ(A), PJ(M), PJ(B), 1.05) });
  if (fr) push({ g: "st_buckle", slot: "weapon", ramp: ramp("brass"), o: { dome: 1, bias: 0.6 }, layer: L + 0.0002, m: (z) => z.dot(PJ(lerp(lerp(A, M, 0.6), lerp(M, B, 0.6), 0.6)), 0.8) });
}

/** Колчан со стрелами: на спине (у правого плеча) или на правом бедре. */
function quiver(ctx: GearCtx, where: "back" | "hip") {
  const { sk, PJ, push } = ctx;
  const bot = where === "back" ? at(sk, sk.waist, -1.2, 1.2, -(dW(sk) + 1.4)) : atP(sk, sk.waist, sk.b.waist + 1.1, -6.5, -0.6);
  const top = where === "back" ? sum(sk.shL, mul(sk.U, 1.3), mul(sk.F, -(dS(sk) + 1.4))) : atP(sk, sk.waist, sk.b.waist + 1.2, 1.2, 0.6);
  const o: Stow = { G: top, d: nrm(sub(bot, top)), mount: where === "back" ? "back" : "front" };
  const L = stowLayer(ctx, o)({ layer: 1.2 } as Part), ax = nrm(sub(top, bot));
  push({ g: "q_rim", slot: "weapon", ramp: RIM, o: { dome: 1 }, layer: L - 0.002, m: (z) => z.seg(PJ(bot), PJ(top), 1.75, 2.0) });
  push({ g: "q_body", slot: "weapon", ramp: ramp("leather"), o: { dome: 2, amp: 1.4, bias: 0.3 }, layer: L - 0.0019, m: (z) => z.seg(PJ(bot), PJ(top), 1.3, 1.55) });
  push({ g: "q_band", slot: "weapon", ramp: ramp("brass"), o: { dome: 1, bias: 0.5 }, layer: L - 0.0018, m: (z) => { z.seg(PJ(lerp(bot, top, 0.92)), PJ(top), 1.75); z.seg(PJ(lerp(bot, top, 0.1)), PJ(lerp(bot, top, 0.18)), 1.5); } });
  push({ g: "q_shaft", slot: "weapon", ramp: ramp("shield_wood"), o: { dome: 1, bias: 0.4 }, layer: L - 0.0017, m: (z) => { for (const s of [-0.7, 0, 0.7]) { const p0 = add(top, mul(sk.A, s)); z.seg(PJ(p0), PJ(add(p0, mul(ax, 2.2))), 0.35); } } });
  push({ g: "q_fletch", slot: "weapon", ramp: ramp("paint_red"), o: { dome: 1, bias: 0.6 }, layer: L - 0.0016, m: (z) => { for (const s of [-0.7, 0, 0.7]) { const p0 = add(add(top, mul(sk.A, s)), mul(ax, 1.4)); z.seg(PJ(p0), PJ(add(p0, mul(ax, 1.4))), 0.6, 0.35); } } });
}

/** Лук: дуга с обводкой и тетива; ось — от середины к верхнему плечу. lay = null — по глубине (в руке). */
function drawBow(ctx: GearCtx, C0: V3, ax: V3, lay: ((p: Part) => number) | null, sp: Spec) {
  const { sk, PJ, push, D, M } = ctx, bend = nrm(sub(mul(sk.F, lay ? 1 : -1), mul(ax, dot(ax, sk.F) * (lay ? 1 : -1))));
  const tipU = add(add(C0, mul(ax, 8.6)), mul(bend, 2.2)), tipD = add(add(C0, mul(ax, -8.6)), mul(bend, 2.2));
  const cU = add(add(C0, mul(ax, 4.9)), mul(bend, -1.0)), cD = add(add(C0, mul(ax, -4.9)), mul(bend, -1.0));
  const L = lay ? lay({ layer: 1.2 } as Part) : D(C0) < -1.2 ? 1.2 : 5.25;
  push({ g: "b_rim", slot: "weapon", ramp: RIM, o: { dome: 1 }, layer: L - 0.001, m: (z) => z.bz(PJ(C0), PJ(cU), PJ(tipU), 2.5, 1.5).bz(PJ(C0), PJ(cD), PJ(tipD), 2.5, 1.5) });
  push({ g: "b_wood", slot: "weapon", ramp: ramp("leather_dark"), o: { dome: 1, bias: 0.9 }, layer: L, m: (z) => z.bz(PJ(C0), PJ(cU), PJ(tipU), 1.8, 0.9).bz(PJ(C0), PJ(cD), PJ(tipD), 1.8, 0.9) });
  push({ g: "b_tip", slot: "weapon", ramp: ramp("brass"), o: { dome: 1, bias: 0.6 }, layer: L + 0.0012, m: (z) => z.dot(PJ(tipU), 0.65).dot(PJ(tipD), 0.65) });
  push({ g: "b_grip", slot: "weapon", ramp: LEATHER, o: { dome: 1, bias: 0.3 }, layer: L + 0.001, m: (z) => z.seg(PJ(add(C0, mul(ax, -1.1))), PJ(add(C0, mul(ax, 1.1))), 1.6) });
  // тетива: в руке и за спиной — от конца к концу; «через грудь» (вариант B) — поперёк груди спереди
  const chest = sp.bowChest && lay && ctx.facing(sk.F) > 0.2;
  push({ g: "b_string", slot: "weapon", ramp: M.string, o: { dome: 1 }, layer: chest ? 3.96 : L - 0.0005, m: (z) => {
    if (!chest) { z.seg(PJ(tipU), PJ(tipD), 0.55); return; }
    const a = sum(sk.shL, mul(sk.U, -0.2), mul(sk.F, dS(sk) * 0.6)), b = at(sk, sk.waist, -(sk.b.waist + 0.2), 0.8, dW(sk) + 0.6);
    z.seg(PJ(a), PJ(b), 0.55);
  } });
}

/** Щит через описание gear.ts (shieldLayer): центр задаётся подменой локтя и кисти второй руки. */
function drawShield(ctx: GearCtx, cen: V3, n: V3, stowed: boolean) {
  const parts: Part[] = [], p0 = sub(cen, mul(n, 1.1));
  const c2 = { ...ctx, P: { ...ctx.P, shield: { n } }, sk: { ...ctx.sk, elR: p0, hdR: p0 } as Sk, parts, arm: { L: { ...ctx.arm.L }, R: { ...ctx.arm.R } } } as GearCtx;
  c2.push = (p) => parts.push(p);
  dress(LOOK, { name: "", rarity: "epic", level: 60, items: { offhand: SHIELD } }, "sol", ["offhand"]).gear!(c2);
  const base = stowed ? (ctx.v === "up" ? 5.2 : 0.8) : null;
  for (const p of parts) ctx.parts.push({ ...p, slot: "offhand", layer: base === null ? p.layer : base + (p.layer - (p.layer >= 3 ? 5.4 : 0.8)) });
}

/** Сферы мага: o = 1 — в бою у кистей; 0 — нет (A) или тлеют у бёдер (B); призыв — искры собираются по спирали, растворение — обратный ход. */
function orbs(ctx: GearCtx, sp: Spec, cur: Cur) {
  const { sk, PJ, push, D, u } = ctx, o = cur.orb ?? (cur.mode.m === "combat" ? 1 : 0);
  for (const [s, hd] of [[1, sk.hdL], [-1, sk.hdR]] as [number, V3][]) {
    const bob = 0.35 * Math.sin(2 * Math.PI * (u + (s > 0 ? 0 : 0.5)));
    const cHand = sum(hd, mul(sk.F, 1.8), mul(sk.U, 2.2 + bob), mul(sk.A, s * 0.7));
    const cHip = atP(sk, sk.waist, s * (sk.b.waist + 2.0), -1.5 + bob * 0.5, 0.8);
    const e = sm(o);
    let c: V3, r: number;
    if (sp.orbHip) { c = lerp(cHip, cHand, e); r = 0.9 + 1.2 * e; }
    else { c = cHand; r = 2.1 * ph(o, 0.45, 1); }
    const L = D(c) < -1.2 ? 1.15 : 5.35;
    // искры: призыв — по спирали к центру, остаток — кружат
    const nSp = sp.orbHip ? (o > 0.05 && o < 0.95 ? 5 : o >= 0.95 ? 2 : 0) : o > 0 && o < 1 ? 8 : o >= 1 ? 2 : 0;
    for (let k = 0; k < nSp; k++) {
      const a0 = (k / Math.max(1, nSp)) * 2 * Math.PI + s, far = o >= 1 || o <= 0 ? 2.6 : 6 * (1 - e) + 1.2;
      const ang = a0 + 3 * e + 2 * Math.PI * u * (o >= 1 ? 1 : 0);
      const p = sum(c, mul(sk.A, Math.cos(ang) * far), mul(sk.U, Math.sin(ang) * far * 0.8 + (1 - e) * 1.5));
      push({ g: "orb_spark", slot: "weapon", ramp: ORB, o: { dome: 1, bias: 1.6 }, layer: L + 0.002, emis: true, m: (z) => z.dot(PJ(p), k % 2 ? 0.45 : 0.6) });
    }
    if (r < 0.3) continue;
    push({ g: "orb_rim", slot: "weapon", ramp: ORB_RIM, o: { dome: 1 }, layer: L, m: (z) => z.dot(PJ(c), r + 0.55) });
    push({ g: "orb", slot: "weapon", ramp: ORB, o: { dome: 2, amp: 1.6, bias: sp.orbHip && e < 0.5 ? -0.6 : 0.5 }, layer: L + 0.0005, emis: !sp.orbHip || e > 0.5, m: (z) => z.dot(PJ(c), r) });
    if (r > 1.1) push({ g: "orb_core", slot: "weapon", ramp: ORB, o: { dome: 1, bias: 2.4 }, layer: L + 0.001, emis: true, m: (z) => z.dot(PJ(add(c, mul(sk.U, 0.3))), r * 0.42) });
  }
}

// ---- рендер ----
const STATES: { key: string; anim: AnimId; n: number; step: number; mode: (k: number) => Mode }[] = [
  { key: "stowIdle", anim: "idle", n: 8, step: 2, mode: () => ({ m: "stow" }) },
  { key: "stowRun", anim: "run", n: 12, step: 1, mode: () => ({ m: "stow" }) },
  { key: "draw", anim: "stance", n: 8, step: 2, mode: (k) => ({ m: "draw", t: k / 7 }) },
  { key: "combatIdle", anim: "stance", n: 8, step: 2, mode: () => ({ m: "combat" }) },
  { key: "combatRun", anim: "run", n: 12, step: 1, mode: () => ({ m: "combat" }) },
];
const COLS = STATES.reduce((s, x) => s + x.n, 0);

type Img = { w: number; h: number; has: (x: number, y: number) => boolean; get: (x: number, y: number) => C | number[] };
function render(sp: Spec): Img[][] {
  const rows: Img[][] = [];
  for (const v of VIEWS4) {
    const row: Img[] = [];
    for (const s of STATES) for (let k = 0; k < s.n; k++) row.push(renderView(lookOf(sp, s.mode(k)), v, s.anim, k * s.step).img as unknown as Img);
    rows.push(row);
  }
  return rows;
}

const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const all: { sp: Spec; rows: Img[][] }[] = [];
for (const sp of SPECS) {
  if (only.length && !only.includes(sp.w) && !only.includes(sp.id)) continue;
  const t0 = Date.now(), rows = render(sp);
  const pc = new PC(COLS * F64, VIEWS4.length * F64);
  rows.forEach((row, r) => row.forEach((f, c) => { for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.has(x, y)) { const q = f.get(x, y); pc.set(c * F64 + x, r * F64 + y, [q[0], q[1], q[2], 255]); } }));
  pc.save(path.join(OUT, sp.id + ".png"));
  all.push({ sp, rows });
  console.log(sp.id, (Date.now() - t0) + " мс");
}

// ---- монтаж sheathe.png ----
{
  const K = 3, FW = F64 * K, lw = 250;
  const SH: [string, number, number, string][] = [["stowIdle", 0, 0, "ВНЕ БОЯ ВНИЗ"], ["stowIdle", 1, 0, "ВВЕРХ"], ["stowIdle", 2, 0, "ВПРАВО"], ["stowIdle", 3, 0, "ВЛЕВО"], ["stowRun", 0, 3, "БЕГ ВНИЗ"], ["stowRun", 2, 3, "БЕГ ВБОК"], ["draw", 0, 2, "ДОСТАТЬ 3/8"], ["draw", 0, 4, "5/8"], ["draw", 0, 6, "7/8"], ["combatIdle", 0, 0, "В БОЮ"], ["combatRun", 2, 3, "БЕГ В БОЮ"]];
  const off = (key: string) => { let o = 0; for (const s of STATES) { if (s.key === key) return o; o += s.n; } return 0; };
  const rh = FW + 22;
  const out = new PC(lw + SH.length * (FW + 4) + 10, 46 + all.length * rh);
  const BG: RGBA = [24, 20, 26, 255], GR: RGBA = [62, 84, 52, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [210, 200, 180, 255];
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
  text(out, "ОРУЖИЕ ВНЕ БОЯ И В БОЮ · ГЕРОЙ Б · ПРОБА · ЗУМ 3", 10, 8, 2, GOLD);
  SH.forEach(([, , , cap], j) => text(out, cap, lw + j * (FW + 4), 32, 1, GOLD));
  all.forEach(({ sp, rows }, n) => {
    const y = 46 + n * rh;
    text(out, `${sp.wName} ${({ A: "А", B: "В", C: "С" } as any)[sp.tag]}`.toUpperCase(), 10, y + 8, 3, GOLD);
    text(out, sp.label.toUpperCase().slice(0, 34), 10, y + 40, 1, DIM);
    SH.forEach(([key, r, c, ], j) => {
      const f = rows[r][off(key) + c], x0 = lw + j * (FW + 4);
      for (let yy = 0; yy < FW; yy++) for (let xx = 0; xx < FW; xx++) out.set(x0 + xx, y + yy, GR);
      for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) if (f.has(xx, yy)) { const q = f.get(xx, yy); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + a, y + yy * K + b, [q[0], q[1], q[2], 255]); }
    });
  });
  if (!only.length) out.save(path.join(OUT, "sheathe.png"));
  else out.save(path.join(OUT, "sheathe-part.png"));
}

// ---- живая страница ----
if (!only.length) {
  const meta = { frame: F64, views: ["вниз", "вверх", "вправо", "влево"], states: STATES.map((s) => ({ key: s.key, n: s.n, fps: s.anim === "run" ? 16 : s.key === "draw" ? 14 : 8 })), specs: SPECS.map((s) => ({ id: s.id, w: s.w, wName: s.wName, tag: s.tag, label: s.label, idea: s.idea })) };
  const html = fs.readFileSync(path.resolve("tools/gen/gear147/sheathe-page.html"), "utf8").replace("/*META*/null", JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  console.log("→", path.join(OUT, "index.html"));
}

// ---- отладка: DBG=1 — крупные кадры (×5, центр кадра) в tools/out/gear147/sheathe/dbg-<вариант>.png ----
if (process.env.DBG) for (const { sp, rows } of all) {
  const cols: [string, number][] = process.env.DBG === "2" ? [["stowIdle", 0], ["stowRun", 3], ["draw", 2], ["draw", 4], ["draw", 6], ["combatIdle", 0]] : [["stowIdle", 0], ["stowRun", 3], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ["draw", k] as [string, number]), ["combatIdle", 0], ["combatRun", 3]];
  const offOf = (key: string) => { let o = 0; for (const s of STATES) { if (s.key === key) return o; o += s.n; } return 0; };
  const K = process.env.DBG === "2" ? 7 : 5, X0 = 10, Y0 = 6, CW = 44, CH = 52;
  const pc = new PC(cols.length * CW * K, VIEWS4.length * CH * K);
  for (let r = 0; r < VIEWS4.length; r++) cols.forEach(([key, c], j) => {
    const f = rows[r][offOf(key) + c];
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const has = f.has(x + X0, y + Y0), q = has ? f.get(x + X0, y + Y0) : (j % 2 ? [70, 92, 58] : [62, 84, 52]); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) pc.set((j * CW + x) * K + a, (r * CH + y) * K + b, [q[0], q[1], q[2], 255]); }
  });
  pc.save(path.join(OUT, "dbg-" + sp.id + ".png"));
}
