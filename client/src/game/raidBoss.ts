/** Визуал рейд-босса (задача 114): декоратор поверх UnitView — анимации поз, масштаб, ореол, искры, реплики, тряска. */
import Phaser from "phaser";
import { Anim, Dir, type Fx } from "../../../shared/protocol";
import { net } from "../net";
import { DEPTH } from "./terrain";
import type { UnitView } from "./UnitView";
import { placeText, worldText } from "./worldText";
import type { Hud } from "../ui/hud";
import { shakeCam } from "./camShake";

type Pose = "swing" | "slam" | "roar" | "idle";
const rowOf = (dir: number) => (dir === Dir.Down ? 0 : dir === Dir.Up ? 1 : 2);
const MAX_SPARKS = 40;

export class RaidBoss {
  private halo?: Phaser.GameObjects.Image;
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter;
  private yells: { t: Phaser.GameObjects.Text; id: string; until: number }[] = [];
  private pose: Pose = "idle";
  private poseUntil = 0;
  private lastPose: Pose = "slam";
  private flashUntil = 0;
  private readonly tick = () => this.frame();

  constructor(readonly scene: Phaser.Scene, readonly unit: (id: string) => UnitView | undefined) {
    scene.events.on("postupdate", this.tick);
    scene.events.once("shutdown", () => this.destroy());
  }

  /** id юнита босса: состояние комнаты (RaidState.boss), запасной — welcome. */
  private bossId(): string {
    return ((net.room?.state as { boss?: string } | undefined)?.boss || net.raid?.boss) ?? "";
  }
  private boss(): UnitView | undefined {
    const id = this.bossId();
    return id ? this.unit(id) : undefined;
  }
  private isBoss(id: string) {
    return id === this.bossId();
  }

  /** fx pose / yell / shake; true — обработано. */
  handle(f: Fx): boolean {
    const cam = this.scene.cameras.main;
    switch (f.t) {
      case "pose": {
        if (!this.isBoss(f.id)) return false;
        this.pose = f.k;
        this.lastPose = f.k === "idle" ? this.lastPose : f.k;
        this.poseUntil = this.scene.time.now + f.ms;
        if (f.k !== "idle") this.flashUntil = this.scene.time.now + Math.min(f.ms, 600);
        return true;
      }
      case "yell": {
        const v = this.unit(f.id);
        if (!v) return true;
        const t = placeText(worldText(this.scene, 0, 0, f.text, "plain", { fontSize: "16px", fontStyle: "600", color: "#ff9a3a", stroke: "#200800", strokeThickness: 6, align: "center", wordWrap: { width: 280 } }).setDepth(DEPTH.top), v.x, v.y, 0.5, 1);
        this.yells.push({ t, id: f.id, until: this.scene.time.now + Math.max(4000, 60 * f.text.length) });
        (this.scene.registry.get("hud") as Hud | undefined)?.chatLine({ from: v.u.name, text: f.text, sys: false, boss: true });
        return true;
      }
      case "shake": {
        // целыми пикселями мира и мало (camShake.ts): 2 — сильные удары босса, 1 — остальное
        if (f.k === "quake") shakeCam(cam, 400, 2);
        else if (f.k === "rift") shakeCam(cam, 300, 1);
        else if (f.k === "phase") shakeCam(cam, 500, 1);
        else if (f.k === "sun") { cam.flash(300, 255, 150, 40); shakeCam(cam, 400, 2); }
        else if (f.k === "death") shakeCam(cam, 900, 1);
        else if (f.k === "berserk") cam.flash(400, 255, 30, 20);
        return true;
      }
    }
    return false;
  }

  private frame() {
    const s = this.scene, now = s.time.now;
    const v = this.boss();
    // реплики
    for (const y of this.yells) {
      const b = this.unit(y.id);
      if (b) placeText(y.t, b.x, b.y - 0.95 * b.frame, 0.5, 1);
      const left = y.until - now;
      y.t.setAlpha(left < 500 ? Math.max(0, left / 500) : 1);
    }
    this.yells = this.yells.filter((y) => y.until > now || (y.t.destroy(), false));
    if (!v || v.u.sprite !== "chaos_knight") {
      this.halo?.setVisible(false);
      this.sparks?.stop();
      return;
    }
    const u = v.u, k = v.frame / 32, row = rowOf(u.dir), spr = v.u.sprite;
    // тень, кольцо, подпись, полоска
    v.shadow.setScale(1.1 * k);
    v.ring.setScale(k);
    // подпись и титул босса ставит сам UnitView от метрик шрифта, как у героев (низ ника на 0.9 роста выше ног, nameRise); здесь — без полоски
    v.bar.clear();
    // анимация
    const sp = v.sprite, cur = sp.anims.currentAnim?.key ?? "";
    const play = (key: string) => { if (s.anims.exists(key) && cur !== key) sp.play(key); };
    if (v.dead) {
      if (!sp.anims.isPlaying) sp.setFrame(row * 24 + 11);
    } else {
      const posing = now < this.poseUntil && this.pose !== "idle";
      if (posing || u.anim === Anim.Cast) {
        const p = posing ? this.pose : this.lastPose;
        play(`${spr}-${p === "swing" ? "attack" : p}-${row}`);
      } else if (u.anim === Anim.Walk) {
        if (!cur.includes("-attack-") || !sp.anims.isPlaying) play(`${spr}-walk-${row}`);
      } else if (!(cur.includes("-attack-") && sp.anims.isPlaying)) {
        if (!(cur.includes("-slam-") || cur.includes("-roar-")) || !sp.anims.isPlaying) play(`${spr}-idle-${row}`);
      }
    }
    // ореол
    if (!this.halo && s.textures.exists("fx_chaos_halo")) this.halo = s.add.image(0, 0, "fx_chaos_halo").setBlendMode(Phaser.BlendModes.ADD);
    if (this.halo) {
      const flash = now < this.flashUntil ? 0.35 : 0;
      this.halo.setVisible(!v.dead).setPosition(Math.round(v.x), Math.round(v.y - 0.4 * v.frame)).setDepth(v.y - 0.5)
        .setRotation(now / 4000).setScale(1.6 + 0.12 * Math.sin(now / 600) + (flash ? 0.25 : 0))
        .setAlpha(Math.min(1, 0.3 + 0.12 * u.phase + flash + 0.05 * Math.sin(now / 450)));
    }
    // искры и пепел
    if (!this.sparks && s.textures.exists("fx_ember")) {
      this.sparks = s.add.particles(0, 0, "fx_ember", {
        x: { min: -200, max: 200 }, y: { min: -120, max: 100 }, lifespan: 2400, frequency: 62,
        speedY: { min: -26, max: -8 }, speedX: { min: -6, max: 6 }, scale: { start: 0.9, end: 0.1 }, alpha: { start: 0.9, end: 0 },
        tint: [0xff6a1a, 0xffa030, 0x8a8078], blendMode: Phaser.BlendModes.ADD, maxAliveParticles: MAX_SPARKS,
      }).setDepth(DEPTH.top - 40);
    }
    if (this.sparks) {
      this.sparks.setPosition(Math.round(v.x), Math.round(v.y));
      if (v.dead) this.sparks.stop(); else if (!this.sparks.emitting) this.sparks.start();
    }
  }

  destroy() {
    this.scene.events.off("postupdate", this.tick);
    for (const y of this.yells) y.t.destroy();
    this.yells = [];
    this.halo?.destroy();
    this.sparks?.destroy();
  }
}
