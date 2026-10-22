/** Игровое меню по Esc, окно помощи и большая карта мира; окно «Авторы» из меню — ui/credits.ts. */
import type { LogoutMode, Net } from "../net";
import { hotkeySections, keybinds, mouseOpts, type ActionId, type HelpKey } from "../game/keybinds";
import { CreditsUI } from "./credits";

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
  if (mouseOpts.lmbAttacks) return classic ? "Клик по врагу — атака, клик по земле — движение." : "ЛКМ и ПКМ по врагу — атака, ПКМ по земле — движение.";
  return classic ? "Клик по земле — движение, ПКМ по врагу — атака, ЛКМ по врагу — выбор цели." : "ЛКМ — выбор цели, ПКМ — атака и движение.";
};
const tips = (): string[] => {
  const hp = key("potionHp"), mp = key("potionMp"), inv = key("winInv");
  return [
    mouseTip(),
    ...(hp && mp ? [`Зелья здоровья и маны — клавиши ${kbd(hp)} и ${kbd(mp)}.`] : []),
    "Города безопасны. За стенами уровень врагов растёт — смотрите на подпись зоны под картой.",
    "Задания берите у NPC в городах: награда золотом и опытом.",
    "Тачпад: двухпальцевый тап — ПКМ (атака, взаимодействие); колесо или щипок — масштаб; «Крупные цели» — в настройках «Управление».",
    `Тяжёлые вещи продавайте торговцу, лучшие надевайте через сумку${inv ? ` (${kbd(inv)})` : ""}.`,
  ];
};

/**
 * Окно «Помощь»: клавиши по разделам (hotkeySections) и советы. Все разделы лежат в одном .keys — у таблицы одна колонка клавиш;
 * её читает tests/keybinds-screens.ts (innerText первого .keys).
 */
export function fillHelp(body: Element) {
  const sections = hotkeySections(keybinds).map((s) => `<h3 class="sec-h">${esc(s.title)}</h3><dl>${s.rows.map((r) => `<div class="keys-row"><dt><span>${keysCell(r.keys)}</span></dt><dd>${esc(r.what)}</dd></div>`).join("")}</dl>`).join("");
  body.innerHTML = `<section class="sec"><div class="keys">${sections}</div></section>
    <section class="sec"><h3 class="sec-h">Советы</h3><ul class="tips">${tips().map((t) => `<li>${t}</li>`).join("")}</ul></section>`;
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
      ["Продолжить", key("escape"), () => {}],
      ["Персонаж", key("winChar"), () => a.toggle("char")],
      ["Инвентарь", key("winInv"), () => a.toggle("inv")],
      ["Умения", key("winSkills"), () => a.toggle("skills")],
      ["Квесты", "", () => a.openQuests()],
      ["Бестиарий", key("winBestiary"), () => a.toggle("bestiary")],
      ["Арена", key("winArena"), () => a.toggle("arena")],
      ["Достижения", "", null],
      ["Друзья и гильдия", "", null],
      ["Карта", key("winMap"), () => a.openMap()],
      ["Настройки", "", () => a.toggle("settings")],
      ["Авторы", "", () => this.credits.toggle()],
      ["Помощь", "", () => a.openHelp()],
      ["Переподключиться", "", () => void window.dispatchEvent(new CustomEvent("emberfall:reconnect"))],
      ["Сменить персонажа", "", a.net().kind === "arena" ? null : () => this.confirmLogout("char")],
      ["Выйти из аккаунта", "", a.net().kind === "arena" ? null : () => this.confirmLogout("account")],
    ];
    if (a.isAdmin()) items.splice(7, 0, ["Админ-панель", key("winAdmin"), () => a.toggle("admin")]);
    const p = document.createElement("div");
    p.className = "panel gmenu gm-main";
    p.innerHTML = `<h2>Пепельный Предел</h2>`;
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
    const title = mode === "char" ? "Сменить героя?" : "Выйти из аккаунта?";
    p.innerHTML = `<h2>${title}</h2><p class="note gm-note">${mode === "char" ? "Вы вернётесь к выбору героя." : "Вы вернётесь на экран входа."} Прогресс сохранится.</p>`;
    const yes = document.createElement("button"), no = document.createElement("button");
    yes.className = "btn gm-item primary"; yes.textContent = mode === "char" ? "Сменить героя" : "Выйти";
    no.className = "btn gm-item"; no.textContent = "Отмена";
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
    p.innerHTML = `<h2>${title}</h2><p class="note gm-note">Вы в бою: выход через</p><div class="logout-wait"></div><p class="note gm-note">Полученный урон прервёт выход.</p>`;
    const cancel = document.createElement("button");
    cancel.className = "btn gm-item"; cancel.textContent = "Отмена";
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
