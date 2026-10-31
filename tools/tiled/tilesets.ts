/**
 * Наборы тайлов Tiled из наших PNG (tools/out/tiled/):
 *  - ground.tsx + ground.png — земля: плитка = 4 угла (dual grid, как vtx), нарисована так же, как в игре (client/src/game/terrainTiles.ts):
 *    вода снизу, поверх края поверхностей по маске углов. Набор углов (corner Wang set) «Земля» с 19 цветами — владелец красит кистью,
 *    переходы ставятся сами. Есть все пары основных поверхностей (0–14) и все сочетания углов, что встречаются в мире.
 *  - cell.tsx + cell.png — маска проходимости (флаги CELL_*): плитка id = флаги − 1.
 *  - objects.tsx — коллекция картинок: все спрайты client/public/assets/objects (<kind>.png и <kind>__<v>.png) и кадр 0 анимированных
 *    (assets/vfx), привязка — низ-середина (objectalignment="bottom"), свойства kind, v, след (непроходимость) и высота.
 * Запуск отдельно: npx tsx tools/tiled/tilesets.ts (пишет только наборы).
 */
import fs from "node:fs";
import path from "node:path";
import { CELL_BLOCK, CELL_BRIDGE, CELL_LAVA, CELL_OBJ, CELL_RESERVED, CELL_WALL, CELL_WATER, GROUND_OBJECTS, OBJECT_FOOTPRINT, TERRAIN_COUNT, TERRAIN_KEYS, type WorldMap } from "../../shared/map";
import { FORMAT_VERSION, Img, OUT_DIR, TILED_VERSION, TS, prop, rel, xmlEsc, xmlProps, type TProp } from "./common";

const ASSETS = "client/public/assets";
const OBJ_DIR = `${ASSETS}/objects`;
export const TERRAIN_RU = ["Вода", "Лава", "Песок", "Болото", "Пепел", "Грязь", "Трава", "Лесная подстилка", "Брусчатка", "Пол", "Снег", "Лёд", "Обсидиан", "Дюны", "Морское дно", "Мрамор", "Треснувший мрамор", "Базальт", "Вытертая дорожка", "Брусчатка Солнца", "Брусчатка Умбры", "Брусчатка Пепла", "Опалённая трава", "Гарь", "Пепельное поле"];
/** Поверхности мира (без полов данжа 15–18): для них есть все пары переходов. */
const MAIN_TERRAINS = 15;
const COLS = 18; // столбцов в terrain.png
const GROUND_COLS = 32; // столбцов в ground.png

/** Хеш клетки — как в terrainTiles.ts (вариант сплошной заливки). */
export function cellHash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Углы клетки в порядке TL, TR, BR, BL. */
export const cornersAt = (m: Pick<WorldMap, "w" | "vtx">, x: number, y: number) => {
  const V = (vx: number, vy: number) => m.vtx[vy * (m.w + 1) + vx];
  return [V(x, y), V(x + 1, y), V(x + 1, y + 1), V(x, y + 1)];
};

export interface GroundSet {
  /** Ключ «a,b,c,d» → id плиток (у сплошных — 4 варианта). */
  byKey: Map<string, number[]>;
  count: number;
}

/** Плитка земли по 4 углам (вариант v — только для сплошной заливки). */
function drawGround(terrain: Img, water: Img, c: number[], v: number, out: Img, dx: number, dy: number) {
  const low = Math.min(...c);
  const wq = low === 0 && c.every((t) => t === 0) ? v : 0;
  out.blit(water, (wq % 2) * 32, Math.floor(wq / 2) * 32, 32, 32, dx, dy);
  for (let t = 1; t < TERRAIN_COUNT; t++) {
    if (!c.includes(t)) continue;
    const col = t === low ? 14 + v : ((c[0] >= t ? 1 : 0) | (c[1] >= t ? 2 : 0) | (c[2] >= t ? 4 : 0) | (c[3] >= t ? 8 : 0)) - 1;
    out.blit(terrain, col * 32, t * 32, 32, 32, dx, dy);
  }
}

export function buildGround(m: WorldMap, dir = OUT_DIR): GroundSet {
  const terrain = Img.read(`${ASSETS}/tiles/terrain.png`), water = Img.read(`${ASSETS}/tiles/water.png`);
  // список плиток: сплошные (по 4 варианта), все пары основных поверхностей, остальные сочетания из мира
  const list: { c: number[]; v: number }[] = [];
  const seen = new Set<string>();
  const add = (c: number[], v = 0) => { list.push({ c, v }); seen.add(c.join(",")); };
  for (let t = 0; t < TERRAIN_COUNT; t++) for (let v = 0; v < 4; v++) add([t, t, t, t], v);
  for (let a = 0; a < MAIN_TERRAINS; a++) for (let b = a + 1; b < MAIN_TERRAINS; b++) for (let mask = 1; mask < 15; mask++)
    add([0, 1, 2, 3].map((k) => (mask >> k) & 1 ? b : a));
  const extra = new Set<string>();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const k = cornersAt(m, x, y).join(","); if (!seen.has(k)) extra.add(k); }
  for (const k of [...extra].sort()) add(k.split(",").map(Number));

  const rows = Math.ceil(list.length / GROUND_COLS);
  const img = new Img(GROUND_COLS * TS, rows * TS);
  const byKey = new Map<string, number[]>();
  const fillTile = new Array<number>(TERRAIN_COUNT).fill(-1);
  list.forEach((t, id) => {
    drawGround(terrain, water, t.c, t.v, img, (id % GROUND_COLS) * TS, Math.floor(id / GROUND_COLS) * TS);
    const k = t.c.join(",");
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(id);
    if (t.c.every((q) => q === t.c[0]) && t.v === 0) fillTile[t.c[0]] = id;
  });
  img.write(path.join(dir, "ground.png"));

  // средний цвет сплошной плитки — цвет «краски» набора углов
  const avg = (id: number) => {
    let r = 0, g = 0, b = 0;
    const ox = (id % GROUND_COLS) * TS, oy = Math.floor(id / GROUND_COLS) * TS;
    for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) { const p = img.get(ox + i, oy + j); r += p[0]; g += p[1]; b += p[2]; }
    const n = TS * TS, h = (q: number) => Math.round(q / n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  };
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="${FORMAT_VERSION}" tiledversion="${TILED_VERSION}" name="Земля" tilewidth="${TS}" tileheight="${TS}" tilecount="${list.length}" columns="${GROUND_COLS}">\n`;
  x += ` <image source="ground.png" width="${img.w}" height="${img.h}"/>\n`;
  list.forEach((t, id) => {
    // свойства: углы (для справки) и проходимость — непроходима плитка целиком из воды или лавы
    const props: TProp[] = [prop("corners", t.c.map((q) => TERRAIN_KEYS[q]).join(","))];
    if (t.c.every((q) => q <= 1)) props.push(prop("walkable", false));
    x += ` <tile id="${id}">\n${xmlProps(props, "  ")} </tile>\n`;
  });
  x += ` <wangsets>\n  <wangset name="Земля" type="corner" tile="${fillTile[6]}">\n`;
  for (let t = 0; t < TERRAIN_COUNT; t++) x += `   <wangcolor name="${xmlEsc(TERRAIN_RU[t])}" color="${avg(fillTile[t])}" tile="${fillTile[t]}" probability="1"/>\n`;
  // wangid: верх, верх-право, право, низ-право, низ, низ-лево, лево, верх-лево; у углового набора стороны — 0; цвета с 1
  list.forEach((t, id) => { const [tl, tr, br, bl] = t.c.map((q) => q + 1); x += `   <wangtile tileid="${id}" wangid="0,${tr},0,${br},0,${bl},0,${tl}"/>\n`; });
  x += `  </wangset>\n </wangsets>\n</tileset>\n`;
  fs.writeFileSync(path.join(dir, "ground.tsx"), x);
  return { byKey, count: list.length };
}

/** Плитка земли для клетки: сплошная — вариант по хешу, как в игре. */
export function groundTile(g: GroundSet, c: number[], x: number, y: number): number {
  const ids = g.byKey.get(c.join(","));
  if (!ids) throw new Error(`нет плитки земли для углов ${c}`);
  if (ids.length === 1) return ids[0];
  const h = cellHash(x + c[0] * 7, y);
  return ids[h < 0.55 ? 0 : Math.min(ids.length - 1, 1 + Math.floor(((h - 0.55) / 0.45) * 3))];
}

/** Маска проходимости: плитки для всех сочетаний флагов CELL_* (id = флаги − 1): BLOCK, WALL, RESERVED, WATER, BRIDGE, LAVA, OBJ. Новый флаг — поднять старший. */
export const CELL_TILES = CELL_OBJ * 2 - 1;
export function buildCells(dir = OUT_DIR) {
  const img = new Img(CELL_TILES * TS, TS);
  const names: string[] = [];
  for (let f = 1; f <= CELL_TILES; f++) {
    const c = f & CELL_WALL ? [120, 60, 200] : f & CELL_LAVA ? [255, 110, 20] : f & CELL_WATER ? [40, 110, 230] : f & CELL_BRIDGE ? [150, 100, 50] : f & CELL_BLOCK ? [220, 40, 40] : [240, 200, 40];
    const ox = (f - 1) * TS;
    img.rect(ox, 0, TS, TS, c, 150);
    if (f & CELL_RESERVED && f & CELL_BLOCK) for (let i = 0; i < TS; i += 4) img.rect(ox + i, 0, 2, TS, [240, 200, 40], 200);
    names.push([f & CELL_BLOCK ? "непроходимо" : "", f & CELL_WALL ? "стена" : "", f & CELL_RESERVED ? "резерв" : "", f & CELL_WATER ? "вода" : "", f & CELL_BRIDGE ? "мост" : "", f & CELL_LAVA ? "лава" : "", f & CELL_OBJ ? "объект" : ""].filter(Boolean).join(" + "));
  }
  img.write(path.join(dir, "cell.png"));
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="${FORMAT_VERSION}" tiledversion="${TILED_VERSION}" name="Проходимость" tilewidth="${TS}" tileheight="${TS}" tilecount="${CELL_TILES}" columns="${CELL_TILES}">\n`;
  x += ` <image source="cell.png" width="${img.w}" height="${img.h}"/>\n`;
  for (let f = 1; f <= CELL_TILES; f++) x += ` <tile id="${f - 1}">\n${xmlProps([prop("flags", f), prop("what", names[f - 1])], "  ")} </tile>\n`;
  x += `</tileset>\n`;
  fs.writeFileSync(path.join(dir, "cell.tsx"), x);
}

export interface ObjectSet {
  /** «kind» или «kind__v» → id плитки. */
  byKey: Map<string, number>;
  /** id → картинка (путь от корня проекта), размер и привязка не нужны: картинка уже с низом-серединой в точке. */
  tiles: { key: string; kind: string; v?: string; file: string; w: number; h: number }[];
}
type VfxEntry = { frameW: number; frameH: number; anchor: [number, number]; r?: 1 };

/** Кадр 0 анимированного спрайта, обрезанный и дополненный так, чтобы якорь листа стал низом-серединой картинки. */
function vfxFrame(kind: string, e: VfxEntry, dir: string): { file: string; w: number; h: number } | null {
  const f = `${ASSETS}/vfx/${e.r ? "r/" : ""}${kind}.png`;
  if (!fs.existsSync(f)) return null;
  const src = Img.read(f);
  const ax = Math.round(e.anchor[0] * e.frameW), ay = Math.round(e.anchor[1] * e.frameH);
  const half = Math.max(ax, e.frameW - ax), w = half * 2, h = Math.max(1, ay);
  const out = new Img(w, h);
  out.blit(src, 0, 0, e.frameW, h, half - ax, 0);
  const file = path.join(dir, "img", `vfx_${kind}.png`);
  out.write(file);
  return { file, w, h };
}

export function buildObjects(m: WorldMap, dir = OUT_DIR): ObjectSet {
  const keys = new Set<string>();
  for (const f of fs.readdirSync(OBJ_DIR)) if (f.endsWith(".png")) keys.add(f.slice(0, -4));
  for (const o of m.objects) keys.add(o.v ? `${o.kind}__${o.v}` : o.kind);
  const vfxm = JSON.parse(fs.readFileSync(`${ASSETS}/vfx/manifest.json`, "utf8")) as Record<string, VfxEntry>;
  const tiles: ObjectSet["tiles"] = [];
  const byKey = new Map<string, number>();
  let missing: { file: string; w: number; h: number } | null = null;
  const size = (file: string) => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  for (const key of [...keys].sort()) {
    const sep = key.indexOf("__");
    const kind = sep > 0 ? key.slice(0, sep) : key, v = sep > 0 ? key.slice(sep + 2) : undefined;
    let pic: { file: string; w: number; h: number } | null = null;
    for (const f of [`${OBJ_DIR}/${key}.png`, `${OBJ_DIR}/${kind}.png`]) if (!pic && fs.existsSync(f)) pic = { file: f, ...size(f) };
    if (!pic && vfxm[kind]) pic = vfxFrame(kind, vfxm[kind], dir);
    if (!pic) {
      if (!missing) {
        const img = new Img(24, 24);
        img.rect(0, 0, 24, 24, [255, 0, 255], 200);
        missing = { file: path.join(dir, "img", "missing.png"), w: 24, h: 24 };
        img.write(missing.file);
      }
      pic = missing;
    }
    byKey.set(key, tiles.length);
    tiles.push({ key, kind, v, ...pic });
  }
  const mw = Math.max(...tiles.map((t) => t.w)), mh = Math.max(...tiles.map((t) => t.h));
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="${FORMAT_VERSION}" tiledversion="${TILED_VERSION}" name="Объекты" tilewidth="${mw}" tileheight="${mh}" tilecount="${tiles.length}" columns="0" objectalignment="bottom">\n`;
  x += ` <grid orientation="orthogonal" width="1" height="1"/>\n`;
  tiles.forEach((t, id) => {
    const fp = OBJECT_FOOTPRINT[t.kind];
    const props: TProp[] = [prop("kind", t.kind)];
    if (t.v) props.push(prop("v", t.v));
    if (fp) props.push(prop("blocks", `${fp.w}x${fp.h}`));
    if (GROUND_OBJECTS.has(t.kind)) props.push(prop("ground", true));
    props.push(prop("height", t.h));
    x += ` <tile id="${id}">\n${xmlProps(props, "  ")}  <image source="${xmlEsc(rel(dir, t.file))}" width="${t.w}" height="${t.h}"/>\n </tile>\n`;
  });
  x += `</tileset>\n`;
  fs.writeFileSync(path.join(dir, "objects.tsx"), x);
  return { byKey, tiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("tools/tiled/tilesets.ts")) {
  const { generateMap } = await import("../../shared/map");
  const { MAP_SEED } = await import("../../shared/constants");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const m = generateMap(MAP_SEED);
  const g = buildGround(m);
  buildCells();
  const o = buildObjects(m);
  console.log(`земля: ${g.count} плиток, объекты: ${o.tiles.length} картинок`);
}
