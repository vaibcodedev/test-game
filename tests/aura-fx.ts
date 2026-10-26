/**
 * Обозначения бафов и дебафов на юнитах (задача 129, шаг 2), без сервера и браузера: данные (таблица, правила, каталог игры, листы),
 * формат Unit.fx и сборка набора миром без сети: эффекты героя, мобы, зоны умений (каждый в круге), знамя (по какому знамени эмблема, запись не копится),
 * правила «прячет», вид события k и длительность круга (пассивки не делают ложных зон), гимн и покров (фракция, видимость, щит именно от покрова),
 * вспышки неуязвимости, лимит кругов, один обход мира для всех кругов = World.enemiesInCircle на каждый круг, цена пересчёта.
 * Запуск: npx tsx tests/aura-fx.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import table from "../data/aura-fx.json";
import rules from "../data/aura-fx-rules.json";
import { FX_KEYS, FX_INDEX, MAX_ZONES, stats, tick } from "../server/src/game/auraFx";
import { AURA_FIELDS } from "../server/src/game/auras";
import { AURAS } from "../shared/auras";
import { FX_BASE, FX_MAX_STACKS, fxChar, fxIdx, fxN } from "../shared/auraFx";
import { SKILLS } from "../shared/skills";
import { World, type Actor } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { castSkill } from "../server/src/game/skills";
import { incoming } from "../server/src/game/tanks";
import { generateRaidMap, raidSpawn } from "../shared/raid";
import { WorldState } from "../server/src/rooms/schema";
import { generateArenaMap } from "../shared/arena";
import { CELL_BLOCK, CELL_WALL, lineClear } from "../shared/map";
import { MOBS } from "../shared/mobs";
import { TILE } from "../shared/constants";
import type { ClassId } from "../shared/classes";
import type { Fx } from "../shared/protocol";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME = path.join(ROOT, "client/public/assets/aura-fx");

// ---------- формат Unit.fx ----------
for (const [i, n] of [[0, 0], [5, 3], [64, 7], [127, 7], [12, 0]]) {
  const c = fxChar(i, n).charCodeAt(0);
  assert.ok(c >= FX_BASE && c < 0xd800, "код символа — не управляющий и не суррогат");
  assert.deepEqual([fxIdx(c), fxN(c)], [i, n], `символ ${i}/${n}`);
}
assert.equal(fxN(fxChar(3, 99).charCodeAt(0)), FX_MAX_STACKS, "стаки режутся до максимума");
assert.equal(fxN(fxChar(3, -4).charCodeAt(0)), 0);

// ---------- таблица, правила, каталог игры ----------
const all = { ...table.buffs, ...table.common, ...table.debuffs, ...table.zones } as Record<string, { layers: { sheet: string; sheetX3?: string; frame: number[]; frameX3?: number[]; frames: number; scale: number; at: string; z: string; orbit?: { n: number; kinds: number } }[]; slot: string; priority: number; ease: { fadeIn: number; fadeOut: number } }>;
assert.equal(FX_KEYS.length, Object.keys(all).length, "ключей в Unit.fx столько же, сколько обозначений в таблице");
assert.deepEqual([...FX_KEYS], [...Object.keys(table.buffs), ...Object.keys(table.common), ...Object.keys(table.debuffs), ...Object.keys(table.zones)], "индексы — по порядку data/aura-fx.json");
const manifest = JSON.parse(fs.readFileSync(path.join(GAME, "manifest.json"), "utf8")) as {
  keys: string[]; replaces: string[]; sheets: Record<string, [number, number, number]>;
  fx: Record<string, { slot: string; prio: number; legacy?: boolean; box?: { w: number; off: number }; bead: string[]; pips?: { max: number; color: number[] }; layers: { sheet: string; sheetX3?: string; frame: number[]; frameX3?: number[]; frames: number; fps: number; scale: number; scaleX3?: number; anchor: number[]; at: string; z: string }[] }>;
};
assert.deepEqual(manifest.keys, [...FX_KEYS], "каталог игры (client/public/assets/aura-fx/manifest.json) — тот же порядок ключей, что в таблице: перезапустите tools/gen/aura-fx.ts --game");
const png = (name: string) => { const b = fs.readFileSync(path.join(GAME, `${name}.png`)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
for (const k of FX_KEYS) {
  const e = manifest.fx[k], t = all[k];
  assert.ok(e && t, `${k}: есть и в каталоге, и в таблице`);
  assert.equal(e.slot, t.slot, `${k}: слот`);
  assert.equal(e.prio, t.priority, `${k}: приоритет`);
  assert.equal(e.bead.length, 4, `${k}: четыре цвета бусины`);
  assert.equal(e.legacy ? e.layers.length : t.layers.length, e.layers.length, `${k}: слоёв столько же, сколько в таблице`);
  assert.ok(e.legacy ? k === "runeblade" : e.layers.length > 0, `${k}: у обозначения есть слои (legacy — только руны)`);
  if (t.slot === "overlay" && !e.legacy && e.layers[0].at === "head") assert.ok(e.box && e.box.w > 0, `${k}: значок над подписью — задана ширина для ряда`);
  for (const L of e.layers) {
    assert.ok(L.frames >= 2 && L.fps >= 12, `${k}: цикл не короче 2 кадров и не медленнее 12 к/с (${L.frames} кадров, ${L.fps} к/с)`);
    assert.ok(L.anchor[0] >= 0 && L.anchor[0] <= 1 && L.anchor[1] >= 0 && L.anchor[1] <= 1, `${k}: якорь в долях`);
    assert.ok(["feet", "body", "hand", "head"].includes(L.at) && ["ground", "under", "over", "top"].includes(L.z), `${k}: место и глубина`);
    const [w, h] = png(L.sheet);
    assert.deepEqual([w, h], [L.frame[0] * L.frames, L.frame[1]], `${k}: лист ${L.sheet} — ${L.frames} кадров ${L.frame[0]}×${L.frame[1]}`);
    assert.deepEqual(manifest.sheets[L.sheet], [L.frame[0], L.frame[1], L.frames], `${k}: лист ${L.sheet} в списке загрузки`);
    if (L.sheetX3) {
      const [w3, h3] = png(L.sheetX3);
      assert.deepEqual([w3, h3], [L.frameX3![0] * L.frames, L.frameX3![1]], `${k}: лист ${L.sheetX3} (тройная плотность)`);
      assert.equal(L.scale, 0.5, `${k}: двойная плотность — масштаб 0,5`);
    }
  }
}
for (const id of manifest.replaces) assert.ok(Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, "data/skill-fx.json"), "utf8")) as Record<string, { aura?: string }>).some((s) => s.aura === id), `replaces: цикла ${id} нет в data/skill-fx.json`);

// правила передачи ссылаются на существующие ключи и умения
for (const z of rules.zones) { assert.ok(FX_INDEX[z.fx] !== undefined, `зона ${z.fx}`); assert.ok(SKILLS[z.skill], `зона ${z.fx}: умения ${z.skill} нет`); assert.ok(z.ev === "hazard" || z.ev === "tele" || z.ev === "aoe"); }
for (const f of rules.fields) { assert.ok(FX_INDEX[f.fx] !== undefined && SKILLS[f.skill], `поле ${f.fx}`); assert.ok(AURAS[f.aura], `поле ${f.fx}: эффекта ${f.aura} нет в data/auras.json`); }
for (const [by, list] of Object.entries(rules.hide)) for (const k of [by, ...list]) assert.ok(FX_INDEX[k] !== undefined, `hide: ключа ${k} нет`);
for (const k of Object.values(rules.byClass).flatMap((m) => Object.values(m))) assert.ok(FX_INDEX[k] !== undefined, `byClass: ключа ${k} нет`);

// каждый ключ зоны из таблицы обслуживается правилом: зона по умению (zones), поле у кастера (fields) или знамя (banner)
{
  const served = new Set([...rules.zones.map((z) => z.fx), ...rules.fields.map((f) => f.fx), rules.banner.others.replace("{faction}", "solgard"), rules.banner.others.replace("{faction}", "umbrath")]);
  for (const k of Object.keys(table.zones)) assert.ok(served.has(k), `зона ${k}: нет правила в data/aura-fx-rules.json`);
  for (const k of served) assert.ok(k in table.zones, `правило ${k}: нет такой зоны в data/aura-fx.json`);
}

// каждый эффект героя (data/auras.json, поля и хуки) получает обозначение; ключи таблицы без эффекта — только зоны, общие и осознанные исключения
const NO_AURA = new Set(["block@mage", "food", "potion", "mount", ...Object.keys(table.zones)]);
for (const k of Object.keys(AURAS)) if (!k.startsWith("food_")) assert.ok(FX_INDEX[k] !== undefined, `эффект ${k}: нет обозначения в data/aura-fx.json`);
for (const k of FX_KEYS) if (!NO_AURA.has(k)) assert.ok(AURAS[k], `обозначение ${k}: нет такого эффекта в data/auras.json`);
for (const d of AURA_FIELDS) assert.ok(FX_INDEX[d.k] !== undefined, `поле героя ${d.k}: нет обозначения`);

// ---------- мир без сети ----------
const mkWorld = () => new World(new WorldState(), () => {}, { map: generateArenaMap(), mobs: false, quiet: true });
let uid = 0;
function mkHero(w: World, cls: ClassId, skills: string[], dx = 0, dy = 0, team = 1): Player {
  const save = newSave(cls, { x: 5 * TILE + dx, y: 8.5 * TILE + dy });
  save.level = 40;
  for (const s of skills) save.skills[s] = 1;
  const p = new Player(`f${++uid}`, `Тест${uid}`, save, () => {});
  w.addPlayer(p);
  p.team = team;
  p.unit.hp = p.unit.maxHp;
  p.unit.mp = p.unit.maxMp;
  return p;
}
const mobAt = (w: World, x: number, y: number) => w.addMob(new Mob(w.uid("m"), MOBS.goblin_slasher, 20, { x, y }));
function cast(w: World, p: Player, id: string, at?: { x: number; y: number; id?: string }, run = 50) {
  p.unit.mp = p.unit.maxMp;
  p.gcdUntil = 0;
  p.cds.delete(id);
  const err = castSkill(w, p, id, at?.x ?? p.x, at?.y ?? p.y, at?.id ?? null);
  assert.equal(err, null, `${id}: ${err}`);
  w.update(run);
}
/** Ключи и стаки из строки Unit.fx. */
const fxOf = (u: { fx: string }) => [...u.fx].map((c) => FX_KEYS[fxIdx(c.charCodeAt(0))] + (fxN(c.charCodeAt(0)) ? `×${fxN(c.charCodeAt(0))}` : ""));
const has = (u: { fx: string }, k: string) => fxOf(u).some((x) => x === k || x.startsWith(`${k}×`));

{
  // новый герой и пустой мир: нет эффектов — пустая строка; поле есть в схеме
  const w = mkWorld(), p = mkHero(w, "warrior", []);
  w.update(50);
  assert.equal(p.unit.fx, "", "без эффектов — пустой набор");
  p.unit.fx = "x";
  w.update(50);
  assert.equal(p.unit.fx, "", "набор пересчитывается каждый такт");
}
{
  // свои эффекты: «Божественный щит» (invuln), «Щитовой блок» (block); порядок символов — по индексу; срок вышел — набор пуст
  const w = mkWorld(), p = mkHero(w, "warrior", ["tp_divine", "shieldblock"]);
  cast(w, p, "tp_divine");
  cast(w, p, "shieldblock");
  const f = fxOf(p.unit);
  assert.ok(f.includes("invuln") && f.includes("block"), `ожидались invuln и block: ${f}`);
  assert.deepEqual([...p.unit.fx].map((c) => fxIdx(c.charCodeAt(0))), [...p.unit.fx].map((c) => fxIdx(c.charCodeAt(0))).sort((a, b) => a - b), "символы по возрастанию индекса");
  for (let i = 0; i < 400 && p.unit.fx; i++) w.update(50);
  assert.equal(p.unit.fx, "", "срок вышел — обозначений нет");
}
{
  // «щит» по классам: у целителя holy-купол (shield), у мага — барьер (block@mage); щит с другим ключом не выдумывается
  const w = mkWorld(), c = mkHero(w, "healer", ["holyshield"]), m = mkHero(w, "mage", ["mg_barrier"], 60);
  cast(w, c, "holyshield");
  cast(w, m, "mg_barrier");
  assert.ok(has(c.unit, "shield") && !has(c.unit, "block@mage"), `целитель: ${fxOf(c.unit)}`);
  assert.ok(has(m.unit, "block@mage") && !has(m.unit, "shield"), `маг: ${fxOf(m.unit)}`);
}
{
  // стаки и еда: «Стихийный ритм» несёт число зарядов; еда любого блюда — одно обозначение food; мёртвый — без обозначений
  const w = mkWorld(), p = mkHero(w, "warrior", []);
  p.stunUntil = w.time + 5000;
  w.update(50);
  assert.deepEqual(fxOf(p.unit), ["stun"]);
  const dish = Object.keys((AURAS as Record<string, unknown>)).find((k) => k.startsWith("food_"))!;
  (p.save as unknown as { food: { id: string; until: number } }).food = { id: dish.slice(5), until: Date.now() + 60_000 };
  w.update(50);
  assert.deepEqual(fxOf(p.unit), ["food", "stun"], "еда → food, баффы раньше дебаффов по индексам таблицы");
  p.potionAt = w.time + 1500;
  w.update(50);
  assert.ok(has(p.unit, "potion"), "глоток зелья — potion, пока идёт откат");
  p.dead = true;
  w.update(50);
  assert.equal(p.unit.fx, "", "мёртвый — без обозначений");
}
{
  // стаки: яд разбойника несёт число стаков в символе
  const w = mkWorld(), p = mkHero(w, "rogue", []);
  p.venomUntil = w.time + 5000; p.venomStacks = 3;
  w.update(50);
  assert.deepEqual(fxOf(p.unit), ["venom×3"], "стаки в символе");
  p.venomStacks = 2;
  w.update(50);
  assert.deepEqual(fxOf(p.unit), ["venom×2"], "стаки изменились — строка другая");
}
{
  // мобы: оглушение, корни, замедление, ослабление, проклятие, кровотечение; убитый моб — без обозначений
  const w = mkWorld(), p = mkHero(w, "warrior", []);
  const m = mobAt(w, p.x + 80, p.y);
  w.update(50);
  assert.equal(m.unit.fx, "");
  m.stunUntil = w.time + 3000; m.slowUntil = w.time + 3000; m.bleedUntil = w.time + 3000;
  w.update(50);
  assert.deepEqual(fxOf(m.unit), ["stun", "slow", "bleed"], "у моба три эффекта в порядке таблицы");
  m.stunUntil = 0;
  w.update(50);
  assert.deepEqual(fxOf(m.unit), ["slow", "bleed"], "оглушение снято");
  const before = m.unit.fx;
  w.update(50);
  assert.equal(m.unit.fx, before);
  m.rootUntil = w.time + 3000; m.weakUntil = w.time + 3000; m.curseUntil = w.time + 3000;
  w.update(50);
  assert.deepEqual(fxOf(m.unit), ["root", "slow", "weak", "bleed", "curse"], "ещё корни, ослабление и проклятие");
  m.state = "dead";
  w.update(50);
  assert.equal(m.unit.fx, "", "убитый моб — без обозначений");
}
{
  // знамя: у храмовника, поставившего знамя, — кольцо tp_banner; у союзника в круге, даже другого храмовника, — zone_banner фракции знамени; вне круга — ничего
  const w = mkWorld(), t = mkHero(w, "warrior", ["tp_banner"]), ally = mkHero(w, "mage", [], 30), t2 = mkHero(w, "warrior", [], 20, 10), far = mkHero(w, "rogue", [], 400), umb = mkHero(w, "warlock", [], 0, 30);
  cast(w, t, "tp_banner", { x: t.x + 10, y: t.y });
  assert.deepEqual(fxOf(t.unit), ["tp_banner"], `храмовник: ${fxOf(t.unit)}`);
  assert.deepEqual(fxOf(ally.unit), ["zone_banner_solgard"], `союзник в круге: ${fxOf(ally.unit)}`);
  assert.deepEqual(fxOf(t2.unit), ["zone_banner_solgard"], `другой храмовник в чужом знамени — эмблема, не кольцо: ${fxOf(t2.unit)}`);
  assert.deepEqual(fxOf(umb.unit), ["zone_banner_solgard"], `герой Умбрата в круге знамени Сольгарда (рейд, арена) — эмблема фракции знамени, не своей: ${fxOf(umb.unit)}`);
  assert.equal(far.unit.fx, "", "вне круга знамени — без обозначений");
  assert.equal(stats(w).banners, 1, "одно знамя — одна запись");
  // знамя истекло: у поставившего кольца нет, и стоять в старом круге уже не значит владеть им; запись знамени не копится
  for (let i = 0; i < 1200 && t.unit.fx; i++) w.update(50);
  assert.equal(t.unit.fx, "", "знамя стоять перестало — обозначений нет");
  for (let i = 0; i < 30; i++) w.update(50);
  assert.equal(stats(w).banners, 0, "истёкшее знамя из записей убрано");
}
{
  // рейд: боты — те же герои (Player, team 0, комната без мобов мира); бот-союзник в круге знамени получает и сам баф (снижение урона), и эмблему,
  // бот другой фракции — тоже (в рейде фракции не враждуют); бот за кругом — ни того, ни другого
  const w = new World(new WorldState(), () => {}, { map: generateRaidMap(), mobs: false, quiet: true });
  const at = raidSpawn(0);
  const raider = (cls: ClassId, dx: number, faction?: "solgard" | "umbrath") => {
    const save = newSave(cls, { x: at.x + dx, y: at.y });
    save.level = 40;
    if (faction) save.faction = faction;
    const p = new Player(`rb${++uid}`, `Бот${uid}`, save, () => {});
    p.team = 0; p.unit.team = 0;
    w.addPlayer(p);
    p.unit.hp = p.unit.maxHp;
    return p;
  };
  const t = raider("warrior", 0, "solgard");
  t.save.skills.tp_banner = 1;
  const bot = raider("mage", 40), botU = raider("warlock", -40, "umbrath"), far = raider("rogue", 400);
  cast(w, t, "tp_banner", { x: t.x, y: t.y });
  const r = SKILLS.tp_banner.v(1).reduce;
  assert.equal(incoming(w, t, bot, 100, {}), 100 * (1 - r / 100), "бот-союзник в круге: знамя снижает урон");
  assert.deepEqual(fxOf(bot.unit), ["zone_banner_solgard"], `бот-союзник в круге знамени: ${fxOf(bot.unit)}`);
  assert.equal(incoming(w, t, botU, 100, {}), 100 * (1 - r / 100), "бот Умбрата в рейде: знамя снижает урон");
  assert.deepEqual(fxOf(botU.unit), ["zone_banner_solgard"], `бот Умбрата в круге знамени Сольгарда: ${fxOf(botU.unit)}`);
  assert.equal(incoming(w, t, far, 100, {}), 100, "бот вне круга: без снижения");
  assert.equal(far.unit.fx, "", "бот вне круга — без обозначений");
  // клиент: в рейде в кадре почти всегда толпа (больше 6 героев) — правила толпы не должны прятать эмблему знамени у чужих союзников
  const cli = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/src/game/auraFx.ts"), "utf8");
  assert.match(cli, /slot === OVERLAY\) ok = [^\n]*zone_banner_/, "правила толпы оставляют союзникам эмблему знамени zone_banner_*");
}
{
  // храмовник погиб — запись знамени снята сразу, у союзников обозначения нет; из двух знамён в круге выбор — как в хуке tanks.ts (сильнейшее)
  const w = mkWorld(), t = mkHero(w, "warrior", ["tp_banner"]), ally = mkHero(w, "mage", [], 30);
  cast(w, t, "tp_banner", { x: t.x + 10, y: t.y });
  assert.deepEqual(fxOf(ally.unit), ["zone_banner_solgard"]);
  t.dead = true;
  w.update(50);
  assert.equal(stats(w).banners, 0, "погибший храмовник знамя не держит");
  assert.equal(ally.unit.fx, "", "знамя погибшего храмовника не стоит");
  assert.ok(SKILLS.tp_banner.v(5).reduce > SKILLS.tp_banner.v(1).reduce, "у старшего ранга знамя сильнее");
  const w2 = mkWorld(), a = mkHero(w2, "warrior", ["tp_banner"]), b = mkHero(w2, "warrior", [], 30);
  b.save.skills.tp_banner = 5;
  cast(w2, a, "tp_banner", { x: a.x + 10, y: a.y });
  cast(w2, b, "tp_banner", { x: a.x + 15, y: a.y });
  assert.deepEqual(fxOf(b.unit), ["tp_banner"], `у владельца сильного знамени — кольцо: ${fxOf(b.unit)}`);
  assert.deepEqual(fxOf(a.unit), ["zone_banner_solgard"], `слабое знамя перекрыто сильным — у его владельца эмблема, как и сам эффект идёт от сильного: ${fxOf(a.unit)}`);
}
{
  // зоны, где враг — моб: огненная стена (zone_fire, горение прячется), дымовая завеса, пелена, чумной туман
  const w = mkWorld(), mage = mkHero(w, "mage", ["mg_firewall"]);
  const m = mobAt(w, mage.x + 40, mage.y);
  m.slowUntil = w.time + 5000;
  w.update(50);
  assert.deepEqual(fxOf(m.unit), ["slow"]);
  cast(w, mage, "mg_firewall", { x: m.x, y: m.y });
  assert.deepEqual(fxOf(m.unit), ["slow", "zone_fire"], `враг в огненной стене: ${fxOf(m.unit)}`);
  assert.equal(mage.unit.fx.includes(fxChar(FX_INDEX.zone_fire)), false, "сам маг стену на себе не носит");
  const far = mobAt(w, mage.x + 500, mage.y);
  w.update(200);
  assert.equal(far.unit.fx, "", "вне стены — без обозначений");
  // стена истекла — обозначения нет
  for (let i = 0; i < 400 && has(m.unit, "zone_fire"); i++) w.update(50);
  assert.ok(!has(m.unit, "zone_fire"), "стена догорела — обозначения нет");
  const burning = mkHero(w, "rogue", []);
  burning.burnUntil = w.time + 4000;
  w.update(50);
  assert.ok(has(burning.unit, "burn"), "горение без стены видно");
}
for (const [cls, skill, key] of [["rogue", "as_smoke", "zone_smoke"], ["darkranger", "dr_veil", "zone_veil"], ["warlock", "wl_doom", "zone_doom"]] as const) {
  const w = mkWorld(), p = mkHero(w, cls, [skill]);
  const m = mobAt(w, p.x + 30, p.y), far = mobAt(w, p.x + 600, p.y);
  cast(w, p, skill, { x: p.x + 30, y: p.y });
  assert.ok(has(m.unit, key), `${skill}: враг в круге несёт ${key}: ${fxOf(m.unit)}`);
  assert.equal(far.unit.fx, "", `${skill}: далёкий моб — без обозначений`);
}
{
  // зоны для союзников: круг света, гимн, покров веры, багровая купель — на каждом союзнике в круге; вне круга и враги — нет
  for (const [cls, skill, key] of [["healer", "circle", "zone_circle"], ["healer", "cl_hymn", "zone_hymn"], ["healer", "cl_aegis", "zone_aegis"], ["bloodweaver", "bw_crimson_pool", "zone_pool"]] as const) {
    const w = mkWorld(), p = mkHero(w, cls, [skill]);
    const sameFaction = cls === "bloodweaver" ? "warlock" : "mage";
    const near = mkHero(w, sameFaction, [], 30), far = mkHero(w, sameFaction, [], 500), foe = mobAt(w, p.x + 20, p.y);
    p.unit.hp = near.unit.hp = Math.floor(p.unit.maxHp / 2);
    cast(w, p, skill, { x: p.x + 10, y: p.y }, skill === "cl_hymn" ? 1100 : 50); // гимн лечит на каждом тике (раз в секунду)
    assert.ok(has(near.unit, key), `${skill}: союзник в круге несёт ${key}: ${fxOf(near.unit)}`);
    assert.ok(!has(far.unit, key) && !has(foe.unit, key), `${skill}: далёкий союзник и враг — без ${key}`);
  }
}
{
  // искажение времени: пока у мага действует timewarp, враги вокруг него несут zone_time, замедление slow у них прячется; ушёл — нет
  const w = mkWorld(), m = mkHero(w, "mage", ["mg_timewarp"]);
  const foe = mobAt(w, m.x + 40, m.y), away = mobAt(w, m.x + 600, m.y);
  cast(w, m, "mg_timewarp");
  w.update(300);
  foe.slowUntil = w.time + 5000;
  w.update(200);
  assert.ok(has(foe.unit, "zone_time") && !has(foe.unit, "slow"), `в поле искажения: ${fxOf(foe.unit)}`);
  assert.ok(has(m.unit, "timewarp"), "у самого мага — timewarp");
  assert.equal(away.unit.fx, "", "далёкий моб — без обозначений");
  foe.unit.x += 400; foe.unit.y += 0;
  w.update(300);
  assert.ok(!has(foe.unit, "zone_time"), "вышел из поля — обозначения нет");
}

// ---------- правила передачи: вид события, вспышки, знамя ----------
for (const z of rules.zones) assert.ok(typeof (z as { k?: string }).k === "string", `зона ${z.fx}: задан вид события k (пассивки шлют свои события с меткой умения)`);
for (const [ev, fx] of Object.entries(rules.flashes)) assert.ok(ev && FX_INDEX[fx] !== undefined, `вспышка ${ev} → ${fx}: ключа нет`);
assert.ok(rules.banner.k, "знамя: задан вид события k");

{
  // пассивка, сработавшая во время умения, шлёт свои события с меткой этого умения (World.emit): ложных кругов нет
  // («Чистый свет» после лечения кругом, гимном или покровом — aoe cleanse r 36; метеор легендарки во время купели — телеграф круга 600 мс)
  const w = mkWorld(), c = mkHero(w, "healer", ["circle", "cl_hymn", "cl_aegis"]), ally = mkHero(w, "mage", [], 200);
  const bw = mkHero(w, "bloodweaver", ["bw_crimson_pool"], 0, 100), mate = mkHero(w, "warlock", [], 0, 140);
  for (const skill of ["circle", "cl_hymn", "cl_aegis"]) { w.fxSkill = skill; w.fxCaster = c.id; w.emit({ t: "aoe", k: "cleanse", x: ally.x, y: ally.y, r: 36 }); }
  w.fxSkill = "bw_crimson_pool"; w.fxCaster = bw.id;
  w.emit({ t: "tele", shape: "circle", k: "fire", x: mate.x, y: mate.y, r: 70, ms: 600 });
  w.fxSkill = null; w.fxCaster = null;
  w.update(100);
  assert.equal(ally.unit.fx, "", `союзник не в круге умения: ${fxOf(ally.unit)}`);
  assert.equal(mate.unit.fx, "", `телеграф пассивки — не купель: ${fxOf(mate.unit)}`);
  assert.equal(stats(w).zones, 0, "ложных кругов нет");
}
{
  // гимн лечит и обозначается у союзников своей фракции в прямой видимости от кастера: другая фракция и герой за стеной — нет
  const w = mkWorld(), c = mkHero(w, "healer", ["cl_hymn"]);
  const mate = mkHero(w, "mage", [], 30), umb = mkHero(w, "warlock", [], 0, 30), behind = mkHero(w, "ranger", [], 90);
  w.map.cell[Math.floor(c.y / TILE) * w.map.w + Math.floor((c.x + 45) / TILE)] |= CELL_BLOCK | CELL_WALL;
  assert.ok(!lineClear(w.map, c.x, c.y, behind.x, behind.y) && lineClear(w.map, c.x, c.y, mate.x, mate.y), "стена между кастером и героем стоит, мимо союзника рядом — чисто");
  mate.unit.hp = Math.floor(mate.unit.maxHp / 2);
  cast(w, c, "cl_hymn", undefined, 1100);
  assert.ok(has(mate.unit, "zone_hymn"), `союзник рядом: ${fxOf(mate.unit)}`);
  assert.ok(!has(umb.unit, "zone_hymn"), `другая фракция гимном не лечится — обозначения нет: ${fxOf(umb.unit)}`);
  assert.ok(!has(behind.unit, "zone_hymn"), `за стеной гимн не лечит — обозначения нет: ${fxOf(behind.unit)}`);
}
{
  // покров: обозначение у тех, кому он выдал щит, и пока держится этот щит; щит из другого источника (барьер мага) его не включает
  const w = mkWorld(), c = mkHero(w, "healer", ["cl_aegis"]), mate = mkHero(w, "mage", ["mg_barrier"], 30), umb = mkHero(w, "warlock", [], 0, 30);
  cast(w, c, "cl_aegis", { x: c.x + 10, y: c.y });
  assert.ok(has(mate.unit, "zone_aegis") && has(c.unit, "zone_aegis"), `покров в круге: ${fxOf(mate.unit)}`);
  assert.ok(!has(umb.unit, "zone_aegis"), `другая фракция покров не получает: ${fxOf(umb.unit)}`);
  mate.shieldUntil = 0; mate.shieldAmt = 0;
  w.update(200);
  assert.ok(!has(mate.unit, "zone_aegis"), "щит покрова пробит или вышел — обозначения нет");
  cast(w, mate, "mg_barrier", undefined, 400);
  assert.ok(has(mate.unit, "block@mage") && !has(mate.unit, "zone_aegis"), `щит другого источника покров не включает: ${fxOf(mate.unit)}`);
  // и срок обозначения — срок самого щита (8 с), а не фиксированные 30 с
  const w2 = mkWorld(), c2 = mkHero(w2, "healer", ["cl_aegis"]), m2 = mkHero(w2, "mage", [], 30);
  cast(w2, c2, "cl_aegis", { x: c2.x + 10, y: c2.y });
  assert.ok(has(m2.unit, "zone_aegis"));
  for (let i = 0; i < 90; i++) w2.update(100);
  assert.ok(!has(m2.unit, "zone_aegis"), "щит вышел (8 с) — обозначения нет");
  assert.equal(stats(w2).zones, 0, "круг покрова из записей убран");
}
{
  // вспышка неуязвимости («Страж», «Объятия смерти») не пишет срок в список эффектов, но видна как купол invuln, пока длится событие
  const w = mkWorld(), p = mkHero(w, "healer", []), q = mkHero(w, "mage", [], 80);
  w.emit({ t: "buff", id: p.id, k: "invuln", ms: 1200 });
  w.emit({ t: "buff", id: q.id, k: "invuln", ms: 0 }, false);
  w.update(50);
  assert.ok(has(p.unit, "invuln"), `вспышка неуязвимости: ${fxOf(p.unit)}`);
  assert.equal(q.unit.fx, "", "событие с ms 0 — снятие, обозначения нет");
  for (let i = 0; i < 30; i++) w.update(50);
  assert.ok(!has(p.unit, "invuln"), "вспышка кончилась — обозначения нет");
  assert.equal(stats(w).flashes, 0, "запись вспышки убрана");
}
{
  // лимит кругов: при переполнении уходят истёкшие и те, у кого срок ближе к концу; долгая зона, поставленная раньше, живёт
  const w = mkWorld(), p = mkHero(w, "mage", ["mg_firewall"]);
  const longLived = mobAt(w, p.x + 200, p.y), shortLived = mobAt(w, p.x + 400, p.y + 150);
  const ev = (x: number, y: number, ms: number): Fx => ({ t: "hazard", id: w.uid("h"), k: "fire", x, y, r: 28, ms, s: "mg_firewall", c: p.id });
  tick(w, [ev(longLived.x, longLived.y, 60_000)]);
  const many: Fx[] = [ev(shortLived.x, shortLived.y, 2000)];
  for (let i = 0; i < MAX_ZONES + 40; i++) many.push(ev(p.x + 600 + (i % 20) * 3, p.y + 300 + Math.floor(i / 20) * 3, 2500 + i));
  tick(w, many);
  assert.ok(stats(w).zones <= MAX_ZONES, `кругов не больше лимита: ${stats(w).zones}`);
  w.update(50);
  assert.ok(has(longLived.unit, "zone_fire"), "долгая зона пережила переполнение");
  assert.ok(!has(shortLived.unit, "zone_fire"), "круг с самым близким сроком ушёл первым");
}
{
  // обход мира для всех кругов сразу даёт то же, что обход на каждый круг (World.enemiesInCircle): мобы, герои чужой команды, стены, мёртвые
  const w = mkWorld();
  (w as unknown as { pvpActive: boolean }).pvpActive = true;
  const caster = mkHero(w, "mage", ["mg_firewall"], 0, 0, 1);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const units: { a: Actor; u: { fx: string } }[] = [];
  for (let i = 0; i < 8; i++) { const h = mkHero(w, i % 2 ? "rogue" : "ranger", [], 40 + Math.floor(rnd() * 800), -150 + Math.floor(rnd() * 500), i < 2 ? 1 : 2); units.push({ a: h, u: h.unit }); }
  for (let i = 0; i < 300; i++) { const m = mobAt(w, 70 + rnd() * 940, 70 + rnd() * 630); if (i % 17 === 0) m.state = "dead"; units.push({ a: m, u: m.unit }); }
  w.fxSkill = "mg_firewall"; w.fxCaster = caster.id;
  const circles = Array.from({ length: 25 }, () => ({ x: 80 + rnd() * 920, y: 80 + rnd() * 620, r: rnd() < 0.5 ? 28 : 60 }));
  for (const c of circles) w.emit({ t: "hazard", id: w.uid("h"), k: "fire", x: c.x, y: c.y, r: c.r, ms: 100_000 });
  w.fxSkill = null; w.fxCaster = null;
  w.update(50);
  const want = new Set<Actor>();
  for (const c of circles) for (const a of w.enemiesInCircle(caster, c.x, c.y, c.r)) want.add(a);
  let inside = 0, wrong = 0;
  for (const { a, u } of units) { const got = has(u, "zone_fire"); if (got) inside++; if (got !== want.has(a)) wrong++; }
  assert.ok(want.size >= 8, `в кругах есть кто проверять: ${want.size}`);
  assert.equal(wrong, 0, `один обход мира расходится с enemiesInCircle в ${wrong} юнитах из ${units.length} (в кругах ${inside}, ожидалось ${want.size})`);
}

// ---------- пересчёт зон не дорогой: 50 кругов на 1100 мобах ----------
{
  const w = mkWorld(), p = mkHero(w, "mage", ["mg_firewall"]);
  for (let i = 0; i < 1100; i++) mobAt(w, 100 + (i % 40) * 20, 100 + Math.floor(i / 40) * 20);
  const ev: Fx[] = [];
  for (let i = 0; i < 50; i++) ev.push({ t: "hazard", id: w.uid("h"), k: "fire", x: 120 + (i % 10) * 70, y: 120 + Math.floor(i / 10) * 100, r: 28, ms: 10_000_000, s: "mg_firewall", c: p.id });
  tick(w, ev);
  assert.equal(stats(w).zones, 50);
  assert.ok(stats(w).members > 100, `круги накрыли мобов: ${stats(w).members}`);
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) { w.time += 150; tick(w, []); }
  const ms = (performance.now() - t0) / 300;
  assert.ok(ms < 1.5, `пересчёт 50 кругов на 1100 мобах: ${ms.toFixed(3)} мс (допуск 1,5; обход на каждый круг стоил 20-35 мс)`);
  console.log(`  пересчёт 50 кругов на 1100 мобах: ${ms.toFixed(3)} мс`);
}

// ---------- такт мобов не дорогой: 1100 мобов ----------
{
  const w = mkWorld(), p = mkHero(w, "warrior", []);
  void p;
  const mobs = Array.from({ length: 1100 }, (_, i) => mobAt(w, 100 + (i % 40) * 20, 100 + Math.floor(i / 40) * 20));
  mobs[3].stunUntil = w.time + 10_000;
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) (w as unknown as { flush(): void }).flush();
  const ms = (performance.now() - t0) / 200;
  assert.ok(ms < 1.5, `flush с 1100 мобами: ${ms.toFixed(3)} мс на такт (допуск 1,5)`);
  assert.deepEqual(fxOf(mobs[3].unit), ["stun"]);
  console.log(`  flush с 1100 мобами: ${ms.toFixed(3)} мс на такт`);
}

console.log("  ok   aura-fx");
