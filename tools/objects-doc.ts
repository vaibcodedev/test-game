/** Таблицы docs/art/objects.md из каталога (вызывает tools/objects-catalog.ts). */
import fs from "node:fs";
import path from "node:path";
import type { Catalog, Entry } from "./objects-catalog";
import { CATEGORIES } from "./objects-names";

const short = (f: string) => f.replace(/^tools\/gen\//, "").replace(/^tools\//, "").replace(/ \(.*\)$/, "");
function where(e: Entry): string {
  const w = e.where, out: string[] = [];
  const z = Object.entries(w.zones).sort((a, b) => b[1] - a[1]);
  if (w.worldTotal) out.push(`мир ${w.worldTotal}: ${z.slice(0, 3).map(([n, c]) => `${n} ${c}`).join(", ")}${z.length > 3 ? ` +${z.length - 3} зон` : ""}`);
  if (w.dungeon) out.push(`подземелье ${w.dungeon}`);
  if (w.raid) out.push(`рейд ${w.raid}`);
  if (w.citadel) out.push(`Цитадель v2 ${w.citadel}`);
  const it = Object.entries(w.interiors);
  if (it.length) out.push(`интерьеры: ${it.map(([n, c]) => `${n} ${c}`).join(", ")}`);
  if (!out.length) out.push(w.code.length ? `рисуется кодом (${w.code.map((f) => f.split("/").pop()).slice(0, 2).join(", ")})` : "—");
  return out.join("; ");
}
const flags = (e: Entry) => [e.animated ? "аним." : "", e.glow ? "свет" : ""].filter(Boolean).join(", ") || "—";
const row = (e: Entry) => `| \`${e.id}\` | ${e.name}${e.sub ? ` (${e.sub})` : ""} | ${where(e)} | ${e.variants.length ? `${e.variants.length}: ${e.variants.slice(0, 3).join(", ")}${e.variants.length > 3 ? "…" : ""}` : "—"} | ${[...new Set(e.generator.map(short))].slice(0, 2).join(", ") || "—"} | ${e.collision ? `${e.collision.w}×${e.collision.h}` : "нет"} | ${flags(e)} | ${/очередь/.test(e.quality) ? "в очереди" : "—"} |`;
const HEAD = "| id | Название | Где (кол-во) | Варианты | Генератор | Коллизия | Аним./свет | Качество |\n|---|---|---|---|---|---|---|---|";

export function writeDocs(c: Catalog, root: string) {
  const L: string[] = [];
  L.push("# Каталог объектов мира", "");
  L.push("**Когда читать: любая правка объектов — бери список отсюда.** Машиночитаемый источник правды — [data/objects-catalog.json](../../data/objects-catalog.json); эта таблица собирается из него скриптом `npx tsx tools/objects-catalog.ts` (руками не править).", "");
  L.push("## Правило", "");
  L.push("- Новый объект в мире → после добавления запусти `npx tsx tools/objects-catalog.ts` и проверь, что объект появился в каталоге с названием и категорией (нет названия — допиши `tools/objects-names.ts`; тест `tests/unit/objects-catalog.ts` падает на объекте без записи).");
  L.push("- Правка объектов по просьбе владельца → список берётся из `data/objects-catalog.json` (поля: id, name, category, where, variants, generator, collision, animated, glow, quality).");
  L.push("- Источники: манифест `client/public/assets/manifest.json`; генерация карт `shared/map.ts`, `shared/dungeon.ts`, `shared/raid.ts`; интерьеры `data/interiors.json`; Цитадель v2 `data/citadel.json`; генераторы `tools/gen`.", "");
  L.push("## Итоги", "");
  L.push("| Категория | Объектов (id без вариантов) |", "|---|---|");
  for (const k of CATEGORIES) L.push(`| ${k} | ${c.counts[k]} |`);
  L.push(`| **всего** | **${c.objects.length}** |`, "");
  L.push(`Не используется: ${c.unused.length}. Нужно скоро (в манифесте, на картах нет): ${c.soon.length}. Под вопросом: ${c.questionable.length}. Удалено ${c.removed.date}: ${c.removed.ids.length}.`, "");
  L.push("Пояснения: «Где» — зона по `shared/map.ts` и количество на карте мира (генерация с MAP_SEED); коллизия — `OBJECT_FOOTPRINT` в клетках; «Аним./свет» — по виду объекта (огонь, дым, ворота, знамёна; свечение ночью); «Качество»: аудитов по отдельным объектам нет, отмечены только объекты из очереди `perspective.md` («Не сделано»). Варианты `kind__k` — кадры вида (сезонные, фракционные, наборы `__set-*`).", "");
  for (const k of CATEGORIES) {
    const list = c.objects.filter((e) => e.category === k);
    L.push(`## ${k[0].toUpperCase()}${k.slice(1)} (${list.length})`, "", HEAD, ...list.map(row), "");
  }
  const fl = (title: string, list: { id: string; name: string; reason: string }[], note: string) => {
    L.push(`## ${title} (${list.length})`, "", note, "");
    if (list.length) L.push("| id | Название | Причина |", "|---|---|---|", ...list.map((e) => `| \`${e.id}\` | ${e.name} | ${e.reason} |`));
    L.push("");
  };
  fl("Нужно скоро", c.soon, "Есть в манифесте, на картах не стоит, но удалять нельзя: свежая работа (7 дней), очередь доработки, флаги и системы (Цитадель v2, масштаб b147, герой Б), планы, наборы вариантов.");
  fl("Под вопросом", c.questionable, "Не удалены: есть косвенные ссылки (шаблоны в коде, инструменты показа и эталонов).");
  const un = c.unused as unknown as { id: string; name: string }[];
  L.push(`## Не используется (${un.length})`, "", un.length ? "Нет на картах, нет ссылок в коде и данных:" : "Пусто: нет объектов, которых нет на картах, в коде и в списках «скоро» (проверка — `tools/objects-catalog.ts`).", "");
  for (const e of un) L.push(`- \`${e.id}\` — ${e.name}`);
  L.push("", `## Удалено ${c.removed.date}`, "", "По решению владельца удалены кадры паков, которые не ставились ни на одну карту, не упоминались в коде, данных, планах и не были свежей работой или флагом (PNG, запись манифеста, строка `add(...)` в `tools/gen/vendor.ts`, атлас пересобран `tools/gen/atlas.ts`):", "");
  L.push(c.removed.ids.map((i) => `\`${i}\``).join(", "), "");
  L.push("Таблица аудита в `docs/art/scale.md` пересоберётся сама при следующем `tools/gen/scale147/audit.ts`.", "");
  fs.writeFileSync(path.join(root, "docs/art/objects.md"), L.join("\n"));
}
