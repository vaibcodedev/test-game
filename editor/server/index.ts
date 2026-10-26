/** Редактор конфигов: локальный сервер (npm run editor). Правит data/*.json; в клиент игрока не попадает. */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createStore, ROOT } from "./store";

const PORT = Number(process.env.EDITOR_PORT) || 5300;
/** Вход в редактор (HTTP Basic, браузер спросит сам): по умолчанию admin / admin, меняется через EDITOR_USER и EDITOR_PASS. */
const AUTH = "Basic " + Buffer.from(`${process.env.EDITOR_USER || "admin"}:${process.env.EDITOR_PASS || "admin"}`).toString("base64");
const UI = path.join(ROOT, "editor", "ui");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

let mobsCache: unknown;
const store = createStore(undefined, (name) => {
  if (name === "mobs") return mobsCache;
  throw new Error("нет такого файла");
});

async function schemaBundle(): Promise<string> {
  const r = await build({ entryPoints: [path.join(ROOT, "editor", "schema", "index.ts")], bundle: true, format: "esm", write: false, platform: "browser", target: "es2022" });
  return r.outputFiles[0].text;
}

const STATIC: [string, string][] = [
  ["/styles/", path.join(ROOT, "client", "src", "styles")],
  ["/assets/", path.join(ROOT, "client", "public", "assets")],
  ["/ui/", path.join(ROOT, "client", "public", "ui")],
  ["/fonts/rubik/", path.join(ROOT, "node_modules", "@fontsource", "rubik", "files")],
  ["/fonts/", path.join(ROOT, "client", "src", "fonts")],
  ["/", UI],
];

let tscRunning = false;
function runTsc(): Promise<{ ok: boolean; output: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: ROOT, shell: true, windowsHide: true });
    try { if (p.pid) os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* не критично */ }
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ ok: code === 0, output: out.trim(), ms: Date.now() - t0 }));
  });
}

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = (req: http.IncomingMessage) => new Promise<any>((resolve, reject) => {
  let s = "";
  req.on("data", (d) => { s += d; if (s.length > 64 << 20) reject(new Error("слишком большое тело")); });
  req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== AUTH) {
      res.writeHead(401, { "www-authenticate": 'Basic realm="Config editor", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" });
      return res.end("Нужен вход в редактор");
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/")) {
      if (req.method === "POST" && req.headers["x-editor"] !== "1") return json(res, 403, { error: "нужен заголовок X-Editor" });
      if (p === "/api/files") return json(res, 200, store.list());
      if (p === "/api/file") {
        const name = url.searchParams.get("name") ?? "";
        if (name === "mobs" && !mobsCache) mobsCache = { mobs: (await import("../../shared/mobs")).MOBS };
        const f = store.read(name);
        return json(res, 200, { name, data: f.data, readonly: f.readonly });
      }
      if (p === "/api/validate" && req.method === "POST") {
        const b = await readBody(req);
        return json(res, 200, store.check(b.name, b.data));
      }
      if (p === "/api/history") return json(res, 200, store.history(url.searchParams.get("name") ?? ""));
      if (p === "/api/commit-diff") return json(res, 200, store.commitDiff(url.searchParams.get("name") ?? "", url.searchParams.get("hash") ?? ""));
      if (p === "/api/preview" && req.method === "POST") {
        const b = await readBody(req);
        return json(res, 200, store.preview(b.name, b.data));
      }
      if (p === "/api/save" && req.method === "POST") {
        const b = await readBody(req);
        const r = store.save(b.name, b.data);
        return json(res, r.ok ? 200 : 400, r);
      }
      if (p === "/api/revert" && req.method === "POST") {
        const b = await readBody(req);
        const r = store.revert(b.name, b.hash || "HEAD");
        return json(res, 200, { ...r, data: store.read(b.name).data });
      }
      if (p === "/api/tsc" && req.method === "POST") {
        if (tscRunning) return json(res, 409, { error: "проверка уже идёт" });
        tscRunning = true;
        try { return json(res, 200, await runTsc()); } finally { tscRunning = false; }
      }
      return json(res, 404, { error: "нет такого запроса" });
    }
    if (p === "/schema.js") {
      res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" });
      return res.end(await schemaBundle());
    }
    for (const [prefix, dir] of STATIC) {
      if (!p.startsWith(prefix)) continue;
      const rel = p === "/" ? "index.html" : p.slice(prefix.length);
      const f = path.resolve(dir, rel);
      if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
      res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404).end("not found");
  } catch (e: any) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Редактор конфигов: http://localhost:${PORT}/`));
