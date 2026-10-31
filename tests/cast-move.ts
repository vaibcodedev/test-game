/**
 * Каст стоя (Гимн, Воскрешение) прерывается движением: WASD или клик по земле снимают каст, герой сразу идёт;
 * Esc (cancelAll) снимает Гимн, и он больше не лечит. Без сети и браузера.
 * Запуск: npx tsx tests/cast-move.ts
 */
import assert from "node:assert/strict";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { castSkill } from "../server/src/game/skills";
import { cancelAll } from "../server/src/game/skillQueue";
import { WorldState } from "../server/src/rooms/schema";
import { generateArenaMap } from "../shared/arena";
import { TILE } from "../shared/constants";

const mkWorld = () => new World(new WorldState(), () => {}, { map: generateArenaMap(), mobs: false, quiet: true });
function cleric(w: World): Player {
  const save = newSave("healer", { x: 15 * TILE, y: 17.5 * TILE }); // арена круглая (2026-10): стены по краю, старая точка 5×8.5 — в стене
  save.level = 40;
  save.skills.cl_hymn = 1;
  const p = new Player("c1", "Клирик", save, () => {});
  w.addPlayer(p);
  p.unit.mp = p.unit.maxMp;
  return p;
}
function hymn(w: World, p: Player) {
  assert.equal(castSkill(w, p, "cl_hymn", p.x, p.y, null), null);
  w.update(50);
  assert.ok(p.castUntil > w.time, "Гимн идёт");
}

// 1. WASD: каст снят, герой сдвинулся
{
  const w = mkWorld(), p = cleric(w), x0 = p.x;
  hymn(w, p);
  p.input.mx = 1;
  for (let i = 0; i < 10; i++) w.update(50);
  assert.equal(p.castUntil, 0, "WASD снимает Гимн");
  assert.ok(p.x > x0 + 10, `герой идёт: ${x0} → ${p.x}`);
  console.log("ok WASD прерывает Гимн");
}
// 2. клик по земле
{
  const w = mkWorld(), p = cleric(w), x0 = p.x;
  hymn(w, p);
  p.moveTo = { x: p.x + 200, y: p.y };
  for (let i = 0; i < 10; i++) w.update(50);
  assert.equal(p.castUntil, 0, "клик по земле снимает Гимн");
  assert.ok(p.x > x0 + 10, "герой идёт к точке");
  console.log("ok клик по земле прерывает Гимн");
}
// 3. Esc: Гимн больше не лечит
{
  const w = mkWorld(), p = cleric(w);
  hymn(w, p);
  let aoe = 0;
  const emit = w.emit.bind(w);
  w.emit = ((e: { t: string; k?: string }) => { if (e.t === "aoe" && e.k === "hymn") aoe++; return emit(e as never); }) as typeof w.emit;
  cancelAll(w, p);
  for (let i = 0; i < 100; i++) w.update(50);
  assert.equal(aoe, 0, "после Esc тиков Гимна нет");
  console.log("ok Esc снимает Гимн");
}
// 4. без движения Гимн доигрывает
{
  const w = mkWorld(), p = cleric(w);
  hymn(w, p);
  for (let i = 0; i < 200 && p.castUntil; i++) w.update(50);
  assert.equal(p.castUntil, 0);
  assert.equal(p.castBreakable, false);
  console.log("ok стоя Гимн доигрывает");
}
