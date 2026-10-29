/**
 * Смотритель зверинца (задача 150): каталог всех питомцев — вид, роль, ярус, умения, цена и условия; чего не хватает; «Купить».
 * Питомец приходит «Печатью питомца» в сумку (изучение — клик по печати). Карточки — как у конюшего (styles/shop.css .win-stable).
 * Всё проверяет сервер (server/src/game/menagerie.ts); здесь — тот же расчёт keeperOffer для показа.
 */
import { npcRefuses } from "./npcGate";
import { gold, formatNumber } from "./gold";
import { tabs, type TabsHandle } from "./kit";
import { bossesKilled, keeperOffer, petNextGain, petSealBase, petStats, PET_IDS, PET_KEEPERS, PET_ROLES, PET_TIERS, PETS, type PetDef, type PetTier } from "../../../shared/pets";
import { TIER_COLOR } from "../../../shared/mounts";
import { FACTIONS, type FactionId } from "../../../shared/factions";
import type { SelfState } from "../../../shared/protocol";
import type { Net } from "../net";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
const TIER_ORDER: PetTier[] = ["common", "uncommon", "rare", "epic"];
const TIER_PLURAL: Record<PetTier, string> = { common: "Обычные", uncommon: "Необычные", rare: "Редкие", epic: "Эпические" };
type Tab = "all" | "ready" | "own";

export class MenagerieUI {
  private win = document.createElement("div");
  private body: HTMLElement;
  private foot: HTMLElement;
  private tabsH: TabsHandle;
  private tab: Tab = "all";
  private net!: Net;
  private drawn = "";
  private who = PET_KEEPERS[0];
  constructor(root: HTMLElement, private showInv: () => void) {
    this.win.className = "panel win l win-pets win-stable";
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span></span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="tabs pets-tabs" aria-label="Каталог"><button class="tab" data-tab="all" aria-selected="true">Все</button><button class="tab" data-tab="ready">Доступно</button><button class="tab" data-tab="own">Мои</button></div>
      <div class="body"></div><div class="win-foot"></div>`;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.tabsH = tabs(this.win.querySelector<HTMLElement>(".pets-tabs")!, (key) => { this.tab = key as Tab; this.drawn = ""; this.update(); });
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
    net.on("switch", () => this.close());
  }
  get isOpen() { return !this.win.hidden; }
  open(id?: string) {
    if (npcRefuses(this.net, "pets", id)) return;
    this.who = PET_KEEPERS.find((n) => n.id === id) ?? PET_KEEPERS[0];
    this.win.querySelector("h2 > span")!.textContent = this.who.name;
    this.win.hidden = false;
    this.drawn = "";
    this.showInv();
    this.update();
  }
  close(): boolean { const was = !this.win.hidden; this.win.hidden = true; return was; }

  update() {
    if (this.win.hidden) return;
    const s = this.net?.self;
    if (!s) return;
    const key = JSON.stringify([this.who.id, this.tab, s.gold, s.level, s.rep, s.marks, s.pets, s.bossKills, s.inventory.map((it) => it && it.base)]);
    if (key === this.drawn) return;
    this.drawn = key;
    this.tabsH.select(this.tab);
    const secs: string[] = [];
    for (const tier of TIER_ORDER) {
      const rows = PET_IDS.map((id) => PETS[id]).filter((d) => (d.tier ?? "common") === tier).filter((d) => {
        const o = keeperOffer(d, s);
        return this.tab === "all" || (this.tab === "own" ? o.owned : !o.owned && (o.canBuy || o.sealInBag));
      }).map((d) => this.row(d, s));
      if (rows.length) secs.push(`<section class="sec"><h3 class="sec-h" style="color:${TIER_COLOR[tier]}">${TIER_PLURAL[tier]}</h3><div class="st-cards">${rows.join("")}</div></section>`);
    }
    this.body.innerHTML = `<p class="npc-say">${esc(this.who.greeting ?? "")}</p>${secs.join("") || `<p class="note">Здесь пока пусто</p>`}`;
    const cell = (label: string, value: string) => `<div class="st-stat"><span class="st-stat-l">${label}</span><span class="st-stat-v">${value}</span></div>`;
    this.foot.innerHTML = `<div class="st-stats">${cell("Репутация фракции", formatNumber(s.rep ?? 0))}${cell("Знаки Полей", formatNumber(s.marks ?? 0))}${cell("Боссов побеждено", formatNumber(bossesKilled(s)))}${cell("Золото", gold(s.gold))}</div>`;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>("button[data-buy]")) b.onclick = () => this.net.send("pet:buy", { id: b.dataset.buy });
    for (const b of this.body.querySelectorAll<HTMLButtonElement>("button[data-learn]")) {
      b.onclick = () => {
        const i = s.inventory.findIndex((it) => !!it && it.base === petSealBase(b.dataset.learn!));
        if (i >= 0) this.net.send("use", { index: i });
      };
    }
  }

  /** Карточка: значок | имя, ярус, роль и фракция; уровень, здоровье и урон на уровне продажи; умения; условия | кнопка. */
  private row(d: PetDef, s: SelfState): string {
    const o = keeperOffer(d, s);
    const tier = d.tier ?? "common";
    const foe = !!d.faction && d.faction !== s.faction, low = s.level < d.level;
    const fac = d.faction ? ` · ${esc(FACTIONS[d.faction as FactionId]?.name ?? d.faction)}` : "";
    const st = petStats(d, d.level), gain = petNextGain(d, d.level);
    const stats = `<span class="${low && !o.owned ? "c-bad" : ""}">ур. ${d.level}</span> · здоровье ${formatNumber(st.maxHp)} · урон ${Math.round(st.dmg)} <span class="c-dim">(+${gain.dmg} урона, +${gain.hp} здоровья за уровень)</span>`;
    const skills = d.skills.map((k) => `<b>${esc(k.name)}</b> — ${esc(k.desc)}`).join(" · ");
    let need = "";
    if (o.owned) need = `<span class="c-ok">В коллекции · ур. ${(s.pets?.[d.id] as { level: number } | undefined)?.level ?? d.level}</span>`;
    else if (foe) need = `<span class="c-bad">Только для другой фракции</span>`;
    else if (o.sealInBag) need = `<span class="c-warn">Печать в сумке — изучите её</span>`;
    else {
      const n = d.need, parts: string[] = [];
      if (n?.rep) parts.push(`<span class="${(s.rep ?? 0) >= n.rep ? "c-ok" : "c-bad"}">репутация ${formatNumber(s.rep ?? 0)} / ${formatNumber(n.rep)}</span>`);
      if (n?.marks) parts.push(`<span class="${(s.marks ?? 0) >= n.marks ? "c-ok" : "c-bad"}">Знаки Полей ${s.marks ?? 0} / ${n.marks} (списываются)</span>`);
      if (n?.bosses) parts.push(`<span class="${bossesKilled(s) >= n.bosses ? "c-ok" : "c-bad"}">разных боссов ${bossesKilled(s)} / ${n.bosses}</span>`);
      need = parts.join(" · ") || `<span class="c-dim">Только золото</span>`;
    }
    let act = "";
    if (o.sealInBag && !o.owned) act = `<button class="btn small primary" data-learn="${d.id}">Изучить печать</button>`;
    else if (!o.owned) act = `<button class="btn small price" data-buy="${d.id}"${o.canBuy ? "" : ` disabled title="${esc(o.miss.join(", "))}"`}><span class="price-q">Купить</span>${gold(d.price)}</button>`;
    return `<div class="st-card${o.owned ? " owned" : foe || low ? " locked" : ""}" title="${esc(d.desc ?? "")}">
      <span class="st-icon"><img src="${icon(d.sprite)}" alt=""></span>
      <div class="st-main">
        <div class="st-line st-name" style="color:${TIER_COLOR[tier]}">${esc(d.name)}</div>
        <div class="st-line st-sub">${PET_TIERS[tier]} · ${esc(PET_ROLES[d.role ?? ""] ?? "")}${fac}</div>
        <div class="st-line st-sub">${stats}</div>
        <div class="st-line st-sub">${skills}</div>
        <div class="st-line st-need">${need}</div>
      </div>
      <div class="st-act">${act}</div></div>`;
  }
}
