/**
 * Превью героя для интерфейса (окно Перековщика «было | станет», подсказка «Оболочки»): тело класса и слои снаряжения GearLayers
 * сводятся в RenderTexture и отдаются картинкой (data URL). Рендер асинхронный: previewUrl возвращает готовую картинку из кэша
 * или null и дорисовывает все <img data-pv="ключ"> на странице, когда кадр готов.
 */
import Phaser from "phaser";
import { GearLayers } from "./GearLayers";

let scene: Phaser.Scene | null = null;
/** GameScene сообщает себя при создании (рендер идёт её средствами, вне мира). */
export const bindPreviewScene = (s: Phaser.Scene | null) => { scene = s; };

/** Кадр превью: 48×48, герой 32×32 со сдвигом — оружие и плащ не обрезаются. */
const W = 48, H = 48, OX = 8, OY = 12;
const cache = new Map<string, string>();
const pending = new Set<string>();

export const previewKey = (cls: string, faction: string, gear: string, weapon: string) => `${cls}|${faction}|${gear}|${weapon}`;

function fill(key: string, url: string) {
  for (const img of document.querySelectorAll<HTMLImageElement>("img[data-pv]")) if (img.dataset.pv === key) img.src = url;
}

/** Картинка героя в снаряжении (строки gear/weapon как у Unit). null — ещё рисуется (img с data-pv обновится сам). */
export function previewUrl(cls: string, faction: string, gear: string, weapon: string): string | null {
  const key = previewKey(cls, faction, gear, weapon);
  const hit = cache.get(key);
  if (hit) return hit;
  const sc = scene;
  if (!sc || pending.has(key) || !sc.sys?.isActive()) return null;
  pending.add(key);
  const body = sc.textures.exists(`u_nude_${cls}`) ? `u_nude_${cls}` : `u_${cls}`;
  const rt = sc.make.renderTexture({ width: W, height: H }, false);
  const layers = new GearLayers(sc);
  try {
    layers.draw({ cls, faction, gear, weapon, view: 0, flip: false, col: 0, ox: OX, oy: OY, t: sc.time.now, seed: 7, self: true });
    const [back, front] = layers.graphics();
    rt.draw(back, 0, 0);
    if (sc.textures.exists(body)) rt.drawFrame(body, 0, OX, OY);
    rt.draw(front, 0, 0);
  } finally {
    layers.hide();
    layers.destroy();
  }
  rt.snapshot((img) => {
    const url = (img as HTMLImageElement).src;
    pending.delete(key);
    rt.destroy();
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    cache.set(key, url);
    fill(key, url);
  });
  return null;
}

/** Разметка картинки превью: сразу из кэша или пустая — дорисуется. */
export function previewImg(cls: string, faction: string, gear: string, weapon: string, cls2 = "tm-hero", alt = ""): string {
  const key = previewKey(cls, faction, gear, weapon);
  const url = previewUrl(cls, faction, gear, weapon) ?? "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  return `<img class="${cls2}" data-pv="${key.replace(/"/g, "&quot;")}" src="${url}" alt="${alt}" width="${W}" height="${H}">`;
}
