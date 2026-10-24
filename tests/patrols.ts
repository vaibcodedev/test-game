/**
 * Бойцы фракций (задача 132, шаг 5; server/src/game/soldiers.ts, data/patrols.json): пост моста бьёт врага и не трогает своих и мобов,
 * верховой враг не уходит от поста (выстрел, спешивание, замедление), без героев рядом бойцы спят, павший возвращается через respawnMin;
 * лучник на башне стены бьёт врага у стены, своих и скрытых не трогает, сам неуязвим; в столице на врага нападает стража его сектора,
 * соседние подтягиваются, только если своих мало, остальные держат посты. Без сервера: мир в памяти, такт 50 мс.
 */
import P from "../data/patrols.json";
import { TILE } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { MOBS } from "../shared/mobs";
import { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";
import { Player, newSave } from "../server/src/game/Player";
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
  const mob = w.addMob(new Mob("tm1", MOBS.wolf, 30, { x: post.x + 60, y: post.y + 40 }));
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

// ---------- 6. столица: стража сектора ----------
{
  const c = capital.city!.c;
  const sectorOf = (m: Mob) => m.soldier!.sector;
  const nb = (a: number, b: number) => a !== b && Math.abs((a % capital.city!.cols) - (b % capital.city!.cols)) <= 1 && Math.abs(Math.floor(a / capital.city!.cols) - Math.floor(b / capital.city!.cols)) <= 1;
  // враг в северо-западном секторе Мортхейма
  const spot = { x: (c.x - 8) * TILE + 16, y: (c.y - 5) * TILE + 16 };
  const sec = S.sectorOf(capital, spot.x, spot.y);
  const foe = hero("warrior", spot.x, spot.y);
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

console.log(bad ? `\n${bad} FAIL` : "\nвсё ок");
process.exit(bad ? 1 : 0);
