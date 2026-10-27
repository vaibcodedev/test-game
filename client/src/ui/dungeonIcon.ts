/** Значок входа в подземелье для карты мира и миникарты (данные — dungeonIconData.ts, сгенерированы tools/gen/dungeon-icons.ts): состояния normal / hover / taken (трофеи взяты, галочка) / locked (закрыто, замок) и миниатюра. */
import { DG_ICON_DATA } from "./dungeonIconData";

export type DgIconState = "normal" | "hover" | "taken" | "locked" | "mini";
const cache = new Map<DgIconState, HTMLCanvasElement>();
export function dgIcon(state: DgIconState): HTMLCanvasElement {
  let cv = cache.get(state);
  if (cv) return cv;
  const d = DG_ICON_DATA[state], h = d.rows.length, w = d.rows[0].length;
  cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  d.rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const ch = row[x]; if (ch === ".") continue; g.fillStyle = d.pal[ch.charCodeAt(0) - 48]; g.fillRect(x, y, 1, 1); } });
  cache.set(state, cv);
  return cv;
}
/** Нарисовать значок по центру (x, y) в масштабе k (целом), без сглаживания. */
export function drawDgIcon(g: CanvasRenderingContext2D, state: DgIconState, x: number, y: number, k = 1) {
  const cv = dgIcon(state), w = cv.width * k, h = cv.height * k, was = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  g.imageSmoothingEnabled = was;
}
