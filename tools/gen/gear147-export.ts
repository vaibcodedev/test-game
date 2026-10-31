/**
 * Задача 147, подключение: листы основы «Б» и слоёв снаряжения → client/public/assets/hero147/ (+ manifest.json там же).
 * npx tsx tools/gen/gear147-export.ts [часть k/n] — задания делятся на n процессов; после всех частей: npx tsx tools/gen/gear147-export.ts merge.
 * Генератор вещей (tools/gen/gear147) только читается. Кадр листа — кадр рендера (48; крупное оружие — больше, ступни в (24+OX, 45+OY), frameOf).
 * Лист: строки — (анимация класса позы × вид down/up/side/left), столбцы — кадры; «влево» — свой проход (свет сверху-слева), в листе как есть.
 * Ключ листа «слот@корзина» (data/gear147.json layers.bins), у каждого кадра — z (минимальный слой частей); в игре слои сводятся по возрастанию z.
 * Группы: body/<fac>_<sex>/<cls> (тело и лицо), hair/<sex>_<style>_<fac>/<cls>, gear/<set>/<sex>/<cls> (crest — варианты sol/umb).
 * Заглушки «латы/кожа/ткань» (data/hero-b-live.json stubs) — как сеты stub-plate/stub-leather/stub-cloth.
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./canvas";
import { DATA, NF, flipCv, frameOf, hairStyles, renderLayers, type AnimId, type Look, type Part } from "./hero147/base_b";
import { GD, SLOTS, baseView, dress, setOf, viewLook, type CrestId, type SetDef, type View4 } from "./gear147/gear";

const LIVE = JSON.parse(fs.readFileSync(path.resolve("data/hero-b-live.json"), "utf8"));
const OUT = path.resolve("client/public/assets/hero147");
const PARTS = path.resolve("tools/out/hero147-export");
const BINS: number[] = GD.layers.bins;
const binOf = (L: number) => { for (let k = 0; k + 1 < BINS.length; k++) if (L < BINS[k + 1]) return k; return BINS.length - 2; };
const VIEWS: View4[] = ["down", "up", "side", "left"];
type Cls = "free" | "great" | "special";
/** Особый удар оружия (weapon.special, Пылающий клинок Хаоса): свой класс строк — special2h × 4 вида; тело и причёска — в позе этого оружия. */
const SPECIAL_SETS = (LIVE.sets as string[]).filter((id) => setOf(id).items.weapon?.special?.length);
const animsOf = (c: Cls): AnimId[] => (c === "special" ? ["special2h" as AnimId] : LIVE.classes[c].anims);
const rowsOf = (c: Cls): [AnimId, View4][] => animsOf(c).flatMap((a) => VIEWS.map((v) => [a, v] as [AnimId, View4]));

const STUBS: Record<string, SetDef> = Object.fromEntries(Object.entries(LIVE.stubs).map(([k, items]) => [`stub-${k}`, { name: k, rarity: "common", level: 1, items: items as any }]));
const setDef = (id: string): SetDef => STUBS[id] ?? setOf(id);
/** Сет в позе класса: great без своего оружия — с двуручником-заглушкой. */
const withCls = (s: SetDef, c: Cls): SetDef => {
  const it = { ...s.items } as any;
  if (c === "great" && it.weapon?.kind !== "great") it.weapon = LIVE.stubWeapon;
  if (c === "great") delete it.offhand; // щит с двуручником не носится
  if (c === "free") delete it.weapon;
  return { ...s, items: it };
};
const EMPTY: SetDef = { name: "", rarity: "common", level: 0, items: {} };

interface Job { id: string; kind: "base" | "gear" | "sbase" | "sgear"; fac: "sol" | "umb"; sex: "m" | "f"; cls: Cls; hair?: string; withBody?: boolean; set?: string }
function jobs(): Job[] {
  const J: Job[] = [], G: Job[] = [];
  for (const fac of ["sol", "umb"] as const) for (const sex of ["m", "f"] as const) for (const cls of ["free", "great"] as Cls[])
    hairStyles(sex).forEach((h, i) => J.push({ id: `base-${fac}-${sex}-${cls}-${h.id}`, kind: "base", fac, sex, cls, hair: h.id, withBody: i === 0 }));
  for (const set of [...LIVE.sets, ...Object.keys(STUBS)]) for (const sex of ["m", "f"] as const) for (const cls of ["free", "great"] as Cls[]) {
    if (!STUBS[set] && cls === "free" && setOf(set).items.weapon?.kind === "great") continue;
    if (cls === "great" && !Object.keys(setDef(set).items).some((k) => k !== "offhand")) continue; // сет из одного щита — только free
    G.push({ id: `gear-${set}-${sex}-${cls}`, kind: "gear", fac: "sol", sex, cls, set });
  }
  for (const set of SPECIAL_SETS) {
    for (const sex of ["m", "f"] as const) G.push({ id: `sgear-${set}-${sex}`, kind: "sgear", fac: "sol", sex, cls: "special", set });
    for (const fac of ["sol", "umb"] as const) for (const sex of ["m", "f"] as const) hairStyles(sex).forEach((h, i) => G.push({ id: `sbase-${set}-${fac}-${sex}-${h.id}`, kind: "sbase", fac, sex, cls: "special", hair: h.id, withBody: i === 0, set }));
  }
  // сначала вещи (дольше всех — Рыцарь в кадре 96), затем основа
  return [...G, ...J];
}

interface Entry { file: string; frame: number; origin: [number, number]; cls: Cls; z: (number | null)[][]; glow?: string }
function blit(d: PC, s: { w: number; h: number; has: (x: number, y: number) => boolean; get: (x: number, y: number) => number[] }, ox: number, oy: number) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.has(x, y)) { const q = s.get(x, y); d.set(ox + x, oy + y, [q[0], q[1], q[2], 255]); }
}

function runJob(j: Job): Record<string, Record<string, Entry>> {
  const rows = rowsOf(j.cls);
  const base: Look = { fac: j.fac, sex: j.sex, hair: j.hair };
  const gearish = j.kind === "gear" || j.kind === "sgear";
  const crests: CrestId[] = gearish ? ["sol", "umb"] : ["sol"];
  const slots = !gearish ? (j.withBody ? ["body", "hair"] : ["hair"]) : [...SLOTS, "crest", "cloth"]; // cloth — подвижная ткань (если генератор пометит части slot: "cloth"), в игре — Verlet-ткань
  const keys: string[] = []; for (const s of slots) for (let b = 0; b + 1 < BINS.length; b++) keys.push(`${s}@${b}`);
  const noHelm = (s: SetDef): SetDef => { const it = { ...s.items } as any; delete it.helm; return { ...s, items: it }; };
  const set = j.kind === "sgear" ? setDef(j.set!) : j.kind === "sbase" ? noHelm(setDef(j.set!)) : j.kind === "gear" ? withCls(setDef(j.set!), j.cls) : j.cls === "great" ? withCls(EMPTY, "great") : EMPTY;
  const FRx = frameOf(dress(base, set)).FRx, O = frameOf(dress(base, set));
  const origin: [number, number] = [24 + O.OX, 45 + O.OY];
  const COLS = Math.max(...rows.map(([a]) => NF(a)));
  const sheets = new Map<string, PC>(), zs = new Map<string, (number | null)[][]>();
  rows.forEach(([a, v], r) => {
    for (let i = 0; i < NF(a); i++) for (const crest of crests) {
      const look0 = dress({ ...base, props: j.cls === "free" ? !!DATA.anims[a].props : undefined }, set, crest);
      const minL = new Map<string, number>();
      const filt = keys.map((k) => (p: Part) => { if (`${p.slot}@${binOf(p.layer)}` !== k) return false; minL.set(k, Math.min(minL.get(k) ?? 99, p.layer)); return true; });
      const fr0 = renderLayers(viewLook(look0, v), baseView(v), a, i, filt), frames = v === "left" ? fr0.map((f) => ({ ...f, img: flipCv(f.img), emis: f.emis.map(([x, y, c]) => [f.img.w - 1 - x, y, c] as typeof f.emis[number]) })) : fr0; // «влево» — свечение ночью отражается вместе с кадром (иначе два клинка «галкой»)
      keys.forEach((k, q) => {
        if (!minL.has(k)) return;
        const slot = k.split("@")[0];
        if (crest === "umb" && slot !== "crest") return;
        const kk = crest === "umb" ? k + "-umb" : slot === "crest" ? k + "-sol" : k;
        let s = sheets.get(kk); if (!s) { s = new PC(COLS * FRx, rows.length * FRx); sheets.set(kk, s); zs.set(kk, rows.map(([aa]) => Array(NF(aa)).fill(null))); }
        blit(s, frames[q].img, i * FRx, r * FRx); zs.get(kk)![r][i] = Math.round(minL.get(k)! * 1e4) / 1e4;
        // свечение ночью (глаза Умбрата, огонь клинка, руны): свой лист «…~glow», в игре — поверх ночной маски, закрытый слоями выше по z
        const em = frames[q].emis;
        if (em.length) { let g = sheets.get(kk + "~glow"); if (!g) { g = new PC(COLS * FRx, rows.length * FRx); sheets.set(kk + "~glow", g); } for (const [x, y, c] of em) g.set(i * FRx + x, r * FRx + y, [c[0], c[1], c[2], 255]); }
      });
    }
  });
  const groups: Record<string, Record<string, Entry>> = {};
  for (const [k, s] of sheets) {
    if (k.endsWith("~glow")) continue;
    const slot = k.split("@")[0];
    const sub = j.kind === "sbase" ? `special-${j.set}` : j.cls;
    const grp = gearish ? `gear/${j.set}/${j.sex}/${j.cls}` : slot === "body" ? `body/${j.fac}_${j.sex}/${sub}` : `hair/${j.sex}_${j.hair}_${j.fac}/${sub}`;
    const file = `${grp}/${k}.png`;
    fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
    s.save(path.join(OUT, file));
    const gl = sheets.get(k + "~glow");
    if (gl) gl.save(path.join(OUT, `${grp}/${k}~glow.png`));
    (groups[grp] ??= {})[k] = { file, frame: FRx, origin, cls: j.cls, z: zs.get(k)!, ...(gl ? { glow: `${grp}/${k}~glow.png` } : {}) };
  }
  return groups;
}

/** Ткань слота «Спина» (экспорт gear147: tools/out/gear147/cloth, data/hero-skeleton-b.json → cloth): текстуры в assets/hero147/cloth,
 *  точки крепления по кадрам тела — pins[тело][анимация][вид] = кадры [x, y по ключам pinKeys] (кадр 48, ступни 24,45; влево — зеркало side). */
function clothPart() {
  const SK = JSON.parse(fs.readFileSync(path.resolve("data/hero-skeleton-b.json"), "utf8"));
  if (!SK.cloth) return {};
  const cloth = JSON.parse(JSON.stringify(SK.cloth.textures));
  const used = new Set<string>();
  fs.mkdirSync(path.join(OUT, "cloth"), { recursive: true });
  for (const t of Object.values(cloth) as any[]) for (const v of Object.values(t.views) as any[]) {
    const name = path.basename(v.file); fs.copyFileSync(path.resolve(v.file), path.join(OUT, "cloth", name)); v.file = "cloth/" + name;
    for (const p of v.pinFrom) used.add(p.key);
  }
  const pinKeys = [...used], idx = pinKeys.map((k) => SK.keys.indexOf(k));
  const pins: any = {};
  for (const [bk, anims] of Object.entries(SK.bodies) as [string, any][]) for (const [a, A] of Object.entries(anims) as [string, any][]) for (const [v, frames] of Object.entries(A.views) as [string, any][])
    ((pins[bk] ??= {})[a] ??= {})[v] = frames.map((fr: any) => idx.flatMap((i) => [fr.p[i * 2], fr.p[i * 2 + 1]]));
  return { cloth, pinKeys, pins };
}

const arg = process.argv[2] ?? "1/1";
fs.mkdirSync(PARTS, { recursive: true });
if (arg === "merge") {
  const groups: Record<string, Record<string, Entry>> = {};
  for (const f of fs.readdirSync(PARTS).filter((f) => f.endsWith(".json"))) Object.assign(groups, JSON.parse(fs.readFileSync(path.join(PARTS, f), "utf8")));
  const man = {
    _doc: "Листы героя «Б» (задача 147): tools/gen/gear147-export.ts. groups[группа][слот@корзина] = { file, frame, origin (ступни в кадре), cls, z[строка][кадр] }; строки класса — rows[cls] ([анимация, вид]); влево — свой вид. Сведение: по возрастанию z; hair — только без шлема; crest@*-sol / -umb — герб фракции.",
    rows: { free: rowsOf("free"), great: rowsOf("great"), special: rowsOf("special") },
    // столбцов листа по классу: самая длинная анимация класса (heroB.ts берёт отсюда, а не из константы)
    cols: Object.fromEntries((["free", "great", "special"] as Cls[]).map((c) => [c, Math.max(...rowsOf(c).map(([a]) => NF(a)))])),
    special: SPECIAL_SETS,
    ...clothPart(),
    anims: Object.fromEntries(Object.entries(DATA.anims).map(([k, a]: [string, any]) => [k, { frames: a.frames, fps: a.fps, loop: a.loop }])),
    hair: DATA.hair,
    groups,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
  console.log(`manifest: ${Object.keys(groups).length} групп, ${Object.values(groups).reduce((n, g) => n + Object.keys(g).length, 0)} листов`);
} else {
  const [k, n] = arg.split("/").map(Number);
  const all = jobs().filter((_, i) => i % n === k - 1);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const j of all) {
    if (only && !only.test(j.id)) continue;
    const t = Date.now();
    const g = runJob(j);
    fs.writeFileSync(path.join(PARTS, `${j.id}.json`), JSON.stringify(g));
    console.log(`${j.id}: ${Object.values(g).reduce((s, x) => s + Object.keys(x).length, 0)} листов, ${((Date.now() - t) / 1000).toFixed(1)} с`);
  }
}
