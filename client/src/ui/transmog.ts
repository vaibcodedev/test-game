/**
 * Перековщик (docs/transmog.md): окно по дизайн-системе (kit.css, как окно кузнеца). Вкладки «Снять оболочку» и «Наложить»:
 * ячейки вещей, превью героя «было | станет», цена, кнопки в подвале. Все проверки повторяет сервер (server/src/game/transmog.ts).
 */
import { npcRefuses } from "./npcGate";
import { gold } from "./gold";
import { tabs } from "./kit";
import { plusBadge } from "./smith";
import { iconFor, itemName, SLOT_NAMES, SLOTS, type Appearance, type Item, type Slot } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";
import { applyPrice, applyRefusal, extractPrice, extractRefusal, FAMILY_NAMES, familyOf, gearStrings, isShell, ownAppearance, REFORGER, resetPrice, slotOf, withLook } from "../../../shared/transmog";
import { previewImg } from "../game/gearPreview";
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
type Tab = "extract" | "apply";
type Ref = { index: number } | { slot: Slot };
const same = (a: Ref | null, b: Ref | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** Превью «было | станет» своего героя: вещь ставится в свой слот (из сумки — как будто надета), затем на неё — вид ap (null — свой). */
export function lookPair(s: SelfState, it: Item, ap: Appearance | null, ref: Ref | null): string {
  const slot: Slot = ref && "slot" in ref ? ref.slot : slotOf(it.base) ?? "weapon";
  const was = { ...s.equip, [slot]: it };
  const will = withLook(was, slot, ap);
  const a = gearStrings(was), b = gearStrings(will);
  return `<div class="tm-pair">
    <figure class="tm-fig">${previewImg(s.cls, s.faction, a.gear, a.weapon, "tm-hero", T("ui.transmog.was"))}<figcaption>${T("ui.transmog.was")}</figcaption></figure>
    <span class="tm-arrow" aria-hidden="true">→</span>
    <figure class="tm-fig">${previewImg(s.cls, s.faction, b.gear, b.weapon, "tm-hero", T("ui.transmog.will"))}<figcaption>${T("ui.transmog.will")}</figcaption></figure>
  </div>`;
}

export class TransmogUI {
  private win = el("div", "panel win m win-tm");
  private body: HTMLElement;
  private foot: HTMLElement;
  private net!: Net;
  private tab: Tab = "extract";
  /** Вкладка «Снять»: донор; «Наложить»: оболочка (индекс в сумке) и вещь. */
  private donor: number | null = null;
  private shell: number | null = null;
  private target: Ref | null = null;

  constructor(root: HTMLElement) {
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span>${esc(REFORGER.name)}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="tabs fill tm-tabs" aria-label="${esc(REFORGER.name)}"><button class="tab" id="tm-tab-extract" data-tab="extract" aria-controls="tm-body" aria-selected="true">${T("ui.transmog.tabExtract")}</button><button class="tab" id="tm-tab-apply" data-tab="apply" aria-controls="tm-body">${T("ui.transmog.tabApply")}</button></div>
      <div class="body" id="tm-body" role="tabpanel"></div><div class="win-foot"></div>`;
    this.body = this.win.querySelector<HTMLElement>(".body")!;
    this.foot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    tabs(this.win.querySelector<HTMLElement>(".tm-tabs")!, (key) => { this.tab = key as Tab; this.refresh(); });
    root.append(this.win);
  }
  bind(net: Net) {
    this.net = net;
    net.on("switch", () => this.close());
    // после действия выбор сбрасывается: донор распался, оболочка исчезла
    net.on("tm:done", () => { this.donor = null; this.shell = null; this.target = null; this.refresh(); });
  }
  get isOpen() { return !this.win.hidden; }
  open(id?: string) {
    if (npcRefuses(this.net, "transmog", id)) return;
    this.win.hidden = false;
    this.refresh();
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
  private refresh() { if (this.net?.self) this.update(this.net.self); }

  update(s: SelfState) {
    if (this.win.hidden) return;
    const go: HTMLButtonElement[] = [];
    const parts = this.tab === "extract" ? this.extractTab(s, go) : this.applyTab(s, go);
    // приветствие — только на первой вкладке: на «Наложить» превью «было | станет» помещается без прокрутки
    this.body.replaceChildren(...(this.tab === "extract" ? [el("p", "npc-say", esc(REFORGER.greeting))] : []), ...parts);
    this.foot.innerHTML = `<span class="win-foot-info">${T("ui.bags.369")}</span>${gold(s.gold)}`;
    for (const b of go) this.foot.append(b);
  }

  private cell(it: Item, pressed: boolean, label: string, onClick: () => void): HTMLElement {
    const c = el("button", `cell r${it.rarity}`);
    c.setAttribute("aria-pressed", String(pressed));
    c.title = `${label ? label + ": " : ""}${itemName(it)}`;
    c.innerHTML = `<img src="${icon(iconFor(it))}" alt="${esc(itemName(it))}">${plusBadge(it)}${it.appearance && !isShell(it) ? '<span class="tm-mark" aria-hidden="true">◈</span>' : ""}`;
    c.onclick = onClick;
    return c;
  }
  private group(title: string, aside: string, cells: HTMLElement[], empty: string): HTMLElement {
    const sec = el("section", "sec", `<div class="sec-head"><h3 class="sec-h">${title}</h3>${aside ? `<span class="sec-aside">${aside}</span>` : ""}</div>`);
    if (cells.length) { const g = el("div", "cells"); g.append(...cells); sec.append(el("div", "smith-pick")); sec.lastElementChild!.append(g); }
    else sec.append(el("p", "note", empty));
    return sec;
  }
  private headRow(it: Item, sub: string): HTMLElement {
    return el("div", "smith-item", `<div class="cell r${it.rarity}"><img src="${icon(iconFor(it))}" alt="">${plusBadge(it)}</div>
      <div class="row-main"><span class="row-title c-r${it.rarity}">${esc(itemName(it))}</span><span class="row-sub">${esc(sub)}</span></div>`);
  }
  private priceRow(price: number, have: number): HTMLElement {
    return el("dl", "kv", `<dt>${T("ui.transmog.price")}</dt><dd${have < price ? ' class="bad"' : ""}>${gold(price)}</dd>`);
  }
  private button(text: string, ok: boolean, why: string, send: () => void, primary = true): HTMLButtonElement {
    const b = el("button", `btn${primary ? " primary" : ""} smith-go`, esc(text));
    b.disabled = !ok;
    if (!ok && why) b.title = why;
    b.onclick = send;
    return b;
  }
  private familyLine(it: Item): string {
    const f = familyOf(it.base), sl = slotOf(it.base);
    return `${sl ? SLOT_NAMES[sl] : ""} · ${T("ui.transmog.family")}: ${f ? FAMILY_NAMES[f] ?? f : "—"}`;
  }

  /** «Снять оболочку»: донор — вещь из сумки (без наложенного вида). */
  private extractTab(s: SelfState, go: HTMLButtonElement[]): HTMLElement[] {
    if (this.donor !== null && extractRefusal(s.inventory[this.donor])) this.donor = null;
    const cells: HTMLElement[] = [];
    s.inventory.forEach((it, i) => { if (it && !extractRefusal(it)) cells.push(this.cell(it, this.donor === i, "", () => { this.donor = i; this.refresh(); })); });
    const pick = this.group(T("ui.transmog.pickDonor"), T("ui.transmog.pickDonorAside"), cells, T("ui.transmog.noDonors"));
    const info = el("section", "sec smith-info tm-info", `<h3 class="sec-h">${T("ui.transmog.tabExtract")}</h3>`);
    const it = this.donor !== null ? s.inventory[this.donor] : null;
    if (!it) {
      info.append(el("p", "note", T("ui.transmog.pickHint")));
      go.push(this.button(T("ui.transmog.extractGo"), false, T("ui.transmog.pickHint"), () => {}));
      return [pick, info];
    }
    const price = extractPrice(it);
    info.append(this.headRow(it, this.familyLine(it)));
    // как этот вид сядет на героя (вещь того же слота — вместо надетой)
    info.append(el("div", "tm-preview", lookPair(s, s.equip[slotOf(it.base) ?? "weapon"] ?? it, ownAppearance(it), null)));
    info.append(this.priceRow(price, s.gold));
    info.append(el("p", "note c-warn", esc(T("ui.transmog.extractNote", { name: it.name }))));
    const idx = this.donor!;
    go.push(this.button(T("ui.transmog.extractGo"), s.gold >= price, T("ui.transmog.notEnough"), () => this.net.send("tm:extract", { index: idx })));
    return [pick, info];
  }

  /** «Наложить»: оболочка из сумки и вещь того же слота и семейства (надетая или в сумке); у вещи с чужим видом — «Сбросить вид». */
  private applyTab(s: SelfState, go: HTMLButtonElement[]): HTMLElement[] {
    if (this.shell !== null && !isShell(s.inventory[this.shell])) this.shell = null;
    const shell = this.shell !== null ? s.inventory[this.shell]! : null;
    const itemOf = (r: Ref | null) => (r ? ("slot" in r ? s.equip[r.slot] : s.inventory[r.index]) : null);
    const shellCells: HTMLElement[] = [];
    s.inventory.forEach((it, i) => { if (isShell(it)) shellCells.push(this.cell(it!, this.shell === i, "", () => { this.shell = i; this.target = null; this.refresh(); })); });
    const pickShell = this.group(T("ui.transmog.pickShell"), "", shellCells, T("ui.transmog.noShells"));
    // вещи: с выбранной оболочкой — подходящие по слоту и семейству; без неё — с наложенным видом (их можно сбросить)
    const ok = (it: Item | null | undefined) => !!it && !isShell(it) && !!familyOf(it.base) && (shell ? !applyRefusal(shell, it) : !!it.appearance);
    const tCells: HTMLElement[] = [];
    for (const slot of SLOTS) { const it = s.equip[slot]; if (ok(it)) tCells.push(this.cell(it!, same(this.target, { slot }), SLOT_NAMES[slot], () => { this.target = { slot }; this.refresh(); })); }
    s.inventory.forEach((it, index) => { if (ok(it)) tCells.push(this.cell(it!, same(this.target, { index }), "", () => { this.target = { index }; this.refresh(); })); });
    if (!ok(itemOf(this.target))) this.target = null;
    const pickT = this.group(T("ui.transmog.pickTarget"), shell ? esc(this.familyLine({ ...shell, base: shell.appearance!.base })) : "", tCells, shell ? T("ui.transmog.noTargets") : T("ui.transmog.pickShellHint"));
    const info = el("section", "sec smith-info tm-info", `<h3 class="sec-h">${T("ui.transmog.tabApply")}</h3>`);
    const it = itemOf(this.target);
    if (!it) {
      info.append(el("p", "note", shell ? T("ui.transmog.pickHint") : T("ui.transmog.pickShellHint")));
      go.push(this.button(T("ui.transmog.applyGo"), false, T("ui.transmog.pickHint"), () => {}));
      return [pickShell, pickT, info];
    }
    const ref = this.target!;
    info.append(this.headRow(it, this.familyLine(it)));
    if (it.appearance) info.append(el("p", "note c-ench", esc(T("ui.transmog.lookOf", { name: it.appearance.name }))));
    if (shell) {
      const price = applyPrice(shell, it);
      info.append(el("div", "tm-preview", lookPair(s, it, shell.appearance!, ref)));
      info.append(this.priceRow(price, s.gold));
      info.append(el("p", "note", esc(T("ui.transmog.applyNote"))));
      if (it.appearance) info.append(el("p", "note c-warn", esc(T("ui.transmog.replaceNote", { name: it.appearance.name }))));
      const sh = this.shell!;
      go.push(this.button(T("ui.transmog.applyGo"), s.gold >= price, T("ui.transmog.notEnough"), () => this.net.send("tm:apply", { shell: sh, ...ref })));
    } else {
      info.append(el("div", "tm-preview", lookPair(s, it, null, ref)));
    }
    if (it.appearance) {
      const price = resetPrice(it);
      if (!shell) info.append(this.priceRow(price, s.gold));
      go.unshift(this.button(T("ui.transmog.resetGo"), s.gold >= price, T("ui.transmog.notEnough"), () => this.net.send("tm:reset", { ...ref }), !shell));
    }
    return [pickShell, pickT, info];
  }
}
