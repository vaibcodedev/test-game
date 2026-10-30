/**
 * Сохранение без сервера: GameDB на временном файле и в памяти — круговой путь героя (выход и вход), смерть и выход,
 * миграции старой схемы (аккаунты, админка, фракция, резервная копия), повреждённые данные, saveMany, разрыв связи.
 * Запуск: npx tsx tests/unit/persistence.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { GameDB } from "../../server/src/db";
import { Player, newSave } from "../../server/src/game/Player";
import { homeCity } from "../../shared/cities";
import { MAX_LEVEL } from "../../shared/constants";
import { xpToNext } from "../../shared/formulas";
import { assert, done, section, test } from "./lib";
import { drop, gear, hero, memDb, register, stack, world } from "./fixtures";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "emberfall-unit-"));
const quiet = <T>(fn: () => T): T => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const w = world();

section("Выход и вход");

await test("герой → toSave → база → load → новый Player: сумка, экипировка, золото, уровень, умения, позиция, здоровье", () => {
  const db = memDb();
  const p = hero(w, "mage", undefined, 37);
  register(db, p);
  p.save.gold = 12345;
  p.save.inventory[5] = gear("sword", 30);
  p.save.inventory[6] = stack("mp_potion", 17);
  p.save.equip.ring = gear("ring", 30);
  p.save.alloc.int = 20;
  p.recalc();
  p.unit.x += 64;
  p.unit.hp = Math.floor(p.unit.maxHp / 2);
  const before = JSON.parse(JSON.stringify(p.save));
  db.save(p.name, p.toSave(w.map.playerSpawn));
  const loaded = db.load(p.name)!;
  const q = new Player("again", p.name, loaded, () => {});
  for (const k of ["gold", "inventory", "equip", "level", "skills", "alloc", "cls", "faction"] as const) assert.deepEqual(q.save[k], before[k], k);
  assert.equal(q.unit.x, p.unit.x);
  assert.equal(q.unit.hp, p.unit.hp);
  assert.equal(q.derived.maxMp, p.derived.maxMp);
  drop(w, p);
});

await test("выход мёртвым: позиция — столица фракции, здоровье полное при входе", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  p.unit.x += 500;
  p.dead = true;
  p.unit.hp = 0;
  db.save(p.name, p.toSave(w.map.playerSpawn));
  const s = db.load(p.name)!;
  const home = homeCity(p.faction);
  const exp = home.capital ? home.spawn : w.map.playerSpawn;
  assert.deepEqual([s.x, s.y], [exp.x, exp.y]);
  const q = new Player("x", p.name, s, () => {});
  assert.equal(q.unit.hp, q.unit.maxHp);
  drop(w, p);
});

await test("saveMany: пишет только изменившихся (onlyChanged), запись атомарна", () => {
  const db = memDb();
  const a = hero(w), b = hero(w);
  register(db, a);
  register(db, b);
  const list = () => [{ name: a.name, save: a.save }, { name: b.name, save: b.save }];
  assert.equal(db.saveMany(list(), true), 2);
  assert.equal(db.saveMany(list(), true), 0);
  a.save.gold += 1;
  assert.equal(db.saveMany(list(), true), 1);
  assert.equal(db.load(a.name)!.gold, a.save.gold);
  drop(w, a, b);
});

await test("аккаунт: пароль проверяется, логин без учёта регистра и пробелов, неверный пароль — отказ", () => {
  const db = memDb();
  db.accountCreate("Странник", "верный-пароль");
  assert.equal(db.accountLogin("  странник ", "верный-пароль")?.ok, true);
  assert.equal(db.accountLogin("Странник", "неверный")?.ok, false);
  assert.equal(db.accountLogin("Другой", "верный-пароль"), null);
});

await test("удаление героя — только своего аккаунта", () => {
  const db = memDb();
  const p = hero(w);
  const acc = register(db, p);
  const other = db.accountCreate("чужой", "pw-pw-pw");
  assert.equal(db.deleteChar(other, p.name), false);
  assert.ok(db.load(p.name));
  assert.equal(db.deleteChar(acc, p.name), true);
  assert.equal(db.load(p.name), null);
  drop(w, p);
});

section("Миграции старой базы");

function oldDb(file: string) {
  const d = new DatabaseSync(file);
  d.exec(`CREATE TABLE players (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, cls TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, login_key TEXT NOT NULL UNIQUE, login TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);`);
  return d;
}
function addOld(d: DatabaseSync, name: string, pw: string, admin = 0) {
  const salt = randomBytes(16).toString("hex");
  const save = newSave("warrior", { x: 100, y: 100 });
  delete (save as { faction?: string }).faction; // старые сохранения без фракции
  d.prepare("INSERT INTO players (name_key, name, salt, hash, cls, level, data, created, updated, admin) VALUES (?, ?, ?, ?, 'warrior', 1, ?, 1, 1, ?)")
    .run(name.toLowerCase(), name, salt, scryptSync(pw, salt, 32).toString("hex"), JSON.stringify(save), admin);
}

await test("старая схема: герои становятся аккаунтами с тем же паролем, админка переносится, фракция по умолчанию, перед переносом — копия", () => {
  const file = path.join(tmp, "old.sqlite");
  const d = oldDb(file);
  addOld(d, "Ветеран", "старый-пароль", 1);
  addOld(d, "Новичок", "пароль2");
  // логин «новичок» уже занят другим аккаунтом — герою достанется «Новичок2»
  d.prepare("INSERT INTO accounts (login_key, login, salt, hash, created) VALUES ('новичок', 'новичок', 's', 'h', 1)").run();
  d.close();
  const db = quiet(() => new GameDB(file));
  assert.equal(db.accountLogin("Ветеран", "старый-пароль")?.ok, true, "пароль не перенесён");
  assert.equal(db.accountLogin("Новичок2", "пароль2")?.ok, true, "конфликт логинов не разрешён");
  assert.ok(db.isAdmin("Ветеран"), "админка не перенесена на аккаунт");
  assert.ok(!db.isAdmin("Новичок"));
  assert.equal(db.load("Ветеран")!.faction, "solgard");
  const acc = db.ownerOf("Ветеран")!;
  assert.ok(acc > 0);
  assert.equal(db.charsOf(acc).length, 1);
  const backups = fs.readdirSync(tmp).filter((f) => f.startsWith("old.backup-"));
  assert.ok(backups.length >= 1, "нет копии перед переносом");
  db.close();
  // повторное открытие — миграция не повторяется, аккаунтов не прибавляется
  const db2 = quiet(() => new GameDB(file));
  const n = (db2.raw.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
  assert.equal(n, 3);
  db2.close();
});

section("Повреждённые данные");

await test("Player чинит мусорный уровень и опыт, старые сохранения без второй руки и плаща", () => {
  for (const [lvl, exp] of [[0, 1], [-5, 1], [1e9, MAX_LEVEL], [NaN, 1], [12.7, 12]] as [number, number][]) {
    const s = newSave("warrior", { x: 10, y: 10 });
    s.level = lvl;
    s.xp = 1e12;
    delete (s.equip as Record<string, unknown>).offhand;
    delete (s.equip as Record<string, unknown>).cloak;
    const p = new Player("x", "Мусор", s, () => {});
    assert.equal(p.level, exp, `уровень ${lvl}`);
    const next = xpToNext(p.level);
    assert.ok(p.save.xp >= 0 && (next === 0 ? p.save.xp === 0 : p.save.xp < next), `опыт ${p.save.xp}`);
    assert.equal(p.save.equip.offhand, null);
    assert.equal(p.save.equip.cloak, null);
    assert.ok(Number.isFinite(p.unit.hp) && p.unit.hp > 0);
  }
});

await test("Player: здоровье из сохранения не выше максимума, -1 — полное", () => {
  const s = newSave("warrior", { x: 10, y: 10 });
  s.hp = 1e9;
  s.mp = 1e9;
  const p = new Player("x", "Здоровяк", s, () => {});
  assert.equal(p.unit.hp, p.unit.maxHp);
  assert.equal(p.unit.mp, p.unit.maxMp);
});

await test("Player чинит золото из сохранения: отрицательное, NaN, дробное", () => {
  for (const g of [-50, NaN, 10.5]) {
    const s = newSave("warrior", { x: 10, y: 10 });
    s.gold = g;
    const p = new Player("x", "Должник", s, () => {});
    assert.ok(Number.isInteger(p.save.gold) && p.save.gold >= 0, `золото ${g} → ${p.save.gold}`);
  }
});

await test("битый JSON в строке героя: load не роняет вход исключением", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  db.raw.prepare("UPDATE players SET data = ? WHERE name_key = ?").run("{битый", p.name.toLowerCase());
  drop(w, p);
  let r: unknown;
  try { r = db.load(p.name); } catch (e) { throw new Error("исключение: " + (e as Error).message); }
  assert.equal(r, null);
});

await test("load: сохранение без сумки и экипировки не роняет загрузку (санитайзер перековки проходит пустые)", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  const s = JSON.parse(JSON.stringify(p.save));
  delete s.inventory;
  delete s.faction;
  db.raw.prepare("UPDATE players SET data = ? WHERE name_key = ?").run(JSON.stringify(s), p.name.toLowerCase());
  const got = db.load(p.name)!;
  assert.equal(got.faction, "solgard");
  drop(w, p);
});

section("Разрыв связи");

await test("ушедший из мира герой: его отложенный удар не проходит, по нему — тоже", () => {
  const a = hero(w), b = hero(w);
  b.unit.x = a.unit.x + 30;
  w.removePlayer(a.id);
  assert.equal(w.hit(a, b, { flat: 100 }), 0, "удар ушедшего прошёл");
  assert.equal(w.hit(b, a, { flat: 100 }), 0, "удар по ушедшему прошёл");
  drop(w, b);
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
done();
