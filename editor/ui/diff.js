/* Окна: подтверждение, «было | стало», результаты проверки. */
import { el, $ } from "/lib.js";

export function modal(title, body, buttons, wide = true) {
  const m = $("#modal");
  m.replaceChildren();
  const d = el("div", "panel dialog " + (wide ? "lg" : ""));
  const hd = el("div", "dialog-head"); hd.append(el("h2", "dialog-title", title));
  const x = el("button", "x", "×"); x.setAttribute("aria-label", "Закрыть"); x.onclick = close; hd.append(x);
  d.append(hd);
  const b = el("div", "dialog-body"); b.append(body); d.append(b);
  const f = el("div", "dialog-foot");
  for (const [label, cls, fn] of buttons) { const bt = el("button", "btn " + cls, label); bt.onclick = () => { close(); fn?.(); }; f.append(bt); }
  d.append(f);
  m.append(d); m.hidden = false;
  m.onclick = (e) => { if (e.target === m) close(); };
}
export function close() { $("#modal").hidden = true; }
export function confirmDlg(title, text, okLabel, fn) { modal(title, el("p", "", text), [["Отмена", "", null], [okLabel, "danger", fn]], false); }

/** Построчное сравнение: общие начало и конец отбрасываются, середина — по LCS; длинные строки показываются фрагментом вокруг отличия. */
export function diffBox(before, after) {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const left = a.slice(s, ea), right = b.slice(s, eb);
  const pairs = [];
  if (left.length * right.length <= 4e6) {
    const n = left.length, m = right.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, dels = [], adds = [];
    const flush = () => { const k = Math.max(dels.length, adds.length); for (let x = 0; x < k; x++) pairs.push([dels[x], adds[x]]); dels = []; adds = []; };
    while (i < n || j < m) {
      if (i < n && j < m && left[i] === right[j]) { flush(); pairs.push([left[i], left[i]]); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { adds.push(right[j]); j++; }
      else { dels.push(left[i]); i++; }
    }
    flush();
  } else pairs.push([left.join("\n"), right.join("\n")]);
  const box = el("div", "diff");
  box.append(el("div", "hd", "Было"), el("div", "hd", "Стало"));
  const keep = pairs.map(([l, r]) => l !== r);
  const near = pairs.map((_, i) => [-2, -1, 0, 1, 2].some((d) => keep[i + d]));
  let gap = false;
  const part = (l, r) => {
    if (l === undefined || r === undefined || (l.length < 300 && r.length < 300)) return null;
    let p = 0; while (p < l.length && p < r.length && l[p] === r[p]) p++;
    let q = 0; while (q < l.length - p && q < r.length - p && l[l.length - 1 - q] === r[r.length - 1 - q]) q++;
    const from = Math.max(0, p - 70);
    const cut = (x) => [(from ? "…" : "") + x.slice(from, p), x.slice(p, x.length - q), x.slice(x.length - q, x.length - q + 70) + (x.length - q + 70 < x.length ? "…" : "")];
    return [cut(l), cut(r)];
  };
  const cell = (cls, v) => { const c = el("div", "c " + cls); if (Array.isArray(v)) { c.append(v[0]); c.append(el("mark", "", v[1]), v[2]); } else c.textContent = v ?? ""; return c; };
  pairs.forEach(([l, r], i) => {
    if (!near[i]) { if (!gap) { box.append(el("div", "c gap", "… без изменений …")); gap = true; } return; }
    gap = false;
    if (l === r) { box.append(cell("", l), cell("", r)); return; }
    const pp = part(l, r);
    box.append(cell(l === undefined ? "" : "del", pp ? pp[0] : l), cell(r === undefined ? "" : "add", pp ? pp[1] : r));
  });
  if (!keep.some(Boolean)) box.append(el("div", "c gap", "Изменений нет."));
  return box;
}
