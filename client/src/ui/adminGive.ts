/**
 * Вкладка «Выдача» админ-панели: каталог всех предметов (модели из data/items.json, база, уникальные боссов, легендарные,
 * расходники) с фильтрами, предпросмотром как в инвентаре и выдачей. Состояние живёт здесь и не сбрасывается при смене вкладок.
 * Все права и проверки значений делает сервер (server/src/game/admin.ts, "admin:give").
 */
import { CLASSES, type ClassId } from "../../../shared/classes";
import { MAX_LEVEL } from "../../../shared/constants";
import { FACTIONS } from "../../../shared/factions";
import { ENCHANT_COLOR, ENCHANT_THRESHOLDS, fxText, nextStepText } from "../../../shared/gearFx";
import {
  BASE_ITEMS, ITEM_STAT_NAMES, RARITY_COLORS, RARITY_NAMES, SLOTS, SLOT_NAMES, canEquip, effStats, iconFor, isBound, isTwoHanded, itemName, itemTypeName,
  listItemModels, makeItem, makeUnique, previewGear, uniqueLevel, UNIQUES, type GearPreview, type Item, type ItemStatKey, type Rarity, type Slot,
} from "../../../shared/items";
import { LEGENDARIES, makeLegendary, TIER_LIST } from "../../../shared/legendary";
import { MATERIALS, MAX_PLUS } from "../../../shared/upgrade";
import { RESOURCES } from "../../../shared/biomes";
import type { Net } from "../net";
import "./admin.css";

import { MOUNTS, MOUNT_SOURCES, MOUNT_TIERS } from "../../../shared/mounts";
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
const PAGE = 120;

type Group = "weapon" | "offhand" | "armor" | "cloak" | "jewelry" | "unique" | "legend" | "stuff" | "mount";
const GROUPS: [Group, string][] = [["weapon", "Оружие"], ["offhand", "Вторая рука"], ["armor", "Броня"], ["cloak", "Спина"], ["jewelry", "Бижутерия"], ["unique", "Уникальные боссов"], ["legend", "Легендарные"], ["stuff", "Расходники и материалы"], ["mount", "Маунты"]];
const GROUP_TYPE: Record<string, string> = { weapon: "Оружие", offhand: "Вторая рука", helmet: "Броня", armor: "Броня", boots: "Броня", cloak: "Спина", ring: "Бижутерия", amulet: "Бижутерия" };
/** Подписи видов предметов (typeName у секиры — «Двуручный топор», а игрок знает «Секира»). */
const CHIP: Record<string, string> = { sword: "Одноручный меч", greatsword: "Двуручный меч", twinblades: "Парные мечи", dagger: "Кинжалы", axe: "Топор", greataxe: "Секира", mace: "Булава", hammer: "Молот", spear: "Копьё", scythe: "Коса", bow: "Лук", crossbow: "Арбалет", staff: "Посох", scepter: "Жезл", shield: "Щит", orb: "Сфера", tome: "Книга", ring: "Кольцо", amulet: "Амулет" };
const STUFF: [string, string][] = [["potion", "Зелья"], ["food", "Еда"], ["material", "Материалы улучшения"], ["resource", "Ресурсы биомов"]];
const ARMOR_T: Record<string, string> = { plate: "латы", leather: "кожа", cloth: "ткань" };
const ARMOR_CHIPS: [string, string][] = [["", "Любой"], ["plate", "Латы"], ["leather", "Кожа"], ["cloth", "Ткань"]];
/** Короткие подписи классов для карточек (полное название — во всплывающей подсказке). */
const SHORT: Record<ClassId, string> = { warrior: "Храмовник", healer: "Клирик", ranger: "Егерь", mage: "Маг", rogue: "Ассасин", deathknight: "Р. смерти", bloodweaver: "Кровотв.", darkranger: "Т. следопыт", warlock: "Чернокн.", reaver: "Потрошит." };
const FAC_NEUTRAL = "#b8b0a0";
const SORTS: [string, string][] = [["lvl-desc", "Уровень ↓"], ["lvl-asc", "Уровень ↑"], ["name", "Имя"], ["cat", "Категория"]];

interface Entry {
  key: string; kind: "model" | "unique" | "legend" | "base" | "stuff"; id: string; name: string;
  group: Group; cat: string; typeLabel: string; slot: Slot | "consumable"; hands: "one" | "two" | "pair" | "";
  /** level — уровень модели/предмета; req — настоящее требование к уровню получателя (как у вещи, а не level − 2). */
  level: number; req: number; allowed: ClassId[] | null; rec: ClassId[]; faction: string; armorType?: string;
  /** best — максимальный тир своей категории; hi — уровень 90+ (метки «★ ЛУЧШИЙ» и «90+»). */
  tier: number; tiers: number; best: boolean; hi: boolean; hay: string; base: string;
}

const slotGroup = (s: Slot | "consumable"): Group => (s === "weapon" ? "weapon" : s === "offhand" ? "offhand" : s === "cloak" ? "cloak" : s === "ring" || s === "amulet" ? "jewelry" : s === "consumable" ? "stuff" : "armor");
const handsOf = (b: { id: string; hands?: 2; slot: string }): Entry["hands"] => (b.slot !== "weapon" ? "" : b.hands === 2 ? "two" : b.id === "twinblades" || b.id === "dagger" ? "pair" : "one");
const typeLabel = (cat: string) => CHIP[cat] ?? BASE_ITEMS[cat]?.typeName ?? BASE_ITEMS[cat]?.name ?? cat;

let CATALOG: Entry[] | null = null;
let BY_KEY = new Map<string, Entry>();
function catalog(): Entry[] {
  if (CATALOG) return CATALOG;
  const out: Entry[] = [];
  const models = listItemModels();
  const tiersOf = new Map<string, number[]>();
  for (const m of models) { const l = tiersOf.get(m.base) ?? []; if (!l.includes(m.level)) l.push(m.level); tiersOf.set(m.base, l.sort((a, b) => a - b)); }
  const push = (e: Omit<Entry, "hay">) => out.push({ ...e, hay: `${e.name} ${e.id} ${e.typeLabel}${e.kind === "legend" ? " ярус " + LEGENDARIES[e.id].tier : ""}`.toLowerCase() });
  for (const m of models) {
    const b = BASE_ITEMS[m.base], tl = tiersOf.get(m.base)!, tier = tl.indexOf(m.level) + 1;
    push({ key: "m:" + m.id, kind: "model", id: m.id, name: m.name, group: slotGroup(m.slot), cat: m.base, typeLabel: typeLabel(m.base), slot: m.slot, hands: handsOf(b), level: m.level, req: Math.max(1, m.level - 2), allowed: m.allowed, rec: m.classes, faction: m.faction, armorType: b.armorType, tier, tiers: tl.length, best: tier === tl.length, hi: m.level >= 90, base: m.base });
  }
  // универсальные базы без моделей (старые сохранения): helmet, armor, boots
  for (const b of Object.values(BASE_ITEMS)) {
    if (b.slot === "consumable" || tiersOf.has(b.id)) continue;
    push({ key: "b:" + b.id, kind: "base", id: b.id, name: b.name, group: slotGroup(b.slot), cat: b.id, typeLabel: typeLabel(b.id), slot: b.slot, hands: handsOf(b), level: 1, req: 1, allowed: b.classes ?? null, rec: b.rec ?? [], faction: "", armorType: b.armorType, tier: 0, tiers: 0, best: false, hi: false, base: b.id });
  }
  for (const u of Object.values(UNIQUES)) {
    const b = BASE_ITEMS[u.base];
    const ul = uniqueLevel(u.id); // уровень своего босса (data/world.json), у наград арены — ilvl записи
    push({ key: "u:" + u.id, kind: "unique", id: u.id, name: u.name, group: "unique", cat: u.base, typeLabel: typeLabel(u.base), slot: b.slot, hands: handsOf(b), level: ul, req: makeUnique(u.id, ul).req, allowed: b.classes ?? null, rec: [], faction: "", armorType: b.armorType, tier: 0, tiers: 0, best: false, hi: ul >= 90, base: u.base });
  }
  for (const l of Object.values(LEGENDARIES)) {
    const b = BASE_ITEMS[l.base];
    push({ key: "l:" + l.id, kind: "legend", id: l.id, name: l.name, group: "legend", cat: l.base, typeLabel: typeLabel(l.base), slot: b.slot, hands: handsOf(b), level: l.ilvl, req: l.req, allowed: b.classes ?? null, rec: [l.variant], faction: l.faction, armorType: b.armorType, tier: l.ti + 1, tiers: TIER_LIST.length, best: false, hi: l.ilvl >= 90, base: l.base });
  }
  for (const b of Object.values(BASE_ITEMS)) {
    if (b.slot !== "consumable") continue;
    const cat = b.id.endsWith("_potion") ? "potion" : b.id.startsWith("food_") ? "food" : MATERIALS[b.id] ? "material" : RESOURCES[b.id] ? "resource" : "resource";
    push({ key: "s:" + b.id, kind: "stuff", id: b.id, name: b.name, group: "stuff", cat, typeLabel: STUFF.find((s) => s[0] === cat)![1], slot: "consumable", hands: "", level: 0, req: 0, allowed: null, rec: [], faction: "", tier: 0, tiers: 0, best: false, hi: false, base: b.id });
  }
  // маунты: выдаются командой admin:give { mount }; тип записи «stuff» без уровня и снаряжения, вид (cat) — ярус
  for (const m of Object.values(MOUNTS)) push({ key: "mt:" + m.id, kind: "stuff", id: m.id, name: m.name, group: "mount", cat: m.tier, typeLabel: `${MOUNT_TIERS[m.tier]} · ×${m.speed}${m.flying ? " · летающий" : ""} · ${MOUNT_SOURCES[m.source]}`, slot: "consumable", hands: "", level: 0, req: 0, allowed: null, rec: [], faction: m.faction, tier: 0, tiers: 0, best: false, hi: false, base: "hp_potion" });
  BY_KEY = new Map(out.map((e) => [e.key, e]));
  return (CATALOG = out);
}

/** Рабочая вкладка: хозяин даёт отправку сообщений и имя админа. */
export interface GiveHost { send(type: string, msg?: object): void; selfName(): string }
type Player = { name: string; cls: string; level: number };
interface State {
  group: Group | "all"; cat: string; slot: string; armor: string; cls: string; fac: string; lo: number; hi: number; q: string; sort: string; limit: number;
  sel: string; rarity: number; ilvl: number | null; plus: number; qty: number; who: string;
}
/** Какие фильтры пропустить при подсчёте (для счётчиков на чипах и подсказки «скрыто фильтром класса»). */
interface Skip { group?: boolean; cat?: boolean; cls?: boolean }
type StatusKind = "" | "ok" | "warn" | "bad";

/** Названия случайных характеристик для строки «+N случайных аффиксов». */
const AFFIX_SHORT: Record<string, string> = { str: "сила", agi: "ловкость", int: "интеллект", vit: "выносливость", hp: "здоровье", crit: "крит" };
export const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export class GiveTab {
  readonly el = document.createElement("div");
  private players: Player[] = [];
  private st: State = { group: "all", cat: "", slot: "", armor: "", cls: "auto", fac: "", lo: 1, hi: MAX_LEVEL, q: "", sort: "lvl-desc", limit: PAGE, sel: "", rarity: 2, ilvl: null, plus: 0, qty: 1, who: "" };
  private rcKey = "";
  /** Введённый уровень предмета подняли до уровня модели: поясняем это, пока админ не тронул поле. */
  private ilClamped = false;
  private stat: { text: string; kind: StatusKind } = { text: "", kind: "" };

  constructor(private host: GiveHost) {
    this.el.className = "ag";
    this.el.innerHTML = SHELL;
    const el = this.el;
    el.addEventListener("click", (e) => this.onClick(e));
    el.addEventListener("input", (e) => this.onInput(e));
    el.addEventListener("change", (e) => this.onChange(e));
    el.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return e.stopPropagation();
      const card = t.closest<HTMLElement>("[data-k]");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); this.select(card.dataset.k!); }
    });
    // иконки моделей рисует генератор ассетов; пока файла нет — иконка базы (как у обычной вещи)
    el.addEventListener("error", (e) => {
      const i = e.target;
      if (!(i instanceof HTMLImageElement)) return;
      if (i.dataset.fb && !i.src.endsWith(i.dataset.fb)) i.src = i.dataset.fb;
      else i.parentElement?.classList.add("noimg"); // нет и запасной иконки: буква вместо картинки
    }, true);
    this.q<HTMLInputElement>("#ag-lo").value = "1";
    this.q<HTMLInputElement>("#ag-hi").value = String(MAX_LEVEL);
    catalog();
    this.renderFilters();
    this.renderList(true);
    this.renderItem();
    this.renderWho();
  }

  bind(net: Net) {
    // итог выдачи приходит одним сообщением: выдано ли, надето ли и почему нет
    net.on("admin:give:result", (r) => this.status(r.text, r.kind === "info" ? "ok" : r.kind === "warn" ? "warn" : "bad"));
  }
  /** Вкладку открыли: явно выбранный на «Игроки» получатель всегда ставится, иначе остаётся прежний (или сам админ). */
  activate(target: string) {
    if (target) this.st.who = target;
    else if (!this.st.who) this.st.who = this.host.selfName();
    this.renderWho();
    this.recipientChanged(true);
  }
  setPlayers(p: Player[]) {
    this.players = p;
    this.renderWho();
    this.recipientChanged(false);
  }

  // ---------- вспомогательное ----------
  private q<T extends Element = HTMLElement>(sel: string): T { return this.el.querySelector<T>(sel)!; }
  private rc(): Player | undefined {
    const w = this.st.who.trim().toLowerCase();
    return w ? this.players.find((p) => p.name.toLowerCase() === w) : undefined;
  }
  private rcClass(): ClassId | undefined { const c = this.rc()?.cls; return c && CLASSES[c as ClassId] ? (c as ClassId) : undefined; }
  private filterClass(): ClassId | null {
    const c = this.st.cls;
    return c === "all" ? null : c === "auto" ? this.rcClass() ?? null : (c as ClassId);
  }
  private entry(): Entry | undefined { return BY_KEY.get(this.st.sel); }
  /** Редкость обычной модели и базы — 0..2: легендарной она бывает только у легендарок из каталога (так же на сервере). */
  private rarityOf(e: Entry): number { return e.kind === "unique" ? 2 : e.kind === "legend" ? 3 : e.kind === "stuff" ? 0 : Math.min(2, this.st.rarity); }
  private editable(e: Entry) { return e.kind === "model" || e.kind === "base"; }
  private ilvlOf(e: Entry): number {
    const v = this.st.ilvl ?? e.level;
    return e.kind === "model" ? Math.max(v, e.level) : e.kind === "base" ? v : e.level;
  }
  private status(text: string, kind: StatusKind = "") {
    this.stat = { text, kind };
    this.applyStatus();
  }
  private applyStatus() {
    const s = this.el.querySelector<HTMLElement>("#ag-status");
    if (s) { s.textContent = this.stat.text; s.className = "ag-status" + (this.stat.kind ? " " + this.stat.kind : ""); }
  }
  private iconSrc(e: Entry, rarity: number): { src: string; fb: string } {
    if (e.group === "mount") return { src: icon("mount_" + e.id), fb: icon("mount_horse") };
    const uid = "adm-" + e.id;
    const real = e.kind === "model" ? iconFor({ base: e.base, stats: {}, uid, rarity, model: e.id }) : e.kind === "unique" ? iconFor({ base: e.base, stats: {}, uid, rarity, unique: e.id }) : e.kind === "legend" ? iconFor({ base: e.base, stats: {}, uid, rarity, legendary: e.id }) : iconFor({ base: e.base, stats: {}, uid, rarity });
    const fb = iconFor({ base: e.base, stats: {}, uid, rarity: Math.min(2, rarity) });
    return { src: icon(real), fb: icon(fb) };
  }
  /** Предмет для предпросмотра. У модели и базы точны основные характеристики и гарантированные аффиксы, остальные аффиксы — random/pool. */
  private build(e: Entry): GearPreview {
    const s = this.st;
    if (e.kind === "model" || e.kind === "base") {
      const g = previewGear(e.id, this.ilvlOf(e), this.rarityOf(e) as Rarity, s.plus);
      if (g) return g;
    }
    const it = e.group === "mount" ? makeItem("hp_potion", 1, 0, () => 0.5) : e.kind === "unique" ? makeUnique(e.id) : e.kind === "legend" ? makeLegendary(e.id) : makeItem(e.id, 1, 0, () => 0.5);
    if (s.plus && e.kind !== "stuff") it.plus = s.plus;
    return { item: it, fixed: [], random: 0, pool: [] };
  }
  /** Почему получатель не наденет предмет: класс — жёстко, уровень — мягко. Решает canEquip по настоящему требованию вещи. */
  private why(e: Entry): { kind: "cls" | "lvl"; text: string } | null {
    const rc = this.rc(), cls = this.rcClass();
    if (!rc || !cls || e.kind === "stuff") return null;
    if (!canEquip({ base: e.base, req: e.req } as Item, cls, rc.level)) return null;
    if (e.allowed && !e.allowed.includes(cls)) return { kind: "cls", text: `Не для класса «${CLASSES[cls].name}»` };
    return { kind: "lvl", text: `Нужен ур. ${e.req} · сейчас ${rc.level}` };
  }

  // ---------- события ----------
  private onClick(ev: Event) {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-a],[data-k]");
    if (!t) return;
    const a = t.dataset.a, v = t.dataset.v ?? "";
    const s = this.st;
    if (!a) return this.select(t.dataset.k!);
    switch (a) {
      case "grp":
        s.group = v as State["group"]; s.cat = "";
        if (!["all", "unique", "legend"].includes(v)) s.slot = "";
        if (!["all", "armor", "unique", "legend"].includes(v)) s.armor = "";
        return this.filtersChanged();
      case "cat": s.cat = s.cat === v ? "" : v; return this.filtersChanged();
      case "slot": s.slot = v; return this.filtersChanged();
      case "armor": s.armor = v; return this.filtersChanged();
      case "fac": s.fac = v; return this.filtersChanged();
      case "cls-all": s.cls = "all"; return this.filtersChanged();
      case "top90": s.lo = s.lo >= 90 ? 1 : 90; s.hi = MAX_LEVEL; this.q<HTMLInputElement>("#ag-lo").value = String(s.lo); this.q<HTMLInputElement>("#ag-hi").value = String(MAX_LEVEL); return this.filtersChanged();
      case "reset": {
        Object.assign(s, { group: "all", cat: "", slot: "", armor: "", cls: "auto", fac: "", lo: 1, hi: MAX_LEVEL, q: "", sort: "lvl-desc" });
        this.q<HTMLInputElement>("#ag-lo").value = "1"; this.q<HTMLInputElement>("#ag-hi").value = String(MAX_LEVEL); this.q<HTMLInputElement>("#ag-q").value = "";
        return this.filtersChanged();
      }
      case "more": s.limit += PAGE; return this.renderList(false);
      case "rar": s.rarity = Math.min(2, Number(v)); this.renderList(false); return this.renderItem();
      case "ilvl-rc": { const rc = this.rc(); if (rc) { s.ilvl = rc.level; this.ilClamped = false; } return this.renderItem(); }
      case "ilvl-model": s.ilvl = null; this.ilClamped = false; return this.renderItem();
      case "ilvl-100": s.ilvl = MAX_LEVEL; this.ilClamped = false; return this.renderItem();
      case "plus": s.plus = Number(v); return this.renderItem();
      case "qty": s.qty = Number(v); return this.renderItem();
      case "give": return this.give(false);
      case "give-eq": return this.give(true);
      case "players": this.host.send("admin:players"); return;
      case "gold": return this.host.send("admin:gold", { name: s.who.trim(), v: Number(this.q<HTMLInputElement>("#ag-gold").value) });
      case "xp": this.host.send("admin:xp", { name: s.who.trim(), xp: Number(this.q<HTMLInputElement>("#ag-xp").value) }); return this.host.send("admin:players");
      case "lv": this.host.send("admin:xp", { name: s.who.trim(), level: Number(this.q<HTMLInputElement>("#ag-lv").value) }); return this.host.send("admin:players");
      case "lv-need": // «поднять уровень» из подсказки под кнопками выдачи; список игроков обновится ответом на второй запрос
        this.host.send("admin:xp", { name: s.who.trim(), level: Number(v) });
        this.host.send("admin:players");
        return this.status(`Уровень получателя поднимается до ${v}…`);
    }
  }
  private onInput(ev: Event) {
    const t = ev.target as HTMLInputElement, s = this.st;
    const num = (min: number, max: number) => (t.value.trim() === "" || !Number.isFinite(Number(t.value)) ? null : Math.max(min, Math.min(max, Math.round(Number(t.value)))));
    switch (t.id) {
      case "ag-q": s.q = t.value; return this.filtersChanged(false);
      case "ag-lo": { const v = num(1, MAX_LEVEL); if (v !== null) { s.lo = v; this.q("#ag-top").setAttribute("aria-pressed", String(v >= 90)); this.filtersChanged(false); } return; }
      case "ag-hi": { const v = num(1, MAX_LEVEL); if (v !== null) { s.hi = v; this.filtersChanged(false); } return; }
      case "ag-who": s.who = t.value; this.syncWhoSelect(); return this.recipientChanged(false);
      case "ag-ilvl": { const v = num(1, MAX_LEVEL); if (v !== null) { s.ilvl = v; this.ilClamped = false; this.renderPreview(); this.renderIlvlInfo(); } return; }
      case "ag-qty": { const v = num(1, 99); if (v !== null) { s.qty = v; this.renderPreview(); } return; }
    }
  }
  private onChange(ev: Event) {
    const t = ev.target as HTMLInputElement, s = this.st;
    switch (t.id) {
      case "ag-cls": s.cls = t.value; return this.filtersChanged();
      case "ag-sort": s.sort = t.value; return this.filtersChanged();
      case "ag-pick": { s.who = t.value; this.q<HTMLInputElement>("#ag-who").value = t.value; return this.recipientChanged(false); }
      case "ag-ilvl": { // нормализация без полной перерисовки: иначе клик по соседней кнопке теряется
        const e = this.entry();
        if (e) {
          if (e.kind === "model" && s.ilvl !== null && s.ilvl < e.level) { s.ilvl = null; this.ilClamped = true; }
          t.value = String(this.ilvlOf(e));
          this.renderPreview();
          this.renderIlvlInfo();
        }
        return;
      }
      case "ag-qty": t.value = String(this.st.qty); return;
      case "ag-lo": case "ag-hi": t.value = String(t.id === "ag-lo" ? s.lo : s.hi); return;
    }
  }
  private select(key: string) {
    if (!BY_KEY.has(key)) return;
    this.el.querySelector(".ag-card.sel")?.classList.remove("sel");
    // ручной уровень относится к прежнему предмету: у нового берём уровень его модели
    if (key !== this.st.sel) { this.st.ilvl = null; this.ilClamped = false; }
    this.st.sel = key;
    this.el.querySelector(`.ag-card[data-k="${key}"]`)?.classList.add("sel");
    this.status("");
    this.renderItem();
  }
  private filtersChanged(full = true) {
    this.st.limit = PAGE;
    if (full) this.renderFilters();
    else this.renderChips();
    this.renderList(true);
  }
  /** Получатель или его данные изменились: перерисовываем то, что от них зависит (только если класс или уровень другие). */
  private recipientChanged(force: boolean) {
    const rc = this.rc(), key = rc ? `${rc.cls}:${rc.level}` : "";
    const changed = key !== this.rcKey;
    this.rcKey = key;
    this.renderWhoInfo();
    if (!changed && !force) return;
    this.renderFilters();
    this.renderList(false);
    this.renderItem();
  }

  // ---------- выдача ----------
  private give(equip: boolean) {
    const e = this.entry(), s = this.st, who = s.who.trim();
    if (!e || !who) return;
    const msg: Record<string, unknown> = { name: who };
    if (e.kind === "model") Object.assign(msg, { model: e.id, rarity: this.rarityOf(e), ilvl: this.ilvlOf(e), plus: s.plus });
    else if (e.kind === "base") Object.assign(msg, { base: e.id, rarity: this.rarityOf(e), ilvl: this.ilvlOf(e), plus: s.plus });
    else if (e.kind === "unique") Object.assign(msg, { unique: e.id, plus: s.plus });
    else if (e.kind === "legend") Object.assign(msg, { legendary: e.id, plus: s.plus });
    else if (e.group === "mount") Object.assign(msg, { mount: e.id });
    else Object.assign(msg, { base: e.id, qty: s.qty });
    if (equip) msg.equip = true;
    this.status("Отправлено…");
    this.host.send("admin:give", msg);
  }

  // ---------- отрисовка: фильтры ----------
  private chip(label: string, on: boolean, a: string, v: string, o: { n?: number; title?: string } = {}) {
    return `<button class="ag-chip${o.n === 0 ? " zero" : ""}" aria-pressed="${on}" data-a="${a}" data-v="${esc(v)}"${o.title ? ` title="${esc(o.title)}"` : ""}>${esc(label)}${o.n === undefined ? "" : `<small>${o.n}</small>`}</button>`;
  }
  private ctx() {
    const s = this.st;
    return { s, cls: this.filterClass(), q: s.q.trim().toLowerCase(), full: s.lo <= 1 && s.hi >= MAX_LEVEL };
  }
  private match(e: Entry, c: ReturnType<GiveTab["ctx"]>, skip: Skip = {}): boolean {
    const { s, cls, q, full } = c;
    if (!skip.group && s.group !== "all" && e.group !== s.group) return false;
    if (!skip.cat && s.cat && e.cat !== s.cat) return false;
    if (s.slot && e.slot !== s.slot) return false;
    if (s.armor && e.armorType !== s.armor) return false;
    if (!skip.cls && cls && e.allowed && !e.allowed.includes(cls)) return false;
    if (s.fac && (s.fac === "none" ? e.faction !== "" : e.faction !== s.fac)) return false;
    if (e.kind === "stuff" ? !full : e.level < s.lo || e.level > s.hi) return false;
    return !q || e.hay.includes(q);
  }
  /** Чипы групп и видов: числа на них — по текущим фильтрам (кроме самой группы и вида), поэтому «0» значит «здесь пусто при этих фильтрах». */
  private renderChips() {
    const s = this.st, cat = catalog(), c = this.ctx();
    const gc = new Map<string, number>(), cc = new Map<string, number>();
    const kinds = new Map<string, number>(); // все виды выбранной группы, даже с нулём
    let total = 0;
    for (const e of cat) {
      if (e.group === s.group) kinds.set(e.cat, 0);
      if (!this.match(e, c, { group: true, cat: true })) continue;
      total++;
      gc.set(e.group, (gc.get(e.group) ?? 0) + 1);
      if (e.group === s.group) cc.set(e.cat, (cc.get(e.cat) ?? 0) + 1);
    }
    this.q("#ag-groups").innerHTML = this.chip("Всё", s.group === "all", "grp", "all", { n: total }) + GROUPS.map(([g, l]) => this.chip(l, s.group === g, "grp", g, { n: gc.get(g) ?? 0 })).join("");
    // виды предметов выбранной группы; броня — по слотам
    const wrap = this.q("#ag-cats-wrap");
    wrap.hidden = s.group === "all";
    if (s.group === "all") return;
    const order = s.group === "mount" ? Object.keys(MOUNT_TIERS) : s.group === "stuff" ? STUFF.map((x) => x[0]) : Object.keys(BASE_ITEMS);
    const ids = [...kinds.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const label = (k: string) => (s.group === "mount" ? MOUNT_TIERS[k as "common"] : s.group === "stuff" ? STUFF.find((x) => x[0] === k)![1] : BASE_ITEMS[k] && !BASE_ITEMS[k].armorType && s.group === "armor" ? "Простой" : typeLabel(k));
    const chipOf = (k: string) => this.chip(label(k), s.cat === k, "cat", k, { n: cc.get(k) ?? 0, title: s.group === "mount" ? label(k) : typeLabel(k) });
    if (s.group === "armor") {
      this.q("#ag-cats").innerHTML = (["helmet", "armor", "boots"] as Slot[]).map((sl) => `<div class="ag-row"><span class="ag-rl">${SLOT_NAMES[sl]}</span>${ids.filter((k) => BASE_ITEMS[k].slot === sl).map(chipOf).join("")}</div>`).join("");
    } else this.q("#ag-cats").innerHTML = `<div class="ag-chips">${ids.map(chipOf).join("")}</div>`;
  }
  private renderFilters() {
    const s = this.st;
    this.renderChips();
    const slotRow = this.q("#ag-slot-wrap"), armorRow = this.q("#ag-armor-wrap");
    slotRow.hidden = !["all", "unique", "legend"].includes(s.group);
    armorRow.hidden = !["all", "armor", "unique", "legend"].includes(s.group);
    this.q("#ag-slots").innerHTML = this.chip("Любой", !s.slot, "slot", "") + SLOTS.map((sl) => this.chip(SLOT_NAMES[sl], s.slot === sl, "slot", sl)).join("");
    this.q("#ag-armor").innerHTML = ARMOR_CHIPS.map(([v, l]) => this.chip(l, s.armor === v, "armor", v)).join("");
    this.q("#ag-fac").innerHTML = [["", "Любой", ""], ["solgard", FACTIONS.solgard.name, FACTIONS.solgard.color], ["umbrath", FACTIONS.umbrath.name, FACTIONS.umbrath.color], ["none", "Нейтральный", FAC_NEUTRAL]]
      .map(([v, l, c]) => `<button class="ag-chip fac" style="--c:${c || "#e8e2d0"}" aria-pressed="${s.fac === v}" data-a="fac" data-v="${v}">${l}</button>`).join("");
    const rcn = this.rcClass();
    const byFac = (f: string) => (Object.values(CLASSES) as { id: ClassId; name: string; faction: string }[]).filter((c) => c.faction === f).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const sel = this.q<HTMLSelectElement>("#ag-cls");
    sel.innerHTML = `<option value="auto">${rcn ? "Получателя: " + esc(CLASSES[rcn].name) : "Получателя (не выбран)"}</option><option value="all">Все классы</option><optgroup label="Сольгард">${byFac("solgard")}</optgroup><optgroup label="Умбрат">${byFac("umbrath")}</optgroup>`;
    sel.value = s.cls;
    this.q("#ag-top").setAttribute("aria-pressed", String(s.lo >= 90));
    const sort = this.q<HTMLSelectElement>("#ag-sort");
    if (!sort.options.length) sort.innerHTML = SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    sort.value = s.sort;
  }
  private filtered(): Entry[] {
    const s = this.st, c = this.ctx();
    const out = catalog().filter((e) => this.match(e, c));
    const nm = (a: Entry, b: Entry) => a.name.localeCompare(b.name, "ru");
    const ty = (a: Entry, b: Entry) => a.typeLabel.localeCompare(b.typeLabel, "ru");
    if (s.sort === "lvl-asc") out.sort((a, b) => Number(a.kind === "stuff") - Number(b.kind === "stuff") || a.level - b.level || ty(a, b) || nm(a, b));
    else if (s.sort === "name") out.sort(nm);
    else if (s.sort === "cat") out.sort((a, b) => ty(a, b) || b.level - a.level || nm(a, b));
    else out.sort((a, b) => b.level - a.level || ty(a, b) || nm(a, b));
    return out;
  }

  // ---------- отрисовка: список ----------
  private renderList(toTop: boolean) {
    const list = this.filtered(), s = this.st, c = this.ctx();
    const part = list.slice(0, s.limit), rest = list.length - part.length;
    // сколько предметов скрыл только фильтр класса: показываем и предлагаем снять
    const hid = c.cls ? catalog().filter((e) => !this.match(e, c) && this.match(e, c, { cls: true })).length : 0;
    const clsName = c.cls ? CLASSES[c.cls].name : "";
    const hidTxt = hid ? ` · <button class="ag-link" data-a="cls-all" title="Показать предметы для всех классов">скрыто фильтром класса «${esc(clsName)}»: ${hid} — показать</button>` : "";
    this.q("#ag-count").innerHTML = `Найдено ${list.length} из ${catalog().length}${rest > 0 ? ` · показано ${part.length}` : ""}${hidTxt}`;
    const box = this.q("#ag-cards");
    box.innerHTML = part.length
      ? part.map((e) => this.card(e)).join("") + (rest > 0 ? `<button class="btn ag-more" data-a="more">Показать ещё ${Math.min(PAGE, rest)} (осталось ${rest})</button>` : "")
      : `<div class="ag-empty">Ничего не найдено.${hid ? `<div class="ag-emptyhint">Скрыто фильтром класса «${esc(clsName)}»: ${hid}.</div><button class="btn small" data-a="cls-all">Показать для всех классов</button> ` : ""}<button class="btn small" data-a="reset">Сбросить фильтры</button></div>`;
    if (toTop) box.scrollTop = 0;
    const off = this.el.querySelector<HTMLElement>("#ag-offlist"), cur = this.entry();
    if (off) off.hidden = !cur || this.match(cur, c);
  }
  private card(e: Entry): string {
    const r = this.rarityOf(e), ic = this.iconSrc(e, r), why = this.why(e), cls = this.rcClass();
    const slotPart = e.group === "stuff" ? "" : GROUP_TYPE[e.slot] === "Броня" ? SLOT_NAMES[e.slot as Slot] : GROUP_TYPE[e.slot];
    const extra = /ручн/i.test(e.typeLabel) ? "" : e.hands === "two" ? "двуручное" : e.hands === "pair" ? "парное" : e.hands === "one" ? "одноручное" : e.armorType ? ARMOR_T[e.armorType] : "";
    const line = [e.kind === "unique" ? "Уникальный" : e.kind === "legend" ? "Легендарный" : "", e.typeLabel, slotPart, extra].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ");
    const tierLine = e.kind === "model" ? `Ур. ${e.level} · тир ${e.tier}/${e.tiers}` : e.kind === "stuff" ? "Расходуемое" : e.kind === "base" ? "Старая база · без модели" : e.kind === "legend" ? `Ярус ${LEGENDARIES[e.id].tier} · ур. ${e.level} · треб. ${e.req}` : `Ур. ${e.level} · награда босса`;
    const classes = e.allowed ? e.allowed.map((c) => `<span class="ag-tag${cls === c ? " me" : ""}" title="${esc(CLASSES[c].name)}">${SHORT[c]}</span>`).join("") : e.group === "stuff" ? "" : `<span class="ag-tag any">все классы</span>`;
    const rec = cls && e.rec.includes(cls) && e.kind === "model" ? `<span class="ag-rec" title="Рекомендовано классу получателя">★ для класса</span>` : "";
    const fac = e.faction ? `<span class="ag-fac" style="--c:${FACTIONS[e.faction as "solgard"]?.color ?? FAC_NEUTRAL}">${esc(FACTIONS[e.faction as "solgard"]?.name ?? e.faction)}</span>` : e.kind === "model" ? `<span class="ag-fac" style="--c:${FAC_NEUTRAL}">Нейтральный</span>` : "";
    const badge = this.badge(e, false);
    const bar = e.kind === "model" ? `<i class="ag-bar${e.best ? " top" : ""}" style="--p:${Math.round((e.tier / e.tiers) * 100)}%"></i>` : "";
    return `<div class="ag-card${e.best ? " top" : e.hi ? " hi90" : ""}${e.key === this.st.sel ? " sel" : ""}${why ? " dim-" + why.kind : ""}" data-k="${e.key}" tabindex="0" role="button" title="${esc(e.name)} (${esc(e.id)})">
      <div class="ag-ico r${r}" data-ch="${esc(e.name.charAt(0))}"><img src="${ic.src}" data-fb="${ic.fb}" alt="" loading="lazy" width="64" height="64">${e.kind === "stuff" ? "" : `<b class="ag-lv${e.level >= 90 ? " hi" : ""}">${e.level}</b>`}</div>
      <div class="ag-ci"><div class="ag-nm" style="color:${RARITY_COLORS[r]}">${esc(e.name)}</div><div class="ag-ty">${esc(line)}</div>
      <div class="ag-tr">${badge}${esc(tierLine)}</div>${bar}
      <div class="ag-tags">${classes}${fac}${rec}</div>${why ? `<div class="ag-why ${why.kind}">${why.kind === "cls" ? "⛔" : "⏳"} ${esc(why.text)}</div>` : ""}</div></div>`;
  }
  /** Метка предмета: ЛУЧШИЙ — максимальный тир категории; 90+ — остальные от 90 уровня; ЛЕГЕНДА и БОСС — фиксированные предметы. */
  private badge(e: Entry, inline: boolean): string {
    const i = inline ? " inl" : "";
    if (e.best) return `<span class="ag-topb${i}" title="Лучший (максимальный) тир своей категории">★ ЛУЧШИЙ</span>`;
    if (e.kind === "legend") return `<span class="ag-topb leg${i}" title="Легендарка яруса ${LEGENDARIES[e.id].tier}: ур. предмета ${e.level}, требуется ${e.req}">ЛЕГЕНДА ${LEGENDARIES[e.id].tier}</span>`;
    if (e.kind === "unique") return `<span class="ag-topb boss${i}">БОСС</span>`;
    if (e.hi) return `<span class="ag-topb n90${i}" title="Уровень 90 и выше, но не максимальный тир категории">90+</span>`;
    return "";
  }

  // ---------- отрисовка: получатель ----------
  private renderWho() {
    const sel = this.q<HTMLSelectElement>("#ag-pick");
    sel.innerHTML = `<option value="">— игроки онлайн (${this.players.length}) —</option>` + this.players.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} — ${esc(CLASSES[p.cls as ClassId]?.name ?? p.cls)} ${p.level}</option>`).join("");
    this.q<HTMLInputElement>("#ag-who").value = this.st.who;
    this.syncWhoSelect();
    this.renderWhoInfo();
  }
  private syncWhoSelect() {
    const sel = this.q<HTMLSelectElement>("#ag-pick"), w = this.st.who.trim().toLowerCase();
    sel.value = this.players.find((p) => p.name.toLowerCase() === w)?.name ?? "";
  }
  private renderWhoInfo() {
    const rc = this.rc(), who = this.st.who.trim();
    const info = this.q("#ag-whoinfo");
    if (rc) {
      const c = CLASSES[rc.cls as ClassId];
      info.className = "ag-whoinfo";
      info.title = "";
      info.innerHTML = `<b style="color:${FACTIONS[c?.faction as "solgard"]?.color ?? "inherit"}">${esc(c?.name ?? rc.cls)}</b> · ур. ${rc.level} · ${esc(FACTIONS[c?.faction as "solgard"]?.name ?? "")}`;
    } else {
      info.className = "ag-whoinfo bad";
      info.textContent = who ? "нет в списке онлайн" : "выберите получателя";
      info.title = who ? "Выдача сработает, только если игрок в сети (↻ — обновить список)" : "";
    }
  }

  // ---------- отрисовка: выбранный предмет ----------
  /** Пояснение к уровню предмета: ниже уровня модели не бывает (ввели меньше или поле уже поправлено). */
  private ilvlNote(e: Entry): string {
    const v = this.st.ilvl ?? e.level;
    return e.kind === "model" && (v < e.level || this.ilClamped) ? `Ниже уровня модели не бывает: предмет будет ${e.level} ур.` : "";
  }
  private renderItem() {
    const box = this.q("#ag-item"), e = this.entry(), s = this.st;
    if (!e) { box.innerHTML = `<div class="ag-hint">Выберите предмет в списке.<br><small>Слева — фильтры. «★ ЛУЧШИЙ» отмечает максимальный тир категории, «90+» — прочие предметы от 90 уровня.</small></div>`; return; }
    const g = this.build(e), it = g.item, r = this.rarityOf(e), ic = this.iconSrc(e, r);
    const fixed = !this.editable(e), gear = e.kind !== "stuff", rc = this.rc();
    const slotName = gear ? SLOT_NAMES[e.slot as Slot] : "—";
    const facts = [
      gear ? `<span class="ag-fact"><i>Слот</i>${esc(slotName)}${e.hands === "two" ? ", две руки" : e.hands === "pair" ? ", парное" : ""}</span>` : "",
      e.kind === "model" ? `<span class="ag-fact"><i>Тир</i>${e.tier} из ${e.tiers}</span>` : "",
      e.kind === "legend" ? `<span class="ag-fact"><i>Ярус</i>${LEGENDARIES[e.id].tier} (${e.tier} из ${e.tiers}) · ур. ${e.level} · треб. ${e.req}</span>` : "",
      e.faction || e.kind === "model" ? `<span class="ag-fact"><i>Стиль</i>${esc(FACTIONS[e.faction as "solgard"]?.name ?? "нейтральный")}</span>` : "",
    ].join("");
    const rar = [0, 1, 2, 3].map((i) => {
      const locked = fixed || !gear || i === 3; // редкость 3 — только у легендарок из каталога
      return `<button class="ag-rb" style="--c:${RARITY_COLORS[i]}" aria-pressed="${r === i}" data-a="rar" data-v="${i}"${locked ? " disabled" : ""}${i === 3 && !fixed ? ` title="Легендарной редкости у обычных предметов нет: только у легендарок из каталога"` : ""}>${RARITY_NAMES[i]}</button>`;
    }).join("");
    const plus = Array.from({ length: MAX_PLUS + 1 }, (_, i) => `<button class="ag-pl${ENCHANT_THRESHOLDS.includes(i) ? " step" : ""}" aria-pressed="${s.plus === i}" data-a="plus" data-v="${i}" title="${i ? `+${i}${ENCHANT_THRESHOLDS.includes(i) ? ": новая ступень свечения (бирюзовая черта)" : ""}` : "без заточки"}">${i ? "+" + i : "0"}</button>`).join("");
    const ilvlV = s.ilvl ?? e.level;
    const badges = `${this.badge(e, true)}${gear ? `<span class="ag-ilvl${this.ilvlOf(e) >= 90 ? " hi" : ""}" id="ag-ilbadge">ур. предмета ${this.ilvlOf(e)}</span>` : ""}`;
    box.innerHTML = `
      <div class="ag-iscroll">
      <div class="ag-selhead"><div class="cell r${r} ag-big" data-ch="${esc(e.name.charAt(0))}"><img src="${ic.src}" data-fb="${ic.fb}" alt="">${gear && s.plus ? `<span class="plus">+${s.plus}</span>` : ""}</div>
        <div class="ag-selmain"><div class="ag-selname" style="color:${RARITY_COLORS[r]}">${esc(itemName(it))}</div>
        <div class="ag-ty">${esc(e.typeLabel)}${e.allowed ? " · " + esc(e.allowed.map((c) => SHORT[c]).join(", ")) : gear ? " · любой класс" : ""}</div>
        <div class="ag-badges">${badges}</div></div></div>
      <div class="ag-note warn" id="ag-offlist"${this.match(e, this.ctx()) ? " hidden" : ""}>Этого предмета нет в текущем списке: его скрывают фильтры слева.</div>
      <div class="ag-facts">${facts}</div>
      ${gear ? `<div class="ag-fld"><div class="ag-lb">Редкость</div><div class="ag-rars">${rar}</div>${fixed ? `<div class="ag-note">Предмет фиксированный: редкость и уровень заданы игрой, настраивается только заточка.</div>` : ""}</div>` : ""}
      ${gear && !fixed ? `<div class="ag-fld"><div class="ag-lb ag-lbv"><span>Уровень предмета <small>1–${MAX_LEVEL}</small></span><button class="ag-link" id="ag-ilman" data-a="ilvl-model" title="Вернуть уровень модели"${s.ilvl === null ? " hidden" : ""}>задано вручную ×</button></div>
        <div class="ag-ilrow"><input id="ag-ilvl" type="number" min="1" max="${MAX_LEVEL}" value="${ilvlV}">
        <button class="ag-chip" data-a="ilvl-rc"${rc ? "" : " disabled"} title="Уровень предмета = уровню получателя">= игрока</button><button class="ag-chip" id="ag-ilmodel" data-a="ilvl-model" aria-pressed="${s.ilvl === null}" title="Уровень модели${e.kind === "model" ? " (" + e.level + ")" : ""}">= модели</button><button class="ag-chip" data-a="ilvl-100">${MAX_LEVEL}</button></div>
        <div class="ag-note warn" id="ag-ilnote">${esc(this.ilvlNote(e))}</div></div>` : ""}
      ${gear ? `<div class="ag-fld"><div class="ag-lb ag-lbv"><span>Заточка <small>0–${MAX_PLUS}</small></span><span class="ag-plv${s.plus ? " on" : ""}">${s.plus ? "+" + s.plus : "0"}${s.plus ? ` <button class="ag-link" data-a="plus" data-v="0" title="Убрать заточку">сбросить ×</button>` : ""}</span></div><div class="ag-pls" style="--ench:${ENCHANT_COLOR}">${plus}</div>
        <div class="ag-note ench">${esc(fxText(e.slot as Slot, s.plus, it.legendary))}${nextStepText(e.slot as Slot, s.plus) ? " · " + esc(nextStepText(e.slot as Slot, s.plus)) : ""}</div></div>` : `<div class="ag-fld"><div class="ag-lb">Количество <small>1–99</small></div><div class="ag-ilrow"><input id="ag-qty" type="number" min="1" max="99" value="${s.qty}">${[1, 5, 20, 99].map((n) => `<button class="ag-chip" data-a="qty" data-v="${n}" aria-pressed="${s.qty === n}">${n}</button>`).join("")}</div></div>`}
      <div class="ag-prev" id="ag-prev"></div>
      </div>
      <div class="ag-actbar"><div class="ag-act"><button class="btn ag-give" data-a="give" id="ag-give">Выдать</button><button class="btn ag-give eq" data-a="give-eq" id="ag-give-eq">Выдать и надеть</button></div>
      <div class="ag-eqwhy" id="ag-eqwhy"></div>
      <div class="ag-status" id="ag-status"></div></div>`;
    this.renderPreview();
    this.applyStatus();
  }
  /** Поле «Уровень предмета» изменили: обновляем бейдж в шапке, предупреждение и метку «задано вручную» (поле ввода не пересоздаётся). */
  private renderIlvlInfo() {
    const e = this.entry();
    if (!e) return;
    const b = this.el.querySelector<HTMLElement>("#ag-ilbadge");
    if (b) { b.textContent = `ур. предмета ${this.ilvlOf(e)}`; b.classList.toggle("hi", this.ilvlOf(e) >= 90); }
    const n = this.el.querySelector<HTMLElement>("#ag-ilnote");
    if (n) n.textContent = this.ilvlNote(e);
    const man = this.el.querySelector<HTMLElement>("#ag-ilman");
    if (man) man.hidden = this.st.ilvl === null;
    this.el.querySelector("#ag-ilmodel")?.setAttribute("aria-pressed", String(this.st.ilvl === null));
  }
  /** Только предпросмотр и кнопки (поля ввода при наборе не пересоздаются). */
  private renderPreview() {
    const e = this.entry();
    if (!e) return;
    const g = this.build(e), it = g.item, s = this.st, rc = this.rc(), cls = this.rcClass();
    const b = BASE_ITEMS[it.base], gear = b.slot !== "consumable";
    const L: string[] = [];
    if (!gear) {
      L.push(`<div class="ag-d">Расходуемое · стопка до ${b.stack ?? 1} · выдаётся ${s.qty} шт.</div>`);
      if (b.id === "hp_potion") L.push(`<div>Восстанавливает 45% здоровья</div>`);
      else if (b.id === "mp_potion") L.push(`<div>Восстанавливает 50% маны</div>`);
      if (b.price) L.push(`<div class="ag-d">Цена у торговца: ${b.price} зол.</div>`);
    } else {
      L.push(`<div class="ag-d">${RARITY_NAMES[it.rarity]} · ${esc(itemTypeName(it))}${isTwoHanded(it.base) ? " (двуручное)" : ""} </div>`);
      const st = effStats(it);
      if (it.plus) L.push(`<div class="ag-st">Улучшение +${it.plus}</div>`);
      if (st.dmgMin) L.push(`<div>Урон: ${st.dmgMin}–${st.dmgMax}${it.plus ? ` <span class="ag-d">(без заточки ${it.stats.dmgMin}–${it.stats.dmgMax})</span>` : ""}</div>`);
      if (st.armor) L.push(`<div>Броня: ${st.armor}${it.plus ? ` <span class="ag-d">(без заточки ${it.stats.armor})</span>` : ""}</div>`);
      for (const [k, v] of Object.entries(st)) if (!["dmgMin", "dmgMax", "armor"].includes(k)) L.push(`<div class="ag-st">+${v}${k === "crit" ? "%" : ""} ${ITEM_STAT_NAMES[k as ItemStatKey]}</div>`);
      if (g.random > 0) L.push(`<div class="ag-rndline" title="Эти аффиксы сервер выбирает случайно при выдаче">🎲 +${g.random} ${plural(g.random, "случайный аффикс", "случайных аффикса", "случайных аффиксов")}: ${g.pool.map((k) => AFFIX_SHORT[k] ?? k).join(" / ")}</div>`);
      L.push(b.classes ? `<div class="${cls && !b.classes.includes(cls) ? "ag-warn" : "ag-d"}">Класс: ${esc(b.classes.map((c) => CLASSES[c].name).join(", "))}</div>` : `<div class="ag-d">Класс: любой</div>`);
      L.push(`<div class="${rc && it.req > rc.level ? "ag-warn" : "ag-d"}">Требуется уровень ${it.req}${rc && it.req > rc.level ? ` (у получателя ${rc.level})` : ""}</div>`);
      L.push(isBound(it) ? `<div class="ag-warn">Привязан к персонажу</div>` : `<div class="ag-d">Не привязан: можно передать и продать</div>`);
      if (it.legendary && LEGENDARIES[it.legendary]) L.push(`<div class="ag-leg">★ ${esc(LEGENDARIES[it.legendary].desc)}</div>`, `<div class="ag-lore">${esc(LEGENDARIES[it.legendary].lore)}</div>`);
      if (it.unique && UNIQUES[it.unique]) L.push(`<div class="ag-lore">${esc(UNIQUES[it.unique].lore)}</div>`);
      if (e.kind === "model" || e.kind === "base") {
        const n = g.fixed.length;
        L.push(`<div class="ag-d ag-rnd">${n ? `Основные характеристики и ${n === 1 ? "1 гарантированный аффикс" : `${n} гарантированных аффикса`} точные, их значения ±15%. Какие аффиксы сверх ${n} и их значения — случайны.` : g.random ? "Основные характеристики точные. Какие выпадут аффиксы и их значения — случайны (значения ±15%)." : "Основные характеристики точные; аффиксов у этой редкости нет."}</div>`);
      }
    }
    this.q("#ag-prev").innerHTML = L.join("");
    // кнопки
    const give = this.q<HTMLButtonElement>("#ag-give"), eq = this.q<HTMLButtonElement>("#ag-give-eq"), why = this.q("#ag-eqwhy");
    const who = s.who.trim();
    give.disabled = !who;
    give.textContent = gear ? "Выдать" : `Выдать ×${s.qty}`;
    eq.hidden = !gear;
    const wear = gear && rc ? canEquip(it, rc.cls as ClassId, rc.level) : null;
    eq.disabled = !who || !!wear;
    eq.title = wear ? `Не наденет: ${lcFirst(wear)}` : "Выдать и сразу надеть на получателя";
    // причину, почему «Выдать и надеть» недоступна, пишем текстом под кнопками
    if (!gear || !rc) why.innerHTML = "";
    else if (wear) {
      const wrongCls = !!b.classes && !b.classes.includes(rc.cls as ClassId);
      why.className = "ag-eqwhy bad";
      why.innerHTML = wrongCls
        ? `Не наденет: не для класса «${esc(CLASSES[rc.cls as ClassId]?.name ?? rc.cls)}»`
        : `Не наденет: нужен ${it.req} ур. (у получателя ${rc.level}) · <button class="ag-link" data-a="lv-need" data-v="${it.req}" title="Поднять получателю уровень до ${it.req}">поднять уровень</button>`;
    } else {
      why.className = "ag-eqwhy ok";
      why.textContent = "Получатель сможет надеть";
    }
  }
}

const SHELL = `
<aside class="ag-filters">
  <div class="ag-fl"><div class="ag-lb">Что выдать</div><div class="ag-chips" id="ag-groups"></div></div>
  <div class="ag-fl" id="ag-cats-wrap"><div class="ag-lb">Вид предмета</div><div id="ag-cats"></div></div>
  <div class="ag-fl"><div class="ag-lb">Кто может носить</div><select id="ag-cls"></select></div>
  <div class="ag-fl" id="ag-slot-wrap"><div class="ag-lb">Слот</div><div class="ag-chips" id="ag-slots"></div></div>
  <div class="ag-fl" id="ag-armor-wrap"><div class="ag-lb">Тип брони</div><div class="ag-chips" id="ag-armor"></div></div>
  <div class="ag-fl"><div class="ag-lb">Стиль фракции</div><div class="ag-chips" id="ag-fac"></div></div>
  <div class="ag-fl"><div class="ag-lb">Уровень предмета</div><div class="ag-rng"><input id="ag-lo" type="number" min="1" max="${MAX_LEVEL}"><span>—</span><input id="ag-hi" type="number" min="1" max="${MAX_LEVEL}"></div></div>
  <button class="btn small" data-a="reset">Сбросить фильтры</button>
</aside>
<section class="ag-main">
  <div class="ag-bar2"><input id="ag-q" class="ag-search" placeholder="Поиск по названию или id…" autocomplete="off"><button class="ag-chip top" id="ag-top" data-a="top90" title="Только предметы от 90 уровня">★ от 90 ур.</button><select id="ag-sort" title="Сортировка"></select></div>
  <div class="ag-count" id="ag-count"></div>
  <div class="ag-cards" id="ag-cards"></div>
</section>
<aside class="ag-panel">
  <div class="ag-fl ag-whobox"><div class="ag-lb ag-lbrow">Кому выдать<span id="ag-whoinfo"></span></div>
    <select id="ag-pick"></select>
    <div class="ag-whorow"><input id="ag-who" placeholder="или введите имя героя" autocomplete="off" maxlength="16"><button class="ag-chip" data-a="players" title="Обновить список онлайн">↻</button></div>
  </div>
  <div id="ag-item"></div>
  <details class="ag-extra"><summary>Золото, опыт, уровень</summary>
    <div class="ag-whorow"><input id="ag-gold" type="number" value="1000"><button class="btn small" data-a="gold">Золото</button></div>
    <div class="ag-whorow"><input id="ag-xp" type="number" value="1000"><button class="btn small" data-a="xp">Опыт</button></div>
    <div class="ag-whorow"><input id="ag-lv" type="number" min="1" max="${MAX_LEVEL}" value="${MAX_LEVEL}"><button class="btn small" data-a="lv">Поднять до уровня</button></div>
  </details>
</aside>`;
