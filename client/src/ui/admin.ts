/** Админ-панель (F10): игроки, выдача, мир, логи. Кнопка видна только админам; все права проверяет сервер. */
import { ZONES } from "../../../shared/map";
import { MOBS } from "../../../shared/mobs";
import type { Net } from "../net";
import { GiveTab, plural } from "./adminGive";
import { tabs } from "./kit";
import { collisionDebug } from "../game/collisionDebug";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (ms: number) => new Date(ms).toLocaleString("ru-RU");
const opts = (ids: string[], name: (id: string) => string) => ids.map((id) => `<option value="${esc(id)}">${esc(name(id))} (${esc(id)})</option>`).join("");
const TABS: [string, string][] = [["players", "Игроки"], ["give", "Выдача"], ["world", "Мир"], ["logs", "Логи"]];
/** Объявление держится столько, чтобы успеть прочесть: 5 с и ещё 60 мс на знак, не дольше 12 с; уход — 400 мс (styles/adm.css). */
const bannerMs = (text: string) => Math.min(12000, 5000 + text.length * 60);
const BANNER_OUT_MS = 400;

export class AdminUI {
  private win = document.createElement("div");
  private banner = document.createElement("div");
  private net!: Net;
  private tab = "players";
  private players: { name: string; cls: string; level: number; x: number; y: number }[] = [];
  private logs: { kind: string; rows: any[] } = { kind: "trades", rows: [] };
  /** Призванные монстры для вкладки «Мир» (admin:summoned): сервер присылает после призыва, убийства и по запросу. */
  private summoned: { id: string; name: string; level: number; hp: number; maxHp: number; boss: boolean; d: number }[] = [];
  private logKind = "trades";
  private logName = "";
  private target = "";
  private bannerTimer = 0;
  /** Вкладка «Выдача» — каталог предметов (adminGive.ts). Создаётся при первом открытии (обычным игрокам не нужна) и хранит состояние при смене вкладок. */
  private giveTab?: GiveTab;
  /** Идёт выбор точки телепорта на карте мира: окно админки спрятано до клика или Esc. */
  private picking = false;

  /** pickOnMap — карта мира в режиме выбора точки (hud.pickOnMap): клик → onPick(x, y) в пикселях мира, Esc или закрытие карты → onCancel. */
  constructor(root: HTMLElement, private pickOnMap?: (onPick: (x: number, y: number) => void, onCancel: () => void) => void) {
    this.win.className = "panel win win-admin l";
    this.win.hidden = true;
    this.banner.className = "panel adm-banner";
    this.banner.hidden = true;
    this.banner.setAttribute("role", "status");
    this.banner.innerHTML = `<span class="adm-banner-k">Объявление</span><span class="adm-banner-rule" aria-hidden="true"></span><p class="adm-banner-t"></p>`;
    root.append(this.win, this.banner);
  }

  bind(net: Net) {
    this.net = net;
    net.on("admin:players", (m) => { this.players = m; this.giveTab?.setPlayers(m); if (this.tab === "players") this.render(); });
    net.on("admin:logs", (m) => { this.logs = m; if (this.tab === "logs") this.render(); });
    net.on("admin:summoned", (m) => { this.summoned = m; if (this.tab === "world" && !this.win.hidden) this.render(); });
    net.on("admin:banner", (m) => {
      const b = this.banner;
      b.querySelector(".adm-banner-t")!.textContent = m.text;
      clearTimeout(this.bannerTimer);
      // показать: снять hidden, кадр спустя — класс show (переход прозрачности и сдвига); убрать: снять show, после ухода — hidden
      b.hidden = false;
      requestAnimationFrame(() => b.classList.add("show"));
      this.bannerTimer = window.setTimeout(() => {
        b.classList.remove("show");
        this.bannerTimer = window.setTimeout(() => (b.hidden = true), BANNER_OUT_MS);
      }, bannerMs(m.text));
    });
  }

  toggle() {
    if (this.picking) return; // карта выбора точки открыта: выход из неё — Esc
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
    if (this.tab === "world") this.net.send("admin:summoned");
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
      const zones = ZONES.map((z, i) => (z.name === "Арена" || z.unused ? "" : `<option value="${i}">${esc(z.name)}</option>`)).join("");
      return `<section class="sec flat"><h3 class="sec-h">Призыв монстра</h3>
        <div class="adm-row"><label class="field grow"><span class="field-label">Монстр</span><select id="w-mob" class="input">${opts(Object.keys(MOBS), (i) => MOBS[i].name)}</select></label>
        <label class="field"><span class="field-label">Уровень</span><input id="w-lv" class="input num" type="number" min="1" max="60" value="10"></label>
        <button class="btn" data-act="spawn">Призвать рядом</button></div></section>
        ${this.summonedSec()}
        <section class="sec"><h3 class="sec-h">Отладка</h3>
        <div class="adm-row"><button class="btn" data-act="collgrid" title="Красным — непроходимые клетки вокруг героя">Сетка проходимости: ${collisionDebug.on ? "вкл" : "выкл"}</button></div></section>
        <section class="sec"><h3 class="sec-h">Объявление</h3>
        <label class="field"><span class="field-label">Текст</span><span class="input-group"><input id="w-text" class="input" maxlength="140"><button class="btn" data-act="announce">Объявить</button></span></label></section>
        <section class="sec"><h3 class="sec-h">Ивент «Знамёна Предела»</h3>
        <div class="adm-row"><button class="btn primary" data-act="war-start">Начать сейчас</button><button class="btn" data-act="war-heart">Открыть Сердца</button><button class="btn" data-act="war-end">Завершить</button><button class="btn danger" data-act="war-reset">Сбросить владельцев</button></div></section>
        <section class="sec"><div class="sec-head"><h3 class="sec-h">Телепорт</h3><button class="btn small" data-act="tp-map" title="Выбрать точку кликом по карте мира">Карта</button></div>
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

  /** Раздел «Призванные монстры»: строка на каждого живого (имя, уровень, здоровье, расстояние) с кнопкой «Убить»; над списком — «Убить цель»
   *  (любой монстр в цели, обычный возродится) и «Убить всех призванных». Убитый админом не даёт добычи и опыта (server/src/game/admin.ts). */
  private summonedSec(): string {
    const list = this.summoned;
    const rows = list.map((m) => `<div class="row"><div class="row-main">
        <span class="row-title">${esc(m.name)}<span class="meta">ур. ${m.level}</span>${m.boss ? ' <span class="chip boss">Босс</span>' : ""}</span>
        <span class="row-sub">HP ${Math.round((m.hp / Math.max(1, m.maxHp)) * 100)}% · ${m.d} ${plural(m.d, "тайл", "тайла", "тайлов")} от вас</span></div>
        <div class="row-end"><button class="btn small danger" data-act="despawn" data-id="${esc(m.id)}">Убить</button></div></div>`).join("");
    return `<section class="sec"><div class="sec-head"><h3 class="sec-h">Призванные монстры</h3><span class="sec-aside">${list.length}</span></div>
        <div class="adm-tools"><button class="btn small" data-act="kill-target" title="Монстр в цели — любой; обычный возродится по таймеру">Убить цель</button>
        <button class="btn small danger" data-act="despawn-all"${list.length ? "" : " disabled"}>Убить всех призванных</button>
        <button class="btn small" data-act="summoned">Обновить</button></div>
        ${list.length ? `<div class="list boxed adm-summoned">${rows}</div>` : `<p class="note">Призванных монстров нет</p>`}</section>`;
  }

  /** «Карта»: окно админки прячется, карта мира открывается в режиме выбора точки. Клик по карте — admin:tp { x, y } (сервер ставит на ближайшую
   *  проходимую клетку), окно остаётся закрытым: админ смотрит на место, куда попал. Esc или закрытие карты — окно возвращается. */
  private pickTeleport() {
    if (!this.pickOnMap) return;
    this.picking = true;
    this.win.hidden = true;
    this.pickOnMap(
      (x, y) => { this.picking = false; this.net.send("admin:tp", { x, y }); },
      () => { this.picking = false; if (this.net.self?.isAdmin) this.win.hidden = false; },
    );
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
        case "collgrid": collisionDebug.on = !collisionDebug.on; return this.refresh();
        case "summoned": return send("admin:summoned");
        case "despawn": return send("admin:despawn", { id: b.dataset.id ?? "" });
        case "despawn-all": return send("admin:despawn", { all: true });
        case "kill-target": return send("admin:kill-target");
        case "announce": return send("admin:announce", { text: val("w-text") });
        case "war-start": case "war-heart": case "war-end": case "war-reset": return send("admin:war", { act: (b.dataset.act ?? "").slice(4) });
        case "tp-name": return send("admin:tp", { name: val("w-tp-name") });
        case "tp-xy": return send("admin:tp", { x: nv("w-x"), y: nv("w-y") });
        case "tp-map": return this.pickTeleport();
        case "tp-zone": return send("admin:tp", { zone: nv("w-zone") });
        case "logs": this.logKind = val("l-kind"); this.logName = val("l-name"); return this.refresh();
      }
    }));
    // поля ввода не должны запускать игровые горячие клавиши
    this.win.querySelectorAll("input,select").forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  }
}
