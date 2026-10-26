/**
 * Конюший (задача 142): каталог всех маунтов — вид, скорость, ярус, где взять, чего не хватает; «Купить» (торговец и боевые за репутацию
 * и Знаки Полей) и «Собрать» (детали с боссов, Печати гладиатора). Маунт приходит «Печатью скакуна» в сумку. Всё проверяет сервер
 * (server/src/game/stable.ts); здесь — тот же расчёт stableOffer для показа.
 */
import { npcRefuses } from "./npcGate";
import { gold, formatNumber } from "./gold";
import { tabs, type TabsHandle } from "./kit";
import { MOUNTS, MOUNT_IDS, MOUNT_SOURCES, MOUNT_TIERS, MOUNT_CURRENCY, PARTS, TIER_COLOR, countBase, mountSprite, partBase, stableOffer, canRide, type MountDef, type MountTier } from "../../../shared/mounts";
import { STABLEMASTERS } from "../../../shared/stables";
import { FACTIONS, type FactionId } from "../../../shared/factions";
import type { SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { T } from "../../../shared/texts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
const TIER_ORDER: MountTier[] = ["common", "uncommon", "rare", "epic", "legendary"];
const TIER_PLURAL: Record<MountTier, string> = { common: T("ui.stable.688"), uncommon: T("ui.stable.689"), rare: T("ui.stable.690"), epic: T("ui.stable.691"), legendary: T("ui.stable.692") };
type Tab = "all" | "ready" | "own";

export class StableUI {
  private win = document.createElement("div");
  private body: HTMLElement;
  private foot: HTMLElement;
  private tabsH: TabsHandle;
  private tab: Tab = "all";
  private net!: Net;
  private drawn = "";
  private arenaRating = 0;
  private who = STABLEMASTERS[0];
  constructor(root: HTMLElement, private showInv: () => void) {
    this.win.className = "panel win l win-stable";
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span></span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="tabs stable-tabs" aria-label="Каталог"><button class="tab" data-tab="all" aria-selected="true">${T("ui.stable.693")}</button><button class="tab" data-tab="ready">${T("ui.stable.694")}</button><button class="tab" data-tab="own">${T("ui.stable.695")}</button></div>
      <div class="body"></div><div class="win-foot"></div>`;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.tabsH = tabs(this.win.querySelector<HTMLElement>(".stable-tabs")!, (key) => { this.tab = key as Tab; this.drawn = ""; this.update(); });
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
    net.on("switch", () => this.close());
    net.on("stable:info", (m: { arenaRating: number }) => { this.arenaRating = m.arenaRating | 0; this.drawn = ""; this.update(); });
  }
  get isOpen() { return !this.win.hidden; }
  open(id?: string) {
    if (npcRefuses(this.net, "stable", id)) return;
    this.who = STABLEMASTERS.find((n) => n.id === id) ?? STABLEMASTERS[0];
    this.win.querySelector("h2 > span")!.textContent = this.who.name;
    this.win.hidden = false;
    this.drawn = "";
    this.net.send("stable:open", {});
    this.showInv();
    this.update();
  }
  close(): boolean { const was = !this.win.hidden; this.win.hidden = true; return was; }

  update() {
    if (this.win.hidden) return;
    const s = this.net?.self;
    if (!s) return;
    const key = JSON.stringify([this.who.id, this.tab, s.gold, s.level, s.rep, s.marks, s.mounts, this.arenaRating, s.inventory.map((it) => it && `${it.base}:${it.qty ?? 1}`)]);
    if (key === this.drawn) return;
    this.drawn = key;
    this.tabsH.select(this.tab);
    const st = { ...s, arenaRating: this.arenaRating };
    const secs: string[] = [];
    for (const tier of TIER_ORDER) {
      const rows = MOUNT_IDS.map((id) => MOUNTS[id]).filter((d) => d.tier === tier).filter((d) => {
        const o = stableOffer(d, st);
        return this.tab === "all" || (this.tab === "own" ? o.owned : !o.owned && (o.canBuy || o.canCraft || o.sealInBag));
      }).map((d) => this.row(d, s));
      if (rows.length) secs.push(`<section class="sec"><h3 class="sec-h" style="color:${TIER_COLOR[tier]}">${TIER_PLURAL[tier]}</h3><div class="st-cards">${rows.join("")}</div></section>`);
    }
    this.body.innerHTML = `<p class="npc-say">${esc(this.who.greeting ?? "")}</p>${secs.join("") || `<p class="note">Здесь пока пусто</p>`}`;
    const cell = (label: string, value: string) => `<div class="st-stat"><span class="st-stat-l">${label}</span><span class="st-stat-v">${value}</span></div>`;
    this.foot.innerHTML = `<div class="st-stats">${cell(MOUNT_CURRENCY.rep, formatNumber(s.rep ?? 0))}${cell(MOUNT_CURRENCY.marks, formatNumber(s.marks ?? 0))}${cell("Рейтинг арены", this.arenaRating ? formatNumber(this.arenaRating) : "—")}${cell("Золото", gold(s.gold))}</div>`;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
      b.onclick = () => this.net.send(b.dataset.act === "craft" ? "stable:craft" : "stable:buy", { id: b.dataset.id });
    }
  }

  /** Карточка одной высоты: значок | название, ярус и фракция; скорость и уровень; источник; что нужно | кнопка по центру справа. */
  private row(d: MountDef, s: SelfState): string {
    const o = stableOffer(d, { ...s, arenaRating: this.arenaRating });
    const foe = !canRide(d, s.faction), low = s.level < d.level;
    const fac = d.faction ? ` · ${esc(FACTIONS[d.faction as FactionId]?.name ?? d.faction)}` : "";
    const stats = `<span class="${low && !o.owned ? "c-bad" : ""}">ур. ${d.level}</span> ${T("ui.stable.696", { speed: String(d.speed).replace(".", ","), flying: d.flying ? " · полёт" : "" })}`;
    // строка требований: детали значками со счётчиком, репутация и знаки, или итог
    let need = "";
    if (o.owned) need = `<span class="c-ok">${T("ui.stable.697")}</span>`;
    else if (foe) need = `<span class="c-bad">${T("ui.stable.698")}</span>`;
    else if (o.sealInBag) need = `<span class="c-warn">${T("ui.stable.699")}</span>`;
    else if (d.rep) need = `<span class="${(s.rep ?? 0) >= d.rep.rep ? "c-ok" : "c-bad"}">${T("ui.stable.700", { formatnumber: formatNumber(s.rep ?? 0), rep: formatNumber(d.rep.rep) })}</span> · <span class="${(s.marks ?? 0) >= d.rep.marks ? "c-ok" : "c-bad"}">${T("ui.stable.701", { marks: s.marks ?? 0, marks2: d.rep.marks })}</span>`;
    else if (d.craft) {
      need = Object.entries(d.craft.parts).map(([p, n]) => {
        const have = countBase(s.inventory, partBase(p));
        return `<span class="st-part ${have >= n ? "c-ok" : "c-bad"}" title="${esc(PARTS[p]?.name ?? p)}"><img src="${icon(PARTS[p]?.icon ?? "gold")}" alt="${esc(PARTS[p]?.name ?? p)}">${have}/${n}</span>`;
      }).join("");
      if (d.craft.arenaRating) need += `<span class="st-part ${this.arenaRating >= d.craft.arenaRating ? "c-ok" : "c-bad"}">${T("ui.stable.702", { arenarating: this.arenaRating || 0, arenarating2: d.craft.arenaRating })}</span>`;
    } else if (d.source === "raid") need = `<span class="c-dim">${T("ui.stable.703")}</span>`;
    else if (d.source === "start") need = `<span class="c-dim">${T("ui.stable.704", { level: d.grantLevel || d.level })}</span>`;
    // одна кнопка: «Купить» (торговец, гербовые) или «Собрать» (детали, печати гладиатора)
    let act = "";
    if (!o.owned && o.buy) {
      const why = o.sealInBag ? T("ui.stable.705") : o.missBuy.join(", ");
      act = `<button class="btn small price" data-act="buy" data-id="${d.id}"${o.canBuy && !o.sealInBag ? "" : ` disabled title="${esc(why)}"`}><span class="price-q">${T("ui.bank.378")}</span>${gold(d.price)}</button>`;
    } else if (!o.owned && d.craft) {
      act = `<button class="btn small price" data-act="craft" data-id="${d.id}"${o.canCraft ? "" : ` disabled title="${esc(o.missCraft.join(", "))}"`}><span class="price-q">${T("ui.stable.706")}</span>${d.craft.gold ? gold(d.craft.gold) : ""}</button>`;
    }
    return `<div class="st-card${o.owned ? " owned" : foe || low ? " locked" : ""}">
      <span class="st-icon"><img src="${icon(mountSprite(d.id))}" alt=""></span>
      <div class="st-main">
        <div class="st-line st-name" style="color:${TIER_COLOR[d.tier]}">${esc(d.name)}</div>
        <div class="st-line st-sub">${MOUNT_TIERS[d.tier]}${fac}</div>
        <div class="st-line st-sub">${stats}</div>
        <div class="st-line st-sub">${esc(MOUNT_SOURCES[d.source])}</div>
        <div class="st-line st-need">${need}</div>
      </div>
      <div class="st-act">${act}</div></div>`;
  }
}
