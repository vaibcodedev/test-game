/**
 * Значки служб NPC 9×9 (заливка 7×7 + контур), 4 тона: контур P.well, тень, золото P.gold, блик.
 * Высота 9 px — как строка имени (8 px). Пишет атлас-ленту client/public/assets/ui/npc-icons-9.png и лист tools/out/labels/icons9-sheet.png (×1 и ×4).
 * Порядок кадров: shop cook smith bank bags rumor raid stable arena (тот же в client/src/game/npcIcons.ts). Не npm run assets.
 */
import fs from "node:fs";
import { PNG } from "pngjs";

const KINDS = ["shop", "cook", "smith", "bank", "bags", "rumor", "raid", "stable", "arena"] as const;
const COL: Record<string, [number, number, number]> = { o: [0x0e, 0x0b, 0x10], s: [0x8a, 0x5a, 0x1a], g: [0xd6, 0xa8, 0x4b], h: [0xff, 0xe9, 0xa0] };
type Grid = string[][];

const parse = (rows: string[]): Grid => { for (const r of rows) if (r.length !== rows[0].length) throw new Error("bad row " + r); return rows.map((r) => [...r]); };
const A: Record<string, Grid> = {
  // монета плоская с гербом (щит в центре)
  shop: parse([".hhhgg.", "hgggggs", "hggsggs", "hgsssgs", "hggsggs", "gggggss", ".gssss."]),
  cook: parse(["..h.h..", ".......", "hhhhhhs", ".gggss.", ".gggss.", ".gggss.", "..sss.."]),
  smith: parse(["hhhhhhs", "gggggss", ".ggss..", "..gs...", "..gs...", ".gggss.", "ggggsss"]),
  bank: parse([".hhhhs.", "hggggss", "sshhhss", "hghhhgs", "hggggss", "sssssss", "......."]),
  // мешок: два хвостика завязки, перетяжка, складка горловины
  bags: parse(["..h.h..", "..sss..", ".gsssg.", "hgggggs", "hgggggs", "gggggss", ".sssss."]),
  rumor: parse([".hhhhs.", "hggggss", "hgsgsss", "hggggss", ".gggss.", "..gs...", "......."]),
  // солнце: диск и длинные лучи по 8 направлениям
  raid: parse(["h..h..h", ".g.g.g.", "..ggg..", "hgghgsh", "..gsg..", ".g.s.g.", "s..s..s"]),
  stable: parse(["hs...hs", "hs...hs", "hs...hs", "hg...gs", "hgg.gss", ".hgggs.", "..sss.."]),
  arena: parse(["h.....h", ".h...h.", "..h.h..", "...g...", "..s.s..", ".s...s.", "s.....s"]),
};

/** Заливка w×h → холст (w+2)×(h+2) с контуром по 8 соседям. */
function outline(g: Grid): Grid {
  const h = g.length, w = g[0].length, o: Grid = Array.from({ length: h + 2 }, () => Array(w + 2).fill("."));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] !== ".") o[y + 1][x + 1] = g[y][x];
  const src = o.map((r) => [...r]);
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) if (src[y][x] === ".")
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = src[y + dy]?.[x + dx]; if (v && v !== ".") o[y][x] = "o"; }
  return o;
}
const SET = Object.fromEntries(KINDS.map((k) => [k, outline(A[k])]));
const put = (png: PNG, x: number, y: number, c: [number, number, number]) => { const i = (y * png.width + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
const blit = (png: PNG, g: Grid, x0: number, y0: number, k: number) => { for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) { const c = COL[g[y][x]]; if (c) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) put(png, x0 + x * k + dx, y0 + y * k + dy, c); } };

const atlas = new PNG({ width: 9 * KINDS.length, height: 9 });
KINDS.forEach((k, i) => blit(atlas, SET[k], i * 9, 0, 1));
fs.writeFileSync("client/public/assets/ui/npc-icons-9.png", PNG.sync.write(atlas));

// ноты бродячего барда и музыкантов: 9×11, кадры ♪ и ♫ (client/public/assets/ui/notes.png, грузит BootScene как note_icons)
const NOTES: Grid[] = [
  parse(["...hhg.", "...hggg", "...hg.g", "...hg..", "...hg..", ".hhhg..", "hhggg..", "hgggs..", ".sss..."]),
  parse([".hhhhhh", ".hggggs", ".hg..gs", ".hg..gs", ".hg..gs", "hhg.hhg", "ggg.ggg", "gss.gss", ".s...s."]),
].map(outline);
const notes = new PNG({ width: 9 * NOTES.length, height: 11 });
NOTES.forEach((g, i) => blit(notes, g, i * 9, 0, 1));
fs.writeFileSync("client/public/assets/ui/notes.png", PNG.sync.write(notes));

const sheet = new PNG({ width: 9 * 56, height: 9 * 4 + 40 + 50 });
for (let i = 0; i < sheet.width * sheet.height; i++) { sheet.data[i * 4] = 0x2a; sheet.data[i * 4 + 1] = 0x24; sheet.data[i * 4 + 2] = 0x30; sheet.data[i * 4 + 3] = 255; }
KINDS.forEach((k, i) => { blit(sheet, SET[k], 10 + i * 56, 6, 1); blit(sheet, SET[k], 10 + i * 56, 22, 4); });
NOTES.forEach((g, i) => blit(sheet, g, 10 + i * 56, 66, 4));
fs.writeFileSync("tools/out/labels/icons9-sheet.png", PNG.sync.write(sheet));
