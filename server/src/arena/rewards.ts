/** Выдача сезонных наград арены: титул, рамка и уникальный медальон по рангу, уровня игрока. */
import { MODE_NAMES, rankById, RANKS, type ArenaMode } from "../../../shared/arena";
import { makeUnique } from "../../../shared/items";
import { addItem } from "../game/inventory";
import type { Player } from "../game/Player";
import { services } from "./registry";
import { T } from "../../../shared/texts";

/** Выдаёт все ожидающие награды игроку в мире. Медальон ждёт, пока в сумке не появится место. */
export function deliverArenaRewards(p: Player) {
  const store = services.arena;
  const s = p.save;
  for (const r of store.pendingRewards(p.name.toLowerCase())) {
    const rank = rankById(r.rank) ?? RANKS[0];
    const id = `${rank.id}-${r.mode}-s${r.season}`;
    s.titles ??= [];
    if (!s.titles.some((t) => t.id === id)) {
      s.titles.push({ id, name: T("srv.rewards.778", { title: rank.title, arenamode: MODE_NAMES[r.mode as ArenaMode], season: r.season }), rank: rank.id });
      // активные титул и рамка — по лучшему рангу
      const best = s.titles.reduce((a, b) => (RANKS.findIndex((x) => x.id === b.rank) > RANKS.findIndex((x) => x.id === a.rank) ? b : a));
      s.title = best.name;
      s.frame = best.rank;
    }
    // медальон — по уровню игрока на момент выдачи (ранг задаёт его силу через запись UNIQUES)
    if (!addItem(p, makeUnique(rank.reward, s.level))) {
      p.send("toast", { text: T("srv.rewards.34"), kind: "error" });
      continue;
    }
    store.markDelivered(r.id);
    // маунты арены — сборка у конюшего из Печатей гладиатора (задача 142, server/src/arena/gladiator.ts)
    p.send("toast", { text: T("srv.rewards.35", { season: r.season, arenamode: MODE_NAMES[r.mode as ArenaMode], name: rank.name }), kind: "loot" });
  }
  p.applyCosmetics();
  p.selfDirty = true;
}
