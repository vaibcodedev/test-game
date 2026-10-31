/**
 * Рейд как механика без сервера (server/src/raid/director.ts на карте цитадели, игроки без ИИ): этапы gather → pull → fight,
 * сокращение сбора, воскрешение (отказы, канал, прерывание движением, заряды и их потолок за фазы), вайп → вторая попытка с полным
 * восстановлением → второй вайп — конец без победы, победа (один раз), уход всех из комнаты в бою — конец.
 * Запуск: npx tsx tests/unit/events-raid.ts
 */
import { World } from "../../server/src/game/World";
import { Player } from "../../server/src/game/Player";
import { RaidState } from "../../server/src/rooms/schema";
import { RaidDirector, type RaidMember } from "../../server/src/raid/director";
import { raidBotSave } from "../../server/src/arena/botgear";
import { generateRaidMap, raidRole, RAID_CFG } from "../../shared/raid";
import { TICK_MS } from "../../shared/constants";
import type { ClassId } from "../../shared/classes";
import { assert, done, section, test, withRandom } from "./lib";

const MAP = generateRaidMap();
const CLS: ClassId[] = ["warrior", "healer", "mage", "rogue"];
function setup(n = 4, o: { onWin?: () => void; onEnd?: (win: boolean) => void } = {}) {
  const members: RaidMember[] = CLS.slice(0, n).map((cls, i) => ({ key: `р${i}`, name: `Р${i}`, cls, level: 100, role: raidRole(cls), save: raidBotSave(cls, 100) }));
  const w = new World(new RaidState(), () => {}, { map: MAP, mobs: false, quiet: true } as never);
  const d = new RaidDirector(w, { members, gatherMs: 1000, pullMs: 1000, wipeMs: 1000, endMs: 1000, rand: () => 0.5, onWin: o.onWin, onEnd: (_d, win) => o.onEnd?.(win) });
  const ps = members.map((m, i) => { const p = new Player(`rp${i}`, m.name, JSON.parse(JSON.stringify(m.save)), () => {}); d.addPlayer(p, m, false); return p; });
  const run = (ms: number, until?: () => boolean) => { for (let t = 0; t < ms; t += TICK_MS) { w.update(TICK_MS); d.tick(); if (until?.()) return; } };
  /** До боя; босс заморожен, чтобы не мешал. */
  const toFight = () => { run(2500, () => d.stage === "fight"); d.boss.unit.x = d.boss.home.x; };
  return { w, d, ps, run, toFight };
}
const kill = (s: ReturnType<typeof setup>, p: Player) => { s.w.killPlayer(p); };

section("Этапы");

await test("gather → pull → fight по таймерам; countdown убывает; повторный тик в бою не меняет этап", () => {
  const s = setup();
  assert.equal(s.d.stage, "gather");
  const c0 = s.d.countdown();
  s.run(500);
  assert.ok(s.d.countdown() <= c0);
  s.run(600);
  assert.equal(s.d.stage, "pull");
  s.run(1100);
  assert.equal(s.d.stage, "fight");
  assert.ok(s.d.fightAt > 0 && s.d.phasesSeen.has(0));
});

await test("hurryGather: сбор сокращается, но не удлиняется", () => {
  const s = setup();
  const before = s.d.stageAt;
  s.d.hurryGather(5000); // больше длины сбора — не трогает
  assert.equal(s.d.stageAt, before);
  s.d.hurryGather(100);
  assert.ok(s.d.stageAt < before);
  s.run(200);
  assert.equal(s.d.stage, "pull");
});

section("Воскрешение");

await test("отказы: не в бою, живого, себя, без зарядов, далеко, двойной канал", () => {
  const s = setup();
  const [a, b, c] = s.ps;
  assert.ok(s.d.startRevive(a, b), "до боя");
  s.toFight();
  assert.ok(s.d.startRevive(a, b), "живого");
  kill(s, b);
  assert.ok(s.d.startRevive(b, b), "себя");
  const rv = s.d.revives;
  s.d.revives = 0;
  assert.ok(s.d.startRevive(a, b), "без зарядов");
  s.d.revives = rv;
  a.unit.x = b.x + RAID_CFG.revives.range + 50; a.unit.y = b.y;
  assert.ok(s.d.startRevive(a, b), "далеко");
  a.unit.x = b.x + 20; c.unit.x = b.x - 20; c.unit.y = b.y;
  assert.equal(s.d.startRevive(a, b), null);
  assert.ok(s.d.startRevive(c, b), "второй канал на того же");
  assert.equal(s.d.revives, rv, "заряд потрачен при отказе/начале");
});

await test("канал до конца: павший встаёт с долей здоровья, заряд −1, статистика", () => {
  const s = setup();
  const [a, b] = s.ps;
  s.toFight();
  kill(s, b);
  a.unit.x = b.x + 20; a.unit.y = b.y;
  const rv = s.d.revives;
  assert.equal(s.d.startRevive(a, b), null);
  s.d.boss.unit.x = 99999; // босс не мешает каналу
  s.run(RAID_CFG.revives.channelMs + 200, () => !b.dead);
  assert.ok(!b.dead, "не встал");
  assert.equal(b.unit.hp, Math.max(1, Math.round(b.unit.maxHp * RAID_CFG.revives.hpPct)));
  assert.equal(s.d.revives, rv - 1);
  assert.equal(s.d.stats.get(a.name.toLowerCase())!.revives, 1);
});

await test("шаг воскрешающего рвёт канал: павший лежит, заряд цел", () => {
  const s = setup();
  const [a, b] = s.ps;
  s.toFight();
  kill(s, b);
  a.unit.x = b.x + 20; a.unit.y = b.y;
  const rv = s.d.revives;
  s.d.startRevive(a, b);
  s.run(300);
  a.unit.x += 30;
  s.run(RAID_CFG.revives.channelMs + 200);
  assert.ok(b.dead);
  assert.equal(s.d.revives, rv);
  assert.ok(!s.d.channels.has(a));
});

await test("фаза босса добавляет заряды, но не больше максимума", () => {
  const s = setup();
  s.toFight();
  const b = s.d.boss;
  const rv = s.d.revives;
  b.unit.hp = Math.floor(b.unit.maxHp * 0.74);
  s.run(500, () => s.d.phasesSeen.has(1));
  assert.ok(s.d.phasesSeen.has(1), "фаза II не наступила");
  assert.equal(s.d.revives, Math.min(RAID_CFG.revives.max, rv + RAID_CFG.revives.perPhase));
  s.d.revives = RAID_CFG.revives.max;
  b.unit.hp = Math.floor(b.unit.maxHp * 0.49);
  s.run(4000, () => s.d.phasesSeen.has(2));
  assert.ok(s.d.revives <= RAID_CFG.revives.max);
});

section("Вайп, попытки, итог");

await test("все погибли → вайп → вторая попытка: все живы и целы, заряды сброшены; второй вайп → конец без победы", () => {
  let ended: boolean | null = null;
  const s = setup(4, { onEnd: (win) => { ended = win; } });
  s.toFight();
  for (const p of s.ps) kill(s, p);
  s.d.tick();
  assert.equal(s.d.stage, "wipe");
  s.run(1200);
  assert.equal(s.d.attempt, 2);
  assert.equal(s.d.stage, "pull");
  assert.equal(s.d.revives, RAID_CFG.revives.base);
  for (const p of s.ps) assert.ok(!p.dead && p.unit.hp === p.unit.maxHp, `${p.name} не восстановлен`);
  s.toFight();
  for (const p of s.ps) kill(s, p);
  s.run(1200 + 1200);
  assert.equal(s.d.stage, "end");
  assert.equal(s.d.result?.win, false);
  assert.equal(s.d.attempt, RAID_CFG.attempts);
  assert.equal(ended, false, "onEnd не вызван");
});

await test("пока жив хоть один — вайпа нет", () => {
  const s = setup();
  s.toFight();
  for (const p of s.ps.slice(1)) kill(s, p);
  s.d.tick();
  assert.equal(s.d.stage, "fight");
});

await test("победа: результат один раз, onWin один раз, этап end", () => {
  let wins = 0;
  const s = setup(4, { onWin: () => wins++ });
  s.toFight();
  withRandom([0.5], () => s.w.applyDamage(s.d.boss, s.d.boss.unit.hp + 1, s.ps[0]));
  s.run(200);
  assert.equal(s.d.stage, "end");
  assert.equal(s.d.result?.win, true);
  assert.equal(wins, 1);
  s.w.applyDamage(s.d.boss, 10, s.ps[0]);
  s.run(200);
  assert.equal(wins, 1, "победа засчитана дважды");
});

await test("все вышли из комнаты в бою — рейд окончен без победы", () => {
  const s = setup(2);
  s.toFight();
  for (const p of [...s.ps]) s.d.removePlayer(p);
  assert.equal(s.d.stage, "end");
  assert.equal(s.d.result?.win, false);
});

await test("итоги: строка на каждого участника, без NaN", () => {
  const s = setup();
  s.toFight();
  s.run(500);
  const r = s.d.results();
  assert.equal(r.length, 4);
  for (const x of r) assert.ok(Number.isFinite(x.damage) && Number.isFinite(x.healing) && x.deaths >= 0);
});

done();
