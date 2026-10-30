/**
 * Карта мира без сервера (shared/map.ts, shared/path.ts): проходимость по основанию (скалы, вода, лава, край карты), шаг с коллизией
 * никогда не заводит в непроходимое, выход из воды, мосты (настил проходим, берега соединены мостом, бродов нет), точки телепорта и
 * возрождения проходимы и не в воде, зоны и уровни (рост от столиц к центру, зеркало запад/восток, безопасные земли ≤ 40, Поля ≥ 80),
 * место для PvP (pvpPlace), поиск пути вокруг препятствий. Запуск: npx tsx tests/unit/world-map.ts
 */
import {
  generateMap, CELL_OBJ, walkable, moveWithCollision, waterAtFeet, zoneAtPx, cellAt, isTownZone, Zone, ZONES, CELL_BLOCK, CELL_BRIDGE, CELL_WATER, CELL_LAVA, T,
  BRIDGE_DECK_H, WORLD_BOSS_ARENAS,
} from "../../shared/map";
import { findPath, segmentWalkable } from "../../shared/path";
import { MAP_SEED, PLAYER_RADIUS, TILE } from "../../shared/constants";
import { CITIES } from "../../shared/cities";
import { pvpPlace, factionsHostile, factionLandAt } from "../../shared/factions";
import { WAR_BASES } from "../../shared/bannerWar";
import { assert, done, section, test } from "./lib";

const m = generateMap(MAP_SEED);
const R = PLAYER_RADIUS;
const C = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
const deep = (x: number, y: number, t = T.Water) => V(x, y) === t && V(x + 1, y) === t && V(x, y + 1) === t && V(x + 1, y + 1) === t && !(m.cell[y * m.w + x] & CELL_BRIDGE);
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);

section("Проходимость");

await test("скалы и постройки (CELL_BLOCK без воды, лавы и основания объекта) — центр клетки непроходим", () => {
  let n = 0;
  for (let i = 0; i < m.cell.length && n < 3000; i += 3) {
    const c = m.cell[i];
    if (!(c & CELL_BLOCK) || c & (CELL_WATER | CELL_LAVA | CELL_BRIDGE | CELL_OBJ)) continue;
    const p = C(i % m.w, (i / m.w) | 0);
    assert.ok(!walkable(m, p.x, p.y, R), `клетка ${i % m.w},${(i / m.w) | 0} проходима`);
    n++;
  }
  assert.ok(n > 300, `мало проверено: ${n}`);
});

await test("глубокая вода и лава (все 4 угла) — непроходимы", () => {
  let n = 0;
  for (let y = 1; y < m.h - 1; y += 3) for (let x = 1; x < m.w - 1; x += 3) {
    if (!deep(x, y) && !deep(x, y, T.Lava)) continue;
    const p = C(x, y);
    assert.ok(waterAtFeet(m, p.x, p.y), `${x},${y}: не жидкость под ногами`);
    assert.ok(!walkable(m, p.x, p.y, R), `${x},${y}: проходима`);
    n++;
  }
  assert.ok(n > 200, `мало проверено: ${n}`);
});

await test("за краем карты — стена: walkable ложно, шаг наружу не выводит за край", () => {
  assert.ok(!walkable(m, -5, (m.h * TILE) / 2, R));
  assert.ok(!walkable(m, (m.w * TILE) / 2, -5, R));
  assert.ok(cellAt(m, -1, -1) & CELL_BLOCK);
  for (let ty = 20; ty < m.h - 20; ty++) {
    const p = { x: 1.5 * TILE, y: (ty + 0.5) * TILE };
    if (!walkable(m, p.x, p.y, R)) continue;
    let q = p;
    for (let i = 0; i < 40; i++) q = moveWithCollision(m, q.x, q.y, -8, 0, R);
    assert.ok(q.x - R >= 0, `вышел за край: ${q.x}`);
    return;
  }
  assert.fail("нет проходимой точки у западного края");
});

await test("случайные блуждания: из проходимой точки шаг никогда не ведёт в непроходимое (основание и кромка)", () => {
  let walks = 0, steps = 0;
  for (let k = 0; k < 400 && walks < 60; k++) {
    const tx = 2 + Math.floor(rnd() * (m.w - 4)), ty = 2 + Math.floor(rnd() * (m.h - 4));
    let p = C(tx, ty);
    if (!walkable(m, p.x, p.y, R)) continue;
    walks++;
    let a = rnd() * Math.PI * 2;
    for (let i = 0; i < 300; i++) {
      if (i % 25 === 0) a = rnd() * Math.PI * 2;
      const q = moveWithCollision(m, p.x, p.y, Math.cos(a) * 9, Math.sin(a) * 9, R);
      assert.ok(walkable(m, q.x, q.y, R), `шаг в непроходимое: ${p.x.toFixed(1)},${p.y.toFixed(1)} → ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
      p = q; steps++;
    }
  }
  assert.ok(walks >= 30 && steps > 9000, `${walks} блужданий`);
});

await test("уже стоящий в воде (старое сохранение) может выйти на сушу", () => {
  for (let y = 5; y < m.h - 5; y++) for (let x = 5; x < m.w - 10; x++) {
    if (!deep(x, y)) continue;
    const land = C(x + 3, y);
    if (!walkable(m, land.x, land.y, R) || m.cell[y * m.w + x + 1] & CELL_BRIDGE) continue;
    let p = C(x, y);
    for (let i = 0; i < 40; i++) p = moveWithCollision(m, p.x, p.y, 4, 0, R);
    assert.ok(p.x > (x + 1) * TILE, `застрял в воде у ${x},${y}`);
    return;
  }
  assert.fail("нет воды у берега");
});

section("Мосты");

function bridges() {
  const seen = new Uint8Array(m.w * m.h), out: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < m.cell.length; i++) {
    if (!(m.cell[i] & CELL_BRIDGE) || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    const b = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
    while (st.length) {
      const j = st.pop()!, x = j % m.w, y = (j / m.w) | 0;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      for (const k of [j - 1, j + 1, j - m.w, j + m.w]) if (k >= 0 && k < m.cell.length && !seen[k] && m.cell[k] & CELL_BRIDGE) { seen[k] = 1; st.push(k); }
    }
    out.push(b);
  }
  return out;
}
const BR = bridges();
const deckY = (b: { y0: number }) => b.y0 * TILE + (BRIDGE_DECK_H[0] + BRIDGE_DECK_H[1]) / 2;

await test("6 мостов (3 через каждую реку), зеркально по x", () => {
  assert.equal(BR.length, 6, JSON.stringify(BR));
  const west = BR.filter((b) => b.x1 < m.w / 2), east = BR.filter((b) => b.x0 > m.w / 2);
  assert.equal(west.length, 3);
  for (const b of west) assert.ok(east.some((e) => Math.abs(e.x0 + b.x1 - (m.w - 1)) <= 1 && e.y0 === b.y0), `нет зеркала моста ${b.x0},${b.y0}`);
});

await test("настил моста проходим по всей длине; мост над рекой", () => {
  for (const b of BR) {
    assert.ok(b.x1 - b.x0 > b.y1 - b.y0, "мосты сейчас горизонтальные — проверка вертикальных не написана");
    const y = deckY(b);
    for (let x = b.x0 * TILE + 4; x <= (b.x1 + 1) * TILE - 4; x += 4) assert.ok(walkable(m, x, y, R), `мост ${b.x0},${b.y0}: дыра в настиле на x=${x}`);
    const mid = Math.floor((b.x0 + b.x1) / 2);
    assert.ok([V(mid, b.y0 - 1), V(mid, b.y1 + 2)].some((v) => v === T.Water), `мост ${b.x0},${b.y0} не над рекой`);
  }
});

await test("мост соединяет берега: путь с берега на берег есть", () => {
  for (const b of BR) {
    const y = deckY(b);
    let xa = b.x0 * TILE - 8, xb = (b.x1 + 1) * TILE + 8;
    while (!walkable(m, xa, y, R) && xa > b.x0 * TILE - 12 * TILE) xa -= 8;
    while (!walkable(m, xb, y, R) && xb < (b.x1 + 13) * TILE) xb += 8;
    assert.ok(walkable(m, xa, y, R) && walkable(m, xb, y, R), `нет берега у моста ${b.x0},${b.y0}`);
    assert.ok(findPath(m, xa, y, xb, y, R), `нет пути через мост ${b.x0},${b.y0}`);
  }
});

await test("бродов нет: в 20 клетках от моста реку не перейти по прямой", () => {
  let n = 0;
  for (const b of BR) for (const dy of [-20, 20]) {
    const y = (b.y0 + 1 + dy) * TILE + 16;
    if (y < 2 * TILE || y > (m.h - 2) * TILE) continue;
    const xa = (b.x0 - 8) * TILE, xb = (b.x1 + 9) * TILE;
    assert.ok(!segmentWalkable(m, xa, y, xb, y, R), `брод у ${b.x0},${b.y0 + dy}`);
    n++;
  }
  assert.ok(n >= 6);
});

section("Точки появления и телепорта");

await test("прибытие и возрождение городов и фортов — проходимы и не в воде", () => {
  for (const c of CITIES) for (const [k, p] of [["arrive", c.arrive], ["spawn", (c as { spawn?: { x: number; y: number } }).spawn]] as const) {
    if (!p) continue;
    assert.ok(walkable(m, p.x, p.y, R), `${c.id}.${k} непроходим`);
    assert.ok(!waterAtFeet(m, p.x, p.y + 2), `${c.id}.${k} в воде`);
  }
  assert.ok(walkable(m, m.playerSpawn.x, m.playerSpawn.y, R), "нейтральная точка появления");
});

await test("арены мировых боссов и круги знамён — на суше", () => {
  assert.ok(WORLD_BOSS_ARENAS.length > 0);
  for (const a of WORLD_BOSS_ARENAS) assert.ok(walkable(m, a.x, a.y, R), `арена ${a.id}`);
  for (const b of WAR_BASES) {
    const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: b.x + Math.cos((k * Math.PI) / 4) * 3 * TILE, y: b.y + Math.sin((k * Math.PI) / 4) * 3 * TILE }));
    assert.ok(ring.every((p) => walkable(m, p.x, p.y, R)), `круг знамени ${b.id}`);
  }
});

section("Зоны и уровни");

await test("уровни зон: от ≤ до; безопасные земли ≤ 40, «Небезопасная» 40–80, «Опасная» ≥ 80", () => {
  ZONES.forEach((z, i) => {
    if (z.unused) return;
    assert.ok(z.levels[0] <= z.levels[1], `${Zone[i]} ${z.levels}`);
    if (z.land && !isTownZone(i)) assert.ok(z.levels[1] <= 40, `${Zone[i]}: земли фракции выше 40`);
    if (z.danger === "unsafe") assert.ok(z.levels[0] >= 40 && z.levels[1] <= 80, `${Zone[i]}`);
    if (z.danger === "deadly") assert.ok(z.levels[0] >= 80, `${Zone[i]}`);
  });
});

await test("уровни растут от столиц к центру (по строкам карты, города пропускаются)", () => {
  for (const ty of [60, 120, 183, 250, 300]) for (const dir of [1, -1]) {
    let last = 0;
    for (let k = 0; k <= 400; k += 5) {
      const tx = dir > 0 ? 130 + k : m.w - 1 - 130 - k;
      const z = zoneAtPx(m, tx * TILE + 16, ty * TILE + 16);
      if (isTownZone(z) || ZONES[z].levels[1] === 0) continue;
      const lv = ZONES[z].levels[0];
      assert.ok(lv >= last, `строка ${ty}, x ${tx}: ${lv} после ${last}`);
      last = lv;
    }
  }
});

await test("восток — зеркало запада: уровень зоны в клетке x равен уровню в 1099 − x", () => {
  let bad = 0, n = 0;
  const ex: string[] = [];
  for (let ty = 2; ty < m.h - 2; ty += 7) for (let tx = 2; tx < m.w / 2; tx += 7) {
    const a = ZONES[m.zone[ty * m.w + tx]].levels[0], b = ZONES[m.zone[ty * m.w + (m.w - 1 - tx)]].levels[0];
    n++;
    if (a !== b) { bad++; if (ex.length < 5) ex.push(`${tx},${ty}: ${a}≠${b}`); }
  }
  assert.equal(bad, 0, `${bad} из ${n} клеток не зеркальны: ${ex.join("; ")}`);
});

await test("земли фракций: запад — Сольгард, восток — Умбрат, центр ничей", () => {
  const sol = CITIES.find((c) => c.id === "aurelion")!, umb = CITIES.find((c) => c.id === "morthaim")!;
  assert.equal(factionLandAt(m, sol.arrive.x, sol.arrive.y), "solgard");
  assert.equal(factionLandAt(m, umb.arrive.x, umb.arrive.y), "umbrath");
  assert.equal(factionLandAt(m, (m.w / 2) * TILE, 250 * TILE), null);
});

await test("PvP-место: Эмберхолл нейтрален, столицы и форты — pvp, Поля — pvp; одна фракция не враждует нигде", () => {
  const at = (id: string) => CITIES.find((c) => c.id === id)!.arrive;
  assert.equal(pvpPlace(m, at("ember").x, at("ember").y), "neutral");
  for (const id of ["aurelion", "morthaim", "fort_solgard", "fort_umbrath"]) assert.equal(pvpPlace(m, at(id).x, at(id).y), "pvp", id);
  const f = { x: 550 * TILE, y: 250 * TILE };
  assert.equal(zoneAtPx(m, f.x, f.y), Zone.Fields);
  assert.ok(factionsHostile(m, "solgard", f.x, f.y, "umbrath", f.x + 50, f.y));
  assert.ok(!factionsHostile(m, "solgard", f.x, f.y, "solgard", f.x + 50, f.y));
  assert.ok(!factionsHostile(m, "solgard", f.x, f.y, "", f.x + 50, f.y));
  const e = at("ember");
  assert.ok(factionsHostile(m, "solgard", e.x, e.y, "umbrath", e.x + 20, e.y), "в нейтральном городе — враги (удар = нарушение)");
  assert.ok(!factionsHostile(m, "solgard", e.x, e.y, "umbrath", f.x, f.y), "один в городе, другой на Полях — не враги");
});

section("Поиск пути");

function blockedPairs(n: number) {
  const out: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let k = 0; k < 20000 && out.length < n; k++) {
    const tx = 20 + Math.floor(rnd() * (m.w - 40)), ty = 20 + Math.floor(rnd() * (m.h - 40));
    const a = C(tx, ty);
    if (!walkable(m, a.x, a.y, R)) continue;
    const ang = rnd() * Math.PI * 2, d = (5 + rnd() * 7) * TILE;
    const b = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
    if (!walkable(m, b.x, b.y, R) || segmentWalkable(m, a.x, a.y, b.x, b.y, R)) continue;
    out.push({ a, b });
  }
  return out;
}

await test("путь вокруг препятствия: точки пути проходимы, отрезки почти все проходимы, конец у цели, не короче прямой", () => {
  const pairs = blockedPairs(40);
  assert.ok(pairs.length >= 20, `пар ${pairs.length}`);
  let found = 0, segs = 0, badSegs = 0;
  for (const { a, b } of pairs) {
    const path = findPath(m, a.x, a.y, b.x, b.y, R);
    if (!path) continue;
    found++;
    let prev = a, len = 0;
    for (const q of path) {
      assert.ok(walkable(m, q.x, q.y, R), `точка пути в непроходимом: ${q.x},${q.y}`);
      segs++;
      if (!segmentWalkable(m, prev.x, prev.y, q.x, q.y, R)) badSegs++; // A* по клеткам: диагональ у кромки воды может задеть её — герой скользит
      len += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    assert.ok(Math.hypot(prev.x - b.x, prev.y - b.y) < TILE, "путь не доходит до цели");
    assert.ok(len >= Math.hypot(b.x - a.x, b.y - a.y) - 1, "путь короче прямой");
  }
  assert.ok(found >= pairs.length * 0.5, `путь найден в ${found} из ${pairs.length}`);
  assert.ok(badSegs <= segs * 0.1, `отрезков сквозь препятствие ${badSegs} из ${segs}`);
});

await test("цель в воде или за краем: путь только до ближайшей суши, герой не заходит в воду", () => {
  const s0 = m.playerSpawn;
  for (const q of findPath(m, s0.x, s0.y, -100, s0.y, R) ?? []) assert.ok(q.x >= 0 && q.y >= 0 && q.x < m.w * TILE, `точка за краем ${q.x},${q.y}`);
  for (let y = 5; y < m.h - 5; y += 2) for (let x = 5; x < m.w - 5; x += 2) {
    if (!deep(x, y) || !deep(x - 1, y) || !deep(x + 1, y)) continue;
    const w = C(x, y);
    for (let d = 2; d < 6; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
      const s = C(x + dx, y + dy);
      if (!walkable(m, s.x, s.y, R)) continue;
      // A* ведёт к ближайшей открытой клетке (её центр может быть у самой кромки) — идём по пути шагами героя: в воду не заходим
      let p = s;
      for (const q of findPath(m, s.x, s.y, w.x, w.y, R) ?? []) for (let i = 0; i < 40; i++) {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d < 1) break;
        p = moveWithCollision(m, p.x, p.y, (dx / d) * Math.min(4, d), (dy / d) * Math.min(4, d), R);
        assert.ok(walkable(m, p.x, p.y, R), `по пути в воду ${x},${y} герой встал в воду: ${p.x},${p.y}`);
      }
      assert.ok(Math.hypot(p.x - w.x, p.y - w.y) > TILE / 2, "дошёл до центра глубокой воды");
      return;
    }
  }
  assert.fail("нет воды у суши");
});

done();
