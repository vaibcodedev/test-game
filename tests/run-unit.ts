/**
 * Все быстрые тесты без сервера (npm run test:unit): новые наборы tests/unit/*.ts и прежние автономные тесты tests/*.ts.
 * Каждый файл — отдельный процесс с пониженным приоритетом (машина нагружена), по одному (или -j N параллельно).
 * Наборы tests/unit печатают «RESULT passed=… failed=… known=… xpass=…» — они суммируются; прежние тесты считаются по коду выхода.
 * Тесты с запуском сервера сюда не входят (npm test, отдельные сценарии под tools/out/scenario.lock).
 * Флаги: -j N — параллельно N файлов; --unit — только tests/unit; фильтр — подстрока имени файла (npx tsx tests/run-unit.ts bank).
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNIT = ["economy", "bank-trade", "combat", "persistence", "anticheat", "teleport", "rewards", "stable", "legendary", "transmog", "admin", "drop", "slots-shoulders-gloves", "transmog-deep", "upgrade-deep", "gear-visual", "loot-bags",
  ...["warrior", "healer", "ranger", "mage", "rogue", "deathknight", "bloodweaver", "darkranger", "warlock", "reaver"].map((c) => `classes-${c}`), // механики классов (общие заготовки — classes-kit.ts)
  "world-map", "zone-range", "move-round", "gates", "world-visibility", "world-format", "pvp-world", "pvp-arena", "events-muster", "events-raid", "events-wboss", "social-party", "npc-leaders", // мир, PvP, события, группа/чат/задания
].map((f) => `tests/unit/${f}.ts`);
/** Прежние тесты без сервера (проверено: не поднимают сервер и браузер). */
const LEGACY = [
  "keybinds", "style-tokens", "cast-resolve", "skill-shape", "cast-move", "pick", "gearFx", "cc", "auras", "aura-fx", "aura-plan",
  "map-layout", "worldmap-labels", "terrain-tiles", "cities", "path-buffer", "server-safety", "npc-faction", "patrols", "squads",
  "mount-awards", "menagerie", "zone-boss-loot", "legendary", "zone-bosses", "move", "raid", "skill-fx", "editor",
  "cloak", "decor-rules", "dungeon-helpers", "fort-scenes", "fort-siege", "heroB-weapon", "nature-hitbox", "npc-ai",
  "soldier-hostility", "tiled-roundtrip", "water-edge", "banners-event", "guard-target",
].map((f) => `tests/${f}.ts`);

const args = process.argv.slice(2);
const jIdx = args.indexOf("-j");
const jobs = jIdx >= 0 ? Math.max(1, Number(args[jIdx + 1]) || 1) : 1;
const onlyUnit = args.includes("--unit");
const filter = args.filter((a, i) => !a.startsWith("-") && (jIdx < 0 || i !== jIdx + 1))[0];
const files = [...UNIT, ...(onlyUnit ? [] : LEGACY)].filter((f) => !filter || f.includes(filter));

interface Res { file: string; code: number; ms: number; passed: number; failed: number; known: number; xpass: number; tail: string }

function run(file: string): Promise<Res> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, ["--import", "tsx", file], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } });
    try { if (ch.pid) os.setPriority(ch.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    let out = "";
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => ch.kill(), 20 * 60_000); // path-buffer и raid под нагрузкой идут минутами
    ch.on("close", (code) => {
      clearTimeout(timer);
      const m = out.match(/RESULT passed=(\d+) failed=(\d+) known=(\d+) xpass=(\d+)/);
      const r: Res = { file, code: code ?? 1, ms: Date.now() - t0, passed: 0, failed: 0, known: 0, xpass: 0, tail: "" };
      if (m) [r.passed, r.failed, r.known, r.xpass] = m.slice(1).map(Number);
      else if (r.code === 0) r.passed = 1;
      else r.failed = 1;
      const lines = out.split(/\r?\n/);
      const interesting = lines.filter((l) => /FAIL|XPASS|known-fail|Error|ERR_/.test(l));
      r.tail = (interesting.length ? interesting : lines.slice(-8)).slice(0, 12).join("\n");
      resolve(r);
    });
  });
}

const results: Res[] = [];
const queue = [...files];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const r = await run(f);
    results.push(r);
    const mark = r.code === 0 ? "ok  " : "FAIL";
    const detail = /tests\/unit\//.test(f) ? ` (${r.passed} ok, ${r.failed} fail, ${r.known} known-fail${r.xpass ? `, ${r.xpass} xpass` : ""})` : "";
    console.log(`${mark} ${f}${detail} — ${(r.ms / 1000).toFixed(1)} с`);
    if (r.code !== 0 || r.known || r.xpass) console.log("     " + r.tail.split("\n").join("\n     "));
  }
}
console.log(`Быстрые тесты: ${files.length} файлов, параллельно ${jobs}\n`);
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

const sum = (k: "passed" | "failed" | "known" | "xpass") => results.reduce((n, r) => n + r[k], 0);
const badFiles = results.filter((r) => r.code !== 0);
console.log(`\nИТОГ: проверок ${sum("passed")} ok, ${sum("failed")} fail, ${sum("known")} known-fail (баги из docs/process/tests.md), ${sum("xpass")} xpass; файлов ${results.length}, с ошибками ${badFiles.length}`);
if (badFiles.length) console.log("Файлы с ошибками:\n  " + badFiles.map((r) => r.file).join("\n  "));
process.exit(badFiles.length ? 1 : 0);
