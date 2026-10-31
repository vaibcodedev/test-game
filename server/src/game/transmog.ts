/**
 * Перековщик (docs/art/gear.md): снять оболочку, наложить, сбросить вид. Всё проверяется на сервере; каждое действие —
 * одна синхронная транзакция над сохранением героя: сначала все проверки, затем золото и предметы меняются вместе
 * (между проверкой и записью нет await — другое сообщение вклиниться не может).
 */
import { MERCHANT_RANGE } from "../../../shared/constants";
import { itemName, SLOTS, type Item, type Slot } from "../../../shared/items";
import { applyPrice, applyRefusal, extractPrice, extractRefusal, isShell, makeShell, REFORGER, resetPrice } from "../../../shared/transmog";
import { isQuestItem } from "../../../shared/quests";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";

const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });
const validIndex = (p: Player, i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < p.save.inventory.length;
type Locked = (i: number) => boolean;
/** Вещь по ссылке клиента: { index } — в сумке (не в окне обмена), { slot } — надетая (не в бою). */
type Ref = { item: Item; index?: number; slot?: Slot };

/** Общие условия: жив, не на арене, рядом Перековщик. */
function ready(w: World, p: Player): boolean {
  if (p.dead) return false;
  if (p.team !== 0) { err(p, T("srv.transmog.arena")); return false; }
  if (w.dist(p, REFORGER) > MERCHANT_RANGE) { err(p, T("srv.transmog.far")); return false; }
  return true;
}

function resolve(w: World, p: Player, index: unknown, slot: unknown, locked: Locked): Ref | null {
  if (slot !== undefined && slot !== null) {
    if (typeof slot !== "string" || !SLOTS.includes(slot as Slot)) return null;
    const item = p.save.equip[slot as Slot];
    if (!item) { err(p, T("srv.transmog.noItem")); return null; }
    if (p.inCombat(w.time)) { err(p, T("srv.inventory.793")); return null; }
    return { item, slot: slot as Slot };
  }
  if (!validIndex(p, index)) return null;
  if (locked(index)) { err(p, T("srv.bank.65")); return null; }
  const item = p.save.inventory[index];
  if (!item) { err(p, T("srv.transmog.noItem")); return null; }
  return { item, index };
}

function done(p: Player, ref: Ref, text: string) {
  if (ref.slot) {
    const ratio = p.unit.hp / Math.max(1, p.unit.maxHp);
    p.recalc(); // вид на герое (unit.gear / unit.weapon) — у всех, кто видит героя
    p.unit.hp = Math.max(1, Math.round(p.unit.maxHp * ratio));
  }
  p.selfDirty = true;
  p.send("toast", { text, kind: "loot" });
  p.send("tm:done", {});
}

/** Снять оболочку: донор из сумки распадается, на его месте — «Оболочка: <имя>»; золото по уровню и редкости донора. */
/** Страховка списания (B62): цена и золото — конечные неотрицательные числа, золота хватает; иначе отказ. */
const canPay = (p: Player, price: number): boolean =>
  Number.isFinite(price) && price >= 0 && Number.isFinite(p.save.gold) && p.save.gold >= price;

export function tmExtract(w: World, p: Player, index: unknown, locked: Locked) {
  if (!ready(w, p)) return;
  // донор — только из сумки: надетую вещь сначала снимают (иначе герой остался бы без вещи в бою)
  const ref = resolve(w, p, index, null, locked);
  if (!ref) return;
  const donor = ref.item;
  if (isQuestItem(donor.base)) return err(p, T("srv.transmog.notGear"));
  const why = extractRefusal(donor);
  if (why) return err(p, why);
  const price = extractPrice(donor);
  if (!canPay(p, price)) return err(p, T("srv.bags.58"));
  // транзакция: золото и предмет меняются вместе, место в сумке — то же, что у донора (нехватки места не бывает)
  const shell = makeShell(donor);
  p.save.gold -= price;
  p.save.inventory[ref.index!] = shell;
  done(p, ref, T("srv.transmog.extracted", { name: itemName(donor), gold: price }));
}

/** Наложить оболочку (из сумки) на вещь из сумки или надетую: тот же слот и семейство; оболочка исчезает. */
export function tmApply(w: World, p: Player, shellIndex: unknown, index: unknown, slot: unknown, locked: Locked) {
  if (!ready(w, p)) return;
  if (!validIndex(p, shellIndex)) return;
  if (locked(shellIndex)) return err(p, T("srv.bank.65"));
  const shell = p.save.inventory[shellIndex];
  if (!isShell(shell)) return err(p, T("srv.transmog.noShell"));
  const ref = resolve(w, p, index, slot, locked);
  if (!ref) return;
  if (ref.index === shellIndex) return err(p, T("srv.transmog.notGear"));
  const why = applyRefusal(shell, ref.item);
  if (why) return err(p, why);
  const price = applyPrice(shell!, ref.item);
  if (!canPay(p, price)) return err(p, T("srv.bags.58"));
  // транзакция: золото, вид вещи и оболочка — разом
  p.save.gold -= price;
  ref.item.appearance = { ...shell!.appearance! };
  p.save.inventory[shellIndex] = null;
  done(p, ref, T("srv.transmog.applied", { name: itemName(ref.item), look: shell!.appearance!.name, gold: price }));
}

/** Сбросить вид: вещь возвращается к своему, наложенная оболочка пропадает. */
export function tmReset(w: World, p: Player, index: unknown, slot: unknown, locked: Locked) {
  if (!ready(w, p)) return;
  const ref = resolve(w, p, index, slot, locked);
  if (!ref) return;
  if (isShell(ref.item) || !ref.item.appearance) return err(p, T("srv.transmog.noLook"));
  const price = resetPrice(ref.item);
  if (!canPay(p, price)) return err(p, T("srv.bags.58"));
  p.save.gold -= price;
  delete ref.item.appearance;
  done(p, ref, T("srv.transmog.reset", { name: itemName(ref.item) }));
}
