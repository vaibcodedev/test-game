/**
 * Трибуны и толпа арены. Статика (песок, стена, ступени, колоннада, жаровни) — одна запечённая картинка
 * client/public/assets/arena/<карта>.png (tools/gen/arena-install.ts), грузится при входе в матч. Зрители (сотни) — один Blitter
 * (один батч), кадры фигурок рисуются на холсте при старте из shared/arenaCrowd.ts. Анимация лёгкая: покачивание и вставание
 * обновляют по 1/6 зрителей за кадр; овации — волна по кругу, руки вверх, флажки, подброшенные шапки на событиях боя
 * (старт, первая кровь, крит, убийство, победа). Реплики — крошечные пузыри над зрителями (data/arena-crowd.json), не больше 3 сразу.
 * В «Простых» эффектах толпа стоит без анимации. Гул и рёв — procedural sfx.ts.
 */
import Phaser from "phaser";
import { CROWD_TYPES, POSES, drawSpectator, lookOfType, type ArenaId } from "../../../shared/arenaCrowd";
import type { ArenaEvMsg } from "../../../shared/arena";
import { P } from "../../../shared/palette";
import crowdData from "../../../data/arena-crowd.json";
import type { Net } from "../net";
import { crowdHum, play } from "./sfx";
import { vfxFull } from "./postfx";
import { RopeCloth } from "./fx/ropeCloth";
import { DEPTH } from "./terrain";

const CW = 13, CH = 20, FX = 6, FY = 17; // ячейка кадра и точка ног
type Kind = "start" | "first" | "crit" | "kill" | "win" | "draw" | "idle";
interface Lines { [k: string]: string[] }
const DATA = crowdData as unknown as { limits: { maxAtOnce: number; idleEveryMs: [number, number]; burstEveryMs: [number, number]; lifeMs: number }; lines: Record<string, Lines> };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

interface Spec { x: number; y: number; type: number; ring: number; ang: number; base: number; bob: Phaser.GameObjects.Bob | null; pose: number; until: number; sway: number; nextSway: number; hold: number }
interface Hat { bob: Phaser.GameObjects.Bob; x: number; y: number; vx: number; vy: number; t: number }
interface Mote { bob: Phaser.GameObjects.Bob; x: number; y: number; vx: number; vy: number; ph: number }
interface ArenaData { s: number[][]; standing?: number; lights?: number[][]; banners?: number[][]; look?: { accent: string; trim: string; emblem: string } }
interface Tip { box: Phaser.GameObjects.Container; txt: Phaser.GameObjects.Text; gfx: Phaser.GameObjects.Graphics; born: number; life: number; x: number; y: number; on: boolean }

export class ArenaCrowd {
  private spec: Spec[] = [];
  private blit: Phaser.GameObjects.Blitter | null = null;
  private hatBlit: Phaser.GameObjects.Blitter | null = null;
  private bg: Phaser.GameObjects.Image | null = null;
  private hats: Hat[] = [];
  private tips: Tip[] = [];
  private cursor = 0;
  private now = 0;
  private ovationUntil = 0;
  private ovationFlags = 0;
  private wave: { t0: number; dur: number; dir: number }[] = [];
  private hasMotion = false;
  private phase = "";
  private nextIdle = 0;
  private burst: { at: number; kind: Kind; name?: string }[] = [];
  private hum = 0;
  private swell = 0;
  private winnerName: string | undefined;
  private glows: { img: Phaser.GameObjects.Image; a: number; ph: number; flick: boolean }[] = [];
  private ropes: RopeCloth | null = null;
  private flags: Phaser.GameObjects.Sprite[] = [];
  private motes: Mote[] = [];
  private moteBlit: Phaser.GameObjects.Blitter | null = null;
  private offs: (() => void)[] = [];
  private dead = false;
  private standing = 0.2;

  constructor(private scene: Phaser.Scene, private net: Net, readonly id: ArenaId) {
    this.offs.push(
      net.on("arena:ev", (m: ArenaEvMsg) => this.onEvent(m)),
      net.on("fx", (list) => { for (const f of list) if (f.t === "dmg" && f.crit && !f.heal && !f.miss) this.crit(); }),
    );
    this.load();
  }

  private load() {
    const s = this.scene, bgKey = `arena_bg_${this.id}`, jKey = `arena_crowd_${this.id}`;
    if (s.textures.exists(bgKey) && s.cache.json.exists(jKey)) return this.build();
    s.load.image(bgKey, `/assets/arena/${this.id}.png`);
    s.load.json(jKey, `/assets/arena/${this.id}.json`);
    s.load.once(Phaser.Loader.Events.COMPLETE, () => { if (!this.dead) this.build(); });
    s.load.start();
  }

  private frames(): string {
    const s = this.scene, key = `arena_sheet_${this.id}`;
    if (s.textures.exists(key)) return key;
    const tex = s.textures.createCanvas(key, CROWD_TYPES * CW, (POSES + 1) * CH)!, g = tex.getContext();
    const css = (c: number[]) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;
    const sink = (ox: number, oy: number) => ({
      rect: (x: number, y: number, w: number, h: number, c: number[]) => { g.fillStyle = css(c); g.fillRect(ox + x, oy + y, w, h); },
      set: (x: number, y: number, c: number[]) => { g.fillStyle = css(c); g.fillRect(ox + x, oy + y, 1, 1); },
    });
    for (let t = 0; t < CROWD_TYPES; t++) {
      for (let p = 0; p < POSES; p++) {
        drawSpectator(sink(t * CW, p * CH) as never, FX, FY, lookOfType(t), this.id, p, 3);
        tex.add(`${t}_${p}`, 0, t * CW, p * CH, CW, CH);
      }
    }
    // подброшенные шапки и цветы: 4 кадра 3×2 в нижней строке
    const hatCols = ["#c8302e", "#e8a23a", "#2f5fb0", "#f2efe6"];
    hatCols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 4, POSES * CH, 3, 2); tex.add(`hat${i}`, 0, i * 4, POSES * CH, 3, 2); });
    tex.refresh();
    return key;
  }

  private build() {
    const s = this.scene, bgKey = `arena_bg_${this.id}`, d = s.cache.json.get(`arena_crowd_${this.id}`) as ArenaData | undefined;
    if (!s.textures.exists(bgKey) || !d) return;
    this.bg = s.add.image(0, 0, bgKey).setOrigin(0, 0).setDepth(DEPTH.ground - 60);
    this.standing = d.standing ?? 0.2;
    const sheet = this.frames();
    this.blit = s.add.blitter(0, 0, sheet).setDepth(DEPTH.ground - 50);
    this.hatBlit = s.add.blitter(0, 0, sheet).setDepth(DEPTH.top - 6);
    for (const [x, y, type, ring, ang] of d.s) {
      const base = ((x * 7 + y * 13) % 100) / 100 < this.standing ? 1 : 0;
      this.spec.push({ x, y, type, ring, ang: (ang * Math.PI) / 180, base, bob: null, pose: base, until: 0, sway: 0, nextSway: rnd(0, 1500), hold: 0 });
    }
    for (const q of this.spec) q.bob = this.blit.create(q.x - FX, q.y - FY, `${q.type}_${q.base}`);
    for (let i = 0; i < DATA.limits.maxAtOnce; i++) this.tips.push(this.makeTip());
    this.lightsAndBanners(d);
    this.makeMotes();
  }

  /** Тёплые ореолы жаровен и факелов (ADD, мерцание), стяги на Rope (fx/ropeCloth.ts; в «Простых» — неподвижные). */
  private lightsAndBanners(d: ArenaData) {
    const s = this.scene, full = vfxFull();
    const gw = s.textures.exists("fx_glow") ? s.textures.getFrame("fx_glow").width : 64;
    for (const [x, y, col, r, a, glow] of d.lights ?? []) {
      if (!glow) continue;
      const img = s.add.image(x, y, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale((r * 2.4) / gw).setAlpha(a * 0.7).setDepth(DEPTH.ground - 40);
      this.glows.push({ img, a: a * 0.7, ph: Math.random() * 6, flick: true });
    }
    const look = d.look ?? { accent: "#a8262c", trim: "#e0b64a", emblem: "skull" };
    if (full) this.ropes = new RopeCloth(s);
    for (const [x, y, len] of d.banners ?? []) {
      const key = `arena_pennant_${this.id}_${len}`;
      if (!s.textures.exists(key)) this.pennantTexture(key, len, look);
      const sp = s.add.sprite(x, y, key).setOrigin(0.5, 0).setDepth(DEPTH.ground - 38);
      this.flags.push(sp);
      if (this.ropes) this.ropes.mirror(sp);
    }
  }
  private pennantTexture(key: string, len: number, look: { accent: string; trim: string; emblem: string }) {
    const c = document.createElement("canvas"); c.width = 14; c.height = len + 4;
    const g = c.getContext("2d")!, shadeC = (hex: string, k: number) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, ((n >> 16) & 255) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`; };
    g.fillStyle = "#2a2218"; g.fillRect(0, 0, 14, 2); g.fillStyle = look.trim; g.fillRect(0, 0, 14, 1);
    for (let y = 2; y < len; y++) { g.fillStyle = y % 5 === 0 ? shadeC(look.accent, 0.88) : look.accent; g.fillRect(1, y, 12, 1); g.fillStyle = shadeC(look.accent, 0.7); g.fillRect(1, y, 2, 1); g.fillRect(11, y, 2, 1); }
    g.fillStyle = look.trim; for (let x = 1; x < 13; x += 2) g.fillRect(x, len, 1, 3);
    const my = len >> 1; g.fillStyle = look.emblem === "skull" ? "#e8d8c0" : look.trim;
    if (look.emblem === "skull") { g.fillRect(5, my - 4, 4, 4); g.fillRect(6, my, 2, 2); g.fillStyle = "#1a1018"; g.fillRect(6, my - 3, 1, 1); g.fillRect(8, my - 3, 1, 1); }
    else if (look.emblem === "ice") { for (let i = 0; i < 4; i++) g.fillRect(7 - i, my - 3 + i, 1 + i * 2, 1), g.fillRect(7 - i, my + 3 - i, 1 + i * 2, 1); }
    else if (look.emblem === "fang") { g.fillRect(4, my - 4, 2, 6); g.fillRect(8, my - 4, 2, 6); g.fillRect(5, my + 2, 1, 2); g.fillRect(9, my + 2, 1, 2); }
    else { g.fillRect(6, my - 5, 2, 8); g.fillRect(3, my - 2, 8, 2); }
    this.scene.textures.addCanvas(key, c);
  }

  /** Пыль, искры, снег: ≤ 80 пылинок в одном Blitter, дрейфуют в пределах камеры; в «Простых» нет. */
  private makeMotes() {
    if (!vfxFull()) return;
    const s = this.scene, key = `arena_motes_${this.id}`, cols: Record<string, string[]> = {
      ash: ["#ff8a3a", "#ffc060", "#ff5a2a"], sun: ["#fff0b0", "#ffe8a0", "#ffffff"], pit: ["#ff9a40", "#ffc870", "#c89a6a"], frost: ["#ffffff", "#d8f0ff", "#bfe6ff"],
    };
    if (!s.textures.exists(key)) {
      const tex = s.textures.createCanvas(key, 12, 3)!, g = tex.getContext();
      cols[this.id].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 4, 0, 2, 2); tex.add(`m${i}`, 0, i * 4, 0, 2, 2); });
      tex.refresh();
    }
    this.moteBlit = s.add.blitter(0, 0, key).setDepth(DEPTH.top - 8);
    const n = this.id === "frost" ? 80 : this.id === "sun" ? 50 : 64, cam = s.cameras.main.worldView;
    for (let i = 0; i < n; i++) {
      const m: Mote = { bob: this.moteBlit.create(0, 0, `m${i % 3}`), x: cam.x + Math.random() * cam.width, y: cam.y + Math.random() * cam.height, vx: 0, vy: 0, ph: Math.random() * 6 };
      this.resetMote(m, false);
      this.motes.push(m);
    }
  }
  private resetMote(m: Mote, edge: boolean) {
    const cam = this.scene.cameras.main.worldView, id = this.id;
    const rise = id === "ash" || id === "pit", fall = id === "frost";
    m.vy = rise ? -rnd(12, 30) : fall ? rnd(10, 26) : rnd(-4, 4);
    m.vx = id === "sun" ? rnd(4, 10) : fall ? rnd(-8, 4) : rnd(-5, 5);
    m.x = cam.x + Math.random() * cam.width;
    m.y = edge ? (rise ? cam.bottom + 4 : fall ? cam.y - 4 : cam.y + Math.random() * cam.height) : cam.y + Math.random() * cam.height;
  }

  private makeTip(): Tip {
    const gfx = this.scene.add.graphics();
    const txt = this.scene.add.text(0, 0, "", { fontFamily: "Rubik, sans-serif", fontSize: "6px", fontStyle: "600", color: "#f6e8c4" }).setOrigin(0.5, 0.5).setResolution(4);
    const box = this.scene.add.container(0, 0, [gfx, txt]).setDepth(DEPTH.top - 5).setVisible(false);
    return { box, txt, gfx, born: 0, life: 0, x: 0, y: 0, on: false };
  }

  // ---------- события ----------
  private onEvent(m: ArenaEvMsg) {
    if (m.k === "first") this.react("first");
    else if (m.k === "kill") this.react("kill", m.name);
    else if (m.k === "win") { this.winnerName = m.name; this.react("win", m.name); }
    else this.react("draw");
  }
  private lastCrit = 0;
  private crit() {
    const t = performance.now();
    if (t - this.lastCrit < 1400) return;
    this.lastCrit = t;
    this.react("crit");
  }
  /** Реакция толпы: звук, овация (или волна), реплики. */
  private react(kind: Kind, name?: string) {
    const now = performance.now();
    this.swell = kind === "win" ? 1 : kind === "kill" || kind === "first" ? 0.7 : kind === "start" ? 0.8 : 0.35;
    if (kind === "draw") play("boo", 0.8);
    else play(kind === "crit" ? "cheer" : "roar", kind === "crit" ? 0.5 : kind === "win" ? 1 : 0.8);
    if (vfxFull() && this.blit) {
      if (kind === "start") { this.addWave(2600, 1); this.ovation(now, 1800, 0.25); this.toss(14); }
      else if (kind === "first") { this.ovation(now, 2000, 0.3); this.toss(10); }
      else if (kind === "crit") this.addWave(1600, Math.random() < 0.5 ? 1 : -1);
      else if (kind === "kill") { this.ovation(now, 3200, 0.4); this.toss(22); this.addWave(2400, -1); }
      else if (kind === "win") { this.ovation(now, 8000, 0.6); this.toss(40); this.addWave(2600, 1); this.addWave(2600, -1); setTimeout(() => this.toss(30), 1800); }
    }
    const lines = DATA.lines[this.id]?.[kind] ?? [];
    const n = kind === "crit" ? 1 : kind === "win" ? 3 : 2;
    for (let i = 0; i < n; i++) this.burst.push({ at: now + i * rnd(...DATA.limits.burstEveryMs), kind, name: lines.length ? name : undefined });
  }
  private addWave(dur: number, dir: number) { this.wave.push({ t0: performance.now(), dur, dir }); this.hasMotion = true; }
  private ovation(now: number, dur: number, flags: number) { this.ovationUntil = now + dur; this.ovationFlags = flags; this.hasMotion = true; }
  /** Подбросить шапки и цветы: короткие дуги над зрителями. */
  private toss(n: number) {
    if (!this.hatBlit || !this.spec.length) return;
    for (let i = 0; i < n && this.hats.length < 56; i++) {
      const q = this.spec[Math.floor(Math.random() * this.spec.length)];
      const bob = this.hatBlit.create(q.x - 1, q.y - 12, `hat${Math.floor(Math.random() * 4)}`);
      this.hats.push({ bob, x: q.x - 1, y: q.y - 12, vx: rnd(-14, 14), vy: rnd(-70, -42), t: rnd(0, 0.4) });
    }
  }

  // ---------- кадр ----------
  update(dtSec: number) {
    if (!this.blit || this.dead) return;
    const dt = Math.min(0.1, dtSec), now = performance.now();
    this.now = now;
    const st = (this.net.room?.state as { phase?: string } | undefined)?.phase ?? "";
    if (st !== this.phase) { if (st === "fight" && this.phase === "countdown") this.react("start"); this.phase = st; }
    this.hum -= dt;
    if (this.hum <= 0) { this.hum = 0.25; crowdHum(true, this.swell); this.swell = Math.max(0, this.swell - 0.07); }
    this.tipsUpdate(now);
    if (!vfxFull()) return; // «Простые»: толпа стоит без анимации
    this.ropes?.update(dt * 1000);
    for (const g of this.glows) g.img.setAlpha(g.a * (0.82 + 0.18 * Math.sin(now * 0.009 + g.ph) + 0.06 * Math.sin(now * 0.023 + g.ph * 2)));
    if (this.motes.length) {
      const cam = this.scene.cameras.main.worldView;
      for (const m of this.motes) {
        m.x += (m.vx + Math.sin(now * 0.0016 + m.ph) * 6) * dt; m.y += m.vy * dt;
        if (m.x < cam.x - 6 || m.x > cam.right + 6 || m.y < cam.y - 8 || m.y > cam.bottom + 8) this.resetMote(m, true);
        m.bob.x = m.x; m.bob.y = m.y;
      }
    }
    // шапки
    for (let i = this.hats.length - 1; i >= 0; i--) {
      const h = this.hats[i];
      h.t += dt; h.vy += 150 * dt; h.x += h.vx * dt; h.y += h.vy * dt;
      h.bob.x = h.x; h.bob.y = h.y;
      if (h.t > 1.5) { h.bob.destroy(); this.hats.splice(i, 1); }
    }
    this.wave = this.wave.filter((w) => now - w.t0 < w.dur + 400);
    const active = this.now < this.ovationUntil || this.wave.length > 0;
    const N = this.spec.length;
    if (active || this.hasMotion) {
      // овация или волна: просчитываем всех
      const flagsOn = this.ovationFlags;
      for (let i = 0; i < N; i++) {
        const q = this.spec[i];
        let want = q.base;
        if (now < this.ovationUntil) {
          const delay = ((i * 37) % 100) * 6;
          want = (i % 100) / 100 < flagsOn ? (Math.floor(now / 180 + i) & 1 ? 3 : 4) : 2;
          if (now > this.ovationUntil - 600 - delay) want = q.base ? 1 : q.base;
        }
        for (const w of this.wave) {
          const k = (now - w.t0) / w.dur, front = w.dir * (k * Math.PI * 2) - Math.PI;
          let d = q.ang - front; d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 0.45) want = 2;
        }
        this.setPose(q, want);
      }
      if (!active) this.hasMotion = false;
      return;
    }
    // покой: покачивание и редкое вставание; по 1/6 зрителей за кадр
    const per = Math.ceil(N / 6);
    for (let n = 0; n < per; n++) {
      const q = this.spec[this.cursor]; this.cursor = (this.cursor + 1) % N;
      if (now < q.nextSway) continue;
      q.nextSway = now + rnd(700, 2200);
      if (q.pose >= 2 && now >= q.until) this.setPose(q, q.base);
      else if (q.pose < 2 && Math.random() < 0.006) { this.setPose(q, 3 + (Math.random() < 0.5 ? 0 : 1)); q.until = now + rnd(1500, 3200); q.nextSway = now + 220; }
      else if (q.pose >= 3 && now < q.until) { this.setPose(q, q.pose === 3 ? 4 : 3); q.nextSway = now + 220; }
      else if (q.pose < 2) { q.sway = q.sway ? 0 : 1; if (q.bob) q.bob.y = q.y - FY - q.sway; }
    }
  }
  private setPose(q: Spec, pose: number) {
    if (q.pose === pose || !q.bob) return;
    q.pose = pose;
    q.bob.setFrame(`${q.type}_${pose}`);
  }

  // ---------- реплики ----------
  private tipsUpdate(now: number) {
    const cam = this.scene.cameras.main.worldView;
    for (const t of this.tips) {
      if (!t.on) continue;
      const age = now - t.born;
      if (age > t.life) { t.on = false; t.box.setVisible(false); continue; }
      const a = Math.min(1, age / 140, (t.life - age) / 260);
      t.box.setAlpha(a).setPosition(t.x, t.y - Math.min(3, age / 400));
    }
    // очередные реплики после событий
    if (this.burst.length && now >= this.burst[0].at) { const b = this.burst.shift()!; this.say(b.kind, b.name, cam); }
    if (now >= this.nextIdle) {
      this.nextIdle = now + rnd(...DATA.limits.idleEveryMs);
      if (this.phase === "fight" && !this.burst.length) this.say("idle", undefined, cam);
    }
  }
  private say(kind: Kind, name: string | undefined, cam: Phaser.Geom.Rectangle) {
    if (!this.spec.length) return;
    const tip = this.tips.find((t) => !t.on);
    if (!tip) return;
    let lines = DATA.lines[this.id]?.[kind] ?? [];
    lines = lines.filter((l) => !l.includes("{name}") || !!name);
    if (!lines.length) return;
    const text = lines[Math.floor(Math.random() * lines.length)].replace("{name}", name ?? "");
    // зритель в кадре и не рядом с другой репликой
    let q: Spec | null = null;
    for (let i = 0; i < 24 && !q; i++) {
      const c = this.spec[Math.floor(Math.random() * this.spec.length)];
      if (c.x < cam.x + 12 || c.x > cam.right - 12 || c.y < cam.y + 14 || c.y > cam.bottom - 6) continue;
      if (this.tips.some((t) => t.on && Math.hypot(t.x - c.x, t.y - c.y) < 40)) continue;
      q = c;
    }
    if (!q) return;
    tip.txt.setText(text);
    const w = Math.ceil(tip.txt.width) + 5, h = 9;
    tip.gfx.clear().fillStyle(hex(P.card), 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 2).lineStyle(1, hex(P.gold), 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 2)
      .fillStyle(hex(P.gold), 0.85).fillTriangle(-1.5, h / 2, 1.5, h / 2, 0, h / 2 + 2.5);
    tip.x = q.x; tip.y = q.y - 20; tip.born = this.now || performance.now(); tip.life = DATA.limits.lifeMs; tip.on = true;
    tip.box.setVisible(true).setAlpha(0).setPosition(tip.x, tip.y);
  }

  destroy() {
    this.dead = true;
    for (const o of this.offs) o();
    this.offs = [];
    crowdHum(false);
    this.bg?.destroy(); this.blit?.destroy(); this.hatBlit?.destroy(); this.moteBlit?.destroy();
    this.ropes?.destroy(); this.ropes = null;
    for (const f of this.flags) f.destroy();
    for (const g of this.glows) g.img.destroy();
    this.flags = []; this.glows = []; this.motes = [];
    for (const t of this.tips) t.box.destroy();
    this.tips = []; this.hats = []; this.spec = [];
  }
}
