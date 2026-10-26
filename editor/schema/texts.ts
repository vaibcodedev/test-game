import type { Rules } from "./types";

const fill = (text: string, vars?: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? `‹${vars[k]}›` : m));

export const textsRules: Rules = [
  ["texts.*.text", {
    title: "Текст", kind: "text",
    what: "Сам текст — ровно так игрок увидит его в игре. Всё, что в фигурных скобках, например {name}, игра подставит сама (имя героя, число, название); скобки и слова внутри них менять нельзя.",
    live: (v, c) => `Игрок увидит: «${fill(String(v), c.parent?.vars)}»`,
    up: "Длинные тексты могут не поместиться в окошко подсказки — держите их короткими.", down: "Слишком короткие тексты теряют смысл: пишите, что случилось и что делать.",
    links: "Подстановки перечислены ниже в поле «Что подставляет игра».", seen: "Там, где указано в поле «Где игрок это увидит».",
  }],
  ["texts.*.who", { title: "Кто говорит", kind: "text", what: "Кто произносит текст или от чьего лица он показан: сервер, стража, торговец, банкир и т. д. Подсказка для автора; на игру не влияет." }],
  ["texts.*.where", { title: "Где игрок это увидит", kind: "text", what: "В каком месте экрана и в каком случае появляется текст: красная подсказка при ошибке, окно банка, объявление рейда…" }],
  ["texts.*.area", { title: "Раздел", kind: "text", what: "К какой части игры относится текст (srv — сообщения сервера, ui — интерфейс и т. д.). Нужен для поиска." }],
  ["texts.*.vars", { title: "Что подставляет игра", kind: "json", readonly: true, what: "Список подстановок: слева имя в фигурных скобках, справа — что именно игра туда ставит (выражение в коде). Менять нельзя: это связь текста с кодом." }],
];

/** Проверка текстов: в тексте нет подстановок, которых не знает код. */
export function checkTexts(data: any): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const [k, e] of Object.entries<any>(data?.texts ?? {})) {
    const known = new Set(Object.keys(e.vars ?? {}));
    for (const m of String(e.text).matchAll(/\{(\w+)\}/g)) if (!known.has(m[1])) out.push({ path: `texts.${k}.text`, message: `Текст: «{${m[1]}}» — такой подстановки в коде нет. Допустимые: ${[...known].map((x) => `{${x}}`).join(", ") || "нет"}.` });
    if (typeof e.text === "string" && !e.text.trim()) out.push({ path: `texts.${k}.text`, message: "Текст не может быть пустым." });
  }
  return out;
}
