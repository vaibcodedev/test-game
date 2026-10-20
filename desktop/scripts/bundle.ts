/**
 * Сборка десктоп-части (esbuild): npm run desktop:bundle
 *   desktop/out/app/    — main.cjs, preload.cjs, лаунчер, иконка, package.json (идёт в app.asar);
 *   desktop/out/server/ — server.mjs: server/src/index.ts одним файлом (+ data/*.json внутри), идёт в resources/server.
 * Клиент (dist/) собирает vite (npm run build); при упаковке он кладётся в resources/server/dist.
 */
import { build, type BuildOptions } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "desktop", "out");
const appDir = path.join(out, "app");
const serverDir = path.join(out, "server");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
const t0 = Date.now();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(appDir, "launcher", "fonts"), { recursive: true });
fs.mkdirSync(serverDir, { recursive: true });

const common: BuildOptions = { bundle: true, logLevel: "warning", legalComments: "none", absWorkingDir: root };

// главный процесс и preload — CommonJS (preload в sandbox умеет только require)
await build({
  ...common,
  entryPoints: ["desktop/src/main.ts"],
  outfile: path.join(appDir, "main.cjs"),
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __PROJECT_ROOT__: JSON.stringify(root) },
});
await build({
  ...common,
  entryPoints: ["desktop/src/preload.ts"],
  outfile: path.join(appDir, "preload.cjs"),
  platform: "node",
  format: "cjs",
  target: "chrome140",
  external: ["electron"],
});
await build({
  ...common,
  entryPoints: ["desktop/launcher/launcher.ts"],
  outfile: path.join(appDir, "launcher", "launcher.js"),
  platform: "browser",
  format: "iife",
  target: "chrome140",
});

// сервер: ESM (в index.ts top-level await); require для CommonJS-зависимостей — через createRequire.
// Внешние — только необязательные нативные ускорители (ws, msgpackr): без них работают JS-реализации.
const server = await build({
  ...common,
  entryPoints: ["desktop/src/server-entry.ts"],
  outfile: path.join(serverDir, "server.mjs"),
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["bufferutil", "utf-8-validate", "msgpackr-extract"],
  banner: { js: 'import { createRequire as __desktopCreateRequire } from "node:module";\nconst require = __desktopCreateRequire(import.meta.url);' },
  // без минификации и без source map: стек в журнале читаем как есть, а --enable-source-maps замедлял создание мира почти вдвое
  metafile: true,
});

// статические файлы лаунчера
const copy = (from: string, to: string) => fs.copyFileSync(path.join(root, from), path.join(appDir, to));
copy("desktop/launcher/index.html", "launcher/index.html");
copy("desktop/launcher/launcher.css", "launcher/launcher.css");
copy("desktop/build/icon.png", "launcher/icon.png");
copy("desktop/build/icon.ico", "icon.ico");
// шрифт заголовков — тот же, что в клиенте (client/src/styles/fonts.css), вместе с лицензией
copy("client/src/fonts/ark-pixel-10px.woff2", "launcher/fonts/ark-pixel-10px.woff2");
copy("client/src/fonts/OFL-ark-pixel.txt", "launcher/fonts/OFL-ark-pixel.txt");
for (const f of [
  "rubik/files/rubik-cyrillic-400-normal.woff2",
  "rubik/files/rubik-latin-400-normal.woff2",
  "rubik/files/rubik-cyrillic-500-normal.woff2",
  "rubik/files/rubik-latin-500-normal.woff2",
]) {
  copy(`node_modules/@fontsource/${f}`, `launcher/fonts/${path.basename(f)}`);
}

// package.json приложения: electron-builder берёт отсюда имя/версию, Electron — точку входа
fs.writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify(
    {
      name: "ashen-reach",
      productName: "Пепельный Предел",
      version: pkg.version,
      description: "Пепельный Предел — 2D MMORPG",
      author: "Пепельный Предел",
      license: "UNLICENSED",
      private: true,
      main: "main.cjs",
    },
    null,
    2,
  ),
);

const kb = (file: string) => `${Math.round(fs.statSync(file).size / 1024)} КБ`;
const serverFile = path.join(serverDir, "server.mjs");
console.log(
  `[desktop] собрано за ${Date.now() - t0} мс: main ${kb(path.join(appDir, "main.cjs"))}, preload ${kb(path.join(appDir, "preload.cjs"))}, ` +
    `лаунчер ${kb(path.join(appDir, "launcher", "launcher.js"))}, сервер ${kb(serverFile)} (${Object.keys(server.metafile.inputs).length} модулей)`,
);
if (!fs.existsSync(path.join(root, "dist", "index.html"))) console.warn("[desktop] dist/ не найден — соберите клиент: npm run build");
