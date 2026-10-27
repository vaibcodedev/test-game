/**
 * Оформление данжа «Пепельные чертоги» (задача 139): расстановка реквизита по стилям (shared/map.ts: dungeonStyle).
 *   0 — затонувший собор павших королей: колонны, безголовые и безрукие статуи, саркофаги с эффигиями, алтарь со свечами, лужи, мох, витражи и знамёна на стенах, арки;
 *   1 — переход: собор трескается — треснувший мрамор с лавой, пепел и обгоревшие знамёна, оплавленные колонны и саркофаги;
 *   2 — пепельный склеп: базальтовые колонны с рунами, жаровни, саркофаги с лавой в трещинах, кости, цепи и решётки на стенах, железные ворота с черепом.
 * Кадры — tools/gen/dungeon-art.ts (kind dg_*); непроходимые виды перечислены в DG_FOOTPRINT, остальное (стены, лужи, свечи, кости) — без следа.
 */
import type { MapObject } from "./map";

export const DG_FOOTPRINT: Record<string, { w: number; h: number }> = {
  dg_pillar_c_a: { w: 1, h: 1 }, dg_pillar_c_b: { w: 1, h: 1 }, dg_pillar_t_a: { w: 1, h: 1 }, dg_pillar_t_b: { w: 1, h: 1 }, dg_pillar_a_a: { w: 1, h: 1 }, dg_pillar_a_b: { w: 1, h: 1 },
  dg_statue_c_a: { w: 1, h: 1 }, dg_statue_c_b: { w: 1, h: 1 }, dg_statue_c_c: { w: 1, h: 1 },
  dg_sarc_c_a: { w: 2, h: 1 }, dg_sarc_c_b: { w: 2, h: 1 }, dg_sarc_t_a: { w: 2, h: 1 }, dg_sarc_a_a: { w: 2, h: 1 }, dg_sarc_a_b: { w: 2, h: 1 },
  dg_altar_c: { w: 3, h: 1 },
  dg_brazier_a: { w: 1, h: 1 }, dg_brazier_b: { w: 1, h: 1 },
};

/** Колонны: клетки относительно DG (как прежние pillar). */
const PILLARS: [number, number][] = [[142, 58], [149, 58], [142, 66], [149, 66], [142, 77], [149, 77], [142, 85], [149, 85], [159, 62], [172, 62], [159, 81], [172, 81]];
/** Двери в проёмах: [вид по стилю 0/1/2, x (центр, тайлы), y (строка проёма)] относительно DG. */
const DOORS: [string, number, number][] = [["dg_arch_c", 148, 56], ["dg_arch_t", 145.5, 68], ["dg_gate_a", 145.5, 76]];

export interface DgCtx {
  seed: number; w: number; objects: MapObject[];
  at: (x: number, y: number) => number;
  place: (kind: string, x: number, y: number, jitter?: number) => void;
  hash: (x: number, y: number, s: number) => number;
  DG: { x: number; y: number };
  DUNGEON: { x0: number; y0: number; x1: number; y1: number };
  rooms: [number, number, number, number][];
  style: (x: number, y: number) => 0 | 1 | 2;
  TILE: number; CELL_WALL: number; CELL_BLOCK: number;
  arenaNear: (x: number, y: number, r: number) => boolean;
}

const pickK = (list: readonly string[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

export function buildDungeonDecor(c: DgCtx) {
  const { objects, at, place, hash, DG, DUNGEON, rooms, style, TILE, CELL_WALL, CELL_BLOCK, seed } = c;
  const inRoom = (x: number, y: number) => rooms.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  const free = (x: number, y: number, fw = 1) => { for (let i = 0; i < fw; i++) if (!inRoom(x + i, y) || at(x + i, y) & CELL_BLOCK) return false; return true; };
  const doorCells = DOORS.map(([, x, y]) => [x + DG.x, y + DG.y] as [number, number]);
  const nearDoor = (x: number, y: number, r = 3) => doorCells.some(([dx, dy]) => Math.abs(x - dx) <= r + 1 && Math.abs(y - dy) <= r);
  const push = (kind: string, x: number, y: number, jx = 0, dy = 30) => objects.push({ kind, x: x * TILE + 16 + jx, y: y * TILE + dy });

  // колонны: вид по стилю клетки
  PILLARS.forEach(([px, py], i) => {
    const x = px + DG.x, y = py + DG.y, st = style(x, y);
    place(st === 0 ? (i % 3 === 0 ? "dg_pillar_c_b" : "dg_pillar_c_a") : st === 1 ? (i % 2 ? "dg_pillar_t_b" : "dg_pillar_t_a") : (i % 2 ? "dg_pillar_a_b" : "dg_pillar_a_a"), x, y);
  });

  // двери: арка собора, треснувшая арка, железные ворота с черепом (проходимы: без следа)
  for (const [kind, dx, dy] of DOORS) objects.push({ kind, x: Math.round((dx + DG.x) * TILE), y: (dy + DG.y) * TILE + 30 });

  // стены: знамёна, витражи, бра; решётки, цепи и факелы в склепе. Лицевые клетки стен над залом, через 4 клетки
  const WALL_C = ["dg_banner_c_a", "dg_banner_c_b", "dg_banner_c_c", "dg_window_c_a", "dg_window_c_b", "dg_banner_c_a", "dg_window_c_a", "torch"];
  const WALL_T = ["dg_banner_t_a", "dg_banner_t_b", "torch", "dg_banner_t_a", "dg_window_c_b", "torch"];
  const WALL_A = ["dg_grate_a", "dg_chains_a", "dg_grate_b", "torch", "dg_chains_b", "dg_grate_a", "torch"];
  for (let y = DUNGEON.y0; y < DUNGEON.y1 - 1; y++) for (let x = DUNGEON.x0; x < DUNGEON.x1; x++) {
    if (!(at(x, y) & CELL_WALL) || at(x, y + 1) & CELL_WALL || !inRoom(x, y + 1)) continue;
    if ((x + 2 * (y & 1)) % 4 !== 0 || nearDoor(x, y + 1, 2)) continue;
    const st = style(x, y + 1), r = hash(x, y, seed + 901);
    if (r < 0.18) continue;
    const kind = pickK(st === 0 ? WALL_C : st === 1 ? WALL_T : WALL_A, hash(x, y, seed + 902));
    objects.push({ kind, x: x * TILE + 16, y: y * TILE + (kind === "torch" ? 26 : 30) });
  }

  // алтарь собора у дальнего конца северного зала
  const ax = 144 + DG.x, ay = 65 + DG.y;
  if (free(ax, ay, 3)) place("dg_altar_c", ax, ay);

  // пол: реквизит по стилю клетки; у стен — статуи, саркофаги, жаровни; по залу — свечи, обломки, лужи, кости, пепел
  const stand = (kind: string, x: number, y: number, fw = 1) => { if (free(x, y, fw) && (fw < 2 || free(x, y, fw))) place(kind, x, y); };
  for (const [x0, y0, x1, y1] of rooms) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (at(x, y) & CELL_BLOCK || c.arenaNear(x, y, 2) || nearDoor(x, y, 2)) continue;
    const st = style(x, y), r = hash(x, y, seed + 910), r2 = hash(x, y, seed + 911), wallN = !!(at(x, y - 1) & CELL_WALL);
    if (st === 0) {
      if (wallN && r < 0.12 && y > y0) stand(pickK(["dg_statue_c_a", "dg_statue_c_b", "dg_statue_c_c"], r2), x, y);
      else if (r < 0.016) stand(r2 < 0.5 ? "dg_sarc_c_a" : "dg_sarc_c_b", x, y, 2);
      else if (r < 0.04) push(pickK(["dg_candles_a", "dg_candles_b", "dg_candles_c"], r2), x, y, Math.floor((r2 - 0.5) * 12), 28);
      else if (r < 0.065) push(pickK(["dg_rubble_c_a", "dg_rubble_c_b", "dg_rubble_c_c"], r2), x, y, Math.floor((r2 - 0.5) * 10), 28);
      else if (r < 0.1) push(r2 < 0.5 ? "dg_puddle_a" : "dg_puddle_b", x, y, Math.floor((r2 - 0.5) * 8), 28);
    } else if (st === 1) {
      if (r < 0.01) stand("dg_sarc_t_a", x, y, 2);
      else if (r < 0.03) push(pickK(["dg_rubble_t_a", "dg_rubble_t_b"], r2), x, y, Math.floor((r2 - 0.5) * 10), 28);
      else if (r < 0.05) push(pickK(["dg_candles_a", "dg_candles_c"], r2), x, y, Math.floor((r2 - 0.5) * 12), 28);
      else if (r < 0.09) push(r2 < 0.5 ? "dg_ashpile_a" : "dg_ashpile_b", x, y, Math.floor((r2 - 0.5) * 8), 28);
    } else {
      if (r < 0.008 && wallN) stand(r2 < 0.5 ? "dg_brazier_a" : "dg_brazier_b", x, y);
      else if (r < 0.018) stand(r2 < 0.5 ? "dg_sarc_a_a" : "dg_sarc_a_b", x, y, 2);
      else if (r < 0.05) push(pickK(["dg_bones_a", "dg_bones_b", "dg_bones_c"], r2), x, y, Math.floor((r2 - 0.5) * 12), 28);
      else if (r < 0.08) push(r2 < 0.5 ? "dg_ashpile_a" : "dg_ashpile_b", x, y, Math.floor((r2 - 0.5) * 8), 28);
    }
  }
  // жаровни по бокам входа (собор: факелы у арки сохранены)
  objects.push({ kind: "torch", x: (145 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 }, { kind: "torch", x: (150 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 });
}
