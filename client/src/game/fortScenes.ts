/**
 * Сценки в фортах (задача 132, шаг 12): бойцы-декорации без сети — муштра, кузнецы, приказы, расчёт катапульты.
 * Позы считает shared/fortScenes.ts от Date.now() (у всех одинаково), данные — data/fort-scenes.json. Бойцы рисуются тем же UnitView со слоями
 * снаряжения, что стража и лучники на вышках. Сценка спит (юниты не созданы), пока герой дальше nearRadius; если рядом герой чужой фракции
 * (pauseRadius) — замирает: бойцы стоят, реплик нет, а настоящая стража форта (soldiers.ts) делает своё дело как обычно.
 */
import Phaser from "phaser";
import { Anim, Dir, UnitKind } from "../../../shared/protocol";
import { FORT_SCENES, FORT_SCENE_CFG, fxBetween, lookSet, poseAt, type FortFx, type FortScene } from "../../../shared/fortScenes";
import { npcGearStrings } from "../../../shared/npcGear";
import type { UnitState } from "../net";
import * as sfx from "./sfx";
import { DEPTH } from "./terrain";
import { UnitView } from "./UnitView";
import { placeText, worldText } from "./worldText";

type Actor = { id: string; v: UnitView; u: UnitState; txt: Phaser.GameObjects.Text; carry: Phaser.GameObjects.Container; carryKind: string; said: string };
type Live = { scene: FortScene; actors: Actor[]; frozen: boolean };
const num = (v: unknown) => Number(v);

export class FortScenes {
  private live = new Map<string, Live>();
  private t0 = Date.now();
  private hero = { x: 0, y: 0 };
  /** Короткие эффекты (искры, камень, пыль): свой счётчик по performance.now, не твины Phaser (те в игре не двигались). */
  private anims: { t0: number; ms: number; step: (k: number) => void; end: () => void }[] = [];

  /** others — все юниты сцены (герои, в том числе свой): чужая фракция рядом замораживает сценку. */
  constructor(private sc: Phaser.Scene, private others: () => Iterable<{ u: UnitState }>) {}

  private build(s: FortScene): Live {
    const actors = s.def.actors.map((a): Actor => {
      const g = npcGearStrings(lookSet(s.fort, a.look), false), set = lookSet(s.fort, a.look);
      const u: UnitState = {
        kind: UnitKind.Soldier, name: "", sprite: set.cls, x: s.x, y: s.y, dir: Dir.Down, anim: Anim.Idle, aseq: 0, hp: 1, maxHp: 1, mp: 0, maxMp: 0, level: 0, buffs: 0,
        phase: 0, weapon: g.weapon, gear: g.gear, target: "", team: 0, title: "", frame: "", elite: 0, ownerId: "", mount: "", look: 0, faction: s.fort, outlaw: 0,
        shield: 0, fx: "", herald: g.herald,
      };
      const p = poseAt(s, Date.now()).find((q) => q.id === a.id)!;
      u.x = p.x; u.y = p.y; u.dir = p.dir; u.aseq = p.attacks % 65535; // кадры атаки только на смену, не при пробуждении
      const v = new UnitView(this.sc, `fort-${s.id}-${a.id}`, u, false);
      const txt = worldText(this.sc, 0, 0, "", "plain", { fontSize: "10px", color: "#ffe0b0", stroke: "#200a0a", strokeThickness: 4, align: "center", wordWrap: { width: 160 } }).setDepth(DEPTH.top).setVisible(false);
      const carry = this.sc.add.container(p.x, p.y).setVisible(false);
      if (a.carry === "ingot") carry.add([this.sc.add.rectangle(-3, 0, 9, 4, 0xc0c8d4).setStrokeStyle(1, 0x30343c), this.sc.add.rectangle(3, -4, 9, 4, 0xa8b0bc).setStrokeStyle(1, 0x30343c)]);
      else if (a.carry === "stone") carry.add(this.sc.add.circle(0, 0, 5, num(FORT_SCENE_CFG.fx.shot.stone)).setStrokeStyle(1, 0x2a2620));
      return { id: a.id, v, u, txt, carry, carryKind: a.carry ?? "", said: "" };
    });
    return { scene: s, actors, frozen: false };
  }

  private drop(l: Live) {
    for (const a of l.actors) { a.v.destroy(); a.txt.destroy(); a.carry.destroy(); }
  }

  /** Чужой герой (другая фракция) ближе pauseRadius к якорю сценки. */
  private foeNear(s: FortScene): boolean {
    for (const o of this.others()) {
      const u = o.u;
      if (u.kind === UnitKind.Player && u.faction && u.faction !== s.fort && Math.hypot(u.x - s.x, u.y - s.y) < FORT_SCENE_CFG.pause) return true;
    }
    return false;
  }

  update(dt: number, hx: number, hy: number) {
    const now = Date.now(), pn = performance.now();
    const cur = this.anims;
    this.anims = []; // end() может запускать новые эффекты (камень → пыль): они попадают в новый список
    for (const a of cur) { const k = (pn - a.t0) / a.ms; if (k >= 1) a.end(); else { a.step(k); this.anims.push(a); } }
    this.hero = { x: hx, y: hy };
    const t0 = Math.max(this.t0, now - 600);
    this.t0 = now;
    for (const s of FORT_SCENES) {
      const awake = Math.hypot(hx - s.x, hy - s.y) < FORT_SCENE_CFG.near;
      let l = this.live.get(s.id);
      if (!awake) { if (l) { this.drop(l); this.live.delete(s.id); } continue; }
      if (!l) { l = this.build(s); this.live.set(s.id, l); }
      l.frozen = this.foeNear(s);
      const poses = l.frozen ? [] : poseAt(s, now);
      for (const a of l.actors) {
        const p = poses.find((q) => q.id === a.id);
        if (p) {
          a.u.x = p.x; a.u.y = p.y; a.u.dir = p.dir;
          a.u.anim = p.walking ? Anim.Walk : Anim.Idle;
          if (p.attacks % 65535 !== a.u.aseq) a.u.aseq = p.attacks % 65535;
          a.said = p.say;
          a.carry.setVisible(!!p.carry && a.carryKind === p.carry).setPosition(Math.round(p.x), Math.round(p.y - 16 - p.hop)).setDepth(p.y + 0.5);
        } else { a.u.anim = Anim.Idle; a.said = ""; }
        const hop = p?.hop ?? 0;
        a.v.update(dt, a.u.x, a.u.y - hop);
        // декорация: ни ника, ни полоски, ни кольца выбора
        const r = a.v as unknown as Record<string, { setVisible?(v: boolean): unknown } | undefined>;
        for (const k of ["label", "bar", "titleText", "frameGfx", "ring"]) r[k]?.setVisible?.(false);
        if (a.txt.text !== a.said) a.txt.setText(a.said);
        a.txt.setVisible(!!a.said);
        if (a.said) placeText(a.txt, a.u.x, a.u.y - hop - (a.v.frame > 32 ? 76 : 44), 0.5, 1);
      }
      if (!l.frozen) for (const f of fxBetween(s, t0, now)) this.fx(f);
    }
  }

  /** Громкость по расстоянию от героя до точки: 0 за soundRadius. */
  private near(x: number, y: number) { return Math.max(0, 1 - Math.hypot(x - this.hero.x, y - this.hero.y) / FORT_SCENE_CFG.sound); }

  /** Короткий эффект 0→1 за ms (искры, камень, пыль); по концу end убирает объекты. */
  private run(ms: number, step: (k: number) => void, end: () => void) {
    this.anims.push({ t0: performance.now(), ms, step, end });
  }

  private fx(f: FortFx) {
    if (f.kind === "anvil") this.sparks(f);
    else if (f.kind === "shot") this.shot(f);
  }

  private sparks(f: FortFx) {
    const c = FORT_SCENE_CFG.fx.anvil, n = num(c.sparks), life = num(c.sparkLife), sp = num(c.sparkSpeed);
    sfx.play("clink", num(c.gain) * this.near(f.x, f.y));
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = sp * (0.5 + Math.random() * 0.7);
      const o = this.sc.add.rectangle(f.x, f.y, 2, 2, num(i % 2 ? c.sparkColor : c.sparkColor2)).setDepth(DEPTH.top - 8);
      this.run(life * (0.7 + Math.random() * 0.5), (k) => { o.setPosition(Math.round(f.x + Math.cos(ang) * v * k), Math.round(f.y + Math.sin(ang) * v * k + 60 * k * k)).setAlpha(1 - k * k); }, () => o.destroy());
    }
  }

  /** Холостой выстрел: камень летит дугой через стену и падает далеко, где клубится пыль; урона нет. */
  private shot(f: FortFx) {
    const c = FORT_SCENE_CFG.fx.shot, ms = num(c.flightMs), arc = num(c.arc);
    sfx.play("slam", num(c.gain) * this.near(f.x, f.y));
    const stone = this.sc.add.circle(f.x, f.y, num(c.stoneR), num(c.stone)).setStrokeStyle(2, 0x2a2620).setDepth(DEPTH.top - 8);
    const shade = this.sc.add.ellipse(f.x, f.y, 10, 5, 0x000000, 0.35).setDepth(DEPTH.ground + 6);
    this.run(ms, (k) => {
      const x = f.x + (f.tx - f.x) * k, y = f.y + (f.ty - f.y) * k;
      stone.setPosition(Math.round(x), Math.round(y - 40 - arc * 4 * k * (1 - k)));
      shade.setPosition(Math.round(x), Math.round(y));
    }, () => {
      stone.destroy(); shade.destroy();
      sfx.play("explosion", num(c.gain) * 0.5 * this.near(f.tx, f.ty));
      this.dust(f.tx, f.ty);
    });
  }

  private dust(x: number, y: number) {
    const c = FORT_SCENE_CFG.fx.shot, n = num(c.dust), ms = num(c.dustMs);
    for (let i = 0; i < n; i++) {
      const dx = (Math.random() - 0.5) * 36, dy = (Math.random() - 0.5) * 14, r = 7 + Math.random() * 7;
      const o = this.sc.add.circle(x + dx, y + dy, r, num(c.dustColor), 0.7).setDepth(DEPTH.top - 9);
      this.run(ms * (0.8 + Math.random() * 0.4), (k) => { o.setPosition(x + dx * (1 + k), y + dy - 26 * k).setScale(1 + k * 1.4).setAlpha(0.7 * (1 - k)); }, () => o.destroy());
    }
  }

  destroy() { for (const a of this.anims) a.end(); this.anims = []; for (const l of this.live.values()) this.drop(l); this.live.clear(); }
}
