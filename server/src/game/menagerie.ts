/**
 * Зверинец (задача 150): «Печать питомца» — питомец приходит предметом в сумку; до изучения печать продаётся и передаётся,
 * изучение (use) кладёт питомца в коллекцию (привязан навсегда). Смотритель зверинца в столицах продаёт печати за золото,
 * у редких — ещё репутация, Знаки Полей (списываются) или побеждённые боссы (shared/pets.ts keeperOffer).
 * Все проверки и списания — в одном синхронном шаге тика: либо всё (золото, знаки, печать), либо ничего.
 */
import { MERCHANT_RANGE } from "../../../shared/constants";
import { makeItem, Rarity, type Item } from "../../../shared/items";
import { serviceRefusal } from "../../../shared/npcs";
import { canKeepPet, keeperOffer, PET_KEEPERS, PET_SEAL, PETS, petSealBase, sealPet, type PetTier } from "../../../shared/pets";
import { addItem } from "./inventory";
import type { Player } from "./Player";
import type { World } from "./World";

const RAR: Record<PetTier, Rarity> = { common: Rarity.Common, uncommon: Rarity.Common, rare: Rarity.Rare, epic: Rarity.Epic };
const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });

export function makePetSeal(pet: string, bound = false): Item {
  const d = PETS[pet];
  const it = { ...makeItem(petSealBase(pet), 1, Rarity.Common), rarity: RAR[d.tier ?? "common"], req: d.level };
  if (bound) it.bound = true;
  return it;
}

/** Печать в сумку (покупка, находка); места нет — в save.pendingItems. */
export function givePetSeal(p: Player, pet: string, bound = false) {
  const it = makePetSeal(pet, bound);
  if (!addItem(p, it)) (p.save.pendingItems ??= []).push(it);
  p.selfDirty = true;
  p.send("toast", { text: `${PET_SEAL.name}: ${PETS[pet].name} — в сумке`, kind: "loot" });
}

/** Изучить печать из сумки: питомец — в коллекцию с уровня продажи (не выше уровня героя), печать исчезает. */
export function learnPetSeal(p: Player, index: number) {
  const it = p.save.inventory[index];
  const id = it && sealPet(it.base);
  if (!it || !id) return;
  const d = PETS[id];
  if (!canKeepPet(d, p.faction)) return err(p, `${d.name}: только для другой фракции`);
  if (p.level < d.level) return err(p, `${d.name}: нужен ${d.level} уровень`);
  const own = (p.save.pets ??= {});
  if (own[id]) return err(p, `${d.name} уже в коллекции — печать можно продать${it.bound ? "" : " или передать"}`);
  p.save.inventory[index] = null;
  own[id] = { level: Math.min(p.level, Math.max(1, d.level)), xp: 0 };
  if (!p.save.pet || !own[p.save.pet]) p.save.pet = id;
  p.selfDirty = true;
  p.send("toast", { text: `${d.name} теперь с вами! Призыв — G`, kind: "level" });
}

export function nearKeeper(w: World, p: Player) {
  return PET_KEEPERS.some((n) => w.dist(p, n) <= MERCHANT_RANGE);
}

/** Купить печать у смотрителя: проверки, списание золота и знаков, печать в сумку — одним шагом. */
export function keeperBuy(w: World, p: Player, id: unknown) {
  const d = typeof id === "string" && Object.hasOwn(PETS, id) ? PETS[id] : undefined;
  if (!d || p.dead) return;
  if (!nearKeeper(w, p)) return err(p, "Подойдите к смотрителю зверинца");
  const no = serviceRefusal("pets", p.x, p.y, p.faction, MERCHANT_RANGE);
  if (no) return err(p, no);
  const o = keeperOffer(d, { ...p.save, faction: p.faction, level: p.level });
  if (o.owned) return err(p, `${d.name} уже в коллекции`);
  if (o.sealInBag) return err(p, "Печать уже в сумке — изучите её");
  if (!o.canBuy) return err(p, `${d.name}: не хватает — ${o.miss.join(", ")}`);
  const it = makePetSeal(d.id);
  if (!p.save.inventory.includes(null) || !addItem(p, it)) return err(p, "Нет места в сумке");
  p.save.gold -= d.price;
  if (d.need?.marks) p.save.marks = (p.save.marks ?? 0) - d.need.marks;
  p.selfDirty = true;
  p.send("toast", { text: `${PET_SEAL.name}: ${d.name} — в сумке. Изучите её (клик)`, kind: "loot" });
}
