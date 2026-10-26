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
  const revert = (name: string) => {
    const f = file(name);
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    // git show, а не checkout: индекс не трогаем
    const buf = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 64 << 20 });
    const before = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, buf);
    return { before, after: buf.toString("utf8") };
  };
  return { list, read, check, save, revert, file };
}
