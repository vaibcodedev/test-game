/**
 * Социальное без сервера и без карты: группа (server/src/arena/party.ts — приглашение, ответ, выход, лимит 2, фракция, срок),
 * чат (common.ts «chat»: обрезка, пустое, частота; World.playerChat — чужая фракция видит «чужой язык»),
 * задания (server/src/game/cities.ts quest:accept / quest:turn, questProgress — взятие, прогресс, сдача, награда, повтор, полная сумка).
 * Запуск: npx tsx tests/unit/social-party.ts
 */
import { Player, newSave } from "../../server/src/game/Player";
import { Parties } from "../../server/src/arena/party";
import { World } from "../../server/src/game/World";
import { registerCities, questProgress } from "../../server/src/game/cities";
import { registerCombat } from "../../server/src/rooms/common";
import { QUESTS, QUEST_GIVERS, QUEST_MAX_ACTIVE, type QuestDef } from "../../shared/quests";
import { scramble } from "../../shared/factions";
import { npcFaction } from "../../shared/npcs";
import { CHAT_MAX_LEN, MAX_LEVEL } from "../../shared/constants";
import { makeItem, Rarity } from "../../shared/items";
import type { ClassId } from "../../shared/classes";
import { assert, done, inbox, section, test } from "./lib";

let uid = 0;
type P = Player & { box: ReturnType<typeof inbox> };
function mk(cls: ClassId = "warrior", level = 30, at = { x: 0, y: 0 }): P {
  const box = inbox();
  const s = newSave(cls, at);
  s.level = level;
  const n = ++uid;
  const p = new Player(`s${n}`, `Друг${n}`, s, box.send) as P;
  p.box = box;
  p.unit.x = at.x;
  p.unit.y = at.y;
  return p;
}
const key = (p: Player) => p.name.toLowerCase();
function withNow<T>(ms: number, fn: () => T): T {
  const orig = Date.now;
  const base = orig();
  Date.now = () => base + ms;
  try { return fn(); } finally { Date.now = orig; }
}

// ---------------------------------------------------------------- группа
function parties(...ps: Player[]) {
  const map = new Map(ps.map((p) => [key(p), p]));
  const online = new Set(map.keys());
  return { pt: new Parties((k) => map.get(k), (k) => online.has(k)), map, online };
}

section("Группа");

await test("приглашение → согласие: оба в группе, обоим состояние, у обоих один список", () => {
  const a = mk(), b = mk("healer");
  const { pt } = parties(a, b);
  assert.equal(pt.invite(a, b.name), null);
  assert.ok(b.box.msgs.some((m) => m.type === "party:invite" && m.msg.from === a.name));
  assert.equal(pt.respond(b, true), null);
  assert.deepEqual(pt.members(key(a))!.map((m) => m.name), [a.name, b.name]);
  assert.equal(pt.members(key(a)), pt.members(key(b)));
  assert.equal(pt.state(key(b))!.members.length, 2);
  assert.ok(a.box.msgs.some((m) => m.type === "party" && m.msg?.members?.length === 2));
});

await test("имя без учёта регистра и пробелов по краям", () => {
  const a = mk(), b = mk();
  const { pt } = parties(a, b);
  assert.equal(pt.invite(a, `  ${b.name.toUpperCase()} `), null);
  assert.equal(pt.respond(b, true), null);
  assert.ok(pt.members(key(b)));
});

await test("отказы приглашения: себя, офлайн, чужая фракция, уже в группе, полная группа — никто не вступил", () => {
  const a = mk(), b = mk(), c = mk(), foe = mk("deathknight");
  const { pt } = parties(a, b, c, foe);
  assert.ok(pt.invite(a, a.name), "себя");
  assert.ok(pt.invite(a, "нет-такого"), "офлайн");
  assert.ok(pt.invite(a, foe.name), "чужая фракция");
  assert.ok(!foe.box.msgs.some((m) => m.type === "party:invite"), "чужой фракции ушло приглашение");
  pt.invite(a, b.name); pt.respond(b, true);
  assert.ok(pt.invite(c, b.name), "уже в группе");
  assert.ok(pt.invite(a, c.name), "группа полна (2)");
  assert.equal(pt.members(key(c)), null);
});

await test("ответ без приглашения, просроченный (30 с) и повторный — отказ, группы нет", () => {
  const a = mk(), b = mk();
  const { pt } = parties(a, b);
  assert.ok(pt.respond(b, true), "без приглашения");
  pt.invite(a, b.name);
  assert.ok(withNow(31_000, () => pt.respond(b, true)), "просроченное");
  assert.equal(pt.members(key(a)), null);
  pt.invite(a, b.name);
  assert.equal(pt.respond(b, false), null);
  assert.ok(a.box.toasts().length > 0, "пригласившему не сообщили об отказе");
  assert.ok(pt.respond(b, true), "приглашение использовано повторно");
  assert.equal(pt.members(key(b)), null);
});

await test("пригласивший ушёл из мира до ответа — отказ, группы нет", () => {
  const a = mk(), b = mk();
  const { pt, map } = parties(a, b);
  pt.invite(a, b.name);
  map.delete(key(a));
  assert.ok(pt.respond(b, true));
  assert.equal(pt.members(key(b)), null);
});

await test("пригласивший успел собрать группу с другим — второй ответ отклонён, состав не меняется", () => {
  const a = mk(), b = mk(), c = mk();
  const { pt } = parties(a, b, c);
  pt.invite(a, b.name);
  pt.invite(a, c.name);
  assert.equal(pt.respond(b, true), null);
  assert.ok(pt.respond(c, true));
  assert.deepEqual(pt.members(key(a))!.map((m) => m.name), [a.name, b.name]);
  assert.equal(pt.members(key(c)), null);
});

await test("выход: группа из двух распадается, оба получают null и сообщение; выход вне группы — ничего", () => {
  const a = mk(), b = mk(), c = mk();
  const { pt } = parties(a, b, c);
  pt.invite(a, b.name); pt.respond(b, true);
  b.box.clear();
  pt.leave(key(a));
  assert.equal(pt.members(key(a)), null);
  assert.equal(pt.members(key(b)), null);
  assert.ok(b.box.msgs.some((m) => m.type === "party" && m.msg === null));
  assert.ok(b.box.toasts().some((t) => t.includes(a.name)));
  pt.leave(key(c));
  assert.equal(c.box.msgs.length, 0);
  // после распада можно собраться снова
  assert.equal(pt.invite(b, a.name), null);
  assert.equal(pt.respond(a, true), null);
});

await test("состояние: online по признаку «в сети», уровень — текущий", () => {
  const a = mk("warrior", 40), b = mk("healer", 41);
  const { pt, online } = parties(a, b);
  pt.invite(a, b.name); pt.respond(b, true);
  online.delete(key(b));
  b.save.level = 45;
  const st = pt.state(key(a))!;
  assert.equal(st.members.find((m) => m.name === b.name)!.online, false);
  assert.equal(st.members.find((m) => m.name === b.name)!.level, 45);
});

// ---------------------------------------------------------------- чат
section("Чат");

/** Мир-заглушка для обработчика чата: время, список героев и настоящий playerChat. */
function chatWorld(...ps: Player[]) {
  const w = { time: 10_000, players: new Map(ps.map((p) => [p.id, p])) } as unknown as World;
  (w as unknown as { playerChat: World["playerChat"] }).playerChat = World.prototype.playerChat.bind(w);
  const handlers = new Map<string, (p: Player, m: unknown) => void>();
  registerCombat(((type: string, fn: (p: Player, m: unknown) => void) => void handlers.set(type, fn)) as never, () => w);
  return { w: w as unknown as { time: number }, say: (p: Player, text: unknown) => handlers.get("chat")!(p, { text }) };
}

await test("своя фракция читает, чужая — «чужой язык» с пометкой foreign", () => {
  const s1 = mk(), s2 = mk("ranger"), u = mk("warlock");
  const c = chatWorld(s1, s2, u);
  c.say(s1, "Встречаемся у моста");
  const own = s2.box.msgs.find((m) => m.type === "chat")!.msg, foe = u.box.msgs.find((m) => m.type === "chat")!.msg;
  assert.equal(own.text, "Встречаемся у моста");
  assert.ok(!own.foreign);
  assert.ok(foe.foreign);
  assert.notEqual(foe.text, own.text);
  assert.equal(foe.text, scramble("Встречаемся у моста"), "«чужой язык» недетерминирован");
  assert.equal(foe.from, s1.name);
});

await test("пустое, пробелы, не строка — не уходит; длинное обрезается до CHAT_MAX_LEN", () => {
  const a = mk(), b = mk();
  const c = chatWorld(a, b);
  for (const t of ["", "   ", 5, null, ["x"]]) { c.say(a, t); c.w.time += 1000; }
  assert.equal(b.box.msgs.filter((m) => m.type === "chat").length, 0);
  c.say(a, "я".repeat(CHAT_MAX_LEN + 50));
  assert.equal(b.box.msgs.find((m) => m.type === "chat")!.msg.text.length, CHAT_MAX_LEN);
});

await test("чаще раза в 0,6 с — отказ с сообщением, сообщение не уходит", () => {
  const a = mk(), b = mk();
  const c = chatWorld(a, b);
  c.say(a, "раз");
  c.w.time += 300;
  c.say(a, "два");
  assert.deepEqual(b.box.msgs.filter((m) => m.type === "chat").map((m) => m.msg.text), ["раз"]);
  assert.equal(a.box.errors().length, 1);
  c.w.time += 700;
  c.say(a, "три");
  assert.equal(b.box.msgs.filter((m) => m.type === "chat").length, 2);
});

// ---------------------------------------------------------------- задания
section("Задания");

/** Мир-заглушка для заданий: расстояние, события и системный чат (gainXp). */
const qw = { dist: (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y), emit() {}, system() {} } as unknown as World;
const qh = new Map<string, (p: Player, m: unknown) => void>();
registerCities(((type: string, fn: (p: Player, m: unknown) => void) => void qh.set(type, fn)) as never, () => qw);
const accept = (p: Player, id: unknown) => qh.get("quest:accept")!(p, { id });
const turn = (p: Player, id: unknown) => qh.get("quest:turn")!(p, { id });

const giverOf = (q: QuestDef) => QUEST_GIVERS.find((g) => g.id === q.giver)!;
const SOL = Object.values(QUESTS).filter((q) => npcFaction(giverOf(q).x, giverOf(q).y) === "solgard").sort((a, b) => a.level - b.level);
const withItem = SOL.find((q) => q.reward.item)!;
/** Герой Сольгарда у заказчика задания q. */
function atGiver(q: QuestDef, level = Math.max(q.level, 1)) {
  const g = giverOf(q);
  return mk("warrior", level, { x: g.x, y: g.y + 20 });
}

await test("данные: у каждого задания есть заказчик, n > 0, награды неотрицательны; заказчики обеих фракций", () => {
  for (const q of Object.values(QUESTS)) {
    assert.ok(giverOf(q), `${q.id}: нет заказчика ${q.giver}`);
    assert.ok(q.n > 0 && q.reward.gold >= 0 && q.reward.xp > 0, q.id);
  }
  assert.ok(SOL.length > 0 && withItem, "нет заданий Сольгарда с предметом");
});

await test("взятие: у заказчика — активно с нулём; повтор и мусорный id — без изменений", () => {
  const q = SOL[0], p = atGiver(q);
  accept(p, q.id);
  assert.deepEqual(p.save.quests!.active, { [q.id]: 0 });
  accept(p, q.id);
  for (const bad of ["нет", "__proto__", "constructor", 7, null]) accept(p, bad);
  assert.deepEqual(p.save.quests!.active, { [q.id]: 0 });
});

await test("отказ взятия: далеко, ниже уровня, мёртв, заказчик чужой фракции, больше максимума активных", () => {
  const q = SOL.find((x) => x.level > 1)!;
  const far = atGiver(q); far.unit.x += 5000;
  accept(far, q.id);
  const low = atGiver(q, q.level - 1);
  accept(low, q.id);
  const dead = atGiver(q); dead.dead = true;
  accept(dead, q.id);
  for (const p of [far, low, dead]) assert.ok(!p.save.quests || !(q.id in p.save.quests.active), p.name);
  assert.ok(far.box.errors().length && low.box.errors().length);
  const g = giverOf(q), foe = mk("deathknight", 100, { x: g.x, y: g.y + 20 });
  accept(foe, q.id);
  assert.ok(!foe.save.quests || !(q.id in foe.save.quests.active), "заказчик служит чужой фракции");
  // лимит активных: берём у одного заказчика, сколько есть, затем добиваем лимит вручную
  const p = atGiver(q, MAX_LEVEL);
  p.save.quests = { active: Object.fromEntries(Array.from({ length: QUEST_MAX_ACTIVE }, (_, i) => [`x${i}`, 0])), done: [] };
  accept(p, q.id);
  assert.ok(!(q.id in p.save.quests.active));
  assert.ok(p.box.errors().length > 0);
});

await test("прогресс: только по активному заданию нужного вида и цели, не выше n", () => {
  const q = SOL.find((x) => x.kind === "kill")!, p = atGiver(q);
  questProgress(p, "kill", q.target, 1); // ещё не взято
  accept(p, q.id);
  questProgress(p, "gather", q.target, 1);
  questProgress(p, "kill", "чужой_моб", 1);
  assert.equal(p.save.quests!.active[q.id], 0);
  questProgress(p, "kill", q.target, 2);
  assert.equal(p.save.quests!.active[q.id], 2);
  questProgress(p, "kill", q.target, q.n * 5);
  assert.equal(p.save.quests!.active[q.id], q.n);
  assert.ok(p.box.msgs.some((m) => m.type === "toast" && m.msg.kind === "level"), "нет сообщения «выполнено»");
});

await test("сдача невыполненного — ничего; выполненное — золото, опыт, предмет, в done; повтор невозможен", () => {
  const q = withItem, p = atGiver(q);
  accept(p, q.id);
  const g0 = p.save.gold, xp0 = p.save.xp, lv0 = p.save.level;
  const have = () => p.save.inventory.reduce((s, it) => s + (it?.base === q.reward.item!.base ? it.qty ?? 1 : 0), 0);
  const n0 = have();
  turn(p, q.id);
  assert.equal(p.save.gold, g0);
  assert.ok(q.id in p.save.quests!.active);
  questProgress(p, q.kind, q.target, q.n);
  turn(p, q.id);
  assert.equal(p.save.gold, g0 + q.reward.gold);
  assert.ok(p.save.level > lv0 || p.save.xp > xp0, "опыт не начислен");
  assert.equal(have() - n0, q.reward.item!.qty);
  assert.ok(p.save.quests!.done.includes(q.id) && !(q.id in p.save.quests!.active));
  const g1 = p.save.gold;
  turn(p, q.id);
  accept(p, q.id);
  turn(p, q.id);
  assert.equal(p.save.gold, g1, "награда выдана повторно");
  assert.ok(!(q.id in p.save.quests!.active), "сданное задание взято снова");
});

await test("сдача с полной сумкой (награда-предмет) — отказ, ничего не меняется", () => {
  const q = withItem, p = atGiver(q);
  accept(p, q.id);
  questProgress(p, q.kind, q.target, q.n);
  p.save.inventory = p.save.inventory.map(() => makeItem("sword", 5, Rarity.Common));
  const inv = JSON.stringify(p.save.inventory), g0 = p.save.gold, xp0 = p.save.xp;
  turn(p, q.id);
  assert.equal(JSON.stringify(p.save.inventory), inv);
  assert.equal(p.save.gold, g0);
  assert.equal(p.save.xp, xp0);
  assert.equal(p.save.quests!.active[q.id], q.n, "задание пропало");
  assert.ok(!p.save.quests!.done.includes(q.id));
  assert.ok(p.box.errors().length > 0);
});

await test("сдача не у заказчика и мёртвым — отказ", () => {
  const q = SOL[0], p = atGiver(q);
  accept(p, q.id);
  questProgress(p, q.kind, q.target, q.n);
  const g0 = p.save.gold;
  p.unit.x += 5000;
  turn(p, q.id);
  p.unit.x -= 5000;
  p.dead = true;
  turn(p, q.id);
  assert.equal(p.save.gold, g0);
  assert.ok(q.id in p.save.quests!.active);
});

done();
