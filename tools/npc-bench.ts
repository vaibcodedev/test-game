/**
 * Замер такта сервера с толпой NPC (ИИ жителей и мобов, docs/plan/next.md 3.7): мир в памяти, такт 50 мс.
 * Герои: в Эмберхолле, в каждой столице и в поле; вокруг героя в поле — толпа мобов (extra), гонятся за ним.
 * Сценарии: «пусто» (героев нет — всё спит) и «герои» (жители и толпа думают). Выход — JSON в stdout и tools/out/npcai/bench-<label>.json.
 * Запуск: npx tsx tools/npc-bench.ts --label=before [--extra=140] [--ticks=600]
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { TILE } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { MOBS } from "../shared/mobs";
import { walkable } from "../shared/map";
import { TOWN } from "../shared/town";
import { WorldState } from "../server/src/rooms/schema";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const LABEL = arg("label") ?? "run", EXTRA = Number(arg("extra") ?? 140), TICKS = Number(arg("ticks") ?? 600);

/** --dir=gamebefore — замер кода из server/src/<dir> (копия «до» для честного сравнения в одном прогоне). */
const DIR = arg("dir") ?? "game";
const { World } = await import(`../server/src/${DIR}/World.ts`);
const { Mob } = await import(`../server/src/${DIR}/Mob.ts`);
const { Player, newSave } = await import(`../server/src/${DIR}/Player.ts`);
type Player = InstanceType<typeof Player>;
const w = new World(new WorldState(), () => {});
const heroes: Player[] = [];
let uid = 0;
const hero = (x: number, y: number) => {
  const p = new Player(`b${++uid}`, `Замер${uid}`, newSave("warrior", { x, y }), () => {});
  w.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  heroes.push(p);
  return p;
};
const tick = (n: number) => {
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const p of heroes) { p.unit.hp = p.unit.maxHp; }
    const s = performance.now();
    w.update(50);
    ts.push(performance.now() - s);
  }
  ts.sort((a, b) => a - b);
  return { avg: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(3), p95: +ts[Math.floor(n * 0.95)].toFixed(3), max: +ts[n - 1].toFixed(3) };
};

// 1) пустой мир: никого из героев
tick(100);
const empty = tick(TICKS);

// 2) герои в городах и в поле, толпа мобов вокруг героя в поле
hero((TOWN.x + 0.5) * TILE, (TOWN.y + 3.5) * TILE);
for (const c of CITIES.filter((c) => c.capital && !c.fort)) hero((c.x + 0.5) * TILE, (c.y + 3.5) * TILE);
const def = Object.values(MOBS).find((d) => !d.boss && !d.raid && d.speed > 0)!;
let field: { x: number; y: number } | null = null;
for (let ty = 60; ty < w.map.h - 60 && !field; ty += 7) for (let tx = 60; tx < w.map.w - 60 && !field; tx += 7) {
  const x = tx * TILE + 16, y = ty * TILE + 16;
  if (w.inTown(x, y)) continue;
  let ok = true;
  for (let a = 0; a < 16 && ok; a++) ok = walkable(w.map, x + Math.cos(a) * 260, y + Math.sin(a) * 260, 12) && walkable(w.map, x + Math.cos(a) * 130, y + Math.sin(a) * 130, 12);
  if (ok) field = { x, y };
}
const fh = hero(field!.x, field!.y);
for (let i = 0; i < EXTRA; i++) {
  const a = (i / EXTRA) * Math.PI * 2 * 3, r = 140 + (i % 5) * 25;
  w.addMob(new Mob(`bench${i}`, def, 5, { x: fh.x + Math.cos(a) * r, y: fh.y + Math.sin(a) * r }));
}
tick(100);
const busy = tick(TICKS);
const folk = w.town?.folk.length ?? 0;
const soldiers = [...w.mobs.values()].filter((m: { soldier: unknown }) => m.soldier).length;
const res = { label: LABEL, folk, soldiers, extraMobs: EXTRA, npcTotal: folk + soldiers + EXTRA, mobsTotal: w.mobs.size, empty, busy };
console.log(JSON.stringify(res));
const out = path.resolve("tools/out/npcai");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `bench-${LABEL}.json`), JSON.stringify(res, null, 2));
process.exit(0);
