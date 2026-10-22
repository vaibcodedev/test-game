/** Сетевые проверки городов: открытие телепорта, каст и отмена, бой, цена, возрождение, задания; банк, заточка и сумки в обеих столицах, торговля в поселении. */
import { DatabaseSync } from "node:sqlite";
import { BAGMEN, BAG_STEP } from "../shared/bags";
import { BANKERS } from "../shared/bank";
import { CITIES, cityAtTile, teleportPrice } from "../shared/cities";
import { CLASS_IDS, classFaction } from "../shared/classes";
import { MERCHANT_RANGE, TILE } from "../shared/constants";
import { SETTLEMENTS } from "../shared/settlements";
import { SMITHS } from "../shared/upgrade";
import { Bot, assert, check, dbFile, ensureChar, passedCount, sleep, startServer, stopServer } from "./harness";

const [ember, oasis, snow] = CITIES;
const home = CITIES.find((c) => c.capital === "solgard")!, enemy = CITIES.find((c) => c.capital === "umbrath")!;
const at = (b: Bot, c: { x: number; y: number }) => Math.hypot(b.me().x - c.x, b.me().y - c.y);

/** Банкир, кузнец и сумочник столицы cap: банк открывается, руда покупается, сумка расширяется; с площади столицы — отказ у всех троих. */
async function capitalServices(b: Bot, cap: (typeof CITIES)[number]) {
  const inCap = <T extends { x: number; y: number }>(list: T[]) => list.find((n) => cityAtTile(Math.floor(n.x / TILE), Math.floor(n.y / TILE))?.id === cap.id)!;
  const banker = inCap(BANKERS), smith = inCap(SMITHS), bagman = inCap(BAGMEN);
  assert(!!banker && !!smith && !!bagman, `в ${cap.name} нет банкира, кузнеца или сумочника`);
  let bank: unknown = null;
  b.room.onMessage("bank", (m) => (bank = m));
  b.send("dbg", { op: "gold", v: 20000 });
  b.send("dbg", { op: "tp", x: banker.x, y: banker.y + 30 });
  await sleep(200);
  b.send("bank:open", {});
  await b.until(() => !!bank, 2000, `окно банка у ${banker.name}`);
  b.send("dbg", { op: "tp", x: smith.x, y: smith.y + 30 });
  await sleep(200);
  const g0 = b.self!.gold;
  b.send("smith:buy", { id: "ash_ore", qty: 1 });
  await b.until(() => b.self!.gold < g0 && b.self!.inventory.some((it) => it?.base === "ash_ore"), 2000, `руда у ${smith.name}`);
  b.send("dbg", { op: "tp", x: bagman.x, y: bagman.y + 30 });
  await sleep(200);
  const size = b.self!.inventory.length;
  b.send("bag:expand", {});
  await b.until(() => b.self!.inventory.length === size + BAG_STEP, 2000, `сумка расширена у ${bagman.name}`);
  // посреди площади столицы до них дальше MERCHANT_RANGE: сервер отказывает у каждого
  b.send("dbg", { op: "tp", x: cap.spawn.x, y: cap.spawn.y + 200 });
  await sleep(200);
  for (const n of [banker, smith, bagman]) assert(Math.hypot(n.x - cap.spawn.x, n.y - cap.spawn.y - 200) > MERCHANT_RANGE, `${n.name} у самой площади — отказ не проверить`);
  b.toasts.length = 0;
  bank = null;
  b.send("bank:open", {});
  await b.until(() => b.toasts.some((t) => t.includes("Банкир далеко")), 2000, "отказ банка издалека");
  assert(!bank, "банк открылся издалека");
  b.send("smith:buy", { id: "ash_ore", qty: 1 });
  await b.until(() => b.toasts.some((t) => t.includes("Кузнец далеко")), 2000, "отказ кузнеца издалека");
  const size2 = b.self!.inventory.length;
  b.send("bag:expand", {});
  await b.until(() => b.toasts.some((t) => t.includes("Сумочник далеко")), 2000, "отказ сумочника издалека");
  assert(b.self!.inventory.length === size2, "сумка расширена издалека");
}

async function main() {
  await startServer(true);
  try {
    const b = await Bot.join("Путник", "secret", "warrior");
    b.send("dbg", { op: "god" });
    await check("новый герой в своей столице и знает её; оазис и Эмберхолл не открыты", async () => {
      assert(at(b, home.spawn) < 80, "появился не в Аурелионе");
      await b.until(() => (b.self!.cities ?? []).includes(home.id), 2000, "столица открыта");
      assert(!(b.self!.cities ?? []).includes("oasis") && !(b.self!.cities ?? []).includes("ember"), "открыто раньше времени");
    });
    await check("вражеская столица: телепорт не открывается, стража бьёт чужака", async () => {
      b.send("dbg", { op: "tp", x: enemy.spawn.x, y: enemy.spawn.y });
      await b.until(() => b.me().outlaw === 1, 2000, "метка чужака");
      await sleep(300);
      assert(!(b.self!.cities ?? []).includes(enemy.id), "открыт телепорт врага");
      b.send("dbg", { op: "tp", x: ember.spawn.x, y: ember.spawn.y });
      await b.until(() => (b.self!.cities ?? []).includes("ember"), 2000, "Эмберхолл открыт визитом");
    });
    await check("вход в зону города открывает телепорт", async () => {
      b.send("dbg", { op: "tp", x: oasis.spawn.x, y: oasis.spawn.y });
      await b.until(() => (b.self!.cities ?? []).includes("oasis"), 2000, "оазис открыт");
      assert(b.toasts.some((t) => t.includes("Открыт телепорт: Оазис Миражей")), "нет сообщения");
    });
    await check("телепорт без камня и в неоткрытый город отклоняется", async () => {
      b.send("dbg", { op: "gold", v: 1000 });
      b.send("tp:go", { id: "ember" });
      await sleep(3600);
      assert(at(b, ember.spawn) > 500, "телепортировало без камня");
      b.send("dbg", { op: "tp", x: oasis.arrive.x, y: oasis.arrive.y });
      await sleep(200);
      b.send("tp:go", { id: "snow_valley" });
      await sleep(3600);
      assert(at(b, oasis.arrive) < 40, "ушёл в неоткрытый город");
    });
    await check("движение отменяет каст", async () => {
      b.send("tp:go", { id: "ember" });
      await sleep(500);
      b.send("input", { mx: 1, my: 0 });
      await sleep(300);
      b.send("input", { mx: 0, my: 0 });
      await sleep(3500);
      assert(at(b, ember.arrive) > 500, "телепорт сработал вопреки движению");
    });
    await check("в бою телепорт запрещён", async () => {
      b.send("dbg", { op: "tp", x: oasis.arrive.x, y: oasis.arrive.y });
      await sleep(200);
      b.send("dbg", { op: "fight" });
      await sleep(200);
      b.toasts.length = 0;
      b.send("tp:go", { id: "ember" });
      await sleep(3500);
      assert(b.toasts.some((t) => t.includes("в бою")), "нет отказа");
      assert(at(b, ember.arrive) > 500, "телепорт сработал в бою");
    });
    await check("телепорт за золото через 3 секунды", async () => {
      b.send("dbg", { op: "calm" });
      await sleep(200);
      const gold = b.self!.gold;
      b.send("tp:go", { id: "ember" });
      await sleep(1500);
      assert(at(b, ember.arrive) > 500, "телепорт мгновенный");
      await b.until(() => at(b, ember.arrive) < 40, 3500, "прибытие в Эмберхолл");
      await b.until(() => b.self!.gold === gold - teleportPrice(oasis, ember), 1500, "списание золота");
    });
    await check("недостаточно золота — отказ", async () => {
      b.send("dbg", { op: "gold", v: -b.self!.gold });
      await sleep(200);
      b.send("tp:go", { id: "oasis" });
      await sleep(3500);
      assert(at(b, ember.arrive) < 40, "ушёл без золота");
    });
    await check("возрождение в ближайшем открытом городе", async () => {
      b.send("dbg", { op: "tp", x: snow.spawn.x, y: snow.spawn.y });
      await b.until(() => (b.self!.cities ?? []).includes("snow_valley"), 2000, "долина открыта");
      b.send("dbg", { op: "tp", x: snow.spawn.x + 400, y: snow.spawn.y + 600 });
      await sleep(200);
      b.send("dbg", { op: "hurt", v: 9999999 });
      await b.until(() => b.me().anim === 4, 2000, "смерть");
      await sleep(4200);
      b.send("respawn");
      await b.until(() => b.me().anim !== 4, 2000, "возрождение");
      assert(at(b, snow.spawn) < 40, "возродился не в долине");
    });
    await check("задания: принять, выполнить, сдать", async () => {
      const g = oasis.quest!;
      b.send("dbg", { op: "level", v: 20 });
      b.send("dbg", { op: "tp", x: g.x, y: g.y + 30 });
      await sleep(200);
      b.send("quest:accept", { id: "oasis_jackals" });
      await b.until(() => b.self!.quests?.active.oasis_jackals === 0, 1500, "принято");
      b.send("quest:turn", { id: "oasis_jackals" });
      await sleep(300);
      assert(b.self!.quests!.active.oasis_jackals === 0, "сдано без выполнения");
      b.send("dbg", { op: "qp", kind: "kill", target: "jackal", n: 8 });
      await b.until(() => b.self!.quests?.active.oasis_jackals === 8, 1500, "прогресс");
      const gold = b.self!.gold;
      b.send("quest:turn", { id: "oasis_jackals" });
      await b.until(() => (b.self!.quests?.done ?? []).includes("oasis_jackals"), 1500, "сдано");
      assert(b.self!.gold === gold + 220, "награда золотом");
      b.send("quest:accept", { id: "oasis_jackals" });
      await sleep(300);
      assert(b.self!.quests!.active.oasis_jackals === undefined, "повторное принятие");
    });
    await check("заказчик далеко — задание не принять", async () => {
      b.send("dbg", { op: "tp", x: ember.spawn.x, y: ember.spawn.y });
      await sleep(200);
      b.send("quest:accept", { id: "oasis_cactus" });
      await sleep(300);
      assert(b.self!.quests!.active.oasis_cactus === undefined, "принято издалека");
    });
    await check("банк, заточка и сумки — и в своей столице (решение 2 задачи 132), вдали — отказ", () => capitalServices(b, home));
    await check("банк, заточка и сумки — и во второй столице (герой Умбрата)", async () => {
      const cls = CLASS_IDS.find((c) => classFaction(c) === "umbrath")!;
      const u = await Bot.join("Мортец", "secret", cls);
      try {
        u.send("dbg", { op: "god" });
        await capitalServices(u, enemy);
      } finally {
        await u.leave();
      }
    });
    await check("поселение своих земель: торговец и повар продают", async () => {
      const s = SETTLEMENTS.find((q) => q.faction === home.capital)!;
      b.send("dbg", { op: "tp", x: s.merchant.x, y: s.merchant.y + 30 });
      await sleep(200);
      let before = b.self!.gold;
      b.send("buy", { base: "hp_potion", qty: 1 });
      await b.until(() => b.self!.gold < before, 1500, `покупка у ${s.merchant.name}`);
      b.send("dbg", { op: "tp", x: s.cook.x, y: s.cook.y + 30 });
      await sleep(200);
      before = b.self!.gold;
      b.send("cook:buy", { id: "bread", qty: 1 });
      await b.until(() => b.self!.gold < before && b.self!.inventory.some((it) => it?.base === "food_bread"), 1500, `хлеб у ${s.cook.name}`);
    });
    await check("торговля у торговца оазиса", async () => {
      b.send("dbg", { op: "gold", v: 100 });
      const m = oasis.merchant!;
      b.send("dbg", { op: "tp", x: m.x, y: m.y + 40 });
      await sleep(200);
      const before = b.self!.gold;
      b.send("buy", { base: "hp_potion", qty: 1 });
      await b.until(() => b.self!.gold < before, 1500, "покупка");
    });
    await check("сохранение другой версии карты: герой входит в столицу, открытые телепорты сброшены до своей", async () => {
      // «Старожил» дошёл до Эмберхолла и Оазиса; версию карты в его сохранении подменяют на прежнюю (до перестройки мира, задача 132)
      const token = await ensureChar("Старожил", "secret", "Старожил", "warrior");
      const v = await Bot.enter(token, "Старожил");
      v.send("dbg", { op: "tp", x: ember.spawn.x, y: ember.spawn.y });
      await v.until(() => (v.self!.cities ?? []).includes("ember"), 2000, "Эмберхолл открыт");
      v.send("dbg", { op: "tp", x: oasis.spawn.x, y: oasis.spawn.y });
      await v.until(() => (v.self!.cities ?? []).includes("oasis"), 2000, "оазис открыт");
      await v.leave();
      const d = new DatabaseSync(dbFile);
      try {
        let data = "";
        for (let i = 0; i < 40 && !data.includes('"oasis"'); i++) {
          data = (d.prepare("SELECT data FROM players WHERE name_key = 'старожил'").get() as { data: string } | undefined)?.data ?? "";
          if (!data.includes('"oasis"')) await sleep(100);
        }
        assert(data.includes('"oasis"'), "в сохранении нет открытого оазиса");
        const save = JSON.parse(data);
        save.mapVer = 4;
        save.x = ember.spawn.x;
        save.y = ember.spawn.y;
        d.prepare("UPDATE players SET data = ? WHERE name_key = 'старожил'").run(JSON.stringify(save));
      } finally {
        d.close();
      }
      const w = await Bot.enter(token, "Старожил");
      try {
        assert(at(w, home.spawn) < 80, "вошёл не в столицу");
        await w.until(() => (w.self!.cities ?? []).length > 0, 1500, "список городов");
        assert((w.self!.cities ?? []).join() === home.id, `открытые телепорты не сброшены: ${(w.self!.cities ?? []).join()}`);
        await w.until(() => w.toasts.some((t) => t.includes("Мир перестроен")), 1500, "сообщение о сбросе телепортов");
      } finally {
        await w.leave();
      }
    });
    await b.leave();
  } finally {
    await stopServer();
  }
  console.log(`\nГорода (сеть): проверок ${passedCount()}`);
}
main().catch(async (e) => {
  console.error(e);
  await stopServer();
  process.exit(1);
});
