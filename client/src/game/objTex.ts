import Phaser from "phaser";

/**
 * Текстура объекта карты по id (вид объекта, файл assets/objects/<id>.png). Объекты упакованы в атласы (tools/gen/atlas.ts,
 * manifest.atlases / atlasOf): кадр <id> в листе objsN. Объекта нет в atlasOf (мешки добычи, старый манифест, лист не загрузился) —
 * отдельная текстура o_<id> без кадра. Везде, где раньше был ключ `o_${id}`, — через эти функции.
 */
export interface AtlasManifest { atlases?: { key: string; png: string; json: string }[]; atlasOf?: Record<string, string> }
/** Основания кадров (tools/gen/object-feet.ts): foot — пустые ряды под основанием (только тень), ao — [x0, x1] основания у кадров без запечённого контакта. */
export interface FeetManifest { foot?: Record<string, number>; ao?: Record<string, [number, number]> }

let atlasOf: Record<string, string> = {};
const atlasKeys = new Set<string>();

/** Из manifest.json (BootScene). */
export function setObjAtlases(m: AtlasManifest) {
  atlasOf = { ...(m.atlasOf ?? {}) };
  atlasKeys.clear();
  for (const a of m.atlases ?? []) atlasKeys.add(a.key);
}
/** Лист не загрузился: его объекты — по одному. Возвращает id, которые надо догрузить как o_<id>. */
export function dropObjAtlas(key: string): string[] {
  atlasKeys.delete(key);
  const ids = Object.keys(atlasOf).filter((id) => atlasOf[id] === key);
  for (const id of ids) delete atlasOf[id];
  return ids;
}
/** Объект в атласе (иначе грузится по одному). */
export const inObjAtlas = (id: string) => !!atlasOf[id];

/** [ключ текстуры, кадр] объекта; кадр undefined — отдельная картинка. */
export function objTex(id: string): [string, string | undefined] {
  const a = atlasOf[id];
  return a ? [a, id] : [`o_${id}`, undefined];
}
/** Есть ли картинка объекта (замена textures.exists(`o_${id}`)). */
export function objHas(scene: Phaser.Scene, id: string): boolean {
  const a = atlasOf[id];
  return a ? scene.textures.exists(a) && scene.textures.get(a).has(id) : scene.textures.exists(`o_${id}`);
}
/** id объекта, который сейчас показывает картинка (null — это не объект карты). */
export function objId(go: { texture: Phaser.Textures.Texture; frame: Phaser.Textures.Frame }): string | null {
  const k = go.texture.key;
  if (atlasKeys.has(k)) return String(go.frame.name);
  return k.startsWith("o_") ? k.slice(2) : null;
}
/** Сменить картинку на объект id, если она другая. */
export function setObj<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(go: T, id: string): T {
  if (objId(go) === id) return go;
  const [k, f] = objTex(id);
  return go.setTexture(k, f) as T;
}
/** Пиксели кадра объекта (холст размером с кадр) — для разбора картинки (створки ворот). */
export function objImageData(scene: Phaser.Scene, id: string): ImageData {
  const [k, f] = objTex(id), fr = scene.textures.getFrame(k, f);
  const cv = document.createElement("canvas");
  cv.width = fr.cutWidth; cv.height = fr.cutHeight;
  const g = cv.getContext("2d")!;
  g.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  return g.getImageData(0, 0, cv.width, cv.height);
}

let feet: Record<string, number> = {}, aos: Record<string, [number, number]> = {};
/** Из manifest.json (BootScene): основания кадров объектов. */
export function setObjFeet(m: FeetManifest) { feet = { ...(m.foot ?? {}) }; aos = { ...(m.ao ?? {}) }; }
/** Сколько рядов кадра ниже настоящего основания (там только контактная тень): опора, длинная тень и глубина — от основания (docs/art-perspective.md §4). */
export const objFoot = (id: string): number => feet[id] ?? 0;
/** Основание без запечённой контактной тени: [x0, x1] в пикселях кадра — клиент подкладывает AO. */
export const objAo = (id: string): [number, number] | undefined => aos[id];
