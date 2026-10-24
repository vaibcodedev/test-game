/**
 * Вид боссов стартовых земель (задача 136): лист 64×64 со своими анимациями, связки умений и эффекты мира.
 * Каталог — /assets/zone-bosses/manifest.json (собирает tools/gen/zone-bosses-to-game.ts из реестров генераторов арта).
 *  - Кадры босса ставятся здесь каждый кадр экрана (postupdate, после UnitView): покой, ходьба, атака, гибель — по состоянию юнита,
 *    умение — по событию zb с сервера: замах → удержание по кругу до начала удара → удар, кадр hit — ровно в конец предупреждения.
 *  - Эффекты мира (корни, огонь, руки мертвецов, плиты, луч, мгла, пасти, газ…) — листы с двумя слоями (под юнитами и над ними),
 *    ставятся в метки волны, кольцом, лучом или летящим факелом; сроки удержаний — из карточек.
 *  - Светлячки древня и туман Мглогляда — частицы в коде, шаг — пиксель мира.
 */
import Phaser from "phaser";
import { Anim, Dir, type Fx } from "../../../shared/protocol";
import { MOVE_MUL } from "../../../shared/constants";
import { DEPTH } from "./terrain";
import type { UnitView } from "./UnitView";

type A = { col: number; n: number; fps: number; loop: boolean; hit?: number };
type Wave = { pre?: string[]; strike?: string; post?: string[]; hold?: number; turn?: boolean };
type Use = { fx: string; waves: number[]; seq: string[]; pin: number; timing: "wind" | "strike"; place: "marks" | "self" | "ring" | "arcs" | "beam" | "torch" | "area"; holds?: Record<string, number>; radius?: "mid" | "r" | "r2" | "inner"; k?: number; spacing?: number; count?: number; flyMs?: number };
type FxDef = { file: string; fw: number; fh: number; ax: number; ay: number; rows: number; anims: Record<string, A> };
type Orbit = { c: [number, number]; r: [number, number]; period: number; phase: number };
export interface ZbDef {
  file: string;
  cols: number;
  anims: Record<string, A>;
  skills: Record<string, { waves: Wave[]; fx: Use[] }>;
  fx: Record<string, FxDef>;
  burn?: string;
  motes?: { file: string; size: number; frames: number; fps: number; y: number; orbits: Orbit[] };
  fog?: { file: string; wisp: { w: number; h: number; frames: number; y: number }; mote: { size: number; frames: number; y: number; fps: number }; wisps: { r: [number, number]; period: number; phase: number; frame: number; lift: number }[]; motes: Orbit[] };
  eye?: [number, number];
  release?: Record<string, [number, number]>;
}
export type ZbManifest = { bosses: Record<string, ZbDef> };

/** Живые виды боссов стартовых земель (UnitView регистрирует себя, если его лист есть в каталоге). */
export const zbViews = new Set<UnitView>();
let MAN: ZbManifest | null = null;
export const zbDef = (sprite: string): ZbDef | undefined => MAN?.bosses[sprite];

const fxKey = (boss: string, f: string) => `zbfx_${boss}_${f}`;

/** Загрузка (BootScene.preload): листы боссов — как юниты (u_<id>), эффекты — картинки, кадры нарезаются в zbCreate. */
export function zbLoad(scene: Phaser.Scene, m: ZbManifest | undefined) {
  if (!m?.bosses) return;
  MAN = m;
  for (const [id, b] of Object.entries(m.bosses)) {
    scene.load.spritesheet(`u_${id}`, `/assets/units/${b.file}`, { frameWidth: 64, frameHeight: 64 });
    for (const [k, f] of Object.entries(b.fx)) scene.load.image(fxKey(id, k), `/assets/zone-bosses/${f.file}`);
    if (b.motes) scene.load.image(fxKey(id, "_motes"), `/assets/zone-bosses/${b.motes.file}`);
    if (b.fog) scene.load.image(fxKey(id, "_fog"), `/assets/zone-bosses/${b.fog.file}`);
  }
}

/** Нарезка кадров эффектов и анимации ходьбы, атаки и гибели для UnitView (BootScene.create). */
export function zbCreate(scene: Phaser.Scene) {
  if (!MAN) return;
  for (const [id, b] of Object.entries(MAN.bosses)) {
    if (!scene.textures.exists(`u_${id}`)) continue;
    for (let row = 0; row < 3; row++) {
      const mk = (key: string, a: A | undefined) => {
        if (!a || scene.anims.exists(`${id}-${key}-${row}`)) return;
        scene.anims.create({ key: `${id}-${key}-${row}`, frames: scene.anims.generateFrameNumbers(`u_${id}`, { start: row * b.cols + a.col, end: row * b.cols + a.col + a.n - 1 }), frameRate: key === "walk" ? a.fps * MOVE_MUL : a.fps, repeat: a.loop ? -1 : 0 });
      };
      mk("walk", b.anims.walk);
      mk("attack", b.anims.attack);
      mk("death", b.anims.death);
    }
    for (const [k, f] of Object.entries(b.fx)) {
      const key = fxKey(id, k);
      if (!scene.textures.exists(key)) continue;
      const t = scene.textures.get(key), W = t.getSourceImage().width, cols = Math.floor(W / f.fw);
      for (let r = 0; r < f.rows; r++) for (let c = 0; c < cols; c++) t.add(`${r}_${c}`, 0, c * f.fw, r * f.fh, f.fw, f.fh);
    }
    if (b.motes && scene.textures.exists(fxKey(id, "_motes"))) {
      const t = scene.textures.get(fxKey(id, "_motes")), s = b.motes.size;
      for (let i = 0; i < b.motes.frames; i++) t.add(`m${i}`, 0, i * s, b.motes.y, s, s);
    }
    if (b.fog && scene.textures.exists(fxKey(id, "_fog"))) {
      const t = scene.textures.get(fxKey(id, "_fog")), g = b.fog;
      for (let i = 0; i < g.wisp.frames; i++) t.add(`w${i}`, 0, i * g.wisp.w, g.wisp.y, g.wisp.w, g.wisp.h);
      for (let i = 0; i < g.mote.frames; i++) t.add(`m${i}`, 0, i * g.mote.size, g.mote.y, g.mote.size, g.mote.size);
    }
  }
}

// ---------- время связок ----------
type Seg = { a: string; t0: number; t1: number };
/**
 * Отрезки связки seq: анимация pin бьёт (её кадр hit) в момент T; до неё — с T0 по порядку (петля тянется до начала pin),
 * после — по порядку (петля держится holds[a] мс или один круг).
 */
function segments(anims: Record<string, A>, seq: string[], pin: number, T0: number, T: number, holds: Record<string, number> = {}): Seg[] {
  const out: Seg[] = [];
  const dur = (a: A) => (a.n / a.fps) * 1000;
  const P = anims[seq[pin]];
  if (!P) return out;
  const pinStart = T - ((P.hit ?? 0) / P.fps) * 1000;
  // до удара: сначала разовые, петля — остаток
  const pre = seq.slice(0, pin).map((k) => ({ k, a: anims[k] })).filter((s) => s.a);
  const fixed = pre.reduce((s, p) => s + (p.a.loop ? 0 : dur(p.a)), 0);
  const loops = pre.filter((p) => p.a.loop).length;
  const slack = Math.max(0, pinStart - T0 - fixed);
  let t = Math.min(T0, pinStart);
  for (const p of pre) {
    const d = p.a.loop ? slack / Math.max(1, loops) : dur(p.a);
    const t1 = Math.min(pinStart, t + d);
    if (t1 > t) out.push({ a: p.k, t0: t, t1 });
    t = t1;
  }
  t = pinStart;
  for (const k of seq.slice(pin)) {
    const a = anims[k];
    if (!a) continue;
    const d = a.loop ? holds[k] ?? dur(a) : dur(a);
    out.push({ a: k, t0: t, t1: t + d });
    t += d;
  }
  return out;
}
/** Кадр связки в момент t: [анимация, номер кадра] или null (ещё не началась или кончилась). */
function frameAt(anims: Record<string, A>, segs: Seg[], t: number): [string, number] | null {
  for (const s of segs) {
    if (t < s.t0 || t >= s.t1) continue;
    const a = anims[s.a], i = Math.floor(((t - s.t0) / 1000) * a.fps);
    return [s.a, a.loop ? i % a.n : Math.min(a.n - 1, i)];
  }
  return null;
}

const rowOf = (dir: number) => (dir === Dir.Down ? 0 : dir === Dir.Up ? 1 : 2);

/** Связка босса одной волны умения. */
type BossTl = { segs: Seg[]; cut: number; end: number; turn: boolean };
/** Эффект мира в мире: кадры по связке, слои под и над юнитами. */
type FxInst = { boss: string; f: FxDef; segs: Seg[]; spr: Phaser.GameObjects.Image[]; x: number; y: number; rot: number; end: number; follow?: string; fly?: { x0: number; y0: number; t0: number; t1: number } };

export class ZoneBossFx {
  private tls = new Map<string, BossTl[]>();
  private fxs: FxInst[] = [];
  private seen = new Map<UnitView, { aseq: number; atk: number; dead: number }>();
  private parts = new Map<UnitView, Phaser.GameObjects.Image[]>();
  private readonly tick = () => this.frame();

  constructor(readonly scene: Phaser.Scene, readonly unit: (id: string) => UnitView | undefined) {
    scene.events.on("postupdate", this.tick);
    scene.events.once("shutdown", () => this.destroy());
  }

  /** Событие zb: волна умения началась (или поджог на герое). */
  handle(f: Extract<Fx, { t: "zb" }>): void {
    const v = this.unit(f.id);
    const def = v ? zbDef(v.u.sprite) : undefined;
    if (!v || !def) return;
    const now = this.scene.time.now, T = now + f.ms;
    if (f.ab === "burn") {
      const t = f.tgt ? this.unit(f.tgt) : undefined;
      const fd = def.burn ? def.fx[def.burn] : undefined;
      if (t && fd) {
        const seq = Object.keys(fd.anims);
        this.addFx(v.u.sprite, fd, segments(fd.anims, seq, 0, now, now, { [seq[0]]: f.ms }), t.x, t.y, 0, f.tgt);
      }
      return;
    }
    const sk = def.skills[f.ab];
    if (!sk) return;
    // связка босса: новая волна сменяет прошлую после её удара (кадр hit и ещё два)
    const wv = sk.waves[Math.min(f.w, sk.waves.length - 1)];
    if (wv && wv.strike) {
      const list = (this.tls.get(f.id) ?? []).filter((t) => t.end > now);
      const prev = list[list.length - 1];
      const T0 = prev ? Math.max(now, Math.min(prev.end, prev.cut)) : now;
      const seq = [...(wv.pre ?? []), wv.strike, ...(wv.post ?? [])];
      const segs = segments(def.anims, seq, (wv.pre ?? []).length, T0, T, wv.hold ? { [wv.strike]: wv.hold } : {});
      if (segs.length) {
        if (prev) prev.end = Math.min(prev.end, Math.max(T0, segs[0].t0));
        const S = def.anims[wv.strike];
        const pinStart = T - ((S.hit ?? 0) / S.fps) * 1000;
        list.push({ segs, cut: pinStart + (((S.hit ?? 0) + 2) / S.fps) * 1000, end: segs[segs.length - 1].t1, turn: !!wv.turn || (!!prev?.turn && !wv.pre) });
        this.tls.set(f.id, list);
      }
    }
    // эффекты мира волны
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < (f.pts?.length ?? 0); i += 2) pts.push([f.pts![i], f.pts![i + 1]]);
    for (const u of sk.fx) {
      if (!u.waves.includes(f.w)) continue;
      const fd = def.fx[u.fx];
      if (!fd) continue;
      const mk = (x: number, y: number, rot: number, delay: number) => {
        const t0 = u.timing === "wind" ? now : T + delay;
        const segs = segments(fd.anims, u.seq, u.pin, u.timing === "wind" ? now + delay : t0, T + delay, u.holds);
        return this.addFx(v.u.sprite, fd, segs, x, y, rot);
      };
      const c = pts[0] ?? [v.x, v.y];
      const R = (f.r ?? 64), R2 = f.r2 ?? R * 2;
      const rad = u.radius === "r2" ? R2 : u.radius === "mid" ? (f.r2 ? (R + R2) / 2 : R * 0.6) : u.radius === "inner" ? R * 0.55 : R * (u.k ?? 1);
      switch (u.place) {
        case "marks":
          pts.forEach(([x, y], i) => mk(x, y, 0, i * (f.step ?? 0)));
          break;
        case "self":
          mk(v.x, v.y, 0, 0);
          break;
        case "ring":
        case "arcs": {
          const n = u.count ?? Math.max(6, Math.round((2 * Math.PI * rad) / (u.spacing ?? 40)));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            mk(c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad, u.place === "arcs" ? a - Math.PI / 2 : 0, 0);
          }
          break;
        }
        case "area": {
          // газ: клубы рядами по кольцу r..r2 (шахматкой), не дальше арены
          const step = u.spacing ?? 64;
          for (let rr = R + step / 2, k = 0; rr < R2; rr += step * 0.8, k++) {
            const n = Math.max(6, Math.round((2 * Math.PI * rr) / step));
            for (let i = 0; i < n; i++) {
              const a = ((i + (k % 2) * 0.5) / n) * Math.PI * 2;
              mk(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr * 0.9, 0, 0);
            }
          }
          break;
        }
        case "beam":
          this.beam(v, def, fd, u, f, T);
          break;
        case "torch": {
          const fly = u.flyMs ?? 450;
          const rel = def.release?.[v.u.dir === Dir.Down ? "down" : v.u.dir === Dir.Up ? "up" : "side"] ?? [0, -40];
          const sx = v.x + (v.u.dir === Dir.Left ? -rel[0] : rel[0]), sy = v.y + rel[1];
          for (const [x, y] of pts) {
            const inst = this.addFx(v.u.sprite, fd, [{ a: u.seq[0], t0: T - fly, t1: T }], x, y, 0);
            inst.fly = { x0: sx, y0: sy, t0: T - fly, t1: T };
          }
          break;
        }
      }
    }
  }

  /** Луч глаза по клину: начало у глаза, тайлы тела, конец — на длине конуса. */
  private beam(v: UnitView, def: ZbDef, fd: FxDef, u: Use, f: Extract<Fx, { t: "zb" }>, T: number) {
    const a = f.a ?? 0, eye = def.eye ?? [0, -40];
    const ex = v.x + (v.u.dir === Dir.Left ? -eye[0] : eye[0]), ey = v.y + eye[1];
    const tx = v.x + Math.cos(a) * (f.r ?? 240), ty = v.y + Math.sin(a) * (f.r ?? 240) - 14;
    const len = Math.hypot(tx - ex, ty - ey), an = Math.atan2(ty - ey, tx - ex);
    const segs = segments(fd.anims, u.seq, u.pin, T, T);
    const ca = Math.cos(an), sa = Math.sin(an), W = fd.fw;
    const put = (row: number, d: number) => this.addFx(v.u.sprite, fd, segs, ex + ca * d, ey + sa * d, an, undefined, row);
    put(2, 0);
    // как в просмотре генератора: кадр с точкой origin у глаза, тайлы тела через W, конец — на длине луча
    const end = len - W + fd.ax;
    for (let d = W; d < end; d += W) put(0, d);
    put(1, Math.max(W, end));
  }

  private addFx(boss: string, f: FxDef, segs: Seg[], x: number, y: number, rot: number, follow?: string, onlyRow?: number): FxInst {
    const key = fxKey(boss, Object.keys(zbDef(boss)!.fx).find((k) => zbDef(boss)!.fx[k] === f)!);
    const spr: Phaser.GameObjects.Image[] = [];
    if (this.scene.textures.exists(key)) {
      const rows = onlyRow !== undefined ? [onlyRow] : f.rows >= 2 ? [0, 1] : [0];
      for (const r of rows) {
        const im = this.scene.add.image(0, 0, key, `${r}_0`).setOrigin(f.ax / f.fw, f.ay / f.fh).setVisible(false).setRotation(rot);
        im.setData("row", r);
        spr.push(im);
      }
    }
    const inst: FxInst = { boss, f, segs, spr, x, y, rot, end: segs.length ? segs[segs.length - 1].t1 : 0, follow };
    this.fxs.push(inst);
    return inst;
  }

  private frame() {
    const now = this.scene.time.now;
    for (const v of zbViews) this.drive(v, now);
    // эффекты мира
    this.fxs = this.fxs.filter((e) => {
      if (now >= e.end) { for (const s of e.spr) s.destroy(); return false; }
      const fr = frameAt(e.f.anims, e.segs, now);
      if (e.follow) { const t = this.unit(e.follow); if (!t || t.dead) { e.end = now; } else { e.x = t.x; e.y = t.y; } }
      let x = e.x, y = e.y;
      if (e.fly) {
        const k = Math.max(0, Math.min(1, (now - e.fly.t0) / (e.fly.t1 - e.fly.t0)));
        x = e.fly.x0 + (e.x - e.fly.x0) * k;
        y = e.fly.y0 + (e.y - e.fly.y0) * k - Math.sin(k * Math.PI) * 36;
      }
      for (const s of e.spr) {
        if (!fr) { s.setVisible(false); continue; }
        const a = e.f.anims[fr[0]], row = s.getData("row") as number;
        s.setFrame(`${row}_${a.col + fr[1]}`).setVisible(true).setPosition(Math.round(x), Math.round(y));
        // нижний слой — под юнитами, верхний и одиночный (факел, поджог, волна) — над юнитами у этой точки
        s.setDepth(row === 0 && e.f.rows >= 2 && !e.follow ? DEPTH.ground + 9 : y + 2);
      }
      return true;
    });
  }

  /** Кадр босса: гибель, умение, атака, ходьба или покой. */
  private drive(v: UnitView, now: number) {
    const def = zbDef(v.u.sprite);
    if (!def || !v.sprite.scene) return;
    const sp = v.sprite, u = v.u;
    let st = this.seen.get(v);
    if (!st) { st = { aseq: u.aseq, atk: -1e9, dead: v.dead ? -1e9 : 0 }; this.seen.set(v, st); }
    let row = rowOf(u.dir), flip = u.dir === Dir.Left;
    let anim = "idle", i = 0;
    const loopI = (a: A, t0: number) => Math.floor(((now - t0) / 1000) * a.fps) % a.n;
    const oneI = (a: A, t0: number) => Math.min(a.n - 1, Math.floor(((now - t0) / 1000) * a.fps));
    if (v.dead) {
      if (!st.dead) st.dead = now;
      anim = "death";
      i = oneI(def.anims.death, st.dead);
      this.tls.delete(v.id);
    } else {
      st.dead = 0;
      if (u.aseq !== st.aseq) { st.aseq = u.aseq; st.atk = now; }
      const list = this.tls.get(v.id);
      let fr: [string, number] | null = null, turn = false;
      if (list) {
        for (let k = list.length - 1; k >= 0 && !fr; k--) {
          const tl = list[k];
          if (now >= tl.end) continue;
          fr = frameAt(def.anims, tl.segs, now);
          turn = tl.turn;
        }
        if (list.every((t) => now >= t.end)) this.tls.delete(v.id);
      }
      if (fr) {
        [anim, i] = fr;
        if (turn) { if (row === 0) row = 1; else if (row === 1) row = 0; else flip = !flip; }
      } else if (now - st.atk < (def.anims.attack.n / def.anims.attack.fps) * 1000) {
        anim = "attack";
        i = oneI(def.anims.attack, st.atk);
      } else if (u.anim === Anim.Walk && !u.mount) {
        anim = "walk";
        i = loopI(def.anims.walk, 0);
      } else i = loopI(def.anims.idle, 0);
    }
    const a = def.anims[anim] ?? def.anims.idle;
    if (sp.anims.isPlaying) sp.anims.stop();
    sp.setFrame(row * def.cols + a.col + i).setFlipX(flip);
    this.ambient(v, def, now);
  }

  /** Светлячки древня, туман и огоньки Мглогляда — облёт кодом в целых пикселях. */
  private ambient(v: UnitView, def: ZbDef, now: number) {
    if (!def.motes && !def.fog) return;
    let list = this.parts.get(v);
    const s = this.scene, t = now / 1000;
    if (!list) {
      list = [];
      if (def.motes && s.textures.exists(fxKey(v.u.sprite, "_motes"))) for (let k = 0; k < def.motes.orbits.length; k++) list.push(s.add.image(0, 0, fxKey(v.u.sprite, "_motes"), "m0").setData("k", `m${k}`));
      if (def.fog && s.textures.exists(fxKey(v.u.sprite, "_fog"))) {
        for (let k = 0; k < def.fog.wisps.length; k++) list.push(s.add.image(0, 0, fxKey(v.u.sprite, "_fog"), `w${def.fog.wisps[k].frame}`).setData("k", `w${k}`));
        for (let k = 0; k < def.fog.motes.length; k++) list.push(s.add.image(0, 0, fxKey(v.u.sprite, "_fog"), "m0").setData("k", `f${k}`));
      }
      this.parts.set(v, list);
    }
    const bx = Math.round(v.x), by = Math.round(v.y), vis = !v.dead && v.sprite.visible;
    for (const im of list) {
      const key = im.getData("k") as string, k = Number(key.slice(1));
      im.setVisible(vis);
      if (!vis) continue;
      if (key[0] === "m" && def.motes) {
        const o = def.motes.orbits[k], a = (t / o.period) * Math.PI * 2 + o.phase;
        im.setFrame(`m${Math.floor(t * def.motes.fps + k) % def.motes.frames}`).setPosition(bx + Math.round(o.c[0] + Math.cos(a) * o.r[0]), by + Math.round(o.c[1] + Math.sin(a) * o.r[1])).setDepth(v.y + 1);
      } else if (key[0] === "f" && def.fog) {
        const o = def.fog.motes[k], a = (t / o.period) * Math.PI * 2 + o.phase;
        im.setFrame(`m${Math.floor(t * def.fog.mote.fps + k) % def.fog.mote.frames}`).setPosition(bx + Math.round(o.c[0] + Math.cos(a) * o.r[0]), by + Math.round(o.c[1] + Math.sin(a) * o.r[1])).setDepth(v.y + 1);
      } else if (key[0] === "w" && def.fog) {
        const o = def.fog.wisps[k], a = (t / o.period) * Math.PI * 2 + o.phase, sy = Math.sin(a);
        im.setPosition(bx + Math.round(Math.cos(a) * o.r[0]), by - o.lift + Math.round(sy * o.r[1])).setDepth(sy > 0 ? v.y + 0.5 : v.y - 0.5);
      }
    }
  }

  /** UnitView уничтожен (ушёл из вида): частицы — вместе с ним. */
  drop(v: UnitView) {
    for (const im of this.parts.get(v) ?? []) im.destroy();
    this.parts.delete(v);
    this.seen.delete(v);
  }

  destroy() {
    this.scene.events.off("postupdate", this.tick);
    for (const e of this.fxs) for (const s of e.spr) s.destroy();
    this.fxs = [];
    for (const v of [...this.parts.keys()]) this.drop(v);
  }
}

/** Один на сцену: UnitView снимает частицы через него при уничтожении. */
export let zbFx: ZoneBossFx | null = null;
export function zbAttach(fx: ZoneBossFx | null) { zbFx = fx; }
