/**
 * Добыча боссов стартовых земель (задача 136, шаг 5): data/zone-boss-loot.json против карточек data/zone-bosses.json; боссов кольца
 * (задача 139): data/ring-boss-loot.json против data/ring-bosses.json — те же правила силы, свои материалы (docs/bosses-139.md 3.2). Офлайн.
 */
import { assert, check, passedCount } from "./harness";
import { BASE_ITEMS, ITEM_MODELS, UNIQUES, type ItemStatKey } from "../shared/items";
import { MOBS } from "../shared/mobs";
import { LEGENDARIES, LEGEND_TIERS } from "../shared/legendary";
import { MATERIALS } from "../shared/upgrade";
import zb from "../data/zone-bosses.json";
import loot from "../data/zone-boss-loot.json";
import ring from "../data/ring-bosses.json";
import ringLoot from "../data/ring-boss-loot.json";
import catalog from "../data/items.json";

type Spec = { id: string; name: string; base: string; ilvl: number; rarity: number; fac: string; cls: string[]; affix: string[]; stats: Record<string, number>; prop: string; lore: string; look: Record<string, unknown>; boss: string; card: string };
type Table = { name: string; level: number; band: [number, number]; special: { item: string; chance: number }[]; gold: { mult: number }; loot: { items: number; epic: number }; potion: { id: string; chance: number; qty: [number, number] }; mats: { id: string; chance: number; qty: [number, number] }[]; legendary: number; pet: number };
type Card = { id: string; name: string; levels: { band: [number, number]; boss: number }; loot: { name: string; cat: string; slot: string; rarity: string; lvl: number; affix: string[] }[] };
const ZONE_CARDS = zb.bosses as unknown as Card[];
const RING_CARDS = ring.bosses as unknown as Card[];
const RING_IDS = new Set(RING_CARDS.map((c) => c.id));
const ITEMS = { ...(loot.items as unknown as Record<string, Spec>), ...(ringLoot.items as unknown as Record<string, Spec>) };
const TABLES = { ...(loot.bosses as unknown as Record<string, Table>), ...(ringLoot.bosses as unknown as Record<string, Table>) };
const CARDS = [...ZONE_CARDS, ...RING_CARDS];

/** Аффикс своего уровня при mult 1 — та же формула, что affixValue в shared/items.ts (без округления). */
const aff = (k: string, l: number) => (k === "hp" ? 8 + l * 4 : k === "crit" ? 1 + l * 0.025 : 1 + l * 0.4);
const ratio = (st: Record<string, number>, l: number) => Object.entries(st).reduce((s, [k, v]) => s + v / aff(k, l), 0);
const SLOT: Record<string, string> = { "две руки": "weapon", "главная рука": "weapon", "левая рука": "offhand", "голова": "helmet", "грудь": "armor", "ступни": "boots", "спина": "cloak", "палец": "ring", "шея": "amulet" };
const STAT_KEYS = new Set<ItemStatKey>(["str", "agi", "int", "vit", "hp", "crit"]);

// уникальные вещи подземелий — потолок силы
const DUNGEON = Object.values(MOBS).flatMap((m) => m.uniques ?? []).map((id) => UNIQUES[id]);
const dungeonMin = Math.min(...DUNGEON.map((u) => ratio(u.stats as Record<string, number>, u.ilvl)));
const dungeonKey: Record<string, number> = {};
for (const u of DUNGEON) for (const [k, v] of Object.entries(u.stats)) dungeonKey[k] = Math.max(dungeonKey[k] ?? 0, (v as number) / aff(k, u.ilvl));

// значения вида — только те, что уже есть у моделей (генератор снаряжения их умеет)
const used: Record<string, Set<unknown>> = {}, shapes: Record<string, Set<string>> = {};
for (const m of (catalog.models as unknown as { cat: string; look: Record<string, unknown> }[])) {
  (shapes[m.cat] ??= new Set()).add(m.look.shape as string);
  for (const [k, v] of Object.entries(m.look)) (used[k] ??= new Set()).add(v);
}

async function main() {
  console.log("Добыча боссов стартовых земель");

  await check("у каждой карточки — таблица, у таблицы — карточка", () => {
    assert(ZONE_CARDS.length === 8, `боссов стартовых земель ${ZONE_CARDS.length}, нужно 8`);
    for (const c of CARDS) assert(TABLES[c.id], `нет таблицы ${c.id}`);
    for (const id of Object.keys(TABLES)) assert(CARDS.some((c) => c.id === id), `таблица без карточки ${id}`);
  });

  await check("особые вещи совпадают с карточками, id свои и не заняты", () => {
    // особые вещи уже в UNIQUES (shared/items.ts берёт их отсюда, задача 136 шаг 4) — свои id не в счёт
    const taken = new Set([...Object.keys(UNIQUES).filter((k) => !Object.hasOwn(ITEMS, k)), ...Object.keys(ITEM_MODELS), ...Object.keys(LEGENDARIES), ...Object.keys(BASE_ITEMS)]);
    for (const [id, it] of Object.entries(ITEMS)) {
      assert(it.id === id, `id ${id} ≠ ${it.id}`);
      assert(!taken.has(id), `id ${id} уже занят`);
      assert(/^zb_[a-z_]+$/.test(id), `id ${id}`);
    }
    for (const c of CARDS) {
      const t = TABLES[c.id];
      assert(t.name === c.name && t.level === c.levels.boss && t.band.join() === c.levels.band.join(), `${c.id}: имя или уровни не как в карточке`);
      assert(t.special.length === c.loot.length, `${c.id}: вещей ${t.special.length}, в карточке ${c.loot.length}`);
      c.loot.forEach((cl, i) => {
        const it = ITEMS[t.special[i].item];
        assert(it, `${c.id}: нет вещи ${t.special[i].item}`);
        assert(it.boss === c.id, `${it.id}: boss ${it.boss}`);
        assert(it.name === cl.name && it.base === cl.cat && it.ilvl === cl.lvl && it.card === cl.rarity && it.affix.join() === cl.affix.join(), `${it.id}: не как в карточке`);
        const b = BASE_ITEMS[it.base];
        assert(b && b.slot !== "consumable", `${it.id}: база ${it.base}`);
        assert(SLOT[cl.slot] === b.slot, `${it.id}: слот «${cl.slot}» ≠ ${b.slot}`);
        assert(!b.classes || it.cls.every((k) => b.classes!.includes(k as never)), `${it.id}: класс не может надеть ${it.base}`);
        assert(it.lore && it.prop, `${it.id}: нет лора или свойства`);
      });
    }
    assert(Object.keys(ITEMS).length === CARDS.reduce((s, c) => s + c.loot.length, 0), "лишние вещи в items");
  });

  await check("уровни — по полосе босса", () => {
    for (const c of CARDS) for (const s of TABLES[c.id].special) {
      const it = ITEMS[s.item], [lo, hi] = c.levels.band;
      assert(it.ilvl >= Math.max(1, lo - 5) && it.ilvl <= hi && it.ilvl <= c.levels.boss, `${it.id}: ilvl ${it.ilvl} вне полосы ${lo}–${hi}`);
    }
  });

  await check(`сила не выше уникальных вещей подземелий (у них сумма долей ≥ ${dungeonMin.toFixed(2)})`, () => {
    for (const it of Object.values(ITEMS)) {
      assert(it.rarity === 1 || it.rarity === 2, `${it.id}: редкость ${it.rarity} (легендарная — только у легендарок)`);
      for (const [k, v] of Object.entries(it.stats)) {
        assert(STAT_KEYS.has(k as ItemStatKey) && Number.isInteger(v) && v >= 1, `${it.id}: ${k}=${v}`);
        assert(v / aff(k, it.ilvl) <= dungeonKey[k], `${it.id}: ${k}=${v} сильнее подземелий`);
      }
      const jewel = it.base === "ring" || it.base === "amulet";
      const tol = Object.keys(it.stats).reduce((s, k) => s + 0.5 / aff(k, it.ilvl), 0); // округление до целых (у крита на низких уровнях — минимум 1)
      const r = ratio(it.stats, it.ilvl), cap = (it.rarity === 2 ? 2.0 : 1.4) + (jewel ? 0.1 : 0) + tol;
      assert(r <= cap && r < dungeonMin, `${it.id}: сумма долей ${r.toFixed(2)} (потолок ${cap.toFixed(2)}, подземелья ${dungeonMin.toFixed(2)})`);
    }
  });

  await check("вид — существующие формы и ключи палитр", () => {
    for (const it of Object.values(ITEMS)) {
      assert(shapes[it.base]?.has(it.look.shape as string), `${it.id}: формы «${it.look.shape}» нет у ${it.base}`);
      for (const [k, v] of Object.entries(it.look)) assert(used[k]?.has(v), `${it.id}: look.${k}=${v} нет у моделей`);
      assert(it.fac === "" || it.fac === "solgard" || it.fac === "umbrath", `${it.id}: fac ${it.fac}`);
    }
  });

  await check("шансы и количества — реже боссов подземелий", () => {
    const dr = LEGEND_TIERS.drop as { boss: number; floor: number };
    for (const [id, t] of Object.entries(TABLES)) {
      const sum = t.special.reduce((s, x) => s + x.chance, 0);
      for (const s of t.special) assert(s.chance > 0 && s.chance <= 0.08, `${id}: шанс ${s.item} ${s.chance}`);
      assert(sum <= 0.2, `${id}: особых вещей ${sum} за убийство`);
      assert(t.gold.mult > 0 && t.gold.mult < 25, `${id}: золото ×${t.gold.mult}`);
      assert(t.loot.items >= 1 && t.loot.items <= 2 && t.loot.epic >= 0.15 && t.loot.epic <= 0.3, `${id}: вещи по уровню (1–2 шт., эпическая 15–30 %)`);
      assert(BASE_ITEMS[t.potion.id]?.slot === "consumable" && t.potion.chance <= 1 && t.potion.qty[0] <= t.potion.qty[1] && t.potion.qty[1] <= 3, `${id}: зелья`);
      for (const m of t.mats) {
        assert(MATERIALS[m.id], `${id}: нет материала ${m.id}`);
        assert(m.chance > 0 && m.chance <= 1 && m.qty[0] >= 1 && m.qty[0] <= m.qty[1], `${id}: ${m.id}`);
        // кольцо (3.2): руда 2–4 у младших, 3–5 у старших, пыль 1–2; стартовые земли — меньше, чем с подземелий
        const ringB = RING_IDS.has(id);
        assert(m.id !== "ash_ore" || m.qty[1] < (ringB ? 6 : 4), `${id}: руды больше нормы`);
        assert(m.id !== "star_dust" || (t.level >= 12 && m.qty[1] < (ringB ? 3 : 2)), `${id}: пыль`);
      }
      assert(t.legendary >= 0 && t.legendary < dr.boss, `${id}: легендарка ${t.legendary}`);
      assert(t.legendary === 0 || t.level >= TIER_MIN - dr.floor, `${id}: легендарка ниже младшего яруса`);
      assert(t.pet > 0 && t.pet < 25, `${id}: питомец ×${t.pet}`);
      console.log(`       ${id} (${t.level}): особая вещь ${(sum * 100).toFixed(0)}% (≈ раз в ${Math.round(1 / sum)} убийств), золото ×${t.gold.mult}, легендарка ${(t.legendary * 100).toFixed(1)}%`);
    }
  });

  console.log(`Готово: ${passedCount()} ok`);
}
const TIER_MIN = (LEGEND_TIERS as unknown as { list: number[] }).list[0];

main().catch(() => process.exit(1));
