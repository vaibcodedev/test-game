/**
 * Задача 147, подключение: герой «Б» (рост 30 px) в живой игре под флагом data/hero-b.json → enabled.
 * Листы — client/public/assets/hero147 (tools/gen/gear147-export.ts). На каждый облик (фракция, пол, причёска, класс позы, вещи по слотам)
 * один раз сводится лист-текстура: основа → причёска (без шлема) → слои вещей по z кадра → герб фракции (crest-sol/umb).
 * Оружие — слоем weapon (правило правой руки в генераторе); без двуручника — предметы основы в анимациях удара (меч и щит, посох, лук).
 * Вещь без новой модели — заглушка «латы / кожа / ткань» по armorType базы (data/hero-b-live.json stubs).
 * «Влево» в листе свой (свет сверху-слева); в текстуре он записан отражённым, и UnitView отражает его обратно (setFlipX), как прежние листы.
 * Флаг выключен — модуль ничего не грузит и не меняет. Консоль: heroB.self() (только свой герой), heroB.on() (все), heroB.off(), heroB.set("chaos-knight" | "recruit-plate" | null),
 * heroB.look({ sex: "f", hair: "braid" }), heroB.status().
 */
import Phaser from "phaser";
import heroFlag from "../../../data/hero-b.json";
import live from "../../../data/hero-b-live.json";
import { BASE_ITEMS } from "../../../shared/items";
import { parseGear } from "./GearLayers";

type Cls = "free" | "great";
interface Entry { file: string; frame: number; origin: [number, number]; cls: Cls; z: (number | null)[][]; glow?: string }
export interface ClothView { file: string; pins: number[][]; pinFrom: { key: string; offset: [number, number] }[]; layer: "behind" | "front"; z: number }
export interface ClothDef { kind: string; frame: number; origin: [number, number]; views: Record<string, ClothView> }
interface Man { /** столбцов листа по классу позы (экспорт) */ cols?: Record<string, number>; special?: string[]; cloth?: Record<string, ClothDef>; pinKeys?: string[]; pins?: Record<string, Record<string, Record<string, number[][]>>>; rows: Record<Cls | "special", [string, string][]>; anims: Record<string, { frames: number; fps: number; loop: boolean }>; hair: Record<"m" | "f", { id: string }[]>; groups: Record<string, Record<string, Entry>> }
const SLOTS = ["helm", "pauldrons", "armor", "gloves", "boots", "cloak", "weapon"] as const;
type Slot147 = (typeof SLOTS)[number];
const LIVE = live as unknown as { specialAttack: { every: number; chance: number; trail: { color: string; core: string } }; classes: Record<Cls, { anims: string[] }>; weaponClass: Record<string, { cls: Cls; atk: string }>; sets: string[]; models: Record<string, string>; slotMap: Record<string, Slot147>; stubs: Record<string, Partial<Record<Slot147, unknown>>> };

/** Облик героя Б, из которого сводится лист. */
export interface HbLook { fac: "sol" | "umb"; sex: "m" | "f"; hair: string; cls: Cls; atk: string; /** сет оружия с особым ударом (special2h) */ special?: string; slots: Partial<Record<Slot147, string>> }
/** Готовый лист: sid прежних ключей анимаций (`${sid}-walk-${row}` и т. д.), sidL — то же для взгляда влево; frame — кадр, oy — опора по ногам, rise — макушка над ногами. */
export interface HbSheet { /** контур видимого оружия по кадрам (заточка, heroEnchant.ts): текстуры кольца 1 px (k1) и второго кольца (k2), точки контура кадра (x, y парами) для угольков */ ench: { k1: string; k2: string; pts: Map<number, number[]> } | null; /** удар класса позы (atk1h, atk2h, bow, cast) */ atk: string; /** силуэты кадров для переходов (heroBNear) */ masks: Map<string, Uint8Array[]>; key: string; sid: string; sidL: string; frame: number; ox: number; oy: number; origin: [number, number]; rise: number; glow: boolean; special: boolean; dead: number[]; /** строки листа: "анимация:вид" */ rows: string[];
  /** ткань «Спины» с физикой (heroCloth.ts): сет, описание текстур и точек крепления, тело для pins */ cloth: { set: string; def: ClothDef; body: string } | null }

/** Режим: off — прежний герой, self — только свой герой (проверка одним игроком, запоминается в браузере), all — все герои (флаг data/hero-b.json). */
type Mode = "off" | "self" | "all";
const saved = (): Mode | null => { try { const v = localStorage.getItem("heroB:mode"); return v === "off" || v === "self" || v === "all" ? v : null; } catch { return null; } };
const save = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* нет хранилища */ } };
const st = {
  mode: (saved() ?? ((heroFlag as { enabled?: boolean }).enabled ? "all" : "off")) as Mode,
  /** Вид сета поверх надетого (консоль heroB.set). */
  preview: (() => { try { return localStorage.getItem("heroB:set") || null; } catch { return null; } })() as string | null,
  look: {} as Partial<Pick<HbLook, "sex" | "hair">>,
  ver: 0,
};
export const heroBOn = () => st.mode !== "off";
/** Номер смены настроек: UnitView пересобирает облик, когда он изменился. */
export const heroBVer = () => st.ver;

let man: Man | null = null, manP: Promise<Man | null> | null = null;
function loadMan(): Promise<Man | null> {
  return (manP ??= fetch("/assets/hero147/manifest.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => (man = m)));
}
const imgs = new Map<string, Promise<HTMLImageElement | null>>();
function img(file: string): Promise<HTMLImageElement | null> {
  let p = imgs.get(file);
  if (!p) {
    p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `/assets/hero147/${file}`; });
    imgs.set(file, p);
  }
  return p;
}

const hash = (s: string) => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return h; };

/** Облик по данным сервера: фракция, оружие (класс позы и удар), вещи по слотам (модель → сет, иначе заглушка по материалу). */
export function lookOf(u: { faction: string; gear: string; weapon: string; name: string }, id: string): HbLook | null {
  if (!man) return null;
  const fac = u.faction === "umbrath" ? "umb" : "sol";
  const h = hash(u.name || id);
  const sex = st.look.sex ?? (h % 2 ? "f" : "m");
  const styles = man.hair[sex];
  const hair = st.look.hair && styles.some((s) => s.id === st.look.hair) ? st.look.hair : styles[(h >> 3) % styles.length].id;
  // 6-е поле — «1», если на оружие наложен чужой вид (перековка, shared/transmog.ts gearStrings): особый удар не переносится
  const [wBase = "", , , wLeg = "", wModel = "", wTm = ""] = (u.weapon || "").split(":");
  let wc = LIVE.weaponClass[wBase] ?? LIVE.weaponClass[""];
  const slots: HbLook["slots"] = {};
  const has = (set: string, cls: Cls, slot: Slot147) => !!man!.groups[`gear/${set}/${sex}/${cls}`] && Object.keys(man!.groups[`gear/${set}/${sex}/${cls}`]).some((k) => k.startsWith(slot + "@"));
  if (st.preview) {
    // проверка сета: все слоты из него; двуручник сета — поза great
    if (has(st.preview, "great", "weapon")) wc = { cls: "great", atk: "atk2h" };
    for (const s of SLOTS) if (has(st.preview, wc.cls, s)) slots[s] = st.preview;
  } else {
    const parts = parseGear(u.gear);
    const order = ["helmet", "armor", "boots", "offhand", "cloak"];
    let mat = "plate";
    const armorPiece = parts[1];
    if (armorPiece.r >= 0) mat = BASE_ITEMS[armorPiece.base]?.armorType ?? "plate";
    parts.slice(0, 5).forEach((p, k) => {
      const slot = LIVE.slotMap[order[k]];
      if (!slot || p.r < 0) return;
      const set = LIVE.models[p.model] ?? LIVE.models[p.leg];
      if (set && has(set, wc.cls, slot)) {
        slots[slot] = set;
        // наплечники и перчатки — только если у сета доспеха они есть (новые слоты сервера — отдельной задачей)
        if (slot === "armor") for (const ex of ["pauldrons", "gloves"] as const) if (has(set, wc.cls, ex)) slots[ex] = set;
        return;
      }
      const m = BASE_ITEMS[p.base]?.armorType ?? (slot === "cloak" ? mat : "plate");
      if (has(`stub-${m}`, wc.cls, slot)) slots[slot] = `stub-${m}`;
    });
    if (wc.cls === "great") {
      const set = LIVE.models[wModel] ?? LIVE.models[wLeg];
      slots.weapon = set && has(set, "great", "weapon") ? set : `stub-${mat}`;
    }
  }
  const special = wc.cls === "great" && !wTm && slots.weapon && man.special?.includes(slots.weapon) ? slots.weapon : undefined;
  return { fac, sex, hair, cls: wc.cls, atk: wc.atk, special, slots };
}
const lookKey = (l: HbLook) => `hb_${l.fac}${l.sex}_${l.hair}_${l.cls}_${l.atk}_` + SLOTS.map((s) => l.slots[s] ?? "-").join(",");

const sheets = new Map<string, HbSheet | null>();
const pending = new Set<string>();
const byUnit = new Map<string, { sig: string; l: HbLook; key: string }>();

/** Лист облика: готов — HbSheet, ещё сводится или грузится — null (UnitView рисует прежнего героя). */
export function heroBSheet(scene: Phaser.Scene, u: { faction: string; gear: string; weapon: string; name: string }, id: string, self = false): HbSheet | null {
  if (st.mode === "off" || (st.mode === "self" && !self)) return null;
  if (!man) { void loadMan(); return null; }
  // облик пересчитывается только при смене вещей, оружия, фракции или настроек консоли
  const sig = `${st.ver}|${u.faction}|${u.gear}|${u.weapon}|${u.name}`;
  let c = byUnit.get(id);
  if (!c || c.sig !== sig) {
    const l = lookOf(u, id);
    if (!l) return null;
    c = { sig, l, key: lookKey(l) };
    byUnit.set(id, c);
  }
  const { l, key } = c;
  const s = sheets.get(key);
  if (s !== undefined) return s;
  if (!pending.has(key)) { pending.add(key); void bake(scene, key, l).then((r) => { sheets.set(key, r); pending.delete(key); }); }
  return null;
}

/** Слой сведения: лист, его строки начинаются со строки r0 листа облика (особый удар — свои строки после строк класса). */
interface Layer { e: Entry; im: HTMLImageElement; gl: HTMLImageElement | null; ord: number; r0: number; n: number; /** слой оружия (weapon@) — для контура заточки */ wp?: boolean }
/** Столбцов в листе облика — из манифеста экспорта (cols по классу позы: самая длинная анимация класса); старый манифест — по кадрам строк. */
const colsOf = (m: Man, rows: [string, string][], cls: string[]) => Math.max(1, ...cls.map((c) => m.cols?.[c] ?? 0), ...rows.map(([a]) => m.anims[a]?.frames ?? 0));
async function bake(scene: Phaser.Scene, key: string, l: HbLook): Promise<HbSheet | null> {
  const m = man!;
  const clsRows = m.rows[l.cls], spRows = l.special ? m.rows.special ?? [] : [];
  const rows = [...clsRows, ...spRows];
  const COLS = colsOf(m, rows, l.special ? [l.cls, "special"] : [l.cls]);
  // ткань «Спины» с физикой (cloth в манифесте, экспорт gear147): плащ этого сета не сводится в лист — его рисует heroCloth (Rope + Verlet)
  const clothSet = l.slots.cloak && m.cloth?.[l.slots.cloak] ? l.slots.cloak : "";
  const want: { grp: string; filter: (k: string) => boolean; r0: number }[] = [];
  const add = (sub: string, special: string, r0: number) => {
    want.push({ grp: `body/${l.fac}_${l.sex}/${special ? "special-" + special : sub}`, filter: () => true, r0 });
    if (!l.slots.helm) want.push({ grp: `hair/${l.sex}_${l.hair}_${l.fac}/${special ? "special-" + special : sub}`, filter: () => true, r0 });
    const crestOf = new Set<string>();
    for (const s of SLOTS) {
      const set = l.slots[s]; if (!set || (s === "cloak" && set === clothSet)) continue;
      if (special && set !== special) continue; // в особом ударе — только вещи сета с этим ударом (листы есть только у него)
      want.push({ grp: `gear/${set}/${l.sex}/${special ? "special" : sub}`, filter: (k) => k.startsWith(s + "@"), r0 });
      if (s === "armor" || s === "cloak") crestOf.add(set);
    }
    for (const set of crestOf) want.push({ grp: `gear/${set}/${l.sex}/${special ? "special" : sub}`, filter: (k) => k.startsWith("crest@") && k.endsWith(l.fac === "umb" ? "-umb" : "-sol"), r0 });
  };
  add(l.cls, "", 0);
  if (l.special) add(l.cls, l.special, clsRows.length);
  const list: { e: Entry; ord: number; r0: number; n: number; wp?: boolean }[] = [];
  for (const w of want) { const g = m.groups[w.grp]; if (!g) continue; for (const [k, e] of Object.entries(g)) if (w.filter(k) && !k.startsWith("cloth@")) list.push({ e, ord: list.length, r0: w.r0, n: e.z.length, wp: w.grp.startsWith("gear/") && k.startsWith("weapon@") }); }
  if (!list.length) return null;
  const layers: Layer[] = (await Promise.all(list.map(async (q) => ({ ...q, im: await img(q.e.file), gl: q.e.glow ? await img(q.e.glow) : null })))).filter((q): q is Layer => !!q.im);
  const F = Math.max(...layers.map((q) => q.e.frame));
  const O = layers.find((q) => q.e.frame === F)!.e.origin;
  const cv = document.createElement("canvas");
  cv.width = COLS * F; cv.height = rows.length * F;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const anyGlow = layers.some((q) => q.gl);
  const gcv = anyGlow ? document.createElement("canvas") : null;
  if (gcv) { gcv.width = cv.width; gcv.height = cv.height; }
  const gg = gcv?.getContext("2d") ?? null;
  // видимая часть оружия (слои weapon@, закрытые слоями выше по z) — маска контура заточки (heroEnchant.ts)
  const anyWp = layers.some((q) => q.wp), wcv = anyWp ? document.createElement("canvas") : null;
  if (wcv) { wcv.width = cv.width; wcv.height = cv.height; }
  const wg = wcv?.getContext("2d") ?? null;
  // клетка: кадр слоя (строка листа слоя rr) с его опорой → кадр листа облика (строка R) с опорой O
  const cell = (ctx: CanvasRenderingContext2D, q: Layer, im: HTMLImageElement, rr: number, R: number, i: number, left: boolean) => {
    const f = q.e.frame, dx = O[0] - q.e.origin[0], dy = O[1] - q.e.origin[1];
    ctx.save();
    if (left) { ctx.translate((2 * i + 1) * F, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, i * f, rr * f, f, f, i * F + dx, R * F + dy, f, f);
    ctx.restore();
  };
  rows.forEach(([a, v], R) => {
    const n = Math.min(COLS, m.anims[a]?.frames ?? 0), left = v === "left";
    for (let i = 0; i < n; i++) {
      const lay = layers.filter((q) => R >= q.r0 && R - q.r0 < q.n && q.e.z[R - q.r0]?.[i] != null)
        .sort((p, q) => p.e.z[R - p.r0][i]! - q.e.z[R - q.r0][i]! || p.ord - q.ord);
      for (const q of lay) {
        cell(g, q, q.im, R - q.r0, R, i, left);
        if (gg) {
          // свечение закрывается слоями выше по z
          gg.globalCompositeOperation = "destination-out"; cell(gg, q, q.im, R - q.r0, R, i, left);
          gg.globalCompositeOperation = "source-over"; if (q.gl) cell(gg, q, q.gl, R - q.r0, R, i, left);
        }
        if (wg) { wg.globalCompositeOperation = q.wp ? "source-over" : "destination-out"; cell(wg, q, q.im, R - q.r0, R, i, left); }
      }
    }
  });
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, cv)!;
  const gtex = gcv ? scene.textures.addCanvas(key + "_glow", gcv) : null;
  for (let r = 0; r < rows.length; r++) for (let i = 0; i < COLS; i++) { tex.add(r * COLS + i, 0, i * F, r * F, F, F); gtex?.add(r * COLS + i, 0, i * F, r * F, F, F); }
  // анимации под ключи UnitView: rest, walk (бег), attack (и attack2 — особый удар), hurt, death; строки 0 вниз, 1 вверх, 2 вбок; sidL — строка 2 из вида «влево»
  const sid = key, sidL = key + "L";
  const rowOf = (a: string, v: string) => rows.findIndex((q) => q[0] === a && q[1] === v);
  const mk = (s: string, name: string, a: string, view: number, left: boolean, repeat: number) => {
    const vv = view === 0 ? "down" : view === 1 ? "up" : left ? "left" : "side";
    const r = rowOf(a, vv); if (r < 0) return;
    const A = m.anims[a], n = Math.min(COLS, A.frames);
    const k = `${s}-${name}-${view}`;
    if (scene.anims.exists(k)) scene.anims.remove(k);
    scene.anims.create({ key: k, frames: Array.from({ length: n }, (_, i) => ({ key, frame: r * COLS + i })), frameRate: A.fps, repeat });
  };
  for (const [s, left] of [[sid, false], [sidL, true]] as const) for (let view = 0; view < 3; view++) {
    mk(s, "rest", "idle", view, left, -1);
    mk(s, "rest2", "idle2", view, left, 0); // редкий переступ в покое
    mk(s, "stance", "stance", view, left, -1); // боевая стойка между ударами
    mk(s, "stroll", "walk", view, left, -1); // шаг (медленный ход: замедление, ходьба)
    mk(s, "walk", "run", view, left, -1);
    mk(s, "attack", l.atk, view, left, 0);
    if (l.special) mk(s, "attack2", "special2h", view, left, 0);
    mk(s, "hurt", "hurt", view, left, 0);
    mk(s, "death", "death", view, left, 0);
  }
  const dead = [0, 1, 2, 3].map((k) => Math.max(0, rowOf("death", ["down", "up", "side", "left"][k])) * COLS + Math.min(COLS, m.anims.death.frames) - 1);
  // макушка над ногами: самый верхний непрозрачный пиксель покоя (вниз, кадр 0) в полосе ±7 px от оси
  let rise = 30;
  try {
    const r0 = rowOf("idle", "down"), d = g.getImageData(O[0] - 7, r0 * F, 15, O[1]).data;
    for (let y = 0; y < O[1]; y++) { let hit = false; for (let x = 0; x < 15; x++) if (d[(y * 15 + x) * 4 + 3] > 24) { hit = true; break; } if (hit) { rise = O[1] - y; break; } }
  } catch { /* нет данных — рост по умолчанию */ }
  // силуэты кадров (сетка 48×48, ноги — вес 2) для переходов «старт со ближайшей позы»: циклы целиком, у остальных — последний кадр
  const masks = new Map<string, Uint8Array[]>();
  try {
    const st = F / 48, legY = O[1] - 14 * st;
    rows.forEach(([a, v], R) => {
      const n = Math.min(COLS, m.anims[a]?.frames ?? 0); if (!n) return;
      const all = ["idle", "stance", "run", "walk", "idle2"].includes(a);
      const d = g.getImageData(0, R * F, n * F, F).data, W = n * F, arr: Uint8Array[] = [];
      for (let i = 0; i < n; i++) {
        if (!all && i !== n - 1) { arr.push(new Uint8Array(0)); continue; }
        const mm = new Uint8Array(48 * 48);
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const px = Math.floor(i * F + x * st), py = Math.floor(y * st); if (d[(py * W + px) * 4 + 3] > 24) mm[y * 48 + x] = py >= legY ? 2 : 1; }
        arr.push(mm);
      }
      masks.set(a + ":" + v, arr);
    });
  } catch { /* нет данных — переходы с кадра 0 */ }
  const bodyKey = `${l.fac}_${l.sex}`;
  const ench = wcv ? enchantTex(scene, key, wcv, F, COLS, rows.length) : null;
  return { atk: l.atk, masks, ench, key, sid, sidL, frame: F, ox: O[0] / F, oy: O[1] / F, origin: [O[0], O[1]], rise, glow: !!gtex, special: !!l.special, dead, rows: rows.map((q) => q[0] + ":" + q[1]),
    cloth: clothSet ? { set: clothSet, def: m.cloth![clothSet], body: bodyKey } : null };
}

/** Контур оружия для заточки: кольцо 1 px снаружи видимого силуэта оружия (k1) и второе кольцо (k2), без заливки; точки кольца кадра (до 24) — для угольков. */
function enchantTex(scene: Phaser.Scene, key: string, wcv: HTMLCanvasElement, F: number, COLS: number, R: number) {
  const W = wcv.width, H = wcv.height, src = wcv.getContext("2d")!.getImageData(0, 0, W, H).data;
  const a = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 24;
  const c1 = document.createElement("canvas"), c2 = document.createElement("canvas"); c1.width = c2.width = W; c1.height = c2.height = H;
  const i1 = c1.getContext("2d")!.createImageData(W, H), i2 = c2.getContext("2d")!.createImageData(W, H), ring1 = new Uint8Array(W * H);
  const pts = new Map<number, number[]>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) {
    ring1[y * W + x] = 1; const o = (y * W + x) * 4; i1.data[o] = i1.data[o + 1] = i1.data[o + 2] = i1.data[o + 3] = 255;
    const fr = Math.floor(y / F) * COLS + Math.floor(x / F), p = pts.get(fr) ?? []; if (p.length < 48 && Math.random() < 0.35) p.push(x % F, y % F); pts.set(fr, p);
  }
  const r1 = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && ring1[y * W + x] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!a(x, y) && !r1(x, y) && (r1(x - 1, y) || r1(x + 1, y) || r1(x, y - 1) || r1(x, y + 1))) { const o = (y * W + x) * 4; i2.data[o] = i2.data[o + 1] = i2.data[o + 2] = i2.data[o + 3] = 255; }
  c1.getContext("2d")!.putImageData(i1, 0, 0); c2.getContext("2d")!.putImageData(i2, 0, 0);
  if (!pts.size) return null;
  const k1 = key + "_ench", k2 = key + "_ench2";
  for (const [k, c] of [[k1, c1], [k2, c2]] as const) {
    if (scene.textures.exists(k)) scene.textures.remove(k);
    const t = scene.textures.addCanvas(k, c)!;
    for (let r = 0; r < R; r++) for (let i = 0; i < COLS; i++) t.add(r * COLS + i, 0, i * F, r * F, F, F);
  }
  return { k1, k2, pts };
}

/** Имя анимации UnitView → анимация листа. */
const ANIM_OF: Record<string, string> = { rest: "idle", rest2: "idle2", stance: "stance", walk: "run", stroll: "walk", hurt: "hurt", death: "death", attack2: "special2h" };
export const heroBAnim = (sh: HbSheet, name: string) => (name === "attack" ? sh.atk : ANIM_OF[name] ?? name);
const viewName = (row: number, left: boolean) => (row === 0 ? "down" : row === 1 ? "up" : left ? "left" : "side");
const maskDist = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) s += Math.max(a[k], b[k]); return s; };
/**
 * Переход без рывка (пиксель-арт: старт со ближайшей позы, без альфа-смешивания): кадр анимации to, ближайший по силуэту (ноги — вес 2)
 * к кадру frame анимации from того же вида. Нет данных — -1.
 */
export function heroBNear(sh: HbSheet, from: string, frame: number, to: string, row: number, left: boolean): number {
  const v = viewName(row, left), A = sh.masks.get(heroBAnim(sh, from) + ":" + v), B = sh.masks.get(heroBAnim(sh, to) + ":" + v);
  const a = A?.[Math.min(frame, (A?.length ?? 1) - 1)];
  if (!a?.length || !B?.length) return -1;
  let best = -1, bd = Infinity;
  B.forEach((b, j) => { if (!b.length) return; const d = maskDist(a, b); if (d < bd) { bd = d; best = j; } });
  return best;
}
/** Мост перед сменой: через сколько кадров (0..max) вперёд по текущему циклу from поза ближе всего к анимации to (стоп из бега — доиграть до опоры). */
export function heroBBridge(sh: HbSheet, from: string, frame: number, to: string, row: number, left: boolean, max = 2): number {
  const v = viewName(row, left), A = sh.masks.get(heroBAnim(sh, from) + ":" + v), B = sh.masks.get(heroBAnim(sh, to) + ":" + v);
  if (!A?.length || !B?.length) return 0;
  let best = 0, bd = Infinity;
  for (let k = 0; k <= max; k++) {
    const a = A[(frame + k) % A.length]; if (!a.length) continue;
    let d = Infinity; for (const b of B) if (b.length) d = Math.min(d, maskDist(a, b));
    if (d < bd * 0.85) { bd = d; best = k; } // дальше — только заметно ближе
  }
  return best;
}

/** Кадр смерти (последний) для мгновенной смерти без анимации: строка вида row (0 вниз, 1 вверх, 2 вбок). */
export function heroBDeadFrame(sh: HbSheet, row: number, left: boolean): number {
  return sh.dead[row === 2 && left ? 3 : row];
}

/** Номер удара → ключ анимации: у оружия с особым ударом — каждый every-й (или по шансу) особый (data/hero-b-live.json specialAttack). */
export function heroBAttack(sh: HbSheet, sid: string, row: number, n: number): { key: string; special: boolean } {
  const sp = LIVE.specialAttack;
  const special = sh.special && (sp.chance > 0 ? Math.random() < sp.chance : n % Math.max(1, sp.every) === 0);
  return { key: `${sid}-${special ? "attack2" : "attack"}-${row}`, special };
}

/** Огненный след особого удара поверх героя: дуги вслед за клинком по кругу разворота (ADD, гаснут с easing). */
export function heroBTrail(scene: Phaser.Scene, x: number, y: number, depth: number, flip: boolean, ms: number) {
  if (!scene.textures.exists("fx_slash")) return;
  const col = Phaser.Display.Color.HexStringToColor(LIVE.specialAttack.trail.color).color, core = Phaser.Display.Color.HexStringToColor(LIVE.specialAttack.trail.core).color;
  const N = 12, dir = flip ? -1 : 1;
  for (let k = 0; k < N; k++) {
    const a = dir * (k / N) * Math.PI * 2 - Math.PI / 2, delay = (k / N) * ms * 0.8;
    for (const [c, sc, al] of [[col, 0.95, 0.85], [core, 0.6, 0.9]] as const) {
      const s = scene.add.image(x + Math.cos(a) * 15, y - 14 + Math.sin(a) * 8, "fx_slash").setRotation(a + dir * Math.PI / 2).setScale(sc).setTint(c)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1).setAlpha(0);
      scene.tweens.add({ targets: s, alpha: { from: al, to: 0 }, scale: sc * 1.25, delay, duration: 260, ease: "Cubic.easeOut", onComplete: () => s.destroy() });
    }
  }
}

/** Точки крепления ткани в кадре тела (кадр 48, ступни 24,45): анимация и вид по строке листа облика, кадр i. */
export function heroBPins(sh: HbSheet, rowName: string, i: number): number[] | null {
  const p = man?.pins?.[sh.cloth?.body ?? ""];
  if (!p) return null;
  const [a0, v] = rowName.split(":"), a = a0 === "special2h" ? "atk2h" : a0;
  const vv = v === "left" ? "side" : v, fr = p[a]?.[vv] ?? p.idle?.[vv];
  if (!fr?.length) return null;
  const q = fr[Math.min(i, fr.length - 1)].slice();
  if (v === "left") for (let k = 0; k < q.length; k += 2) q[k] = 48 - q[k];
  return q;
}
export const heroBPinKeys = () => man?.pinKeys ?? [];

// консоль: heroB.on() / off() / set(сет) / look({ sex, hair }) / status()
const api = {
  /** Только свой герой (запоминается в браузере до heroB.off()). */
  self() { st.mode = "self"; save("heroB:mode", st.mode); st.ver++; void loadMan(); return "герой Б: только свой герой"; },
  /** Все герои на этом клиенте. */
  on() { st.mode = "all"; save("heroB:mode", st.mode); st.ver++; void loadMan(); return "герой Б: все герои"; },
  off() { st.mode = "off"; save("heroB:mode", st.mode); st.ver++; return "герой Б выключен"; },
  /** Вид сета поверх надетого (проверка без выдачи); null — по надетому. */
  set(id: string | null) { st.preview = id; save("heroB:set", id); st.ver++; return id ? `вид сета ${id}` : "вещи — по надетому"; },
  look(l: Partial<Pick<HbLook, "sex" | "hair">>) { st.look = l || {}; st.ver++; return st.look; },
  /** Для снимков: огненный след особого удара (scene, x, y, depth, flip, ms). */
  trail: heroBTrail,
  status() { return { mode: st.mode, preview: st.preview, look: st.look, sheets: [...sheets.keys()], sets: LIVE.sets }; },
};
(window as unknown as { heroB: typeof api }).heroB = api;
