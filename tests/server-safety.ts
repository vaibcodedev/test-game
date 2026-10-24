/**
 * Защита сервера без сети (аудит 2026-10-24): лимит сообщений на клиента, автосохранение мира одной транзакцией
 * и только изменившихся героев, резервная копия базы с ротацией.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@colyseus/core";
import { GameDB } from "../server/src/db";
import { newSave } from "../server/src/game/Player";
import { floodCheck, MSG_LIMIT } from "../server/src/rooms/common";
import { WorldRoom } from "../server/src/rooms/WorldRoom";

let bad = 0;
const fail = (s: string) => { bad++; console.log("FAIL", s); };
const check = (c: unknown, s: string) => { if (!c) fail(s); };

// ---------- лимит сообщений ----------
const mkClient = () => {
  const c = { sessionId: "s" + Math.random(), sent: [] as string[], left: 0 as number | null, send(t: string) { c.sent.push(t); }, leave(code: number) { c.left = code; } };
  return c;
};
{
  // обычная игра 10 с: бег мышью (input раз в 50 мс), умение с зажатой клавишей (раз в 150 мс), клики по земле и выбор цели (раз в 300 мс)
  const st = new WeakMap(), c = mkClient();
  let dropped = 0;
  for (let t = 0; t < 10_000; t += 10) {
    const msgs: string[] = [];
    if (t % 50 === 0) msgs.push("input");
    if (t % 150 === 0) msgs.push("skill");
    if (t % 300 === 0) msgs.push("target", "moveTo");
    if (t % 1000 === 0) msgs.push("bars:set", "use", "rumor");
    for (const m of msgs) if (!floodCheck(st, c as unknown as Client, m, 1e6 + t)) dropped++;
  }
  check(dropped === 0 && c.left === 0, `обычная игра: отброшено ${dropped}, отключение ${c.left}`);
}
{
  // флуд: 500 сообщений в секунду — сверх лимита отбрасываются, через kickAfterWindows окон подряд — отключение
  const st = new WeakMap(), c = mkClient();
  let passed1 = 0, kickedAt = -1;
  for (let t = 0; t < 6000; t += 2) {
    const ok = floodCheck(st, c as unknown as Client, "skill", 2e6 + t);
    if (t < 1000 && ok) passed1++;
    if (c.left && kickedAt < 0) kickedAt = t;
  }
  check(passed1 === MSG_LIMIT.general, `флуд: за первое окно пропущено ${passed1}, ждали ${MSG_LIMIT.general}`);
  check(kickedAt >= (MSG_LIMIT.kickAfterWindows - 1) * MSG_LIMIT.windowMs && kickedAt < MSG_LIMIT.kickAfterWindows * MSG_LIMIT.windowMs, `флуд: отключение на ${kickedAt} мс`);
  check(c.sent.includes("kicked"), "флуд: клиенту не отправлено сообщение об отключении");
  check(!floodCheck(st, c as unknown as Client, "input", 3e6), "после отключения сообщения проходят");
  // движение считается отдельно: флуд умениями не съедает лимит input
  const st2 = new WeakMap(), c2 = mkClient();
  for (let i = 0; i < 100; i++) floodCheck(st2, c2 as unknown as Client, "skill", 4e6);
  check(floodCheck(st2, c2 as unknown as Client, "input", 4e6), "input отброшен из-за флуда умениями");
  // короткий всплеск (одно окно сверх лимита) — не отключение
  const st3 = new WeakMap(), c3 = mkClient();
  for (let i = 0; i < 200; i++) floodCheck(st3, c3 as unknown as Client, "skill", 5e6);
  for (let t = 1000; t < 5000; t += 100) floodCheck(st3, c3 as unknown as Client, "skill", 5e6 + t);
  check(c3.left === 0, "всплеск в одном окне привёл к отключению");
}

// ---------- сохранение одной транзакцией ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emberfall-safety-"));
const file = path.join(dir, "game.sqlite");
const db = new GameDB(file);
const acc = db.accountCreate("safety", "secret1");
const names = Array.from({ length: 50 }, (_, i) => `Hero${i}`);
for (const n of names) db.createChar(acc, n, newSave("warrior", { x: 100, y: 100 }));
{
  // WorldRoom.saveAll — через saveMany: одна транзакция (BEGIN один раз), повторно — только изменившиеся
  const players = new Map(names.map((n, i) => [`id${i}`, { name: n, save: newSave("warrior", { x: 100, y: 100 }), toSave(this: { save: unknown }) { return structuredClone(this.save); } }]));
  const fake = { world: { players, map: { playerSpawn: { x: 1, y: 1 } } } };
  WorldRoom.db = db;
  const raw = db.raw, exec = raw.exec.bind(raw);
  let begins = 0;
  raw.exec = (sql: string) => { if (/^BEGIN/.test(sql)) begins++; return exec(sql); };
  const first = WorldRoom.prototype.saveAll.call(fake as never, true);
  check(begins === 1, `автосохранение ${names.length} героев: транзакций ${begins}, ждали 1`);
  check(first === names.length, `первое автосохранение записало ${first}`);
  const again = WorldRoom.prototype.saveAll.call(fake as never, true);
  check(again === 0 && begins === 1, `без изменений записано ${again}, транзакций ${begins}`);
  players.get("id3")!.save.gold = 777;
  const one = WorldRoom.prototype.saveAll.call(fake as never, true);
  check(one === 1 && db.load("Hero3")?.gold === 777, `изменился один герой: записано ${one}, золото ${db.load("Hero3")?.gold}`);
  const all = WorldRoom.prototype.saveAll.call(fake as never);
  check(all === names.length, `полное сохранение (остановка) записало ${all}`);
  // атомарность: ошибка посередине — не записан никто
  const ss = names.map((n) => ({ name: n, save: { ...newSave("warrior", { x: 5, y: 5 }), gold: 999 } }));
  (ss[25].save as { level: unknown }).level = { bad: true };
  let threw = false;
  try { db.saveMany(ss); } catch { threw = true; }
  check(threw && names.every((n) => db.load(n)?.gold !== 999), "saveMany с ошибкой записал часть героев");
  raw.exec = exec;
  // после отката кеш не врёт: то же сохранение без ошибки записывается
  (ss[25].save as { level: unknown }).level = 1;
  check(db.saveMany(ss, true) === names.length, "после отката изменившиеся не записаны");
}

// ---------- резервная копия ----------
{
  const bdir = path.join(dir, "backups");
  const out = db.backup(bdir, 7, new Date(2026, 9, 1, 3, 0, 0));
  check(!!out && fs.existsSync(out) && fs.statSync(out).size > 0, `копия не создана: ${out}`);
  const copy = new GameDB(out!);
  check(copy.load("Hero3")?.gold === 999, "в копии нет данных");
  copy.close();
  for (let d = 2; d <= 12; d++) db.backup(bdir, 7, new Date(2026, 9, d, 3, 0, 0));
  fs.writeFileSync(path.join(bdir, "other.txt"), "x");
  db.backup(bdir, 7, new Date(2026, 9, 13, 3, 0, 0));
  const left = fs.readdirSync(bdir).filter((f) => f.endsWith(".sqlite")).sort();
  check(left.length === 7 && left[0] === "game-20261007-030000.sqlite", `ротация: ${left.join(", ")}`);
  check(fs.existsSync(path.join(bdir, "other.txt")), "ротация удалила чужой файл");
}
db.close();
fs.rmSync(dir, { recursive: true, force: true });

if (bad) {
  console.log(`server-safety: ошибок ${bad}`);
  process.exit(1);
}
console.log("OK server-safety: лимит сообщений, автосохранение одной транзакцией, копия базы");
