/** Сумочник Кожемякин: расширение сумки за золото. Всё проверяет сервер. */
import { npcRefuses } from "./npcGate";
import { gold } from "./gold";
import { BAGMAN, BAGMEN, BAG_MAX, BAG_STEP, bagPrice } from "../../../shared/bags";
import type { Net } from "../net";
import { T } from "../../../shared/texts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class BagsUI {
  private win = document.createElement("div");
  private body: HTMLElement;
  private foot: HTMLElement;
  private net!: Net;
  /** Размер сумки и золото при прошлой перерисовке: без перемен окно не пересобирается. */
  private drawn = "";
  /** Сумочник, у которого открыто окно (Эмберхолл или столица). */
  private who: { id: string; name: string; greeting?: string } = BAGMAN;
  constructor(root: HTMLElement, private showInv: () => void) {
    this.win.className = "panel win s win-bags";
    this.win.hidden = true;
    // каркас строится один раз: заголовок, тело и подвал остаются на месте, при обновлении меняется только содержимое тела и подвала
    this.win.innerHTML = `<h2><span>${esc(BAGMAN.name)}</span><button class="x" aria-label="Закрыть">×</button></h2><div class="body"></div><div class="win-foot"></div>`;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
    net.on("switch", () => this.close());
  }
  get isOpen() { return !this.win.hidden; }
  open(id?: string) {
    if (npcRefuses(this.net, "bags", id)) return;
    this.who = BAGMEN.find((b) => b.id === id) ?? BAGMAN;
    this.win.querySelector("h2 > span")!.textContent = this.who.name;
    this.win.hidden = false;
    this.showInv();
    this.update();
  }
  close(): boolean { const was = !this.win.hidden; this.win.hidden = true; return was; }
  update() {
    if (this.win.hidden) return;
    const s = this.net?.self;
    if (!s) return;
    const size = s.inventory.length;
    const key = `${this.who.id}|${size}|${s.gold}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const price = bagPrice(size);
    // bank-buy — метка для tests/
    const offer = price === null
      ? `<p class="note">${T("ui.bags.363")}</p>`
      : `<div class="list boxed"><div class="row"><div class="row-main"><span class="row-title">${T("ui.bags.364", { bag_step: BAG_STEP })}</span><span class="row-sub">${T("ui.bags.365", { bag_step: size + BAG_STEP })}</span></div>
          <div class="row-end bank-buy"><button class="btn small price"${s.gold < price ? ` disabled data-short title="Не хватает золота"` : ""}><span class="price-q">${T("ui.bags.366")}</span>${gold(price)}</button></div></div></div>`;
    this.body.innerHTML = `<p class="npc-say">${esc(this.who.greeting ?? "")}</p><section class="sec"><h3 class="sec-h">${T("ui.bags.367")}</h3>${offer}</section>`;
    this.foot.innerHTML = `<span class="win-foot-info">${T("ui.bags.368", { size: size, bag_max: BAG_MAX })}</span><span class="foot-gold"><span class="win-foot-info">${T("ui.bags.369")}</span>${gold(s.gold)}</span>`;
    const b = this.body.querySelector<HTMLButtonElement>(".bank-buy .btn");
    if (b) b.onclick = () => this.net.send("bag:expand", {});
  }
}
