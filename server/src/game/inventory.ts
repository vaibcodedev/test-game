/** Инвентарь, экипировка, зелья, торговец, подбор добычи. Каждая операция проверяется на сервере. */
import { COOKS, FOOD, foodOf, type Dish } from "../../../shared/food";
import { MERCHANT_RANGE, PICKUP_RANGE } from "../../../shared/constants";
import { serviceRefusal } from "../../../shared/npcs";
import { BASE_ITEMS, ONEHAND, canEquip, isTwoHanded, iconFor, itemName, itemValue, makeItem, Rarity, SLOTS, type Item, type Slot } from "../../../shared/items";
import { usableBase } from "../../../shared/hotbar";
import { MATERIALS } from "../../../shared/upgrade";
import { RESOURCES } from "../../../shared/biomes";
import { isQuestItem, QUEST_ITEM_MSG } from "../../../shared/quests";
import type { Player } from "./Player";
import { isPart, sealMount } from "../../../shared/mounts";
import { learnSeal } from "./stable";
import { recordSale, sellPrice, sendPrices } from "./market";
import type { World } from "./World";

const err = (p: Player, text: string, code?: "cd" | "target") => p.send("toast", { text, kind: "error", ...(code ? { code } : {}) });
const validIndex = (p: Player, i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < p.save.inventory.length;

/** Положить предмет в сумку (зелья складываются в стопки). false — места нет. */
export function addItem(p: Player, it: Item): boolean {
  const inv = p.save.inventory;
  const base = BASE_ITEMS[it.base];
  if (base.stack) {
    let left = it.qty ?? 1;
    for (const s of inv) {
      if (!s || s.base !== it.base) continue;
      const room = base.stack - (s.qty ?? 1);
      const put = Math.min(room, left);
      s.qty = (s.qty ?? 1) + put;
      left -= put;
      if (!left) break;
    }
    while (left > 0) {
      const i = inv.indexOf(null);
      if (i < 0) return false;
      const put = Math.min(base.stack, left);
      inv[i] = { ...it, uid: it.uid + "-" + i, qty: put };
      left -= put;
    }
    p.selfDirty = true;
    return true;
  }
  const i = inv.indexOf(null);
  if (i < 0) return false;
  inv[i] = it;
  p.selfDirty = true;
  return true;
}

/** Снаряжение в бою не меняется (как в MMO): надеть, снять и сменить вещь — только вне боя (Player.inCombat); выдача из админки — мимо (force). */
const IN_COMBAT = "В бою снаряжение не меняется";

export function equip(w: World, p: Player, index: unknown, force = false) {
  if (!validIndex(p, index)) return;
  const it = p.save.inventory[index];
  if (!it) return;
  if (!force && p.inCombat(w.time)) return err(p, IN_COMBAT);
  const why = canEquip(it, p.cls, p.level);
  if (why) return err(p, why);
  let slot = BASE_ITEMS[it.base].slot as Slot;
  // Рыцарь смерти: второй одноручный клинок идёт во вторую руку
  if (slot === "weapon" && p.cls === "deathknight" && ONEHAND.includes(it.base) && p.save.equip.weapon && ONEHAND.includes(p.save.equip.weapon.base) && !p.save.equip.offhand) slot = "offhand";
  // двуручное оружие занимает обе руки: вторая рука снимается в сумку; во вторую руку при двуручном — нельзя
  if (slot === "offhand" && isTwoHanded(p.save.equip.weapon?.base)) return err(p, "Двуручное оружие занимает обе руки");
  if (slot === "weapon" && isTwoHanded(it.base) && p.save.equip.offhand) {
    const free = p.save.inventory.findIndex((x, k) => !x && k !== index);
    if (free < 0 && p.save.equip.weapon) return err(p, "Сумка полна: некуда снять вторую руку");
    const off = p.save.equip.offhand;
    p.save.equip.offhand = null;
    if (free >= 0) p.save.inventory[free] = off;
    else { p.save.equip.weapon = it; p.save.inventory[index] = off; p.recalc(); return; }
  }
  const prev = p.save.equip[slot];
  p.save.equip[slot] = it;
  p.save.inventory[index] = prev;
  const ratio = p.unit.hp / Math.max(1, p.unit.maxHp);
  p.recalc();
  p.unit.hp = Math.max(1, Math.round(p.unit.maxHp * ratio));
}

export function unequip(w: World, p: Player, slot: unknown) {
  if (typeof slot !== "string" || !SLOTS.includes(slot as Slot)) return;
  const it = p.save.equip[slot as Slot];
  if (!it) return;
  if (p.inCombat(w.time)) return err(p, IN_COMBAT);
  const i = p.save.inventory.indexOf(null);
  if (i < 0) return err(p, "Сумка полна");
  p.save.inventory[i] = it;
  p.save.equip[slot as Slot] = null;
  p.recalc();
}

export function useItem(w: World, p: Player, index: unknown) {
  if (!validIndex(p, index) || p.dead) return;
  const it = p.save.inventory[index];
  if (!it) return;
  const base = BASE_ITEMS[it.base];
  if (base.slot !== "consumable") return equip(w, p, index);
  if (sealMount(it.base)) return learnSeal(p, index);
  if (MATERIALS[it.base] || RESOURCES[it.base] || isPart(it.base)) return;
  const dish = foodOf(it.base);
  if (dish) return eat(p, index, dish);
  const now = w.time;
  if (now < p.potionAt) return err(p, `Перезарядка: ${(Math.max(0, p.potionAt - now) / 1000).toFixed(1).replace(".", ",")} с`, "cd");
  const u = p.unit;
  if (it.base === "hp_potion") {
    if (u.hp >= u.maxHp) return err(p, "Здоровье уже полное");
    w.heal(p, Math.round(u.maxHp * 0.45));
  } else {
    if (u.mp >= u.maxMp) return err(p, "Мана уже полная");
    u.mp = Math.min(u.maxMp, u.mp + Math.round(u.maxMp * 0.5));
  }
  p.potionAt = now + 1500;
  p.send("cd", { id: "potion", ms: 1500 });
  w.emit({ t: "aoe", k: it.base === "hp_potion" ? "nature" : "frost", x: u.x, y: u.y, r: 24 });
  it.qty = (it.qty ?? 1) - 1;
  if (it.qty <= 0) p.save.inventory[index] = null;
  p.selfDirty = true;
}

/** use:base — первая стопка предмета в сумке (зелье или еда); индексы клиента не нужны, гонки с перестановкой нет. */
export function useBase(w: World, p: Player, base: unknown, locked: (i: number) => boolean = () => false) {
  if (!usableBase(base) || p.dead) return;
  const i = p.save.inventory.findIndex((it, j) => !!it && it.base === base && !locked(j));
  if (i < 0) return err(p, base === "hp_potion" ? "Нет зелий здоровья — у торговки" : base === "mp_potion" ? "Нет зелий маны — у торговки" : "Нет такого предмета");
  useItem(w, p, i);
}

/** Съесть блюдо: мгновенное лечение и бафф; новый бафф заменяет старый. На арене нельзя. */
function eat(p: Player, index: number, dish: Dish) {
  if (p.team !== 0) return err(p, "На арене есть нельзя");
  if (p.level < dish.req) return err(p, `Нужен ${dish.req} уровень`);
  const it = p.save.inventory[index]!;
  const u = p.unit;
  p.save.food = { id: dish.id, until: Date.now() + dish.minutes * 60000 };
  p.recalc();
  u.hp = Math.min(u.maxHp, u.hp + Math.round((u.maxHp * dish.hpPct) / 100));
  u.mp = Math.min(u.maxMp, u.mp + Math.round((u.maxMp * dish.mpPct) / 100));
  it.qty = (it.qty ?? 1) - 1;
  if (it.qty <= 0) p.save.inventory[index] = null;
  p.selfDirty = true;
  p.send("toast", { text: `${dish.name}: бафф на ${dish.minutes} мин.`, kind: "info" });
}

export function buyFood(w: World, p: Player, id: unknown, qtyRaw: unknown) {
  const dish = typeof id === "string" ? FOOD[id] : undefined;
  if (!dish) return;
  if (!COOKS.some((c) => w.dist(p, c) <= MERCHANT_RANGE)) return err(p, "Повар далеко");
  const no = serviceRefusal("cook", p.x, p.y, p.faction, MERCHANT_RANGE);
  if (no) return err(p, no);
  const qty = Number.isInteger(qtyRaw) ? Math.max(1, Math.min(20, qtyRaw as number)) : 1;
  const price = dish.price * qty;
  if (p.save.gold < price) return err(p, "Не хватает золота");
  const backup = JSON.stringify(p.save.inventory);
  if (!addItem(p, { ...makeItem(`food_${dish.id}`, 1, Rarity.Common), qty })) {
    p.save.inventory = JSON.parse(backup);
    return err(p, "Сумка полна");
  }
  p.save.gold -= price;
  p.selfDirty = true;
}

export function nearMerchant(w: World, p: Player) {
  return w.map.merchants.some((m) => w.dist(p, m) <= MERCHANT_RANGE);
}
/** Торговец рядом, но чужой фракции (все ближние): текст отказа, иначе null. */
export const merchantRefusal = (p: Player) => serviceRefusal("shop", p.x, p.y, p.faction, MERCHANT_RANGE);

export function sell(w: World, p: Player, index: unknown) {
  if (!validIndex(p, index)) return;
  const it = p.save.inventory[index];
  if (!it) return;
  if (!nearMerchant(w, p)) return err(p, "Торговец далеко");
  const no = merchantRefusal(p);
  if (no) return err(p, no);
  if (isQuestItem(it.base)) return err(p, QUEST_ITEM_MSG);
  const qty = it.qty ?? 1;
  const gold = sellPrice(it) * qty;
  recordSale(it, qty);
  p.save.inventory[index] = null;
  p.save.gold += gold;
  p.selfDirty = true;
  p.send("toast", { text: `Продано: ${itemName(it)}${qty > 1 ? ` ×${qty}` : ""} (+${gold} з)`, kind: "loot" });
  sendPrices(p);
}

export function buy(w: World, p: Player, baseId: unknown, qtyRaw: unknown) {
  if (typeof baseId !== "string" || (baseId !== "hp_potion" && baseId !== "mp_potion")) return;
  if (!nearMerchant(w, p)) return err(p, "Торговец далеко");
  const no = merchantRefusal(p);
  if (no) return err(p, no);
  const qty = Number.isInteger(qtyRaw) ? Math.max(1, Math.min(20, qtyRaw as number)) : 1;
  const price = (BASE_ITEMS[baseId].price ?? 15) * qty;
  if (p.save.gold < price) return err(p, "Не хватает золота");
  const it = { ...makeItem(baseId, 1, Rarity.Common), qty };
  const backup = JSON.stringify(p.save.inventory);
  if (!addItem(p, it)) {
    p.save.inventory = JSON.parse(backup);
    return err(p, "Сумка полна");
  }
  p.save.gold -= price;
  p.selfDirty = true;
}

export function swap(p: Player, a: unknown, b: unknown) {
  if (!validIndex(p, a) || !validIndex(p, b) || a === b) return;
  const inv = p.save.inventory;
  const A = inv[a], B = inv[b];
  // одинаковые зелья складываем
  if (A && B && A.base === B.base && BASE_ITEMS[A.base].stack) {
    const max = BASE_ITEMS[A.base].stack!;
    const total = (A.qty ?? 1) + (B.qty ?? 1);
    B.qty = Math.min(max, total);
    inv[a] = total > max ? { ...A, qty: total - max } : null;
  } else {
    inv[a] = B;
    inv[b] = A;
  }
  p.selfDirty = true;
}

export function pickup(w: World, p: Player, bagId: unknown) {
  if (typeof bagId !== "string" || p.dead) return;
  const bag = p.bags.get(bagId);
  if (!bag) return;
  if (w.dist(p, bag) > PICKUP_RANGE + 8) return err(p, "Подойдите ближе");
  const left = [];
  for (const it of bag.items) {
    if (addItem(p, it)) p.send("toast", { text: `Получено: ${itemName(it)}${it.qty && it.qty > 1 ? ` ×${it.qty}` : ""}`, kind: "loot", icon: iconFor(it), classes: BASE_ITEMS[it.base].classes });
    else left.push(it);
  }
  if (left.length) {
    bag.items = left;
    err(p, "Сумка полна — часть добычи осталась");
  } else p.bags.delete(bagId);
  p.bagsDirty = true;
}
