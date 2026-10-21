/** Админ-панель (F10): игроки, выдача, мир, логи. Кнопка видна только админам; все права проверяет сервер. */
import { ZONES } from "../../../shared/map";
import { MOBS } from "../../../shared/mobs";
import type { Net } from "../net";
import { GiveTab } from "./adminGive";
import { tabs } from "./kit";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (ms: number) => new Date(ms).toLocaleString("ru-RU");
const opts = (ids: string[], name: (id: string) => string) => ids.map((id) => `<option value="${esc(id)}">${esc(name(id))} (${esc(id)})</option>`).join("");
const TABS: [string, string][] = [["players", "Игроки"], ["give", "Выдача"], ["world", "Мир"], ["logs", "Логи"]];

export class AdminUI {
  private win = document.createElement("div");
  private banner = document.createElement("div");
  private net!: Net;
  private tab = "players";
  private players: { name: string; cls: string; level: number; x: number; y: number }[] = [];
  private logs: { kind: string; rows: any[] } = { kind: "trades", rows: [] };
  private logKind = "trades";
  private logName = "";
  private target = "";
  private bannerTimer = 0;
  /** Вкладка «Выдача» — каталог предметов (adminGive.ts). Создаётся при первом открытии (обычным игрокам не нужна) и хранит состояние при смене вкладок. */
  private giveTab?: GiveTab;

  constructor(root: HTMLElement) {
    this.win.className = "panel win win-admin l";
    this.win.hidden = true;
    this.banner.className = "adm-banner";
    this.banner.hidden = true;
    root.append(this.win, this.banner);
  }

  bind(net: Net) {
    this.net = net;
    net.on("admin:players", (m) => { this.players = m; this.giveTab?.setPlayers(m); if (this.tab === "players") this.render(); });
    net.on("admin:logs", (m) => { this.logs = m; if (this.tab === "logs") this.render(); });
    net.on("admin:banner", (m) => {
      this.banner.textContent = m.text;
      this.banner.hidden = false;
      clearTimeout(this.bannerTimer);
      this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), 7000);
    });
  }

  toggle() {
    this.win.hidden = !this.win.hidden;
    if (!this.win.hidden) this.refresh();
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  private give(): GiveTab {
    if (!this.giveTab) {
      this.giveTab = new GiveTab({ send: (t, m) => this.net.send(t, m), selfName: () => this.net.self?.name ?? "" });
      this.giveTab.bind(this.net);
      this.giveTab.setPlayers(this.players);
    }
    return this.giveTab;
  }

  private refresh() {
    if (this.tab === "players" || this.tab === "give") this.net.send("admin:players");
    if (this.tab === "logs") this.net.send("admin:logs", { kind: this.logKind, name: this.logName });
    this.render();
  }

  private render() {
    const tabBtns = TABS.map(([id, n]) => `<button class="tab" id="adm-tab-${id}" data-tab="${id}" aria-controls="adm-body"${id === this.tab ? ' aria-selected="true"' : ""}>${n}</button>`).join("");
    const wide = this.tab === "give";
    this.win.classList.toggle("adm-wide", wide);
    this.win.classList.toggle("l", !wide);
    this.win.classList.toggle("xl", wide);
    this.win.innerHTML = `<h2><span>Админ-панель</span><button class="x" aria-label="Закрыть">×</button></h2><div class="tabs">${tabBtns}</div><div class="body" id="adm-body" role="tabpanel">${wide ? "" : this.body()}</div>`;
    if (wide) { const g = this.give(); this.win.querySelector(".body")!.append(g.el); g.activate(this.target); this.target = ""; /* явный выбор получателя действует один раз */ }
    // окно сдвигали и оно стало шире: пусть модуль перетаскивания заново вернёт его в экран
    if (this.win.dataset.moved) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => (this.win.hidden = true);
    tabs(this.win.querySelector<HTMLElement>(".tabs")!, (key) => { this.tab = key; this.refresh(); });
    this.wire();
  }

  private body(): string {
    if (this.tab === "players") {
      const rows = this.players.map((p) => `<tr><td class="grow">${esc(p.name)}</td><td class="nowrap">${esc(p.cls)} ${p.level}</td><td class="nowrap dim">${p.x}, ${p.y}</td><td class="nowrap"><div class="adm-acts">
        <button class="btn small" data-act="tp" data-n="${esc(p.name)}">ТП</button>
        <button class="btn small" data-act="kick" data-n="${esc(p.name)}">Кик</button>
        <button class="btn small danger" data-act="ban" data-n="${esc(p.name)}">Бан</button>
        <button class="btn small" data-act="unban" data-n="${esc(p.name)}">Разбан</button>
        <button class="btn small primary" data-act="give" data-n="${esc(p.name)}">Выдать</button></div></td></tr>`).join("");
      return `<section class="sec flat"><div class="sec-head"><h3 class="sec-h">Бан</h3><button class="btn small" data-act="reload">Обновить</button></div>
        <div class="adm-row"><label class="field"><span class="field-label">Срок, часов (0 — навсегда)</span><input id="adm-ban-h" class="input num" type="number" min="0"></label>
        <label class="field grow"><span class="field-label">Причина</span><input id="adm-ban-r" class="input"></label></div>
        <label class="field"><span class="field-label">Имя героя (для разбана офлайн)</span><span class="input-group"><input id="adm-who" class="input"><button class="btn" data-act="unban-name">Разбан</button></span></label></section>
        <section class="sec"><div class="sec-head"><h3 class="sec-h">Игроки онлайн</h3><span class="sec-aside">${this.players.length}</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Имя</th><th>Класс и уровень</th><th>Позиция</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }
    if (this.tab === "world") {
      const zones = ZONES.map((z, i) => (z.name === "Арена" ? "" : `<option value="${i}">${esc(z.name)}</option>`)).join("");
      return `<section class="sec flat"><h3 class="sec-h">Призыв монстра</h3>
        <div class="adm-row"><label class="field grow"><span class="field-label">Монстр</span><select id="w-mob" class="input">${opts(Object.keys(MOBS), (i) => MOBS[i].name)}</select></label>
        <label class="field"><span class="field-label">Уровень</span><input id="w-lv" class="input num" type="number" min="1" max="60" value="10"></label>
        <button class="btn" data-act="spawn">Призвать рядом</button></div></section>
        <section class="sec"><h3 class="sec-h">Объявление</h3>
        <label class="field"><span class="field-label">Текст</span><span class="input-group"><input id="w-text" class="input" maxlength="140"><button class="btn" data-act="announce">Объявить</button></span></label></section>
        <section class="sec"><h3 class="sec-h">Телепорт</h3>
        <label class="field"><span class="field-label">К игроку</span><span class="input-group"><input id="w-tp-name" class="input"><button class="btn" data-act="tp-name">Телепорт</button></span></label>
        <div class="adm-row"><label class="field"><span class="field-label">x</span><input id="w-x" class="input num" type="number"></label>
        <label class="field"><span class="field-label">y</span><input id="w-y" class="input num" type="number"></label>
        <button class="btn" data-act="tp-xy">ТП на x, y</button></div>
        <div class="adm-row"><label class="field grow"><span class="field-label">Зона</span><select id="w-zone" class="input">${zones}</select></label><button class="btn" data-act="tp-zone">ТП в зону</button></div></section>`;
    }
    const L = this.logs;
    const rows = L.rows.map((r) => L.kind === "trades"
      ? `<tr><td class="nowrap">${date(r.at)}</td><td>${esc(r.a)} ⇄ ${esc(r.b)}</td><td>${esc(this.items(r.a_items))} +${r.a_gold} з</td><td>${esc(this.items(r.b_items))} +${r.b_gold} з</td></tr>`
      : `<tr><td class="nowrap">${date(r.at)}</td><td>${esc(r.admin)}</td><td>${esc(r.action)}</td><td>${esc(r.target)} ${esc(r.details)}</td></tr>`).join("");
    const head = L.kind === "trades" ? "<th>Время</th><th>Участники</th><th>A отдал</th><th>B отдал</th>" : "<th>Время</th><th>Админ</th><th>Действие</th><th>Цель и детали</th>";
    return `<section class="sec flat"><div class="adm-row"><label class="field"><span class="field-label">Журнал</span><select id="l-kind" class="input"><option value="trades"${this.logKind === "trades" ? " selected" : ""}>Сделки</option><option value="admin"${this.logKind === "admin" ? " selected" : ""}>Журнал админов</option></select></label>
      <label class="field grow"><span class="field-label">Фильтр по имени</span><input id="l-name" class="input" value="${esc(this.logName)}"></label>
      <button class="btn" data-act="logs">Показать</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  private items(json: string): string {
    try { return (JSON.parse(json) as { name?: string; qty?: number }[]).map((i) => i.name + (i.qty && i.qty > 1 ? "×" + i.qty : "")).join(", ") || "—"; } catch { return "—"; }
  }

  private wire() {
    const val = (id: string) => (this.win.querySelector<HTMLInputElement>("#" + id)?.value ?? "").trim();
    const nv = (id: string) => Number(val(id));
    const send = (t: string, m: object = {}) => this.net.send(t, m);
    this.win.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => (b.onclick = () => {
      const n = b.dataset.n ?? "";
      switch (b.dataset.act) {
        case "reload": return this.refresh();
        case "tp": return send("admin:tp", { name: n });
        case "kick": return send("admin:kick", { name: n });
        case "ban": return send("admin:ban", { name: n, hours: nv("adm-ban-h"), reason: val("adm-ban-r") });
        case "unban": return send("admin:unban", { name: n });
        case "unban-name": return send("admin:unban", { name: val("adm-who") });
        case "give": this.target = n; this.tab = "give"; return this.refresh();
        case "spawn": return send("admin:spawn", { mob: val("w-mob"), level: nv("w-lv") });
        case "announce": return send("admin:announce", { text: val("w-text") });
        case "tp-name": return send("admin:tp", { name: val("w-tp-name") });
        case "tp-xy": return send("admin:tp", { x: nv("w-x"), y: nv("w-y") });
        case "tp-zone": return send("admin:tp", { zone: nv("w-zone") });
        case "logs": this.logKind = val("l-kind"); this.logName = val("l-name"); return this.refresh();
      }
    }));
    // поля ввода не должны запускать игровые горячие клавиши
    this.win.querySelectorAll("input,select").forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  }
}
