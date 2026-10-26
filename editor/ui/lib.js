/* Общее: состояние, запросы, имена, подписки на изменения. */
import { resolve, liveText, keyRu, ctxFor } from "/schema.js";

export const $ = (s, r = document) => r.querySelector(s);
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const getAt = (root, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);
export function setAt(root, path, v) { getAt(root, path.slice(0, -1))[path[path.length - 1]] = v; }
export const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
export function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
export const fmt = (x) => (typeof x === "number" ? String(+x.toFixed(4)).replace(".", ",") : String(x));

/** Состояние: files — список, cur — открытый файл, docs — по файлам {orig, draft, readonly}. */
export const S = { files: [], cur: null, docs: new Map(), listeners: new Set(), tab: "general", sel: {} };

export async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json", "x-editor": "1" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok && !j.problems) throw new Error(j.error || r.statusText);
  return j;
}
export async function load(name) {
  if (S.docs.has(name)) return S.docs.get(name);
  const r = await api("/api/file?name=" + encodeURIComponent(name));
  const d = { orig: r.data, draft: clone(r.data), readonly: r.readonly };
  S.docs.set(name, d);
  return d;
}
export const doc = (name = S.cur) => S.docs.get(name);
export const fileInfo = (name) => S.files.find((f) => f.name === name);
export const fileTitle = (name) => fileInfo(name)?.title ?? name;
export const isDirty = (name) => { const d = S.docs.get(name); return !!d && !same(d.draft, d.orig); };
export const dirtyFiles = () => [...S.docs.keys()].filter(isDirty);

/** Число изменённых полей во всех файлах (по «листьям» схемы). */
export function changedCount(leavesFn) {
  let n = 0;
  for (const name of dirtyFiles()) { const d = S.docs.get(name); n += changedLeaves(name, d, leavesFn).length; }
  return n;
}
export function changedLeaves(name, d, leavesFn) {
  const out = [];
  leavesFn(name, d.draft, (l) => { if (!same(l.value, getAt(d.orig, l.path))) out.push(l); });
  // удалённые/добавленные ключи
  if (!out.length && !same(d.draft, d.orig)) out.push({ path: [], value: null, doc: { title: "Структура файла" } });
  return out;
}

/** Подписчики на изменения: пересчёт живых строк, счётчиков. */
export const onChange = (fn) => S.listeners.add(fn);
export function changed() { for (const fn of S.listeners) fn(); }

/** balance.json для объяснений: черновик, если загружен. */
export const bal = () => S.docs.get("balance")?.draft ?? null;

/** Русское имя последнего звена пути: название из карточки, имя объекта в данных или перевод ключа. */
export function labelFor(file, path, data) {
  const key = path[path.length - 1];
  const v = getAt(data, path);
  if (v && typeof v === "object" && typeof v.name === "string") return { text: v.name, key, known: true };
  const r = resolve(file, path, v);
  if (r.explicit && r.doc.title && !/^Пояснение/.test(r.doc.title)) return { text: r.doc.title, key, known: true };
  const k = keyRu(key);
  return { text: k.text, key, known: k.known };
}
export const liveFor = (file, path, value, root) => liveText(file, path, value, bal(), root, getAt(root, path.slice(0, -1)));

export const sectionOf = (name) => fileInfo(name)?.section;

export function toast(text, cls = "") {
  const t = el("div", "toast ed-toast " + cls, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}
export { resolve, ctxFor };
