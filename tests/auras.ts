/** Бафы и дебафы в рамке героя (задача 128), без сервера: auraList на заглушке актёра, служебные поля, подпись списка, data/auras.json и значки. Запуск: npx tsx tests/auras.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AURA_FIELDS, auraList, auraPack, registerAuraHook } from "../server/src/game/auras";
import { AURAS, auraCompare, auraText, auraTimeLabel, auraTimeWords, foodAuraKey, foodOfAura } from "../shared/auras";
import { FOOD, FOOD_IDS } from "../shared/food";

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
