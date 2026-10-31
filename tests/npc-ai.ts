/**
 * Ум NPC и мобов (docs/plan/next.md раздел 3): распорядок горожан Эмберхолла по фазам суток (data/schedules.json),
 * взгляд «к делу» и на героя, разговоры пар, разведение толпы (shared/crowd.ts), сон городов без героев,
 * стража на драку героев (окрик → подход → стрела только при продолжении), моб по дороге домой обходит камень и не телепортируется.
 * Без сервера: мир в памяти, такт 50 мс.
 */
import { TILE, MOVE_MUL } from "../shared/constants";
import { CELL_BLOCK, walkable } from "../shared/map";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { segmentWalkable } from "../shared/path";
import { MOBS } from "../shared/mobs";
import { TOWN } from "../shared/town";
import { OUTLAW } from "../shared/factions";
import { Dir } from "../shared/protocol";
import SCH from "../data/schedules.json";
import { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import type { Folk } from "../server/src/game/townfolk";

// выбор мест по весам случайный (8 жителей): с Math.random доля «на месте» гуляла 54–75 % около порога 60 % — тест падал через раз.
// Свой генератор с постоянным зерном: прогон повторяем, поведение то же (5 зёрен 2026-10-31: утро 64–80 %, вечер 52–89 %, ночь 88–100 %, день 90–98 %).
{
  let s = 0x9e3779b9;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const fx: { t: string; id?: string; text?: string; k?: string; from?: string }[] = [];
const w = new World(new WorldState(), (type, msg) => { if (type === "fx") fx.push(...(msg as typeof fx)); });
for (const m of [...w.mobs.values()]) w.removeMob(m);
const town = w.town!;
const ember = town.folk[0].site;
const cits = town.folk.filter((f) => !f.guard && f.site === ember);
const guards = town.folk.filter((f) => f.guard && f.site === ember);
const keep: Player[] = [];
let uid = 0;
function hero(x: number, y: number): Player {
  const p = new Player(`h${++uid}`, `Герой${uid}`, newSave("warrior", { x, y }), () => {});
  w.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  keep.push(p);
  return p;
}
/** Пары жителей ближе 10 px: сколько тактов подряд (для «не дольше 1 с»). */
const close = new Map<string, number>();
let worstClose = 0, worstPair = "", worstGuards = 0;
const watchCrowd = () => {
  const act = town.folk.filter((f) => f.site === ember);
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j], k = `${a.id}|${b.id}`;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 10) {
      const n = (close.get(k) ?? 0) + 1;
      close.set(k, n);
      // горожанин в паре — предел 1 с; два стражника (встречные патрули на общих точках маршрута) — учитываются отдельно
      if (a.guard && b.guard) worstGuards = Math.max(worstGuards, n);
      else if (n > worstClose) { worstClose = n; worstPair = `${a.unit.name}/${b.unit.name} ${Math.round(a.x)},${Math.round(a.y)}`; }
    }
    else close.delete(k);
  }
};
let chats = 0;
const run = (ms: number, each?: () => void) => {
  for (let t = 0; t < ms; t += 50) {
    for (const p of keep) p.unit.hp = p.unit.maxHp;
    each?.();
    w.update(50);
    watchCrowd();
    for (const f of cits) if (f.chat && f.chat.a === f && f.chat.until - w.time > (SCH.chat.ms[0] - 60)) chats++;
  }
};
/** Сдвинуть часы распорядка в начало фазы (+ доля). */
function setPhase(name: string, into = 0.01) {
  const ph = SCH.phases as unknown as [string, number][];
  const from = ph.find(([n]) => n === name)![1];
  const now = Date.now() % DAY_CYCLE_MS;
  town.clockShift = (from + into) * DAY_CYCLE_MS - now;
}
const atPlace = (f: Folk, places: string[]) => !!f.goal && places.includes(f.place) && Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < 28;
const share = (places: string[]) => cits.filter((f) => atPlace(f, places)).length / cits.length;
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);

// ---------- 1. сон: без героев город не думает ----------
{
  const s0 = { ...town.stats };
  run(2000);
  check("без героев жители спят (ни шага дерева, ни шага ходьбы)", town.stats.think === s0.think && town.stats.walk === s0.walk, JSON.stringify(town.stats));
  setPhase("evening", 0.02);
  run(600);
  const ok = cits.every((f) => f.phase === "evening" && f.goal && f.x === f.goal.x && f.y === f.goal.y);
  check("спящий город: при смене фазы жители сразу на новых местах", ok);
  const far = hero((TOWN.x + 200) * TILE, (TOWN.y) * TILE);
  const s1 = { ...town.stats };
  run(1000);
  check("герой далеко — город по-прежнему спит", town.stats.think === s1.think, `${town.stats.think - s1.think} шагов`);
  w.players.delete(far.id);
  keep.length = 0;
}

// ---------- 2. распорядок по фазам суток ----------
const watcher = hero((TOWN.x + 0.5) * TILE, (TOWN.y + 3.5) * TILE);
for (const [phase, places, need] of [
  ["morning", ["market", "stall", "work"], 0.6],
  ["evening", ["tavern"], 0.5],
  ["night", ["home"], 0.6],
  ["day", ["market", "stall", "work", "square"], 0.6],
] as [string, string[], number][]) {
  setPhase(phase, 0.01);
  run(90000);
  // доля «на месте» — средняя за следующие 60 с (раз в секунду): мгновенный снимок шумит из-за переходов между местами
  let acc = 0;
  for (let k = 0; k < 60; k++) { run(1000); acc += share(places); }
  const sh = acc / 60;
  if (share(places) < need) console.log(cits.map((f) => `${f.role}:${f.place}${f.walking ? "*" : ""}${f.chat ? "c" : ""} d${Math.round(Math.hypot(f.goal!.x - f.x, f.goal!.y - f.y))} s${f.stuck} @${Math.round(f.x / TILE - TOWN.x)},${Math.round(f.y / TILE - TOWN.y)}`).join(" | "));
  check(`${phase}: у мест ${places.join("/")} ≥ ${need * 100}%`, sh >= need, `${Math.round(sh * 100)}%`);
}
check("жители не стоят вдвоём в одной точке (ближе 10 px дольше 1 с)", worstClose <= 20, `худшая пара ${worstClose * 50} мс ${worstPair}`);
check("стражники не стоят друг в друге (ближе 10 px дольше 2 с)", worstGuards <= 40, `${worstGuards * 50} мс`);
check("пары горожан разговаривают", chats >= 1, `${chats} разговоров`);

// ---------- 3. лицом к делу, а не вниз ----------
{
  const idle = cits.filter((f) => !f.walking && !f.chat && f.goal && w.time >= f.lookUntil && Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < 6 && Math.hypot(watcher.x - f.x, watcher.y - f.y) > 4 * TILE);
  const facing = idle.filter((f) => f.dir === dirTo(f.goal!.lx - f.x, f.goal!.ly - f.y));
  check("стоящие на месте смотрят на дело (прилавок, дверь, собеседников)", idle.length > 0 && facing.length / idle.length >= 0.7, `${facing.length}/${idle.length}`);
}

// ---------- 4. оборачиваются на героя рядом ----------
{
  const f = cits.find((c) => !c.walking && !c.chat)!;
  // встаём в 2 клетках сбоку (не там, куда он смотрит)
  const side = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([a, b]) => ({ x: f.x + a * TILE, y: f.y + b * TILE })).find((p) => walkable(w.map, p.x, p.y, 10) && dirTo(p.x - f.x, p.y - f.y) !== f.dir);
  const p = hero(side!.x, side!.y);
  fx.length = 0;
  run(1500);
  check("житель оборачивается к герою рядом", f.chat ? true : f.dir === dirTo(p.x - f.x, p.y - f.y), `dir ${f.dir}, chat ${!!f.chat}`);
  check("и здоровается", fx.some((e) => e.t === "say" && e.id === f.id) || !!f.chat);
  w.players.delete(p.id);
  keep.splice(keep.indexOf(p), 1);
}

// ---------- 5. стража на драку героев: окрик → подход → стрела только при продолжении ----------
{
  const g0 = guards.find((g) => g.post)!;
  const p = hero((TOWN.x + 6.5) * TILE, (TOWN.y - 8.5) * TILE);
  for (let i = 0; i < 6 && !walkable(w.map, p.unit.x, p.unit.y, 10); i++) p.unit.y += TILE;
  p.outlawUntil = w.time + OUTLAW.ms;
  fx.length = 0;
  const hp0 = p.unit.hp;
  town.punish(p, 100, true);
  w.update(50);
  const rushing = guards.filter((g) => g.rush?.p === p);
  check("окрик «Прекратить!» и к месту бегут трое", fx.some((e) => e.t === "say") && rushing.length === 3, `${rushing.length}`);
  check("после окрика стрелы нет", !fx.some((e) => e.t === "proj"));
  const d0 = Math.min(...rushing.map((g) => Math.hypot(g.x - p.x, g.y - p.y)));
  run(2500, () => { p.unit.hp = hp0; });
  const d1 = Math.min(...rushing.map((g) => Math.hypot(g.x - p.x, g.y - p.y)));
  check("стражники подходят к драке", d1 < d0 - 20 || d1 < 70, `${d0.toFixed(0)} → ${d1.toFixed(0)} px`);
  fx.length = 0;
  town.punish(p, 100, true);
  w.update(50);
  check("герой больше не бил — не стреляют", !fx.some((e) => e.t === "proj"));
  p.outlawUntil = w.time + OUTLAW.ms; // снова ударил
  town.punish(p, 100, true);
  w.update(50);
  check("драка продолжается — стрела", fx.some((e) => e.t === "proj"));
  w.players.delete(p.id);
  keep.splice(keep.indexOf(p), 1);
}

// ---------- 6. мобы: разведение толпы и обход камня по дороге домой без телепорта ----------
function openField(): { x: number; y: number } {
  for (let ty = 80; ty < w.map.h - 80; ty += 5) for (let tx = 80; tx < w.map.w - 80; tx += 5) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (w.inTown(x, y)) continue;
    let ok = true;
    for (let j = -9; j <= 9 && ok; j++) for (let i = -9; i <= 9 && ok; i++) ok = walkable(w.map, x + i * TILE, y + j * TILE, 12);
    if (ok) return { x, y };
  }
  throw new Error("нет открытого поля");
}
const wolf = Object.values(MOBS).find((d) => !d.boss && !d.raid && !d.projectile && d.speed > 0 && d.radius <= 20)!;
{
  const c = openField();
  const p = hero(c.x + 6 * TILE, c.y);
  const pack: Mob[] = [];
  for (let i = 0; i < 5; i++) pack.push(w.addMob(new Mob(`pk${i}`, wolf, 5, { x: c.x - 3 * TILE, y: c.y })));
  for (const m of pack) m.threat.set(p.id, 1);
  run(4000, () => { p.unit.hp = p.unit.maxHp; });
  let sum = 0, n = 0, minD = Infinity;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) { const d = Math.hypot(pack[i].x - pack[j].x, pack[i].y - pack[j].y); sum += d; n++; minD = Math.min(minD, d); }
  const r = World.crowdR(pack[0]);
  check("5 мобов за героем не слипаются (средняя дистанция > 2 радиусов, минимальная > радиуса)", sum / n > 2 * r && minD > r, `ср. ${(sum / n).toFixed(1)}, мин. ${minD.toFixed(1)}, r ${r}`);
  for (const m of pack) w.removeMob(m);
  w.players.delete(p.id);
  keep.splice(keep.indexOf(p), 1);
}
{
  const c = openField();
  const helper = hero(c.x, c.y + 8 * TILE); // чтобы мобы не спали (герой рядом)
  // «камень»: стена 7 клеток поперёк пути домой
  const hx = Math.floor(c.x / TILE), hy = Math.floor(c.y / TILE);
  for (let j = -3; j <= 3; j++) w.map.cell[(hy + j) * w.map.w + hx + 3] |= CELL_BLOCK;
  const m = w.addMob(new Mob("rock", wolf, 5, { x: c.x, y: c.y }));
  m.unit.x = c.x + 6 * TILE;
  m.unit.y = c.y;
  check("между мобом и домом камень", !segmentWalkable(w.map, m.x, m.y, c.x, c.y, 10));
  m.state = "return";
  const maxStep = wolf.speed * 1.6 * MOVE_MUL * 0.05 * 1.3 + 1;
  let jump = 0, prev = { x: m.x, y: m.y }, before = Infinity, ms = 0;
  while (m.state === "return" && ms < 20000) {
    helper.unit.hp = helper.unit.maxHp;
    w.update(50);
    ms += 50;
    if (m.state === "return") { jump = Math.max(jump, Math.hypot(m.x - prev.x, m.y - prev.y)); before = Math.hypot(m.x - c.x, m.y - c.y); }
    prev = { x: m.x, y: m.y };
  }
  check("моб обошёл камень и дошёл домой", (m.state as string) === "idle" && ms < 20000, `${ms} мс`);
  check("без телепорта: шаг за такт не больше скорости", jump <= maxStep, `макс. шаг ${jump.toFixed(1)} px (предел ${maxStep.toFixed(1)})`);
  check("и дом «засчитан» только рядом с ним", before < 6 + maxStep, `${before.toFixed(1)} px`);
  w.removeMob(m);
}

console.log(bad ? `\n${bad} FAIL` : "\nвсё ок");
process.exit(bad ? 1 : 0);
