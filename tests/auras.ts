/**
 * Бафы и дебафы в рамке героя (задача 128), без сервера: auraList на заглушке актёра, служебные поля, подпись списка, data/auras.json и значки;
 * мир без сети (карта арены): умения вешают свои эффекты в список героя, щит исчезает сразу, остаток щита уходит в состояние юнита,
 * метки и горение видны на герое-цели (PvP). Запуск: npx tsx tests/auras.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AURA_FIELDS, auraList, auraPack, registerAuraHook } from "../server/src/game/auras";
import { AURAS, auraCompare, auraText, auraTimeLabel, auraTimeWords, foodAuraKey, foodOfAura } from "../shared/auras";
import { FOOD, FOOD_IDS } from "../shared/food";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { castSkill } from "../server/src/game/skills";
import { addDot, endDot, removeDots } from "../server/src/game/umbrath";
import { Unit, WorldState } from "../server/src/rooms/schema";
import { generateArenaMap } from "../shared/arena";
import { MOBS } from "../shared/mobs";
import { TILE } from "../shared/constants";
import type { ClassId } from "../shared/classes";
import type { Fx } from "../shared/protocol";
import { absorbHtml, absorbSpan } from "../client/src/ui/absorb";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = 100_000, wall = 1_700_000_000_000;
const dish = FOOD_IDS[0];
const keys = (l: { k: string }[]) => l.map((x) => x.k);

// ---------- auraList на заглушке: контроль, замедление с процентом, щит с величиной, яд со стаками, еда ----------
const hero = {
  dead: false,
  stunUntil: now + 2500,
  slowUntil: now + 4000, slowPct: 30,
  shieldUntil: now + 12_000, shieldAmt: 340.6,
  venomUntil: now + 6000, venomStacks: 3,
  save: { food: { id: dish, until: wall + 10 * 60_000 } },
  // служебные сроки и «готовности»: не эффекты, в список не попадают
  castUntil: now + 9000, gcdUntil: now + 700, waitUntil: now + 5000, petCdUntil: now + 60_000, frozenUntil: Infinity,
  reviveUntil: now + 400, stacksUntil: now + 4000, lastStandReady: now + 30_000, rollUntil: now + 3000, markUntil: now + 8000, tauntUntil: now + 4000,
};
const list = auraList(hero, now, wall);
assert.deepEqual(keys(list), ["shield", foodAuraKey(dish), "stun", "slow", "venom"], "сначала бафы (щит, еда), затем дебафы в порядке data/auras.json");
const by = Object.fromEntries(list.map((x) => [x.k, x]));
assert.deepEqual(by.stun, { k: "stun", ms: 2500 }, "оглушение: только срок");
assert.deepEqual(by.slow, { k: "slow", ms: 4000, v: 30 }, "замедление: процент в v");
assert.deepEqual(by.shield, { k: "shield", ms: 12_000, v: 341 }, "щит: остаток поглощения в v, целое");
assert.deepEqual(by.venom, { k: "venom", ms: 6000, n: 3 }, "яд: стаки в n");
assert.deepEqual(by[foodAuraKey(dish)], { k: foodAuraKey(dish), ms: 10 * 60_000 }, "еда: срок из сохранения героя (реальное время)");
// (точный список ключей выше уже доказывает: служебные поля заглушки в него не попали)

// срок прошёл или равен «сейчас» — эффекта нет; щит с нулевым остатком — не щит
assert.deepEqual(auraList({ stunUntil: now, rootUntil: now - 1, slowUntil: 0, slowPct: 40 }, now), []);
assert.deepEqual(auraList({ shieldUntil: now + 5000, shieldAmt: 0.4 }, now), [], "щит, поглотивший всё, не показывается");
assert.deepEqual(auraList({ save: { food: { id: dish, until: wall - 1 } } }, now, wall), [], "истёкшая еда");
assert.deepEqual(auraList({ save: { food: { id: "нет-такого-блюда", until: wall + 1e6 } } }, now, wall), [], "неизвестное блюдо");
// мёртвый герой: боевые эффекты скрыты, еда остаётся
assert.deepEqual(keys(auraList({ ...hero, dead: true }, now, wall)), [foodAuraKey(dish)]);
// флаг без срока: бессрочный (ms 0) дебаф после бафов
const intr = auraList({ intruder: true, hasteUntil: now + 3000, hastePct: 25 }, now);
assert.deepEqual(intr, [{ k: "haste", ms: 3000, v: 25 }, { k: "intruder", ms: 0 }]);
// «кто наложил»: узы и лечение со временем идут, пока он жив
const healer = { dead: false };
assert.deepEqual(keys(auraList({ renewUntil: now + 9000, renewAmt: 52, renewBy: healer, bondUntil: now + 8000, bondShare: 30, bondBy: healer }, now)), ["renew", "bond"]);
healer.dead = true;
assert.deepEqual(auraList({ renewUntil: now + 9000, renewAmt: 52, renewBy: healer, bondUntil: now + 8000, bondShare: 30, bondBy: healer }, now), []);
assert.deepEqual(auraList({ renewUntil: now + 9000, renewAmt: 52 }, now), [], "без лекаря обновления нет");

// ---------- подпись списка: время идёт — подпись та же; сроки, стаки и величины меняются — другая ----------
const sig = (a: object, t = now, w = wall) => auraPack(a, t, w).sig;
assert.equal(sig(hero), sig(hero, now + 1000, wall + 1000), "бег времени подпись не меняет");
assert.equal(sig(hero), sig(hero, now + 777, wall + 913), "и расхождение часов мира и реального времени (еда) — тоже");
assert.equal(auraPack(hero, now + 1000, wall + 1000).list.find((x) => x.k === "stun")!.ms, 1500, "остаток убывает");
assert.notEqual(sig(hero), sig({ ...hero, stunUntil: now + 3000 }), "срок продлили");
assert.notEqual(sig(hero), sig({ ...hero, venomStacks: 2 }), "стаки изменились");
assert.notEqual(sig(hero), sig({ ...hero, shieldAmt: 100 }), "щит поглотил урон");
assert.notEqual(sig(hero), sig({ ...hero, stunUntil: 0 }), "эффект снят");
assert.equal(sig({}), "", "пустой список — пустая подпись");
assert.deepEqual(auraList({ lastStandUntil: now + 8000, lastStandPct: 20 }, now), [{ k: "laststand", ms: 8000, v: 20 }], "«Последний рубеж»: процент снижения урона в v");

// ---------- мир без сети (карта арены): умения вешают эффекты в список героя, щит исчезает сразу ----------
// (до регистрации заглушки-хука ниже: она добавляет «invuln» каждому актёру)
const sent: Fx[] = [];
const mkWorld = () => {
  sent.length = 0;
  return new World(new WorldState(), (type, msg) => { if (type === "fx") sent.push(...(msg as Fx[])); }, { map: generateArenaMap(), mobs: false, quiet: true });
};
let uid = 0;
/** Герой 40 уровня с нужными умениями на ряду арены без стен (y = 8,5 тайла); team — команда (PvP на арене: w.pvpActive). */
function mkHero(w: World, cls: ClassId, skills: string[], dx = 0, team = 1): Player {
  const save = newSave(cls, { x: 5 * TILE + dx, y: 8.5 * TILE });
  save.level = 40;
  for (const s of skills) save.skills[s] = 1;
  const p = new Player(`t${++uid}`, `Тест${uid}`, save, () => {});
  w.addPlayer(p);
  p.team = team;
  p.unit.hp = p.unit.maxHp;
  p.unit.mp = p.unit.maxMp;
  return p;
}
const mobFor = (w: World, p: Player) => w.addMob(new Mob(w.uid("m"), MOBS.goblin, 20, { x: p.x + 40, y: p.y }));
const keysOf = (p: Player, w: World) => auraList(p, w.time).map((a) => a.k);
const auraOf = (p: Player, w: World, k: string) => auraList(p, w.time).find((a) => a.k === k);
/** Применить умение (отказ — провал теста) и пустить мир на run мс: такты героев и отложенные удары. */
function cast(w: World, p: Player, id: string, target?: { x: number; y: number; id: string }, run = 50) {
  p.unit.mp = p.unit.maxMp;
  p.gcdUntil = 0;
  p.cds.delete(id);
  const err = castSkill(w, p, id, target?.x ?? p.x, target?.y ?? p.y, target?.id ?? null);
  assert.equal(err, null, `${id}: ${err}`);
  w.update(run);
}
type BuffFx = Extract<Fx, { t: "buff" }>;
const buffs = (id: string): BuffFx[] => sent.filter((f): f is BuffFx => f.t === "buff" && f.id === id);
const gone = (id: string) => buffs(id).filter((f) => f.ms <= 0);

{
  // «Божественный щит» (invulnUntil в состоянии класса): значок неуязвимости с остатком времени
  const w = mkWorld(), p = mkHero(w, "warrior", ["tp_divine"]);
  cast(w, p, "tp_divine");
  const inv = auraOf(p, w, "invuln");
  assert.ok(inv && inv.ms > 2000 && inv.ms <= 2500, "tp_divine: значок неуязвимости со временем");
}
{
  // «Святой щит»: остаток — в списке эффектов и в состоянии юнита; пробит — картинка и значок исчезают сразу
  const w = mkWorld(), c = mkHero(w, "healer", ["holyshield"]), mob = mobFor(w, c);
  cast(w, c, "holyshield");
  const full = c.shieldAmt;
  assert.ok(full > 0 && c.shieldUntil > w.time, "щит наложен");
  assert.equal(auraOf(c, w, "shield")?.v, Math.round(full), "в списке эффектов — остаток щита");
  assert.equal(c.unit.shield, Math.round(full), "остаток щита ушёл в состояние юнита (рамки цели и группы)");
  assert.ok(buffs(c.id).some((f) => f.k === "shield" && f.ms > 7000 && f.s === "holyshield"), "картинка щита с меткой умения и сроком");
  c.unit.maxHp = c.unit.hp = 1_000_000; // не умереть от проверочных ударов
  w.hit(mob, c, { flat: 10 });
  w.update(50);
  assert.ok(c.shieldAmt > 0 && c.shieldAmt < full, "часть щита поглощена");
  assert.equal(c.unit.shield, Math.round(c.shieldAmt), "состояние юнита следует за остатком");
  sent.length = 0;
  w.fxSkill = "meteor"; w.fxCaster = "x"; // пробивает щит чужое умение: снятие всё равно без метки (клиент снимает по виду)
  w.hit(mob, c, { flat: full * 20 });
  w.fxSkill = null; w.fxCaster = null;
  w.update(50);
  assert.equal(c.shieldAmt, 0);
  assert.equal(c.shieldUntil, 0, "срок обнулён: следующий щит не унаследует чужой");
  assert.ok(gone(c.id).some((f) => f.k === "shield"), "щит пробит — buff shield с ms 0");
  assert.ok(gone(c.id).every((f) => f.s === undefined && f.c === undefined), "снятие без метки умения");
  assert.ok(!keysOf(c, w).includes("shield"), "значок щита пропал сразу");
  assert.equal(c.unit.shield, 0);
}
{
  // «Чародейский барьер» (вид fx block): разбит — снят block и shield; блок-стойка того же вида при пробитом щите остаётся
  const w = mkWorld(), m = mkHero(w, "mage", ["mg_barrier"]), mob = mobFor(w, m);
  cast(w, m, "mg_barrier");
  assert.ok(buffs(m.id).some((f) => f.k === "block" && f.ms > 7000 && f.s === "mg_barrier"), "картинка барьера");
  m.unit.maxHp = m.unit.hp = 1_000_000;
  m.shieldAmt = 50;
  sent.length = 0;
  w.hit(mob, m, { flat: 5000 });
  w.update(50);
  assert.ok(gone(m.id).some((f) => f.k === "block") && gone(m.id).some((f) => f.k === "shield"), "барьер разбит: сняты block и shield");
  assert.ok(gone(m.id).every((f) => f.s === undefined), "и без метки умения");
  const t = mkWorld(), p = mkHero(t, "warrior", ["shieldblock"]), mob2 = mobFor(t, p);
  cast(t, p, "shieldblock");
  p.unit.maxHp = p.unit.hp = 1_000_000;
  p.shieldAmt = 50; p.shieldUntil = t.time + 5000; p.shieldBy = p;
  sent.length = 0;
  t.hit(mob2, p, { flat: 5000 });
  t.update(50);
  assert.ok(gone(p.id).some((f) => f.k === "shield") && !gone(p.id).some((f) => f.k === "block"), "щит пробит, «Щитовой блок» продолжается: его картинку не трогаем");
}
{
  // смерть и срок: остаток щита не висит ни в состоянии юнита, ни в поле героя
  const w = mkWorld(), c = mkHero(w, "healer", []), mob = mobFor(w, c);
  c.shieldAmt = 30; c.shieldUntil = w.time + 5000; c.shieldBy = c;
  w.update(50);
  assert.equal(c.unit.shield, 30);
  w.hit(mob, c, { flat: c.unit.maxHp * 50 });
  assert.ok(c.dead && Number(c.shieldAmt) === 0 && c.shieldUntil === 0 && Number(c.unit.shield) === 0, "смерть снимает щит");
  const d = mkWorld(), e = mkHero(d, "healer", []);
  e.shieldAmt = 40; e.shieldUntil = d.time + 100; e.shieldBy = e;
  d.update(50);
  assert.equal(e.shieldAmt, 40);
  d.update(200);
  assert.ok(Number(e.shieldAmt) === 0 && e.unit.shield === 0, "срок вышел — остатка нет (по shieldAmt судят боты арены и рейда)");
}
{
  // потолок щита не урезает больший действующий; картинка идёт, пока действует щит, а не только новый (более короткий) срок
  const w = mkWorld(), c = mkHero(w, "healer", ["cl_aegis"]);
  const big = Math.round(c.unit.maxHp * 0.9);
  c.shieldAmt = big; c.shieldUntil = w.time + 20_000; c.shieldBy = c;
  sent.length = 0;
  cast(w, c, "cl_aegis");
  assert.ok(c.shieldAmt >= big, `щит урезан потолком: ${c.shieldAmt} < ${big}`);
  const fx = buffs(c.id).find((f) => f.k === "shield" && f.ms > 0);
  assert.ok(fx && fx.ms > 15_000, `картинка короче щита: ${fx?.ms}`);
}
{
  // «Объятия смерти»: щит виден все 5 с (раньше была только вспышка неуязвимости на 1,5 с)
  const w = mkWorld(), d = mkHero(w, "deathknight", ["dk_deaths_embrace"]), mob = mobFor(w, d);
  sent.length = 0;
  w.hit(mob, d, { flat: d.unit.maxHp * 5 });
  w.update(50);
  assert.ok(!d.dead && d.shieldAmt > 0, "объятия сработали и дали щит");
  assert.ok(buffs(d.id).some((f) => f.k === "shield" && f.ms > 4000), "картинка щита на 5 с");
  assert.ok(auraOf(d, w, "shield"), "и значок в списке");
}
{
  // «Вампирская кровь»: излишек лечения — щит; картинка один раз, а не каждым ударом; потолок 20% не урезает чужой большой щит
  const w = mkWorld(), d = mkHero(w, "deathknight", ["dk_vampiric"]), mob = mobFor(w, d);
  mob.unit.hp = mob.unit.maxHp = 1_000_000;
  sent.length = 0;
  w.hit(d, mob, { flat: 4000 });
  w.hit(d, mob, { flat: 4000 });
  w.update(50);
  assert.ok(d.shieldAmt >= 1 && keysOf(d, w).includes("shield"), "излишек лечения стал щитом");
  assert.equal(buffs(d.id).filter((f) => f.k === "shield" && f.ms > 0).length, 1, "картинка щита рисуется один раз");
  const big = Math.round(d.unit.maxHp * 0.9);
  d.shieldAmt = big; d.shieldUntil = w.time + 20_000;
  w.hit(d, mob, { flat: 4000 });
  assert.ok(d.shieldAmt >= big, `потолок урезал больший щит: ${d.shieldAmt} < ${big}`);
}
{
  // свои баффы и пассивки со временем: каждому — значок с остатком времени
  const w = mkWorld(), r = mkHero(w, "ranger", ["hr_steady", "hr_barrage"]);
  for (let i = 0; i < 10; i++) w.update(50);
  assert.ok(!keysOf(r, w).includes("steady"), "только что встал — стойка ещё не набрана");
  for (let i = 0; i < 15; i++) w.update(50);
  const st = auraOf(r, w, "steady");
  assert.ok(st && st.ms === 0 && st.v === 8, "«Стойка стрелка»: бессрочный значок с процентом, пока герой стоит");
  r.unit.x += 20;
  w.update(50);
  assert.ok(!keysOf(r, w).includes("steady"), "шагнул — стойка снята");
  cast(w, r, "hr_barrage");
  const bar = auraOf(r, w, "barrage");
  assert.ok(bar && bar.ms > 3000 && bar.ms <= 3650, "«Ураганный огонь»: значок на время стрельбы");
}
{
  const w = mkWorld(), r = mkHero(w, "reaver", ["rv_massacre"]);
  cast(w, r, "rv_massacre");
  const ms = auraOf(r, w, "massacre");
  assert.ok(ms && ms.ms > 5000 && ms.ms <= 6000, "«Кровавая бойня»: значок со временем");
  sent.length = 0;
  r.stunUntil = w.time + 3000;
  w.update(500);
  assert.ok(!keysOf(r, w).includes("massacre"), "оглушение оборвало вихрь — значок пропал");
  assert.ok(buffs(r.id).some((f) => f.k === "enrage" && f.ms <= 0 && f.s === "rv_massacre"), "и картинка вихря снята (с меткой: вид enrage делят другие умения)");
}
{
  const w = mkWorld(), b = mkHero(w, "bloodweaver", ["bw_blood_circle"]);
  cast(w, b, "bw_blood_circle");
  const bc = auraOf(b, w, "blood_circle");
  assert.ok(bc && bc.ms > 7000 && (bc.v ?? 0) > 0, "«Кровный круг»: лечение со временем у самого Кровотворца");
  const t = mkWorld(), m = mkHero(t, "mage", ["mg_timewarp"]);
  cast(t, m, "mg_timewarp");
  const tw = auraOf(m, t, "timewarp");
  assert.ok(tw && tw.v === 30 && tw.ms > 4000, "«Искажение времени»: значок с прибавкой скорости атаки");
  assert.equal(auraOf(m, t, "haste")?.v, 30, "и общее ускорение");
}
{
  const w = mkWorld(), d = mkHero(w, "deathknight", ["dk_blood_tap"]), mob = mobFor(w, d);
  d.unit.maxHp = 10_000; d.unit.hp = 4000;
  w.hit(mob, d, { flat: 500 });
  const bt = auraOf(d, w, "blood_tap");
  assert.ok(bt && bt.ms > 4000 && (bt.v ?? 0) > 0, "«Пожирание боли»: лечение со временем со значком");
  const t = mkWorld(), p = mkHero(t, "warrior", ["laststand"]), mob2 = mobFor(t, p);
  p.unit.maxHp = 10_000; p.unit.hp = 2500;
  t.hit(mob2, p, { flat: 100 });
  const ls = auraOf(p, t, "laststand");
  assert.ok(ls && ls.v === 20 && ls.ms > 7000, "«Последний рубеж»: значок с процентом снижения урона");
}
{
  // PvP на арене: метки и горение видны на герое-цели
  const w = mkWorld();
  w.pvpActive = true;
  const victim = mkHero(w, "warrior", [], 70, 2);
  victim.unit.maxHp = victim.unit.hp = 1_000_000;
  cast(w, mkHero(w, "ranger", ["hr_mark"]), "hr_mark", victim, 200);
  const hm = auraOf(victim, w, "hunter_mark");
  assert.ok(hm && hm.v === 15 && hm.ms > 9000, "«Метка охотника» на герое-цели");
  cast(w, mkHero(w, "mage", ["mg_bolt", "mg_conduction"]), "mg_bolt", victim);
  assert.equal(auraOf(victim, w, "shock")?.v, 8, "«Шок» от молнии (с «Проводимостью»)");
  cast(w, mkHero(w, "warlock", ["wl_hex"]), "wl_hex", victim, 300);
  assert.equal(auraOf(victim, w, "hex")?.v, 12, "«Проклятие рока»: прибавка урона по цели");
  assert.equal(auraOf(victim, w, "weak")?.v, 10, "и ослабление");
  cast(w, mkHero(w, "deathknight", ["dk_rune_strike", "dk_mortality"], 30), "dk_rune_strike", victim);
  const mo = auraOf(victim, w, "mortality");
  assert.ok(mo && mo.n === 1 && mo.v === 3, "«Знак смерти»: стаки и прибавка урона");
  const mage = mkHero(w, "mage", ["mg_ignite"]);
  w.hit(mage, victim, { flat: 100, skill: true, kind: "fire" });
  assert.ok(keysOf(victim, w).includes("burn"), "«Воспламенение» поджигает героя: значок «Горение»");
  // у метки охотника есть хозяин: умер — значок ушёл
  const hunter = mkHero(w, "ranger", ["hr_mark"]);
  cast(w, hunter, "hr_mark", victim, 200);
  assert.ok(keysOf(victim, w).includes("hunter_mark"));
  hunter.dead = true;
  assert.ok(!keysOf(victim, w).includes("hunter_mark"), "охотник мёртв — метки нет");
}
{
  const w = mkWorld();
  w.pvpActive = true;
  const a = mkHero(w, "warlock", []), b = mkHero(w, "darkranger", []), v = mkHero(w, "warrior", [], 70, 2);
  addDot(w, a, v, "curse", 5, 6, "shadow");
  assert.ok(keysOf(v, w).includes("curse"));
  removeDots(a, v);
  assert.ok(!keysOf(v, w).includes("curse"), "взрыв проклятий снял значок вместе с урон-со-временем");
  addDot(w, a, v, "curse", 5, 6, "shadow");
  addDot(w, b, v, "curse", 5, 10, "shadow");
  removeDots(a, v);
  assert.equal(auraOf(v, w, "curse")?.ms, 10_000, "чужое проклятие держит значок");
  addDot(w, a, v, "bleed", 5, 6, "blood", 3);
  assert.equal(auraOf(v, w, "bleed")?.n, 1);
  endDot(a, v, "bleed");
  assert.ok(!keysOf(v, w).includes("bleed") && v.bleedStacks === 0, "жатва ран снимает значок кровотечения");
}
{
  // полоса щита в рамках: ширина — доля здоровья, левый край — конец здоровья, не помещается — заходит на здоровье справа
  assert.deepEqual(absorbSpan(50, 100, 20), { left: 50, width: 20 });
  assert.deepEqual(absorbSpan(90, 100, 30), { left: 70, width: 30 });
  assert.deepEqual(absorbSpan(10, 100, 250), { left: 0, width: 100 });
  assert.equal(absorbSpan(80, 100, 0), null);
  assert.equal(absorbHtml(50, 100, 20), '<b class="abs" style="left:50%;width:20%"></b>');
  assert.equal(absorbHtml(50, 100, 0), "");
  assert.equal(new Unit().shield, 0, "поле shield есть в состоянии юнита");
}

// ---------- хуки состояния классов: слияние ключей, мёртвые не опрашиваются ----------
registerAuraHook((a, t, aura) => {
  const x = a as { furyN?: number; hookStunMs?: number };
  if (x.furyN) aura("fury", t + 6000, { n: x.furyN });
  if (x.hookStunMs) aura("stun", t + x.hookStunMs);
  aura("invuln", Infinity);
});
const hooked = auraList({ furyN: 4, stunUntil: now + 2500, hookStunMs: 9000 }, now);
assert.deepEqual(hooked, [{ k: "invuln", ms: 0 }, { k: "fury", ms: 6000, n: 4 }, { k: "stun", ms: 9000 }], "хук: бессрочный и со стаками; один ключ из двух источников — остаётся дольше");
assert.deepEqual(auraList({ dead: true, furyN: 4 }, now), [], "мёртвого хуки не опрашиваются");

// ---------- порядок и тексты ----------
assert.ok(auraCompare("shield", "stun") < 0 && auraCompare("stun", "shield") > 0, "бафы раньше дебафов");
assert.ok(auraCompare("stun", "slow") < 0, "внутри вида — порядок data/auras.json");
assert.deepEqual([500, 1000, 1001, 12_000, 59_000, 59_900, 60_000, 90_000, 180_000, 3_599_000, 3_600_000, 7_200_000].map(auraTimeLabel), ["1с", "1с", "2с", "12с", "59с", "1м", "1м", "2м", "3м", "1ч", "1ч", "2ч"], "время в углу значка: секунды, минуты, часы (без «60с» и «60м»)");
assert.deepEqual([12_000, 90_000, 3_600_000].map(auraTimeWords), ["12 с", "2 мин.", "1 ч"]);
assert.equal(auraText("Скорость движения снижена на {v}%.", 30), "Скорость движения снижена на 30%.");
assert.equal(auraText("Периодический урон кровью. Стаков: {n}.", undefined, undefined), "Периодический урон кровью.", "нет стаков — предложения о них нет");
assert.equal(auraText("Периодический урон кровью. Стаков: {n}.", undefined, 3), "Периодический урон кровью. Стаков: 3.");
assert.equal(auraText("Поглощает урон. Осталось поглотить: {v}.", 1234, undefined, (x) => `<${x}>`), "Поглощает урон. Осталось поглотить: <1234>.");

// ---------- data/auras.json: виды, имена, значки, значения ----------
const iconOf = (d: { icon: string }) => path.join(ROOT, "client/public/assets/icons", `${d.icon}.png`);
for (const [k, d] of Object.entries(AURAS)) {
  assert.ok(d.kind === "buff" || d.kind === "debuff", `${k}: kind`);
  assert.match(d.name, /^[А-ЯЁA-Z]/, `${k}: имя с заглавной`);
  assert.ok(!d.name.endsWith("."), `${k}: в имени нет точки`);
  assert.match(d.desc, /^[А-ЯЁA-Z].*\.$/, `${k}: описание с заглавной и точкой`);
  assert.ok(fs.existsSync(iconOf(d)), `${k}: нет значка ${d.icon}.png в client/public/assets/icons`);
}
assert.ok(!("_doc" in AURAS), "служебные ключи не попадают в AURAS");
for (const id of FOOD_IDS) {
  const d = AURAS[foodAuraKey(id)];
  assert.ok(d && d.kind === "buff" && d.name === FOOD[id].name && d.icon === FOOD[id].icon, `еда ${id}: подпись из data/food.json`);
  assert.equal(foodOfAura(foodAuraKey(id)), id);
}
assert.equal(foodOfAura("stun"), undefined);

// каждый ключ реестра и каждый ключ хуков в классах — с подписью; каждая подпись (кроме еды) — у кого-то в источниках; {v} и {n} в тексте — только там, где сервер их шлёт
const used = new Map<string, { n: boolean; v: boolean }>();
const mark = (k: string, n: boolean, v: boolean) => { const u = used.get(k) ?? { n: false, v: false }; used.set(k, { n: u.n || n, v: u.v || v }); };
for (const d of AURA_FIELDS) mark(d.k, !!d.n, !!d.v);
const gameDir = path.join(ROOT, "server/src/game");
for (const f of fs.readdirSync(gameDir).filter((x) => x.endsWith(".ts"))) {
  for (const m of fs.readFileSync(path.join(gameDir, f), "utf8").matchAll(/\baura\(\s*"([a-z_]+)"\s*,([^;]*?)\);/g)) mark(m[1], /\bn:/.test(m[2]), /\bv:/.test(m[2]));
}
for (const [k, u] of used) {
  const d = AURAS[k];
  assert.ok(d, `${k}: источник эффекта есть, подписи в data/auras.json нет`);
  assert.equal(d.desc.includes("{v}"), u.v, `${k}: {v} в тексте ⇔ сервер присылает величину`);
  assert.equal(d.desc.includes("{n}"), u.n, `${k}: {n} в тексте ⇔ сервер присылает стаки`);
}
for (const k of Object.keys(AURAS)) if (!foodOfAura(k)) assert.ok(used.has(k), `${k}: подпись есть, источника эффекта нет`);

console.log("  ok   auras");
