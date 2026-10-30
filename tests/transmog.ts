/** Перековка (docs/art/gear.md): снять оболочку, наложить, неверное семейство, нехватка золота, бой, передача, сброс, перезаход. Запуск: npx tsx tests/transmog.ts */
import { applyPrice, extractPrice, REFORGER } from "../shared/transmog";
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";

type T = Bot & { trade: any; req: any; done: number; tm: number; selfAtTm: unknown };
async function join(name: string): Promise<T> {
  const b = (await Bot.join(name, "secret")) as T;
  b.trade = null;
  b.req = null;
  b.done = 0;
  b.tm = 0;
  b.room.onMessage("trade:state", (m) => (b.trade = m));
  b.room.onMessage("trade:request", (m) => (b.req = m));
  b.room.onMessage("trade:done", () => b.done++);
  // состояние героя приходит следующим тиком после tm:done: запоминаем, какое было, и ждём новое
  b.room.onMessage("tm:done", () => { b.selfAtTm = b.self; b.tm++; });
  return b;
}
const inv = (b: Bot) => b.self!.inventory;
const idxOf = (b: Bot, base: string, pred: (it: any) => boolean = () => true) => inv(b).findIndex((it) => it?.base === base && pred(it));
const shells = (b: Bot) => inv(b).filter((it) => it?.base === "tm_shell") as any[];
async function toast(b: Bot, part: string) {
  await b.until(() => b.toasts.some((t) => t.includes(part)), 2000, `сообщение «${part}»`);
}
async function give(b: Bot, base: string, ilvl = 20, rarity = 1): Promise<number> {
  const had = new Set(inv(b).filter(Boolean).map((it) => it!.uid));
  b.send("dbg", { op: "item", base, ilvl, rarity });
  await b.until(() => inv(b).some((it) => it?.base === base && !had.has(it.uid)), 2000, `выдан ${base}`);
  return inv(b).findIndex((it) => it?.base === base && !had.has(it.uid));
}
async function atReforger(b: Bot) {
  b.send("dbg", { op: "tp", x: REFORGER.x, y: REFORGER.y + 20 });
  b.send("dbg", { op: "calm" });
  await sleep(150);
}
async function waitTm(b: T, n: number) {
  await b.until(() => b.tm > n, 3000, "перековка выполнена");
  await b.until(() => b.self !== b.selfAtTm, 3000, "новое состояние героя");
}

async function main() {
  console.log("Запуск тестового сервера…");
  await startServer();
  try {
    console.log("Перековка");
    let a = await join("Перековка1");
    const b = await join("Перековка2");
    b.send("dbg", { op: "tp", x: REFORGER.x + 30, y: REFORGER.y + 30 });
    a.send("dbg", { op: "level", v: 30 });
    a.send("dbg", { op: "gold", v: 20000 });
    await a.until(() => a.self!.gold >= 20000 && a.self!.level >= 30, 3000, "золото и уровень");

    await check("далеко от Перековщика — отказ", async () => {
      const i = await give(a, "greatsword", 30, 2);
      a.send("dbg", { op: "tp", x: REFORGER.x + 700, y: REFORGER.y });
      await sleep(150);
      a.toasts.length = 0;
      a.send("tm:extract", { index: i });
      await toast(a, "Перековщик далеко");
      assert(inv(a)[i]?.base === "greatsword", "донор пропал");
    });

    let shellIdx = -1;
    await check("снять оболочку: донор распадается, золото списано, оболочка на его месте", async () => {
      await atReforger(a);
      const i = idxOf(a, "greatsword");
      const donor = inv(a)[i]!;
      const g0 = a.self!.gold, n = a.tm;
      a.send("tm:extract", { index: i });
      await waitTm(a, n);
      const sh = inv(a)[i] as any;
      assert(sh?.base === "tm_shell", "на месте донора не оболочка: " + sh?.base);
      assert(sh.appearance?.base === "greatsword" && sh.appearance.rarity === donor.rarity && sh.appearance.name === donor.name, "вид оболочки: " + JSON.stringify(sh.appearance));
      assert(sh.name.includes(donor.name) && !Object.keys(sh.stats).length, "имя/характеристики оболочки");
      assert(a.self!.gold === g0 - extractPrice(donor), `золото: ${a.self!.gold} ≠ ${g0} − ${extractPrice(donor)}`);
      shellIdx = i;
    });

    await check("неверное семейство: двуручный вид на одноручное оружие и на латы — отказ", async () => {
      const ax = await give(a, "axe", 10, 0);
      const pl = await give(a, "plate_armor", 10, 0);
      const g0 = a.self!.gold;
      a.toasts.length = 0;
      a.send("tm:apply", { shell: shellIdx, index: ax });
      await toast(a, "того же слота");
      a.toasts.length = 0;
      a.send("tm:apply", { shell: shellIdx, index: pl });
      await toast(a, "того же слота");
      assert(!inv(a)[ax]!.appearance && !inv(a)[pl]!.appearance && inv(a)[shellIdx]?.base === "tm_shell" && a.self!.gold === g0, "что-то изменилось после отказа");
    });

    await check("наложить: вид меняется, характеристики и заточка свои, оболочка исчезает; на герое — вид донора", async () => {
      const t = await give(a, "hammer", 12, 0);
      const target = inv(a)[t]!;
      const shell = inv(a)[shellIdx]!;
      const g0 = a.self!.gold, n = a.tm;
      a.send("tm:apply", { shell: shellIdx, index: t });
      await waitTm(a, n);
      const it = inv(a)[t]!;
      assert(it.appearance?.base === "greatsword", "вид не наложен");
      assert(it.base === "hammer" && JSON.stringify(it.stats) === JSON.stringify(target.stats) && it.uid === target.uid, "вещь изменилась");
      assert(!inv(a)[shellIdx], "оболочка не исчезла");
      assert(a.self!.gold === g0 - applyPrice(shell, target), "цена наложения");
      // надеть: другие видят вид донора (unit.weapon), иконка — по виду
      a.send("equip", { index: t });
      await a.until(() => a.self!.equip.weapon?.uid === target.uid, 2000, "надет");
      await b.until(() => { let w = ""; b.room.state.players.forEach((u: any) => { if (u.name === "Перековка1") w = u.weapon; }); return w.startsWith("greatsword:"); }, 2000, "другой игрок видит вид донора");
    });

    await check("в бою надетую вещь не перековать", async () => {
      const i = await give(a, "greataxe", 5, 0);
      const n = a.tm;
      a.send("tm:extract", { index: i });
      await waitTm(a, n);
      const sh = idxOf(a, "tm_shell");
      a.send("dbg", { op: "fight" });
      await sleep(100);
      a.toasts.length = 0;
      a.send("tm:apply", { shell: sh, slot: "weapon" });
      await toast(a, "В бою");
      assert(a.self!.equip.weapon!.appearance?.base === "greatsword" && inv(a)[sh]?.base === "tm_shell", "перековано в бою");
      a.send("dbg", { op: "calm" });
      await sleep(100);
    });

    await check("нехватка золота — отказ, ничего не списано", async () => {
      const i = await give(a, "spear", 60, 2);
      a.send("dbg", { op: "gold", v: -a.self!.gold });
      await a.until(() => a.self!.gold === 0, 2000, "золото 0");
      a.toasts.length = 0;
      a.send("tm:extract", { index: i });
      await toast(a, "Не хватает золота");
      assert(inv(a)[i]?.base === "spear" && a.self!.gold === 0, "донор или золото изменились");
      a.send("dbg", { op: "gold", v: 20000 });
      await a.until(() => a.self!.gold >= 20000, 2000, "золото вернулось");
    });

    await check("оболочка передаётся через обмен вместе с видом", async () => {
      const sh = idxOf(a, "tm_shell");
      const uid = inv(a)[sh]!.uid;
      b.send("dbg", { op: "tp", x: REFORGER.x + 20, y: REFORGER.y + 20 });
      await sleep(150);
      b.req = null;
      a.send("trade:request", { id: b.id });
      await b.until(() => !!b.req, 2000, "запрос обмена");
      b.send("trade:respond", { accept: true });
      await a.until(() => !!a.trade && !!b.trade, 2000, "окно обмена");
      a.send("trade:add", { index: sh });
      await sleep(150);
      a.send("trade:ready");
      b.send("trade:ready");
      await a.until(() => a.trade?.mine.ready && a.trade?.theirs.ready, 2000, "оба готовы");
      await sleep(3100);
      const d = a.done;
      a.send("trade:confirm");
      b.send("trade:confirm");
      await a.until(() => a.done > d, 2000, "обмен завершён");
      await b.until(() => shells(b).some((s) => s.uid === uid), 2000, "оболочка у второго");
      const got = shells(b).find((s) => s.uid === uid);
      assert(got.appearance?.base === "greataxe", "вид потерян при передаче");
      assert(!shells(a).some((s) => s.uid === uid), "оболочка осталась у первого");
    });

    await check("сбросить вид надетой вещи: вещь возвращается к своему, на герое — свой вид", async () => {
      const n = a.tm;
      a.send("tm:reset", { slot: "weapon" });
      await waitTm(a, n);
      assert(!a.self!.equip.weapon!.appearance && a.self!.equip.weapon!.base === "hammer", "вид не сброшен");
      await b.until(() => { let w = ""; b.room.state.players.forEach((u: any) => { if (u.name === "Перековка1") w = u.weapon; }); return w.startsWith("hammer:"); }, 2000, "свой вид у других");
    });

    await check("вид сохраняется после перезахода", async () => {
      // новая оболочка с латного доспеха — на латы из сумки
      const d = await give(a, "plate_armor", 40, 2);
      const donorName = inv(a)[d]!.name;
      let n = a.tm;
      a.send("tm:extract", { index: d });
      await waitTm(a, n);
      const sh = idxOf(a, "tm_shell");
      const t = idxOf(a, "plate_armor", (it) => !it.appearance);
      const uid = inv(a)[t]!.uid;
      n = a.tm;
      a.send("tm:apply", { shell: sh, index: t });
      await waitTm(a, n);
      await a.leave();
      await sleep(400);
      a = await join("Перековка1");
      const it = inv(a).find((x) => x?.uid === uid) as any;
      assert(it?.appearance?.base === "plate_armor" && it.appearance.name === donorName, "вид потерян после перезахода: " + JSON.stringify(it?.appearance));
      assert(a.self!.equip.weapon?.base === "hammer" && !a.self!.equip.weapon.appearance, "сброшенный вид вернулся");
    });

    await b.leave();
    await a.leave();
  } finally {
    await stopServer();
  }
  console.log(`\nВсе проверки пройдены: ${passedCount()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
