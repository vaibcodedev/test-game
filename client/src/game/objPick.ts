import Phaser from "phaser";
import { imageDist, type Mask } from "./hit";

/** Попадание мышью по объектам мира (камень телепорта, статуи, двери, узлы добычи, мешки, NPC) — по непрозрачным пикселям кадра с допуском (hit.ts maskDist).
 *  Маска запекается один раз на пару текстура+кадр; кадр недоступен — null (вызывающий берёт круг). */
const masks = new Map<string, Mask | null>();
const ALPHA = 24;

export function frameMask(scene: Phaser.Scene, tex: string, frame?: string | number): Mask | null {
  const id = `${tex}|${frame ?? ""}`;
  if (masks.has(id)) return masks.get(id)!;
  let m: Mask | null = null;
  try {
    const fr = scene.textures.getFrame(tex, frame as string), src = fr?.source.image as CanvasImageSource | undefined;
    if (fr && src) {
      const w = fr.cutWidth, h = fr.cutHeight, c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(src, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
      const px = x.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] >= ALPHA ? 1 : 0;
      m = { w, h, a };
    }
  } catch { m = null; }
  masks.set(id, m);
  return m;
}

/** Расстояние от точки мира до силуэта кадра tex/frame, поставленного в (x, y) с опорой (ox, oy); Infinity — мимо, NaN — маски нет (брать круг). */
export function texDist(scene: Phaser.Scene, tex: string, frame: string | number | undefined, x: number, y: number, ox: number, oy: number, sx: number, sy: number, flip: boolean, wx: number, wy: number, tol: number): number {
  const m = frameMask(scene, tex, frame);
  return m ? imageDist(m, x, y, ox, oy, sx, sy, flip, wx, wy, tol) : NaN;
}

/** То же для живой картинки или спрайта (мешок, узел добычи, видимый NPC): текущий кадр, масштаб и отражение берутся у неё. */
export function goDist(scene: Phaser.Scene, g: Phaser.GameObjects.Image, wx: number, wy: number, tol: number): number {
  return texDist(scene, g.texture.key, g.frame.name, g.x, g.y, g.originX, g.originY, Math.abs(g.scaleX) || 1, Math.abs(g.scaleY) || 1, g.flipX, wx, wy, tol);
}
