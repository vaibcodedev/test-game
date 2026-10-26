/* Общий поиск Ctrl K по всем настройкам: названия, объяснения, имена записей, значения. */
import { el, $, S, load, getAt, resolve, labelFor, fileTitle, fmt } from "/lib.js";
import { leaves, keyRu, ENTITIES, SECTION_ICON } from "/schema.js";

const SYN = [["конь", "маунт"], ["коня", "маунт"], ["лошадь", "маунт"], ["скакун", "маунт"], ["деньги", "золото"], ["монеты", "золото"], ["враг", "моб"], ["монстр", "моб"], ["хп", "здоровье"], ["жизни", "здоровье"], ["агр", "замечан"], ["урон", "бьёт"], ["бег", "скорость"]];
let index = null, building = null;

async function build(progress) {
  const out = [];
  let i = 0;
  for (const f of S.files) {
    progress?.(`Собираю указатель: ${++i} из ${S.files.length}…`);
    let d;
    try { d = await load(f.name); } catch { continue; }
    const conf = ENTITIES[f.name]?.[0];
    leaves(f.name, d.draft, (l) => {
      const key = l.path[l.path.length - 1];
      const title = l.explicit && l.doc.title ? l.doc.title : keyRu(key).text;
      let ent = "";
      if (conf && l.path.length > conf.path.length && conf.path.every((s, j) => l.path[j] === s)) {
        const o = getAt(d.draft, l.path.slice(0, conf.path.length + 1));
        ent = (o && (o[conf.nameKey] ?? l.path[conf.path.length])) + "";
      } else if (l.path.length > 1) ent = labelFor(f.name, l.path.slice(0, -1), d.draft).text;
      const val = typeof l.value === "string" ? l.value.slice(0, 160) : "";
      out.push({ file: f.name, path: l.path, title, ent: ent.slice(0, 60), what: l.explicit ? l.doc.what ?? "" : "", val, hay: `${title} ${ent} ${l.explicit ? l.doc.what ?? "" : ""} ${fileTitle(f.name)} ${val}`.toLowerCase(), section: f.section });
    });
    if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export function ensureIndex(progress) {
  if (index) return Promise.resolve(index);
  building ??= build(progress).then((x) => (index = x));
  return building;
}
export const dropIndex = () => { index = null; building = null; };

function find(q, limit = 14) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const alts = words.map((w) => [w, ...SYN.filter(([a]) => w.startsWith(a)).map(([, b]) => b)]);
  const res = [];
  for (const e of index) {
    let score = 0;
    for (const a of alts) {
      let best = 0;
      for (const w of a) { const t = e.title.toLowerCase(); if (t.startsWith(w)) best = Math.max(best, 5); else if (t.includes(w)) best = Math.max(best, 4); else if (e.ent.toLowerCase().includes(w)) best = Math.max(best, 3); else if (e.hay.includes(w)) best = Math.max(best, 1); }
      if (!best) { score = 0; break; }
      score += best;
    }
    if (score) res.push([score, e]);
  }
  res.sort((x, y) => y[0] - x[0]);
  const per = new Map(), out = [];
  for (const [, e] of res) { const k = e.title; const c = per.get(k) ?? 0; if (c >= 2) continue; per.set(k, c + 1); out.push(e); if (out.length >= limit) break; }
  return out;
}
const cur = (e) => { const v = getAt(S.docs.get(e.file)?.draft, e.path); return typeof v === "number" ? fmt(v) : typeof v === "boolean" ? (v ? "Да" : "Нет") : ""; };

export function openSearch(navigate) {
  const ov = $("#search");
  ov.hidden = false;
  ov.replaceChildren();
  const panel = el("div", "panel pal");
  const inp = el("input", "input"); inp.placeholder = "Найти настройку: «агр», «скорость коня», «золото»…"; inp.setAttribute("autocomplete", "off");
  const list = el("div", "dd");
  const hint = el("div", "note", "↑ ↓ — выбрать · Enter — перейти к полю · Esc — закрыть");
  panel.append(inp, list, hint);
  ov.append(panel);
  inp.focus();
  let sel = 0, results = [];
  const draw = () => {
    list.replaceChildren();
    if (!index) { list.append(el("div", "note", "Собираю указатель…")); return; }
    if (!inp.value.trim()) { list.append(el("div", "note", "Начните печатать — поиск идёт по названиям, объяснениям, именам мобов, маунтов и боссов, а также по значениям текстов.")); return; }
    if (!results.length) { list.append(el("div", "empty-state", "Ничего не найдено. Попробуйте другое слово.")); return; }
    results.forEach((e, i) => {
      const h = el("div", "hit" + (i === sel ? " on" : ""));
      const t = el("span", "t"); t.textContent = (e.ent ? e.ent + " · " : "") + e.title;
      const p = el("span", "p", `${e.section} › ${fileTitle(e.file)}`);
      const box = el("span"); box.append(t, document.createElement("br"), p);
      h.append(el("span", "ic", SECTION_ICON[e.section] ?? "•"), box, el("span", "v", cur(e)));
      h.onmousemove = () => { sel = i; [...list.children].forEach((c, j) => c.classList.toggle("on", j === i)); };
      h.onclick = () => go(e);
      list.append(h);
    });
  };
  const go = (e) => { close(); navigate(e.file, e.path); };
  const close = () => { ov.hidden = true; ov.replaceChildren(); document.removeEventListener("keydown", key, true); };
  const key = (e) => {
    if (e.key === "Escape") { close(); e.preventDefault(); }
    else if (e.key === "ArrowDown") { sel = Math.min(results.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && results[sel]) { go(results[sel]); e.preventDefault(); }
  };
  document.addEventListener("keydown", key, true);
  ov.onclick = (e) => { if (e.target === ov) close(); };
  inp.oninput = () => { sel = 0; results = index ? find(inp.value) : []; draw(); };
  draw();
  ensureIndex().then(() => { results = find(inp.value); draw(); });
}
export const searchResults = (q) => find(q);
