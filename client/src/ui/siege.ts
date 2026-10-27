/**
 * Осада форта в интерфейсе (задача 132, шаг 15): полоса осады сверху в стиле «Знамён» (форт, таймер, нападающие и оборона, здоровье ворот,
 * королевское знамя двора, «В лагерь осады» / «В форт»), окно итогов, метки на мини-карте и карте мира. Объявления — war:say (WarHud).
 * Состояние — сообщение siege (shared/siege.ts); общий склад siegeView читают мир (client/src/game/siegeView.ts) и карты. Сломанные ворота
 * из состояния — в GATE_BROKEN: предсказание шага героя (moveGated) пропускает через пролом, как сервер.
 */
import { CLASSES, type ClassId } from "../../../shared/classes";
import { CITIES } from "../../../shared/cities";
import { FACTIONS } from "../../../shared/factions";
import { TILE } from "../../../shared/constants";
import { T } from "../../../shared/texts";
import { WAR, type WarFaction } from "../../../shared/bannerWar";
import { GATE_BROKEN, gateById, SIEGE, type SiegeResultMsg, type SiegeStateMsg } from "../../../shared/siege";
import { net as NET, type Net } from "../net";
import { openModal, type ModalHandle } from "./kit";

export const siegeView: { state: SiegeStateMsg | null; at: number } = { state: null, at: 0 };
/** «Сейчас» по часам сервера. */
export const siegeNow = () => (siegeView.state ? siegeView.state.now + (performance.now() - siegeView.at) : Date.now());

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const fcls = (f: string) => (f === "solgard" ? "sol" : f === "umbrath" ? "umb" : "none");
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? "";
const fName = (f: string) => (f === "solgard" || f === "umbrath" ? FACTIONS[f].name : "");

export class SiegeHud {
  private bar = document.createElement("section");
  private result: ModalHandle | null = null;
  private lastHtml = "";
  private lastTick = 0;
  private hp = new Map<string, number>();
  private net: Net = NET;

  constructor(root: HTMLElement) {
    this.bar.className = "panel war-bar siege-bar";
    this.bar.hidden = true;
    root.append(this.bar);
    this.bar.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-siege-tp]")) this.net.send("siege:tp", {}); });
    this.net.on("siege", (s) => {
      siegeView.state = s;
      siegeView.at = performance.now();
      GATE_BROKEN.clear();
      for (const id of s.broken) GATE_BROKEN.add(id);
      this.render();
    });
    this.net.on("siege:result", (r) => this.showResult(r));
    this.net.on("switch", (kind) => { if (kind !== "world") this.bar.hidden = true; });
  }

  frame() {
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    this.render();
  }

  private render() {
    const s = siegeView.state;
    const show = !!s && s.ph !== "idle" && this.net.kind === "world";
    if (this.bar.hidden === show) this.bar.hidden = !show;
    if (!show || !s) return;
    const now = siegeNow(), me = this.net.self, lvl = me?.level ?? 0, mine = me?.faction ?? "";
    const time = s.ph === "prep" ? T("ui.siege.2", { t: mmss(s.t0 - now) }) : s.ph === "siege" ? mmss(s.t1 - now) : T("ui.bannerWar.2");
    const anyBroken = s.gates.some((g) => g.broken);
    const gate = (side: "n" | "s") => {
      const v = s.gates.find((g) => gateById(g.id)?.side === side), hp = v ? v.hp : 1;
      const prev = this.hp.get(side) ?? hp, hit = hp < prev - 0.0005;
      this.hp.set(side, hp);
      return `<span class="siege-gate ${side}${v?.broken ? " broken" : ""}${hit ? " hit" : ""}" title="${esc(T(side === "n" ? "ui.siege.19" : "ui.siege.20"))}">${esc(v?.broken ? T("ui.siege.4") : `${T(side === "n" ? "ui.siege.19" : "ui.siege.20")} ${Math.ceil(hp * 100)}%`)}<span class="siege-hp ${fcls(s.def)}"><i style="width:${Math.round(hp * 100)}%"></i></span></span>`;
    };
    const b = s.banner, fill = b ? Math.round((b.b ? b.h : b.hp) * 100) : 100;
    const pip = `<span class="war-pip heart o-${fcls(b?.o ?? s.def)} b-${fcls(b?.b || b?.hf || (b ? "" : s.def))}${b?.c ? " contest" : ""}${b?.lock || !b ? " lock" : ""}" title="${esc(T("ui.siege.23"))}"><i style="height:${fill}%"></i></span>`;
    const note = s.ph === "siege" ? (anyBroken ? T("ui.siege.4") : T("ui.siege.3", { t: mmss(s.breach - now) })) : s.ph === "prep" && lvl < WAR.minLevel ? T("ui.bannerWar.4", { lvl: WAR.minLevel }) : "";
    const tpOpen = lvl >= WAR.minLevel && (mine === s.att || mine === s.def) && ((s.ph === "prep" && s.t0 - now <= WAR.schedule.teleportMin * 60000) || s.ph === "siege");
    const html = `<div class="war-head"><span class="war-front">${esc(T("ui.siege.1", { fort: cityName(s.fort) }))}</span><span class="war-time">${esc(time)}</span></div>
      <div class="siege-sides"><span class="att ${fcls(s.att)}" title="${esc(T("ui.siege.5"))}">${esc(fName(s.att))}</span><span class="vs">${esc(T("ui.siege.24"))}</span><span class="def ${fcls(s.def)}" title="${esc(T("ui.siege.6"))}">${esc(fName(s.def))}</span></div>
      <div class="siege-row">${gate("n")}${pip}${gate("s")}</div>
      ${note ? `<div class="war-note">${esc(note)}</div>` : ""}${tpOpen ? `<button class="btn war-tp" data-siege-tp>${T(mine === s.att ? "ui.siege.7" : "ui.siege.8")}</button>` : ""}`;
    if (html !== this.lastHtml) { this.lastHtml = html; this.bar.innerHTML = html; }
  }

  private showResult(r: SiegeResultMsg) {
    this.result?.close();
    const me = r.me, mine = me?.faction ?? (this.net.self?.faction as WarFaction | undefined);
    const won = r.win === mine, taken = r.how === "taken";
    const head = `${T(taken ? "ui.siege.9" : "ui.siege.10", { fort: cityName(r.fort) })} · ${T(won ? "ui.siege.11" : "ui.siege.12")}`;
    const how = T(r.how === "taken" ? "ui.siege.13" : r.how === "gates" ? "ui.siege.14" : "ui.siege.15");
    const name = this.net.self?.name;
    const table = (f: WarFaction) => {
      const rows = r.top[f].map((t, i) => `<tr class="${t.name === name ? "me" : ""}"><td class="num">${i + 1}</td><td class="grow">${esc(t.name)}<span class="sub">${esc(CLASSES[t.cls as ClassId]?.name ?? t.cls)}</span></td><td class="num">${t.contrib}</td></tr>`).join("")
        || `<tr><td colspan="3" class="dim">${T("ui.bannerWar.13")}</td></tr>`;
      return `<div class="war-side ${fcls(f)}"><h3>${esc(FACTIONS[f].name)}</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${T("ui.bannerWar.14")}</th><th class="num">${T("ui.bannerWar.15")}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    };
    const mineRows = me ? `<dl class="kv">
        <dt>${T("ui.bannerWar.15")}</dt><dd>${me.contrib}</dd>
        <dt>${T("ui.bannerWar.16")}</dt><dd class="gold">+${me.marks}${me.capped ? ` <small class="dim">${T("ui.bannerWar.17")}</small>` : ""}</dd>
        <dt>${T("ui.bannerWar.18")}</dt><dd>${me.chest.length ? me.chest.map((c) => `${esc(c.name)} ×${c.qty}`).join(", ") : "—"}</dd>
        ${me.title ? `<dt>${T("ui.siege.17")}</dt><dd class="gold">«${esc(me.title)}»</dd>` : ""}
      </dl>${me.contrib < WAR.rewards.minContrib ? `<p class="note">${T("ui.bannerWar.19", { n: WAR.rewards.minContrib })}</p>` : ""}` : "";
    const def: WarFaction = r.att === "solgard" ? "umbrath" : "solgard";
    const html = `<section class="panel dialog war-result siege-result" role="dialog" aria-modal="true" aria-labelledby="siege-res-title">
      <div class="dialog-head"><h2 class="dialog-title ${won ? "war-win" : "war-loss"}" id="siege-res-title">${esc(head)}</h2></div>
      <div class="dialog-body">
        <div class="war-final"><span class="war-num ${fcls(r.att)}" style="text-align:right">${esc(FACTIONS[r.att].name)}</span><span class="dim">${esc(cityName(r.fort))} · ${mmss(r.durationMs)}</span><span class="war-num ${fcls(def)}" style="text-align:left">${esc(FACTIONS[def].name)}</span></div>
        <p class="siege-how">${esc(how)}</p>
        <p class="siege-week">${esc(T("ui.siege.18", { faction: FACTIONS[r.win].name, pct: Math.round(SIEGE.reward.xpGold * 100), days: SIEGE.reward.days }))}</p>
        ${mineRows}
        <div class="war-sides">${table(r.att)}${table(def)}</div>
        <p class="dim war-stats">${T("ui.siege.16", { b: r.stats.breaches, e: r.stats.engines, k: r.stats.kills })}</p>
      </div>
      <div class="dialog-foot"><button class="btn primary" data-x>${T("ui.bannerWar.27")}</button></div></section>`;
    const m = openModal(html, { onClose: () => { if (this.result === m) this.result = null; } });
    this.result = m;
    m.dialog.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-x]")) m.close(); });
  }
}

// ---------- метки на картах ----------
const col = (f: string) => (f === "solgard" ? WAR.look.color.solgard : f === "umbrath" ? WAR.look.color.umbrath : WAR.look.color.neutral);
/** Ворота осаждаемого форта: целые — в цвете обороны, сломанные — мигают; неделя после осады — флажок победителя над фортом. */
function marks(): { x: number; y: number; f: string; broken: boolean }[] {
  const s = siegeView.state;
  if (!s || s.ph === "idle" || s.ph === "prep") return [];
  return s.gates.map((v) => { const g = gateById(v.id)!; return { x: g.x, y: g.y, f: s.def, broken: v.broken }; });
}
export function drawSiegeMini(g: CanvasRenderingContext2D, X: (px: number) => number, Y: (py: number) => number) {
  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  for (const m of marks()) {
    const x = Math.round(X(m.x)), y = Math.round(Y(m.y));
    g.fillStyle = "#000"; g.fillRect(x - 4, y - 3, 9, 7);
    g.fillStyle = m.broken ? (blink ? WAR.look.color.neutral : "#000") : col(m.f); g.fillRect(x - 3, y - 2, 7, 5);
  }
}
export function drawSiegeMap(g: CanvasRenderingContext2D, X: (tx: number) => number, Y: (ty: number) => number, s: number, hits: { x: number; y: number; r: number; title: string; sub: string }[]) {
  const st = siegeView.state, blink = Math.floor(performance.now() / 400) % 2 === 0, k = Math.max(1, Math.min(2.2, s / 2.5));
  for (const m of marks()) {
    const x = X(m.x / TILE), y = Y(m.y / TILE), w = 9 * k, h = 7 * k;
    g.fillStyle = "#000"; g.fillRect(Math.round(x - w / 2 - 1), Math.round(y - h / 2 - 1), Math.round(w + 2), Math.round(h + 2));
    g.fillStyle = m.broken ? (blink ? WAR.look.color.neutral : "#3a2a20") : col(m.f); g.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    const gv = st?.gates.find((v) => gateById(v.id)?.x === m.x && gateById(v.id)?.y === m.y);
    hits.push({ x, y, r: 8 * k, title: T("ui.siege.21"), sub: m.broken ? T("ui.siege.4") : `${Math.ceil((gv?.hp ?? 1) * 100)}%` });
  }
  // неделя после осады: флажок победителя над воротами форта
  const wk = st?.week;
  if (wk && siegeNow() < wk.until) {
    const c = CITIES.find((x) => x.id === wk.fort);
    if (c) {
      const x = X(c.x), y = Y(c.y - 12);
      g.fillStyle = "#000"; g.fillRect(Math.round(x - 1), Math.round(y - 12 * k), Math.max(2, Math.round(2 * k)), Math.round(13 * k));
      g.beginPath(); g.moveTo(x + k, y - 12 * k); g.lineTo(x + 10 * k, y - 9 * k); g.lineTo(x + k, y - 6 * k); g.closePath();
      g.fillStyle = col(wk.flag); g.fill(); g.lineWidth = 1; g.strokeStyle = "#000"; g.stroke();
      hits.push({ x, y: y - 9 * k, r: 9 * k, title: T("ui.siege.22", { faction: FACTIONS[wk.flag].name }), sub: T("ui.siege.18", { faction: FACTIONS[wk.bonus].name, pct: Math.round(SIEGE.reward.xpGold * 100), days: Math.max(1, Math.ceil((wk.until - siegeNow()) / 86400000)) }) });
    }
  }
}
