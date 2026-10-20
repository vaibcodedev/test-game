/** Панели умений (задача 115, шаг 4): TEST_PORT=2711 npx tsx tests/hotbar.ts */
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";
import { autoPlace, defaultBars, findRef, hasBars, migrateBars, setSlot, validateBars, BAR_SLOTS } from "../shared/hotbar";
import { activeSkills } from "../shared/skills";
import { CLASSES } from "../shared/classes";
import { Keybinds, BAR_ACTIONS } from "../client/src/game/keybinds";

const kb = new Keybinds(null);

async function main() {
  await check("миграция: изученные умения на прежних клавишах, зелья на Q и E", () => {
    kb.setPreset("classic");
    for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) {
      const act = activeSkills(cls);
      const skills = Object.fromEntries(act.slice(0, 3).map((d) => [d.id, 1]));
      const b = migrateBars(cls, skills);
      act.forEach((d, i) => {
        const at = findRef(b, { s: d.id });
        if (i < 3) { assert(at && at.bar === 0 && at.i === i, `${d.id} не на месте ${i}`); assert(kb.barLabel(0, i) === String(i + 1), `клавиша слота ${i}`); }
        else assert(!at, `${d.id} не изучено, но стоит на панели`);
      });
      assert(findRef(b, { i: "hp_potion" })?.i === 9 && kb.barLabel(0, 9) === "Q", "зелье HP не на Q");
      assert(findRef(b, { i: "mp_potion" })?.i === 10 && kb.barLabel(0, 10) === "E", "зелье MP не на E");
    }
    assert(hasBars(defaultBars("mage")) && !hasBars(undefined), "hasBars");
    kb.setPreset("action");
    const keys = BAR_ACTIONS.slice(0, 11).map((_, i) => kb.barLabel(0, i)).join("");
    assert(keys === "QWERASDFT12", "клавиши «Экшена»: " + keys);
    assert(kb.barLabel(1, 0) === "⇧Q", "панель 2 — с Shift");
    assert(kb.barSlotFor({ code: "KeyW", shiftKey: true, ctrlKey: false, altKey: false })?.bar === 1, "Shift+W — панель 2");
    assert(kb.barSlotFor({ code: "KeyW", shiftKey: false, ctrlKey: false, altKey: false })?.i === 1, "W — слот 2");
  });

  await check("autoPlace: своё место, иначе первый свободный; уже стоящее не дублируется", () => {
    const cls = "mage", act = activeSkills(cls);
    let b = defaultBars(cls);
    assert(autoPlace(b, cls, act[0].id) === null, "стартовое уже стоит");
    assert(JSON.stringify(autoPlace(b, cls, act[1].id)) === '{"bar":0,"i":1}', "своё место");
    b = setSlot(b, 0, 1, { a: "pet" });
    assert(JSON.stringify(autoPlace(b, cls, act[1].id)) === '{"bar":0,"i":2}', "первый свободный панели 1");
    const full = b.map((r) => r.slice());
    for (let i = 0; i < BAR_SLOTS; i++) full[0][i] = { a: "pet" };
    assert(JSON.stringify(autoPlace(full, cls, act[1].id)) === '{"bar":1,"i":0}', "затем панель 2");
    const v = validateBars([[{ s: act[2].id }, { s: act[2].id }, { i: "sword" }, { a: "x" }], "мусор"], "mage");
    assert(v[0].filter(Boolean).length === 1, "validate: повтор, экипировка и мусор убраны");
  });

  await startServer();
  try {
    const a = await Bot.join("Панелист", "secret");
    const weapon = a.self!.equip.weapon!.base;
    const bars = () => a.self!.bars;
    const settle = () => sleep(350);
    const waitSelf = async (cond: () => boolean, what: string) => a.until(cond, 3000, what);

    await check("новый герой: стартовое умение на 1, зелья на Q и E", () => {
      assert(bars()[0][0] && "s" in bars()[0][0]!, "нет умения в слоте 0");
      assert(JSON.stringify(bars()[0][9]) === '{"i":"hp_potion"}' && JSON.stringify(bars()[0][10]) === '{"i":"mp_potion"}', "зелья");
      assert(bars()[1].every((x) => !x), "панель 2 не пуста");
    });

    await check("чужое умение, экипировка, неизвестное действие и неверные индексы отклоняются; неизученное — можно", async () => {
      await sleep(1100);
      const before = JSON.stringify(bars());
      a.send("bars:set", { bar: 1, i: 0, ref: { s: "fireball" } }); // умение мага
      a.send("bars:set", { bar: 1, i: 0, ref: { i: weapon } });
      a.send("bars:set", { bar: 1, i: 0, ref: { a: "teleport" } });
      a.send("bars:set", { bar: 2, i: 0, ref: null });
      a.send("bars:set", { bar: 0, i: 12, ref: null });
      a.send("bars:set", { bar: 0, i: 1.5, ref: null });
      await settle();
      assert(JSON.stringify(bars()) === before, "раскладка изменилась");
      await sleep(1000);
      a.send("bars:set", { bar: 1, i: 0, ref: { s: "quake" } }); // воин, не изучено
      a.send("bars:set", { bar: 1, i: 1, ref: { a: "mount" } });
      await waitSelf(() => !!bars()[1][0] && !!bars()[1][1], "слоты панели 2");
      a.send("bars:swap", { a: { bar: 1, i: 0 }, b: { bar: 1, i: 5 } });
      await waitSelf(() => !bars()[1][0] && !!bars()[1][5], "обмен");
      assert(JSON.stringify(bars()[1][5]) === '{"s":"quake"}', "обмен перенёс не то");
      a.send("bars:set", { bar: 1, i: 6, ref: { s: "quake" } }); // повтор переносится, а не дублируется
      await waitSelf(() => !!bars()[1][6], "перенос");
      assert(!bars()[1][5], "повтор не убран из старого слота");
      a.send("bars:set", { bar: 1, i: 6, ref: null });
      a.send("bars:set", { bar: 1, i: 1, ref: null });
      await waitSelf(() => bars()[1].every((x) => !x), "снятие");
    });

    await check("автостановка: изученное умение встаёт на своё место; с занятым — в первый свободный", async () => {
      await sleep(1100);
      a.send("dbg", { op: "level", v: 12 });
      await sleep(400);
      const act = activeSkills("warrior");
      a.send("bars:set", { bar: 0, i: 1, ref: { a: "attack" } }); // место второго умения занято
      await waitSelf(() => !!bars()[0][1] && "a" in bars()[0][1]!, "занять слот 2");
      a.send("learn", { id: act[1].id });
      await waitSelf(() => !!findRef(bars(), { s: act[1].id }), "автостановка");
      const at = findRef(bars(), { s: act[1].id })!;
      assert(at.bar === 0 && at.i === 2, `ожидался слот 3, получен ${at.bar}:${at.i}`);
      a.send("learn", { id: act[1].id }); // ранг 2 — перестановки нет
      await settle();
      assert(findRef(bars(), { s: act[1].id })!.i === 2, "ранг 2 сдвинул умение");
    });

    await check("use:base берёт первую стопку, ставит общий откат зелий", async () => {
      await sleep(1100);
      const cds: { id: string; ms: number }[] = [];
      a.room.onMessage("cd", (c: any) => cds.push(c));
      a.send("dbg", { op: "hurt", v: 30 });
      await sleep(300);
      const qty = () => a.self!.inventory.reduce((n, it) => n + (it && it.base === "hp_potion" ? it.qty ?? 1 : 0), 0);
      const q0 = qty();
      assert(q0 > 0, "нет зелий");
      a.send("use:base", { base: "hp_potion" });
      await a.until(() => qty() === q0 - 1, 2000, "зелье израсходовано");
      assert(cds.some((c) => c.id === "potion" && c.ms > 0), "нет cd potion");
      a.send("use:base", { base: weapon }); // экипировка не используется по base
      a.send("use:base", { base: 5 });
      await settle();
      assert(a.self!.equip.weapon?.base === weapon, "экипировка сменилась");
    });

    await check("не чаще 10 раз в секунду", async () => {
      await sleep(1200);
      a.send("bars:set", { bar: 1, i: 0, ref: { a: "mount" } });
      await waitSelf(() => !!bars()[1][0], "mount");
      for (let n = 0; n < 14; n++) a.send("bars:swap", { a: { bar: 1, i: 0 }, b: { bar: 1, i: 1 } });
      await sleep(600);
      // set занял 1 из 10 в окне, применилось 9 обменов (нечётно: слот ушёл); без лимита было бы 14 (чётно: на месте)
      assert(!bars()[1][0] && !!bars()[1][1], "лимит 10 в секунду не сработал");
      await sleep(1100);
      a.send("bars:set", { bar: 1, i: 1, ref: null });
      await waitSelf(() => bars()[1].every((x) => !x), "очистка");
    });

    await check("раскладка переживает релог", async () => {
      await sleep(1100);
      a.send("bars:set", { bar: 1, i: 3, ref: { s: "taunt" } });
      await waitSelf(() => !!bars()[1][3], "слот 3 панели 2");
      const saved = JSON.stringify(bars());
      await a.leave();
      await sleep(800);
      const b = await Bot.join("Панелист", "secret");
      assert(JSON.stringify(b.self!.bars) === saved, "раскладка после входа другая: " + JSON.stringify(b.self!.bars));
      await b.leave();
    });
  } finally {
    await stopServer();
  }
  console.log(`hotbar: ${passedCount()} проверок пройдено`);
}
main().catch((e) => { console.error(e); process.exit(1); });
