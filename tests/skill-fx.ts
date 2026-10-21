/** Анимации умений (задача 127), без сервера и браузера: таблица data/skill-fx.json, каталог листов и пометка fx умением. Запуск: npx tsx tests/skill-fx.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS } from "../shared/skills";
import { knownIds } from "../tools/gen/vfx";
import { World } from "../server/src/game/World";
import { WorldState } from "../server/src/rooms/schema";
import type { Fx } from "../shared/protocol";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data/skill-fx.json"), "utf8")) as Record<string, Record<string, string>>;
const known = knownIds();
const SLOTS = new Set(["cast", "proj", "hit", "aura"]);

// 1) таблица: умение существует и активное, слоты известные, каждый id собирается конвейером
for (const [skill, slots] of Object.entries(table)) {
  assert.ok(SKILLS[skill], `skill-fx: нет умения ${skill}`);
  assert.equal(SKILLS[skill].kind, "active", `skill-fx: ${skill} не активное умение`);
  assert.ok(Object.keys(slots).length > 0, `skill-fx: у ${skill} нет ни одного слота`);
  for (const [slot, id] of Object.entries(slots)) {
    assert.ok(SLOTS.has(slot), `skill-fx: ${skill}: неизвестный слот ${slot}`);
    assert.ok(known.has(id.replace(/@2$/, "")), `skill-fx: ${skill}.${slot}: эффекта ${id} нет в конвейере tools/gen/vfx.ts`);
  }
}
console.log(`ok skill-fx.json: ${Object.keys(table).length} умений, ${known.size} эффектов в конвейере`);

// 2) каталог игры (после npm run assets): листы на месте, размеры целые; свободные эффекты из таблицы обязаны быть собраны
const mf = path.join(ROOT, "client/public/assets/vfx/manifest.json");
if (fs.existsSync(mf)) {
  const cat = JSON.parse(fs.readFileSync(mf, "utf8")) as Record<string, { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; blend: string; r?: 1 }>;
  for (const [id, e] of Object.entries(cat)) {
    const file = path.join(ROOT, "client/public/assets/vfx", e.r ? "r" : "", `${id}.png`);
    assert.ok(fs.existsSync(file), `каталог vfx: нет файла ${id}`);
    const b = fs.readFileSync(file);
    assert.equal(b.readUInt32BE(16), e.frameW * e.frames, `${id}: ширина листа не равна кадру × число кадров`);
    assert.equal(b.readUInt32BE(20), e.frameH, `${id}: высота листа`);
    assert.ok(Number.isInteger(e.frameW) && Number.isInteger(e.frameH) && e.fps > 0 && e.anchor[0] >= 0 && e.anchor[0] <= 1 && e.anchor[1] >= 0 && e.anchor[1] <= 1, `${id}: поля каталога`);
  }
  const missing = [...new Set(Object.values(table).flatMap((s) => Object.values(s)))].filter((id) => !cat[id]);
  console.log(`ok каталог vfx: ${Object.keys(cat).length} листов` + (missing.length ? `; без листа (нет vendor-паков, будут частицы): ${missing.length}` : ""));
} else console.log("каталога vfx ещё нет (npm run assets) — пропуск");

// 3) сервер помечает fx умением и кастером, в том числе в отложенных вызовах; fx вне умений остаются без пометки
const sent: Fx[] = [];
const w = new World(new WorldState(), (type, msg) => { if (type === "fx") sent.push(...(msg as Fx[])); }, { mobs: false });
const priv = w as unknown as { fx: Fx[] };
w.emit({ t: "aoe", k: "fire", x: 1, y: 2, r: 3 });
assert.equal(priv.fx[0].s, undefined, "fx вне умения без пометки");
w.fxSkill = "fireball"; w.fxCaster = "p1";
w.emit({ t: "aoe", k: "fire", x: 1, y: 2, r: 3 });
w.later(0, () => { w.emit({ t: "aoe", k: "fire", x: 5, y: 6, r: 3 }); });
w.fxSkill = null; w.fxCaster = null;
w.emit({ t: "dmg", id: "m1", v: 5 });
assert.equal(priv.fx[1].s, "fireball");
assert.equal(priv.fx[1].c, "p1");
assert.equal(priv.fx[2].s, undefined, "dmg не помечается");
w.update(50);
const delayed = priv.fx.concat(sent).find((f) => f.t === "aoe" && (f as { x: number }).x === 5);
assert.ok(!delayed || (delayed.s === "fireball" && delayed.c === "p1"), "отложенный fx несёт пометку умения");
assert.equal(w.fxSkill, null, "контекст умения снят после таймера");
console.log("ok пометка fx умением");
