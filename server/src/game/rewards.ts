/** Награды за убийство: опыт и уровни, золото, личные мешки с добычей. */
import { questProgress } from "./cities";
import { LOOT_BAG_TTL_MS, MAX_LEVEL } from "../../../shared/constants";
import { xpForKill, xpToNext } from "../../../shared/formulas";
import { BASE_ITEMS, makeItem, makeLoot, makeUnique, rollRarity, Rarity, UNIQUES, type Item } from "../../../shared/items";
import { LEGEND_TIERS, makeLegendary, rollLegendary } from "../../../shared/legendary";
import { ELITE } from "../../../shared/elites";
import { MATERIALS } from "../../../shared/upgrade";
import { BAL } from "../../../shared/balance";
import type { LootBag } from "../../../shared/protocol";
import type { Mob } from "./Mob";
import type { Player } from "./Player";
import type { World } from "./World";
import { grantPets, petXp, rollPetDrop } from "./Pet";

export function gainXp(w: World, p: Player, xp: number) {
  const s = p.save;
  p.selfDirty = true;
  if (s.level >= MAX_LEVEL) return;
  s.xp += xp;
  let leveled = false;
  while (s.level < MAX_LEVEL && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    leveled = true;
  }
  if (s.level >= MAX_LEVEL) s.xp = 0;
  if (leveled) {
    p.recalc();
    p.unit.hp = p.unit.maxHp;
    p.unit.mp = p.unit.maxMp;
    w.emit({ t: "lvl", id: p.id, level: s.level });
    grantPets(w, p);
    if (s.level % 5 === 0 || s.level === MAX_LEVEL) w.system(`${p.name} достигает ${s.level} уровня!`);
  }
  p.selfDirty = true;
}

function dropBag(w: World, p: Player, x: number, y: number, items: Item[], boss = false) {
  if (!items.length) return;
  const bag: LootBag = { id: w.uid("l"), x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 10, items, boss };
  p.bags.set(bag.id, bag);
  p.bagsDirty = true;
  w.later(LOOT_BAG_TTL_MS, () => {
    if (p.bags.delete(bag.id)) p.bagsDirty = true;
  });
}

export function grantKillRewards(w: World, m: Mob, killer?: Player) {
  const contributors: Player[] = [];
  for (const pid of m.damageBy.keys()) {
    const p = w.players.get(pid);
    if (p && w.dist(p, m) < 1200) contributors.push(p);
  }
  if (killer && !contributors.includes(killer)) contributors.push(killer);
  if (!contributors.length) return;
  const boss = !!m.def.boss;
  const group = contributors.length;
  for (const p of contributors) {
    // групповой бонус: каждый получает 70% + 30%/участник, но не больше 100%
    const share = boss ? 1 : Math.min(1, 0.7 + 0.3 / group);
    const xp = Math.round(xpForKill(m.stats.xp, m.level, p.level) * share);
    const [g0, g1] = m.stats.gold;
    const gold = Math.round((g0 + Math.random() * (g1 - g0)) * (boss ? 25 : 1));
    p.save.gold += gold;
    p.save.kills++;
    const mk = (p.save.mobKills ??= {});
    mk[m.def.id] = (mk[m.def.id] || 0) + 1;
    questProgress(p, "kill", m.def.id);
    if (boss) p.save.bossKills[m.def.id] = (p.save.bossKills[m.def.id] || 0) + 1;
    gainXp(w, p, xp);
    petXp(w, p, Math.round(xp * 0.7));
    rollPetDrop(w, p, boss ? 25 : m.elite ? 5 : 1);
    p.selfDirty = true;

    // добыча: у каждого своя
    const items: Item[] = [];
    if (boss) {
      const pool = (m.def.uniques ?? []).filter((id) => {
        const b = BASE_ITEMS[UNIQUES[id].base];
        return !b.classes || b.classes.includes(p.cls);
      });
      const uid = pool[Math.floor(Math.random() * pool.length)];
      if (uid) items.push(makeUnique(uid, m.level)); // уникальная вещь — уровня босса
      for (let i = 0; i < 2; i++) items.push(makeLoot(p.cls, m.level, rollRarity(Math.random, 0.45)));
      items.push({ ...makeItem("hp_potion", 1, 0), qty: 3 });
    } else {
      // шансы — data/balance.json loot (уменьшены по просьбе пользователя)
      const chance = p.forceDrop ? 1 : BAL.loot.item;
      if (Math.random() < chance) items.push(makeLoot(p.cls, m.level, rollRarity(Math.random)));
      if (Math.random() < (p.forceDrop ? 0 : BAL.loot.extra)) items.push(makeLoot(p.cls, m.level, rollRarity(Math.random)));
      if (Math.random() < BAL.loot.potion) items.push({ ...makeItem(Math.random() < 0.6 ? "hp_potion" : "mp_potion", 1, 0), qty: 1 });
    }
    // материалы кузнеца
    const mat = (id: string, qty: number) => items.push({ ...makeItem(id, 1, 0), qty });
    if (boss) { mat("ash_ore", 4 + Math.floor(Math.random() * 4)); mat("star_dust", 2 + Math.floor(Math.random() * 3)); }
    else {
      if (Math.random() * 100 < MATERIALS.ash_ore.dropPct) mat("ash_ore", 1 + Math.floor(Math.random() * 2));
      if (m.level >= 12 && Math.random() * 100 < MATERIALS.star_dust.dropPct * (m.elite ? 3 : 1)) mat("star_dust", 1);
    }
    if (m.elite) {
      const r = Math.max(rollRarity(Math.random, ELITE.lootBonus), Rarity.Rare) as Rarity;
      items.push(makeLoot(p.cls, m.level, r));
    }
    // легендарка: ярус не выше уровня источника, ближайший — чаще (shared/legendary.ts rollLegendary)
    const dr = LEGEND_TIERS.drop;
    if (Math.random() < (boss ? dr.boss : m.elite ? dr.elite : 0)) {
      const id = rollLegendary(p.cls, m.level);
      if (id) {
        const it = makeLegendary(id);
        items.push(it);
        w.system(`⚡ ${p.name} получил легендарный предмет [${it.name}]!`);
      }
    }
    dropBag(w, p, m.x, m.y, items, boss);
    if (boss) p.send("toast", { text: `${m.def.name} повержен! Заберите добычу.`, kind: "loot" });
  }
  if (boss) w.system(`${m.def.name} повержен! Герои: ${contributors.map((p) => p.name).join(", ")}.`);
}
