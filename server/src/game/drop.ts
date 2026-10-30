/**
 * Выброс предметов из сумки: мешок падает у ног героя и виден всем; первые ownerLockSec подобрать может только хозяин, потом любой,
 * через ttlSec мешок исчезает (data/drop.json). Всё проверяется здесь, изменение сумки и запись в drop_log — одна транзакция БД.
 * Также уничтожение вещи (со словом) и подбор золота из мешков добычи. Сумка и addItem — inventory.ts (не меняется).
 */
import { PICKUP_RANGE } from "../../../shared/constants";
import { DROP } from "../../../shared/drop";
import { BASE_ITEMS, iconFor, isBound, itemName, type Item } from "../../../shared/items";
import type { LootBag } from "../../../shared/protocol";
import { isQuestItem } from "../../../shared/quests";
import { T } from "../../../shared/texts";
import type { GameDB } from "../db";
import { addItem, pickup } from "./inventory";
import type { Player } from "./Player";
import type { World } from "./World";

/** Сроки можно сократить окружением (тесты): DROP_LOCK_SEC, DROP_TTL_SEC. */
const LOCK_MS = (Number(process.env.DROP_LOCK_SEC) || DROP.ownerLockSec) * 1000;
const TTL_MS = (Number(process.env.DROP_TTL_SEC) || DROP.ttlSec) * 1000;
interface Ground { bag: LootBag; owner: string; freeAt: number }
const grounds = new WeakMap<World, Map<string, Ground>>();
const history = new WeakMap<Player, number[]>();
const groundOf = (w: World) => { let g = grounds.get(w); if (!g) grounds.set(w, (g = new Map())); return g; };
const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });
const qtyTxt = (n: number) => (n > 1 ? ` ×${n}` : "");

/** Мешки для отправки игроку: его личная добыча и выброшенные мешки на земле (lock — пока чужой). */
export function lootFor(w: World, p: Player): LootBag[] {
  const out = [...p.bags.values()];
  for (const g of groundOf(w).values()) {
    const left = Math.max(0, Math.ceil((g.freeAt - w.time) / 1000));
    out.push({ ...g.bag, own: g.owner, ...(g.owner !== p.name && left > 0 ? { lock: left } : {}) });
  }
  return out;
}
const dirtyAll = (w: World) => { for (const q of w.players.values()) q.bagsDirty = true; };
/** Выброшенные мешки на земле (для тестов и поддержки). */
export const groundBags = (w: World): LootBag[] => [...groundOf(w).values()].map((g) => g.bag);

function throttle(w: World, p: Player): boolean {
  const h = (history.get(p) ?? []).filter((t) => w.time - t < DROP.rateWindowSec * 1000);
  history.set(p, h);
  if (h.length >= DROP.rateMax || (h.length && w.time - h[h.length - 1] < DROP.minGapMs)) return false;
  h.push(w.time);
  return true;
}

function persist(db: GameDB, p: Player, spawn: { x: number; y: number }, kind: string, items: Item[], gold: number) {
  db.raw.exec("BEGIN IMMEDIATE");
  try {
    db.save(p.name, p.toSave(spawn));
    db.raw.prepare("INSERT INTO drop_log (at, kind, who, x, y, items, gold) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(Date.now(), kind, p.name, Math.round(p.x), Math.round(p.y), JSON.stringify(items.map((i) => ({ uid: i.uid, base: i.base, name: itemName(i), rarity: i.rarity, plus: i.plus, qty: i.qty ?? 1 }))), gold);
    db.raw.exec("COMMIT");
  } catch (ex) {
    try { db.raw.exec("ROLLBACK"); } catch {}
    throw ex;
  }
}

/** Общие отказы (null — можно). */
function why(w: World, p: Player, locked: (i: number) => boolean, index?: number): string | null {
  if (p.dead) return T("srv.drop.dead");
  if (p.team !== 0 || p.goingToArena) return T("srv.drop.arena");
  if (index !== undefined && locked(index)) return T("srv.drop.trade");
  return null;
}

/** Выбросить предмет (qty штук из стопки) или золото. */
export function dropItem(w: World, db: GameDB, spawn: { x: number; y: number }, p: Player, m: { index?: unknown; qty?: unknown; gold?: unknown }, locked: (i: number) => boolean = () => false) {
  const inv = p.save.inventory;
  const isGold = m.gold !== undefined;
  let index = -1;
  if (!isGold) {
    if (!Number.isInteger(m.index) || (m.index as number) < 0 || (m.index as number) >= inv.length) return;
    index = m.index as number;
  } else if (!Number.isInteger(m.gold) || (m.gold as number) < 1 || (m.gold as number) > p.save.gold) return err(p, T("srv.drop.qty"));
  const no = why(w, p, locked, isGold ? undefined : index);
  if (no) return err(p, no);
  if (p.inCombat(w.time)) return err(p, T("srv.drop.combat"));
  const ground = groundOf(w);
  if ([...ground.values()].filter((g) => g.owner === p.name).length >= DROP.maxBagsPerPlayer || ground.size >= DROP.maxBagsWorld) return err(p, T("srv.drop.many"));

  const src = isGold ? null : inv[index];
  if (!isGold && !src) return;
  let part: Item | null = null;
  let gold = 0;
  let take = 0;
  if (src) {
    if (isQuestItem(src.base) || isBound(src)) return err(p, T("srv.drop.bound"));
    const have = src.qty ?? 1;
    const q = m.qty === undefined ? have : m.qty;
    if (!Number.isInteger(q) || (q as number) < 1 || (q as number) > have) return err(p, T("srv.drop.qty"));
    if (!throttle(w, p)) return err(p, T("srv.drop.rate"));
    part = (q as number) === have ? src : { ...src, uid: `${src.uid}-d${w.uid("q")}`, qty: q as number };
    take = q as number;
  } else {
    if (!throttle(w, p)) return err(p, T("srv.drop.rate"));
    gold = m.gold as number;
  }

  // атомарно: меняем сумку в памяти, пишем в базу; при сбое всё возвращаем
  const backup = { inv: JSON.stringify(inv), gold: p.save.gold };
  if (part && src) { if (part === src) inv[index] = null; else src.qty = (src.qty ?? 1) - take; }
  p.save.gold -= gold;
  try {
    persist(db, p, spawn, "drop", part ? [part] : [], gold);
  } catch (ex) {
    console.error("[drop]", ex);
    p.save.inventory = JSON.parse(backup.inv);
    p.save.gold = backup.gold;
    p.selfDirty = true;
    return err(p, T("srv.drop.fail"));
  }
  p.selfDirty = true;
  const bag: LootBag = { id: w.uid("d"), x: p.x + (Math.random() - 0.5) * 14, y: p.y + 6 + Math.random() * 4, items: part ? [part] : [], ...(gold ? { gold } : {}) };
  ground.set(bag.id, { bag, owner: p.name, freeAt: w.time + LOCK_MS });
  w.later(LOCK_MS, () => { if (ground.has(bag.id)) dirtyAll(w); });
  w.later(TTL_MS, () => { if (ground.delete(bag.id)) dirtyAll(w); });
  dirtyAll(w);
  p.send("toast", { text: part ? T("srv.drop.done", { name: itemName(part), qty: qtyTxt(part.qty ?? 1) }) : T("srv.drop.gold", { gold }), kind: "info" });
}

/** Уничтожить вещь целиком (стопку): нужно слово подтверждения. */
export function destroyItem(w: World, db: GameDB, spawn: { x: number; y: number }, p: Player, m: { index?: unknown; word?: unknown }, locked: (i: number) => boolean = () => false) {
  const inv = p.save.inventory;
  if (!Number.isInteger(m.index) || (m.index as number) < 0 || (m.index as number) >= inv.length) return;
  const index = m.index as number;
  const no = why(w, p, locked, index);
  if (no) return err(p, no);
  const it = inv[index];
  if (!it) return;
  if (typeof m.word !== "string" || m.word.trim().toUpperCase() !== DROP.destroyWord) return err(p, T("srv.drop.word", { word: DROP.destroyWord }));
  if (!throttle(w, p)) return err(p, T("srv.drop.rate"));
  inv[index] = null;
  try {
    persist(db, p, spawn, "destroy", [it], 0);
  } catch (ex) {
    console.error("[drop]", ex);
    inv[index] = it;
    return err(p, T("srv.drop.fail"));
  }
  p.selfDirty = true;
  p.send("toast", { text: T("srv.drop.destroyed", { name: itemName(it), qty: qtyTxt(it.qty ?? 1) }), kind: "info" });
}

/** Подбор: выброшенный мешок (хозяин сразу, чужой — после срока) или личная добыча (золото из неё — здесь, вещи — inventory.pickup). */
export function pickupBag(w: World, db: GameDB, p: Player, bagId: unknown) {
  if (typeof bagId !== "string" || p.dead) return;
  const ground = groundOf(w);
  const g = ground.get(bagId);
  if (!g) {
    const own = p.bags.get(bagId);
    if (own?.gold && w.dist(p, own) <= PICKUP_RANGE + 8) {
      const gold = own.gold;
      own.gold = 0;
      p.save.gold += gold;
      p.selfDirty = true;
      p.send("toast", { text: T("srv.drop.gotGold", { gold }), kind: "loot" });
    }
    return pickup(w, p, bagId);
  }
  if (w.dist(p, g.bag) > PICKUP_RANGE + 8) return err(p, T("srv.encounters.94"));
  if (g.owner !== p.name && w.time < g.freeAt) return err(p, T("srv.drop.locked", { sec: Math.ceil((g.freeAt - w.time) / 1000) }));
  const bag = g.bag;
  const left: Item[] = [];
  const got: Item[] = [];
  for (const it of bag.items) {
    if (addItem(p, it)) { got.push(it); p.send("toast", { text: T("srv.inventory.114", { itemname: itemName(it), qty: qtyTxt(it.qty ?? 1) }), kind: "loot", icon: iconFor(it), classes: BASE_ITEMS[it.base].classes, item: it }); }
    else left.push(it);
  }
  const gold = bag.gold ?? 0;
  if (gold) { p.save.gold += gold; bag.gold = 0; p.send("toast", { text: T("srv.drop.gotGold", { gold }), kind: "loot" }); }
  p.selfDirty = true;
  bag.items = left;
  if (left.length) err(p, T("srv.inventory.115")); else ground.delete(bag.id);
  if (got.length || gold) {
    try { db.raw.prepare("INSERT INTO drop_log (at, kind, who, x, y, items, gold) VALUES (?, 'pickup', ?, ?, ?, ?, ?)").run(Date.now(), p.name, Math.round(bag.x), Math.round(bag.y), JSON.stringify(got.map((i) => ({ uid: i.uid, base: i.base, qty: i.qty ?? 1, from: g.owner }))), gold); } catch (ex) { console.error("[drop]", ex); }
  }
  dirtyAll(w);
}
