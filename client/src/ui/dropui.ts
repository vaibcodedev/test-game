/** Выброс и уничтожение вещей из сумки: меню по ПКМ, подтверждение (редкие и выше, стопки — с выбором количества), слово для привязанных и квестовых. */
import { DROP } from "../../../shared/drop";
import { isBound, itemName, RARITY_COLORS, type Item } from "../../../shared/items";
import { isQuestItem } from "../../../shared/quests";
import { T } from "../../../shared/texts";
import { openModal } from "./kit";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const cannotDrop = (it: Item) => isBound(it) || isQuestItem(it.base);

export class DropUI {
  private menuEl: HTMLElement | null = null;
  constructor(private send: (type: string, msg: unknown) => void) {
    const close = () => this.closeMenu();
    window.addEventListener("pointerdown", (e) => { if (this.menuEl && !this.menuEl.contains(e.target as Node)) close(); }, true);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, true);
  }
  closeMenu() { this.menuEl?.remove(); this.menuEl = null; }

  /** Меню предмета: свои пункты (extra) и «Выбросить»/«Уничтожить». */
  menu(e: MouseEvent, index: number, it: Item, extra: { label: string; run: () => void }[] = []) {
    e.preventDefault();
    this.closeMenu();
    const m = document.createElement("div");
    m.className = "dmenu panel";
    const items = [...extra, cannotDrop(it) ? { label: T("ui.drop.destroy"), run: () => this.ask(index, it), danger: true } : { label: T("ui.drop.menu"), run: () => this.ask(index, it) }];
    for (const o of items) {
      const b = document.createElement("button");
      b.className = "dmenu-i" + ((o as { danger?: boolean }).danger ? " danger" : "");
      b.textContent = o.label;
      b.onclick = () => { this.closeMenu(); o.run(); };
      m.append(b);
    }
    document.body.append(m);
    m.style.left = `${Math.min(e.clientX, window.innerWidth - 150)}px`;
    m.style.top = `${Math.min(e.clientY, window.innerHeight - 40 * items.length)}px`;
    this.menuEl = m;
  }

  /** Перетащили за окно или выбрали пункт: нужное подтверждение и отправка. */
  ask(index: number, it: Item) {
    const qty = it.qty ?? 1;
    if (cannotDrop(it)) return this.confirm(index, it, true);
    if (it.rarity >= DROP.confirmRarity || qty > 1) return this.confirm(index, it, false);
    this.send("drop", { index, qty: 1 });
  }

  private confirm(index: number, it: Item, destroy: boolean) {
    const qty = it.qty ?? 1;
    const root = document.createElement("section");
    root.className = "panel dialog drop-dlg";
    root.setAttribute("role", "dialog");
    const word = DROP.destroyWord;
    root.innerHTML = `<div class="dialog-head"><h2 class="dialog-title">${esc(T(destroy ? "ui.drop.titleDestroy" : "ui.drop.title"))}</h2></div>
      <div class="dialog-body"><p class="drop-nm" style="color:${RARITY_COLORS[it.rarity]}">${esc(itemName(it))}${qty > 1 ? ` ×${qty}` : ""}</p>
      ${destroy ? `<p class="note c-warn">${esc(T("ui.drop.destroyHint", { word }))}</p><input class="drop-word" type="text" autocomplete="off" maxlength="20" placeholder="${esc(word)}">`
        : `${qty > 1 ? `<label class="drop-q">${esc(T("ui.drop.howMany"))}: <input class="drop-n" type="number" min="1" max="${qty}" value="${qty}"> / ${qty}</label>` : ""}<p class="note">${esc(T("ui.drop.hintOwner", { sec: DROP.ownerLockSec, ttl: DROP.ttlSec }))}</p>`}</div>
      <div class="dialog-foot"><button class="btn" data-no>${esc(T("ui.drop.cancel"))}</button><button class="btn ${destroy ? "danger" : "primary"}" data-ok ${destroy ? "disabled" : ""}>${esc(T(destroy ? "ui.drop.destroy" : "ui.drop.ok"))}</button></div>`;
    const h = openModal(root);
    const ok = root.querySelector<HTMLButtonElement>("[data-ok]")!;
    const wordIn = root.querySelector<HTMLInputElement>(".drop-word");
    const nIn = root.querySelector<HTMLInputElement>(".drop-n");
    if (wordIn) wordIn.oninput = () => (ok.disabled = wordIn.value.trim().toUpperCase() !== word);
    root.querySelector<HTMLElement>("[data-no]")!.onclick = () => h.close();
    ok.onclick = () => {
      if (destroy) this.send("destroy", { index, word: wordIn!.value });
      else this.send("drop", { index, qty: nIn ? Math.max(1, Math.min(qty, Math.floor(Number(nIn.value)) || 1)) : 1 });
      h.close();
    };
    (wordIn ?? nIn ?? ok).focus();
  }
}
