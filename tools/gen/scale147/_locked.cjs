// Запуск команды под замком tools/out/scenario.lock3 (иначе lock): try/finally, BelowNormal.  node _locked.cjs <cmd...>
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const out = path.join(process.cwd(), "tools/out");
const names = ["scenario.lock3", "scenario.lock"];
let held = null;
const tryTake = () => { for (const n of names) { const d = path.join(out, n); try { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "owner"), `scale147-mobs ${process.pid} ${new Date().toISOString()}\n`); return d; } catch {} } return null; };
(async () => {
  const t0 = Date.now();
  while (!(held = tryTake())) { if (Date.now() - t0 > 540000) { console.error("замок занят"); process.exit(75); } await new Promise((r) => setTimeout(r, 5000)); }
  let code = 1;
  try {
    const c = cp.spawn(process.argv[2], process.argv.slice(3), { stdio: "inherit", shell: true });
    try { os.setPriority(c.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    code = await new Promise((r) => c.on("exit", (x) => r(x ?? 1)));
  } finally { try { fs.rmSync(held, { recursive: true, force: true }); } catch {} }
  process.exit(code);
})();
