/** Интерфейс арены: окно (рейтинг, очередь, группа, лидеры, история), подтверждение матча, табло боя, результаты. */
import {
  ACCEPT_MS, ARENA_MODES, BOT_RATING_MULT, MODE_NAMES, queueWindow, rankById, rankOf, RANKS, START_RATING,
  type ArenaInfo, type ArenaMode, type ArenaResultMsg, type HistoryRow, type LeaderRow, type MatchFoundMsg,
} from "../../../shared/arena";
import { CLASSES, type ClassId } from "../../../shared/classes";
import { UnitKind } from "../../../shared/protocol";
import type { Net, UnitState } from "../net";
import { seg, setHidden, tabs, type TabsHandle } from "./kit";
import { formatNumber } from "./gold";
import { absorbApply } from "./absorb";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clsName = (c: string) => CLASSES[c as ClassId]?.name ?? c;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** Чип ранга: цвет ранга — в --c чипа. */
const badge = (rating: number) => {
  const r = rankOf(rating);
  return `<span class="chip" style="--c:${r.color}">${r.name}</span>`;
};
/** Изменение рейтинга со знаком и цветом: минус — U+2212, ноль нейтральный. */
const deltaTag = (n: number) => `<span class="delta ${n > 0 ? "c-ok" : n < 0 ? "c-bad" : "c-dim"}">${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}</span>`;
const when = (at: number) => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " ");
const seasonText = (s: ArenaInfo["season"]) => {
  const left = Math.max(0, s.endsAt - s.now);
  return `Сезон ${s.id} · до конца ${Math.floor(left / 86400000)} дн. ${Math.floor((left % 86400000) / 3600000)} ч.`;
};
const TABS = [["rating", "Рейтинг и очередь"], ["top", "Лидеры"], ["history", "История"]] as const;
const RESULT = { win: { name: "Победа", tone: "c-ok" }, loss: { name: "Поражение", tone: "c-bad" }, draw: { name: "Ничья", tone: "c-dim" } } as const;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class ArenaUI {
  net!: Net;
  private win = el("div", "panel win l win-arena");
  // подложки диалогов — .modal из kit.css; arena-modal — метка для tests/
  private found = el("div", "modal arena-modal");
  private invite = el("div", "modal arena-modal");
  private results = el("div", "modal arena-modal");
  private winBody!: HTMLElement;
  private winFoot!: HTMLElement;
  private tabsH!: TabsHandle;
  private drawn = ""; // вкладка, показанная при прошлой перерисовке: при смене прокрутка сбрасывается
  private board = el("div", "panel arena-board");
  private countdown = el("div", "arena-countdown passthru");
  private partyBox = el("div", "panel hud-party");
  private partySig = "";
  private tab: "rating" | "top" | "history" = "rating";
  private topMode: ArenaMode = "1v1";
  private top: Partial<Record<ArenaMode, LeaderRow[]>> = {};
  private history: HistoryRow[] | null = null;
  private infoAt = 0;
  private foundMsg: MatchFoundMsg | null = null;
  private foundAt = 0;
  private acceptedSelf = false;
  private lastPhase = "";
  private resultTimer = 0;
  private bound = false;

  constructor(
    readonly root: HTMLElement,
    readonly toast: (text: string, kind?: "info" | "error" | "loot" | "level") => void,
  ) {
    for (const e of [this.win, this.found, this.invite, this.results, this.board, this.countdown]) e.hidden = true;
    this.partyBox.hidden = true;
    this.buildWin();
    root.append(this.win, this.board, this.countdown, this.partyBox, this.found, this.invite, this.results);
  }

  bind(net: Net) {
    this.net = net;
    if (this.bound) return;
    this.bound = true;
    net.on("arena:info", () => {
      this.infoAt = performance.now();
      this.renderWin();
    });
    net.on("party", () => this.renderWin());
    net.on("arena:top", (m) => {
      this.top[m.mode] = m.rows;
      if (this.tab === "top") this.renderWin();
    });
    net.on("arena:history", (rows) => {
      this.history = rows;
      if (this.tab === "history") this.renderWin();
    });
    net.on("arena:found", (m) => this.showFound(m));
    net.on("arena:cancelled", (m) => {
      this.found.hidden = true;
      this.foundMsg = null;
      this.toast(m.reason, "error");
      net.send("arena:info");
    });
    net.on("party:invite", (m) => this.showInvite(m.from));
    net.on("arena:result", (r) => this.showResult(r));
    net.on("switch", (kind) => {
      this.found.hidden = true;
      this.foundMsg = null;
      if (kind === "world") {
        this.results.hidden = true;
        clearTimeout(this.resultTimer);
        net.send("arena:info");
      } else this.win.hidden = true;
    });
  }

  get isOpen() {
    return !this.win.hidden;
  }
  toggle() {
    if (this.win.hidden) this.open();
    else this.close();
  }
  open() {
    if (this.net.kind === "arena") return this.toast("Окно арены доступно в мире", "error");
    this.win.hidden = false;
    this.net.send("arena:info");
    this.renderWin();
  }
  close(): boolean {
    const was = !this.win.hidden || !this.invite.hidden;
    this.win.hidden = true;
    this.invite.hidden = true;
    return was;
  }

  // ---------- окно арены ----------
  /** Каркас строится один раз: заголовок, вкладки и .body остаются на месте, при обновлении меняется только содержимое .body. */
  private buildWin() {
    this.win.innerHTML = `<h2><span>Арена</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="tabs" aria-label="Разделы арены">${TABS.map(([key, name]) => `<button class="btn tab" id="arena-tab-${key}" data-tab="${key}" aria-controls="arena-body">${name}</button>`).join("")}</div>
      <div class="body" id="arena-body" role="tabpanel"></div>
      <div class="win-foot"><span class="win-foot-info"></span></div>`;
    this.winBody = this.win.querySelector<HTMLElement>(".body")!;
    this.winFoot = this.win.querySelector<HTMLElement>(".win-foot")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.tabsH = tabs(this.win.querySelector<HTMLElement>(".tabs")!, (key) => {
      this.tab = key as typeof this.tab;
      if (this.tab === "top") this.net.send("arena:top", { mode: this.topMode });
      if (this.tab === "history") this.net.send("arena:history");
      this.renderWin();
    });
  }

  private renderWin() {
    if (this.win.hidden) return;
    const info = this.net.arenaInfo;
    this.winFoot.hidden = !info;
    if (info) this.winFoot.firstElementChild!.textContent = seasonText(info.season);
    this.tabsH.select(this.tab);
    // содержимое собирается отдельно и подменяется разом: прокрутка не сбрасывается, а имя, набранное в поле приглашения, переживает перерисовку
    const typed = this.winBody.querySelector<HTMLInputElement>("#party-invite-name");
    const keep = typed && { value: typed.value, focus: document.activeElement === typed, from: typed.selectionStart, to: typed.selectionEnd };
    const next = el("div");
    if (!info) next.append(el("p", "note", "Загрузка…"));
    else if (this.tab === "rating") this.renderRating(next, info);
    else if (this.tab === "top") this.renderTop(next);
    else this.renderHistory(next);
    this.winBody.replaceChildren(...next.childNodes);
    const field = keep && this.winBody.querySelector<HTMLInputElement>("#party-invite-name");
    if (keep && field) {
      field.value = keep.value;
      if (keep.focus) {
        field.focus();
        field.setSelectionRange(keep.from, keep.to);
      }
    }
    if (this.drawn !== this.tab) this.winBody.scrollTop = this.win.scrollTop = 0;
    this.drawn = this.tab;
  }

  private renderRating(body: HTMLElement, info: ArenaInfo) {
    const cards = el("div", "cards two");
    for (const mode of ARENA_MODES) {
      const r = info.ratings[mode];
      const card = el("div", "card mode-card", `
        <div class="card-title">${MODE_NAMES[mode]}</div>
        <div class="mode-rating">${r.rating}</div>
        <div class="mode-rank">${badge(r.rating)}${r.place ? `<span class="meta">${r.place} место</span>` : ""}</div>
        <div class="card-meta">Побед ${r.wins} · поражений ${r.losses}${r.draws ? ` · ничьих ${r.draws}` : ""}</div>`);
      const act = el("div", "card-actions fill");
      const q = info.queue;
      if (q && q.mode === mode) {
        card.append(el("div", "queue-status", `<span class="dot"></span> В очереди <b data-wait>${mmss(q.waitedMs)}</b> · окно ±<span data-window>${q.window}</span>${q.withParty ? " · с группой" : ""}`));
        if (q.note) card.append(el("p", "note", esc(q.note)));
        const cancel = el("button", "btn", "Выйти из очереди");
        cancel.onclick = () => this.net.send("arena:cancel");
        act.append(cancel);
      } else {
        const inParty = (info.party?.members.length ?? 0) > 1;
        if (mode === "2v2") card.append(el("p", "note", inParty ? "Группа встанет в очередь вместе." : "Одиночек сервер соберёт в пару с близким рейтингом."));
        const b = el("button", "btn primary", mode === "2v2" && inParty ? "В очередь с группой" : "В очередь");
        b.disabled = !!info.queue || info.pending;
        b.onclick = () => this.net.send("arena:queue", { mode });
        act.append(b);
      }
      card.append(act); // кнопка прижата к низу карточки: у обеих карточек она на одной высоте
      cards.append(card);
    }
    const modes = el("section", "sec");
    modes.append(cards);
    body.append(modes);

    // группа
    const party = el("section", "sec");
    const head = el("div", "sec-head", `<h3 class="sec-h">Группа</h3>`);
    party.append(head);
    const members = info.party?.members ?? [];
    if (members.length) {
      party.append(el("ul", "list boxed", members.map((m) => `<li class="row dense"><span class="row-title">${esc(m.name)}<span class="meta">ур. ${m.level}</span></span><span class="row-end"><span class="meta">${clsName(m.cls)}</span>${m.online ? "" : '<span class="chip dim">Не в сети</span>'}</span></li>`).join("")));
      const leave = el("button", "btn small", "Покинуть группу");
      leave.onclick = () => this.net.send("party:leave");
      head.append(leave);
    } else {
      const input = el("input", "input");
      input.placeholder = "Имя игрока";
      input.maxLength = 16;
      input.id = "party-invite-name";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Имя игрока");
      const go = el("button", "btn", "Пригласить");
      const send = () => { if (input.value.trim()) this.net.send("party:invite", { name: input.value.trim() }); input.value = ""; };
      go.onclick = send;
      input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") send(); });
      const row = el("div", "input-group");
      row.append(input, go);
      party.append(el("p", "note", "Для 2×2 пригласите напарника: он должен быть в мире."), row);
    }
    body.append(party);

    // титулы
    const titles = el("section", "sec", `<h3 class="sec-h">Титул и рамка</h3>`);
    if (!info.titles.length) titles.append(el("p", "note", "Титулы по рангу: " + RANKS.map((r) => `<span class="c-var" style="--c:${r.color}">${r.title}</span>`).join(", ") + "."));
    else {
      const list = el("div", "title-list choice");
      for (const t of ["", ...info.titles]) {
        const b = el("button", "btn", t ? esc(t) : "Без титула");
        b.setAttribute("aria-pressed", String(info.title === t));
        b.onclick = () => this.net.send("arena:title", { name: t });
        list.append(b);
      }
      titles.append(list);
    }
    titles.append(el("p", "note", `В конце сезона — титул, рамка и медальон по рангу, рейтинг частично сбрасывается к ${START_RATING}.`));
    body.append(titles);
  }

  private renderTop(body: HTMLElement) {
    const sw = el("div", "seg inline", ARENA_MODES.map((m) => `<button class="seg-opt" data-mode="${m}" aria-pressed="${this.topMode === m}">${MODE_NAMES[m]}</button>`).join(""));
    sw.setAttribute("aria-label", "Режим");
    seg(sw, (mode) => { this.topMode = mode as ArenaMode; this.net.send("arena:top", { mode: this.topMode }); this.renderWin(); }, "mode");
    body.append(sw);
    const rows = this.top[this.topMode];
    if (!rows) return void body.append(el("p", "note", "Загрузка…"));
    if (!rows.length) return void body.append(el("p", "note", "В этом сезоне ещё никто не сыграл. Станьте первым!"));
    const me = this.net.self?.name;
    body.append(el("div", "tbl-wrap", `<table class="tbl"><thead><tr><th class="num">#</th><th class="grow">Герой</th><th>Класс</th><th>Ранг</th><th class="num">Рейтинг</th><th class="num" title="Победы – поражения">П–П</th></tr></thead><tbody>${rows
      .map((r) => `<tr${r.name === me ? ' class="me"' : ""}><td class="num dim">${r.place}</td><td class="grow">${esc(r.name)}</td><td class="nowrap dim">${clsName(r.cls)}</td><td>${badge(r.rating)}</td><td class="num">${r.rating}</td><td class="num">${r.wins}–${r.losses}</td></tr>`)
      .join("")}</tbody></table>`));
  }

  private renderHistory(body: HTMLElement) {
    const rows = this.history;
    if (!rows) return void body.append(el("p", "note", "Загрузка…"));
    if (!rows.length) return void body.append(el("p", "note", "Вы ещё не сражались на арене."));
    const line = (r: HistoryRow) => {
      const o = RESULT[r.result];
      return `<tr><td class="nowrap dim">${when(r.at)}</td><td class="nowrap">${MODE_NAMES[r.mode]}${r.bot ? ' <span class="chip dim" title="Бой с ботом: рейтинг меняется слабее">Бот</span>' : ""}</td><td class="nowrap res ${o.tone}">${o.name}</td><td class="grow">${esc(r.enemies.join(", ") || "—")}${r.allies.length ? `<span class="sub">с ${esc(r.allies.join(", "))}</span>` : ""}</td><td class="num">${r.rating}${deltaTag(r.delta)}</td><td class="num">${r.damage}</td><td class="num">${r.healing}</td></tr>`;
    };
    body.append(el("div", "tbl-wrap", `<table class="tbl"><thead><tr><th>Когда</th><th>Режим</th><th>Итог</th><th class="grow">Соперники</th><th class="num">Рейтинг</th><th class="num">Урон</th><th class="num">Лечение</th></tr></thead><tbody>${rows.map(line).join("")}</tbody></table>`));
  }

  // ---------- всплывающие окна ----------
  // Диалоги — .dialog из kit.css на подложке .modal (arena-dialog, .wide и [data-a] — метки для tests/); вторичная кнопка слева, главная справа.
  private showFound(m: MatchFoundMsg) {
    const first = !this.foundMsg;
    this.foundMsg = m;
    if (first) {
      this.foundAt = performance.now() - (ACCEPT_MS - m.ms);
      this.acceptedSelf = false;
    }
    const me = this.net.self?.name ?? "";
    const total = m.teams.flat().length;
    const slot = (p: MatchFoundMsg["teams"][number][number]) => `<div class="vs-p${p.name === me ? " me" : ""}"><span class="vs-name">${esc(p.name)}${m.accepted.includes(p.name) ? ' <span class="c-ok" title="Принял">✓</span>' : ""}</span><span class="meta">${clsName(p.cls)} · ${p.rating}</span></div>`;
    this.found.hidden = false;
    this.found.innerHTML = `<section class="panel dialog arena-dialog" role="alertdialog" aria-labelledby="found-title">
      <div class="dialog-head"><h2 class="dialog-title" id="found-title">${m.bot ? "Сразиться с ботом?" : "Матч найден"} · ${MODE_NAMES[m.mode]}</h2></div>
      <div class="dialog-body">
        ${m.bot ? `<p class="note">Соперник не найден. Бой с ботом: рейтинг меняется в ${Math.round(1 / BOT_RATING_MULT)} раза слабее.</p>` : ""}
        <div class="versus">${m.teams.map((t) => `<div class="team">${t.map(slot).join("")}</div>`).join('<div class="vs">VS</div>')}</div>
        <div class="bar accept"><i data-accept></i></div>
      </div>
      <div class="dialog-foot">${this.acceptedSelf
        ? `<span class="win-foot-info">Ждём остальных: ${m.accepted.length}/${total}</span>`
        : `<button class="btn" data-a="0">Отклонить</button><button class="btn primary" data-a="1">Принять</button>`}</div></section>`;
    this.found.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = () => {
      if (b.dataset.a === "1") {
        this.acceptedSelf = true;
        this.net.send("arena:accept");
        this.showFound(this.foundMsg!);
      } else this.net.send("arena:decline");
    }));
  }

  private showInvite(from: string) {
    this.invite.hidden = false;
    this.invite.innerHTML = `<section class="panel dialog sm arena-dialog" role="alertdialog" aria-labelledby="invite-title">
      <div class="dialog-head"><h2 class="dialog-title" id="invite-title">Приглашение в группу</h2></div>
      <div class="dialog-body"><p>${esc(from)} приглашает вас в группу.</p></div>
      <div class="dialog-foot"><button class="btn" data-a="0">Отказаться</button><button class="btn primary" data-a="1">Принять</button></div></section>`;
    this.invite.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = () => {
      this.net.send("party:respond", { accept: b.dataset.a === "1" });
      this.invite.hidden = true;
    }));
  }

  private showResult(r: ArenaResultMsg) {
    const me = r.players.find((p) => p.name === this.net.self?.name);
    const title = !me ? "Матч окончен" : me.draw ? "Ничья" : me.won ? "Победа!" : "Поражение";
    const tone = !me ? "" : me.draw ? " c-dim" : me.won ? " c-ok" : " c-bad";
    const reason = r.reason === "time" ? "Время вышло: решил суммарный процент здоровья" : r.reason === "leave" ? "Соперник покинул бой" : "Все противники повержены";
    const change = me ? me.ratingAfter - me.ratingBefore : 0;
    const team = (t: number) => r.players.filter((p) => p.team === t).map((p) => `<tr class="team${t}${p.name === me?.name ? " me" : ""}"><td class="grow">${esc(p.name)}${p.left ? ' <span class="chip bad">Вышел</span>' : ""}</td><td class="nowrap dim">${clsName(p.cls)}</td><td class="num">${p.damage}</td><td class="num">${p.healing}</td><td class="num">${p.kills}/${p.deaths}</td><td class="num">${p.ratingAfter}${deltaTag(p.ratingAfter - p.ratingBefore)}</td></tr>`).join("");
    this.results.hidden = false;
    this.results.innerHTML = `<section class="panel dialog lg arena-dialog wide" role="dialog" aria-labelledby="res-title">
      <div class="dialog-head"><h2 class="dialog-title${tone}" id="res-title">${title}</h2></div>
      <div class="dialog-body">
        <p class="note">${MODE_NAMES[r.mode]} · ${reason} · ${mmss(r.durationMs)}</p>
        ${me ? `<div class="res-rating"><span class="meta">Рейтинг</span><span>${me.ratingBefore} → <b>${me.ratingAfter}</b></span>${deltaTag(change)}${badge(me.ratingAfter)}${r.bot ? `<span class="meta">Бой с ботом: рейтинг ×${BOT_RATING_MULT}</span>` : ""}</div>` : ""}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="grow">Герой</th><th>Класс</th><th class="num">Урон</th><th class="num">Лечение</th><th class="num" title="Убийства / смерти">У/С</th><th class="num">Рейтинг</th></tr></thead><tbody>${[1, 2].map(team).join('<tr class="gap"><td colspan="6"></td></tr>')}</tbody></table></div>
      </div>
      <div class="dialog-foot"><button class="btn primary" data-home>Вернуться в мир</button></div></section>`;
    const home = this.results.querySelector<HTMLButtonElement>("[data-home]")!;
    home.onclick = () => {
      home.disabled = true;
      home.textContent = "Возвращаемся…";
      this.net.send("arena:leave");
    };
    clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => { if (!this.results.hidden) home.click(); }, 20_000);
  }

  // ---------- каждый кадр ----------
  frame(units: Map<string, { u: UnitState }>) {
    const net = this.net;
    if (!net) return;
    // таймеры окна и подтверждения
    const info = net.arenaInfo;
    if (info?.queue && !this.win.hidden) {
      const waited = info.queue.waitedMs + (performance.now() - this.infoAt);
      const w = this.win.querySelector("[data-wait]"), win = this.win.querySelector("[data-window]");
      if (w) w.textContent = mmss(waited);
      if (win) win.textContent = String(queueWindow(waited));
    }
    if (this.foundMsg && !this.found.hidden) {
      const left = Math.max(0, ACCEPT_MS - (performance.now() - this.foundAt));
      const bar = this.found.querySelector<HTMLElement>("[data-accept]");
      if (bar) bar.style.width = `${(left / ACCEPT_MS) * 100}%`;
    }
    // группа (в мире): напарник и его здоровье
    const party = net.party?.members.filter((m) => m.name !== net.self?.name) ?? [];
    setHidden(this.partyBox, net.kind !== "world" || !party.length);
    if (!this.partyBox.hidden) {
      // рамки .uf из kit.css: разметка пересобирается только при смене состава, в кадре меняются полосы, числа и классы состояния
      const sig = party.map((m) => `${m.name}|${m.cls}|${m.level}`).join(",");
      if (sig !== this.partySig) {
        this.partySig = sig;
        this.partyBox.innerHTML = party.map((m) => `<div class="uf pm"><div class="uf-head"><span class="uf-name" title="${esc(m.name)}">${esc(m.name)}</span><span class="chip dim">ур. ${m.level}</span><span class="uf-meta">${clsName(m.cls)}</span></div><div class="bar hp"><i></i><b class="abs" hidden></b><span></span></div><div class="bar mp sm"><i></i></div></div>`).join("");
      }
      const rows = this.partyBox.children;
      party.forEach((m, i) => {
        const row = rows[i] as HTMLElement | undefined;
        if (!row) return;
        let u: UnitState | undefined;
        for (const v of units.values()) if (v.u.kind === UnitKind.Player && v.u.name === m.name) { u = v.u; break; }
        const hpK = u ? Math.max(0, u.hp) / Math.max(1, u.maxHp) : 0, mpK = u && u.maxMp > 0 ? Math.max(0, u.mp) / u.maxMp : 0;
        const txt = u ? `${formatNumber(Math.max(0, u.hp))} / ${formatNumber(u.maxHp)}` : m.online ? "далеко" : "не в сети";
        const hpEl = row.querySelector<HTMLElement>(".bar.hp > i")!, tx = row.querySelector<HTMLElement>(".bar.hp > span")!;
        hpEl.style.width = `${hpK * 100}%`;
        // щит-поглотитель союзника поверх здоровья (как в рамке героя); нет юнита рядом — нет и щита
        absorbApply(row.querySelector<HTMLElement>(".bar.hp > .abs"), u?.hp ?? 0, u?.maxHp ?? 1, u && u.hp > 0 ? u.shield || 0 : 0);
        (row.querySelector(".bar.mp > i") as HTMLElement).style.width = `${mpK * 100}%`;
        if (tx.textContent !== txt) tx.textContent = txt;
        row.classList.toggle("far", !u && m.online);
        row.classList.toggle("off", !m.online);
        row.classList.toggle("dead", !!u && u.hp <= 0);
      });
    }
    // табло матча
    const inArena = net.kind === "arena" && !!net.arena;
    setHidden(this.board, !inArena);
    if (!inArena) {
      setHidden(this.countdown, true);
      return;
    }
    const st = net.room.state as { phase: string; countdown: number; timeLeft: number };
    const myTeam = net.arena!.team;
    const teamUnits = (t: number) => [...units.values()].map((v) => v.u).filter((u) => u.kind === UnitKind.Player && u.team === t);
    const row = (u: UnitState) => `<div class="pl"><span>${esc(u.name)}</span><div class="bar hp mini"><i style="width:${(Math.max(0, u.hp) / Math.max(1, u.maxHp)) * 100}%"></i></div></div>`;
    const names = (t: number) => net.arena!.teams[t - 1].map((p) => {
      const u = teamUnits(t).find((x) => x.name === p.name);
      return u ? row(u) : `<div class="pl gone"><span>${esc(p.name)}</span><span class="c-bad">нет</span></div>`;
    }).join("");
    const timer = st.phase === "fight" || st.phase === "end" ? mmss(st.timeLeft * 1000) : st.phase === "countdown" ? "старт" : "ждём игроков";
    this.board.innerHTML = `<div class="side ally">${names(myTeam)}</div><div class="mid"><div class="mode">${MODE_NAMES[net.arena!.mode]}</div><div class="time">${timer}</div></div><div class="side enemy">${names(myTeam === 1 ? 2 : 1)}</div>`;
    // отсчёт
    if (st.phase === "countdown") {
      this.countdown.hidden = false;
      this.countdown.textContent = String(st.countdown || "");
    } else if (st.phase === "fight" && this.lastPhase === "countdown") {
      this.countdown.hidden = false;
      this.countdown.textContent = "В бой!";
      setTimeout(() => (this.countdown.hidden = true), 900);
    } else if (st.phase !== "fight") setHidden(this.countdown, st.phase !== "waiting");
    if (st.phase === "waiting") this.countdown.textContent = "…";
    this.lastPhase = st.phase;
  }
}

export { rankById };
