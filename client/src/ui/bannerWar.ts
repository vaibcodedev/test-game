/**
 * «Знамёна Предела» в интерфейсе (задача 132, шаг 14): полоса битвы сверху (фронт, счёт, таймер, основания, «В форт»), объявления на экране,
 * окно итогов; метки оснований на мини-карте и карте мира. Состояние — сообщение war (shared/bannerWar.ts), общий склад warView читают
 * и мир (client/src/game/bannerBases.ts), и карты. Оформление — дизайн-система (styles/war.css на токенах tokens.css и компонентах kit.css).
 */
import { CLASSES, type ClassId } from "../../../shared/classes";
import { FACTIONS } from "../../../shared/factions";
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
  /** «В форт»: в бою (событие combat, как у HUD) и до какого performance.now() перезарядка. */
  private inCombat = false;
  private tpUntil = 0;

  private net: Net = NET;

  constructor(root: HTMLElement) {
    const net = this.net;
    this.bar.className = "panel war-bar";
    this.bar.hidden = true;
    this.banner.className = "war-banner passthru";
    this.banner.hidden = true;
    root.append(this.bar, this.banner);
    this.bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-war-tp]");
      if (b && !b.disabled && !this.inCombat && performance.now() >= this.tpUntil) this.net.send("war:tp", {});
    });
    net.on("combat", (m) => { this.inCombat = m.on; this.render(); });
    net.on("war:tpcd", (m) => { this.tpUntil = performance.now() + m.ms; this.render(); });
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
      const state = !b ? "" : b.lock ? T("ui.bannerWar.5", { min: WAR.schedule.heartOpenMin }) : b.c ? T("ui.bannerWar.6") : b.s > 0 ? T("ui.bannerWar.7") : b.o ? FACTIONS[b.o as WarFaction].name : T("ui.bannerWar.8");
      const fill = b ? Math.round((b.b ? b.h : b.hp) * 100) : 0;
      return `<span class="war-pip ${d.kind} o-${fcls(b?.o ?? "")} b-${fcls(b?.b || b?.hf || "")}${b?.c ? " contest" : ""}${b?.lock ? " lock" : ""}${b && b.s > 0 ? " seal" : ""}" title="${esc(d.name)} · ${esc(state)}"><i style="height:${fill}%"></i></span>`;
    }).join("");
    const html = `<div class="war-head"><span class="war-front">${esc(fr?.name ?? "")}</span><span class="war-time">${esc(time)}</span></div>
      <div class="war-score"><b class="war-num sol" title="${esc(FACTIONS.solgard.name)}">${s.score[0]}</b><span class="war-pips">${pips}</span><b class="war-num umb" title="${esc(FACTIONS.umbrath.name)}">${s.score[1]}</b></div>
      ${note ? `<div class="war-note">${esc(note)}</div>` : ""}${tpOpen ? this.tpButton() : ""}`;
    if (html !== this.lastHtml) { this.lastHtml = html; this.bar.innerHTML = html; }
  }

  /** Кнопка «В форт»: в бою — серая с замком, на перезарядке — серая с отсчётом и шторкой, подсказка — почему. */
  private tpButton(): string {
    const left = this.tpUntil - performance.now(), cdMs = WAR.schedule.teleportCdSec * 1000;
    if (this.inCombat) return `<button class="btn war-tp locked" data-war-tp disabled title="${esc(T("ui.bannerWar.33"))}">&#128274; ${T("ui.bannerWar.9")}</button>`;
    if (left > 0) return `<button class="btn war-tp cd" data-war-tp disabled title="${esc(T("ui.bannerWar.34", { t: mmss(left) }))}" style="--cd:${Math.max(0, Math.min(1, left / cdMs)).toFixed(3)}">&#8987; ${mmss(left)}</button>`;
    return `<button class="btn war-tp" data-war-tp>${T("ui.bannerWar.9")}</button>`;
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
/** Значки оснований (tools/gen/war-bases.ts → client/public/ui/war/): владелец × вид точки. */
const ICONS = new Map<string, HTMLImageElement>();
for (const f of ["sol", "umb", "none"]) for (const h of ["", "-heart"]) {
  const im = new Image();
  im.src = `/ui/war/icon-${f}${h}.png`;
  ICONS.set(`${f}${h}`, im);
}
const iconOf = (o: string, heart: boolean) => ICONS.get(`${fcls(o)}${heart ? "-heart" : ""}`);
const lookCol = (f: string) => (f === "solgard" ? WAR.look.color.solgard : f === "umbrath" ? WAR.look.color.umbrath : WAR.look.color.neutral);

/** Владелец и, если идёт битва на фронте, ход захвата: «захватывается Умбратом — 45 %», «спор», «печать 1:20». */
export function baseState(id: string): { owner: string; state: string } {
  const b = warView.byId.get(id), s = warView.state, d = warBase(id);
  const owner = b?.o ? T("ui.bannerWar.32", { of: WAR.look.of[b.o as WarFaction] }) : T("ui.bannerWar.8");
  if (!b || !s || !d || s.ph !== "battle" || s.front !== d.front) return { owner, state: "" };
  if (b.lock) return { owner, state: T("ui.bannerWar.5", { min: WAR.schedule.heartOpenMin }) };
  if (b.c) return { owner, state: T("ui.bannerWar.6") };
  if (b.s > 0) return { owner, state: `${T("ui.bannerWar.7")} ${mmss(b.s)}` };
  if (b.hf) return { owner, state: T("ui.bannerWar.29", { faction: FACTIONS[b.hf as WarFaction].name }) };
  if (b.b && b.o !== b.b) return { owner, state: T("ui.bannerWar.30", { faction: FACTIONS[b.b as WarFaction].name, pct: Math.round(b.h * 100) }) };
  if (b.o && b.h < 1) return { owner, state: T("ui.bannerWar.31", { pct: Math.round(b.h * 100) }) };
  return { owner, state: "" };
}

/** Мини-карта: тот же значок «постамент со знаменем», маленький (ui/war/mini-*.png); ход захвата — дуга цветом знамени, спор — мигающий обод. */
const MINI = new Map<string, HTMLImageElement>();
for (const f of ["sol", "umb", "none"]) for (const h of ["", "-heart"]) { const im = new Image(); im.src = `/ui/war/mini-${f}${h}.png`; MINI.set(`${f}${h}`, im); }
export function drawWarMini(g: CanvasRenderingContext2D, X: (px: number) => number, Y: (py: number) => number) {
  const s = warView.state, blink = Math.floor(performance.now() / 400) % 2 === 0;
  g.imageSmoothingEnabled = false;
  for (const d of WAR_BASES) {
    const b = warView.byId.get(d.id), on = !!s && s.ph !== "idle" && s.front === d.front, heart = d.kind === "heart";
    const x = Math.round(X(d.x)), y = Math.round(Y(d.y)), im = MINI.get(`${fcls(b?.o ?? "")}${heart ? "-heart" : ""}`);
    if (on && b && (b.c || (b.b && b.h < 1))) {
      g.lineWidth = 2; g.strokeStyle = b.c ? (blink ? WAR.look.color.solgard : WAR.look.color.umbrath) : lookCol(b.b);
      g.beginPath(); g.arc(x, y - 2, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.c ? 1 : b.h)); g.stroke();
    }
    if (im?.complete && im.naturalWidth) g.drawImage(im, x - Math.floor(im.naturalWidth / 2), y - im.naturalHeight + 4);
  }
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
/**
 * Карта мира: значок основания (плашка со знаменем владельца; Сердце крупнее, с короной), под ним подпись в стиле карты —
 * имя и строка владельца или хода захвата; подпись не ложится на подписи зон и городов (placed), иначе пробует сверху и сбоку.
 * Подсказка по наведению — имя, фронт, владелец, что даёт точка и ход захвата.
 */
export function drawWarMap(g: CanvasRenderingContext2D, X: (tx: number) => number, Y: (ty: number) => number, s: number, hits: { x: number; y: number; r: number; title: string; sub: string }[], placed: Rect[] = []) {
  const st = warView.state, blink = Math.floor(performance.now() / 400) % 2 === 0;
  const TEXT = `"Rubik", "Trebuchet MS", system-ui, sans-serif`;
  const k = s >= 5 ? 2 : 1;
  g.imageSmoothingEnabled = false;
  for (const d of WAR_BASES) {
    const b = warView.byId.get(d.id), on = !!st && st.ph !== "idle" && st.front === d.front, heart = d.kind === "heart";
    const im = iconOf(b?.o ?? "", heart);
    const x = Math.round(X(d.x / TILE)), y = Math.round(Y(d.y / TILE));
    const iw = (im?.naturalWidth || 22) * k, ih = (im?.naturalHeight || 30) * k, foot = 3 * k, mid = y - ih / 2 + foot;
    // прогресс захвата — дуга вокруг значка цветом знамени; спор — мигающий обод
    if (on && b && (b.c || (b.b && b.h < 1))) {
      g.lineWidth = 3;
      g.strokeStyle = "#000"; g.beginPath(); g.arc(x, mid, ih / 2 + 3, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = b.c ? (blink ? WAR.look.color.solgard : WAR.look.color.umbrath) : lookCol(b.b);
      g.beginPath(); g.arc(x, mid, ih / 2 + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.c ? 1 : b.h)); g.stroke();
    }
    // значок стоит подножием на точке основания
    if (im?.complete && im.naturalWidth) g.drawImage(im, Math.round(x - iw / 2), Math.round(y - ih + foot), iw, ih);
    const rIcon = { x0: x - iw / 2, y0: y - ih + foot, x1: x + iw / 2, y1: y + foot };
    placed.push(rIcon);
    // подпись
    const { owner, state } = baseState(d.id);
    const lines = [{ text: d.name, font: `600 13px ${TEXT}`, fill: P.fg }, { text: state || owner, font: `400 12px ${TEXT}`, fill: state ? P.warn : b?.o ? lookCol(b.o) : P.dim }];
    const ws = lines.map((l) => { g.font = l.font; return Math.ceil(g.measureText(l.text).width); }), bw = Math.max(...ws) + 4, bh = 30;
    const spots = [[x, y + foot + 2], [x, y - ih + foot - bh - 2], [x + iw / 2 + bw / 2 + 4, mid - bh / 2], [x - iw / 2 - bw / 2 - 4, mid - bh / 2]];
    for (const [cx, top] of spots) {
      const r = { x0: cx - bw / 2, y0: top, x1: cx + bw / 2, y1: top + bh };
      if (placed.some((p) => p !== rIcon && r.x0 - 4 < p.x1 && r.x1 + 4 > p.x0 && r.y0 - 4 < p.y1 && r.y1 + 4 > p.y0)) continue;
      placed.push(r);
      lines.forEach((l, i) => {
        g.font = l.font; g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = P.well;
        const tx = Math.round(cx - ws[i] / 2), ty = Math.round(top + 12 + i * 15);
        g.strokeText(l.text, tx, ty); g.fillStyle = l.fill; g.fillText(l.text, tx, ty);
      });
      break;
    }
    hits.push({ x, y: mid, r: ih / 2 + 2, title: d.name, sub: `${warFront(d.front)?.name ?? ""} · ${owner}${state ? ` · ${state}` : ""} — ${bonusText(d.id)}` });
  }
}
