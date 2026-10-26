/* Два вида: «Инспектор» (настройки по смыслу) и «Сущность» (таблица с фильтрами + карточка). */
import { el, S, doc, getAt, isObj, fmt, labelFor, resolve, onChange, fileTitle } from "/lib.js";
import { fieldCard, OPT_RU } from "/fields.js";
import { keyRu, groupOfKey, groupRank, ENTITIES, sectionDoc, isContainerDoc } from "/schema.js";

const hidden = (k) => k.startsWith("_") || /_doc$/i.test(k);
const isLeaf = (file, path, v) => {
  if (v === null || typeof v !== "object") return true;
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object")) return true;
  const r = resolve(file, path, v);
  return r.explicit && isContainerDoc(r.doc);
};
const nameOf = (file, path) => { const l = labelFor(file, path, doc(file).draft); return l; };
const titleEl = (file, path, cls = "") => {
  const l = nameOf(file, path);
  const s = el("span", cls, l.text);
  if (!l.known) s.title = "Перевода нет: показано имя из файла настроек";
  return s;
};
const countLeaves = (file, path, v, cap = 200) => {
  let n = 0;
  const walk = (p, x) => { if (n >= cap) return; if (isLeaf(file, p, x)) { n++; return; } for (const k of Object.keys(x)) if (!hidden(k)) walk([...p, k], x[k]); };
  walk(path, v);
  return n;
};
const plural = (n, a, b, c) => { const m = n % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };

/** Группа-раскрывашка с ленивым содержимым. */
function group(file, path, build, opts = {}) {
  const d = el("details", "grp");
  d.dataset.path = path.join(".");
  const s = el("summary", "grp-h");
  s.append(el("span", "gi", opts.icon || "▤"), opts.title ? el("span", "", opts.title) : titleEl(file, path));
  const v = getAt(doc(file).draft, path);
  const n = opts.count ?? (v && typeof v === "object" ? countLeaves(file, path, v) : 0);
  if (opts.sub) s.append(el("small", "", opts.sub));
  if (n) s.append(el("span", "badge", `${n} ${plural(n, "настройка", "настройки", "настроек")}`));
  const body = el("div", "grp-b");
  d.append(s, body);
  let built = false;
  d._build = () => { if (built) return; built = true; build(body); };
  d.addEventListener("toggle", () => { if (d.open) d._build(); });
  if (opts.open) { d.open = true; d._build(); }
  return d;
}

/** Содержимое объекта: карточки полей (по смыслу, если их много) и вложенные группы. */
export function renderObject(file, path, box, depth, exclude = []) {
  const dd = doc(file);
  const obj = getAt(dd.draft, path);
  const note = sectionDoc(getAt(dd.draft, path.slice(0, -1)), path[path.length - 1], obj);
  if (note) { const n = el("details", "disclosure about"); n.append(el("summary", "", "О разделе"), el("p", "note", note)); box.append(n); }
  const keys = Object.keys(obj).filter((k) => !hidden(k) && !exclude.includes(k) && !(k === "id" && path.length > 1 && typeof obj[k] === "string"));
  const leaves = keys.filter((k) => isLeaf(file, [...path, k], obj[k]));
  const subs = keys.filter((k) => !leaves.includes(k));
  const card = (k) => { const p = [...path, k]; const r = resolve(file, p, obj[k]); return fieldCard(file, p, obj[k], r.doc, { label: r.explicit ? undefined : nameOf(file, p).text }); };
  if (leaves.length) {
    const buckets = new Map();
    for (const k of leaves) {
      const g = leaves.length >= 5 || depth === 0 ? groupOfKey(k) : null;
      const id = g ? g.title : "";
      if (!buckets.has(id)) buckets.set(id, { g, ks: [] });
      buckets.get(id).ks.push(k);
    }
    for (const { g, ks } of [...buckets.values()].sort((a, b) => groupRank(a.g?.title ?? "") - groupRank(b.g?.title ?? ""))) {
      const sec = el("section", "bucket");
      if (g && buckets.size > 1 || (g && depth === 0)) {
        const h = el("h3", "bk-h");
        h.append(el("span", "gi", g.icon), el("span", "", g.title), el("small", "", g.sub));
        sec.append(h);
      }
      const grid = el("div", "cards");
      for (const k of ks) grid.append(card(k));
      sec.append(grid);
      box.append(sec);
    }
  }
  for (const k of subs) {
    const p = [...path, k];
    box.append(group(file, p, (b) => renderObject(file, p, b, depth + 1), { open: depth === 0 && subs.length <= 4 && countLeaves(file, p, obj[k]) <= 14 }));
  }
}

/* ---------- Сущности ---------- */
const getDeep = (o, dotted) => dotted.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const showVal = (v) => (v === undefined ? "—" : typeof v === "boolean" ? (v ? "Да" : "Нет") : typeof v === "number" ? fmt(v) : OPT_RU[v] ?? keyRu(String(v)).text.replace(/^(.)/, (m) => m) ?? v);
const showStr = (v) => (v === undefined ? "—" : typeof v === "boolean" ? (v ? "Да" : "Нет") : typeof v === "number" ? fmt(v) : OPT_RU[v] ?? (v === "" ? "—" : String(v)));

function thumb(conf, key, obj) {
  const t = el("span", "th");
  if (conf.thumb === "unit" && obj.sprite) t.style.backgroundImage = `url(/assets/units/${obj.sprite}.png)`;
  else if (conf.thumb === "mount") { const i = el("img", "thimg"); i.src = `/assets/icons/mount_${key}.png`; i.onerror = () => i.remove(); i.alt = ""; t.append(i); }
  else t.classList.add("none");
  return t;
}

export function entityConf(file) { return ENTITIES[file]?.[0]; }

export function renderEntities(file, conf, box) {
  const dd = doc(file);
  const coll = getAt(dd.draft, conf.path);
  const entries = () => (Array.isArray(coll) ? coll.map((v, i) => [String(i), v]) : Object.keys(coll).filter((k) => !hidden(k)).map((k) => [k, coll[k]]));
  const all = entries();
  const wrap = el("div", "ent");
  const left = el("section", "panel ent-list");
  const right = el("section", "ent-card");
  wrap.append(left, right);
  box.append(wrap);
  const firstKey = all[0]?.[0];
  const colTitle = (c) => (firstKey === undefined ? c : (() => { const r = resolve(file, [...conf.path, firstKey, c], all[0][1][c]); return r.explicit ? r.doc.title.replace(/\s*\(.*$/, "") : keyRu(c).text; })());
  const filt = {}, st = { q: "", sort: null, limit: 150, lo: "", hi: "" };
  // фильтры
  const tools = el("div", "ent-tools");
  const q = el("input", "input"); q.type = "search"; q.placeholder = "Поиск по названию…";
  q.oninput = () => { st.q = q.value.trim().toLowerCase(); st.limit = 150; draw(); };
  tools.append(q);
  const fbar = el("div", "filters");
  for (const f of conf.filters) {
    const vals = [...new Set(all.map(([, o]) => getDeep(o, f)).filter((x) => x !== undefined))];
    if (vals.length < 2 || vals.length > 14) continue;
    const s = el("select", "input");
    s.append(Object.assign(el("option", "", `${colTitle(f)}: все`), { value: "" }));
    for (const v of vals) s.append(Object.assign(el("option", "", showStr(v)), { value: JSON.stringify(v) }));
    s.onchange = () => { filt[f] = s.value ? JSON.parse(s.value) : undefined; st.limit = 150; draw(); };
    fbar.append(s);
  }
  if (conf.levelKey && all.some(([, o]) => typeof getDeep(o, conf.levelKey) === "number")) {
    const lo = el("input", "input num"); lo.type = "number"; lo.placeholder = "ур. от";
    const hi = el("input", "input num"); hi.type = "number"; hi.placeholder = "до";
    lo.oninput = hi.oninput = () => { st.lo = lo.value; st.hi = hi.value; draw(); };
    fbar.append(el("span", "lbl", "Уровень"), lo, hi);
  }
  const count = el("span", "chip dim");
  fbar.append(count);
  left.append(tools, fbar);
  const tw = el("div", "tbl-wrap"), table = el("table", "tbl"); tw.append(table); left.append(tw);

  const nameText = (k, o) => String(o[conf.nameKey] ?? k).replace(/\s+/g, " ").slice(0, 60);
  const draw = () => {
    let rows = all.filter(([k, o]) => {
      if (st.q && !(nameText(k, o).toLowerCase().includes(st.q) || k.toLowerCase().includes(st.q))) return false;
      for (const f of Object.keys(filt)) if (filt[f] !== undefined && JSON.stringify(getDeep(o, f)) !== JSON.stringify(filt[f])) return false;
      if (conf.levelKey) { const L = getDeep(o, conf.levelKey); if (st.lo !== "" && !(L >= Number(st.lo))) return false; if (st.hi !== "" && !(L <= Number(st.hi))) return false; }
      return true;
    });
    if (st.sort) { const { col, dir } = st.sort; rows = [...rows].sort(([ka, a], [kb, b]) => { const x = col === "__n" ? nameText(ka, a) : getDeep(a, col), y = col === "__n" ? nameText(kb, b) : getDeep(b, col); return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "ru")); }); }
    count.textContent = `${rows.length} из ${all.length}`;
    table.replaceChildren();
    const hr = el("tr"); hr.append(el("th"));
    const th = (label, col) => { const h = el("th", col === "__n" ? "" : "num", label + (st.sort?.col === col ? (st.sort.dir > 0 ? " ▲" : " ▼") : "")); h.onclick = () => { st.sort = st.sort?.col === col ? { col, dir: -st.sort.dir } : { col, dir: 1 }; draw(); }; hr.append(h); };
    th("Название", "__n");
    for (const c of conf.columns) th(colTitle(c), c);
    const thead = el("thead"); thead.append(hr);
    const tb = el("tbody");
    if (!rows.length) { const tr = el("tr"), td = el("td", "empty", "Ничего не найдено — попробуйте убрать фильтры."); td.colSpan = conf.columns.length + 2; tr.append(td); tb.append(tr); }
    for (const [k, o] of rows.slice(0, st.limit)) {
      const tr = el("tr");
      if (S.sel[file] === k) tr.setAttribute("aria-selected", "true");
      const t0 = el("td"); t0.append(thumb(conf, k, o)); tr.append(t0);
      const n = el("td"); const nm = el("div", "nm2"); nm.append(el("span", "", nameText(k, o)), el("small", "", k)); n.append(nm); tr.append(n);
      for (const c of conf.columns) tr.append(el("td", "num", showStr(getDeep(o, c))));
      tr.onclick = () => select(k);
      tb.append(tr);
    }
    table.append(thead, tb);
    if (rows.length > st.limit) { const m = el("button", "btn small", `Показать ещё (${rows.length - st.limit})`); m.onclick = () => { st.limit += 150; draw(); }; const tr = el("tr"), td = el("td"); td.colSpan = conf.columns.length + 2; td.append(m); tr.append(td); tb.append(tr); }
  };
  const select = (k) => {
    S.sel[file] = k;
    draw();
    right.replaceChildren();
    const p = [...conf.path, k], o = getAt(dd.draft, p);
    if (!o) { right.append(el("div", "empty-state", "Выберите запись в списке слева")); return; }
    const hero = el("div", "hero");
    hero.append(thumb(conf, k, o));
    const h = el("div"); h.append(el("h2", "", nameText(k, o)), el("span", "chip dim", k));
    hero.append(h);
    right.append(hero);
    const inner = el("div", "ent-body");
    renderObject(file, p, inner, 0);
    right.append(inner);
  };
  right.append(el("div", "empty-state", "Выберите запись в списке слева, чтобы открыть карточку"));
  draw();
  const sel = S.sel[file] ?? null;
  if (sel !== null && getAt(dd.draft, [...conf.path, sel])) select(sel);
  wrap.selectEntity = select;
  return wrap;
}
