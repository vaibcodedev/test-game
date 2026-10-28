/**
 * Экспорт мира в Tiled 1.12: generateMap(seed) → tools/out/tiled/ (превью, в git не коммитится).
 *   main.world          — «Мир» Tiled: 30 карт-регионов рядом (10 × 3, по 110 × 120 тайлов);
 *   r<x>-<y>.tmj        — регион: слои «Земля» (углы-переходы, набор углов), «Проходимость» (маска CELL_*), «Зоны» (многоугольники
 *                         с zone, name, level), объекты map.objects картинками («Постройки», «Деревья и камни», «Ресурсы», «Декор»;
 *                         свойство id = индекс в map.objects), «Мобы», «Боссы и арены» (эллипс = арена), «Точки», «Телепорты», «NPC», «Патрули»;
 *   ground/cell/objects.tsx — наборы (tools/tiled/tilesets.ts); ashen.tiled-project — проект со списком мобов.
 * Запуск: npx tsx tools/tiled/export.ts [--seed N] [--out папка]
 * Игра эти файлы не читает: источник мира — generateMap. Обратно — tools/tiled/import.ts, проверка — tools/tiled/validate.ts.
 */
import fs from "node:fs";
import path from "node:path";
import mobsData from "../../data/mobs.json";
import { MAP_SEED } from "../../shared/constants";
import { generateMap, GROUND_OBJECTS, OBJECT_FOOTPRINT, ZONES, type MapObject, type WorldMap } from "../../shared/map";
import {
  FLIP_H, FORMAT_VERSION, L, OUT_DIR, REG_COLS, REG_ROWS, TILED_VERSION, TS, encodeLayer, prop, regionFile, regionOf, regionRect,
  type TLayer, type TMap, type TObject, type TProp,
} from "./common";
import { gatherPlacements, type Placements } from "./placements";
import { CELL_TILES, buildCells, buildGround, buildObjects, cornersAt, groundTile } from "./tilesets";

/** Контуры зон в прямоугольнике региона: внешние обходы связных кусков (по часовой на экране), точки — тайлы мира. */
export function traceZones(zone: Uint8Array, W: number, x0: number, y0: number, w: number, h: number) {
  const out: { z: number; pts: [number, number][] }[] = [];
  const inR = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
  const present = new Set<number>();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) present.add(zone[y * W + x]);
  const VW = W + 2;
  for (const z of [...present].sort((a, b) => a - b)) {
    const on = (x: number, y: number) => inR(x, y) && zone[y * W + x] === z;
    // рёбра по часовой вокруг клеток зоны (внутренность справа): из вершины → в вершину
    const ex: number[] = [], ey: number[] = [], dx: number[] = [], dy: number[] = [];
    const from = new Map<number, number[]>();
    const add = (ax: number, ay: number, bx: number, by: number) => {
      const i = ex.length;
      ex.push(ax); ey.push(ay); dx.push(bx - ax); dy.push(by - ay);
      const k = ay * VW + ax;
      (from.get(k) ?? from.set(k, []).get(k)!).push(i);
    };
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
    const used = new Uint8Array(ex.length);
    for (let s = 0; s < ex.length; s++) {
      if (used[s]) continue;
      const pts: [number, number][] = [];
      let e = s;
      while (!used[e]) {
        used[e] = 1;
        pts.push([ex[e], ey[e]]);
        const nx = ex[e] + dx[e], ny = ey[e] + dy[e];
        const cand = (from.get(ny * VW + nx) ?? []).filter((c) => !used[c] || c === s);
        if (!cand.length) break;
        // на «щипке» (зона касается себя углом) поворачиваем направо — обходим клетку, не перескакивая по диагонали
        const turn = (c: number) => { const cr = dx[e] * dy[c] - dy[e] * dx[c]; return cr > 0 ? 0 : cr === 0 ? 1 : 2; };
        cand.sort((a, b) => turn(a) - turn(b));
        e = cand[0];
        if (e === s) break;
      }
      // убрать точки на прямых
      const simp = pts.filter((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      let area = 0;
      for (let i = 0; i < simp.length; i++) { const a = simp[i], b = simp[(i + 1) % simp.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area > 0) out.push({ z, pts: simp }); // внешний обход; дыры (area < 0) закрывают зоны внутри
    }
  }
  return out;
}

/** Слой объекта мира по виду. */
function layerOf(o: MapObject, isNode: boolean) {
  if (isNode) return L.res;
  const fp = OBJECT_FOOTPRINT[o.kind];
  if (o.v || o.label || GROUND_OBJECTS.has(o.kind) || (fp && fp.w * fp.h >= 2)) return L.build;
  return fp ? L.nature : L.decor;
}
const zoneLevel = (z: number) => { const lv = ZONES[z]?.levels ?? [0, 0]; return lv[0] || lv[1] ? `${lv[0]}-${lv[1]}` : ""; };

export function exportWorld(m: WorldMap, dir = OUT_DIR, pl: Placements = gatherPlacements()) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^r\d+-\d+\.tmj$/.test(f)) fs.rmSync(path.join(dir, f));
  const ground = buildGround(m, dir);
  buildCells(dir);
  const objs = buildObjects(m, dir);
  const G0 = 1, C0 = G0 + ground.count, O0 = C0 + CELL_TILES;
  const nodeOf = new Map(m.nodes.map((n) => [n.id, n]));

  // всё точечное раскладываем по регионам заранее
  type Item = { layer: string; make: (id: number, ox: number, oy: number) => TObject };
  const buckets = new Map<string, Item[]>();
  const put = (px: number, py: number, item: Item) => {
    const { rx, ry } = regionOf(m.w, m.h, px, py), k = `${rx},${ry}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(item);
  };
  const base = (id: number, name: string, type: string, x: number, y: number): TObject => ({ id, name, type, x, y, width: 0, height: 0, rotation: 0, visible: true });
  /** Локальная координата; если сложение обратно даёт не то же число (дробные), точное значение — в свойстве. */
  const loc = (v: number, o: number, key: string, props: TProp[]) => { const l = v - o; if (l + o !== v) props.push(prop(key, v)); return l; };

  m.objects.forEach((o, i) => {
    const key = o.v ? `${o.kind}__${o.v}` : o.kind;
    const tid = objs.byKey.get(key)!, t = objs.tiles[tid];
    const node = nodeOf.get(i);
    put(o.x, o.y, {
      layer: layerOf(o, !!node),
      make: (id, ox, oy) => {
        const props: TProp[] = [prop("id", i)];
        const x = loc(o.x, ox, "ax", props), y = loc(o.y, oy, "ay", props);
        if (o.label !== undefined) props.push(prop("label", o.label));
        if (o.dz !== undefined) props.push(prop("dz", o.dz));
        if (node) props.push(prop("node", true), prop("res", node.res));
        return { ...base(id, o.label ?? "", "", x, y), width: t.w, height: t.h, gid: (O0 + tid + (o.flip ? FLIP_H : 0)), properties: props };
      },
    });
  });
  m.spawns.forEach((s, i) => put(s.x, s.y, {
    layer: L.mobs,
    make: (id, ox, oy) => ({ ...base(id, s.mob, "Mob", s.x - ox, s.y - oy), point: true, properties: [prop("id", i), prop("mob", s.mob, "MobId"), prop("level", s.level)] }),
  }));
  m.bosses.forEach((b, i) => put(b.x, b.y, {
    layer: L.bosses,
    make: (id, ox, oy) => ({ ...base(id, b.id, "Boss", b.x - b.arena - ox, b.y - b.arena - oy), width: b.arena * 2, height: b.arena * 2, ellipse: true, properties: [prop("id", i), prop("boss", b.id)] }),
  }));
  const point = (layer: string, type: string, name: string, p: { x: number; y: number }, props: TProp[]) =>
    put(p.x, p.y, { layer, make: (id, ox, oy) => ({ ...base(id, name, type, p.x - ox, p.y - oy), point: true, properties: props }) });
  point(L.points, "PlayerSpawn", "Точка появления", m.playerSpawn, []);
  point(L.points, "Merchant", "Торговец по умолчанию", m.merchant, []);
  m.merchants.forEach((p, i) => point(L.points, "MerchantSpot", "Торговец", p, [prop("i", i)]));
  for (const t of pl.teleports) point(L.tele, "Teleport", t.name, t, [prop("id", t.id), prop("arriveX", t.arriveX), prop("arriveY", t.arriveY)]);
  for (const n of pl.npcs) point(L.npc, "Npc", n.name, n, [prop("id", n.id), prop("role", n.role), prop("sprite", n.sprite), prop("place", n.place)]);
  for (const p of pl.patrols) {
    const p0 = p.points[0];
    put(p0.x, p0.y, {
      layer: L.patrols,
      make: (id, ox, oy) => ({ ...base(id, p.id, "Patrol", p0.x - ox, p0.y - oy), polyline: p.points.map((q) => ({ x: q.x - p0.x, y: q.y - p0.y })), properties: [prop("id", p.id), prop("kind", p.kind), prop("place", p.place)] }),
    });
  }

  const LAYER_STYLE: Record<string, { color?: string; visible?: boolean; opacity?: number }> = {
    [L.zones]: { color: "#ffe0c060", opacity: 0.8 }, [L.mobs]: { color: "#ff4040" }, [L.bosses]: { color: "#ff00ff" },
    [L.points]: { color: "#40ff40" }, [L.tele]: { color: "#40c0ff" }, [L.npc]: { color: "#ffd040" }, [L.patrols]: { color: "#ff9020" },
  };
  const order = [L.zones, L.build, L.nature, L.res, L.decor, L.mobs, L.bosses, L.points, L.tele, L.npc, L.patrols];
  const maps: { fileName: string; x: number; y: number; width: number; height: number }[] = [];
  let bytes = 0;
  for (let ry = 0; ry < REG_ROWS; ry++) for (let rx = 0; rx < REG_COLS; rx++) {
    const r = regionRect(m.w, m.h, rx, ry), ox = r.x0 * TS, oy = r.y0 * TS;
    const gg = new Uint32Array(r.w * r.h), cc = new Uint32Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const wx = r.x0 + x, wy = r.y0 + y;
      gg[y * r.w + x] = G0 + groundTile(ground, cornersAt(m, wx, wy), wx, wy);
      const f = m.cell[wy * m.w + wx];
      cc[y * r.w + x] = f ? C0 + f - 1 : 0;
    }
    let lid = 1, oid = 1;
    const layers: TLayer[] = [
      { id: lid++, name: L.ground, type: "tilelayer", width: r.w, height: r.h, x: 0, y: 0, opacity: 1, visible: true, encoding: "base64", compression: "zlib", data: encodeLayer(gg) },
      { id: lid++, name: L.cell, type: "tilelayer", width: r.w, height: r.h, x: 0, y: 0, opacity: 0.5, visible: false, encoding: "base64", compression: "zlib", data: encodeLayer(cc) },
    ];
    const byLayer = new Map<string, TObject[]>(order.map((n) => [n, []]));
    for (const zp of traceZones(m.zone, m.w, r.x0, r.y0, r.w, r.h)) {
      const [px, py] = zp.pts[0];
      byLayer.get(L.zones)!.push({
        ...base(oid++, ZONES[zp.z]?.name ?? `зона ${zp.z}`, "Zone", px * TS - ox, py * TS - oy),
        polygon: zp.pts.map(([x, y]) => ({ x: (x - px) * TS, y: (y - py) * TS })),
        properties: [prop("zone", zp.z), prop("name", ZONES[zp.z]?.name ?? ""), prop("level", zoneLevel(zp.z))],
      });
    }
    for (const it of buckets.get(`${rx},${ry}`) ?? []) byLayer.get(it.layer)!.push(it.make(oid++, ox, oy));
    for (const name of order) {
      const st = LAYER_STYLE[name] ?? {};
      layers.push({ id: lid++, name, type: "objectgroup", draworder: name === L.zones ? "index" : "topdown", x: 0, y: 0, opacity: st.opacity ?? 1, visible: st.visible ?? true, ...(st.color ? { color: st.color } : {}), objects: byLayer.get(name)! });
    }
    const map: TMap = {
      type: "map", version: FORMAT_VERSION, tiledversion: TILED_VERSION, orientation: "orthogonal", renderorder: "right-down", infinite: false,
      width: r.w, height: r.h, tilewidth: TS, tileheight: TS, compressionlevel: -1, nextlayerid: lid, nextobjectid: oid, layers,
      tilesets: [{ firstgid: G0, source: "ground.tsx" }, { firstgid: C0, source: "cell.tsx" }, { firstgid: O0, source: "objects.tsx" }],
      properties: [prop("rx", rx), prop("ry", ry), prop("ox", r.x0), prop("oy", r.y0), prop("worldW", m.w), prop("worldH", m.h), prop("seed", m.seed)],
    };
    const file = regionFile(rx, ry);
    const s = JSON.stringify(map);
    fs.writeFileSync(path.join(dir, file), s);
    bytes += s.length;
    maps.push({ fileName: file, x: ox, y: oy, width: r.w * TS, height: r.h * TS });
  }
  fs.writeFileSync(path.join(dir, "main.world"), JSON.stringify({ maps, onlyShowAdjacentMaps: false, type: "world" }, null, 1));
  writeProject(dir);
  return { regions: maps.length, bytes, groundTiles: ground.count, objectTiles: objs.tiles.length };
}

/** Проект Tiled: список мобов (выпадающий список в свойстве mob) и классы объектов. */
function writeProject(dir: string) {
  const mobIds = Object.keys((mobsData as { mobs: Record<string, unknown> }).mobs).filter((k) => !k.startsWith("_")).sort();
  const cls = (id: number, name: string, color: string, members: { name: string; type: string; value: unknown; propertytype?: string }[]) =>
    ({ id, name, type: "class", useAs: ["object"], color, drawFill: true, members });
  const project = {
    automappingRulesFile: "", commands: [], compatibilityVersion: 1100, extensionsPath: "extensions", folders: ["."], properties: [],
    propertyTypes: [
      { id: 1, name: "MobId", type: "enum", storageType: "string", values: mobIds, valuesAsFlags: false },
      cls(2, "Mob", "#ffff4040", [{ name: "mob", type: "string", propertytype: "MobId", value: mobIds[0] }, { name: "level", type: "int", value: 1 }]),
      cls(3, "Boss", "#ffff00ff", [{ name: "boss", type: "string", value: "" }]),
      cls(4, "Zone", "#ffe0c060", [{ name: "zone", type: "int", value: 0 }, { name: "name", type: "string", value: "" }, { name: "level", type: "string", value: "" }]),
      cls(5, "Npc", "#ffffd040", [{ name: "role", type: "string", value: "citizen_spot" }, { name: "sprite", type: "string", value: "" }, { name: "place", type: "string", value: "" }]),
      cls(6, "Patrol", "#ffff9020", [{ name: "kind", type: "string", value: "town" }, { name: "place", type: "string", value: "" }]),
      cls(7, "Teleport", "#ff40c0ff", [{ name: "id", type: "string", value: "" }]),
    ],
  };
  fs.writeFileSync(path.join(dir, "ashen.tiled-project"), JSON.stringify(project, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("tools/tiled/export.ts")) {
  const a = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const seed = Number(a("--seed") ?? MAP_SEED), dir = a("--out") ?? OUT_DIR;
  const t0 = Date.now();
  const m = generateMap(seed);
  const r = exportWorld(m, dir);
  let total = 0;
  for (const f of fs.readdirSync(dir)) { const st = fs.statSync(path.join(dir, f)); if (st.isFile()) total += st.size; }
  console.log(`экспорт: ${r.regions} регионов, ${(r.bytes / 1e6).toFixed(1)} МБ карт, всего в папке ${(total / 1e6).toFixed(1)} МБ; плиток земли ${r.groundTiles}, картинок объектов ${r.objectTiles}; ${Date.now() - t0} мс → ${dir}/main.world`);
}
