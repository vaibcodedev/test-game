/** Админ-команды: не-админ игнорируется, админ работает. Запуск: npx tsx tests/admin.ts (если порт 2601 занят: TEST_PORT=2731 npx tsx tests/admin.ts) */
import { DatabaseSync } from "node:sqlite";
import { affixCount, BASE_ITEMS, ITEM_MODELS, makeItem, previewGear, type Slot } from "../shared/items";
import { assert, Bot, check, dbFile, passedCount, sleep, startServer, stopServer } from "./harness";

type GiveResult = { kind: "info" | "warn" | "error"; text: string; given: number; worn: boolean };
/** Самая высокая модель категории. */
const topModel = (cat: string) => Object.values(ITEM_MODELS).filter((m) => m.cat === cat).sort((a, b) => b.lvl - a.lvl)[0];

async function main() {
  await startServer();
  try {
    const user = await Bot.join("Простой", "secret");
    const adm = await Bot.join("Админ1", "secret");
    const results: GiveResult[] = [];
    adm.room.onMessage("admin:give:result", (r: GiveResult) => results.push(r));
    await check("не-админ: admin:gold игнорируется", async () => {
      const g = user.self!.gold;
      user.send("admin:gold", { name: "Простой", v: 500 });
      await sleep(500);
      assert(user.self!.gold === g, "золото изменилось");
    });
    await check("админ (флаг в БД): admin:gold работает", async () => {
      const db = new DatabaseSync(dbFile);
      db.prepare("UPDATE players SET admin = 1 WHERE name_key = 'админ1'").run();
      db.close();
      const g = user.self!.gold;
      adm.send("admin:gold", { name: "Простой", v: 500 });
      await user.until(() => user.self!.gold === g + 500, 2000, "золото +500");
      const d = new DatabaseSync(dbFile);
      const rows = d.prepare("SELECT action FROM admin_log ORDER BY id").all() as { action: string }[];
      d.close();
      assert(rows.some((r) => r.action === "denied:admin:gold") && rows.some((r) => r.action === "gold"), "журнал: " + JSON.stringify(rows));
    });
    // ---- выдача предметов (каталог моделей, заточка, редкость 0..2, ilvl 1..100, «надеть») ----
    const gets = await Bot.join("Получатель", "secret");
    const gets2 = await Bot.join("Получатель2", "secret");
    const bag = (b: Bot) => b.self!.inventory.filter(Boolean) as any[];
    const find = (b: Bot, pred: (i: any) => boolean) => bag(b).find(pred);
    /** Тосты админа после индекса from: ждём первого (сервер под нагрузкой отвечает не мгновенно), затем короткая пауза на остальные. */
    const toastsAfter = async (from: number) => {
      for (let t0 = Date.now(); adm.toasts.length === from && Date.now() - t0 < 3000; ) await sleep(30);
      await sleep(200);
      return adm.toasts.slice(from).join(" | ");
    };
    await check("не-админ: admin:give игнорируется", async () => {
      const n = bag(gets).length;
      user.send("admin:give", { name: "Получатель", model: "sword_52", rarity: 1 });
      await sleep(400);
      assert(bag(gets).length === n, "предмет выдан не-админом");
    });
    await check("выдача модели: редкость 2, ilvl 100, заточка +7", async () => {
      adm.send("admin:give", { name: "Получатель", model: "sword_100", rarity: 2, ilvl: 100, plus: 7 });
      await gets.until(() => !!find(gets, (i) => i.model === "sword_100"), 2000, "sword_100 в сумке");
      const it = find(gets, (i) => i.model === "sword_100");
      assert(it.plus === 7 && it.rarity === 2 && it.ilvl === 100 && it.req === 98 && it.base === "sword", "поля: " + JSON.stringify(it));
    });
    await check("ilvl по умолчанию = уровень модели, заточка по умолчанию 0", async () => {
      adm.send("admin:give", { name: "Получатель", model: "sword_52", rarity: 1 });
      await gets.until(() => !!find(gets, (i) => i.model === "sword_52"), 2000, "sword_52 в сумке");
      const it = find(gets, (i) => i.model === "sword_52");
      assert(it.ilvl === 52 && !it.plus && it.rarity === 1, "поля: " + JSON.stringify(it));
    });
    await check("«выдать и надеть»: вещь надета, заточка и редкость сохранены, итог без предупреждений", async () => {
      const k = results.length;
      adm.send("admin:give", { name: "Получатель", model: "sword_1", rarity: 1, plus: 3, equip: true });
      await gets.until(() => gets.self!.equip.weapon?.model === "sword_1", 2000, "sword_1 надет");
      const w = gets.self!.equip.weapon!;
      assert(w.plus === 3 && w.rarity === 1, "надето: " + JSON.stringify(w));
      assert(!find(gets, (i) => i.uid === w.uid), "надетая вещь осталась и в сумке");
      await sleep(200);
      const r = results[k];
      assert(results.length === k + 1 && r.kind === "info" && r.worn && r.given === 1 && r.text.includes("(надето)"), "итог: " + JSON.stringify(results.slice(k)));
    });
    await check("надеть нельзя (уровень): вещь в сумке, админ получает один итог с причиной", async () => {
      const k = adm.toasts.length, kr = results.length;
      adm.send("admin:give", { name: "Получатель", model: "sword_92", ilvl: 92, equip: true });
      await gets.until(() => !!find(gets, (i) => i.model === "sword_92"), 2000, "sword_92 в сумке");
      const t = await toastsAfter(k);
      assert(gets.self!.equip.weapon?.model === "sword_1" && t.includes("не надето: нужен 90 уровень"), "оружие: " + gets.self!.equip.weapon?.model + ", тосты: " + t);
      assert(!t.includes(" | "), "несколько тостов вместо одного итога: " + t);
      const r = results[kr];
      assert(results.length === kr + 1 && r.kind === "warn" && r.given === 1 && r.worn === false && r.text.includes("не надето"), "результат: " + JSON.stringify(results.slice(kr)));
    });
    await check("неверные значения отклоняются, ничего не выдаётся", async () => {
      const n = bag(gets).length;
      const bad: object[] = [{ ilvl: 101 }, { ilvl: 0 }, { ilvl: 12.5 }, { ilvl: "100" }, { plus: 11 }, { plus: -1 }, { plus: 1.5 }, { rarity: 3 }, { rarity: 4 }, { rarity: -1 }, { qty: 0 }, { qty: 100 }, { equip: "yes" }];
      for (const b of bad) {
        const k = adm.toasts.length;
        adm.send("admin:give", { name: "Получатель", model: "sword_6", ...b });
        const t = await toastsAfter(k);
        assert(t.includes("Неверные значения"), JSON.stringify(b) + " принято: " + t);
      }
      const k = adm.toasts.length;
      adm.send("admin:give", { name: "Получатель", model: "no_such_model" });
      assert((await toastsAfter(k)).includes("Нет модели"), "неизвестная модель не отклонена");
      assert(bag(gets).length === n && !find(gets, (i) => i.model === "sword_6"), "что-то выдано при ошибке");
    });
    await check("ключи прототипа («constructor», «__proto__») не считаются предметами: понятный отказ, ничего не выдано", async () => {
      const n = bag(gets).length;
      for (const key of ["model", "legendary", "unique", "base"]) {
        for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
          const k = adm.toasts.length, kr = results.length;
          adm.send("admin:give", { name: "Получатель", [key]: id });
          const t = await toastsAfter(k);
          assert(/Нет (модели|легендарного предмета|предмета)/.test(t) && results.length === kr + 1 && results[kr].kind === "error", `${key}:${id} не отклонён: ${t}`);
        }
      }
      assert(bag(gets).length === n, "что-то выдано по ключу прототипа");
    });
    await check("редкость 3 только у легендарок: у обычной модели отклоняется, легендарка из каталога выдаётся", async () => {
      const n = bag(gets).length;
      adm.send("admin:give", { name: "Получатель", model: "sword_6", rarity: 3 });
      await sleep(300);
      assert(bag(gets).length === n, "модель редкости 3 выдана");
      adm.send("admin:give", { name: "Получатель", legendary: "nova_staff" });
      await gets.until(() => bag(gets).some((i) => i.legendary === "nova_staff" && i.rarity === 3), 2000, "легендарка");
    });
    await check("старые варианты: base, unique, legendary (и легендарный через unique)", async () => {
      const potions = () => bag(gets2).filter((i) => i.base === "hp_potion").reduce((a, i) => a + (i.qty ?? 1), 0);
      const p0 = potions();
      adm.send("admin:give", { name: "Получатель2", base: "hp_potion", qty: 3 });
      await gets2.until(() => potions() === p0 + 3, 2000, "3 зелья");
      adm.send("admin:give", { name: "Получатель2", unique: "ashbringer", plus: 2 });
      adm.send("admin:give", { name: "Получатель2", unique: "storm_blade" });
      adm.send("admin:give", { name: "Получатель2", legendary: "nova_staff" });
      adm.send("admin:give", { name: "Получатель2", base: "sword", rarity: 2, ilvl: 40 });
      await gets2.until(() => ["ashbringer", "nova_staff"].every((u) => bag(gets2).some((i) => i.unique === u || i.legendary === u)) && bag(gets2).some((i) => i.legendary === "storm_blade") && bag(gets2).some((i) => i.base === "sword" && i.ilvl === 40), 3000, "все старые виды");
      const a = find(gets2, (i) => i.unique === "ashbringer");
      assert(a.plus === 2 && a.bound, "уникальный: " + JSON.stringify(a));
    });
    await check("маунты: выдача из группы «Маунты», повторная — без дубля, несуществующий отклоняется", async () => {
      const own = () => ((gets2.self as unknown as { mounts?: string[] }).mounts ?? []);
      adm.send("admin:give", { name: "Получатель2", mount: "griffin" });
      await gets2.until(() => own().includes("griffin"), 3000, "грифон выдан");
      adm.send("admin:give", { name: "Получатель2", mount: "griffin" });
      adm.send("admin:give", { name: "Получатель2", mount: "нет_такого" });
      await sleep(400);
      assert(own().filter((m) => m === "griffin").length === 1, "дубль маунта: " + JSON.stringify(own()));
      assert(!own().includes("нет_такого"), "выдан несуществующий маунт");
    });
    await check("сумка: стопка не влезает целиком — выдаётся сколько влезло, given совпадает с фактом, ответ честный", async () => {
      const full = await Bot.join("Склад", "secret");
      const cap = full.self!.inventory.length, used = () => bag(full).length;
      // забиваем сумку так, что остаётся одна свободная ячейка
      adm.send("admin:give", { name: "Склад", model: "sword_6", qty: Math.min(99, cap - used() - 1) });
      await full.until(() => used() === cap - 1, 2500, "сумка почти полна");
      const stack = BASE_ITEMS.hp_potion.stack!;
      const potions = () => bag(full).filter((i) => i.base === "hp_potion").reduce((a, i) => a + (i.qty ?? 1), 0);
      const roomNow = () => (cap - used()) * stack + bag(full).filter((i) => i.base === "hp_potion").reduce((a, i) => a + stack - (i.qty ?? 1), 0);
      const room = roomNow(), before = potions(), k = results.length;
      assert(room < 99, "тест рассчитан на нехватку места: " + room);
      adm.send("admin:give", { name: "Склад", base: "hp_potion", qty: 99 });
      await sleep(500);
      const r = results[k];
      assert(r && results.length === k + 1, "нет единственного ответа admin:give:result");
      assert(potions() - before === room && r.given === room, `ожидали положить ${room}, в сумке +${potions() - before}, ответ given=${r.given}`);
      assert(r.kind === "warn" && r.text.includes("не влезло"), "ответ: " + JSON.stringify(r));
      // теперь места нет совсем: ничего не добавляется, ответ — ошибка
      const p1 = potions(), k2 = results.length;
      adm.send("admin:give", { name: "Склад", base: "hp_potion", qty: 99 });
      await sleep(400);
      assert(results[k2]?.kind === "error" && results[k2].given === 0 && potions() === p1, "полная сумка: " + JSON.stringify(results[k2]) + ", зелий " + p1 + " → " + potions());
    });
    await check("«выдать и надеть» двуручное при занятой второй руке и полной сумке: вещь в сумке, итог с причиной", async () => {
      const bot = await Bot.join("Склад2", "secret");
      const cap = bot.self!.inventory.length, free = () => cap - bag(bot).length;
      const sh = Object.values(ITEM_MODELS).find((m) => m.cat === "shield" && m.lvl === 1)!;
      const gs = Object.values(ITEM_MODELS).find((m) => m.cat === "greatsword" && m.lvl === 1)!;
      assert(sh && gs, "нет моделей щита/двуручного меча 1 уровня");
      adm.send("admin:give", { name: "Склад2", model: "sword_1", equip: true });
      adm.send("admin:give", { name: "Склад2", model: sh.id, equip: true });
      await bot.until(() => !!bot.self!.equip.weapon && !!bot.self!.equip.offhand, 2500, "меч и щит надеты");
      if (free() > 1) adm.send("admin:give", { name: "Склад2", model: "sword_6", qty: Math.min(99, free() - 1) });
      await bot.until(() => free() <= 1, 2500, "осталась одна ячейка");
      const k = results.length;
      adm.send("admin:give", { name: "Склад2", model: gs.id, equip: true });
      await sleep(500);
      const r = results[k];
      assert(results.length === k + 1 && r.kind === "warn" && r.given === 1 && !r.worn && /не надето: .*(сумка|двуруч)/.test(r.text), "итог: " + JSON.stringify(results.slice(k)));
      assert(bot.self!.equip.weapon?.model === "sword_1" && !!bot.self!.equip.offhand && !!find(bot, (i) => i.model === gs.id), "экипировка изменилась или вещи нет в сумке");
    });
    await check("не-админ не раздувает журнал: отказы пишутся не чаще раза в 10 с на тип сообщения", async () => {
      const count = () => {
        const d = new DatabaseSync(dbFile);
        const n = (d.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'denied:admin:give'").get() as { n: number }).n;
        d.close();
        return n;
      };
      const before = count();
      for (let i = 0; i < 40; i++) user.send("admin:give", { name: "Получатель", model: "sword_6" });
      await sleep(600);
      assert(count() - before <= 1, "новых записей об отказе: " + (count() - before));
    });
    await check("предпросмотр: гарантированные аффиксы точные, случайные считаются отдельно (совпадает с makeItem)", () => {
      for (const [cat, rarity] of [["sword", 1], ["sword", 2], ["twinblades", 2], ["shield", 2]] as [string, number][]) {
        const m = topModel(cat), pv = previewGear(m.id, m.lvl, rarity, 0)!;
        const n = affixCount(BASE_ITEMS[m.cat].slot as Slot, rarity), nf = Math.min(n, m.affix.length);
        assert(pv.fixed.length === nf && pv.random === n - nf, `${m.id} r${rarity}: fixed=${pv.fixed.length} random=${pv.random} n=${n}`);
        assert(pv.fixed.every((k, i) => k === m.affix[i]), `${m.id}: порядок гарантированных аффиксов`);
        for (let i = 0; i < 40; i++) {
          const real = makeItem(m.id, m.lvl, rarity);
          for (const k of ["dmgMin", "dmgMax", "armor"] as const) assert(real.stats[k] === pv.item.stats[k], `${m.id}: ${k} не точный: ${real.stats[k]} vs ${pv.item.stats[k]}`);
          for (const k of pv.fixed) { const a = real.stats[k] ?? 0, b = pv.item.stats[k] ?? 0; assert(Math.abs(a - b) <= 0.16 * b + 2, `${m.id}: ${k} ${a} vs ${b}`); }
        }
      }
      // кольцо без основных характеристик: число ключей = число аффиксов
      const ring = topModel("ring");
      for (const rarity of [1, 2]) {
        const pv = previewGear(ring.id, 50, rarity)!, real = makeItem(ring.id, 50, rarity);
        assert(Object.keys(real.stats).length === pv.fixed.length + pv.random, `кольцо r${rarity}: ${Object.keys(real.stats).length} ≠ ${pv.fixed.length}+${pv.random}`);
        assert(Object.keys(pv.item.stats).length === pv.fixed.length, "в предпросмотре остались случайные аффиксы");
      }
      // голая база: имя без приставок, все аффиксы случайные
      const h = previewGear("helmet", 40, 2)!;
      assert(h.item.name === "Шлем" && h.fixed.length === 0 && h.random === 3, "база: " + JSON.stringify([h.item.name, h.fixed, h.random]));
    });
    await check("журнал: give с заточкой и ilvl", async () => {
      const d = new DatabaseSync(dbFile);
      const rows = d.prepare("SELECT details FROM admin_log WHERE action = 'give'").all() as { details: string }[];
      d.close();
      assert(rows.some((r) => { const x = JSON.parse(r.details); return x.id === "sword_100" && x.plus === 7 && x.ilvl === 100 && x.rarity === 2; }), "журнал: " + JSON.stringify(rows));
    });
  } finally {
    await stopServer();
  }
  console.log(`Пройдено: ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
