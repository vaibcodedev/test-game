/* Карточка поля: имя, значение, «что это значит в игре», ползунок, подробности, «В коде». */
import { el, S, doc, getAt, setAt, same, fmt, changed, onChange, resolve, liveFor, bal, toast, fileTitle } from "/lib.js";
import { evalCurve, num } from "/schema.js";

const cards = new Set();
export function resetCards() { cards.clear(); }

onChange(() => { for (const c of [...cards]) { if (!c.card.isConnected) { cards.delete(c); continue; } c.refresh(); } });

const short = (u) => (u || "").replace(/\s*\(.*$/, "").replace(/^множитель.*/, "множитель");

export function fieldCard(file, path, value, d, opts = {}) {
  const dd = doc(file);
  const card = el("div", "card fc");
  card.dataset.path = path.join(".");
  card.dataset.file = file;
  const ro = dd.readonly || d.readonly;
  const kind = d.kind ?? (typeof value === "number" ? "num" : typeof value === "boolean" ? "bool" : typeof value === "string" ? "text" : "json");
  const nm = el("div", "nm", opts.label || d.title);
  const modChip = el("span", "chip warn", "изменено");
  nm.append(modChip);
  const val = el("div", "val");
  const mean = el("div", "mean");
  card.append(nm, val, mean);
  const get = () => getAt(dd.draft, path);
  const set = (v) => { setAt(dd.draft, path, v); changed(); };
  let after = null;
  let ctl = null;

  if (kind === "num" || kind === "int") ctl = numberControl(d, value, set, ro, kind === "int", () => get());
  else if (kind === "bool") ctl = boolControl(value, set, ro);
  else if (kind === "enum") ctl = enumControl(d, value, set, ro);
  else if (kind === "curve") ctl = curveControl(d, get(), ro);
  else if (kind === "tuple") ctl = tupleControl(d, get(), ro);
  else if (kind === "numOrCurve") ctl = numOrCurveControl(path, d, dd, set, ro);
  else if (kind === "text") ctl = textControl(value, set, ro);
  else ctl = jsonControl(value, set, ro);
  if (ctl) { ctl.classList.add("ctl"); card.append(ctl); }

  // подробности
  const rows = [];
  const add = (k, v) => { if (v && v !== "—") rows.push([k, v]); };
  const lims = [];
  if (d.unit) lims.push(`единицы: ${d.unit}`);
  if (d.min !== undefined || d.max !== undefined) lims.push(`допустимо: от ${fmt(d.min ?? "−∞")} до ${fmt(d.max ?? "∞")}`);
  if (d.sane) lims.push(`разумно: ${fmt(d.sane[0])} … ${fmt(d.sane[1])}`);
  const hasLive = !!d.live;
  if (hasLive) add("Что это", d.what);
  add("Если поставить больше", d.up);
  add("Если поставить меньше", d.down);
  add("С чем связано", d.links);
  add("Где видно в игре", d.seen);
  if (lims.length) add("Границы", lims.join(" · "));
  if (rows.length) {
    const more = el("details", "disclosure more");
    more.append(el("summary", "", "Подробнее: что будет, с чем связано, где видно"));
    const g = el("dl", "kv plain");
    for (const [k, v] of rows) g.append(el("dt", "", k), el("dd", "", v));
    more.append(g);
    card.append(more);
  }
  // «В коде»
  const full = path.join(".");
  const code = el("div", "code");
  const cb = el("button", "btn small", "Копировать");
  cb.onclick = async () => { try { await navigator.clipboard.writeText(full); toast("Скопировано: " + full); } catch { toast(full); } };
  const rb = el("button", "btn small reset", "Сбросить поле");
  rb.onclick = () => { const o = getAt(dd.orig, path); setAt(dd.draft, path, JSON.parse(JSON.stringify(o))); card.replaceWith(fieldCard(file, path, getAt(dd.draft, path), d, opts)); changed(); };
  const c = el("code", "", full);
  c.title = "Так параметр называется в файле настроек — по нему его можно найти в коде или назвать разработчику";
  code.append(el("span", "k", "В коде:"), c, el("span", "f", `файл data/${file}.json`), cb, rb);
  code.append(el("span", "why", "Так этот параметр называется в файле настроек — по нему его можно найти в коде или назвать разработчику."));
  card.append(code);

  const refresh = () => {
    const v = get();
    const orig = getAt(dd.orig, path);
    const mod = !same(v, orig);
    card.classList.toggle("mod", mod);
    modChip.hidden = !mod;
    rb.hidden = !mod;
    val.replaceChildren();
    if (typeof v === "number") {
      if (mod && typeof orig === "number") val.append(el("s", "", fmt(orig)));
      val.append(document.createTextNode(fmt(v)));
      const u = short(d.unit);
      if (u) val.append(el("small", "", u));
    } else if (typeof v === "boolean") val.textContent = v ? "Да" : "Нет";
    else if (kind === "curve" || kind === "numOrCurve") val.textContent = Array.isArray(v) ? `${v.length} точ.` : fmt(v);
    const txt = d.live ? liveFor(file, path, v, dd.draft) : "";
    mean.textContent = txt || d.what;
    mean.classList.toggle("plain", !txt);
    if (typeof v === "number" && d.sane) card.classList.toggle("odd", v < d.sane[0] || v > d.sane[1]);
    after?.();
  };
  cards.add({ card, refresh });
  refresh();
  card._ref = refresh;
  return card;
}

/* ---- элементы управления ---- */
function numberControl(d, v0, set, ro, isInt, get) {
  const wrap = el("div", "sl");
  const input = el("input", "input num");
  input.type = "number"; input.step = d.step ? String(d.step) : "any"; input.value = String(v0); input.disabled = ro;
  if (d.min !== undefined) input.min = String(d.min);
  if (d.max !== undefined) input.max = String(d.max);
  const lim = sliderRange(d, v0);
  let range = null;
  const fill = () => range && range.style.setProperty("--p", `${((Number(range.value) - lim[0]) / (lim[1] - lim[0])) * 100}%`);
  if (lim) {
    wrap.append(el("span", "lim", fmt(lim[0])));
    range = el("input", "range"); range.type = "range"; range.min = lim[0]; range.max = lim[1]; range.step = d.step || (lim[1] - lim[0]) / 200; range.value = v0; range.disabled = ro;
    fill();
    range.oninput = () => { const n = roundTo(Number(range.value), d, isInt); input.value = String(n); fill(); set(n); };
    wrap.append(range, el("span", "lim", fmt(lim[1])));
  }
  input.oninput = () => { const n = Number(input.value); if (input.value === "" || !Number.isFinite(n)) return; if (range) { range.value = String(n); fill(); } set(n); };
  wrap.append(input);
  return wrap;
}
function roundTo(n, d, isInt) { if (isInt) return Math.round(n); const st = d.step || 0; const dec = st ? Math.max(0, Math.ceil(-Math.log10(st) - 1e-9)) : 4; return +n.toFixed(Math.min(8, dec)); }
function sliderRange(d, v) {
  let lo = d.min, hi = d.max;
  if (d.sane) { lo = lo !== undefined ? Math.max(lo, Math.min(d.sane[0], v)) : Math.min(d.sane[0], v); hi = hi !== undefined ? Math.min(hi, Math.max(d.sane[1], v)) : Math.max(d.sane[1], v); }
  if (lo === undefined || hi === undefined || !(hi > lo)) return null;
  if (!d.sane && hi - lo > 5000) return null;
  return [Math.min(lo, v), Math.max(hi, v)];
}
function boolControl(v, set, ro) {
  const seg = el("div", "seg");
  const mk = (label, on) => { const b = el("button", "seg-opt", label); b.setAttribute("aria-pressed", String(on)); b.disabled = ro; return b; };
  const yes = mk("Включено", !!v), no = mk("Выключено", !v);
  const pick = (x) => { yes.setAttribute("aria-pressed", String(x)); no.setAttribute("aria-pressed", String(!x)); set(x); };
  yes.onclick = () => pick(true); no.onclick = () => pick(false);
  seg.append(yes, no);
  return seg;
}
function enumControl(d, v, set, ro) {
  const s = el("select", "input");
  for (const o of d.options ?? []) { const op = el("option", "", o === "" ? "(не задано)" : OPT_RU[o] ?? o); op.value = o; s.append(op); }
  if (!(d.options ?? []).includes(v)) { const op = el("option", "", String(v)); op.value = v; s.append(op); }
  s.value = v; s.disabled = ro; s.onchange = () => set(s.value);
  return s;
}
export const OPT_RU = { solgard: "Сольгард", umbrath: "Умбрат", common: "Обычный", uncommon: "Необычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", start: "Выдаётся по уровню", vendor: "Торговец", rep: "За репутацию", boss: "С боссов", raid: "Трофей рейда", arena: "Награда арены" };
function textControl(v, set, ro) {
  const long = String(v).length > 40 || String(v).includes("\n");
  const i = el(long ? "textarea" : "input", long ? "text" : "input wide");
  if (!long) i.type = "text"; else i.rows = Math.min(12, Math.max(2, Math.ceil(String(v).length / 80) + String(v).split("\n").length - 1));
  i.value = String(v); i.disabled = ro; i.oninput = () => set(i.value);
  return i;
}
function jsonControl(v, set, ro) {
  const t = el("textarea", "json");
  t.value = JSON.stringify(v, null, 1); t.rows = Math.min(10, t.value.split("\n").length + 1); t.disabled = ro;
  t.oninput = () => { try { const x = JSON.parse(t.value); t.removeAttribute("aria-invalid"); set(x); } catch { t.setAttribute("aria-invalid", "true"); } };
  return t;
}
function tupleControl(d, arr, ro) {
  const wrap = el("div", "pts");
  arr.forEach((x, i) => {
    const r = el("label", "pt");
    const inp = el("input", "input num"); inp.type = "number"; inp.step = String(d.step ?? "any"); inp.value = String(x); inp.disabled = ro;
    inp.oninput = () => { const n = Number(inp.value); if (inp.value === "" || !Number.isFinite(n)) return; arr[i] = n; changed(); };
    r.append(el("span", "lbl", d.labels?.[i] ?? `№ ${i + 1}`), inp);
    wrap.append(r);
  });
  return wrap;
}
function curveSvg(pts, d) {
  const W = 520, H = 72, ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "curve");
  if (!pts.length || pts.some((p) => !Array.isArray(p) || !(p[1] > 0))) return svg;
  const interp = d.curve?.interp ?? "log";
  const xs = Array.from({ length: 100 }, (_, i) => i + 1), ys = xs.map((L) => evalCurve(pts, L, interp));
  const lo = Math.min(...ys), hi = Math.max(...ys), ly = Math.log;
  const sx = (x) => 12 + ((x - 1) / 99) * (W - 24), sy = (y) => (hi === lo ? H / 2 : H - 10 - ((ly(y) - ly(lo)) / (ly(hi) - ly(lo))) * (H - 20));
  const pl = document.createElementNS(ns, "polyline");
  pl.setAttribute("points", xs.map((x, i) => `${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(" "));
  svg.append(pl);
  for (const [l, v] of pts) { const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", sx(Math.min(100, Math.max(1, l)))); c.setAttribute("cy", sy(v)); c.setAttribute("r", 3.5); svg.append(c); }
  const t = document.createElementNS(ns, "title"); t.textContent = `Уровни 1–100, значения ${num(lo, 2)} … ${num(hi, 2)}`; svg.append(t);
  return svg;
}
function curveControl(d, pts, ro) {
  const wrap = el("div", "curvebox");
  const holder = el("div");
  const redraw = () => holder.replaceChildren(curveSvg(pts, d));
  const draw = () => {
    wrap.replaceChildren();
    const list = el("div", "pts");
    pts.forEach((p, i) => {
      const r = el("div", "pt");
      const mk = (idx, label) => {
        const inp = el("input", "input num"); inp.type = "number"; inp.step = "any"; inp.value = String(p[idx]); inp.disabled = ro;
        inp.oninput = () => { const n = Number(inp.value); if (inp.value === "" || !Number.isFinite(n)) return; p[idx] = n; changed(); redraw(); };
        r.append(el("span", "lbl", label), inp);
      };
      mk(0, "уровень"); mk(1, "значение");
      if (!ro && pts.length > 1) { const x = el("button", "btn small icon", "×"); x.title = "Убрать точку"; x.onclick = () => { pts.splice(i, 1); changed(); draw(); }; r.append(x); }
      list.append(r);
    });
    wrap.append(list);
    if (!ro) { const add = el("button", "btn small", "+ точка"); add.onclick = () => { const l = pts[pts.length - 1]; pts.push([Math.min(100, (l?.[0] ?? 0) + 10), l?.[1] ?? 1]); changed(); draw(); }; wrap.append(add); }
    wrap.append(holder); redraw();
  };
  draw();
  return wrap;
}
function numOrCurveControl(path, d, dd, set, ro) {
  const wrap = el("div", "nc");
  const draw = () => {
    wrap.replaceChildren();
    const cur = getAt(dd.draft, path), isCurve = Array.isArray(cur);
    const seg = el("div", "seg");
    const mk = (label, on, fn) => { const x = el("button", "seg-opt", label); x.setAttribute("aria-pressed", String(on)); x.disabled = ro; x.onclick = fn; return x; };
    seg.append(mk("Одно число на всех уровнях", !isCurve, () => { if (isCurve) { set(cur[0]?.[1] ?? 1); draw(); } }), mk("Кривая по уровням", isCurve, () => { if (!isCurve) { set([[30, cur], [100, cur]]); draw(); } }));
    wrap.append(seg);
    wrap.append(isCurve ? curveControl(d, cur, ro) : numberControl(d, cur, set, ro, false, () => getAt(dd.draft, path)));
  };
  draw();
  return wrap;
}
