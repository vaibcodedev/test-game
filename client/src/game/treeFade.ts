import Phaser from "phaser";
import { objTex } from "./objTex";

/**
 * Полупрозрачная крона: герой стоит за деревом (выше его основания по глубине) и крона перекрывает его — дерево плавно гаснет до 0,5,
 * а ствол остаётся плотным (отдельный кадр <id>_trunk поверх, tools/gen/nature3d-flora.ts). Кадр ствола создаётся только у деревьев,
 * у которых он есть; регистрирует client/src/game/terrain.ts, обновляет GameScene раз в кадр.
 */
interface Tree { img: Phaser.GameObjects.Image; trunk: Phaser.GameObjects.Image; x: number; y: number; half: number; top: number; a: number }
const trees = new Set<Tree>();
const FADE = 0.5, SPEED = 4; // до 0,5; ~0,25 с на переход

/** Дерево с кадром ствола: возвращает картинку ствола (её надо положить в объекты куска, чтобы она удалялась вместе с ним). */
export function addTreeFade(scene: Phaser.Scene, img: Phaser.GameObjects.Image, trunkId: string): Phaser.GameObjects.Image {
  const trunk = scene.add.image(img.x, img.y, ...objTex(trunkId)).setOrigin(img.originX, img.originY).setFlipX(img.flipX).setDepth(img.depth + 0.001).setVisible(false);
  const t: Tree = { img, trunk, x: img.x, y: img.y, half: img.displayWidth * 0.42, top: img.displayHeight, a: 1 };
  trees.add(t);
  img.once("destroy", () => { trees.delete(t); trunk.destroy(); });
  return trunk;
}

/** Раз в кадр: hx, hy — ноги героя в мире, dt — секунды. */
export function updateTreeFade(hx: number, hy: number, dt: number) {
  for (const t of trees) {
    // герой позади основания (меньше y) и внутри силуэта кроны: по ширине и по высоте над основанием (голова героя ~28 px)
    const behind = hy < t.y - 2 && hy > t.y - t.top + 12 && Math.abs(hx - t.x) < t.half;
    const want = behind ? FADE : 1;
    if (t.a === want) continue;
    t.a = want < t.a ? Math.max(want, t.a - dt * SPEED * (1 - FADE)) : Math.min(want, t.a + dt * SPEED * (1 - FADE));
    t.img.setAlpha(t.a);
    t.trunk.setVisible(t.a < 1).setAngle(t.img.angle);
  }
}

/**
 * Здания: герой заходит за дом (севернее основания, в пределах силуэта) — здание плавно гаснет до 0,45, герой виден; впереди и сбоку — плотное.
 * Коллизия не меняется: непроходим только след на земле (shared/map.ts OBJ_SIZE), а верхняя часть над ним — зона «за зданием».
 */
export const FADE_BUILDINGS = new Set(["house", "house_blue", "tavern", "bank", "forge", "arena_gate", "hut_sol", "tent", "sol_house", "sol_temple", "sol_church", "umb_house", "umb_crypt", "umb_ziggurat", "tower", "sol_tower", "umb_tower"]);
interface Bld { img: Phaser.GameObjects.Image; x: number; y: number; half: number; top: number; a: number }
const blds = new Set<Bld>();
const BFADE = 0.45;
export function addBuildingFade(img: Phaser.GameObjects.Image) {
  const b: Bld = { img, x: img.x, y: img.y, half: img.displayWidth * 0.5, top: img.displayHeight, a: 1 };
  blds.add(b);
  img.once("destroy", () => blds.delete(b));
}
export function updateBuildingFade(hx: number, hy: number, dt: number) {
  for (const b of blds) {
    const want = hy < b.y - 2 && hy > b.y - b.top + 8 && Math.abs(hx - b.x) < b.half ? BFADE : 1;
    if (b.a === want) continue;
    b.a = want < b.a ? Math.max(want, b.a - dt * SPEED * (1 - BFADE)) : Math.min(want, b.a + dt * SPEED * (1 - BFADE));
    b.img.setAlpha(b.a);
  }
}
