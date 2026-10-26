/**
 * Объёмный декор: превью «было | стало» (tools/out/volume/<группа>.png) и перенос в игру.
 * Запуск: node node_modules/tsx/dist/cli.mjs tools/gen/volume.ts [--game]
 *   без ключа — только превью; --game — ещё и кадры в client/public/assets/objects (мировой декор также собирает npm run assets через OBJECT_ART).
 * Кадр в игре: обрезка по непрозрачному и выравнивание по низу-центру в холст кратный 32 (как saveObject в battlefield.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./canvas";
import { ROOT, readPng, writePng, trim, paintGround, scaleNN, chipText, fill, BG } from "./vendor-lib";
import { BF_VOLUME } from "./volume-bf";
import { frame32 } from "./volume-lib";
import { WORLD_VOLUME } from "./volume-world";

const OBJ = path.join(ROOT, "client/public/assets/objects"), OUT = path.join(ROOT, "tools/out/volume");
export { frame32 };
/** Лист «было | стало»: по паре на объект, подпись, трава, ×2. */
function compare(items: { id: string; before: PC | null; after: PC }[], file: string) {
  const W = 1100, gap = 10;
  let x = 6, y = 0, rowH = 0;
  const pos: { id: string; a: PC | null; b: PC; x: number; y: number }[] = [];
  for (const it of items) {
    const w = (it.before?.w ?? 0) + it.after.w + gap * 2 + 8;
    if (x + w > W) { x = 6; y += rowH + 16; rowH = 0; }
    pos.push({ id: it.id, a: it.before, b: it.after, x, y });
    x += Math.max(w, it.id.length * 4 + 8); rowH = Math.max(rowH, it.after.h, it.before?.h ?? 0);
  }
  const H = y + rowH + 18, sh = new PC(W, H);
  fill(sh, BG); paintGround(sh, 0, 0, W, H, "grass");
  for (const p of pos) {
    const base = p.y + 10 + Math.max(p.a?.h ?? 0, p.b.h);
    if (p.a) sh.blit(p.a, p.x, base - p.a.h);
    sh.blit(p.b, p.x + (p.a?.w ?? 0) + gap, base - p.b.h);
    chipText(sh, p.id.toUpperCase(), p.x, p.y);
  }
  writePng(scaleNN(sh, 2), file);
}
const load = (id: string) => (fs.existsSync(path.join(OBJ, id + ".png")) ? readPng(path.join(OBJ, id + ".png")) : null);

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("volume.ts")) {
  const game = process.argv.includes("--game");
  fs.mkdirSync(OUT, { recursive: true });
  const groups: Record<string, Record<string, () => PC>> = {
    "bf-tents": Object.fromEntries(Object.entries(BF_VOLUME).filter(([k]) => k.startsWith("bf_tent"))),
    "bf-siege": Object.fromEntries(Object.entries(BF_VOLUME).filter(([k]) => !k.startsWith("bf_tent"))),
    world: WORLD_VOLUME,
  };
  for (const [g, set] of Object.entries(groups)) {
    const items = Object.entries(set).map(([id, f]) => ({ id, before: load(id), after: frame32(f()) }));
    compare(items, path.join(OUT, `${g}.png`));
    if (game) for (const it of items) writePng(it.after, path.join(OBJ, `${it.id}.png`));
  }
  console.log("[volume] готово", game ? "(кадры записаны в игру)" : "(только превью)");
}
