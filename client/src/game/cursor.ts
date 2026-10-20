/**
 * Курсоры игры: золотые (Kenney Cursor Pixel Pack, CC0), 32×32, файлы — client/public/ui/cursors (их делает tools/gen/vendor-ui.ts).
 * Стрелка по умолчанию задана в styles/base.css для html, body и canvas. Здесь — контекстные курсоры: поговорить (рука),
 * взять (перчатка), атаковать (меч), ожидание (песочные часы). Пока ничего не вызывает: GameScene подключит setCursor(kind)
 * на наведение курсора на NPC, добычу, врага.
 */
export type CursorKind = "arrow" | "talk" | "take" | "attack" | "wait";

/** Точка нажатия в пикселях картинки (x, y): кончик стрелки, кончик пальца, центр, кончик меча, центр (tools/out/vendor/cursors/cursors.css). */
const HOTSPOT: Record<CursorKind, [number, number]> = { arrow: [2, 0], talk: [10, 2], take: [16, 16], attack: [0, 0], wait: [16, 16] };
/** Запасной курсор системы, если картинка не загрузилась. */
const FALLBACK: Record<CursorKind, string> = { arrow: "default", talk: "pointer", take: "grab", attack: "crosshair", wait: "wait" };

const file = (k: CursorKind) => `/ui/cursors/cursor_${k}.png`;

/** Значение CSS cursor для вида: картинка с точкой нажатия и системный запасной курсор. */
export const cursorCss = (k: CursorKind): string => `url("${file(k)}") ${HOTSPOT[k][0]} ${HOTSPOT[k][1]}, ${FALLBACK[k]}`;

/** Загрузить картинки курсоров заранее, чтобы при первом наведении курсор не мигал системным. */
export function preloadCursors(): void {
  for (const k of Object.keys(HOTSPOT) as CursorKind[]) new Image().src = file(k);
}

/**
 * Поставить курсор на игровой canvas. "arrow" снимает свой стиль и возвращает золотую стрелку из CSS (base.css).
 * Вызывать при смене цели наведения, а не каждый кадр: повторный вызов с тем же видом ничего не меняет.
 */
export function setCursor(kind: CursorKind = "arrow"): void {
  const el = document.querySelector<HTMLElement>("#game canvas") ?? document.getElementById("game");
  if (!el) return;
  const value = kind === "arrow" ? "" : cursorCss(kind);
  if (el.style.cursor !== value) el.style.cursor = value;
}
