import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { patchJson, parseJson } from "./jsonpatch";
import { validate, warnings, FILE_META, fileTitle, fileSection, SECTIONS, type Problem } from "../schema/index";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const DATA = path.join(ROOT, "data");
const NAME = /^[A-Za-z0-9_-]+$/;

export interface FileInfo { name: string; title: string; section: string; readonly: boolean; bytes: number }

/** Хранилище файлов data/*.json: чтение, проверка, запись с сохранением оформления, откат к последнему коммиту. */
export function createStore(dataDir = DATA, loadVirtual?: (name: string) => unknown) {
  const file = (name: string) => {
    if (!NAME.test(name)) throw new Error("плохое имя файла");
    return path.join(dataDir, name + ".json");
  };
  const list = (): FileInfo[] => {
    const real = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    const names = [...new Set([...real, ...Object.entries(FILE_META).filter(([, m]) => m.virtual).map(([n]) => n)])];
    const order = (n: string) => SECTIONS.indexOf(fileSection(n) as any);
    return names
      .map((name) => ({ name, title: fileTitle(name), section: fileSection(name), readonly: !!FILE_META[name]?.readonly, bytes: FILE_META[name]?.virtual ? 0 : fs.statSync(file(name)).size }))
      .sort((a, b) => order(a.name) - order(b.name) || a.title.localeCompare(b.title, "ru"));
  };
  const read = (name: string) => {
    if (FILE_META[name]?.virtual) {
      if (!loadVirtual) throw new Error("виртуальный файл недоступен");
      return { name, text: "", data: loadVirtual(name), readonly: true };
    }
    const text = fs.readFileSync(file(name), "utf8");
    return { name, text, data: parseJson(text), readonly: !!FILE_META[name]?.readonly };
  };
  const check = (name: string, data: unknown): { problems: Problem[]; warnings: Problem[] } => {
    const cur = read(name);
    return { problems: validate(name, data, cur.data), warnings: warnings(name, data) };
  };
  const save = (name: string, data: unknown) => {
    const cur = read(name);
    if (cur.readonly) throw new Error("файл только для чтения");
    const { problems, warnings: w } = check(name, data);
    if (problems.length) return { ok: false as const, problems, warnings: w };
    const after = patchJson(cur.text, data);
    if (after !== cur.text) fs.writeFileSync(file(name), after);
    return { ok: true as const, before: cur.text, after, changed: after !== cur.text, warnings: w };
  };
  const preview = (name: string, data: unknown) => {
    const cur = read(name);
    return { before: cur.text, after: patchJson(cur.text, data) };
  };
  const rel = (name: string) => path.relative(ROOT, file(name)).replace(/\\/g, "/");
  const HASH = /^(HEAD|[0-9a-f]{7,40})$/;
  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 64 << 20 });
  /** История файла: последние коммиты, которые его меняли (только чтение git). */
  const history = (name: string, n = 30) => {
    const out = git(["log", "--follow", `-n${n}`, "--format=%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e", "--", rel(name)]).toString("utf8");
    return out.split("\x1e").map((x) => x.trim()).filter(Boolean).map((x) => { const [hash, author, date, subject, body] = x.split("\x1f"); return { hash, author, date, subject, body: body ?? "" }; });
  };
  const flat = (v: unknown, p: string[], out: Map<string, unknown>) => {
    if (v && typeof v === "object" && !(Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"))) { for (const k of Object.keys(v as object)) if (!k.startsWith("_") && !/_doc$/i.test(k)) flat((v as any)[k], [...p, k], out); return; }
    out.set(JSON.stringify(p), v);
  };
  /** Что поменял коммит в этом файле: список «путь: было → стало». */
  const commitDiff = (name: string, hash: string) => {
    if (!HASH.test(hash)) throw new Error("плохой хэш");
    const get = (ref: string) => { try { return parseJson(git(["show", `${ref}:${rel(name)}`]).toString("utf8")); } catch { return undefined; } };
    const a = new Map<string, unknown>(), b = new Map<string, unknown>();
    flat(get(hash + "^"), [], a); flat(get(hash), [], b);
    const items: { path: string[]; before: unknown; after: unknown }[] = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) if (JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))) items.push({ path: JSON.parse(k), before: a.get(k), after: b.get(k) });
    return { total: items.length, items: items.slice(0, 300) };
  };
  const revert = (name: string, hash = "HEAD") => {
    if (!HASH.test(hash)) throw new Error("плохой хэш");
    const f = file(name);
    // git show, а не checkout: индекс не трогаем
    const buf = git(["show", `${hash}:${rel(name)}`]);
    const before = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, buf);
    return { before, after: buf.toString("utf8") };
  };
  return { list, read, check, save, preview, history, commitDiff, revert, file };
}
