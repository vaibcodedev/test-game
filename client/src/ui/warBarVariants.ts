/**
 * Варианты полосы битвы «Знамён Предела» на выбор пользователя (макеты в живом клиенте; включаются localStorage "war:barv" = v1 | v2 | v3):
 *  V1 «Знамёна на древках» — три знамени (боковые и Сердце с короной) цветом владельца, подъём — заливкой вдоль древка; счёт крупно с гербами; таймер в картуше.
 *  V2 «Перетягивание» — горизонтальная лента в цветах сторон с золотыми разделителями у трёх оснований, на ленте — постаменты со знамёнами; счёт по краям; таймер на ленточке.
 *  V3 «Карта фронта» — схема фронта сверху: форты по краям, дорога, основания в цвете владельца с кольцом подъёма, точка героя; счёт и таймер сверху.
 * Строка подсказки «что делать сейчас» остаётся у всех. Выбранный вариант станет основным, остальные удалятся.
 */
import { FORTS } from "../../../shared/constants";
import { WAR, warFront, type WarStateMsg } from "../../../shared/bannerWar";

export type BarVariant = "v1" | "v2" | "v3";
export function barVariant(): BarVariant | null {
  try { const v = localStorage.getItem("war:barv"); return v === "v1" || v === "v2" || v === "v3" ? v : null; } catch { return null; }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fcls = (f: string) => (f === "solgard" ? "sol" : f === "umbrath" ? "umb" : "none");
const col = (f: string) => (f === "solgard" ? WAR.look.color.solgard : f === "umbrath" ? WAR.look.color.umbrath : WAR.look.color.neutral);
const emb = (f: "sol" | "umb") => `<img class="wv-emb" src="/assets/vfx/war-emb-${f}.png" alt="">`;


/**
 * Знамя-индикатор основания: древко с навершием (у Сердца — корона), полотнище цветом своего знамени ползёт по древку на высоту подъёма;
 * ничьё и пустое — серое внизу; взятое — цветом владельца наверху с гербом; спор — мерцает двумя цветами; закрытое Сердце — тусклое.
 */
function flagMini(kind: "side" | "heart", x: { o: string; b: string; hf: string; h: number; hp: number; c: boolean; lock: boolean } | undefined, size: "s" | "m" | "l" = "m"): string {
  const ban = x?.b || x?.hf || "", owner = x?.o ?? "", f = ban || owner;
  const h = x ? (x.b ? x.h : x.hf ? x.hp * 0.15 : owner ? 1 : 0) : 0;
  const emb = f === "solgard" || f === "umbrath" ? `<img src="/assets/vfx/war-emb-${fcls(f)}.png" alt="">` : "";
  return `<span class="wflag ${size} ${kind} f-${fcls(f)}${x?.c ? " contest" : ""}${x?.lock ? " lock" : ""}" style="--h:${h.toFixed(3)}"><i class="m"></i>${kind === "heart" ? '<i class="crown"></i>' : '<i class="fin"></i>'}<i class="p">${emb}</i></span>`;
}

/** Полная полоса в выбранном варианте: голова (время, кнопки) уже собрана снаружи — сюда идёт счёт и основания; tail — строка подсказки. */
export function variantBody(v: BarVariant, s: WarStateMsg, time: string, tools: string, tail: string, hero: { x: number; y: number }): string {
  const fr = warFront(s.front);
  const bases = (fr?.bases ?? []).map((d) => ({ d, b: s.bases.find((x) => x.id === d.id) }));
  const [a, b] = s.score, lead = a > b ? "sol" : b > a ? "umb" : "";
  if (v === "v1") {
    const flags = bases.map(({ d, b: x }) => {
      const owner = x?.o ?? "", ban = x?.b || x?.hf || "", h = x ? (x.b ? x.h : x.hp) : 0;
      return `<div class="wv1-flag ${d.kind}${x?.c ? " contest" : ""}${x?.lock ? " lock" : ""}" title="${esc(d.name)}">
        ${flagMini(d.kind, x, d.kind === "heart" ? "l" : "m")}<small>${Math.round((x?.b ? x.h : owner ? 1 : 0) * 100)}%</small></div>`;
    }).join("");
    return `<div class="wv1">
      <div class="wv1-top"><span class="wv-score sol${lead === "sol" ? " lead" : ""}">${emb("sol")}${a}</span><span class="wv1-cart"><b>${esc(time)}</b><small>${esc(fr?.name ?? "")}</small></span><span class="wv-score umb${lead === "umb" ? " lead" : ""}">${b}${emb("umb")}</span></div>
      <div class="wv1-flags">${flags}</div><div class="wv-foot">${tail || "<span></span>"}<div class="wv-tools">${tools}</div></div></div>`;
  }
  if (v === "v2") {
    const segs = bases.map(({ d, b: x }) => {
      const owner = x?.o ?? "", ban = x?.b || x?.hf || "", h = x ? (x.b ? x.h : x.hp) : 0;
      const fill = ban ? `<i class="${fcls(ban)}" style="width:${Math.round(h * 100)}%"></i>` : "";
      return `<div class="wv2-seg o-${fcls(owner)}${x?.c ? " contest" : ""}${x?.lock ? " lock" : ""}" title="${esc(d.name)}">${fill}${flagMini(d.kind, x, "s")}</div>`;
    }).join('<span class="wv2-div"></span>');
    return `<div class="wv2">
      <div class="wv2-ribbon"><span>${esc(fr?.name ?? "")}</span><b>${esc(time)}</b></div>
      <div class="wv2-row"><span class="wv-score sol${lead === "sol" ? " lead" : ""}">${emb("sol")}${a}</span><div class="wv2-track">${segs}</div><span class="wv-score umb${lead === "umb" ? " lead" : ""}">${b}${emb("umb")}</span></div>
      <div class="wv-foot">${tail || "<span></span>"}<div class="wv-tools">${tools}</div></div></div>`;
  }
  // v3: схема фронта (svg 260×64): x — от западного форта до восточного, y — по высоте фронта
  const W = 260, H = 64, x0 = FORTS.west.x, x1 = FORTS.east.x;
  const ys = bases.map(({ d }) => d.ty), yc = ys.reduce((p, q) => p + q, 0) / Math.max(1, ys.length);
  const X = (tx: number) => 14 + ((tx - x0) / (x1 - x0)) * (W - 28), Y = (ty: number) => H / 2 + (ty - yc) * 0.9;
  const road = `<path d="M${X(x0)} ${H / 2} ${bases.map(({ d }) => `L${X(d.tx).toFixed(1)} ${Y(d.ty).toFixed(1)}`).join(" ")} L${X(x1)} ${H / 2}" class="wv3-road"/>`;
  const forts = `<rect x="${X(x0) - 6}" y="${H / 2 - 6}" width="12" height="12" class="wv3-fort sol"/><rect x="${X(x1) - 6}" y="${H / 2 - 6}" width="12" height="12" class="wv3-fort umb"/>`;
  const nodes = bases.map(({ d, b: x }) => {
    const cx = X(d.tx), cy = Y(d.ty), r = d.kind === "heart" ? 10 : 8, owner = x?.o ?? "", ban = x?.b || x?.hf || "", h = x ? (x.b ? x.h : x.hp) : 0;
    const len = 2 * Math.PI * (r + 3);
    return `<g class="wv3-node${x?.c ? " contest" : ""}${x?.lock ? " lock" : ""}"><title>${esc(d.name)}</title>
      <circle cx="${cx}" cy="${cy}" r="${r + 3}" class="wv3-track"/>
      ${ban ? `<circle cx="${cx}" cy="${cy}" r="${r + 3}" class="wv3-prog" style="stroke:${col(ban)}" stroke-dasharray="${(len * h).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` : ""}
      <foreignObject x="${cx - 9}" y="${cy - 15}" width="18" height="26">${flagMini(d.kind, x, "s")}</foreignObject></g>`;
  }).join("");
  const hx = (hero.x / 32 - x0) / (x1 - x0), me = hx >= -0.05 && hx <= 1.05 ? `<circle cx="${X(hero.x / 32)}" cy="${Y(hero.y / 32)}" r="2.5" class="wv3-me"/>` : "";
  return `<div class="wv3">
    <div class="wv3-top"><span class="wv-score sol${lead === "sol" ? " lead" : ""}">${emb("sol")}${a}</span><span class="wv3-time"><small>${esc(fr?.name ?? "")}</small><b>${esc(time)}</b></span><span class="wv-score umb${lead === "umb" ? " lead" : ""}">${b}${emb("umb")}</span></div>
    <svg class="wv3-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${road}${forts}${nodes}${me}</svg>
    <div class="wv-foot">${tail || "<span></span>"}<div class="wv-tools">${tools}</div></div></div>`;
}
