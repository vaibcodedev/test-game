/** Банк Голдмунда: вкладки, ячейки, перетаскивание сумка ⇄ банк, золото и покупка места. Всё проверяет сервер. */
import { gold } from "./gold";
import { BANK_STEP, BANK_TAB_SIZE, BANK_TABS, BANKER, BANKERS, SHARED_SIZE, SHARED_TAB, type BankView } from "../../../shared/bank";
import { iconFor, itemName, type Item } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { tabs, type TabsHandle } from "./kit";
import { plusBadge } from "./smith";

const icon = (name: string) => `/assets/icons/${name}.png`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface BankHost {
  itemTip: (it: Item, s: SelfState) => string;
  tipFor: (e: HTMLElement, html: () => string) => void;
  hideTip: () => void;
  /** Открыть сумку рядом с банком. */
  showInv: () => void;
}

/** Данные перетаскивания из банка: "bank:<вкладка>:<ячейка>". */
export const parseBankDrag = (s: string): { tab: number; slot: number } | null => {
  const m = /^bank:(\d+):(\d+)$/.exec(s);
  return m ? { tab: Number(m[1]), slot: Number(m[2]) } : null;
};

/** Номер ячейки сумки из данных перетаскивания; пусто и "bank:…" — не сумка. */
const bagSlot = (data: string): number | null => (data !== "" && Number.isInteger(Number(data)) ? Number(data) : null);

export class BankUI {
  private win = document.createElement("div");
  private net!: Net;
  private state: BankView | null = null;
  private tab = 0;
  /** Номер последнего сообщения "bank", вкладка и золото при прошлой перерисовке: без перемен окно не пересобирается. */
  private ver = 0;
  private drawn = "";
  private tabsEl: HTMLElement;
  private tabsH: TabsHandle;
  private grid: HTMLElement;
  private sum: HTMLElement;
  private offer: HTMLElement;
  private foot: HTMLElement;

  constructor(root: HTMLElement, private host: BankHost) {
    this.win.className = "panel win m win-bank";
    this.win.hidden = true;
    // каркас строится один раз: заголовок, вкладки, тело и подвал остаются на месте; поле суммы тоже, поэтому набранное и фокус переживают обновления
    this.win.innerHTML = `<h2><span>${esc(BANKER.name)}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="tabs bank-tabs" aria-label="Вкладки банка"></div>
      <div class="body" id="bank-body" role="tabpanel">
        <p class="npc-say">${esc(BANKER.greeting)}</p>
        <div class="cells bank-grid"></div>
        <p class="note">Клик — забрать в сумку. Перетащите предмет из сумки сюда или клик по нему в сумке — положить.</p>
        <section class="sec">
          <div class="sec-head"><h3 class="sec-h">Золото в банке</h3><span class="sec-aside bank-sum"></span></div>
          <div class="input-group bank-gold"><input class="input" type="number" min="1" step="1" placeholder="Сумма" aria-label="Сумма золота"><button class="btn" data-g="1">Положить</button><button class="btn" data-g="-1">Снять</button></div>
        </section>
        <section class="sec"><h3 class="sec-h">Расширение</h3><div class="list boxed bank-offer"></div></section>
      </div>
      <div class="win-foot"></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.win.querySelector<T>(sel)!;
    this.tabsEl = q(".bank-tabs");
    this.grid = q(".bank-grid");
    this.sum = q(".bank-sum");
    this.offer = q(".bank-offer");
    this.foot = q(".win-foot");
    q<HTMLButtonElement>(".x").onclick = () => this.close();
    this.tabsH = tabs(this.tabsEl, (key) => {
      this.tab = key === "shared" ? SHARED_TAB : Number(key);
      this.render();
    });
    const inp = q<HTMLInputElement>(".bank-gold input");
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    for (const b of this.win.querySelectorAll<HTMLButtonElement>(".bank-gold button")) {
      b.onclick = () => {
        const n = Math.floor(Number(inp.value) || 0);
        if (n > 0) this.net.send("bank:gold", { v: n * Number(b.dataset.g) });
      };
    }
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
    net.on("bank", (v) => {
      this.state = v;
      this.ver++;
      this.render();
    });
    net.on("switch", () => this.close());
  }
  get isOpen() {
    return !this.win.hidden;
  }
  get currentTab() {
    return this.tab;
  }
  /** id — банкир, у которого открыли (Эмберхолл или столица): его имя в заголовке и приветствие. */
  open(id?: string) {
    const who = BANKERS.find((b) => b.id === id) ?? BANKER;
    this.win.querySelector("h2 > span")!.textContent = who.name;
    this.win.querySelector(".npc-say")!.textContent = who.greeting ?? "";
    this.win.hidden = false;
    this.net.send("bank:open", {});
    this.host.showInv();
    this.render();
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
  /** Клик по предмету сумки при открытом банке — положить в текущую вкладку. */
  deposit(index: number) {
    this.net.send("bank:put", { index, tab: this.tab });
  }

  /** Вещь из сумки можно бросить на вкладку или ячейку: подсветка — .drop. */
  private dropZone(e: HTMLElement, onDrop: (data: string) => void) {
    e.ondragover = (ev) => { ev.preventDefault(); e.classList.add("drop"); };
    e.ondragleave = () => e.classList.remove("drop");
    e.ondrop = (ev) => {
      ev.preventDefault();
      e.classList.remove("drop");
      onDrop(ev.dataTransfer!.getData("text/plain"));
    };
  }

  private render() {
    if (this.win.hidden) return;
    const v = this.state;
    const s = this.net.self;
    if (v && this.tab >= v.tabs.length && this.tab !== SHARED_TAB) this.tab = 0;
    const key = `${this.ver}|${this.tab}|${s?.gold ?? ""}`;
    if (key === this.drawn) return;
    this.drawn = key;
    if (!v) {
      this.tabsEl.replaceChildren();
      this.grid.replaceChildren();
      this.offer.replaceChildren();
      this.foot.replaceChildren();
      return;
    }
    const shared = this.tab === SHARED_TAB;

    const btns: HTMLButtonElement[] = [];
    for (let t = 0; t < BANK_TABS; t++) {
      const open = t < v.tabs.length;
      const b = document.createElement("button");
      b.className = "btn tab";
      b.id = `bank-tab-${t}`;
      b.dataset.tab = String(t);
      b.setAttribute("aria-controls", "bank-body");
      if (open) {
        const n = v.tabs[t].filter(Boolean).length;
        b.innerHTML = `Вкладка ${t + 1}${n ? ` <span class="count">${n}</span>` : ""}`;
        this.dropZone(b, (data) => {
          const from = bagSlot(data);
          if (from !== null) this.net.send("bank:put", { index: from, tab: t });
        });
      } else {
        b.textContent = `🔒 ${t + 1}`;
        b.disabled = true;
        b.title = "Вкладка не куплена";
      }
      btns.push(b);
    }
    {
      // общий склад аккаунта: виден всем героям аккаунта
      const b = document.createElement("button");
      b.className = "btn tab";
      b.id = "bank-tab-shared";
      b.dataset.tab = "shared";
      b.setAttribute("aria-controls", "bank-body");
      b.textContent = "Общий склад";
      b.title = "Общий для всех героев вашего аккаунта";
      this.dropZone(b, (data) => {
        const from = bagSlot(data);
        if (from !== null) this.net.send("bank:put", { index: from, tab: SHARED_TAB });
      });
      btns.push(b);
    }
    this.tabsEl.replaceChildren(...btns);
    this.tabsH.select(shared ? "shared" : String(this.tab));

    const cells = shared ? v.shared ?? [] : v.tabs[this.tab];
    const grid: HTMLButtonElement[] = [];
    for (let i = 0; i < (shared ? SHARED_SIZE : BANK_TAB_SIZE); i++) {
      const c = document.createElement("button");
      grid.push(c);
      if (i >= cells.length) {
        c.className = "cell unbought";
        c.disabled = true;
        c.title = "Ячейка не куплена";
        continue;
      }
      const it = cells[i];
      c.className = `cell ${it ? "r" + it.rarity : "empty"}`;
      if (it) {
        c.innerHTML = `<img src="${icon(iconFor(it))}" alt="${esc(itemName(it))}">${plusBadge(it)}${it.qty && it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ""}`;
        c.draggable = true;
        c.ondragstart = (e) => e.dataTransfer!.setData("text/plain", `bank:${this.tab}:${i}`);
        c.onclick = () => { this.host.hideTip(); this.net.send("bank:take", { tab: this.tab, slot: i }); };
        if (s) this.host.tipFor(c, () => this.host.itemTip(it, this.net.self!));
      }
      this.dropZone(c, (data) => {
        const bank = parseBankDrag(data);
        if (bank) this.net.send("bank:move", { tab: bank.tab, slot: bank.slot, toTab: this.tab, toSlot: i });
        else if (bagSlot(data) !== null) this.net.send("bank:put", { index: Number(data), tab: this.tab, slot: i });
      });
    }
    this.grid.replaceChildren(...grid);

    this.sum.innerHTML = gold(v.gold);

    if (v.price === null) this.offer.innerHTML = `<div class="row"><span class="row-title c-ok">Банк максимального размера</span></div>`;
    else {
      const last = v.tabs[v.tabs.length - 1];
      const what = last.length < BANK_TAB_SIZE ? `+${BANK_STEP} ячеек во вкладке ${v.tabs.length}` : `Новая вкладка ${v.tabs.length + 1}`;
      const poor = (s?.gold ?? 0) < v.price;
      // bank-buy — метка для tests/
      this.offer.innerHTML = `<div class="row"><div class="row-main"><span class="row-title">${what}</span></div><div class="row-end bank-buy"><button class="btn small price"${poor ? ` disabled data-short title="Не хватает золота"` : ""}><span class="price-q">Купить</span>${gold(v.price)}</button></div></div>`;
      this.offer.querySelector<HTMLButtonElement>(".btn")!.onclick = () => this.net.send("bank:buy", {});
    }

    this.foot.innerHTML = `<span class="win-foot-info">Занято ячеек: ${cells.filter(Boolean).length} из ${cells.length}</span><span class="foot-gold"><span class="win-foot-info">В сумке</span>${gold(s?.gold ?? 0)}</span>`;
  }

  /** Обновить при изменении личного состояния (золото в сумке). */
  update() {
    this.render();
  }
}
