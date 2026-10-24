/**
 * Сеты NPC на утверждение (задача 132, шаг 8, первая часть; решения 9 и 11 docs/map-rework.md): бойцы и стража Сольгарда
 * (паладины) и Умбрата (латы нежити) по рангам — слабые, средние, сильные, мегасильные, у каждого ближник и дальник, по 2 варианта;
 * отдельно — нейтральная стража Эмберхолла. Вид собирается тем же кодом, что и герой в игре: тело nude_<класс> из ассетов +
 * слои снаряжения client/src/game/GearLayers.ts (собираются esbuild с заглушкой Phaser и рисуются в PC). Новые детали — геральдика
 * поверх слоёв (табард с гербом, герб на щите, на спине плаща и на знамени) — пиксельные эмблемы утверждённых гербов 130
 * («Восход над Оплотом», «Корона над гробом») и предложение эмблемы Эмберхолла; в игру не ставится (вторая часть шага 8).
 * Выход: tools/out/npc-sets/solgard.png, umbrath.png, ember.png, overview.png. Запуск: npx tsx tools/gen/npc-sets.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PC, hex, type RGBA } from "./canvas";
import { crop, label, paintGround, readPng, scaleNN } from "./standards";
import { BASE_ITEMS, ITEM_MODELS } from "../../shared/items";
import EMBER_DATA from "../../data/ember-guard.json";
import { ashCracks, ashEyes, ashEmbers, ASH_FRAMES, ASH_FPS, type AshRect } from "../../client/src/game/ashborn";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tools/out/npc-sets");
const K = 3; // масштаб показа — как камера игры (zoom 3)

// ---------------------------------------------------------------- слои снаряжения игры вне браузера
/** Заглушка Phaser: GearLayers берёт из него только разбор цвета; графика — регистратор прямоугольников. */
const SHIM = `
const HexStringToColor = (h) => { const n = parseInt(String(h).replace("#", "").slice(0, 6), 16) || 0; return { color: n, red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 }; };
const RGBToString = (r, g, b, _a, p = "#") => p + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("");
export default { Display: { Color: { HexStringToColor, RGBToString } } };`;

type Op = { k: "r"; x: number; y: number; w: number; h: number; c: number; a: number } | { k: "c"; x: number; y: number; r: number; c: number; a: number } | { k: "e"; x: number; y: number; w: number; h: number; c: number; a: number };
class RecGraphics {
  ops: Op[] = [];
  private f: [number, number] = [0, 1];
  private l: [number, number] = [0, 1];
  clear() { this.ops = []; return this; }
  setVisible() { return this; }
  setDepth() { return this; }
  setAlpha() { return this; }
  destroy() {}
  fillStyle(c: number, a = 1) { this.f = [c, a]; return this; }
  fillRect(x: number, y: number, w: number, h: number) { this.ops.push({ k: "r", x, y, w, h, c: this.f[0], a: this.f[1] }); return this; }
  fillCircle(x: number, y: number, r: number) { this.ops.push({ k: "c", x, y, r, c: this.f[0], a: this.f[1] }); return this; }
  lineStyle(_w: number, c: number, a = 1) { this.l = [c, a]; return this; }
  strokeEllipse(x: number, y: number, w: number, h: number) { this.ops.push({ k: "e", x, y, w, h, c: this.l[0], a: this.l[1] }); return this; }
}
const rgba = (c: number, a: number): RGBA => [(c >> 16) & 255, (c >> 8) & 255, c & 255, Math.round(255 * Math.max(0, Math.min(1, a)))];
function paint(dst: PC, g: RecGraphics) {
  for (const o of g.ops) {
    const col = rgba(o.c, o.a);
    if (o.k === "r") { const x0 = Math.round(o.x), y0 = Math.round(o.y), x1 = Math.round(o.x + o.w), y1 = Math.round(o.y + o.h); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) dst.set(x, y, col); }
    else if (o.k === "c") { for (let y = -o.r; y <= o.r; y++) for (let x = -o.r; x <= o.r; x++) if (x * x + y * y <= o.r * o.r) dst.set(Math.round(o.x + x), Math.round(o.y + y), col); }
    else for (let q = 0; q < 64; q++) { const t = (q / 64) * Math.PI * 2; dst.set(Math.round(o.x + Math.cos(t) * o.w / 2), Math.round(o.y + Math.sin(t) * o.h / 2), col); }
  }
}

type GLMod = { GearLayers: new (scene: unknown) => GLInst; LEGENDARIES: Record<string, { look: Record<string, unknown> }> };
type GLInst = { draw(i: Record<string, unknown>): void; [k: string]: unknown };
async function loadGearLayers(): Promise<GLMod> {
  const res = await build({
    stdin: { contents: `export { GearLayers } from "./client/src/game/GearLayers"; export { LEGENDARIES } from "./shared/legendary";`, resolveDir: ROOT, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "error",
    plugins: [{ name: "phaser-shim", setup(b) { b.onResolve({ filter: /^phaser$/ }, () => ({ path: "phaser", namespace: "shim" })); b.onLoad({ filter: /.*/, namespace: "shim" }, () => ({ contents: SHIM, loader: "js" })); } }],
  });
  return (await import("data:text/javascript;base64," + Buffer.from(res.outputFiles[0].text).toString("base64"))) as GLMod;
}

// ---------------------------------------------------------------- геральдика на снаряжении (новые детали)
type Fac = "solgard" | "umbrath" | "ember";
/** Пиксельные эмблемы гербов: 6 px (широкий табард, большой щит, спина плаща) и 4 px (узкий табард, малый щит, знамя). */
const EMB: Record<Fac, { pal: Record<string, string>; e6: string[]; e4: string[]; out: string }> = {
  // «Восход над Оплотом»: солнце с лучами над щитом лазури с белой стеной и воротами, золотая кайма
  solgard: {
    pal: { r: "#e0a630", G: "#ffc840", g: "#c88a20", Y: "#fff4c8", B: "#3a86c8", b: "#1f5a96", W: "#f4eedc", D: "#12365e" },
    e6: ["r.gg.r", ".gYYg.", "DDDDDD", "DWBBWD", "DWWWWD", "DbWWbD", ".DDDD."],
    e4: [".gg.", "DDDD", "DWWD", ".DD."], out: "#3a2208",
  },
  // «Корона над гробом»: сиреневая корона над черепом с зелёными глазницами и позвонком (гробовидный щит — поле табарда)
  umbrath: {
    pal: { l: "#d0b4f0", L: "#9a62b8", q: "#6a3c8a", B: "#ece4cc", b: "#c8bc9c", d: "#8f8468", K: "#05030a", G: "#7aff6a" },
    e6: ["l.LL.l", "LLLLLq", ".BBbd.", "BGbbGd", "bbKKbd", ".dbbd.", "..dd.."],
    e4: ["lLLq", "BBbd", "GbbG", ".dd."], out: "#05030a",
  },
  // предложение для Эмберхолла (решение 11, свой вид): пламя очага над бронзовой наковальней, бирюза и бронза
  ember: EMBER_DATA.look.emblem,
};
/** Ткань табарда и поле щита: Сольгард — слоновая кость и золото, Умбрат — чернь и пурпур, Эмберхолл — бирюза и бронза. */
const CLOTH: Record<Fac, { f: string; fs: string; t: string; td: string; belt: string; buckle: string; shield: string }> = {
  solgard: { f: "#e2d4b0", fs: "#bfae88", t: "#e0a630", td: "#a8681c", belt: "#6a4210", buckle: "#ffd864", shield: "#e2d4b0" },
  umbrath: { f: "#22163a", fs: "#100a1a", t: "#9a62b8", td: "#6a3c8a", belt: "#2c2838", buckle: "#c4c2d4", shield: "#100a1a" },
  ember: EMBER_DATA.look.cloth,
};

type Tabard = "wide" | "narrow" | "none";
interface Npc { fac: Fac; tabard: Tabard; ash?: boolean }
let CUR: Npc | null = null;
let VIEW = 0;
/** Пепельнорождённые: время кадра (мс) и светящиеся прямоугольники кадра (для ночи — поверх затемнения). */
let ASH_T = 0;
let GLOW: AshRect[] = [];

/** Перехват отрисовки GearLayers: геральдика кладётся в ту же деталь (тот же слой, тот же контур заточки) через её R(). */
function patch(GL: GLMod) {
  const P = GL.GearLayers.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const R = (self: unknown, x: number, y: number, w: number, h: number, c: string) => (P.R as (...a: unknown[]) => void).call(self, x, y, w, h, c);
  const emblem = (self: unknown, fac: Fac, big: boolean, x: number, y: number, outline = false) => {
    const E = EMB[fac], rows = big ? E.e6 : E.e4;
    if (outline) rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === ".") return; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = rows[j + dy]?.[i + dx]; if (!nc || nc === ".") R(self, x + i + dx, y + j + dy, 1, 1, E.out); } }));
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") R(self, x + i, y + j, 1, 1, E.pal[ch]); }));
  };
  const origEnd = P.end;
  P.end = function (this: Record<string, unknown>, slot: unknown, ...rest: unknown[]) {
    const n = CUR;
    const pre = (this.cap as unknown[] | null)?.length ?? 0;
    if (n && slot === "armor" && n.tabard !== "none") {
      const C = CLOTH[n.fac], wide = n.tabard === "wide", y0 = 16;
      if (VIEW === 2) {
        // сбоку: полотнище спереди и сзади корпуса, кайма по краю
        for (const [x, w] of [[17, 3], [12, 2]] as const) { R(this, x, y0, w, 12, C.f); R(this, x + (x > 15 ? w - 1 : 0), y0, 1, 12, C.t); R(this, x, y0 + 12, w, 1, C.td); }
        R(this, 12, y0 + 8, 8, 1, C.belt);
      } else {
        const x0 = wide ? 12 : 13, w = wide ? 8 : 6;
        for (let j = 0; j < 13; j++) {
          // низ: Сольгард — ласточкин хвост, Умбрат — гробовая стопа (сужение), Эмберхолл — ровный с бахромой
          let a = 0, b = w;
          if (n.fac === "umbrath" && j >= 10) { a = j - 9; b = w - (j - 9); }
          for (let i = a; i < b; i++) {
            if (n.fac === "solgard" && j >= 11 && Math.abs(i - (w - 1) / 2) < (j === 12 ? 1.6 : 0.6)) continue;
            const edge = i === a || i === b - 1 || j === 0;
            const c = j === 12 ? C.td : edge ? (i === b - 1 ? C.td : C.t) : i === b - 2 ? C.fs : C.f;
            R(this, x0 + i, y0 + j, 1, 1, n.fac === "ember" && j === 12 && i % 2 ? C.t : c);
          }
        }
        R(this, x0, y0 + 8, w, 1, C.belt); R(this, x0 + w / 2 - 1, y0 + 8, 2, 1, C.buckle);
        if (VIEW === 0) emblem(this, n.fac, wide, x0 + 1, y0 + 1);
        else R(this, x0 + w / 2 - 1, y0 + 2, 2, 4, C.t); // со спины — полоса каймы по шву
      }
    }
    if (n && slot === "offhand" && VIEW === 0 && this.__shield) {
      const s = this.__shield as { w: number; h: number }, C = CLOTH[n.fac];
      const x = 8 - s.w + 3, y = 17, iw = s.w - 2, ih = s.h - 2;
      if (iw >= 3) {
        R(this, x + 1, y + 1, iw, ih, C.shield);
        const big = iw >= 6 && ih >= 8, ew = big ? 6 : 4, eh = big ? 7 : EMB[n.fac].e4.length;
        if (iw >= ew && ih >= eh) emblem(this, n.fac, big, x + 1 + Math.floor((iw - ew) / 2), y + 1 + Math.max(0, Math.floor((ih - eh) / 2) - (big ? 1 : 0)));
      }
    }
    if (n && slot === "cloak" && VIEW === 1 && this.__cloakArms) emblem(this, n.fac, true, 13, 17, true);
    const rects = (this.cap as { g: RecGraphics; x: number; y: number; w: number; h: number; a: number }[] | null) ?? [];
    const res = origEnd.call(this, slot, ...rest);
    // Пепельнорождённые: тлеющие трещины по пикселям детали без табарда и герба (как будет в GearLayers.end — client/src/game/ashborn.ts)
    if (n?.ash && rects.length > pre) {
      const cover = new Set<number>(), keyOf = (x: number, y: number) => y * 4096 + x, px: [number, number][] = [];
      for (const r of rects.slice(pre)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cover.add(keyOf(x, y));
      const seen = new Set<number>();
      for (const r of rects.slice(0, pre)) if (r.a >= 0.5) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const k = keyOf(x, y);
        if (!cover.has(k) && !seen.has(k)) { seen.add(k); px.push([x, y]); }
      }
      const g = rects[0].g, fx = ashCracks(px, String(slot), ASH_T, 7);
      for (const q of fx) g.fillStyle(parseInt(q.c.slice(1), 16), q.a).fillRect(q.x, q.y, q.w, q.h);
      GLOW.push(...fx.filter((q) => q.glow));
    }
    return res;
  };
  // щит: запомнить размер (как в GearLayers.shield) — для поля и герба
  const origShield = P.shield;
  P.shield = function (this: Record<string, unknown>, ...a: unknown[]) {
    const sm = a[9] as { look: { shape: string } } | undefined, o = a[0] as { r: number }, shp = sm?.look.shape ?? "";
    let w = 6 + Math.min(3, o.r), h = 8 + Math.min(4, o.r * 1.5);
    if (shp === "tower") { w = 8; h = 13; } else if (shp === "buckler") { w = 5; h = 5; } else if (shp === "round" || shp === "aegis") { w = 8; h = 8; } else if (shp === "spiked") { w = 7; h = 7; } else if (shp === "kite" || shp === "crystal") { w = 7; h = 12; } else if (sm) { w = 7; h = 10; }
    this.__shield = shp === "bone" ? null : { w, h };
    return origShield.apply(this, a);
  };
  // герб на знамени чемпиона: вместо солнца/черепа легендарки — малая эмблема утверждённого герба фракции
  const origCrest = P.crest;
  P.crest = function (this: unknown, kind: unknown, cxu: unknown, cyu: unknown, ...rest: unknown[]) {
    const cx = cxu as number, cy = cyu as number;
    if (CUR && CUR.fac !== "ember" && (kind === "sun" || kind === "skull")) { emblem(this, CUR.fac, false, cx - 2, cy - 2, true); return; }
    return origCrest.call(this, kind, cx, cy, ...rest);
  };
  // без анимации тем: статичный кадр, частиц нет (у NPC plus = 0 — контура заточки тоже нет)
  const origPrep = P.prepareFx;
  P.prepareFx = function (this: Record<string, unknown>, ...a: unknown[]) { origPrep.apply(this, a); this.themeOn = false; (this.parts as Map<string, number>).clear(); };
  // знамя чемпиона Сольгарда — ткань слоновой кости, как утверждённое знамя фракции (130)
  GL.LEGENDARIES.dawn_standard.look.flag = "#d8cba8";
}

// ---------------------------------------------------------------- наборы
interface Fig {
  title: string; cls: string; tabard: Tabard; cloakArms?: boolean;
  helm?: string; armor?: string; boots?: string; off?: string; cloak?: string; weapon?: string; r?: number;
}
/** Деталь строки снаряжения (формат Player.recalc): модель каталога или L:легендарка; редкость r. */
function piece(id: string | undefined, r = 0): string {
  if (!id) return "";
  if (id.startsWith("L:")) return `3:0:${id.slice(2)}::${id.slice(2).includes("standard") || id.includes("banner") ? "cloak" : ""}:`;
  const m = ITEM_MODELS[id];
  if (!m) throw new Error("нет модели " + id);
  return `${r}:0:::${m.cat}:${id}`;
}
function weaponStr(id: string | undefined, r = 0): string {
  if (!id) return "";
  const m = ITEM_MODELS[id];
  if (!m || BASE_ITEMS[m.cat].slot !== "weapon") throw new Error("нет оружия " + id);
  return `${m.cat}:${r}:0::${id}`;
}

const S_M = "warrior", S_R = "ranger", U_M = "deathknight", U_R = "darkranger";
type Rank = { name: string; sub: string; figs: [Fig, Fig, Fig, Fig] };

const SOLGARD: Rank[] = [
  { name: "СЛАБЫЕ", sub: "ОПОЛЧЕНИЕ, НОВОБРАНЦЫ", figs: [
    { title: "ОПОЛЧЕНЕЦ", cls: S_M, tabard: "narrow", helm: "leather_helm_1", armor: "leather_armor_30", boots: "leather_boots_1", weapon: "spear_6" },
    { title: "НОВОБРАНЕЦ", cls: S_M, tabard: "narrow", helm: "plate_helm_6", armor: "plate_armor_1", boots: "leather_boots_1", off: "shield_24", weapon: "sword_1" },
    { title: "ЛУЧНИК ОПОЛЧЕНИЯ", cls: S_R, tabard: "narrow", helm: "leather_helm_1", armor: "leather_armor_1", boots: "leather_boots_1", weapon: "bow_6" },
    { title: "АРБАЛЕТЧИК-НОВОБРАНЕЦ", cls: S_R, tabard: "narrow", helm: "leather_helm_37", armor: "leather_armor_18", boots: "leather_boots_1", weapon: "crossbow_6" },
  ] },
  { name: "СРЕДНИЕ", sub: "СТРАЖА, БОЙЦЫ (ГОРОДСКАЯ СТРАЖА - ПОЛНЫЙ ТЯЖЕЛЫЙ СЕТ)", figs: [
    { title: "СТРАЖ ОПЛОТА", cls: S_M, tabard: "wide", cloakArms: true, helm: "plate_helm_24", armor: "plate_armor_6", boots: "plate_boots_6", off: "shield_12", cloak: "cloak_str_12", weapon: "mace_18" },
    { title: "БОЕЦ С КОПЬЕМ", cls: S_M, tabard: "wide", helm: "plate_helm_6", armor: "plate_armor_24", boots: "plate_boots_24", off: "shield_24", weapon: "spear_24" },
    { title: "АРБАЛЕТЧИК СТРАЖИ", cls: S_R, tabard: "wide", cloakArms: true, helm: "plate_helm_24", armor: "plate_armor_44", boots: "plate_boots_6", cloak: "cloak_str_12", weapon: "crossbow_24" },
    { title: "ЕГЕРЬ", cls: S_R, tabard: "narrow", cloakArms: true, helm: "leather_helm_18", armor: "leather_armor_18", boots: "leather_boots_18", cloak: "cloak_agi_18", weapon: "bow_12" },
  ] },
  { name: "СИЛЬНЫЕ", sub: "ВЕТЕРАНЫ, РЫЦАРИ", figs: [
    { title: "РЫЦАРЬ-ПАЛАДИН", cls: S_M, tabard: "wide", cloakArms: true, helm: "plate_helm_68", armor: "plate_armor_24", boots: "plate_boots_44", off: "shield_76", cloak: "cloak_str_30", weapon: "sword_60" },
    { title: "ВЕТЕРАН С ДВУРУЧНИКОМ", cls: S_M, tabard: "wide", cloakArms: true, helm: "plate_helm_18", armor: "plate_armor_6", boots: "plate_boots_68", cloak: "cloak_str_52", weapon: "greatsword_30" },
    { title: "РЫЦАРЬ-АРБАЛЕТЧИК", cls: S_R, tabard: "wide", cloakArms: true, helm: "plate_helm_68", armor: "plate_armor_44", boots: "plate_boots_44", cloak: "cloak_str_30", weapon: "crossbow_68" },
    { title: "ЕГЕРЬ-ВЕТЕРАН", cls: S_R, tabard: "narrow", cloakArms: true, helm: "leather_helm_60", armor: "leather_armor_60", boots: "leather_boots_60", cloak: "cloak_agi_60", weapon: "bow_30" },
  ] },
  { name: "МЕГАСИЛЬНЫЕ", sub: "ЧЕМПИОНЫ, КАПИТАНЫ СТРАЖИ (ЛЕГЕНДАРНЫЕ ШЛЕМ И НАПЛЕЧНИКИ, ПЛАЩ-ЗНАМЯ)", figs: [
    { title: "КАПИТАН СТРАЖИ", cls: S_M, tabard: "wide", r: 3, helm: "L:last_guard_helm", armor: "L:last_wall_plate", boots: "plate_boots_92", off: "shield_100", cloak: "L:dawn_standard", weapon: "mace_84" },
    { title: "ЧЕМПИОН СОЛЬГАРДА", cls: S_M, tabard: "wide", cloakArms: true, r: 3, helm: "plate_helm_92", armor: "L:last_wall_plate", boots: "plate_boots_92", cloak: "cloak_str_100", weapon: "greatsword_100" },
    { title: "МЕТКИЙ ЧЕМПИОН", cls: S_R, tabard: "wide", r: 3, helm: "L:last_guard_helm", armor: "L:last_wall_plate", boots: "plate_boots_92", cloak: "L:dawn_standard", weapon: "crossbow_92" },
    { title: "КАПИТАН ЕГЕРЕЙ", cls: S_R, tabard: "narrow", cloakArms: true, r: 3, helm: "leather_helm_84", armor: "L:moon_scout_jacket", boots: "leather_boots_84", cloak: "cloak_agi_84", weapon: "bow_100" },
  ] },
];
const UMBRATH: Rank[] = [
  { name: "СЛАБЫЕ", sub: "ОПОЛЧЕНИЕ, НОВОБРАНЦЫ", figs: [
    { title: "ПОДНЯТЫЙ ОПОЛЧЕНЕЦ", cls: U_M, tabard: "narrow", helm: "leather_helm_6", armor: "leather_armor_6", boots: "leather_boots_6", weapon: "mace_6" },
    { title: "НОВОБРАНЕЦ", cls: U_M, tabard: "narrow", helm: "plate_helm_1", armor: "plate_armor_1", boots: "leather_boots_6", off: "shield_1", weapon: "sword_6" },
    { title: "ЛУЧНИК-МЕРТВЕЦ", cls: U_R, tabard: "narrow", helm: "leather_helm_24", armor: "leather_armor_24", boots: "leather_boots_24", weapon: "bow_1" },
    { title: "АРБАЛЕТЧИК-НОВОБРАНЕЦ", cls: U_R, tabard: "narrow", helm: "leather_helm_6", armor: "leather_armor_6", boots: "leather_boots_6", cloak: "cloak_agi_6", weapon: "crossbow_12" },
  ] },
  { name: "СРЕДНИЕ", sub: "СТРАЖА, БОЙЦЫ (ГОРОДСКАЯ СТРАЖА - ПОЛНЫЙ ТЯЖЕЛЫЙ СЕТ)", figs: [
    { title: "СТРАЖ МОРТХЕЙМА", cls: U_M, tabard: "wide", cloakArms: true, helm: "plate_helm_30", armor: "plate_armor_30", boots: "plate_boots_30", off: "shield_60", cloak: "cloak_str_37", weapon: "sword_24" },
    { title: "БОЕЦ С АЛЕБАРДОЙ", cls: U_M, tabard: "wide", helm: "plate_helm_12", armor: "plate_armor_12", boots: "plate_boots_12", weapon: "scythe_44" },
    { title: "АРБАЛЕТЧИК СТРАЖИ", cls: U_R, tabard: "wide", cloakArms: true, helm: "plate_helm_30", armor: "plate_armor_30", boots: "plate_boots_30", cloak: "cloak_str_37", weapon: "crossbow_30" },
    { title: "ТЕМНЫЙ ЛУЧНИК", cls: U_R, tabard: "narrow", cloakArms: true, helm: "leather_helm_44", armor: "leather_armor_44", boots: "leather_boots_44", cloak: "cloak_agi_68", weapon: "bow_18" },
  ] },
  { name: "СИЛЬНЫЕ", sub: "ВЕТЕРАНЫ, РЫЦАРИ", figs: [
    { title: "РЫЦАРЬ СМЕРТИ", cls: U_M, tabard: "wide", cloakArms: true, helm: "plate_helm_76", armor: "plate_armor_76", boots: "plate_boots_76", cloak: "cloak_str_60", weapon: "greatsword_60" },
    { title: "ВЕТЕРАН-ЩИТОНОСЕЦ", cls: U_M, tabard: "wide", cloakArms: true, helm: "plate_helm_52", armor: "plate_armor_52", boots: "plate_boots_52", off: "shield_84", cloak: "cloak_str_37", weapon: "mace_68" },
    { title: "РЫЦАРЬ-АРБАЛЕТЧИК", cls: U_R, tabard: "wide", cloakArms: true, helm: "plate_helm_52", armor: "plate_armor_76", boots: "plate_boots_52", cloak: "cloak_str_60", weapon: "crossbow_52" },
    { title: "ВЕТЕРАН-ЛУЧНИК", cls: U_R, tabard: "narrow", cloakArms: true, helm: "leather_helm_68", armor: "leather_armor_68", boots: "leather_boots_68", cloak: "cloak_agi_68", weapon: "bow_60" },
  ] },
  { name: "МЕГАСИЛЬНЫЕ", sub: "ЧЕМПИОНЫ, КАПИТАНЫ СТРАЖИ (ЛЕГЕНДАРНЫЕ ШЛЕМ И НАПЛЕЧНИКИ, ПЛАЩ-ЗНАМЯ)", figs: [
    { title: "КАПИТАН СТРАЖИ", cls: U_M, tabard: "wide", r: 3, helm: "L:bone_crown_helm", armor: "L:grave_bone_plate", boots: "plate_boots_100", cloak: "L:legion_banner", weapon: "scythe_68" },
    { title: "ЧЕМПИОН УМБРАТА", cls: U_M, tabard: "wide", cloakArms: true, r: 3, helm: "L:lich_crown", armor: "L:grave_bone_plate", boots: "plate_boots_100", off: "shield_60", cloak: "cloak_str_60", weapon: "sword_92" },
    { title: "МЕТКИЙ ЧЕМПИОН", cls: U_R, tabard: "wide", r: 3, helm: "plate_helm_100", armor: "L:grave_bone_plate", boots: "plate_boots_100", cloak: "L:legion_banner", weapon: "crossbow_100" },
    { title: "КАПИТАН ЛУЧНИКОВ", cls: U_R, tabard: "narrow", cloakArms: true, r: 3, helm: "leather_helm_92", armor: "leather_armor_92", boots: "leather_boots_92", cloak: "cloak_agi_92", weapon: "bow_84" },
  ] },
];
/** Эмберхолл — одно звание (вся «+10», решение 11): бронза, бирюза и угли; алебарды, круглые щиты, меховые и красные плащи.
 *  Сеты — data/ember-guard.json figs (оттуда же их возьмёт игра). */
const EMBER: Rank[] = [
  { name: "СТРАЖА ЭМБЕРХОЛЛА", sub: "НЕЙТРАЛЬНАЯ, ВСЯ +10 - НЕ ПОХОЖА НИ НА СОЛЬГАРД, НИ НА УМБРАТ", figs: EMBER_DATA.figs.map((f) => ({ ...f, tabard: f.tabard as Tabard })) as unknown as Rank["figs"] },
];
/** Герой для масштаба (обычная экипировка без геральдики). */
const HERO: Record<Fac, Fig> = {
  solgard: { title: "ГЕРОЙ (ВОИН)", cls: S_M, tabard: "none", r: 1, helm: "plate_helm_18", armor: "plate_armor_18", boots: "plate_boots_18", cloak: "cloak_str_24", weapon: "greatsword_24" },
  umbrath: { title: "ГЕРОЙ (РЫЦАРЬ СМЕРТИ)", cls: U_M, tabard: "none", r: 1, helm: "plate_helm_18", armor: "plate_armor_18", boots: "plate_boots_18", cloak: "cloak_str_24", weapon: "greatsword_24" },
  ember: { title: "ГЕРОЙ (ВОИН)", cls: S_M, tabard: "none", r: 1, helm: "plate_helm_18", armor: "plate_armor_18", boots: "plate_boots_18", cloak: "cloak_str_24", weapon: "greatsword_24" },
};

// ---------------------------------------------------------------- отрисовка
const CW = 40, CH = 50, FX = 4, FY = 16; // ячейка вида и место кадра 32×32 в ней
const bodies = new Map<string, PC>();
const body = (cls: string) => { let b = bodies.get(cls); if (!b) { b = readPng(path.join(ROOT, `client/public/assets/units/nude_${cls}.png`)); bodies.set(cls, b); } return b; };

/** Тело Пепельнорождённого: лист nude_<класс> → кожа и волосы в шлак и пепел (data/ember-guard.json body), глаза — тлеющие,
 *  тусклые жилы углей. Лист того же размера и раскладки — в игре подменяет nude_<класс> у стражи Эмберхолла. */
const ashBodies = new Map<string, PC>();
function ashBody(cls: string): PC {
  let b = ashBodies.get(cls);
  if (b) return b;
  const B = EMBER_DATA.body, src = body(cls).clone(), skin = new Map(Object.entries(B.skin).map(([k, v]) => [k, hex(v)]));
  const ash = B.ash.map((q) => hex(q)), OUTL = new Set(["1b1422", "2a1a24"]), EYE = "2a1a24";
  b = src.map((c) => {
    if (!c[3]) return c;
    const k = c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
    if (k === "1b1422") return c;
    if (k === EYE) return hex(B.eye);
    const m = skin.get("#" + k);
    if (m) return m;
    if (OUTL.has(k)) return c;
    const lum = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;               // волосы и прочее — по яркости в рампу пепла
    return ash[Math.max(0, Math.min(ash.length - 1, Math.round(lum * (ash.length - 1) * 1.15)))];
  });
  // жилы углей: по виду (строка листа), во всех кадрах строки — только там, где тело
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) for (const [i, [x, y]] of B.veins[row].entries()) {
    const X = col * 32 + x, Y = row * 32 + y + (col === 3 || col === 7 ? -1 : 0);
    const c = b.get(X, Y);
    if (c && c[3] && c.slice(0, 3).join() !== "27,20,34") b.set(X, Y, hex(B.vein[i % 2]));
  }
  ashBodies.set(cls, b);
  return b;
}

function figure(GL: GLMod, f: Fig, fac: Fac, view: number, ash?: { t: number }): PC {
  const out = new PC(CW, CH);
  // мягкая тень под ступнями
  for (let y = -2; y <= 2; y++) for (let x = -7; x <= 7; x++) { const d = (x * x) / 49 + (y * y) / 4; if (d <= 1) out.set(FX + 16 + x, FY + 30 + y, [10, 14, 8, Math.round(90 * (1 - d * 0.6))]); }
  const scene = { add: { graphics: () => new RecGraphics() } };
  const gl = new GL.GearLayers(scene);
  const fr = crop(ash ? ashBody(f.cls) : body(f.cls), 0, view * 32, 32, 32);
  CUR = f === HERO[fac] ? null : { fac, tabard: f.tabard, ash: !!ash };
  ASH_T = ash?.t ?? 0;
  GLOW = [];
  VIEW = view;
  (gl as Record<string, unknown>).__cloakArms = !!f.cloakArms;
  const r = f.r ?? 0, rl = (id?: string) => (id?.startsWith("L:") ? 3 : r);
  const gear = [piece(f.helm, rl(f.helm)), piece(f.armor, rl(f.armor)), piece(f.boots, rl(f.boots)), piece(f.off, rl(f.off)), piece(f.cloak, rl(f.cloak))].join("|");
  gl.draw({ cls: f.cls, faction: fac === "umbrath" ? "umbrath" : "solgard", gear, weapon: weaponStr(f.weapon, r), view, flip: false, col: 0, ox: FX, oy: FY, t: 0, seed: 7, self: false });
  CUR = null;
  const back = gl.back as RecGraphics, front = gl.front as RecGraphics;
  paint(out, back);
  out.blit(fr, FX, FY);
  paint(out, front);
  if (ash) {
    // глаза-угли и искры — кадровые координаты (в игре — через GearLayers.R, с flip и покачиванием шага)
    const fx = [...ashEyes(view, ash.t), ...ashEmbers(ash.t, 7)].map((q) => ({ ...q, x: q.x + FX, y: q.y + FY }));
    const g = new RecGraphics();
    for (const q of fx) g.fillStyle(parseInt(q.c.slice(1), 16), q.a).fillRect(q.x, q.y, q.w, q.h);
    paint(out, g);
    GLOW.push(...fx.filter((q) => q.glow));
  }
  return out;
}

/** Ночь: всё затемняется синим, светящиеся пиксели кадра (GLOW) — поверх, с мягким отсветом 2 px вокруг. */
function night(day: PC, glow: AshRect[], ox = 0, oy = 0): PC {
  const n = day.clone().map((c) => (c[3] ? [Math.round(c[0] * 0.3), Math.round(c[1] * 0.34), Math.round(c[2] * 0.52), c[3]] : c));
  const bloom = new Map<number, number>();
  for (const q of glow) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.hypot(dx, dy); if (d > 2.3) continue;
    const k = (q.y + oy + dy) * 65536 + q.x + ox + dx, v = q.a * (d < 1.2 ? 0.22 : 0.1);
    bloom.set(k, Math.min(0.4, (bloom.get(k) ?? 0) + v));
  }
  const H: RGBA = hex("#f06a1a");
  for (const [k, a] of bloom) {
    const x = k % 65536, y = Math.floor(k / 65536), c = n.get(x, y);
    if (!c) continue;
    n.set(x, y, c[3] ? [Math.round(c[0] + (H[0] - c[0]) * a), Math.round(c[1] + (H[1] - c[1]) * a), Math.round(c[2] + (H[2] - c[2]) * a), 255] : c);
  }
  for (const q of glow) {
    const c = hex(q.c), x = q.x + ox, y = q.y + oy, b = n.get(x, y);
    if (!b) continue;
    n.set(x, y, q.a >= 1 || !b[3] ? (q.a >= 1 ? c : b) : [Math.round(b[0] + (c[0] - b[0]) * q.a), Math.round(b[1] + (c[1] - b[1]) * q.a), Math.round(b[2] + (c[2] - b[2]) * q.a), 255]);
  }
  return n;
}


const COL = { title: hex("#f4ecd8"), dim: hex("#b8b0c4"), sol: hex("#e8b84a"), umb: hex("#b890ff"), emb: hex("#f0a050"), panel: hex("#24222a"), bg: hex("#18161c") };
const FCOL: Record<Fac, RGBA> = { solgard: COL.sol, umbrath: COL.umb, ember: COL.emb };
const VIEWS = [0, 2, 1]; // спереди, сбоку, сзади

/** Лист фракции: строки рангов; в строке — герой для масштаба и 4 фигуры (ближник 1/2, дальник 1/2), каждая спереди/сбоку/сзади на траве. */
function factionSheet(GL: GLMod, fac: Fac, ranks: Rank[], title: string): PC {
  const GW = CW * 3, GAP = 6, M = 6, HEAD = 12, CAP = 12, TITLE = 14, ROW = HEAD + CH + CAP;
  const W = M * 2 + 5 * GW + 4 * GAP, H = TITLE + ranks.length * ROW + M;
  const base = new PC(W, H);
  base.rect(0, 0, W, H, COL.bg);
  const labels: [string, number, number, RGBA, number][] = [[title, M, 3, FCOL[fac], 2]];
  ranks.forEach((rk, ri) => {
    const y0 = TITLE + ri * ROW;
    labels.push([`${rk.name} - ${rk.sub}`, M, y0 + 2, FCOL[fac], 2]);
    const figs: [Fig, string][] = [[HERO[fac], "ДЛЯ МАСШТАБА"], [rk.figs[0], "БЛИЖНИК, ВАРИАНТ 1"], [rk.figs[1], "БЛИЖНИК, ВАРИАНТ 2"], [rk.figs[2], "ДАЛЬНИК, ВАРИАНТ 1"], [rk.figs[3], "ДАЛЬНИК, ВАРИАНТ 2"]];
    figs.forEach(([f, role], gi) => {
      const x0 = M + gi * (GW + GAP), cy = y0 + HEAD;
      paintGround(base, x0, cy, GW, CH, "grass");
      VIEWS.forEach((v, k) => base.blit(figure(GL, f, fac, v), x0 + k * CW, cy));
      base.rect(x0, cy + CH, GW, CAP - 1, COL.panel);
      labels.push([f.title, x0 + 2, cy + CH + 1, gi === 0 ? COL.dim : COL.title, 1]);
      labels.push([role, x0 + 2, cy + CH + 6, COL.dim, 1]);
    });
  });
  const big = scaleNN(base, K);
  for (const [s, x, y, c, k] of labels) label(big, s, x * K, y * K, c, k === 2 ? 3 : 2);
  return big;
}

/** Общий лист: только вид спереди; столбцы — Сольгард и Умбрат (ближник 1/2, дальник 1/2), строки — ранги; внизу Эмберхолл. */
function overview(GL: GLMod): PC {
  const M = 6, LW = 52, GAP = 8, TITLE = 14, HEAD = 9, CAP = 7, ROW = CH + CAP + 2;
  const W = M * 2 + LW + 8 * CW + GAP, H = TITLE + HEAD + 4 * ROW + HEAD + 4 + ROW + M;
  const base = new PC(W, H);
  base.rect(0, 0, W, H, COL.bg);
  const labels: [string, number, number, RGBA, number][] = [["СЕТЫ СТРАЖИ И БОЙЦОВ ПО РАНГАМ - ВАРИАНТЫ НА ВЫБОР (ВИД СПЕРЕДИ)", M, 3, COL.title, 3]];
  const xs = (fi: number, j: number) => M + LW + fi * (4 * CW + GAP) + j * CW;
  labels.push(["СОЛЬГАРД - ПАЛАДИНЫ, «ВОСХОД НАД ОПЛОТОМ»", xs(0, 0), TITLE + 1, COL.sol, 2], ["УМБРАТ - ЛАТЫ НЕЖИТИ, «КОРОНА НАД ГРОБОМ»", xs(1, 0), TITLE + 1, COL.umb, 2]);
  const role = ["БЛИЖ. 1", "БЛИЖ. 2", "ДАЛЬН. 1", "ДАЛЬН. 2"];
  const row = (y: number, list: [Fac, Rank | undefined][], name: string, sub: string, col: RGBA) => {
    labels.push([name, M, y + 16, col, 2]);
    sub.split(", ").forEach((s, q) => labels.push([s, M, y + 24 + q * 6, COL.dim, 2]));
    list.forEach(([fac, rk], fi) => {
      if (!rk) return;
      paintGround(base, xs(fi, 0), y, 4 * CW, CH, "grass");
      rk.figs.forEach((f, j) => {
        base.blit(figure(GL, f, fac, 0), xs(fi, j), y);
        base.rect(xs(fi, j), y + CH, CW - 1, CAP, COL.panel);
        labels.push([role[j], xs(fi, j) + 2, y + CH + 1, COL.title, 2]);
      });
    });
  };
  for (let ri = 0; ri < 4; ri++) row(TITLE + HEAD + ri * ROW, [["solgard", SOLGARD[ri]], ["umbrath", UMBRATH[ri]]], SOLGARD[ri].name, SOLGARD[ri].sub.replace(/ \(.*\)/, ""), COL.title);
  const ye = TITLE + HEAD + 4 * ROW + 4;
  labels.push(["ЭМБЕРХОЛЛ - НЕЙТРАЛЬНАЯ СТРАЖА (ПРЕДЛОЖЕНИЕ ЭМБЛЕМЫ: ПЛАМЯ ОЧАГА НАД НАКОВАЛЬНЕЙ)", xs(0, 0), ye, COL.emb, 2]);
  row(ye + HEAD, [["ember", EMBER[0]]], "ЭМБЕРХОЛЛ", "ВСЯ +10", COL.emb);
  const big = scaleNN(base, K);
  for (const [s, x, y, c, k] of labels) label(big, s, x * K, y * K, c, k);
  return big;
}

/** Монтаж «утверждённый | Пепельнорождённые»: строки — 4 сета стражи; в строке днём (трава) и ночью — герой для масштаба,
 *  утверждённый вид и Пепельнорождённый, каждый спереди/сбоку/сзади; внизу — цикл 12 кадров (12 к/с) двух сетов спереди и сбоку,
 *  днём и ночью, и крупно ×2 кадр спереди. Выход: tools/out/npc-sets/ember-ashborn.png. */
function ashMontage(GL: GLMod): PC {
  const M = 6, TITLE = 22, HEAD = 10, CAP = 8, GAP = 6, GW = CW * 3, ROW = HEAD + CH + CAP;
  const figs = EMBER[0].figs;
  const FRAME_MS = 1000 / ASH_FPS, T0 = 4 * FRAME_MS;          // кадр показа листа — пик дыхания углей не обязателен
  const half = 3 * GW + 2 * GAP, W = M * 2 + 2 * half + 14, stripRows = 4, H = TITLE + figs.length * ROW + 14 + stripRows * (CH + 10) + M;
  const base = new PC(W, H);
  base.rect(0, 0, W, H, COL.bg);
  const labels: [string, number, number, RGBA, number][] = [
    ["СТРАЖА ЭМБЕРХОЛЛА: УТВЕРЖДЕНО / ПЕПЕЛЬНОРОЖДЕННЫЕ (УГЛИ В ТРЕЩИНАХ ЛАТ, ГЛАЗА-УГЛИ, ИСКРЫ И ПЕПЕЛ)", M, 3, COL.emb, 2],
    ["ДЕНЬ", M, 13, COL.title, 2], ["НОЧЬ (СВЕТЯЩЕЕСЯ - ПОВЕРХ ЗАТЕМНЕНИЯ)", M + half + 14, 13, COL.title, 2],
  ];
  /** Ячейка 3 вида на траве; ночью — затемнение и свечение. */
  const cell = (f: Fig, ash: boolean, nightOn: boolean, t: number) => {
    const c = new PC(GW, CH), glow: AshRect[] = [];
    paintGround(c, 0, 0, GW, CH, "grass");
    VIEWS.forEach((v, k) => {
      c.blit(figure(GL, f, "ember", v, ash ? { t } : undefined), k * CW, 0);
      glow.push(...GLOW.map((q) => ({ ...q, x: q.x + k * CW })));
    });
    return nightOn ? night(c, glow) : c;
  };
  figs.forEach((f, ri) => {
    const y0 = TITLE + ri * ROW;
    for (const nt of [false, true]) {
      const x0 = M + (nt ? half + 14 : 0);
      ([[HERO.ember, false, "ГЕРОЙ ДЛЯ МАСШТАБА"], [f, false, "УТВЕРЖДЕНО"], [f, true, "ПЕПЕЛЬНОРОЖДЕННЫЕ"]] as [Fig, boolean, string][]).forEach(([ff, ash, cap], gi) => {
        const x = x0 + gi * (GW + GAP);
        base.blit(cell(ff, ash, nt, T0), x, y0 + HEAD);
        base.rect(x, y0 + HEAD + CH, GW, CAP - 1, COL.panel);
        labels.push([cap + (gi ? " - " + f.title : ""), x + 2, y0 + HEAD + CH + 1, gi === 2 ? COL.emb : COL.title, 1]);
      });
    }
    labels.push([`${ri + 1}`, M - 5, y0 + HEAD + 2, COL.dim, 1]);
  });
  // цикл: 12 кадров, спереди и сбоку, двух сетов; день и ночь
  let y = TITLE + figs.length * ROW + 4;
  labels.push([`ЦИКЛ ${ASH_FRAMES} КАДРОВ, ${ASH_FPS} К/С: УГЛИ В ТРЕЩИНАХ И ГЛАЗАХ ПЛАВНО ДЫШАТ, ИСКРЫ ВЗЛЕТАЮТ С ПЛЕЧ, ЗАМЕДЛЯЮТСЯ И ОСТЫВАЮТ В ПЕПЕЛ`, M, y, COL.emb, 2]);
  y += 10;
  for (const [f, v, nt] of [[figs[0], 0, false], [figs[1], 2, false], [figs[0], 0, true], [figs[2], 0, true]] as [Fig, number, boolean][]) {
    for (let k = 0; k < ASH_FRAMES; k++) {
      const c = new PC(CW, CH);
      paintGround(c, 0, 0, CW, CH, "grass");
      c.blit(figure(GL, f, "ember", v, { t: k * FRAME_MS }), 0, 0);
      base.blit(nt ? night(c, GLOW) : c, M + k * (CW + 2), y);
      labels.push([String(k + 1), M + k * (CW + 2) + 2, y + 1, COL.dim, 1]);
    }
    y += CH + 10;
  }
  const big = scaleNN(base, K);
  for (const [s2, x, yy, c] of labels) label(big, s2, x * K, yy * K, c, 2);
  return big;
}

/** Листы для игры: тела nude_ashborn_<класс>.png (раскладка как nude_<класс>) — tools/out/npc-sets/ashborn/. */
function writeAshBodies() {
  const dir = path.join(OUT, "ashborn");
  fs.mkdirSync(dir, { recursive: true });
  for (const cls of [...new Set(EMBER_DATA.figs.map((f) => f.cls))]) ashBody(cls).save(path.join(dir, `nude_ashborn_${cls}.png`));
}

export { loadGearLayers, patch, figure, EMBER, HERO, type Fig, type GLMod };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const GL = await loadGearLayers();
  patch(GL);
  fs.mkdirSync(OUT, { recursive: true });
  factionSheet(GL, "solgard", SOLGARD, "СОЛЬГАРД - ПАЛАДИНЫ: ЛАТЫ, ТАБАРД И ЩИТ С ГЕРБОМ «ВОСХОД НАД ОПЛОТОМ», ПЛАЩ").save(path.join(OUT, "solgard.png"));
  factionSheet(GL, "umbrath", UMBRATH, "УМБРАТ - ЛАТЫ НЕЖИТИ С ГЕРБОМ «КОРОНА НАД ГРОБОМ»").save(path.join(OUT, "umbrath.png"));
  factionSheet(GL, "ember", EMBER, "ЭМБЕРХОЛЛ - НЕЙТРАЛЬНАЯ СТРАЖА: БРОНЗА, БИРЮЗА И УГЛИ ОЧАГА").save(path.join(OUT, "ember.png"));
  overview(GL).save(path.join(OUT, "overview.png"));
  ashMontage(GL).save(path.join(OUT, "ember-ashborn.png"));
  writeAshBodies();
  console.log(OUT);
}
