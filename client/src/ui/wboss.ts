/**
 * Мировые боссы в интерфейсе (задача 151, docs/systems/bosses.md §2–§4): окно «Сборы» (вкладки «Рейд» · «Мировой босс» · «Летопись»),
 * трекер событий под миникартой, полоса боя с личным вкладом, итог боя, плашки event:say, метки на миникарте и карте мира.
 * Сообщения сервера — shared/worldBoss.ts (wboss, wboss:me, wboss:muster, wboss:result, wboss:chronicle, events, event:say).
 * Рейд: окно сбора (ui/raid.ts) рисуется внутри вкладки «Рейд» (RaidHud.mount). Тексты — data/texts.json, ui.wboss.*.
 */
import { CLASSES } from "../../../shared/classes";
import { TILE } from "../../../shared/constants";
import { FACTIONS } from "../../../shared/factions";
import { RAID_ROLES, ROLE_NAMES, type RaidRole } from "../../../shared/raid";
import { T } from "../../../shared/texts";
import { WB, WB_BOSSES, WB_BY_ID, wbSlot, type WbChronicleEntry, type WbMeMsg, type WbMusterMsg, type WbResultMsg, type WbStage, type WbStateMsg, type WbTier, type WbTopRow } from "../../../shared/worldBoss";
import { net as NET, type Net } from "../net";
import { openModal, tabs, type ModalHandle } from "./kit";
import type { RaidHud } from "./raid";
import { banner } from "./lootfx";
import { RARITY_COLORS } from "../../../shared/items";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number) => Math.round(n).toLocaleString("ru-RU");
const t = (k: string, v?: Record<string, unknown>) => T(`ui.wboss.${k}`, v);

/** Строка ленты событий (server/src/game/eventClock.ts ClockEvent). */
export interface WbFeedRow { id: string; kind: string; name: string; at: number; until?: number; live: boolean; where?: string }
export type WbTab = "raid" | "boss" | "chron";

const view = {
  states: new Map<string, { s: WbStateMsg; at: number }>(),
  me: null as (WbMeMsg & { at: number }) | null,
  muster: null as WbMusterMsg | null,
  events: [] as WbFeedRow[],
  chron: [] as WbChronicleEntry[],
  /** Стрелка к арене на миникарте включена игроком («К арене»), даже когда босс спит. */
  track: false,
};
export const wbView = view;
(window as unknown as { __wbView?: typeof view }).__wbView = view; // для tools/wboss-ui-shots.ts

/** «Сейчас» по часам сервера (по любому сообщению wboss), иначе по часам браузера. */
export function wbNow(): number {
  for (const v of view.states.values()) return v.s.now + (performance.now() - v.at);
  return Date.now();
}
/** Время «через …»: от часа — «2 ч 14 мин», иначе м:сс. */
export function wbDur(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} ${t("unit.h")} ${Math.floor((s % 3600) / 60)} ${t("unit.m")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface WbMark { id: string; name: string; st: WbStage; x: number; y: number; r: number; s: WbStateMsg; line: string; sprite: string }
/** Колосс на карте: только на той арене, где он стоит или встанет в свою очередь (pick: alternate) — точку отдаёт сервер в wboss.x/y; вторая арена пары не рисуется. */
export function wbMarks(): WbMark[] {
  const out: WbMark[] = [];
  for (const d of WB_BOSSES) {
    const s = view.states.get(d.id)?.s;
    if (!s || s.x <= 0) continue; // нет сообщения или точка скрыта (предвестник «только зона»)
    const st = s.st, now = wbNow();
    const until = view.events.find((e) => e.id === `wboss:${d.id}`)?.until;
    const clock = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
    let line = "";
    if (st === "sleep") line = s.next > now ? (s.next - now > 3600000 ? clock(s.next) : t("in", { t: wbDur(s.next - now) })) : t("no_time");
    else if (st === "soon") line = s.next > now ? t("in", { t: wbDur(s.next - now) }) : t("st.soon");
    else if (st === "alive") line = until && until > now ? t("leaves", { t: wbDur(until - now) }) : t("st.alive");
    else line = s.endAt ? t("fell", { t: wbDur(now - s.endAt) }) : t("st.dead");
    out.push({ id: d.id, name: d.name, st, x: s.x, y: s.y, r: s.r > 0 ? s.r : (wbSlot(d.slot)?.arena ?? 0), s, line, sprite: d.mob.sprite });
  }
  return out;
}

// ---------------------------------------------------------------- значки карты (череп 9×9, 4 состояния)
const SKULL = ["..xxxxx..", ".xxxxxxx.", "xxxxxxxxx", "xx.xxx.xx", "xx.xxx.xx", "xxxx.xxxx", ".xxxxxxx.", "..x.x.x..", "..x.x.x.."];
const ST_COL: Record<WbStage, string> = { sleep: "#8c8696", soon: "#ffb43a", alive: "#ff4a3a", dead: "#6a6472" };
const ST_DARK: Record<WbStage, string> = { sleep: "#2a2630", soon: "#4a2c08", alive: "#4a0c08", dead: "#201c24" };
/** Череп-значок с контуром в тёмном тоне цвета; k — целый масштаб. dead — перечёркнут красным; soon и alive пульсируют. */
export function drawWbIcon(g: CanvasRenderingContext2D, cx: number, cy: number, st: WbStage, k = 1, ms = performance.now()) {
  const pulse = st === "soon" ? 0.6 + 0.4 * Math.sin(ms / 260) : st === "alive" ? 0.75 + 0.25 * Math.sin(ms / 160) : 1;
  const ox = Math.round(cx - 4.5 * k), oy = Math.round(cy - 4.5 * k);
  const px = (col: string, dx: number, dy: number) => {
    g.fillStyle = col;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (SKULL[y][x] === "x") g.fillRect(ox + (x + dx) * k, oy + (y + dy) * k, k, k);
  };
  g.save();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(ST_DARK[st], dx, dy);
  g.globalAlpha = pulse;
  px(ST_COL[st], 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = ST_DARK[st]; // глазницы и нос
  for (const [x, y] of [[2, 3], [2, 4], [6, 3], [6, 4], [4, 5]]) g.fillRect(ox + x * k, oy + y * k, k, k);
  if (st === "dead") {
    g.strokeStyle = "#e0402e"; g.lineWidth = Math.max(1.5, k * 1.2); g.lineCap = "butt";
    g.beginPath(); g.moveTo(ox - k, oy - k); g.lineTo(ox + 10 * k, oy + 10 * k); g.moveTo(ox + 10 * k, oy - k); g.lineTo(ox - k, oy + 10 * k); g.stroke();
  }
  g.restore();
}


// ---------------------------------------------------------------- герб босса: голова из спрайта в круглой рамке
const HEAD = new Map<string, HTMLImageElement>();
function headImg(sprite: string): HTMLImageElement | null {
  let im = HEAD.get(sprite);
  if (!im) { im = new Image(); im.src = `/assets/units/${sprite}.png`; HEAD.set(sprite, im); }
  return im.complete && im.naturalWidth ? im : null;
}
const RING: Record<WbStage, string> = { sleep: "#8c8696", soon: "#ffb43a", alive: "#ff4a3a", dead: "#6a6472" };
/**
 * Герб: тёмная подложка, голова из первого кадра спрайта (80×80: голова — x 20..60, y 2..36), кайма состояния (2 px) и золотая внешняя (1 px).
 * Спит — серый, скоро и жив — пульс цвета, убит — тусклый с красной чертой. r — радиус в экранных px.
 */
export function drawWbBadge(g: CanvasRenderingContext2D, cx: number, cy: number, st0: WbStage | "plain", sprite: string, r: number, o: { ms?: number; frame?: number; ring?: string } = {}) {
  const ms = o.ms ?? performance.now(), F = o.frame ?? 80, plain = st0 === "plain", st: WbStage = plain ? "sleep" : st0;
  const RINGC = plain ? (o.ring ?? "#ff6a2a") : RING[st];
  const pulse = st === "soon" ? 0.55 + 0.45 * Math.sin(ms / 260) : st === "alive" ? 0.65 + 0.35 * Math.sin(ms / 170) : 1;
  g.save();
  if (st === "soon" || st === "alive") { g.shadowColor = RINGC; g.shadowBlur = 4 + 6 * pulse; }
  g.beginPath(); g.arc(cx, cy, r + 2, 0, Math.PI * 2); g.fillStyle = "#d6a84b"; g.fill(); // золотая кайма
  g.shadowBlur = 0;
  g.beginPath(); g.arc(cx, cy, r + 0.5, 0, Math.PI * 2); g.fillStyle = "#120f16"; g.fill();
  g.save();
  g.beginPath(); g.arc(cx, cy, r - 1.5, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#1a141e"; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  const im = headImg(sprite), was = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  if (im) {
    g.filter = plain ? "none" : st === "sleep" ? "grayscale(1) brightness(.75)" : st === "dead" ? "grayscale(.8) brightness(.5)" : "none";
    // масштаб головы — только ×½, ×1 или ×2 от кадра (целый шаг: без «мыла»); ×½ усредняет пары пикселей
    const sw = Math.round(F * 0.5), sh = Math.round(F * 0.425), want = (r * 1.75) / sw;
    const f = [0.5, 1, 2].reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    const w = Math.round(sw * f), h = Math.round(sh * f);
    g.imageSmoothingEnabled = f < 1;
    g.drawImage(im, Math.round(F * 0.25), Math.round(F * 0.025), sw, sh, Math.round(cx - w / 2), Math.round(cy - h * 0.5), w, h);
    g.filter = "none";
  } else drawWbIcon(g, cx, cy, st, Math.max(1, Math.floor(r / 5)));
  g.imageSmoothingEnabled = was;
  g.restore();
  g.globalAlpha = pulse; g.lineWidth = 2; g.strokeStyle = RINGC;
  g.beginPath(); g.arc(cx, cy, r - 0.5, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  if (st === "dead") { g.strokeStyle = "#e0402e"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r * 0.75, cy + r * 0.75); g.lineTo(cx + r * 0.75, cy - r * 0.75); g.stroke(); }
  g.restore();
}
/** Радиус герба на карте мира (портрет 40 px кадра при ×1): один размер для Колосса, Рогатого Рыцаря и Повелителя Пепла. */
export const WB_BADGE_R = 16;
/** Золотая кайма в стиле герба для других значков карты (подземелье, Врата): кольцо вокруг центра. */
export function drawWbRing(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.save(); g.lineWidth = 1.5; g.strokeStyle = "#d6a84b"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.strokeStyle = "#120f16"; g.beginPath(); g.arc(cx, cy, r + 1.5, 0, Math.PI * 2); g.stroke(); g.restore();
}

/** Миникарта: значок, круг арены и стрелка у края, когда босс (скоро/жив или отмечен «К арене») за кадром. X, Y — пиксели мира → холст. */
export function drawWbMini(g: CanvasRenderingContext2D, X: (px: number) => number, Y: (py: number) => number, hero: { x: number; y: number }) {
  const W = g.canvas.width, H = g.canvas.height;
  g.imageSmoothingEnabled = false;
  for (const m of wbMarks()) {
    const x = Math.round(X(m.x)), y = Math.round(Y(m.y)), live = m.st === "soon" || m.st === "alive";
    if (live) { // тонкий контур круга арены — только когда босс «скоро» или жив
      const rr = X(m.x + m.r) - X(m.x);
      g.save(); g.lineWidth = 1; g.strokeStyle = live ? (m.st === "alive" ? "rgba(255,74,58,.8)" : "rgba(255,180,58,.8)") : "rgba(140,134,150,.35)";
      if (m.st !== "alive") g.setLineDash([3, 3]);
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    const inside = x >= 5 && y >= 5 && x <= W - 5 && y <= H - 5;
    if (inside) drawWbBadge(g, x, y, m.st, m.sprite, 7);
    else if ((live || view.track) && m.st !== "dead") {
      const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx);
      const k = Math.min((W / 2 - 9) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 9) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
      g.save(); g.translate(ax, ay); g.rotate(a);
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath();
      g.fillStyle = ST_COL[m.st === "sleep" ? "soon" : m.st]; g.strokeStyle = "#000"; g.lineWidth = 1.5; g.fill(); g.stroke(); g.restore();
      const dist = Math.round(Math.hypot(m.x - hero.x, m.y - hero.y) / TILE);
      g.font = "bold 10px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      const tx = Math.max(14, Math.min(W - 14, ax - Math.cos(a) * 18)), ty = Math.max(8, Math.min(H - 8, ay - Math.sin(a) * 14));
      g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeText(String(dist), tx, ty); g.fillStyle = "#fff"; g.fillText(String(dist), tx, ty);
    }
  }
}

/** Занятые гербом места на карте мира (для раскладки подписей). */
export function wbBadgeRects(X: (tx: number) => number, Y: (ty: number) => number) {
  return wbMarks().map((m) => { const x = X(m.x / TILE), y = Y(m.y / TILE), r = WB_BADGE_R + 3; return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; });
}
/** Карта мира: значок в 4 состояниях, круг арены, подсказка (таймер, здоровье, доля фракций). X, Y — тайлы → пиксели экрана, s — пикселей на тайл. */
export function drawWbMap(g: CanvasRenderingContext2D, X: (tx: number) => number, Y: (ty: number) => number, s: number, hits: { x: number; y: number; r: number; title: string; sub: string }[], placed: { x0: number; y0: number; x1: number; y1: number }[] = []) {
  const br = WB_BADGE_R;
  for (const m of wbMarks()) {
    const x = X(m.x / TILE), y = Y(m.y / TILE), live = m.st === "soon" || m.st === "alive";
    if (live) {
      g.save(); g.lineWidth = 1; g.strokeStyle = m.st === "alive" ? "rgba(255,74,58,.85)" : "rgba(255,180,58,.85)";
      if (m.st !== "alive") g.setLineDash([4, 4]);
      g.beginPath(); g.arc(x, y, (m.r / TILE) * s, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    drawWbBadge(g, x, y, m.st, m.sprite, br);
    const lines: string[] = [m.line];
    if (m.st === "alive" && m.s) {
      lines.push(t("map.hp", { v: Math.max(1, Math.ceil((m.s.hp / Math.max(1, m.s.maxHp)) * 100)) }), t("map.crowd", { a: m.s.n[0], b: m.s.n[1] }));
    }
    lines.push(t("map.arena", { n: Math.round(m.r / TILE) }));
    const lab = `${m.name.split(" ")[0]} · ${m.st === "alive" ? t("st.alive") : m.line}`;
    // подпись: под гербом, при наложении на другие подписи карты — над гербом, затем справа; в `placed` — как у остальных подписей
    g.font = "bold 12px Rubik, sans-serif"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    const tw = Math.ceil(g.measureText(lab).width), hit = (r: { x0: number; y0: number; x1: number; y1: number }) => placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    const spots = [[x - tw / 2, y + br + 18], [x - tw / 2, y - br - 8], [x - br - 8 - tw, y + 4], [x + br + 8, y + 4], [x - tw / 2, y + br + 34]];
    const clampX = (lx: number) => Math.max(4, Math.min(g.canvas.width / (window.devicePixelRatio || 1) - tw - 4, lx));
    for (const sp of spots) sp[0] = clampX(sp[0]);
    const at = spots.find(([lx, ly]) => !hit({ x0: lx - 2, y0: ly - 12, x1: lx + tw + 2, y1: ly + 3 })) ?? spots[0];
    placed.push({ x0: at[0] - 2, y0: at[1] - 12, x1: at[0] + tw + 2, y1: at[1] + 3 });
    g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = "#000"; g.strokeText(lab, at[0], at[1]); g.fillStyle = m.st === "dead" || m.st === "sleep" ? "#c8c0b0" : "#efe6d2"; g.fillText(lab, at[0], at[1]);
    g.textAlign = "left";
    
    hits.push({ x, y, r: br + 4, title: `${m.name} · ${t(`st.${m.st}`)}`, sub: lines.join(" · ") });
  }
}

// ---------------------------------------------------------------- интерфейс
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const tierName = (x: WbTier | "") => (x ? t(`tier.${x}`) : t("tier.none"));
const fName = (f: string) => (f === "solgard" || f === "umbrath" ? FACTIONS[f].name : "");
const fCls = (f: string) => (f === "solgard" ? "sol" : f === "umbrath" ? "umb" : "none");
/** Главный босс окна: живой, иначе тот, кто скоро, иначе ближайший по времени. */
function curBoss(): WbStateMsg | null {
  const all = [...view.states.values()].map((v) => v.s);
  return all.find((s) => s.st === "alive") ?? all.find((s) => s.st === "soon") ?? all.sort((a, b) => (a.next || 1e18) - (b.next || 1e18))[0] ?? null;
}

export class WbossHud {
  private win = el("div", "panel win l win-muster");
  private body = el("div", "body");
  private foot = el("div", "win-foot");
  private tab: WbTab = "boss";
  private tabsEl = el("div", "tabs");
  private tracker = el("button", "wb-track");
  private bar = el("section", "panel wb-bar passthru");
  private say = el("div", "wb-say-box passthru");
  private result: ModalHandle | null = null;
  private lastHtml = "";
  private lastTick = 0;
  private lastBarHtml = "";
  private showSquad = false;
  private pick = 0;
  private net: Net = NET;

  constructor(root: HTMLElement, mini: HTMLElement, private raid: RaidHud) {
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span>${esc(t("title"))}</span><button class="x" aria-label="${esc(t("close"))}">×</button></h2>`;
    this.tabsEl.innerHTML = (["raid", "boss", "chron"] as WbTab[]).map((k) => `<button class="tab" data-tab="${k}" aria-selected="false">${esc(t(`tab.${k}`))}</button>`).join("");
    this.win.append(this.tabsEl, this.body, this.foot);
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    tabs(this.tabsEl, (k) => this.setTab(k as WbTab));
    this.body.addEventListener("click", (e) => this.click(e));
    this.foot.addEventListener("click", (e) => this.click(e));
    this.tracker.className = "wb-track";
    this.tracker.hidden = true;
    this.tracker.title = t("tr.tip");
    this.tracker.onclick = () => this.open("boss");
    mini.append(this.tracker);
    this.bar.hidden = true;
    this.say.hidden = true;
    root.append(this.win, this.bar, this.say);
    raid.onOpen = () => this.open("raid");
    this.bar.addEventListener("click", () => this.open("boss"));
    this.net.on("wboss", (s) => { view.states.set(s.id, { s, at: performance.now() }); if (s.st !== "alive" && view.me?.id === s.id) view.me = null; this.refresh(); });
    this.net.on("wboss:me", (m) => { view.me = { ...m, at: performance.now() }; });
    this.net.on("wboss:muster", (m) => { view.muster = m; this.refresh(); });
    this.net.on("wboss:chronicle", (c) => { view.chron = c; this.refresh(); });
    this.net.on("events", (e) => { view.events = e as unknown as WbFeedRow[]; this.refresh(); });
    this.net.on("event:say", (m) => this.announce(m));
    this.net.on("wboss:result", (r) => this.showResult(r));
    this.net.on("switch", (kind) => { if (kind !== "world") { this.win.hidden = true; this.bar.hidden = true; this.tracker.hidden = true; } });
  }

  // ---------- окно
  open(tab: WbTab = this.tab) {
    if (this.net.kind !== "world") return;
    this.win.hidden = false;
    this.setTab(tab);
  }
  toggle() { if (this.win.hidden) this.open(); else this.close(); }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    this.raid.mount(null);
    return was;
  }
  private setTab(k: WbTab) {
    this.tab = k;
    for (const b of this.tabsEl.querySelectorAll<HTMLElement>(".tab")) b.setAttribute("aria-selected", String(b.dataset.tab === k));
    this.lastHtml = "";
    this.raid.mount(null);
    if (k === "boss") this.net.send("wboss:info", {});
    if (k === "chron") this.net.send("wboss:chronicle", {});
    this.render();
    if (k === "raid") { this.body.innerHTML = ""; this.foot.innerHTML = ""; this.foot.hidden = true; this.raid.mount(this.body); }
  }
  private refresh() { if (!this.win.hidden && this.tab !== "raid") this.render(); }

  private click(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const a = b.dataset.a, n = this.net;
    if (a === "join") n.send("wboss:join", {});
    else if (a === "cancel") n.send("wboss:cancel", {});
    else if (a === "start") n.send("wboss:start", {});
    else if (a === "tp") n.send("wboss:tp", {});
    else if (a === "squad") { this.showSquad = !this.showSquad; this.lastHtml = ""; this.render(); }
    else if (a === "track") { view.track = !view.track; this.lastHtml = ""; this.render(); if (view.track) this.close(); }
    else if (a === "chron") { this.pick = Number(b.dataset.i ?? 0); this.lastHtml = ""; this.render(); }
  }

  private render() {
    if (this.win.hidden || this.tab === "raid") return;
    this.foot.hidden = this.tab !== "boss";
    const [body, foot] = this.tab === "boss" ? this.renderBoss() : [this.renderChron(), ""];
    const html = body + "\u0000" + foot;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.body.innerHTML = body;
    this.foot.innerHTML = foot;
  }

  private rosterHtml(m: WbMusterMsg | null): string {
    if (!m || !m.members.length) return `<div class="wb-empty"><span class="wb-empty-ic" aria-hidden="true">⚑</span>${esc(t("roster.empty"))}</div>`;
    const by = new Map<RaidRole, WbMusterMsg["members"]>(RAID_ROLES.map((r) => [r, []]));
    for (const x of m.members) by.get(x.role as RaidRole)?.push(x);
    const me = this.net.self?.name;
    return RAID_ROLES.map((r) => {
      const list = by.get(r)!;
      return `<div class="raid-role"><div class="raid-role-h"><span></span><span class="raid-role-name">${esc(ROLE_NAMES[r])}</span><span class="raid-role-c">${list.length}</span></div>`
        + list.map((x) => `<div class="row dense raid-mem${x.name === me ? " me" : ""}"><span class="row-title">${esc(x.name)}</span><span class="meta">${esc(CLASSES[x.cls as keyof typeof CLASSES]?.name ?? x.cls)} · ${x.level}</span></div>`).join("") + `</div>`;
    }).join("");
  }

  /** Вкладка «Мировой босс»: возвращает [тело, подвал]. */
  private renderBoss(): [string, string] {
    const s = curBoss(), def = s ? WB_BY_ID[s.id] : WB_BOSSES[0], now = wbNow(), me = this.net.self, m = view.muster;
    const st: WbStage = s?.st ?? "sleep", lvl = me?.level ?? 0, low = !!lvl && lvl < WB.minLevel;
    const mark = wbMarks().find((x) => x.id === def?.id);
    const chip = st === "alive" ? "bad" : st === "soon" ? "warn" : "dim";
    const mine = view.me && view.me.id === def?.id && st === "alive" ? view.me : null;
    const kv = [
      [t("kv.status"), `<span class="chip ${chip}">${esc(t(`st.${st}`))}</span>`],
      [t("kv.timer"), esc(mark?.line ?? "")],
      st === "alive" && s ? [t("kv.hp"), `${Math.ceil((s.hp / Math.max(1, s.maxHp)) * 100)}% · ${num(s.hp)} / ${num(s.maxHp)}`] : null,
      st === "alive" && s ? [t("kv.crowd"), esc(t("crowd.v", { a: s.n[0], b: s.n[1] }))] : null,
      [t("kv.level"), `<span class="${low ? "c-bad" : ""}">${esc(t(low ? "level.low" : "level.v", { need: WB.minLevel, lvl }))}</span>`],
      [t("kv.where"), esc(t("where.v"))],
      mine ? [t("kv.me"), `${num(mine.v)} · <b class="wb-tier ${mine.tier || "none"}">${esc(tierName(mine.tier))}</b> · ${esc(t("bar.rank", { n: mine.rank }))}`] : null,
    ].filter(Boolean) as string[][];
    const joined = !!m?.joined, leader = !!m && !!me && m.leader === me.name;
    const tpOpen = st === "alive" || (st === "soon" && !!s && s.next - now <= WB.clock.teleportMin * 60000);
    const sq = m?.squad;
    const body = `<section class="sec flat"><h3 class="sec-h">${esc(def?.name ?? "")}</h3>
        <p class="note wb-lore">${esc(def ? def.lore.split(/(?<=\.)\s/).slice(0, 2).join(" ") : t("lore_none"))}</p>
        <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></section>
      <section class="sec"><div class="sec-head"><h3 class="sec-h">${esc(t("roster"))}</h3><span class="sec-aside">${esc(t("roster.aside", { n: WB.muster.maxPlayers }))}</span></div>
        <div class="raid-members list boxed">${this.rosterHtml(m)}</div></section>
      ${this.showSquad ? `<section class="sec"><h3 class="sec-h">${esc(t("squad.h"))}</h3>${sq?.length ? `<div class="list boxed">${sq.map((n) => `<div class="row dense"><span class="row-title">${esc(n)}</span></div>`).join("")}</div>` : `<div class="list boxed"><div class="wb-empty">${esc(t("squad.none"))}</div></div>`}</section>` : ""}
      ${m?.why && m.why !== "—" && !joined ? `<p class="note c-bad">${esc(m.why)}</p>` : ""}
      <p class="note">${esc(t("join.hint"))}</p>`;
    const status = joined || m?.open ? `${esc(t("status.open"))} <b>${wbDur((m?.leftSec ?? 0) * 1000)}</b>` : esc(t("status.closed"));
    const canJoin = !joined && !low;
    const foot = `<span class="win-foot-info">${status}</span>
      <button class="btn" data-a="squad" aria-pressed="${this.showSquad}">${esc(t("squad"))}</button>
      <button class="btn" data-a="tp"${tpOpen ? "" : ` disabled title="${esc(t("tp.hint", { min: WB.clock.teleportMin }))}"`}>${esc(t("tp"))}</button>
      <button class="btn" data-a="track" aria-pressed="${view.track}">${esc(t("track"))}</button>
      ${joined ? `<button class="btn" data-a="cancel">${esc(t("leave"))}</button>` : `<button class="btn primary" data-a="join"${canJoin ? "" : " disabled"}>${esc(t("join"))}</button>`}
      ${joined && leader ? `<button class="btn primary" data-a="start">${esc(t("start"))}</button>` : ""}`;
    return [body, foot];
  }

  private topTable(rows: WbTopRow[], who?: string) {
    return `<table class="tbl wb-top"><tbody>${rows.map((r, i) => `<tr class="${r.name === who ? "me" : ""}" title="${esc(CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls)}"><td class="c-dim">${i + 1}</td><td><span class="wb-f ${fCls(r.faction)}">${esc(r.name)}</span></td><td class="num">${num(r.v)}</td></tr>`).join("")}</tbody></table>`;
  }
  private topBlock(e: WbChronicleEntry, who?: string) {
    const kinds: [keyof WbChronicleEntry["top"], string][] = [["dmg", "res.dmg"], ["heal", "res.heal"], ["tank", "res.tank"]];
    return kinds.map(([k, key]) => `<div class="wb-topcol"><h4 class="sub-h">${esc(t(key))}</h4>${e.top[k].length ? this.topTable(e.top[k], who) : `<p class="note">—</p>`}</div>`).join("");
  }

  /** Вкладка «Летопись»: список последних убийств и топы выбранной записи. */
  private renderChron(): string {
    const list = view.chron;
    if (!list.length) return `<div class="list boxed"><div class="wb-empty"><span class="wb-empty-ic" aria-hidden="true">✎</span>${esc(t("chron.empty"))}</div></div>`;
    const now = wbNow(), i = Math.min(this.pick, list.length - 1), e = list[i], me = this.net.self?.name;
    const rows = list.map((c, j) => `<button class="row dense wb-chrow${j === i ? " sel" : ""}" data-a="chron" data-i="${j}"><span class="row-main"><span class="row-title">${esc(c.name)}</span>
      <span class="row-sub">${esc(t("chron.when", { t: wbDur(now - c.at) }))} · ${esc(t("chron.dur", { t: wbDur(c.durationMs) }))} · ${esc(t("chron.heroes", { n: c.heroes }))}</span></span>
      <span class="chip ${c.win ? "" : "dim"} wb-chip-${fCls(c.win)}">${esc(c.win ? fName(c.win) : t("chron.draw"))}</span></button>`).join("");
    return `<section class="sec flat"><h3 class="sec-h">${esc(t("chron.h"))}</h3><div class="list boxed scroll wb-chlist">${rows}</div></section>
      <section class="sec"><div class="sec-head"><h3 class="sec-h">${esc(e.name)}</h3><span class="sec-aside">${e.last ? esc(t("chron.last", { v: e.last })) : ""}</span></div>
        ${this.scoreHtml(e)}<div class="wb-tops">${this.topBlock(e, me)}</div></section>`;
  }
  private scoreHtml(e: WbChronicleEntry) {
    const [a, b] = e.totals, sum = Math.max(1, a + b);
    return `<div class="wb-score"><span class="wb-num sol">${num(a)}</span><div class="wb-split"><i class="sol" style="width:${(a / sum) * 100}%"></i><i class="umb" style="width:${(b / sum) * 100}%"></i></div><span class="wb-num umb">${num(b)}</span></div>`;
  }

  // ---------- кадр: трекер, полоса боя, таймеры окна
  frame(pos: { x: number; y: number }) {
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    const world = this.net.kind === "world";
    this.drawTracker(world);
    this.drawBar(world, pos);
    if (world && !this.win.hidden) this.render();
  }
  private drawTracker(world: boolean) {
    const sn = wbNow();
    // ближайшее: идущее, иначе по времени; события без будущего времени (старая отметка) пропускаем
    const rows = view.events.filter((e) => e.live || e.at > sn - 1000).sort((a, b) => Number(b.live) - Number(a.live) || a.at - b.at);
    const e = rows[0];
    // без событий трекер не показывается вовсе
    this.tracker.hidden = !world || !e;
    if (!world || !e) return;
    // босс — герб 24 px (тот же, что на карте), короткое имя («Колосс»); прочие события — значок ⚔
    const boss = e?.kind === "wboss" ? view.states.get(e.id.slice(6)) : undefined, def = boss ? WB_BY_ID[boss.s.id] : undefined;
    const nm = def ? def.name.split(" ")[0] : e?.kind === "war" ? t("tr.war") : e?.kind === "siege" ? t("tr.siege") : e?.name ?? "";
    const label = e.live ? `<b>${esc(nm)}</b><span class="wb-tt live">${esc(t("tr.live"))}</span>` : `<b>${esc(nm)}</b><span class="wb-tt">${wbDur(e.at - sn)}</span>`;
    const html = `<canvas class="wb-ti" width="24" height="24"></canvas>${label}`;
    if (this.tracker.dataset.h !== html) { this.tracker.dataset.h = html; this.tracker.innerHTML = html; }
    const cv = this.tracker.querySelector<HTMLCanvasElement>(".wb-ti");
    if (cv) {
      const g = cv.getContext("2d")!;
      g.clearRect(0, 0, 24, 24);
      if (def && boss) drawWbBadge(g, 12, 12, e!.live ? "alive" : e!.at - sn < 30 * 60000 ? "soon" : boss.s.st === "dead" ? "dead" : "sleep", def.mob.sprite, 9);
      else { g.font = "16px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#bdb09c"; g.fillText("⚔", 12, 13); }
    }
    this.tracker.classList.toggle("live", !!e?.live);
    this.tracker.classList.toggle("soon", !!e && !e.live && e.at - sn < 30 * 60000);
  }
  private drawBar(world: boolean, pos: { x: number; y: number }) {
    const a = world ? [...view.states.values()].map((v) => v.s).find((s) => s.st === "alive") : undefined;
    const near = !!a && Math.hypot(a.x - pos.x, a.y - pos.y) < a.r * 1.6;
    const mine = view.me && a && view.me.id === a.id && performance.now() - view.me.at < 60000 ? view.me : null;
    if (!a || !(near || mine)) { this.bar.hidden = true; return; }
    const hp = Math.max(0, Math.min(1, a.hp / Math.max(1, a.maxHp)));
    let you = "";
    if (mine) {
      const nextTier: WbTier = mine.tier === "" ? "bronze" : mine.tier === "bronze" ? "silver" : mine.tier === "silver" ? "gold" : "";
      const k = mine.next > 0 ? Math.min(1, mine.v / mine.next) : 1;
      you = `<div class="wb-you"><span class="wb-tier ${mine.tier || "none"}">${esc(tierName(mine.tier))}</span><span class="wb-v">${num(mine.v)}</span><span class="wb-rank">${esc(t("bar.rank", { n: mine.rank }))}</span></div>
        <div class="bar sm xp wb-contrib" title="${esc(nextTier ? t("tier.next", { tier: tierName(nextTier), v: num(Math.max(0, mine.next - mine.v)) }) : "")}"><i style="width:${k * 100}%"></i></div>`;
    } else you = `<div class="wb-you dim">${esc(t("tier.none"))}</div>`;
    const html = `<div class="wb-bhead"><b>${esc(a.name)}</b><span>${a.phase ? esc(t("bar.phase", { n: a.phase })) : ""}${a.stacks ? ` · ${esc(t("bar.stacks", { n: a.stacks }))}` : ""}</span></div>
      <div class="bar lg wb-hp"><i style="width:${hp * 100}%"></i><span>${Math.ceil(hp * 100)}% · ${num(a.hp)} / ${num(a.maxHp)}</span></div>
      <div class="wb-crowd"><span class="sol">${a.n[0]}</span><span class="c-dim">${esc(t("kv.crowd"))}</span><span class="umb">${a.n[1]}</span></div>${you}`;
    if (html !== this.lastBarHtml) { this.lastBarHtml = html; this.bar.innerHTML = html; }
    this.bar.hidden = false;
  }

  // ---------- объявления
  private announce(m: { text: string; kind: string; from: string }) {
    const n = el("div", `wb-say ${m.kind}`, `${m.from ? `<small>${esc(m.from)}</small>` : ""}<div>${esc(m.text)}</div>`);
    this.say.hidden = false;
    this.say.append(n);
    while (this.say.children.length > 2) this.say.firstElementChild!.remove();
    window.setTimeout(() => { n.remove(); if (!this.say.children.length) this.say.hidden = true; }, 7000);
  }

  // ---------- итог боя
  private showResult(r: WbResultMsg) {
    this.result?.close();
    const e = r.entry, me = r.me, who = this.net.self?.name;
    const rewards = me
      ? `<section class="sec flat"><h3 class="sec-h">${esc(t("res.mine"))}</h3><dl class="kv">
          <dt>${esc(t("kv.me"))}</dt><dd>${num(me.v)} · <b class="wb-tier ${me.tier || "none"}">${esc(tierName(me.tier))}</b></dd>
          <dt>${esc(t("res.marks"))}</dt><dd>${num(me.marks)}</dd><dt>${esc(t("res.xp"))}</dt><dd>${num(me.xp)}</dd>
          ${me.items.length ? `<dt>${esc(t("res.items"))}</dt><dd>${me.items.map((n, i) => `<span style="color:${RARITY_COLORS[me.itemsR?.[i] ?? 0]}">${esc(n)}</span>`).join(", ")}</dd>` : ""}
          ${me.titles.length ? `<dt>${esc(t("res.titles"))}</dt><dd class="c-gold">${me.titles.map(esc).join(", ")}</dd>` : ""}
          ${me.frame ? `<dt>${esc(t("res.frame"))}</dt><dd class="c-gold">${esc(me.frame)}</dd>` : ""}
          ${me.trophy.length ? `<dt>${esc(t("res.trophy"))}</dt><dd>${me.trophy.map(esc).join(", ")}</dd>` : ""}
        </dl>${me.locked ? `<p class="note c-warn">${esc(t("res.locked"))}</p>` : ""}</section>`
      : `<p class="note">${esc(t("res.none"))}</p>`;
    // торжественный баннер добычи (вариант B, lootfx.ts): лучшая вещь из выданных, ранг по вкладу
    if (me && !me.locked && me.items.length) banner(document.body, { title: "ДОБЫЧА МИРОВОГО БОССА", name: me.items[0], color: RARITY_COLORS[me.itemsR?.[0] ?? 0], sub: `Ваш вклад: ${esc(tierName(me.tier))} · ${num(me.v)}${me.items.length > 1 ? ` · +${me.items.length - 1} ${esc(t("res.items").toLowerCase())}` : ""}` });
    const root = el("section", "panel dialog wb-result");
    root.setAttribute("role", "dialog");
    root.innerHTML = `<div class="dialog-head"><h2 class="dialog-title wb-win">${esc(t("res.title", { name: e.name }))}</h2><button class="x" data-x aria-label="${esc(t("close"))}">×</button></div>
      <div class="dialog-body"><p class="note">${esc(t("res.sub", { t: wbDur(e.durationMs), n: e.heroes }))} · <b class="wb-f ${fCls(r.win)}">${esc(r.win ? t("res.win", { f: fName(r.win) }) : t("res.draw"))}</b></p>
        ${this.scoreHtml(e)}${rewards}
        <section class="sec"><h3 class="sec-h">${esc(t("res.top"))}</h3><div class="wb-tops">${this.topBlock(e, who)}</div></section></div>
      <div class="dialog-foot"><button class="btn primary" data-x>${esc(t("close"))}</button></div>`;
    this.result = openModal(root, { onClose: () => (this.result = null) });
    for (const b of root.querySelectorAll<HTMLElement>("[data-x]")) b.onclick = () => this.result?.close();
    view.chron = [e, ...view.chron.filter((c) => c.at !== e.at)];
    view.me = null;
  }
}
