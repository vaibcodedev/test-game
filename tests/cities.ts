/**
 * Проверка городов и поселений без сервера: все точки проходимы и связаны между собой и с внешним миром (заливка по клеткам).
 * Поселения (задача 132, шаг 3): ограда замкнута, вход только через ворота, к воротам ведёт дорога от столицы; торговец, повар, камень, возрождение,
 * посты и патруль стражи — на проходимых и досягаемых клетках; в круге поселения нет мобов; штандарты своей фракции стоят у ворот и по углам.
 * Банк, заточка и сумки — в Эмберхолле и в обеих столицах; все NPC мира (shared/npcs.ts) досягаемы.
 */
import { BAGMEN } from "../shared/bags";
import { BANKERS } from "../shared/bank";
import { CITIES, CITY_CITIZEN_SPOTS, CITY_GATE_GUARDS, CITY_PATROLS, CITY_GATES, cityAtTile, teleportPrice, nearestCity, homeCity, isEnemyCapital, inEmberWalls } from "../shared/cities";
import { MAP_SEED, MERCHANT_RANGE, TILE } from "../shared/constants";
import { factionLandAt } from "../shared/factions";
import { COOKS } from "../shared/food";
import { generateMap, isTownZone, roadDist, walkable, zoneAtPx, ZONES, Zone } from "../shared/map";
import { WORLD_NPCS } from "../shared/npcs";
import { RUMOR_ERRORS } from "../shared/rumors";
import { segmentWalkable } from "../shared/path";
import { gateCells, insideRing, SETTLEMENTS, settleDist } from "../shared/settlements";
import { BELT_HALF, CITIZEN_SPOTS, GATE_GUARDS, GUARD_RANGE_TILES, PATROLS, TOWN } from "../shared/town";
import { SKILLS, isAttackSkill } from "../shared/skills";
import { QUEST_GIVERS, QUESTS } from "../shared/quests";
import { SMITHS } from "../shared/upgrade";

const m = generateMap(MAP_SEED);
let bad = 0;
const fail = (s: string) => { bad++; console.log("FAIL", s); };
const R = 10;
const ok = (px: number, py: number) => walkable(m, px, py, R);
// заливка от точки по центрам клеток (8 соседей, без срезания углов)
function flood(sx: number, sy: number) {
  const seen = new Set<number>();
  const q: [number, number][] = [[Math.floor(sx / TILE), Math.floor(sy / TILE)]];
  const key = (x: number, y: number) => y * 4096 + x;
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx > m.w - 2 || ny > m.h - 2 || seen.has(key(nx, ny))) continue;
      if (!ok(nx * TILE + 16, ny * TILE + 16)) continue;
      if (dx && dy && (!ok((x + dx) * TILE + 16, y * TILE + 16) || !ok(x * TILE + 16, (y + dy) * TILE + 16))) continue;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    }
  }
  return seen;
}
const reach = flood(m.playerSpawn.x, m.playerSpawn.y);
const can = (px: number, py: number) => reach.has(Math.floor(py / TILE) * 4096 + Math.floor(px / TILE));
const tile = (cx: number, cy: number, dx: number, dy: number) => ({ x: (cx + dx) * TILE + 16, y: (cy + dy) * TILE + 16 });
const pt = (cx: number, cy: number, dx: number, dy: number) => ({ x: (cx + dx) * TILE, y: (cy + dy) * TILE });

function check(name: string, p: { x: number; y: number }) {
  if (!ok(p.x, p.y)) fail(`${name}: непроходимо (${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)})`);
  else if (!can(p.x, p.y)) fail(`${name}: недостижимо из Эмберхолла (${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)})`);
}
for (const c of CITIES) {
  console.log(`${c.name}: центр ${c.x},${c.y}`);
  check(`${c.id} spawn`, c.spawn);
  check(`${c.id} arrive`, c.arrive);
  if (!isTownZone(zoneAtPx(m, c.spawn.x, c.spawn.y))) fail(`${c.id}: spawn не в зоне города`);
  if (cityAtTile(Math.floor(c.spawn.x / TILE), Math.floor(c.spawn.y / TILE))?.id !== c.id) fail(`${c.id}: cityAtTile`);
  for (const n of [c.merchant, c.cook, c.quest]) if (n) check(`${c.id} ${n.id}`, n);
  if (!c.style) {
    for (const [dx, dy] of GATE_GUARDS) check("ember пост", tile(TOWN.x, TOWN.y, dx, dy));
    continue;
  }
  for (const g of CITY_GATES) check(`${c.id} ворота ${g.id}`, tile(c.x, c.y, g.x, g.y));
  for (const [dx, dy] of CITY_GATE_GUARDS) check(`${c.id} пост ${dx},${dy}`, tile(c.x, c.y, dx, dy));
  for (const r of CITY_PATROLS) for (const [dx, dy] of r) check(`${c.id} патруль ${dx},${dy}`, pt(c.x, c.y, dx, dy));
  for (const [dx, dy] of CITY_CITIZEN_SPOTS) check(`${c.id} горожане ${dx},${dy}`, tile(c.x, c.y, dx, dy));
  // стоять у торговца/повара/заказчика/камня: рядом с точкой NPC есть проходимая клетка
  for (const n of [c.merchant!, c.cook!, c.quest].filter((q) => q)) if (!near(n!)) fail(`${c.id} ${n!.id}: не подойти`);
}
/** Рядом с точкой NPC (до 2 клеток) есть проходимая клетка, достижимая из Эмберхолла. */
function near(n: { x: number; y: number }) {
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (ok(n.x + i * TILE, n.y + j * TILE) && can(n.x + i * TILE, n.y + j * TILE) && Math.hypot(i, j) <= 2) return true;
  return false;
}

// ---------- NPC мира и банк, заточка, сумки в столицах (решение 2 задачи 132) ----------
// сплетники: город из data/rumors.json существует, без города — своё место в Эмберхолле (запасного «центра города» нет)
for (const e of RUMOR_ERRORS) fail(e);
for (const n of WORLD_NPCS) if (!near(n)) fail(`NPC ${n.name} (${n.kind}): не подойти (${Math.floor(n.x / TILE)},${Math.floor(n.y / TILE)})`);
if (new Set(WORLD_NPCS.map((n) => `${n.kind}:${n.id}`)).size !== WORLD_NPCS.length) fail("NPC мира повторяются");
for (const [what, list] of [["банкир", BANKERS], ["кузнец", SMITHS], ["сумочник", BAGMEN]] as const) {
  for (const id of ["ember", "aurelion", "morthaim"]) {
    const here = list.filter((n) => cityAtTile(Math.floor(n.x / TILE), Math.floor(n.y / TILE))?.id === id);
    if (here.length !== 1) fail(`${id}: ${what} — ${here.length} вместо 1`);
    for (const n of here) if (!WORLD_NPCS.some((w) => w.id === n.id && w.x === n.x && w.y === n.y)) fail(`${id}: ${what} ${n.name} не стоит на клиенте`);
  }
}
console.log(`NPC мира: ${WORLD_NPCS.length}; банкиров ${BANKERS.length}, кузнецов ${SMITHS.length}, сумочников ${BAGMEN.length}`);

// ---------- поселения безопасных земель (задача 132, шаг 3) ----------
{
  const key = (x: number, y: number) => y * 4096 + x;
  const blocked = (x: number, y: number) => !ok(x * TILE + 16, y * TILE + 16);
  const lv = new Set<string>();
  for (const s of SETTLEMENTS) {
    const tag = `${s.name} (${s.id})`;
    const z = zoneAtPx(m, s.spawn.x, s.spawn.y);
    lv.add(`${s.faction}:${ZONES[z].levels.join("–")}`);
    if (factionLandAt(m, s.spawn.x, s.spawn.y) !== s.faction) fail(`${tag}: не на землях своей фракции`);
    // точки: возрождение (центр), камень и место прибытия, торговец, повар, посты стражи, маршрут патруля, места жителей
    check(`${tag} возрождение`, s.spawn);
    check(`${tag} прибытие`, s.arrive);
    if (blocked(s.stoneTile.x, s.stoneTile.y) || !can(s.stoneTile.x * TILE + 16, s.stoneTile.y * TILE + 16)) fail(`${tag}: место под камень занято или недостижимо`);
    for (const n of [s.merchant, s.cook]) if (!near(n)) fail(`${tag} ${n.name}: не подойти`);
    if (!m.merchants.some((p) => p.x === s.merchant.x && p.y === s.merchant.y)) fail(`${tag}: торговца нет в map.merchants (сервер не продаст)`);
    if (!COOKS.some((c) => c.id === s.cook.id && c.x === s.cook.x && c.y === s.cook.y)) fail(`${tag}: повара нет в COOKS`);
    if (Math.hypot(s.merchant.x - s.spawn.x, s.merchant.y - s.spawn.y) > MERCHANT_RANGE * 2) fail(`${tag}: торговец далеко от площади`);
    for (const [dx, dy] of s.posts) check(`${tag} пост ${dx},${dy}`, tile(s.x, s.y, dx, dy));
    for (const [dx, dy] of s.spots) check(`${tag} жители ${dx},${dy}`, tile(s.x, s.y, dx, dy));
    const route = s.patrol.map(([dx, dy]) => pt(s.x, s.y, dx, dy));
    route.forEach((p, i) => {
      check(`${tag} патруль ${i}`, p);
      const q = route[(i + 1) % route.length];
      if (!segmentWalkable(m, p.x, p.y, q.x, q.y, 8)) fail(`${tag}: патруль не идёт по прямой ${i} → ${(i + 1) % route.length} (A* каждый такт)`);
    });
    // ограда замкнута: из площади без ворот наружу не выйти, через ворота — выходит
    const gate = new Set(gateCells(s).map(([x, y]) => key(x, y)));
    for (const g of gate) if (blocked(g % 4096, Math.floor(g / 4096))) fail(`${tag}: проём ворот закрыт`);
    const escape = (shut: boolean) => {
      const seen = new Set([key(s.x, s.y)]), q = [[s.x, s.y]];
      while (q.length) {
        const [x, y] = q.pop()!;
        if (!insideRing(s, x, y) && !gate.has(key(x, y))) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (seen.has(k) || blocked(nx, ny) || (shut && gate.has(k))) continue;
          seen.add(k);
          q.push([nx, ny]);
        }
      }
      return false;
    };
    if (escape(true)) fail(`${tag}: ограда не замкнута — наружу можно выйти не через ворота`);
    if (!escape(false)) fail(`${tag}: через ворота наружу не выйти`);
    // нет запертых карманов: каждая свободная клетка внутри ограды достижима с площади (иначе герой после телепорта, появления или камня застрянет)
    {
      const seen = new Set([key(s.x, s.y)]), q = [[s.x, s.y]];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (seen.has(k) || blocked(nx, ny) || !insideRing(s, nx, ny)) continue;
          seen.add(k);
          q.push([nx, ny]);
        }
      }
      const pockets: string[] = [];
      for (let y = s.y - s.ring.n; y <= s.y + s.ring.s; y++) for (let x = s.x - s.ring.w; x <= s.x + s.ring.w; x++) {
        if (insideRing(s, x, y) && !blocked(x, y) && !seen.has(key(x, y))) pockets.push(`${x - s.x},${y - s.y}`);
      }
      if (pockets.length) fail(`${tag}: запертые клетки внутри ограды: ${pockets.join(" ")}`);
    }
    // к воротам ведёт дорога, и по дорогам от ворот дойти до своей столицы
    const [gx, gy] = gateCells(s)[1];
    const out = s.gate === "n" ? [gx, gy - 1] : s.gate === "s" ? [gx, gy + 1] : s.gate === "e" ? [gx + 1, gy] : [gx - 1, gy];
    if (roadDist(out[0] + 0.5, out[1] + 0.5) > 1.5) fail(`${tag}: у ворот нет дороги`);
    const home = CITIES.find((c) => c.capital === s.faction)!;
    const onRoad = (x: number, y: number) => !blocked(x, y) && (roadDist(x + 0.5, y + 0.5) < 1.6 || cityAtTile(x, y) === home);
    const seen = new Set([key(out[0], out[1])]), q = [out];
    let reached = false;
    while (q.length && !reached) {
      const [x, y] = q.pop()!;
      if (cityAtTile(x, y) === home) reached = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!seen.has(k) && onRoad(nx, ny)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    if (!reached) fail(`${tag}: по дорогам от ворот не дойти до ${home.name}`);
    // мобов нет ни в поселении, ни в досягаемости его стражи (иначе стража била бы их прямо у точек появления)
    const mobs = m.spawns.filter((sp) => settleDist(sp.x / TILE, sp.y / TILE) <= GUARD_RANGE_TILES + 2 && Math.hypot(sp.x / TILE - s.x, sp.y / TILE - s.y) < 30);
    if (mobs.length) fail(`${tag}: мобы у ограды (в досягаемости стражи): ${mobs.map((sp) => sp.mob).join(", ")}`);
    // штандарты своей фракции — на своих клетках (снаружи по бокам ворот)
    const kind = s.faction === "solgard" ? "std-home-sol" : "std-home-umb";
    for (const b of s.banners) if (!m.objects.some((o) => o.kind === kind && Math.floor(o.x / TILE) === b.x && Math.floor(o.y / TILE) === b.y)) fail(`${tag}: нет штандарта ${b.role} на ${b.x},${b.y}`);
    const gateFlags = s.banners.filter((b) => b.role === "settle-gate");
    // задача 141: штандарты снаружи по бокам ворот — на клетку за линией ограды, в 4 клетках от оси проёма (в 3 — обереги; ограда сплошная)
    const outside = (b: { x: number; y: number }) => Math.abs(b.x - s.x) > s.ring.w || b.y - s.y < -s.ring.n || b.y - s.y > s.ring.s;
    if (gateFlags.length !== 2 || !gateFlags.every((b) => outside(b) && gateCells(s).some(([x, y]) => Math.abs(x - b.x) + Math.abs(y - b.y) === 4 && Math.max(Math.abs(x - b.x), Math.abs(y - b.y)) === 3))) fail(`${tag}: штандарты settle-gate не снаружи по бокам ворот`);
    // углы ограды — без штандартов (знамёна акцентами: только пара у ворот)
    const corners = [[-s.ring.w, -s.ring.n], [s.ring.w, -s.ring.n], [-s.ring.w, s.ring.s], [s.ring.w, s.ring.s]];
    if (s.banners.length !== 2 || corners.some(([dx, dy]) => m.objects.some((o) => o.kind === kind && Math.floor(o.x / TILE) === s.x + dx && Math.floor(o.y / TILE) === s.y + dy))) fail(`${tag}: штандарты не только у ворот`);
  }
  // по одному поселению в каждой большой зоне своих земель: 1–10, 10–20, 20–30, 30–40 у каждой фракции
  for (const f of ["solgard", "umbrath"]) for (const r of ["1–10", "10–20", "20–30", "30–40"]) if (!lv.has(`${f}:${r}`)) fail(`${f}: нет поселения в зоне ${r}`);
  console.log(`поселений: ${SETTLEMENTS.length} — ${SETTLEMENTS.map((s) => s.name).join(", ")}`);
}
void CITIZEN_SPOTS; void PATROLS;
for (const g of QUEST_GIVERS) if (!Object.values(QUESTS).some((q) => q.giver === g.id)) fail(`нет заданий у ${g.id}`);
const [e, o, s] = CITIES;
console.log("цены:", teleportPrice(e, o), teleportPrice(e, s), teleportPrice(o, s));
// форты: свой открывается после первого визита (возрождение там), чужой закрыт, как чужая столица; без фракции форты закрыты
if (nearestCity(["fort_umbrath"], s.spawn.x, s.spawn.y, "umbrath").id !== "fort_umbrath") fail("ближайший открытый город: свой форт после визита");
if (nearestCity([], s.spawn.x, s.spawn.y, "umbrath").id === "fort_umbrath") fail("свой форт открыт без визита");
if (nearestCity(["fort_umbrath"], s.spawn.x, s.spawn.y, "solgard").id === "fort_umbrath") fail("возрождение во вражеском форте");
if (!isEnemyCapital(s, "solgard") || isEnemyCapital(s, "umbrath") || !s.fort || !o.fort) fail("форт: враг/свой");
if (homeCity("solgard").fort || homeCity("umbrath").fort) fail("стартовый город — форт");
if (homeCity("umbrath").id !== "morthaim") fail("стартовый город Умбрата");
if (nearestCity([], s.spawn.x, s.spawn.y).id !== "ember") fail("по умолчанию Эмберхолл");
// столицы: своя открыта всегда, чужая — никогда
const sol = CITIES.find((c) => c.capital === "solgard" && !c.fort)!, umb = CITIES.find((c) => c.capital === "umbrath" && !c.fort)!;
if (!sol || !umb || sol.x > umb.x) fail("столицы на западе и востоке");
if (nearestCity([], s.spawn.x, s.spawn.y, "umbrath").id !== umb.id) fail("Умбрат: по умолчанию Мортхейм");
if (nearestCity([umb.id], umb.spawn.x, umb.spawn.y, "solgard").id === umb.id) fail("возрождение во вражеской столице");
if (zoneAtPx(m, sol.spawn.x, sol.spawn.y) !== Zone.SolgardCity || zoneAtPx(m, umb.spawn.x, umb.spawn.y) !== Zone.UmbrathCity) fail("зоны столиц");
// путь от столицы до столицы — несколько минут пешком (150 px/с)
const minutes = Math.hypot(umb.x - sol.x, umb.y - sol.y) * TILE / 150 / 60;
console.log(`от столицы до столицы по прямой: ${minutes.toFixed(1)} мин`);
if (minutes < 3) fail("столицы слишком близко");
// мосты и указатели
const bridges = m.objects.filter((o) => o.kind.startsWith("bridge")), signs = m.objects.filter((o) => o.kind === "signpost" && o.label);
if (bridges.length < 4) fail("мостов меньше 4: " + bridges.length);
for (const b of bridges) check("мост", { x: b.x, y: b.y - 40 });
if (signs.length < 6) fail("указателей меньше 6: " + signs.length);
// слабые мобы у столиц: стартовые зоны 1–10 (задача 132: оболочка 1–10 — эллипс 49×70 тайлов вокруг столицы, поэтому проверяем 36 тайлов)
for (const c of [sol, umb]) {
  const near = m.spawns.filter((sp) => Math.hypot(sp.x - c.spawn.x, sp.y - c.spawn.y) < 36 * TILE);
  if (!near.length || Math.max(...near.map((sp) => sp.level)) > 10) fail(`${c.id}: у столицы нет слабых мобов`);
}
// Эмберхолл: безопасная полоса за частоколом (решение 2) без мобов, частокол замкнут (проёмы — оси и дороги), бой внутри стен запрещён (решение 11)
{
  const pal = m.objects.filter((o) => (o.kind === "pal_h" || o.kind === "pal_v") && Math.abs(o.x / TILE - TOWN.x) <= BELT_HALF.x + 1 && Math.abs(o.y / TILE - TOWN.y) <= BELT_HALF.y + 1).length;
  const sides = 2 * (2 * BELT_HALF.x + 1) + 2 * (2 * BELT_HALF.y - 1);
  if (pal < sides - 40 || pal > sides) fail(`частокол Эмберхолла: ${pal} брёвен из ${sides} клеток периметра`);
  const mobsIn = m.spawns.filter((sp) => Math.abs(Math.floor(sp.x / TILE) - TOWN.x) <= BELT_HALF.x && Math.abs(Math.floor(sp.y / TILE) - TOWN.y) <= BELT_HALF.y).length;
  if (mobsIn) fail(`мобы в полосе Эмберхолла: ${mobsIn}`);
  if (cityAtTile(TOWN.x + BELT_HALF.x, TOWN.y)?.id !== "ember" || cityAtTile(TOWN.x + BELT_HALF.x + 1, TOWN.y)) fail("граница полосы Эмберхолла");
  if (!inEmberWalls((TOWN.x + 20) * TILE, TOWN.y * TILE) || inEmberWalls((TOWN.x + 28) * TILE, TOWN.y * TILE)) fail("inEmberWalls: стены и полоса");
  if (!isAttackSkill(SKILLS.fireball) || !isAttackSkill(SKILLS.taunt) || isAttackSkill(SKILLS.heal) || isAttackSkill(SKILLS.holyshield) || isAttackSkill(SKILLS.roll)) fail("isAttackSkill");
  console.log(`Эмберхолл: частокол ${pal} брёвен, мобов в полосе ${mobsIn}`);
}
console.log(bad ? `ПРОБЛЕМ: ${bad}` : "города: ок");
process.exit(bad ? 1 : 0);
