/**
 * Конюшня (задача 142): «Печать скакуна» — маунт приходит предметом в сумку; изучение печати (use) кладёт маунт в коллекцию (привязан).
 * Конюший продаёт маунты торговца и боевых за репутацию и Знаки Полей, собирает маунты из деталей. Репутация и знаки — save.rep / save.marks.
 */
import { MERCHANT_RANGE } from "../../../shared/constants";
import { makeItem, Rarity, type Item } from "../../../shared/items";
import { canRide, countBase, craftBound, MOUNTS, MOUNT_EARN, PARTS, partBase, sealBase, sealBoundBySource, sealMount, stableOffer, type MountTier } from "../../../shared/mounts";
import { serviceRefusal } from "../../../shared/npcs";
import { STABLEMASTERS } from "../../../shared/stables";
import { addItem } from "./inventory";
import type { Player } from "./Player";
import type { World } from "./World";

const RAR: Record<MountTier, Rarity> = { common: Rarity.Common, uncommon: Rarity.Common, rare: Rarity.Rare, epic: Rarity.Epic, legendary: Rarity.Legendary };
const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });

export function makeSeal(mount: string, bound = false): Item {
  const d = MOUNTS[mount];
  const it = { ...makeItem(sealBase(mount), 1, Rarity.Common), rarity: RAR[d.tier], req: d.level };
  if (bound) it.bound = true;
  return it;
}
export function makePart(part: string, qty = 1): Item {
  const d = PARTS[part];
  const it = { ...makeItem(partBase(part), 1, Rarity.Common), rarity: RAR[d.tier], qty };
  if (d.bound) it.bound = true;
  return it;
}

/** Положить в сумку; места нет — в save.pendingItems (выдаётся, когда появится место). */
export function giveItem(p: Player, it: Item) {
  if (addItem(p, it)) return;
  (p.save.pendingItems ??= []).push(it);
  p.send("toast", { text: `${it.name} ждёт: освободите место в сумке`, kind: "error" });
}

/** Печать маунта в сумку (трофей, покупка, сборка). bound по умолчанию — по источнику (рейд, арена). */
export function giveSeal(p: Player, mount: string, bound = sealBoundBySource(MOUNTS[mount])) {
  const it = makeSeal(mount, bound);
  giveItem(p, it);
  p.send("toast", { text: `Получено: ${it.name}`, kind: "loot" });
}

/** Выдать маунт в коллекцию (без дублей); первый — сразу выбран. */
export function awardMount(p: Player, id: string): boolean {
  const d = MOUNTS[id];
  if (!d) return false;
  const own = (p.save.mounts ??= []);
  if (own.includes(id)) return false;
  own.push(id);
  if (!p.save.mount) p.save.mount = id;
  p.selfDirty = true;
  p.send("toast", { text: `Получен маунт: ${d.name}`, kind: "loot" });
  return true;
}

/** Изучить печать из сумки: маунт — в коллекцию (привязан навсегда), печать исчезает. */
export function learnSeal(p: Player, index: number) {
  const it = p.save.inventory[index];
  const id = it && sealMount(it.base);
  if (!it || !id) return;
  const d = MOUNTS[id];
  if (!canRide(d, p.faction)) return err(p, `${d.name}: только для другой фракции`);
  if (p.level < d.level) return err(p, `${d.name}: нужен ${d.level} уровень`);
  if (p.save.mounts?.includes(id)) return err(p, `${d.name} уже в коллекции — печать можно продать или передать`);
  p.save.inventory[index] = null;
  awardMount(p, id);
  p.save.mount = id;
}

export function nearStable(w: World, p: Player) {
  return STABLEMASTERS.some((n) => w.dist(p, n) <= MERCHANT_RANGE);
}
function stableGate(w: World, p: Player): boolean {
  if (p.dead) return false;
  if (!nearStable(w, p)) { err(p, "Подойдите к конюшему"); return false; }
  const no = serviceRefusal("stable", p.x, p.y, p.faction, MERCHANT_RANGE);
  if (no) { err(p, no); return false; }
  return true;
}
const stateOf = (p: Player, arenaRating = 0) => ({ level: p.level, faction: p.faction, gold: p.save.gold, rep: p.save.rep, marks: p.save.marks, mounts: p.save.mounts, inventory: p.save.inventory, arenaRating });

/** Купить у конюшего (маунты торговца и боевые за репутацию): печать в сумку. */
export function stableBuy(w: World, p: Player, id: unknown) {
  const d = typeof id === "string" && Object.hasOwn(MOUNTS, id) ? MOUNTS[id] : undefined;
  if (!d || !stableGate(w, p)) return;
  buySeal(p, d.id);
}
/** Общая покупка печати (конюший и торговка): проверки, списание, печать в сумку. */
export function buySeal(p: Player, id: string) {
  const d = MOUNTS[id];
  const o = stableOffer(d, stateOf(p));
  if (!o.buy) return err(p, "Этот маунт не продаётся");
  if (o.owned) return err(p, "Маунт уже у вас");
  if (o.sealInBag) return err(p, "Печать этого маунта уже в сумке — изучите её");
  if (!o.canBuy) return err(p, `${d.name}: не хватает — ${o.missBuy.join(", ")}`);
  if (!p.save.inventory.includes(null)) return err(p, "Сумка полна");
  p.save.gold -= d.price;
  if (d.rep) p.save.marks = (p.save.marks ?? 0) - d.rep.marks;
  giveSeal(p, d.id, false);
  p.selfDirty = true;
}

/** Собрать маунт из деталей у конюшего: детали и золото списываются, печать в сумку (привязана, если детали привязаны). arenaRating — лучший рейтинг сезона. */
export function stableCraft(w: World, p: Player, id: unknown, arenaRating = 0) {
  const d = typeof id === "string" && Object.hasOwn(MOUNTS, id) ? MOUNTS[id] : undefined;
  if (!d || !stableGate(w, p)) return;
  const o = stableOffer(d, stateOf(p, arenaRating));
  if (!o.craft) return err(p, "Этот маунт не собирается");
  if (o.owned) return err(p, "Маунт уже у вас");
  if (!o.canCraft) return err(p, `${d.name}: не хватает — ${o.missCraft.join(", ")}`);
  const backup = JSON.stringify(p.save.inventory);
  for (const [part, n] of Object.entries(d.craft!.parts)) takeBase(p, partBase(part), n);
  if (!p.save.inventory.includes(null)) { p.save.inventory = JSON.parse(backup); return err(p, "Сумка полна"); }
  p.save.gold -= d.craft!.gold;
  giveSeal(p, d.id, craftBound(d));
  p.selfDirty = true;
}
/** Списать n штук предмета из стопок сумки (наличие проверено заранее). */
function takeBase(p: Player, base: string, n: number) {
  const inv = p.save.inventory;
  if (countBase(inv, base) < n) return;
  for (let i = 0; i < inv.length && n > 0; i++) {
    const it = inv[i];
    if (!it || it.base !== base) continue;
    const q = it.qty ?? 1, t = Math.min(q, n);
    n -= t;
    if (q - t <= 0) inv[i] = null;
    else it.qty = q - t;
  }
}

// ---------- репутация и Знаки Полей ----------
export function addRep(p: Player, n: number) {
  if (n <= 0) return;
  p.save.rep = (p.save.rep ?? 0) + n;
  p.selfDirty = true;
}
export function addMarks(p: Player, n: number) {
  if (n <= 0) return;
  p.save.marks = (p.save.marks ?? 0) + n;
  p.selfDirty = true;
}
/** Убийство моба (data earn): босс — репутация; моб не ниже уровня героя − repMobGap — репутация; от marksMobLevel — Знаки Полей (моб — с шансом, босс — сразу). */
export function onKillEarn(p: Player, mob: { level: number; def: { boss?: boolean } }, rand: () => number = Math.random) {
  const e = MOUNT_EARN;
  if (mob.def.boss) addRep(p, e.repBoss);
  else if (mob.level >= p.level - e.repMobGap) addRep(p, e.repMob);
  if (mob.level < e.marksMobLevel) return;
  if (mob.def.boss) addMarks(p, e.marksBoss);
  else if (rand() < e.marksMobChance) addMarks(p, 1);
}
