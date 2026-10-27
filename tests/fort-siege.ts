/**
 * Осада форта без браузера (задача 132, шаг 15; server/src/game/siege.ts, shared/siege.ts, data/siege.json): раскладка (ворота, лагерь,
 * машины и круг знамени проходимы, путь тарана есть), выбор нападающих и ничья (обычная битва вместо осады), ворота открыты своим и
 * закрыты чужим (шаг героя, моб фракции, проскок рывком — откат), урон героя по воротам и неуязвимость вне осады, таран с эскортом и без,
 * камнемёт с экипажем, пролом, знамя двора по правилам Сердца (без пролома не вывесить), победа нападающих (знамя, Знаки, титул, бонус недели),
 * победа обороны (ворота устояли; время вышло), починка ворот после итогов, возрождение в лагере осады. Мир в памяти.
 */
import D from "../data/siege.json";
import { TILE, PLAYER_RADIUS } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { walkable, zoneAtPx, Zone } from "../shared/map";
import { findPath } from "../shared/path";
import { nextWarStart, raiseSec, WAR, weekKey } from "../shared/bannerWar";
import { GATE_BROKEN, GATES, gateBlocks, nextSiegeStart, siegeAttacker, siegeBannerAt } from "../shared/siege";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import type { ClassId } from "../shared/classes";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const w = new World(new WorldState(), () => {}, { quiet: true });
for (const m of [...w.mobs.values()]) if (!m.siege) w.removeMob(m); // мобы и стража не мешают проверкам
w.soldiers = null;
const war = w.war!, siege = w.siege!;
const day = (dow: number, h: number, mi = 0) => { const d = new Date(2026, 9, 1, h, mi); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return d.getTime(); };
let T0 = day(3, 12);
war.now = () => T0 + w.time + war.offset;
war.saved.week = "";

// ---------- 1. раскладка ----------
const forts = ["fort_solgard", "fort_umbrath"];
check("у каждого форта и столицы — северные и южные ворота", GATES.length === 8 && forts.every((f) => GATES.filter((g) => g.city === f && g.siege).length === 2));
for (const f of forts) {
  const c = CITIES.find((x) => x.id === f)!, gs = GATES.filter((g) => g.city === f);
  const camp = (() => { const g = gs.find((x) => x.side === D.ram.gate)!; return { x: g.x + D.ram.camp[0] * TILE, y: g.y + D.ram.camp[1] * TILE }; })();
  const rg = gs.find((x) => x.side === D.ram.gate)!;
  const spots = D.catapults.spots.map((s) => { const g = gs.find((x) => x.side === s.gate)!; return { x: g.x + s.dx * TILE, y: g.y + s.dy * TILE }; });
  check(`${f}: проём ворот проходим по карте, перед воротами — земля`, gs.every((g) => walkable(w.map, g.x, g.y, 10) && walkable(w.map, g.ox, g.oy, 10)));
  check(`${f}: лагерь осады и камнемёты на проходимой земле вне стен`, [camp, ...spots].every((p) => walkable(w.map, p.x, p.y, 14) && Math.abs(p.y - c.y * TILE) > 11 * TILE));
  check(`${f}: тарану есть путь от лагеря к воротам`, !!findPath(w.map, camp.x, camp.y, rg.ox, rg.oy, 10));
  const at = siegeBannerAt(f);
  let blocked = 0;
  for (let dy = -D.banner.radius; dy <= D.banner.radius; dy++) for (let dx = -D.banner.radius; dx <= D.banner.radius; dx++) if (dx * dx + dy * dy <= D.banner.radius ** 2 && !walkable(w.map, at.x + dx * TILE, at.y + dy * TILE, 8)) blocked++;
  check(`${f}: круг королевского знамени во дворе проходим`, blocked === 0, `${blocked} клеток`);
}

// ---------- 2. расписание и нападающие ----------
{
  check("нападает фракция с большим числом побед", siegeAttacker([3, 1]) === "solgard" && siegeAttacker([1, 4]) === "umbrath");
  check("поровну — осады нет", siegeAttacker([2, 2]) === null);
  const sun = day(0, 19);
  check("осада — по воскресеньям в 20:00", new Date(nextSiegeStart(day(3, 12))).getDay() === 0 && new Date(nextSiegeStart(day(3, 12))).getHours() === 20);
  check("есть нападающий: воскресная битва в 20:00 уступает осаде", new Date(nextWarStart(sun, true)).getDay() === 1 && new Date(nextWarStart(sun, false)).getHours() === 20 && new Date(nextWarStart(sun, false)).getDay() === 0);
}

// ---------- герои ----------
const SOL: ClassId[] = ["warrior", "healer", "ranger", "mage", "rogue"], UMB: ClassId[] = ["deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];
let uid = 0;
const all: Player[] = [];
function hero(f: "solgard" | "umbrath", x: number, y: number): Player {
  const save = newSave((f === "solgard" ? SOL : UMB)[uid % 5], { x, y });
  save.level = 90; save.faction = f;
  const p = new Player(`h${++uid}`, `${f === "solgard" ? "Сол" : "Умб"}${uid}`, save, () => {});
  w.addPlayer(p, "");
  p.unit.x = x; p.unit.y = y;
  all.push(p);
  return p;
}
const park = (p: Player, i = 0) => { p.unit.x = (100 + i) * TILE; p.unit.y = 20 * TILE; p.input = { mx: 0, my: 0 }; };
const place = (p: Player, x: number, y: number) => { p.unit.x = x; p.unit.y = y; (siege as unknown as { prev: Map<string, unknown> }).prev.delete(p.id); };
function run(ms: number, until?: () => boolean): number {
  for (let t = 0; t < ms; t += 250) {
    for (const p of all) { p.inputAt = w.time; p.unit.hp = p.unit.maxHp; if (p.dead) { p.dead = false; p.unit.anim = 0; } }
    w.update(250);
    if (until?.()) return t + 250;
  }
  return ms;
}

// ---------- 3. ворота: своим открыты, чужим закрыты ----------
const UF = GATES.find((g) => g.city === "fort_umbrath" && g.side === "s")!;
{
  const own = hero("umbrath", UF.x, UF.y + 3 * TILE), foe = hero("solgard", UF.x + 4, UF.y + 3 * TILE);
  for (const p of [own, foe]) p.input = { mx: 0, my: -1 };
  run(3000);
  check("свой герой проходит ворота внутрь форта", own.y < UF.y0 - 8, `y ${Math.round(own.y)} vs ${UF.y0}`);
  check("чужой герой упирается в закрытые ворота", foe.y > UF.y1, `y ${Math.round(foe.y)} vs ${UF.y1}`);
  check("стража и отряды фракции ворот проходят (шаг моба той же фракции)", !gateBlocks(UF.x, UF.y, 10, "umbrath") && gateBlocks(UF.x, UF.y, 10, "solgard") && gateBlocks(UF.x, UF.y, 10, ""));
  // проскок рывком: из-за ворот внутрь за один такт — откат
  foe.input = { mx: 0, my: 0 };
  run(250);
  const before = { x: foe.x, y: foe.y };
  foe.unit.y = UF.y - 4 * TILE;
  run(250);
  check("рывок сквозь закрытые ворота откатывается", Math.abs(foe.y - before.y) < 1, `y ${Math.round(foe.y)}`);
  check("вне осады у ворот нет цели — неуязвимы", ![...w.mobs.values()].some((m) => m.siege));
  for (const p of [own, foe]) park(p, uid);
}

// ---------- 4. осада: нападает Сольгард на форт Умбрата ----------
war.saved.wins = [3, 1];
siege.debug("start", {});
check("старт осады: нападающие — фракция с большим числом побед", siege.phase === "siege" && siege.att === "solgard" && siege.fort === "fort_umbrath");
check("ворота — цели фракции обороны, машины — нападающих", siege.gates.length === 2 && siege.gates.every((g) => g.mob?.faction === "umbrath") && siege.engines.length === 1 + D.catapults.spots.length && siege.engines.every((e) => e.mob?.faction === "solgard"));
const gS = siege.gates.find((g) => g.def.side === D.ram.gate)!;
{
  const s1 = hero("solgard", gS.def.ox, gS.def.oy + 8), u1 = hero("umbrath", gS.def.x, gS.def.y - 2 * TILE);
  const h0 = gS.mob!.unit.hp;
  w.hit(s1, gS.mob!, { flat: 100000 });
  const dealt = h0 - gS.mob!.unit.hp;
  check("герой нападающих бьёт ворота (урон ×heroMul)", dealt > 0 && dealt <= 100000 * D.gates.heroMul + 1, `${dealt}`);
  check("свои ворота герою обороны не враг", !w.hostile(u1, gS.mob!) && w.hostile(s1, gS.mob!));
  gS.mob!.unit.hp = gS.mob!.unit.maxHp;
  park(s1, 1); park(u1, 2);
}
const ram = siege.engines.find((e) => e.kind === "ram")!;
{
  const r0 = { x: ram.mob!.x, y: ram.mob!.y };
  run(3000);
  check("без эскорта таран стоит", Math.hypot(ram.mob!.x - r0.x, ram.mob!.y - r0.y) < 1);
  const esc = [hero("solgard", r0.x - 30, r0.y), hero("solgard", r0.x + 30, r0.y)];
  const hp0 = gS.mob!.unit.hp;
  const t = run(60000, () => { for (const [i, p] of esc.entries()) place(p, ram.mob!.x + (i ? 30 : -30), ram.mob!.y + 10); return gS.mob!.unit.hp < hp0; });
  check("с эскортом таран доходит до ворот и бьёт", gS.mob!.unit.hp < hp0, `${(t / 1000).toFixed(1)} с, −${(100 * (hp0 - gS.mob!.unit.hp) / gS.mob!.unit.maxHp).toFixed(1)}%`);
  check("удар тарана — hitPct здоровья ворот", Math.abs((hp0 - gS.mob!.unit.hp) / gS.mob!.unit.maxHp - D.ram.hitPct) < 0.002);
  esc.forEach((p, i) => park(p, 3 + i));
}
{
  const cat = siege.engines.find((e) => e.kind === "catapult")!, g = siege.gates.find((x) => x.def.id === cat.gate.id)!;
  const crew = hero("solgard", cat.mob!.x + 20, cat.mob!.y);
  const hp0 = g.mob!.unit.hp;
  run(D.catapults.shotMs + D.catapults.flightMs + 1000, () => g.mob!.unit.hp < hp0);
  check("камнемёт с экипажем попадает в ворота", g.mob!.unit.hp < hp0);
  park(crew, 6);
}
// знамя двора: без пролома не вывесить
const at = siegeBannerAt("fort_umbrath");
const att = [0, 1, 2, 3].map((i) => hero("solgard", at.x + (i - 1.5) * 20, at.y + 10));
{
  run(4000);
  check("без пролома знамя обороны не спустить и своё не вывесить", siege.banner.banner === "umbrath" && siege.banner.h === 1);
  const killer = att[0];
  // разбить таран — вклад обороне
  const u2 = hero("umbrath", ram.mob!.x, ram.mob!.y);
  w.hit(u2, ram.mob!, { flat: ram.mob!.unit.hp * 10 });
  run(500);
  check("разбитый таран вернётся в лагерь", !ram.mob && ram.downUntil > war.now() && siege.contrib.get(u2.name.toLowerCase())!.v > 0);
  park(u2, 7);
  void killer;
}
siege.debug("breach", { gate: D.ram.gate });
run(500);
check("пролом: ворота сломаны, проход всем", gS.broken && GATE_BROKEN.has(gS.def.id) && !gateBlocks(gS.def.x, gS.def.y, 10, "solgard"));
{
  const tLow = run(400000, () => !siege.banner.banner);
  check("после пролома нападающие спускают знамя обороны (как Сердце: ×lowerMul)", !siege.banner.banner && siege.banner.fallen === "umbrath", `${(tLow / 1000).toFixed(0)} с (ожидалось ≈${(raiseSec("heart", 4) * WAR.capture.lowerMul).toFixed(0)})`);
  const tUp = run(400000, () => siege.phase !== "siege");
  check("вывесили и подняли своё — форт взят", siege.phase === "result" && siege.lastResult?.win === "solgard" && siege.lastResult.how === "taken", `${(tUp / 1000).toFixed(0)} с`);
}
{
  const p = att[1];
  check("награда: Знаки Полей за вклад", (p.save.marks ?? 0) > 0, `${p.save.marks}`);
  check("титул «Сокрушитель форта»", !!p.save.titles?.some((t) => t.id === D.reward.title));
  check("неделю знамя Сольгарда над воротами, бонус фракции", war.saved.siege?.flag === "solgard" && war.saved.siege.bonus === "solgard" && war.saved.siege.until > war.now() + 6 * 86400000);
  const mob = { x: 550 * TILE, y: 184 * TILE };
  check("+10% опыта и золота на Полях нападающим, обороне — нет", zoneAtPx(w.map, mob.x, mob.y) === Zone.Fields && Math.abs(war.mobBonus(p, mob).xp - war.mobBonus(hero("umbrath", 0, 0), mob).xp - D.reward.xpGold) < 1e-9);
  check("в итогах пролом пропускает до починки", GATE_BROKEN.has(gS.def.id));
  war.offset += D.schedule.resultSec * 1000 + 1000;
  run(500);
  check("после итогов ворота починены и снова закрыты для чужих", siege.phase === "idle" && GATE_BROKEN.size === 0 && gateBlocks(gS.def.x, gS.def.y, 10, "solgard") && ![...w.mobs.values()].some((m) => m.siege));
}

// ---------- 5. оборона отстояла: ворота целы к breachMin ----------
for (const p of all) park(p, all.indexOf(p));
siege.debug("start", { att: "umbrath" });
check("вторая осада: Умбрат на форт Сольгарда", siege.fort === "fort_solgard" && siege.def === "solgard");
{
  const d1 = hero("solgard", siegeBannerAt("fort_solgard").x, siegeBannerAt("fort_solgard").y);
  run(1000);
  war.offset += D.schedule.breachMin * 60000;
  run(500);
  check("ворота устояли до срока — победа обороны", siege.lastResult?.how === "gates" && siege.lastResult.win === "solgard" && war.saved.siege?.bonus === "solgard" && war.saved.siege.flag === "solgard");
  war.offset += D.schedule.resultSec * 1000 + 1000;
  run(500);
  park(d1, 30);
}
// ---------- 6. пролом есть, знамя не взято — время вышло ----------
siege.debug("start", { att: "umbrath" });
siege.debug("breach", {});
run(500);
{
  const a1 = hero("umbrath", 0, 0);
  a1.unit.x = 400 * TILE; a1.unit.y = 180 * TILE;
  const r = siege.respawnAt(a1), camp = siege.camp();
  check("павший нападающий у форта возрождается в лагере осады", !!r && r.x === camp.x && r.y === camp.y && r.free);
  park(a1, 31);
}
war.offset += D.schedule.durationMin * 60000;
run(500);
check("время вышло — победа обороны", siege.lastResult?.how === "time" && siege.lastResult.win === "solgard");
war.offset += D.schedule.resultSec * 1000 + 1000;
run(500);

// ---------- 7. ничья: обычная битва в воскресенье, без осады ----------
{
  siege.debug("reset", {});
  war.debug("reset", {});
  T0 = day(0, 19, 45) + 7 * 86400000 - w.time - war.offset; // следующее воскресенье, часы только вперёд
  war.saved.week = weekKey(war.now()); // неделя не сменится в середине проверки
  war.saved.wins = [2, 2];
  run(500);
  check("поровну: осады нет, в 20:00 обычная битва", siege.phase === "idle" && war.phase === "prep" && new Date(war.t0).getHours() === 20);
  war.debug("reset", {});
  war.saved.wins = [1, 3];
  run(500);
  check("есть нападающий: в 20:00 осада, битвы нет", siege.phase === "prep" && siege.att === "umbrath" && war.phase === "idle");
}

void PLAYER_RADIUS;
console.log(bad ? `\nСбоев: ${bad}` : "\nОсада форта: всё сходится");
process.exit(bad ? 1 : 0);
