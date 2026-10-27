/**
 * «Знамёна Предела» в интерфейсе (задача 132, шаг 14): полоса битвы сверху (фронт, счёт, таймер, основания, «В форт»), объявления на экране,
 * окно итогов; метки оснований на мини-карте и карте мира. Состояние — сообщение war (shared/bannerWar.ts), общий склад warView читают
 * и мир (client/src/game/bannerBases.ts), и карты. Оформление — дизайн-система (styles/war.css на токенах tokens.css и компонентах kit.css).
 */
import { CLASSES, type ClassId } from "../../../shared/classes";
import { factionColor, FACTIONS } from "../../../shared/factions";
import { TILE } from "../../../shared/constants";
import { P } from "../../../shared/palette";
import { T } from "../../../shared/texts";
import { WAR, WAR_BASES, warBase, warFront, type WarBaseView, type WarFaction, type WarResultMsg, type WarSayMsg, type WarStateMsg } from "../../../shared/bannerWar";
import { net as NET, type Net } from "../net";
import { openModal, type ModalHandle } from "./kit";

/** Последнее состояние ивента и сдвиг часов сервера относительно performance.now(). */
export const warView: { state: WarStateMsg | null; at: number; byId: Map<string, WarBaseView> } = { state: null, at: 0, byId: new Map() };
/** «Сейчас» по часам сервера. */
export const warNow = () => (warView.state ? warView.state.now + (performance.now() - warView.at) : Date.now());

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const fcls = (f: string) => (f === "solgard" ? "sol" : f === "umbrath" ? "umb" : "none");
const pct = (v: number) => Math.round(v * 100);

/** Что даёт точка (подсказка на карте мира и в полосе). */
export function bonusText(id: string): string {
  const b = warBase(id), f = b && warFront(b.front);
  if (!b || !f) return "";
  const B = WAR.bonus;
  if (b.kind === "side") return f.side === "xpGold" ? T("ui.bannerWar.20", { pct: pct(B.xpGold) }) : f.side === "mats" ? T("ui.bannerWar.21", { pct: pct(B.mats) }) : T("ui.bannerWar.22");
  return f.heart === "speed" ? T("ui.bannerWar.23", { pct: pct(B.speed) }) : f.heart === "squads" ? T("ui.bannerWar.24", { min: B.squadMin }) : T("ui.bannerWar.25", { pct: pct(B.dungeonLoot) });
}

export class WarHud {
  private bar = document.createElement("section");
  private banner = document.createElement("div");
  private bannerTimer = 0;
  private result: ModalHandle | null = null;
  private lastHtml = "";
  private lastTick = 0;

  private net: Net = NET;

  constructor(root: HTMLElement) {
    const net = this.net;
    this.bar.className = "panel war-bar";
    this.bar.hidden = true;
    this.banner.className = "war-banner passthru";
    this.banner.hidden = true;
    root.append(this.bar, this.banner);
    this.bar.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-war-tp]")) this.net.send("war:tp", {}); });
    net.on("war", (s) => {
      warView.state = s;
      warView.at = performance.now();
      warView.byId = new Map(s.bases.map((b) => [b.id, b]));
      this.render();
    });
    net.on("war:say", (m) => this.say(m));
    net.on("war:result", (r) => this.showResult(r));
    net.on("switch", (kind) => { if (kind !== "world") { this.bar.hidden = true; this.banner.hidden = true; } });
  }

  /** Раз в кадр: таймер тикает без сообщений сервера (перерисовка не чаще 4 раз в секунду). */
  frame() {
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    this.render();
  }

  private render() {
    const s = warView.state;
    const show = !!s && s.ph !== "idle" && this.net.kind === "world";
    if (this.bar.hidden === show) this.bar.hidden = !show;
    if (!show || !s) return;
    const fr = warFront(s.front);
    const now = warNow();
    const lvl = this.net.self?.level ?? 0;
    const tpOpen = lvl >= WAR.minLevel && ((s.ph === "prep" && s.t0 - now <= WAR.schedule.teleportMin * 60000) || s.ph === "battle");
    const time = s.ph === "prep" ? T("ui.bannerWar.1", { t: mmss(s.t0 - now) }) : s.ph === "battle" ? mmss(s.t1 - now) : T("ui.bannerWar.2");
    const heartAt = s.t0 + WAR.schedule.heartOpenMin * 60000;
    const note = s.ph === "battle" && !s.heart ? T("ui.bannerWar.3", { t: mmss(heartAt - now) }) : s.ph === "prep" && lvl < WAR.minLevel ? T("ui.bannerWar.4", { lvl: WAR.minLevel }) : "";
    const pips = (fr?.bases ?? []).map((d) => {
      const b = warView.byId.get(d.id);
      const state = !b ? "" : b.lock ? T("ui.bannerWar.5") : b.c ? T("ui.bannerWar.6") : b.s > 0 ? T("ui.bannerWar.7") : b.o ? FACTIONS[b.o as WarFaction].name : T("ui.bannerWar.8");
      const fill = b ? Math.round((b.b ? b.h : b.hp) * 100) : 0;
      return `<span class="war-pip ${d.kind} o-${fcls(b?.o ?? "")} b-${fcls(b?.b || b?.hf || "")}${b?.c ? " contest" : ""}${b?.lock ? " lock" : ""}${b && b.s > 0 ? " seal" : ""}" title="${esc(d.name)} · ${esc(state)}"><i style="height:${fill}%"></i></span>`;
    }).join("");
    const html = `<div class="war-head"><span class="war-front">${esc(fr?.name ?? "")}</span><span class="war-time">${esc(time)}</span></div>
      <div class="war-score"><b class="war-num sol" title="${esc(FACTIONS.solgard.name)}">${s.score[0]}</b><span class="war-pips">${pips}</span><b class="war-num umb" title="${esc(FACTIONS.umbrath.name)}">${s.score[1]}</b></div>
      ${note ? `<div class="war-note">${esc(note)}</div>` : ""}${tpOpen ? `<button class="btn war-tp" data-war-tp>${T("ui.bannerWar.9")}</button>` : ""}`;
    if (html !== this.lastHtml) { this.lastHtml = html; this.bar.innerHTML = html; }
  }

  private say(m: WarSayMsg) {
    if (this.net.kind !== "world") return;
    this.banner.className = `war-banner passthru ${m.kind} f-${fcls(m.f ?? "")}`;
    this.banner.innerHTML = `<div>${esc(m.text)}</div>${m.sub ? `<small>${esc(m.sub)}</small>` : ""}`;
    this.banner.hidden = false;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), m.kind === "end" || m.kind === "start" ? 3600 : 2800);
  }

  private showResult(r: WarResultMsg) {
    this.result?.close();
    const me = r.me, mine = me?.faction ?? (this.net.self?.faction as WarFaction | undefined);
    const head = !r.win ? T("ui.bannerWar.10") : r.win === mine ? T("ui.bannerWar.11") : T("ui.bannerWar.12");
    const tone = !r.win ? "" : r.win === mine ? " war-win" : " war-loss";
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
      </dl>${me.contrib < WAR.rewards.minContrib ? `<p class="note">${T("ui.bannerWar.19", { n: WAR.rewards.minContrib })}</p>` : ""}` : "";
    const html = `<section class="panel dialog war-result" role="dialog" aria-modal="true" aria-labelledby="war-res-title">
      <div class="dialog-head"><h2 class="dialog-title${tone}" id="war-res-title">${esc(head)}${r.rout ? ` · ${T("ui.bannerWar.26")}` : ""}</h2></div>
      <div class="dialog-body">
        <div class="war-final"><span class="war-num sol">${r.score[0]}</span><span class="dim">${esc(warFront(r.front)?.name ?? "")} · ${mmss(r.durationMs)}</span><span class="war-num umb">${r.score[1]}</span></div>
        ${mineRows}
        <div class="war-sides">${table("solgard")}${table("umbrath")}</div>
        <p class="dim war-stats">${T("ui.bannerWar.28", { c: r.stats.captures, t: r.stats.tears, k: r.stats.kills })}</p>
      </div>
      <div class="dialog-foot"><button class="btn primary" data-x>${T("ui.bannerWar.27")}</button></div></section>`;
    const m = openModal(html, { onClose: () => { if (this.result === m) this.result = null; } });
    this.result = m;
    m.dialog.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-x]")) m.close(); });
  }
}

// ---------- метки на картах ----------
const colorOf = (b: WarBaseView | undefined) => (b?.o ? factionColor(b.o) : P.dim);

/** Мини-карта: ромб у каждого основания (цвет владельца; спор — мигающая рамка, активный фронт — крупнее). */
export function drawWarMini(g: CanvasRenderingContext2D, X: (px: number) => number, Y: (py: number) => number) {
  const s = warView.state, blink = Math.floor(performance.now() / 400) % 2 === 0;
  for (const d of WAR_BASES) {
    const b = warView.byId.get(d.id), on = !!s && s.ph !== "idle" && s.front === d.front;
    const r = (d.kind === "heart" ? 4 : 3) + (on ? 1 : 0), x = Math.round(X(d.x)), y = Math.round(Y(d.y));
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fillStyle = colorOf(b); g.fill();
    g.lineWidth = 1; g.strokeStyle = b?.c && blink ? P.warn : "#000"; g.stroke();
  }
}

/** Карта мира: знак основания со знаменем в цвете владельца; подсказка — имя, владелец и что даёт точка. */
export function drawWarMap(g: CanvasRenderingContext2D, X: (tx: number) => number, Y: (ty: number) => number, s: number, hits: { x: number; y: number; r: number; title: string; sub: string }[]) {
  const st = warView.state, blink = Math.floor(performance.now() / 400) % 2 === 0;
  for (const d of WAR_BASES) {
    const b = warView.byId.get(d.id), on = !!st && st.ph !== "idle" && st.front === d.front;
    const k = Math.max(1, Math.min(2.2, s / 2.5)) * (d.kind === "heart" ? 1.25 : 1) * (on ? 1.15 : 1);
    const x = X(d.x / TILE), y = Y(d.y / TILE);
    // древко и флажок
    g.fillStyle = "#000";
    g.fillRect(Math.round(x - 1.5 * k), Math.round(y - 11 * k), Math.max(2, Math.round(3 * k)), Math.round(13 * k));
    g.fillStyle = P.lineHi;
    g.fillRect(Math.round(x - 0.5 * k), Math.round(y - 10 * k), Math.max(1, Math.round(k)), Math.round(11 * k));
    g.beginPath(); g.moveTo(x + 0.5 * k, y - 10 * k); g.lineTo(x + 9 * k, y - 7.5 * k); g.lineTo(x + 0.5 * k, y - 5 * k); g.closePath();
    g.fillStyle = colorOf(b); g.fill();
    g.lineWidth = Math.max(1, k * 0.8); g.strokeStyle = b?.c && blink ? P.warn : "#000"; g.stroke();
    // основание
    g.fillStyle = "#000"; g.fillRect(Math.round(x - 3.5 * k), Math.round(y + 1 * k), Math.round(7 * k), Math.round(3 * k));
    g.fillStyle = P.dim; g.fillRect(Math.round(x - 2.5 * k), Math.round(y + 1.5 * k), Math.round(5 * k), Math.max(1, Math.round(1.5 * k)));
    const owner = b?.o ? FACTIONS[b.o as WarFaction].name : T("ui.bannerWar.8");
    hits.push({ x, y: y - 5 * k, r: 10 * k, title: d.name, sub: `${warFront(d.front)?.name ?? ""} · ${owner} — ${bonusText(d.id)}` });
  }
}
