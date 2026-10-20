/**
 * Запуск Electron без упаковки: npm run desktop:dev / desktop:smoke (флаг --smoke → SMOKE=1).
 * Убирает ELECTRON_RUN_AS_NODE из окружения (его наследуют, например, процессы расширений VS Code):
 * с ним electron.exe стартует как обычный Node, и окно не откроется.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electron = require("electron") as string; // путь к electron.exe (node_modules/electron/index.js)
const app = path.resolve(import.meta.dirname, "..", "out", "app");
const args = process.argv.slice(2);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (args.includes("--smoke")) env.SMOKE = "1";

const child = spawn(electron, [app, ...args], { stdio: "inherit", env, windowsHide: false });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
