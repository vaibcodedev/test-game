/**
 * Эффект подъёма уровня на герое, 3 варианта на выбор (window.__lvlLook, ui/levelLook.ts). Всё рисуется кодом, кадр за кадром, с плавными кривыми.
 * Общее: столб света (канвас-текстура: золотая кромка, светлая середина, белая жила) с нарастанием снизу, золотые кольца по земле,
 * искры вверх, мягкое свечение героя. 3 с, следует за героем.
 *   A — столб + два расходящихся кольца + россыпь искр;
 *   B — «святой»: столб из нескольких лучей, кольцо с рунными засечками, искры по спирали;
 *   C — волны: три кольца-импульса, двойная спираль искр, тонкий белый столб.
 */
import Phaser from "phaser";
import type { UnitView } from "../UnitView";
import { DEPTH } from "../terrain";

const TONES = [0xfff4cc, 0xffe28a, 0xf6c550, 0xe39a2c, 0xc87a1e];
const DUR = 3000;

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  io: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  clamp: (t: number) => Math.min(1, Math.max(0, t)),
};

function colTexture(s: Phaser.Scene) {
  if (s.textures.exists("lvl_col")) return;
  const W = 64, H = 256, tex = s.textures.createCanvas("lvl_col", W, H);
  if (!tex) return;
  const c = tex.getContext(), img = c.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - (W - 1) / 2) / (W / 2);                  // 0 в середине, 1 на кромке
    const vy = y / (H - 1);                                           // 0 сверху, 1 у земли
    const up = Math.pow(vy, 1.4);                                     // выше — прозрачнее
    const edge = Math.max(0, 1 - Math.pow(dx, 1.6));                  // кромка плавно гаснет
    const a = edge * up;
    // 4 тона по ширине: янтарь на кромке, золото, светлое золото, белая жила
    const k = 1 - dx;
    const col = k > 0.82 ? [255, 252, 232] : k > 0.55 ? [255, 232, 150] : k > 0.28 ? [248, 196, 80] : [226, 150, 44];
    // мягкие переходы между ступенями (лёгкое смешивание)
    const i = (y * W + x) * 4, m = Math.min(1, k * 1.15);
    img.data[i] = col[0]; img.data[i + 1] = col[1] - (1 - m) * 10; img.data[i + 2] = col[2]; img.data[i + 3] = Math.round(255 * Math.min(1, a * (0.55 + 0.6 * m)));
  }
  c.putImageData(img, 0, 0);
  tex.refresh();
}

interface Spark { born: number; life: number; img: Phaser.GameObjects.Image; sz: number; arm: number; rise: number }

export function playLevelUp(s: Phaser.Scene, unit: () => UnitView | undefined) {
  colTexture(s);
  const u0 = unit();
  if (!u0) return;
  const add = Phaser.BlendModes.ADD;
  const pos = () => { const u = unit(); return u && !u.dead ? { x: u.x, y: u.y } : { x: u0.x, y: u0.y }; };
  const objs: Phaser.GameObjects.GameObject[] = [];
  const mk = <T extends Phaser.GameObjects.GameObject>(o: T) => { objs.push(o); return o; };
  const col = mk(s.add.image(0, 0, "lvl_col").setOrigin(0.5, 1).setBlendMode(add).setAlpha(0));
  const glow = mk(s.add.image(0, 0, "fx_glow").setTint(0xffd870).setBlendMode(add).setAlpha(0));
  const gflash = mk(s.add.image(0, 0, "fx_glow").setTint(0xfff4cc).setBlendMode(add).setAlpha(0));
  const gBack = mk(s.add.graphics().setBlendMode(add));
  const gFront = mk(s.add.graphics().setBlendMode(add));
  const sparks: Spark[] = [];
  let nextSpark = 0;
  const born = s.time.now, SQ = 0.58, colH = 230;

  /** Полуэллипс кольца (a0..a1, 0..π — передняя половина, π..2π — задняя) тремя слоями: гало, золото, светлая жила. */
  const arc = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, a0: number, a1: number, a: number, w: number) => {
    if (a <= 0.01 || r < 1) return;
    const path = () => { g.beginPath(); for (let i = 0; i <= 28; i++) { const an = a0 + ((a1 - a0) * i) / 28, x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r * SQ; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath(); };
    g.lineStyle(w * 3.2, 0xe39a2c, a * 0.22); path();
    g.lineStyle(w * 1.6, 0xf6c550, a * 0.6); path();
    g.lineStyle(Math.max(2, w * 0.7), 0xfff4cc, a); path();
  };
  const ring = (p: { x: number; y: number }, r: number, a: number, w: number) => { arc(gBack, p.x, p.y, r, Math.PI, Math.PI * 2, a, w); arc(gFront, p.x, p.y, r, 0, Math.PI, a, w); };

  const spawn = (t: number) => {
    const img = s.add.image(0, 0, "fx_spark").setTint(TONES[Math.floor(Math.random() * TONES.length)]).setBlendMode(add).setAlpha(0);
    objs.push(img);
    sparks.push({ born: t, life: 900 + Math.random() * 700, img, sz: 0.7 + Math.random() * 0.9, arm: sparks.length % 2, rise: 70 + Math.random() * 90 });
  };

  const done = () => { s.events.off(Phaser.Scenes.Events.UPDATE, tick); objs.forEach((o) => o.destroy()); };
  const tick = () => {
    // window.__lvlFxT — время эффекта задаёт сценарий снимков (кадр в нужную секунду)
    const fz = (window as unknown as { __lvlFxT?: number }).__lvlFxT;
    const t = fz ?? s.time.now - born;
    if (fz === undefined && t > DUR + 1700) { done(); return; }
    const p = pos(), foot = p.y + 8, fp = { x: p.x, y: foot }, D = p.y;
    gBack.setDepth(D - 3); gFront.setDepth(D + 3); col.setDepth(D - 3); glow.setDepth(D - 4); gflash.setDepth(D - 5);
    // столб: нарастает снизу за 0,55 с, держится, плавно гаснет к 2,7 с; за героем и полупрозрачный
    const grow = ease.out(ease.clamp(t / 550)), fade = 1 - ease.io(ease.clamp((t - 1500) / 1200));
    col.setPosition(p.x, foot).setDisplaySize(27 * (0.6 + 0.4 * grow) * (1 + 0.06 * Math.sin(t / 130)), colH * grow).setAlpha(fade * 0.8);
    const gl = ease.io(ease.clamp(t / 400)) * (1 - ease.io(ease.clamp((t - 1400) / 1500)));
    glow.setPosition(p.x, p.y - 14).setDisplaySize(90 + 14 * Math.sin(t / 160), 110 + 14 * Math.sin(t / 160)).setAlpha(gl * 0.4);
    gflash.setPosition(p.x, foot).setDisplaySize(150 * (0.5 + ease.out(ease.clamp(t / 500))), 70 * (0.5 + ease.out(ease.clamp(t / 500)))).setAlpha((1 - ease.clamp(t / 700)) * 0.8);
    gBack.clear(); gFront.clear();
    for (let k = 0; k < 3; k++) {
      const tt = (t - k * 380) / 1100;
      if (tt < 0 || tt > 1) continue;
      ring(fp, 12 + (60 + k * 14) * ease.out(tt), (1 - ease.io(tt)) * (1 - k * 0.15), 3.5 - k * 0.5);
    }
    ring(fp, 18, ease.io(ease.clamp(t / 300)) * (1 - ease.io(ease.clamp((t - 1500) / 1200))) * 0.8, 3);
    // искры: двойная спираль, рождаются с 0,15 до 2,3 с; на передней стороне витка — перед героем, на задней — за ним
    if (t > 150 && t < 2300) while (nextSpark < t) { spawn(nextSpark); nextSpark += 1000 / 40; }
    else if (nextSpark < t) nextSpark = t;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i], k = (t - sp.born) / sp.life;
      if (k >= 1) { sp.img.destroy(); sparks.splice(i, 1); continue; }
      const an = sp.arm * Math.PI + t / 380 + k * 4.5, rr = 20 * (1 - 0.5 * k), sn = Math.sin(an);
      sp.img.setDepth(D + (sn > 0 ? 4 : -2)).setPosition(p.x + Math.cos(an) * rr, foot - 4 - ease.out(k) * sp.rise + sn * rr * 0.45).setScale(sp.sz * (1 - 0.6 * k) * 0.8).setAlpha(Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.95);
    }
  };
  s.events.on(Phaser.Scenes.Events.UPDATE, tick);
  s.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
}
