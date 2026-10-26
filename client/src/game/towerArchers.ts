/**
 * Лучники на вышках стен у рек (задача 141, правки 9): живые бойцы фракции на площадке вышки — тот же UnitView, слои снаряжения
 * и наборы data/npc-gear.json (ранг bridge, стрелок), что у «Лучника Сольгарда» и «Арбалетчика Умбрата» на земле; без сети.
 * Стоят в покое, раз в несколько секунд оглядываются; когда башня стреляет (fx proj от точки башни, server soldiers.ts shootTowers) —
 * поворачиваются к цели и проигрывают выстрел. Зубцы площадки рисуются поверх лучника (обрезанная копия кадра вышки).
 */
import Phaser from "phaser";
import type { WorldMap } from "../../../shared/map";
import { Anim, Dir, UnitKind } from "../../../shared/protocol";
import { NPC_GEAR, npcGearStrings } from "../../../shared/npcGear";
import type { UnitState } from "../net";
import { UnitView } from "./UnitView";

/** Кадр вышки (tools/gen/walls141-walls.ts archerTower): высота 194, верх зубцов площадки — строка 72, низ парапета — 92; ноги лучника — 112 px над опорой (над зубцами видно всё выше колен). */
const TOWER_H = 194, CREST_Y = 72, CREST_H = 21, FLOOR = 112, DX = -6;
type Archer = { v: UnitView; u: UnitState; x: number; y: number; d: number; crest: Phaser.GameObjects.Image; turnAt: number };

export class TowerArchers {
  private list: Archer[] = [];
  constructor(private scene: Phaser.Scene, map: WorldMap) {
    let i = 0;
    for (const o of map.objects) {
      const f = o.kind === "bf_wall_tower_sol" ? "solgard" : o.kind === "bf_wall_tower_umb" ? "umbrath" : null;
      if (!f) continue;
      const sets = NPC_GEAR.sets[f][NPC_GEAR.tiers.bridge].ranged, set = sets[i++ % sets.length], g = npcGearStrings(set, false);
      const x = o.x + DX, y = o.y - FLOOR, d = o.y + (o.dz ?? 0) + 0.5;
      const u: UnitState = {
        kind: UnitKind.Soldier, name: "", sprite: set.cls, x, y, dir: Dir.Down, anim: Anim.Idle, aseq: 0, hp: 1, maxHp: 1, mp: 0, maxMp: 0, level: 0, buffs: 0,
        phase: 0, weapon: g.weapon, gear: g.gear, target: "", team: 0, title: "", frame: "", elite: 0, ownerId: "", mount: "", look: 0, faction: f, outlaw: 0,
        shield: 0, fx: "", herald: g.herald,
      };
      const v = new UnitView(scene, `tower-archer-${i}`, u, false);
      const crest = scene.add.image(o.x, o.y, `o_${o.kind}`).setOrigin(0.5, 1).setCrop(0, CREST_Y, 80, CREST_H).setDepth(d + 0.2);
      this.list.push({ v, u, x, y, d, crest, turnAt: scene.time.now + 2000 + Math.random() * 6000 });
    }
    void TOWER_H;
  }
  /** Выстрел башни: ближайший к точке вылета лучник поворачивается к цели и стреляет (новая aseq → анимация атаки в UnitView). */
  shot(fx: number, fy: number, tx: number, ty: number) {
    let best: Archer | null = null, bd = 90;
    for (const a of this.list) { const dd = Math.hypot(a.x - fx, a.y - fy); if (dd < bd) { bd = dd; best = a; } }
    if (!best) return;
    const dx = tx - best.x, dy = ty - best.y;
    best.u.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down;
    best.u.aseq++;
    best.turnAt = this.scene.time.now + 4000;
  }
  update(dt: number) {
    const now = this.scene.time.now;
    for (const a of this.list) {
      if (now > a.turnAt) { a.u.dir = [Dir.Down, Dir.Left, Dir.Down, Dir.Right][Math.floor(Math.random() * 4)]; a.turnAt = now + 3000 + Math.random() * 5000; }
      a.v.update(dt, a.x, a.y);
      // поверх вышки: тело и слои снаряжения — над кадром вышки, под зубцами; имя, полоска, тень и кольцо не нужны
      const r = a.v as unknown as Record<string, { setDepth?(d: number): unknown; setVisible?(v: boolean): unknown } | undefined>;
      a.v.sprite.setDepth(a.d);
      r.layers?.setDepth?.(a.d + 0.05);
      for (const k of ["label", "bar", "titleText", "frameGfx", "shadow", "ring"]) r[k]?.setVisible?.(false);
    }
  }
  destroy() { for (const a of this.list) { a.v.destroy(); a.crest.destroy(); } this.list = []; }
}
