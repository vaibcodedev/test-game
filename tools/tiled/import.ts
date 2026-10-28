/**
 * Импорт мира из Tiled: main.world + r<x>-<y>.tmj → WorldMap того же вида, что даёт generateMap (vtx, cell, zone, objects, spawns,
 * bosses, nodes, точки), плюс NPC, патрули и телепорты (Placements — пока только для проверки, игра их отсюда не берёт).
 * Правила чтения:
 *  - vtx — из углов плиток слоя «Земля» (набор углов в ground.tsx); вершина берётся из клетки справа-снизу от неё, у краёв — из соседей;
 *  - cell — слой «Проходимость» (id плитки + 1 = флаги CELL_*), пусто = 0;
 *  - zone — многоугольники слоя «Зоны» (свойство zone, иначе по имени зоны): от больших к малым, клетка — по центру;
 *  - объекты — tile-объекты слоёв «Постройки», «Деревья и камни», «Ресурсы», «Декор»: kind и v из плитки (или свойства kind/v объекта),
 *    flip — отражение по горизонтали; порядок — по свойству id, новые без id — в конец; node=true → узел добычи;
 *  - мобы — точки «Мобы» (mob, level), боссы — эллипсы (центр, радиус = арена), точки — классы PlayerSpawn, Merchant, MerchantSpot.
 * Запуск: npx tsx tools/tiled/import.ts [папка] — печатает сводку.
 */
import fs from "node:fs";
import path from "node:path";
import { ZONES, type BossSpawn, type MapObject, type SpawnPoint, type WorldMap } from "../../shared/map";
import type { MapNode } from "../../shared/biomes";
import { FLIP_H, GID_MASK, L, OBJECT_LAYERS, OUT_DIR, TS, decodeLayer, getProp, readTsx, type TMap, type TObject, type Tsx } from "./common";
import type { Npc, Patrol, Placements, Teleport } from "./placements";

export interface Imported { map: WorldMap; placements: Placements; warnings: string[] }

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : v === undefined || v === "" ? d : Number(v));

export function importWorld(dir = OUT_DIR): Imported {
  const warnings: string[] = [];
  const world = JSON.parse(fs.readFileSync(path.join(dir, "main.world"), "utf8")) as { maps: { fileName: string; x: number; y: number }[] };
  const regions = world.maps.map((e) => ({ e, map: JSON.parse(fs.readFileSync(path.join(dir, e.fileName), "utf8")) as TMap }));
  if (!regions.length) throw new Error("в main.world нет карт");
  const p0 = regions[0].map.properties;
  const w = num(getProp(p0, "worldW")), h = num(getProp(p0, "worldH")), seed = num(getProp(p0, "seed"));

  // наборы тайлов (по источнику; firstgid у каждой карты свой)
  const tsxCache = new Map<string, Tsx>();
  const tsx = (src: string) => { const f = path.resolve(dir, src); if (!tsxCache.has(f)) tsxCache.set(f, readTsx(f)); return tsxCache.get(f)!; };
  const resolver = (m: TMap) => {
    const sets = [...m.tilesets].sort((a, b) => b.firstgid - a.firstgid).map((t) => ({ first: t.firstgid, kind: path.basename(t.source, ".tsx"), ts: tsx(t.source) }));
    return (gid: number) => { const g = gid & GID_MASK; if (!g) return null; const s = sets.find((q) => g >= q.first)!; return { kind: s.kind, ts: s.ts, id: g - s.first }; };
  };

  const VW = w + 1, VH = h + 1;
  const corner = new Int16Array(w * h * 4).fill(-1); // углы клетки TL, TR, BR, BL
  const cell = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h).fill(255);
  const zonePolys: { z: number; pts: { x: number; y: number }[]; area: number }[] = [];
  const objs: { o: MapObject; id?: number; node?: { res: string }; seq: number }[] = [];
  const spawns: { s: SpawnPoint; id?: number; seq: number }[] = [];
  const bosses: { b: BossSpawn; id?: number; seq: number }[] = [];
  let playerSpawn: { x: number; y: number } | null = null, merchant: { x: number; y: number } | null = null;
  const merchants: { p: { x: number; y: number }; i: number }[] = [];
  const npcs: Npc[] = [], patrols: Patrol[] = [], teleports: Teleport[] = [];
  let seq = 0;
  const zoneByName = new Map(ZONES.map((z, i) => [z.name, i]));

  for (const { e, map } of regions) {
    const rp = map.properties;
    const tx0 = num(getProp(rp, "ox"), e.x / TS), ty0 = num(getProp(rp, "oy"), e.y / TS), ox = tx0 * TS, oy = ty0 * TS;
    const tile = resolver(map), rw = map.width, rh = map.height;
    const layer = (name: string) => map.layers.find((l) => l.name === name);
    const gl = layer(L.ground);
    if (gl) {
      const d = decodeLayer(gl, rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const wx = tx0 + x, wy = ty0 + y;
        if (wx >= w || wy >= h) continue;
        const t = tile(d[y * rw + x]);
        const wid = t?.ts.wang.get(t.id);
        if (!wid) continue;
        const i = (wy * w + wx) * 4;
        corner[i] = wid[7] - 1; corner[i + 1] = wid[1] - 1; corner[i + 2] = wid[3] - 1; corner[i + 3] = wid[5] - 1;
      }
    } else warnings.push(`${e.fileName}: нет слоя «${L.ground}»`);
    const cl = layer(L.cell);
    if (cl) {
      const d = decodeLayer(cl, rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const wx = tx0 + x, wy = ty0 + y;
        if (wx >= w || wy >= h) continue;
        const t = tile(d[y * rw + x]);
        cell[wy * w + wx] = t ? num(t.ts.tiles.get(t.id)?.props.flags, t.id + 1) : 0;
      }
    }
    const objectsOf = (name: string): TObject[] => (layer(name)?.objects ?? []);
    for (const o of objectsOf(L.zones)) {
      if (!o.polygon) continue;
      const zp = getProp(o.properties, "zone");
      const z = zp !== undefined && zp !== "" ? num(zp) : zoneByName.get(String(getProp(o.properties, "name") ?? o.name));
      if (z === undefined || Number.isNaN(z)) { warnings.push(`${e.fileName}: зона «${o.name}» без номера и известного имени`); continue; }
      const pts = o.polygon.map((p) => ({ x: ox + o.x + p.x, y: oy + o.y + p.y }));
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
      zonePolys.push({ z, pts, area: Math.abs(area) });
    }
    /** Мировая координата: точное значение из свойства, если объект не двигали. */
    const wxOf = (o: TObject, l: number, base: number, key: string) => { const a = getProp(o.properties, key); return typeof a === "number" && Math.abs(a - (l + base)) < 0.01 ? a : l + base; };
    for (const ln of OBJECT_LAYERS) for (const o of objectsOf(ln)) {
      if (!o.gid) { warnings.push(`${e.fileName}/${ln}: объект ${o.id} без картинки — пропущен`); continue; }
      const t = tile(o.gid);
      const tp = t?.ts.tiles.get(t.id)?.props ?? {};
      const kind = String(getProp(o.properties, "kind") ?? tp.kind ?? "");
      if (!kind) { warnings.push(`${e.fileName}/${ln}: объект ${o.id} — неизвестная плитка`); continue; }
      const v = getProp(o.properties, "v") ?? tp.v;
      const mo: MapObject = { kind, x: wxOf(o, o.x, ox, "ax"), y: wxOf(o, o.y, oy, "ay") };
      const label = getProp(o.properties, "label");
      if (label !== undefined) mo.label = String(label);
      if ((o.gid >>> 0) >= FLIP_H) mo.flip = true;
      if (v !== undefined && v !== "") mo.v = String(v);
      const dz = getProp(o.properties, "dz");
      if (dz !== undefined) mo.dz = num(dz);
      const id = getProp(o.properties, "id");
      objs.push({ o: mo, id: id === undefined ? undefined : num(id), node: getProp(o.properties, "node") === true ? { res: String(getProp(o.properties, "res") ?? "") } : undefined, seq: seq++ });
    }
    for (const o of objectsOf(L.mobs)) {
      const id = getProp(o.properties, "id");
      spawns.push({ s: { x: ox + o.x, y: oy + o.y, mob: String(getProp(o.properties, "mob") ?? o.name), level: num(getProp(o.properties, "level"), 1) }, id: id === undefined ? undefined : num(id), seq: seq++ });
    }
    for (const o of objectsOf(L.bosses)) {
      const id = getProp(o.properties, "id");
      bosses.push({ b: { id: String(getProp(o.properties, "boss") ?? o.name), x: ox + o.x + o.width / 2, y: oy + o.y + o.height / 2, arena: o.width / 2 }, id: id === undefined ? undefined : num(id), seq: seq++ });
    }
    for (const o of objectsOf(L.points)) {
      const p = { x: ox + o.x, y: oy + o.y };
      if (o.type === "PlayerSpawn") playerSpawn = p;
      else if (o.type === "Merchant") merchant = p;
      else if (o.type === "MerchantSpot") merchants.push({ p, i: num(getProp(o.properties, "i"), 1e9) });
    }
    for (const o of objectsOf(L.tele)) teleports.push({ id: String(getProp(o.properties, "id") ?? o.name), name: o.name, x: ox + o.x, y: oy + o.y, arriveX: num(getProp(o.properties, "arriveX"), ox + o.x), arriveY: num(getProp(o.properties, "arriveY"), oy + o.y + TS) });
    for (const o of objectsOf(L.npc)) npcs.push({ id: String(getProp(o.properties, "id") ?? ""), role: String(getProp(o.properties, "role") ?? ""), name: o.name, sprite: String(getProp(o.properties, "sprite") ?? ""), place: String(getProp(o.properties, "place") ?? ""), x: ox + o.x, y: oy + o.y });
    for (const o of objectsOf(L.patrols)) if (o.polyline) patrols.push({ id: String(getProp(o.properties, "id") ?? o.name), kind: String(getProp(o.properties, "kind") ?? ""), place: String(getProp(o.properties, "place") ?? ""), points: o.polyline.map((p) => ({ x: ox + o.x + p.x, y: oy + o.y + p.y })) });
  }

  // vtx из углов клеток: TL клетки (x, y), иначе TR (x−1, y), BL (x, y−1), BR (x−1, y−1)
  const vtx = new Uint8Array(VW * VH);
  let holes = 0;
  for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
    let t = -1;
    const c = (x: number, y: number, k: number) => { if (t < 0 && x >= 0 && y >= 0 && x < w && y < h) t = corner[(y * w + x) * 4 + k]; };
    c(vx, vy, 0); c(vx - 1, vy, 1); c(vx, vy - 1, 3); c(vx - 1, vy - 1, 2);
    if (t < 0) holes++;
    vtx[vy * VW + vx] = Math.max(0, t);
  }
  if (holes) warnings.push(`земля: ${holes} вершин без плитки (стёрто?) — поставлена вода`);

  // зоны: от больших многоугольников к малым (вложенная зона рисуется поверх), клетка — по центру
  zonePolys.sort((a, b) => b.area - a.area);
  for (const zp of zonePolys) {
    const ys = zp.pts.map((p) => p.y);
    const ty0 = Math.max(0, Math.floor(Math.min(...ys) / TS)), ty1 = Math.min(h - 1, Math.ceil(Math.max(...ys) / TS));
    for (let ty = ty0; ty <= ty1; ty++) {
      const yc = (ty + 0.5) * TS, xs: number[] = [];
      for (let i = 0; i < zp.pts.length; i++) {
        const a = zp.pts[i], b = zp.pts[(i + 1) % zp.pts.length];
        if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const tx0 = Math.max(0, Math.ceil(xs[k] / TS - 0.5)), tx1 = Math.min(w - 1, Math.ceil(xs[k + 1] / TS - 0.5) - 1);
        for (let tx = tx0; tx <= tx1; tx++) zone[ty * w + tx] = zp.z;
      }
    }
  }
  let noZone = 0;
  for (let i = 0; i < zone.length; i++) if (zone[i] === 255) { noZone++; zone[i] = 0; }
  if (noZone) warnings.push(`зоны: ${noZone} клеток не накрыты ни одной зоной — стали «${ZONES[0].name}»`);

  const dedup = <T extends { id?: number }>(a: T[], what: string) => { const s = new Set<number>(); for (const q of a) if (q.id !== undefined) { if (s.has(q.id)) { warnings.push(`повтор id ${q.id} (${what}) — копия считается новой`); q.id = undefined; } else s.add(q.id); } };
  dedup(objs, "объекты"); dedup(spawns, "мобы"); dedup(bosses, "боссы");
  const byId = <T extends { id?: number; seq: number }>(a: T[]) => a.sort((p, q) => (p.id ?? 1e12 + p.seq) - (q.id ?? 1e12 + q.seq) || p.seq - q.seq);
  byId(objs); byId(spawns); byId(bosses);
  const objects = objs.map((q) => q.o);
  const nodes: MapNode[] = [];
  objs.forEach((q, i) => { if (q.node) nodes.push({ id: i, kind: q.o.kind, res: q.node.res, x: q.o.x, y: q.o.y }); });
  merchants.sort((a, b) => a.i - b.i);
  if (!playerSpawn) warnings.push("нет точки PlayerSpawn");
  const map: WorldMap = {
    w, h, seed, vtx, cell, zone, objects,
    spawns: spawns.map((q) => q.s),
    bosses: bosses.map((q) => q.b),
    nodes,
    playerSpawn: playerSpawn ?? { x: 0, y: 0 },
    merchant: merchant ?? merchants[0]?.p ?? { x: 0, y: 0 },
    merchants: merchants.map((q) => q.p),
  };
  return { map, placements: { npcs, patrols, teleports }, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("tools/tiled/import.ts")) {
  const dir = process.argv[2] ?? OUT_DIR;
  const t0 = Date.now();
  const r = importWorld(dir);
  const m = r.map;
  console.log(`импорт ${dir}: ${m.w}×${m.h}, объектов ${m.objects.length}, мобов ${m.spawns.length}, боссов ${m.bosses.length}, узлов ${m.nodes.length}, NPC ${r.placements.npcs.length}, патрулей ${r.placements.patrols.length}, телепортов ${r.placements.teleports.length}; ${Date.now() - t0} мс`);
  for (const w of r.warnings) console.log("! " + w);
}
