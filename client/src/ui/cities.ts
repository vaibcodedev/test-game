/** Города: диалог заданий, журнал, трекер под рамкой героя и окно камня телепорта. */
import { npcRefuses, stoneRefuses } from "./npcGate";
import { formatNumber, gold } from "./gold";
import { CITIES, TELEPORT_CAST_MS, cityKnown, isEnemyCapital, stoneNear, teleportPrice, type City, type CityNpc } from "../../../shared/cities";
import { FACTIONS, type FactionId } from "../../../shared/factions";
import type { SelfState } from "../../../shared/protocol";
import { QUESTS, QUEST_GIVERS, giverPlace, QUEST_MAX_ACTIVE, questsOf, type QuestDef, type QuestSave } from "../../../shared/quests";
import { RESOURCES } from "../../../shared/biomes";
import { MOBS } from "../../../shared/mobs";
import type { Net } from "../net";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const targetName = (k: string, t: string) => (k === "kill" ? MOBS[t]?.name ?? t : RESOURCES[t]?.name ?? t);
const verb = (k: string) => (k === "kill" ? "Убить" : "Добыть");

/** Заменяет разметку окна и возвращает прокрутку .body на место. */
function repaint(win: HTMLElement, html: string) {
  const top = win.querySelector(".body")?.scrollTop ?? 0;
  win.innerHTML = html;
  const body = win.querySelector(".body");
  if (body) body.scrollTop = top;
}

/** Состояние задания у героя; в диалоге карточки идут в этом порядке: сначала то, что можно сдать или взять. */
type QState = "ready" | "avail" | "active" | "locked" | "done";
const ORDER: QState[] = ["ready", "avail", "active", "locked", "done"];
const stateOf = (d: QuestDef, have: number | undefined, done: boolean, level: number): QState =>
  done ? "done" : have === undefined ? (level < d.level ? "locked" : "avail") : have >= d.n ? "ready" : "active";

/** Шапка карточки: название, уровень и метка состояния справа. */
const head = (d: QuestDef, chip = "") =>
  `<div class="card-head"><div class="card-titles"><h3 class="card-title">${esc(d.name)}<span class="meta">ур. ${d.level}+</span></h3></div>${chip}</div>`;
/** Цель с полосой прогресса: «Убить: Слизень — 3/6». */
const goal = (d: QuestDef, have: number) => {
  const n = Math.min(have, d.n);
  return `<div class="progress"><span>${verb(d.kind)}: ${esc(targetName(d.kind, d.target))}</span><b>${n}/${d.n}</b><div class="bar sm"><i style="width:${Math.round((n / d.n) * 100)}%"></i></div></div>`;
};
/** Награда чипами: золото, опыт, зелья. */
const reward = (d: QuestDef) => {
  const it = d.reward.item;
  return `<div class="q-rew"><span class="meta">Награда</span><span class="chip">${gold(d.reward.gold)}</span><span class="chip xp">${formatNumber(d.reward.xp)} опыта</span>`
    + `${it ? `<span class="chip dim">${it.base === "hp_potion" ? "Зелья здоровья" : "Зелья маны"} ×${it.qty}</span>` : ""}</div>`;
};

export class QuestUI {
  private win = document.createElement("div");
  private track = document.createElement("div");
  private log = document.createElement("div");
  private net!: Net;
  private giver = "";
  /** Что показано в диалоге и в журнале: пока оно то же, окна не перерисовываются (иначе клик по кнопке теряется между нажатием и отпусканием). */
  private winKey = "";
  private logKey = "";

  constructor(root: HTMLElement) {
    this.win.className = "panel win m win-quest";
    this.win.hidden = true;
    this.track.className = "panel hud-quests";
    this.track.hidden = true;
    this.log.className = "panel win m win-qlog";
    this.log.hidden = true;
    root.append(this.win, this.track, this.log);
    this.win.addEventListener("click", (e) => this.click(e, () => this.close()));
    this.log.addEventListener("click", (e) => this.click(e, () => this.closeLog()));
  }
  /** Кнопки окон: × и действия задания (data-act, data-id). */
  private click(e: MouseEvent, close: () => void) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    if (b.classList.contains("x")) close();
    else if (b.dataset.act === "accept") this.net.send("quest:accept", { id: b.dataset.id! });
    else if (b.dataset.act === "turn") this.net.send("quest:turn", { id: b.dataset.id! });
  }
  /** Журнал заданий (из меню Esc): активные задания с прогрессом. */
  toggleLog() {
    this.log.hidden = !this.log.hidden;
    this.logKey = "";
    if (this.net.self) this.update(this.net.self);
  }
  closeLog(): boolean {
    const was = !this.log.hidden;
    this.log.hidden = true;
    return was;
  }
  private renderLog(act: [string, number][]) {
    const key = JSON.stringify(act);
    if (key === this.logKey) return;
    this.logKey = key;
    const cards = act
      .map(([id, n]) => ({ d: QUESTS[id], n }))
      .sort((a, b) => Number(b.n >= b.d.n) - Number(a.n >= a.d.n))
      .map(({ d, n }) => {
        const ready = n >= d.n;
        const giver = QUEST_GIVERS.find((g) => g.id === d.giver)?.name;
        const city = giverPlace(d.giver);
        return `<div class="quest-row card compact${ready ? " is-ready" : ""}">${head(d, ready ? `<span class="chip ok">Можно сдать</span>` : "")}${goal(d, n)}`
          + `${giver ? `<p class="note">Сдать: ${esc(giver)}${city ? ` · ${esc(city)}` : ""}</p>` : ""}</div>`;
      }).join("");
    repaint(this.log, `<h2><span>Задания</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body">${cards || `<p class="note">Активных заданий нет. Берите их у NPC в городах.</p>`}</div>
      <div class="win-foot"><span class="win-foot-info">Активные задания: ${act.length} / ${QUEST_MAX_ACTIVE}</span></div>`);
  }
  bind(net: Net) {
    this.net = net;
  }
  open(giver: string) {
    if (npcRefuses(this.net, "quest", giver)) return;
    this.giver = giver;
    this.winKey = "";
    this.win.hidden = false;
    if (this.net.self) this.update(this.net.self);
  }
  close(): boolean {
    const was = !this.win.hidden || !this.log.hidden;
    this.win.hidden = true;
    this.log.hidden = true;
    return was;
  }
  update(s: SelfState) {
    const q = s.quests ?? { active: {}, done: [] };
    // трекер активных заданий
    const act = Object.entries(q.active).filter(([id]) => QUESTS[id]);
    this.track.hidden = !act.length;
    this.track.innerHTML = act.length
      ? `<div class="qh">Задания</div>` + act.map(([id, n]) => {
        const d = QUESTS[id];
        return `<div class="qrow${n >= d.n ? " ok" : ""}"><span>${esc(d.name)}</span><b>${Math.min(n, d.n)}/${d.n}</b></div>`;
      }).join("")
      : "";
    if (!this.log.hidden) this.renderLog(act);
    if (this.win.hidden) return;
    const g = QUEST_GIVERS.find((x) => x.id === this.giver);
    if (g) this.renderDialog(g, s, q);
  }

  /** Диалог NPC: реплика и карточки заданий; внизу — сколько заданий уже взято. */
  private renderDialog(g: CityNpc, s: SelfState, q: QuestSave) {
    const key = JSON.stringify([this.giver, s.level, q.active, q.done]);
    if (key === this.winKey) return;
    this.winKey = key;
    const taken = Object.keys(q.active).length;
    const cards = questsOf(this.giver)
      .map((d) => ({ d, st: stateOf(d, q.active[d.id], q.done.includes(d.id), s.level) }))
      .sort((a, b) => ORDER.indexOf(a.st) - ORDER.indexOf(b.st))
      .map(({ d, st }) => this.card(d, st, q.active[d.id], taken >= QUEST_MAX_ACTIVE))
      .join("");
    repaint(this.win, `<h2><span>${esc(g.name)}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body">${g.greeting ? `<p class="npc-say">${esc(g.greeting)}</p>` : ""}<div class="quest-list">${cards}</div></div>
      <div class="win-foot"><span class="win-foot-info">Активные задания: ${taken} / ${QUEST_MAX_ACTIVE}</span></div>`);
  }

  /** Карточка задания: название, описание, цель, награда, действие внизу. Сданное сворачивается до названия и реплики NPC. */
  private card(d: QuestDef, st: QState, have: number | undefined, full: boolean): string {
    const chip = st === "ready" ? `<span class="chip ok">Можно сдать</span>` : st === "done" ? `<span class="chip ok">Сдано</span>` : st === "locked" ? `<span class="chip bad">Нужен ${d.level} уровень</span>` : "";
    const cls = `quest-row card${st === "ready" ? " is-ready" : st === "done" ? " done" : ""}`;
    if (st === "done") return `<div class="${cls}">${head(d, chip)}<p class="note">${esc(d.done)}</p></div>`;
    const id = esc(d.id);
    const btn = st === "ready" ? `<button class="btn small primary" data-act="turn" data-id="${id}">Сдать</button>`
      : st === "avail" ? `<button class="btn small primary" data-act="accept" data-id="${id}"${full ? ` disabled title="Слишком много активных заданий"` : ""}>Принять</button>`
      : st === "locked" ? `<button class="btn small" disabled title="Нужен ${d.level} уровень">Принять</button>`
      : `<button class="btn small" disabled>В процессе</button>`;
    return `<div class="${cls}">${head(d, chip)}<p class="note">${esc(d.text)}</p>${goal(d, have ?? 0)}${reward(d)}<div class="card-actions">${btn}</div></div>`;
  }
}

/** Подпись города под названием. */
const kind = (c: City) => (c.fort ? `Форт: ${FACTIONS[c.capital as FactionId]?.name ?? c.capital}` : c.capital ? `Столица: ${FACTIONS[c.capital as FactionId]?.name ?? c.capital}` : "Нейтральный город");

export class TeleportUI {
  private win = document.createElement("div");
  private net!: Net;
  private opened = false;
  /** Что показано в окне: пока оно то же, окно не перерисовывается. */
  private key = "";

  constructor(root: HTMLElement) {
    this.win.className = "panel win m win-tp";
    this.win.hidden = true;
    root.append(this.win);
    this.win.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b || b.disabled) return;
      if (b.classList.contains("x")) this.close();
      else if (b.dataset.go) { this.net.send("tp:go", { id: b.dataset.go }); this.close(); }
    });
  }
  bind(net: Net) {
    this.net = net;
  }
  open(pos: { x: number; y: number }) {
    if (stoneRefuses(this.net, pos)) return;
    this.pos = pos;
    this.opened = true;
    this.key = "";
    this.win.hidden = false;
    if (this.net.self) this.update(this.net.self, this.pos);
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    this.opened = false;
    return was;
  }
  /** Позицию героя задаёт HUD каждый кадр. */
  pos?: { x: number; y: number };
  update(s: SelfState, pos?: { x: number; y: number }) {
    this.pos = pos ?? this.pos;
    if (!this.opened) return;
    const here = this.pos ? stoneNear(this.pos.x, this.pos.y) : null;
    const key = [here?.id ?? "", s.gold, s.faction, (s.cities ?? []).join()].join("|");
    if (key === this.key) return;
    this.key = key;
    // порядок: где стоите, открытые подешевле, закрытые «???», вражеская столица
    const rank = (c: City) => (c.id === here?.id ? 0 : cityKnown(c, s.cities, s.faction) ? 1 : isEnemyCapital(c, s.faction) ? 3 : 2);
    const price = (c: City) => (here ? teleportPrice(here, c) : 0);
    const rows = [...CITIES].sort((a, b) => rank(a) - rank(b) || price(a) - price(b)).map((c) => {
      const cur = c.id === here?.id, ok = cur || cityKnown(c, s.cities, s.faction), enemy = !ok && isEnemyCapital(c, s.faction);
      let end = "";
      if (cur) end = `<span class="chip ok">Вы здесь</span>`;
      else if (ok && here) {
        const p = price(c), short = s.gold < p;
        end = `<button class="btn small price" data-go="${c.id}"${short ? ` disabled data-short title="Не хватает золота"` : ""}><span class="price-q">Телепорт</span>${gold(p)}</button>`;
      }
      const sub = ok ? kind(c) : enemy ? "Вражеская столица — телепорт закрыт" : "Не открыт — посетите город";
      return `<div class="row tp-row${cur ? " current" : ""}${ok ? "" : " locked"}"${cur ? ` aria-current="true"` : ""}><div class="row-main"><div class="row-title">${esc(ok || enemy ? c.name : "???")}</div>`
        + `<div class="row-sub${enemy ? " c-bad" : ""}">${esc(sub)}</div></div>${end ? `<div class="row-end">${end}</div>` : ""}</div>`;
    }).join("");
    repaint(this.win, `<h2><span>Камень телепорта</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body"><p class="note">${here ? `Каст ${TELEPORT_CAST_MS / 1000} с: движение, урон и бой прерывают переход` : "Подойдите к камню телепорта"}</p><div class="tp-list list boxed">${rows}</div></div>
      <div class="win-foot"><span class="win-foot-info">Золото</span>${gold(s.gold)}</div>`);
  }
}
