/** Тексты игры из data/texts.json: T("ключ", { имя: значение }) подставляет значения в {имя}. Править тексты — в редакторе конфигов. */
import data from "../data/texts.json";

interface TextEntry { text: string; who: string; where: string; area: string; vars?: Record<string, string> }
const TEXTS = data.texts as Record<string, TextEntry>;

export function T(key: string, vars?: Record<string, unknown>): string {
  const s = TEXTS[key]?.text ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
