/**
 * Общее для экспорта и импорта карты мира в Tiled 1.12 (docs/libraries-2.md, раздел 1; инструкция владельцу — docs/tiled-guide.md).
 * Мир режется на регионы REG_COLS × REG_ROWS (110 × 120 тайлов), их склеивает main.world. Форматы: карты — Tiled JSON (.tmj,
 * тайловые слои base64 + zlib), наборы тайлов — .tsx (XML), проект — ashen.tiled-project.
 * Игра эти файлы пока НЕ читает: источник мира — generateMap (shared/map.ts).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PNG } from "pngjs";

export const TILED_VERSION = "1.12.1";
export const FORMAT_VERSION = "1.10";
export const TS = 32;
export const REG_COLS = 10;
export const REG_ROWS = 3;
export const OUT_DIR = "tools/out/tiled";
/** Флаги отражения в gid (Tiled). */
export const FLIP_H = 0x80000000;
export const GID_MASK = 0x1fffffff;

/** Имена слоёв: импорт ищет их по имени, поэтому переименовывать нельзя (инструкция). */
export const L = {
  ground: "Земля",
  cell: "Проходимость",
  zones: "Зоны",
  build: "Постройки",
  nature: "Деревья и камни",
  res: "Ресурсы",
  decor: "Декор",
  mobs: "Мобы",
  bosses: "Боссы и арены",
  points: "Точки",
  tele: "Телепорты",
  npc: "NPC",
  patrols: "Патрули",
} as const;
export const OBJECT_LAYERS = [L.build, L.nature, L.res, L.decor] as const;

export type PropType = "string" | "int" | "float" | "bool";
export interface TProp { name: string; type: PropType; value: string | number | boolean; propertytype?: string }
export interface TObject {
  id: number; name: string; type: string; x: number; y: number; width: number; height: number; rotation: number; visible: boolean;
  gid?: number; point?: boolean; ellipse?: boolean; polygon?: { x: number; y: number }[]; polyline?: { x: number; y: number }[];
  properties?: TProp[];
}
export interface TLayer {
  id: number; name: string; type: "tilelayer" | "objectgroup"; opacity: number; visible: boolean; x: 0; y: 0;
  width?: number; height?: number; data?: string | number[]; encoding?: string; compression?: string;
  objects?: TObject[]; draworder?: string; color?: string; locked?: boolean;
}
export interface TMap {
  type: "map"; version: string; tiledversion: string; orientation: "orthogonal"; renderorder: "right-down"; infinite: false;
  width: number; height: number; tilewidth: number; tileheight: number; compressionlevel: number;
  nextlayerid: number; nextobjectid: number; layers: TLayer[]; tilesets: { firstgid: number; source: string }[]; properties?: TProp[];
}

export const prop = (name: string, value: string | number | boolean, propertytype?: string): TProp => ({
  name,
  type: typeof value === "boolean" ? "bool" : typeof value === "number" ? (Number.isInteger(value) ? "int" : "float") : "string",
  value,
  ...(propertytype ? { propertytype } : {}),
});
export const getProp = (props: TProp[] | undefined, name: string) => props?.find((p) => p.name === name)?.value;

/** Тайловый слой: gid по клеткам → base64(zlib(uint32 LE)). */
export function encodeLayer(gids: Uint32Array): string {
  return zlib.deflateSync(Buffer.from(gids.buffer, gids.byteOffset, gids.byteLength)).toString("base64");
}
export function decodeLayer(l: TLayer, n: number): Uint32Array {
  if (Array.isArray(l.data)) return Uint32Array.from(l.data);
  let buf = Buffer.from(String(l.data ?? ""), "base64");
  if (l.compression === "zlib") buf = zlib.inflateSync(buf);
  else if (l.compression === "gzip") buf = zlib.gunzipSync(buf);
  else if (l.compression) throw new Error(`слой «${l.name}»: сжатие ${l.compression} не поддерживается (выберите zlib)`);
  const out = new Uint32Array(n);
  for (let i = 0; i < n && i * 4 + 3 < buf.length; i++) out[i] = buf.readUInt32LE(i * 4);
  return out;
}

/** Регион (rx, ry): прямоугольник в тайлах. */
export function regionRect(W: number, H: number, rx: number, ry: number) {
  const x0 = Math.floor((rx * W) / REG_COLS), x1 = Math.floor(((rx + 1) * W) / REG_COLS);
  const y0 = Math.floor((ry * H) / REG_ROWS), y1 = Math.floor(((ry + 1) * H) / REG_ROWS);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
export const regionFile = (rx: number, ry: number) => `r${rx}-${ry}.tmj`;
/** В какой регион попадает точка (пиксели мира). */
export function regionOf(W: number, H: number, px: number, py: number) {
  const tx = Math.max(0, Math.min(W - 1, Math.floor(px / TS))), ty = Math.max(0, Math.min(H - 1, Math.floor(py / TS)));
  let rx = Math.floor((tx * REG_COLS) / W), ry = Math.floor((ty * REG_ROWS) / H);
  while (rx > 0 && regionRect(W, H, rx, 0).x0 > tx) rx--;
  while (rx < REG_COLS - 1 && regionRect(W, H, rx + 1, 0).x0 <= tx) rx++;
  while (ry > 0 && regionRect(W, H, 0, ry).y0 > ty) ry--;
  while (ry < REG_ROWS - 1 && regionRect(W, H, 0, ry + 1).y0 <= ty) ry++;
  return { rx, ry };
}

// --- .tsx: запись и простой разбор (только то, что пишем сами и что сохраняет Tiled) ---
export const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlUnesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const xmlProps = (props: TProp[], ind: string) =>
  props.length ? `${ind}<properties>\n${props.map((p) => `${ind} <property name="${xmlEsc(p.name)}"${p.type === "string" ? "" : ` type="${p.type}"`} value="${xmlEsc(String(p.value))}"/>`).join("\n")}\n${ind}</properties>\n` : "";
const attrs = (s: string) => {
  const o: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1]] = xmlUnesc(m[2]);
  return o;
};
export interface TsxTile { id: number; props: Record<string, string>; image?: string; w?: number; h?: number }
export interface Tsx { name: string; tiles: Map<number, TsxTile>; wang: Map<number, number[]> }
export function readTsx(file: string): Tsx {
  const s = fs.readFileSync(file, "utf8");
  const head = attrs(s.match(/<tileset\b([^>]*)>/)?.[1] ?? "");
  const tiles = new Map<number, TsxTile>();
  for (const m of s.matchAll(/<tile\b([^>]*?)(\/>|>([\s\S]*?)<\/tile>)/g)) {
    const a = attrs(m[1]), body = m[3] ?? "";
    const props: Record<string, string> = {};
    for (const p of body.matchAll(/<property\b([^>]*?)\/?>/g)) { const pa = attrs(p[1]); if (pa.name) props[pa.name] = pa.value ?? ""; }
    const img = body.match(/<image\b([^>]*?)\/?>/);
    const ia = img ? attrs(img[1]) : {};
    tiles.set(Number(a.id), { id: Number(a.id), props, image: ia.source, w: ia.width ? Number(ia.width) : undefined, h: ia.height ? Number(ia.height) : undefined });
  }
  const wang = new Map<number, number[]>();
  for (const m of s.matchAll(/<wangtile\b([^>]*?)\/>/g)) { const a = attrs(m[1]); wang.set(Number(a.tileid), a.wangid.split(",").map(Number)); }
  return { name: head.name ?? path.basename(file), tiles, wang };
}

// --- PNG ---
export class Img {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number, data?: Uint8Array) { this.data = data ?? new Uint8Array(w * h * 4); }
  static read(file: string) { const p = PNG.sync.read(fs.readFileSync(file)); return new Img(p.width, p.height, new Uint8Array(p.data)); }
  write(file: string) {
    const p = new PNG({ width: this.w, height: this.h });
    Buffer.from(this.data.buffer, this.data.byteOffset, this.data.byteLength).copy(p.data);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(p));
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  /** Наложение пикселя с прозрачностью. */
  put(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a === 0) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    const k = a / 255, da = this.data[i + 3] / 255, oa = k + da * (1 - k);
    this.data[i] = Math.round((r * k + this.data[i] * da * (1 - k)) / oa);
    this.data[i + 1] = Math.round((g * k + this.data[i + 1] * da * (1 - k)) / oa);
    this.data[i + 2] = Math.round((b * k + this.data[i + 2] * da * (1 - k)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }
  /** Копия куска src (sx, sy, w, h) в (dx, dy), с альфой; flip — зеркально по x. */
  blit(src: Img, sx: number, sy: number, w: number, h: number, dx: number, dy: number, flip = false) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [r, g, b, a] = src.get(sx + (flip ? w - 1 - i : i), sy + j);
      this.put(dx + i, dy + j, r, g, b, a);
    }
  }
  rect(x0: number, y0: number, w: number, h: number, c: number[], a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.put(x, y, c[0], c[1], c[2], a); }
}

export const rel = (fromDir: string, file: string) => path.relative(fromDir, file).split(path.sep).join("/");
