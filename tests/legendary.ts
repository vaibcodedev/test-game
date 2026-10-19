/** Легендарки (задача 112): формат data/legendaries.json, баланс ярусов, добыча по уровню источника, уникальные по уровню босса, награды арены, свойства. */
import { assert, check, passedCount } from "./harness";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import { Mob } from "../server/src/game/Mob";
import { grantKillRewards } from "../server/src/game/rewards";
import { deliverArenaRewards } from "../server/src/arena/rewards";
import { services } from "../server/src/arena/registry";
import * as legendary from "../server/src/game/legendary";
import { BASE_ITEMS, ITEM_MODELS, makeUnique, uniqueLevel, UNIQUES, type Item } from "../shared/items";
import { CLASSES, CLASS_IDS, type ClassId } from "../shared/classes";
import { MOBS } from "../shared/mobs";
import { LEGEND_EFFECTS, LEGEND_TIERS, LEGENDARIES, TIER_LIST, effectAt, legendaryFits, legendaryTierWeights, makeLegendary, rollLegendary } from "../shared/legendary";
import data from "../data/legendaries.json";

const OLD16 = ["storm_blade", "blood_reaper", "nova_staff", "winter_bow", "twin_string", "arcane_mantle", "thorn_plate", "hunter_treads", "doom_blade", "dawn_eater", "soul_staff", "night_bow", "void_horns", "ember_helm", "sun_scepter", "shadow_fang"];
const LOOK: Record<string, string[] | "bool" | "color"> = {
  c2: "color", fx: ["ember", "spark", "drip", "snow", "leaf", "orbit", "souls", "feather"], helm: ["horns", "flame", "crown", "wings", "halo"], eyes: "bool",
  pauld: ["flame", "frost", "spikes", "bolts", "crystal"], chains: "bool", boots: ["wings", "flame"], back: ["banner", "wings"], wings: ["feather", "bone", "flame"],
  crest: ["sun", "star", "rose", "tree", "skull", "moon", "fang", "eye", "flame"], flag: "color", train: "bool", blade: ["long"], pommel: ["skull", "star"], ghost: "bool",
  orbit: ["blades", "runes", "motes"], shape: [],
};
const MAIN: Record<string, string> = { warrior: "str", deathknight: "str", reaver: "str", ranger: "agi", rogue: "agi", darkranger: "agi", mage: "int", healer: "int", warlock: "int", bloodweaver: "int" };
/** Бирюза заточки: тон 129–209° при насыщенности (HSV) > 35%. */
function turquoise(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!mx || d / mx <= 0.35) return false;
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  const hue = (h + 360) % 360;
  return hue >= 129 && hue <= 209;
}
const points = (st: Record<string, number>) => Object.entries(st).reduce((a, [k, v]) => a + (k === "hp" ? v / 10 : k === "crit" ? v * 2 : v), 0);
const slotOf = (base: string) => BASE_ITEMS[base].slot as string;

function mkWorld() { return new World(new WorldState(), () => {}, { mobs: false }); }
function mkPlayer(w: World, cls: ClassId, level = 60, name = "Легенда") {
  const save = newSave(cls, { x: 4000, y: 4000 });
  save.level = level;
  const p = new Player("t_" + name + cls + Math.random(), name, save, () => {});
  w.addPlayer(p);
  return p;
}
const bagItems = (p: Player): Item[] => [...p.bags.values()].flatMap((b) => b.items);

async function main() {
  await check("формат записей: база, класс, ярус, цвета, look, свойство", () => {
    const raw = data as unknown as Record<string, { effect: Record<string, number | string>; look: Record<string, unknown>; tier: number; ilvl?: number; req?: number }>;
    for (const l of Object.values(LEGENDARIES)) {
      const r = raw[l.id], b = BASE_ITEMS[l.base];
      assert(/^[a-z][a-z0-9_]*$/.test(l.id), `${l.id}: id`);
      assert(b && b.slot !== "consumable", `${l.id}: база ${l.base}`);
      assert(!["helmet", "armor", "boots"].includes(l.base) || l.tier === 30, `${l.id}: старые базы только у яруса 30`);
      assert(CLASSES[l.variant], `${l.id}: класс ${l.variant}`);
      assert(legendaryFits(l.id, l.variant), `${l.id}: ${l.variant} не носит ${l.base}`);
      assert(TIER_LIST.includes(r.tier), `${l.id}: ярус ${r.tier}`);
      assert(l.req <= l.ilvl && l.req >= l.tier - 3, `${l.id}: ilvl ${l.ilvl} req ${l.req}`);
      for (const c of [l.tint, l.look.c2, l.look.flag].filter(Boolean) as string[]) assert(/^#[0-9a-f]{6}$/i.test(c) && !turquoise(c), `${l.id}: цвет ${c} (бирюза заточки или не #rrggbb)`);
      assert(l.name.length >= 4 && l.lore.length <= 90, `${l.id}: имя или лор`);
      for (const [k, v] of Object.entries(r.look)) {
        const rule = LOOK[k];
        assert(rule !== undefined, `${l.id}: look.${k} — неизвестное поле`);
        if (rule === "bool") assert(typeof v === "boolean", `${l.id}: look.${k}`);
        else if (rule === "color") assert(typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v), `${l.id}: look.${k}`);
        else if (k === "shape") assert(Object.values(ITEM_MODELS).some((m) => m.cat === l.base && m.look.shape === v), `${l.id}: look.shape ${v} не из каталога ${l.base}`);
        else assert(rule.includes(String(v)), `${l.id}: look.${k} = ${v}`);
      }
      assert(l.look.c2 && l.look.fx, `${l.id}: c2 и fx обязательны`);
      if (l.look.back === "banner") assert(l.base === "cloak", `${l.id}: знамя только у плаща`);
      if (l.look.back === "wings") assert(l.base === "cloak" || slotOf(l.base) === "armor", `${l.id}: крылья у плаща или доспеха`);
      const spec = LEGEND_EFFECTS[l.effect.type];
      assert(spec, `${l.id}: свойство ${l.effect.type}`);
      for (const [k, v] of Object.entries(r.effect)) {
        if (k === "type") continue;
        const def = spec.params[k]?.[l.ti];
        assert(def !== undefined && Math.abs(Number(v) - def) <= Math.abs(def) * 0.15 + 1e-9, `${l.id}: ${k} = ${v} дальше ±15% от яруса (${def})`);
      }
      assert(l.desc && !l.desc.includes("?") && !l.desc.includes("{"), `${l.id}: описание «${l.desc}»`);
      const it = makeLegendary(l.id);
      assert(it.rarity === 3 && it.legendary === l.id && it.ilvl === l.ilvl && it.req === l.req && it.bound, `${l.id}: предмет ${JSON.stringify(it)}`);
    }
  });

  await check("баланс: бюджет очков ±20%, главная характеристика ≥25%, крит не выше потолка яруса", () => {
    for (const l of Object.values(LEGENDARIES)) {
      const p = points(l.stats as Record<string, number>), want = LEGEND_TIERS.budget[l.ti] * (LEGEND_TIERS.slot[slotOf(l.base)] ?? 1);
      assert(Math.abs(p - want) <= want * 0.2, `${l.id}: ${p} очков, бюджет ${want.toFixed(0)}`);
      const main = (l.stats as Record<string, number>)[MAIN[l.variant]] ?? 0;
      assert(main >= p * 0.25, `${l.id}: главная ${MAIN[l.variant]} = ${main} из ${p}`);
      assert((l.stats.crit ?? 0) <= LEGEND_TIERS.critMax[l.ti], `${l.id}: крит ${l.stats.crit}`);
    }
    // ярус 100: не больше одной записи на категорию
    const t100 = Object.values(LEGENDARIES).filter((l) => l.tier === 100).map((l) => l.base);
    assert(new Set(t100).size === t100.length, "ярус 100: повтор категории " + t100.join(","));
  });

  await check("свойства: каждый тип _effects имеет обработчик своего хука, значения растут с ярусом", () => {
    const H = legendary.HANDLERS as Record<string, Record<string, unknown>>;
    for (const [type, spec] of Object.entries(LEGEND_EFFECTS)) {
      assert(H[type] && typeof H[type][spec.hook] === "function", `${type}: нет обработчика ${spec.hook}`);
      for (const [k, arr] of Object.entries(spec.params)) assert(arr.length === TIER_LIST.length, `${type}.${k}: ${arr.length} значений`);
      const e0 = effectAt(type, 0), e4 = effectAt(type, 4);
      assert(Object.keys(spec.params).every((k) => k === "below" || k === "r" || ["cd", "icd"].includes(k) ? true : Number(e4[k]) >= Number(e0[k])), `${type}: значения не растут`);
      if (spec.params.cd) assert(Number(e4.cd) <= Number(e0.cd), `${type}: перезарядка не короче`);
    }
    for (const type of Object.keys(H)) assert(LEGEND_EFFECTS[type], `обработчик ${type} без записи в _effects`);
    // старые 16 — у каждой своё свойство; в одном ярусе один тип свойства не больше 3 раз (_doc data/legendaries.json)
    const ls = Object.values(LEGENDARIES);
    const old = ls.filter((l) => OLD16.includes(l.id)).map((l) => l.effect.type);
    assert(new Set(old).size === old.length, `повтор свойств у старых: ${old}`);
    const per = new Map<string, number>();
    for (const l of ls) if (!OLD16.includes(l.id)) { const k = l.tier + ":" + l.effect.type; per.set(k, (per.get(k) || 0) + 1); }
    const over = [...per].filter(([, n]) => n > 3);
    assert(!over.length, `свойство чаще 3 раз в ярусе: ${over.map(([k, n]) => k + "×" + n)}`);
  });

  await check("сохранения: старые 16 на месте, ярус 30, ilvl 32, req 29", () => {
    for (const id of OLD16) { const l = LEGENDARIES[id]; assert(l && l.tier === 30 && l.ilvl === 32 && l.req === 29, `${id}: ${JSON.stringify(l && { t: l.tier, i: l.ilvl, r: l.req })}`); }
    // старая вещь из сохранения (ilvl 32, свои характеристики) — эффект по id, с параметрами яруса 30
    assert(LEGENDARIES.storm_blade.effect.chance === 0.15 && LEGENDARIES.storm_blade.effect.jumps === 3, "storm_blade: параметры яруса 30");
  });

  await check("образцы: ≥2 знамени, ≥2 крыльев, ≥2 яруса 100, разные категории и обе фракции", () => {
    const fresh = Object.values(LEGENDARIES).filter((l) => !OLD16.includes(l.id));
    assert(fresh.length >= 10, "образцов " + fresh.length);
    assert(fresh.filter((l) => l.look.back === "banner").length >= 2, "знамён < 2");
    assert(fresh.filter((l) => l.look.back === "wings").length >= 2, "крыльев < 2");
    assert(fresh.filter((l) => l.tier === 100).length >= 2, "ярус 100 < 2");
    assert(new Set(fresh.map((l) => l.base)).size >= 8, "категорий " + new Set(fresh.map((l) => l.base)).size);
    assert(new Set(fresh.map((l) => l.faction)).size === 2, "фракции");
  });

  await check("добыча по уровню: босс 90 — основной ярус 85, 30 редко; босс 40 — только ярус 30; ниже 25 — ничего", () => {
    const N = 4000;
    for (const cls of CLASS_IDS) {
      const hist: Record<number, number> = {};
      for (let i = 0; i < N; i++) { const id = rollLegendary(cls, 90); assert(id && legendaryFits(id, cls), `${cls}: не подходит ${id}`); hist[LEGENDARIES[id].tier] = (hist[LEGENDARIES[id].tier] || 0) + 1; }
      const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0][0];
      assert(top === "85", `${cls} @90: основной ярус ${top} ${JSON.stringify(hist)}`);
      assert((hist[30] || 0) < N * 0.1 && !hist[100], `${cls} @90: ярус 30 ${hist[30]}, 100 ${hist[100]}`);
      for (let i = 0; i < 1000; i++) { const id = rollLegendary(cls, 40)!; assert(LEGENDARIES[id].tier === 30, `${cls} @40: ярус ${LEGENDARIES[id].tier}`); }
    }
    assert(rollLegendary("warrior", 28) !== undefined && LEGENDARIES[rollLegendary("warrior", 28)!].tier === 30, "босс 28 (Энт): ярус 30");
    assert(rollLegendary("warrior", 20) === undefined, "уровень 20: легендарок нет");
    // ближайший ярус — наибольший вес
    const w = legendaryTierWeights("warrior", 100);
    assert(w[0][0] === 100 && w.every(([, x], i) => i === 0 || x <= w[i - 1][1]), "веса @100: " + JSON.stringify(w));
  });

  await check("убийство: легендарка, уникальная и обычный лут — по уровню источника", () => {
    const w = mkWorld();
    const p = mkPlayer(w, "warrior", 90, "Охотник");
    const old = LEGEND_TIERS.drop.boss;
    LEGEND_TIERS.drop.boss = 1;
    try {
      for (const lvl of [90, 40]) {
        p.bags.clear();
        for (let i = 0; i < 150; i++) {
          const m = new Mob(w.uid("b"), MOBS.ashlord, lvl, { x: p.x + 20, y: p.y });
          m.damageBy.set(p.id, 1);
          grantKillRewards(w, m, p);
        }
        const items = bagItems(p), legs = items.filter((i) => i.legendary), uqs = items.filter((i) => i.unique);
        assert(legs.length === 150, `@${lvl}: легендарок ${legs.length}`);
        const tiers = legs.map((i) => LEGENDARIES[i.legendary!].tier);
        if (lvl === 40) assert(tiers.every((t) => t === 30), "босс 40 уронил ярус " + Math.max(...tiers));
        else { const n85 = tiers.filter((t) => t === 85).length, n30 = tiers.filter((t) => t === 30).length; assert(n85 > n30 * 3 && n85 > 60, `босс 90: 85×${n85}, 30×${n30}`); assert(!tiers.includes(100), "босс 90: ярус 100"); }
        assert(uqs.length && uqs.every((u) => u.ilvl === lvl && u.req === lvl - 3), `@${lvl}: уникальные ${uqs.map((u) => u.ilvl).join(",")}`);
        const gear = items.filter((i) => !i.unique && !i.legendary && BASE_ITEMS[i.base].slot !== "consumable");
        assert(gear.length && gear.every((g) => g.ilvl === lvl), `@${lvl}: обычный лут ${[...new Set(gear.map((g) => g.ilvl))]}`);
      }
    } finally { LEGEND_TIERS.drop.boss = old; }
  });

  await check("уникальные боссов: ilvl = уровень босса из world.json, характеристики растут, потолка req нет", () => {
    for (const [boss, ids] of [["ent", ["heartwood_staff", "bark_helm"]], ["witch", ["hexed_ring"]], ["ashlord", ["ashbringer", "ashen_crown"]]] as const) {
      for (const id of ids) {
        const lvl = MOBS[boss].level!, it = makeUnique(id);
        assert(uniqueLevel(id) === lvl && it.ilvl === lvl && it.req === lvl - 3, `${id}: ${it.ilvl}/${it.req}, босс ${lvl}`);
        const base = UNIQUES[id].stats as Record<string, number>, k = Object.keys(base)[0];
        assert((it.stats as Record<string, number>)[k] >= base[k], `${id}: ${k} не вырос`);
      }
    }
    const hi = makeUnique("ashbringer", 95);
    assert(hi.ilvl === 95 && hi.req === 92, "req без потолка 30: " + hi.req);
  });

  await check("награды арены: медальон уровня игрока, ранг сильнее — характеристики выше", () => {
    const w = mkWorld();
    const p = mkPlayer(w, "mage", 64, "Гладиатор");
    const delivered: number[] = [];
    const prev = services.arena;
    (services as { arena: unknown }).arena = { pendingRewards: () => [{ id: 7, rank: "gold", mode: "solo", season: 3 }], markDelivered: (id: number) => delivered.push(id) };
    try { deliverArenaRewards(p); } finally { (services as { arena: unknown }).arena = prev; }
    const med = p.save.inventory.find((i) => i?.unique === "arena_gold");
    assert(med && med.ilvl === 64 && med.req === 61 && delivered[0] === 7, "медальон: " + JSON.stringify(med));
    const bronze = makeUnique("arena_bronze", 64), diamond = makeUnique("arena_diamond", 64);
    assert((diamond.stats.str ?? 0) > (bronze.stats.str ?? 0), "ранг не влияет");
  });

  await check("свойства в бою: феникс спасает от смерти, казнь и ярость усиливают удар, барьер поглощает", () => {
    const w = mkWorld();
    const p = mkPlayer(w, "reaver", 100, "Падший");
    p.save.equip.armor = makeLegendary("fallen_wings"); p.recalc();
    const mob = w.addMob(new Mob(w.uid("m"), MOBS.goblin, 90, { x: p.x + 30, y: p.y }));
    p.unit.hp = p.unit.maxHp;
    w.hit(mob, p, { flat: p.unit.maxHp * 5 });
    assert(!p.dead && p.unit.hp >= 1, "феникс не спас: hp " + p.unit.hp);
    for (let i = 0; i < 10; i++) w.update(50); // окно воскрешения 400 мс прошло
    assert(p.unit.hp > p.unit.maxHp * 0.3, "феникс не вернул здоровье: " + p.unit.hp);
    w.hit(mob, p, { flat: p.unit.maxHp * 5 });
    assert(p.dead, "феникс сработал второй раз без перезарядки");
    const q = mkPlayer(w, "reaver", 100, "Казнитель");
    q.save.equip.weapon = null; q.save.equip.cloak = makeLegendary("night_bow"); q.recalc(); // казнь (свойство не зависит от слота)
    mob.unit.hp = mob.unit.maxHp;
    const full = legendary.outgoing(w, q, mob);
    mob.unit.hp = Math.round(mob.unit.maxHp * 0.1);
    assert(full === 1 && legendary.outgoing(w, q, mob) > 1.3, "казнь: множитель " + legendary.outgoing(w, q, mob));
    q.save.equip.cloak = makeLegendary("dawn_eater"); q.unit.hp = Math.round(q.unit.maxHp * 0.2);
    assert(legendary.outgoing(w, q, mob) > 1.2, "ярость");
    q.save.equip.cloak = makeLegendary("void_horns"); q.unit.hp = Math.round(q.unit.maxHp * 0.6);
    w.hit(mob, q, { flat: Math.round(q.unit.maxHp * 0.3) });
    assert(legendary.absorb(w, q, 100) < 100, "барьер не поглощает");
  });

  await check("синхронизация вида: легендарные кольцо/амулет — 6-й и 7-й куски u.gear, без них — 5 кусков", () => {
    const w = mkWorld();
    const p = mkPlayer(w, "bloodweaver", 60, "Луна");
    assert(p.unit.gear.split("|").length === 5, "без легендарной бижутерии: " + p.unit.gear);
    p.save.equip.amulet = makeLegendary("bloodmoon_heart"); p.recalc();
    const parts = p.unit.gear.split("|");
    assert(parts.length === 7 && parts[6].split(":")[2] === "bloodmoon_heart" && parts[5] === "", "амулет: " + p.unit.gear);
  });
  console.log(`\nЛегендарки: проверок ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
