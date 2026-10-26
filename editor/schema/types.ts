export type Kind = "num" | "int" | "bool" | "text" | "curve" | "tuple" | "numOrCurve" | "enum" | "ref" | "json";

/** Данные, доступные объяснениям: balance.json (с учётом несохранённых правок) и корень/родитель редактируемого поля. */
export interface Ctx {
  bal: any;
  root: any;
  parent: any;
  path: string[];
}

export interface Doc {
  /** Человеческое название поля. */
  title: string;
  /** Что это значит, простыми словами. */
  what: string;
  kind?: Kind;
  /** Единицы: «секунды», «px мира», «доля от 0 до 1»… */
  unit?: string;
  /** Жёсткие границы: за ними сохранение отклоняется. */
  min?: number;
  max?: number;
  step?: number;
  /** Разумный диапазон (подсказка и подсветка за ним). */
  sane?: [number, number];
  options?: string[];
  /** Ссылка на список id: mobs | classes | bosses | mounts | factions | tiers | items. */
  ref?: string;
  /** Для tuple: подписи элементов. */
  labels?: string[];
  /** Для curve: подпись по X и форматирование Y, интерполяция. */
  curve?: { y: "mult" | "num" | "pct"; interp: "log" | "loglog" | "lin"; what?: string };
  /** Живая строка: пересчитывается при каждом движении ползунка. */
  live?: (v: any, c: Ctx) => string;
  /** «Если поставить больше — …» */
  up?: string;
  /** «…меньше — …» */
  down?: string;
  /** С чем связано: какие другие числа умножаются. */
  links?: string;
  /** Где это видно в игре. */
  seen?: string;
  /** Поле только для чтения. */
  readonly?: boolean;
}

export type Rules = [string, Doc][];
