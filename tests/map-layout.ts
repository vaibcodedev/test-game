/**
 * Раскладка карты без сервера (задача 132, шаг 2). Запуск: npx tsx tests/map-layout.ts
 * Проверяет по настоящей сгенерированной карте:
 *  1. данные: реки, дороги, места (все парами, без исключений), штандарты и стены — зеркальные пары; зоны идут к центру (уровни), подписи опасности;
 *  2. зеркальность: уровни зон, поверхность и проходимость Полей совпадают с зеркальной клеткой (x → 1099 − x), шум границ тоже;
 *  3. равные пути (все места, врата рейда, Эмберхолл, форты, боссы) и рост уровней от обеих столиц (±3 %), 16 направлений по проходимым клеткам,
 *     как на схеме tools/map-plan.ts; порядок зон по оболочкам и поясам, рост уровней мобов внутри зоны;
 *  4. на чужую безопасную землю без мостов не попасть (реки идут до воды края карты, броды закрыты, стены с воротами у мостов);
 *  5. связность с мостами: города, форты, Эмберхолл, мосты, боссы, все залы данжа (зал босса — пешком), мобы; у данжа один вход — по всему периметру;
 *  6. стены вдоль рек и башни: ровно три проёма — у мостов; при закрытых воротах изнутри до берега не дойти; мобы не у берега;
 *  7. ресурсы: у каждой стороны свои узлы всех четырёх видов.
 */
import bestiary from "../data/bestiary.json";
import world from "../data/world.json";
import { CITIES, cityById } from "../shared/cities";
import { MAP_SEED, PLAYER_SPEED, TILE } from "../shared/constants";
import { BOSS_SPAWNS, CELL_BLOCK, CELL_RESERVED, DUNGEON, DUNGEON_ROOMS, PLACES, ZONES, ZONE_COUNT, Zone, generateMap, isTownZone, riverX, zoneAtPx, zoneDanger } from "../shared/map";
import { RAID_GATE } from "../shared/raid";
import { TOWN } from "../shared/town";

const m = generateMap(MAP_SEED);
const W = m.w, H = m.h, AXIS = W / 2;
let bad = 0;
const fail = (s: string) => { bad++; console.log("FAIL", s); };
const check = (ok: boolean, s: string) => { if (!ok) fail(s); };
const mir = (x: number) => W - 1 - x;
const TOL = 3; // допуск расхождения путей и уровней, %
const TPS = PLAYER_SPEED / TILE;
const block = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? true : !!(m.cell[y * W + x] & CELL_BLOCK));
const lvMid = (z: number) => (ZONES[z].levels[0] + ZONES[z].levels[1]) / 2;

// ---------- 1. данные ----------
console.log("1. данные");
check(Zone.Fields === ZONE_COUNT - 1, "Zone.Fields не последняя в enum");
check(ZONES[Zone.Fields].name === "Поля вечных битв" && ZONES[Zone.Fields].levels[0] === 80 && ZONES[Zone.Fields].levels[1] === 100, "Поля вечных битв: 80–100");
{
  // подписи: Поля, вулкан и данж — «Опасная зона», кольцо 40–80 — «Небезопасная зона», земли 1–40 и города — без подписи
  const placed = new Set<number>(m.zone);
  for (const z of placed) {
    const [lo, hi] = ZONES[z].levels, d = zoneDanger(z);
    if (isTownZone(z) || z === Zone.Arena) check(d === null, `${ZONES[z].name}: у города не должно быть подписи опасности`);
    else if (lo >= 80) check(d === "Опасная зона", `${ZONES[z].name} ${lo}–${hi}: подпись «Опасная зона», сейчас ${d}`);
    else if (lo >= 40) check(d === "Небезопасная зона", `${ZONES[z].name} ${lo}–${hi}: подпись «Небезопасная зона», сейчас ${d}`);
    else check(d === null, `${ZONES[z].name} ${lo}–${hi}: земли 1–40 без подписи, сейчас ${d}`);
  }
  // зоны безопасных земель: четыре по 10 уровней с каждой стороны, потолок 40
  const lands = new Map<string, number>();
  for (const z of placed) {
    const [lo, hi] = ZONES[z].levels;
    if (!isTownZone(z) && hi <= 40 && z !== Zone.Arena) lands.set(`${lo}–${hi}`, (lands.get(`${lo}–${hi}`) ?? 0) + 1);
  }
  for (const k of ["1–10", "10–20", "20–30", "30–40"]) check(lands.get(k) === 2, `земли ${k}: по зоне на сторону, сейчас ${lands.get(k) ?? 0}`);
}
{
  const R = Object.entries(world.rivers).filter(([k]) => k !== "_doc").map(([, v]) => v as { width: number; path: [number, number][] });
  check(R.length === 2, "рек две");
  const [a, b] = R;
  check(a.path.length === b.path.length && a.path.every(([x, y], i) => Math.abs(W - x - b.path[i][0]) < 1e-6 && y === b.path[i][1]), "реки не зеркальны (x → 1100 − x)");
  check(a.path.every(([x]) => x > 190 && x < 230) && a.path[0][1] <= 0 && a.path[a.path.length - 1][1] >= H, "западная река идёт сверху вниз с запасом за край карты (брода у края нет)");
  const roads = world.roads as Record<string, unknown>;
  for (const k of Object.keys(roads)) {
    if (!k.startsWith("sol_")) continue;
    const e = roads[k.replace(/^sol_/, "umb_")] as [number, number][] | undefined, w = roads[k] as [number, number][];
    check(!!e && e.length === w.length && w.every(([x, y], i) => Math.abs(W - x - e[i][0]) < 1e-6 && y === e[i][1]), `дорога ${k}: нет зеркальной пары umb_`);
  }
  check(!!roads.umb_main && !!roads.umb_fort_center, "у Умбрата есть прямая дорога к центру");
  // у воды дорога идёт только через три моста: пересечения дорог с реками (ось реки) — ровно у мостов
  const crossings: number[] = [];
  for (const [k, line] of Object.entries(roads)) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i] as [number, number], [x1, y1] = line[i + 1] as [number, number];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const f = (t: number) => { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; return (k.startsWith("umb_") ? W - x : x) - riverX(y); };
        if (k.startsWith("axis_")) continue;
        if (f(t0) < 0 && f(t1) >= 0) crossings.push(y0 + (y1 - y0) * ((t0 + t1) / 2));
        else if (f(t0) >= 0 && f(t1) < 0) crossings.push(y0 + (y1 - y0) * ((t0 + t1) / 2));
      }
    }
  }
  const bridgeYs = world.bridges.map((b) => b.y);
  check(crossings.length === 6, `дороги пересекают реки ${crossings.length} раз вместо 6 (по мосту на реку и ряд)`);
  for (const y of crossings) check(bridgeYs.some((b) => Math.abs(b - y) < 1), `дорога пересекает реку не у моста: y = ${y.toFixed(1)}`);
  // места: зеркальные пары (клетка i ↔ 1099 − i) без исключений — и нейтральные руины Полей, и места встреч кольца (иначе одна из столиц ближе к логову)
  const west = PLACES.filter((p) => p.x < AXIS);
  for (const p of west) check(PLACES.some((q) => q.x === mir(p.x) && q.y === p.y && q.kind === p.kind && q.n === p.n), `место ${p.id}: нет зеркальной пары`);
  check(PLACES.length === west.length * 2, `мест ${PLACES.length}: у запада ${west.length}, на востоке должно быть столько же`);
  // центр места не в воде и не в лаве (мелкое убранство вроде костра может стоять на самой клетке)
  const wet = (x: number, y: number) => [m.vtx[y * (W + 1) + x], m.vtx[y * (W + 1) + x + 1], m.vtx[(y + 1) * (W + 1) + x], m.vtx[(y + 1) * (W + 1) + x + 1]].some((t) => t === 0 || t === 1);
  check(PLACES.every((p) => !wet(Math.round(p.x), Math.round(p.y))), "место в воде или лаве: " + PLACES.filter((p) => wet(Math.round(p.x), Math.round(p.y))).map((p) => p.id).join(","));
  const bn = world.banners.list;
  check(bn.length === 36, `штандартов у ворот и мостов 36, сейчас ${bn.length}`);
  for (const b of bn.filter((q) => q.faction === "solgard")) check(bn.some((q) => q.faction === "umbrath" && q.bridge === b.bridge && q.role === b.role && Math.abs(q.x - (W - b.x)) < 1e-6 && q.y === b.y), `штандарт ${b.id}: нет зеркальной пары`);
}

// ---------- 2. зеркальность зон и поверхности ----------
console.log("2. зеркальность");
{
  let diff = 0, vdiff = 0, vcount = 0, bdiff = 0, bcount = 0, rdiff = 0, rcount = 0;
  const bdiffAt: string[] = [];
  const nearEmber = (x: number, y: number) => Math.abs(x - AXIS) <= 28 && Math.abs(y - TOWN.y) <= 23;
  // постройки мест (деревни, лагеря, руины) и указатели у перекрёстков у каждой стороны свои: у них проходимость не зеркалится
  const nearPlace = (x: number, y: number) => PLACES.some((p) => Math.abs(x - p.x) <= 14 && Math.abs(y - p.y) <= 14);
  const nearSign = (x: number, y: number) => world.signs.list.some((q) => Math.abs(x - q.x) <= 6 && Math.abs(y - q.y) <= 6);
  const nearDungeon = (x: number, y: number) => Math.abs(x - AXIS) <= 40 && y >= DUNGEON.y0 - 14 && y <= DUNGEON.y1 + 14;
  // вершины у границ городов: целая x вершины относится к клетке справа от неё, зеркальная — к клетке слева, поэтому граница зон чуть не совпадает
  const nearCity = (x: number, y: number) => CITIES.some((c) => c.style && Math.abs(x - c.x - 0.5) <= c.half.x + 2.5 && Math.abs(y - c.y - 0.5) <= c.half.y + 2.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < AXIS; x++) {
    if (nearEmber(x, y)) continue;
    const za = m.zone[y * W + x], zb = m.zone[y * W + mir(x)];
    const la = ZONES[za].levels, lb = ZONES[zb].levels;
    if (la[0] !== lb[0] || la[1] !== lb[1] || isTownZone(za) !== isTownZone(zb)) diff++;
    // резерв (дороги, площадки городов и фортов, круги мест, арены, города): без декора и мобов — зеркален везде, кроме Эмберхолла и данжа
    if (!nearDungeon(x, y) && !(Math.abs(x - AXIS) <= 32 && Math.abs(y - TOWN.y) <= 28)) { // у Эмберхолла резерв шире стен на 3 тайла, а центр города смещён на полтайла
      rcount++;
      if (((m.cell[y * W + x] ^ m.cell[y * W + mir(x)]) & CELL_RESERVED) !== 0) rdiff++;
    }
    // поверхность Полей: там обе половины — одна зона, шум и дороги зеркальны
    if (za === Zone.Fields && zb === Zone.Fields && !nearDungeon(x, y) && !nearCity(x, y) && !nearCity(mir(x), y)) {
      vcount++;
      if (m.vtx[y * (W + 1) + x] !== m.vtx[y * (W + 1) + (W - x)]) vdiff++;
      // проходимость: камни, мёртвые деревья и валуны Полей ложатся парами (клетка i ↔ 1099 − i)
      if (!nearPlace(x, y) && !nearPlace(mir(x), y) && !nearSign(x, y) && !nearSign(mir(x), y)) {
        bcount++;
        if (block(x, y) !== block(mir(x), y)) { bdiff++; if (bdiffAt.length < 5) bdiffAt.push(`${x},${y}`); }
      }
    }
  }
  check(diff === 0, `уровни зон несимметричны в ${diff} клетках`);
  check(rcount > 150000 && rdiff === 0, `резерв клеток несимметричен: ${rdiff} из ${rcount} пар (центры площадок и мест — центры клеток, +0,5)`);
  check(vcount > 20000 && vdiff === 0, `поверхность Полей несимметрична: ${vdiff} из ${vcount} вершин`);
  check(bcount > 20000 && bdiff === 0, `проходимость Полей несимметрична: ${bdiff} из ${bcount} пар клеток (${bdiffAt.join(" ")}…)`);
  console.log(`   клеток уровней-пар: ${AXIS * H}, расхождений ${diff}; вершин Полей ${vcount}, расхождений ${vdiff}; пар клеток Полей ${bcount}, расхождений проходимости ${bdiff}`);
}

// ---------- проходимость, пути ----------
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    let i = this.k.length;
    this.k.push(key); this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop(): [number, number] {
    const rk = this.k[0], rv = this.v[0];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    const n = this.k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= lk) break;
        this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
      }
      this.k[i] = lk; this.v[i] = lv;
    }
    return [rk, rv];
  }
}
/** 16 направлений (соседи и «ход коня»): все клетки охватывающего прямоугольника хода проходимы — углы не срезаются. */
const MOVES = (() => {
  const out: { dx: number; dy: number; c: number; chk: [number, number][] }[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if ((!dx && !dy) || ax + ay > 3 || (ax === 2 && ay === 0) || (ax === 0 && ay === 2)) continue;
    const chk: [number, number][] = [];
    for (let y = Math.min(0, dy); y <= Math.max(0, dy); y++) for (let x = Math.min(0, dx); x <= Math.max(0, dx); x++) if (x || y) chk.push([x, y]);
    out.push({ dx, dy, c: Math.hypot(dx, dy), chk });
  }
  return out;
})();
const passOf = (extraBlock?: Set<number>) => {
  const p = new Uint8Array(W * H);
  for (let i = 0; i < p.length; i++) p[i] = m.cell[i] & CELL_BLOCK || extraBlock?.has(i) ? 0 : 1;
  return p;
};
function dijkstra(pass: Uint8Array, sx: number, sy: number) {
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const heap = new Heap();
  const s = sy * W + sx;
  dist[s] = 0;
  heap.push(0, s);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const mv of MOVES) {
      const nx = x + mv.dx, ny = y + mv.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      let ok = true;
      for (const [ox, oy] of mv.chk) {
        const cx = x + ox, cy = y + oy;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H || !pass[cy * W + cx]) { ok = false; break; }
      }
      if (!ok) continue;
      const nd = d + mv.c, j = ny * W + nx;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  return { dist, prev };
}
/** Ближайшая проходимая клетка к (x, y), достижимая по dist. */
function snap(pass: Uint8Array, dist: Float64Array, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let best = -1, bd = Infinity, found = -1;
  for (let r = 0; r < 40 && (found < 0 || r <= found + 1); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cx = ix + dx, cy = iy + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = cy * W + cx;
      if (!pass[i] || !isFinite(dist[i])) continue;
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d < bd) { bd = d; best = i; if (found < 0) found = r; }
    }
  }
  return best;
}
const trace = (prev: Int32Array, target: number) => {
  const out: number[] = [];
  for (let i = target; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
};
const fmtT = (tiles: number) => { const s = Math.round(tiles / TPS); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const pct = (a: number, b: number) => (Math.max(a, b) <= 0 ? 0 : (Math.abs(a - b) / Math.max(a, b)) * 100);
const cellOfPx = (px: number, py: number) => Math.floor(py / TILE) * W + Math.floor(px / TILE);

const aur = cityById("aurelion")!, mor = cityById("morthaim")!;
const pass = passOf();
const sA = cellOfPx(aur.spawn.x, aur.spawn.y), sM = cellOfPx(mor.spawn.x, mor.spawn.y);
check(sA % W === mir(sM % W) && (sA / W | 0) === (sM / W | 0), "стартовые клетки столиц не зеркальны");
const rA = dijkstra(pass, sA % W, (sA / W) | 0), rM = dijkstra(pass, sM % W, (sM / W) | 0);

// ---------- 3. равные пути и уровни ----------
console.log("3. пути от столиц (тайлов; мин:сс при 150 px/с) — Аурелион | Мортхейм");
interface Tgt { name: string; a: [number, number]; b?: [number, number] }
const emb = { w: [TOWN.x - 25, TOWN.y] as [number, number], e: [TOWN.x + 24, TOWN.y] as [number, number] }; // ворота Эмберхолла: зеркальные пары (525 ↔ 574)
const bridges = world.bridges.map((b) => ({ ...b, cx: Math.round(riverX(b.y)) }));
const targets: Tgt[] = [
  ...bridges.map((b) => ({ name: `${b.name}: ворота (внутри)`, a: [Math.floor(riverX(b.y) - 6.5) - 4, Math.floor(b.y)] as [number, number] })),
  ...bridges.map((b) => ({ name: `${b.name}: дальний берег`, a: [b.cx + 6, Math.floor(b.y)] as [number, number] })),
  ...PLACES.filter((p) => p.x < AXIS).map((p) => ({ name: `${p.name}`, a: [p.x, p.y] as [number, number] })),
  { name: "Форт запада | форт востока", a: [Math.floor(cityById("oasis")!.spawn.x / TILE), Math.floor(cityById("oasis")!.spawn.y / TILE)], b: [Math.floor(cityById("snow_valley")!.spawn.x / TILE), Math.floor(cityById("snow_valley")!.spawn.y / TILE)] },
  { name: "Ворота Эмберхолла (запад | восток)", a: emb.w, b: emb.e },
  { name: "Центр Полей (549 | 550)", a: [549, 180] },
  { name: "Вход в данж (549 | 550)", a: [549, DUNGEON.y0 - 4] },
  // врата рейда — одна точка на оси (клетка 549 или 550): путь к ним от обеих столиц равен
  { name: "Врата рейда (549 | 550)", a: [AXIS - 1, RAID_GATE ? Math.floor(RAID_GATE.y / TILE) : 345] },
  { name: "Босс кольца 50–60 (Энт | Ведьма)", a: [Math.floor(BOSS_SPAWNS.find((b) => b.id === "ent")!.x / TILE), Math.floor(BOSS_SPAWNS.find((b) => b.id === "ent")!.y / TILE)], b: [Math.floor(BOSS_SPAWNS.find((b) => b.id === "witch")!.x / TILE), Math.floor(BOSS_SPAWNS.find((b) => b.id === "witch")!.y / TILE)] },
];
let maxDiff = 0;
for (const t of targets) {
  const ca = snap(pass, rA.dist, t.a[0] + 0.5, t.a[1] + 0.5);
  const bx = t.b ? t.b[0] : mir(t.a[0]), by = t.b ? t.b[1] : t.a[1];
  const cb = snap(pass, rM.dist, bx + 0.5, by + 0.5);
  if (ca < 0 || cb < 0) { fail(`${t.name}: недостижима (${ca < 0 ? "из Аурелиона" : "из Мортхейма"})`); continue; }
  const a = rA.dist[ca], b = rM.dist[cb], d = pct(a, b);
  maxDiff = Math.max(maxDiff, d);
  console.log(`   ${t.name.padEnd(40)} ${String(Math.round(a)).padStart(4)} ${fmtT(a)} | ${String(Math.round(b)).padStart(4)} ${fmtT(b)}   Δ ${d.toFixed(1)} %`);
  check(d <= TOL, `${t.name}: пути от столиц расходятся на ${d.toFixed(1)} % (допуск ${TOL} %)`);
}
console.log(`   максимальное расхождение путей: ${maxDiff.toFixed(1)} %`);
{
  // рост уровней по пути к воротам Эмберхолла: каждые 15 тайлов уровень середины зоны под ногами; у обеих столиц равен ±3 уровня и не падает
  const tA = snap(pass, rA.dist, emb.w[0] + 0.5, emb.w[1] + 0.5), tM = snap(pass, rM.dist, emb.e[0] + 0.5, emb.e[1] + 0.5);
  const STEP = 15;
  const samples = (r: ReturnType<typeof dijkstra>, t: number) => {
    const cells = trace(r.prev, t), out: number[] = [];
    let last = 1;
    for (let d = 0; ; d += STEP) {
      const dd = Math.min(d, r.dist[t]);
      const c = cells.find((i) => r.dist[i] >= dd) ?? cells[cells.length - 1];
      const z = m.zone[c];
      if (!isTownZone(z)) last = lvMid(z);
      out.push(last);
      if (d >= r.dist[t]) break;
    }
    return out;
  };
  const la = samples(rA, tA), lm = samples(rM, tM);
  console.log(`   уровни по пути к Эмберхоллу (каждые ${STEP} тайлов): Аурелион ${la.join(" ")}`);
  console.log(`                                                      Мортхейм ${lm.join(" ")}`);
  check(Math.abs(la.length - lm.length) <= 1, "число отсчётов пути различается");
  {
    // рост уровней равен: путь, пройденный до входа в зоны каждой ступени (10, 20 … 80 ур.), у столиц расходится не больше чем на TOL % длины пути
    const entry = (r: ReturnType<typeof dijkstra>, t: number) => {
      const cells = trace(r.prev, t);
      return [10, 20, 30, 40, 50, 60, 70, 80].map((b) => {
        const c = cells.find((i) => !isTownZone(m.zone[i]) && ZONES[m.zone[i]].levels[0] >= b);
        return c === undefined ? NaN : r.dist[c];
      });
    };
    const ea = entry(rA, tA), em = entry(rM, tM), len = Math.max(rA.dist[tA], rM.dist[tM]);
    console.log(`   тайлов пути до входа в зоны 10, 20 … 80 ур.: Аурелион ${ea.map(Math.round).join(" ")} | Мортхейм ${em.map(Math.round).join(" ")}`);
    ea.forEach((d, i) => check(isFinite(d) && isFinite(em[i]) && (Math.abs(d - em[i]) / len) * 100 <= TOL, `вход в зоны ${(i + 1) * 10}+ ур.: ${Math.round(d)} и ${Math.round(em[i])} тайлов — расхождение больше ${TOL} % пути (${Math.round(len)})`));
  }
  // уровень не падает: зона под ногами не ниже той, что была 3 отсчёта (45 тайлов) назад, и среднее по третям пути растёт
  for (const [n, a] of [["Аурелион", la], ["Мортхейм", lm]] as const) {
    check(a.every((v, i) => i < 3 || v >= Math.max(...a.slice(0, i - 2)) - 0.01), `${n}: уровень по пути к центру падает`);
    const third = Math.floor(a.length / 3), avg = (b: number[]) => b.reduce((x, y) => x + y, 0) / b.length;
    check(avg(a.slice(0, third)) < avg(a.slice(third, 2 * third)) && avg(a.slice(third, 2 * third)) < avg(a.slice(2 * third)), `${n}: уровень по третям пути не растёт`);
  }
  check(la[0] <= 10 && la[la.length - 1] >= 80 && lm[0] <= 10 && lm[lm.length - 1] >= 80, "путь идёт от 1–10 ур. к 80–100 в центре");
}
{
  // порядок зон по всей сетке (а не по отсчётам пути): земли — оболочки вокруг столицы, кольцо — пояса вокруг Полей; уровни зон растут к центру
  const L = world.layout;
  const zoneOf = (n: string) => { const z = Zone[n as keyof typeof Zone]; if (z === undefined) throw new Error("нет зоны " + n); return z; };
  const lo = (n: string) => ZONES[zoneOf(n)].levels[0];
  for (const [side, lands, ring] of [["запад", L.lands.west, L.ring.west], ["восток", L.lands.east, L.ring.east]] as const) {
    check(lands.every((n, i) => i === 0 || lo(n) > lo(lands[i - 1])), `земли (${side}): уровни зон не растут от столицы к реке: ${lands.join(", ")}`);
    check(ring.every((n, i) => i === 0 || lo(n) > lo(ring[i - 1])), `кольцо (${side}): уровни зон не растут от реки к Полям: ${ring.join(", ")}`);
    check(lo(lands[lands.length - 1]) < lo(ring[0]) && lo(ring[ring.length - 1]) < ZONES[Zone.Fields].levels[0], `${side}: земли → кольцо → Поля идут не по возрастанию уровней`);
  }
  const uOf = (x: number, y: number) => Math.hypot((x - L.capital[0]) / L.shell.a, (y - L.capital[1]) / L.shell.b);
  const vOf = (x: number, y: number) => Math.hypot((x - L.fields.cx) / L.fields.rx, (y - L.fields.cy) / L.fields.ry);
  const BAND = 0.1; // шум границ зон сдвигает u и v не больше чем на ≈0,07
  let wrongLands = 0, wrongRing = 0, nLands = 0, nRing = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = m.zone[y * W + x] as Zone;
    if (isTownZone(z) || z === Zone.Dungeon || z === Zone.Arena) continue;
    const east = x >= AXIS, fx = (east ? mir(x) : x) + 0.5, cy = y + 0.5;
    if (fx < riverX(cy)) {
      const u = uOf(fx, cy);
      if (L.shell.u.some((t) => Math.abs(u - t) < BAND)) continue;
      nLands++;
      if (z !== zoneOf((east ? L.lands.east : L.lands.west)[u < L.shell.u[0] ? 0 : u < L.shell.u[1] ? 1 : u < L.shell.u[2] ? 2 : 3])) wrongLands++;
    } else {
      const v = vOf(fx, cy);
      if (L.fields.belts.some((t) => Math.abs(v - t) < BAND) || Math.abs(cy - L.volcanoY) < 10) continue;
      nRing++;
      const belt = v < L.fields.belts[1] ? 3 : v < L.fields.belts[2] ? 2 : v < L.fields.belts[3] ? 1 : 0;
      const want = v < 1 ? (cy > L.volcanoY ? Zone.Volcano : Zone.Fields) : zoneOf((east ? L.ring.east : L.ring.west)[belt]);
      if (z !== want) wrongRing++;
    }
  }
  check(nLands > 20000 && wrongLands === 0, `земли: зона не по оболочке u в ${wrongLands} из ${nLands} клеток`);
  check(nRing > 100000 && wrongRing === 0, `кольцо: зона не по поясу v в ${wrongRing} из ${nRing} клеток`);
  console.log(`   порядок зон: земли ${nLands} клеток, кольцо и Поля ${nRing}, не на своём месте ${wrongLands} | ${wrongRing}`);
  // уровни мобов внутри зоны растут к центру: от столицы к реке (земли), от реки к Полям (кольцо), к центру Полей
  const LAND_ZONES = new Set<Zone>([...L.lands.west, ...L.lands.east].map(zoneOf));
  /** «Глубина» точки в зоне: чем больше, тем ближе к центру мира по замыслу (земли — дальше от столицы, кольцо и Поля — ближе к центру Полей). */
  const depth = (z: Zone, x: number, y: number) => {
    const fx = x > AXIS ? W - x : x;
    return LAND_ZONES.has(z) ? uOf(fx, y) : -vOf(fx, y);
  };
  const byZone = new Map<number, { d: number; lv: number }[]>();
  for (const sp of m.spawns) {
    const x = sp.x / TILE, y = sp.y / TILE, z = m.zone[Math.floor(y) * W + Math.floor(x)] as Zone;
    if (z === Zone.Dungeon) continue;
    (byZone.get(z) ?? byZone.set(z, []).get(z)!).push({ d: depth(z, x, y), lv: sp.level });
  }
  // данж: от входа (север, ось) к залу босса — по расстоянию от входа
  byZone.set(Zone.Dungeon, m.spawns
    .filter((sp) => m.zone[Math.floor(sp.y / TILE) * W + Math.floor(sp.x / TILE)] === Zone.Dungeon)
    .map((sp) => ({ d: Math.hypot(sp.x / TILE - AXIS, sp.y / TILE - DUNGEON.y0), lv: sp.level })));
  const rows: string[] = [];
  for (const [z, list] of byZone) {
    const [zlo, zhi] = ZONES[z].levels;
    if (list.length < 20 || zhi - zlo < 5) continue;
    const sorted = [...list].sort((a, b) => a.d - b.d), half = sorted.length >> 1;
    const avg = (b: { lv: number }[]) => b.reduce((x, y) => x + y.lv, 0) / b.length;
    const near = avg(sorted.slice(0, half)), far = avg(sorted.slice(half));
    rows.push(`${ZONES[z].name} ${near.toFixed(1)}→${far.toFixed(1)}`);
    // ближняя к началу пути половина зоны слабее дальней хотя бы на четверть ширины диапазона
    check(far - near >= (zhi - zlo) * 0.25, `${ZONES[z].name} (${zlo}–${zhi}): уровни мобов не растут к центру (ближняя половина ${near.toFixed(1)}, дальняя ${far.toFixed(1)})`);
  }
  console.log("   средний уровень мобов (ближе к началу → дальше): " + rows.join("; "));
  // у столицы слабые мобы: в пределах 36 тайлов от центра — не выше 5-го уровня
  for (const c of [aur, mor]) {
    const near = m.spawns.filter((sp) => Math.hypot(sp.x - c.spawn.x, sp.y - c.spawn.y) < 36 * TILE);
    check(near.length > 0 && Math.max(...near.map((sp) => sp.level)) <= 5, `${c.id}: у столицы мобы выше 5 ур.: ${Math.max(0, ...near.map((sp) => sp.level))}`);
  }
}

// ---------- 4. вход только по мостам ----------
console.log("4. вход на чужие земли");
const deck = new Set<number>();
for (const o of m.objects) {
  if (o.kind !== "bridge_h") continue;
  const cx = Math.round(o.x / TILE), y1 = Math.round(o.y / TILE);
  for (let y = y1 - 3; y < y1; y++) for (let x = cx - 3; x < cx + 3; x++) deck.add(y * W + x);
}
const bridgeObjs = m.objects.filter((o) => o.kind === "bridge_h" || o.kind === "bridge_v");
check(bridgeObjs.length === 6, `мостов 6 (по три на реку), сейчас ${bridgeObjs.length}`);
{
  const dry = passOf(deck);
  for (const [name, sx, sy, isEast] of [["Аурелион", sA % W, (sA / W) | 0, false], ["Мортхейм", sM % W, (sM / W) | 0, true]] as const) {
    const r = dijkstra(dry, sx, sy);
    let leakOther = 0, reached = 0;
    for (let i = 0; i < r.dist.length; i++) {
      if (!isFinite(r.dist[i])) continue;
      reached++;
      const x = i % W, y = (i / W) | 0;
      // за рекой: у запада — восточнее оси западной реки, у востока — западнее оси восточной (зеркально)
      if ((isEast ? W - (x + 0.5) : x + 0.5) > riverX(y + 0.5)) leakOther++;
    }
    check(leakOther === 0, `${name}: без мостов достижимо ${leakOther} клеток за рекой (брод или дыра в стене)`);
    console.log(`   ${name}: без мостов достижимо ${reached} клеток (только свои земли и берег), за рекой — ${leakOther}`);
    const other = isEast ? sA : sM, emberSp = cellOfPx(cityById("ember")!.spawn.x, cityById("ember")!.spawn.y);
    check(!isFinite(r.dist[other]), `${name}: без мостов дошёл до чужой столицы`);
    check(!isFinite(r.dist[emberSp]), `${name}: без мостов дошёл до Эмберхолла`);
  }
}

// ---------- 5. связность с мостами ----------
console.log("5. связность");
{
  const reach = (c: number) => isFinite(rA.dist[c]) && isFinite(rM.dist[c]);
  const pts: [string, number, number][] = [];
  for (const id of ["aurelion", "morthaim", "oasis", "snow_valley", "ember"]) { const c = cityById(id)!; pts.push([`${id} spawn`, c.spawn.x, c.spawn.y], [`${id} arrive`, c.arrive.x, c.arrive.y]); }
  for (const b of BOSS_SPAWNS) pts.push([`босс ${b.id}`, b.x, b.y + TILE / 2]);
  for (const o of bridgeObjs) pts.push([`мост ${Math.round(o.x / TILE)},${Math.round(o.y / TILE)}`, o.x, o.y - 40]);
  for (const [n, x, y] of pts) {
    const c = cellOfPx(x, y);
    check(!block(c % W, (c / W) | 0), `${n}: непроходимо`);
    check(reach(c), `${n}: недостижимо от столиц`);
  }
  // все залы данжа — пешком (раньше зал Ашлорда был недостижим)
  for (const [x0, y0, x1, y1] of DUNGEON_ROOMS) {
    // в залах есть лавовые лужи и колонны: зал достижим, если пешком можно дойти почти до всех его свободных клеток
    let free = 0, got = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!block(x, y)) { free++; if (isFinite(rA.dist[y * W + x])) got++; }
    check(free > 0 && got >= free * 0.95, `зал данжа [${x0},${y0},${x1},${y1}] недостижим пешком: ${got} из ${free} свободных клеток`);
  }
  const boss = BOSS_SPAWNS.find((b) => b.id === "ashlord")!;
  check(isFinite(rA.dist[cellOfPx(boss.x, boss.y)]), "зал босса данжа (Повелитель Пепла) недостижим пешком");
  // вход в данж — с севера, на оси: клетка перед входом проходима, западных ворот нет
  const ent = cellOfPx(AXIS * TILE, (DUNGEON.y0 - 1) * TILE);
  check(isFinite(rA.dist[ent]) && !block(AXIS, DUNGEON.y0) && !block(AXIS - 1, DUNGEON.y0), "вход в данж с севера на оси не открыт");
  {
    // один вход: по всему периметру прямоугольника данжа открыты только клетки северного входа (первый зал), других выходов нет
    const [ex0, , ex1] = DUNGEON_ROOMS[0];
    const open: string[] = [];
    for (let x = DUNGEON.x0; x < DUNGEON.x1; x++) for (const y of [DUNGEON.y0, DUNGEON.y1 - 1]) if (!block(x, y) && !(y === DUNGEON.y0 && x >= ex0 && x < ex1)) open.push(`${x},${y}`);
    for (let y = DUNGEON.y0; y < DUNGEON.y1; y++) for (const x of [DUNGEON.x0, DUNGEON.x1 - 1]) if (!block(x, y)) open.push(`${x},${y}`);
    check(open.length === 0, `у данжа лишние выходы по периметру (${open.length}): ${open.slice(0, 6).join(" ")}`);
    check([...Array(ex1 - ex0).keys()].every((i) => !block(ex0 + i, DUNGEON.y0)), "северный вход в данж закрыт");
  }
  // мобы: проходимые клетки, достижимые от столиц; мало недостижимых «карманов»
  let lost = 0;
  for (const s of m.spawns) { const c = cellOfPx(s.x, s.y); if (block(c % W, (c / W) | 0)) fail(`моб ${s.mob} на непроходимой клетке`); else if (!isFinite(rA.dist[c])) lost++; }
  check(lost <= m.spawns.length * 0.02, `недостижимых точек появления мобов ${lost} из ${m.spawns.length}`);
  console.log(`   точек появления мобов ${m.spawns.length}, недостижимых ${lost}`);
}

// ---------- 6. стены и башни ----------
console.log("6. стены вдоль рек");
{
  const L = world.walls.line as [number, number][];
  const col = (y: number) => { for (let i = 0; i < L.length - 1; i++) { const [x0, y0] = L[i], [x1, y1] = L[i + 1]; if (y + 0.5 >= y0 && y + 0.5 <= y1) return Math.floor(x0 + ((x1 - x0) * (y + 0.5 - y0)) / (y1 - y0)); } return Math.floor(L[L.length - 1][0]); };
  const gate = (y: number) => world.walls.gates.some((g) => Math.abs(y - g.y) <= g.half);
  let holes = 0, gateOpen = 0;
  for (let y = 0; y < H; y++) for (const east of [false, true]) {
    const x = east ? mir(col(y)) : col(y);
    if (gate(y)) { if (!block(x, y)) gateOpen++; continue; }
    if (!block(x, y)) holes++;
  }
  check(holes === 0, `в стене ${holes} дыр вне ворот`);
  check(gateOpen === 6 * 5, `проёмы ворот закрыты: открытых клеток ${gateOpen} из ${6 * 5}`);
  // ворота — только у мостов: ровно три проёма, id совпадают с мостами, центр не дальше клетки от моста; других открытых клеток в стене нет
  const gates = world.walls.gates;
  check(gates.length === bridges.length && bridges.every((b) => gates.some((g) => g.id === b.id && Math.abs(g.y - Math.floor(b.y)) <= 1)),
    `проёмы ворот не у мостов: ворота ${gates.map((g) => g.id + "@" + g.y).join(", ")}, мосты ${bridges.map((b) => b.id + "@" + b.y).join(", ")}`);
  for (const east of [false, true]) {
    const runs: [number, number][] = [];
    for (let y = 0; y < H; y++) {
      if (block(east ? mir(col(y)) : col(y), y)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === y - 1) last[1] = y; else runs.push([y, y]);
    }
    check(runs.length === gates.length && gates.every((g) => runs.some(([a, b]) => a === g.y - g.half && b === g.y + g.half)),
      `${east ? "восток" : "запад"}: открытые клетки стены (${runs.map(([a, b]) => a + "–" + b).join(", ")}) не совпадают с воротами`);
  }
  {
    // заливка от столицы по 8 направлениям, срезая углы: при закрытых воротах до полосы между стеной и рекой не дойти, при открытых — доходят
    const flood = (pass: Uint8Array, start: number, east: boolean) => {
      const seen = new Uint8Array(W * H), stack = [start];
      seen[start] = 1;
      let leak = 0;
      while (stack.length) {
        const i = stack.pop()!, x = i % W, y = (i / W) | 0;
        if (east ? x < mir(col(y)) : x > col(y)) leak++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, j = ny * W + nx;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && pass[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      return leak;
    };
    const closed = passOf();
    for (const east of [false, true]) for (const g of gates) for (let y = g.y - g.half; y <= g.y + g.half; y++) for (let dx = -1; dx <= 1; dx++) closed[y * W + (east ? mir(col(y) + dx) : col(y) + dx)] = 0;
    const lw = flood(closed, sA, false), le = flood(closed, sM, true), ow = flood(pass, sA, false), oe = flood(pass, sM, true);
    check(lw === 0 && le === 0, `при закрытых воротах изнутри достижимо клеток за стеной: запад ${lw}, восток ${le}`);
    check(ow > 0 && oe > 0, "заливка не видит берега и при открытых воротах: проверка ничего не проверяет");
    console.log(`   заливка от столиц, срезая углы: за стеной при закрытых воротах ${lw} | ${le}, при открытых ${ow} | ${oe}`);
  }
  // ворота: сквозь проём по прямой от берега до земель (клетки строки моста проходимы на 8 клеток по обе стороны стены)
  for (const b of bridges) for (const east of [false, true]) {
    const y = Math.floor(b.y), c = col(y);
    let ok = true;
    for (let dx = -4; dx <= 8; dx++) { const x = east ? mir(c + dx) : c + dx; if (block(x, y)) ok = false; }
    check(ok, `${b.name} (${east ? "восток" : "запад"}): проезд через ворота и мост перекрыт`);
  }
  // камыш растёт у воды, а не у стены: вдоль стен (до 2,5 тайла от оси) его нет ни у Сольгарда, ни у Умбрата (кроме краёв карты: там вода края)
  const reedsAtWall = m.objects.filter((o) => o.kind === "reeds" && o.y / TILE > 7 && o.y / TILE < H - 7 && Math.abs((o.x / TILE > AXIS ? W - o.x / TILE : o.x / TILE) - (col(Math.floor(o.y / TILE)) + 0.5)) <= 2.5).length;
  check(reedsAtWall === 0, `вдоль стен растёт камыш (${reedsAtWall} шт.): камыш считает стену водой`);
  const wallObjs = (k: string) => m.objects.filter((o) => o.kind === k).length;
  check(wallObjs("sol_wall_v") >= 300 && wallObjs("umb_wall_v") >= 300, `стен-колонок мало: ${wallObjs("sol_wall_v")} | ${wallObjs("umb_wall_v")}`);
  const towers = world.walls.towers.map((t) => t.y);
  const solT = m.objects.filter((o) => o.kind === "sol_tower").length, umbT = m.objects.filter((o) => o.kind === "umb_tower").length;
  check(solT === umbT, `башен Сольгарда ${solT}, Умбрата ${umbT} — должно быть поровну`);
  check(solT === towers.length + 8 && umbT === towers.length + 8, `башен вдоль реки ${solT - 8} вместо ${towers.length} (плюс 8 у столицы)`);
  // «через равные промежутки»: между соседними башнями не у ворот ~23,6 тайла
  const free = towers.filter((y) => !world.walls.gates.some((g) => Math.abs(y - g.y) <= 5));
  const gaps = free.slice(1).map((y, i) => y - free[i]).filter((g) => g < 40);
  check(gaps.every((g) => Math.abs(g - 23.6) <= 1.6), "башни вдоль стены стоят не через равные промежутки: " + gaps.join(","));
  console.log(`   башен вдоль каждой реки ${towers.length} (у ворот по две), шаг ${gaps.join(" ")}, колонка стены на y=180: ${col(180)} и ${mir(col(180))}`);
}

// ---------- 7. мобы не у берега и города на ровном месте ----------
console.log("7. мобы и места");
{
  let near = 0;
  for (const s of m.spawns) {
    const x = s.x / TILE, y = s.y / TILE, d = Math.abs((x > AXIS ? W - x : x) - riverX(y));
    if (d < 12) near++;
  }
  check(near === 0, `мобов у берега реки (ближе 12 тайлов): ${near}`);
  const perZone = new Map<number, number>();
  for (const s of m.spawns) { const z = m.zone[Math.floor(s.y / TILE) * W + Math.floor(s.x / TILE)]; perZone.set(z, (perZone.get(z) ?? 0) + 1); }
  for (const z of new Set<number>(m.zone)) if (!isTownZone(z) && z !== Zone.Arena) check((perZone.get(z) ?? 0) >= 10, `в зоне ${ZONES[z].name} мобов меньше 10: ${perZone.get(z) ?? 0}`);
  console.log("   мобов по зонам: " + [...perZone.entries()].sort((a, b) => lvMid(a[0]) - lvMid(b[0])).map(([z, n]) => `${ZONES[z].name} ${n}`).join("; "));
  // врата рейда — в Пылающем вулкане и достижимы пешком; узлы добычи всех четырёх ресурсов на месте
  check(!!RAID_GATE && zoneAtPx(m, RAID_GATE.x, RAID_GATE.y) === Zone.Volcano && isFinite(rA.dist[cellOfPx(RAID_GATE.x, RAID_GATE.y)]), "врата рейда не в Пылающем вулкане или недостижимы");
  check(!!RAID_GATE && Math.abs(RAID_GATE.x / TILE - AXIS) <= 1, `врата рейда не на оси: x = ${RAID_GATE ? (RAID_GATE.x / TILE).toFixed(1) : "нет"} (ось ${AXIS})`);
  // узлы добычи: у каждой стороны (запад — Сольгард, восток — Умбрат) свои узлы всех четырёх видов, без большого перекоса
  const MIN_NODES: Record<string, number> = { cactus_juice: 20, ice_crystal: 20, obsidian: 8, pearl: 4 };
  const nodeRows: string[] = [];
  for (const [r, min] of Object.entries(MIN_NODES)) {
    const c = [0, 0];
    for (const n of m.nodes) if (n.res === r) c[n.x / TILE < AXIS ? 0 : 1]++;
    nodeRows.push(`${r} ${c[0]}|${c[1]}`);
    check(c[0] >= min && c[1] >= min && Math.max(...c) <= 2.5 * Math.min(...c), `узлы ${r}: запад ${c[0]}, восток ${c[1]} (нужно не меньше ${min} на сторону и разница не больше чем в 2,5 раза)`);
  }
  console.log("   узлы добычи (запад|восток): " + nodeRows.join("; "));
  // бестиарий: место обитания боссов — зона, где они стоят на карте (тексты слухов в server/src/game/rumors.ts правятся вместе с ним)
  for (const id of ["ent", "witch", "ashlord"]) {
    const b = BOSS_SPAWNS.find((q) => q.id === id)!, zone = ZONES[zoneAtPx(m, b.x, b.y)].name, hab = (bestiary as Record<string, { habitat?: string[] }>)[id]?.habitat ?? [];
    check(hab.includes(zone), `бестиарий: ${id} обитает в «${hab.join(", ")}», а на карте стоит в «${zone}»`);
  }
  // Эмберхолл на оси: смещение не больше тайла; города на местах схемы
  check(Math.abs(TOWN.x + 0.5 - AXIS) <= 1 && TOWN.y === 60, `Эмберхолл не на оси: ${TOWN.x},${TOWN.y}`);
  const fw = cityById("oasis")!, fe = cityById("snow_valley")!;
  check(fw.x === mir(fe.x) && fw.y === fe.y, "форты запада и востока не зеркальны");
  const a = cityById("aurelion")!, o = cityById("morthaim")!;
  check(a.x === mir(o.x) && a.y === o.y, "столицы не зеркальны");
}

console.log(bad ? `ПРОБЛЕМ: ${bad}` : "карта: раскладка ок");
process.exit(bad ? 1 : 0);
