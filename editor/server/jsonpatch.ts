/**
 * Запись JSON с сохранением оформления файла: отступы, переносы строк, «встроенные» массивы вроде [[1, 52], [5, 330]].
 * Исходный текст разбирается в дерево с позициями; в новое значение переносятся только изменённые места — остальное
 * остаётся байт в байт, поэтому правка одного числа даёт diff в одну строку.
 */
interface Node {
  t: "obj" | "arr" | "val";
  s: number;
  e: number;
  v: unknown;
  props?: { key: string; node: Node }[];
  items?: Node[];
}

function parse(text: string): Node {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const fail = (m: string): never => { throw new Error(`JSON: ${m} (позиция ${i})`); };
  const value = (): Node => {
    ws();
    const s = i, c = text[i];
    if (c === "{") {
      i++;
      const props: { key: string; node: Node }[] = [], v: Record<string, unknown> = {};
      ws();
      if (text[i] === "}") { i++; return { t: "obj", s, e: i, v, props }; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("ожидался ключ");
        const k = str();
        ws();
        if (text[i++] !== ":") fail("ожидалось «:»");
        const n = value();
        props.push({ key: k, node: n });
        v[k] = n.v;
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; break; }
        fail("ожидалось «,» или «}»");
      }
      return { t: "obj", s, e: i, v, props };
    }
    if (c === "[") {
      i++;
      const items: Node[] = [];
      ws();
      if (text[i] === "]") { i++; return { t: "arr", s, e: i, v: [], items }; }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; break; }
        fail("ожидалось «,» или «]»");
      }
      return { t: "arr", s, e: i, v: items.map((x) => x.v), items };
    }
    if (c === '"') { const v = str(); return { t: "val", s, e: i, v }; }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) return fail("неожиданный символ");
    i += m[0].length;
    return { t: "val", s, e: i, v: JSON.parse(m[0]) };
  };
  const str = (): string => {
    const s = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(s, i));
  };
  ws();
  const root = value();
  ws();
  if (i < text.length) fail("лишний текст после значения");
  return root;
}

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as any)[k], (b as any)[k]));
};

export interface Style { eol: string; unit: string }
export function detectStyle(text: string): Style {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const m = /\n([ \t]+)\S/.exec(text);
  return { eol, unit: m ? (m[1].startsWith("\t") ? "\t" : m[1].length > 8 ? "  " : m[1]) : "  " };
}
const lineIndent = (text: string, pos: number) => {
  const ls = text.lastIndexOf("\n", pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(ls, pos))![0];
};

/** Свежая запись значения в стиле old (встроенная или многострочная), с отступом ind. */
function fresh(nv: unknown, text: string, old: Node | undefined, ind: string, st: Style): string {
  if (nv === null || typeof nv !== "object") return JSON.stringify(nv);
  const sample = old ? text.slice(old.s, old.e) : "";
  const arr = Array.isArray(nv);
  const keys = arr ? [] : Object.keys(nv as object);
  const n = arr ? (nv as unknown[]).length : keys.length;
  if (n === 0) return arr ? "[]" : "{}";
  const multi = old ? sample.includes("\n") : !arr || !(nv as unknown[]).every((x) => x === null || typeof x !== "object" || (Array.isArray(x) && x.every((y) => typeof y !== "object")));
  const itemSep = /,\s/.test(sample) || !old ? ", " : ",";
  const kvSep = old && /":\S/.test(sample) ? ":" : ": ";
  const child = (k: string | number, v: unknown, cind: string) => {
    const o = old && (arr ? old.items?.[k as number] : old.props?.find((p) => p.key === k)?.node);
    return o ? render(text, o, v, cind, st) : fresh(v, text, undefined, cind, st);
  };
  if (!multi) {
    const parts = arr ? (nv as unknown[]).map((v, i) => child(i, v, ind)) : keys.map((k) => JSON.stringify(k) + kvSep + child(k, (nv as any)[k], ind));
    const pad = !arr && /\{\s/.test(sample) ? " " : "";
    return (arr ? "[" : "{" + pad) + parts.join(itemSep) + (arr ? "]" : pad + "}");
  }
  const inner = ind + st.unit;
  const parts = arr ? (nv as unknown[]).map((v, i) => inner + child(i, v, inner)) : keys.map((k) => inner + JSON.stringify(k) + ": " + child(k, (nv as any)[k], inner));
  return (arr ? "[" : "{") + st.eol + parts.join("," + st.eol) + st.eol + ind + (arr ? "]" : "}");
}

/** Новый текст узла old для значения nv: неизменённое — как было, изменённое — точечно. */
function render(text: string, old: Node, nv: unknown, ind: string, st: Style): string {
  if (same(old.v, nv)) return text.slice(old.s, old.e);
  if (old.t === "obj" && nv && typeof nv === "object" && !Array.isArray(nv)) {
    const nk = Object.keys(nv), ok = old.props!.map((p) => p.key);
    if (nk.length === ok.length && nk.every((k, i) => k === ok[i])) {
      let out = "", pos = old.s;
      for (const p of old.props!) {
        out += text.slice(pos, p.node.s) + render(text, p.node, (nv as any)[p.key], lineIndent(text, p.node.s) || ind, st);
        pos = p.node.e;
      }
      return out + text.slice(pos, old.e);
    }
  }
  if (old.t === "arr" && Array.isArray(nv) && nv.length === old.items!.length) {
    let out = "", pos = old.s;
    old.items!.forEach((it, i) => { out += text.slice(pos, it.s) + render(text, it, nv[i], lineIndent(text, it.s) || ind, st); pos = it.e; });
    return out + text.slice(pos, old.e);
  }
  return fresh(nv, text, old, ind, st);
}

/** Текст файла для нового значения с минимальным отличием от старого текста. */
export function patchJson(text: string, nv: unknown): string {
  const bom = text.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const body = bom ? text.slice(1) : text;
  const root = parse(body);
  const st = detectStyle(body);
  return bom + body.slice(0, root.s) + render(body, root, nv, lineIndent(body, root.s), st) + body.slice(root.e);
}
export const parseJson = (text: string): unknown => parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).v;
