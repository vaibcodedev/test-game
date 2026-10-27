/** Значки служб NPC 7×7: рисуются пикселями (как щит стража), стоят слева от имени. Цвет — P.gold, тень 1 px — P.well. */
import Phaser from "phaser";
import { P } from "../../../shared/palette";

export const NPC_ICON_SIZE = 7;

const ICONS: Record<string, string[]> = {
  shop: ["..###..", ".#...#.", "#..#..#", "#.###.#", "#..#..#", ".#...#.", "..###.."],
  cook: ["..#.#..", ".......", "#######", "#.....#", "#.....#", ".#####.", "......."],
  smith: ["#######", ".#####.", "..###..", "..###..", ".#####.", "#######", "......."],
  bank: [".#####.", "#######", "#..#..#", "#######", "#######", "#######", "......."],
  bags: ["..###..", "...#...", ".#####.", "#######", "#######", "#######", ".#####."],
  rumor: [".#####.", "#.....#", "#.#.#.#", "#.....#", ".#####.", "..##...", "..#...."],
  raid: ["...#...", "#.###.#", ".#####.", "#######", ".#####.", "#.###.#", "...#..."],
  stable: ["#.....#", "#.....#", "#.....#", "#.....#", "##...##", ".#####.", "..###.."],
  arena: ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"],
};

export const hasNpcIcon = (kind: string): boolean => kind in ICONS;

/** Нарисовать значок службы с левым верхним углом (x, y) в целых пикселях мира. */
export function drawNpcIcon(g: Phaser.GameObjects.Graphics, kind: string, x: number, y: number) {
  const rows = ICONS[kind];
  if (!rows) return;
  const well = Phaser.Display.Color.HexStringToColor(P.well).color, gold = Phaser.Display.Color.HexStringToColor(P.gold).color;
  for (const [c, dy] of [[well, 1], [gold, 0]] as const) {
    g.fillStyle(c, c === well ? 0.9 : 1);
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") g.fillRect(x + i, y + j + dy, 1, 1); });
  }
}
