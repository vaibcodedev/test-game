/**
 * «Знамёна Предела» без браузера (задача 132, шаг 14; server/src/game/bannerWar.ts, data/faction-war.json): раскладка оснований на Полях
 * (зеркало, круги свободны), расписание и машина состояний (prep → battle → result → idle), вывешивание и подъём по перевесу, печать,
 * спор, спуск и срыв, AFK, Сердце (открытие, опора), очки, победа и разгром, награды одной транзакцией (Знаки, сундук, недельный предел,
 * сумка полна), вклад за убийство, телепорт в форт, возрождение, бонусы точек и перезапуск (владельцы из хранилища). Мир в памяти.
 */
import D from "../data/faction-war.json";
import { TILE } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { FORTS } from "../shared/constants";
import { walkable, zoneAtPx, Zone } from "../shared/map";
import { nextWarStart, raiseSec, WAR_BASES, WAR_RADIUS, warBase, weekKey } from "../shared/bannerWar";
import { World } from "../server/src/game/World";
import { BannerWar, type WarSaved, type WarStore } from "../server/src/game/bannerWar";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import type { ClassId } from "../shared/classes";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ---------- 1. раскладка ----------
const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) if (!m.faction) w.removeMob(m);
check("3 фронта по 3 основания (2 боковые и Сердце)", D.fronts.length === 3 && D.fronts.every((f) => f.bases.length === 3 && f.bases.filter((b) => b.kind === "heart").length === 1));
for (const f of D.fronts) {
  const [a, b, h] = f.bases;
  check(`${f.id}: боковые — зеркало (x → 1100 − x), Сердце на оси`, a.x + b.x === 1100 && a.y === b.y && h.x === 550);
}
{
  const badCircles = WAR_BASES.filter((d) => {
    let blocked = 0, total = 0;
    for (let dy = -D.capture.radius; dy <= D.capture.radius; dy++) for (let dx = -D.capture.radius; dx <= D.capture.radius; dx++) {
      if (dx * dx + dy * dy > D.capture.radius ** 2) continue;
      if (dy >= -2 && dy <= 1 && dx >= -3 && dx <= 2) continue; // постамент и его край
      total++;
      if (!walkable(w.map, (d.tx + dx) * TILE, (d.ty + dy) * TILE, 10)) blocked++;
    }
    const objs = w.map.objects.filter((o) => Math.hypot(o.x - d.x, o.y - d.y) < WAR_RADIUS).length;
    return blocked > 0 || objs > 0 || zoneAtPx(w.map, d.x, d.y) !== Zone.Fields;
  }).map((d) => d.id);
  check("круги захвата на Полях, проходимы и без декора", badCircles.length === 0, badCircles.join(", "));
  const open = WAR_BASES.filter((d) => walkable(w.map, d.x, d.y, 4) || walkable(w.map, d.x - TILE, d.y - 10, 4));
  check("постамент непроходим (след под ним)", open.length === 0, open.map((d) => d.id).join(", "));
  const fortGap = Math.min(...WAR_BASES.map((d) => Math.min(Math.hypot(d.tx - FORTS.west.x, d.ty - FORTS.west.y), Math.hypot(d.tx - FORTS.east.x, d.ty - FORTS.east.y))));
  check("основания не ближе 40 тайлов к фортам", fortGap >= 40, `${fortGap.toFixed(1)}`);
}

// ---------- 2. расписание ----------
const day = (dow: number, h: number, mi = 0) => { const d = new Date(2026, 9, 1, h, mi); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return d.getTime(); };
{
  const wed = day(3, 19), sat = day(6, 10), satEve = day(6, 16), sun = day(0, 21);
  check("будни: «Час войны» в 20:00", new Date(nextWarStart(wed)).getHours() === 20);
  check("суббота: ещё в 15:00", new Date(nextWarStart(sat)).getHours() === 15 && new Date(nextWarStart(satEve)).getHours() === 20);
  check("после воскресной битвы — понедельник 20:00", new Date(nextWarStart(sun)).getDay() === 1 && new Date(nextWarStart(sun)).getHours() === 20);
  check("подъём боковой: соло 90 с, при +5 и больше — 30 с; Сердце 180 → 60 с", raiseSec("side", 1) === 90 && raiseSec("side", 9) === 30 && raiseSec("heart", 1) === 180 && raiseSec("heart", 5) === 60);
}

// ---------- герои ----------
const SOL: ClassId[] = ["warrior", "healer", "ranger", "mage", "rogue"], UMB: ClassId[] = ["deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];
let uid = 0;
const msgs = new Map<string, { type: string; msg: any }[]>();
const all: Player[] = [];
function hero(f: "solgard" | "umbrath", x: number, y: number): Player {
  const save = newSave((f === "solgard" ? SOL : UMB)[uid % 5], { x, y });
  save.level = 90;
  save.faction = f;
  const id = `h${++uid}`, log: { type: string; msg: any }[] = [];
  msgs.set(id, log);
  const p = new Player(id, `${f === "solgard" ? "Сол" : "Умб"}${uid}`, save, (type, msg) => log.push({ type, msg }));
  w.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  all.push(p);
  return p;
}
const park = (p: Player) => { p.unit.x = 100 * TILE; p.unit.y = 20 * TILE; };
const at = (p: Player, id: string, k = 0) => { const d = warBase(id)!; const a = (k * 2.4) % (Math.PI * 2); p.unit.x = d.x + Math.cos(a) * 40 * (1 + (k % 3)); p.unit.y = d.y + Math.sin(a) * 30 * (1 + (k % 3)); };
/** Такт: ввод держат «живые» герои (не AFK), здоровье полное. */
let afk = new Set<Player>();
function run(ms: number, until?: () => boolean): number {
  for (let t = 0; t < ms; t += 250) {
    for (const p of all) { if (!afk.has(p)) p.inputAt = w.time; p.unit.hp = p.unit.maxHp; if (p.dead) { p.dead = false; p.unit.anim = 0; } }
    w.update(250);
    if (until?.()) return t + 250;
  }
  return ms;
}

const mem: { s: WarSaved | null } = { s: null };
const store: WarStore = { load: () => (mem.s ? JSON.parse(JSON.stringify(mem.s)) : null), save: (s) => { mem.s = JSON.parse(JSON.stringify(s)); } };
const BASE = day(3, 20, 0) - 60000;
let war = new BannerWar(w, store);
war.now = () => BASE + w.time;
w.war = war;
const B = (id: string) => war.bases.get(id)!;

// ---------- 3. машина состояний ----------
{
  let fake = day(3, 19, 31);
  const W2 = new BannerWar(w);
  W2.now = () => fake;
  const s1 = hero("solgard", 300 * TILE, 180 * TILE);
  W2.update();
  check("за 30 мин до начала — подготовка, объявление", W2.phase === "prep" && msgs.get(s1.id)!.some((m) => m.type === "war:say"));
  const tp0 = { x: s1.x, y: s1.y };
  fake += 60000; W2.update();
  check("до окна телепорта — в форт нельзя", (W2.teleport(s1), s1.x === tp0.x && s1.y === tp0.y));
  fake = day(3, 19, 46); W2.update();
  const fort = CITIES.find((c) => c.id === "fort_solgard")!;
  W2.teleport(s1);
  check("за 15 мин — телепорт в свой форт", s1.x === fort.spawn.x && s1.y === fort.spawn.y);
  fake = day(3, 20, 0) + 100; W2.update();
  check("в 20:00 — битва, отряды не выходят", W2.phase === "battle" && w.soldiers!.bannerBattle === true);
  fake += 45 * 60000; W2.update();
  check("через 45 мин — итоги, отряды снова выходят", W2.phase === "result" && w.soldiers!.bannerBattle === false);
  fake += D.schedule.resultSec * 1000 + 500; W2.update();
  check("после окна итогов — покой, следующий фронт по кругу", W2.phase === "idle" && W2.front.id === D.schedule.rotation[1]);
  w.removePlayer(s1.id); all.splice(all.indexOf(s1), 1);
}

// ---------- 4. вывешивание и подъём соло, печать ----------
war.debug("start", { front: "center" });
check("битва началась на центральном фронте", war.phase === "battle" && war.front.id === "center");
const s1 = hero("solgard", 0, 0), u1 = hero("umbrath", 0, 0), u2 = hero("umbrath", 0, 0);
for (const p of [u1, u2]) park(p);
at(s1, "center_w");
let t = run(5000, () => !!B("center_w").banner);
check("знамя вывешено за ~3 с", B("center_w").banner === "solgard" && near(t, D.capture.hangMs, 500), `${t} мс`);
t += run(120000, () => B("center_w").owner === "solgard");
check("соло: подъём боковой ~90 с, захват", B("center_w").owner === "solgard" && near(t, D.capture.hangMs + 90000, 1500), `${(t / 1000).toFixed(1)} с`);
check("после захвата — печать 2 мин", B("center_w").sealUntil - war.now() > 110000);
check("захват объявлен на экране", msgs.get(u1.id)!.some((m) => m.type === "war:say" && m.msg.kind === "capture"));
// ---------- 5. очки ----------
{
  const s0 = war.score[0];
  run(30000);
  check("очки владельцу: 1 за 10 с", war.score[0] - s0 === 3, `${war.score[0] - s0}`);
}
// печать: враги в круге не спускают знамя
at(u1, "center_w", 1); at(u2, "center_w", 2);
run(10000);
check("печать: знамя не двигается", B("center_w").h === 1 && B("center_w").owner === "solgard");
check("тревога владельцам: враг у основания", msgs.get(s1.id)!.some((m) => m.type === "war:say" && m.msg.kind === "alarm"));
// ---------- 6. спор и спуск ----------
run(Math.max(0, B("center_w").sealUntil - war.now()) + 500);
park(u2);
const h1 = B("center_w").h;
run(10000);
check("спор 1 на 1: знамя стоит", B("center_w").h === h1 && war.view().bases.find((b) => b.id === "center_w")!.c);
at(u2, "center_w", 2);
t = run(160000, () => !B("center_w").banner);
check("перевес врага −1: спуск ~135 с (в 1,5 раза дольше), знамя сорвано", !B("center_w").banner && B("center_w").owner === null && B("center_w").fallen === "solgard" && near(t, 135000, 2000), `${(t / 1000).toFixed(1)} с`);
// ---------- 7. перевес +5 ----------
park(s1);
const u3 = hero("umbrath", 0, 0), u4 = hero("umbrath", 0, 0), u5 = hero("umbrath", 0, 0);
[u1, u2, u3, u4, u5].forEach((p, i) => at(p, "center_w", i));
t = run(60000, () => B("center_w").owner === "umbrath");
check("впятером: вывесить и поднять ~33 с", B("center_w").owner === "umbrath" && near(t, D.capture.hangMs + 30000, 1500), `${(t / 1000).toFixed(1)} с`);
// ---------- 8. AFK ----------
{
  const s2 = hero("solgard", 0, 0);
  at(s2, "center_e");
  afk = new Set([s2]);
  s2.inputAt = -1e12;
  run(D.capture.afkMs + 2000);
  check("без ввода 60 с — в круге не считается", B("center_e").n[0] === 0);
  afk = new Set();
  park(s2);
}
// ---------- 9. Сердце ----------
const sols = [s1, hero("solgard", 0, 0), hero("solgard", 0, 0), hero("solgard", 0, 0), hero("solgard", 0, 0)];
for (const p of [u1, u2, u3, u4, u5]) park(p);
sols.forEach((p, i) => at(p, "center_h", i));
run(8000);
check("Сердце закрыто до 20-й минуты", !B("center_h").banner && war.view().bases.find((b) => b.id === "center_h")!.lock);
war.debug("heart", {});
run(8000);
check("без своей боковой точки Сердце не вывесить", !B("center_h").banner && war.heartOpen);
war.debug("owner", { base: "center_e", f: "solgard" });
t = run(80000, () => B("center_h").owner === "solgard");
check("Сердце впятером: ~63 с, без печати", B("center_h").owner === "solgard" && near(t, D.capture.hangMs + 60000, 1500) && B("center_h").sealUntil === 0, `${(t / 1000).toFixed(1)} с`);
war.debug("owner", { base: "center_e", f: "" });
for (const p of sols) park(p);
run(5000);
check("Сердце без опоры сползает", B("center_h").h < 1);
war.debug("owner", { base: "center_h", f: "solgard" });
war.debug("owner", { base: "center_e", f: "solgard" });
// ---------- 10. вклад за убийство ----------
{
  at(sols[0], "center_e"); at(u5, "center_e", 3);
  const k0 = war.contrib.get(sols[0].name.toLowerCase())?.v ?? 0;
  w.killPlayer(u5, sols[0]);
  const k1 = war.contrib.get(sols[0].name.toLowerCase())!.v;
  u5.dead = false;
  w.killPlayer(u5, sols[0]);
  const k2 = war.contrib.get(sols[0].name.toLowerCase())!.v;
  check("убийство на фронте: 20 ×1,5 в круге своей точки, повтор той же жертвы — вдвое меньше", near(k1 - k0, 30, 0.01) && near(k2 - k1, 15, 0.01), `${k1 - k0}, ${k2 - k1}`);
  const sp = war.respawnAt(u5)!;
  const fort = CITIES.find((c) => c.id === "fort_umbrath")!;
  check("павший на Полях в битве — в своём форте, без потери золота", sp.free && sp.x === fort.spawn.x && sp.y === fort.spawn.y);
  u5.dead = false;
  park(sols[0]); park(u5);
}
// ---------- 10б. «В форт»: не в бою, перезарядка ----------
{
  const p = hero("solgard", 520 * TILE, 200 * TILE), fort = CITIES.find((c) => c.id === "fort_solgard")!;
  const atFort = () => p.x === fort.spawn.x && p.y === fort.spawn.y;
  p.combatAt = w.time;
  war.teleport(p);
  check("«В форт» в бою — отказ", !atFort() && msgs.get(p.id)!.some((m) => m.type === "toast" && m.msg.kind === "error"));
  p.combatAt = -1e9;
  war.teleport(p);
  check("«В форт» вне боя — в своём форте, клиенту перезарядка", atFort() && msgs.get(p.id)!.some((m) => m.type === "war:tpcd" && m.msg.ms === D.schedule.teleportCdSec * 1000));
  p.unit.x = 520 * TILE; p.unit.y = 200 * TILE;
  war.teleport(p);
  check("«В форт» на перезарядке — отказ", !atFort());
  run(D.schedule.teleportCdSec * 1000 + 500);
  p.combatAt = -1e9;
  war.teleport(p);
  check("«В форт» после перезарядки — снова можно", atFort());
  park(p);
}
// ---------- 11. конец, победа и награды ----------
{
  const key = weekKey(war.now());
  const full = hero("solgard", 0, 0), capped = hero("solgard", 0, 0), low = hero("solgard", 0, 0);
  for (const p of [full, capped]) { at(p, "center_w", 1); }
  war.contrib.set(full.name.toLowerCase(), { name: full.name, cls: full.cls, faction: "solgard", v: 260, acc: 0 });
  war.contrib.set(capped.name.toLowerCase(), { name: capped.name, cls: capped.cls, faction: "solgard", v: 100, acc: 0 });
  war.contrib.set(low.name.toLowerCase(), { name: low.name, cls: low.cls, faction: "solgard", v: 10, acc: 0 });
  for (let i = 0; i < full.save.inventory.length; i++) full.save.inventory[i] = { ...full.save.inventory[0]!, uid: `x${i}`, base: "hp_potion", qty: 999 };
  const invBefore = JSON.stringify(full.save.inventory);
  capped.save.war = { week: key, marks: D.rewards.weekCap - 10, wins: 1, battles: 3 };
  const m0 = s1.save.marks ?? 0, v1 = Math.floor(war.contrib.get(s1.name.toLowerCase())!.v);
  war.debug("end", {});
  const r = war.lastResult!;
  check("победа — у фракции с Сердцем (независимо от очков)", war.phase === "result" && r.win === "solgard", `очки ${r.score.join(":")}`);
  check("недельный счёт побед", war.saved.wins[0] === 1);
  const want = Math.min(D.rewards.perBattle, v1) + D.rewards.firstWin;
  check("Знаки: вклад 1:1 (до 300) + первая победа недели", (s1.save.marks ?? 0) - m0 === want, `${(s1.save.marks ?? 0) - m0} из ${want}`);
  check("сундук по вкладу — материалы в сумке", s1.save.inventory.some((it) => it?.base === "ash_ore"));
  check("сумка полна — сундук целиком в отложенные, сумка не тронута", JSON.stringify(full.save.inventory) === invBefore && (full.save.pendingItems ?? []).filter((it) => it.base === "ash_ore" || it.base === "star_dust").length === 2);
  check("недельный предел 1500", capped.save.marks === 10 && capped.save.war!.marks === D.rewards.weekCap);
  check("вклад ниже порога — без награды", (low.save.marks ?? 0) === 0);
  check("итог пришёл героям: war:result", msgs.get(s1.id)!.some((m) => m.type === "war:result" && m.msg.me?.marks === want));
  check("в итоге лучшие 5 каждой стороны", r.top.solgard.length === 5 && r.top.umbrath.length > 0);
}
// ---------- 12. бонусы и перезапуск ----------
{
  check("Сердце центра — отряды раз в 7 мин", w.soldiers!.squadEvery.solgard === D.bonus.squadMin && w.soldiers!.squadEvery.umbrath === undefined);
  war.debug("owner", { base: "north_w", f: "umbrath" });
  war.debug("owner", { base: "south_e", f: "umbrath" });
  const fields = { x: 520 * TILE, y: 200 * TILE };
  const mb = war.mobBonus(u1, fields), mbs = war.mobBonus(s1, fields);
  check("северная боковая: +10% опыта и золота, южная: +20% материалов на Полях", near(mb.xp, 1 + D.bonus.xpGold, 1e-9) && near(mb.mats, 1 + D.bonus.mats, 1e-9) && mbs.xp === 1);
  check("заставы центра: возрождение у своей заставы вне битвы", (() => { u1.unit.x = 470 * TILE; u1.unit.y = 190 * TILE; const sp = war.respawnAt(u1); return !!sp && !sp.free && near(sp.x, warBase("center_w")!.x, 1); })());
  const owners = Object.fromEntries([...war.bases.values()].map((r) => [r.def.id, r.owner ?? ""]));
  const again = new BannerWar(w, store);
  const owners2 = Object.fromEntries([...again.bases.values()].map((r) => [r.def.id, r.owner ?? ""]));
  check("перезапуск: владельцы и фронт из хранилища", JSON.stringify(owners) === JSON.stringify(owners2) && again.saved.frontIdx === war.saved.frontIdx);
  check("следующий фронт по кругу", D.schedule.rotation[war.saved.frontIdx] === "north");
  // следующая битва фронта начинается с того, чем кончилась прошлая
  w.war = war = again;
  war.now = () => BASE + w.time;
  war.debug("start", { front: "center" });
  check("новая битва: точки остаются за прежними хозяевами, знамёна наверху", B("center_h").owner === "solgard" && B("center_h").h === 1 && B("center_w").owner === "umbrath");
}
// ---------- 13. разгром ----------
{
  for (const p of all) park(p);
  for (const id of ["center_w", "center_e", "center_h"]) war.debug("owner", { base: id, f: "umbrath" });
  const t0 = run(D.score.routMs + 5000, () => war.phase !== "battle");
  check("все три точки 3 мин — досрочный разгром", war.phase === "result" && war.lastResult!.rout && war.lastResult!.win === "umbrath" && near(t0, D.score.routMs, 1500), `${(t0 / 1000).toFixed(0)} с`);
}

console.log(bad ? `\nСбоев: ${bad}` : "\nЗнамёна Предела: захват, спор, очки, победа, награды и перезапуск — в порядке");
process.exit(bad ? 1 : 0);
