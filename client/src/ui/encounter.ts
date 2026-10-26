/** Окна случайных встреч: диалог путника и лавка бродячего торговца. */
import { gold as goldHtml } from "./gold";
import type { EncDialogMsg, EncShopMsg } from "../../../shared/encounters";
import { foodOf } from "../../../shared/food";
import { BASE_ITEMS, iconFor, itemName, itemTypeName, type Item } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { plusBadge } from "./smith";
import { T } from "../../../shared/texts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Подсказки предметов лавки: те же, что в сумке (Hud.itemTip без цены и подсказок по клику). */
export interface EncounterHost {
  itemTip(it: Item, s: SelfState): string;
  tipFor(elm: HTMLElement, html: () => string): void;
}

/** Тип вещи в строке лавки: «Двуручный меч», «Еда». */
const kind = (it: Item) => (BASE_ITEMS[it.base]?.slot === "consumable" ? (foodOf(it.base) ? T("ui.encounter.476") : T("ui.encounter.477")) : itemTypeName(it));

export class EncounterUI {
  private win = el("div", "panel win m win-enc");
  private net!: Net;
  private id = "";
  /** Лавка на экране: золото в подвале и кнопки цен обновляются, когда меняется золото героя. */
  private shopShown = false;
  private prices: { btn: HTMLButtonElement; price: number }[] = [];

  constructor(root: HTMLElement, private host?: EncounterHost) {
    this.win.hidden = true;
    root.append(this.win);
  }

  bind(net: Net) {
    this.net = net;
    net.on("enc:dialog", (m) => this.dialog(m));
    net.on("enc:shop", (m) => this.shop(m));
    net.on("enc:gone", (m) => {
      if (m.id === this.id) this.close();
    });
    // после покупки сервер отвечает лавкой раньше, чем присылает новое золото
    net.on("self", (s) => this.afford(s.gold));
  }

  /** Подойти и заговорить: сервер ответит окном диалога или лавки. */
  open(id: string) {
    this.id = id;
    this.net.send("enc:talk", { id });
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  /** Меняет содержимое окна, не сбрасывая прокрутку .body; foot — подвал (пустой — окно без подвала). */
  private frame(name: string, body: string, foot = "") {
    this.win.hidden = false;
    const top = this.win.querySelector(".body")?.scrollTop ?? 0;
    this.win.innerHTML = `<h2><span>${esc(name)}</span><button class="x" aria-label="Закрыть">×</button></h2><div class="body">${body}</div>${foot ? `<div class="win-foot">${foot}</div>` : ""}`;
    this.win.querySelector<HTMLElement>(".body")!.scrollTop = top;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.win.querySelector<HTMLButtonElement>(".bye")?.addEventListener("click", () => this.close());
  }

  private dialog(m: EncDialogMsg) {
    this.id = m.id;
    this.shopShown = false;
    this.frame(m.name, `<p class="npc-say">${esc(m.text)}</p>${m.opts.length ? `<div class="npc-opts"></div>` : ""}`, `<div class="actions"><button class="btn bye">${T("ui.encounter.478")}</button></div>`);
    const box = this.win.querySelector(".npc-opts");
    for (const o of m.opts) {
      const b = el("button", "btn opt", esc(o.label));
      b.onclick = () => this.net.send("enc:act", { id: m.id, opt: o.id });
      box?.append(b);
    }
  }

  private shop(m: EncShopMsg) {
    this.id = m.id;
    // вещь, купленная из-под курсора, исчезает без mouseleave: подсказку убираем до замены окна
    this.win.querySelectorAll(".cell").forEach((c) => c.dispatchEvent(new MouseEvent("mouseleave")));
    const me = this.net.self;
    const mins = Math.max(1, Math.ceil(m.until / 60));
    this.shopShown = true;
    this.prices = [];
    this.frame(
      m.name,
      `<p class="npc-say">${esc(m.text)}</p>${m.stock.length
        ? `<section class="sec"><div class="sec-head"><h3 class="sec-h">Товары</h3><span class="sec-aside">Наведите на вещь — подсказка</span></div><div class="list boxed"></div></section>`
        : `<p class="note">Всё раскуплено</p>`}`,
      `<span class="win-foot-info">${T("ui.encounter.479", { mins: mins })}</span>${goldHtml(me?.gold ?? 0)}`,
    );
    const list = this.win.querySelector(".list");
    for (const s of m.stock) {
      const it = s.item;
      const low = !!me && it.req > me.level;
      const qty = it.qty && it.qty > 1 ? it.qty : 0;
      const row = el("div", "row enc-item", `<div class="cell md r${it.rarity}"><img src="/assets/icons/${iconFor(it)}.png" alt="">${plusBadge(it)}${qty ? `<span class="qty">${qty}</span>` : ""}</div>
        <div class="row-main">
          <div class="row-title"><span class="c-r${it.rarity}">${esc(itemName(it))}</span></div>
          <div class="row-sub">${esc(kind(it))} · <span${low ? ` class="c-bad" title="Нужен ${it.req} уровень"` : ""}>ур. ${it.req}</span>${qty ? ` · ${qty} шт.` : ""}</div>
        </div>`);
      const cell = row.querySelector<HTMLElement>(".cell")!;
      if (this.host && me) this.host.tipFor(cell, () => this.host!.itemTip(it, this.net.self!));
      const btn = el("button", "btn small price", `<span class="price-q">${T("ui.bank.378")}</span>${goldHtml(s.price)}`);
      btn.onclick = () => this.net.send("enc:buy", { id: m.id, idx: s.idx });
      this.prices.push({ btn, price: s.price });
      const end = el("div", "row-end");
      end.append(btn);
      row.append(end);
      list?.append(row);
    }
    this.afford(me?.gold ?? 0);
  }

  /** Золото героя: подвал лавки и кнопки цен; недоступная цена краснеет и говорит почему. */
  private afford(have: number) {
    if (!this.shopShown || this.win.hidden) return;
    const g = this.win.querySelector(".win-foot > .gold-amt");
    if (g) g.outerHTML = goldHtml(have);
    for (const { btn, price } of this.prices) {
      const short = have < price;
      btn.disabled = short;
      btn.toggleAttribute("data-short", short);
      btn.title = short ? T("srv.bags.58") : "";
    }
  }
}
