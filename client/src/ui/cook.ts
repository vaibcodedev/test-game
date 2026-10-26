/** Повар Борщан: небольшое окно с блюдами; описание бонусов еды для подсказок. */
import { npcRefuses } from "./npcGate";
import { gold } from "./gold";
import { COOK, COOKS, FOOD_IDS, FOOD, type Dish } from "../../../shared/food";
import { ITEM_STAT_NAMES, type ItemStatKey } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { T } from "../../../shared/texts";

const icon = (name: string) => `/assets/icons/${name}.png`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Баффы блюда по одному: «+8 Ловкость», «+4 к шансу крита». */
export const foodStats = (d: Dish): string[] => (Object.entries(d.stats) as [ItemStatKey, number][]).map(([k, v]) => `+${v} ${ITEM_STAT_NAMES[k]}`);
export function foodBonuses(d: Dish): string {
  return foodStats(d).join(", ");
}
/** Мгновенное лечение блюда: «35% здоровья, 10% маны» (пусто, если блюдо не лечит). */
const instant = (d: Dish) => [d.hpPct ? T("ui.cook.463", { hppct: d.hpPct }) : "", d.mpPct ? T("ui.cook.464", { mppct: d.mpPct }) : ""].filter(Boolean).join(", ");
/** Подсказка блюда; left — оставшиеся минуты (для активного бафа). */
export function foodTip(d: Dish, leftMin?: number): string {
  return [
    `<div class="t">${esc(d.name)}</div>`,
    leftMin == null ? `<div class="d">${T("ui.cook.465", { req: d.req, minutes: d.minutes })}</div>` : `<div class="d">${T("ui.cook.466", { leftmin: leftMin })}</div>`,
    instant(d) ? `<div>${T("ui.cook.467", { d: instant(d) })}</div>` : "",
    `<div class="st">${foodBonuses(d)}</div>`,
    d.heat ? `<div class="st">${T("ui.cook.468")}</div>` : "",
    `<div class="d">${T("ui.cook.469")}</div>`,
  ].join("");
}

/** Блюда по возрастанию уровня, внутри уровня — по цене (в data/food.json порядок другой). */
const DISHES = FOOD_IDS.slice().sort((a, b) => FOOD[a].req - FOOD[b].req || FOOD[a].price - FOOD[b].price);

/** Строка блюда и то, что в ней меняется вместе с золотом, уровнем и действующей едой. */
interface DishRow {
  d: Dish;
  row: HTMLElement;
  lvl: HTMLElement;
  btns: { btn: HTMLButtonElement; price: number }[];
}

export class CookUI {
  private win = el("div", "panel win m win-cook");
  private net!: Net;
  private who = COOK;
  /** Повар, для которого собрано окно: пока он тот же, окно не перестраивается — прокрутка и фокус остаются на месте. */
  private built = "";
  private rows: DishRow[] = [];
  private aside!: HTMLElement;
  private foot!: HTMLElement;

  constructor(root: HTMLElement) {
    this.win.hidden = true;
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
  }
  open(id?: string) {
    if (npcRefuses(this.net, "cook", id)) return;
    this.who = COOKS.find((c) => c.id === id) ?? COOK;
    this.win.hidden = false;
    if (this.built !== this.who.id) this.build();
    if (this.net.self) this.update(this.net.self);
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  /** Каркас окна и строки блюд: собираются один раз для повара, дальше обновляются только состояния. */
  private build() {
    this.built = this.who.id;
    this.win.innerHTML = `<h2><span>${esc(this.who.name)}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body">${this.who.greeting ? `<p class="npc-say">${esc(this.who.greeting)}</p>` : ""}
        <section class="sec"><div class="sec-head"><h3 class="sec-h">${T("ui.cook.470")}</h3><span class="sec-aside"></span></div><div class="list boxed"></div></section></div>
      <div class="win-foot"></div>`;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.aside = this.win.querySelector<HTMLElement>(".sec-aside")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    const list = this.win.querySelector<HTMLElement>(".list")!;
    this.rows = DISHES.map((id) => {
      const d = FOOD[id];
      const fx = foodStats(d).map((t) => `<span class="chip ok">${t}</span>`).join("") + (d.heat ? `<span class="chip warn">${T("ui.cook.468")}</span>` : "");
      const now = instant(d);
      const row = el("div", "row dish", `<span class="row-icon"><img src="${icon(d.icon)}" alt=""></span>
        <div class="row-main">
          <div class="row-title">${esc(d.name)}</div>
          <div class="dish-fx">${fx}</div>
          <div class="row-sub">${T("ui.cook.471", { req: d.req, minutes: d.minutes, now: now ? ` · Сразу: ${now}` : "" })}</div>
        </div>`);
      const prices = el("div", "price-stack");
      const btns = [1, 5].map((q) => {
        const price = d.price * q;
        const btn = el("button", "btn small price", `<span class="price-q">×${q}</span>${gold(price)}`);
        btn.onclick = () => this.net.send("cook:buy", { id, qty: q });
        prices.append(btn);
        return { btn, price };
      });
      row.append(prices);
      list.append(row);
      return { d, row, lvl: row.querySelector<HTMLElement>(".meta")!, btns };
    });
  }

  update(s: SelfState) {
    if (this.win.hidden) return;
    if (this.built !== this.who.id) this.build();
    const food = s.food ? FOOD[s.food.id] : undefined;
    this.aside.textContent = food ? T("ui.cook.472", { name: food.name }) : T("ui.cook.473");
    for (const r of this.rows) {
      // сервер продаёт блюдо любому уровню, но съесть его можно только с нужного
      const low = s.level < r.d.req;
      const hint = low ? T("ui.cook.474", { req: r.d.req }) : "";
      const cur = r.d === food;
      r.row.classList.toggle("current", cur);
      if (cur) r.row.setAttribute("aria-current", "true");
      else r.row.removeAttribute("aria-current");
      r.lvl.classList.toggle("c-bad", low);
      r.lvl.title = hint;
      for (const { btn, price } of r.btns) {
        const short = s.gold < price;
        btn.disabled = short;
        btn.toggleAttribute("data-short", short);
        btn.title = short ? T("srv.bags.58") : hint;
      }
    }
    this.foot.innerHTML = `<span class="win-foot-info">${T("ui.bags.369")}</span>${gold(s.gold)}`;
  }
}
