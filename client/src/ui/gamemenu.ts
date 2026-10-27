/** Игровое меню по Esc, окно помощи и большая карта мира; окно «Авторы» из меню — ui/credits.ts. */
import type { LogoutMode, Net } from "../net";
import { hotkeySections, keybinds, mouseOpts, type ActionId, type HelpKey } from "../game/keybinds";
import { CreditsUI } from "./credits";
import { T } from "../../../shared/texts";
import { openWarRules } from "./bannerWar";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Подпись клавиши действия. */
const key = (a: ActionId) => keybinds.label(a, 0);
/** Клавиша плашкой (kit.css, .kbd). */
const kbd = (t: string) => `<kbd class="kbd">${esc(t)}</kbd>`;
/** Клавиши строки справки: плашки через « / », слова («стрелки», «клик») — текстом. « / » остаётся текстом между плашками: innerText даёт «G / Shift+G». */
const keysCell = (keys: HelpKey[]) => keys.map((k) => (k.word ? `<span class="c-dim">${esc(k.text)}</span>` : kbd(k.text))).join(' <span class="kbd-plus">/</span> ');

/** Совет про мышь: зависит от схемы клавиш и от опции «ЛКМ атакует» (Настройки → Управление). */
const mouseTip = () => {
  const classic = keybinds.presetId === "classic";
  if (mouseOpts.lmbAttacks) return classic ? T("ui.gamemenu.480") : T("ui.gamemenu.481");
  return classic ? T("ui.gamemenu.482") : T("ui.gamemenu.483");
};
const tips = (): string[] => {
  const hp = key("potionHp"), mp = key("potionMp"), inv = key("winInv");
  return [
    mouseTip(),
    ...(hp && mp ? [T("ui.gamemenu.484", { hp: kbd(hp), mp: kbd(mp) })] : []),
    T("ui.gamemenu.485"),
    T("ui.gamemenu.486"),
    T("ui.gamemenu.487"),
    T("ui.gamemenu.488", { inv: inv ? ` (${kbd(inv)})` : "" }),
  ];
};

/**
 * Окно «Помощь»: клавиши по разделам (hotkeySections) и советы. Все разделы лежат в одном .keys — у таблицы одна колонка клавиш.
 */
export function fillHelp(body: Element) {
  const sections = hotkeySections(keybinds).map((s) => `<h3 class="sec-h">${esc(s.title)}</h3><dl>${s.rows.map((r) => `<div class="keys-row"><dt><span>${keysCell(r.keys)}</span></dt><dd>${esc(r.what)}</dd></div>`).join("")}</dl>`).join("");
  body.innerHTML = `<section class="sec"><div class="keys">${sections}</div></section>
    <section class="sec"><h3 class="sec-h">${T("ui.gamemenu.489")}</h3><ul class="tips">${tips().map((t) => `<li>${t}</li>`).join("")}</ul></section>`;
}

export interface MenuActions {
  toggle(id: string): void;
  openQuests(): void;
  openMap(): void;
  openHelp(): void;
  isAdmin(): boolean;
  net(): Net;
}

export class GameMenu {
  private back = document.createElement("div");
  /** Ожидание выхода (отсчёт в бою): снять подписки и таймер. */
  private waiting: (() => void) | null = null;
  /** Окно «Авторы»: обычное .win в том же корне, что и меню; Esc закрывает его общим Hud.closeTop. */
  private credits: CreditsUI;

  constructor(root: HTMLElement, private a: MenuActions) {
    this.back.className = "gmenu-back";
    this.back.hidden = true;
    this.back.addEventListener("pointerdown", (e) => { if (e.target === this.back) this.close(); });
    root.append(this.back);
    this.credits = new CreditsUI(root);
  }
  get isOpen() { return !this.back.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** Выход из мира: меню и окно «Авторы» (его нет в Hud.wins) закрыты, иначе после входа героем оно уже открыто. */
  reset() { this.close(); this.credits.close(); }
  close(): boolean {
    const was = this.isOpen;
    if (this.waiting) {
      this.a.net().cancelLogout();
      this.stopWaiting();
    }
    this.back.hidden = true;
    this.back.replaceChildren();
    return was;
  }

  open() {
    const a = this.a;
    // [текст, клавиша, действие | null = скоро]
    const items: [string, string, (() => void) | null][] = [
      [T("ui.gamemenu.490"), key("escape"), () => {}],
      [T("ui.gamemenu.491"), key("winChar"), () => a.toggle("char")],
      [T("ui.gamemenu.492"), key("winInv"), () => a.toggle("inv")],
      [T("ui.gamemenu.493"), key("winSkills"), () => a.toggle("skills")],
      [T("ui.gamemenu.494"), "", () => a.openQuests()],
      [T("ui.bestiary.384"), key("winBestiary"), () => a.toggle("bestiary")],
      [T("ui.arena.319"), key("winArena"), () => a.toggle("arena")],
      [T("ui.gamemenu.495"), "", null],
      [T("ui.gamemenu.496"), "", null],
      [T("ui.gamemenu.497"), key("winMap"), () => a.openMap()],
      [T("ui.gamemenu.498"), "", () => a.toggle("settings")],
      [T("ui.gamemenu.499"), "", () => this.credits.toggle()],
      [T("ui.gamemenu.500"), "", () => a.openHelp()],
      [T("ui.bannerWar.40"), "", () => openWarRules()], // правила «Знамён Предела»
      [T("ui.gamemenu.501"), "", () => void window.dispatchEvent(new CustomEvent("emberfall:reconnect"))],
      [T("ui.gamemenu.502"), "", a.net().kind === "arena" ? null : () => this.confirmLogout("char")],
      [T("ui.gamemenu.503"), "", a.net().kind === "arena" ? null : () => this.confirmLogout("account")],
    ];
    if (a.isAdmin()) items.splice(7, 0, [T("ui.gamemenu.504"), key("winAdmin"), () => a.toggle("admin")]);
    const p = document.createElement("div");
    p.className = "panel gmenu gm-main";
    p.innerHTML = `<h2>${T("ui.gamemenu.505")}</h2>`;
    for (const [text, key, fn] of items) {
      const b = document.createElement("button");
      b.className = "btn gm-item";
      b.innerHTML = `<span>${text}</span>${fn ? (key ? `<kbd>${key}</kbd>` : "") : `<small>${text.startsWith("Сменить") || text.startsWith("Выйти") ? "Не на арене" : "Скоро"}</small>`}`;
      b.disabled = !fn;
      if (fn) b.onclick = () => { this.close(); fn(); };
      p.append(b);
    }
    this.back.replaceChildren(p);
    this.back.hidden = false;
    p.querySelector<HTMLButtonElement>(".gm-item")?.focus();
  }

  private stopWaiting() {
    this.waiting?.();
    this.waiting = null;
  }

  /** Подтверждение выхода; дальше решает сервер: сразу или отсчёт 10 с в бою (прерывается уроном). */
  private confirmLogout(mode: LogoutMode) {
    const p = document.createElement("div");
    p.className = "panel gmenu";
    const title = mode === "char" ? T("ui.gamemenu.506") : T("ui.gamemenu.507");
    p.innerHTML = `<h2>${title}</h2><p class="note gm-note">${T("ui.gamemenu.508", { char: mode === "char" ? "Вы вернётесь к выбору героя." : "Вы вернётесь на экран входа." })}</p>`;
    const yes = document.createElement("button"), no = document.createElement("button");
    yes.className = "btn gm-item primary"; yes.textContent = mode === "char" ? T("ui.gamemenu.509") : T("ui.raid.302");
    no.className = "btn gm-item"; no.textContent = T("ui.gamemenu.284");
    no.onclick = () => this.open();
    yes.onclick = () => {
      yes.disabled = no.disabled = true;
      const net = this.a.net();
      const offs = [
        net.on("logout:wait", (m) => this.countdown(m.ms, title)),
        net.on("logout:cancel", () => { this.stopWaiting(); this.close(); }),
        net.on("logout", () => { this.stopWaiting(); this.close(); }),
      ];
      this.waiting = () => offs.forEach((f) => f());
      // связь сломана — выход без сервера (сервер сохранит героя при обрыве)
      if (!net.online) return void window.dispatchEvent(new CustomEvent("emberfall:exit", { detail: mode }));
      net.requestLogout(mode);
    };
    p.append(yes, no);
    this.back.replaceChildren(p);
    this.back.hidden = false;
    no.focus();
  }

  private countdown(ms: number, title: string) {
    const end = performance.now() + ms;
    const p = document.createElement("div");
    p.className = "panel gmenu";
    p.innerHTML = `<h2>${title}</h2><p class="note gm-note">${T("ui.gamemenu.510")}</p><div class="logout-wait"></div><p class="note gm-note">${T("ui.gamemenu.511")}</p>`;
    const cancel = document.createElement("button");
    cancel.className = "btn gm-item"; cancel.textContent = T("ui.gamemenu.284");
    cancel.onclick = () => this.close();
    p.append(cancel);
    const out = p.querySelector<HTMLElement>(".logout-wait")!;
    const tick = () => (out.textContent = `${Math.max(0, Math.ceil((end - performance.now()) / 1000))} с`);
    tick();
    const t = window.setInterval(tick, 200);
    const prev = this.waiting;
    this.waiting = () => { window.clearInterval(t); prev?.(); };
    this.back.replaceChildren(p);
    this.back.hidden = false;
    cancel.focus();
  }
}
