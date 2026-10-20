/**
 * Мировой текст Phaser: ники, титулы, подписи, цифры урона, реплики, таблички.
 * Пресеты (кегль + обводка), обводка цвета P.well и разрешение текстуры, равное масштабу камеры:
 * тогда 1 тексель = 1 пиксель холста, и фильтр NEAREST (pixelArt) не выбрасывает тексели, штрихи букв ровные.
 * Все тексты, созданные здесь, помнят свой множитель разрешения и перерисовываются при смене масштаба (syncTextRes).
 */
import Phaser from "phaser";
import { P } from "../../../shared/palette";

export const FONT = '"Rubik", "Trebuchet MS", sans-serif';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Обводка Phaser рисуется по контуру букв: снаружи видна её половина, поэтому она ≈ 25–30% кегля —
 * толще слепляет буквы и раздувает «·».
 */
const PRESETS = {
  /** Ник героя, моба, стражника. */
  name: { fontSize: "7px", fontStyle: "600", strokeThickness: 2 },
  /** Титул над ником: мельче и темнее ника — второй уровень иерархии. */
  title: { fontSize: "6px", fontStyle: "600", strokeThickness: 1.5, color: P.gold },
  /** Имя босса. */
  boss: { fontSize: "9px", fontStyle: "600", strokeThickness: 2 },
  /** Питомцы и горожане. */
  small: { fontSize: "6px", fontStyle: "600", strokeThickness: 1.5 },
  /** Свой стиль целиком в extra (цифры урона, реплики, таблички): кегль, цвет и обводка остаются прежними, меняется только чёткость. */
  plain: {},
} satisfies Record<string, TextStyle>;

export type TextPreset = keyof typeof PRESETS;

/** Живые тексты и множитель разрешения каждого: текст, который потом растягивают в k раз, рисуется в k раз чётче. */
const live = new Map<Phaser.GameObjects.Text, number>();

/** Разрешение текстуры текста = текущий масштаб камеры. */
export const textRes = (scene: Phaser.Scene): number => scene.cameras.main.zoom || 1;

/**
 * Текст по пресету. Цвет и любые поля стиля можно переопределить в extra; позицию ставит вызывающий (placeText),
 * origin остаётся (0, 0) — угол блока лежит на целых пикселях. k — во сколько раз текст растянут на экране (setScale):
 * разрешение берётся zoom × k, и в покое 1 тексель = 1 пиксель холста.
 * Высота блока у Phaser дробная (метрики шрифта: кегль 7 px даёт 9.76): край текстуры падал бы между пикселями холста,
 * и строки букв то дублировались, то терялись. Поэтому высота округляется вверх до целой — запас уходит под базовую линию.
 * Для текста с переменным числом строк высота фиксируется по первой записи: такие тексты создаются сразу с итоговым содержимым.
 */
export function worldText(scene: Phaser.Scene, x: number, y: number, text: string, preset: TextPreset, extra: TextStyle = {}, k = 1): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, { fontFamily: FONT, color: P.fg, stroke: P.well, ...PRESETS[preset], resolution: textRes(scene) * k, ...extra });
  live.set(t, k);
  t.once(Phaser.GameObjects.Events.DESTROY, () => live.delete(t));
  return t.setFixedSize(0, Math.ceil(t.height - 1e-6));
}

/** Сменить разрешение уже созданного текста: перерисовка только если значение изменилось. */
export function applyTextRes(t: Phaser.GameObjects.Text | undefined, res: number) {
  if (!t || !t.scene || t.style.resolution === res) return;
  t.setResolution(res);
  // Canvas-рендерер (запасной, без WebGL) берёт масштаб из источника текстуры, а Phaser ставит его только при создании
  t.frame.source.resolution = res;
}

/** Масштаб камеры сменился: перерисовать все тексты worldText с разрешением zoom × их множитель. Зовёт GameScene. */
export function syncTextRes(zoom: number) {
  for (const [t, k] of live) {
    if (t.scene) applyTextRes(t, zoom * k);
    else live.delete(t);
  }
}

/** Растянуть текст в s раз и подогнать разрешение (для текстов, чей масштаб меняется: ноты, цифры). */
export function scaleText(t: Phaser.GameObjects.Text, s: number) {
  t.setScale(s);
  if (live.has(t)) live.set(t, s);
  applyTextRes(t, textRes(t.scene) * s);
}

/**
 * Поставить текст так, чтобы левый верхний угол его блока лежал на целых пикселях мира. (x, y) — точка привязки,
 * ax/ay — её доля внутри блока (0.5, 1 = середина низа): то же, что setOrigin(ax, ay), но без дробных смещений.
 * Движущимся и анимированным текстам звать каждый кадр; scale — масштаб, если его надо задать заодно.
 */
export function placeText(t: Phaser.GameObjects.Text, x: number, y: number, ax = 0.5, ay = 1, scale?: number): Phaser.GameObjects.Text {
  if (scale !== undefined) t.setScale(scale);
  return t.setPosition(Math.round(x - t.width * t.scaleX * ax), Math.round(y - t.height * t.scaleY * ay));
}

/** Высота заглавных Rubik в долях кегля (OS/2 sCapHeight = 700 при 1000 на em). */
const CAP_RATIO = 0.7;

/**
 * Базовая линия и верх заглавных букв в блоке текста — в пикселях мира от верха блока.
 * Phaser кладёт базовую линию в целую строку: round(обводка/2 + ascent). По этим двум числам рамки и значки
 * центруются на самом нике, а не на блоке: сверху в блоке запас под акценты, снизу под хвосты букв, и они не равны.
 */
export function capBand(t: Phaser.GameObjects.Text): { base: number; cap: number } {
  const base = Math.round(t.style.strokeThickness / 2 + t.getTextMetrics().ascent);
  return { base, cap: base - parseFloat(String(t.style.fontSize)) * CAP_RATIO };
}
