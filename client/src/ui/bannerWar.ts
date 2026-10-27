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
import SIEGE_DATA from "../../../data/siege.json";
import { WAR, WAR_BASES, WAR_FRONTS, WAR_RADIUS, nextWarStart, raiseSec, warBase, warFront, type WarBaseDef, type WarBaseView, type WarFaction, type WarResultMsg, type WarSayMsg, type WarStateMsg } from "../../../shared/bannerWar";
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
      if ((e.target as HTMLElement).closest("[data-war-rules]")) openWarRules();
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
  frame(pos?: { x: number; y: number }, mount = "") {
    if (pos) { warHero.x = pos.x; warHero.y = pos.y; warHero.mount = mount; warHero.at = performance.now(); }
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    this.render();
    // вошли в круг не воюющего фронта — один раз объявление, куда идти
    const h = warHint();
    const id = h?.inactive?.id ?? "";
    if (id && id !== this.inactiveSeen) this.say({ text: T("ui.bannerWar.96", { front: warFront(warView.state!.front)?.name ?? "" }), kind: "info" });
    this.inactiveSeen = id;
    this.intro();
  }
  private inactiveSeen = "";
  private introEl: HTMLElement | null = null;
  /** Карточка первого знакомства: при первой битве или сборе — три строки и «Подробнее» (окно правил); один раз на браузер. */
  private intro() {
    const s = warView.state;
    if (this.introEl || !s || (s.ph !== "battle" && s.ph !== "prep") || (this.net.self?.level ?? 0) < WAR.minLevel || this.net.kind !== "world") return;
    try { if (localStorage.getItem("war:intro:v1")) return; } catch { return; }
    const c = document.createElement("section");
    c.className = "panel war-intro";
    c.innerHTML = `<h3>${esc(T("ui.bannerWar.40"))}</h3><ol>${[97, 98, 99].map((k) => `<li>${esc(T(`ui.bannerWar.${k}`))}</li>`).join("")}</ol>
      <div class="war-intro-btns"><button class="btn" data-more>${T("ui.bannerWar.100")}</button><button class="btn primary" data-ok>${T("ui.bannerWar.101")}</button></div>`;
    const done = () => { try { localStorage.setItem("war:intro:v1", "1"); } catch { /* приватное окно */ } c.remove(); };
    c.querySelector<HTMLButtonElement>("[data-more]")!.onclick = () => { done(); openWarRules(); };
    c.querySelector<HTMLButtonElement>("[data-ok]")!.onclick = done;
    this.bar.parentElement?.append(c);
    this.introEl = c;
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
    const hint = warHint();
    const html = `<div class="war-head"><span class="war-front">${esc(fr?.name ?? "")}</span><span class="war-time">${esc(time)}</span></div>
      <button class="x war-help" data-war-rules title="${esc(T("ui.bannerWar.41"))}" aria-label="${esc(T("ui.bannerWar.41"))}">?</button>
      <div class="war-score"><b class="war-num sol" title="${esc(FACTIONS.solgard.name)}">${s.score[0]}</b><span class="war-pips">${pips}</span><b class="war-num umb" title="${esc(FACTIONS.umbrath.name)}">${s.score[1]}</b></div>
      ${hint ? `<div class="war-hint ${hint.tone}">${esc(hint.text)}</div>` : ""}${note ? `<div class="war-note">${esc(note)}</div>` : ""}${tpOpen ? this.tpButton() : ""}`;
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
  // стрелка у края мини-карты к знамени фронта битвы, если оно за краем
  const h = warHint();
  if (h?.target && !h.inside) {
    const W = g.canvas.width, H = g.canvas.height, tx = X(h.target.x), ty = Y(h.target.y);
    if (tx < 4 || ty < 4 || tx > W - 4 || ty > H - 4) {
      const cx = W / 2, cy = H / 2, a = Math.atan2(ty - cy, tx - cx), k = Math.min((W / 2 - 8) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 8) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
      g.save(); g.translate(ax, ay); g.rotate(a);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath();
      g.fillStyle = WAR.look.color.solgard; g.strokeStyle = "#000"; g.lineWidth = 1.5; g.fill(); g.stroke(); g.restore();
    }
  }
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
/**
 * Карта мира: значок основания (плашка со знаменем владельца; Сердце крупнее, с короной), под ним подпись в стиле карты —
 * имя и строка владельца или хода захвата; подпись не ложится на подписи зон и городов (placed), иначе пробует сверху и сбоку.
 * Подсказка по наведению — имя, фронт, владелец, что даёт точка и ход захвата.
 */
export function drawWarMap(g: CanvasRenderingContext2D, X: (tx: number) => number, Y: (ty: number) => number, s: number, hits: { x: number; y: number; r: number; title: string; sub: string }[], placed: Rect[] = [], avoid: Rect[] = []) {
  const st = warView.state, blink = Math.floor(performance.now() / 400) % 2 === 0;
  const TEXT = `"Rubik", "Trebuchet MS", system-ui, sans-serif`;
  const k = s >= 5 ? 2 : 1;
  g.imageSmoothingEnabled = false;
  // подписи — строго под своим значком (пересчёт каждый кадр, при любом масштабе); не влезла — только значок. Сердца — первыми, метка «Вы» — важнее
  const icons: Rect[] = [];
  const order = [...WAR_BASES].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "heart" ? -1 : 1));
  for (const d of order) {
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
    // значок стоит подножием на точке основания; фронт битвы — пульсирующий обод, остальные — бледнее
    const act = warActive(d);
    if (act) { const pu = 0.5 + 0.5 * Math.sin(performance.now() / 300); g.lineWidth = 2; g.strokeStyle = `rgba(255, 216, 74, ${0.35 + 0.55 * pu})`; g.beginPath(); g.arc(x, mid, ih / 2 + 6 + pu * 2, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = st?.ph === "battle" && !act ? 0.55 : 1;
    if (im?.complete && im.naturalWidth) g.drawImage(im, Math.round(x - iw / 2), Math.round(y - ih + foot), iw, ih);
    g.globalAlpha = 1;
    const rIcon = { x0: x - iw / 2, y0: y - ih + foot, x1: x + iw / 2, y1: y + foot };
    placed.push(rIcon);
    // подпись
    const { owner, state } = baseState(d.id);
    const lines = [{ text: d.name, font: `600 13px ${TEXT}`, fill: P.fg }, { text: state || owner, font: `400 12px ${TEXT}`, fill: state ? P.warn : b?.o ? lookCol(b.o) : P.dim }];
    const ws = lines.map((l) => { g.font = l.font; return Math.ceil(g.measureText(l.text).width); }), bw = Math.max(...ws) + 4, bh = 30;
    icons.push(rIcon);
    for (const [cx, top] of [[x, y + foot + 2]]) {
      const r = { x0: cx - bw / 2, y0: top, x1: cx + bw / 2, y1: top + bh };
      const hit = (p: Rect) => p !== rIcon && r.x0 - 3 < p.x1 && r.x1 + 3 > p.x0 && r.y0 - 3 < p.y1 && r.y1 + 3 > p.y0;
      if (placed.some(hit) || avoid.some(hit) || icons.some(hit)) continue;
      placed.push(r);
      lines.forEach((l, i) => {
        g.font = l.font; g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = P.well;
        const tx = Math.round(cx - ws[i] / 2), ty = Math.round(top + 12 + i * 15);
        g.strokeText(l.text, tx, ty); g.fillStyle = l.fill; g.fillText(l.text, tx, ty);
      });
      break;
    }
    hits.push({ x, y: mid, r: ih / 2 + 2, title: d.name, sub: `${warFront(d.front)?.name ?? ""} · ${owner}${state ? ` · ${state}` : ""} — ${bonusText(d.id)}. ${T("ui.bannerWar.66")}` });
  }
}

// ---------- окно правил ----------
/** Имена оснований — по ним карта мира понимает, что щёлкнули по основанию (открыть правила). */
export const WAR_BASE_NAMES = new Set(WAR_BASES.map((d) => d.name));
let rules: ModalHandle | null = null;
/**
 * Правила «Знамён Предела» для игрока (кнопка «?» на полосе битвы, щелчок по основанию на карте, меню игры): когда, как захватить,
 * очки, что дают точки, награды, осада, перемирие и знаки карты. Все числа — из data/faction-war.json и data/siege.json; сверху — живая строка.
 */
export function openWarRules() {
  if (rules) return;
  const S = WAR.schedule, C = WAR.capture, SC = WAR.score, R = WAR.rewards, SG = SIEGE_DATA;
  const list = (a: (string | number)[]) => a.join(", ");
  const sec = (title: string, ...ps: string[]) => `<section class="war-rule"><h3>${esc(title)}</h3>${ps.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`;
  const icon = (id: string) => `<img class="war-legend-ic" src="/ui/war/${id}.png" alt="">`;
  const fronts = WAR_FRONTS.map((f) => {
    const side = f.bases.find((b) => b.kind === "side")!, heart = f.bases.find((b) => b.kind === "heart")!;
    const fc = NET.self?.faction === "umbrath" ? "umb" : "sol", bi = (b: string) => `<img class="war-buff-ic" src="/assets/icons/war_${b}_${fc}.png" alt="">`;
    return `<li class="war-front-li">${bi(f.side)}${bi(f.heart)}<span>${esc(T("ui.bannerWar.54", { front: f.name, side: bonusText(side.id), heart: bonusText(heart.id) }))}</span></li>`;
  }).join("");
  const legend = [
    [icon("icon-none"), T("ui.bannerWar.8"), T("ui.bannerWar.62")],
    [icon("icon-sol") + icon("icon-umb"), `${T("ui.bannerWar.32", { of: WAR.look.of.solgard })} / ${T("ui.bannerWar.32", { of: WAR.look.of.umbrath })}`, T("ui.bannerWar.63")],
    [icon("icon-none-heart"), T("ui.bannerWar.5", { min: S.heartOpenMin }), T("ui.bannerWar.64", { heart: S.heartOpenMin })],
    ["", `${T("ui.bannerWar.30", { faction: FACTIONS.umbrath.name, pct: 45 })} · ${T("ui.bannerWar.6")}`, T("ui.bannerWar.65")],
  ].map(([ic, name, what]) => `<div class="war-legend-row"><span class="war-legend-ics">${ic}</span><span><b>${esc(name)}</b> — ${esc(what)}</span></div>`).join("");
  const html = `<section class="panel dialog lg war-rules" role="dialog" aria-modal="true" aria-labelledby="war-rules-title">
    <div class="dialog-head"><h2 class="dialog-title" id="war-rules-title">${T("ui.bannerWar.40")}</h2><button class="x" data-x aria-label="${T("ui.bannerWar.27")}">×</button></div>
    <div class="dialog-body">
      <p class="war-now" data-now></p>
      ${sec(T("ui.bannerWar.45"), T("ui.bannerWar.46", { daily: list(S.daily), weekend: list(S.weekend), dur: S.durationMin, fronts: S.rotation.map((id) => warFront(id)?.name ?? id).join(" → "), ann: list(S.announceMin), tp: S.teleportMin, cd: S.teleportCdSec }))}
      ${sec(T("ui.bannerWar.47"),
        T("ui.bannerWar.48", { lvl: WAR.minLevel, hang: C.hangMs / 1000, solo: raiseSec("side", 1), edge: C.maxEdge, fast: raiseSec("side", C.maxEdge), lower: C.lowerMul, seal: C.sealMs / 1000 }),
        T("ui.bannerWar.49", { heart: S.heartOpenMin, hmin: C.heartMin, hslow: raiseSec("heart", 1), hfast: raiseSec("heart", C.maxEdge) }))}
      ${sec(T("ui.bannerWar.50"), T("ui.bannerWar.51", { every: SC.everyMs / 1000, side: SC.side, heart: SC.heart, rout: SC.routMs / 60000 }))}
      <section class="war-rule"><h3>${esc(T("ui.bannerWar.52"))}</h3><p>${esc(T("ui.bannerWar.53"))}</p><ul>${fronts}</ul></section>
      ${sec(T("ui.bannerWar.55"), T("ui.bannerWar.56", { per: R.perBattle, win: R.win, first: R.firstWin, draw: R.draw, lose: R.lose, min: R.minContrib, cap: R.weekCap, c1: R.chest[0].at, c2: R.chest[1].at, c3: R.chest[2].at }))}
      ${sec(T("ui.bannerWar.57"), T("ui.bannerWar.58", { time: SG.schedule.time, dur: SG.schedule.durationMin, breach: SG.schedule.breachMin, days: SG.reward.days, pct: pct(SG.reward.xpGold) }))}
      ${sec(T("ui.bannerWar.59"), T("ui.bannerWar.60"))}
      <section class="war-rule"><h3>${esc(T("ui.bannerWar.61"))}</h3>${legend}</section>
    </div>
    <div class="dialog-foot"><button class="btn primary" data-x>${T("ui.bannerWar.27")}</button></div></section>`;
  let timer = 0;
  const m = openModal(html, { onClose: () => { clearInterval(timer); rules = null; } });
  rules = m;
  m.dialog.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-x]")) m.close(); });
  const nowEl = m.dialog.querySelector<HTMLElement>("[data-now]")!;
  const tick = () => {
    const st = warView.state, now = warNow(), fr = warFront(st?.front ?? "")?.name ?? "";
    let text: string;
    if (st?.ph === "battle") text = T("ui.bannerWar.42", { front: fr, t: mmss(st.t1 - now) });
    else if (st?.ph === "prep") text = T("ui.bannerWar.43", { front: fr, t: mmss(st.t0 - now) });
    else text = T("ui.bannerWar.44", { front: fr, when: new Date(nextWarStart(now)).toLocaleString("ru-RU", { weekday: "long", hour: "2-digit", minute: "2-digit" }) });
    if (nowEl.textContent !== text) nowEl.textContent = text;
  };
  tick();
  timer = window.setInterval(tick, 500);
}

/** Подсказка бафа земли (рамка героя): до когда — фронт и время следующей его битвы (срок присылает сервер). */
export function warBuffUntil(bonus: string, leftMs: number): string {
  const when = new Date(Date.now() + leftMs).toLocaleString("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  if (bonus === "siege") return T("ui.bannerWar.71", { when });
  const fr = WAR_FRONTS.find((f) => f.side === bonus || f.heart === bonus);
  return T("ui.bannerWar.70", { front: fr?.name ?? "", when });
}

// ---------- «что делать сейчас» ----------
/** Где герой (HUD каждый кадр): строка подсказки, стрелка к знамени, объявление о не воюющем фронте. */
export const warHero = { x: 0, y: 0, mount: "", at: 0 };
export interface WarHint {
  text: string;
  tone: "go" | "act" | "warn" | "ok";
  /** Куда идти (ближнее основание фронта битвы), в каком круге герой, круг не воюющего фронта. */
  target: WarBaseDef | null;
  inside: WarBaseDef | null;
  inactive: WarBaseDef | null;
}
const dist = (d: WarBaseDef) => Math.hypot(d.x - warHero.x, d.y - warHero.y);
/**
 * Одна строка «что делать сейчас» для полосы, таблички над постаментом и стрелки: уровень, сбор, куда идти, в круге — маунт, спор,
 * перевес, вывешивание, подъём, спуск, печать, Сердце. Те же слова, что в правилах и на карте.
 */
export function warHint(): WarHint | null {
  const s = warView.state, me = NET.self?.faction as WarFaction | undefined;
  if (!s || !me || NET.kind !== "world" || !warHero.at) return null;
  const now = warNow(), none = { target: null, inside: null, inactive: null };
  if ((NET.self?.level ?? 0) < WAR.minLevel) return s.ph === "idle" ? null : { text: T("ui.bannerWar.92", { lvl: WAR.minLevel }), tone: "warn", ...none };
  if (s.ph === "prep") return { text: T("ui.bannerWar.93", { t: mmss(s.t0 - now) }), tone: "go", ...none };
  if (s.ph !== "battle") return null;
  const front = warFront(s.front)!, foe: WarFaction = me === "solgard" ? "umbrath" : "solgard";
  const inside = front.bases.find((d) => dist(d) <= WAR_RADIUS) ?? null;
  const inactive = inside ? null : WAR_BASES.find((d) => d.front !== s.front && dist(d) <= WAR_RADIUS) ?? null;
  // цель: Сердце, если оно открыто и у нас есть боковая; иначе ближнее боковое, что не наше (или любое ближнее)
  const ownSide = front.bases.some((d) => d.kind === "side" && warView.byId.get(d.id)?.o === me);
  const heart = front.bases.find((d) => d.kind === "heart")!;
  const sides = front.bases.filter((d) => d.kind === "side").sort((a, b) => dist(a) - dist(b));
  const target = s.heart && ownSide ? heart : sides.find((d) => warView.byId.get(d.id)?.o !== me) ?? sides[0];
  if (inactive) return { text: T("ui.bannerWar.91", { front: front.name }), tone: "warn", target, inside: null, inactive };
  if (!inside) {
    const far = dist(target) > 40 * TILE;
    return { text: far ? T("ui.bannerWar.80", { front: front.name }) : T("ui.bannerWar.81", { base: target.name }), tone: "go", target, inside: null, inactive: null };
  }
  const b = warView.byId.get(inside.id), r = { target, inside, inactive: null };
  if (!b) return null;
  const own = b.n[me === "solgard" ? 0 : 1], en = b.n[me === "solgard" ? 1 : 0], p = (v: number) => Math.round(v * 100);
  if (warHero.mount) return { text: T("ui.bannerWar.82"), tone: "warn", ...r };
  if (b.lock) return { text: T("ui.bannerWar.83", { t: mmss(s.t0 + WAR.schedule.heartOpenMin * 60000 - now) }), tone: "warn", ...r };
  if (inside.kind === "heart" && !ownSide && b.b !== me) return { text: T("ui.bannerWar.84"), tone: "warn", ...r };
  if (b.s > 0 && b.o === me) return { text: T("ui.bannerWar.103", { t: mmss(b.s) }), tone: "ok", ...r };
  if (b.c && own === en) return { text: T("ui.bannerWar.86", { own, foe: en }), tone: "warn", ...r }; // спор — поровну; неравно — ниже: перевес или «нужен перевес»
  if (b.hf === me) return { text: T("ui.bannerWar.85", { pct: p(b.hp) }), tone: "act", ...r };
  if (b.b === me && b.o !== me) return own > en ? { text: T("ui.bannerWar.87", { pct: p(b.h) }), tone: "act", ...r } : { text: T("ui.bannerWar.90", { own, foe: en }), tone: "warn", ...r };
  if (b.o === me) return b.h < 1 ? { text: T("ui.bannerWar.102", { pct: p(b.h) }), tone: own > en ? "act" : "warn", ...r } : { text: T("ui.bannerWar.88"), tone: "ok", ...r };
  if (b.b === foe) return own > en ? { text: T("ui.bannerWar.89", { pct: p(b.h) }), tone: "act", ...r } : { text: T("ui.bannerWar.90", { own, foe: en }), tone: "warn", ...r };
  return own > en ? { text: T("ui.bannerWar.85", { pct: p(b.hp) }), tone: "act", ...r } : { text: T("ui.bannerWar.90", { own, foe: en }), tone: "warn", ...r };
}
/** Табличка под постаментом основания не воюющего фронта: где битва сейчас или когда она будет здесь. */
export function inactivePlate(d: WarBaseDef): string {
  const s = warView.state;
  if (!s) return "";
  if (s.ph === "battle" && s.front !== d.front) return T("ui.bannerWar.94", { front: warFront(s.front)?.name ?? "" });
  if (s.ph === "battle") return "";
  // вне битвы: когда этот фронт воюет следующим (по кругу фронтов от нынешнего «следующего»)
  const rot = WAR.schedule.rotation, L = rot.length;
  let t = s.ph === "prep" ? s.t0 - 1 : warNow(), i = Math.max(0, rot.indexOf(s.front));
  for (let k = 0; k < L * 3; k++, i++) {
    const st = s.ph === "prep" && k === 0 ? s.t0 : nextWarStart(t);
    if (rot[i % L] === d.front) return T("ui.bannerWar.95", { when: new Date(st).toLocaleString("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit" }) });
    t = st;
  }
  return "";
}
/** Основание на фронте идущей битвы. */
export const warActive = (d: WarBaseDef) => warView.state?.ph === "battle" && warView.state.front === d.front;
