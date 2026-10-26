/** Трофеи маунтов (data/mounts.json, задача 142): печати и детали с боссов, рейда, награды арены. Покупка и сборка — stable.ts. */
import { canRide, MOUNTS, PARTS, sealBase } from "../../../shared/mounts";
import type { Player } from "./Player";
import type { Mob } from "./Mob";
import type { World } from "./World";
import { awardMount, giveItem, giveSeal, makePart, onKillEarn } from "./stable";
import { T } from "../../../shared/texts";

export { awardMount };

/** Уже есть: в коллекции или печать в сумке. */
const has = (p: Player, id: string) => !!p.save.mounts?.includes(id) || p.save.inventory.some((it) => it?.base === sealBase(id));

/** Хук убийства (мобы вне фракций): репутация и знаки; с босса — шанс печати и деталей для конюшего. */
export function onKill(_w: World, killer: Player, m: Mob) {
  onKillEarn(killer, m);
  if (!m.def.boss) return;
  for (const d of Object.values(MOUNTS)) {
    if (d.source !== "boss" || !d.drop || !canRide(d, killer.faction)) continue;
    if (m.level < d.drop.minLevel || killer.level < d.level - 5 || has(killer, d.id)) continue;
    if (Math.random() < d.drop.chance) giveSeal(killer, d.id);
  }
  for (const part of Object.values(PARTS)) {
    if (!part.drop || m.level < part.drop.minLevel) continue;
    if (Math.random() < part.drop.chance) { const it = makePart(part.id); giveItem(killer, it); killer.send("toast", { text: T("srv.mountDrops.118", { name: it.name }), kind: "loot" }); }
  }
}

/** Трофеи рейда: вызывается при победе над рейд-боссом (raid = id из data/raid.json, напр. "chaos_knight"). Печати привязаны. */
export function raidMountTrophies(p: Player, raid: string) {
  for (const d of Object.values(MOUNTS)) if (d.source === "raid" && d.raid === raid && Math.random() < (d.dropChance ?? 0.1) && canRide(d, p.faction) && !has(p, d.id)) giveSeal(p, d.id);
  for (const part of Object.values(PARTS)) if (part.raid === raid && Math.random() < (part.dropChance ?? 0.1)) giveItem(p, makePart(part.id));
}
