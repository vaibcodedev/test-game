/**
 * Офлайн: конюшня и печати маунтов (задача 142). Скорость по ярусу (5 ступеней), трофеи рейда — привязанные печати, без дублей и с учётом фракции;
 * «Печать скакуна» до изучения передаётся (isBound = false), изучение — маунт в коллекции; покупка у конюшего (золото, репутация, знаки),
 * сборка из деталей (детали списываются), Печати гладиатора (за бой) и сборка аренного маунта с порогом рейтинга, отказ конюшего чужой фракции.
 */
import assert from "node:assert/strict";
import { isBound, type Item } from "../shared/items";
import { GLADIATOR, gladiatorSeals, MOUNTS, MOUNT_ECONOMY, MOUNT_SPEEDS, mountHours, partBase, sealBase, sealMount, stableOffer } from "../shared/mounts";
import { STABLEMASTERS } from "../shared/stables";
import { npcFaction } from "../shared/npcs";
import { raidMountTrophies } from "../server/src/game/mountDrops";
import { learnSeal, makePart, stableBuy, stableCraft } from "../server/src/game/stable";

// ---------- скорость: 5 ступеней по ярусу, растёт с редкостью ----------
const sp = (["common", "uncommon", "rare", "epic", "legendary"] as const).map((t) => MOUNT_SPEEDS[t]);
for (let i = 1; i < sp.length; i++) assert.ok(sp[i] > sp[i - 1], "скорость растёт с ярусом");
for (const d of Object.values(MOUNTS)) assert.equal(d.speed, MOUNT_SPEEDS[d.tier], `${d.id}: скорость по ярусу`);
assert.equal(new Set(Object.values(MOUNTS).map((d) => d.speed)).size, 5, "ровно 5 ступеней");

// ---------- цены от дохода (BALANCE.md «142 маунты»): часы игры на своём уровне в целевых рамках яруса ----------
for (const d of Object.values(MOUNTS)) {
  const h = mountHours(d), [lo, hi] = (MOUNT_ECONOMY.targets as unknown as Record<string, [number, number]>)[d.tier];
  for (const [how, v] of [["купить", h.buy], ["собрать", h.craft]] as const) if (v !== null) assert.ok(v >= lo && v <= hi, `${d.id}: ${how} за ${v.toFixed(1)} ч, цель ${lo}–${hi}`);
  if (h.seal !== null) assert.ok(h.seal >= lo, `${d.id}: печать в среднем за ${h.seal.toFixed(1)} ч — быстрее цели ${lo}`);
}

type P = { name: string; faction: string; level: number; dead: boolean; x: number; y: number; selfDirty: boolean; toasts: string[]; send: (t: string, d: { text: string }) => void;
  save: { gold: number; rep?: number; marks?: number; mounts?: string[]; mount?: string; inventory: (Item | null)[]; pendingItems?: Item[] } };
const stableOf = (f: string) => STABLEMASTERS.find((n) => npcFaction(n.x, n.y) === f)!;
const mk = (faction: string, level = 70): P => {
  const at = stableOf(faction);
  const p: P = { name: "t", faction, level, dead: false, x: at.x, y: at.y + 20, selfDirty: false, toasts: [], send: (_t, d) => p.toasts.push(d.text),
    save: { gold: 1000000, inventory: Array(24).fill(null) } };
  return p;
};
const w = { dist: (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) } as never;
const seals = (p: P, id: string) => p.save.inventory.filter((it) => it?.base === sealBase(id));
const slot = (p: P, id: string) => p.save.inventory.findIndex((it) => it?.base === sealBase(id));

// ---------- рейд: привязанные печати, фракция, без дублей ----------
const rnd = Math.random;
Math.random = () => 0;
const a = mk("solgard");
raidMountTrophies(a as never, "chaos_knight");
assert.equal(seals(a, "nightmare").length, 1, "рейд: печать кошмарного скакуна");
assert.equal(seals(a, "phoenix").length, 1, "рейд: печать феникса");
assert.ok(seals(a, "phoenix").every((it) => it && isBound(it)), "рейдовая печать привязана сразу");
assert.ok(a.save.inventory.some((it) => it?.base === partBase("feather") && isBound(it)), "перо феникса — привязанная деталь");
raidMountTrophies(a as never, "chaos_knight");
assert.equal(seals(a, "phoenix").length, 1, "без дублей печати");
Math.random = () => 0.99;
const b = mk("solgard");
raidMountTrophies(b as never, "chaos_knight");
assert.equal(seals(b, "phoenix").length, 0, "шанс не выпал");
Math.random = rnd;

// ---------- покупка у конюшего: печать в сумку, передаваемая до изучения ----------
const c = mk("solgard", 40);
stableBuy(w, c as never, "boar");
assert.equal(seals(c, "boar").length, 1, "купленная печать в сумке");
assert.equal(c.save.gold, 1000000 - MOUNTS.boar.price);
assert.ok(!isBound(seals(c, "boar")[0]!), "до изучения печать передаётся (не привязана)");
assert.equal(sealMount(sealBase("boar")), "boar");
stableBuy(w, c as never, "boar");
assert.equal(seals(c, "boar").length, 1, "вторая печать того же маунта не продаётся");
// обмен: печать уходит другому герою, он её изучает
const d = mk("solgard", 40);
const i = slot(c, "boar"), moved = c.save.inventory[i]!;
c.save.inventory[i] = null;
d.save.inventory[0] = moved;
learnSeal(d as never, 0);
assert.ok(d.save.mounts?.includes("boar"), "изучение: маунт в коллекции");
assert.equal(d.save.inventory[0], null, "печать исчезла — маунт привязан к герою");
assert.equal(d.save.mount, "boar", "изученный маунт выбран");

// боевые в гербовой броне: репутация и знаки
const e = mk("solgard", 40);
stableBuy(w, e as never, "war_horse");
assert.equal(seals(e, "war_horse").length, 0, "без репутации и знаков — нельзя");
e.save.rep = MOUNTS.war_horse.rep!.rep; e.save.marks = MOUNTS.war_horse.rep!.marks + 5;
stableBuy(w, e as never, "war_horse");
assert.equal(seals(e, "war_horse").length, 1, "репутация и знаки есть — печать");
assert.equal(e.save.marks, 5, "знаки списаны");
assert.equal(e.save.rep, MOUNTS.war_horse.rep!.rep, "репутация — порог, не списывается");
stableBuy(w, e as never, "skel_horse");
assert.equal(seals(e, "skel_horse").length, 0, "маунт чужой фракции не продаётся");
// конюший чужой фракции не торгует
const u = mk("umbrath", 40);
const sol = stableOf("solgard");
u.x = sol.x; u.y = sol.y + 20; u.save.rep = 9999; u.save.marks = 999;
stableBuy(w, u as never, "skel_horse");
assert.equal(seals(u, "skel_horse").length, 0, "у конюшего Сольгарда умбрат не покупает");
assert.ok(u.toasts.some((t) => t.includes("не торгует с врагами")), "отказ чужой фракции");

// ---------- сборка из деталей ----------
const f = mk("solgard", 60);
stableCraft(w, f as never, "lion");
assert.equal(seals(f, "lion").length, 0, "без деталей не собрать");
const need = MOUNTS.lion.craft!.parts;
let k = 0;
for (const [part, n] of Object.entries(need)) f.save.inventory[k++] = makePart(part, n + 1);
stableCraft(w, f as never, "lion");
assert.equal(seals(f, "lion").length, 1, "собрано: печать льва");
assert.ok(!isBound(seals(f, "lion")[0]!), "из передаваемых деталей — передаваемая печать");
for (const [part] of Object.entries(need)) assert.equal(f.save.inventory.filter((it) => it?.base === partBase(part)).reduce((s, it) => s + (it!.qty ?? 1), 0), 1, `${part}: списано ровно сколько нужно`);
assert.equal(f.save.gold, 1000000 - MOUNTS.lion.craft!.gold);
learnSeal(f as never, slot(f, "lion"));
assert.ok(f.save.mounts?.includes("lion"));

// ---------- арена: Печати гладиатора и сборка с порогом рейтинга ----------
assert.equal(gladiatorSeals("loss", 0, 1500, false), GLADIATOR.loss, "участие — немного");
assert.equal(gladiatorSeals("win", 1, 1500, false), GLADIATOR.win);
assert.ok(gladiatorSeals("win", 4, 1500, false) > GLADIATOR.win, "серия — больше");
assert.ok(gladiatorSeals("win", 1, 2200, false) > GLADIATOR.win, "высокий рейтинг — больше");
assert.equal(gladiatorSeals("win", 9, 2500, true), GLADIATOR.bot, "бой с ботами — без бонусов");
const g = mk("solgard", 70);
const gneed = MOUNTS.griffin.craft!;
g.save.inventory[0] = makePart("gladiator", gneed.parts.gladiator);
assert.ok(isBound(g.save.inventory[0]!), "печати гладиатора привязаны");
assert.ok(stableOffer(MOUNTS.griffin, { ...g.save, level: g.level, faction: g.faction, arenaRating: 1500 }).missCraft.some((s) => s.startsWith("рейтинг арены")), "каталог: рейтинг Y/Z");
stableCraft(w, g as never, "griffin", 1500);
assert.equal(seals(g, "griffin").length, 0, "рейтинг ниже порога — нельзя");
stableCraft(w, g as never, "griffin", gneed.arenaRating!);
assert.equal(seals(g, "griffin").length, 1, "печати и рейтинг есть — грифон собран");
assert.ok(isBound(seals(g, "griffin")[0]!), "аренная печать скакуна привязана сразу");
assert.equal(g.save.inventory.filter((it) => it?.base === partBase("gladiator")).length, 0, "печати гладиатора списаны");

console.log("mount-awards: OK");
