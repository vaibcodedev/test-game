import type { Ctx, Doc, Rules } from "./types";
import { balanceRules, balanceTop } from "./balance";
import { mobsRules, mountsRules, patrolsRules, zoneBossRules, itemsRules } from "./content";
import { gameplayRules } from "./gameplay";
import { textsRules, checkTexts } from "./texts";
import { itemRulesRules } from "./itemRules";
import { guessDoc, humanize } from "./common";
import { evalCurve } from "./curve";

export type { Ctx, Doc } from "./types";
export { describeCurve, sampleCurve, evalCurve } from "./curve";
export { num } from "./fmt";

export const SECTIONS = ["Баланс", "Мобы", "Боссы", "Маунты", "Предметы", "Задания", "Патрули и отряды", "Города", "Лор", "Прочее"] as const;
export type Section = (typeof SECTIONS)[number];

/** Файл → раздел дерева и русское название. Файлы без записи попадают в «Прочее». */
export const FILE_META: Record<string, { section: Section; title: string; readonly?: boolean; virtual?: boolean }> = {
  balance: { section: "Баланс", title: "Баланс боя" },
  gameplay: { section: "Баланс", title: "Общие числа игры" },
  upgrade: { section: "Баланс", title: "Заточка" },
  server: { section: "Баланс", title: "Настройки сервера" },
  classes: { section: "Баланс", title: "Классы героев" },
  skills: { section: "Баланс", title: "Умения (общие)" },
  skills_aim: { section: "Баланс", title: "Умения: прицельные" },
  skills_archers: { section: "Баланс", title: "Умения: лучники" },
  skills_mages: { section: "Баланс", title: "Умения: маги" },
  skills_rogues: { section: "Баланс", title: "Умения: разбойники" },
  mobs: { section: "Мобы", title: "Мобы (только чтение)", readonly: true, virtual: true },
  mobAI: { section: "Мобы", title: "Поведение мобов" },
  bestiary: { section: "Мобы", title: "Бестиарий" },
  elites: { section: "Мобы", title: "Элитные мобы" },
  encounters: { section: "Мобы", title: "Встречи в мире" },
  biomes: { section: "Мобы", title: "Биомы" },
  "zone-bosses": { section: "Боссы", title: "Боссы стартовых земель" },
  "zone-boss-loot": { section: "Боссы", title: "Добыча боссов земель" },
  raid: { section: "Боссы", title: "Рейд" },
  mounts: { section: "Маунты", title: "Маунты" },
  "mount-art": { section: "Маунты", title: "Картинки маунтов" },
  pets: { section: "Маунты", title: "Питомцы" },
  "items-rules": { section: "Предметы", title: "Правила предметов" },
  items: { section: "Предметы", title: "Каталог экипировки" },
  "item-icons": { section: "Предметы", title: "Иконки предметов" },
  legendaries: { section: "Предметы", title: "Легендарные предметы" },
  food: { section: "Предметы", title: "Еда" },
  bags: { section: "Предметы", title: "Сумки" },
  bank: { section: "Предметы", title: "Банк" },
  "gear-fx": { section: "Предметы", title: "Эффекты экипировки" },
  "npc-gear": { section: "Предметы", title: "Одежда NPC" },
  quests: { section: "Задания", title: "Задания" },
  patrols: { section: "Патрули и отряды", title: "Патрули, стража, башни" },
  "ember-guard": { section: "Патрули и отряды", title: "Стража Эмберхолла" },
  "npc-ranks": { section: "Патрули и отряды", title: "Звания бойцов" },
  factions: { section: "Патрули и отряды", title: "Фракции" },
  cities: { section: "Города", title: "Города" },
  settlements: { section: "Города", title: "Поселения" },
  interiors: { section: "Города", title: "Интерьеры" },
  townfolk: { section: "Города", title: "Горожане" },
  world: { section: "Города", title: "Карта мира" },
  scenes: { section: "Города", title: "Сцены" },
  texts: { section: "Лор", title: "Тексты игры" },
  statues: { section: "Лор", title: "Статуи королей" },
  credits: { section: "Лор", title: "Титры" },
  "loading-tips": { section: "Лор", title: "Подсказки загрузки" },
  rumors: { section: "Лор", title: "Слухи" },
};
export const fileTitle = (f: string) => FILE_META[f]?.title ?? f;
export const fileSection = (f: string): Section => FILE_META[f]?.section ?? "Прочее";

const RULES: Record<string, Rules> = {
  balance: balanceRules,
  gameplay: gameplayRules,
  texts: textsRules,
  "items-rules": itemRulesRules,
  mobs: mobsRules,
  mounts: mountsRules,
  patrols: patrolsRules,
  "zone-bosses": zoneBossRules,
  items: itemsRules,
};
const COMPILED = new Map<string, { segs: string[]; doc: Doc; wild: number }[]>();
function compiled(file: string) {
  let c = COMPILED.get(file);
  if (!c) {
    c = (RULES[file] ?? []).map(([p, doc]) => { const segs = p.split("."); return { segs, doc, wild: segs.filter((s) => s === "*").length }; });
    COMPILED.set(file, c);
  }
  return c;
}
/** Путь для сопоставления: числовые индексы массивов → «[]». */
export const normPath = (path: string[]) => path.map((s) => (/^\d+$/.test(s) ? "[]" : s));

function match(file: string, path: string[]): Doc | undefined {
  const np = normPath(path);
  let best: { doc: Doc; wild: number } | undefined;
  for (const r of compiled(file)) {
    if (r.segs.length !== np.length) continue;
    let ok = true;
    for (let i = 0; i < np.length && ok; i++) if (r.segs[i] !== "*" && r.segs[i] !== np[i]) ok = false;
    if (ok && (!best || r.wild < best.wild)) best = r;
  }
  return best?.doc;
}

export interface Resolved { doc: Doc; explicit: boolean }
/** Объяснение поля: явное правило схемы или догадка по имени. */
export function resolve(file: string, path: string[], value: unknown): Resolved {
  const last = path[path.length - 1] ?? "";
  if (last.startsWith("_") || /_doc$/i.test(last)) {
    return { doc: { title: "Пояснение разработчика", what: "Служебный комментарий: объясняет, как устроен раздел. Показан для справки.", kind: "text", readonly: true }, explicit: true };
  }
  const d = match(file, path);
  if (d) return { doc: d, explicit: true };
  if (path.length === 0 && file === "balance") return { doc: { title: "Баланс боя", what: balanceTop[""] }, explicit: true };
  if (file === "balance" && path.length === 1 && balanceTop[path[0]]) return { doc: { title: humanize(path[0]), what: balanceTop[path[0]] }, explicit: true };
  return { doc: guessDoc(last, value, file), explicit: false };
}

/** Текст «о разделе» для объекта: его _doc или _<ключ>Doc у родителя. */
export function sectionDoc(parent: any, key: string | undefined, self: any): string | undefined {
  if (self && typeof self === "object" && typeof self._doc === "string") return self._doc;
  if (parent && key !== undefined) {
    for (const k of [`_${key}Doc`, `${key}_doc`, `_${key}_doc`]) if (typeof parent[k] === "string") return parent[k];
  }
  return undefined;
}

const CONTAINER_KINDS = new Set(["curve", "tuple", "numOrCurve", "json"]);
export const isContainerDoc = (d: Doc) => !!d.kind && CONTAINER_KINDS.has(d.kind);

export interface Leaf { path: string[]; value: unknown; explicit: boolean; doc: Doc }
/** Обход «листьев» формы: числа, строки, флаги и составные поля (кривые, пары), которые правятся целиком. */
export function leaves(file: string, data: any, visit: (l: Leaf) => void, path: string[] = []): void {
  const last = path[path.length - 1] ?? "";
  if (last.startsWith("_") && path.length) return;
  const r = path.length ? resolve(file, path, data) : { doc: {} as Doc, explicit: true };
  const prim = data === null || typeof data !== "object";
  if (path.length && (prim || (r.explicit && isContainerDoc(r.doc)))) { visit({ path, value: data, explicit: r.explicit, doc: r.doc }); return; }
  if (Array.isArray(data)) {
    if (data.every((x) => x === null || typeof x !== "object")) { if (path.length) visit({ path, value: data, explicit: r.explicit, doc: r.doc }); return; }
    data.forEach((x, i) => leaves(file, x, visit, [...path, String(i)]));
    return;
  }
  for (const k of Object.keys(data)) leaves(file, data[k], visit, [...path, k]);
}

/** Ключи файла, для которых нет явного объяснения (для тестов покрытия). */
export function uncovered(file: string, data: any): string[] {
  const out: string[] = [];
  leaves(file, data, (l) => { if (!l.explicit) out.push(l.path.join(".")); });
  return out;
}

export interface Problem { path: string; message: string }
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function checkCurve(pts: unknown, label: string, out: Problem[], p: string, positive: boolean) {
  if (!Array.isArray(pts) || !pts.length) { out.push({ path: p, message: `${label}: нужен список точек [уровень, значение].` }); return; }
  let prev = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1])) { out.push({ path: p, message: `${label}: точка ${i + 1} должна быть парой чисел [уровень, значение].` }); return; }
    if (pt[0] <= prev) out.push({ path: p, message: `${label}: уровни точек должны идти по возрастанию (точка ${i + 1}).` });
    prev = pt[0];
    if (positive && pt[1] <= 0) out.push({ path: p, message: `${label}: значение точки ${i + 1} должно быть больше нуля (кривая считается по логарифму).` });
  }
}

/** Проверка набора данных по схеме и по типам исходного файла. */
export function validate(file: string, data: any, original: any): Problem[] {
  const out: Problem[] = [];
  const typeOf = (x: unknown) => (x === null ? "null" : Array.isArray(x) ? "array" : typeof x);
  const walk = (cur: any, orig: any, path: string[]) => {
    const p = path.join(".");
    if (orig !== undefined && typeOf(cur) !== typeOf(orig)) { out.push({ path: p, message: `тип изменился: было «${typeOf(orig)}», стало «${typeOf(cur)}».` }); return; }
    const last = path[path.length - 1] ?? "";
    const r = path.length && !last.startsWith("_") ? resolve(file, path, cur) : undefined;
    const d = r?.doc;
    if (d && r!.explicit && (d.kind === "curve" || d.kind === "numOrCurve") && typeof cur !== "number") { checkCurve(cur, d.title, out, p, d.curve?.interp !== "lin"); if (Array.isArray(cur) && d.min !== undefined) for (const pt of cur) if (Array.isArray(pt) && isNum(pt[1]) && (pt[1] < d.min || (d.max !== undefined && pt[1] > d.max))) out.push({ path: p, message: `${d.title}: значение ${pt[1]} вне границ ${d.min}…${d.max ?? "∞"}.` }); return; }
    if (d && r!.explicit && d.kind === "tuple" && Array.isArray(cur)) {
      if (orig && Array.isArray(orig) && cur.length !== orig.length) out.push({ path: p, message: `${d.title}: нужно ${orig.length} числа, а их ${cur.length}.` });
      cur.forEach((x: unknown, i: number) => { if (!isNum(x)) out.push({ path: p, message: `${d.title}: элемент ${i + 1} — не число.` }); else rangeCheck(d, x, p); });
      return;
    }
    if (typeof cur === "number") {
      if (!Number.isFinite(cur)) { out.push({ path: p, message: "число не конечное." }); return; }
      if (d) rangeCheck(d, cur, p);
      return;
    }
    if (typeof cur === "string") { if (d?.kind === "enum" && d.options && !d.options.includes(cur)) out.push({ path: p, message: `${d.title}: «${cur}» не из списка (${d.options.join(", ")}).` }); return; }
    if (cur && typeof cur === "object" && !(d && r!.explicit && d.kind === "json")) {
      if (Array.isArray(cur)) cur.forEach((x, i) => walk(x, orig?.[i], [...path, String(i)]));
      else for (const k of Object.keys(cur)) walk(cur[k], orig?.[k], [...path, k]);
    }
  };
  const rangeCheck = (d: Doc, x: number, p: string) => {
    if (d.kind === "int" && !Number.isInteger(x)) out.push({ path: p, message: `${d.title}: нужно целое число, а не ${x}.` });
    if (d.min !== undefined && x < d.min) out.push({ path: p, message: `${d.title}: ${x} меньше допустимого ${d.min}.` });
    if (d.max !== undefined && x > d.max) out.push({ path: p, message: `${d.title}: ${x} больше допустимого ${d.max}.` });
  };
  walk(data, original, []);
  if (file === "texts") out.push(...checkTexts(data));
  return out;
}

/** Предупреждения: значение внутри границ, но вне «разумного диапазона». */
export function warnings(file: string, data: any): Problem[] {
  const out: Problem[] = [];
  leaves(file, data, (l) => {
    const d = l.doc;
    if (l.explicit && typeof l.value === "number" && d.sane && (l.value < d.sane[0] || l.value > d.sane[1])) out.push({ path: l.path.join("."), message: `${d.title}: ${l.value} вне разумного диапазона ${d.sane[0]}…${d.sane[1]} — так бывает, но проверьте.` });
  });
  return out;
}

export function ctxFor(bal: any, root: any, parent: any, path: string[]): Ctx { return { bal, root, parent, path }; }
export function liveText(file: string, path: string[], value: unknown, bal: any, root: any, parent: any): string {
  const { doc } = resolve(file, path, value);
  if (!doc.live) return "";
  try { return doc.live(value, ctxFor(bal, root, parent, path)); } catch { return ""; }
}
export const curveAt = evalCurve;

export { keyRu, groupOfKey, groupRank, ENTITIES, SECTION_ICON, KEY_RU } from "./names";
