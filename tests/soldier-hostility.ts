/**
 * Бойцы фракций и герой чужой фракции (баг: «бью чемпиона Умбрата — он не агрится и урон не проходит», задача 132):
 * правило вражды одно для сервера (World.hostile) и клиента (GameScene.isEnemy) — shared soldierHostile; маг Сольгарда, бьющий
 * меткого чемпиона Умбрата из-за края его зоны (поста, дороги, поселения), ранит его, чемпион агрится (ответный бой, zones.retaliate),
 * стреляет, держит дистанцию и поднимает свой отряд; уровень чемпиона уходит клиенту (100, не «ур. 0»); внутри стен Эмберхолла атака
 * запрещена (сервер не принимает attack, клиент не предлагает бойца целью атаки). Без сервера: мир в памяти, такт 50 мс.
 */
import { readFileSync } from "node:fs";
import P from "../data/patrols.json";
import { TILE } from "../shared/constants";
import { TOWN } from "../shared/town";
import { inEmberWalls } from "../shared/cities";
import { soldierHostile } from "../shared/factions";
import { lineClear, walkable } from "../shared/map";
import { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";
import { applyNpcPower } from "../server/src/game/soldiers";
import { Player } from "../server/src/game/Player";
import { raidBotSave } from "../server/src/arena/botgear";
import { registerCombat } from "../server/src/rooms/common";
import { WorldState } from "../server/src/rooms/schema";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) if (!m.faction) w.removeMob(m);
const S = w.soldiers!;
type Priv = { inZone(m: Mob, x: number, y: number, extra?: number): boolean };
const inZone = (m: Mob, x: number, y: number) => (S as unknown as Priv).inZone(m, x, y);
let hits: { src: unknown; dst: unknown; v: number }[] = [];
w.onDamage = (src, dst, v) => hits.push({ src, dst, v });
const handlers = new Map<string, (p: Player, m: unknown) => void>();
registerCombat(((type: string, fn: (p: Player, m: unknown) => void) => handlers.set(type, fn)) as never, () => w);

let uid = 0;
function mage(x: number, y: number): Player {
  const save = raidBotSave("mage", 100, "", "max");
  save.faction = "solgard";
  const p = new Player(`h${++uid}`, "MageTest", save, () => {});
  w.addPlayer(p);
  p.unit.x = x;
  p.unit.y = y;
  return p;
}
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const run = (p: Player, ms: number) => { for (let t = 0; t < ms; t += 50) { p.unit.hp = p.unit.maxHp; w.update(50); } };

// ---------- 0. одно правило вражды ----------
check("герой Сольгарда — враг бойцу Умбрата", soldierHostile("solgard", 0, "umbrath"));
check("свой боец — не враг", !soldierHostile("umbrath", 0, "umbrath"));
check("герой арены (team ≠ 0) — не враг бойцу", !soldierHostile("solgard", 1, "umbrath"));
check("без фракции — не враг", !soldierHostile("", 0, "umbrath") && !soldierHostile("solgard", 0, ""));
const scene = readFileSync(new URL("../client/src/game/GameScene.ts", import.meta.url), "utf8");
const isEnemySoldier = scene.split("\n").find((l) => l.includes("v.u.kind === UnitKind.Soldier) return")) ?? "";
check("клиент: isEnemy для бойца — то же правило (soldierHostile) и запрет в стенах Эмберхолла",
  isEnemySoldier.includes("soldierHostile(net.self.faction, net.unit(net.id)?.team ?? 0, v.u.faction)") && isEnemySoldier.includes("inEmberWalls("), isEnemySoldier.trim());

// ---------- 1. уровень чемпиона уходит клиенту ----------
// чемпионов вне отрядов Полей нет (вожаки групп — первые и ближники, решение владельца 2026-11-02): меткого чемпиона делаем из одного
// дальника-поста (мост, поселение) у края его зоны — только одного, чтобы соседи-«чемпионы» не убивали мага залпом
const posts = S.list.filter((m) => m.faction === "umbrath" && m.soldier!.ranged && !!m.soldier!.post && !m.soldier!.site?.city && !m.soldier!.power);

// ---------- 2. маг бьёт меткого чемпиона из-за края его зоны ----------
/** Точка в 190–220 px от бойца, вне его зоны, но в полосе ответного боя (slack + retaliate), проходимая и с прямой видимостью. */
function outside(m: Mob): { x: number; y: number } | null {
  for (const r of [200, 215, 190]) for (let a = 0; a < 32; a++) {
    const x = m.x + Math.cos((a / 32) * Math.PI * 2) * r, y = m.y + Math.sin((a / 32) * Math.PI * 2) * r;
    if (!inZone(m, x, y) && (S as unknown as Priv).inZone(m, x, y, P.zones.slack + P.zones.retaliate) && walkable(w.map, x, y, 10) && lineClear(w.map, m.x, m.y, x, y)) return { x, y };
  }
  return null;
}
const pick = posts.map((m) => ({ m, at: outside(m) })).find((c) => c.at);
if (pick) {
  applyNpcPower(pick.m, "umbrath", "ranged", { kind: "champion" });
  pick.m.soldier!.power = "champion";
}
const champs = S.list.filter((m) => m.faction === "umbrath" && m.soldier!.power === "champion");
check("чемпион Умбрата есть", champs.length === 1, `${champs.length}`);
check("уровень чемпиона в юните — 100 (рамка цели не «ур. 0»)", champs.every((m) => m.unit.level === 100 && m.level === 100));
check("нашёлся меткий чемпион и точка у края его зоны", !!pick);

function duel(retaliate: number) {
  const { m, at } = pick!;
  const keep = P.zones.retaliate;
  P.zones.retaliate = retaliate;
  m.reset();
  m.unit.x = m.home.x; m.unit.y = m.home.y;
  const p = mage(at!.x, at!.y);
  hits = [];
  handlers.get("attack")!(p, { id: m.id });
  const engaged = p.engaged && p.targetId === m.id;
  run(p, 4000);
  const dealt = hits.filter((h) => h.src === p && h.dst === m).reduce((s, h) => s + h.v, 0);
  const shot = hits.some((h) => h.src === m && h.dst === p);
  const r = { engaged, dealt, hpLost: m.unit.maxHp - m.unit.hp, foe: m.soldier!.foe === p, shot, mates: m.soldier!.group.filter((g) => g !== m && !g.dead && g.soldier!.foe === p).length, group: m.soldier!.group.length };
  w.removePlayer(p.id);
  for (const g of m.soldier!.group) { g.soldier!.foe = null; g.threat.clear(); g.state = "idle"; g.unit.hp = g.unit.maxHp; }
  P.zones.retaliate = keep;
  run(p, 500);
  return r;
}
if (pick) {
  const { m } = pick;
  // контроль: старое правило (только зона, без ответного боя) — урон стирается: боец «уходит домой» и лечится до полного
  const old = duel(-100);
  check("старое правило воспроизводит баг: урон стёрт, чемпион не агрится", old.dealt > 0 && old.hpLost === 0 && !old.foe, JSON.stringify(old));
  const now = duel(P.zones.retaliate);
  check("сервер принял атаку (attack)", now.engaged);
  check("урон мага проходит и держится", now.dealt > 0 && now.hpLost > 0, `нанесено ${now.dealt}, потеряно ${now.hpLost} из ${m.unit.maxHp}`);
  check("чемпион агрится на мага", now.foe);
  check("чемпион стреляет в мага", now.shot);
  check("чемпион поднимает свой отряд", now.group < 2 || now.mates > 0, `${now.mates} из ${now.group - 1}`);

  // ---------- 3. стрелок держит дистанцию ----------
  m.reset();
  m.unit.x = m.home.x; m.unit.y = m.home.y;
  const p = mage(m.x + 24, m.y);
  hits = [];
  handlers.get("attack")!(p, { id: m.id });
  p.engaged = false; // герой стоит вплотную и не бьёт: боец сам нашёл его в своей зоне
  run(p, 2500);
  check("меткий чемпион отходит от героя вплотную", d(m, p) > 48, `${Math.round(d(m, p))} px`);
  check("и стреляет на отходе", hits.some((h) => h.src === m && h.dst === p));
  w.removePlayer(p.id);
}

// ---------- 4. стены Эмберхолла: атака запрещена ----------
let ember: { x: number; y: number } | null = null;
for (let j = 0; j < 120 && !ember; j++) for (let i = 0; i < 120 && !ember; i++) {
  const x = (TOWN.x + i) * TILE + 16, y = (TOWN.y + j) * TILE + 16;
  if (inEmberWalls(x, y) && walkable(w.map, x, y, 10)) ember = { x, y };
}
check("точка в стенах Эмберхолла", !!ember);
if (ember && pick) {
  const p = mage(ember.x, ember.y);
  handlers.get("attack")!(p, { id: pick.m.id });
  check("в стенах Эмберхолла сервер не принимает атаку на бойца", !p.engaged && w.noFight(p));
  check("а вне стен боец — враг (то же правило, что у клиента)", w.hostile(p, pick.m));
  w.removePlayer(p.id);
}

console.log(bad ? `\n${bad} провалено` : "\nвсё ок");
process.exit(bad ? 1 : 0);
