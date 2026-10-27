/**
 * Оформление данжа «Пепельные чертоги» (задача 139): расстановка реквизита по стилям (shared/map.ts: dungeonStyle).
 *   0 — затонувший собор павших королей: колонны, безголовые и безрукие статуи, саркофаги с эффигиями, алтарь со свечами, лужи, мох, витражи и знамёна на стенах, арки;
 *   1 — переход: собор трескается — треснувший мрамор с лавой, пепел и обгоревшие знамёна, оплавленные колонны и саркофаги;
 *   2 — пепельный склеп: базальтовые колонны с рунами, жаровни, саркофаги с лавой в трещинах, кости, цепи и решётки на стенах, железные ворота с черепом.
 * Кадры — tools/gen/dungeon-art.ts (kind dg_*); непроходимые виды перечислены в DG_FOOTPRINT, остальное (стены, лужи, свечи, кости) — без следа.
 */
import type { MapObject } from "./map";

export const DG_FOOTPRINT: Record<string, { w: number; h: number }> = {
  dg_pillar_c_a: { w: 1, h: 1 }, dg_pillar_c_b: { w: 1, h: 1 }, dg_pillar_t_a: { w: 1, h: 1 }, dg_pillar_t_b: { w: 1, h: 1 }, dg_pillar_a_a: { w: 1, h: 1 }, dg_pillar_a_b: { w: 1, h: 1 }, dg_pillar_a_c: { w: 1, h: 1 }, dg_pillar_a_d: { w: 1, h: 1 },
  dg_statue_c_a: { w: 1, h: 1 }, dg_statue_c_b: { w: 1, h: 1 }, dg_statue_c_c: { w: 1, h: 1 },
  dg_sarc_c_a: { w: 2, h: 1 }, dg_sarc_c_b: { w: 2, h: 1 }, dg_sarc_t_a: { w: 2, h: 1 }, dg_sarc_a_a: { w: 2, h: 1 }, dg_sarc_a_b: { w: 2, h: 1 },
  dg_altar_c: { w: 3, h: 1 },
  /** Вход в подземелье на карте мира (6×5 клеток). */
  dg_entrance: { w: 6, h: 5 },
  dg_brazier_a: { w: 1, h: 1 }, dg_brazier_b: { w: 1, h: 1 },
};

/** Колонны: клетки относительно DG (как прежние pillar). */
const PILLARS: [number, number][] = [[142, 61], [149, 61], [142, 66], [149, 66], [142, 77], [149, 77], [142, 85], [149, 85], [159, 62], [172, 62], [159, 81], [172, 81]];
/** Проходы в стенах между залами (дизайнерские координаты): ряд стены, клетки просвета x0..x1 включительно, оформление (c собор, t переход, a склеп) и створки: wood — двойные двери, port — решётка. */
export interface Passage { row: number; x0: number; x1: number; style: "c" | "t" | "a"; gate?: "wood" | "port" }
export const PASSAGES: Passage[] = [
  { row: 56, x0: 146, x1: 149, style: "c", gate: "wood" },
  { row: 68, x0: 144, x1: 147, style: "t" },
  { row: 75, x0: 144, x1: 147, style: "a", gate: "port" },
];

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
  /** Центр зала босса (тайлы): помост-ритуальный круг, вокруг — чистая арена. */
  boss: { x: number; y: number };
}

const pickK = (list: readonly string[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

export function buildDungeonDecor(c: DgCtx) {
  const { objects, at, place, hash, DG, DUNGEON, rooms, style, TILE, CELL_WALL, CELL_BLOCK, seed, boss } = c;
  const inBossHall = (x: number) => x >= 156 + DG.x;
  const inRoom = (x: number, y: number) => rooms.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  const free = (x: number, y: number, fw = 1) => { for (let i = 0; i < fw; i++) if (!inRoom(x + i, y) || at(x + i, y) & CELL_BLOCK) return false; return true; };
  const doorCells = PASSAGES.map((p) => [(p.x0 + p.x1 + 1) / 2 + DG.x, p.row + DG.y] as [number, number]);
  const nearDoor = (x: number, y: number, r = 3) => doorCells.some(([dx, dy]) => Math.abs(x - dx) <= r + 1 && Math.abs(y - dy) <= r);
  const push = (kind: string, x: number, y: number, jx = 0, dy = 30) => objects.push({ kind, x: x * TILE + 16 + jx, y: y * TILE + dy });

  // колонны: вид по стилю клетки
  PILLARS.forEach(([px, py], i) => {
    const x = px + DG.x, y = py + DG.y, st = style(x, y);
    place(st === 0 ? (i % 3 === 0 ? "dg_pillar_c_b" : "dg_pillar_c_a") : st === 1 ? (i % 2 ? "dg_pillar_t_b" : "dg_pillar_t_a") : inBossHall(x) ? (i % 2 ? "dg_pillar_a_d" : "dg_pillar_a_c") : (i % 2 ? "dg_pillar_a_b" : "dg_pillar_a_a"), x, y);
  });

  // проходы: столбы-концы стены, перемычка над просветом (рисуется выше героя в рядах прохода) и створки (кадры по состоянию ворот — клиент терраина)
  for (const p of PASSAGES) {
    const r = p.row + DG.y, gx0 = (p.x0 + DG.x) * TILE, gx1 = (p.x1 + 1 + DG.x) * TILE, cx = (gx0 + gx1) / 2, by = (r + 1) * TILE;
    objects.push({ kind: `dg_pier_${p.style}`, x: gx0 - 14, y: by }, { kind: `dg_pier_${p.style}2`, x: gx1 + 14, y: by }, { kind: `dg_lintel_${p.style}`, x: cx, y: by - 28, dz: 28 });
    if (p.gate) objects.push({ kind: p.gate === "wood" ? "dg_door_w" : "dg_port", x: cx, y: r * TILE + 31 });
  }

  // стены: по лицу стены над залом, строго по ритму комнаты (позиция 1, 5, 9… от левого края — симметрично): знамёна и факелы (собор, переход), решётки и факелы, цепи (склеп)
  const roomOf = (x: number, y: number) => rooms.find(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  for (let y = DUNGEON.y0; y < DUNGEON.y1 - 1; y++) for (let x = DUNGEON.x0; x < DUNGEON.x1; x++) {
    if (!(at(x, y) & CELL_WALL) || at(x, y + 1) & CELL_WALL || !inRoom(x, y + 1)) continue;
    const rm = roomOf(x, y + 1);
    if (!rm) continue;
    const pos = x - rm[0], W = rm[2] - rm[0];
    if (W < 6 || pos % 4 !== 1 || nearDoor(x, y + 1, 1)) continue;
    const st = style(x, y + 1), i = (pos - 1) / 4;
    const kind = st === 0 ? (i % 2 ? "torch" : i % 4 === 0 ? "dg_banner_c_a" : "dg_banner_c_b") : st === 1 ? (i % 2 ? "torch" : "dg_banner_t_a") : i % 2 ? "torch" : (i % 4 === 0 ? "dg_grate_a" : "dg_chains_a");
    objects.push({ kind, x: x * TILE + 16, y: y * TILE + (kind === "torch" ? 26 : 30) });
  }

  // алтарь собора у дальнего конца северного зала
  const ax = 144 + DG.x, ay = 65 + DG.y;
  if (free(ax, ay, 3)) { place("dg_altar_c", ax, ay); push("dg_candles_a", ax - 1, ay, 0, 28); push("dg_candles_b", ax + 3, ay, 0, 28); }

  // зал босса: помост-ритуальный круг под точкой появления (на земле, проходим), жаровни и саркофаги вдоль стен (не ближе 11 тайлов к центру арены), кости по углам
  objects.push({ kind: "dg_dais", x: Math.round(boss.x * TILE), y: Math.round(boss.y * TILE) + 85 });
  const standHall = (kind: string, x: number, y: number, fw = 1) => { if (free(x + DG.x, y + DG.y, fw)) place(kind, x + DG.x, y + DG.y); };
  for (const y of [60, 83]) {
    standHall("dg_brazier_a", 158, y); standHall("dg_sarc_a_a", 160, y, 2); standHall("dg_brazier_b", 164, y); standHall("dg_sarc_a_b", 167, y, 2); standHall("dg_brazier_a", 171, y); standHall("dg_sarc_a_a", 173, y, 2);
  }
  standHall("dg_brazier_b", 157, 64); standHall("dg_brazier_b", 157, 79);
  [[157, 60, "dg_bones_a"], [174, 60, "dg_bones_b"], [157, 83, "dg_bones_c"], [174, 83, "dg_bones_a"], [157, 70, "dg_ashpile_a"], [174, 74, "dg_ashpile_b"]].forEach(([x, y, k]) => push(k as string, (x as number) + DG.x, (y as number) + DG.y, 0, 28));
  // пол: реквизит с умыслом, не россыпью. Собор — статуи в нишах северной стены (под знамёнами) и свечи у алтаря; переход — обломки и пепел у стен;
  // склеп — жаровни под северной стеной и пары саркофагов у южной (симметрично). Всё — только вдоль стен и у алтаря, середина зала чистая.
  const stand = (kind: string, x: number, y: number, fw = 1) => { if (free(x, y, fw)) place(kind, x, y); };
  rooms.forEach(([x0, y0, x1, y1], ri) => {
    if (inBossHall(x0)) return;
    const W = x1 - x0, sty = style(x0, y0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (at(x, y) & CELL_BLOCK || nearDoor(x, y, 1) || c.arenaNear(x, y, 2)) continue;
      const pos = x - x0, r = hash(x, y, seed + 910), r2 = hash(x, y, seed + 911), wallN = !!(at(x, y - 1) & CELL_WALL), wallS = !!(at(x, y + 1) & CELL_WALL);
      if (sty === 0) {
        if (wallN && W >= 9 && pos % 4 === 1) stand(pickK(["dg_statue_c_a", "dg_statue_c_b", "dg_statue_c_c"], hash(Math.floor(pos / 4), ri, seed + 3)), x, y);
        else if (wallN && W >= 9 && pos % 4 === 3 && r < 0.5) push(pickK(["dg_candles_a", "dg_candles_b"], r2), x, y, 0, 28);
      } else if (sty === 1) {
        if ((wallN || wallS) && r < 0.12) push(pickK(["dg_rubble_t_a", "dg_rubble_t_b", "dg_ashpile_a", "dg_ashpile_b"], r2), x, y, Math.floor((r2 - 0.5) * 8), 28);
      } else if (W >= 9) {
        if (wallN && pos % 4 === 1) stand(r2 < 0.5 ? "dg_brazier_a" : "dg_brazier_b", x, y);
        else if (wallS && (pos === 1 || pos === W - 3)) stand(pos === 1 ? "dg_sarc_a_a" : "dg_sarc_a_b", x, y, 2);
        else if (wallS && pos === 4 && r < 0.7) push("dg_bones_a", x, y, 0, 28);
      }
    }
  });
  // жаровни по бокам входа (собор: факелы у арки сохранены)
  objects.push({ kind: "torch", x: (145 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 }, { kind: "torch", x: (150 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 });
}
