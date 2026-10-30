/**
 * Награды рейда (docs/systems/bosses.md §6): всем участникам в комнате (и павшим), ботам — ничего. Откат добычи lockoutH часов:
 * с откатом — опыт и золото ×lockedMul, без вещей. Вещи — личные мешки у тела босса; невзятое при выходе кладётся в сумку,
 * остаток ждёт в save.pendingItems и выдаётся в мире (deliverPending).
 */
import { xpForKill } from "../../../shared/formulas";
import { BASE_ITEMS, makeItem, makeLoot, Rarity, rollRarity, type Item } from "../../../shared/items";
import { LEGENDARIES, legendaryFits, makeLegendary, rollLegendary, type LegendaryDef } from "../../../shared/legendary";
import { RAID, RAID_BOSS, RAID_CFG } from "../../../shared/raid";
import type { LootBag } from "../../../shared/protocol";
import type { PlayerSave } from "../db";
import { addItem } from "../game/inventory";
import { raidMountTrophies } from "../game/mountDrops";
import type { Player } from "../game/Player";
import { gainXp } from "../game/rewards";
import type { World } from "../game/World";
import type { RaidDirector } from "./director";
import { T } from "../../../shared/texts";

export interface RaidLoot {
  name: string;
  items: Item[];
  locked: boolean;
  gold: number;
  title?: string;
  frame?: string;
  trophies: string[];
}

/** Рейдовые легендарки (source "raid"): трофеи (знамя — плащ, рога — шлем) и прочие. */
function raidPool(): { banner: LegendaryDef[]; helm: LegendaryDef[]; other: LegendaryDef[] } {
  const all = Object.values(LEGENDARIES).filter((l) => l.source === "raid");
  const slot = (l: LegendaryDef) => BASE_ITEMS[l.base]?.slot;
  const banner = all.filter((l) => l.name === RAID.rewards.banner.name || (slot(l) === "cloak" && l.look?.back === "banner"));
  const helm = all.filter((l) => !banner.includes(l) && (l.name === RAID.rewards.helm.name || (slot(l) === "helmet" && !!l.look?.helm?.includes("horn"))));
  return { banner, helm, other: all.filter((l) => !banner.includes(l) && !helm.includes(l)) };
}
const pick = <T>(list: T[], rand: () => number): T | undefined => list[Math.floor(rand() * list.length)];

export function raidState(s: PlayerSave) {
  return (s.raid ??= { lootAt: {}, wins: 0, pity: 0 });
}
/** Остаток отката добычи босса (мс), 0 — можно брать. */
export function lockoutLeft(s: PlayerSave, now = Date.now()): number {
  const at = s.raid?.lootAt?.[RAID_BOSS.id] ?? 0;
  return Math.max(0, at + RAID_CFG.lockoutH * 3600_000 - now);
}

/** Личный мешок у тела босса: живёт bagMs. */
function dropBag(w: World, p: Player, x: number, y: number, items: Item[], rand: () => number) {
  if (!items.length) return;
  const bag: LootBag = { id: w.uid("l"), x: x + (rand() - 0.5) * 70, y: y + 30 + (rand() - 0.5) * 30, items, boss: true };
  p.bags.set(bag.id, bag);
  p.bagsDirty = true;
  w.later(RAID.rewards.drops.bagMs, () => {
    if (p.bags.delete(bag.id)) p.bagsDirty = true;
  });
}

/**
 * Награды за победу каждому участнику-игроку в комнате: золото и опыт, 2 вещи класса не ниже Эпической, материалы и зелья,
 * шанс на рейдовую легендарку и трофеи (с защитой от невезения), титул за первую победу и рамка за frame.wins побед.
 */
export function grantRaidRewards(d: RaidDirector, now = Date.now()): Map<string, RaidLoot> {
  const w = d.w, boss = d.boss, rand = d.rand, R = RAID.rewards, dr = R.drops, ch = R.chance;
  const out = new Map<string, RaidLoot>();
  const pool = raidPool();
  for (const mem of d.members) {
    if (mem.bot) continue;
    const p = d.byKey.get(mem.key);
    if (!p || w.players.get(p.id) !== p || d.bots.has(p)) continue;
    const s = p.save, rs = raidState(s);
    const locked = lockoutLeft(s, now) > 0;
    const k = locked ? dr.lockedMul : 1;
    const [g0, g1] = boss.stats.gold;
    const gold = Math.round((g0 + rand() * (g1 - g0)) * dr.goldMul * k);
    s.gold += gold;
    gainXp(w, p, Math.round(xpForKill(boss.stats.xp, boss.level, p.level) * k));
    s.kills++;
    (s.mobKills ??= {})[boss.def.id] = (s.mobKills[boss.def.id] || 0) + 1;
    s.bossKills[boss.def.id] = (s.bossKills[boss.def.id] || 0) + 1;
    rs.wins++;
    const loot: RaidLoot = { name: p.name, items: [], locked, gold, trophies: [] };
    // титул за первую победу, рамка за frame.wins побед (рамка — у записи титула, как у наград арены)
    s.titles ??= [];
    let tt = s.titles.find((x) => x.id === RAID.title.id);
    if (!tt) {
      tt = { id: RAID.title.id, name: RAID.title.name, rank: "" };
      s.titles.push(tt);
      if (!s.title) s.title = tt.name;
      loot.title = tt.name;
    }
    if (rs.wins >= RAID.frame.wins && tt.rank !== RAID.frame.id) {
      tt.rank = RAID.frame.id;
      if (s.title === tt.name || !s.frame) s.frame = RAID.frame.id;
      loot.frame = RAID.frame.name;
    }
    p.applyCosmetics();
    if (!locked) {
      rs.lootAt[RAID_BOSS.id] = now;
      const items = loot.items;
      for (let i = 0; i < dr.items; i++) items.push(makeLoot(p.cls, dr.ilvl, Math.max(rollRarity(rand, 0.45), dr.minRarity) as Rarity, rand));
      const mat = (id: string, [a, b]: [number, number]) => items.push({ ...makeItem(id, 1, 0), qty: a + Math.floor(rand() * (b - a + 1)) });
      mat("ash_ore", dr.ashOre);
      mat("star_dust", dr.starDust);
      items.push({ ...makeItem("hp_potion", 1, 0), qty: dr.potions });
      // рейдовая легендарка: свои записи source "raid" (не трофеи), иначе общий пул яруса 100
      if (rand() < ch.legendary) {
        const own = pool.other.filter((l) => legendaryFits(l.id, p.cls));
        const id = own.length ? pick(own, rand)!.id : rollLegendary(p.cls, dr.ilvl, rand);
        if (id) { items.push(makeLegendary(id)); w.system(T("srv.rewards.830", { name: p.name, name2: LEGENDARIES[id].name })); }
      }
      // трофеи: знамя и рога, шанс растёт на pityStep за победу без трофея (до pityMax)
      let got = false;
      for (const [list, chance] of [[pool.banner, ch.banner], [pool.helm, ch.helm]] as const) {
        const fits = list.filter((l) => legendaryFits(l.id, p.cls));
        if (!fits.length || rand() >= chance + rs.pity) continue;
        const l = pick(fits, rand)!;
        items.push(makeLegendary(l.id));
        loot.trophies.push(l.name);
        got = true;
        w.system(RAID.chat.trophy.replace("{name}", p.name).replace("{item}", l.name));
      }
      raidMountTrophies(p, RAID_BOSS.id);
      rs.pity = got ? 0 : Math.min(ch.pityMax, rs.pity + ch.pityStep);
      dropBag(w, p, boss.x, boss.y, items, rand);
      p.send("toast", { text: T("srv.rewards.203", { name: RAID_BOSS.name }), kind: "loot" });
    } else p.send("toast", { text: T("srv.rewards.204"), kind: "info" });
    p.selfDirty = true;
    out.set(mem.key, loot);
  }
  return out;
}

/** Выход из рейда: невзятое из мешков — в сумку, остаток — в save.pendingItems. */
export function collectBags(p: Player) {
  const left: Item[] = [];
  for (const bag of p.bags.values()) for (const it of bag.items) if (!addItem(p, it)) left.push(it);
  p.bags.clear();
  if (left.length) (p.save.pendingItems ??= []).push(...left);
}

/** Мир: выдать отложенные вещи, пока есть место. */
export function deliverPending(p: Player) {
  const list = p.save.pendingItems;
  if (!list?.length) return;
  let n = 0;
  while (list.length && addItem(p, list[0])) { list.shift(); n++; }
  if (!list.length) delete p.save.pendingItems;
  if (n) p.send("toast", { text: T("srv.rewards.205", { n: n }), kind: "loot" });
  if (list.length) p.send("toast", { text: T("srv.rewards.206", { length: list.length }), kind: "error" });
  p.selfDirty = true;
}
