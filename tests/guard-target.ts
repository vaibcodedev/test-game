/**
 * Стража городов и удалённые мобы (баг из задачи 133): encounters.ts и bosses.ts убирают моба removeMob без dead —
 * такой моб перестаёт быть целью стражи за 1 такт. Недостижимая цель (моб в непроходимой клетке) не пересчитывается
 * A* каждый такт (кэш неудачи в Nav): такт мира со стражей, гоняющейся за ней, не дороже обычного.
 */
import { performance } from "node:perf_hooks";
import { TILE } from "../shared/constants";
import { CELL_BLOCK } from "../shared/map";
import { MOBS } from "../shared/mobs";
import { Nav, findPath } from "../shared/path";
import { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";
import { WorldState } from "../server/src/rooms/schema";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) w.removeMob(m);
const town = w.town!;
const run = (ms: number) => { for (let t = 0; t < ms; t += 50) w.update(50); };
const guards = town.folk.filter((f) => f.guard);
const foeOf = (m: Mob) => guards.find((g) => g.foe === m);
const def = Object.values(MOBS).find((d) => !d.boss && !d.raid)!;
let nid = 0;
const spawn = (x: number, y: number) => w.addMob(new Mob(`tm${++nid}`, def, 5, { x, y }));

// ---------- 1. удалённый моб у стен перестаёт быть целью за 1 такт ----------
const g0 = guards.find((g) => g.post)!;
const m1 = spawn(g0.x, g0.y + 3 * TILE);
run(500);
check("моб у ворот стал целью стражи", !!foeOf(m1));
w.removeMob(m1); // как encounters.ts:149 и bosses.ts:130 — без dead
w.update(50);
check("убранный removeMob моб перестал быть целью за 1 такт", !foeOf(m1), m1.dead ? "dead" : "не dead");
run(1000);
check("и не назначается снова", !foeOf(m1));

// ---------- 2. недостижимая цель: Nav не ищет путь каждый такт ----------
// пруд 5×5 клеток в 5 тайлах от поста наружу, моб — в его середине: стражник доходит до берега, не достаёт моба
// ударом и упирается (раньше — полный A* каждый такт)
const g1 = g0;
const ox = g1.x - (g1.site.x + 0.5) * TILE, oy = g1.y - (g1.site.y + 0.5) * TILE;
const out = Math.abs(ox) > Math.abs(oy) ? { x: Math.sign(ox), y: 0 } : { x: 0, y: Math.sign(oy) || 1 };
const pc = { x: Math.floor(g1.x / TILE) + out.x * 5, y: Math.floor(g1.y / TILE) + out.y * 5 };
for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) w.map.cell[(pc.y + b) * w.map.w + pc.x + a] |= CELL_BLOCK;
const spot: { x: number; y: number } | null = { x: pc.x * TILE + 16, y: pc.y * TILE + 16 };

if (spot) {
  // сам Nav: 200 вызовов к недостижимой цели стоят не больше нескольких A*
  const nav = new Nav();
  let t0 = performance.now();
  findPath(w.map, g1.x, g1.y, spot.x, spot.y, 8);
  const one = performance.now() - t0;
  // встаём в ближайшую к цели клетку: путь найден «в ноль» — неудача
  const near = findPath(w.map, g1.x, g1.y, spot.x, spot.y, 8);
  const at = near?.length ? near[near.length - 1] : { x: g1.x, y: g1.y };
  t0 = performance.now();
  for (let i = 0; i < 200; i++) nav.next(w.map, at.x, at.y, spot.x, spot.y, 8, i * 50);
  const many = performance.now() - t0;
  check("Nav: 200 тактов к недостижимой цели ≈ не больше 12 поисков", many <= one * 12 + 2, `${many.toFixed(1)} мс, один A* ${one.toFixed(2)} мс`);

  // такт мира: со стражей, гоняющейся за недостижимым мобом, — не дороже обычного
  const tick = (n: number) => { const s = performance.now(); for (let i = 0; i < n; i++) w.update(50); return (performance.now() - s) / n; };
  tick(200);
  const base = tick(200);
  const m2 = spawn(spot.x, spot.y);
  run(600);
  check("моб в непроходимой клетке стал целью стражи", !!foeOf(m2));
  run(2000); // стражник дошёл до ближайшей клетки и упёрся
  const busy = tick(200);
  check("такт с недостижимой целью не дороже обычного", busy <= base * 1.5 + 0.3, `${busy.toFixed(3)} мс против ${base.toFixed(3)} мс`);
  w.removeMob(m2);
  w.update(50);
  check("недостижимый моб, убранный removeMob, перестал быть целью", !foeOf(m2));
}

console.log(bad ? `\n${bad} FAIL` : "\nвсё ок");
process.exit(bad ? 1 : 0);
