/** Окно обмена между игроками: запрос, два столбца по 8 слотов, золото, «Готов» → «Обменять». */
import { gold } from "./gold";
import { iconFor, itemName, type Item } from "../../../shared/items";
import { plusBadge } from "./smith";
import type { SelfState } from "../../../shared/protocol";
import { TRADE_SLOTS, type TradeSideView, type TradeView } from "../../../shared/trade";
import type { Net } from "../net";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface TradeHost {
  itemTip(it: Item, s: SelfState): string;
  tipFor(elm: HTMLElement, html: () => string): void;
  hideTip(): void;
}

export class TradeUI {
  private net!: Net;
  private win = el("div", "panel win l win-trade");
  // запрос обмена — диалог .dialog на подложке .modal (kit.css); arena-modal и arena-dialog — метки для tests/
  private ask = el("div", "modal arena-modal");
  private menu = el("div", "panel ctx-menu");
  private title: HTMLElement;
  private body: HTMLElement;
  private ready: HTMLButtonElement;
  private confirm: HTMLButtonElement;
  private state: TradeView | null = null;
  private askTimer = 0;
  private confirmTimer = 0;
  /** Подсветка изменённых слотов: ключ "m3"/"t3"/"mg"/"tg" -> до какого времени. */
  private flash = new Map<string, number>();
  private confirmAt = 0;

  constructor(root: HTMLElement, private host: TradeHost) {
    this.win.hidden = true;
    this.ask.hidden = true;
    this.menu.hidden = true;
    this.menu.setAttribute("role", "menu");
    // каркас строится один раз: заголовок, .body и подвал остаются на месте, при обновлении меняются колонки и кнопки (фокус кнопок не теряется)
    this.win.innerHTML = `<h2><span></span><button class="x" aria-label="Закрыть">×</button></h2><div class="body"></div>
      <div class="win-foot"><button class="btn" data-x>Отмена</button><div class="actions"><button class="btn" data-r>Готов</button><button class="btn primary" data-c>Обменять</button></div></div>`;
    this.title = this.win.querySelector<HTMLElement>("h2 > span")!;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.ready = this.win.querySelector<HTMLButtonElement>("[data-r]")!;
    this.confirm = this.win.querySelector<HTMLButtonElement>("[data-c]")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.win.querySelector<HTMLButtonElement>("[data-x]")!.onclick = () => this.close();
    this.ready.onclick = () => this.net.send("trade:ready");
    this.confirm.onclick = () => this.net.send("trade:confirm");
    root.append(this.win, this.ask, this.menu);
    document.addEventListener("pointerdown", (e) => {
      if (!this.menu.hidden && !this.menu.contains(e.target as Node)) this.menu.hidden = true;
    });
  }

  bind(net: Net) {
    this.net = net;
    net.on("trade:request", (m) => this.showAsk(m));
    net.on("trade:state", (v) => this.apply(v));
    net.on("switch", () => this.apply(null));
  }

  get isOpen() {
    return !!this.state;
  }
  /** Индексы сумки, выложенные в окно обмена. */
  lockedIndices(): Set<number> {
    return new Set((this.state?.mine.index ?? []).filter((i) => i >= 0));
  }
  /** Клик по предмету сумки при открытом окне — выложить его. */
  offer(index: number, slot?: number) {
    this.net.send("trade:add", { index, slot });
  }
  close(): boolean {
    if (!this.state) return false;
    this.net.send("trade:cancel");
    return true;
  }

  /** Контекстное меню по правому клику на игроке: «Осмотреть» (если передан onInspect) и «Предложить обмен». */
  showMenu(id: string, name: string, x: number, y: number, onInspect?: () => void, onFollow?: () => void) {
    const item = (a: string, label: string) => `<button class="btn small opt" role="menuitem" data-a="${a}">${label}</button>`;
    this.menu.innerHTML = `<div class="row-title ctx-name">${esc(name)}</div>${onInspect ? item("inspect", "Осмотреть") : ""}${item("trade", "Предложить обмен")}${onFollow ? item("follow", "Следовать") : ""}`;
    this.menu.style.left = Math.min(x, innerWidth - 200) + "px";
    this.menu.style.top = Math.min(y, innerHeight - 170) + "px";
    this.menu.hidden = false;
    this.menu.querySelector<HTMLButtonElement>("[data-a=trade]")!.onclick = () => {
      this.menu.hidden = true;
      this.net.send("trade:request", { id });
    };
    const fol = this.menu.querySelector<HTMLButtonElement>("[data-a=follow]");
    if (fol) fol.onclick = () => {
      this.menu.hidden = true;
      onFollow!();
    };
    const insp = this.menu.querySelector<HTMLButtonElement>("[data-a=inspect]");
    if (insp) insp.onclick = () => {
      this.menu.hidden = true;
      onInspect!();
    };
  }

  private showAsk(m: { from: string; ms: number } | null) {
    clearTimeout(this.askTimer);
    if (!m) return void (this.ask.hidden = true);
    this.ask.hidden = false;
    const until = performance.now() + m.ms;
    // вторичная кнопка слева, главная справа; сколько осталось на ответ — слева в подвале
    this.ask.innerHTML = `<section class="panel dialog sm arena-dialog" role="alertdialog" aria-labelledby="trade-ask-title">
      <div class="dialog-head"><h2 class="dialog-title" id="trade-ask-title">Обмен</h2></div>
      <div class="dialog-body"><p><b>${esc(m.from)}</b> предлагает обмен.</p></div>
      <div class="dialog-foot"><span class="win-foot-info" data-left></span><button class="btn" data-a="0">Отклонить</button><button class="btn primary" data-a="1">Принять</button></div></section>`;
    const left = this.ask.querySelector<HTMLElement>("[data-left]")!;
    const tick = () => {
      const s = Math.ceil((until - performance.now()) / 1000);
      if (s <= 0) return void (this.ask.hidden = true);
      left.textContent = `Осталось ${s} с`;
      this.askTimer = window.setTimeout(tick, 250);
    };
    tick();
    this.ask.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = () => {
      clearTimeout(this.askTimer);
      this.net.send("trade:respond", { accept: b.dataset.a === "1" });
      this.ask.hidden = true;
    }));
  }

  private apply(v: TradeView | null) {
    this.state = v;
    clearTimeout(this.confirmTimer);
    if (!v) {
      this.win.hidden = true;
      this.host.hideTip();
      if (this.net.self) this.onChange?.();
      return;
    }
    const now = performance.now();
    for (const i of v.mine.changed) this.flash.set("m" + i, now + 1500);
    for (const i of v.theirs.changed) this.flash.set("t" + i, now + 1500);
    if (v.mine.goldChanged) this.flash.set("mg", now + 1500);
    if (v.theirs.goldChanged) this.flash.set("tg", now + 1500);
    this.confirmAt = now + v.confirmIn;
    this.win.hidden = false;
    this.render();
    this.onChange?.();
    if (v.confirmIn > 0) this.confirmTimer = window.setTimeout(() => this.render(), v.confirmIn + 30);
  }
  /** Сумка перерисовывается, чтобы показать заблокированные предметы. */
  onChange?: () => void;

  /** Колонка стороны: заголовок со статусом, 8 слотов (свои — кнопки: клик убирает вещь, сюда же бросают из сумки), золото. */
  private column(side: TradeSideView, mine: boolean): HTMLElement {
    const k = mine ? "m" : "t";
    const status = side.confirm ? `<span class="chip ok">Подтверждено ✓</span>` : side.ready ? `<span class="chip ok">Готов ✓</span>` : `<span class="chip dim">Не готов</span>`;
    const amount = mine
      ? `<span class="trade-amt"><input class="input num" type="number" min="0" step="1" value="${side.gold}" aria-label="Золото в обмене"><img class="coin" src="${icon("coin")}" alt="золото"></span>`
      : gold(side.gold);
    const col = el("section", "sec flat trade-col", `<div class="sec-head"><h3 class="sec-h">${mine ? "Вы отдаёте" : "Вы получаете"}</h3>${status}</div>
      <div class="cells trade-grid"></div>
      <${mine ? "label" : "div"} class="trade-gold${this.lit(k + "g") ? " changed" : ""}"><span class="field-label">Золото</span>${amount}</${mine ? "label" : "div"}>`);
    const grid = col.querySelector(".cells")!;
    for (let i = 0; i < TRADE_SLOTS; i++) {
      const it = side.items[i];
      // кнопка только там, где клик что-то делает: своя занятая ячейка
      const c = el(mine && it ? "button" : "div", `cell${it ? " r" + it.rarity : " empty"}${this.lit(k + i) ? " changed" : ""}`);
      if (it) c.innerHTML = `<img src="${icon(iconFor(it))}" alt="${esc(itemName(it))}">${plusBadge(it)}${it.qty && it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ""}`;
      if (it) this.host.tipFor(c, () => this.host.itemTip(it, this.net.self!) + (mine ? `<div class="d">Клик — убрать из обмена</div>` : ""));
      if (mine) {
        if (it) c.onclick = () => { this.host.hideTip(); this.net.send("trade:remove", { slot: i }); };
        c.ondragover = (e) => { e.preventDefault(); c.classList.add("drop"); };
        c.ondragleave = () => c.classList.remove("drop");
        c.ondrop = (e) => {
          e.preventDefault();
          c.classList.remove("drop");
          const from = Number(e.dataTransfer!.getData("text/plain"));
          if (Number.isInteger(from)) this.offer(from, i);
        };
      }
      grid.append(c);
    }
    if (mine) {
      const inp = col.querySelector<HTMLInputElement>("input")!;
      inp.addEventListener("keydown", (e) => e.stopPropagation());
      inp.onchange = () => this.net.send("trade:gold", { v: Math.max(0, Math.floor(Number(inp.value) || 0)) });
    }
    return col;
  }
  private lit(k: string) {
    return (this.flash.get(k) ?? 0) > performance.now();
  }

  private render() {
    const v = this.state;
    if (!v) return;
    const me = v.mine, they = v.theirs;
    const bothReady = me.ready && they.ready;
    const wait = Math.max(0, this.confirmAt - performance.now());
    const typed = document.activeElement instanceof HTMLInputElement && this.body.contains(document.activeElement) ? document.activeElement.value : null;
    const top = this.body.scrollTop;
    this.title.textContent = `Обмен с ${they.name}`;
    this.ready.disabled = me.ready;
    this.confirm.disabled = !bothReady || me.confirm || wait > 0;
    this.confirm.textContent = `Обменять${bothReady && wait > 0 ? ` (${Math.ceil(wait / 1000)})` : ""}`;
    const cols = el("div", "trade-cols");
    cols.append(this.column(me, true), el("div", "divider v"), this.column(they, false));
    this.body.replaceChildren(
      ...(v.gift ? [el("div", "trade-gift", `<span class="chip ok">Подарок</span><span class="note">Вы ничего не отдаёте</span>`)] : []),
      cols,
      el("p", "note", "Перетащите предметы из сумки или кликните по ним. Любое изменение сбрасывает подтверждения."),
    );
    this.body.scrollTop = top;
    if (typed !== null) {
      const inp = this.body.querySelector<HTMLInputElement>("input")!;
      inp.value = typed;
      inp.focus();
    }
    if (bothReady && wait > 0) this.confirmTimer = window.setTimeout(() => this.render(), Math.min(1000, wait) + 20);
    const nextFlash = Math.min(...[...this.flash.values()].filter((t) => t > performance.now()));
    if (Number.isFinite(nextFlash)) window.setTimeout(() => this.state === v && this.render(), nextFlash - performance.now() + 20);
  }
}
