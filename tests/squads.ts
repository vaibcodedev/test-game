/**
 * Отряды на Полях (задача 132, шаг 11; server/src/game/soldiers.ts, data/patrols.json squads): выход из форта по таймеру (не больше max от фракции),
 * без героев рядом спят, во время битвы за знамёна не выходят; 3 бойца и знаменосец, ведёт чемпион; встретив отряд врага — стычка, выжившие
 * возвращаются и уходят за ворота, тела лежат bodyMs; чужих героев бьют только у своей дороги, своих выручают от мобов; Эмберхолл и полоса — вне зоны.
 * Без сервера: мир в памяти, такт 50 мс.
 */
import P from "../data/patrols.json";
import { TILE } from "../shared/constants";
import { TOWN } from "../shared/town";
import { MOBS } from "../shared/mobs";
import { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import type { Squad } from "../server/src/game/soldiers";
import type { ClassId } from "../shared/classes";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) if (!m.faction) w.removeMob(m);
const S = w.soldiers!;
const SQ = P.squads;
let hits: { src: unknown; dst: unknown; v: number }[] = [];
w.onDamage = (src, dst, v) => hits.push({ src, dst, v });
const keep: Player[] = [];
const run = (ms: number, each?: () => boolean | void) => {
  for (let t = 0; t < ms; t += 50) {
    for (const p of keep) p.unit.hp = p.unit.maxHp;
    if (each?.()) return t;
    w.update(50);
  }
  return ms;
};
let uid = 0;
function hero(cls: ClassId, x: number, y: number): Player {
  const save = newSave(cls, { x, y });
  save.level = 90;
  const p = new Player(`h${++uid}`, `Герой${uid}`, save, () => {});
  w.addPlayer(p);
  p.unit.x = x;
  p.unit.y = y;
  keep.push(p);
  return p;
}
const drop = (p: Player) => { w.removePlayer(p.id); keep.splice(keep.indexOf(p), 1); };
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const of = (f: string) => S.squads.filter((q) => q.faction === f);
const clear = () => { for (const q of [...S.squads]) for (const g of [...q.group]) (S as unknown as { dropMember(m: Mob): void }).dropMember(g); };
const live = (q: Squad) => q.group.filter((g) => !g.dead);
/** Сопровождающий (team ≠ 0: не враг никому) держится у ведущего — будит отряд. */
function escort(q: Squad) {
  const e = hero("warrior", q.route[0].x, q.route[0].y);
  e.team = 1;
  return () => { const l = live(q)[0]; if (l) { e.unit.x = l.x; e.unit.y = l.y + 40; } };
}

// ---------- 1. выход по таймеру, сон, предел ----------
check("до firstMin отрядов нет", run(SQ.firstMin * 60000 - 1000) > 0 && S.squads.length === 0);
run(2000);
check("через firstMin — по отряду от фракции", of("solgard").length === 1 && of("umbrath").length === 1, `${S.squads.length}`);
{
  const q = of("solgard")[0];
  check("в отряде 3 бойца и знаменосец", q.group.length === 4 && q.group.filter((g) => (g.unit.herald ?? "").includes("b")).length === 1);
  check("ведёт чемпион", q.group[0].soldier!.power === "champion");
  check("дорога от форта, не у Эмберхолла", q.route.length > 1 && q.route.every((p) => !S.inEmber(p.x, p.y)) && d(q.route[0], { x: 392 * TILE, y: 180 * TILE }) < 20 * TILE);
}
run(60000);
check("без героев отряд спит у ворот", S.squads.every((q) => q.group.every((g) => d(g, q.route[0]) < 2)));
run(SQ.intervalMin * 60000);
check("через intervalMin — второй отряд", of("solgard").length === 2 && of("umbrath").length === 2);
run(SQ.intervalMin * 60000 + 1000);
check(`на Полях не больше ${SQ.max} отрядов от фракции`, of("solgard").length === SQ.max && of("umbrath").length === SQ.max);
check("всего бойцов отрядов не больше 16", S.squads.reduce((a, q) => a + q.group.length, 0) <= 16);

// ---------- 2. битва за знамёна ----------
clear();
S.bannerBattle = true;
S.squadAt.solgard = S.squadAt.umbrath = 0;
run(1000);
check("во время битвы за знамёна не выходят", S.squads.length === 0);
S.bannerBattle = false;
run(1000);
check("после битвы выходят", of("solgard").length === 1 && of("umbrath").length === 1);
clear();
S.squadAt.solgard = S.squadAt.umbrath = 1e12;

// ---------- 3. Эмберхолл ----------
check("Эмберхолл и полоса — не зона отряда", S.inEmber(TOWN.x * TILE, TOWN.y * TILE) && S.inEmber((TOWN.x - 34) * TILE, (TOWN.y + 25) * TILE));
{
  const q = S.spawnSquad("solgard", "north")!;
  const end = q.route[q.route.length - 1];
  check("дорога к северу кончается до полосы Эмберхолла", !!q && !S.inEmber(end.x, end.y));
  clear();
}

// ---------- 4. герои у дороги ----------
{
  const q = S.spawnSquad("solgard", "center")!;
  const tick = escort(q);
  const lead = q.group[0];
  // враг далеко от дороги — не трогают
  const far = hero("deathknight", q.route[1].x, q.route[1].y + (SQ.zone + 6) * TILE);
  hits = [];
  run(25000, tick);
  check("чужого героя вдали от дороги не бьют", hits.filter((h) => h.dst === far && q.group.includes(h.src as Mob)).length === 0 && !q.group.some((g) => g.soldier!.foe === far));
  drop(far);
  // враг у дороги рядом с отрядом — бьют
  const foe = hero("deathknight", lead.x + 120, lead.y);
  hits = [];
  run(6000, tick);
  check("чужого героя у дороги бьют", hits.some((h) => h.dst === foe && q.group.includes(h.src as Mob)));
  drop(foe);
  run(8000, tick);
  // свой герой у дороги, на него напал моб — выручают
  const own = hero("warrior", lead.x + 90, lead.y);
  const mob = w.addMob(new Mob("tm1", MOBS.wolf, 85, { x: own.x + 50, y: own.y }));
  mob.state = "chase";
  mob.targetId = own.id;
  mob.unit.target = own.id;
  const hp0 = mob.unit.maxHp;
  run(5000, () => { tick(); mob.unit.target = own.id; });
  check("своего героя выручают от моба", q.group.some((g) => g.soldier!.mobFoe === mob) || mob.dead || mob.unit.hp < hp0, `${mob.unit.hp}/${hp0}`);
  w.removeMob(mob);
  drop(own);
  for (const p of [...keep]) drop(p);
  clear();
}

// ---------- 5. стычка отрядов, возврат, тела ----------
{
  const a = S.spawnSquad("solgard", "center")!, b = S.spawnSquad("umbrath", "center")!;
  const ta = escort(a), tb = escort(b);
  hits = [];
  const clashAt = run(300000, () => { ta(); tb(); return a.clashed || b.clashed; });
  check("отряды сходятся у центра", a.clashed || b.clashed, `${Math.round(clashAt / 1000)} с, ${Math.round(d(a.group[0], b.group[0]) / TILE)} тайлов`);
  let firstDead = -1;
  const fight = run(60000, () => {
    ta(); tb();
    if (firstDead < 0 && [...a.group, ...b.group].some((g) => g.dead)) firstDead = w.time;
    return a.phase === "back" && b.phase === "back" && !a.clashed && !b.clashed;
  });
  check("стычка короткая, ранены бойцы с обеих сторон", fight < 60000 && [a, b].every((q) => q.group.some((g) => g.dead || g.unit.hp < g.unit.maxHp)), `${Math.round(fight / 1000)} с`);
  check("после стычки выжившие идут домой", a.phase === "back" && b.phase === "back");
  const bodies = [...a.group, ...b.group].filter((g) => g.dead);
  check("в стычке есть павшие, тела лежат", bodies.length > 0 && bodies.every((g) => w.mobs.get(g.id) === g), `${bodies.length}`);
  run(Math.max(0, firstDead + SQ.bodyMs - 2000 - w.time), () => { ta(); tb(); });
  check("тело лежит почти bodyMs", bodies.some((g) => w.mobs.get(g.id) === g));
  const home = run(400000, () => { ta(); tb(); return !S.squads.length; });
  check("тела убраны через bodyMs, выжившие ушли в форт", S.squads.length === 0 && bodies.every((g) => !w.mobs.has(g.id)) && !S.list.some((m) => m.soldier!.squad), `${Math.round(home / 1000)} с`);
}

console.log(bad ? `\n${bad} FAIL` : "\nвсё ok");
process.exit(bad ? 1 : 0);
