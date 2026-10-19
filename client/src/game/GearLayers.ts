/**
 * Слоёвая внешность героя по снаряжению: шлем, доспех (наплечники), плащ (слот cloak), сапоги и оружие рисуются
 * пиксельными слоями поверх спрайта класса. Вид зависит от типа, модели каталога (data/items.json -> look: форма, материал,
 * ткань, украшения), редкости своей детали (кайма и камень) и легендарной темы (data/legendaries.json -> look).
 * Эффекты по docs/gear-visuals.md: заточка — бирюзовый контур своей детали по ступеням +4/+7/+10 (двухпроходная отрисовка),
 * легендарка — тема в зоне своей вещи; не больше 2 источников частиц и 8 частиц на героя; чужим — по настройке gearFx.
 * Координаты слоёв — в системе кадра 32x32 (голова в (16,11), плечи на y=16, ступни на y=30).
 */
import Phaser from "phaser";
import { BASE_ITEMS, ITEM_MODELS, RARITY_COLORS, type ItemModel } from "../../../shared/items";
import { cellAt, PR, rimOf, weaponSprite, type WSprite } from "./GearModelSprites";
import { LEGENDARIES, type LegendaryDef } from "../../../shared/legendary";
import type { Slot } from "../../../shared/items";
import { enchantTier, ENCHANT_COLOR, GEAR_FX } from "../../../shared/gearFx";
import { gearFxMode } from "./overlay";
import { onGearFlash, setHiddenParticles, type HiddenReason } from "./gearHooks";

const ENCHANT = GEAR_FX.enchant, LIMITS = GEAR_FX.limits;
/** Заточка на герое — приглушённый тон (data/gear-fx.json heroColor), в интерфейсе остаётся яркий ENCHANT_COLOR. */
const HERO_ENCH: string = (ENCHANT as { heroColor?: string }).heroColor ?? ENCHANT_COLOR, HERO_CORE: string = (ENCHANT as { heroCore?: string }).heroCore ?? ENCHANT.core;
/** Пиксель кадра в ключ множества (координаты мира могут быть малыми и отрицательными у края). */
const PK = 1 << 17, OFF = 8192;
const KEY = (x: number, y: number) => (x + OFF) * PK + (y + OFF);
const KX = (k: number) => Math.floor(k / PK) - OFF, KY = (k: number) => (k % PK) - OFF;
type Rect = { g: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number; c: number; a: number };
/** Когда каждый герой рисовался последний раз: больше 15 героев в кадре — частицы чужих выключаются. */
const ACTIVE = new Map<object, number>();

const colCache = new Map<string, number>();
const C = (hex: string) => {
  let v = colCache.get(hex);
  if (v === undefined) { v = Phaser.Display.Color.HexStringToColor(hex).color; colCache.set(hex, v); }
  return v;
};
const dark = (hex: string, k: number) => {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const v = (x: number) => Math.min(255, Math.round(x * k));
  return Phaser.Display.Color.RGBToString(v(c.red), v(c.green), v(c.blue), 0, "#");
};
/** Полотнище знамени по умолчанию: алое у Сольгарда, пурпурное у Умбрата. */
const flagOf = (L: LegendaryDef) => (L.faction === "umbrath" ? "#4a1a6a" : "#a8242c");

/** Палитры фракций: Сольгард — светлый металл и золото, Умбрат — тёмный металл, кость и пурпур. */
const PAL = {
  solgard: { m: ["#4a5668", "#8a98ae", "#c8d4e4", "#ffffff"], gold: "#f0c040", gold2: "#a87818", cape: "#a02830", capeEdge: "#f0c040", eye: "#fff0b0", belt: "#a87818" },
  umbrath: { m: ["#14101c", "#2e2838", "#4e4660", "#8a7ea8"], gold: "#d8d0b8", gold2: "#a89c80", cape: "#4a1a6a", capeEdge: "#a050ff", eye: "#c070ff", belt: "#a89c80" },
};
const modelOf = (id: string | undefined): ItemModel | undefined => (id ? ITEM_MODELS[id] : undefined);
const armorTypeOf = (m: ItemModel) => BASE_ITEMS[m.cat]?.armorType;
/**
 * Цвета детали по модели: основной материал (латы — металл, кожа — шкура, ткань — ткань) в 4 тонах, ткань-акцент, кожа.
 * Кайма tr и камень st — по редкости своей детали (docs/gear-visuals.md 2.1): r0 — нейтральный металл и тусклый камень, r≥1 — цвет редкости.
 */
function piecePal(m: ItemModel, r: number) {
  const bt = armorTypeOf(m), lk = m.look, rim = rimOf(lk, r, m.fac);
  const main = bt === "leather" ? PR(lk.hide, "leather") : bt === "cloth" ? PR(lk.cloth, "purple") : PR(lk.mat, "steel");
  return { m: [main[0], main[1], main[2], main[4]], tr: rim.T, tr2: rim.TD, trb: rim.TB, st: rim.ST, std: rim.STD, hi: rim.hi, acc: PR(lk.cloth, "red"), hide: PR(lk.hide ?? (m.fac === "umbrath" ? "blackleather" : "leather"), "leather"), fx: PR(lk.fx ?? lk.gem, "sun"), bt, mat: PR(lk.mat, "steel") };
}
const SKIN: Record<string, string> = { deathknight: "#84988a", darkranger: "#84988a", bloodweaver: "#9a8290", warlock: "#d8d0b8", reaver: "#8a8288" };
const ROBES = new Set(["mage", "healer", "bloodweaver", "warlock"]);

export interface Piece { r: number; plus: number; leg: string; rag: boolean; base: string; model: string }
export function parseGear(gear: string): Piece[] {
  const parts = (gear || "").split("|");
  // старая строка без плаща: пятая деталь пуста; 6-я и 7-я (кольцо, амулет) приходят, только если одно из них легендарное
  while (parts.length < 7) parts.push("");
  return parts.map((s) => { const [r, p, l, g, bs, md] = s.split(":"); return s ? { r: Number(r || 0), plus: Number(p || 0), leg: l || "", rag: g === "1", base: bs || "", model: md || "" } : { r: -1, plus: 0, leg: "", rag: false, base: "", model: "" }; });
}

export interface GearInput {
  cls: string; faction: string; gear: string; weapon: string;
  view: number; flip: boolean; col: number; ox: number; oy: number; t: number; seed: number;
  /** id героя (подсветка детали из окна «Герой», пометки скрытых частиц) и свой ли это герой (эффекты видны всегда). */
  sid?: string; self?: boolean;
}

const MELEE = new Set(["sword", "axe", "dagger", "mace", "greatsword", "twinblades", "greataxe", "hammer", "spear", "scythe"]);
const WLEN: Record<string, number> = { dagger: 6, twinblades: 8, axe: 10, sword: 11, mace: 11, scepter: 10, greatsword: 15, greataxe: 13, hammer: 13, spear: 17, scythe: 16 };
const CURVED = new Set<string>(), WAVY = new Set<string>();

export class GearLayers {
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private flip = false;
  private ox = 0;
  private oy = 0;
  /** Сдвиг слоя корпуса при наклоне в атаке. */
  private sx = 0;
  private sy = 0;
  /** Прямоугольники текущей детали (двухпроходная отрисовка: контур заточки, затем деталь). */
  private cap: Rect[] | null = null;
  private sid = "";
  private t = 0;
  /** Центр героя в мире: вокруг него парят клинки, руны и сферы легендарок (look.orbit). */
  private hcx = 0;
  private hcy = 0;
  private enchantOn = true;
  private themeOn = true;
  /** Сколько частиц рисует источник в этом кадре (по слотам), и какие источники скрыты (для окна «Герой»). */
  private parts = new Map<Slot, number>();
  private hidden: Partial<Record<Slot, HiddenReason>> = {};
  private hiddenKey = "";
  private flash: { slot: Slot; ms: number; color: string; start?: number } | null = null;
  private unflash: () => void;

  constructor(scene: Phaser.Scene) {
    this.back = scene.add.graphics();
    this.front = scene.add.graphics();
    this.unflash = onGearFlash((sid, slot, ms, color) => { if (sid && sid === this.sid) this.flash = { slot, ms, color }; });
  }

  hide() { this.back.clear().setVisible(false); this.front.clear().setVisible(false); }

  private R(x: number, y: number, w: number, h: number, hex: string, a = 1) {
    const xx = x + this.sx, px = this.flip ? 32 - xx - w : xx;
    const X = Math.round(this.ox + px), Y = Math.round(this.oy + y + this.sy);
    if (this.cap) this.cap.push({ g: this.g, x: X, y: Y, w: Math.round(w), h: Math.round(h), c: C(hex), a });
    else this.g.fillStyle(C(hex), a).fillRect(X, Y, w, h);
  }
  private line(x0: number, y0: number, x1: number, y1: number, hex: string, w = 1, a = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.R(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w, hex, a);
  }
  /** Язычки пламени от точки (x,y) вверх. */
  private flame(x: number, y: number, n: number, h: number, c1: string, c2: string, t: number, ph = 0) {
    for (let i = 0; i < n; i++) {
      const hh = Math.max(2, Math.round(h * (0.6 + 0.4 * Math.sin(t / 85 + i * 2.1 + ph)) * (i === Math.floor(n / 2) ? 1.3 : 1)));
      const fx = x + (i - (n - 1) / 2) * 2;
      this.R(fx, y - hh, 2, hh, c1, 0.9);
      this.R(fx, y - hh + 1, 1, Math.max(1, hh - 2), c2, 0.95);
      if (hh > 4) this.R(fx, y - hh, 1, 1, "#ffffff");
    }
  }

  draw(i: GearInput) {
    const [h, a, b, o, cl, rg, amu] = parseGear(i.gear);
    const [wb, wrs, wps, wl, wmd] = (i.weapon || "").split(":");
    const am = a.leg ? undefined : modelOf(a.model), bm = b.leg ? undefined : modelOf(b.model), hm = h.leg ? undefined : modelOf(h.model);
    const wm = wl ? undefined : modelOf(wmd), om = o.leg ? undefined : modelOf(o.model), cm = cl.leg ? undefined : modelOf(cl.model);
    const wr = Number(wrs || 0), wplus = Number(wps || 0);
    this.back.clear().setVisible(true);
    this.front.clear().setVisible(true);
    this.flip = i.flip; this.ox = i.ox; this.oy = i.oy; this.sid = i.sid ?? "";
    const pal = i.faction === "umbrath" ? PAL.umbrath : PAL.solgard;
    const legOf = (id: string): LegendaryDef | undefined => (id ? LEGENDARIES[id] : undefined);
    // кайма — по редкости своей детали: легендарка оранжевая, r≥1 цвет редкости, r0 нейтральная (docs/gear-visuals.md 2.1)
    const trimOf = (p: Piece) => (p.leg ? RARITY_COLORS[3] : p.r >= 1 ? RARITY_COLORS[Math.min(3, p.r)] : "");
    const t = i.t;
    this.prepareFx(i, [
      { slot: "weapon", L: legOf(wl), plus: wb ? wplus : 0 },
      { slot: "offhand", L: legOf(o.leg), plus: o.r >= 0 ? o.plus : 0 },
      { slot: "helmet", L: legOf(h.leg), plus: h.r >= 0 ? h.plus : 0 },
      { slot: "armor", L: legOf(a.leg), plus: a.r >= 0 && !a.rag ? a.plus : 0 },
      { slot: "boots", L: legOf(b.leg), plus: b.r >= 0 && !b.rag ? b.plus : 0 },
      { slot: "cloak", L: legOf(cl.leg), plus: cl.r >= 0 ? cl.plus : 0 },
      // кольцо и амулет: только тема легендарки (заточка на герое не рисуется, docs/gear-visuals.md 2.2)
      { slot: "ring", L: legOf(rg.leg), plus: 0 },
      { slot: "amulet", L: legOf(amu.leg), plus: 0 },
    ]);
    this.hcx = i.ox + 16; this.hcy = i.oy + 18;
    // анимация тем легендарок: своему герою всегда, чужим — по настройке; иначе темы замирают (статичный кадр)
    const tt = this.themeOn ? t : 0;
    const bob = i.col < 4 ? [0, -1, 0, -1][i.col] : 0;
    const view = i.view, side = view === 2, up = view === 1;
    const cx = side ? 16.5 : 16;
    const robe = ROBES.has(i.cls);

    const skin = SKIN[i.cls] ?? "#d9956f";
    const walking = i.col < 4, atk = i.col >= 4 && i.col < 8 ? i.col - 4 : -1;
    const lean = atk === 1 || atk === 2 ? 1 : 0;
    const lx = side ? lean : 0, ly = view === 0 ? lean : up ? -lean : 0;
    const sw = walking ? [0, 1, 0, -1][i.col] : 0;
    const feet: [number, number][] = side ? [0, 1].map((k) => [Math.round(14.5 + (k ? 1 : -1) * ([0, 2.5, 0, -2.5][i.col] ?? 0)), k] as [number, number]) : [[12, 0], [16, 1]];
    const bareTorso = a.r < 0 || a.rag;
    this.sx = 0; this.sy = 0;

    // ---- плащ: отдельный слот cloak (доспех плащ не рисует); колышется, кайма по редкости, контур заточки ----
    // со спины плащ рисуется ПОСЛЕ доспеха и сапог (закрывает спину, но под шлемом); с остальных ракурсов — раньше, за телом
    const drawCloak = () => {
      if (cl.r < 0) return;
      const Lc = legOf(cl.leg);
      this.begin();
      this.sx = 0; this.sy = 0;
      // легендарный плащ: знамя (короткий плащ + штандарт), крылья (без плаща, если нет шлейфа), шлейф, цепи
      if (up && Lc?.look.back === "wings") { this.g = this.front; this.wings(Lc, view, bob, walking, tt, i.seed); }
      if (!Lc || Lc.look.back !== "wings" || Lc.look.train) this.cloak(cl, cm, pal, i, bob, walking, Lc);
      if (Lc) this.legendBack(Lc, i, bob, walking, tt, "cloak", up);
      this.end("cloak", cl.plus, Lc);
      this.g = this.front;
    };
    if (!up) drawCloak();

    this.g = this.front;
    // ---- тело без брони: голое, пах скрыт пикселизацией; лохмотья — рваная ткань ----
    if (bareTorso) {
      const x0 = side ? 13 : 11, w = side ? 7 : 10, y0 = 16 + bob;
      this.sx = lx; this.sy = ly;
      if (a.rag) {
        this.R(x0, y0, w, 7, "#6a5238"); this.R(x0 + 1, y0 + 2, 2, 2, "#4a3824"); this.R(x0 + w - 3, y0 + 4, 2, 2, "#8a6a48"); this.R(x0, y0 + 5, w, 1, "#3a2a1a");
        if (!up) this.R(x0 + 1, y0, 2, 5, "#8a6a48");
        for (let k = 0; k < w; k += 2) this.R(x0 + k, y0 + 7, 2, [2, 1, 3, 1, 2][(k / 2) | 0] ?? 1, "#6a5238");
      }
      this.sx = 0; this.sy = 0;
      if (a.rag) { this.R(14, 23, 4, 4, "#5a4630"); this.R(15, 26, 2, 1, "#3a2a1a"); this.R(14, 23, 4, 1, "#3a2a1a"); }
      else {
        // цензурная пикселизация: шахматка 3x3 из ярких и тёмных тонов кожи с тёмной рамкой
        const bx = side ? 14 : 13, light = dark(skin, 1.0), mid = dark(skin, 0.7), deep = dark(skin, 0.4);
        this.R(bx - 1, 21, 8, 8, deep);
        for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) this.R(bx + q * 2, 22 + r * 2, 2, 2, (r + q) % 2 ? mid : (r + q) % 4 === 0 ? "#f4e4cc" : light);
      }
    }
    // ---- сапоги ----
    if (b.r >= 0 && b.rag) {
      for (const [fx] of feet) { const w = side ? 5 : 4; this.R(fx, 27, w, 3, "#5a4630"); this.R(fx, 28, w, 1, "#3a2a1a"); this.R(fx, 26, w - 1, 1, "#8a6a48"); }
    } else if (b.r >= 0) {
      const L = legOf(b.leg), bp = bm ? piecePal(bm, b.r) : null, tr = bp ? bp.tr : trimOf(b), m = bp ? bp.m : pal.m;
      const bRobe = bp ? bp.bt === "cloth" : robe, lf = L?.look.form ?? "", tall = !!bm && ["high", "greave", "cuff", "fur", "boot", "winged", "silk"].includes(bm.look.shape) || ["high", "winged", "wrapped", "sabaton"].includes(lf);
      const top = bRobe ? 28 : tall ? 25 : 26;
      this.begin();
      for (const [fx, k] of feet) {
        const w = side ? 5 : 4;
        this.R(fx, top, w, 30 - top, k ? m[2] : m[1]);
        this.R(fx, 29, w, 1, m[0]);
        if (!bRobe) this.R(fx, top, w, 1, tr || m[3]);
        if (b.r >= 2 && !bRobe && !bm && !L) this.R(fx + (side ? 4 : (k ? 3 : 0)), top - 1, 1, 2, tr); // шпора эпика — цвет редкости
        if (bm) {
          const sh = bm.look.shape;
          if (sh === "fur" || sh === "cuff") this.R(fx - (side ? 0 : 1), top, w + (side ? 0 : 1), 1, sh === "fur" ? "#e8e2d0" : m[3]);
          if (sh === "sandal") { this.R(fx, top + 1, w, 1, bp!.hide[1]); this.R(fx + 1, top, 1, 3, bp!.hide[2]); }
          if (sh === "spiked" || bm.look.deco === "spikes" || bm.look.deco === "horns") this.R(fx + (side ? 4 : k ? 3 : 0), top - 1, 1, 1, m[3]);
          if (sh === "winged" || bm.look.deco === "wings") { this.line(fx - 1, top, fx - 3, top - 3, "#dce2ec", 1); this.R(fx - 2, top - 1, 1, 1, "#ffffff"); }
          if (sh === "curled" || sh === "sabaton") this.R(fx + (side ? 5 : k ? 4 : -1), 29, 1, 1, m[3]);
          if (sh === "wrapped" || sh === "wrap" || sh === "high") this.R(fx, top + 1, w, 1, bp!.hide[0]);
          if (bp!.hi && !bRobe) this.R(fx + (k ? w - 1 : 0), top + 1, 1, 1, bp!.st);
        }
        if (L) {
          // вид легендарных сапог — поле look.boots: крылья у щиколоток или пламя у ступней
          if (L.look.boots === "wings") { const wv = Math.round(Math.sin(tt / 150 + k * 2)), e2 = Math.round(L.ti / 2); this.line(fx - 1, top, fx - 4 - e2, top - 4 - e2 + wv, L.look.c2, 1); this.line(fx - 1, top + 1, fx - 5 - e2, top - 1 - e2 + wv, L.tint, 1); }
          else if (L.look.boots === "flame") this.flame(fx + 2, 30, 2, 3 + Math.round(L.ti / 2) + Math.min(3, b.plus / 3), L.tint, L.look.c2, tt, k);
          else if (L.look.boots === "rune") { const lit = this.themeOn && Math.floor(tt / 400 + k) % 2 === 0; this.R(fx, top + 2, w, 1, L.look.c2, lit ? 1 : 0.6); this.R(fx + 1, top + 3, 1, 1, L.tint); }
          if (lf === "wrapped") { this.R(fx, top + 1, w, 1, dark(L.tint, 0.5)); this.R(fx, top + 3, w, 1, dark(L.tint, 0.5)); }
          if (lf === "curled") this.R(fx + (side ? 5 : k ? 4 : -1), 28, 1, 2, L.look.c2);
          if (lf === "sabaton" || lf === "winged") this.R(fx + (side ? 4 : k ? 3 : 0), top - 1, 1, 1, L.look.c2);
        }
      }
      this.end("boots", b.plus, L);
    }
    // ---- доспех: нагрудник, наплечники, табард ----
    if (a.r >= 0 && !a.rag) {
      const L = legOf(a.leg), ap = am ? piecePal(am, a.r) : null, tr = ap ? ap.tr : trimOf(a), m = ap ? ap.m : pal.m;
      const aRobe = ap ? ap.bt === "cloth" : robe, gold = ap ? ap.trb : pal.gold, gold2 = ap ? ap.tr2 : pal.gold2, belt = ap ? ap.hide[2] : pal.belt;
      const epic = tr || gold; // силуэтные детали эпика без модели — цвет редкости, не фракционное золото
      const x0 = side ? 13 : 11, w = side ? 7 : 10, y0 = 16 + bob;
      this.sx = lx; this.sy = ly;
      this.begin();
      this.R(x0, y0, w, 8, m[1]);
      this.R(x0, y0, w, 2, m[2]);
      this.R(x0, y0 + 6, w, 2, m[0]);
      if (aRobe) { this.R(x0 - 1, y0 + 8, w + 2, 4, m[0]); this.R(x0 - 1, 28 + bob, w + 2, 1, tr || gold2); }
      this.R(x0, y0 + 6, w, 1, belt);
      if (!side) this.R(15, y0 + 6, 2, 1, gold);
      if (am && ap) this.armorModel(am, ap, x0, w, y0, up, side, walking, t, i.seed);
      else if (tr) { this.R(x0, y0, w, 1, tr); if (!side) this.R(15, y0 + 1, 2, 5, tr, 0.9); }
      if (a.r >= 2 && !up && !am && !L) { this.R(15, y0 + 3, 2, 2, epic); this.R(14, y0 + 4, 4, 1, epic); }
      // табард: у моделей — архетип «латы с табардом», без модели — эпик (цвет редкости) или легендарка; статичный
      if ((am ? am.look.shape === "tabard" : a.r >= 2) && !up && !side) {
        const n2 = L ? 7 : 4, col = L ? L.tint : ap ? ap.acc[2] : epic;
        for (let k = 0; k < n2; k++) this.R(14 + (L ? Math.round(Math.sin(tt / 230 + k * 0.7 + i.seed) * 0.9 * (k / n2) * (walking ? 2 : 1)) : 0), y0 + 8 + k, 4, 1, k === n2 - 1 ? (L ? L.look.c2 : dark(col, 0.6)) : k % 3 ? col : dark(col, 0.8));
      }
      if (L) {
        const pulse = this.themeOn ? 0.65 + 0.35 * Math.sin(t / 240 + i.seed) : 0.85;
        if (!up) { this.R(15, y0 + 2, 2, 3, L.look.c2, pulse); this.R(14, y0 + 3, 4, 1, L.tint, pulse); }
        this.R(x0, y0 + 2, 1, 4, L.tint, 0.8); this.R(x0 + w - 1, y0 + 2, 1, 4, L.tint, 0.8);
      }
      // наплечники: покачиваются при ходьбе
      const plateModel = ap?.bt === "plate", leatherModel = ap?.bt === "leather", battle = am?.look.shape === "battle";
      if ((am ? plateModel || leatherModel || battle : a.r >= 1 || !!L)) {
        const sh = side ? [15.5] : [8.5, 20.5];
        sh.forEach((sx, k) => {
          const s = side ? 1 : k ? 1 : -1;
          const px = Math.round(sx), y = 14 + bob + (side ? 0 : k ? sw : -sw);
          const big = am ? plateModel && ["plate", "full", "tabard", "bone"].includes(am.look.shape) || !!am.look.deco && plateModel : a.r >= 2 || !!L;
          if (am && (leatherModel || battle)) {
            const sh2 = am.look.shape;
            if (sh2 === "pelt") { this.R(px - 1, y + 1, 5, 3, "#c8c0ae"); this.R(px, y + 1, 3, 1, "#e8e2d2"); }
            else if (battle) { this.R(px, y + 1, 3, 3, ap!.mat[2]); this.R(px, y + 1, 3, 1, ap!.mat[4]); }
            else { this.R(px, y + 2, 3, 2, m[2]); this.R(px, y + 2, 3, 1, ap!.hide[3]); }
            return;
          }
          this.R(px, y + 1, 3 + (big ? 1 : 0), 3 + (big ? 1 : 0), m[2]);
          this.R(px, y + 1, 3 + (big ? 1 : 0), 1, am ? m[3] : tr || gold);
          this.R(px, y + 3 + (big ? 1 : 0), 3 + (big ? 1 : 0), 1, am ? tr : m[0]);
          const md = am?.look.deco;
          if (!L && am && md) {
            if (md === "spikes") { this.line(px + 1, y + 1, px + 1 + s * 2, y - 3, m[3], 1); this.line(px + 2, y + 1, px + 2 + s, y - 2, m[3], 1); }
            else if (md === "horns") { this.line(px + 1, y + 1, px + 1 + s * 3, y - 2, "#cfc8b8", 2); this.R(px + 1 + s * 3, y - 4, 1, 2, "#f1ecdf"); }
            else if (md === "wings") { for (let q = 0; q < 3; q++) this.line(px + 1, y + 1, px + 1 + s * (3 + q), y - 4 + q * 2, q % 2 ? "#dce2ec" : "#ffffff", 1); }
            else if (md === "skull") { this.R(px + 1, y + 1, 2, 2, "#e8e0d0"); this.R(px + 1, y + 2, 1, 1, "#141018"); }
          } else if (a.r >= 2 && !L && !am) {
            // заклёпки и шипы эпика — цвет редкости
            if (i.faction === "umbrath") this.line(px + 1, y + 1, px + 1 + s * 2, y - 3, epic, 1);
            else this.R(px + (s > 0 ? 2 : -1), y, 2, 2, epic);
          }
          if (L) {
            const lk = L.look, cxs = px + 2;
            if (lk.pauld === "flame") this.flame(cxs, y + 1, 3 + (L.ti >= 3 ? 1 : 0), 5 + L.ti + Math.min(4, a.plus / 2), L.tint, lk.c2, tt, k * 1.7);
            else if (lk.pauld === "frost") {
              // ледяные наплечники: три кристалла веером, длина растёт с ярусом, искра-блик бегает по граням
              const ice = ["#8ea4d8", "#d0dcff", "#ffffff"], hgt = 4 + L.ti;
              this.R(px - 1, y + 1, 5, 2, ice[1]); this.R(px - 1, y + 1, 5, 1, ice[2]);
              [[0, hgt], [s * 2, hgt - 1], [-s * 2, hgt - 2]].forEach(([ox, hh], q) => {
                this.line(cxs + ox * 0.5, y + 1, cxs + ox, y + 1 - hh, ice[0], 2);
                this.line(cxs + ox * 0.5, y, cxs + ox, y + 1 - hh, q ? ice[1] : lk.c2, 1);
              });
              if (this.themeOn && Math.floor(tt / 160 + k * 3) % 6 === 0) this.R(cxs, y + 1 - hgt, 1, 1, "#ffffff");
            }
            else if (lk.pauld === "spikes") { this.line(cxs, y + 1, cxs + s * 5, y - 6, L.tint, 2); this.line(cxs + s, y, cxs + s * 5, y - 6, lk.c2, 1); }
            else if (lk.pauld === "bolts") {
              if (!this.themeOn || ((Math.floor(t / 90) + k * 3) % 4) !== 0) {
                let bx = cxs, by = y;
                const sd = Math.floor(tt / 90) * 7 + k * 13 + i.seed;
                for (let j = 0; j < 4; j++) { const nx = bx + ((sd * (j + 3)) % 5) - 2, ny = by - 3; this.line(bx, by, nx, ny, j % 2 ? lk.c2 : L.tint, 1); bx = nx; by = ny; }
              }
            } else {
              const fy = Math.round(Math.sin(tt / 300 + k * 2) * 2);
              this.R(cxs - 1 + s * 2, y - 5 + fy, 3, 1, lk.c2); this.R(cxs + s * 2, y - 6 + fy, 1, 3, L.tint); this.R(cxs - 1 + s * 2, y - 4 + fy, 3, 1, L.tint);
            }
          }
        });
      }
      // крылья и призрачные цепи легендарного доспеха (зона доспеха: плечи и спина)
      if (L && (L.look.back === "wings" || L.look.chains)) { this.sx = 0; this.sy = 0; this.legendBack(L, i, bob, walking, tt, "armor"); this.sx = lx; this.sy = ly; }
      this.end("armor", a.plus, L);
    }
    if (up) drawCloak();
    // ---- шлем ----
    this.sx = lx; this.sy = ly;
    if (h.r >= 0) {
      this.begin();
      if (!h.leg && hm) this.helmetModel(hm, h.r, pal, cx, view, bob, t, i.seed);
      else this.helmet(h, legOf(h.leg), trimOf(h), pal, cx, view, bob, tt, i.seed);
      this.end("helmet", h.plus, legOf(h.leg));
    }
    this.sx = 0; this.sy = 0;
    // ---- легендарные кольцо и амулет: подвеска на груди, блик у руки; вокруг героя — их тема (look.orbit) ----
    for (const [p, slot] of [[amu, "amulet"], [rg, "ring"]] as const) {
      const L = legOf(p.leg);
      if (p.r < 0 || !L) continue;
      this.begin();
      this.g = this.front;
      this.jewel(L, slot, view, bob, i.col, tt);
      this.end(slot, 0, L);
    }
    // ---- вторая рука: щит, сфера/книга или второй клинок ----
    if (o.r >= 0) {
      const lo = legOf(o.leg);
      this.begin();
      if (o.base === "shield") this.shield(o, lo, trimOf(o), pal, i, bob, lx, ly, sw, om);
      else if (o.base === "orb" || o.base === "tome") this.focus(o, om, pal, i, bob, lo);
      else this.weapon(o.base, o.r, lo, pal, { ...i, weapon: "" }, bob, o.plus, true, om);
      this.end("offhand", o.plus, lo);
    }
    // ---- оружие: модель рисуется всегда, без модели — с редкого, у легендарки или при заточке +4 (контуру нужна форма) ----
    if (wb && (wr >= 1 || legOf(wl) || wm || wplus >= 4)) {
      this.begin();
      this.weapon(wb, wr, legOf(wl), pal, i, bob, wplus, false, wm);
      if (wb === "twinblades" && o.r < 0) this.weapon(wb, wr, legOf(wl), pal, { ...i, weapon: "" }, bob, wplus, true, wm);
      this.end("weapon", wplus, legOf(wl));
    }
    this.flushHidden();
  }

  // ---------------- эффекты снаряжения: контур заточки, темы легендарок, лимит шума (docs/gear-visuals.md 2.2–2.4) ----------------
  /** Решает для кадра: видны ли бирюза и темы (своему — всегда, чужим — по настройке) и какие источники частиц показать. */
  private prepareFx(i: GearInput, pieces: { slot: Slot; L?: LegendaryDef; plus: number }[]) {
    ACTIVE.set(this, i.t);
    let crowd = 0;
    for (const [k, at] of ACTIVE) { if (i.t - at < 400) crowd++; else if (i.t - at > 5000) ACTIVE.delete(k); }
    const mode = i.self ? "all" : gearFxMode();
    this.enchantOn = mode === "all";
    this.themeOn = mode !== "off";
    this.t = i.t;
    this.parts.clear();
    this.hidden = {};
    // приоритет источников: оружие, вторая рука, затем легендарки (шлем, доспех, сапоги), затем вещи +10 в том же порядке
    const order = [...pieces.slice(0, 2).filter((p) => p.L || p.plus >= 10), ...pieces.slice(2).filter((p) => p.L), ...pieces.slice(2).filter((p) => !p.L && p.plus >= 10)];
    let sources = 0, budget = LIMITS.particles;
    for (const p of order) {
      const allowed = p.L ? this.themeOn : this.enchantOn;
      if (!allowed) { this.hidden[p.slot] = "setting"; continue; }
      if ((!i.self && crowd > LIMITS.heroes) || sources >= LIMITS.sources || budget <= 0) { this.hidden[p.slot] = "limit"; continue; }
      const lp = LIMITS.legendParticles, want = p.L ? (p.plus >= 10 ? lp.plus10 : p.plus >= 7 ? lp.plus7 : lp.base) : 2;
      const n = Math.min(want, budget);
      this.parts.set(p.slot, n); budget -= n; sources++;
    }
  }
  private flushHidden() {
    if (!this.sid) return;
    const key = JSON.stringify(this.hidden);
    if (key !== this.hiddenKey) { this.hiddenKey = key; setHiddenParticles(this.sid, Object.keys(this.hidden).length ? this.hidden : null); }
  }
  /** Начать деталь: прямоугольники копятся, чтобы сначала нарисовать контур заточки, потом саму деталь. */
  private begin() { this.cap = []; }
  /** Закончить деталь: контур/ореол заточки по ступени, сама деталь, бегущая точка, частицы источника. */
  private end(slot: Slot, plus: number, L?: LegendaryDef) {
    const rects = this.cap ?? [];
    this.cap = null;
    if (!rects.length) return;
    const g = rects[0].g, t = this.t;
    // силуэт детали: пиксели непрозрачных прямоугольников
    const px = new Set<number>();
    for (const r of rects) if (r.a >= 0.5) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) px.add(KEY(x, y));
    const tier = enchantTier(plus);
    const fl = this.flash && this.flash.slot === slot ? this.flash : null;
    if (fl) { fl.start ??= t; if (t - fl.start > fl.ms) this.flash = null; }
    const flashOn = !!(this.flash && fl);
    if (px.size && (flashOn || (this.enchantOn && tier > 0))) {
      const T = ENCHANT.tiers[tier] as { outlineAlpha?: number; outlineAlphaMin?: number; outlineAlphaMax?: number; pulseMs?: number; haloAlpha?: number; haloExpand?: number };
      const ring = this.ring1(px);
      if (!flashOn && tier >= 3) {
        const halo = new Set<number>();
        const ex = T.haloExpand ?? 2;
        for (const k of px) { const x = KX(k), y = KY(k); for (let dy = -ex; dy <= ex; dy++) for (let dx = -ex; dx <= ex; dx++) { const q = KEY(x + dx, y + dy); if (!px.has(q) && !ring.has(q)) halo.add(q); } }
        g.fillStyle(C(HERO_ENCH), T.haloAlpha ?? 0.25);
        for (const k of halo) g.fillRect(KX(k), KY(k), 1, 1);
      }
      const alpha = flashOn ? 1 : tier === 2 ? (T.outlineAlphaMin ?? 0.7) + ((T.outlineAlphaMax ?? 1) - (T.outlineAlphaMin ?? 0.7)) * (0.5 + 0.5 * Math.sin((t / (T.pulseMs ?? 1600)) * Math.PI * 2)) : T.outlineAlpha ?? 1;
      g.fillStyle(C(flashOn ? this.flash!.color : HERO_ENCH), alpha);
      for (const k of ring) g.fillRect(KX(k), KY(k), 1, 1);
      // +4…+6: раз в 2 с по контуру пробегает точка 2 px (бирюза с белым ядром)
      if (!flashOn && tier === 1) {
        const per = (ENCHANT.tiers[1] as { dotPeriodMs?: number }).dotPeriodMs ?? 2000, ph = ((t + this.seedOf(slot) * 97) % per) / per;
        if (ph < 0.45) {
          const path = this.ringPath(ring), k = path[Math.floor((ph / 0.45) * path.length) % path.length];
          if (k !== undefined) { const x = KX(k), y = KY(k); g.fillStyle(C(HERO_ENCH), 1).fillRect(x - 1, y - 1, 2, 2); g.fillStyle(C(HERO_CORE), 1).fillRect(x, y, 1, 1); }
        }
      }
    }
    for (const r of rects) r.g.fillStyle(r.c, r.a).fillRect(r.x, r.y, r.w, r.h);
    const n = this.parts.get(slot) ?? 0;
    if (n && px.size) this.particles(g, px, n, L, slot);
  }
  /** Внешний контур силуэта шириной 1 px. */
  private ring1(px: Set<number>) {
    const ring = new Set<number>();
    for (const k of px) for (const d of [PK, -PK, 1, -1]) if (!px.has(k + d)) ring.add(k + d);
    return ring;
  }
  /** Контур по кругу (сортировка по углу от центра) — путь бегущей точки. */
  private ringPath(ring: Set<number>) {
    let sx = 0, sy = 0;
    for (const k of ring) { sx += KX(k); sy += KY(k); }
    const cx = sx / ring.size, cy = sy / ring.size;
    return [...ring].sort((a, b) => Math.atan2(KY(a) - cy, KX(a) - cx) - Math.atan2(KY(b) - cy, KX(b) - cx));
  }
  private seedOf(slot: Slot) { let h = 7; for (let k = 0; k < slot.length; k++) h = (h * 31 + slot.charCodeAt(k)) % 997; return h; }
  /** Частицы источника в зоне своей вещи: тема легендарки (её цвета и движение) или бирюза +10, поднимающаяся от детали. */
  private particles(g: Phaser.GameObjects.Graphics, px: Set<number>, n: number, L: LegendaryDef | undefined, slot: Slot) {
    const t = this.t, arr = [...px];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of arr) { const x = KX(k), y = KY(k); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, seed = this.seedOf(slot);
    for (let k = 0; k < n; k++) {
      const ph = (t / 1200 + k / n + seed * 0.013) % 1, cyc = Math.floor(t / 1200 + k / n + seed * 0.013);
      const from = arr[(cyc * 7919 + k * 104729 + seed) % arr.length], fx = KX(from), fy = KY(from);
      let x = fx, y = fy - ph * 7, c = HERO_ENCH, a = 1 - ph, w = 1;
      if (L?.look.orbit) { this.orbiter(g, L, k, n); continue; }
      if (L) {
        const lk = L.look;
        c = ph < 0.5 ? L.tint : lk.c2;
        switch (lk.fx) {
          case "feather": y = y0 - 2 + ph * (y1 - y0 + 8); x = cx + Math.sin(ph * 5 + k * 2) * ((x1 - x0) / 2 + 2); c = k % 2 ? "#ffffff" : lk.c2; a = Math.min(1, (1 - ph) * 1.6); if (ph < 0.85) g.fillStyle(C(c), a).fillRect(Math.round(x) + 1, Math.round(y), 1, 1); break;
          case "ember": x += Math.sin(ph * 9 + k) * 1.5; w = ph < 0.4 ? 2 : 1; break;
          case "spark": x = fx; y = fy; a = ((Math.floor(t / 70) + k) % 5 === 0) ? 1 : 0; c = lk.c2; break;
          case "drip": y = fy + ph * 6; c = L.tint; break;
          case "snow": y = y0 - 4 + ph * (y1 - y0 + 6); x = cx + Math.sin(ph * 6 + k) * (x1 - x0 + 2) / 2; c = "#ffffff"; break;
          case "leaf": case "orbit": { const ang = t / 800 + (k * Math.PI * 2) / n; x = cx + Math.cos(ang) * ((x1 - x0) / 2 + 3); y = cy + Math.sin(ang) * ((y1 - y0) / 4 + 2); a = Math.sin(ang) > 0 ? 1 : 0.5; w = lk.fx === "leaf" ? 2 : 1; break; }
          default: x += Math.sin(ph * 7 + k) * 2; c = lk.c2; a *= 0.85; w = ph < 0.3 ? 2 : 1;
        }
      }
      if (a > 0.02) { g.fillStyle(C(c), Math.max(0, Math.min(1, a))).fillRect(Math.round(x), Math.round(y), w, w); if (!L && ph < 0.5) g.fillStyle(C(HERO_CORE), a).fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
  }

  /**
   * Парящий вокруг героя предмет темы (look.orbit): blades — клинок остриём вверх, runes — руна 2×2, motes — сфера с ореолом.
   * Эллипс вокруг центра героя; за спиной (верхняя половина орбиты) — полупрозрачно. Число — частицы источника (лимит шума).
   */
  private orbiter(g: Phaser.GameObjects.Graphics, L: LegendaryDef, k: number, n: number) {
    const t = this.themeOn ? this.t : 0, lk = L.look, ang = t / 900 + (k * Math.PI * 2) / n;
    const x = Math.round(this.hcx + Math.cos(ang) * (11 + L.ti)), y = Math.round(this.hcy - 3 + Math.sin(ang) * 4 + Math.sin(t / 300 + k) * 1.2);
    const a = Math.sin(ang) > 0 ? 1 : 0.45, P = (dx: number, dy: number, w: number, h: number, c: string, al = a) => g.fillStyle(C(c), al).fillRect(x + dx, y + dy, w, h);
    if (lk.orbit === "blades") { P(0, -3, 1, 4, lk.c2); P(0, -3, 1, 1, "#ffffff"); P(-1, 1, 3, 1, L.tint); P(0, 2, 1, 1, dark(L.tint, 0.6)); }
    else if (lk.orbit === "runes") { const r = (k + Math.floor(t / 1500)) % 3; P(-2, -2, 5, 5, L.tint, 0.18 * a); P(-1, -1, 3, 1, L.tint); P(-1, 1, 3, 1, L.tint); P(r === 0 ? -1 : 1, 0, 1, 1, lk.c2); P(0, r === 2 ? -1 : 0, 1, 2, lk.c2); }
    else { P(-2, -2, 5, 5, L.tint, 0.22 * a); P(-1, -1, 3, 3, L.tint); P(-1, -1, 1, 1, lk.c2); P(0, 0, 1, 1, "#ffffff", 0.8 * a); }
  }

  /** Плащ за спиной. Вид — архетип модели (look.shape): short, long, crest, fur, hood, shroud, feather, wings; ткань — look.cloth, кайма — по редкости. */
  private cloak(c: Piece, m: ItemModel | undefined, pal: typeof PAL.solgard, i: GearInput, bob: number, walking: boolean, L?: LegendaryDef) {
    const view = i.view, side = view === 2, up = view === 1, t = i.t;
    const cp = m ? PR(m.look.cloth, "red") : null;
    // легендарный плащ: ткань — полотнище знамени (look.flag) или цвет темы, кайма оранжевая
    const lc = L ? L.look.flag ?? (L.look.back === "banner" ? flagOf(L) : dark(L.tint, 0.75)) : "";
    const body = L ? lc : cp ? cp[1] : pal.cape, mid = L ? dark(lc, 1.18) : cp ? cp[2] : pal.cape, dk = dark(body, 0.65), lt = L ? L.look.c2 : cp ? cp[3] : pal.cape;
    const edge = c.leg ? RARITY_COLORS[3] : m ? rimOf(m.look, c.r, m.fac).T : pal.capeEdge;
    const shape = L ? (L.look.back === "banner" ? "short" : "long") : m?.look.shape ?? "long", umb = m ? m.fac === "umbrath" : i.faction === "umbrath";
    // шлейф: плащ длиннее ступней и стелется за героем, длина растёт с ярусом
    const train = L?.look.train ? 5 + L.ti * 2 : 0;
    const len = train ? 12 - bob : ({ short: 8, long: 12, crest: 12, fur: 11, hood: 12, shroud: 13, feather: 12, wings: 12 } as Record<string, number>)[shape] ?? 11;
    const lenUp = up ? Math.min(len, 9) : len;
    const amp = walking ? 2 : 1, fl = Math.round(Math.sin(t / 200 + i.seed) * amp);
    const tail = (k: number) => Math.round(Math.sin(t / 170 + k * 1.3 + i.seed) * amp * 0.8);
    const fur = "#e8e2d2", y0 = 16 + bob;
    this.g = up ? this.front : this.back;
    const hem = (x: number, w: number, y: number, k: number) => {
      if (shape === "shroud") this.R(x, y, w, [1, 2, 1, 3][k % 4], dk);
      else if (shape === "feather") this.R(x, y, w, 2, k % 2 ? lt : mid);
      else if (shape === "fur") this.R(x, y, w, 1, fur);
      else this.R(x, y, w, 1, edge);
    };
    if (up) {
      this.R(10, y0, 12, lenUp, body); this.R(10, y0, 2, lenUp, dk); this.R(20, y0, 2, lenUp, dk); this.R(15, y0 + 1, 2, lenUp - 1, mid, 0.5);
      for (let k = 0; k < 3; k++) hem(10 + k * 4 + fl, 4, y0 + lenUp + tail(k), k);
      if (shape === "shroud") { this.R(13, y0 + 4, 2, 2, "#141018"); this.R(18, y0 + 8, 2, 2, "#141018"); }
      if (shape === "fur") this.R(9, y0 - 1, 14, 3, fur);
      else this.R(11, y0, 10, 1, edge);
      if (shape === "hood") this.R(12, y0 - 3, 8, 3, dk);
      if (shape === "crest") { this.R(13, y0 + 3, 6, 7, edge); this.R(14, y0 + 4, 4, 5, umb ? "#141018" : mid); if (umb) this.R(15, y0 + 5, 2, 2, "#e8e0d0"); else { this.R(15, y0 + 4, 2, 5, edge); this.R(14, y0 + 6, 4, 1, edge); } }
      if (shape === "feather") for (let k = 0; k < lenUp; k += 2) { this.R(11 + (k % 4), y0 + k, 3, 1, lt); this.R(17 - (k % 4), y0 + k + 1, 3, 1, lt); }
      if (shape === "wings") for (const sd of [-1, 1]) for (let q = 0; q < 4; q++) { const wx = sd < 0 ? 9 - q * 2 : 22 + q * 2, wy = y0 - 2 + q * 2 + Math.round(Math.sin(t / 220 + i.seed + q) * (walking ? 1 : 0.5)); this.R(wx, wy, 2, 5, q % 2 ? lt : mid); this.R(wx, wy, 2, 1, edge); }
    } else if (side) {
      for (let k = 0; k < len; k += 3) this.R(8 + Math.round(fl * (k / len) * 1.5) - (walking ? 1 : 0), y0 + k, 5, 3, k % 2 ? body : mid);
      hem(8 + fl * 2, 5, y0 + len, 0);
      if (shape === "fur") this.R(10, y0 - 1, 5, 2, fur);
      if (shape === "hood") this.R(11, y0 - 2, 4, 3, dk);
      if (shape === "wings") for (let q = 0; q < 3; q++) { this.R(7 - q, y0 - 3 + q * 2 + (walking ? fl : 0), 3, 4, q % 2 ? lt : mid); this.R(7 - q, y0 - 3 + q * 2 + (walking ? fl : 0), 1, 4, edge); }
    } else {
      for (const x of [8, 22]) {
        const sd = x < 16 ? -1 : 1;
        for (let k = 0; k < len - 1; k += 3) this.R(x + Math.round(fl * (k / len)) * sd, y0 + 1 + k, 2, 3, k % 2 ? mid : body);
        hem(x + fl * sd, 2, y0 + len, x);
        if (shape === "fur") this.R(x - (sd < 0 ? 1 : 0), y0 - 1, 3, 2, fur);
        if (shape === "wings") for (let q = 0; q < 3; q++) { this.R(x + sd * (1 + q) - (sd < 0 ? 1 : 0), y0 - 3 - q + (walking ? fl : 0), 2, 4, q % 2 ? lt : mid); this.R(x + sd * (1 + q) - (sd < 0 ? 1 : 0), y0 - 3 - q + (walking ? fl : 0), 2, 1, edge); }
        if (shape === "crest" && sd > 0) this.R(23, y0 + 3, 1, 3, edge);
      }
    }
    if (!train) return;
    // шлейф: сзади (вид со спины) стекает к камере и расширяется, сбоку стелется по земле назад, спереди расходится у ступней
    const wv = (k: number) => Math.sin(t / 210 + k * 0.6 + i.seed) * (walking ? 1.4 : 0.7);
    if (up) {
      // со спины шлейф не выступает ниже ступней: подол плаща заканчивается на уровне лодыжек (см. lenUp)
      this.R(10 + Math.round(wv(0)), y0 + lenUp, 12, 1, edge);
    } else if (side) {
      // сбоку шлейф короткий и без волны: за спиной до лодыжек, не по земле
      const ts = Math.min(train, 3);
      for (let k = 0; k < ts; k++) this.R(7 - k + (walking ? -1 : 0), 25 + Math.round(wv(k) * 0.3), 2, 4, k % 2 ? body : mid);
      this.R(7 - ts + (walking ? -1 : 0), 26, 1, 3, edge);
    } else {
      for (const sd of [-1, 1]) for (let k = 0; k < 3 + L!.ti; k++) this.R(sd < 0 ? 8 - k : 23 + k, 28 + Math.round(wv(k + sd) * 0.5), 1, 2, k % 2 ? mid : body);
      this.R(6 - L!.ti, 30, 21 + L!.ti * 2, 1, edge, 0.9);
    }
  }

  /**
   * Легендарная тема за спиной и на плечах (look.back, look.chains): знамя-штандарт, крылья (перья, кости, пламя), призрачные цепи.
   * Рисуется в зоне своей вещи: плащ — спина; доспех — крылья из лопаток и цепи с плеч. Размер растёт с ярусом.
   */
  private legendBack(L: LegendaryDef, i: GearInput, bob: number, walking: boolean, tt: number, from: "cloak" | "armor", wingsDone = false) {
    const lk = L.look, view = i.view, up = view === 1;
    if (from === "cloak" && lk.back === "banner") this.banner(L, i, bob, walking, tt);
    if (lk.back === "wings" && !wingsDone) { this.g = up ? this.front : this.back; this.wings(L, view, bob, walking, tt, i.seed); }
    if (lk.chains) { this.g = from === "cloak" && !up ? this.back : this.front; this.chains(L, view, bob, walking, tt, i.seed, from); }
    this.g = this.front;
  }

  /** Знамя-штандарт: древко над плечом, перекладина, полотнище с гербом колышется (сильнее при ходьбе); с яруса 85 кисти и крупное навершие. */
  private banner(L: LegendaryDef, i: GearInput, bob: number, walking: boolean, tt: number) {
    const lk = L.look, ti = L.ti, view = i.view, up = view === 1, side = view === 2;
    const umb = L.faction === "umbrath", flag = lk.flag ?? flagOf(L);
    const pole = umb ? ["#1c1822", "#3a3446"] : ["#5a3a1e", "#8a5a2a"], metal = umb ? "#d8d0b8" : "#f0c040";
    const top = -4 - ti * 2 + bob, fw = 7 + (ti >= 2 ? 1 : 0) + (ti >= 4 ? 1 : 0), fh = 8 + ti;
    // древко: спереди — за правым плечом, со спины — за левым (зеркально), сбоку — за спиной с наклоном назад
    const px = side ? 10 : up ? 10 : 21, dir = side || up ? 1 : -1; // куда от древка висит полотнище
    const lean = side ? -1 : 0;
    this.g = up ? this.front : this.back;
    this.line(px, 26 + bob, px + lean, top + 1, pole[0], 2);
    this.line(px, 26 + bob, px + lean, top + 1, pole[1], 1);
    if (up) this.line(px + 1, 17 + bob, 21, 24 + bob, "#3a2a1a", 1); // ремень поперёк спины
    const bx = px + lean, fx0 = side ? bx - fw : dir > 0 ? bx + 1 : bx - fw;
    // навершие: копьё Сольгарда или череп Умбрата, с 85 — крупнее
    if (umb) { const s = ti >= 3 ? 3 : 2; this.R(bx - 1, top - s, s, s, "#e8e0d0"); this.R(bx - 1, top - s + 1, 1, 1, "#141018"); if (s === 3) this.R(bx + 1, top - 2, 1, 1, "#141018"); }
    else { this.R(bx, top - 2 - (ti >= 3 ? 2 : 0), 1, 2 + (ti >= 3 ? 2 : 0), metal); this.R(bx - 1, top - 1, 3, 1, metal); }
    // перекладина
    this.R(Math.min(fx0, bx) - (side ? 1 : 0), top + 1, fw + 2, 1, metal);
    // полотнище: колонки колышутся, свободный край сильнее; низ — ласточкин хвост
    const amp = (walking ? 1.4 : 0.6) * (side ? 1.5 : 1);
    for (let q = 0; q < fw; q++) {
      const far = side ? fw - 1 - q : dir > 0 ? q : fw - 1 - q; // 0 — у древка
      const off = Math.round(Math.sin(tt / 170 - far * 0.7 + i.seed) * amp * (far / fw)), x = fx0 + q + (side ? Math.round(-far * 0.15 * (walking ? 1 : 0)) : 0);
      const notch = Math.abs(q - (fw - 1) / 2) < 1.2 ? 2 : 0, hgt = fh - notch;
      this.R(x, top + 2 + off, 1, hgt, q % 2 ? flag : dark(flag, 0.88));
      this.R(x, top + 2 + off + hgt, 1, 1, RARITY_COLORS[3]); // кайма — цвет редкости
      if (q === 0 || q === fw - 1) this.R(x, top + 2 + off, 1, hgt, dark(flag, 0.7));
    }
    // герб в середине полотнища (движется вместе с ним)
    const mid = Math.floor(fw / 2), cOff = Math.round(Math.sin(tt / 170 - mid * 0.7 + i.seed) * amp * 0.5);
    this.crest(lk.crest ?? (umb ? "skull" : "sun"), fx0 + mid, top + 2 + Math.floor(fh / 2) - 1 + cOff, L.tint, lk.c2);
    // кисти на концах перекладины (ярус 85+)
    if (ti >= 3) for (const x of [Math.min(fx0, bx) - (side ? 1 : 0), Math.min(fx0, bx) + fw + 1 - (side ? 1 : 0)]) { const sw = Math.round(Math.sin(tt / 200 + x) * (walking ? 1 : 0.5)); this.R(x + sw, top + 2, 1, 3, lk.c2); this.R(x + sw, top + 5, 1, 1, L.tint); }
    this.g = this.front;
  }

  /** Герб 5×5 с центром (cx, cy): солнце, череп, звезда, луна, роза, древо, клык, око, пламя. */
  private crest(kind: string, cx: number, cy: number, c1: string, c2: string) {
    const R = (x: number, y: number, w = 1, h = 1, c = c1) => this.R(cx + x, cy + y, w, h, c);
    switch (kind) {
      case "skull": R(-1, -2, 3, 2, "#e8e0d0"); R(-2, -1, 5, 2, "#e8e0d0"); R(-1, -1, 1, 1, "#141018"); R(1, -1, 1, 1, "#141018"); R(-1, 1, 3, 1, "#e8e0d0"); R(0, 2, 1, 1, "#e8e0d0"); R(-1, -1, 1, 1, c1); break;
      case "star": R(0, -2, 1, 5); R(-2, 0, 5, 1); R(-1, -1, 3, 3); R(0, 0, 1, 1, c2); break;
      case "moon": R(-1, -2, 2, 1); R(-2, -1, 1, 3); R(-1, 2, 2, 1); R(-1, -1, 1, 3, c2); break;
      case "rose": R(-1, -2, 3, 3); R(0, -1, 1, 1, c2); R(0, 1, 1, 2, "#5fa040"); R(-1, 2, 1, 1, "#5fa040"); break;
      case "tree": R(-2, -2, 5, 2); R(-1, -2, 3, 1, c2); R(0, 0, 1, 3, "#8a5a2a"); R(-1, 2, 3, 1, "#8a5a2a"); break;
      case "fang": R(-2, -2, 5, 1); R(-2, -1, 2, 2, "#e8e0d0"); R(1, -1, 2, 2, "#e8e0d0"); R(-1, 1, 1, 1, "#e8e0d0"); R(1, 1, 1, 1, "#e8e0d0"); break;
      case "eye": R(-2, 0, 5, 1); R(-1, -1, 3, 3); R(0, 0, 1, 1, "#141018"); R(-1, -1, 1, 1, c2); break;
      case "crown": { const w = "#e8e0d0"; R(-2, -2, 1, 2, w); R(0, -2, 1, 2, w); R(2, -2, 1, 2, w); R(-2, 0, 5, 2, w); R(-1, 1, 1, 1, c2); R(1, 1, 1, 1, c2); break; }
      case "raven": { const w = "#e8e0d0"; R(0, -2, 3, 1, w); R(-2, -1, 5, 2, w); R(-1, 1, 3, 1, w); R(1, -1, 1, 1, "#141018"); R(-2, 2, 1, 1, w); R(0, 2, 1, 1, w); break; }
      case "flame": R(0, -2, 1, 1, c2); R(-1, -1, 2, 2); R(0, -1, 1, 2, c2); R(-1, 1, 3, 1); R(-2, 0, 1, 2); R(2, 0, 1, 2); break;
      default: R(-1, -1, 3, 3); R(0, -3 + 1, 1, 1); R(0, 2, 1, 1); R(-2, 0, 1, 1); R(2, 0, 1, 1); R(-2, -2, 1, 1, c2); R(2, -2, 1, 1, c2); R(-2, 2, 1, 1, c2); R(2, 2, 1, 1, c2); R(0, 0, 1, 1, c2);
    }
  }

  /**
   * Крылья из лопаток: feather — перья (белые с краем темы), bone — костяные спицы с полупрозрачной перепонкой,
   * flame — языки пламени. Размах и число перьев растут с ярусом; машут медленно, при ходьбе сильнее.
   */
  private wings(L: LegendaryDef, view: number, bob: number, walking: boolean, tt: number, seed: number) {
    const lk = L.look, ti = L.ti, kind = lk.wings ?? "feather", side = view === 2;
    const span = 10 + ti * 2, nf = 4 + ti, flap = Math.sin(tt / 260 + seed) * (walking ? 0.22 : 0.1);
    const bone = "#e8e0d0", boneD = "#a89c80";
    const sides = side ? [[-1, 0.75, 1], [-1, 0.55, 0.55]] : [[-1, 1, 1], [1, 1, 1]];
    for (const [s, sx, alpha] of sides) {
      const rx = side ? 12 : 16 + s * 2, ry = 15 + bob + (side && alpha < 1 ? -1 : 0);
      const tips: [number, number][] = [];
      for (let j = 0; j < nf; j++) {
        const f = j / (nf - 1), ang = (1.25 - f * 1.35) + flap * (1 - f * 0.5), l = span * (1 - 0.3 * Math.abs(f - 0.25)) * (kind === "flame" ? 0.85 + 0.15 * Math.sin(tt / 90 + j * 1.7) : 1);
        tips.push([rx + s * Math.cos(ang) * l * sx, ry - Math.sin(ang) * l * 0.95]);
      }
      if (kind === "bone") {
        // перепонка между спицами, затем кости: плечевая (к верхнему концу) и «пальцы» от локтя
        const ex = rx + (tips[0][0] - rx) * 0.45, ey = ry + (tips[0][1] - ry) * 0.45;
        for (let j = 1; j < nf; j++) for (let q = 1; q < 4; q++) {
          const a = q / 4, x = tips[j - 1][0] * (1 - a) + tips[j][0] * a, y = tips[j - 1][1] * (1 - a) + tips[j][1] * a;
          this.line(ex, ey, x, y, dark(L.tint, 0.45), 1, 0.4 * alpha);
        }
        this.line(rx, ry, ex, ey, boneD, 2, alpha); this.line(ex, ey, tips[0][0], tips[0][1], bone, 1, alpha);
        for (let j = 1; j < nf; j++) this.line(ex, ey, tips[j][0], tips[j][1], j % 2 ? bone : boneD, 1, alpha);
        this.R(Math.round(tips[0][0]), Math.round(tips[0][1]) - 1, 1, 2, lk.c2, alpha); // коготь на сгибе
      } else {
        for (let j = nf - 1; j >= 0; j--) {
          const [x, y] = tips[j], mx = rx + (x - rx) * 0.6, my = ry + (y - ry) * 0.6;
          if (kind === "flame") {
            this.line(rx, ry, mx, my, L.tint, 2, 0.9 * alpha);
            this.line(mx, my, x, y, lk.c2, 1, 0.95 * alpha);
            if (this.themeOn && (Math.floor(tt / 80) + j) % 4 === 0) this.R(Math.round(x), Math.round(y), 1, 1, "#ffffff", alpha);
          } else {
            this.line(rx, ry, mx, my, j % 2 ? "#dce2ec" : lk.c2, 2, alpha);
            this.line(mx, my, x, y, j % 2 ? lk.c2 : "#ffffff", 1, alpha);
            this.R(Math.round(x), Math.round(y), 1, 1, L.tint, alpha); // кончик пера — цвет темы
          }
        }
      }
      this.R(rx - 1, ry - 1, 2, 2, kind === "bone" ? boneD : L.tint, alpha);
    }
  }

  /** Призрачные цепи: звенья через пиксель от плеч к поясу и свисающий конец, полупрозрачные, качаются. */
  private chains(L: LegendaryDef, view: number, bob: number, walking: boolean, tt: number, seed: number, from: "cloak" | "armor") {
    const side = view === 2, y0 = 16 + bob, sway = Math.sin(tt / 240 + seed) * (walking ? 1.5 : 0.7);
    const ends: [number, number, number, number][] = from === "armor"
      ? (side ? [[14, y0, 18, y0 + 7]] : [[11, y0, 20, y0 + 7], [20, y0, 11, y0 + 7]])
      : (side ? [[11, y0, 9, y0 + 12]] : [[8, y0, 7, y0 + 12], [23, y0, 24, y0 + 12]]);
    ends.forEach(([x0, ya, x1, yb], k) => {
      const n2 = 10;
      for (let q = 0; q <= n2; q++) {
        const f = q / n2, sag = Math.sin(f * Math.PI) * (from === "armor" ? 2 : 1), x = x0 + (x1 - x0) * f + sway * f * (from === "cloak" ? 1 : 0.3), y = ya + (yb - ya) * f + sag;
        this.R(Math.round(x), Math.round(y), q % 2 ? 1 : 2, q % 2 ? 2 : 1, q % 3 ? L.look.c2 : L.tint, 0.55);
      }
      // свисающий конец с оборванным звеном
      const hx = x1 + Math.round(sway * (k ? -1 : 1)), hy = yb + 1;
      for (let q = 0; q < 3 + L.ti; q++) this.R(hx + (q % 2), hy + q, 1, 1, q % 3 ? L.look.c2 : L.tint, 0.5);
    });
  }

  /** Легендарные кольцо и амулет на герое: подвеска на груди / блик на руке (зона частиц для темы look.orbit). */
  private jewel(L: LegendaryDef, slot: "ring" | "amulet", view: number, bob: number, col: number, tt: number) {
    const up = view === 1, side = view === 2;
    if (slot === "amulet") {
      if (up) { this.R(13, 15 + bob, 6, 1, dark(L.tint, 0.6)); return; } // со спины виден только шнурок
      const x = side ? 18 : 15, y = 17 + bob;
      this.R(x - 1, y - 1, 1, 1, "#a89c80"); this.R(x + 2, y - 1, 1, 1, "#a89c80");
      this.R(x, y, 2, 2, L.tint); this.R(x, y, 1, 1, L.look.c2);
      if (this.themeOn) this.R(x - 1, y - 1, 4, 4, L.tint, 0.2 + 0.12 * Math.sin(tt / 300));
    } else {
      const sw = col < 4 ? [0, 1, 0, -1][col] : 0, x = side ? 18 + sw : up ? 9 : 22, y = 22 + bob;
      this.R(x, y, 1, 1, L.tint); if (this.themeOn && Math.floor(tt / 200) % 5 === 0) this.R(x, y - 1, 1, 1, "#ffffff");
    }
  }
  private helmet(h: Piece, L: LegendaryDef | undefined, tr: string, pal: typeof PAL.solgard, cx: number, view: number, bob: number, t: number, seed: number) {
    const m = pal.m, up = view === 1, side = view === 2, y = bob;
    const metal = L ? [dark(L.tint, 0.4), dark(L.tint, 0.7), L.tint, L.look.c2] : m;
    const x0 = side ? 9 : 10, w = side ? 12 : 12;
    // купол
    this.R(side ? 11 : 12, 4 + y, side ? 9 : 8, 1, metal[2]);
    this.R(x0 + 1, 5 + y, w - 2, 1, metal[2]);
    this.R(x0, 6 + y, w, 3, metal[1]);
    this.R(x0, 6 + y, 2, 3, metal[0]);
    this.R(x0, 9 + y, w, 1, metal[0]);
    if (up) this.R(x0, 9 + y, w, 4, metal[1]);
    if (!up) {
      // нащёчники и шлемный гребень
      if (side) this.R(19, 9 + y, 3, 4, metal[1]); else { this.R(10, 9 + y, 2, 4, metal[1]); this.R(20, 9 + y, 2, 4, metal[1]); }
      if (h.r >= 1 && !side) this.R(15, 6 + y, 2, 5, metal[3]);
      // прорезь забрала: у Умбрат и легендарных — горящие глаза
      const eye = L ? L.look.c2 : pal.eye;
      if (L || cx === 16 && pal === PAL.umbrath) { this.R(side ? 17 : 12, 10 + y, side ? 4 : 8, 2, "#0c0a10"); if (side) this.R(19, 10 + y, 2, 1, eye); else { this.R(13, 10 + y, 2, 1, eye); this.R(17, 10 + y, 2, 1, eye); } }
      // светящиеся глаза (look.eyes): белое ядро, ореол цвета c2, сбоку — светящийся след назад
      if (L?.look.eyes) {
        const gl = this.themeOn ? 0.3 + 0.15 * Math.sin(t / 260 + seed) : 0.35;
        for (const ex of side ? [19] : [13, 17]) { this.R(ex - 1, 9 + y, 4, 3, L.look.c2, gl); this.R(ex, 10 + y, 1, 1, "#ffffff"); }
        if (side) for (let q = 1; q <= 2 + L.ti; q++) this.R(19 - q - 1, 10 + y, 1, 1, L.look.c2, 0.5 / q);
      }
    }
    if (tr) this.R(x0, 8 + y, w, 1, tr);
    if (h.r === 2 && !L) {
      // эпический гребень (перья Сольгарда или костяные шипы Умбрата) — цвет редкости, без анимации
      if (pal === PAL.umbrath) { for (const s of [-1, 1]) { this.line(cx + s * 4, 5 + y, cx + s * 6, 0 + y, tr, 1); this.R(cx + s * 6 - 1, -1 + y, 1, 1, tr); if (side) break; } }
      else { this.line(cx, 4 + y, cx - (side ? 3 : 0), -2 + y, tr, 2); this.line(cx + 1, 4 + y, cx - (side ? 2 : -1), -1 + y, dark(tr, 0.7), 1); }
    }
    if (!L) return;
    const lk = L.look, pw = 1 + h.plus / 6;
    const fm = lk.form;
    if (fm === "cowl" || fm === "hood") { this.R(x0 - 1, 5 + y, w + 2, 2, metal[1]); this.R(x0 - 1, 7 + y, 2, 6, metal[0]); if (!side) this.R(x0 + w - 1, 7 + y, 2, 6, metal[0]); this.R(cx - 1, 3 + y, 2, 1, metal[2]); this.R(cx, 2 + y, 1, 1, metal[2]); }
    else if (fm === "mask") { this.R(x0, 12 + y, w, 3, metal[1]); this.R(x0 + 2, 13 + y, w - 4, 1, "#0c0a10"); this.R(cx - 1, 11 + y, 2, 1, lk.c2); }
    else if (fm === "armet" || fm === "great") { this.R(cx - 1, 4 + y, 2, 8, metal[3]); this.R(x0, 7 + y, w, 1, metal[3]); this.R(x0 + 1, 3 + y, w - 2, 1, metal[2]); }
    else if (fm === "plumed") { for (let q = 0; q < 6; q++) this.R(cx - 1 + Math.round(Math.sin(t / 300 + q) * (q > 2 ? 1 : 0)) - (side ? q : 0), 3 + y - q, 2, 1, q % 2 ? lk.c2 : L.tint); }
    else if (fm === "diadem" || fm === "horncrown") { this.R(x0 + 1, 5 + y, w - 2, 1, lk.c2); this.R(cx - 1, 3 + y, 2, 2, lk.c2); this.R(cx, 3 + y, 1, 1, "#ffffff"); if (fm === "horncrown") for (const s of side ? [-1] : [-1, 1]) this.line(cx + s * 5, 5 + y, cx + s * 7, 0 + y, lk.c2, 1); }
    if (lk.helm === "horns") {
      for (const s of side ? [-1] : [-1, 1]) {
        const pts: [number, number][] = [[cx + s * 5, 5], [cx + s * 7, 2], [cx + s * 10, -1], [cx + s * 10, -5], [cx + s * 8, -8]];
        for (let k = 0; k < pts.length - 1; k++) this.line(pts[k][0], pts[k][1] + y, pts[k + 1][0], pts[k + 1][1] + y, k > 2 ? lk.c2 : L.tint, 3 - Math.min(2, k));
      }
      if (side) this.line(cx + 2, 4 + y, cx + 5, -4 + y, L.tint, 2);
    } else if (lk.helm === "flame") {
      this.flame(cx, 5 + y, 5, 7 + pw * 2, L.tint, lk.c2, t, seed);
      this.R(cx - 5, 3 + y, 10, 2, metal[3]);
    } else if (lk.helm === "crown") {
      // корона: золото Сольгарда или металл темы Умбрата; зубцы выше с каждым ярусом, с 85 — камень в центральном зубце
      const gold = L.faction === "umbrath" ? L.tint : "#f0c040", eh = L.ti;
      this.R(cx - 6, 3 + y, 12, 2, gold);
      for (let k = 0; k < 5; k++) { const sx = cx - 6 + k * 2.5, hh = k % 2 ? 2 : 4 + eh - (k === 0 || k === 4 ? Math.ceil(eh / 2) : 0); this.R(sx, 3 + y - hh, 2, hh, gold); this.R(sx, 3 + y - hh, 2, 1, k % 2 ? "#ffffff" : lk.c2); }
      if (L.ti >= 3) { this.R(cx - 1, -1 - eh + y + 2, 2, 2, L.look.c2); this.R(cx - 1, -1 - eh + y + 2, 1, 1, "#ffffff"); }
      this.R(cx - 1, 3 + y, 2, 1, lk.c2);
    } else if (lk.helm === "wings") {
      for (const s of side ? [-1] : [-1, 1]) for (let k = 0; k < 4; k++) this.line(cx + s * 5, 7 + y - k, cx + s * (9 + k * 2), 4 + y - k * 3 - Math.round(Math.sin(t / 300 + k) * 1), k % 2 ? lk.c2 : L.tint, 1);
    } else {
      const g = this.g;
      g.lineStyle(1, C(lk.c2), 0.9).strokeEllipse(this.ox + 16, this.oy - 3 + y + Math.sin(t / 400) * 1.2, 16, 5);
      g.lineStyle(1, C(L.tint), 0.7).strokeEllipse(this.ox + 16, this.oy - 3 + y + Math.sin(t / 400) * 1.2, 20, 7);
      if (L.ti >= 3) g.lineStyle(1, C(lk.c2), 0.5).strokeEllipse(this.ox + 16, this.oy - 6 + y + Math.sin(t / 400 + 1) * 1.2, 24 + L.ti * 2, 8); // двойной нимб с 85
    }
  }

  /** Щит на левой руке: размер и убранство растут с редкостью, у легендарных — свечение и пламя по кромке. */
  private shield(o: Piece, L: LegendaryDef | undefined, tr: string, pal: typeof PAL.solgard, i: GearInput, bob: number, lx: number, ly: number, sw: number, sm?: ItemModel) {
    const { view, t } = i, up = view === 1, side = view === 2;
    const sp = sm && !L ? piecePal(sm, o.r) : null, m = sp ? sp.m : pal.m;
    if (sp) tr = sp.tr;
    const shp = sm?.look.shape ?? "";
    let w = 6 + Math.min(3, o.r + (L ? 1 : 0)), h = 8 + Math.min(4, o.r * 1.5 + (L ? 2 : 0));
    if (shp === "tower") { w = 8; h = 13; } else if (shp === "buckler") { w = 5; h = 5; } else if (shp === "round" || shp === "aegis") { w = 8; h = 8; } else if (shp === "spiked") { w = 7; h = 7; } else if (shp === "kite") { w = 7; h = 12; } else if (sp) { w = 7; h = 10; }
    const x = side ? 13 - lx : up ? 22 : 8 - w + 3, y = 17 + bob + (side ? 0 : -sw) + ly;
    const metal = L ? [dark(L.tint, 0.4), dark(L.tint, 0.7), L.tint, L.look.c2] : m;
    this.g = up ? this.back : this.front; this.sx = 0; this.sy = 0; // со спины щит за спиной/сбоку, под плащом
    const ww = side ? 3 : w, xx = x;
    this.R(xx, y, ww, h, metal[1]);
    this.R(xx, y, ww, 1, metal[3]); this.R(xx, y + h - 1, ww, 1, metal[0]);
    this.R(xx + 1, y + h, Math.max(1, ww - 2), 1, metal[0]);
    if (!side) {
      this.R(xx, y, 1, h, metal[2]); this.R(xx + ww - 1, y, 1, h, metal[0]);
      const ec = L ? L.look.c2 : sp ? sp.acc[2] : pal === PAL.umbrath ? pal.eye : pal.gold;
      if (!up && sp) {
        // поле щита цветом ткани модели, умбон металлом каймы, украшения модели
        const field = shp === "bone" ? "#2e2830" : shp === "aegis" ? sp.trb : shp === "round" ? PR(sm!.look.haft, "wood")[2] : sp.acc[shp === "buckler" || shp === "spiked" ? 1 : 2];
        this.R(xx + 1, y + 1, ww - 2, h - 2, field);
        if (shp === "bone") { for (let k = 1; k < h - 1; k += 2) this.R(xx + 1, y + k, ww - 2, 1, "#cfc8b8"); this.R(xx + Math.floor(ww / 2) - 1, y + 1, 2, 2, "#e8e0d0"); }
        else if (shp === "aegis") { for (const [ax, ay] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) this.R(xx + Math.floor(ww / 2) + ax - (ax > 0 ? 1 : 0), y + Math.floor(h / 2) + ay - (ay > 0 ? 1 : 0), 1, 1, sp.tr); }
        else if (shp === "round") { for (let k = 1; k < ww - 1; k += 2) this.R(xx + k, y + 1, 1, h - 2, PR(sm!.look.haft, "wood")[1]); }
        else if (sm!.fac === "umbrath") { this.R(xx + Math.floor(ww / 2) - 1, y + Math.floor(h / 2) - 2, 2, 2, "#e8e0d0"); this.R(xx + Math.floor(ww / 2) - 1, y + Math.floor(h / 2) - 1, 1, 1, "#141018"); }
        else { this.R(xx + Math.floor(ww / 2) - 1, y + 1, 2, h - 2, sp.tr); this.R(xx + 1, y + Math.floor(h / 2) - 1, ww - 2, 1, sp.tr); }
        if (shp === "round" || shp === "buckler") this.R(xx + Math.floor(ww / 2) - 1, y + Math.floor(h / 2) - 1, 2, 2, m[3]);
        if (shp === "kite") { this.R(xx + 1, y + h, ww - 2, 1, m[1]); this.R(xx + Math.floor(ww / 2) - 1, y + h + 1, 2, 1, m[0]); }
        if (sm!.look.deco === "spikes" || shp === "spiked") { this.R(xx - 1, y + 1, 1, 1, m[3]); this.R(xx + ww, y + 1, 1, 1, m[3]); this.R(xx - 1, y + h - 2, 1, 1, m[3]); this.R(xx + ww, y + h - 2, 1, 1, m[3]); }
        this.R(xx + Math.floor(ww / 2) - 1 + (shp === "bone" ? 0 : 0), y + Math.floor(h / 2), 2, 1, sp.st);
        if (sp.hi) this.R(xx + Math.floor(ww / 2) - 1, y + Math.floor(h / 2), 1, 1, "#ffffff");
      } else if (!up) {
        if (pal === PAL.umbrath) { this.R(xx + ww / 2 - 1, y + 2, 2, 2, pal.gold); this.R(xx + ww / 2 - 1, y + 5, 2, 1, pal.gold2); } else { this.R(xx + Math.floor(ww / 2) - 1, y + 2, 2, h - 4, ec); this.R(xx + 1, y + Math.floor(h / 2) - 1, ww - 2, 2, ec); }
        if (o.r >= 1 && tr) { this.R(xx, y, ww, 1, tr); this.R(xx, y + h - 1, ww, 1, tr); }
        if (o.r >= 2 && !L) { this.R(xx - 1, y + 1, 1, 2, tr); this.R(xx + ww, y + 1, 1, 2, tr); }
      }
    }
    if (L) {
      const pulse = this.themeOn ? 0.6 + 0.4 * Math.sin(t / 220 + i.seed) : 0.8;
      this.R(xx - 1, y - 1, ww + 2, 1, L.tint, 0.5 * pulse); this.R(xx - 1, y + h, ww + 2, 1, L.look.c2, 0.4 * pulse);
      if (L.look.pauld === "flame" || L.look.fx === "ember") this.flame(xx + ww / 2, y, 3, 4, L.tint, L.look.c2, this.themeOn ? t : 0, 2);
      else if (!up) for (const sp of [0, 1]) this.line(xx + sp * (ww - 1), y, xx + sp * (ww - 1) + (sp ? 2 : -2), y - 4, L.tint, 1);
    }
  }

  private weapon(wb: string, wr: number, L: LegendaryDef | undefined, pal: typeof PAL.solgard, i: GearInput, bob: number, plus: number, off = false, wm?: ItemModel) {
    const { view, col } = i, t = this.themeOn ? i.t : 0;
    // базы без модели: прежний рисунок, цвет клинка — по своей редкости
    const base = L ? L.tint : RARITY_COLORS[Math.min(2, wr)];
    const hi = L ? L.look.c2 : "#ffffff";
    const haftC = "#8a5a2a", trimC = pal.gold, gemC = base, shp: string = L?.look.form ?? ""; // без модели — формы по умолчанию; у легендарки — look.form
    const F = view === 0 ? Math.PI / 2 : view === 1 ? -Math.PI / 2 : 0;
    const D = Math.PI / 180;
    const atk = col >= 4 && col < 8 ? col - 4 : -1;
    const swing = col < 4 ? [0, 1, 0, -1][col] : 0;
    const melee = MELEE.has(wb);
    const fwd = atk === 1 || atk === 2 ? 2 : 0, ln = fwd ? 1 : 0;
    let hx = view === 2 ? 18 + swing + fwd + ln : view === 0 ? 22.5 : 9.5, hy = 22 + bob + (view === 0 ? fwd * 0.5 + ln : view === 1 ? -fwd * 0.5 - ln : 0);
    let ang: number;
    if (melee) ang = atk >= 0 ? F + [-135, -45, 45, -20][atk] * D : view === 2 ? -60 * D : view === 0 ? -70 * D : -110 * D;
    else if (wb === "bow" || wb === "crossbow") { ang = view === 2 ? 0 : view === 0 ? Math.PI / 2 : -Math.PI / 2; if (view !== 2) { hx = view === 0 ? 21 : 11; hy = 21 + bob; } }
    else { ang = atk >= 0 ? [-95 * D, -70 * D + F * 0.25, -60 * D + F * 0.3, -85 * D][atk] : -90 * D; if (atk >= 0) hy -= [2, 1, 1, 0][atk]; }
    if (off) { ang = Math.PI - ang; hx = view === 2 ? 14 - swing : view === 0 ? 9.5 : 22.5; if (view === 2) ang = -100 * D; }
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    // модель каталога: локальный спрайт архетипа, повёрнутый в руку; без свечения (docs/gear-visuals.md 2.1)
    const wg = view === 1 ? this.back : this.front; // со спины оружие в руке за телом и плащом: виден клинок сбоку
    if (wm && !L) { this.g = wg; this.blitSprite(weaponSprite(wm, wr), hx, hy, dx, dy); return; }
    const pulse = this.themeOn ? 0.75 + 0.25 * Math.sin(t / 150 + i.seed) : 0.9;
    // длина клинка не зависит от заточки (docs/gear-visuals.md 2.2)
    // легендарка: клинок длиннее с каждым ярусом (+3…+7), look.blade = long — ещё +4 (docs: _doc.tierLook)
    const len = Math.min(18, (WLEN[wb] ?? 14) + (L ? 3 + L.ti + (L.look.blade === "long" ? 4 : 0) : wr * 1.5)); // не длиннее роста героя
    this.g = wg;
    if (L?.look.ghost) this.ghostBlade(L, wb, hx, hy, ang, len, t, i.seed, off);
    if (L?.look.pommel) this.pommel(L, hx - dx * 3, hy - dy * 3, t);
    if (wb === "sword" || wb === "dagger" || wb === "greatsword" || wb === "twinblades") {
      const thin = false, broad = wb === "greatsword";
      const curve = CURVED.has(shp) ? (off ? -2.5 : 2.5) : 0, wave = WAVY.has(shp) ? 1 : 0, bw = L ? 3 : thin ? 1 : broad ? 3 : 2;
      for (let s = 2; s <= len; s++) {
        const f = s / len, offp = curve * f * f + wave * Math.sin(s * 1.3) * 0.8;
        const x = hx + dx * s + px * offp, y = hy + dy * s + py * offp, ww = s > len - 2 && bw > 1 ? bw - 1 : bw;
        this.R(Math.round(x - (ww - 1) / 2), Math.round(y - (ww - 1) / 2), ww, ww, base);
        if (s < len) this.R(Math.round(x - (ww - 1) / 2), Math.round(y - (ww - 1) / 2), 1, 1, hi);
      }
      const gw = wb === "greatsword" ? 4 : wb === "dagger" ? 2 : 3;
      this.line(hx - px * gw, hy - py * gw, hx + px * gw, hy + py * gw, trimC, 1);
      if (L) for (let s = 3; s < len; s += 3) this.R(Math.round(hx + dx * s + px * 2), Math.round(hy + dy * s + py * 2), 1, 1, hi, pulse);
      // гравировка удлинённого клинка: руны по долу цветом c2, бегущий блик
      if (L?.look.blade === "long") for (let s = 4; s < len - 2; s += 2) { const lit = this.themeOn && Math.abs(((t / 40) % (len + 8)) - s) < 2; this.R(Math.round(hx + dx * s), Math.round(hy + dy * s), 1, 1, lit ? "#ffffff" : L.look.c2, lit ? 1 : 0.8); }
    } else if (wb === "spear" || wb === "scythe") {
      this.line(hx - dx * 3, hy - dy * 3, hx + dx * len, hy + dy * len, haftC, 1);
      const ex = hx + dx * len, ey = hy + dy * len;
      if (wb === "spear") {
        if (shp === "trident") for (const q of [-2, 0, 2]) this.line(ex + px * q, ey + py * q, ex + px * q + dx * 3, ey + py * q + dy * 3, q ? base : hi, 1);
        else { this.line(ex, ey, ex + dx * 4, ey + dy * 4, base, 2); this.R(Math.round(ex + dx * 5), Math.round(ey + dy * 5), 1, 1, hi); }
        if (shp === "boar" || shp === "partisan") this.line(ex - px * 2, ey - py * 2, ex + px * 2, ey + py * 2, trimC, 1);
      } else {
        const sg = off ? 1 : -1, bl = shp === "glaive" ? 4 : 7;
        for (let k = 0; k <= bl; k++) { const bx = ex + px * sg * k - dx * (k * k * 0.12) + (shp === "glaive" ? dx * k * 0.8 : 0), by = ey + py * sg * k - dy * (k * k * 0.12) + (shp === "glaive" ? dy * k * 0.8 : 0); this.R(Math.round(bx), Math.round(by), k < bl - 1 ? 2 : 1, k < bl - 1 ? 2 : 1, base); this.R(Math.round(bx), Math.round(by), 1, 1, hi); }
      }
    } else if (wb === "hammer") {
      this.line(hx - dx * 2, hy - dy * 2, hx + dx * len, hy + dy * len, haftC, 1);
      const ex = hx + dx * len, ey = hy + dy * len, hw = shp === "maul" ? 4 : 3;
      this.line(ex - px * hw, ey - py * hw, ex + px * hw, ey + py * hw, base, 3);
      this.line(ex - px * hw + dx, ey - py * hw + dy, ex + px * hw + dx, ey + py * hw + dy, hi, 1);
      if (shp === "crusher") this.line(ex - px * hw, ey - py * hw, ex - px * (hw + 3), ey - py * (hw + 3) - dy, base, 1);

    } else if (wb === "crossbow") {
      const ex = hx + dx * 7, ey = hy + dy * 7, ps = (shp === "heavy" ? 6 : shp === "hand" ? 3 : 5) + (L ? Math.round(L.ti / 2) + (L.look.blade === "long" ? 2 : 0) : 0);
      this.line(hx - dx * 2, hy - dy * 2, ex, ey, haftC, 2);
      this.line(ex - px * ps - dx, ey - py * ps - dy, ex + px * ps - dx, ey + py * ps - dy, base, shp === "heavy" ? 2 : 1);
      this.line(ex - px * ps - dx, ey - py * ps - dy, ex - dx * 4, ey - dy * 4, "#e8e4d8", 1, 0.8);
      this.line(ex + px * ps - dx, ey + py * ps - dy, ex - dx * 4, ey - dy * 4, "#e8e4d8", 1, 0.8);
      this.R(Math.round(ex + dx), Math.round(ey + dy), 1, 1, hi);
      if (shp === "repeater") this.R(Math.round(ex - dx * 3 - px), Math.round(ey - dy * 3 - py), 2, 2, trimC);
    } else if (wb === "mace") {
      this.line(hx - dx * 2, hy - dy * 2, hx + dx * len, hy + dy * len, haftC, 1);
      const ex = hx + dx * len, ey = hy + dy * len, hs = L ? 5 : 4;
      this.R(Math.round(ex - hs / 2), Math.round(ey - hs / 2), hs, hs, base); this.R(Math.round(ex - hs / 2), Math.round(ey - hs / 2), hs, 1, hi);
      for (const [sx2, sy2] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) this.R(Math.round(ex + sx2 * (hs / 2 + 1)), Math.round(ey + sy2 * (hs / 2 + 1)), 1, 1, hi);
    } else if (wb === "axe" || wb === "greataxe") {
      const big = wb === "greataxe", hl = big ? 7 : 5;
      this.line(hx - dx * 2, hy - dy * 2, hx + dx * len, hy + dy * len, haftC, 1);
      const ex = hx + dx * (len - 2), ey = hy + dy * (len - 2);
      this.line(ex - px * 1, ey - py * 1, ex + px * hl, ey + py * hl, base, L || big ? 4 : 3);
      this.line(ex + px * hl + dx * 2, ey + py * hl + dy * 2, ex + px * hl - dx * (big ? 5 : 3), ey + py * hl - dy * (big ? 5 : 3), hi, 1);
      if (L || shp === "labrys" || shp === "pick") this.line(ex - px, ey - py, ex - px * 4, ey - py * 4, base, 2);
    } else if (wb === "bow") {
      for (let tt = -1; tt <= 1.001; tt += 0.125) this.R(Math.round(hx + px * tt * 7 + dx * (1 - tt * tt) * 3), Math.round(hy + py * tt * 7 + dy * (1 - tt * tt) * 3), L ? 2 : 1, L ? 2 : 1, tt > 0.7 || tt < -0.7 ? hi : base, 0.95);
      if (L) this.line(hx + px * 7, hy + py * 7, hx - px * 7, hy - py * 7, hi, 1, 0.35 * pulse);
    } else {
      // посох / жезл: навершие (у модели — камень, череп, полумесяц, крюк или кристалл)
      const ox = hx + dx * (len + 1), oy = hy + dy * (len + 1), r = 2 + wr + (L ? 1 : 0);
      const head = base;
      this.line(hx - dx * 2, hy - dy * 2, ox, oy, "#8a5a2a", 1);
      if (L && this.themeOn && !this.cap) this.g.fillStyle(C(head), 0.28 * pulse).fillCircle(this.ox + (i.flip ? 32 - ox : ox), this.oy + oy, r + 3 + plus * 0.25);
      if (shp === "skull") { this.R(Math.round(ox - 1.5), Math.round(oy - 1.5), 3, 3, "#e8e0d0"); this.R(Math.round(ox - 1), Math.round(oy - 1), 1, 1, gemC); this.R(Math.round(ox + 1), Math.round(oy - 1), 1, 1, gemC); }
      else if (shp === "crook") { this.line(ox, oy, ox + px * 2, oy + py * 2 - 2, haftC, 1); this.line(ox + px * 2, oy + py * 2 - 2, ox + px * 3, oy + py * 3 + 1, haftC, 1); this.R(Math.round(ox + px * 3), Math.round(oy + py * 3 + 2), 1, 1, gemC); }
      else if (shp === "crescent") { for (const q of [-2, -1, 0, 1, 2]) this.R(Math.round(ox + px * q - dx * (2 - Math.abs(q)) * 0.6), Math.round(oy + py * q - dy * (2 - Math.abs(q)) * 0.6), 1, 1, trimC); this.R(Math.round(ox), Math.round(oy), 1, 1, gemC); }
      else if (shp === "crystal") { this.R(Math.round(ox), Math.round(oy - 2), 1, 4, head); this.R(Math.round(ox - 1), Math.round(oy - 1), 3, 2, head); this.R(Math.round(ox), Math.round(oy - 2), 1, 1, "#ffffff"); }
      else if (shp === "star") { const X = Math.round(ox), Y = Math.round(oy); this.R(X, Y - 4, 1, 9, head); this.R(X - 4, Y, 9, 1, head); this.R(X - 1, Y - 1, 3, 3, hi); for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) this.R(X + a, Y + b, 1, 1, head); this.R(X, Y, 1, 1, "#ffffff"); }
      else if (shp === "sun") { const X = Math.round(ox), Y = Math.round(oy); this.R(X - 2, Y - 1, 5, 3, head); this.R(X - 1, Y - 2, 3, 5, head); this.R(X - 1, Y - 1, 3, 3, hi); for (const [a, b] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) this.R(X + a, Y + b, 1, 1, hi, 0.85); }
      else if (shp === "flame") { this.R(Math.round(ox - 2), Math.round(oy + 2), 5, 1, trimC); this.flame(Math.round(ox), Math.round(oy) + 1, 3, 8, L!.tint, hi, t, i.seed); }
      else if (shp === "cage") { const X = Math.round(ox), Y = Math.round(oy); this.R(X - 3, Y - 3, 7, 1, trimC); this.R(X - 3, Y + 3, 7, 1, trimC); this.R(X - 3, Y - 2, 1, 5, trimC); this.R(X + 3, Y - 2, 1, 5, trimC); this.R(X - 1, Y - 1, 3, 3, head, 0.9); this.R(X, Y - 1, 1, 2, hi); this.R(X, Y - 5, 1, 2, trimC); }
      else if (shp === "censer") { const X = Math.round(ox), Y = Math.round(oy); this.R(X - 3, Y - 2, 7, 5, trimC); this.R(X - 2, Y - 1, 5, 3, head); this.R(X - 1, Y + 3, 3, 1, trimC); this.R(X, Y - 4, 1, 2, "#e8e8e8", 0.6); this.R(X + 1, Y - 6, 1, 2, "#e8e8e8", 0.35); }
      else if (shp === "wand") { this.R(Math.round(ox), Math.round(oy), 1, 1, "#ffffff"); this.R(Math.round(ox - 1), Math.round(oy), 3, 1, head, 0.8); this.R(Math.round(ox), Math.round(oy - 1), 1, 3, head, 0.8); }
      else {
        if (shp === "fork") { this.R(Math.round(ox - r / 2 - 1), Math.round(oy - r / 2), 1, r, trimC); this.R(Math.round(ox + r / 2), Math.round(oy - r / 2), 1, r, trimC); }
        this.R(Math.round(ox - r / 2), Math.round(oy - r / 2), r, r, head);
        this.R(Math.round(ox - r / 2), Math.round(oy - r / 2), 1, 1, "#ffffff");
      }
      if (L) for (let k = 0; k < 3; k++) { const a2 = t / 400 + k * 2.1; this.R(Math.round(ox + Math.cos(a2) * (r + 3)), Math.round(oy + Math.sin(a2) * (r + 2)), 1, 1, hi); }
    }
  }

  /** Призрачная копия клинка (look.ghost): тот же силуэт с отставанием по углу и сдвигом, полупрозрачная, цвета c2. */
  private ghostBlade(L: LegendaryDef, wb: string, hx: number, hy: number, ang: number, len: number, t: number, seed: number, off: boolean) {
    const lag = (off ? -1 : 1) * (0.32 + 0.08 * Math.sin(t / 300 + seed)), a2 = ang - lag, dx = Math.cos(a2), dy = Math.sin(a2), px = -dy, py = dx;
    const ox = hx - px * 1.5, oy = hy - py * 1.5, wide = wb === "greatsword" || wb === "greataxe" || wb === "hammer" ? 3 : 2;
    for (let s = 2; s <= len + 1; s++) this.R(Math.round(ox + dx * s - (wide - 1) / 2), Math.round(oy + dy * s - (wide - 1) / 2), s > len - 1 ? 1 : wide, s > len - 1 ? 1 : wide, L.look.c2, 0.3);
    this.R(Math.round(ox + dx * (len + 1)), Math.round(oy + dy * (len + 1)), 1, 1, "#ffffff", 0.45);
  }
  /** Навершие рукояти (look.pommel): череп или звезда, у звезды мерцают лучи. */
  private pommel(L: LegendaryDef, x: number, y: number, t: number) {
    const X = Math.round(x), Y = Math.round(y);
    if (L.look.pommel === "skull") { this.R(X - 1, Y - 1, 3, 2, "#e8e0d0"); this.R(X, Y + 1, 1, 1, "#e8e0d0"); this.R(X - 1, Y - 1, 1, 1, L.tint); this.R(X + 1, Y - 1, 1, 1, L.tint); }
    else { const tw = this.themeOn && Math.floor(t / 180) % 4 === 0; this.R(X - 1, Y, 3, 1, L.tint); this.R(X, Y - 1, 1, 3, L.tint); this.R(X, Y, 1, 1, "#ffffff"); if (tw) { this.R(X - 2, Y, 1, 1, L.look.c2, 0.8); this.R(X + 2, Y, 1, 1, L.look.c2, 0.8); this.R(X, Y - 2, 1, 1, L.look.c2, 0.8); this.R(X, Y + 2, 1, 1, L.look.c2, 0.8); } }
  }

  /** Поворот локального спрайта оружия в руку: обратное отображение по пикселям кадра, без дыр. */
  private blitSprite(sp: WSprite, hx: number, hy: number, dx: number, dy: number) {
    const px = -dy, py = dx;
    const xs: number[] = [], ys: number[] = [];
    for (const s of [sp.smin, sp.smax]) for (const q of [sp.qmin, sp.qmax]) { xs.push(hx + dx * s + px * q); ys.push(hy + dy * s + py * q); }
    const x0 = Math.floor(Math.min(...xs)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1, y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ex = x + 0.5 - hx, ey = y + 0.5 - hy;
      const c = cellAt(sp, Math.round(ex * dx + ey * dy), Math.round(ex * px + ey * py));
      if (c) this.R(x, y, 1, 1, c);
    }
  }

  /**
   * Шлем по модели: архетип (look.shape) — силуэт, материал — палитра модели, кайма и камень — по редкости шлема.
   * Свечения, пульсации и машущих крыльев нет; нимб у обычных моделей — обруч (docs/gear-visuals.md 2.1).
   */
  private helmetModel(md: ItemModel, r: number, pal: typeof PAL.solgard, cx: number, view: number, bob: number, t: number, seed: number) {
    const up = view === 1, side = view === 2, y = bob, lk = md.look, p = piecePal(md, r), M = p.m, sh = lk.shape;
    const x0 = side ? 9 : 10, w = 12, DK = "#0c0a10";
    const eye = md.fac === "umbrath" ? p.fx[1] : pal === PAL.umbrath ? "#8a8070" : "#d8d0b8";
    const face = (fx0: number, fw: number) => { if (up) return; if (side) { this.R(16, 7 + y, 5, 6, DK); this.R(19, 9 + y, 1, 1, eye); } else { this.R(fx0, 7 + y, fw, 6, DK); this.R(13, 9 + y, 2, 1, eye); this.R(17, 9 + y, 2, 1, eye); } };
    const hood = (C: string[], peak = 0) => {
      this.R(x0, 4 + y, w, 9, C[1]); this.R(x0 + 1, 3 + y, w - 2, 1, C[2]); this.R(x0, 4 + y, 2, 9, C[0]); this.R(x0 + 2, 4 + y, w - 4, 1, C[3]);
      if (peak) this.R(side ? x0 - 1 : cx - 1, 1 + y, 2, 3, C[2]);
      face(12, 8);
    };
    if (p.bt === "cloth") {
      switch (sh) {
        case "circlet": case "diadem":
          this.R(x0 + 1, 7 + y, w - 2, 1, p.trb); this.R(x0 + 1, 7 + y, w - 2, 1, p.tr, 0.9);
          if (!up) { this.R(side ? 18 : 15, 6 + y, 2, 2, p.st); if (sh === "diadem") { this.R(side ? 18 : 15, 3 + y, 2, 3, p.trb); if (!side) { this.R(12, 5 + y, 1, 2, p.trb); this.R(19, 5 + y, 1, 2, p.trb); } } }
          break;
        case "wizard":
          this.R(x0 - 2, 6 + y, w + 4, 2, M[1]); this.R(x0 - 2, 7 + y, w + 4, 1, M[0]);
          for (let k = 0; k < 7; k++) { const ww = Math.max(2, 10 - k * 1.4); this.R(Math.round(cx - ww / 2 + (k > 4 ? k - 4 : 0)), 5 + y - k, Math.round(ww), 1, M[k % 3 === 0 ? 3 : 2]); }
          this.R(x0, 5 + y, w, 1, p.tr); if (!up) this.R(15, 5 + y, 2, 1, p.st);
          break;
        case "mitre":
          this.R(x0 + 1, 1 + y, 4, 7, M[2]); this.R(x0 + 7, 1 + y, 4, 7, M[1]); this.R(x0 + 1, 3 + y, w - 2, 5, M[2]);
          if (!up) { this.R(15, 2 + y, 2, 6, p.trb); this.R(13, 4 + y, 6, 1, p.trb); this.R(15, 4 + y, 2, 1, p.st); }
          this.R(x0 + 1, 7 + y, w - 2, 1, p.tr);
          break;
        case "turban":
          for (let k = 0; k < 5; k++) this.R(x0 + (k === 0 ? 1 : 0), 3 + y + k, w - (k === 0 ? 2 : 0), 1, M[k % 2 ? 1 : 2]);
          if (!up) { this.R(side ? 18 : 15, 5 + y, 2, 2, p.st); this.line(side ? 19 : 16, 4 + y, side ? 20 : 18, 0 + y, "#f6f2f8", 1); }
          break;
        case "veil":
          hood(M); if (!up) { this.R(side ? 16 : 12, 10 + y, side ? 5 : 8, 3, md.fac === "umbrath" ? "#24202c" : "#e8e4ec", 0.9); this.R(x0 + 1, 6 + y, w - 2, 1, p.tr); }
          break;
        case "horncrown":
          this.R(x0 + 1, 7 + y, w - 2, 1, p.trb); if (!up) this.R(side ? 18 : 15, 7 + y, 2, 1, p.st);
          for (const s of side ? [-1] : [-1, 1]) { this.line(cx + s * 3, 6 + y, cx + s * 5, 1 + y, "#cfc8b8", 1); this.line(cx + s * 5, 3 + y, cx + s * 7, 2 + y, "#cfc8b8", 1); this.R(cx + s * 5, 0 + y, 1, 1, "#f1ecdf"); }
          break;
        default: hood(M, sh === "cowl" ? 0 : 0); this.R(x0, 12 + y, w, 1, p.tr);
      }
    } else if (p.bt === "leather") {
      switch (sh) {
        case "fur": this.R(x0 + 1, 3 + y, w - 2, 5, M[2]); this.R(x0 + 1, 3 + y, w - 2, 1, M[3]); this.R(x0 - 1, 7 + y, w + 2, 2, "#e8e2d0"); this.R(x0 - 1, 8 + y, w + 2, 1, "#b8b0a0"); this.line(x0 + w - 1, 6 + y, x0 + w + 2, 1 + y, p.acc[3], 1); break;
        case "cap": this.R(x0 + 1, 4 + y, w - 2, 4, M[2]); this.R(x0 + 1, 4 + y, w - 2, 1, M[3]); this.R(x0, 7 + y, 2, 5, M[1]); this.R(x0 + w - 2, 7 + y, 2, 5, M[1]); if (!up && !side) { this.R(12, 7 + y, 3, 2, p.trb); this.R(17, 7 + y, 3, 2, p.trb); this.R(13, 7 + y, 1, 1, "#d8ecff"); this.R(18, 7 + y, 1, 1, "#d8ecff"); } break;
        case "pelt": { const F = md.fac === "umbrath" ? ["#141218", "#24202c", "#383244", "#5a5266"] : ["#4a4a52", "#6a6a74", "#8e8e98", "#b4b4bc"]; hood(F); for (const s of side ? [-1] : [-1, 1]) { this.R(cx + s * 4 - (s < 0 ? 1 : 0), 1 + y, 2, 3, F[2]); this.R(cx + s * 4, 2 + y, 1, 1, F[0]); } if (!up && !side) { this.R(13, 5 + y, 6, 2, F[2]); this.R(14, 5 + y, 1, 1, eye); this.R(17, 5 + y, 1, 1, eye); } break; }
        case "band": this.R(x0 + 1, 4 + y, w - 2, 4, p.acc[2]); this.R(x0 + 1, 4 + y, w - 2, 1, p.acc[3]); this.R(x0, 7 + y, w, 1, p.acc[1]); this.R(side ? x0 - 2 : x0 + w, 7 + y, 2, 1, p.acc[2]); this.R(side ? x0 - 3 : x0 + w + 1, 8 + y, 2, 2, p.acc[1]); if (!up) this.R(side ? 18 : 15, 6 + y, 2, 1, p.st); break;
        default: hood(M, sh === "cowl" ? 1 : 0); if (sh === "mask" && !up) this.R(side ? 16 : 12, 11 + y, side ? 5 : 8, 2, p.acc[2]); this.R(x0, 12 + y, w, 1, p.acc[2]);
      }
    } else {
      // латный шлем: купол + форма по архетипу
      this.R(side ? 11 : 12, 4 + y, side ? 9 : 8, 1, M[2]);
      this.R(x0 + 1, 5 + y, w - 2, 1, M[2]);
      this.R(x0, 6 + y, w, 3, M[1]); this.R(x0, 6 + y, 2, 3, M[0]); this.R(x0, 9 + y, w, 1, M[0]);
      if (up) this.R(x0, 9 + y, w, 4, M[1]);
      else if (sh === "great" || sh === "barbute" || sh === "armet") {
        this.R(x0, 4 + y, w, 9, M[1]); this.R(x0, 4 + y, w, 1, M[3]); this.R(x0, 4 + y, 2, 9, M[0]);
        if (sh === "barbute") { if (side) this.R(16, 8 + y, 5, 1, DK); else { this.R(12, 8 + y, 8, 1, DK); this.R(15, 8 + y, 2, 4, DK); } }
        else { this.R(side ? 16 : x0 + 1, 8 + y, side ? 5 : w - 2, 1, DK); if (sh === "armet") this.R(side ? 16 : x0 + 2, 10 + y, side ? 5 : w - 4, 1, DK); }
        if (sh === "great" && !side) this.R(15, 9 + y, 2, 4, p.trb);
        if (md.fac === "umbrath") { if (side) this.R(19, 8 + y, 2, 1, eye); else { this.R(13, 8 + y, 2, 1, eye); this.R(17, 8 + y, 2, 1, eye); } }
      } else {
        if (side) this.R(19, 9 + y, 3, 4, M[1]); else { this.R(10, 9 + y, 2, 4, M[1]); this.R(20, 9 + y, 2, 4, M[1]); }
        if (!side && (sh === "open" || sh === "horned" || sh === "plumed" || sh === "crowned")) this.R(15, 6 + y, 2, 6, M[3]);
        if (sh === "bascinet") { this.R(cx - 1, 2 + y, 2, 2, M[2]); if (!side) { this.R(13, 9 + y, 6, 3, M[2]); this.R(13, 9 + y, 6, 1, DK); } else this.R(19, 9 + y, 3, 2, M[2]); }
        if (sh === "sallet") { if (side) this.R(7, 8 + y, 3, 2, M[1]); else this.R(x0 - 1, 9 + y, w + 2, 1, M[1]); this.R(side ? 16 : 12, 8 + y, side ? 5 : 8, 1, DK); }
        if (sh === "horned") for (const s of side ? [-1] : [-1, 1]) { this.line(cx + s * 5, 6 + y, cx + s * 8, 3 + y, "#cfc8b8", 2); this.line(cx + s * 8, 3 + y, cx + s * 8, 0 + y, "#f1ecdf", 1); }
        if (sh === "plumed") { this.R(cx - 1, 0 + y, 2, 4, p.acc[2]); this.R(cx - 1 + (side ? -2 : 0), -1 + y, 3, 1, p.acc[3]); this.R(cx + (side ? -3 : 1), 0 + y, 2, 1, p.acc[1]); }
        if (sh === "crowned") { this.R(x0 + 1, 3 + y, w - 2, 1, p.trb); for (const q of side ? [0, 4] : [0, 4, 9]) this.R(x0 + 1 + q, 1 + y, 1, 2, p.trb); this.R(side ? 15 : 15, 3 + y, 2, 1, p.st); }
      }
      this.R(x0, 8 + y, w, 1, p.tr);
    }
    // украшения модели: статичные
    const d = lk.deco;
    if (d === "horns" && sh !== "horned" && sh !== "horncrown") for (const s of side ? [-1] : [-1, 1]) { this.line(cx + s * 5, 5 + y, cx + s * 8, 1 + y, "#cfc8b8", 2); this.line(cx + s * 8, 1 + y, cx + s * 8, -2 + y, "#f1ecdf", 1); }
    else if (d === "wings") for (const s of side ? [-1] : [-1, 1]) for (let k = 0; k < 3; k++) this.line(cx + s * 5, 7 + y - k, cx + s * (8 + k * 2), 4 + y - k * 2, k % 2 ? "#dce2ec" : "#ffffff", 1);
    else if (d === "spikes") for (const q of side ? [0] : [-3, 0, 3]) this.R(cx + q - 0.5, 1 + y, 1, 3, M[3]);
    else if (d === "halo" && !up) this.R(x0 + 1, 5 + y, w - 2, 1, p.trb); // нимб у обычных моделей — обруч
    else if (d === "skull" && !up) { this.R(side ? 18 : 15, 5 + y, 2, 2, "#e8e0d0"); this.R(side ? 18 : 15, 6 + y, 1, 1, DK); }
    if (p.hi && !up && p.bt !== "cloth") this.R(side ? 19 : 15, 8 + y, 2, 1, p.st);
    void r; void t; void seed;
  }

  /** Детали доспеха по модели: узор нагрудника, ремни, табард, рёбра, саван, кайма и камень по редкости. Без свечения. */
  private armorModel(md: ItemModel, p: ReturnType<typeof piecePal>, x0: number, w: number, y0: number, up: boolean, side: boolean, walking: boolean, t: number, seed: number) {
    const sh = md.look.shape, M = p.m;
    if (!up) {
      if (sh === "scale" || sh === "chain") for (let yy = 2; yy < 6; yy += 2) for (let xx = (yy / 2) % 2; xx < w; xx += 2) this.R(x0 + xx, y0 + yy, 1, 1, sh === "scale" ? M[3] : M[0]);
      if (sh === "brigandine" || sh === "gambeson") { this.R(x0, y0 + 2, w, 4, sh === "gambeson" ? p.acc[2] : p.acc[1]); for (let xx = 1; xx < w; xx += 3) this.R(x0 + xx, y0 + 3, 1, 1, sh === "gambeson" ? p.acc[0] : p.trb); }
      if (sh === "bone") { this.R(x0, y0 + 1, w, 5, "#24202c"); for (let yy = 1; yy < 6; yy += 2) this.R(x0 + 1, y0 + yy, w - 2, 1, "#cfc8b8"); if (!side) this.R(15, y0 + 1, 2, 5, "#e8e0d0"); }
      if (sh === "cuirass" && !side) { this.R(x0 + 2, y0 + 1, 2, 3, M[3]); this.R(x0 + w - 4, y0 + 1, 2, 3, M[2]); }
      if ((sh === "plate" || sh === "full" || sh === "tabard") && !side) { this.R(15, y0 + 1, 1, 5, M[3]); this.R(16, y0 + 1, 1, 5, M[0]); }
      if (sh === "full") { this.R(x0, y0 + 8, 4, 3, M[2]); this.R(x0 + w - 4, y0 + 8, 4, 3, M[1]); this.R(x0 + 3, y0 - 1, w - 6, 1, M[3]); }
      if (sh === "vest" && !side) { this.line(x0, y0 + 1, x0 + w - 1, y0 + 5, p.hide[0], 1); this.line(x0 + w - 1, y0 + 1, x0, y0 + 5, p.hide[0], 1); }
      if (sh === "harness") { this.line(x0, y0, x0 + w - 1, y0 + 5, p.hide[0], 1); if (!side) this.line(x0 + w - 1, y0, x0, y0 + 5, p.hide[0], 1); this.R(x0 + Math.floor(w / 2), y0 + 2, 1, 1, p.trb); this.R(x0 + 1, y0 + 7, 2, 2, p.hide[1]); this.R(x0 + w - 3, y0 + 7, 2, 2, p.hide[1]); }
      if ((sh === "jacket" || sh === "coat") && !side) { this.R(15, y0 + 1, 1, 5, p.acc[3]); this.R(17, y0 + 2, 1, 4, p.acc[3]); }
      if (sh === "coat") { this.R(x0, y0 + 8, w, 3, M[1]); this.R(x0 + Math.floor(w / 2), y0 + 8, 1, 3, M[0]); }
      if (sh === "pelt") this.R(x0, y0, w, 2, "#c8c0ae");
      if ((sh === "vestment" || sh === "cassock") && !side) { this.R(13, y0, 1, 12, p.trb); this.R(18, y0, 1, 12, p.trb); }
      if (sh === "wrap" && !side) this.line(x0, y0, x0 + w - 1, y0 + 7, md.fac === "umbrath" ? "#383244" : "#f6f2f8", 2);
      if (sh === "shroud") { for (let xx = 0; xx < w + 2; xx += 2) this.R(x0 - 1 + xx, 29 + (y0 - 16), 1, 1, M[0]); this.R(x0, y0 + 6, w, 1, "#9e968a"); }
      if (sh === "battle") { this.R(x0, y0 + 6, w, 2, p.hide[1]); if (!side) this.R(15, y0 + 6, 2, 2, p.trb); }
      if (sh === "robe" && !side) this.R(15, y0 + 7, 2, 5, p.trb);
      if (md.look.deco === "runes" && !side) for (const xx of [1, w - 2]) this.R(x0 + xx, y0 + 3, 1, 1, p.fx[2]);
      if (md.look.deco === "skull" && !side) { this.R(15, y0 + 2, 2, 2, "#e8e0d0"); this.R(15, y0 + 3, 1, 1, "#141018"); }
      // кайма 1 px и камень — по редкости доспеха
      this.R(x0, y0, w, 1, p.tr);
      if (!side && (md.look.gem || p.hi)) this.R(15, y0 + 3, 2, 1, p.st);
      if (p.hi && !side) this.R(15, y0 + 3, 1, 1, "#ffffff");
    } else this.R(x0, y0, w, 1, p.tr);
    if (sh === "hooded" || sh === "cloak") this.R(x0 + 1, y0 - 1, w - 2, 1, M[up ? 2 : 1]);
    void walking; void t; void seed;
  }

  /** Вторая рука заклинателя: сфера или книга у левой руки; форма по архетипу, камень по редкости, без свечения. */
  private focus(o: Piece, md: ItemModel | undefined, pal: typeof PAL.solgard, i: GearInput, bob: number, L?: LegendaryDef) {
    const { view } = i, side = view === 2, up = view === 1;
    // легендарка: камень цвета темы, оправа — второй цвет, форма — look.shape
    const lk = L ? { shape: L.look.shape, cloth: undefined, haft: undefined } : md?.look, p = md && !L ? piecePal(md, o.r) : null;
    const st = L ? L.tint : p ? p.st : RARITY_COLORS[Math.min(3, Math.max(0, o.r))], std = L ? dark(L.tint, 0.55) : p ? p.std : "#6a7080", tr = L ? L.look.c2 : p ? p.trb : pal.gold;
    const x = side ? 12 : up ? 22 : 8, y = 19 + bob;
    this.g = side ? this.back : this.front;
    if (o.base === "orb") {
      const sh = lk?.shape ?? "orb";
      switch (sh) {
        case "crystal": this.R(x + 1, y - 2, 1, 5, st); this.R(x, y - 1, 1, 3, std); this.R(x + 2, y, 1, 2, std); break;
        case "prism": this.R(x + 1, y - 2, 1, 1, st); this.R(x, y - 1, 3, 1, st); this.R(x - 1, y, 5, 1, std); break;
        case "eye": this.R(x, y, 3, 3, "#e8e2d0"); this.R(x + 1, y + 1, 1, 1, st); break;
        case "lantern": this.R(x, y - 1, 3, 4, tr); this.R(x + 1, y, 1, 2, st); this.R(x + 1, y - 2, 1, 1, tr); break;
        case "skull": this.R(x, y, 3, 3, "#e0d8c8"); this.R(x, y + 1, 1, 1, st); this.R(x + 2, y + 1, 1, 1, st); this.R(x + 1, y + 3, 1, 1, "#a8a090"); break;
        case "orbit": this.R(x, y, 3, 3, st); this.R(x - 1, y + 1, 5, 1, tr); break;
        default: this.R(x, y, 3, 3, st); this.R(x + 2, y + 2, 1, 1, std); this.R(x, y + 3, 3, 1, tr);
      }
      if (p?.hi || L) this.R(x, y, 1, 1, "#ffffff");
      if (L && this.themeOn && !up) this.R(x - 1, y - 1, 5, 5, L.tint, 0.18 + 0.1 * Math.sin(i.t / 260 + i.seed));
    } else {
      const sh = lk?.shape ?? "book";
      const cov = sh === "star" ? PR("star")[2] : sh === "grimoire" ? "#1c181e" : PR(lk?.cloth ?? (pal === PAL.umbrath ? "purple" : "red"), "red")[1];
      if (sh === "scroll") { this.R(x - 1, y + 1, 6, 3, "#e8e2d0"); this.R(x - 1, y + 1, 1, 3, PR(lk?.haft, "wood")[2]); this.R(x + 4, y + 1, 1, 3, PR(lk?.haft, "wood")[2]); this.R(x + 1, y + 4, 2, 1, st); }
      else {
        this.R(x, y, 4, 5, cov); this.R(x, y, 4, 1, sh === "thick" ? PR(lk?.cloth, "red")[3] : tr); this.R(x + 3, y + 1, 1, 4, "#e8e2d0");
        if (sh === "prayer") { this.R(x + 1, y + 1, 1, 3, tr); this.R(x, y + 2, 3, 1, tr); }
        else if (sh === "grimoire") { this.R(x + 1, y + 2, 2, 1, "#e0d8c8"); this.R(x + 1, y + 2, 1, 1, st); }
        else if (sh === "star") { this.R(x + 1, y + 1, 1, 1, "#ffffff"); this.R(x + 2, y + 3, 1, 1, "#ffffff"); }
        else this.R(x + 1, y + 2, 1, 1, st);
        if (sh === "thick") this.R(x + 3, y + 5, 1, 1, "#c8c0ae");
      }
    }
    this.g = this.front;
  }

  setDepth(d: number) { this.back.setDepth(d - 0.1); this.front.setDepth(d + 0.5); }
  destroy() { this.unflash(); ACTIVE.delete(this); if (this.sid) setHiddenParticles(this.sid, null); this.back.destroy(); this.front.destroy(); }
}
