/**
 * Кандидаты значков служб NPC: вариант 1 — 11×11 (заливка 9×9 + контур), вариант 2 — 9×9 (заливка 7×7 + контур).
 * Тона: контур P.well, тень, золото P.gold, блик. Пишет атлас-ленты client/public/assets/ui/npc-icons-{11,9}.png и лист tools/out/labels/icons-variants.png.
 * Порядок в ленте: shop cook smith bank bags rumor raid stable arena. Не подключено к игре до выбора.
 */
import fs from "node:fs";
import { PNG } from "pngjs";

const KINDS = ["shop", "cook", "smith", "bank", "bags", "rumor", "raid", "stable", "arena"] as const;
const COL: Record<string, [number, number, number]> = { o: [0x0e, 0x0b, 0x10], s: [0x8a, 0x5a, 0x1a], g: [0xd6, 0xa8, 0x4b], h: [0xff, 0xe9, 0xa0] };
type Grid = string[][];

const blank = (n: number): Grid => Array.from({ length: n }, () => Array(n).fill("."));
const parse = (rows: string[]): Grid => { const n = rows.length; for (const r of rows) if (r.length !== n) throw new Error("bad row " + r); return rows.map((r) => [...r]); };
function disc(n: number, r: number): Grid {
  const g = blank(n), c = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - c, y - c); if (d <= r) g[y][x] = d <= r * 0.55 ? "g" : (x + y < 2 * c - 0.5 ? "h" : x + y > 2 * c + 0.5 ? "s" : "g"); }
  return g;
}
function coin(n: number): Grid { const g = disc(n, (n - 1) / 2 + 0.3); const c = (n - 1) >> 1; for (let y = 2; y < n - 2; y++) g[y][c] = "s"; return g; }
function sun(n: number): Grid {
  const g = disc(n, n > 7 ? 2.3 : 1.5), c = (n - 1) >> 1, e = n - 1;
  for (const [x, y] of n > 7 ? [[c, 0], [c, 1], [c, e], [c, e - 1], [0, c], [1, c], [e, c], [e - 1, c], [1, 1], [e - 1, 1], [1, e - 1], [e - 1, e - 1]] : [[c, 0], [c, e], [0, c], [e, c], [1, 1], [e - 1, 1], [1, e - 1], [e - 1, e - 1]]) g[y][x] = "g";
  return g;
}
function swords(n: number): Grid {
  const g = blank(n), e = n - 1, gl = n > 7 ? 6 : 4;
  for (let i = 0; i < n; i++) for (const x of [i, e - i]) g[i][x] = i < gl ? "h" : i === gl ? "g" : "s";
  g[gl][gl - 1] = "g"; g[gl][gl + 1] = "g"; g[gl][e - gl - 1] = "g"; g[gl][e - gl + 1] = "g"; g[gl - 1][gl] = "g"; g[gl - 1][e - gl] = "g";
  return g;
}
const A: Record<string, Grid> = {}, B: Record<string, Grid> = {};
A.shop = coin(9); B.shop = coin(7); A.raid = sun(9); B.raid = sun(7); A.arena = swords(9); B.arena = swords(7);
A.cook = parse(["..h..h...", "...h..h..", ".........", "hhhhhhhhs", ".hggggss.", ".hggggss.", ".gggggss.", ".gggggss.", "..sssss.."]);
A.smith = parse([".........", "hhhhhhhgs", "ggggggggs", ".gggggss.", "..ggss...", "..ggss...", "..gggss..", ".ggggssss", "........."]);
A.bank = parse([".........", ".hhhhhhg.", "hggggggss", "hggggggss", "ssshhhsss", "hgghhhgss", "hggggggss", "ssssssss.", "........."]);
A.bags = parse(["...hhh...", "....s....", "...ggg...", "..hgggs..", ".hggggss.", "hgggggsss", "hgggggsss", ".gggggss.", "..sssss.."]);
A.rumor = parse([".........", ".hhhhhhg.", "hggggggss", "hgsgsgsss", "hggggggss", ".gggggss.", "..ggss...", "...gs....", "........."]);
A.stable = parse(["hhs...hhs", "hgs...hgs", "hgs...hgs", "hgs...hgs", "hgs...hgs", "hggs.ggss", ".hgggssss", "..hggsss.", "...sss..."]);
B.cook = parse(["..h.h..", ".......", "hhhhhhs", ".gggss.", ".gggss.", ".gggss.", "..sss.."]);
B.smith = parse(["hhhhhhs", "gggggss", ".ggss..", "..gs...", "..gs...", ".gggss.", "ggggsss"]);
B.bank = parse([".hhhhs.", "hggggss", "sshhhss", "hghhhgs", "hggggss", "sssssss", "......."]);
B.bags = parse(["..hhh..", "...s...", ".hgggs.", "hggggss", "hggggss", ".gggss.", "..sss.."]);
B.rumor = parse([".hhhhs.", "hggggss", "hgsgsss", "hggggss", ".gggss.", "..gs...", "......."]);
B.stable = parse(["hs...hs", "hs...hs", "hs...hs", "hg...gs", "hgg.gss", ".hgggs.", "..sss.."]);

/** Заливка n×n → холст (n+2)×(n+2) с контуром по 8 соседям. */
function outline(g: Grid): Grid {
  const n = g.length, m = n + 2, o = blank(m);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] !== ".") o[y + 1][x + 1] = g[y][x];
  const src = o.map((r) => [...r]);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) if (src[y][x] === ".") {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = src[y + dy]?.[x + dx]; if (v && v !== "." && v !== "o") o[y][x] = "o"; }
  }
  return o;
}
const SIZES = { v1: Object.fromEntries(KINDS.map((k) => [k, outline(A[k])])), v2: Object.fromEntries(KINDS.map((k) => [k, outline(B[k])])) };

const put = (png: PNG, x: number, y: number, c: [number, number, number], a = 255) => { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const i = (y * png.width + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = a; };
function blit(png: PNG, g: Grid, x0: number, y0: number, k = 1) { for (let y = 0; y < g.length; y++) for (let x = 0; x < g.length; x++) { const c = COL[g[y][x]]; if (c) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) put(png, x0 + x * k + dx, y0 + y * k + dy, c); } }
function fill(png: PNG, x0: number, y0: number, w: number, h: number, c: [number, number, number]) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(png, x, y, c); }
/** Копия PNG-файла в png с масштабом (ближайший сосед, дробный). */
function blitPng(dst: PNG, srcPath: string, x0: number, y0: number, k: number) {
  const s = PNG.sync.read(fs.readFileSync(srcPath));
  for (let y = 0; y < Math.round(s.height * k); y++) for (let x = 0; x < Math.round(s.width * k); x++) { const i = (Math.floor(y / k) * s.width + Math.floor(x / k)) * 4; if (s.data[i + 3] > 0) put(dst, x0 + x, y0 + y, [s.data[i], s.data[i + 1], s.data[i + 2]], s.data[i + 3]); }
}

// атласы-ленты
for (const [name, set, n] of [["11", SIZES.v1, 11]] as const) {
  const p = new PNG({ width: n * KINDS.length, height: n });
  KINDS.forEach((k, i) => blit(p, set[k], i * n, 0));
  fs.writeFileSync(`client/public/assets/ui/npc-icons-${name}.png`, PNG.sync.write(p));
}

// лист: фон-панель, для каждого варианта ×1 и ×4, эталоны (иконки предметов 32 px, уменьшенные до 16 и в натуре), врезка из игры
const BG: [number, number, number] = [0x2a, 0x24, 0x30], PANEL: [number, number, number] = [0x1a, 0x16, 0x1e];
const W = 760, rows: { y: number; h: number }[] = [];
const sheet = new PNG({ width: W, height: 380 });
fill(sheet, 0, 0, W, 380, BG);
let y = 8;
for (const [set, n] of [[SIZES.v1, 11], [SIZES.v2, 9]] as const) {
  fill(sheet, 6, y, W - 12, n * 4 + 22, PANEL);
  KINDS.forEach((k, i) => { blit(sheet, set[k], 16 + i * 80, y + 6, 1); blit(sheet, set[k], 16 + i * 80, y + 18, 4); });
  y += n * 4 + 30; rows.push({ y, h: 0 });
}
// эталоны: иконки предметов проекта (coin, bread, armor, axe, helmet) в натуре 32 и ×0.5 (16)
fill(sheet, 6, y, W - 12, 56, PANEL);
["coin", "food_bread", "armor", "axe", "helmet"].forEach((f, i) => { blitPng(sheet, `client/public/assets/icons/${f}.png`, 16 + i * 140, y + 8, 1); blitPng(sheet, `client/public/assets/icons/${f}.png`, 16 + i * 140 + 40, y + 8, 0.5); });
y += 64;

// врезка из игры (кадр final-1366, масштаб камеры 1,75): слева — как сейчас (7×7), по центру — 11×11, справа — 9×9; значки наложены на кадр
const shot = PNG.sync.read(fs.readFileSync("tools/out/labels/final-clip.png"));
// старый значок 7×7 в кадре final-clip.png (масштаб 1,75): найден по снимку
const bx0 = 37, bx1 = 48, by0 = 38, by1 = 50;
const CX0 = 20, CY0 = 15, CW = 100, CH = 60, ZK = 2;
function crop(png: PNG, dx: number, dy: number) { for (let yy = 0; yy < CH * ZK; yy++) for (let xx = 0; xx < CW * ZK; xx++) { const i = ((CY0 + Math.floor(yy / ZK)) * png.width + CX0 + Math.floor(xx / ZK)) * 4; put(sheet, dx + xx, dy + yy, [png.data[i], png.data[i + 1], png.data[i + 2]]); } }
function paste(set: Record<string, Grid>, n: number): PNG {
  const c = new PNG({ width: shot.width, height: shot.height }); shot.data.copy(c.data);
  const sc = 1.75, cx = (bx0 + bx1) / 2 + 1, cy = (by0 + by1) / 2;
  const g = set.shop, px = Math.round(cx - (n * sc) / 2), py = Math.round(cy - (n * sc) / 2);
  for (let yy = 0; yy < Math.round(n * sc); yy++) for (let xx = 0; xx < Math.round(n * sc); xx++) { const col = COL[g[Math.floor(yy / sc)][Math.floor(xx / sc)]]; if (col) put(c, px + xx, py + yy, col); }
  return c;
}
fill(sheet, 6, y, W - 12, CH * ZK + 12, PANEL);
crop(shot, 16, y + 6); crop(paste(SIZES.v1, 11), 16 + CW * ZK + 16, y + 6); crop(paste(SIZES.v2, 9), 16 + 2 * (CW * ZK + 16), y + 6);
fs.writeFileSync("tools/out/labels/icons-variants.png", PNG.sync.write(sheet));
