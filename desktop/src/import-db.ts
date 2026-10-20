/**
 * Перенос базы проекта (server/data/game.sqlite) в десктоп-версию (userData/game.sqlite).
 * Без Electron — только node:fs и node:sqlite, поэтому проверяется и из обычного Node.
 *
 * Порядок (база десктопа не меняется, пока копия не проверена):
 *   1. stageImport: game.sqlite + -wal + -shm копируются в staging-папку рядом с базой десктопа;
 *      копия открывается SQLite (WAL применяется), integrity_check, есть таблица players;
 *      WAL сводится в один файл. Если источник менялся во время копирования и копия битая —
 *      снимок средствами SQLite (VACUUM INTO из источника только для чтения).
 *   2. commitImport: старая база десктопа → game.sqlite.bak-<дата> (с её -wal/-shm),
 *      копия → game.sqlite. Ошибка на этом шаге — переименования откатываются.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Спутники базы в режиме WAL. */
export const SIDE_FILES = ["-wal", "-shm"] as const;

export class ImportError extends Error {}

export interface HeroInfo {
  name: string;
  level: number;
  cls: string;
}

export interface StagedDb {
  /** Выбранный файл базы. */
  source: string;
  /** Какие файлы скопированы (имена). */
  copied: string[];
  /** Проверенная копия (один файл, WAL сведён). */
  file: string;
  dir: string;
  /** copy — файлы как есть; snapshot — источник менялся при копировании, взят снимок через SQLite. */
  method: "copy" | "snapshot";
  accounts: number;
  heroCount: number;
  /** До 8 героев: сначала старшие по уровню. */
  heroes: HeroInfo[];
}

const isFile = (f: string) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

const sameFile = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Первая найденная база проекта: <корень>/server/data/game.sqlite. */
export function findProjectDb(roots: string[]): string | null {
  for (const root of roots) {
    const f = path.join(root, "server", "data", "game.sqlite");
    if (isFile(f)) return f;
  }
  return null;
}

/** Выбрали game.sqlite-wal или -shm — берём саму базу. */
export function normalizeSource(file: string): string {
  for (const s of SIDE_FILES) if (file.toLowerCase().endsWith(s) && isFile(file.slice(0, -s.length))) return file.slice(0, -s.length);
  return file;
}

function checkHeader(file: string): void {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    if (n === 0) throw new ImportError("Файл пустой — в нём нет героев.");
    if (n < 16 || buf.toString("latin1") !== "SQLite format 3\0") throw new ImportError("Это не база SQLite. Нужен файл server/data/game.sqlite из папки проекта.");
  } finally {
    fs.closeSync(fd);
  }
}

class NotGameDb extends ImportError {}

/** Проверяет копию и сводит WAL в основной файл. Бросает NotGameDb, если это чужая база. */
function inspect(file: string): Pick<StagedDb, "accounts" | "heroCount" | "heroes"> {
  const db = new DatabaseSync(file);
  try {
    const check = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    if (check.length !== 1 || check[0].integrity_check !== "ok") {
      throw new ImportError(`База повреждена: ${check.slice(0, 3).map((r) => r.integrity_check).join("; ")}`);
    }
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    if (!tables.has("players")) throw new NotGameDb("В этой базе нет героев «Пепельного Предела» (нет таблицы players).");
    const heroCount = Number((db.prepare("SELECT count(*) AS n FROM players").get() as { n: number }).n);
    const heroes = db.prepare("SELECT name, level, cls FROM players ORDER BY level DESC, name LIMIT 8").all() as unknown as HeroInfo[];
    const accounts = tables.has("accounts") ? Number((db.prepare("SELECT count(*) AS n FROM accounts").get() as { n: number }).n) : 0;
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return { accounts, heroCount, heroes: heroes.map((h) => ({ name: String(h.name), level: Number(h.level), cls: String(h.cls) })) };
  } finally {
    db.close();
  }
}

function removeDb(file: string): void {
  for (const s of ["", ...SIDE_FILES]) fs.rmSync(file + s, { force: true });
}

/** Шаг 1: копия источника в dir и проверка. База десктопа (target) не трогается. */
export function stageImport(source: string, dir: string, target: string): StagedDb {
  source = normalizeSource(path.resolve(source));
  if (!isFile(source)) throw new ImportError(`Файл не найден: ${source}`);
  if (sameFile(source, target)) throw new ImportError("Это и есть база десктоп-версии. Выберите server/data/game.sqlite из папки проекта.");
  checkHeader(source);

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "game.sqlite");
  const copied: string[] = [];
  try {
    for (const s of ["", ...SIDE_FILES]) {
      if (!isFile(source + s)) continue;
      fs.copyFileSync(source + s, file + s);
      copied.push(path.basename(source) + s);
    }
  } catch (err) {
    discardStaged(dir);
    throw new ImportError(`Не удалось скопировать базу: ${errText(err)}`);
  }

  try {
    return { source, copied, file, dir, method: "copy", ...inspect(file) };
  } catch (err) {
    if (err instanceof NotGameDb) {
      discardStaged(dir);
      throw err;
    }
    // копия несогласованная (сервер проекта писал в базу во время копирования) — снимок через SQLite
    removeDb(file);
    try {
      const src = new DatabaseSync(source, { readOnly: true });
      try {
        src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      } finally {
        src.close();
      }
      return { source, copied, file, dir, method: "snapshot", ...inspect(file) };
    } catch (err2) {
      discardStaged(dir);
      if (err2 instanceof ImportError) throw err2;
      throw new ImportError(`База не читается: ${errText(err2)} (копия: ${errText(err)})`);
    }
  }
}

export function discardStaged(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // временная папка — не критично
  }
}

/** Метка времени для имени копии: 2026-10-20_14-05-33 (без двоеточий — Windows). */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/**
 * Шаг 2: старая база десктопа → <target>.bak-<дата> (вместе с -wal/-shm, чтобы копия открывалась целиком),
 * проверенная копия → target. Всё или ничего: при ошибке переименования откатываются.
 * Встроенный сервер к этому моменту должен быть остановлен.
 */
export function commitImport(staged: StagedDb, target: string, now = new Date()): { backup: string | null } {
  const moved: [string, string][] = [];
  const move = (from: string, to: string) => {
    fs.renameSync(from, to);
    moved.push([from, to]);
  };
  let backup: string | null = null;
  try {
    if (["", ...SIDE_FILES].some((s) => isFile(target + s))) {
      const base = `${target}.bak-${stamp(now)}`;
      backup = base;
      for (let i = 2; ["", ...SIDE_FILES].some((s) => fs.existsSync(backup + s)); i++) backup = `${base}-${i}`;
      for (const s of ["", ...SIDE_FILES]) if (isFile(target + s)) move(target + s, backup + s);
    }
    for (const s of ["", ...SIDE_FILES]) if (isFile(staged.file + s)) move(staged.file + s, target + s);
  } catch (err) {
    for (const [from, to] of moved.reverse()) {
      try {
        fs.renameSync(to, from);
      } catch {
        // откат по возможности; ниже — сообщение с путями
      }
    }
    const busy = /EBUSY|EPERM|EACCES/.test((err as NodeJS.ErrnoException)?.code ?? "");
    throw new ImportError(
      `Не удалось заменить базу десктопа: ${errText(err)}.` + (busy ? " Файл занят — закройте другие окна игры и повторите." : "") + " База десктопа не изменена.",
    );
  }
  discardStaged(staged.dir);
  return { backup };
}
