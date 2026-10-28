/** Админ-режим «Сетка проходимости»: непроходимые клетки (CELL_BLOCK) полупрозрачным красным и тонкая сетка вокруг героя. Переключатель — вкладка «Мир» админки (ui/admin.ts). */
import Phaser from "phaser";
import { CELL_BLOCK, type WorldMap } from "../../../shared/map";
import { TILE } from "../../../shared/constants";

export const collisionDebug = { on: false };
const R = 14;

export class CollisionGrid {
  private g: Phaser.GameObjects.Graphics;
  private key = "";
  constructor(scene: Phaser.Scene, private map: WorldMap) { this.g = scene.add.graphics().setDepth(1e6 - 60).setVisible(false); }

  update(px: number, py: number) {
    const on = collisionDebug.on;
    this.g.setVisible(on);
    if (!on) { this.key = ""; return; }
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE), k = cx + "," + cy;
    if (k === this.key) return;
    this.key = k;
    const m = this.map, g = this.g;
    g.clear();
    for (let y = Math.max(0, cy - R); y <= Math.min(m.h - 1, cy + R); y++) {
      for (let x = Math.max(0, cx - R); x <= Math.min(m.w - 1, cx + R); x++) {
        const blocked = (m.cell[y * m.w + x] & CELL_BLOCK) !== 0;
        if (blocked) { g.fillStyle(0xff3030, 0.38); g.fillRect(x * TILE, y * TILE, TILE, TILE); }
        g.lineStyle(1, blocked ? 0xff8080 : 0x80ff90, blocked ? 0.5 : 0.18);
        g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
  destroy() { this.g.destroy(); }
}
