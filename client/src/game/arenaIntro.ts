/**
 * Вступление боя арены в мире (DOM-часть — затемнение, «3 · 2 · 1», баннер — в ui/arena.ts):
 *  - отсчёт: под каждым бойцом — тонкое кольцо цвета команды (едва заметный пульс);
 *  - «В бой!»: от центра арены по земле (под бойцами) расходится короткое золотое кольцо, подсветка гаснет.
 * Одна Graphics на всех бойцов; кольцо — своя Graphics на 0,7 с.
 */
import Phaser from "phaser";
import { arenaSpawn } from "../../../shared/arena";
import { UnitKind } from "../../../shared/protocol";
import type { Net, UnitState } from "../net";
import { DEPTH } from "./terrain";

const ALLY = 0x9ae07a, FOE = 0xff6a55, GOLD = 0xffd27a;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Fighter { id: string; x: number; y: number; u: UnitState }

export class ArenaIntroFx {
  private g: Phaser.GameObjects.Graphics;
  private phase = "";
  /** Видимость подсветки: 0 → 1 на отсчёте, гаснет после старта. */
  private fade = 0;

  constructor(private scene: Phaser.Scene, private net: Net) {
    this.g = scene.add.graphics().setDepth(DEPTH.ground + 6);
  }

  update(units: Iterable<Fighter>, dt: number) {
    const st = this.net.room?.state as { phase?: string } | undefined;
    const phase = this.net.kind === "arena" ? st?.phase ?? "" : "";
    if (phase === "fight" && this.phase === "countdown") this.burst();
    this.phase = phase;
    const on = phase === "countdown" || phase === "waiting";
    this.fade = on ? Math.min(1, this.fade + dt * 3) : Math.max(0, this.fade - dt * 2);
    this.g.clear();
    if (this.fade <= 0) return;
    const k = easeOut(this.fade), myTeam = this.net.arena?.team ?? 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 320);
    for (const v of units) {
      const u = v.u;
      if (u.kind !== UnitKind.Player || !u.team) continue;
      // тонкое кольцо цвета команды у ног: подсказка «кто за кого», а не эффект
      this.g.lineStyle(1, u.team === myTeam ? ALLY : FOE, (0.45 + 0.2 * pulse) * k);
      this.g.strokeEllipse(v.x, v.y + 1, 30, 12);
    }
  }

  /** «В бой!»: короткое кольцо по земле от центра арены (между точками команд), под бойцами. */
  private burst() {
    const a = arenaSpawn(1, 0), b = arenaSpawn(2, 0);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, s = this.scene;
    const ring = s.add.graphics().setDepth(DEPTH.ground + 6);
    const st = { t: 0 };
    s.tweens.add({
      targets: st, t: 1, duration: 700, ease: "Cubic.easeOut",
      onUpdate: () => {
        const r = 10 + st.t * 220, al = 1 - st.t;
        ring.clear();
        ring.lineStyle(6 * al + 1, GOLD, 0.35 * al);
        ring.strokeEllipse(cx, cy, r * 2, r);
        ring.lineStyle(1.5, 0xfff2c8, 0.85 * al);
        ring.strokeEllipse(cx, cy, r * 2, r);
      },
      onComplete: () => ring.destroy(),
    });
  }

  destroy() {
    this.g.destroy();
  }
}
