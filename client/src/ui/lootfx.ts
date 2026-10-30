/**
 * Превью добычи (макет tools/out/loot-preview): ряд содержимого над мешком (вариант B), тост-карточка «получен предмет» (A) с баннером
 * для легендарки (C), торжественный баннер победителя для мирового босса и рейда (B). Стили — styles/lootfx.css, цвета — tokens.css.
 */
import { BASE_ITEMS, ITEM_STAT_NAMES, RARITY_COLORS, RARITY_NAMES, effStats, iconFor, itemName, itemTypeName, type Item, type ItemStatKey } from "../../../shared/items";
import type { SelfState } from "../../../shared/protocol";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
const CMP_KEYS: ItemStatKey[] = ["dmgMax", "armor", "str", "agi", "int", "vit", "hp", "crit"];
const CMP_NAME: Partial<Record<ItemStatKey, string>> = { dmgMax: "атаки", armor: "брони" };

/** «▲ +6 атаки · ▼ −1 брони» относительно надетой вещи того же слота ("" — нет надетой или нет разницы). */
export function compareHtml(it: Item, s: SelfState | undefined): string {
  const slot = BASE_ITEMS[it.base]?.slot;
  const cur = s && slot && slot !== "consumable" ? s.equip[slot] : undefined;
  if (!cur || cur.uid === it.uid) return "";
  const a = effStats(it), b = effStats(cur);
  return CMP_KEYS.map((k) => [k, (a[k] || 0) - (b[k] || 0)] as const).filter(([, v]) => v !== 0).slice(0, 3)
    .map(([k, v]) => `<span class="${v > 0 ? "up" : "dn"}">${v > 0 ? "▲ +" : "▼ −"}${Math.abs(v)} ${CMP_NAME[k] ?? ITEM_STAT_NAMES[k].toLowerCase()}</span>`).join(" · ");
}

/** Карточка предмета: иконка в рамке цвета редкости, имя, тип, сравнение. */
export function lootCard(it: Item, s: SelfState | undefined, extra = "", tag = ""): string {
  const sub = BASE_ITEMS[it.base]?.slot === "consumable" ? `${RARITY_NAMES[it.rarity]}${it.qty && it.qty > 1 ? ` ×${it.qty}` : ""}` : `${esc(itemTypeName(it))} · ${RARITY_NAMES[it.rarity]}`;
  return `<div class="lc ${extra}" style="--rc:${RARITY_COLORS[it.rarity]}">${tag ? `<span class="lc-tag">${tag}</span>` : ""}<div class="lc-ic"><img src="${icon(iconFor(it))}" alt=""></div><div class="lc-tx"><div class="lc-nm">${esc(itemName(it))}</div><div class="lc-sl">${sub}</div><div class="lc-cmp">${compareHtml(it, s)}</div></div></div>`;
}

/** Тост «получен предмет»: карточка справа, у легендарки ещё баннер по центру. */
export class LootToasts {
  private stack = document.createElement("div");
  constructor(private root: HTMLElement, private self: () => SelfState | undefined) {
    this.stack.className = "lt-stack passthru";
    root.append(this.stack);
  }
  push(it: Item) {
    const c = document.createElement("div");
    c.innerHTML = lootCard(it, this.self(), "lt-in shine", it.rarity === 3 ? "НОВОЕ" : "");
    const d = c.firstElementChild as HTMLElement;
    this.stack.append(d);
    while (this.stack.children.length > 3) this.stack.firstElementChild!.remove();
    window.setTimeout(() => d.remove(), 4200);
    if (it.rarity === 3) banner(this.root, { title: "ЛЕГЕНДАРНЫЙ ПРЕДМЕТ", name: itemName(it), ms: 4400 });
  }
}

/** Торжественный баннер: лучи, заголовок, линия, имя, подпись; card — карточка под ним. Сам исчезает. */
export function banner(root: HTMLElement, o: { title: string; name: string; sub?: string; card?: string; ms?: number }) {
  const b = document.createElement("div");
  b.className = "lb-wrap passthru";
  b.innerHTML = `<div class="lb-rays"></div><div class="lb"><div class="lb-t">${esc(o.title)}</div><div class="lb-l"></div><div class="lb-n">${esc(o.name)}</div>${o.sub ? `<div class="lb-s">${o.sub}</div>` : ""}</div>${o.card ? `<div class="lb-card">${o.card}</div>` : ""}`;
  root.append(b);
  window.setTimeout(() => { b.classList.add("out"); window.setTimeout(() => b.remove(), 500); }, o.ms ?? 6500);
}

export interface RowHost { self(): SelfState | undefined; take(bagId: string): void }
/** Ряд всего содержимого над мешком: иконки в рамках цвета редкости, у стопок число, при наведении на иконку — карточка. */
export class LootRow {
  private box = document.createElement("div");
  private key = "";
  private id: string | null = null;
  private hideT = 0;
  private over = false;
  constructor(root: HTMLElement, private host: RowHost) {
    this.box.className = "lr";
    this.box.hidden = true;
    this.box.addEventListener("pointerenter", () => { this.over = true; clearTimeout(this.hideT); });
    this.box.addEventListener("pointerleave", () => { this.over = false; this.hover(null, null, 0); });
    this.box.addEventListener("click", () => { if (this.id) this.host.take(this.id); });
    root.append(this.box);
  }
  /** Каждый кадр: id мешка под курсором (или null) и экранная точка над его верхом. */
  hover(bagId: string | null, items: Item[] | null, sx: number, sy = 0) {
    if (bagId && items) {
      clearTimeout(this.hideT);
      this.id = bagId;
      const key = bagId + "|" + items.map((i) => i.uid + (i.qty ?? 1)).join(",");
      if (key !== this.key) {
        this.key = key;
        const s = this.host.self();
        this.box.innerHTML = `<div class="lr-row">${items.map((it, j) => `<div class="lr-it" style="--rc:${RARITY_COLORS[it.rarity]};--i:${j}"><div class="lr-b"><img src="${icon(iconFor(it))}" alt="">${it.qty && it.qty > 1 ? `<em>${it.qty}</em>` : ""}</div><div class="lr-card">${s ? lootCard(it, s) : ""}</div></div>`).join("")}</div><div class="lr-hint"><kbd class="kbd">G</kbd> / клик — взять всё</div>`;
        this.box.hidden = false;
        this.box.classList.remove("show");
        void this.box.offsetWidth;
        this.box.classList.add("show");
      }
      this.box.style.left = `${Math.round(sx)}px`;
      this.box.style.top = `${Math.round(sy)}px`;
      return;
    }
    if (this.over || this.hideT || this.box.hidden) return;
    this.hideT = window.setTimeout(() => { this.hideT = 0; if (this.over) return; this.box.hidden = true; this.key = ""; this.id = null; }, 260);
  }
}

/** Зонный босс, сундук (вариант A): столб света и лучший предмет вылетает из света вверх и оседает (после тряски спрайта в lootView). */
export function chestReveal(root: HTMLElement, sx: number, sy: number, it: Item) {
  const d = document.createElement("div");
  d.className = "bc passthru";
  d.style.cssText = `left:${Math.round(sx)}px;top:${Math.round(sy)}px;--rc:${RARITY_COLORS[it.rarity]}`;
  d.innerHTML = `<div class="bc-beam"></div><div class="bc-out"><img src="${icon(iconFor(it))}" alt=""></div>`;
  root.append(d);
  window.setTimeout(() => d.remove(), 3200);
}
