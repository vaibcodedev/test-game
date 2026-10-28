import Phaser from "phaser";

/** Источник подсветки: картинка (кадр текстуры, опорная точка, место в мире) или, если картинки нет (двери в стенах зданий), мягкое пятно по зоне нажатия. */
export interface GlowSrc { id?: string; color?: string; tex: string | null; frame?: string | number; x: number; y: number; ox: number; oy: number; flip?: boolean; depth: number; spot?: { w: number; h: number } }

const PAD = 12, GOLD = "rgb(214,168,75)", FADE_IN = 180, FADE_OUT = 150, PULSE_MS = 1800;
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

/** Свечение по силуэту под курсором (вариант B; NPC и объекты — золотое, враг — красное): одна картинка на сцену. Силуэт запекается из кадра один раз на пару текстура+кадр (кэш), дальше только alpha:
 *  появление 180 мс easeOutQuad, пульс 60–100% синусоидой за 1,8 с, затухание 150 мс. Вызывается каждый кадр, перебора объектов нет. */
export class HoverGlow {
  private img: Phaser.GameObjects.Image;
  private baked = new Map<string, string>();
  private a = 0;
  private on = false;
  private key = "";

  constructor(private scene: Phaser.Scene) {
    this.img = scene.add.image(0, 0, "fx_glow").setVisible(false).setTint(0xd6a84b);
  }

  private bake(tex: string, frame: string | number | undefined, color = GOLD): string | null {
    const id = `${tex}|${frame ?? ""}|${color}`;
    const had = this.baked.get(id);
    if (had) return had;
    const fr = this.scene.textures.getFrame(tex, frame as string);
    const src = fr?.source.image as CanvasImageSource | undefined;
    if (!fr || !src) return null;
    const w = fr.cutWidth, h = fr.cutHeight;
    const sil = document.createElement("canvas"); sil.width = w; sil.height = h;
    const sx = sil.getContext("2d")!;
    sx.drawImage(src, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
    sx.globalCompositeOperation = "source-in"; sx.fillStyle = color; sx.fillRect(0, 0, w, h);
    const c = document.createElement("canvas"); c.width = w + PAD * 2; c.height = h + PAD * 2;
    const x = c.getContext("2d")!;
    for (const [r, al] of [[7, 0.55], [4, 0.75], [2, 0.9], [1, 0.9]] as const) { x.filter = `blur(${r}px)`; x.globalAlpha = al; x.drawImage(sil, PAD, PAD); }
    const key = `hglow_${this.baked.size}`;
    this.scene.textures.addCanvas(key, c);
    this.baked.set(id, key);
    return key;
  }

  /** target — что под курсором (null — ничего); dt — мс кадра, t — время сцены, мс. */
  update(target: GlowSrc | null, dt: number, t: number) {
    const img = this.img;
    if (target) {
      const k = target.id ?? `${target.tex ?? "spot"}@${Math.round(target.x)},${Math.round(target.y)}`; // id — движущийся юнит: свечение не перезапускается каждый кадр
      if (k !== this.key) {
        // новая цель: если прежняя ещё светилась — свечение начинается заново с нуля
        if (!this.on) this.a = 0;
        else if (this.a > 0.05) this.a = 0;
        this.key = k;
      }
      const baked = target.tex ? this.bake(target.tex, target.frame, target.color) : null;
      if (baked) {
        const f = this.scene.textures.getFrame(baked);
        img.setTexture(baked).setBlendMode(Phaser.BlendModes.NORMAL).clearTint().setScale(1);
        const w = f.width, h = f.height;
        img.setOrigin(((target.flip ? 1 - target.ox : target.ox) * (w - PAD * 2) + PAD) / w, (target.oy * (h - PAD * 2) + PAD) / h).setFlipX(!!target.flip);
      } else if (target.spot) {
        img.setTexture("fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xd6a84b).setOrigin(0.5, 0.5).setFlipX(false).setDisplaySize(target.spot.w, target.spot.h);
      } else { this.on = false; }
      img.setPosition(target.x, target.y).setDepth(target.depth - 0.5);
      this.on = !!(baked || target.spot);
    } else this.on = false;
    this.a = this.on ? Math.min(1, this.a + dt / FADE_IN) : Math.max(0, this.a - dt / FADE_OUT);
    if (this.a <= 0) { if (img.visible) img.setVisible(false); return; }
    const pulse = 0.8 + 0.2 * Math.sin((t / PULSE_MS) * Math.PI * 2);
    img.setVisible(true).setAlpha(easeOutQuad(this.a) * pulse * (img.blendMode === Phaser.BlendModes.ADD ? 0.5 : 1));
  }

  destroy() { this.img.destroy(); for (const k of this.baked.values()) if (this.scene.textures.exists(k)) this.scene.textures.remove(k); }
}
