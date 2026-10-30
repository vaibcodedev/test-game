/** Выброс предметов: сумка, подбор хозяином и чужим по таймеру, исчезновение, стопки, отказы, уничтожение, золото. Запуск: TEST_PORT=2711 DROP_LOCK_SEC=2 DROP_TTL_SEC=5 npx tsx tests/drop.ts (сам задаёт сроки) */
import fs from "node:fs";
import path from "node:path";
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";

const lock = path.join("tools", "out", "scenario.lock2");
fs.mkdirSync(path.dirname(lock), { recursive: true });
fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
const inv = (b: Bot) => b.self!.inventory;
const idx = (b: Bot, base: string) => inv(b).findIndex((it) => it?.base === base);
const count = (b: Bot, base: string) => inv(b).reduce((s, it) => s + (it?.base === base ? it.qty ?? 1 : 0), 0);
const lastToast = (b: Bot) => b.toasts[b.toasts.length - 1] ?? "";
const dropped = (b: Bot) => b.bags.filter((x) => x.own);

async function main() {
  await startServer(true, { DROP_LOCK_SEC: "2", DROP_TTL_SEC: "6" });
  const a = await Bot.join("DropA", "secret");
  const b = await Bot.join("DropB", "secret");
  try {
    a.send("dbg", { op: "calm" });
    b.send("dbg", { op: "calm" });
    b.send("dbg", { op: "tp", x: a.me().x, y: a.me().y });
    await sleep(300);

    await check("выброс вещи: сумка пустеет, мешок виден всем", async () => {
      a.send("dbg", { op: "item", base: "ring", ilvl: 3, rarity: 1 });
      await a.until(() => idx(a, "ring") >= 0, 2000, "кольцо");
      const i = idx(a, "ring");
      a.send("drop", { index: i, qty: 1 });
      await a.until(() => dropped(a).length === 1, 2000, "мешок у хозяина");
      assert(idx(a, "ring") < 0, "вещь осталась в сумке");
      await b.until(() => dropped(b).length === 1, 2000, "мешок у чужого");
      assert(dropped(b)[0].lock > 0, "у чужого нет lock");
      assert(!dropped(a)[0].lock, "у хозяина lock");
    });
    await check("чужой не поднимет до срока, хозяин поднимает сразу", async () => {
      const id = dropped(b)[0].id;
      const before = inv(b).filter(Boolean).length;
      b.send("pickup", { bag: id });
      await sleep(300);
      assert(inv(b).filter(Boolean).length === before, "чужой забрал до срока");
      a.send("pickup", { bag: id });
      await a.until(() => idx(a, "ring") >= 0 && dropped(a).length === 0, 2000, "хозяин поднял");
    });
    await check("через срок чужой поднимает", async () => {
      await sleep(450);
      a.send("drop", { index: idx(a, "ring") });
      await b.until(() => dropped(b).length === 1, 2000, "мешок");
      const id = dropped(b)[0].id;
      await sleep(2300);
      b.send("pickup", { bag: id });
      await b.until(() => idx(b, "ring") >= 0, 2000, "чужой поднял");
      await a.until(() => dropped(a).length === 0, 2000, "мешок убран");
    });
    await check("мешок исчезает по таймеру", async () => {
      await sleep(450);
      b.send("drop", { index: idx(b, "ring") });
      await b.until(() => dropped(b).length === 1, 2000, "мешок");
      await b.until(() => dropped(b).length === 0, 8000, "исчез");
    });
    await check("стопка: часть, лишнее и ноль отказ", async () => {
      for (let k = 0; k < 5; k++) a.send("dbg", { op: "item", base: "hp_potion" });
      await a.until(() => count(a, "hp_potion") >= 5, 2000, "зелья");
      await sleep(400);
      const n = count(a, "hp_potion");
      await sleep(450);
      a.send("drop", { index: idx(a, "hp_potion"), qty: n + 1 });
      await sleep(300);
      assert(count(a, "hp_potion") === n && dropped(a).length === 0, "выбросил больше, чем есть " + count(a, "hp_potion") + "/" + n + " " + dropped(a).length + " " + a.toasts.slice(-3));
      a.send("drop", { index: idx(a, "hp_potion"), qty: 0 });
      a.send("drop", { index: idx(a, "hp_potion"), qty: 1.5 });
      await sleep(300);
      assert(count(a, "hp_potion") === n && dropped(a).length === 0, "дробное или нулевое количество прошло");
      a.send("drop", { index: idx(a, "hp_potion"), qty: 2 });
      await a.until(() => dropped(a).length === 1, 2000, "мешок");
      assert(count(a, "hp_potion") === n - 2, "в сумке не n-2");
      assert(dropped(a)[0].items[0].qty === 2, "в мешке не 2");
      a.send("pickup", { bag: dropped(a)[0].id });
      await a.until(() => count(a, "hp_potion") === n, 2000, "всё вернулось (без дюпа)");
    });
    await check("надетое и пустая ячейка: нельзя", async () => {
      const eq = Object.values(a.self!.equip).filter(Boolean).length;
      await sleep(450);
      a.send("drop", { index: 9999 });
      a.send("drop", { index: -1 });
      a.send("drop", { index: "x" });
      a.send("drop", { index: inv(a).findIndex((x) => x === null) });
      await sleep(400);
      assert(dropped(a).length === 0, "мешок из ничего");
      assert(Object.values(a.self!.equip).filter(Boolean).length === eq, "надетое изменилось");
    });
    await check("привязанное нельзя выбросить, уничтожение только со словом", async () => {
      a.send("dbg", { op: "item", unique: "ashbringer" });
      await a.until(() => idx(a, "ashbringer") >= 0 || inv(a).some((x) => x?.unique), 2000, "уник");
      const i = inv(a).findIndex((x) => x?.unique);
      await sleep(450);
      a.send("drop", { index: i });
      await sleep(300);
      assert(dropped(a).length === 0 && inv(a)[i], "привязанное выброшено");
      a.send("destroy", { index: i, word: "нет" });
      await sleep(300);
      assert(inv(a)[i], "уничтожено без слова");
      a.send("destroy", { index: i, word: "уничтожить" });
      await a.until(() => !inv(a)[i], 2000, "уничтожено");
      assert(dropped(a).length === 0, "уничтожение создало мешок");
    });
    await check("золото в мешке: выброс, сумма в мешке, подбор", async () => {
      a.send("dbg", { op: "gold", v: 100 });
      await sleep(300);
      const g = a.self!.gold;
      await sleep(450);
      a.send("drop", { gold: g + 1 });
      await sleep(300);
      assert(a.self!.gold === g && dropped(a).length === 0, "выбросил больше золота, чем есть");
      a.send("drop", { gold: 40 });
      await a.until(() => dropped(a).length === 1, 2000, "мешок с золотом");
      assert(dropped(a)[0].gold === 40 && a.self!.gold === g - 40, "золото не списалось/не в мешке");
      a.send("pickup", { bag: dropped(a)[0].id });
      await a.until(() => a.self!.gold === g, 2000, "золото вернулось");
    });
    await check("лимит частоты", async () => {
      await sleep(450);
      a.send("dbg", { op: "item", base: "ring", ilvl: 1 });
      a.send("dbg", { op: "item", base: "ring", ilvl: 1 });
      await sleep(300);
      const rings = inv(a).map((x, i) => (x?.base === "ring" ? i : -1)).filter((i) => i >= 0);
      a.send("drop", { index: rings[0] });
      a.send("drop", { index: rings[1] });
      await sleep(400);
      assert(dropped(a).length <= 1, "две выброски подряд без паузы");
    });
  } finally {
    await a.leave().catch(() => {});
    await b.leave().catch(() => {});
    await stopServer();
  }
  console.log(`ok: ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(lock, { force: true }));
