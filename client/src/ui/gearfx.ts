/** Общие куски окон «Герой» и «Осмотр»: строки снаряжения, итог заточки и легенда эффектов (docs/art/gear.md, раздел 3). */
import { visualTier as enchantTier, GEAR_FX, legendText, tierText } from "../../../shared/gearFx";
import { effStats, iconFor, itemName, SLOT_NAMES, type Item, type ItemStatKey, type Slot } from "../../../shared/items";
import { hiddenParticles, type HiddenReason } from "../game/gearHooks";
import { plusBadge } from "./smith";
import { T } from "../../../shared/texts";

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
  /** Бледный силуэт пустой ячейки: имя иконки (shared/items.ts slotGhost → iconFor); нет — пустая ячейка. */
  ghost?(slot: Slot): string | undefined;
}

/** Эффект детали на герое одной строкой: «Заточка +7: … · Тема: …». Заточка бирюзовая с ступени 1 (+4), тема — цветом легендарки. */
function fxHtml(slot: Slot, item: Item, reason: HiddenReason | undefined): string {
  const plus = item.plus || 0, tier = enchantTier(plus);
  const parts: string[] = [];
  if (plus > 0) parts.push(`<span${tier >= 1 ? ' class="ench"' : ""}>${T("ui.gearfx.512", { plus: plus, tiertext: esc(tierText(slot, tier)) })}</span>`);
  const theme = legendText(slot, item.legendary);
  if (theme) parts.push(`<span class="theme">${T("ui.gearfx.513", { theme: esc(theme) })}</span>`);
  if (!parts.length) parts.push(esc(GEAR_FX.texts.noEffect));
  if (reason) parts.push(`<span class="hidden-fx">${esc(GEAR_FX.texts.hidden[reason])}</span>`);
  return parts.join(" · ");
}

/** Строки снаряжения (.list > .row): «ячейка 40px · имя цветом редкости · слот и эффект на герое». sid — чей это герой (для пометок «частицы скрыты»). */
export function gearRows(rows: GearRow[], sid: string, host: GearRowsHost): HTMLElement {
  const box = document.createElement("div");
  box.className = "list gear-rows";
  const hidden = hiddenParticles(sid);
  for (const { slot, item } of rows) {
    const row = document.createElement("div");
    row.className = "row gear-row";
    row.dataset.slot = slot;
    if (!item) {
      row.classList.add("empty");
      const g = host.ghost?.(slot);
      row.innerHTML = `<div class="cell md gr-cell">${g ? `<img class="ghost" src="${icon(g)}" alt="" onerror="this.remove()">` : ""}</div><div class="row-main"><span class="row-title c-dim">${SLOT_NAMES[slot]}</span><span class="row-sub gr-fx">${T("ui.gearfx.514")}</span></div>`;
    } else {
      row.innerHTML = `<div class="cell md r${item.rarity} gr-cell"><img src="${icon(iconFor(item))}" alt="">${plusBadge(item)}</div>
        <div class="row-main"><span class="row-title gr-name c-r${item.rarity}">${esc(itemName(item))}</span>
        <span class="row-sub gr-fx">${SLOT_NAMES[slot]} · ${fxHtml(slot, item, hidden[slot])}</span></div>`;
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
  const parts = [T("ui.gearfx.515", { dmg: Math.round(dmg) }), T("ui.gearfx.516", { armor: armor })];
  if (other) parts.push(T("ui.gearfx.517", { other: other }));
  return T("ui.gearfx.518", { parts: parts.join(", ") });
}

type Swatch = { type: string; color?: string; colors?: string[]; alpha?: number };
/** Мини-картинка строки легенды: рисуется CSS, цвета берутся из data/gear-fx.json. */
function swatchHtml(sw: Swatch): string {
  const c = esc(sw.color ?? "#fff"), a = sw.alpha ?? 1;
  const style = `--c:${c};--a:${a}`;
  // row-icon: строка .row с иконкой строит три колонки; размер и рамку задаёт .sw
  switch (sw.type) {
    case "rim": return `<span class="sw row-icon sw-rim">${(sw.colors ?? []).map((x) => `<i style="--c:${esc(x)}"></i>`).join("")}</span>`;
    case "outline": return `<span class="sw row-icon sw-outline" style="${style}"><i></i></span>`;
    case "halo": return `<span class="sw row-icon sw-halo" style="${style}"><i></i></span>`;
    case "particles": return `<span class="sw row-icon sw-particles" style="${style}"><i></i><i></i><i></i></span>`;
    case "ring": return `<span class="sw row-icon sw-ring" style="${style}"><i></i></span>`;
    case "tint": return `<span class="sw row-icon sw-tint" style="${style}"><i></i></span>`;
    default: return `<span class="sw row-icon sw-glow" style="${style}"><i></i></span>`;
  }
}

/** Строки легенды про снаряжение; остальное свечение (круг под ногами, окраска, свет ночью, факел) — отдельной группой. */
const ON_GEAR = new Set(["rarity", "tier1", "tier2", "tier3", "legend"]);

/**
 * Раздел «Эффекты снаряжения» (что значит свечение): сворачиваемый, по строке на каждый эффект, который бывает на герое.
 * Окно «Герой» пересоздаёт разметку при каждом обновлении, поэтому открыт ли раздел, хранит владелец: open и onToggle.
 */
export function legendBlock(open: boolean, onToggle: (open: boolean) => void): HTMLElement {
  const box = document.createElement("details");
  box.className = "sec disclosure gear-legend";
  box.open = open;
  const row = (l: (typeof GEAR_FX.legend)[number]) =>
    `<div class="row gl-row" data-id="${esc(l.id)}">${swatchHtml(l.swatch as Swatch)}<div class="row-main"><span class="row-title">${esc(l.title)}</span><span class="row-sub">${esc(l.text)}</span></div></div>`;
  const group = (title: string, ls: typeof GEAR_FX.legend) =>
    ls.length ? `<div class="sub-grp"><h4 class="sub-h">${title}</h4><div class="list">${ls.map(row).join("")}</div></div>` : "";
  box.innerHTML = `<summary><h3 class="sec-h">${T("ui.gearfx.519")}</h3><span class="meta">${T("ui.gearfx.520")}</span></summary>
    <div class="disclosure-body">${group("Снаряжение", GEAR_FX.legend.filter((l) => ON_GEAR.has(l.id)))}${group("Не от снаряжения", GEAR_FX.legend.filter((l) => !ON_GEAR.has(l.id)))}</div>`;
  box.addEventListener("toggle", () => onToggle(box.open));
  return box;
}
