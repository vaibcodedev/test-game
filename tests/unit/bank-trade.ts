/**
 * Банк и прямой обмен без сервера: BankService и TradeManager на мире без сети и базе в памяти.
 * Инварианты: золото и предметы сохраняются (сумма до = сумма после), отказ или ошибка базы — полный откат, всё пишется в базу.
 * Запуск: npx tsx tests/unit/bank-trade.ts
 */
import { BankService, bankOf } from "../../server/src/game/bank";
import { TradeManager } from "../../server/src/trade/TradeManager";
import { BANKER, BANK_GOLD_MAX, BANK_START_SLOTS, BANK_STEP, BANK_TAB_SIZE, SHARED_SIZE, SHARED_TAB, bankPrice } from "../../shared/bank";
import { BASE_ITEMS, makeUnique, UNIQUES } from "../../shared/items";
import { QUESTS } from "../../shared/quests";
import { TRADE_CONFIRM_DELAY_MS, TRADE_RANGE_TILES, TRADE_SLOTS } from "../../shared/trade";
import { TILE } from "../../shared/constants";
import type { GameDB } from "../../server/src/db";
import type { Player } from "../../server/src/game/Player";
import { assert, done, section, test } from "./lib";
import { at, countIn, drop, emptyBag, fillBag, gear, hero, memDb, register, shiftNow, stack, uids, world, type Hero } from "./fixtures";

const w = world();
const questBase = Object.values(QUESTS).find((q) => q.kind === "gather" && BASE_ITEMS[q.target])?.target;
const quiet = <T>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

// ---------------------------------------------------------------- банк
section("Банк");

function bankSetup(locked: (p: Player, i: unknown) => boolean = () => false) {
  const db = memDb();
  const bank = new BankService(() => w, () => db, () => w.map.playerSpawn, () => false, locked);
  return { db, bank };
}
function banker(db: GameDB, accountId?: number): Hero {
  const p = hero(w);
  emptyBag(p);
  at(p, BANKER);
  if (accountId) {
    db.createChar(accountId, p.name, p.save);
    p.accountId = accountId;
  } else register(db, p);
  return p;
}
const bankCells = (p: Player) => bankOf(p).tabs.flat();
const goldTotal = (p: Player) => p.save.gold + bankOf(p).gold;

await test("банкир рядом обслуживает героя; далеко — отказ", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  bank.open(p);
  assert.deepEqual(p.box.errors(), []);
  assert.ok(p.box.msgs.some((m) => m.type === "bank"));
  p.unit.x += 3000;
  p.box.clear();
  bank.open(p);
  assert.equal(p.box.errors().length, 1);
  drop(w, p);
});

await test("золото: положить и снять сохраняет сумму; лишнее, ноль, NaN, Infinity, строка — без изменений; дробь — целая часть", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  p.save.gold = 1000;
  bank.gold(p, 300);
  assert.equal(p.save.gold, 700);
  assert.equal(bankOf(p).gold, 300);
  bank.gold(p, -100);
  assert.equal(p.save.gold, 800);
  assert.equal(bankOf(p).gold, 200);
  for (const v of [801, -201, 0, NaN, Infinity, -Infinity, "50", null, {}]) bank.gold(p, v);
  assert.equal(p.save.gold, 800);
  assert.equal(bankOf(p).gold, 200);
  bank.gold(p, 10.9);
  assert.equal(p.save.gold, 790);
  bank.gold(p, -0.5); // trunc → 0: ничего
  assert.equal(goldTotal(p), 1000);
  assert.equal(db.load(p.name)!.gold, 790, "в базе не то золото");
  assert.equal(db.load(p.name)!.bank!.gold, 210);
  drop(w, p);
});

await test("золото: потолок банка BANK_GOLD_MAX не превышается", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  p.save.gold = BANK_GOLD_MAX + 10;
  bank.gold(p, BANK_GOLD_MAX + 1);
  assert.equal(bankOf(p).gold, 0);
  bank.gold(p, BANK_GOLD_MAX);
  assert.equal(bankOf(p).gold, BANK_GOLD_MAX);
  bank.gold(p, 1);
  assert.equal(bankOf(p).gold, BANK_GOLD_MAX);
  assert.equal(goldTotal(p), BANK_GOLD_MAX + 10);
  drop(w, p);
});

await test("предметы: положить и взять — тот же uid, без копий; база совпадает с памятью", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  const it = gear();
  p.save.inventory[2] = it;
  bank.put(p, 2, 0, undefined);
  assert.equal(p.save.inventory[2], null);
  assert.ok(bankCells(p).some((x) => x?.uid === it.uid));
  const saved = db.load(p.name)!;
  assert.ok(!uids(saved.inventory).includes(it.uid) && saved.bank!.tabs.flat().some((x) => x?.uid === it.uid), "база не совпадает");
  const slot = bankOf(p).tabs[0].findIndex((x) => x?.uid === it.uid);
  bank.take(p, 0, slot, undefined);
  assert.ok(uids(p.save.inventory).includes(it.uid));
  assert.ok(!bankCells(p).some((x) => x?.uid === it.uid));
  drop(w, p);
});

await test("стопки: зелья в банке складываются, сумма сохраняется при put/take/move", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  const max = BASE_ITEMS.hp_potion.stack!;
  p.save.inventory[0] = stack("hp_potion", max - 1);
  p.save.inventory[1] = stack("hp_potion", 5);
  bank.put(p, 0, 0, undefined);
  bank.put(p, 1, 0, undefined);
  assert.equal(countIn(bankCells(p), "hp_potion"), max + 4);
  assert.ok(bankCells(p).every((x) => !x || (x.qty ?? 1) <= max));
  const t = bankOf(p).tabs[0];
  const a = t.findIndex((x) => x?.qty === max), b = t.findIndex((x) => x && x.qty !== max && x.base === "hp_potion");
  bank.move(p, 0, b, 0, a); // в полную стопку: остаток остаётся
  assert.equal(countIn(bankCells(p), "hp_potion"), max + 4);
  bank.take(p, 0, a, 5); // в конкретную ячейку сумки
  assert.equal(countIn(p.save.inventory, "hp_potion") + countIn(bankCells(p), "hp_potion"), max + 4);
  drop(w, p);
});

await test("полный банк: put — отказ, предмет остаётся в сумке; полная сумка: take — отказ, предмет остаётся в банке", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  const b = bankOf(p);
  b.tabs = [b.tabs[0].map(() => gear("axe"))];
  const it = gear();
  p.save.inventory[0] = it;
  bank.put(p, 0, 0, undefined);
  assert.equal(p.save.inventory[0]?.uid, it.uid);
  assert.equal(bankCells(p).length, BANK_START_SLOTS);
  fillBag(p);
  const inBank = bankOf(p).tabs[0][3]!.uid;
  bank.take(p, 0, 3, undefined);
  assert.equal(bankOf(p).tabs[0][3]?.uid, inBank);
  assert.ok(!uids(p.save.inventory).includes(inBank));
  drop(w, p);
});

await test("банк: квестовый предмет, предмет в окне обмена, мёртвый герой, герой на арене — отказ без изменений", () => {
  let lockedIdx = -1;
  const { db, bank } = bankSetup((_p, i) => i === lockedIdx);
  const p = banker(db);
  p.save.inventory[0] = gear();
  if (questBase) p.save.inventory[1] = { ...stack(questBase, 1) };
  p.save.gold = 500;
  const s = JSON.stringify([p.save.inventory, bankOf(p), p.save.gold]);
  lockedIdx = 0;
  bank.put(p, 0, 0, undefined);
  bank.put(p, 1, 0, undefined);
  p.dead = true;
  bank.gold(p, 100);
  p.dead = false;
  p.team = 2;
  bank.gold(p, 100);
  p.team = 0;
  assert.equal(JSON.stringify([p.save.inventory, bankOf(p), p.save.gold]), s);
  drop(w, p);
});

await test("банк: мусорные вкладки и ячейки (−1, 99, 1.5, строки, __proto__) — без изменений", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  p.save.inventory[0] = gear();
  bank.put(p, 0, 0, undefined);
  const s = JSON.stringify([p.save.inventory, bankOf(p)]);
  for (const bad of [-1, 99, 1.5, "0", "__proto__", null, NaN]) {
    bank.take(p, bad, 0, undefined);
    bank.take(p, 0, bad, undefined);
    bank.move(p, 0, 0, bad, 0);
    bank.move(p, bad, 0, 0, 1);
  }
  bank.put(p, 5, 0, 0); // пустая ячейка сумки
  bank.put(p, -1, 0, 0);
  bank.put(p, 999, 0, 0);
  assert.equal(JSON.stringify([p.save.inventory, bankOf(p)]), s);
  drop(w, p);
});

await test("покупка ячеек: +BANK_STEP за цену; нет денег — отказ; новая вкладка после полной", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  const price = bankPrice(bankOf(p))!;
  p.save.gold = price - 1;
  bank.buy(p);
  assert.equal(bankCells(p).length, BANK_START_SLOTS);
  p.save.gold = 1e9;
  let paid = 0;
  while (bankOf(p).tabs[0].length < BANK_TAB_SIZE) { paid += bankPrice(bankOf(p))!; bank.buy(p); }
  assert.equal(bankOf(p).tabs.length, 1);
  paid += bankPrice(bankOf(p))!;
  bank.buy(p);
  assert.equal(bankOf(p).tabs.length, 2);
  assert.equal(bankOf(p).tabs[1].length, BANK_STEP);
  assert.equal(p.save.gold, 1e9 - paid);
  drop(w, p);
});

await test("ошибка базы при переносе — откат памяти: предмет в сумке, золото на месте", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  const it = gear();
  p.save.inventory[0] = it;
  p.save.gold = 100;
  const orig = db.save.bind(db);
  db.save = () => { throw new Error("SQLITE_FULL"); };
  quiet(() => { bank.put(p, 0, 0, undefined); bank.gold(p, 50); });
  db.save = orig;
  assert.equal(p.save.inventory[0]?.uid, it.uid);
  assert.ok(!bankCells(p).some((x) => x?.uid === it.uid));
  assert.equal(p.save.gold, 100);
  assert.equal(bankOf(p).gold, 0);
  drop(w, p);
});

await test("общий склад аккаунта: положил один герой — взял другой; в чужом аккаунте его нет", () => {
  const { db, bank } = bankSetup();
  const a = banker(db);
  const b = banker(db, a.accountId);
  const stranger = banker(db);
  const it = gear("mace");
  a.save.inventory[0] = it;
  bank.put(a, 0, SHARED_TAB, undefined);
  assert.equal(a.save.inventory[0], null);
  assert.ok(bank.view(b).shared.some((x) => x?.uid === it.uid));
  assert.ok(!bank.view(stranger).shared.some((x) => x?.uid === it.uid));
  const slot = bank.view(b).shared.findIndex((x) => x?.uid === it.uid);
  bank.take(stranger, SHARED_TAB, slot, undefined);
  assert.ok(!uids(stranger.save.inventory).includes(it.uid), "чужой взял со склада");
  bank.take(b, SHARED_TAB, slot, undefined);
  assert.ok(uids(b.save.inventory).includes(it.uid));
  assert.ok(!bank.view(a).shared.some((x) => x?.uid === it.uid), "вещь осталась и на складе — дюп");
  assert.equal(bank.view(a).shared.length, SHARED_SIZE);
  drop(w, a, b, stranger);
});

await test("общий склад без аккаунта (accountId 0): put в конкретную ячейку склада не уничтожает предмет", () => {
  const { db, bank } = bankSetup();
  const p = banker(db);
  p.accountId = 0;
  const it = gear();
  p.save.inventory[0] = it;
  bank.put(p, 0, SHARED_TAB, 0);
  const where = [...uids(p.save.inventory), ...bankCells(p).filter(Boolean).map((x) => x!.uid), ...bank.view(p).shared.filter(Boolean).map((x) => x!.uid)];
  drop(w, p);
  assert.ok(where.includes(it.uid), "предмет пропал");
});

await test("bankOf чинит битое сохранение: нет вкладок, вкладка не массив, лишние вкладки, отрицательное и NaN-золото", () => {
  const p = hero(w);
  for (const bad of [null, { tabs: "x", gold: -5 }, { tabs: [], gold: NaN }, { tabs: [null, [1]], gold: -1 }, { tabs: new Array(20).fill([]), gold: Infinity }]) {
    p.save.bank = bad as never;
    const b = bankOf(p);
    assert.ok(Array.isArray(b.tabs) && b.tabs.length >= 1 && b.tabs.every(Array.isArray), JSON.stringify(bad));
    assert.ok(Number.isFinite(b.gold) && b.gold >= 0, `золото ${b.gold} из ${JSON.stringify(bad)}`);
  }
  drop(w, p);
});

// ---------------------------------------------------------------- обмен
section("Обмен между игроками");

function tradeSetup() {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = hero(w), b = hero(w);
  register(db, a);
  register(db, b);
  emptyBag(a);
  emptyBag(b);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  return { db, tm, a, b };
}
function open(tm: TradeManager, a: Hero, b: Hero) {
  tm.request(a, b.id);
  tm.respond(b, true);
  assert.ok(tm.inTrade(a) && tm.inTrade(b), "обмен не открылся: " + [...a.box.errors(), ...b.box.errors()].join(" | "));
}
function confirmBoth(tm: TradeManager, a: Hero, b: Hero) {
  tm.ready(a);
  tm.ready(b);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
}
const tradeLogCount = (db: GameDB) => (db.raw.prepare("SELECT COUNT(*) AS n FROM trade_log").get() as { n: number }).n;

await test("обмен: предмет за золото — вещь у покупателя, золото у продавца, сумма золота сохраняется, запись в журнале и в базе", () => {
  const { db, tm, a, b } = tradeSetup();
  const it = gear("sword", 20);
  a.save.inventory[3] = it;
  a.save.gold = 10;
  b.save.gold = 500;
  open(tm, a, b);
  tm.add(a, 3, 0);
  tm.gold(b, 200);
  confirmBoth(tm, a, b);
  assert.ok(!tm.inTrade(a), "обмен не завершился: " + [...a.box.toasts(), ...b.box.toasts()].join(" | "));
  assert.equal(a.save.inventory[3], null);
  assert.ok(uids(b.save.inventory).includes(it.uid));
  assert.equal(a.save.gold, 210);
  assert.equal(b.save.gold, 300);
  assert.equal(tradeLogCount(db), 1);
  assert.equal(db.load(a.name)!.gold, 210);
  assert.ok(uids(db.load(b.name)!.inventory).includes(it.uid));
  drop(w, a, b);
});

await test("подтверждение раньше задержки или без «готов» у обоих — обмен не проходит", () => {
  const { tm, a, b } = tradeSetup();
  a.save.inventory[0] = gear();
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.ready(a);
  tm.ready(b);
  tm.confirm(a);
  tm.confirm(b); // сразу — до TRADE_CONFIRM_DELAY_MS
  assert.ok(tm.inTrade(a) && a.save.inventory[0], "прошёл без задержки");
  tm.add(a, 1, 1); // пустая ячейка — ничего
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try {
    tm.cancel; // noop
    tm.remove(a, 0); // изменение снимает «готов»
    tm.add(a, 0, 0);
    tm.ready(a);
    tm.confirm(a);
    tm.confirm(b);
  } finally { restore(); }
  assert.ok(tm.inTrade(a) && a.save.inventory[0], "прошёл без «готов» второй стороны");
  drop(w, a, b);
});

await test("изменение предложения после «готов» сбрасывает готовность обоих", () => {
  const { tm, a, b } = tradeSetup();
  a.save.inventory[0] = gear();
  a.save.inventory[1] = gear("axe");
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.ready(a);
  tm.ready(b);
  tm.add(a, 1, 1);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  assert.ok(tm.inTrade(a) && a.save.inventory[0] && a.save.inventory[1], "подмена после «готов» прошла без нового согласия");
  drop(w, a, b);
});

await test("нельзя предложить: привязанную вещь, квестовый предмет, пустую ячейку, чужой индекс, одну ячейку дважды", () => {
  const { tm, a, b } = tradeSetup();
  a.save.inventory[0] = makeUnique(Object.keys(UNIQUES)[0]);
  if (questBase) a.save.inventory[1] = stack(questBase, 1);
  a.save.inventory[2] = gear();
  open(tm, a, b);
  for (const i of [0, 1, 5, -1, 999, 1.5, "2", null]) tm.add(a, i, undefined);
  assert.ok(!tm.locked(a, 0) && !tm.locked(a, 1));
  tm.add(a, 2, 0);
  tm.add(a, 2, 1);
  const st = a.box.msgs.filter((m) => m.type === "trade:state").pop()!.msg;
  assert.equal(st.mine.index.filter((x: number) => x === 2).length, 1, "одна вещь в двух ячейках обмена");
  assert.ok(tm.locked(a, 2));
  drop(w, a, b);
});

await test("золото: больше, чем есть, урезается; отрицательное — 0; потратил после предложения — обмен отклонён без изменений", () => {
  const { tm, a, b } = tradeSetup();
  a.save.gold = 100;
  b.save.inventory[0] = gear();
  open(tm, a, b);
  tm.gold(a, 1e9);
  let st = a.box.msgs.filter((m) => m.type === "trade:state").pop()!.msg;
  assert.equal(st.mine.gold, 100);
  tm.gold(a, -50);
  st = a.box.msgs.filter((m) => m.type === "trade:state").pop()!.msg;
  assert.equal(st.mine.gold, 0);
  tm.gold(a, 100);
  tm.add(b, 0, 0);
  a.save.gold = 40; // потратил у торговца
  confirmBoth(tm, a, b);
  assert.equal(a.save.gold, 40);
  assert.equal(b.save.gold, 25);
  assert.ok(b.save.inventory[0], "вещь ушла без оплаты");
  drop(w, a, b);
});

await test("вещь подменили после предложения (другой uid или qty) — обмен отклонён, ничего не передано", () => {
  const { tm, a, b } = tradeSetup();
  a.save.inventory[0] = stack("hp_potion", 10);
  b.save.gold = 1000;
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.gold(b, 500);
  a.save.inventory[0]!.qty = 1; // выпил 9 зелий из предложенной стопки
  confirmBoth(tm, a, b);
  assert.equal(b.save.gold, 1000);
  assert.equal(countIn(b.save.inventory, "hp_potion"), 0);
  a.save.inventory[0] = gear(); // на месте другая вещь
  confirmBoth(tm, a, b);
  assert.equal(b.save.gold, 1000);
  assert.equal(uids(b.save.inventory).length, 0);
  drop(w, a, b);
});

await test("получателю некуда положить — откат обеих сторон", () => {
  const { tm, a, b } = tradeSetup();
  const it = gear();
  a.save.inventory[0] = it;
  fillBag(b);
  b.save.gold = 300;
  a.save.gold = 0;
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.gold(b, 300);
  const sa = JSON.stringify([a.save.inventory, a.save.gold]), sb = JSON.stringify([b.save.inventory, b.save.gold]);
  confirmBoth(tm, a, b);
  assert.equal(JSON.stringify([a.save.inventory, a.save.gold]), sa);
  assert.equal(JSON.stringify([b.save.inventory, b.save.gold]), sb);
  drop(w, a, b);
});

await test("обмен вещь на вещь при полных сумках проходит (ячейки освобождаются перед раскладкой)", () => {
  const { tm, a, b } = tradeSetup();
  fillBag(a);
  fillBag(b);
  const ia = a.save.inventory[0]!, ib = b.save.inventory[0]!;
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.add(b, 0, 0);
  confirmBoth(tm, a, b);
  assert.ok(uids(a.save.inventory).includes(ib.uid) && !uids(a.save.inventory).includes(ia.uid));
  assert.ok(uids(b.save.inventory).includes(ia.uid) && !uids(b.save.inventory).includes(ib.uid));
  drop(w, a, b);
});

await test("ошибка базы при обмене — откат, журнал пуст", () => {
  const { db, tm, a, b } = tradeSetup();
  const it = gear();
  a.save.inventory[0] = it;
  b.save.gold = 100;
  open(tm, a, b);
  tm.add(a, 0, 0);
  tm.gold(b, 100);
  const orig = db.save.bind(db);
  let n = 0;
  db.save = (name, s) => { if (++n === 2) throw new Error("SQLITE_BUSY"); orig(name, s); }; // первая запись прошла, вторая — нет
  quiet(() => confirmBoth(tm, a, b));
  db.save = orig;
  assert.equal(a.save.inventory[0]?.uid, it.uid);
  assert.equal(b.save.gold, 100);
  assert.equal(tradeLogCount(db), 0);
  assert.equal(db.load(a.name)!.inventory.filter(Boolean).length, 2, "запись первого героя не откатилась в базе"); // стартовые зелья
  drop(w, a, b);
});

await test("нельзя торговать: с чужой фракцией, издалека, в бою, мёртвым, с самим собой; уход из мира отменяет обмен", () => {
  const { tm, a, b } = tradeSetup();
  tm.request(a, a.id);
  assert.ok(!tm.inTrade(a));
  b.unit.x = a.unit.x + TRADE_RANGE_TILES * TILE + 20;
  tm.request(a, b.id);
  tm.respond(b, true);
  assert.ok(!tm.inTrade(a), "издалека");
  b.unit.x = a.unit.x + 30;
  a.combatAt = w.time;
  tm.request(a, b.id);
  tm.respond(b, true);
  assert.ok(!tm.inTrade(a), "в бою");
  a.combatAt = -1e12;
  b.save.faction = b.faction === "solgard" ? "umbrath" : "solgard";
  tm.request(a, b.id);
  tm.respond(b, true);
  assert.ok(!tm.inTrade(a), "с чужой фракцией");
  b.save.faction = a.faction;
  open(tm, a, b);
  // во время обмена: отошёл — tick отменяет
  b.unit.x += 2000;
  tm.tick();
  assert.ok(!tm.inTrade(a) && !tm.inTrade(b), "обмен не отменён на расстоянии");
  b.unit.x = a.unit.x + 30;
  open(tm, a, b);
  tm.leave(b);
  assert.ok(!tm.inTrade(a), "уход не отменил обмен");
  drop(w, a, b);
});

await test("чужой ответ на запрос: принять может только тот, кому прислали", () => {
  const { tm, a, b } = tradeSetup();
  const c = hero(w);
  c.unit.x = a.unit.x + 10;
  c.unit.y = a.unit.y;
  tm.request(a, b.id);
  tm.respond(c, true);
  assert.ok(!tm.inTrade(a) && !tm.inTrade(c));
  drop(w, a, b, c);
});

void TRADE_SLOTS;
done();
