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
  return spr;
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
