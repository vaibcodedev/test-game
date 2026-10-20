/** Получение маунтов (data/mounts.json): редкий трофей боссов, трофей рейда, награда арены. Продажа — WorldRoom "mount:buy". */
import { MOUNTS, type MountDef } from "../../../shared/mounts";
import type { Player } from "./Player";
import type { Mob } from "./Mob";
import type { World } from "./World";

const canHave = (p: Player, d: MountDef) => !d.faction || d.faction === p.faction;

/** Выдаёт маунт (без дублей), делает его текущим, если своего ещё не было. Возвращает true, если выдан. */
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

/** Хук убийства: шанс редкого маунта с босса. */
export function onKill(_w: World, killer: Player, m: Mob) {
  if (!m.def.boss) return;
  for (const d of Object.values(MOUNTS)) {
    if (d.source !== "boss" || !d.drop || !canHave(killer, d)) continue;
    if (m.level < d.drop.minLevel || killer.level < d.level - 5 || killer.save.mounts?.includes(d.id)) continue;
    if (Math.random() < d.drop.chance) awardMount(killer, d.id);
  }
}

/** Трофеи рейда: вызывается при победе над рейд-боссом (raid = id из data/raid.json, напр. "chaos_knight"). */
export function raidMountTrophies(p: Player, raid: string) {
  for (const d of Object.values(MOUNTS)) if (d.source === "raid" && d.raid === raid && Math.random() < (d.dropChance ?? 0.1) && canHave(p, d)) awardMount(p, d.id);
}

/** Награда арены: по числу побед за сезон. */
export function arenaMountRewards(p: Player, wins: number) {
  for (const d of Object.values(MOUNTS)) if (d.source === "arena" && d.arena && wins >= d.arena.wins && canHave(p, d)) awardMount(p, d.id);
}
