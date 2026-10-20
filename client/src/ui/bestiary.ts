/** Окно бестиария (клавиша B): записи о мобах открываются по числу убийств. */
import { BESTIARY, fullKills, mobHabitat } from "../../../shared/bestiary";
import { iconFor, makeItem, makeUnique } from "../../../shared/items";
import { MOBS } from "../../../shared/mobs";
import type { SelfState } from "../../../shared/protocol";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Разделы списка по порядку; внутри раздела записи идут по возрастанию уровня. */
const GROUPS = [["mob", "Мобы"], ["boss", "Боссы"], ["raid", "Цитадель Хаоса"]] as const;
const groupOf = (id: string) => (MOBS[id].raid ? "raid" : MOBS[id].boss ? "boss" : "mob");
const rank = (id: string) => GROUPS.findIndex(([g]) => g === groupOf(id));
const firstLevel = (id: string) => mobHabitat(id).levels?.[0] ?? 999;
/** «1–10» или «28»; у мобов без уровня (засады, приспешники) пусто. */
function levelText(id: string): string {
  const l = mobHabitat(id).levels;
  return l ? (l[0] === l[1] ? `${l[0]}` : `${l[0]}–${l[1]}`) : "";
}
const pct = (v: number) => `×${v.toFixed(2).replace(/\.?0+$/, "")}`;

export class BestiaryUI {
  private win = document.createElement("div");
  private list!: HTMLElement;
  private det!: HTMLElement;
  private kills: Record<string, number> = {};
  private ids = Object.keys(MOBS).sort((a, b) => rank(a) - rank(b) || firstLevel(a) - firstLevel(b));
  private sel = this.ids[0];
  /** Убийства при последней сборке списка: пока они те же, окно не перерисовывается и прокрутка списка не сбивается. */
  private drawn = "";

  constructor(root: HTMLElement, private icon: (name: string) => string) {
    this.win.className = "panel win l win-bestiary";
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span>Бестиарий</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body"><div class="bst"><div class="bst-list list boxed scroll" role="listbox" aria-label="Мобы"></div><div class="bst-det"></div></div></div>`;
    this.list = this.win.querySelector<HTMLElement>(".bst-list")!;
    this.det = this.win.querySelector<HTMLElement>(".bst-det")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => (this.win.hidden = true);
    this.list.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (b) this.select(b.dataset.id!);
    });
    this.list.addEventListener("keydown", (e) => this.onKey(e));
    root.append(this.win);
  }

  toggle(self: SelfState | null) {
    this.win.hidden = !this.win.hidden;
    if (self) this.kills = self.mobKills ?? {};
    if (this.win.hidden) return;
    this.render();
    this.list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
  update(s: SelfState) {
    this.kills = s.mobKills ?? {};
    if (!this.win.hidden) this.render();
  }

  /** Собирает список и запись заново, только если изменились убийства; выбор строки меняет только aria-selected и запись (select). */
  private render() {
    const key = this.ids.map((id) => this.kills[id] || 0).join();
    if (key === this.drawn) return;
    this.drawn = key;
    const top = this.list.scrollTop, focused = this.list.contains(document.activeElement);
    this.list.innerHTML = GROUPS.map(([g, title]) =>
      `<div class="bst-grp" role="group" aria-labelledby="bst-g-${g}"><h4 class="sub-h bst-sec" id="bst-g-${g}">${title}</h4>${this.ids.filter((id) => groupOf(id) === g).map((id) => this.row(id)).join("")}</div>`).join("");
    this.list.scrollTop = top;
    if (focused) this.list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    this.det.innerHTML = this.detail();
  }

  private row(id: string): string {
    const n = this.kills[id] || 0, on = id === this.sel, lv = levelText(id);
    return `<button class="row dense${n ? "" : " locked"}${MOBS[id].boss ? " boss" : ""}" role="option" data-id="${id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">`
      + `<span class="row-title">${n ? esc(MOBS[id].name) : "???"}</span>${n && lv ? `<span class="meta">ур. ${lv}</span>` : ""}</button>`;
  }

  private select(id: string, focus = false) {
    this.sel = id;
    for (const b of this.list.querySelectorAll<HTMLElement>("[data-id]")) {
      const on = b.dataset.id === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    this.det.innerHTML = this.detail();
  }

  /** Стрелки и Home/End двигают выбор по списку; игровые клавиши под окном не срабатывают. */
  private onKey(e: KeyboardEvent) {
    const last = this.ids.length - 1, i = this.ids.indexOf(this.sel);
    const to = e.key === "Home" ? 0 : e.key === "End" ? last : e.key === "ArrowDown" ? Math.min(last, i + 1) : e.key === "ArrowUp" ? Math.max(0, i - 1) : -1;
    if (to < 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.select(this.ids[to], true);
  }

  private detail(): string {
    const id = this.sel, def = MOBS[id], n = this.kills[id] || 0, need = fullKills(id);
    if (!n) return `<p class="note bst-empty">Запись откроется после первого убийства.</p>`;
    const hab = mobHabitat(id), desc = BESTIARY[id]?.desc;
    const tags = (def.boss ? `<span class="chip boss">Босс</span>` : "") + (def.raid ? `<span class="chip dim">Рейд</span>` : "");
    let html = `<section class="sec">
      <div class="bst-head">
        <div class="bst-ic"><div class="bst-sprite" style="background-image:url(/assets/units/${def.sprite}.png)"></div></div>
        <div class="card-titles"><h3 class="card-title">${esc(def.name)}</h3><div class="card-sub">${levelText(id) ? `Уровень ${levelText(id)} · убито: ${n}` : `Убито: ${n}`}</div>${tags ? `<div class="bst-tags">${tags}</div>` : ""}</div>
      </div>
      ${desc ? `<p class="card-text">${esc(desc)}</p>` : ""}`;
    if (n < need) return html + `<div class="progress"><span>Убийств до полной записи</span><b>${n} / ${need}</b><div class="bar sm"><i style="width:${Math.round((n / need) * 100)}%"></i></div></div></section>`;
    html += `</section>`;
    const stats: [string, number][] = [["Здоровье", def.hp], ["Урон", def.dmg], ["Броня", def.armor]];
    html += `<section class="sec"><h3 class="sec-h">Характеристики</h3><div class="bst-stats">${stats.map(([k, v]) => `<div class="card compact"><span class="bst-k">${k}</span><b class="bst-v">${pct(v)}</b></div>`).join("")}</div></section>
      <section class="sec"><h3 class="sec-h">Обитает</h3>${hab.zones.length ? `<div class="bst-zones">${hab.zones.map((z) => `<span class="chip dim">${esc(z)}</span>`).join("")}</div>` : `<p class="note">—</p>`}</section>`;
    // добычу рейда выдаёт сам рейд по итогам боя (World.onRaidKill), а не убийство моба
    if (def.raid) return html + `<section class="sec"><h3 class="sec-h">Добыча</h3><p class="note">Выдаётся по итогам рейда.</p></section>`;
    const items = def.boss
      ? [...(def.uniques ?? []).map((u) => makeUnique(u)), makeItem("hp_potion", 1, 0)]
      : [makeItem("hp_potion", 1, 0), makeItem("mp_potion", 1, 0)];
    const loot = items.map((it) => `<span class="cell md${it.rarity ? ` r${it.rarity}` : ""}" title="${esc(it.name)}"><img src="${this.icon(iconFor(it))}" alt="${esc(it.name)}"></span>`).join("");
    return html + `<section class="sec"><h3 class="sec-h">Добыча</h3><div class="bst-loot">${loot}</div>${def.boss ? "" : `<p class="note">Также иногда выпадает снаряжение.</p>`}</section>`;
  }
}
