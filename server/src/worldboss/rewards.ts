/**
 * Награды мирового босса (задача 151, docs/world-bosses.md §1 «Награды»): каждому от бронзы — по порогу вклада, лично, без «тега».
 * Знаки Полей, опыт, титулы и рамка — всегда; вещи — раз в сутки на героя (save.wboss.day), легендарка и маунт — у золота
 * с защитой от невезения, раз в неделю на аккаунт. Всё считается заранее и записывается разом (одна транзакция): вещи — в личный
 * мешок у тела; невзятое по истечении мешка или при выходе — в сумку целиком, если влезает всё, иначе целиком в save.pendingItems.
 */
import { xpForKill } from "../../../shared/formulas";
import { makeItem, makeLoot, rollRarity, type Item, type Rarity } from "../../../shared/items";
import { makeLegendary, rollLegendary, LEGENDARIES } from "../../../shared/legendary";
import { canRide, MOUNTS } from "../../../shared/mounts";
import { weekKey } from "../../../shared/bannerWar";
import { WB, wbDayKey, wbText, type WbBossDef, type WbTier, type WbResultMsg } from "../../../shared/worldBoss";
import type { LootBag } from "../../../shared/protocol";
import type { PlayerSave } from "../db";
import { addItem } from "../game/inventory";
import { gainXp } from "../game/rewards";
import { giveSeal } from "../game/stable";
import type { Player } from "../game/Player";
import type { World } from "../game/World";

export interface WbSave { day: Record<string, string>; wins: Record<string, number>; golds: number; pity: Record<string, { leg: number; mount: number }> }
export function wbState(s: PlayerSave): WbSave {
  return ((s as PlayerSave & { wboss?: WbSave }).wboss ??= { day: {}, wins: {}, golds: 0, pity: {} });
}
/** Взята ли добыча босса в эти сутки. */
export function wbLocked(s: PlayerSave, boss: string, now: number): boolean {
  return wbState(s).day[boss] === wbDayKey(now);
}

/** Мешки мировых боссов по герою: id мешка → герой (для выдачи невзятого). */
const BAGS = new WeakMap<Player, Set<string>>();

/** Вещи разом: влезает всё — в сумку, иначе всё — в pendingItems (сумка не меняется частично). */
export function giveAll(p: Player, items: Item[]): boolean {
  if (!items.length) return true;
  const copy = { save: { inventory: p.save.inventory.map((s) => (s ? { ...s } : null)) }, selfDirty: false } as unknown as Player;
  const fits = items.every((it) => addItem(copy, { ...it }));
  if (fits) for (const it of items) addItem(p, it);
  else (p.save.pendingItems ??= []).push(...items);
  p.selfDirty = true;
  return fits;
}
/** Невзятое из мешков мировых боссов — разом в сумку или в pendingItems (истёк мешок, выход из мира). */
export function flushBags(p: Player, only?: string) {
  const ids = BAGS.get(p);
  if (!ids) return;
  const items: Item[] = [];
  for (const id of [...ids]) {
    if (only && id !== only) continue;
    ids.delete(id);
    const bag = p.bags.get(id);
    if (!bag) continue;
    items.push(...bag.items);
    p.bags.delete(id);
    p.bagsDirty = true;
  }
  giveAll(p, items);
}
function dropBag(w: World, p: Player, x: number, y: number, items: Item[], ms: number) {
  if (!items.length) return;
  const bag: LootBag = { id: w.uid("l"), x: x + (Math.random() - 0.5) * 80, y: y + 34 + (Math.random() - 0.5) * 30, items, boss: true };
  p.bags.set(bag.id, bag);
  p.bagsDirty = true;
  let set = BAGS.get(p);
  if (!set) BAGS.set(p, (set = new Set()));
  set.add(bag.id);
  w.later(ms, () => flushBags(p, bag.id));
}

export interface WbGrantCtx {
  w: World;
  def: WbBossDef;
  now: number;
  win: string;
  bossXp: number;
  bossLevel: number;
  x: number;
  y: number;
  /** Чьё Сердце южного фронта (лишний сундук). */
  heartOwner: string;
  /** Недельные трофеи аккаунта (store менеджера): ключ аккаунта → неделя легендарки и маунта. */
  acct: Record<string, { leg?: string; mount?: string }>;
  rand?: () => number;
}

/** Награда одного героя по порогу. Возвращает строку «мне» итога. */
export function grantWb(c: WbGrantCtx, p: Player, v: number, tier: Exclude<WbTier, "">): NonNullable<WbResultMsg["me"]> {
  const { w, def, now } = c, rand = c.rand ?? Math.random, R = def.rewards, T = R[tier], s = p.save, st = wbState(s);
  const locked = st.day[def.id] === wbDayKey(now);
  // --- расчёт ---
  const marks = Math.round(T.marks * (c.win && p.faction === c.win ? R.factionMarksMul : 1));
  const xp = Math.round(xpForKill(c.bossXp, c.bossLevel, p.level) * T.xpMul);
  const items: Item[] = [];
  const trophy: string[] = [];
  const pity = (st.pity[def.id] ??= { leg: 0, mount: 0 });
  const acctKey = p.accountId ? `a${p.accountId}` : `h${p.name.toLowerCase()}`;
  const acc = (c.acct[acctKey] ??= {});
  const wk = weekKey(now);
  let legGot = false, mountId = "";
  if (!locked) {
    for (let i = 0; i < T.items.n; i++) items.push(makeLoot(p.cls, T.items.ilvl, Math.max(rollRarity(rand, 0.3), T.items.minRarity) as Rarity, rand));
    const mat = (id: string, n: number) => { if (n > 0) items.push({ ...makeItem(id, 1, 0), qty: n }); };
    mat("ash_ore", T.ore);
    mat("star_dust", T.dust);
    // лишний сундук: фракция-владелец Сердца южного фронта, от серебра
    if (R.heartChest && tier !== "bronze" && c.heartOwner && c.heartOwner === p.faction) { mat("ash_ore", R.heartChest.ore); mat("star_dust", R.heartChest.dust); }
    if (tier === "gold") {
      if (acc.leg !== wk && rand() < R.legendary.chance + pity.leg) {
        const id = rollLegendary(p.cls, T.items.ilvl, rand);
        if (id) { items.push(makeLegendary(id)); legGot = true; trophy.push(LEGENDARIES[id].name); }
      }
      const pool = R.mounts.filter((id) => MOUNTS[id] && canRide(MOUNTS[id], p.faction) && !s.mounts?.includes(id));
      if (pool.length && acc.mount !== wk && rand() < R.mount.chance + pity.mount) mountId = pool[Math.floor(rand() * pool.length)];
    }
  }
  // титулы и рамка
  const wins = (st.wins[def.id] ?? 0) + 1;
  const golds = st.golds + (tier === "gold" ? 1 : 0);
  s.titles ??= [];
  const newTitles = def.titles.filter((t) => wins >= t.wins && !s.titles!.some((x) => x.id === t.id));
  const frame = golds >= WB.frame.gold && !s.titles.some((x) => x.rank === WB.frame.id) ? WB.frame.name : "";
  // --- запись разом ---
  st.wins[def.id] = wins;
  st.golds = golds;
  s.marks = (s.marks ?? 0) + marks;
  for (const t of newTitles) { s.titles.push({ id: t.id, name: t.name, rank: "" }); if (!s.title) s.title = t.name; }
  if (frame) { const t = s.titles.find((x) => x.id.startsWith("wb_")); if (t) t.rank = WB.frame.id; if (!s.frame) s.frame = WB.frame.id; }
  if (!locked) {
    st.day[def.id] = wbDayKey(now);
    if (tier === "gold") {
      if (legGot) { acc.leg = wk; pity.leg = 0; } else if (acc.leg !== wk) pity.leg = Math.min(R.legendary.pityMax, pity.leg + R.legendary.pityStep);
      if (mountId) { acc.mount = wk; pity.mount = 0; } else if (R.mounts.length && acc.mount !== wk) pity.mount = Math.min(R.mount.pityMax, pity.mount + R.mount.pityStep);
    }
  }
  gainXp(w, p, xp);
  if (newTitles.length || frame) p.applyCosmetics();
  if (mountId) { giveSeal(p, mountId); trophy.push(MOUNTS[mountId].name); }
  if (locked) p.send("toast", { text: wbText(def.texts.locked), kind: "info" });
  else { dropBag(w, p, c.x, c.y, items, R.bagMs); p.send("toast", { text: wbText(def.texts.bag, { name: def.name }), kind: "loot" }); }
  for (const t of trophy) w.system(`${p.name}: ${t}`);
  p.selfDirty = true;
  return { v: Math.floor(v), tier, marks, xp, items: items.map((it) => it.name ?? it.base), itemsR: items.map((it) => it.rarity), locked, titles: newTitles.map((t) => t.name), frame, trophy };
}
