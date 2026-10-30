/** Кузнецы (Гром в Эмберхолле и кузнецы столиц): покупка материалов и улучшение предметов +1…+10. Всё проверяется на сервере. */
import { MERCHANT_RANGE } from "../../../shared/constants";
import { serviceRefusal } from "../../../shared/npcs";
import { BASE_ITEMS, itemName, makeItem, Rarity, SLOTS, type Item, type Slot } from "../../../shared/items";
import { failLevel, MATERIALS, MAX_PLUS, SMITHS, stepFor } from "../../../shared/upgrade";
import { addItem } from "./inventory";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";

const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });
/** Рядом ли кузнец: Эмберхолл или любая из столиц (решение 2 задачи 132). */
const smithNear = (w: World, p: Player) => SMITHS.some((s) => w.dist(p, s) <= MERCHANT_RANGE);
/** Кузнец рядом, но чужой фракции: текст отказа. */
const smithRefusal = (p: Player) => serviceRefusal("smith", p.x, p.y, p.faction, MERCHANT_RANGE);
const count = (p: Player, base: string) => p.save.inventory.reduce((n, it) => n + (it && it.base === base ? it.qty ?? 1 : 0), 0);
function take(p: Player, base: string, n: number) {
  const inv = p.save.inventory;
  for (let i = 0; i < inv.length && n > 0; i++) {
    const it = inv[i];
    if (!it || it.base !== base) continue;
    const t = Math.min(n, it.qty ?? 1);
    n -= t;
    it.qty = (it.qty ?? 1) - t;
    if (it.qty <= 0) inv[i] = null;
  }
}

export function buyMaterial(w: World, p: Player, id: unknown, qtyRaw: unknown) {
  const m = typeof id === "string" && Object.hasOwn(MATERIALS, id) ? MATERIALS[id] : undefined;
  if (!m) return;
  if (!smithNear(w, p)) return err(p, T("srv.smith.153"));
  const no = smithRefusal(p);
  if (no) return err(p, no);
  const qty = Number.isInteger(qtyRaw) ? Math.max(1, Math.min(99, qtyRaw as number)) : 1;
  const price = m.price * qty;
  if (p.save.gold < price) return err(p, T("srv.bags.58"));
  const backup = JSON.stringify(p.save.inventory);
  if (!addItem(p, { ...makeItem(m.id, 1, Rarity.Common), qty })) {
    p.save.inventory = JSON.parse(backup);
    return err(p, T("srv.biomes.76"));
  }
  p.save.gold -= price;
  p.selfDirty = true;
}

/** Улучшить предмет из сумки (index) или надетый (slot). locked — проверка окна обмена. */
export function upgradeItem(w: World, p: Player, index: unknown, slot: unknown, locked: (i: unknown) => boolean) {
  if (p.dead) return;
  if (p.team !== 0) return err(p, T("srv.smith.154"));
  if (!smithNear(w, p)) return err(p, T("srv.smith.153"));
  const no = smithRefusal(p);
  if (no) return err(p, no);
  let it: Item | null | undefined;
  if (slot !== undefined && slot !== null) {
    if (typeof slot !== "string" || !SLOTS.includes(slot as Slot)) return;
    it = p.save.equip[slot as Slot];
  } else {
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= p.save.inventory.length) return;
    if (locked(index)) return err(p, T("srv.bank.65"));
    it = p.save.inventory[index as number];
  }
  if (!it || BASE_ITEMS[it.base]?.slot === "consumable") return err(p, T("srv.smith.155"));
  const plus = it.plus || 0;
  const step = stepFor(plus);
  if (!step) return err(p, T("srv.smith.156"));
  if (p.save.gold < step.gold) return err(p, T("srv.bags.58"));
  if (count(p, "ash_ore") < step.ore || count(p, "star_dust") < step.dust) return err(p, T("srv.smith.157"));
  p.save.gold -= step.gold;
  take(p, "ash_ore", step.ore);
  take(p, "star_dust", step.dust);
  const ok = Math.random() * 100 < step.chance;
  it.plus = ok ? plus + 1 : failLevel(plus);
  if (!it.plus) delete it.plus;
  if (slot !== undefined && slot !== null) {
    const ratio = p.unit.hp / Math.max(1, p.unit.maxHp);
    p.recalc();
    p.unit.hp = Math.max(1, Math.round(p.unit.maxHp * ratio));
  }
  p.selfDirty = true;
  p.send("toast", { text: ok ? T("srv.smith.819", { it: itemName(it) }) : T("srv.smith.820", { name: it.name, plus: it.plus || 0 }), kind: ok ? "loot" : "error" });
}
