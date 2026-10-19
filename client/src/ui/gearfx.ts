/** Общие куски окон «Герой» и «Осмотр»: 7 строк снаряжения, итог заточки и легенда эффектов (docs/gear-visuals.md, раздел 3). */
import { fxText, GEAR_FX } from "../../../shared/gearFx";
import { effStats, iconFor, itemName, RARITY_COLORS, RARITY_NAMES, SLOT_NAMES, type Item, type ItemStatKey, type Slot } from "../../../shared/items";
import { hiddenParticles } from "../game/gearHooks";
import { plusBadge } from "./smith";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;

export interface GearRow {
  slot: Slot;
  item: Item | null;
}
export interface GearRowsHost {
  /** Подсказка предмета (с рамкой, сравнением и т. д.). */
  tip(elm: HTMLElement, it: Item): void;
  /** Курсор вошёл в строку (slot) или вышел (null). */
  hover?(slot: Slot | null): void;
}

/** 7 строк: «иконка со значком · Слот: Имя +N (редкость) · эффект на герое». sid — чей это герой (для пометок «частицы скрыты»). */
export function gearRows(rows: GearRow[], sid: string, host: GearRowsHost): HTMLElement {
  const box = document.createElement("div");
  box.className = "gear-rows";
  const hidden = hiddenParticles(sid);
  for (const { slot, item } of rows) {
    const row = document.createElement("div");
    row.className = "gear-row";
    row.dataset.slot = slot;
    if (!item) {
      row.classList.add("empty");
      row.innerHTML = `<div class="cell gr-cell"></div><div class="gr-text"><b>${SLOT_NAMES[slot]}:</b> <span class="muted">пусто</span></div>`;
    } else {
      const reason = hidden[slot];
      const fx = fxText(slot, item.plus || 0, item.legendary) + (reason ? ` · ${GEAR_FX.texts.hidden[reason]}` : "");
      row.innerHTML = `<div class="cell r${item.rarity} gr-cell"><img src="${icon(iconFor(item))}" alt="">${plusBadge(item)}</div>
        <div class="gr-text"><b>${SLOT_NAMES[slot]}:</b> <span style="color:${RARITY_COLORS[item.rarity]}">${esc(itemName(item))}</span> <span class="muted">(${RARITY_NAMES[item.rarity].toLowerCase()})</span>
        <div class="gr-fx${reason ? " hidden-fx" : ""}">${esc(fx)}</div></div>`;
      host.tip(row, item);
    }
    row.addEventListener("mouseenter", () => host.hover?.(slot));
    row.addEventListener("mouseleave", () => host.hover?.(null));
    box.append(row);
  }
  return box;
}

/** «От заточки: +X урона, +Y брони» по надетому. "" — заточки нет. */
export function enchantTotal(items: (Item | null)[]): string {
  let dmg = 0, armor = 0, other = 0, any = false;
  for (const it of items) {
    if (!it || !it.plus) continue;
    any = true;
    const a = it.stats, b = effStats(it);
    const d = (k: ItemStatKey) => (b[k] || 0) - (a[k] || 0);
    dmg += (d("dmgMin") + d("dmgMax")) / 2;
    armor += d("armor");
    for (const k of ["str", "agi", "int", "vit"] as ItemStatKey[]) other += d(k);
  }
  if (!any) return "";
  const parts = [`+${Math.round(dmg)} урона`, `+${armor} брони`];
  if (other) parts.push(`+${other} к характеристикам`);
  return `От заточки: ${parts.join(", ")}`;
}

type Swatch = { type: string; color?: string; colors?: string[]; alpha?: number };
/** Мини-картинка строки легенды: рисуется CSS, цвета берутся из data/gear-fx.json. */
function swatchHtml(sw: Swatch): string {
  const c = esc(sw.color ?? "#fff"), a = sw.alpha ?? 1;
  const style = `--c:${c};--a:${a}`;
  switch (sw.type) {
    case "rim": return `<span class="sw sw-rim">${(sw.colors ?? []).map((x) => `<i style="--c:${esc(x)}"></i>`).join("")}</span>`;
    case "outline": return `<span class="sw sw-outline" style="${style}"><i></i></span>`;
    case "halo": return `<span class="sw sw-halo" style="${style}"><i></i></span>`;
    case "particles": return `<span class="sw sw-particles" style="${style}"><i></i><i></i><i></i></span>`;
    case "ring": return `<span class="sw sw-ring" style="${style}"><i></i></span>`;
    case "tint": return `<span class="sw sw-tint" style="${style}"><i></i></span>`;
    default: return `<span class="sw sw-glow" style="${style}"><i></i></span>`;
  }
}

/** Блок «Что значит свечение»: по строке на каждый эффект, который бывает на герое. */
export function legendBlock(): HTMLElement {
  const box = document.createElement("div");
  box.className = "gear-legend";
  box.innerHTML = `<h3 class="gear-h">Что значит свечение</h3>` + GEAR_FX.legend.map((l) =>
    `<div class="gl-row" data-id="${esc(l.id)}">${swatchHtml(l.swatch as Swatch)}<div><b>${esc(l.title)}</b><span class="muted">${esc(l.text)}</span></div></div>`).join("");
  return box;
}
