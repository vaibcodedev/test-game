/**
 * Награды без сервера: убийство моба (grantKillRewards — доля группы, дальность, боссы, отказ в трофеях, подземелье раз в сутки),
 * рейд (grantRaidRewards — откат, pity, мешки, pendingItems), мировой босс (grantWb — пороги, сутки, неделя на аккаунт, pity, giveAll),
 * и запись наград одной транзакцией (saveMany: сбой посреди — откат всех).
 * Запуск: npx tsx tests/unit/rewards.ts
 */
import { World } from "../../server/src/game/World";
import { WorldState } from "../../server/src/rooms/schema";
import { Mob } from "../../server/src/game/Mob";
import { bossLootDenied, gainXp, grantKillRewards } from "../../server/src/game/rewards";
import { collectBags, deliverPending, grantRaidRewards, lockoutLeft, raidState } from "../../server/src/raid/rewards";
import { flushBags, giveAll, grantWb, wbLocked, wbState, type WbGrantCtx } from "../../server/src/worldboss/rewards";
import { WorldBossDirector, type WbEntry } from "../../server/src/worldboss/director";
import type { RaidDirector } from "../../server/src/raid/director";
import type { Player } from "../../server/src/game/Player";
import { MOBS } from "../../shared/mobs";
import { ZB_LOOT } from "../../shared/zoneBosses";
import { xpForKill, xpToNext } from "../../shared/formulas";
import { MAX_LEVEL } from "../../shared/constants";
import { BAL } from "../../shared/balance";
import { GP } from "../../shared/gameplay";
import { RAID, RAID_BOSS, RAID_CFG } from "../../shared/raid";
import { WB, WB_BOSSES, wbDayKey, type WbBossDef } from "../../shared/worldBoss";
import { weekKey } from "../../shared/bannerWar";
import { LEGENDARIES, legendaryFits } from "../../shared/legendary";
import { Rarity } from "../../shared/items";
import { assert, done, knownFail, section, test, withRandom } from "./lib";
import { countIn, drop, emptyBag, fillBag, gear, hero, memDb, register, stack, world, type Hero } from "./fixtures";

const w = world();
const H = 3600_000, DAY = 24 * H, WEEK = 7 * DAY;
const NORMAL = Object.values(MOBS).find((d) => !d.boss && !d.level)!;
const ZONE_BOSS = MOBS.sol_rune_golem; // босс стартовых земель 30 ур. (своя таблица ZB_LOOT)
const DG_BOSS = MOBS.ashlord; // босс подземелья с уникальными вещами, 95 ур.

function mob(def = NORMAL, level = 30, near?: Player): Mob {
  const at = near ? { x: near.unit.x + 40, y: near.unit.y } : w.map.playerSpawn;
  const m = new Mob(w.uid(def.boss ? "b" : "m"), def, def.level ?? level, at);
  m.unit.x = at.x;
  m.unit.y = at.y;
  return m;
}
/** Группа героев рядом друг с другом: уровень, пустая сумка, без опыта. */
function party(n: number, level = 30): Hero[] {
  const out: Hero[] = [];
  for (let i = 0; i < n; i++) {
    const p = hero(w, "warrior", undefined, level);
    p.unit.x += i * 10;
    p.save.xp = 0;
    p.save.gold = 0;
    emptyBag(p);
    out.push(p);
  }
  return out;
}
const hit = (m: Mob, ...ps: Player[]) => { for (const p of ps) m.damageBy.set(p.id, 100); };
const share = (n: number) => Math.min(1, GP.rewards.shareBase + GP.rewards.shareGroup / n);
/** Без случайных находок: Math.random = 0.99 (мимо всех шансов, золото у верхней границы). */
const noLuck = <T>(fn: () => T) => withRandom([0.99], fn);
const bagItems = (p: Player) => [...p.bags.values()].flatMap((b) => b.items);

// ================================================================ убийство моба
section("Награды за убийство: группа и дальность");

await test("один герой: опыт по xpForKill целиком, золото в пределах моба, счётчики убийств", () => {
  const [p] = party(1);
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  noLuck(() => grantKillRewards(w, m, p));
  assert.equal(p.save.xp, xpForKill(m.stats.xp, m.level, p.level));
  const [g0, g1] = m.stats.gold;
  assert.ok(p.save.gold >= g0 && p.save.gold <= g1, `золото ${p.save.gold} вне [${g0}, ${g1}]`);
  assert.equal(p.save.kills, 1);
  assert.equal(p.save.mobKills?.[NORMAL.id], 1);
  assert.equal(p.bags.size, 0, "без удачи мешка нет");
  drop(w, p);
});

for (const n of [2, 3, 4, 5]) {
  await test(`группа из ${n}: каждый получает ${Math.round(share(n) * 100)} % опыта (70 % + 30 %/n), золото — поровну, сумма = одному броску`, () => {
    const ps = party(n);
    const m = mob(NORMAL, 30, ps[0]);
    hit(m, ...ps);
    noLuck(() => grantKillRewards(w, m, ps[0]));
    const want = Math.round(xpForKill(m.stats.xp, m.level, 30) * share(n));
    // правило владельца 2026-10-30: золото обычного моба делится поровну, остаток — первым; сумма не теряется и не удваивается
    const total = Math.round(m.stats.gold[0] + 0.99 * (m.stats.gold[1] - m.stats.gold[0]));
    for (const p of ps) {
      assert.equal(p.save.xp, want, `${p.name}: опыт`);
      assert.equal(p.save.kills, 1);
      assert.ok(Math.abs(p.save.gold - total / n) < 1, `${p.name}: доля ${p.save.gold} при сумме ${total} на ${n}`);
    }
    assert.equal(ps.reduce((a, p) => a + p.save.gold, 0), total, "сумма долей = броску");
    drop(w, ...ps);
  });
}

await test("разные уровни в группе: опыт каждому по своему уровню (младшему больше, старшему меньше)", () => {
  const [lo, hi] = [party(1, 25)[0], party(1, 40)[0]];
  hi.unit.x = lo.unit.x + 20;
  hi.unit.y = lo.unit.y;
  const m = mob(NORMAL, 30, lo);
  hit(m, lo, hi);
  noLuck(() => grantKillRewards(w, m, lo));
  assert.equal(lo.save.xp, Math.round(xpForKill(m.stats.xp, 30, 25) * share(2)));
  assert.equal(hi.save.xp, Math.round(xpForKill(m.stats.xp, 30, 40) * share(2)));
  assert.ok(lo.save.xp > hi.save.xp);
  drop(w, lo, hi);
});

await test("участник дальше contribRange — ничего не получает и не уменьшает долю остальных", () => {
  const [a, b] = party(2);
  b.unit.x = a.unit.x + GP.rewards.contribRange + 200;
  const m = mob(NORMAL, 30, a);
  hit(m, a, b);
  noLuck(() => grantKillRewards(w, m, a));
  assert.equal(a.save.xp, xpForKill(m.stats.xp, 30, 30), "доля как у одиночки");
  assert.equal(b.save.xp, 0);
  assert.equal(b.save.gold, 0);
  assert.equal(b.save.kills, 0);
  drop(w, a, b);
});

await test("ушедший из мира участник пропускается без ошибок; без участников и убийцы — никто ничего не получает", () => {
  const [a, b] = party(2);
  const m = mob(NORMAL, 30, a);
  hit(m, a, b);
  drop(w, b);
  noLuck(() => grantKillRewards(w, m));
  assert.equal(a.save.kills, 1);
  assert.equal(b.save.kills, 0);
  const m2 = mob(NORMAL, 30, a);
  noLuck(() => grantKillRewards(w, m2));
  assert.equal(a.save.kills, 1, "без урона и убийцы — без награды");
  drop(w, a);
});

await test("призванный предмет босса без опыта (summoned, xp 0) — без наград", () => {
  const [p] = party(1);
  const m = mob(NORMAL, 30, p);
  m.summoned = true;
  (m as { def: unknown }).def = { ...NORMAL, xp: 0 };
  hit(m, p);
  grantKillRewards(w, m, p);
  assert.equal(p.save.kills, 0);
  assert.equal(p.save.xp, 0);
  assert.equal(p.save.gold, 0);
  drop(w, p);
});

await test("павший до раздачи участник рядом получает свою долю (как в рейде: «и павшим»)", () => {
  const [a, b] = party(2);
  b.dead = true;
  const m = mob(NORMAL, 30, a);
  hit(m, a, b);
  noLuck(() => grantKillRewards(w, m, a));
  assert.equal(b.save.kills, 1);
  assert.equal(b.save.xp, Math.round(xpForKill(m.stats.xp, 30, 30) * share(2)));
  b.dead = false;
  drop(w, a, b);
});

await test("серый моб (на 15 уровней ниже): опыта не больше 10 % базового", () => {
  const [p] = party(1, 45);
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  noLuck(() => grantKillRewards(w, m, p));
  assert.ok(p.save.xp <= Math.ceil(m.stats.xp * 0.1), `опыт ${p.save.xp} > 10 % от ${m.stats.xp}`);
  drop(w, p);
});

await test("B6: серый моб (на 15 уровней ниже) — без опыта (решение владельца 2026-10-30, GP.rewards.greyLevels)", () => {
  const [p] = party(1, 45);
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  try {
    noLuck(() => grantKillRewards(w, m, p));
    assert.equal(p.save.xp, 0);
  } finally { drop(w, p); }
});

await test("золото группы: нечётная сумма на 3 — остаток не теряется, никто не получает больше доли + 1", () => {
  const ps = party(3);
  const m = mob(NORMAL, 30, ps[0]);
  (m.stats as { gold: [number, number] }).gold = [100, 100];
  hit(m, ...ps);
  noLuck(() => grantKillRewards(w, m, ps[0]));
  const got = ps.map((p) => p.save.gold);
  assert.equal(got.reduce((a, b) => a + b, 0), 100, got.join("/"));
  assert.deepEqual([...got].sort(), [33, 33, 34]);
  drop(w, ...ps);
});

await test("моб на greyLevels − 1 ниже — ещё с опытом", () => {
  const [p] = party(1, 30 + GP.rewards.greyLevels - 1);
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  noLuck(() => grantKillRewards(w, m, p));
  assert.ok(p.save.xp > 0);
  drop(w, p);
});

await test("бонус точек фракции (war.mobBonus): опыт ×xp, золото ×gold", () => {
  const [p] = party(1);
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  const wr = w as unknown as { war?: unknown };
  const old = wr.war;
  wr.war = { mobBonus: () => ({ xp: 2, gold: 3, mats: 1, loot: 1 }) };
  try { noLuck(() => grantKillRewards(w, m, p)); } finally { wr.war = old; }
  assert.equal(p.save.xp, Math.round(xpForKill(m.stats.xp, 30, 30) * 2));
  // бросок золота сначала округляется (делится поровну целыми, решение владельца 2026-10-30), бонус — к доле
  assert.equal(p.save.gold, Math.round(Math.round(m.stats.gold[0] + 0.99 * (m.stats.gold[1] - m.stats.gold[0])) * 3));
  drop(w, p);
});

await test("forceDrop: обычный моб всегда роняет вещь в личный мешок героя (не в сумку)", () => {
  const [p] = party(1);
  p.forceDrop = true;
  const m = mob(NORMAL, 30, p);
  hit(m, p);
  noLuck(() => grantKillRewards(w, m, p));
  assert.equal(p.bags.size, 1);
  assert.ok(bagItems(p).some((it) => !it.qty || it.qty === 1));
  assert.ok(p.save.inventory.every((c) => c === null), "сумка не тронута");
  p.forceDrop = false;
  drop(w, p);
});

await test("gainXp: несколько уровней за раз, на MAX_LEVEL опыт обнуляется и не растёт", () => {
  const [p] = party(1, 10);
  const need = xpToNext(10) + xpToNext(11) + 5;
  gainXp(w, p, need);
  assert.equal(p.level, 12);
  assert.equal(p.save.xp, 5);
  p.save.level = MAX_LEVEL - 1;
  p.save.xp = 0;
  gainXp(w, p, xpToNext(MAX_LEVEL - 1) * 3);
  assert.equal(p.level, MAX_LEVEL);
  assert.equal(p.save.xp, 0);
  gainXp(w, p, 1000);
  assert.equal(p.save.xp, 0);
  drop(w, p);
});

section("Награды за убийство: боссы");

await test("bossLootDenied: только боссы ниже bossLevelFree, граница — разница bossLevelGap включительно разрешена", () => {
  const gap = BAL.loot.bossLevelGap, lv = ZONE_BOSS.level!;
  const m = mob(ZONE_BOSS);
  assert.equal(bossLootDenied(m, { level: lv + gap }), false);
  assert.equal(bossLootDenied(m, { level: lv + gap + 1 }), true);
  assert.equal(bossLootDenied(mob(NORMAL, 10), { level: 100 }), false, "обычный моб");
  assert.equal(bossLootDenied(mob(DG_BOSS), { level: 100 }), false, "босс от bossLevelFree");
  // уровень босса — свой (def.level), подстроенный m.level не важен
  const m2 = mob(ZONE_BOSS);
  m2.level = 90;
  assert.equal(bossLootDenied(m2, { level: lv + gap + 1 }), true);
});

await test("босс стартовых земель: доля 100 % каждому, золото ×mult таблицы, личный мешок boss у каждого, bossKills", () => {
  const ps = party(3, ZONE_BOSS.level!);
  const m = mob(ZONE_BOSS, 0, ps[0]);
  hit(m, ...ps);
  noLuck(() => grantKillRewards(w, m, ps[0]));
  const zt = ZB_LOOT[ZONE_BOSS.id];
  for (const p of ps) {
    assert.equal(p.save.xp, xpForKill(m.stats.xp, m.level, p.level), "у босса доля не режется");
    assert.equal(p.save.gold, Math.round((m.stats.gold[0] + 0.99 * (m.stats.gold[1] - m.stats.gold[0])) * zt.gold.mult));
    assert.equal(p.save.bossKills[ZONE_BOSS.id], 1);
    assert.equal(p.bags.size, 1);
    assert.equal([...p.bags.values()][0].boss, true);
  }
  // мешки разные (личная добыча)
  assert.equal(new Set(ps.map((p) => [...p.bags.keys()][0])).size, 3);
  drop(w, ...ps);
});

await test("отказ в трофеях: старший на gap+1 — опыт есть, золота и мешка нет, сообщение; младший рядом получает всё", () => {
  const lv = ZONE_BOSS.level!;
  const [old] = party(1, lv + BAL.loot.bossLevelGap + 1);
  const [ok] = party(1, lv + BAL.loot.bossLevelGap);
  ok.unit.x = old.unit.x + 20;
  ok.unit.y = old.unit.y;
  const m = mob(ZONE_BOSS, 0, old);
  hit(m, old, ok);
  noLuck(() => grantKillRewards(w, m, old));
  assert.ok(old.save.xp > 0, "опыт должен быть");
  assert.equal(old.save.gold, 0);
  assert.equal(old.bags.size, 0);
  assert.equal(old.box.toasts().length >= 1, true);
  assert.ok(ok.save.gold > 0);
  assert.equal(ok.bags.size, 1);
  drop(w, old, ok);
});

await test("босс подземелья с уникальными: в мешке уникальная вещь класса, 2 вещи не ниже редкой, зелья, руда и пыль", () => {
  const [p] = party(1, DG_BOSS.level!);
  const m = mob(DG_BOSS, 0, p);
  hit(m, p);
  withRandom([0.5], () => grantKillRewards(w, m, p));
  const items = bagItems(p);
  assert.ok(items.some((it) => it.unique), "нет уникальной");
  assert.ok(items.filter((it) => !it.unique && !it.qty && !it.legendary).every((it) => it.rarity >= Rarity.Rare));
  assert.equal(items.find((it) => it.base === "hp_potion")?.qty, GP.rewards.bossPotionQty);
  assert.ok(countIn(items, "ash_ore") >= GP.rewards.bossOreMin);
  assert.ok(countIn(items, "star_dust") >= GP.rewards.bossDustMin);
  drop(w, p);
});

section("Подземелье: трофеи босса раз в сутки");

const dw = new World(new WorldState(), () => {}, { mobs: false, quiet: true, dungeon: true, map: w.map } as never);
function dgHero(level = DG_BOSS.level!): Hero {
  const p = hero(dw, "warrior", undefined, level);
  p.save.gold = 0;
  p.save.xp = 0;
  emptyBag(p);
  return p;
}
const dgMob = (p: Player) => { const m = new Mob(dw.uid("b"), DG_BOSS, DG_BOSS.level!, { x: p.unit.x + 30, y: p.unit.y }); m.unit.x = p.unit.x + 30; m.unit.y = p.unit.y; m.damageBy.set(p.id, 100); return m; };

await test("первое убийство за сутки — трофеи и отметка dgLoot; второе в те же сутки — опыт и счёт, без золота и мешка", () => {
  const p = dgHero();
  withRandom([0.5], () => grantKillRewards(dw, dgMob(p), p));
  assert.ok(p.save.dgLoot?.[DG_BOSS.id], "нет отметки");
  assert.equal(p.bags.size, 1);
  const g = p.save.gold, xp = p.save.xp;
  assert.ok(g > 0);
  withRandom([0.5], () => grantKillRewards(dw, dgMob(p), p));
  assert.equal(p.save.gold, g, "золото второй раз");
  assert.equal(p.bags.size, 1, "второй мешок");
  assert.equal(p.save.bossKills[DG_BOSS.id], 2);
  assert.equal(p.save.kills, 2);
  assert.ok(p.save.xp > xp || p.level > DG_BOSS.level!, "опыт за повтор");
  assert.ok(p.box.toasts().some((t) => t.includes("уже получены")));
  drop(dw, p);
});

await test("на следующие сутки трофеи снова доступны", () => {
  const p = dgHero();
  (p.save.dgLoot ??= {})[DG_BOSS.id] = Date.now() - DAY - H;
  withRandom([0.5], () => grantKillRewards(dw, dgMob(p), p));
  assert.equal(p.bags.size, 1);
  assert.ok(p.save.gold > 0);
  drop(dw, p);
});

await test("подземелье: у двух героев отметки независимы (второй не теряет трофеи из-за первого)", () => {
  const a = dgHero(), b = dgHero();
  (a.save.dgLoot ??= {})[DG_BOSS.id] = Date.now();
  const m = dgMob(a);
  m.damageBy.set(b.id, 100);
  b.unit.x = a.unit.x + 10;
  b.unit.y = a.unit.y;
  withRandom([0.5], () => grantKillRewards(dw, m, a));
  assert.equal(a.bags.size, 0);
  assert.equal(b.bags.size, 1);
  drop(dw, a, b);
});

// ================================================================ рейд
section("Рейд: награды, откат, pity, мешки");

function raidDir(ps: Player[], rand: () => number, bots: Player[] = []): RaidDirector {
  const byKey = new Map<string, Player>();
  const members = [...ps, ...bots].map((p) => ({ key: p.name.toLowerCase(), bot: bots.includes(p) }));
  for (const p of [...ps, ...bots]) byKey.set(p.name.toLowerCase(), p);
  const boss = { stats: { gold: [100, 200] as [number, number], xp: 5000 }, level: 100, def: { id: RAID_BOSS.id }, x: ps[0].unit.x, y: ps[0].unit.y };
  return { w, boss, rand, members, byKey, bots: new Set(bots) } as unknown as RaidDirector;
}
const raidHero = () => party(1, 100)[0];

await test("первая победа: золото ×goldMul, 2 вещи ≥ minRarity ilvl 100, материалы, титул, откат добычи", () => {
  const p = raidHero();
  const now = Date.now();
  const loot = withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), now)).get(p.name.toLowerCase())!;
  assert.equal(loot.locked, false);
  assert.equal(loot.gold, Math.round((100 + 0.99 * 100) * RAID.rewards.drops.goldMul));
  assert.equal(p.save.gold, loot.gold);
  const gearItems = loot.items.filter((it) => !it.qty && !it.legendary);
  assert.equal(gearItems.length, RAID.rewards.drops.items);
  assert.ok(gearItems.every((it) => it.ilvl === RAID.rewards.drops.ilvl && it.rarity >= RAID.rewards.drops.minRarity));
  assert.ok(countIn(loot.items, "ash_ore") >= RAID.rewards.drops.ashOre[0]);
  assert.equal(loot.title, RAID.title.name);
  assert.equal(raidState(p.save).lootAt[RAID_BOSS.id], now);
  assert.ok(lockoutLeft(p.save, now) > (RAID_CFG.lockoutH - 1) * H);
  assert.equal(p.bags.size, 1);
  drop(w, p);
});

await test("повтор в пределах отката: золото ×lockedMul, без вещей и мешка, pity и lootAt не меняются; после отката — снова вещи", () => {
  const p = raidHero();
  const t0 = Date.now();
  withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), t0));
  const st = raidState(p.save), pity = st.pity, g = p.save.gold;
  const again = withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), t0 + 10 * H)).get(p.name.toLowerCase())!;
  assert.equal(again.locked, true);
  assert.equal(again.items.length, 0);
  assert.equal(again.gold, Math.round((100 + 0.99 * 100) * RAID.rewards.drops.goldMul * RAID.rewards.drops.lockedMul));
  assert.equal(p.save.gold, g + again.gold);
  assert.equal(p.bags.size, 1, "лишний мешок");
  assert.equal(st.pity, pity);
  assert.equal(st.lootAt[RAID_BOSS.id], t0);
  assert.equal(st.wins, 2, "победа считается и с откатом");
  const later = withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), t0 + RAID_CFG.lockoutH * H + 1)).get(p.name.toLowerCase())!;
  assert.equal(later.locked, false);
  assert.ok(later.items.length > 0);
  drop(w, p);
});

await test("pity: без трофея растёт на pityStep до pityMax; с трофеем сбрасывается в 0", () => {
  const p = raidHero();
  const ch = RAID.rewards.chance;
  let t = Date.now();
  const steps = Math.ceil(ch.pityMax / ch.pityStep) + 3;
  for (let i = 0; i < steps; i++, t += RAID_CFG.lockoutH * H + 1) withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), t));
  assert.ok(Math.abs(raidState(p.save).pity - ch.pityMax) < 1e-9, `pity ${raidState(p.save).pity} ≠ ${ch.pityMax}`);
  const trophyFits = Object.values(LEGENDARIES).some((l) => l.source === "raid" && legendaryFits(l.id, p.cls));
  const loot = withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0), t)).get(p.name.toLowerCase())!;
  if (loot.trophies.length) assert.equal(raidState(p.save).pity, 0);
  else assert.ok(!trophyFits || loot.items.some((it) => it.legendary), "трофеи подходят, но не выпали при rand 0");
  assert.ok(loot.items.some((it) => it.legendary), "легендарка при rand 0");
  drop(w, p);
});

await test("рамка за frame.wins побед; боты и ушедшие из мира — без наград", () => {
  const p = raidHero();
  const bot = raidHero();
  const gone = raidHero();
  let t = Date.now();
  let out = new Map();
  for (let i = 0; i < RAID.frame.wins; i++, t += H) out = withRandom([0.99], () => grantRaidRewards(raidDir([p, gone], () => 0.99, [bot]), t));
  drop(w, gone);
  assert.equal(p.save.frame, RAID.frame.id);
  assert.ok(!out.has(bot.name.toLowerCase()), "бот получил награду");
  assert.equal(bot.save.gold, 0);
  const res = withRandom([0.99], () => grantRaidRewards(raidDir([p, gone], () => 0.99), t));
  assert.ok(!res.has(gone.name.toLowerCase()), "ушедший получил награду");
  drop(w, p, bot);
});

await test("выход из рейда при полной сумке: невзятое — в pendingItems, сумка не теряет вещей; выдача в мире по мере места", () => {
  const p = raidHero();
  withRandom([0.99], () => grantRaidRewards(raidDir([p], () => 0.99), Date.now()));
  const n = bagItems(p).length;
  fillBag(p);
  const before = JSON.stringify(p.save.inventory);
  collectBags(p);
  assert.equal(p.bags.size, 0);
  assert.equal(JSON.stringify(p.save.inventory), before, "сумка изменилась");
  assert.equal(p.save.pendingItems?.length, n);
  // место под одну вещь
  p.save.inventory[0] = null;
  deliverPending(p);
  assert.ok((p.save.pendingItems?.length ?? 0) < n, "ничего не выдано");
  assert.ok(p.box.errors().length >= 1, "нет сообщения об остатке");
  emptyBag(p);
  deliverPending(p);
  assert.equal(p.save.pendingItems, undefined, "pendingItems не очищен");
  drop(w, p);
});

// ================================================================ мировой босс
section("Мировой босс: пороги, сутки, неделя, pity");

const WBD = WB_BOSSES[0];
const acct: WbGrantCtx["acct"] = {};
const wbCtx = (over: Partial<WbGrantCtx> = {}): WbGrantCtx => ({ w, def: WBD, now: Date.now(), win: "", bossXp: 5000, bossLevel: 93, x: 0, y: 0, heartOwner: "", acct, ...over });
const wbHero = (accountId?: number) => { const p = raidHero(); p.save.marks = 0; if (accountId) p.accountId = accountId; return p; };

await test("тиры: бронза < серебро < золото по знакам, вещам и опыту; вещи — в личный мешок", () => {
  const got: Record<string, { marks: number; items: number; xp: number }> = {};
  for (const tier of ["bronze", "silver", "gold"] as const) {
    const p = wbHero();
    const me = grantWb(wbCtx({ rand: () => 0.99 }), p, 1000, tier);
    assert.equal(me.marks, WBD.rewards[tier].marks);
    assert.equal(p.save.marks, me.marks);
    got[tier] = { marks: me.marks, items: bagItems(p).filter((it) => !it.qty).length, xp: me.xp };
    assert.equal(got[tier].items, WBD.rewards[tier].items.n, `${tier}: вещей`);
    assert.equal(me.items.length, bagItems(p).length, "итог не совпадает с мешком");
    assert.ok(bagItems(p).filter((it) => !it.qty).every((it) => it.rarity >= WBD.rewards[tier].items.minRarity));
    assert.equal(p.bags.size, 1);
    flushBags(p);
    drop(w, p);
  }
  assert.ok(got.bronze.marks < got.silver.marks && got.silver.marks < got.gold.marks);
  assert.ok(got.bronze.xp < got.silver.xp && got.silver.xp <= got.gold.xp);
});

await test("фракция с большим вкладом — знаки ×factionMarksMul; Сердце южного фронта — лишняя руда от серебра", () => {
  const p = wbHero();
  const me = grantWb(wbCtx({ rand: () => 0.99, win: p.faction, heartOwner: p.faction }), p, 1000, "silver");
  assert.equal(me.marks, Math.round(WBD.rewards.silver.marks * WBD.rewards.factionMarksMul));
  if (WBD.rewards.heartChest) assert.equal(countIn(bagItems(p), "ash_ore"), WBD.rewards.silver.ore + WBD.rewards.heartChest.ore);
  flushBags(p);
  const q = wbHero();
  grantWb(wbCtx({ rand: () => 0.99, heartOwner: q.faction }), q, 1000, "bronze");
  assert.equal(countIn(bagItems(q), "ash_ore"), WBD.rewards.bronze.ore, "у бронзы лишнего сундука нет");
  flushBags(q);
  drop(w, p, q);
});

await test("вещи раз в сутки: второй бой в те же сутки — знаки и опыт, без вещей; со сбросом суток — снова вещи", () => {
  const p = wbHero();
  const t = Date.now();
  grantWb(wbCtx({ now: t, rand: () => 0.99 }), p, 1000, "gold");
  assert.ok(wbLocked(p.save, WBD.id, t));
  flushBags(p);
  const m0 = p.save.marks!;
  const me = grantWb(wbCtx({ now: t + 60_000, rand: () => 0.99 }), p, 1000, "gold");
  assert.equal(me.locked, true);
  assert.equal(me.items.length, 0);
  assert.equal(p.bags.size, 0);
  assert.equal(p.save.marks, m0 + me.marks, "знаки идут и с откатом");
  const next = grantWb(wbCtx({ now: t + DAY, rand: () => 0.99 }), p, 1000, "gold");
  assert.equal(next.locked, false);
  assert.ok(next.items.length > 0);
  assert.equal(wbState(p.save).wins[WBD.id], 3);
  flushBags(p);
  drop(w, p);
});

await test("легендарка у золота раз в неделю на аккаунт: второй герой того же аккаунта в ту же неделю — нет; через неделю — да", () => {
  const t = Date.now();
  const ctxAcct: WbGrantCtx["acct"] = {};
  const a = wbHero(9001), b = wbHero(9001);
  const meA = grantWb(wbCtx({ now: t, acct: ctxAcct, rand: () => 0 }), a, 1000, "gold");
  assert.ok(bagItems(a).some((it) => it.legendary), "нет легендарки при rand 0");
  assert.equal(ctxAcct.a9001?.leg, weekKey(t));
  assert.ok(meA.trophy.length >= 1);
  const meB = grantWb(wbCtx({ now: t, acct: ctxAcct, rand: () => 0 }), b, 1000, "gold");
  assert.ok(!bagItems(b).some((it) => it.legendary), "вторая легендарка за неделю на аккаунт");
  assert.equal(meB.trophy.length, 0);
  assert.equal(wbState(b.save).pity[WBD.id].leg, 0, "pity не растёт, когда трофей недели уже взят");
  flushBags(a); flushBags(b);
  const meA2 = grantWb(wbCtx({ now: t + WEEK + DAY, acct: ctxAcct, rand: () => 0 }), a, 1000, "gold");
  assert.ok(meA2.trophy.length >= 1, "через неделю снова");
  flushBags(a);
  drop(w, a, b);
});

await test("pity легендарки: без удачи растёт на pityStep за золото до pityMax, у серебра не растёт", () => {
  const p = wbHero();
  const L = WBD.rewards.legendary;
  let t = Date.now();
  for (let i = 0; i < Math.ceil(L.pityMax / L.pityStep) + 3; i++, t += DAY) { grantWb(wbCtx({ now: t, acct: {}, rand: () => 0.999 }), p, 1000, "gold"); flushBags(p); }
  assert.ok(Math.abs(wbState(p.save).pity[WBD.id].leg - L.pityMax) < 1e-9);
  const q = wbHero();
  grantWb(wbCtx({ now: t, acct: {}, rand: () => 0.999 }), q, 1000, "silver");
  assert.equal(wbState(q.save).pity[WBD.id]?.leg ?? 0, 0);
  flushBags(p); flushBags(q);
  drop(w, p, q);
});

await test("маунт-трофей (свой def с mounts): печать в сумку, неделя на аккаунт; уже изученный маунт не выпадает", () => {
  const def: WbBossDef = { ...WBD, rewards: { ...WBD.rewards, mounts: ["bear"] } };
  const t = Date.now();
  const ac: WbGrantCtx["acct"] = {};
  const p = wbHero(9100);
  const me = grantWb(wbCtx({ def, now: t, acct: ac, rand: () => 0 }), p, 1000, "gold");
  assert.ok(me.trophy.length >= 1);
  assert.equal(countIn(p.save.inventory, "mseal_bear"), 1, "печать не в сумке");
  assert.equal(ac.a9100?.mount, weekKey(t));
  flushBags(p);
  const q = wbHero(9101);
  q.save.mounts = ["bear"];
  grantWb(wbCtx({ def, now: t, acct: ac, rand: () => 0 }), q, 1000, "gold");
  assert.equal(countIn(q.save.inventory, "mseal_bear"), 0, "изученный маунт выпал");
  flushBags(q);
  drop(w, p, q);
});

await test("giveAll: влезает всё — в сумку; не влезает хоть одна — всё в pendingItems, сумка не меняется частично", () => {
  const p = wbHero();
  const items = [gear("sword", 10), gear("axe", 10), stack("ash_ore", 3)];
  assert.equal(giveAll(p, items.map((i) => ({ ...i }))), true);
  assert.equal(p.save.inventory.filter(Boolean).length, 3);
  fillBag(p);
  p.save.inventory[0] = null; // одно место на три вещи
  const before = JSON.stringify(p.save.inventory);
  assert.equal(giveAll(p, [gear("sword", 11), gear("axe", 11)]), false);
  assert.equal(JSON.stringify(p.save.inventory), before, "часть легла в сумку");
  assert.equal(p.save.pendingItems?.length, 2);
  drop(w, p);
});

await test("flushBags: невзятое из мешка мирового босса — в сумку целиком; мешок удаляется", () => {
  const p = wbHero();
  grantWb(wbCtx({ rand: () => 0.99 }), p, 1000, "bronze");
  const n = bagItems(p).length;
  assert.ok(n > 0);
  flushBags(p);
  assert.equal(p.bags.size, 0);
  assert.ok(p.save.inventory.filter(Boolean).length >= 1);
  assert.equal(p.save.pendingItems, undefined);
  drop(w, p);
});

await test("тиры вклада (director.tierOf): пороги доли здоровья, бронза и за секунды действий, иначе пусто", () => {
  const C = WB.contrib, max = 1_000_000;
  const e = (v: number, actMs = 0): WbEntry => ({ key: "x", name: "x", cls: "warrior", faction: "solgard", account: 0, dmg: v, heal: 0, tank: 0, bonus: 0, actMs, sent: 0 });
  const tierOf = (x: WbEntry) => WorldBossDirector.prototype.tierOf.call({ peakHp: max } as never, x, max);
  assert.equal(tierOf(e(C.gold * max)), "gold");
  assert.equal(tierOf(e(C.gold * max - 1)), "silver");
  assert.equal(tierOf(e(C.silver * max)), "silver");
  assert.equal(tierOf(e(C.silver * max - 1)), "bronze");
  assert.equal(tierOf(e(C.bronze * max)), "bronze");
  assert.equal(tierOf(e(C.bronze * max - 1)), "");
  assert.equal(tierOf(e(0, C.bronzeActSec * 1000)), "bronze");
  assert.equal(tierOf(e(0, C.bronzeActSec * 1000 - 1)), "");
});

// ================================================================ запись одной транзакцией
section("saveMany: награды пишутся одной транзакцией");

await test("сбой на втором герое — откат: первый в базе остаётся прежним, повтор после сбоя пишет обоих", () => {
  const db = memDb();
  const [a, b] = party(2);
  register(db, a);
  register(db, b);
  a.save.gold = 111;
  b.save.gold = 222;
  db.saveMany([{ name: a.name, save: a.save }, { name: b.name, save: b.save }]);
  a.save.gold = 5000;
  b.save.gold = 6000;
  db.raw.exec(`CREATE TRIGGER boom BEFORE UPDATE ON players WHEN NEW.name_key = '${b.name.toLowerCase()}' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
  assert.throws(() => db.saveMany([{ name: a.name, save: a.save }, { name: b.name, save: b.save }]), /boom/);
  assert.equal(db.load(a.name)!.gold, 111, "первый записан без второго");
  assert.equal(db.load(b.name)!.gold, 222);
  db.raw.exec("DROP TRIGGER boom");
  // хеши не обновились при сбое: onlyChanged должен записать обоих
  assert.equal(db.saveMany([{ name: a.name, save: a.save }, { name: b.name, save: b.save }], true), 2);
  assert.equal(db.load(a.name)!.gold, 5000);
  assert.equal(db.load(b.name)!.gold, 6000);
  drop(w, a, b);
});

done();
