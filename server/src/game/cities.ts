/** Города на сервере: открытие телепортов, телепорт-кастинг (3 с) и задания. Всё проверяется здесь, клиент шлёт намерения. */
import { MOUNT_EARN } from "../../../shared/mounts";
import { addRep } from "./stable";
import { cityAtTile, cityById, cityKnown, homeCity, isEnemyCapital, stoneNear, teleportPrice, TELEPORT_CAST_MS } from "../../../shared/cities";
import { TILE } from "../../../shared/constants";
import { FACTIONS, type FactionId } from "../../../shared/factions";
import { makeItem, Rarity } from "../../../shared/items";
import { QUESTS, QUEST_GIVERS, QUEST_MAX_ACTIVE } from "../../../shared/quests";
import { MERCHANT_RANGE } from "../../../shared/constants";
import { npcRefusal } from "../../../shared/npcs";
import type { On } from "../rooms/common";
import { addItem } from "./inventory";
import type { Player } from "./Player";
import { gainXp } from "./rewards";
import type { World } from "./World";
import { T } from "../../../shared/texts";

const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });

/** Каждый тик: открытие города при первом визите пешком (своя столица известна сразу, чужая не открывается) и ход каста телепорта. */
export function tickCities(w: World) {
  if (w.opts.mobs === false) return;
  for (const p of w.players.values()) {
    if (p.dead || p.team !== 0) continue;
    const found = (p.save.cities ??= []);
    const home = homeCity(p.faction);
    if (!found.includes(home.id)) {
      found.push(home.id);
      p.selfDirty = true;
    }
    const c = cityAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    if (c && !found.includes(c.id) && !isEnemyCapital(c, p.faction)) {
      found.push(c.id);
      p.selfDirty = true;
      p.send("toast", { text: T("srv.cities.80", { name: c.name }), kind: "level" });
    }
    const t = p.tele;
    if (!t) continue;
    if (Math.hypot(p.x - t.x, p.y - t.y) > 0.5 || p.input.mx || p.input.my || p.moveTo || p.stunUntil > w.time) {
      w.breakMount(p);
    } else if (w.time >= t.until) {
      p.tele = null;
      p.send("mountcast", { ms: 0 });
      if (t.dest) { // телепорт не к камню (в форт, в лагерь осады): тот же каст, без цены
        w.emit({ t: "tp", id: p.id, ph: "go", x: p.x, y: p.y });
        p.unit.x = t.dest.x; p.unit.y = t.dest.y;
        p.moveTo = null; p.targetId = null;
        p.nav.reset();
        p.selfDirty = true;
        w.emit({ t: "tp", id: p.id, ph: "arrive", x: p.x, y: p.y });
        t.after?.();
        continue;
      }
      const to = cityById(t.to);
      if (!to || p.save.gold < t.price) { w.emit({ t: "tp", id: p.id, ph: "cancel", x: p.x, y: p.y }); continue; }
      w.emit({ t: "tp", id: p.id, ph: "go", x: p.x, y: p.y });
      p.save.gold -= t.price;
      p.unit.x = to.arrive.x;
      p.unit.y = to.arrive.y;
      p.moveTo = null;
      p.nav.reset();
      p.selfDirty = true;
      w.emit({ t: "tp", id: p.id, ph: "arrive", x: to.arrive.x, y: to.arrive.y });
      p.send("toast", { text: T("srv.cities.81", { name: to.name, price: t.price }), kind: "info" });
    }
  }
}

/** Каст телепорта в точку (в форт, в лагерь осады): тот же каст, полоса, эффект и прерывание (движение, урон), что у камня. false — нельзя начать сейчас. */
export function castTeleport(w: World, p: Player, to: { x: number; y: number }, name: string, after?: () => void): boolean {
  if (p.tele || p.mountCast || p.stunUntil > w.time || p.dead) return false;
  w.breakMount(p);
  p.input = { mx: 0, my: 0 };
  p.moveTo = null;
  p.tele = { until: w.time + TELEPORT_CAST_MS, x: p.x, y: p.y, to: "", price: 0, dest: to, after };
  p.send("mountcast", { ms: TELEPORT_CAST_MS, name: `Телепорт: ${name}`, tp: 1 });
  w.emit({ t: "tp", id: p.id, ph: "cast", x: p.x, y: p.y, sx: p.x, sy: p.y, ms: TELEPORT_CAST_MS });
  return true;
}

/** Начать телепорт к открытому городу: рядом с камнем, не в бою, хватает золота. */
export function startTeleport(w: World, p: Player, id: unknown) {
  if (typeof id !== "string" || p.dead || p.team !== 0 || w.opts.mobs === false) return;
  const from = stoneNear(p.x, p.y);
  if (!from) return err(p, T("srv.cities.82"));
  const to = cityById(id);
  const found = p.save.cities ?? [];
  if (isEnemyCapital(from, p.faction)) return err(p, T("srv.cities.83", { name: from.name, name2: FACTIONS[from.capital as FactionId]?.name ?? "" }));
  if (!to || to.id === from.id || !cityKnown(to, found, p.faction)) return err(p, T("srv.cities.84"));
  if (p.tele) return;
  if (p.inCombat(w.time)) return err(p, T("srv.cities.85"));
  if (p.stunUntil > w.time || p.mountCast) return;
  const price = teleportPrice(from, to);
  if (p.save.gold < price) return err(p, T("srv.bags.58"));
  w.breakMount(p);
  p.input = { mx: 0, my: 0 };
  p.moveTo = null;
  p.tele = { until: w.time + TELEPORT_CAST_MS, x: p.x, y: p.y, to: to.id, price };
  p.send("mountcast", { ms: TELEPORT_CAST_MS, name: T("srv.cities.791", { name: to.name }), tp: 1 });
  w.emit({ t: "tp", id: p.id, ph: "cast", x: p.x, y: p.y, sx: from.stone.x, sy: from.stone.y, ms: TELEPORT_CAST_MS });
}

// ---------- задания ----------
const qs = (p: Player) => (p.save.quests ??= { active: {}, done: [] });

/** Прогресс «убить» / «добыть»: кто выполняет — те, у кого задание активно. */
export function questProgress(p: Player, kind: "kill" | "gather", target: string, n = 1) {
  const q = p.save.quests;
  if (!q) return;
  let changed = false;
  for (const [id, have] of Object.entries(q.active)) {
    const def = QUESTS[id];
    if (!def || def.kind !== kind || def.target !== target || have >= def.n) continue;
    q.active[id] = Math.min(def.n, have + n);
    changed = true;
    if (q.active[id] >= def.n) p.send("toast", { text: T("srv.cities.86", { name: def.name }), kind: "level" });
  }
  if (changed) p.selfDirty = true;
}

/** Ошибка заказчика: далеко или чужой фракции; null — можно. */
function giverErr(w: World, p: Player, giver: string): string | null {
  const g = QUEST_GIVERS.find((x) => x.id === giver);
  if (!g || w.dist(p, g) > MERCHANT_RANGE) return T("srv.cities.87");
  return npcRefusal({ kind: "quest", name: g.name, x: g.x, y: g.y }, p.faction);
}

function accept(w: World, p: Player, id: unknown) {
  const def = typeof id === "string" ? QUESTS[id] : undefined;
  if (!def || p.dead) return;
  const ge = giverErr(w, p, def.giver);
  if (ge) return err(p, ge);
  const q = qs(p);
  if (q.done.includes(def.id) || def.id in q.active) return;
  if (p.level < def.level) return err(p, T("srv.cities.88", { level: def.level }));
  if (Object.keys(q.active).length >= QUEST_MAX_ACTIVE) return err(p, T("srv.cities.89"));
  q.active[def.id] = 0;
  p.selfDirty = true;
  p.send("toast", { text: T("srv.cities.90", { name: def.name }), kind: "info" });
}

function turnIn(w: World, p: Player, id: unknown) {
  const def = typeof id === "string" ? QUESTS[id] : undefined;
  if (!def || p.dead) return;
  const ge = giverErr(w, p, def.giver);
  if (ge) return err(p, ge);
  const q = qs(p);
  if ((q.active[def.id] ?? -1) < def.n) return;
  const backup = JSON.stringify(p.save.inventory);
  if (def.reward.item && !addItem(p, { ...makeItem(def.reward.item.base, 1, Rarity.Common), qty: def.reward.item.qty })) {
    p.save.inventory = JSON.parse(backup);
    return err(p, T("srv.biomes.76"));
  }
  delete q.active[def.id];
  q.done.push(def.id);
  p.save.gold += def.reward.gold;
  gainXp(w, p, def.reward.xp);
  addRep(p, MOUNT_EARN.repQuest);
  p.selfDirty = true;
  p.send("toast", { text: T("srv.cities.91", { name: def.name, gold: def.reward.gold, xp: def.reward.xp, repquest: MOUNT_EARN.repQuest }), kind: "loot" });
}

export function registerCities(on: On, w: () => World) {
  on<{ id: unknown }>("tp:go", (p, m) => startTeleport(w(), p, m.id));
  on<{ id: unknown }>("quest:accept", (p, m) => accept(w(), p, m.id));
  on<{ id: unknown }>("quest:turn", (p, m) => turnIn(w(), p, m.id));
}
