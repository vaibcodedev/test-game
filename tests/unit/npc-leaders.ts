/**
 * Вожаки групп бойцов фракций (решение владельца 2026-11-02; server/src/game/soldiers.ts, data/npc-ranks.json leaders, data/npc-gear.json):
 * в каждом патруле, посту моста, страже поселения и форта ровно один вожак — первый боец группы, звание места (патруль и поселение — сержант,
 * мост и форт — капитан), имя и сила из данных, титул над именем, снаряжение рангом выше остальных бойцов места, знаменосец — первый не-вожак
 * (кроме фортов). Глобального счёта чемпионов нет: чемпион — только первый в отряде на Полях; в столицах — звания. Вожак погиб — возвращается
 * через respawnMin, и в группе снова ровно один вожак. Мир в памяти, без сервера. Запуск: npx tsx tests/unit/npc-leaders.ts
 */
import NR from "../../data/npc-ranks.json";
import NG from "../../data/npc-gear.json";
import P from "../../data/patrols.json";
import { World } from "../../server/src/game/World";
import { WorldState } from "../../server/src/rooms/schema";
import type { Mob } from "../../server/src/game/Mob";
import { isLeaderPower, leaderRank, npcPowerStats, type LeaderPlace } from "../../server/src/game/soldiers";
import { assert, done, section, test } from "./lib";

const w = new World(new WorldState(), () => {}, { quiet: true } as never);
const S = w.soldiers!;
const TIER = ["weak", "mid", "strong", "mega"];
const leaders = (g: Mob[]) => g.filter((m) => isLeaderPower(m.soldier!.power));
const uniq = (l: Mob[]) => [...new Set(l.map((m) => m.soldier!.group))];

const groups: Record<LeaderPlace, Mob[][]> = {
  patrol: uniq(S.list.filter((m) => m.soldier!.role === "patrol" && !m.soldier!.squad)),
  bridge: uniq(S.list.filter((m) => m.soldier!.role === "post" && !m.soldier!.site)),
  settlement: S.sites.filter((s) => !s.city).map((s) => s.guards),
  fort: S.sites.filter((s) => s.city?.c.fort).map((s) => s.guards),
};

for (const place of Object.keys(groups) as LeaderPlace[]) {
  section(`вожак: ${place}`);
  const gs = groups[place], rank = leaderRank(place);
  await test("группы есть", () => assert.ok(gs.length > 0, place));
  await test(`в каждой группе ровно один вожак (${rank}) и он первый`, () => {
    for (const g of gs) {
      const l = leaders(g);
      assert.equal(l.length, 1, `${place}: вожаков ${l.length}`);
      assert.equal(l[0], g[0]);
      assert.equal(l[0].soldier!.power, rank);
    }
  });
  await test("звание по месту: патруль и поселение — сержант, мост и форт — капитан", () =>
    assert.equal(rank, place === "patrol" || place === "settlement" ? "sergeant" : "captain"));
  await test("имя, титул и сила — из данных (уровень 100)", () => {
    for (const g of gs) {
      const m = g[0], f = m.faction as "solgard" | "umbrath", kind = m.soldier!.ranged ? "ranged" : "melee";
      assert.equal(m.unit.name, (NR.leaders.ranks as Record<string, { names: Record<string, Record<string, string>> }>)[rank].names[f][kind]);
      assert.equal(m.unit.title, (NG.leaderTitle as Record<string, string>)[place]);
      assert.equal(m.level, 100);
      assert.equal(m.stats.maxHp, npcPowerStats(f, kind, { kind: "leader", place }, m.def.attackCd).maxHp);
    }
  });
  await test("снаряжение вожака — ранг выше остальных бойцов места", () => {
    const T = NG.tiers as Record<string, unknown>;
    assert.ok(TIER.indexOf((T.leaders as Record<string, string>)[place]) > TIER.indexOf(T[place] as string));
  });
  await test("ни одного чемпиона в группе", () => assert.ok(gs.every((g) => g.every((m) => m.soldier!.power !== "champion"))));
  if (place !== "fort") await test("знаменосец — первый не-вожак (ровно один)", () => {
    for (const g of gs) {
      const b = g.filter((m) => (m.unit.herald ?? "").includes("b"));
      assert.equal(b.length, 1);
      assert.equal(b[0], g[1]);
    }
  });
}

section("столица и отряды");
await test("в столицах вожаков нет — звания стражи", () => {
  const caps = S.sites.filter((s) => s.city && !s.city.c.fort);
  assert.ok(caps.length > 0 && caps.every((s) => s.guards.every((g) => g.soldier!.power.startsWith("rank"))));
});
await test("глобального счёта чемпионов нет: вне отрядов чемпионов нет", () => assert.ok(S.list.every((m) => m.soldier!.power !== "champion")));
await test("отряд на Полях: первый — чемпион, вожаков нет", () => {
  const q = S.spawnSquad("solgard")!;
  assert.ok(q && q.group[0].soldier!.power === "champion" && leaders(q.group).length === 0);
});
await test("капитан сильнее сержанта", () => {
  const a = npcPowerStats("umbrath", "melee", { kind: "leader", place: "patrol" }, 1.2), b = npcPowerStats("umbrath", "melee", { kind: "leader", place: "bridge" }, 1.2);
  assert.ok(b.maxHp > a.maxHp && b.dmg > a.dmg);
});

section("гибель и возврат");
for (const place of Object.keys(groups) as LeaderPlace[]) {
  await test(`${place}: вожак и группа пали — вернутся через respawnMin, вожак снова один`, () => {
    const g = groups[place][0], lead = g[0];
    for (const m of g) w.applyDamage(m, m.unit.hp + 1, null as never);
    assert.ok(g.every((m) => m.dead));
    assert.ok(g.every((m) => Math.abs(m.respawnAt - w.time - P.respawnMin * 60000) < 100), "respawnMin");
    for (const m of g) { m.respawnAt = w.time; S.step(m, 0.05); }
    assert.ok(g.every((m) => !m.dead));
    const l = leaders(g);
    assert.equal(l.length, 1);
    assert.equal(l[0], lead);
    assert.equal(lead.unit.hp, lead.unit.maxHp);
    assert.equal(lead.unit.title, (NG.leaderTitle as Record<string, string>)[place]);
  });
}

done();
