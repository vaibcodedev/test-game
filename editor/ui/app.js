/* Редактор конфигов: оболочка (поиск, разделы, главная область, нижняя панель). */
import { $, el, S, api, load, doc, clone, same, getAt, isDirty, dirtyFiles, fileInfo, fileTitle, onChange, changed, changedLeaves, toast } from "/lib.js";
import { leaves, SECTIONS, SECTION_ICON, keyRu } from "/schema.js";
import { resetCards } from "/fields.js";
import { renderObject, renderEntities, entityConf } from "/views.js";
import { modal, close, confirmDlg, diffBox } from "/diff.js";
import { openSearch, ensureIndex } from "/search.js";
import { panel, fillLast, onRestore, dropHistory } from "/history.js";

const leavesFn = (name, data, visit) => leaves(name, data, visit);

/* ---------------- разделы слева ---------------- */
const openSecs = new Set(["Баланс"]);
function renderRail() {
  const r = $("#rail");
  r.replaceChildren();
  for (const sec of SECTIONS) {
    const files = S.files.filter((f) => f.section === sec);
    if (!files.length) continue;
    const here = files.some((f) => f.name === S.cur);
    const dirty = files.filter((f) => isDirty(f.name)).length;
    const nav = el("button", "nav" + (here ? " on" : ""));
    nav.append(el("span", "ic", SECTION_ICON[sec] ?? "•"), el("span", "", sec));
    if (dirty) nav.append(el("span", "chip warn", String(dirty)));
    nav.onclick = () => { if (openSecs.has(sec) && !here) openSecs.delete(sec); else openSecs.add(sec); renderRail(); };
    r.append(nav);
    if (openSecs.has(sec) || here) for (const f of files) {
      const b = el("button", "nav sub" + (f.name === S.cur ? " on" : ""));
      b.append(el("span", "", f.title));
      if (isDirty(f.name)) b.append(el("span", "chip warn", "изм."));
      else if (f.readonly) b.append(el("span", "chip dim", "чтение"));
      b.onclick = () => openFile(f.name);
      r.append(b);
    }
  }
}

/* ---------------- открытие файла ---------------- */
async function openFile(name, tab) {
  await load(name);
  S.cur = name;
  S.tab = tab ?? (entityConf(name) ? "list" : "general");
  openSecs.add(fileInfo(name).section);
  history.replaceState(null, "", "#" + name);
  renderRail();
  renderMain();
}
function renderMain() {
  const name = S.cur, dd = doc(name), info = fileInfo(name);
  const head = $("#head");
  head.replaceChildren();
  const h = el("div", "h-left");
  h.append(el("h1", "", info.title));
  h.append(el("span", "chip dim", `data/${name}.json`));
  if (dd.readonly) h.append(el("span", "chip dim", "только чтение"));
  const st = el("span", "chip warn", "");
  st.id = "file-state";
  h.append(st);
  head.append(h);
  const last = el("div", "h-last", "");
  head.append(last);
  if (!dd.readonly) fillLast(name, last);
  const conf = entityConf(name);
  const right = el("div", "h-right");
  if (conf) {
    const seg = el("div", "seg");
    for (const [id, label] of [["list", conf.label], ["general", "Общие настройки"]]) {
      const b = el("button", "seg-opt", label); b.setAttribute("aria-pressed", String(S.tab === id));
      b.onclick = () => { S.tab = id; renderMain(); };
      seg.append(b);
    }
    right.append(seg);
  }
  if (!dd.readonly) {
    const hb = el("button", "btn small", "История"); hb.onclick = () => panel("history"); right.append(hb);
    const rv = el("button", "btn small danger", "Откатить файл к последнему коммиту"); rv.id = "b-revert"; rv.onclick = revertFile; right.append(rv);
  }
  head.append(right);
  const box = $("#content");
  box.replaceChildren();
  resetCards();
  const frag = el("div", "inspector");
  if (conf && S.tab === "list") renderEntities(name, conf, frag);
  else renderObject(name, [], frag, 0, conf ? [conf.path[0]] : []);
  if (!frag.childNodes.length) frag.append(el("div", "empty-state", "В этом файле нет настроек, доступных для правки."));
  box.append(frag);
  box.scrollTop = 0;
  // раскрыть первую группу, если ничего не раскрыто
  const first = box.querySelector("details.grp");
  if (first && !box.querySelector("details.grp[open]") && !conf) { first.open = true; first._build?.(); }
  refreshBar();
}

/* ---------------- переход к полю (поиск) ---------------- */
async function navigate(file, path) {
  const conf = entityConf(file);
  const inEntity = conf && path.length > conf.path.length && conf.path.every((s, i) => path[i] === s);
  await openFile(file, inEntity ? "list" : "general");
  if (inEntity) {
    const wrap = $("#content .ent");
    wrap?.selectEntity?.(path[conf.path.length]);
  }
  for (let i = 1; i < path.length; i++) {
    const d = document.querySelector(`details.grp[data-path="${CSS.escape(path.slice(0, i).join("."))}"]`);
    if (d) { d.open = true; d._build?.(); }
  }
  const f = document.querySelector(`.fc[data-file="${file}"][data-path="${CSS.escape(path.join("."))}"]`);
  if (f) { f.scrollIntoView({ block: "center", behavior: "auto" }); f.classList.add("flash"); setTimeout(() => f.classList.remove("flash"), 2200); f.querySelector("input,select,textarea")?.focus({ preventScroll: true }); }
}

/* ---------------- нижняя панель ---------------- */
let raf = 0;
function refreshBar() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const files = dirtyFiles();
    let n = 0;
    for (const f of files) n += changedLeaves(f, doc(f), leavesFn).length;
    $("#bar-info").replaceChildren(n ? Object.assign(el("b", "", `Изменено: ${n} ${n % 10 === 1 && n % 100 !== 11 ? "поле" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 20) ? "поля" : "полей"}`), {}) : el("span", "", "Изменений нет"), el("span", "", files.length ? ` в ${files.length} ${files.length === 1 ? "файле" : "файлах"}: ${files.map(fileTitle).join(", ")}` : " — правки появятся здесь, пока вы не нажмёте «Сохранить»"));
    $("#top-chip").hidden = !n;
    $("#top-chip").textContent = `Изменено: ${n}`;
    for (const id of ["b-diff", "b-undo", "b-save"]) $("#" + id).disabled = !n;
    const fs = $("#file-state");
    if (fs) { const k = S.cur && isDirty(S.cur) ? changedLeaves(S.cur, doc(S.cur), leavesFn).length : 0; fs.hidden = !k; fs.textContent = `изменено: ${k}`; }
    renderRailMarks();
  });
}
function renderRailMarks() { document.querySelectorAll("#rail .nav.sub").forEach((b) => { const f = S.files.find((x) => x.title === b.firstChild.textContent); if (!f) return; const has = b.querySelector(".chip"); const d = isDirty(f.name); if (d && !has) b.append(el("span", "chip warn", "изм.")); if (!d && has && has.classList.contains("warn")) has.remove(); }); }
onChange(refreshBar);

/* ---------------- действия ---------------- */
const preview = () => panel("diff");
function undoAll() {
  confirmDlg("Отменить все правки?", `Все несохранённые изменения (${dirtyFiles().length} файл.) пропадут; файлы на диске не меняются.`, "Отменить правки", () => {
    for (const f of dirtyFiles()) { const d = doc(f); d.draft = clone(d.orig); }
    renderMain(); renderRail(); changed();
  });
}
const problemRow = (p) => { const li = el("li", "c-bad"); li.append(document.createTextNode(p.message + " "), el("code", "", p.path || "файл")); return li; };
function markBad(problems) {
  document.querySelectorAll(".fc.bad").forEach((x) => x.classList.remove("bad"));
  for (const p of problems) document.querySelector(`.fc[data-path="${CSS.escape(p.path)}"]`)?.classList.add("bad");
}
async function check() {
  const files = dirtyFiles().length ? dirtyFiles() : [S.cur];
  const box = el("div", "report");
  let bad = [];
  for (const f of files) {
    const r = await api("/api/validate", { name: f, data: doc(f).draft });
    const sec = el("section", "card compact");
    sec.append(el("h3", "sec-h", fileTitle(f)));
    if (r.problems.length) { const ul = el("ul"); r.problems.forEach((p) => ul.append(problemRow(p))); sec.append(el("b", "c-bad", `Ошибок: ${r.problems.length}`), ul); if (f === S.cur) bad = bad.concat(r.problems); }
    else sec.append(el("span", "c-ok", "✓ Все значения в границах, типы на месте."));
    if (r.warnings.length) { const ul = el("ul"); r.warnings.forEach((p) => { const li = el("li", "c-warn"); li.append(document.createTextNode(p.message + " "), el("code", "", p.path)); ul.append(li); }); sec.append(el("b", "c-warn", `Предупреждения: ${r.warnings.length}`), ul); }
    box.append(sec);
  }
  markBad(bad);
  const tsc = el("section", "card compact");
  tsc.append(el("h3", "sec-h", "Проверка проекта (tsc)"), el("span", "note", "Идёт проверка… tsc читает сохранённые файлы; несохранённые правки в неё не входят."));
  box.append(tsc);
  modal("Проверка", box, [["Закрыть", "primary", null]]);
  try {
    const t = await api("/api/tsc", {});
    tsc.replaceChildren(el("h3", "sec-h", "Проверка проекта (tsc)"), t.ok ? el("span", "c-ok", `✓ Ошибок нет (${(t.ms / 1000).toFixed(0)} с).`) : el("pre", "c-bad", t.output.slice(0, 4000)));
  } catch (e) { tsc.replaceChildren(el("h3", "sec-h", "Проверка проекта (tsc)"), el("span", "c-bad", e.message)); }
}
async function saveAll() {
  const files = dirtyFiles();
  const box = el("div", "df-list");
  let failed = false;
  for (const f of files) {
    const dd = doc(f);
    const r = await api("/api/save", { name: f, data: dd.draft });
    const sec = el("section");
    sec.append(el("h3", "sec-h", `${fileTitle(f)} · data/${f}.json`));
    if (!r.ok) { failed = true; const ul = el("ul"); r.problems.forEach((p) => ul.append(problemRow(p))); sec.append(el("b", "c-bad", "Не сохранено"), ul); if (f === S.cur) markBad(r.problems); box.append(sec); continue; }
    dd.orig = clone(dd.draft);
    sec.append(r.changed ? diffBox(r.before, r.after) : el("span", "c-ok", "Изменений нет."));
    if (r.warnings.length) sec.append(el("span", "c-warn", `Предупреждений: ${r.warnings.length}`));
    box.append(sec);
  }
  modal(failed ? "Сохранено не всё" : "Сохранено", box, [["Закрыть", "primary", null]]);
  renderMain(); renderRail(); changed();
}
function revertFile() {
  const name = S.cur;
  confirmDlg("Откатить файл?", `Файл data/${name}.json вернётся к состоянию последнего коммита. Правки в нём (и сохранённые, и несохранённые) пропадут.`, "Откатить", async () => {
    const r = await api("/api/revert", { name });
    const d = doc(name); d.orig = r.data; d.draft = clone(r.data);
    dropHistory(name);
    renderMain(); renderRail(); changed();
    toast("Файл возвращён к последнему коммиту");
  });
}

/* ---------------- запуск ---------------- */
async function init() {
  onRestore(() => { renderMain(); renderRail(); });
  S.files = await api("/api/files");
  await load("balance");
  $("#b-diff").onclick = preview; $("#b-undo").onclick = undoAll; $("#b-check").onclick = check; $("#b-save").onclick = saveAll;
  $("#search-btn").onclick = () => openSearch(navigate);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(navigate); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirtyFiles().length) saveAll(); }
  });
  const hash = decodeURIComponent(location.hash.slice(1));
  await openFile(S.files.some((f) => f.name === hash) ? hash : "balance");
  window.__editor = { panel, openFile, navigate, S, openSearch: () => openSearch(navigate), ensureIndex, preview, check, diffBox, modal, close };
}
init().catch((e) => { document.body.textContent = "Ошибка запуска: " + e.message; console.error(e); });
void getAt; void same; void keyRu;
