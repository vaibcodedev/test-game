/**
 * Легендарки на сервере без сети: привязка (обмен, выброс — нельзя; общий склад аккаунта — можно, чужой аккаунт — нет),
 * выдача из рейда (привязана, по классу), свойства (server/src/game/legendary.ts): казнь, ярость, мана-щит, барьер, феникс —
 * и что свойства действуют только с надетой вещи.
 * Запуск: npx tsx tests/unit/legendary.ts
 */
import { absorb, beforeLethal, onDamaged, outgoing } from "../../server/src/game/legendary";
import { BankService } from "../../server/src/game/bank";
import { TradeManager } from "../../server/src/trade/TradeManager";
import { dropItem } from "../../server/src/game/drop";
import { grantRaidRewards } from "../../server/src/raid/rewards";
import { Mob } from "../../server/src/game/Mob";
import type { RaidDirector } from "../../server/src/raid/director";
import type { Player } from "../../server/src/game/Player";
import { LEGENDARIES, legendaryFits, makeLegendary } from "../../shared/legendary";
import { BANKER, SHARED_TAB } from "../../shared/bank";
import { BASE_ITEMS, isBound, Rarity } from "../../shared/items";
import { MOBS } from "../../shared/mobs";
import { RAID_BOSS } from "../../shared/raid";
import { TRADE_CONFIRM_DELAY_MS } from "../../shared/trade";
import { assert, done, section, test, withRandom } from "./lib";
import { at, drop, emptyBag, hero, memDb, register, shiftNow, uids, world, type Hero } from "./fixtures";

const w = world();
const byType = (t: string) => Object.values(LEGENDARIES).find((l) => l.effect?.type === t)!;
const slotOf = (id: string) => BASE_ITEMS[LEGENDARIES[id].base].slot as keyof Player["save"]["equip"];
function wear(p: Player, type: string) {
  const l = byType(type);
  const it = makeLegendary(l.id);
  (p.save.equip as Record<string, unknown>)[slotOf(l.id)] = it;
  return { l, it, e: l.effect };
}
function target(p: Player, hpFrac = 1): Mob {
  const def = Object.values(MOBS).find((d) => !d.boss && !d.level)!;
  const m = new Mob(w.uid("m"), def, 30, { x: p.unit.x + 30, y: p.unit.y });
  m.unit.x = p.unit.x + 30;
  m.unit.y = p.unit.y;
  m.unit.hp = Math.round(m.unit.maxHp * hpFrac);
  return m;
}
const anyLeg = () => Object.values(LEGENDARIES).find((l) => l.source !== "raid")!;

// ---------------------------------------------------------------- привязка
section("Легендарки: привязка и перенос");

await test("makeLegendary: редкость Легендарная, bound, isBound; у всех записей каталога", () => {
  for (const l of Object.values(LEGENDARIES)) {
    const it = makeLegendary(l.id);
    assert.equal(it.rarity, Rarity.Legendary, l.id);
    assert.equal(it.legendary, l.id);
    assert.ok(isBound(it), `${l.id}: не привязана`);
  }
});

await test("обмен: легендарку нельзя положить в окно; обмен остального проходит, легендарка остаётся у владельца", () => {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = hero(w), b = hero(w);
  register(db, a);
  register(db, b);
  emptyBag(a);
  emptyBag(b);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  const leg = makeLegendary(anyLeg().id);
  a.save.inventory[0] = leg;
  a.save.gold = 100;
  b.save.gold = 0;
  tm.request(a, b.id);
  tm.respond(b, true);
  tm.add(a, 0, 0);
  assert.ok(a.box.toasts().length >= 1, "нет отказа");
  tm.gold(a, 50);
  tm.ready(a);
  tm.ready(b);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  assert.equal(a.save.inventory[0]?.uid, leg.uid, "легендарка ушла из сумки");
  assert.ok(!uids(b.save.inventory).includes(leg.uid), "легендарка у другого игрока");
  assert.equal(b.save.gold, 50, "золото не передалось — обмен сорвался");
  drop(w, a, b);
});

await test("подмена в окне обмена: обычная вещь в окне заменена легендаркой в той же ячейке — обмен срывается, ничего не уходит", () => {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = hero(w), b = hero(w);
  register(db, a);
  register(db, b);
  emptyBag(a);
  emptyBag(b);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  const leg = makeLegendary(anyLeg().id);
  a.save.inventory[0] = { ...leg, bound: false, legendary: undefined, uid: "plain1", rarity: 1 };
  tm.request(a, b.id);
  tm.respond(b, true);
  tm.add(a, 0, 0);
  a.save.inventory[0] = { ...leg, uid: "plain1" }; // тот же uid, но теперь легендарка
  tm.ready(a);
  tm.ready(b);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  assert.ok(!uids(b.save.inventory).includes("plain1"), "привязанная ушла через подмену");
  assert.equal(a.save.inventory[0]?.uid, "plain1");
  drop(w, a, b);
});

await test("выброс легендарки — отказ, сумка и база не меняются", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  emptyBag(p);
  const leg = makeLegendary(anyLeg().id);
  p.save.inventory[1] = leg;
  dropItem(w, db, w.map.playerSpawn, p, { index: 1 });
  assert.equal(p.save.inventory[1]?.uid, leg.uid);
  assert.equal(p.box.errors().length, 1);
  assert.equal((db.raw.prepare("SELECT COUNT(*) AS n FROM drop_log").get() as { n: number }).n, 0);
  drop(w, p);
});

await test("общий склад аккаунта: легендарка переходит ко второму герою того же аккаунта; чужой аккаунт её не видит и не берёт", () => {
  const db = memDb();
  const bank = new BankService(() => w, () => db, () => w.map.playerSpawn, () => false, () => false);
  const mk = (acc?: number): Hero => { const p = hero(w); emptyBag(p); at(p, BANKER); if (acc) { db.createChar(acc, p.name, p.save); p.accountId = acc; } else register(db, p); return p; };
  const a = mk(), b = mk(a.accountId), x = mk();
  const leg = makeLegendary(anyLeg().id);
  a.save.inventory[0] = leg;
  bank.put(a, 0, SHARED_TAB, undefined);
  assert.equal(a.save.inventory[0], null);
  const slot = bank.view(b).shared.findIndex((it) => it?.uid === leg.uid);
  assert.ok(slot >= 0, "нет на складе второго героя");
  assert.ok(!bank.view(x).shared.some((it) => it?.uid === leg.uid));
  bank.take(x, SHARED_TAB, slot, undefined);
  assert.ok(!uids(x.save.inventory).includes(leg.uid), "чужой аккаунт взял");
  bank.take(b, SHARED_TAB, slot, undefined);
  const got = b.save.inventory.find((it) => it?.uid === leg.uid);
  assert.ok(got && isBound(got), "у второго героя нет легендарки или она отвязалась");
  assert.ok(!bank.view(a).shared.some((it) => it?.uid === leg.uid), "дюп: осталась на складе");
  drop(w, a, b, x);
});

// ---------------------------------------------------------------- рейд
section("Легендарки: выдача из рейда");

await test("рейд при удаче: легендарка по классу героя, привязана, объявление в мире", () => {
  for (const cls of ["warrior", "mage"] as const) {
    const p = hero(w, cls, undefined, 100);
    emptyBag(p);
    const d = { w, boss: { stats: { gold: [1, 2], xp: 10 }, level: 100, def: { id: RAID_BOSS.id }, x: p.unit.x, y: p.unit.y }, rand: () => 0, members: [{ key: p.name.toLowerCase(), bot: false }], byKey: new Map([[p.name.toLowerCase(), p]]), bots: new Set() } as unknown as RaidDirector;
    const loot = withRandom([0.99], () => grantRaidRewards(d)).get(p.name.toLowerCase())!;
    const legs = loot.items.filter((it) => it.legendary);
    assert.ok(legs.length >= 1, `${cls}: нет легендарки`);
    for (const it of legs) {
      assert.ok(isBound(it), `${cls}: ${it.legendary} не привязана`);
      assert.ok(legendaryFits(it.legendary!, cls), `${cls}: ${it.legendary} не по классу`);
    }
    drop(w, p);
  }
});

// ---------------------------------------------------------------- свойства
section("Легендарки: свойства надетых вещей");

await test("казнь (execute): множитель только по цели ниже порога; в сумке — не действует", () => {
  const p = hero(w);
  const { e } = wear(p, "execute");
  const below = Number(e.below), mult = Number(e.mult);
  assert.equal(outgoing(w, p, target(p, below - 0.05)), 1 + mult);
  assert.equal(outgoing(w, p, target(p, Math.min(1, below + 0.05))), 1);
  // снять в сумку — свойство пропадает
  const it = (p.save.equip as Record<string, unknown>)[slotOf(byType("execute").id)];
  (p.save.equip as Record<string, unknown>)[slotOf(byType("execute").id)] = null;
  p.save.inventory[0] = it as never;
  assert.equal(outgoing(w, p, target(p, 0.01)), 1);
  drop(w, p);
});

await test("ярость (rage): растёт с потерянным здоровьем владельца, на полном — 1", () => {
  const p = hero(w);
  const { e } = wear(p, "rage");
  p.unit.hp = p.unit.maxHp;
  assert.equal(outgoing(w, p, target(p)), 1);
  p.unit.hp = Math.round(p.unit.maxHp / 2);
  const k = outgoing(w, p, target(p));
  assert.ok(Math.abs(k - (1 + Number(e.mult) * (1 - p.unit.hp / p.unit.maxHp))) < 1e-9);
  drop(w, p);
});

await test("мана-щит (manashield): поглощает долю урона маной; без маны — урон целиком; не у мобов", () => {
  const p = hero(w);
  const { e } = wear(p, "manashield");
  const pct = Number(e.pct);
  p.unit.mp = 1000;
  const left = absorb(w, p, 200);
  assert.equal(left, 200 - 200 * pct);
  assert.equal(p.unit.mp, 1000 - 200 * pct);
  p.unit.mp = 0;
  assert.equal(absorb(w, p, 200), 200);
  assert.equal(absorb(w, target(p), 200), 200);
  drop(w, p);
});

await test("барьер (barrier): ниже порога здоровья ставит щит, щит поглощает и кончается; откат не даёт поставить сразу снова", () => {
  const p = hero(w);
  const { e } = wear(p, "barrier");
  const m = target(p);
  p.unit.hp = Math.floor(p.unit.maxHp * Number(e.below)) - 1;
  onDamaged(w, m, p, 10, {});
  const cap = p.unit.maxHp * Number(e.pct);
  assert.equal(absorb(w, p, 1), 0, "щит не поставлен");
  const left = absorb(w, p, cap * 10);
  assert.ok(Math.abs(left - (cap * 10 - (cap - 1))) < 1e-6, `остаток ${left}`);
  assert.equal(absorb(w, p, 50), 50, "щит не кончился");
  onDamaged(w, m, p, 10, {});
  assert.equal(absorb(w, p, 50), 50, "щит поставлен второй раз в откат");
  drop(w, p);
});

await test("феникс (phoenix): смертельный удар оставляет 1 здоровья раз за откат; несмертельный не трогает", () => {
  const p = hero(w);
  wear(p, "phoenix");
  p.unit.hp = 100;
  assert.equal(beforeLethal(w, p, 50), 50);
  assert.equal(beforeLethal(w, p, 500), 99);
  // окно 0,4 с: второй смертельный в окне тоже держит
  assert.equal(beforeLethal(w, p, 500), 99);
  const t = w.time;
  (w as { time: number }).time = t + 1000; // окно прошло, откат — нет
  try { assert.equal(beforeLethal(w, p, 500), 500); } finally { (w as { time: number }).time = t; }
  drop(w, p);
});

done();
