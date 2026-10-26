/* Последнее сохранение в git, история файла и панель «Что изменится | История». */
import { $, el, S, api, doc, clone, changed, toast, labelFor, fmt, dirtyFiles, fileTitle } from "/lib.js";
import { modal, confirmDlg, diffBox } from "/diff.js";

let afterRestore = () => {};
export const onRestore = (fn) => { afterRestore = fn; };

const histCache = new Map();
export async function historyOf(name, force) {
  if (force || !histCache.has(name)) histCache.set(name, await api("/api/history?name=" + encodeURIComponent(name)));
  return histCache.get(name);
}
export const dropHistory = (name) => histCache.delete(name);
const when = (iso) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Строка в шапке файла + подсказка на кнопке отката. */
export async function fillLast(name, box) {
  try {
    const h = await historyOf(name);
    if (!h.length) { box.textContent = "Этот файл ещё не сохранялся в git."; return; }
    const c = h[0];
    box.textContent = `Последнее сохранение в git: ${when(c.date)} · ${c.subject}`;
    box.title = `${c.subject}\n${c.body || ""}\nАвтор: ${c.author}\nВерсия ${c.hash.slice(0, 8)}`.trim();
    const rv = $("#b-revert");
    if (rv) rv.title = `Файл вернётся к версии от ${when(c.date)} («${c.subject.slice(0, 80)}»). Все правки после неё пропадут.`;
  } catch { box.textContent = ""; }
}

function chain(file, path) {
  const data = doc(file).draft;
  const out = [];
  for (let i = Math.max(0, path.length - 3); i < path.length; i++) out.push(labelFor(file, path.slice(0, i + 1), data).text);
  return out.join(" › ");
}
const show = (v) => (v === undefined ? "— (нет)" : typeof v === "number" ? fmt(v) : typeof v === "boolean" ? (v ? "Да" : "Нет") : typeof v === "string" ? (v.length > 120 ? v.slice(0, 117) + "…" : v || "(пусто)") : JSON.stringify(v).slice(0, 120));

async function diffTab(box) {
  const files = dirtyFiles();
  if (!files.length) box.append(el("div", "empty-state", "Правок пока нет. Измените любое поле — здесь появится сравнение «было | стало»."));
  const list = el("div", "df-list");
  for (const f of files) {
    const r = await api("/api/preview", { name: f, data: doc(f).draft });
    const sec = el("section");
    sec.append(el("h3", "sec-h", `${fileTitle(f)} · data/${f}.json`), diffBox(r.before, r.after));
    list.append(sec);
  }
  box.append(list);
}

async function historyTab(box) {
  const name = S.cur;
  const list = await historyOf(name, true);
  const wrap = el("div", "hist");
  const left = el("div", "hist-list"), right = el("div", "hist-diff");
  wrap.append(left, right);
  box.append(wrap);
  if (!list.length) { left.append(el("div", "empty-state", "У файла нет истории в git.")); return; }
  right.append(el("div", "empty-state", "Выберите версию слева — покажу, что в ней поменялось."));
  list.forEach((c, i) => {
    const b = el("button", "card compact hist-item");
    b.append(el("div", "t", c.subject.slice(0, 140)), el("div", "p", `${when(c.date)} · ${c.author} · ${c.hash.slice(0, 8)}${i === 0 ? " · последняя" : ""}`));
    b.onclick = async () => {
      left.querySelectorAll(".hist-item").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      right.replaceChildren(el("div", "note", "Читаю версию…"));
      const d = await api(`/api/commit-diff?name=${encodeURIComponent(name)}&hash=${c.hash}`);
      right.replaceChildren();
      const head = el("div", "hd");
      head.append(el("h3", "sec-h", c.subject.slice(0, 200)), el("span", "note", `${when(c.date)} · ${c.author}`));
      if (c.body) head.append(el("p", "note", c.body.trim().slice(0, 600)));
      const rb = el("button", "btn danger", "Вернуть файл к этой версии");
      rb.onclick = () => confirmDlg("Вернуть файл к этой версии?", `Файл data/${name}.json станет таким, каким был после «${c.subject.slice(0, 80)}» (${when(c.date)}). Текущие правки в нём пропадут; git-индекс не затрагивается.`, "Вернуть", async () => {
        const r = await api("/api/revert", { name, hash: c.hash });
        const dd = doc(name); dd.orig = r.data; dd.draft = clone(r.data);
        dropHistory(name);
        afterRestore();
        changed();
        toast("Файл возвращён к версии от " + when(c.date));
      });
      head.append(rb);
      right.append(head);
      if (!d.items.length) { right.append(el("div", "empty-state", "В этой версии значения полей не менялись (только оформление файла).")); return; }
      const ul = el("div", "chg");
      for (const it of d.items) {
        const row = el("div", "chg-row");
        const nm = el("div", "nm"); nm.append(document.createTextNode(chain(name, it.path)), el("code", "", it.path.join(".")));
        const vals = el("div", "vals"); vals.append(el("span", "was", "было: " + show(it.before)), el("span", "arrow", "→"), el("span", "now", "стало: " + show(it.after)));
        row.append(nm, vals); ul.append(row);
      }
      right.append(ul);
      if (d.total > d.items.length) right.append(el("div", "note", `Показано ${d.items.length} из ${d.total} изменений.`));
    };
    left.append(b);
  });
}

/** Панель вкладками: «Что изменится» | «История». */
export async function panel(tab) {
  const body = el("div", "pan");
  const seg = el("div", "seg");
  const content = el("div", "pan-body");
  const draw = async (t) => {
    [...seg.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    content.replaceChildren();
    await (t === "diff" ? diffTab(content) : historyTab(content));
  };
  for (const [t, label] of [["diff", "Что изменится"], ["history", "История"]]) { const b = el("button", "seg-opt", label); b.dataset.t = t; b.onclick = () => draw(t); seg.append(b); }
  body.append(seg, content);
  modal(tab === "diff" ? "Что изменится" : "История файла", body, [["Закрыть", "primary", null]]);
  await draw(tab);
}
