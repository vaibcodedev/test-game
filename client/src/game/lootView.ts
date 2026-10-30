/**
 * Добыча на земле: лист objects/loot_r{редкость}[_boss].png (tools/gen/loot.ts) — 20 кадров в строку:
 * 0..9 падение с отскоком (один раз), 10..19 покой; у редких в покое мерцание (ореол, блик, звёздочки).
 */
import Phaser from "phaser";
import type { LootBag } from "../../../shared/protocol";
import * as sfx from "./sfx";

const FRAMES = 20, DROP = 10;

function ensure(scene: Phaser.Scene, key: string) {
  const tex = scene.textures.get(key);
  if (!tex.has("0")) {
    const src = tex.getSourceImage() as HTMLImageElement;
    const fw = Math.floor(src.width / FRAMES), fh = src.height;
    for (let i = 0; i < FRAMES; i++) tex.add(String(i), 0, i * fw, 0, fw, fh);
  }
  if (!scene.anims.exists(`${key}_drop`)) {
    const fr = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => ({ key, frame: String(a + i) }));
    scene.anims.create({ key: `${key}_drop`, frames: fr(0, DROP), frameRate: 22, repeat: 0 });
    scene.anims.create({ key: `${key}_idle`, frames: fr(DROP, FRAMES), frameRate: 9, repeat: -1 });
  }
}

/** Спрайт мешка в точке b (нижняя середина = земля): падение, затем покой с мерцанием. */
export function spawnLoot(scene: Phaser.Scene, b: LootBag): Phaser.GameObjects.Sprite {
  const best = Math.max(0, Math.min(3, ...b.items.map((it) => it.rarity)));
  let key = `o_loot_r${best}${b.boss ? "_boss" : ""}`;
  if (!scene.textures.exists(key)) key = `o_loot_r${best}`;
  ensure(scene, key);
  const fh = scene.textures.get(key).get("0").height;
  // в листе земля — 3-я строка снизу (G = FH - 3), её нижний край ставим в b.y
  const spr = scene.add.sprite(b.x, b.y, key, "0").setOrigin(0.5, (fh - 2) / fh).setDepth(b.y - 1).setData("rarity", best);
  spr.play(`${key}_drop`);
  spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.play(`${key}_idle`));
  lootFx(scene, spr, b, best);
  return spr;
}

// ---------- эффекты (макет tools/out/loot-volume): ореол-пульс, искры, столб света, вспышка и кольцо при выпадении ----------
const FX_RGB = [0xefe2c0, 0x5fa8ff, 0xc47bff, 0xff9a2e], GOLD = 0xffd864, MAX_SPARKS = 36;
let sparksLive = 0;
function fxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("lootfx_halo")) return;
  const mk = (k: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const t = scene.textures.createCanvas(k, w, h)!; draw(t.getContext()); t.refresh();
  };
  mk("lootfx_halo", 64, 32, (g) => { // мягкий эллипс, затухание квадратичное
    const gr = g.createRadialGradient(32, 16, 0, 32, 16, 32); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.5, "rgba(255,255,255,0.28)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); g.scale(1, 0.5); g.translate(0, 16); g.fillStyle = gr; g.fillRect(0, -16, 64, 64); g.restore();
  });
  mk("lootfx_beam", 24, 128, (g) => { // столб: яркая ось, мягкие бока, затухание вверх
    const h = g.createLinearGradient(0, 0, 24, 0); h.addColorStop(0, "rgba(255,255,255,0)"); h.addColorStop(0.5, "rgba(255,255,255,1)"); h.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = h; g.fillRect(0, 0, 24, 128);
    g.globalCompositeOperation = "destination-in";
    const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.55, "rgba(0,0,0,0.5)"); v.addColorStop(1, "rgba(0,0,0,0.95)");
    g.fillStyle = v; g.fillRect(0, 0, 24, 128);
  });
  if (!scene.textures.exists("lootfx_star")) scene.textures.generate("lootfx_star", { data: [".1.", "121", ".1."], pixelWidth: 1, palette: { 1: "#ffffff", 2: "#ffffff" } as never });
}

/** Эффекты привязаны к жизни спрайта: рисуются сами, гаснут вместе с его alpha, лишнее чистится на destroy. */
function lootFx(scene: Phaser.Scene, spr: Phaser.GameObjects.Sprite, b: LootBag, r: number) {
  fxTextures(scene);
  const boss = !!b.boss, col = r > 0 ? FX_RGB[r] : GOLD, sparkCol = boss ? GOLD : FX_RGB[r];
  const k = boss ? Math.max(r, 1) : r; // сила ореола 0..3
  const parts: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (parts.push(o), o);
  const d = spr.depth, ground = b.y;
  let halo: Phaser.GameObjects.Image | undefined, beam: Phaser.GameObjects.Image | undefined, haloA = 0, beamA = 0;
  const t0 = scene.time.now;
  if (k > 0) halo = add(scene.add.image(b.x, ground - 2, "lootfx_halo").setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(d - 0.5).setAlpha(0));
  if (r === 3) beam = add(scene.add.image(b.x, ground - 2, "lootfx_beam").setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(d + 3).setOrigin(0.5, 1).setAlpha(0).setScale(1, 0));
  // вспышка и кольцо-волна при падении (кадр касания ≈ 0,36 с)
  scene.time.delayedCall(360, () => {
    if (!spr.active) return;
    const power = 0.35 + k * 0.3 + (boss ? 0.2 : 0);
    const fl = scene.add.image(b.x, ground - 3, "lootfx_halo").setTint(boss && r < 1 ? GOLD : col).setBlendMode(Phaser.BlendModes.ADD).setDepth(d + 2).setScale(0.4).setAlpha(Math.min(1, power + 0.2));
    scene.tweens.add({ targets: fl, scale: 0.8 + k * 0.45, alpha: 0, duration: 260 + k * 40, ease: "Quad.easeOut", onComplete: () => fl.destroy() });
    const ring = scene.add.graphics().setPosition(b.x, ground - 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(d - 0.6);
    ring.lineStyle(k >= 2 ? 2 : 1, boss && r < 1 ? GOLD : col, 1).strokeEllipse(0, 0, 20, 10);
    scene.tweens.add({ targets: ring, scaleX: 1.6 + k * 0.9, scaleY: 1.6 + k * 0.9, alpha: { from: Math.min(1, 0.45 + power * 0.5), to: 0 }, duration: 420 + k * 60, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    if (beam) scene.tweens.add({ targets: beam, scaleY: { from: 0, to: 1.1 }, duration: 700, ease: "Cubic.easeOut" });
    if (halo || beam) { haloA = 0; scene.tweens.addCounter({ from: 0, to: 1, duration: 500, ease: "Sine.easeOut", onUpdate: (tw) => { haloA = tw.getValue() ?? 1; beamA = haloA; } }); }
  });
  // покой: пульс ореола, дыхание столба, искры; без кадра у камеры — не тратим ресурсы
  const sparkEvery = boss ? 380 : [0, 0, 520, 340][r] || 0;
  let nextSpark = t0 + 700;
  const update = () => {
    if (!spr.active) return;
    const now = scene.time.now, a = spr.alpha, pulse = 0.5 + 0.5 * Math.sin((now - t0) / 1000 * (1.6 + k * 0.3));
    if (halo) {
      halo.setAlpha(haloA * a * (0.5 + 0.12 * k + 0.35 * pulse));
      halo.setScale(1.1 + k * 0.3 + 0.12 * pulse);
    }
    if (beam) { beam.setAlpha(beamA * a * (0.75 + 0.2 * Math.sin((now - t0) / 1300))); beam.setScale(1.7 + 0.2 * Math.sin((now - t0) / 900), beam.scaleY) }
    if (sparkEvery && now >= nextSpark && sparksLive < MAX_SPARKS && haloA > 0.7) {
      nextSpark = now + sparkEvery * (0.7 + Math.random() * 0.6);
      const v = scene.cameras.main.worldView;
      if (b.x < v.x - 20 || b.x > v.right + 20 || ground < v.y - 20 || ground > v.bottom + 90) return;
      sparksLive++;
      const sp = scene.add.image(b.x + (Math.random() - 0.5) * 18, ground - 6 - Math.random() * 4, "lootfx_star").setTint(sparkCol).setBlendMode(Phaser.BlendModes.ADD).setDepth(d + 4).setAlpha(0);
      const dx = (Math.random() - 0.5) * 14;
      scene.tweens.add({ targets: sp, y: sp.y - 16 - Math.random() * 12, x: sp.x + dx, duration: 900 + Math.random() * 400, ease: "Sine.easeOut", onUpdate: (tw) => { const t = tw.progress; sp.setAlpha(Math.sin(Math.PI * t) * spr.alpha); sp.setScale(t > 0.35 && t < 0.65 ? 1 : 0.6); }, onComplete: () => { sparksLive--; sp.destroy(); } });
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  spr.once(Phaser.GameObjects.Events.DESTROY, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, update); for (const o of parts) o.destroy(); });
}

// ---------- подбор ----------
const RARITY_HEX = ["#efe2c0", "#5fa8ff", "#c47bff", "#ff9a2e"];
/** Пиксельные частицы подбора: монетка (тёплая) и искра-крестик цвета редкости. */
function particles(scene: Phaser.Scene, r: number) {
  if (!scene.textures.exists("loot_coin")) scene.textures.generate("loot_coin", { data: [".33.", "3221", ".11."], pixelWidth: 1, palette: { 1: "#a8681c", 2: "#e0a630", 3: "#ffd864" } as never });
  const key = `loot_spark_${r}`;
  if (r && !scene.textures.exists(key)) {
    const c = Phaser.Display.Color.HexStringToColor(RARITY_HEX[r]);
    const light = Phaser.Display.Color.Interpolate.ColorWithColor(c, new Phaser.Display.Color(255, 250, 240), 100, 50);
    const hex = (o: { r: number; g: number; b: number }) => "#" + [o.r, o.g, o.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    scene.textures.generate(key, { data: [".1.", "121", ".1."], pixelWidth: 1, palette: { 1: hex(light), 2: "#fffaf0" } as never });
  }
  return { coin: "loot_coin", spark: r ? key : "loot_coin" };
}

/**
 * Убрать добычу. Если герой рядом (подобрал он) — короткий эффект 0,4 с: сундук подпрыгивает и сплющивается в ничто,
 * к герою по дуге летят монетки (у редких ещё искры цвета редкости), звук «клинк». Иначе — тихое исчезновение.
 */
export function removeLoot(scene: Phaser.Scene, img: Phaser.GameObjects.Image, hero: { x: number; y: number }, near: number) {
  if (img instanceof Phaser.GameObjects.Sprite) img.anims.stop();
  const r = (img.getData("rarity") as number | undefined) ?? 0;
  if (Math.hypot(img.x - hero.x, img.y - hero.y) > near) {
    scene.tweens.add({ targets: img, alpha: 0, duration: 220, ease: "Sine.easeIn", onComplete: () => img.destroy() });
    return;
  }
  const y0 = img.y;
  scene.tweens.chain({
    targets: img,
    tweens: [
      { y: y0 - 5, scaleX: 0.92, scaleY: 1.1, duration: 110, ease: "Quad.easeOut" },
      { y: y0, scaleX: 1.25, scaleY: 0.2, alpha: 0, duration: 170, ease: "Quad.easeIn" },
    ],
    onComplete: () => img.destroy(),
  });
  const tex = particles(scene, r);
  const n = r ? 5 : 4, sx = img.x, sy = y0 - 8;
  for (let j = 0; j < n; j++) {
    const spark = r > 0 && j % 2 === 1;
    const p = scene.add.image(sx + (j - (n - 1) / 2) * 3, sy, spark ? tex.spark : tex.coin).setDepth(Math.max(img.depth, hero.y) + 5);
    if (spark) p.setBlendMode(Phaser.BlendModes.ADD);
    const ax = p.x, ay = p.y, cx = (ax + hero.x) / 2 + (j - (n - 1) / 2) * 6, cy = Math.min(ay, hero.y) - 16 - (j % 2) * 5;
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 300 + j * 25, delay: 60 + j * 30, ease: "Quad.easeIn",
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0, u = 1 - t, tx = hero.x, ty = hero.y - 14;
        p.setPosition(Math.round(u * u * ax + 2 * u * t * cx + t * t * tx), Math.round(u * u * ay + 2 * u * t * cy + t * t * ty));
        p.setAlpha(t > 0.8 ? (1 - t) * 5 : 1);
      },
      onComplete: () => p.destroy(),
    });
  }
  sfx.play("clink", 0.7);
  if (r) scene.time.delayedCall(110, () => sfx.play("clink", 0.5));
}
