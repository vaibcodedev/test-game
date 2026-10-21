/** Слот плаща (задача 79): надеть/снять, миграция старого сохранения, плащ с заточкой в u.gear, лут и каталог. */
import { assert, check, passedCount } from "./harness";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import { addItem, equip, unequip } from "../server/src/game/inventory";
import { BASE_ITEMS, ITEM_MODELS, SLOTS, makeItem, makeLoot, Rarity, listItemCategories, type Item } from "../shared/items";

const mk = (save = newSave("warrior", { x: 100, y: 100 })) => {
  const w = new World(new WorldState(), () => {});
  const p = new Player("t_cl", "Плащеносец", save, () => {});
  w.addPlayer(p);
  return { w, p };
};

async function main() {
  await check("каталог: 15 ярусов 1–100, 6–8 архетипов, стили поровну, броня + аффиксы", () => {
    const ms = Object.values(ITEM_MODELS).filter((m) => m.cat === "cloak");
    assert(SLOTS.includes("cloak") && BASE_ITEMS.cloak.slot === "cloak", "слот не объявлен");
    assert(new Set(ms.map((m) => m.lvl)).size === 15 && Math.min(...ms.map((m) => m.lvl)) === 1 && Math.max(...ms.map((m) => m.lvl)) === 100, "ярусы");
    const shapes = new Set(ms.map((m) => m.look.shape));
    assert(shapes.size >= 6 && shapes.size <= 8, "архетипов " + shapes.size);
    const f = (x: string) => ms.filter((m) => m.fac === x).length;
    assert(f("solgard") === f("umbrath") && f("umbrath") === f("") && f("") === 15, `стили ${f("solgard")}/${f("umbrath")}/${f("")}`);
    const it = makeItem(ms[0].id, 30, Rarity.Epic);
    assert((it.stats.armor || 0) > 0 && Object.keys(it.stats).length >= 4, "броня и аффиксы: " + JSON.stringify(it.stats));
    assert(listItemCategories().some((c) => c.base === "cloak" && c.slot === "cloak" && c.models === 45), "listItemCategories");
  });

  await check("надеть и снять плащ: слот, броня, сумка", () => {
    const { w, p } = mk();
    const cl = makeItem("cloak_str_30", 30, Rarity.Rare); cl.req = 1;
    const a0 = p.derived.armor;
    addItem(p, cl);
    equip(w, p, p.save.inventory.findIndex((i) => i?.uid === cl.uid));
    assert(p.save.equip.cloak?.uid === cl.uid, "плащ не надет");
    assert(p.derived.armor > a0, "броня не выросла");
    unequip(w, p, "cloak");
    assert(!p.save.equip.cloak && p.save.inventory.some((i) => i?.uid === cl.uid), "плащ не снят");
    assert(p.derived.armor === a0, "броня не вернулась");
  });

  await check("в бою снаряжение не меняется: ни надеть, ни снять; после боя — можно", () => {
    const { w, p } = mk();
    const toasts: string[] = [];
    p.send = ((t: string, m: { text?: string }) => { if (t === "toast" && m.text) toasts.push(m.text); }) as typeof p.send;
    const cl = makeItem("cloak_str_30", 30, Rarity.Rare); cl.req = 1;
    addItem(p, cl);
    const at = () => p.save.inventory.findIndex((i) => i?.uid === cl.uid);
    const worn = () => p.save.equip.cloak?.uid; // функция: assert сужает тип поля, а состояние меняют вызовы
    p.combatAt = w.time;
    equip(w, p, at());
    assert(!worn() && at() >= 0, "надел в бою");
    assert(toasts.includes("В бою снаряжение не меняется"), "нет ошибки: " + toasts.join("; "));
    p.combatAt = -1e9;
    equip(w, p, at());
    assert(worn() === cl.uid, "вне боя не надел");
    p.combatAt = w.time;
    unequip(w, p, "cloak");
    assert(worn() === cl.uid, "снял в бою");
    p.combatAt = -1e9;
    unequip(w, p, "cloak");
    assert(!worn(), "вне боя не снял");
  });

  await check("миграция: старое сохранение без слота cloak -> null, gear из 5 кусков", () => {
    const save = newSave("warrior", { x: 100, y: 100 });
    delete (save.equip as Partial<typeof save.equip>).cloak;
    const { p } = mk(save);
    assert(p.save.equip.cloak === null, "cloak не null");
    assert(p.unit.gear.split("|").length === 5 && p.unit.gear.split("|")[4] === "", "gear: " + p.unit.gear);
  });

  await check("плащ с заточкой виден в синхронизации (u.gear, 5-й кусок)", () => {
    const { p } = mk();
    const cl: Item = { ...makeItem("cloak_agi_44", 44, Rarity.Epic), plus: 7 };
    p.save.equip.cloak = cl; p.recalc();
    const part = p.unit.gear.split("|")[4].split(":");
    assert(part[0] === "2" && part[1] === "7" && part[4] === "cloak" && part[5] === "cloak_agi_44", "кусок: " + part.join(":"));
  });

  await check("лут: плащи выпадают через makeLoot всем классам", () => {
    for (const cls of ["warrior", "mage", "rogue", "darkranger"] as const) {
      let n = 0;
      for (let i = 0; i < 400; i++) if (BASE_ITEMS[makeLoot(cls, 40, Rarity.Rare).base].slot === "cloak") n++;
      assert(n > 10, `${cls}: плащей ${n}/400`);
    }
  });
  console.log(`\nПлащ: проверок ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
