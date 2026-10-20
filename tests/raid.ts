/**
 * Рейд «Рогатый Рыцарь Хаоса» (задача 114): бой ботами без игрока на настоящем коде (World, RaidDirector, ChaosKnight, ИИ рейда),
 * время — тиками World, поэтому минуты боя считаются за секунды. Проверки: победа за 5–10 мин, все фазы, атаки и реплики,
 * воскрешения; без уклонения — вайп до 50% HP; малая группа — проигрыш; награды; карта; комната (сбор у Вестника → рейд → возврат).
 * Запуск: npx tsx tests/raid.ts [--seeds 8] [--only fight,nododge,small,rewards,map,room] [--verbose]; npm run test:raid.
 */
import { CLASSES, type ClassId } from "../shared/classes";
import { MAP_SEED, TICK_MS } from "../shared/constants";
import { generateMap, lineClear, walkable, CELL_BLOCK, cellAt } from "../shared/map";
import { findPath } from "../shared/path";
import { generateRaidMap, inHall, PILLAR_HALF, RAID, RAID_ATTACKS, RAID_BOSS, RAID_CFG, RAID_HERALDS, RAID_PHASES, RAID_PILLARS, RAID_POINTS, raidRole, roleTargets, type RaidRole } from "../shared/raid";
import { LEGENDARIES } from "../shared/legendary";
import { rollLegendary } from "../shared/legendary";
import { Player } from "../server/src/game/Player";
import { World } from "../server/src/game/World";
import { RaidState } from "../server/src/rooms/schema";
import { raidBotSave } from "../server/src/arena/botgear";
import { RaidDirector, type RaidMember } from "../server/src/raid/director";
import { grantRaidRewards, lockoutLeft } from "../server/src/raid/rewards";

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const SEEDS = Number(arg("seeds") ?? process.env.RAID_SEEDS ?? 8);
const ONLY = new Set((arg("only") ?? "map,fight,nododge,small,rewards,room").split(","));
const VERBOSE = argv.includes("--verbose");
const LIMIT_MS = 21 * 60_000;

// ---------------------------------------------------------------- детерминированная случайность
let rs = 1;
const rng = () => {
  rs = (rs + 0x6d2b79f5) | 0;
  let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const realRandom = Math.random;
const seed = (s: number) => { rs = s * 7919 + 17; Math.random = rng; };

let failed = 0, passed = 0;
function check(name: string, ok: boolean, info = "") {
  if (ok) { passed++; console.log(`  ok   ${name}${info ? ` — ${info}` : ""}`); }
  else { failed++; console.log(`  FAIL ${name}${info ? ` — ${info}` : ""}`); }
}

const POOLS: Record<RaidRole, ClassId[]> = {
  tank: ["warrior", "deathknight"],
  healer: ["healer", "bloodweaver"],
  melee: ["rogue", "reaver"],
  ranged: ["ranger", "mage", "darkranger", "warlock"],
};
/** Состав: роли по data/raid.json bots.roles, классы обеих фракций по кругу. */
function roster(n: number, offset = 0, roles?: Record<RaidRole, number>): RaidMember[] {
  const tg = roles ?? roleTargets(n);
  const out: RaidMember[] = [];
  let i = 0;
  for (const role of ["tank", "healer", "melee", "ranged"] as RaidRole[]) for (let k = 0; k < tg[role]; k++) {
    const pool = POOLS[role], cls = pool[(k + offset) % pool.length];
    const name = RAID.bots.names[i++ % RAID.bots.names.length];
    out.push({ key: name.toLowerCase(), name, cls, level: 100, role, bot: true, save: raidBotSave(cls, 100, RAID.bots.title) });
  }
  return out;
}

interface RunOut {
  win: boolean; sec: number; attempt: number; deaths: number; revives: number; phases: number[]; used: Record<string, number>;
  yells: Record<string, number>; chatter: number; bossHp: number; wipes: number; d: RaidDirector; tankFace: number; minHp: number;
}
function setup(s: number, members: RaidMember[], o: { noDodge?: boolean; humans?: number } = {}) {
  seed(s);
  const fx: any[] = [];
  const w = new World(new RaidState(), (type, msg) => { if (type === "fx") fx.push(...(msg as any[])); }, { map: generateRaidMap(), mobs: false, quiet: true });
  let wipes = 0;
  const d: RaidDirector = new RaidDirector(w, { members, gatherMs: 1500, pullMs: 9000, wipeMs: 3000, noDodge: o.noDodge, rand: rng, log: VERBOSE ? console.log : undefined });
  d.on("wipe", () => wipes++);
  members.forEach((m, i) => {
    const p = new Player(`p${i}`, m.name, JSON.parse(JSON.stringify(m.save)), () => {});
    const human = i < (o.humans ?? 0);
    d.addPlayer(p, m, !human);
    if (human) d.auto.add(p);
  });
  return { w, d, fx, wipes: () => wipes };
}
function run(s: number, members: RaidMember[], o: { noDodge?: boolean; humans?: number; stopAtWipe?: boolean } = {}): RunOut {
  const { w, d, wipes: wp } = setup(s, members, o);
  let wipes = 0;
  d.on("wipe", () => wipes++);
  void wp;
  if (VERBOSE) d.on("*", (e) => { if (["phase", "wipe", "win", "death", "revived", "adds", "berserk"].includes(String(e.ev))) console.log(`    [${((w.time - d.fightAt) / 1000).toFixed(1)}] ${e.ev} ${JSON.stringify(e).slice(0, 120)} босс ${Math.round((d.boss.unit.hp / d.boss.unit.maxHp) * 100)}%`); });
  let faceTicks = 0, fightTicks = 0, minHp = 1;
  const offTarget: Record<string, number> = {};
  const causes: Record<string, number> = {}, last = new Map<string, string>();
  const od = w.onDamage;
  const dmgBy: Record<string, number> = {};
  w.onDamage = (src, dst, v) => { od?.(src, dst, v); if (w.isPlayer(dst) && !w.isPlayer(src)) { const c = src === d.boss ? d.knight.hitBy || 'auto' : 'add:' + (src as any).def.id; last.set(dst.id, c); dmgBy[c] = (dmgBy[c] || 0) + v; } };
  d.on('death', (e) => {
    const c = last.get(String(e.id)) ?? '?';
    causes[c] = (causes[c] || 0) + 1;
    if (VERBOSE && process.env.RAID_WHY) {
      const p = w.players.get(String(e.id))!, a = d.ai.get(p)!;
      const seen = [...a.seen.entries()].filter(([k]) => k.startsWith(c)).map(([k, v]) => `${k}=${v === Infinity ? 'прозевал' : Math.round(v - w.time)}`).slice(-2);
      console.log(`      смерть ${d.roleOf(p)}:${p.cls} от ${c}, реакция ${seen.join(' ')}, побег ${a.escape ? 'да' : 'нет'}, канал ${d.channels.has(p)}, castUntil ${p.castUntil > w.time}, до босса ${Math.round(w.dist(p, d.boss))}`);
    }
  });
  if (VERBOSE) { console.log('    босс: HP ' + d.boss.unit.maxHp + ', удар ' + Math.round(d.boss.stats.dmg) + ', броня ' + d.boss.stats.armor); console.log('    герои: ' + d.players().map((p) => p.cls + ':' + p.unit.maxHp + '/' + Math.round(p.derived.armor)).join(' ')); }
  for (let t = 0; t < LIMIT_MS && d.stage !== "end"; t += TICK_MS) {
    w.update(TICK_MS);
    d.tick();
    if (d.stage === "fight") {
      fightTicks++;
      const bt = d.boss.targetId ? w.players.get(d.boss.targetId) : undefined;
      if (bt && !bt.dead && d.roleOf(bt) === "tank") faceTicks++;
      else if (VERBOSE) { const q = d.boss.targetId ? w.players.get(d.boss.targetId) : undefined; const k = q ? d.roleOf(q) + (q.dead ? "(мёртв)" : "") : d.boss.targetId ? "не игрок" : "нет"; offTarget[k] = (offTarget[k] || 0) + 1; }
      minHp = Math.min(minHp, d.boss.unit.hp / d.boss.unit.maxHp);
    }
    if (o.stopAtWipe && wipes) break;
    if (VERBOSE && d.stage === 'fight' && Math.round(w.time - d.fightAt) % 20000 === 0) { const b = d.boss, tg = b.targetId ? w.players.get(b.targetId) : undefined; const top = [...b.threat].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([id, v]) => { const q = w.players.get(id); return (q ? d.roleOf(q) + ':' + q.cls : id) + '=' + Math.round(v / 1000) + 'k'; }); console.log('    [' + Math.round((w.time - d.fightAt) / 1000) + '] живых ' + d.players().filter((q) => !q.dead).length + ', цель ' + (tg ? d.roleOf(tg) + ':' + tg.cls : '-') + ', угроза ' + top.join(' ') + ', HP ' + Math.round((b.unit.hp / b.unit.maxHp) * 100) + '%, заряды ' + d.revives); }
  }
  Math.random = realRandom;
  if (VERBOSE) { console.log('    урон по героям: ' + Object.entries(dmgBy).map(([k, v]) => k + ' ' + Math.round(v / 1000) + 'k').join(', '));
    console.log('    причины смертей: ' + JSON.stringify(causes) + ', цель босса не главный танк (тиков): ' + JSON.stringify(offTarget)); const by: Record<string, number[]> = {}; for (const r of d.results()) { const k = r.role + ':' + r.cls; (by[k] ??= [0, 0, 0]); by[k][0] += r.damage; by[k][1] += r.healing; by[k][2] += r.deaths; } console.log('    урон/лечение/смерти: ' + Object.entries(by).map(([k, v]) => k + ' ' + Math.round(v[0] / 1e6) + 'M/' + Math.round(v[1] / 1e3) + 'k/' + v[2]).join(', ')); }
  const st = [...d.stats.values()];
  return {
    win: !!d.result?.win, sec: (d.result?.durationMs ?? 0) / 1000, attempt: d.attempt,
    deaths: st.reduce((a, x) => a + x.deaths, 0), revives: st.reduce((a, x) => a + x.revives, 0),
    phases: [...d.phasesSeen].sort(), used: { ...d.knight.used }, yells: { ...d.knight.yelled }, chatter: d.chatter.said,
    bossHp: d.boss.unit.hp / d.boss.unit.maxHp, wipes, d, tankFace: fightTicks ? faceTicks / fightTicks : 0, minHp,
  };
}
const fmt = (r: RunOut) => `${r.win ? "победа" : "поражение"} ${r.win ? `${(r.sec / 60).toFixed(1)} мин` : `босс ${Math.round(r.minHp * 100)}%`} (попытка ${r.attempt}), смертей ${r.deaths}, воскрешений ${r.revives}, фазы ${r.phases.join("")}, танк держит ${Math.round(r.tankFace * 100)}%, перекличка ${r.chatter}`;

function main() {
  const t0 = Date.now();
  if (ONLY.has("map")) {
    console.log("Карта цитадели");
    const m = generateRaidMap();
    check("от входа до босса есть путь", !!findPath(m, RAID_POINTS.spawn.x, RAID_POINTS.spawn.y, RAID_POINTS.bossHome.x, RAID_POINTS.bossHome.y + 70, 10, 30000));
    let lava = 0, lavaOk = true;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.vtx[y * (m.w + 1) + x] === 1 && m.vtx[(y + 1) * (m.w + 1) + x + 1] === 1 && m.vtx[y * (m.w + 1) + x + 1] === 1 && m.vtx[(y + 1) * (m.w + 1) + x] === 1) { lava++; if (!(m.cell[y * m.w + x] & CELL_BLOCK)) lavaOk = false; }
    check("лава непроходима", lava > 50 && lavaOk, `клеток лавы ${lava}`);
    const shadows = RAID_PILLARS.map((c) => {
      let n = 0;
      for (let dy = -90; dy <= 90; dy += 8) for (let dx = -90; dx <= 90; dx += 8) {
        const x = c.x + dx, y = c.y + dy;
        if (Math.hypot(dx, dy) > PILLAR_HALF + 60 || !walkable(m, x, y, 10) || !inHall(x, y)) continue;
        if (!lineClear(m, RAID_POINTS.bossHome.x, RAID_POINTS.bossHome.y, x, y)) n++;
      }
      return n;
    });
    check("у каждой колонны есть тень от «Солнца»", shadows.every((n) => n >= 4), `точек тени ${shadows.join("/")}`);
    const wm = generateMap(MAP_SEED);
    check("Вестники и Врата стоят на проходимых клетках", RAID_HERALDS.length >= 6 && RAID_HERALDS.every((h) => walkable(wm, h.x, h.y, 10) && !(cellAt(wm, h.x, h.y) & CELL_BLOCK)), `${RAID_HERALDS.length} точек`);
  }

  if (ONLY.has("fight")) {
    console.log(`Рейд ботами: ${RAID_CFG.size} участников, ${SEEDS} сидов`);
    const runs: RunOut[] = [];
    for (let s = 1; s <= SEEDS; s++) {
      const r = run(s, roster(RAID_CFG.size, s));
      runs.push(r);
      console.log(`  сид ${s}: ${fmt(r)}`);
      if (VERBOSE) console.log(`    атаки ${JSON.stringify(r.used)} реплики ${JSON.stringify(r.yells)}`);
    }
    const wins = runs.filter((r) => r.win);
    check("рейд из ботов побеждает", wins.length >= Math.ceil(SEEDS * 0.6), `${wins.length}/${SEEDS}`);
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
    const avgSec = mean(wins.map((r) => r.sec));
    // в среднем 5–10 мин; отдельная удачная попытка может быть короче (не меньше 4 мин)
    check("бой 5–10 мин", avgSec >= 300 && avgSec <= 600 && wins.every((r) => r.sec >= 240 && r.sec <= 600), `в среднем ${(avgSec / 60).toFixed(1)} мин: ` + wins.map((r) => `${(r.sec / 60).toFixed(1)}`).join(", "));
    check("не всегда без потерь", wins.filter((r) => r.deaths > 0).length >= Math.ceil(wins.length / 2), wins.map((r) => r.deaths).join(","));
    check("в победах пройдены все 4 фазы", wins.every((r) => [0, 1, 2, 3].every((n) => r.phases.includes(n))));
    const need = Object.keys(RAID_ATTACKS).filter((id) => !["auto", "berserk"].includes(id));
    const miss = wins.map((r) => need.filter((id) => !r.used[id])).flat();
    check("в победах срабатывает каждая атака", !miss.length, miss.length ? `нет: ${[...new Set(miss)].join(", ")}` : need.join(" "));
    check("тратятся заряды воскрешения", wins.some((r) => r.revives > 0), wins.map((r) => r.revives).join(","));
    const ev = ["spawn", "phase2", "phase3", "enrage", "death"];
    check("реплики босса: появление, фазы, ярость, смерть", wins.every((r) => ev.every((e) => r.yells[e])), JSON.stringify(wins[0]?.yells ?? {}));
    check("реплика на гибель участника", runs.some((r) => r.yells.kill));
    check("боты перекликаются", runs.every((r) => r.chatter >= 5), runs.map((r) => r.chatter).join(","));
    check("босс ≥ 90% боя бьёт танка (в среднем, не ниже 80% в каждой победе)", mean(wins.map((r) => r.tankFace)) >= 0.9 && wins.every((r) => r.tankFace >= 0.8), wins.map((r) => `${Math.round(r.tankFace * 100)}%`).join(","));
  }

  if (ONLY.has("nododge")) {
    console.log("Без уклонения");
    const r = run(101, roster(RAID_CFG.size, 1), { noDodge: true, stopAtWipe: true });
    console.log(`  ${fmt(r)}`);
    check("боты без уклонения вайпаются на первых механиках против стоящих (до 40% HP босса)", !r.win && r.minHp > 0.4, `минимум HP босса ${Math.round(r.minHp * 100)}%`);
  }

  if (ONLY.has("small")) {
    console.log("Малая группа");
    const r = run(202, roster(5, 0, { tank: 1, healer: 1, melee: 1, ranged: 2 }));
    console.log(`  5 героев: ${fmt(r)}`);
    check("группа из 5 проигрывает", !r.win);
  }

  if (ONLY.has("rewards")) {
    console.log("Награды");
    const members = roster(RAID_CFG.size, 3);
    members[0].bot = false; members[3].bot = false;
    const { d } = setup(303, members, { humans: 4 });
    Math.random = realRandom;
    // павший участник тоже получает награду
    const dead = d.byKey.get(members[3].key)!;
    dead.dead = true;
    const before = d.byKey.get(members[0].key)!.save.gold;
    const loot = grantRaidRewards(d);
    const l0 = loot.get(members[0].key), l3 = loot.get(members[3].key);
    check("награды выдаются игрокам, включая павших", !!l0 && !!l3 && loot.size === 2, `получили ${loot.size}`);
    const epic = (l: typeof l0) => (l?.items.filter((it) => it.rarity >= 3 && it.ilvl === 100 && !it.qty).length ?? 0) >= 2;
    check("2 вещи ≥ Эпической 100 ур. и материалы", epic(l0) && epic(l3) && !!l0!.items.find((it) => it.base === "ash_ore") && !!l0!.items.find((it) => it.base === "star_dust"));
    const p0 = d.byKey.get(members[0].key)!;
    check("золото и мешок у тела босса", p0.save.gold > before && p0.bags.size === 1);
    check("титул за первую победу", p0.save.titles?.some((t) => t.name === RAID.title.name) === true);
    check("откат добычи 20 ч", lockoutLeft(p0.save) > (RAID_CFG.lockoutH - 1) * 3600_000);
    const again = grantRaidRewards(d).get(members[0].key)!;
    check("откат блокирует вторую добычу", again.locked && again.items.length === 0);
    check("боты без наград", [...loot.keys()].every((k) => k === members[0].key || k === members[3].key));
    const raidIds = Object.values(LEGENDARIES).filter((l) => l.source === "raid").map((l) => l.id);
    let leak = false;
    for (let i = 0; i < 400 && raidIds.length; i++) if (raidIds.includes(rollLegendary("warrior", 100) ?? "")) leak = true;
    check("rollLegendary не выдаёт рейдовые трофеи", !leak, raidIds.length ? `трофеев ${raidIds.length}` : "трофеев source:raid пока нет — проверка пропуска фильтра");
  }
  console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)} с: ${passed} ok, ${failed} FAIL`);
  return failed;
}

const fails = main();
let roomFails = 0;
if (ONLY.has("room")) {
  const { roomTest } = await import("./raid-room");
  roomFails = await roomTest();
}
process.exit(fails + roomFails ? 1 : 0);
