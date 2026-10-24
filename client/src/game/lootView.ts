/**
 * Добыча на земле: лист objects/loot_r{редкость}[_boss].png (tools/gen/loot.ts) — 20 кадров в строку:
 * 0..9 падение с отскоком (один раз), 10..19 покой; у редких в покое мерцание (ореол, блик, звёздочки).
 */
import Phaser from "phaser";
import type { LootBag } from "../../../shared/protocol";

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
  const spr = scene.add.sprite(b.x, b.y, key, "0").setOrigin(0.5, (fh - 2) / fh).setDepth(b.y - 1);
  spr.play(`${key}_drop`);
  spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.play(`${key}_idle`));
  return spr;
}
