/** Кузнец Гром: окно улучшения предметов (+1…+15, +11…+15 — рискованные) и покупки материалов. */
import { npcRefuses } from "./npcGate";
import { gold } from "./gold";
import { BASE_ITEMS, effStats, iconFor, itemName, ITEM_STAT_NAMES, SLOT_NAMES, SLOTS, type Item, type ItemStatKey, type Slot } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";
import { failLevel, MATERIAL_IDS, MATERIALS, MAX_PLUS, SMITH, SMITHS, stepFor } from "../../../shared/upgrade";
import { visualTier as enchantTier, ENCHANT_VISUAL, GEAR_FX, enchantIconColor, smithNextText, tierText } from "../../../shared/gearFx";
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
type Sel = { index: number } | { slot: Slot } | null;

/**
 * Значок «+N» на ячейке (docs/art/gear.md §5, icons.md §6): правый верхний угол, тёмная подложка, цифра в цвет ступени варианта D
 * (+1…+4 светлая, +5 тление, +8 угли, +11…+15 пламя); рамка ячейки — за редкостью. Стили: kit.css .cell .plus.
 */
export function plusBadgeN(plus: number): string {
  if (!plus) return "";
  const t = enchantTier(plus);
  // цифра в цвет ступени заточки варианта D (+5 тление, +8 угли, +11 пламя; data/gear-fx.json enchantB.iconColors), подложка тёмная, рамка — за редкостью
  return `<span class="plus pt${t}" style="color:${enchantIconColor(plus)}">+${plus}</span>`;
}
/** Значок «+N» на ячейке предмета. */
export const plusBadge = (it: Pick<Item, "plus">) => plusBadgeN(it.plus || 0);

/** Характеристики предмета с учётом заточки парами «название — значение»: урон одной строкой, у шанса крита — «%». */
function statPairs(it: Item): [string, string][] {
  const st = effStats(it);
  const out: [string, string][] = [];
  if (st.dmgMin) out.push([T("ui.arena.346"), `${st.dmgMin}–${st.dmgMax}`]);
  for (const [k, v] of Object.entries(st)) {
    if (k === "dmgMin" || k === "dmgMax") continue;
    const name = ITEM_STAT_NAMES[k as ItemStatKey];
    out.push([name.charAt(0).toUpperCase() + name.slice(1), `${v}${k === "crit" ? "%" : ""}`]);
  }
  return out;
}

export class SmithUI {
  private win = el("div", "panel win m win-smith");
  private body: HTMLElement;
  private foot: HTMLElement;
  private net!: Net;
  private sel: Sel = null;
  /** Кузнец, у которого открыто окно (Эмберхолл или столица). */
  private who: { id: string; name: string; greeting?: string } = SMITH;

  constructor(root: HTMLElement) {
    this.win.hidden = true;
    // каркас строится один раз: h2, .body и подвал остаются на месте, при обновлении меняется только их содержимое
    this.win.innerHTML = `<h2><span>${esc(SMITH.name)}</span><button class="x" aria-label="Закрыть">×</button></h2><div class="body"></div><div class="win-foot"></div>`;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
  }
  open(id?: string) {
    if (npcRefuses(this.net, "smith", id)) return;
    this.who = SMITHS.find((s) => s.id === id) ?? SMITH;
    this.win.querySelector("h2 > span")!.textContent = this.who.name;
    this.win.hidden = false;
    if (this.net.self) this.update(this.net.self);
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
  private selected(s: SelfState): Item | null {
    if (!this.sel) return null;
    const it = "slot" in this.sel ? s.equip[this.sel.slot] : s.inventory[this.sel.index];
    return it && BASE_ITEMS[it.base].slot !== "consumable" ? it : null;
  }
  private count(s: SelfState, base: string) {
    return s.inventory.reduce((n, it) => n + (it && it.base === base ? it.qty ?? 1 : 0), 0);
  }
  update(s: SelfState) {
    if (this.win.hidden) return;
    const it = this.selected(s);
    if (!it) this.sel = null;
    const info = this.infoSection(s, it);
    // содержимое подменяется разом: прокрутка .body не сбрасывается, например после покупки руды
    this.body.replaceChildren(el("p", "npc-say", esc(this.who.greeting ?? "")), this.pickSection(s), info.sec, this.matsSection(s));
    this.foot.innerHTML = `<span class="win-foot-info">${T("ui.bags.369")}</span>${gold(s.gold)}`;
    this.foot.append(info.go);
  }

  /** «Что улучшить»: надетое и вещи из сумки, по 8 в ряд, без вложенной прокрутки. Выбранная вещь — aria-pressed. */
  private pickSection(s: SelfState): HTMLElement {
    const sec = el("section", "sec", `<div class="sec-head"><h3 class="sec-h">${T("ui.smith.672")}</h3><span class="sec-aside">${T("ui.smith.673")}</span></div>`);
    const cell = (item: Item | null, sel: Sel, label = ""): HTMLElement | null => {
      if (!item || BASE_ITEMS[item.base].slot === "consumable") return null;
      const maxed = (item.plus || 0) >= MAX_PLUS;
      const c = el("button", `cell r${item.rarity}${maxed ? " maxed" : ""}`);
      c.setAttribute("aria-pressed", String(!!this.sel && JSON.stringify(this.sel) === JSON.stringify(sel)));
      c.title = `${label ? label + ": " : ""}${itemName(item)}${maxed ? " — улучшено до максимума" : ""}`;
      c.innerHTML = `<img src="${icon(iconFor(item))}" alt="${esc(itemName(item))}">${plusBadge(item)}`;
      c.onclick = () => { this.sel = sel; this.update(this.net.self!); };
      return c;
    };
    const group = (title: string, all: (HTMLElement | null)[], empty: string) => {
      const cells = all.filter((c): c is HTMLElement => !!c);
      const g = el("div", "sub-grp", `<h4 class="sub-h">${title}</h4>`);
      if (cells.length) {
        const grid = el("div", "cells");
        grid.append(...cells);
        g.append(grid);
      } else g.append(el("p", "note", empty));
      return g;
    };
    const pick = el("div", "smith-pick");
    pick.append(
      group(T("ui.hud.602"), SLOTS.map((slot) => cell(s.equip[slot], { slot }, SLOT_NAMES[slot])), T("ui.smith.674")),
      group(T("ui.bank.380"), s.inventory.map((item, index) => cell(item, { index })), T("ui.smith.675")),
    );
    sec.append(pick);
    return sec;
  }

  /**
   * «Улучшение»: вещь, сравнение «сейчас → станет», свечение, шанс и цена.
   * Кнопка «Улучшить» отдаётся в подвал окна: она всегда на виду, пока прокручивают сумку и материалы; на максимуме её нет.
   */
  private infoSection(s: SelfState, it: Item | null): { sec: HTMLElement; go: HTMLButtonElement } {
    const sec = el("section", "sec smith-info", `<h3 class="sec-h">${T("ui.smith.676")}</h3>`);
    const go = el("button", "btn primary smith-go", T("ui.smith.677"));
    go.disabled = true;
    if (!it) {
      sec.append(el("p", "note", T("ui.smith.678")));
      go.title = T("ui.smith.303");
      return { sec, go };
    }
    const plus = it.plus || 0;
    const step = stepFor(plus);
    const slot = BASE_ITEMS[it.base].slot as Slot;
    const tier = enchantTier(plus);
    sec.append(el("div", "smith-item", `<div class="cell r${it.rarity}"><img src="${icon(iconFor(it))}" alt="">${plusBadge(it)}</div>
      <div class="row-main"><span class="row-title c-r${it.rarity}">${esc(it.name)}</span><span class="row-sub">${SLOT_NAMES[slot]} · ${plus ? `сейчас +${plus}` : "без улучшений"}</span></div>`));

    // сравнение: выросшее значение зелёным
    const now = statPairs(it);
    const next = step ? new Map(statPairs({ ...it, plus: plus + 1 })) : null;
    const cmp = now.map(([name, v]) => {
      const n = next?.get(name) ?? v;
      return `<tr><td class="dim">${esc(name)}</td><td class="num">${v}</td>${next ? `<td class="num${n !== v ? " c-ok" : ""}">${n}</td>` : ""}</tr>`;
    }).join("");
    sec.append(el("div", "tbl-wrap", `<table class="tbl"><thead><tr><th class="grow">${T("ui.smith.679")}</th><th class="num">${T("ui.smith.680", { plus: plus ? ` +${plus}` : "" })}</th>${next ? `<th class="num">Станет +${plus + 1}</th>` : ""}</tr></thead><tbody>${cmp}</tbody></table>`));

    // свечение на герое: что нарисовано сейчас и что появится
    const nextTxt = smithNextText(slot, plus);
    const nextFx = nextTxt || (slot === "ring" || slot === "amulet" ? tierText(slot, 0) : GEAR_FX.texts.smithMax);
    if (ENCHANT_VISUAL) sec.append(el("div", "smith-fx", `<p class="note">${T("ui.smith.681", { v: esc(tier > 0 ? tierText(slot, tier) : "эффекта заточки нет") })}</p><p class="note${nextTxt ? " c-ench" : ""}">${esc(nextFx)}</p>`));

    if (!step) {
      sec.append(el("p", "note c-ok", T("ui.smith.682", { max_plus: MAX_PLUS })));
      go.hidden = true;
      return { sec, go };
    }
    const have = { ore: this.count(s, "ash_ore"), dust: this.count(s, "star_dust") };
    const ok = { gold: s.gold >= step.gold, ore: have.ore >= step.ore, dust: have.dust >= step.dust };
    const lack = (good: boolean) => (good ? "" : ' class="bad"'); // нехватка — красным
    sec.append(el("dl", "kv", `<dt>${T("ui.smith.683")}</dt><dd${step.chance >= 100 ? ' class="ok"' : ""}>${step.chance}%</dd>
      <dt>${T("ui.bags.369")}</dt><dd${lack(ok.gold)}>${gold(step.gold)}</dd>
      <dt>${esc(MATERIALS.ash_ore.name)}</dt><dd${lack(ok.ore)}>${step.ore}<span class="meta">${T("ui.smith.684", { ore: have.ore })}</span></dd>
      ${step.dust ? `<dt>${esc(MATERIALS.star_dust.name)}</dt><dd${lack(ok.dust)}>${step.dust}<span class="meta">есть ${have.dust}</span></dd>` : ""}`));
    if (step.chance < 100) {
      const to = failLevel(plus);
      sec.append(el("p", "note c-warn", T("ui.smith.685", { to: to < plus ? `снизится до +${to}` : "не изменится" })));
    }
    go.textContent = T("ui.smith.304", { v: plus + 1 });
    go.disabled = !(ok.gold && ok.ore && ok.dust);
    if (go.disabled) go.title = T("ui.smith.305");
    go.onclick = () => this.net.send("smith:upgrade", "slot" in this.sel! ? { slot: (this.sel as { slot: Slot }).slot } : { index: (this.sel as { index: number }).index });
    return { sec, go };
  }

  /** «Материалы»: по строке на материал — иконка, название и сколько есть, цены столбиком одной ширины. */
  private matsSection(s: SelfState): HTMLElement {
    const sec = el("section", "sec", `<h3 class="sec-h">${T("ui.smith.686")}</h3>`);
    const list = el("div", "list smith-mats");
    for (const id of MATERIAL_IDS) {
      const m = MATERIALS[id];
      // shoprow — метка для tests/ (ui-audit-screens.ts кликает последнюю кнопку строки: ×10)
      const row = el("div", "row shoprow", `<span class="row-icon"><img src="${icon(m.icon)}" alt=""></span>
        <div class="row-main"><span class="row-title">${esc(m.name)}</span><span class="row-sub">${T("ui.smith.687", { count: this.count(s, id) })}</span></div>`);
      const prices = el("div", "price-stack");
      for (const q of [1, 10]) {
        const price = m.price * q;
        const b = el("button", "btn small price", `<span class="price-q">×${q}</span>${gold(price)}`);
        if (s.gold < price) { b.disabled = true; b.dataset.short = ""; }
        b.onclick = () => this.net.send("smith:buy", { id, qty: q });
        prices.append(b);
      }
      row.append(prices);
      list.append(row);
    }
    sec.append(list);
    return sec;
  }
}
