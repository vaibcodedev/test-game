/**
 * Наложение «силуэт + след коллизии» для объёмного природного декора → tools/out/rocks/hitboxes.png (×3, на земле своего биома).
 * Жёлтый контур — силуэт наведения/клика (objPick: альфа ≥ 24), красная рамка — клетки OBJECT_FOOTPRINT (непроходимо),
 * голубая полоса — основание (непрозрачные пиксели у низа кадра), белая точка — опора (позиция в мире, сортировка глубины).
 * Нет рамки — вид проходим. Камни/лёд/снега — из кадров игры, растения — из генератора (ещё не в игре).
 * Запуск под tools/out/scenario.lock: npx tsx tools/nature-hitboxes.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hex, type RGBA } from "./gen/canvas";
import { readPng, paintGround, drawText, scaleNN, ROOT } from "./gen/vendor-lib";
import { OBJECT_FOOTPRINT } from "../shared/map";
import { NATURE_VARIANTS } from "../shared/natureVariants";
import { FLORA3D } from "./gen/nature3d-flora";

const K = 3, TILE = 32;
const RED = hex("#ff3b3b"), YEL = hex("#ffd84a"), CYAN = hex("#3ad8ff"), WHITE = hex("#ffffff"), BG = hex("#14121a"), INK = hex("#efe6d2");
const GROUND: Record<string, string> = { snow: "snow", ice: "snow", sand: "sand", cactus: "sand", palm: "sand", dry: "sand", basalt: "ash", volcano: "ash", ash: "ash", bog: "bog", graveyard: "bog", reeds: "bog" };
const groundOf = (id: string) => Object.entries(GROUND).find(([k]) => id.includes(k))?.[1] ?? "grass";

/** Основание кадра: по столбцам — есть ли полностью непрозрачный пиксель в нижних 6 рядах. */
export function baseSpan(pc: PC): [number, number] | null {
  let x0 = Infinity, x1 = -Infinity;
  for (let y = Math.max(0, pc.h - 8); y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) >= 250) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return x1 >= x0 ? [x0, x1] : null;
}

function cell(id: string, kind: string, pc: PC): PC {
  const fp = OBJECT_FOOTPRINT[kind];
  const fw = (fp?.w ?? 1) * TILE;
  const W = Math.max(pc.w, fw) + 16, H = pc.h + 14;
  const g = new PC(W, H);
  paintGround(g, 0, 0, W, H, groundOf(kind));
  const ox = Math.floor(W / 2), oy = H - 6; // опора (o.x, o.y): низ кадра
  g.blit(pc, ox - Math.floor(pc.w / 2), oy - pc.h);
  const big = scaleNN(g, K);
  const line = (x0: number, y0: number, x1: number, y1: number, c: RGBA) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) big.set(x, y, c); };
  // силуэт (маска клика) — контур снаружи
  const sx = ox - Math.floor(pc.w / 2), sy = oy - pc.h;
  const m = (x: number, y: number) => pc.alpha(x, y) >= 24;
  for (let y = -1; y <= pc.h; y++) for (let x = -1; x <= pc.w; x++) {
    if (m(x, y)) continue;
    if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) line((sx + x) * K, (sy + y) * K, (sx + x) * K + K - 1, (sy + y) * K + K - 1, YEL);
  }
  // след коллизии: клетки, передняя кромка = o.y + 2
  if (fp) {
    const x0 = (ox - (fp.w * TILE) / 2) * K, x1 = (ox + (fp.w * TILE) / 2) * K - 1, y1 = (oy + 2) * K - 1, y0 = (oy + 2 - fp.h * TILE) * K;
    line(x0, y0, x1, y0 + 1, RED); line(x0, y1 - 1, x1, y1, RED); line(x0, y0, x0 + 1, y1, RED); line(x1 - 1, y0, x1, y1, RED);
  }
  const b = baseSpan(pc);
  if (b) line((sx + b[0]) * K, (oy + 1) * K, (sx + b[1] + 1) * K - 1, (oy + 1) * K + 2, CYAN);
  line(ox * K - 2, oy * K - 2, ox * K + 2, oy * K + 2, WHITE);
  const out = new PC(big.w, big.h + 14);
  out.rect(0, 0, out.w, out.h, BG);
  out.blit(big, 0, 14);
  drawText(out, `${id}${fp ? ` ${fp.w}X${fp.h}` : " PASS"}`, 2, 3, INK, 2);
  return out;
}

function main() {
  const tiles: PC[] = [];
  const OBJ = path.join(ROOT, "client/public/assets/objects");
  for (const [kind, n] of Object.entries(NATURE_VARIANTS)) for (let k = 0; k < n; k++) {
    const id = k ? `${kind}__${k}` : kind, f = path.join(OBJ, `${id}.png`);
    if (fs.existsSync(f)) tiles.push(cell(id, kind, readPng(f)));
  }
  for (const [kind, gen] of Object.entries(FLORA3D)) gen().slice(0, 2).forEach((pc, k) => tiles.push(cell(k ? `${kind}__${k}` : kind, kind, pc)));
  const W = 1800;
  let x = 0, y = 0, rowH = 0;
  const pos: [number, number][] = [];
  for (const t of tiles) { if (x + t.w > W) { x = 0; y += rowH + 6; rowH = 0; } pos.push([x, y]); x += t.w + 6; rowH = Math.max(rowH, t.h); }
  const out = new PC(W, y + rowH + 40);
  out.rect(0, 0, out.w, out.h, BG);
  drawText(out, "HITBOX: YELLOW = CLICK SILHOUETTE  RED = COLLISION CELLS  CYAN = BASE  WHITE = ANCHOR  PASS = WALKABLE", 6, 6, INK, 2);
  tiles.forEach((t, i) => out.blit(t, pos[i][0], pos[i][1] + 24));
  out.save(path.join(ROOT, "tools/out/rocks/hitboxes.png"));
  console.log("saved hitboxes", out.w, out.h, tiles.length);
}
main();
