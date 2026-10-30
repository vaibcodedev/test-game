/**
 * Окно «Авторы» (меню Esc → «Авторы»): кто сделал паки, шрифты, иконки, анимации умений и библиотеки, на каких лицензиях.
 * Текст — data/credits.json (собран из docs/content/credits.md); здесь только разметка. Обычное окно .win: тянется за заголовок (ui/drag.ts),
 * закрывается крестиком и Esc (Hud.closeTop берёт верхнее .win и прячет его).
 */
import credits from "../../../data/credits.json";
import { T } from "../../../shared/texts";

interface IconAuthor { name: string; icons: string[] }
interface CreditItem {
  /** Название пака, шрифта или библиотеки. */
  name: string;
  /** Строка об авторе целиком: «Автор: …», «Авторы: …». */
  by?: string;
  /** Страница пака или автора (только https): под названием, без протокола. */
  url?: string;
  /** Что взято или для чего. */
  what?: string;
  /** Лицензия плашкой справа; licenseUrl делает плашку ссылкой на текст лицензии. */
  license?: string;
  licenseUrl?: string;
  /** Пояснение или просьба автора. */
  note?: string;
  /** Иконки по авторам (CC BY 3.0 требует назвать автора каждой): раскрывающийся список под строкой. */
  authors?: IconAuthor[];
}
interface CreditSection { title: string; text?: string; items: CreditItem[]; foot?: string }
interface CreditsData { title: string; intro: string; sections: CreditSection[] }

const DATA: CreditsData = credits;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const host = (url: string) => url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
/** Ссылка в новой вкладке; не https — просто текст. */
const link = (url: string, text = host(url), cls = "") =>
  /^https:\/\//.test(url) ? `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);

function authorsHtml(list: IconAuthor[]): string {
  const rows = list.map((a) => `<p class="cr-auth"><b>${esc(a.name)}</b> ${esc(a.icons.join(", "))}</p>`).join("");
  return `<details class="disclosure cr-more"><summary>${T("ui.credits.475")}</summary><div class="disclosure-body">${rows}</div></details>`;
}

function itemHtml(it: CreditItem): string {
  const who = [it.by && esc(it.by), it.url && link(it.url)].filter(Boolean).join(" · ");
  const lines = [
    who && `<span class="row-sub">${who}</span>`,
    it.what && `<span class="row-sub">${esc(it.what)}</span>`,
    it.note && `<span class="row-sub">${esc(it.note)}</span>`,
    it.authors && authorsHtml(it.authors),
  ].filter(Boolean).join("");
  const lic = !it.license ? "" : it.licenseUrl ? link(it.licenseUrl, it.license, "chip dim") : `<span class="chip dim">${esc(it.license)}</span>`;
  return `<li class="row cr-item"><div class="row-main"><span class="row-title">${esc(it.name)}</span>${lines}</div>${lic}</li>`;
}

function sectionHtml(s: CreditSection): string {
  return `<section class="sec"><h3 class="sec-h">${esc(s.title)}</h3>${s.text ? `<p class="note">${esc(s.text)}</p>` : ""}`
    + `<ul class="list boxed">${s.items.map(itemHtml).join("")}</ul>${s.foot ? `<p class="note">${esc(s.foot)}</p>` : ""}</section>`;
}

export class CreditsUI {
  private win = document.createElement("div");

  constructor(root: HTMLElement) {
    // первый класс на «win-» — имя окна для положения в drag.ts
    this.win.className = "panel win l win-credits";
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span>${esc(DATA.title)}</span><button class="x" aria-label="Закрыть">×</button></h2>`
      + `<div class="body"><p class="note">${esc(DATA.intro)}</p>${DATA.sections.map(sectionHtml).join("")}</div>`;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => (this.win.hidden = true);
    root.append(this.win);
  }

  get isOpen() { return !this.win.hidden; }
  toggle() {
    this.win.hidden = !this.win.hidden;
    if (!this.win.hidden) this.win.querySelector<HTMLElement>(".body")!.scrollTop = 0;
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
}
