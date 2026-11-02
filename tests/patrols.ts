/**
 * Бойцы фракций (задача 132, шаг 5; server/src/game/soldiers.ts, data/patrols.json): пост моста бьёт врага и не трогает своих и мобов,
 * верховой враг не уходит от поста (выстрел, спешивание, замедление), без героев рядом бойцы спят, павший возвращается через respawnMin;
 * лучник на башне стены бьёт врага у стены, своих и скрытых не трогает, сам неуязвим; в столице на врага нападает стража его сектора,
 * соседние подтягиваются, только если своих мало, остальные держат посты; обереги (шаг 6) раскрывают скрытых врагов у моста (разбойник, тёмный следопыт),
 * их бьёт пост, «Раскрыт» не даёт скрыться revealMs, своего скрытого не трогают, в городе скрытность снимается. Без сервера: мир в памяти, такт 50 мс.
 */
import P from "../data/patrols.json";
import NR from "../data/npc-ranks.json";
import { isLeaderPower, npcPowerStats } from "../server/src/game/soldiers";
import { revealedLeft, WARDS } from "../server/src/game/wards";
import { castSkill } from "../server/src/game/skills";
import { TILE } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { MOBS } from "../shared/mobs";
import { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";
import { Player, newSave } from "../server/src/game/Player";
import type { PlayerSave } from "../server/src/db";
import { raidBotSave } from "../server/src/arena/botgear";
import { WorldState } from "../server/src/rooms/schema";
import type { ClassId } from "../shared/classes";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };

const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) if (!m.faction) w.removeMob(m);
const S = w.soldiers!;
/** Удары за прогон: кто, кого, сколько (World.onDamage — из hitEx). */
let hits: { src: unknown; dst: unknown; v: number }[] = [];
w.onDamage = (src, dst, v) => hits.push({ src, dst, v });
const keep: Player[] = [];
const run = (ms: number, each?: () => void) => {
  for (let t = 0; t < ms; t += 50) {
    for (const p of keep) p.unit.hp = p.unit.maxHp;
    each?.();
    w.update(50);
  }
};
let uid = 0;
function hero(cls: ClassId, x: number, y: number, level = 40): Player {
  const save = newSave(cls, { x, y });
  save.level = level;
  const p = new Player(`h${++uid}`, `Герой${uid}`, save, () => {});
  w.addPlayer(p);
  p.unit.x = x;
  p.unit.y = y;
  keep.push(p);
  return p;
}
const drop = (p: Player) => { w.removePlayer(p.id); keep.splice(keep.indexOf(p), 1); };
const dmgTo = (dst: unknown, src?: (s: unknown) => boolean) => hits.filter((h) => h.dst === dst && (!src || src(h.src))).reduce((a, h) => a + h.v, 0);
const isSoldier = (s: unknown) => s instanceof Mob && !!s.faction;
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- 0. расстановка ----------
const bridgePosts = S.list.filter((m) => m.soldier!.role === "post" && !m.soldier!.site);
const capital = S.sites.find((s) => s.city && !s.city.c.fort && s.faction === "umbrath")!;
const fort = S.sites.find((s) => s.city?.c.fort)!;
check("пост на каждом мосту (6 мостов)", new Set(bridgePosts.map((m) => m.soldier!.group)).size === 6, `${bridgePosts.length} бойцов`);
check("патрули на дорогах обеих фракций", ["solgard", "umbrath"].every((f) => S.list.some((m) => m.faction === f && m.soldier!.role === "patrol")));
check("в столице стражи больше, чем в форте", capital.guards.length > fort.guards.length, `${capital.guards.length} против ${fort.guards.length}`);
check("башни с лучниками на стенах обеих фракций", S.towers.some((t) => t.faction === "solgard") && S.towers.some((t) => t.faction === "umbrath"), `${S.towers.length}`);

// ---------- 0б. числа и сила (шаг 7, data/npc-ranks.json) ----------
{
  const patrolGroups = [...new Set(S.list.filter((m) => m.soldier!.role === "patrol").map((m) => m.soldier!.group))];
  check("патрули по 4: 2 ближника и 2 дальника", patrolGroups.length > 0 && patrolGroups.every((g) => g.length === 4 && g.filter((m) => m.soldier!.ranged).length === 2), `${patrolGroups.length} патрулей`);
  const bridgeGroups = [...new Set(bridgePosts.map((m) => m.soldier!.group))];
  check("на мосту 5–6 бойцов с дальниками и вожак-капитан", bridgeGroups.every((g) => g.length >= 5 && g.some((m) => m.soldier!.ranged) && g.filter((m) => m.soldier!.power === "captain").length === 1),
    bridgeGroups.map((g) => g.length).join(","));
  const bridgeRegular = bridgePosts.find((m) => !m.soldier!.power && !m.soldier!.ranged)!, roadRegular = S.list.find((m) => m.soldier!.role === "patrol" && !m.soldier!.power && !m.soldier!.ranged && m.level === bridgeRegular.level);
  check("обычный боец моста сильнее патрульного того же уровня", !roadRegular || (bridgeRegular.stats.maxHp > roadRegular.stats.maxHp && bridgeRegular.stats.dmg > roadRegular.stats.dmg));
  // вожаки групп (решение владельца 2026-11-02; подробно — tests/unit/npc-leaders.ts): чемпионов вне отрядов Полей нет
  const champ = bridgeGroups[0][0];
  check("вожак моста: статы героя 100 ур., уровень 100 уходит клиенту (рамка цели)", isLeaderPower(champ.soldier!.power) && champ.level === 100 && champ.unit.level === 100 && champ.dmgTakenMul < 1 && champ.stats.maxHp === npcPowerStats(champ.faction as "solgard", champ.soldier!.ranged ? "ranged" : "melee", { kind: "leader", place: "bridge" }, champ.def.attackCd).maxHp);
  const settle = S.sites.filter((s) => !s.city);
  check("в поселениях посты по периметру и у ворот (≥ 8 стражи)", settle.every((s) => s.guards.length >= 8 && s.guards.some((g) => g.soldier!.ranged)), settle.map((s) => s.guards.length).join(","));
  check("стражи: столица > форт > поселение", capital.guards.length > fort.guards.length && fort.guards.length > Math.max(...settle.map((s) => s.guards.length)), `${capital.guards.length} > ${fort.guards.length}`);
  const caps = S.sites.filter((s) => s.city && !s.city.c.fort);
  check("стража столиц — по званиям (+1…+10)", caps.every((s) => s.guards.every((g) => g.soldier!.power.startsWith("rank") && g.level === 100)) &&
    new Set(caps[0].guards.map((g) => g.soldier!.power)).size === NR.capital.ranks.length);
  const st = (r: number) => npcPowerStats("umbrath", "melee", { kind: "rank", rank: r }, 1.2);
  check("звание выше — сильнее", NR.capital.ranks.every((_, r) => !r || (st(r).dmg > st(r - 1).dmg && st(r).armor >= st(r - 1).armor)) && NR.capital.ranks[0].plus === 1 && NR.capital.ranks.at(-1)!.plus === 10);
  const ember = npcPowerStats("umbrath", "melee", { kind: "ember" }, 1.2), top = st(NR.capital.ranks.length - 1);
  check("стража Эмберхолла сильнее столичной и неуязвима", ember.maxHp > top.maxHp * 2 && ember.dmg > top.dmg && w.town!.folk.some((f) => f.guard));
  const plusOf = (s: string) => s.split("|").filter(Boolean).map((g) => Number(g.split(":")[1]) || 0);
  check("у NPC plus = 0 (ни контура, ни частиц заточки)", S.list.every((m) => (!m.unit.weapon || Number(m.unit.weapon.split(":")[2]) === 0) && plusOf(m.unit.gear).every((v) => v === 0)));
}

// ---------- 1. пост моста: бьёт врага, не трогает своих и мобов ----------
const post = bridgePosts.find((m) => m.faction === "solgard" && !m.soldier!.ranged && Math.abs(m.y / TILE - 180) < 3)!;
{
  const foe = hero("deathknight", post.x + 100, post.y);
  hits = [];
  run(3000);
  check("пост бьёт героя чужой фракции (через hit)", dmgTo(foe, isSoldier) > 0, `урон ${dmgTo(foe, isSoldier)}`);
  check("враг видит бойца в площадных (enemiesInCircle)", w.enemiesInCircle(foe, post.x, post.y, 120).includes(post));
  drop(foe);
  run(4000); // вернулись на пост
}
{
  const own = hero("warrior", post.x + 100, post.y);
  const mob = w.addMob(new Mob("tm1", MOBS.wolffolk_chaser, 30, { x: post.x + 60, y: post.y + 40 }));
  hits = [];
  run(3000);
  check("свой герой рядом с постом цел", dmgTo(own, isSoldier) === 0);
  check("на своего никто не нацелен", !S.list.some((m) => m.soldier!.foe === own));
  check("моба у поста бойцы не трогают", dmgTo(mob, isSoldier) === 0 && !S.list.some((m) => m.soldier!.mobFoe === mob));
  check("свой не видит бойца в площадных (enemiesInCircle)", !w.enemiesInCircle(own, post.x, post.y, 200).includes(post));
  const hp0 = post.unit.hp;
  check("удар своего по бойцу не проходит", w.hit(own, post) === 0 && post.unit.hp === hp0 && !w.hostile(own, post));
  check("боец не враг мобам и чужим бойцам", !w.hostile(post, mob) && !w.hostile(post, S.list.find((m) => m.faction === "umbrath")!));
  w.removeMob(mob);
  drop(own);
}

// ---------- 2. верховой враг не уходит от поста ----------
{
  const ride = (cls: ClassId) => {
    const p = hero(cls, post.x + 150, post.y);
    p.unit.mount = "horse";
    p.unit.maxHp = p.unit.hp = 1e9; // чемпион поста (шаг 7) убивает голого героя 40 ур. с одного удара — смотрим выстрел и замедление
    let slowed = false, start = { x: p.x, y: p.y };
    hits = [];
    run(4000, () => { p.input = { mx: -1, my: 0 }; if (p.slowUntil > w.time) slowed = true; });
    const r = { p, slowed, went: d(p, start), mount: p.unit.mount, hurt: dmgTo(p, isSoldier) };
    p.input = { mx: 0, my: 0 };
    drop(p);
    run(5000);
    return r;
  };
  const ownRide = ride("warrior");
  const foeRide = ride("deathknight");
  check("свой верховой проезжает мимо поста (контроль)", ownRide.mount === "horse" && ownRide.went > 600, `${ownRide.went.toFixed(0)} px`);
  check("враг на коне: выстрел, спешен и замедлен", foeRide.hurt > 0 && foeRide.mount === "" && foeRide.slowed, `урон ${foeRide.hurt}, конь «${foeRide.mount}»`);
  check("враг на коне не уходит от поста", foeRide.went < 500 && d(foeRide.p, post.soldier!.post!) < 560, `проехал ${foeRide.went.toFixed(0)} px`);
}

// ---------- 3. без героев рядом бойцы спят ----------
{
  const patrols = S.list.filter((m) => m.soldier!.role === "patrol");
  const at = new Map(patrols.map((m) => [m, { x: m.x, y: m.y }]));
  run(5000);
  check("без героев патрули стоят (спят)", patrols.every((m) => d(m, at.get(m)!) < 0.5));
  const sol = patrols.find((m) => m.faction === "solgard" && m.level > 20)!, far = patrols.find((m) => m.faction === "umbrath")!;
  const a0 = { x: sol.x, y: sol.y }, f0 = { x: far.x, y: far.y };
  const own = hero("warrior", sol.x + 40, sol.y + 40);
  run(8000);
  check("рядом с героем патруль идёт по дороге", d(sol, a0) > 40, `${d(sol, a0).toFixed(0)} px`);
  check("далёкий патруль спит", d(far, f0) < 0.5);
  drop(own);
}

// ---------- 4. гибель и возврат через respawnMin ----------
{
  const m = bridgePosts.find((x) => x.faction === "umbrath")!;
  const foe = hero("warrior", m.x + 60, m.y);
  w.applyDamage(m, m.unit.hp + 1, foe);
  drop(foe);
  const left = m.respawnAt - w.time;
  check("боец пал, вернётся через respawnMin", m.dead && Math.abs(left - P.respawnMin * 60000) < 100, `${(left / 1000).toFixed(0)} с`);
  run(left + 500);
  check("боец вернулся на пост", !m.dead && d(m, m.home) < 2 && m.unit.hp === m.unit.maxHp);
}

// ---------- 5. башня с лучником ----------
{
  const tw = S.towers.find((t) => t.faction === "solgard" && Math.abs(t.mob.y / TILE - 110) < 3)!;
  const spot = { x: tw.x + 150, y: tw.mob.y };
  const isTower = (s: unknown) => s === tw.mob;
  let p = hero("deathknight", spot.x, spot.y);
  hits = [];
  run(4000);
  check("башня бьёт врага у стены", dmgTo(p, isTower) > 0, `урон ${dmgTo(p, isTower)}`);
  check("лучник башни неуязвим и не цель", w.hit(p, tw.mob) === 0 && !w.mobs.has(tw.mob.id));
  drop(p);
  p = hero("deathknight", spot.x, spot.y);
  hits = [];
  run(4000, () => { p.stealthUntil = w.time + 1000; });
  check("скрытого башня не видит", dmgTo(p, isTower) === 0);
  drop(p);
  p = hero("warrior", spot.x, spot.y);
  hits = [];
  run(4000);
  check("своего башня не трогает", dmgTo(p, isTower) === 0);
  drop(p);
}

// ---------- 5б. башни: доля здоровья и пристрелка ----------
{
  const T = P.towers, R = T.range;
  const isAnyTower = (s: unknown) => S.towers.some((t) => t.mob === s);
  const foeTowers = (x: number, y: number) => S.towers.filter((t) => t.faction === "solgard" && Math.hypot(t.x - x, t.y - y) < R).length;
  const tw = S.towers.find((t) => t.faction === "solgard" && Math.abs(t.mob.y / TILE - 110) < 3)!;
  /** Точка у башни tw, где в радиусе ровно n башен Сольгарда (перебор кольцами). */
  const spotWith = (n: number, from = tw) => {
    for (let r = 60; r < R; r += 30) for (let k = 0; k < 24; k++) {
      const x = from.x + Math.cos((k / 24) * Math.PI * 2) * r, y = from.y + Math.sin((k / 24) * Math.PI * 2) * r;
      if (foeTowers(x, y) === n) return { x, y };
    }
    return null;
  };
  const mk = (save: PlayerSave, x: number, y: number) => {
    const p = new Player(`h${++uid}`, `Герой${uid}`, save, () => {});
    w.addPlayer(p);
    p.unit.x = x;
    p.unit.y = y;
    return p;
  };
  const naked40 = () => { const s = newSave("deathknight", { x: 0, y: 0 }); s.level = 40; for (const k of Object.keys(s.equip)) (s.equip as Record<string, unknown>)[k] = null; return s; };
  const max100 = () => { const s = raidBotSave("deathknight", 100, "", "max"); for (const it of Object.values(s.equip)) if (it) it.plus = 10; return s; };
  /** Стоит под башнями (здоровье держим полным, считаем урон башен): мс до набора урона = maxHp (смерть), доля за 30 с. */
  const stand = (save: PlayerSave, at: { x: number; y: number }) => {
    const p = mk(save, at.x, at.y);
    keep.push(p);
    hits = [];
    let death = -1;
    for (let t = 0; t < 30000; t += 50) {
      p.unit.hp = p.unit.maxHp;
      p.unit.x = at.x; p.unit.y = at.y;
      w.update(50);
      if (death < 0 && dmgTo(p, isAnyTower) >= p.unit.maxHp) death = t + 50;
    }
    const share = dmgTo(p, isAnyTower) / p.unit.maxHp;
    drop(p);
    return { death, share, hp: p.unit.maxHp, armor: p.derived.armor };
  };
  run(6000); // башни перезарядились, прошлые пристрелки сброшены
  // пробежка мимо башни: 150 px/с по прямой в 300 px от лучника
  {
    const p = mk(naked40(), tw.x - 700, tw.y + 300);
    hits = [];
    let shots = 0;
    for (let x = tw.x - 700; x <= tw.x + 700; x += 7.5) {
      p.unit.x = x; p.unit.y = tw.y + 300;
      w.update(50);
    }
    run(1500);
    shots = hits.filter((h) => h.dst === p && isAnyTower(h.src)).length;
    const lost = dmgTo(p, isAnyTower) / p.unit.maxHp;
    check("герой 40 ур. без экипировки пробегает мимо башни и выживает", lost < 1 && shots >= 2 && shots <= 6, `${shots} выстрелов, −${(lost * 100).toFixed(0)} % здоровья`);
    w.removePlayer(p.id);
  }
  // пристрелка сбрасывается после ухода из радиуса
  {
    const at = spotWith(1)!;
    const p = mk(naked40(), at.x, at.y);
    keep.push(p);
    run(6000);
    const vals = () => hits.filter((h) => h.dst === p && isAnyTower(h.src)).map((h) => h.v);
    hits = [];
    run(5000, () => { p.unit.x = at.x; p.unit.y = at.y; });
    const a = vals();
    hits = [];
    run(T.resetMs + 1500, () => { p.unit.x = tw.x + 3000; p.unit.y = tw.y; });
    hits = [];
    run(1600, () => { p.unit.x = at.x; p.unit.y = at.y; });
    const b = vals();
    check("пристрелка растёт с каждым выстрелом", a.length >= 3 && a.every((v, i) => !i || v > a[i - 1]), a.join(" → "));
    check("ушёл дальше resetMs — пристрелка с нуля", b.length >= 1 && b[0] < a[0] && b[0] <= Math.ceil(p.unit.maxHp * T.pctMaxHp), `${a.at(-1)} → ${b[0]} (без пристрелки ${Math.round(p.unit.maxHp * T.pctMaxHp)} до брони)`);
    drop(p);
  }
  const one = spotWith(1)!, pair = spotWith(2, S.towers.find((t) => t.faction === "solgard" && spotWith(2, t))!)!;
  const r40 = stand(naked40(), one), r40b = stand(naked40(), pair);
  const r100 = stand(max100(), one), r100b = stand(max100(), pair);
  const sec = (r: { death: number }) => r.death < 0 ? "жив" : `${(r.death / 1000).toFixed(1)} с`;
  console.log(`  до смерти у стены: 40 ур. без экипировки — 1 башня ${sec(r40)}, 2 башни ${sec(r40b)}; 100 ур. +10 (hp ${r100.hp}, броня ${r100.armor}) — 1 башня ${sec(r100)}, 2 башни ${sec(r100b)}`);
  check("герой 100 ур. в легендарках +10 под башней 30 с — погибает", r100.death > 0 || r100.share > 0.8, `урон ${(r100.share * 100).toFixed(0)} % здоровья`);
  // свой под башней цел
  {
    const s = raidBotSave("warrior", 100, "", "max");
    for (const it of Object.values(s.equip)) if (it) it.plus = 10;
    const own = mk(s, one.x, one.y);
    keep.push(own);
    hits = [];
    run(8000, () => { own.unit.x = one.x; own.unit.y = one.y; });
    check("своего башня не трогает (100 ур.)", dmgTo(own, isAnyTower) === 0 && !S.towerRamp.get(own.id)?.n);
    drop(own);
  }
}

// ---------- 6. столица: стража сектора ----------
{
  const c = capital.city!.c;
  const sectorOf = (m: Mob) => m.soldier!.sector;
  const nb = (a: number, b: number) => a !== b && Math.abs((a % capital.city!.cols) - (b % capital.city!.cols)) <= 1 && Math.abs(Math.floor(a / capital.city!.cols) - Math.floor(b / capital.city!.cols)) <= 1;
  // враг в северо-западном секторе Мортхейма
  const spot = { x: (c.x - 8) * TILE + 16, y: (c.y - 5) * TILE + 16 };
  const sec = S.sectorOf(capital, spot.x, spot.y);
  const foe = hero("warrior", spot.x, spot.y);
  foe.unit.maxHp = foe.unit.hp = 1e9; // стража столицы бьёт как герой 100 ур. (шаг 7): за такт не убьёт, бой сектора виден целиком
  hits = [];
  run(3000);
  const resp = capital.guards.filter((g) => g.soldier!.foe === foe);
  const own = capital.guards.filter((g) => sectorOf(g) === sec);
  const others = capital.guards.filter((g) => sectorOf(g) !== sec);
  check("на врага вышла вся стража его сектора", own.length >= capital.city!.min && own.every((g) => g.soldier!.foe === foe), `${resp.length} из ${own.length}`);
  check("и ближники, и дальники", resp.some((g) => g.soldier!.ranged) && resp.some((g) => !g.soldier!.ranged));
  check("остальные секторы держат посты", others.every((g) => !g.soldier!.foe && d(g, g.soldier!.post!) < 6));
  check("стража бьёт врага в столице", dmgTo(foe, (s) => capital.guards.includes(s as Mob)) > 0);
  // своих мало: двое из сектора пали — подтягиваются соседние, дальние держат
  for (const g of own.slice(0, own.length - 1)) w.applyDamage(g, g.unit.hp + 1, foe);
  run(1200);
  const resp2 = capital.guards.filter((g) => !g.dead && g.soldier!.foe === foe);
  check("своих мало — подтянулись соседние секторы", resp2.length >= capital.city!.min && resp2.some((g) => sectorOf(g) !== sec) && resp2.every((g) => sectorOf(g) === sec || nb(sectorOf(g), sec)),
    resp2.map((g) => sectorOf(g)).join(","));
  check("дальние секторы держат посты", capital.guards.filter((g) => sectorOf(g) !== sec && !nb(sectorOf(g), sec)).every((g) => !g.soldier!.foe));
  drop(foe);
  run(6000);
  check("враг ушёл — стража вернулась на посты", capital.guards.filter((g) => !g.dead).every((g) => !g.soldier!.foe && d(g, g.soldier!.post!) < 8));
}

// своих героев в своей столице стража не трогает
{
  const c = CITIES.find((x) => x.id === capital.city!.c.id)!;
  const p = hero("deathknight", c.spawn.x, c.spawn.y);
  hits = [];
  run(2000);
  check("свой герой в своей столице цел", dmgTo(p, isSoldier) === 0 && !capital.guards.some((g) => g.soldier!.foe === p));
  drop(p);
}

// ---------- 7. поводок от дома (data/patrols.json zones): убегающего не гонят через полкарты ----------
{
  const Z = P.zones;
  // уводит врага от точки from по направлению (dx, dy) со скоростью героя, потом стоит вдали; max — как далеко отходил каждый боец от дома
  const flee = (from: { x: number; y: number }, dx: number, dy: number, who: Mob[], sec: number) => {
    const p = hero(who[0].faction === "umbrath" ? "warrior" : "deathknight", from.x, from.y);
    p.unit.maxHp = p.unit.hp = 1e9;
    run(1500);
    const engaged = who.filter((g) => g.soldier!.foe === p).length;
    const far = new Map<Mob, number>();
    run(sec * 1000, () => {
      if (Math.hypot(p.x - from.x, p.y - from.y) < 60 * TILE) { p.unit.x += dx * 8; p.unit.y += dy * 8; }
      for (const g of who) far.set(g, Math.max(far.get(g) ?? 0, d(g, p.x === from.x ? g : g.home)));
    });
    const chasing = who.filter((g) => g.soldier!.foe === p).length;
    drop(p);
    run(15000);
    return { engaged, chasing, far };
  };
  // столица: враг у северных ворот изнутри убегает на север
  const c = capital.city!.c;
  const r1 = flee({ x: c.x * TILE + 16, y: (c.y - 8) * TILE }, 0, -1, capital.guards, 14);
  const outCity = (g: Mob) => Math.max(0, Math.abs(g.y / TILE - (c.y + 0.5)) - c.half.y - 0.5, Math.abs(g.x / TILE - (c.x + 0.5)) - c.half.x - 0.5);
  check("стража столицы вышла на врага", r1.engaged > 0, `${r1.engaged}`);
  check(`враг ушёл дальше ${Z.city} тайлов от стен — стража отстала`, r1.chasing === 0);
  check("стража не уходит дальше zones.city + slack от стен", capital.guards.every((g) => outCity(g) <= Z.city + Z.slack + 1));
  check("стража столицы вернулась на посты", capital.guards.filter((g) => !g.dead).every((g) => !g.soldier!.foe && d(g, g.soldier!.post!) < 8));
  // пост моста: враг уходит прочь от реки
  const bp = bridgePosts.filter((m) => m.faction === "umbrath");
  const g0 = bp[0].soldier!.group;
  const r2 = flee({ x: bp[0].x - 120, y: bp[0].y }, 1, 0, g0, 14);
  check("пост моста вышел на врага и отстал за zones.bridge", r2.engaged > 0 && r2.chasing === 0, `${r2.engaged}/${r2.chasing}`);
  check("пост моста не уходит дальше zones.bridge + slack", g0.every((g) => (r2.far.get(g) ?? 0) <= (Z.bridge + Z.slack + 1) * TILE), Math.max(...g0.map((g) => r2.far.get(g) ?? 0)).toFixed(0));
  check("пост моста вернулся", g0.every((g) => g.dead || (!g.soldier!.foe && d(g, g.soldier!.post!) < 8)));
  // патруль: враг уводит его в сторону от дороги
  const pt = S.list.find((m) => m.soldier!.role === "patrol" && m.faction === "solgard")!, pg = pt.soldier!.group;
  const r3 = flee({ x: pt.x, y: pt.y + 80 }, 0, 1, pg, 14);
  check("патруль вышел на врага и отстал у края полосы маршрута", r3.engaged > 0 && r3.chasing === 0, `${r3.engaged}/${r3.chasing}`);
  check("патруль вернулся на маршрут", pg.every((g) => g.dead || !g.soldier!.foe));
}

// ---------- 8. обереги (шаг 6, server/src/game/wards.ts): скрытого врага раскрывают и зовут бойцов, своего — нет; «Раскрыт» 10 с ----------
{
  const wardOf = (at: string, f: string) => WARDS.find((o) => o.at === at && o.faction === f)!;
  const hidden = (cls: ClassId, x: number, y: number, skills: string[]) => {
    const p = hero(cls, x, y);
    for (const s of skills) p.save.skills[s] = 1;
    p.unit.maxHp = p.unit.hp = 1e9; // чемпион поста убивает голого героя с одного удара — смотрим раскрытие и удары
    p.stealthUntil = w.time + 60000;
    return p;
  };
  const cast = (p: Player, id: string) => { p.unit.mp = p.unit.maxMp; p.gcdUntil = 0; p.cds.delete(id); return castSkill(w, p, id, p.x, p.y, null); };
  for (const [cls, at, skill] of [["darkranger", wardOf("bridge_M", "solgard"), "dr_shadowmeld"], ["rogue", wardOf("bridge_M", "umbrath"), "stealth"]] as const) {
    const p = hidden(cls, at.x + 40, at.y + 20, [skill]);
    hits = [];
    run(600);
    check(`скрытый ${cls} у оберега моста раскрыт`, p.stealthUntil <= w.time && revealedLeft(w, p) > 0, `скрыт ещё ${Math.max(0, p.stealthUntil - w.time)} мс`);
    const ban = cast(p, skill);
    check(`${cls}: под «Раскрыт» скрыться нельзя`, !!ban && ban.startsWith("Раскрыт") && p.stealthUntil <= w.time, `${ban}`);
    run(3500);
    check(`${cls}: оберег позвал пост — раскрытого бьют`, dmgTo(p, isSoldier) > 0 && S.list.some((m) => m.soldier!.foe === p || dmgTo(p, (s) => s === m) > 0), `урон ${dmgTo(p, isSoldier)}`);
    // уходит в поле подальше от постов: через 10 с после раскрытия снова может скрыться
    p.unit.x = 300 * TILE; p.unit.y = 100 * TILE;
    run(P.wards.revealMs - 4100 + 300);
    check(`${cls}: через ${P.wards.revealMs / 1000} с «Раскрыт» снят и скрыться можно`, revealedLeft(w, p) === 0 && cast(p, skill) === null && p.stealthUntil > w.time, `${revealedLeft(w, p)} мс`);
    drop(p);
    run(5000);
  }
  {
    const at = wardOf("bridge_M", "solgard");
    const own = hidden("rogue", at.x + 40, at.y + 20, ["stealth"]);
    hits = [];
    run(1500);
    check("свой скрытый у оберега не раскрыт", own.stealthUntil > w.time && revealedLeft(w, own) === 0 && dmgTo(own, isSoldier) === 0);
    drop(own);
  }
  {
    const cap = CITIES.find((c) => c.capital === "solgard" && !c.fort)!;
    const p = hidden("rogue", cap.spawn.x, cap.spawn.y, ["stealth"]);
    run(600);
    check("в городе скрытность снимается", p.stealthUntil <= w.time && revealedLeft(w, p) === 0);
    drop(p);
  }
  check("обереги: у каждого моста по два, у поселений и фортов — свои", WARDS.filter((o) => o.at.startsWith("bridge_")).length === 6 && WARDS.length === P.wards.list.length);
}

console.log(bad ? `\n${bad} FAIL` : "\nвсё ок");
process.exit(bad ? 1 : 0);
