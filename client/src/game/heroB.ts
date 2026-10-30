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
interface Man { rows: Record<Cls, [string, string][]>; anims: Record<string, { frames: number; fps: number; loop: boolean }>; hair: Record<"m" | "f", { id: string }[]>; groups: Record<string, Record<string, Entry>> }
const SLOTS = ["helm", "pauldrons", "armor", "gloves", "boots", "cloak", "weapon"] as const;
type Slot147 = (typeof SLOTS)[number];
const LIVE = live as unknown as { classes: Record<Cls, { anims: string[] }>; weaponClass: Record<string, { cls: Cls; atk: string }>; sets: string[]; models: Record<string, string>; slotMap: Record<string, Slot147>; stubs: Record<string, Partial<Record<Slot147, unknown>>> };

/** Облик героя Б, из которого сводится лист. */
export interface HbLook { fac: "sol" | "umb"; sex: "m" | "f"; hair: string; cls: Cls; atk: string; slots: Partial<Record<Slot147, string>> }
/** Готовый лист: sid прежних ключей анимаций (`${sid}-walk-${row}` и т. д.), sidL — то же для взгляда влево; frame — кадр, oy — опора по ногам, rise — макушка над ногами. */
export interface HbSheet { key: string; sid: string; sidL: string; frame: number; ox: number; oy: number; rise: number; glow: boolean; /** листы ткани (cloth@…) — не в листе, для Verlet-ткани */ cloth: Entry[] }

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
  const [wBase = "", , , wLeg = "", wModel = ""] = (u.weapon || "").split(":");
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
  return { fac, sex, hair, cls: wc.cls, atk: wc.atk, slots };
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

interface Layer { e: Entry; im: HTMLImageElement; gl: HTMLImageElement | null; ord: number }
async function bake(scene: Phaser.Scene, key: string, l: HbLook): Promise<HbSheet | null> {
  const m = man!;
  const want: { grp: string; filter: (k: string) => boolean }[] = [{ grp: `body/${l.fac}_${l.sex}/${l.cls}`, filter: () => true }];
  if (!l.slots.helm) want.push({ grp: `hair/${l.sex}_${l.hair}_${l.fac}/${l.cls}`, filter: () => true });
  const crestOf = new Set<string>();
  for (const s of SLOTS) {
    const set = l.slots[s]; if (!set) continue;
    want.push({ grp: `gear/${set}/${l.sex}/${l.cls}`, filter: (k) => k.startsWith(s + "@") });
    if (s === "armor" || s === "cloak") crestOf.add(set);
  }
  for (const set of crestOf) want.push({ grp: `gear/${set}/${l.sex}/${l.cls}`, filter: (k) => k.startsWith("crest@") && k.endsWith(l.fac === "umb" ? "-umb" : "-sol") });
  const list: { e: Entry; ord: number }[] = [];
  // ткань (плащ, шарф, полы) — отдельная текстура «cloth@…» по кадрам (экспорт gear147): в лист не сводится, её качает Verlet-цепь на Rope
  // (docs/hero147-live.md «Ткань»); здесь только место в сборке — список листов ткани в HbSheet.cloth
  const cloth: Entry[] = [];
  for (const w of want) { const g = m.groups[w.grp]; if (!g) continue; for (const [k, e] of Object.entries(g)) if (w.filter(k)) { if (k.startsWith("cloth@")) cloth.push(e); else list.push({ e, ord: list.length }); } }
  for (const s of SLOTS) { const set = l.slots[s]; const g = set ? m.groups[`gear/${set}/${l.sex}/${l.cls}`] : undefined; if (g) for (const [k, e] of Object.entries(g)) if (k.startsWith("cloth@") && !cloth.includes(e)) cloth.push(e); }
  if (!list.length) return null;
  const layers: Layer[] = (await Promise.all(list.map(async (q) => ({ ...q, im: await img(q.e.file), gl: q.e.glow ? await img(q.e.glow) : null })))).filter((q): q is Layer => !!q.im);
  const F = Math.max(...layers.map((q) => q.e.frame));
  const O = layers.find((q) => q.e.frame === F)!.e.origin;
  const rows = m.rows[l.cls], COLS = 12;
  const cv = document.createElement("canvas");
  cv.width = COLS * F; cv.height = rows.length * F;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const anyGlow = layers.some((q) => q.gl);
  const gcv = anyGlow ? document.createElement("canvas") : null;
  if (gcv) { gcv.width = cv.width; gcv.height = cv.height; }
  const gg = gcv?.getContext("2d") ?? null;
  // клетка: кадр слоя с его опорой → кадр листа с опорой O
  const cell = (ctx: CanvasRenderingContext2D, q: Layer, im: HTMLImageElement, r: number, i: number, left: boolean) => {
    const f = q.e.frame, dx = O[0] - q.e.origin[0], dy = O[1] - q.e.origin[1];
    ctx.save();
    if (left) { ctx.translate((2 * i + 1) * F, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, i * f, r * f, f, f, i * F + dx, r * F + dy, f, f);
    ctx.restore();
  };
  rows.forEach(([a, v], r) => {
    const n = Math.min(COLS, m.anims[a]?.frames ?? 0), left = v === "left";
    for (let i = 0; i < n; i++) {
      const lay = layers.filter((q) => q.e.z[r]?.[i] != null).sort((p, q) => p.e.z[r][i]! - q.e.z[r][i]! || p.ord - q.ord);
      for (const q of lay) {
        cell(g, q, q.im, r, i, left);
        if (gg) {
          // свечение закрывается слоями выше по z
          gg.globalCompositeOperation = "destination-out"; cell(gg, q, q.im, r, i, left);
          gg.globalCompositeOperation = "source-over"; if (q.gl) cell(gg, q, q.gl, r, i, left);
        }
      }
    }
  });
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, cv)!;
  const gtex = gcv ? scene.textures.addCanvas(key + "_glow", gcv) : null;
  for (let r = 0; r < rows.length; r++) for (let i = 0; i < COLS; i++) { tex.add(r * COLS + i, 0, i * F, r * F, F, F); gtex?.add(r * COLS + i, 0, i * F, r * F, F, F); }
  // анимации под ключи UnitView: rest, walk (бег), attack, hurt, death; строки 0 вниз, 1 вверх, 2 вбок; sidL — строка 2 из вида «влево»
  const sid = key, sidL = key + "L";
  const rowOf = (a: string, v: string) => rows.findIndex((q) => q[0] === a && q[1] === v);
  const mk = (s: string, name: string, a: string, view: number, left: boolean, repeat: number, fpsK = 1) => {
    const vv = view === 0 ? "down" : view === 1 ? "up" : left ? "left" : "side";
    const r = rowOf(a, vv); if (r < 0) return;
    const A = m.anims[a], n = Math.min(COLS, A.frames);
    const k = `${s}-${name}-${view}`;
    if (scene.anims.exists(k)) scene.anims.remove(k);
    scene.anims.create({ key: k, frames: Array.from({ length: n }, (_, i) => ({ key, frame: r * COLS + i })), frameRate: A.fps * fpsK, repeat });
  };
  for (const [s, left] of [[sid, false], [sidL, true]] as const) for (let view = 0; view < 3; view++) {
    mk(s, "rest", "idle", view, left, -1);
    mk(s, "walk", "run", view, left, -1);
    mk(s, "attack", l.atk, view, left, 0);
    mk(s, "hurt", "hurt", view, left, 0);
    mk(s, "death", "death", view, left, 0);
  }
  // макушка над ногами: самый верхний непрозрачный пиксель покоя (вниз, кадр 0) в полосе ±7 px от оси
  let rise = 30;
  try {
    const r0 = rowOf("idle", "down"), d = g.getImageData(O[0] - 7, r0 * F, 15, O[1]).data;
    for (let y = 0; y < O[1]; y++) { let hit = false; for (let x = 0; x < 15; x++) if (d[(y * 15 + x) * 4 + 3] > 24) { hit = true; break; } if (hit) { rise = O[1] - y; break; } }
  } catch { /* нет данных — рост по умолчанию */ }
  return { key, sid, sidL, frame: F, ox: O[0] / F, oy: O[1] / F, rise, glow: !!gtex, cloth };
}

/** Кадр смерти (последний) для мгновенной смерти без анимации: строка вида row (0 вниз, 1 вверх, 2 вбок). */
export function heroBDeadFrame(sh: HbSheet, row: number, left: boolean): number {
  const rows = man!.rows[sh.key.includes("_great_") ? "great" : "free"];
  const r = rows.findIndex((q) => q[0] === "death" && q[1] === (row === 0 ? "down" : row === 1 ? "up" : left ? "left" : "side"));
  return Math.max(0, r) * 12 + Math.min(12, man!.anims.death.frames) - 1;
}

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
  status() { return { mode: st.mode, preview: st.preview, look: st.look, sheets: [...sheets.keys()], sets: LIVE.sets }; },
};
(window as unknown as { heroB: typeof api }).heroB = api;
