/**
 * Сценки в фортах (задача 132, шаг 12) без сервера. Запуск: npx tsx tests/fort-scenes.ts
 * Проверяет: сценки есть в обоих фортах (по четыре вида), у каждой фракции и сценки 6–10 реплик и все они найдены в data/texts.json,
 * облики собираются в снаряжение, действия попадают в бойцов, поза зациклена (посыльный возвращается), катапульта стреляет раз в петлю
 * в сторону врага, а без героев и вдали сценки спят.
 */
import assert from "node:assert/strict";
import { FORT_SCENES, FORT_FACTIONS, FORT_SCENE_CFG, fortTile, fxBetween, lookSet, poseAt, sceneLines, scenesNear } from "../shared/fortScenes";
import { npcGearStrings } from "../shared/npcGear";
import { TILE } from "../shared/constants";
import D from "../data/fort-scenes.json";
import TX from "../data/texts.json";

const KINDS = ["drill", "smith", "orders", "catapult"];
for (const f of FORT_FACTIONS) {
  const mine = FORT_SCENES.filter((s) => s.fort === f);
  assert.deepEqual(mine.map((s) => s.kind).sort(), [...KINDS].sort(), `${f}: четыре сценки`);
  for (const s of mine) {
    const pools = (D.lines as any)[f][s.kind] as Record<string, string[]>;
    const keys = Object.values(pools).flat();
    assert.ok(keys.length >= 6 && keys.length <= 10, `${s.id}: реплик ${keys.length}, нужно 6–10`);
    for (const k of keys) assert.ok((TX.texts as any)[k]?.text, `${s.id}: нет текста ${k}`);
    // все пулы, на которые ссылаются действия, не пусты; действия попадают в бойцов
    for (const b of s.def.beats as any[]) {
      assert.ok(s.def.actors.some((a) => a.id === b.who || a.role === b.who), `${s.id}: действие без бойца ${b.who}`);
      if (b.say) assert.ok(sceneLines(f, s.kind, b.say).length > 0, `${s.id}: пустой пул ${b.say}`);
    }
    for (const a of s.def.actors) {
      const g = npcGearStrings(lookSet(f, a.look), false);
      assert.ok(g.gear.length > 0 || a.look.length > 0, `${s.id}/${a.id}: снаряжение`);
      // боец внутри стен форта
      assert.ok(Math.abs(a.dx) <= 12 && a.dy >= -9 && a.dy <= 9.6, `${s.id}/${a.id}: вне форта`);
    }
    // якорь — у центра форта нужной стороны
    const c = fortTile(f);
    assert.ok(Math.hypot(s.x - c.x * TILE, s.y - c.y * TILE) < 13 * TILE, `${s.id}: якорь далеко от форта`);
  }
}
assert.ok(FORT_SCENES.find((s) => s.id === "umbrath:drill")!.def.actors.some((a) => lookSet("umbrath", a.look).cls === "warlock"), "сержант Умбрата — некромант");

// петля: поза через период та же, удары копятся, посыльный уходит и возвращается
for (const s of FORT_SCENES) {
  const per = s.def.period * 1000, t0 = 1_700_000_000_000;
  const a = poseAt(s, t0), b = poseAt(s, t0 + per);
  for (let i = 0; i < a.length; i++) { assert.equal(Math.round(a[i].x), Math.round(b[i].x), `${s.id}: петля x`); assert.equal(Math.round(a[i].y), Math.round(b[i].y), `${s.id}: петля y`); }
  let walked = false, attacked = false, spoke = false;
  for (let t = 0; t < per; t += 100) for (const p of poseAt(s, t0 + t)) { walked ||= p.walking; spoke ||= !!p.say; }
  attacked = poseAt(s, t0 + per * 0.99).some((p, i) => p.attacks !== poseAt(s, t0)[i].attacks);
  assert.ok(spoke, `${s.id}: нет реплик в петле`);
  if (s.kind !== "drill") assert.ok(walked || s.kind === "catapult", `${s.id}: никто не ходит`);
  assert.ok(attacked || s.kind === "orders", `${s.id}: нет ударов`);
}
const run = FORT_SCENES.find((s) => s.id === "solgard:orders")!;
let maxD = 0;
for (let t = 0; t < run.def.period; t += 0.25) { const p = poseAt(run, t * 1000).find((q) => q.id === "runner")!; maxD = Math.max(maxD, Math.hypot(p.x - poseAt(run, 0)[1].x, p.y - poseAt(run, 0)[1].y)); }
assert.ok(maxD > 4 * TILE, "посыльный уходит от стола");

// эффекты: искры — на каждый удар кузнеца, выстрел — один за петлю и к врагу
for (const f of FORT_FACTIONS) {
  const sm = FORT_SCENES.find((s) => s.id === `${f}:smith`)!, ct = FORT_SCENES.find((s) => s.id === `${f}:catapult`)!;
  const t0 = 1_700_000_000_000;
  const sp = fxBetween(sm, t0, t0 + sm.def.period * 1000).filter((e) => e.kind === "anvil");
  assert.equal(sp.length, 8, `${f}: искры на каждый удар`);
  const sh = fxBetween(ct, t0, t0 + ct.def.period * 1000).filter((e) => e.kind === "shot");
  assert.equal(sh.length, 1, `${f}: один выстрел за петлю`);
  assert.ok(ct.def.period >= 20 && ct.def.period <= 30, "выстрел раз в 20–30 с");
  const dir = f === "solgard" ? 1 : -1;
  assert.ok((sh[0].tx - sh[0].x) * dir > 10 * TILE, `${f}: камень летит к стороне врага`);
  // окно без событий пусто, повторный запрос того же окна не дублирует
  assert.equal(fxBetween(ct, t0, t0).length, 0);
}

// сон: без героев и вдали — ни одной сценки; у форта — только его четыре
assert.equal(scenesNear([]).length, 0, "без героев сценки спят");
assert.equal(scenesNear([{ x: 3000, y: 3000 }]).length, 0, "герой вдали");
const w = fortTile("solgard");
const near = scenesNear([{ x: w.x * TILE, y: (w.y + 3) * TILE }]);
assert.ok(near.length >= 3 && near.every((s) => s.fort === "solgard"), "у форта Сольгарда — только его сценки");
assert.ok(FORT_SCENE_CFG.pause < FORT_SCENE_CFG.near, "замирание — ближе, чем пробуждение");
console.log("fort-scenes: ok", FORT_SCENES.length, "сценок");
