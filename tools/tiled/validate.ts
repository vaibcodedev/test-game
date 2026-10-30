/**
 * Проверка карты из Tiled (docs/plan/next.md 1.6): после импорта (tools/tiled/import.ts).
 * Ошибки:
 *  - нет прохода (поиск в ширину по клеткам без CELL_BLOCK, 4 соседа) от точки появления (Эмберхолл) до: камней телепорта и мест
 *    прибытия (столицы, форты, Эмберхолл, поселения), мест возрождения городов и поселений, обоих берегов каждого моста, входа в данж,
 *    арен боссов, торговцев;
 *  - моб стоит на непроходимой клетке;
 *  - объект в воде или лаве (все 4 угла клетки — вода/лава; кроме мостов, кувшинок и того, что ставится на воду нарочно);
 *  - объект без следа стоит в стене (CELL_WALL);
 *  - повтор id (объекты, мобы, боссы — из импорта; NPC, патрули, телепорты, боссы — по id).
 * Предупреждения: NPC или босс на непроходимой клетке, моб вне диапазона уровней зоны.
 * Запуск: npx tsx tools/tiled/validate.ts [папка] — код выхода 1 при ошибках.
 */
import path from "node:path";
import world from "../../data/world.json";
import { CITIES } from "../../shared/cities";
import { MAP_W } from "../../shared/constants";
import { CELL_BLOCK, CELL_WALL, DUNGEON_DOOR, OBJECT_FOOTPRINT, T, ZONES, riverX, type WorldMap } from "../../shared/map";
import { SETTLEMENTS } from "../../shared/settlements";
import { OUT_DIR, TS } from "./common";
import { importWorld } from "./import";
import type { Placements } from "./placements";

/** Что генератор ставит на воду нарочно (мосты, кувшинки, камыш у берега, обереги и опоры у реки). */
const WATER_OK = new Set(["bridge_h", "bridge_v", "lilypad", "reeds"]);

export interface Report { errors: string[]; warnings: string[]; reachable: number; targets: number }

export function validateWorld(m: WorldMap, pl: Placements, importWarnings: string[] = []): Report {
  const errors: string[] = [], warnings: string[] = [];
  const W = m.w, H = m.h;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || !!(m.cell[y * W + x] & CELL_BLOCK);
  const tileOf = (px: number, py: number) => ({ x: Math.floor(px / TS), y: Math.floor(py / TS) });
  const where = (px: number, py: number) => `клетка ${Math.floor(px / TS)},${Math.floor(py / TS)}`;

  for (const w of importWarnings) if (w.startsWith("повтор id")) errors.push(w);

  // проходимость: поиск в ширину от точки появления
  const seen = new Uint8Array(W * H);
  const s = tileOf(m.playerSpawn.x, m.playerSpawn.y);
  const near = (x: number, y: number, r: number) => {
    for (let d = 0; d <= r; d++) for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
      if (!blocked(x + i, y + j)) return { x: x + i, y: y + j };
    }
    return null;
  };
  const start = near(s.x, s.y, 3);
  let reachable = 0;
  if (!start) errors.push(`точка появления стоит в непроходимом (${where(m.playerSpawn.x, m.playerSpawn.y)})`);
  else {
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    q[qt++] = start.y * W + start.x; seen[start.y * W + start.x] = 1;
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i - x) / W;
      reachable++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (blocked(nx, ny) || seen[ny * W + nx]) continue;
        seen[ny * W + nx] = 1; q[qt++] = ny * W + nx;
      }
    }
  }
  const targets: { what: string; px: number; py: number; r: number }[] = [];
  for (const t of pl.teleports) { targets.push({ what: `камень телепорта «${t.name}»`, px: t.x, py: t.y, r: 2 }, { what: `прибытие телепорта «${t.name}»`, px: t.arriveX, py: t.arriveY, r: 1 }); }
  for (const c of CITIES) targets.push({ what: `возрождение «${c.name}»`, px: c.spawn.x, py: c.spawn.y, r: 1 });
  for (const st of SETTLEMENTS) targets.push({ what: `возрождение «${st.name}»`, px: st.spawn.x, py: st.spawn.y, r: 1 });
  for (const b of world.bridges) {
    const rx = riverX(b.y);
    for (const [side, x] of [["запад", rx], ["восток", MAP_W - rx]] as const) {
      targets.push({ what: `${b.name} (${side}), левый берег`, px: (x - 5) * TS, py: b.y * TS, r: 3 }, { what: `${b.name} (${side}), правый берег`, px: (x + 5) * TS, py: b.y * TS, r: 3 });
    }
  }
  targets.push({ what: "вход в данж", px: DUNGEON_DOOR.x, py: DUNGEON_DOOR.y, r: 2 });
  for (const b of m.bosses) targets.push({ what: `арена босса ${b.id}`, px: b.x, py: b.y, r: Math.max(1, Math.floor(b.arena / TS)) });
  m.merchants.forEach((p, i) => targets.push({ what: `торговец #${i}`, px: p.x, py: p.y, r: 2 }));
  if (start) for (const t of targets) {
    const c = tileOf(t.px, t.py);
    let ok = false;
    for (let j = -t.r; j <= t.r && !ok; j++) for (let i = -t.r; i <= t.r && !ok; i++) {
      const x = c.x + i, y = c.y + j;
      if (!blocked(x, y) && seen[y * W + x]) ok = true;
    }
    if (!ok) errors.push(`нет прохода к: ${t.what} (${where(t.px, t.py)})`);
  }

  // мобы, боссы, NPC на непроходимом; уровни мобов
  m.spawns.forEach((sp, i) => {
    const c = tileOf(sp.x, sp.y);
    if (blocked(c.x, c.y)) errors.push(`моб #${i} ${sp.mob} на непроходимой клетке (${where(sp.x, sp.y)})`);
    const z = ZONES[m.zone[c.y * W + c.x]];
    if (z && z.levels[1] > 0 && (sp.level < z.levels[0] - 2 || sp.level > z.levels[1] + 2)) warnings.push(`моб #${i} ${sp.mob} ур. ${sp.level} вне зоны «${z.name}» ${z.levels[0]}–${z.levels[1]}`);
  });
  for (const b of m.bosses) { const c = tileOf(b.x, b.y); if (blocked(c.x, c.y)) warnings.push(`босс ${b.id} в центре арены на непроходимой клетке`); }
  for (const n of pl.npcs) { const c = tileOf(n.x, n.y); if (blocked(c.x, c.y)) warnings.push(`NPC ${n.id} «${n.name}» на непроходимой клетке (${where(n.x, n.y)})`); }

  // объекты в воде и в стенах
  const V = (x: number, y: number) => m.vtx[y * (W + 1) + x];
  const wet = (t: number) => t === T.Water || t === T.Lava;
  let inWater = 0, inWall = 0;
  m.objects.forEach((o, i) => {
    const x = Math.floor(o.x / TS), y = Math.floor((o.y - 1) / TS);
    if (x < 0 || y < 0 || x >= W || y >= H) { errors.push(`объект #${i} ${o.kind} за краем мира`); return; }
    if (!WATER_OK.has(o.kind) && wet(V(x, y)) && wet(V(x + 1, y)) && wet(V(x + 1, y + 1)) && wet(V(x, y + 1))) {
      if (inWater++ < 20) errors.push(`объект #${i} ${o.kind} в воде/лаве (${where(o.x, o.y)})`);
    }
    if (!OBJECT_FOOTPRINT[o.kind] && m.cell[y * W + x] & CELL_WALL) { if (inWall++ < 20) errors.push(`объект #${i} ${o.kind} в стене (${where(o.x, o.y)})`); }
  });
  if (inWater > 20) errors.push(`… и ещё ${inWater - 20} объектов в воде`);
  if (inWall > 20) errors.push(`… и ещё ${inWall - 20} объектов в стенах`);

  // уникальность id
  const uniq = (what: string, ids: string[]) => {
    const s = new Set<string>();
    for (const id of ids) { if (s.has(id)) errors.push(`повтор id «${id}» (${what})`); s.add(id); }
  };
  uniq("NPC", pl.npcs.map((n) => n.id));
  uniq("патрули", pl.patrols.map((p) => p.id));
  uniq("телепорты", pl.teleports.map((t) => t.id));
  uniq("боссы", m.bosses.map((b) => b.id).filter(Boolean));
  return { errors, warnings, reachable, targets: targets.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("tools/tiled/validate.ts")) {
  const dir = process.argv[2] ?? OUT_DIR;
  const im = importWorld(dir);
  const r = validateWorld(im.map, im.placements, im.warnings);
  for (const w of im.warnings) if (!w.startsWith("повтор id")) console.log("! импорт: " + w);
  for (const w of r.warnings.slice(0, 30)) console.log("? " + w);
  if (r.warnings.length > 30) console.log(`? … ещё ${r.warnings.length - 30} предупреждений`);
  for (const e of r.errors) console.log("ОШИБКА: " + e);
  console.log(`проверка ${dir}: целей пути ${r.targets}, достижимых клеток ${r.reachable}; ошибок ${r.errors.length}, предупреждений ${r.warnings.length}`);
  process.exit(r.errors.length ? 1 : 0);
}
