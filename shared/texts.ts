/** Тексты игры из data/texts.json: T("ключ", { имя: значение }) подставляет значения в {имя}. Править тексты — в редакторе конфигов. */
import data from "../data/texts.json";

interface TextEntry { text: string; who: string; where: string; area: string; vars?: Record<string, string> }
const TEXTS = data.texts as Record<string, TextEntry>;

const PLURAL = new Intl.PluralRules("ru");

/** Склонение по числу: формы «один|несколько|много» (1 предмет, 2 предмета, 5 предметов); дробные — как «несколько». */
export function plural(n: number, one: string, few: string, many: string): string {
  const c = PLURAL.select(Math.abs(n));
  return c === "one" ? one : c === "many" ? many : few;
}

/** {имя} — подстановка; {имя:форма1|форма2|форма3} — слово в нужной форме по числу vars.имя (само число пишется отдельным {имя}). */
export function T(key: string, vars?: Record<string, unknown>): string {
  const s = TEXTS[key]?.text ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)(?::([^{}|]*)\|([^{}|]*)\|([^{}|]*))?\}/g, (m, k: string, a?: string, b?: string, c?: string) => {
    if (!(k in vars)) return m;
    if (a === undefined) return String(vars[k]);
    const n = Number(vars[k]);
    return Number.isFinite(n) ? plural(n, a, b!, c!) : m;
  });
}
