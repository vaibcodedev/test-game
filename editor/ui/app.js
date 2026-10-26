import { resolve, liveText, sectionDoc, isContainerDoc, SECTIONS, describeCurve, evalCurve, num } from "/schema.js";

const $ = (s, r = document) => r.querySelector(s);
const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const getAt = (root, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);
function setAt(root, path, v) { const p = getAt(root, path.slice(0, -1)); p[path[path.length - 1]] = v; }
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

const state = { files: [], name: null, orig: null, draft: null, readonly: false, bal: null, bindings: [], tsc: null };

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json", "x-editor": "1" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok && !j.problems) throw new Error(j.error || r.statusText);
  return j;
}

/* ---------------- дерево ---------------- */
function renderTree() {
  const t = $("#tree");
  t.replaceChildren();
  t.append(el("p", "note", "Пепельный Предел · data/*.json"));
  for (const sec of SECTIONS) {
    const files = state.files.filter((f) => f.section === sec);
    if (!files.length) continue;
    const d = el("details", "disclosure ed-group");
    d.open = files.some((f) => f.name === state.name) || sec === "Баланс" || sec === "Мобы";
    const s = el("summary", "sec-h", sec);
    s.append(el("span", "badge", String(files.length)));
    const body = el("div", "disclosure-body");
    d.append(s, body);
    for (const f of files) {
      const b = el("button", "btn block tree-file" + (isDirty(f.name) ? " dirty" : ""));
      b.setAttribute("aria-pressed", String(f.name === state.name));
      b.dataset.file = f.name;
      b.append(el("span", "lbl", f.title), el("span", "chip warn dirty-chip", "изменён"));
      if (f.readonly) b.append(el("span", "chip dim", "чтение"));
      b.onclick = () => openFile(f.name);
      body.append(b);
    }
    t.append(d);
  }
}
const drafts = new Map();
function isDirty(name) {
  if (name === state.name) return state.draft && !same(state.draft, state.orig);
  const d = drafts.get(name);
  return !!d && !same(d.draft, d.orig);
}

async function openFile(name) {
  if (state.name && state.draft) drafts.set(state.name, { draft: state.draft, orig: state.orig });
  state.name = name;
  const kept = drafts.get(name);
  const info = state.files.find((f) => f.name === name);
  if (kept) { state.draft = kept.draft; state.orig = kept.orig; state.readonly = info.readonly; }
  else {
    const r = await api("/api/file?name=" + encodeURIComponent(name));
    state.orig = r.data; state.draft = clone(r.data); state.readonly = r.readonly;
  }
  if (name === "balance") state.bal = state.draft;
  $("#report").hidden = true;
  renderTree();
  renderMain();
}
/** balance.json для объяснений: черновик, если он открыт, иначе загруженный. */
const bal = () => (state.name === "balance" ? state.draft : state.bal);

/* ---------------- шапка ---------------- */
function renderMain() {
  const info = state.files.find((f) => f.name === state.name);
  $("#title").textContent = info.title;
  $("#path").textContent = `data/${state.name}.json`;
  $("#foot-info").textContent = state.readonly ? "Только чтение: числа берутся из shared/mobs.ts" : "Правки копятся в окне; на диск пишет только «Сохранить».";
  const bar = $("#bar");
  bar.replaceChildren();
  const acts = el("div", "actions");
  const mk = (label, cls, fn, id) => { const b = el("button", "btn " + cls, label); b.id = id; b.onclick = fn; return b; };
  if (!state.readonly) {
    acts.append(mk("Проверить", "", doCheck, "b-check"), mk("Откатить файл", "danger", doRevert, "b-revert"), mk("Сохранить", "primary", doSave, "b-save"));
  } else acts.append(mk("Проверить", "", doCheck, "b-check"));
  bar.append(acts);
  renderForm();
}

function renderForm() {
  const f = $("#form");
  const top = f.scrollTop;
  f.replaceChildren();
  state.bindings = [];
  f.append(renderNode([], state.draft, null, 0));
  refreshLive();
  f.scrollTop = top;
}

/* ---------------- живые подсказки ---------------- */
function refreshLive() {
  for (const b of state.bindings) {
    const v = getAt(state.draft, b.path);
    if (b.live) b.live.textContent = liveText(state.name, b.path, v, bal(), state.draft, getAt(state.draft, b.path.slice(0, -1)));
    if (b.box) {
      b.box.classList.toggle("mod", !same(v, getAt(state.orig, b.path)));
    }
    if (b.lim && typeof v === "number" && b.doc.sane) b.lim.querySelector(".sane")?.classList.toggle("odd", v < b.doc.sane[0] || v > b.doc.sane[1]);
  }
  const dirty = isDirty(state.name);
  document.querySelector(`.tree-file[data-file="${state.name}"]`)?.classList.toggle("dirty", !!dirty);
}
function bind(b) { state.bindings.push(b); return b; }
function changed() { refreshLive(); }

/* ---------------- форма ---------------- */
function renderNode(path, value, parent, depth) {
  const key = path[path.length - 1];
  const { doc, explicit } = resolve(state.name, path, value);
  if (path.length && isContainerDoc(doc) && explicit) return renderField(path, value, doc);
  if (value === null || typeof value !== "object") return renderField(path, value, doc);
  if (Array.isArray(value) && value.every((x) => x === null || typeof x !== "object")) return renderField(path, value, { ...doc, kind: "json" });
  const rows = tableRows(path, value);
  const wrap = el("details", "card disclosure ed-sec");
  wrap.open = depth < 1 || !!rows;
  wrap.dataset.path = path.join(".");
  const sum = el("summary", "sec-h", explicit && path.length ? doc.title : titleOf(key, path));
  if (path.length) sum.append(el("span", "chip dim", path.join(".")));
  const count = Array.isArray(value) ? value.length : Object.keys(value).filter((k) => !k.startsWith("_")).length;
  sum.append(el("span", "sec-aside", `${count} ${Array.isArray(value) ? "эл." : "полей"}`));
  wrap.append(sum);
  const inner = el("div", "disclosure-body");
  wrap.append(inner);
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const own = sectionDoc(parent, key, value) || (explicit && doc.what && path.length ? doc.what : "");
    if (own) inner.append(noteEl(own));
    if (rows) { inner.append(renderTable(path, value, rows)); return; }
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.keys(value).filter((k) => !k.startsWith("_")).map((k) => [k, value[k]]);
    for (const [k, v] of entries) {
      if (/_doc$/i.test(k) && typeof v === "string") { inner.append(noteEl(v)); continue; }
      const n = noteFor(value, k);
      if (n) inner.append(noteEl(n));
      inner.append(renderNode([...path, k], v, value, depth + 1));
    }
  };
  wrap._build = () => { build(); refreshLive(); };
  if (wrap.open) build();
  wrap.addEventListener("toggle", () => { if (wrap.open) { build(); refreshLive(); } });
  return wrap;
}
const noteFor = (obj, k) => (Array.isArray(obj) ? "" : obj["_" + k + "Doc"] || obj[k + "_doc"] || "");
const titleOf = (key, path) => (path.length === 0 ? fileTitleNow() : key && /^\d+$/.test(key) ? `№ ${Number(key) + 1}` : key);
const fileTitleNow = () => state.files.find((f) => f.name === state.name)?.title ?? state.name;
function noteEl(text) {
  const n = el("p", "note");
  n.textContent = text;
  return n;
}

function limLine(doc) {
  const parts = [];
  if (doc.unit) parts.push(`единицы: ${doc.unit}`);
  if (doc.min !== undefined || doc.max !== undefined) parts.push(`границы: ${doc.min ?? "−∞"} … ${doc.max ?? "∞"}`);
  if (doc.sane) parts.push(`разумно: ${doc.sane[0]} … ${doc.sane[1]}`);
  return parts;
}

function renderField(path, value, doc) {
  const box = el("div", "card compact fld");
  box.dataset.path = path.join(".");
  const head = el("div", "fld-head");
  head.append(el("span", "card-title", doc.title), el("span", "chip dim", path.join(".")));
  box.append(head);
  const ro = state.readonly || doc.readonly;
  const kind = doc.kind ?? (typeof value === "number" ? "num" : typeof value === "boolean" ? "bool" : typeof value === "string" ? "text" : "json");
  const ctl = el("div", "fld-ctl");
  const live = el("div", "fld-live c-gold");
  const b = bind({ path, doc, box, live });
  const set = (v) => { setAt(state.draft, path, v); changed(); };

  if (kind === "num" || kind === "int") {
    const v0 = Number(value);
    const input = el("input", "input num");
    input.type = "number";
    input.value = String(v0);
    if (doc.step) input.step = String(doc.step); else input.step = "any";
    if (doc.min !== undefined) input.min = String(doc.min);
    if (doc.max !== undefined) input.max = String(doc.max);
    input.disabled = ro;
    const lim = sliderRange(doc, v0);
    let range = null;
    if (lim) {
      range = el("input", "range");
      range.type = "range";
      range.min = String(lim[0]); range.max = String(lim[1]);
      range.step = String(doc.step || (lim[1] - lim[0]) / 200);
      range.value = String(v0);
      range.disabled = ro;
      const fill = () => range.style.setProperty("--p", `${((Number(range.value) - lim[0]) / (lim[1] - lim[0])) * 100}%`);
      fill();
      range.oninput = () => { const n = round(Number(range.value), doc); input.value = String(n); fill(); set(n); };
      ctl.append(range);
      b.fill = fill;
    }
    input.oninput = () => {
      const n = Number(input.value);
      if (input.value === "" || !Number.isFinite(n)) return;
      if (range) { range.value = String(n); b.fill?.(); }
      set(n);
    };
    ctl.append(input);
    if (doc.unit) ctl.append(el("span", "chip dim", doc.unit));
  } else if (kind === "bool") {
    const c = el("input");
    c.type = "checkbox"; c.className = "chk"; c.checked = !!value; c.disabled = ro;
    c.onchange = () => set(c.checked);
    ctl.append(c, el("span", "unit", "включено / выключено"));
  } else if (kind === "enum") {
    const s = el("select", "input");
    for (const o of doc.options ?? []) { const op = el("option", "", o === "" ? "(пусто)" : o); op.value = o; s.append(op); }
    if (!(doc.options ?? []).includes(value)) { const op = el("option", "", String(value)); op.value = value; s.append(op); }
    s.value = value; s.disabled = ro;
    s.onchange = () => set(s.value);
    ctl.append(s);
  } else if (kind === "curve") {
    box.append(ctl);
    ctl.replaceWith(curveEditor(path, value, doc, b, ro));
  } else if (kind === "tuple") {
    box.append(ctl);
    ctl.replaceWith(tupleEditor(path, value, doc, set, ro));
  } else if (kind === "numOrCurve") {
    box.append(ctl);
    ctl.replaceWith(numOrCurveEditor(path, value, doc, b, set, ro));
  } else if (kind === "text") {
    const long = String(value).length > 70;
    const i = el(long ? "textarea" : "input", long ? "text" : "input wide");
    if (!long) i.type = "text";
    i.value = String(value); i.disabled = ro;
    i.oninput = () => set(i.value);
    ctl.append(i);
  } else {
    const t = el("textarea", "json");
    t.value = JSON.stringify(value, null, 1);
    t.rows = Math.min(10, t.value.split("\n").length + 1);
    t.disabled = ro;
    t.oninput = () => {
      try { const v = JSON.parse(t.value); t.removeAttribute("aria-invalid"); set(v); } catch { t.setAttribute("aria-invalid", "true"); }
    };
    ctl.append(t);
  }
  if (ctl.isConnected === false && !box.contains(ctl) && ctl.childNodes.length) box.append(ctl);
  box.append(live);
  box.append(el("p", "card-text", doc.what));
  const lims = limLine(doc);
  if (lims.length) {
    const l = el("div", "card-sub fld-lim");
    l.append(document.createTextNode(lims.filter((x) => !x.startsWith("разумно")).join(" · ")));
    if (doc.sane) { const s = el("span", "sane", (lims.length > 1 || !doc.sane ? " · " : "") + `разумно: ${doc.sane[0]} … ${doc.sane[1]}`); l.append(s); }
    box.append(l);
    b.lim = l;
  }
  if (doc.up || doc.down || doc.links || doc.seen) {
    const more = el("details", "disclosure fld-more");
    more.append(el("summary", "card-sub", "Подробнее: что будет, с чем связано, где видно"));
    const g = el("dl", "kv plain");
    const row = (k, v) => { if (v && v !== "—") { g.append(el("dt", "", k), el("dd", "", v)); } };
    row("Если поставить больше", doc.up);
    row("Если поставить меньше", doc.down);
    row("С чем связано", doc.links);
    row("Где видно в игре", doc.seen);
    more.append(g);
    box.append(more);
    box.addEventListener("focusin", () => { if (!more.open) more.open = true; });
  }
  return box;
}
const round = (n, doc) => { if (doc.kind === "int") return Math.round(n); const st = doc.step || 0; const dec = st ? Math.max(0, Math.ceil(-Math.log10(st) - 1e-9)) : 4; return +n.toFixed(Math.min(8, dec)); };
function sliderRange(doc, v) {
  let lo = doc.min, hi = doc.max;
  if (doc.sane) { lo = lo !== undefined ? Math.max(lo, Math.min(doc.sane[0], v)) : Math.min(doc.sane[0], v); hi = hi !== undefined ? Math.min(hi, Math.max(doc.sane[1], v)) : Math.max(doc.sane[1], v); }
  if (lo === undefined || hi === undefined || !(hi > lo)) return null;
  if (!doc.sane && hi - lo > 5000) return null;
  return [Math.min(lo, v), Math.max(hi, v)];
}

/* ---------------- кривая «уровень — значение» ---------------- */
function curveSvg(pts, doc) {
  const W = 520, H = 72, ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "curve-svg");
  if (!pts.length || pts.some((p) => !Array.isArray(p) || !(p[1] > 0))) return svg;
  const interp = doc.curve?.interp ?? "log";
  const xs = Array.from({ length: 100 }, (_, i) => i + 1), ys = xs.map((L) => evalCurve(pts, L, interp));
  const lo = Math.min(...ys), hi = Math.max(...ys), ly = (y) => Math.log(y);
  const sx = (x) => 10 + ((x - 1) / 99) * (W - 20), sy = (y) => (hi === lo ? H / 2 : H - 10 - ((ly(y) - ly(lo)) / (ly(hi) - ly(lo))) * (H - 20));
  const pl = document.createElementNS(ns, "polyline");
  pl.setAttribute("points", xs.map((x, i) => `${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(" "));
  svg.append(pl);
  for (const [l, v] of pts) { const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", sx(Math.min(100, Math.max(1, l)))); c.setAttribute("cy", sy(v)); c.setAttribute("r", 3); svg.append(c); }
  svg.setAttribute("aria-label", `уровни 1…100, значения ${num(lo, 2)}…${num(hi, 2)}`);
  return svg;
}
function curveEditor(path, pts, doc, b, ro) {
  const wrap = el("div", "curve");
  const draw = () => {
    wrap.replaceChildren();
    const list = el("div", "pts");
    pts.forEach((p, i) => {
      const r = el("div", "pt");
      const mk = (idx, label) => {
        const inp = el("input", "input num"); inp.type = "number"; inp.step = "any"; inp.value = String(p[idx]); inp.disabled = ro;
        inp.oninput = () => { const n = Number(inp.value); if (inp.value === "" || !Number.isFinite(n)) return; p[idx] = n; changed(); redrawSvg(); };
        r.append(el("span", "lbl", label), inp);
      };
      mk(0, "уровень"); mk(1, "значение");
      if (!ro && pts.length > 1) { const x = el("button", "btn small icon", "×"); x.title = "Убрать точку"; x.onclick = () => { pts.splice(i, 1); changed(); draw(); }; r.append(x); }
      list.append(r);
    });
    wrap.append(list);
    if (!ro) {
      const acts = el("div", "row-acts");
      const add = el("button", "btn small", "+ точка");
      add.onclick = () => { const last = pts[pts.length - 1]; pts.push([Math.min(100, (last?.[0] ?? 0) + 10), last?.[1] ?? 1]); changed(); draw(); };
      acts.append(add);
      wrap.append(acts);
    }
    wrap.append(svgHolder);
    redrawSvg();
  };
  const svgHolder = el("div");
  const redrawSvg = () => svgHolder.replaceChildren(curveSvg(pts, doc));
  // ссылка на массив в черновике: правим на месте
  draw();
  return wrap;
}
function tupleEditor(path, arr, doc, set, ro) {
  const wrap = el("div", "pts");
  arr.forEach((x, i) => {
    const r = el("div", "pt");
    const inp = el("input", "input num"); inp.type = "number"; inp.step = String(doc.step ?? "any"); inp.value = String(x); inp.disabled = ro;
    inp.oninput = () => { const n = Number(inp.value); if (inp.value === "" || !Number.isFinite(n)) return; arr[i] = n; changed(); };
    r.append(el("span", "lbl", doc.labels?.[i] ?? `№ ${i + 1}`), inp);
    wrap.append(r);
  });
  return wrap;
}
function numOrCurveEditor(path, value, doc, b, set, ro) {
  const wrap = el("div", "nc");
  const draw = () => {
    wrap.replaceChildren();
    const cur = getAt(state.draft, path);
    const seg = el("div", "seg");
    const isCurve = Array.isArray(cur);
    const mk = (label, on, fn) => { const x = el("button", "seg-opt", label); x.setAttribute("aria-pressed", String(on)); x.disabled = ro; x.onclick = fn; return x; };
    seg.append(
      mk("Одно число на всех уровнях", !isCurve, () => { if (isCurve) { set(cur[0]?.[1] ?? 1); draw(); } }),
      mk("Кривая по уровням", isCurve, () => { if (!isCurve) { set([[30, cur], [100, cur]]); draw(); } }),
    );
    wrap.append(seg);
    if (isCurve) wrap.append(curveEditor(path, cur, doc, b, ro));
    else {
      const r = el("div", "fld-ctl");
      const input = el("input", "input num"); input.type = "number"; input.step = String(doc.step ?? "any"); input.value = String(cur); input.disabled = ro;
      const lim = sliderRange(doc, cur);
      let range = null;
      if (lim) {
        range = el("input", "range"); range.type = "range"; range.min = lim[0]; range.max = lim[1]; range.step = doc.step || 0.01; range.value = cur; range.disabled = ro;
        const fill = () => range.style.setProperty("--p", `${((Number(range.value) - lim[0]) / (lim[1] - lim[0])) * 100}%`);
        fill();
        range.oninput = () => { const n = round(Number(range.value), doc); input.value = String(n); fill(); set(n); };
        r.append(range);
      }
      input.oninput = () => { const n = Number(input.value); if (input.value === "" || !Number.isFinite(n)) return; if (range) range.value = String(n); set(n); };
      r.append(input, el("span", "unit", doc.unit || ""));
      wrap.append(r);
    }
  };
  draw();
  return wrap;
}

/* ---------------- таблицы ---------------- */
const PREF = ["id", "name", "level", "lvl", "hp", "dmg", "armor", "xp", "gold", "speed", "aggro", "range", "attackCd", "radius", "tier", "faction", "price", "cat", "source"];
const TABLES = { items: [["models"]], mounts: [["mounts"]], "zone-bosses": [["bosses"]], mobs: [["mobs"]] };
function tableRows(path, value) {
  const listed = (TABLES[state.name] || []).some((p) => p.length === path.length && p.every((s, i) => s === path[i]));
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.keys(value).filter((k) => !k.startsWith("_")).map((k) => [k, value[k]]);
  if (!entries.length || !entries.every(([, v]) => isObj(v))) return null;
  if (listed || entries.length >= 30) return entries;
  return null;
}
function renderTable(path, value, entries) {
  const wrap = el("div", "tbl-wrap");
  const tools = el("div", "tbl-tools");
  const search = el("input", "input"); search.type = "search"; search.placeholder = "Поиск по любому полю…";
  const count = el("span", "dim");
  tools.append(search, count);
  const scroll = el("div", "tbl-wrap");
  const table = el("table", "tbl");
  scroll.append(table);
  wrap.append(tools, scroll);
  const cols = [];
  for (const [, v] of entries.slice(0, 40)) for (const k of Object.keys(v)) if (!cols.includes(k) && (v[k] === null || typeof v[k] !== "object") && !k.startsWith("_")) cols.push(k);
  const rank = (c) => { const i = PREF.indexOf(c); return i < 0 ? 99 : i; };
  cols.sort((a, b) => rank(a) - rank(b));
  const shown = cols.slice(0, 11);
  let sort = null, limit = 80;
  const firstKey = entries[0][0];
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    let rows = entries.filter(([k, v]) => !q || k.toLowerCase().includes(q) || shown.some((c) => String(v[c] ?? "").toLowerCase().includes(q)) || JSON.stringify(v).toLowerCase().includes(q));
    if (sort) rows = [...rows].sort(([, a], [, b]) => { const x = a[sort.col], y = b[sort.col]; const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "ru"); return sort.dir * r; });
    count.textContent = `${rows.length} из ${entries.length}`;
    table.replaceChildren();
    const thead = el("thead"), hr = el("tr");
    hr.append(el("th", "", ""));
    for (const c of shown) {
      const { doc } = resolve(state.name, [...path, firstKey, c], entries[0][1][c]);
      const th = el("th", "", doc.title === c || !doc.title ? c : doc.title.replace(/ \(.*$/, ""));
      th.title = `${c}: ${doc.what}${doc.unit ? " (" + doc.unit + ")" : ""}`;
      if (sort?.col === c) th.textContent += sort.dir > 0 ? " ▲" : " ▼";
      th.onclick = () => { sort = sort?.col === c ? { col: c, dir: -sort.dir } : { col: c, dir: 1 }; draw(); };
      hr.append(th);
    }
    thead.append(hr);
    const tb = el("tbody");
    for (const [k, v] of rows.slice(0, limit)) {
      const tr = el("tr");
      const open = el("td"); const ob = el("button", "btn small icon open-btn", "▸"); ob.title = "Открыть все поля с объяснениями"; open.append(ob); tr.append(open);
      let detail = null;
      ob.onclick = () => {
        if (detail) { detail.remove(); detail = null; ob.textContent = "▸"; return; }
        detail = el("tr", "detail"); const td = el("td"); td.colSpan = shown.length + 1;
        const inb = el("div", "detail-in"); inb.append(renderNode([...path, k], getAt(state.draft, [...path, k]), null, 5)); td.append(inb);
        const d = inb.firstChild; if (d?.tagName === "DETAILS") { d.open = true; d._build?.(); }
        detail.append(td); tr.after(detail); ob.textContent = "▾"; refreshLive();
      };
      for (const c of shown) {
        const td = el("td");
        const cur = getAt(state.draft, [...path, k, c]);
        const p = [...path, k, c];
        const orig = getAt(state.orig, p);
        if (!same(cur, orig)) td.classList.add("mod");
        if (typeof cur === "boolean") { const i = el("input"); i.type = "checkbox"; i.className = "chk"; i.checked = cur; i.disabled = state.readonly; i.onchange = () => { setAt(state.draft, p, i.checked); td.classList.toggle("mod", !same(i.checked, orig)); changed(); }; td.append(i); }
        else if (typeof cur === "number") { const i = el("input", "input num"); i.type = "number"; i.step = "any"; i.value = String(cur); i.disabled = state.readonly; i.oninput = () => { const n = Number(i.value); if (i.value === "" || !Number.isFinite(n)) return; setAt(state.draft, p, n); td.classList.toggle("mod", !same(n, orig)); changed(); }; td.append(i); }
        else if (cur === undefined) td.append(el("span", "dim", "—"));
        else { const i = el("input", "input"); i.type = "text"; i.value = String(cur); i.disabled = state.readonly; i.oninput = () => { setAt(state.draft, p, i.value); td.classList.toggle("mod", i.value !== orig); changed(); }; td.append(i); }
        tr.append(td);
      }
      tb.append(tr);
    }
    table.append(thead, tb);
    if (rows.length > limit) { const more = el("button", "btn small", `Показать ещё (${rows.length - limit})`); more.onclick = () => { limit += 100; draw(); }; const tr = el("tr"); const td = el("td"); td.colSpan = shown.length + 1; td.append(more); tr.append(td); tb.append(tr); }
  };
  search.oninput = () => { limit = 80; draw(); };
  draw();
  return wrap;
}

/* ---------------- проверка, сохранение, откат ---------------- */
function showReport(html) { const r = $("#report"); r.hidden = false; r.replaceChildren(...html); r.scrollIntoView({ block: "nearest" }); }
function problemList(title, cls, list) {
  const d = el("div");
  d.append(el("b", "c-" + (cls === "err" ? "bad" : cls === "wrn" ? "warn" : "ok"), title));
  const ul = el("ul");
  for (const p of list) ul.append(el("li", cls === "err" ? "c-bad" : "c-warn", `${p.path || "(файл)"} — ${p.message}`));
  d.append(ul);
  return d;
}
function markBad(problems) {
  document.querySelectorAll(".fld.bad").forEach((x) => x.classList.remove("bad"));
  for (const p of problems) document.querySelector(`.fld[data-path="${CSS.escape(p.path)}"]`)?.classList.add("bad");
}
async function doCheck() {
  const out = [];
  const r = await api("/api/validate", { name: state.name, data: state.draft });
  markBad(r.problems);
  if (r.problems.length) out.push(problemList(`Схема: ошибок ${r.problems.length}`, "err", r.problems));
  else out.push(el("div", "c-ok", "Схема: всё в границах, типы на месте."));
  if (r.warnings.length) out.push(problemList(`Предупреждения: ${r.warnings.length}`, "wrn", r.warnings));
  showReport(out);
  const note = el("div", "note", "tsc: идёт проверка проекта (tsc --noEmit)… проверяются сохранённые файлы" + (isDirty(state.name) ? "; несохранённые правки в проверку не входят" : "") + ".");
  $("#report").append(note);
  try {
    const t = await api("/api/tsc", {});
    note.replaceWith(t.ok ? el("div", "c-ok", `tsc: ошибок нет (${(t.ms / 1000).toFixed(0)} с).`) : (() => { const d = el("div"); d.append(el("b", "c-bad", "tsc: найдены ошибки")); d.append(el("pre", "", t.output.slice(0, 4000))); return d; })());
  } catch (e) { note.replaceWith(el("div", "c-bad", "tsc: " + e.message)); }
}
async function doSave() {
  try {
    const r = await api("/api/save", { name: state.name, data: state.draft });
    if (!r.ok) { markBad(r.problems); showReport([problemList(`Не сохранено: ошибок ${r.problems.length}`, "err", r.problems)]); return; }
    markBad([]);
    state.orig = clone(state.draft);
    if (state.name === "balance") state.bal = state.draft;
    renderTree(); renderForm();
    const out = [el("div", "c-ok", r.changed ? "Сохранено в data/" + state.name + ".json." : "Изменений нет — файл остался прежним.")];
    if (r.warnings.length) out.push(problemList(`Предупреждения: ${r.warnings.length}`, "wrn", r.warnings));
    showReport(out);
    if (r.changed) showDiff(r.before, r.after, `Было | стало — ${state.name}.json`);
  } catch (e) { showReport([el("div", "c-bad", "Ошибка: " + e.message)]); }
}
function doRevert() {
  confirmDlg("Откатить файл?", `Файл data/${state.name}.json вернётся к состоянию последнего коммита. Правки в нём (и сохранённые, и несохранённые) пропадут.`, "Откатить", async () => {
    const r = await api("/api/revert", { name: state.name });
    state.orig = r.data; state.draft = clone(r.data);
    if (state.name === "balance") state.bal = state.draft;
    drafts.delete(state.name);
    renderTree(); renderForm();
    showReport([el("div", "c-ok", "Файл возвращён к последнему коммиту.")]);
  });
}

/* ---------------- окна ---------------- */
function modal(title, body, buttons) {
  const m = $("#modal");
  m.replaceChildren();
  const d = el("div", "panel dialog lg");
  const hd = el("div", "dialog-head"); hd.append(el("h2", "dialog-title", title)); d.append(hd);
  const b = el("div", "dialog-body"); b.append(body); d.append(b);
  const f = el("div", "dialog-foot");
  for (const [label, cls, fn] of buttons) { const x = el("button", "btn " + cls, label); x.onclick = () => { m.hidden = true; fn?.(); }; f.append(x); }
  d.append(f);
  m.append(d); m.hidden = false; m.className = "modal";
}
function confirmDlg(title, text, okLabel, fn) { modal(title, el("p", "", text), [["Отмена", "", null], [okLabel, "danger", fn]]); }

function showDiff(before, after, title) {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const left = a.slice(s, ea), right = b.slice(s, eb);
  const pairs = [];
  if (left.length * right.length <= 4e6) {
    // LCS по строкам
    const n = left.length, m = right.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, dels = [], adds = [];
    const flush = () => { const k = Math.max(dels.length, adds.length); for (let x = 0; x < k; x++) pairs.push([s + (dels[x]?.[0] ?? 0), dels[x]?.[1], adds[x]?.[1]]); dels = []; adds = []; };
    while (i < n || j < m) {
      if (i < n && j < m && left[i] === right[j]) { flush(); pairs.push([s + i, left[i], left[i]]); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { adds.push([j, right[j]]); j++; }
      else { dels.push([i, left[i]]); i++; }
    }
    flush();
  } else pairs.push([s, left.join("\n"), right.join("\n")]);
  const box = el("div", "diff");
  box.append(el("div", "hd", "Было"), el("div", "hd", "Стало"));
  const ctx = 2;
  const keep = pairs.map(([, l, r], i) => l !== r || undefined);
  const near = pairs.map((_, i) => { for (let d = -ctx; d <= ctx; d++) if (keep[i + d]) return true; return false; });
  let gap = false;
  const shortLine = (l, r) => {
    if (l === undefined || r === undefined || l.length < 400) return [l, r, null];
    let p = 0; while (p < l.length && p < r.length && l[p] === r[p]) p++;
    let q = 0; while (q < l.length - p && q < r.length - p && l[l.length - 1 - q] === r[r.length - 1 - q]) q++;
    const from = Math.max(0, p - 70), cut = (x) => [(from ? "…" : "") + x.slice(from, p), x.slice(p, x.length - q), x.slice(x.length - q, x.length - q + 70) + (x.length - q + 70 < x.length ? "…" : "")];
    return [cut(l), cut(r), true];
  };
  const cell = (cls, parts) => { const c = el("div", "c " + cls); if (Array.isArray(parts)) { c.append(parts[0]); const m = el("mark", "", parts[1]); c.append(m, parts[2]); } else c.textContent = parts ?? ""; return c; };
  pairs.forEach(([, l, r], i) => {
    if (!near[i]) { if (!gap) { box.append(el("div", "c gap", "… без изменений …")); gap = true; } return; }
    gap = false;
    const [L, R, parted] = l !== r ? shortLine(l, r) : [l, r, null];
    if (l === r) { box.append(cell("", l), cell("", r)); return; }
    box.append(cell(l === undefined ? "" : "del", parted ? L : l), cell(r === undefined ? "" : "add", parted ? R : r));
  });
  if (!pairs.some(([, l, r]) => l !== r)) box.append(el("div", "c gap", "Изменений нет."));
  modal(title, box, [["Закрыть", "primary", null]]);
}

/* ---------------- запуск ---------------- */
async function init() {
  state.files = await api("/api/files");
  const b = await api("/api/file?name=balance");
  state.bal = b.data;
  const hash = decodeURIComponent(location.hash.slice(1));
  await openFile(state.files.some((f) => f.name === hash) ? hash : "balance");
  window.__editor = { openFile, state, focusField, showDiff };
}
function focusField(path) {
  const segs = path.split(".");
  for (let i = 1; i < segs.length; i++) { const d = document.querySelector(`details.ed-sec[data-path="${CSS.escape(segs.slice(0, i).join("."))}"]`); if (d) { d.open = true; d._build?.(); } }
  const f = document.querySelector(`.fld[data-path="${CSS.escape(path)}"]`);
  if (!f) return false;
  let p = f.parentElement;
  while (p) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
  f.scrollIntoView({ block: "center" });
  f.querySelector("input")?.focus();
  return true;
}
init().catch((e) => { document.body.textContent = "Ошибка запуска: " + e.message; });
