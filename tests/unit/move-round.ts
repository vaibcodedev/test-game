/**
 * Округление координат после шага (shared/map.ts roundPos): Math.round(x * 10) / 10 мог сдвинуть точку на ≤ 0,05 px за кромку стены
 * (x + r ровно на границе клетки) — юнит вставал в непроходимую точку и застревал: вдоль стены дальше не скользил.
 * У жителей починено раньше (townfolk.ts, 2026-10-30); здесь — игроки (ввод, шаг к точке, страх), мобы, питомцы, бойцы фракций, таран осады.
 * Запуск: npx tsx tests/unit/move-round.ts
 */
import fs from "node:fs";
import { assert, done, section, test } from "./lib";
import { world, hero, drop } from "./fixtures";
import { Mob } from "../../server/src/game/Mob";
import { Pet, petStep } from "../../server/src/game/Pet";
import { Soldiers } from "../../server/src/game/soldiers";
import { roundPos, walkable } from "../../shared/map";
import { PLAYER_RADIUS, TILE } from "../../shared/constants";
import { MOBS, MOB_AI } from "../../shared/mobs";
import { PETS } from "../../shared/pets";
import { GP } from "../../shared/gameplay";

const w = world();
const M = w.map;
const old = (v: number) => Math.round(v * 10) / 10;

/** Кромка стены справа от юнита радиуса r: e = левая граница стены − r; t — проходимая точка, которую старое округление сдвигало в e. */
function edge(r: number) {
  for (let cy = 8; cy < M.h - 8; cy++) for (let cx = 8; cx < M.w - 8; cx++) {
    const y = cy * TILE + 16, e = cx * TILE - r, t = e - 0.01;
    if (walkable(M, old(t), y, r) || !walkable(M, t, y, r) || walkable(M, e, y, r)) continue;
    // стена тянется вниз, слева от неё свободно на 40 px (скольжение вдоль стены), не город (там мобы не ходят)
    let ok = true;
    for (let k = 0; k <= 40 && ok; k += 2) ok = walkable(M, t, y + k, r) && walkable(M, t - 30, y + k, r) && !walkable(M, e + 0.5, y + k, r);
    if (!ok || (w as never as { inTown(x: number, y: number): boolean }).inTown(t, y + 20)) continue;
    return { t, e, y };
  }
  throw new Error(`нет кромки для r=${r}`);
}
/** После шага к кромке: точка проходима, и вдоль стены (вниз) юнит уходит, а не стоит. */
function check(name: string, pos: () => { x: number; y: number }, r: number, y0: number, slide: (i: number) => void) {
  const p = pos();
  assert.ok(walkable(M, p.x, p.y, r), `${name}: после шага встал в стену (${p.x}, ${p.y}), r=${r}`);
  for (let i = 0; i < 40; i++) slide(i);
  const q = pos();
  assert.ok(walkable(M, q.x, q.y, r), `${name}: прошёл в стену (${q.x}, ${q.y})`);
  assert.ok(q.y > y0 + 5, `${name}: застрял у кромки (${q.x}, ${q.y}), y0=${y0}`);
}

section("игрок");
await test("ввод (WASD): шаг в стену у кромки не ставит в стену, вдоль стены скользит", () => {
  const { t, y } = edge(PLAYER_RADIUS);
  const p = hero(w, "warrior", { x: t, y });
  try {
    p.input.mx = 1; p.input.my = 0;
    w.updatePlayer(p, 0.02);
    check("ввод", () => p.unit, PLAYER_RADIUS, y, () => { p.input.mx = 1; p.input.my = 1; w.updatePlayer(p, 0.02); });
  } finally { drop(w, p); }
});
await test("шаг к точке (клик, stepToward): цель у кромки — встаёт в неё, не в стену", () => {
  const { t, y } = edge(PLAYER_RADIUS);
  const p = hero(w, "warrior", { x: t - 3, y });
  try {
    for (let i = 0; i < 5; i++) w.stepToward(p, t, y, 0.05, 0);
    check("stepToward", () => p.unit, PLAYER_RADIUS, y, () => w.stepToward(p, t, y + 60, 0.05, 0));
  } finally { drop(w, p); }
});

section("моб");
const plainDef = Object.values(MOBS).find((d) => !d.boss && !MOB_AI[d.id]?.weak)!;
await test("moveMob: цель у кромки — моб не встаёт в стену и идёт вдоль неё", () => {
  const r = Math.min(12, plainDef.radius * 0.6);
  const { t, y } = edge(r);
  const m = new Mob(w.uid("m"), plainDef, 30, { x: t - 3, y });
  w.addMob(m);
  m.unit.x = t - 3; m.unit.y = y;
  const mv = (gx: number, gy: number) => (w as never as { moveMob(m: Mob, gx: number, gy: number, dt: number, s: number, st?: number): boolean }).moveMob(m, gx, gy, 0.05, 200, 0);
  try {
    for (let i = 0; i < 5; i++) mv(t, y);
    check("moveMob", () => m.unit, r, y, () => mv(t, y + 60));
  } finally { w.mobs.delete(m.id); }
});

section("питомец");
await test("шаг питомца: цель у кромки — не встаёт в стену и идёт вдоль неё", () => {
  const r = GP.misc.petMoveRadius;
  const { t, y } = edge(r);
  const p = hero(w, "warrior", { x: t - 60, y });
  const pet = new Pet(Object.values(PETS)[0], p, 10);
  pet.unit.x = t - 3; pet.unit.y = y;
  try {
    for (let i = 0; i < 5; i++) petStep(w, pet, t, y, 0.05, 200, 0);
    check("питомец", () => pet.unit, r, y, () => petStep(w, pet, t, y + 60, 0.05, 200, 0));
  } finally { drop(w, p); }
});

section("боец фракции");
await test("Soldiers.move: цель у кромки — не встаёт в стену и идёт вдоль неё", () => {
  const r = Math.min(12, plainDef.radius * 0.6);
  const { t, y } = edge(r);
  const m = new Mob(w.uid("m"), plainDef, 30, { x: t - 3, y });
  m.unit.x = t - 3; m.unit.y = y;
  m.soldier = { px: t - 3, py: y, wx: t - 3, wy: y, syncAt: 0, foe: null, mobFoe: null } as never;
  // в тестовом мире (mobs: false) бойцов нет; конструктор расставил бы их всех — берём только шаг move() с этим миром
  const S = Object.assign(Object.create(Soldiers.prototype), { w }) as { move(m: Mob, gx: number, gy: number, dt: number, s: number, st?: number): boolean };
  for (let i = 0; i < 5; i++) S.move(m, t, y, 0.05, 200, 0);
  check("боец", () => ({ x: m.soldier!.px, y: m.soldier!.py }), r, y, () => S.move(m, t, y + 60, 0.05, 200, 0));
});

section("общая функция и таран осады");
await test("roundPos: точка у кромки не уходит в стену; проверка проходимости (ворота) задаётся снаружи", () => {
  const r = PLAYER_RADIUS, { t, e, y } = edge(r);
  assert.ok(!walkable(M, old(t), y, r), "старое округление уводило в стену");
  const q = roundPos(M, t - 3, y, { x: t, y }, r);
  assert.ok(walkable(M, q.x, q.y, r) && q.x < e, `roundPos: (${q.x}, ${q.y})`);
  assert.equal(Math.round(q.x * 10), q.x * 10, "округлено до 0,1");
  // своя проверка (закрытые ворота): точку, которую она запрещает, roundPos не выбирает
  const q2 = roundPos(M, t - 3, y, { x: t - 1.04, y }, r, (x) => x < t - 1.04);
  assert.ok(q2.x < t - 1.04, `ok-предикат не учтён: ${q2.x}`);
});
await test("World.place, таран осады и все шаги в коде: без голого Math.round(n.x * 10) / 10", () => {
  const files = ["server/src/game/World.ts", "server/src/game/Pet.ts", "server/src/game/soldiers.ts", "server/src/game/siege.ts", "server/src/game/townfolk.ts"];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Math\.round\(n\.[xy] \* 10\) \/ 10/, `${f}: округление шага без roundPos`);
  assert.match(fs.readFileSync("server/src/game/siege.ts", "utf8"), /this\.w\.place\(/, "таран: не через World.place");
  const { t, y } = edge(10);
  const q = w.place(t - 3, y, { x: t, y }, 10, "ember");
  assert.ok(walkable(M, q.x, q.y, 10), `World.place: (${q.x}, ${q.y})`);
});

done();
