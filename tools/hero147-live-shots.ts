/**
 * Задача 147, подключение героя «Б»: снимки в игре с флагом (консоль heroB.on(), без перезапуска) → tools/out/hero147-live/.
 * Три героя: воин (Сольгард, свой), рыцарь смерти (Умбрат), воин-союзник. Сеты — латы Рыцаря Хаоса и латы новобранца (heroB.set).
 * Рядом с героем — ряды кадров его листа: покой, бег, удар × вниз, вверх, вправо, влево; слева — Сольгард, справа — Умбрат.
 * День и ночь (Date.now со сдвигом фазы), зум 2 и 3. Наведение: зелёное (союзник), красное (враг: isEnemy подменён на «игрок — враг»), золотое (NPC).
 * Замок tools/out/scenario.lock3 (каталог), чужой не трогается; приоритет ниже обычного.
 *   $env:TEST_PORT="2977"; $env:VITE_TEST_PORT="5377"; npx tsx tools/hero147-live-shots.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, sleep, startServer, stopServer, PORT } from "../tests/harness";
import { DAY_CYCLE_MS } from "../shared/daynight";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5377, OUT = path.resolve("tools/out/hero147-live"), LOCK = path.resolve("tools/out/scenario.lock3");
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const log = (s: string) => console.log(s);
const errors: string[] = [];

async function newPage(browser: Browser) {
  const p = await browser.newPage();
  p.setDefaultNavigationTimeout(300000); p.setDefaultTimeout(180000);
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  await p.setViewport({ width: 1366, height: 768 });
  // фаза дня управляется из сценария: window.__phase (0.3 — день, 0.83 — ночь). Причина зависаний прежних прогонов (вместе с фоновыми вкладками):
  // Date.now возвращал одно и то же значение до конца цикла дня — клиент и сервер расходились, вход переподключался по кругу.
  await p.evaluateOnNewDocument(`try { localStorage.setItem("shadowMode", "dynamic"); } catch {}
    (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; let ph = -1, off = 0; window.__phase = 0.3;
      // сдвиг считается один раз на смену фазы: часы идут ровно (прежняя формула замораживала Date.now — истекали брони мест, вход шёл минутами и по кругу)
      Date.now = () => { const t = n0(); if (window.__phase !== ph) { ph = window.__phase; off = ((ph * C - (t % C)) + C) % C; } return t + off; }; })();`);
  return p;
}
async function login(page: Page, name: string, cls: string) {
  await page.bringToFront();
  const t0 = Date.now();
  const token = await ensureChar(`hb${Array.from(name).map((c) => c.charCodeAt(0).toString(36)).join("")}`.slice(0, 16), "secret", name, cls);
  for (let k = 0; ; k++) {
    try {
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); }, token);
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 60000, polling: 500 });
      await sleep(2000);
      log(`вход ${name}: ${((Date.now() - t0) / 1000).toFixed(0)} с`);
      return;
    } catch (e) { if (k >= 2) throw e; log(`повтор входа: ${String((e as Error).message).slice(0, 80)}`); }
  }
}
const dbg = (page: Page, m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
const shot = async (page: Page, id: string) => { fs.mkdirSync(OUT, { recursive: true }); await page.bringToFront(); await page.screenshot({ path: path.join(OUT, `${id}.png`) as `${string}.png` }); log(`снят ${id}`); };

/** Ряды кадров листов героев (свой и два соседних) вокруг своего героя; старые ряды убираются. */
const GRID = `(() => {
  const s = window.__game.scene.getScene("game");
  (window.__hbGrid || []).forEach((o) => o.destroy());
  const out = []; window.__hbGrid = out;
  const me = s.units.get(window.__net.id); if (!me) return "нет себя";
  const others = [...s.units.values()].filter((v) => v !== me && v.u.kind === me.u.kind && v.hb);
  const umb = others.find((v) => v.u.faction !== me.u.faction);
  const list = [[me, -1], [umb, 1]].filter((q) => q[0] && q[0].hb);
  const res = [];
  for (const [v, side] of list) {
    const sh = v.hb, F = sh.frame;
    const anims = [["rest", 2, -50], ["walk", 2, 50], ["attack", -1, 98]];
    const dirs = [[0, sh.sid, false], [1, sh.sid, false], [2, sh.sid, false], [2, sh.sidL, true]];
    dirs.forEach(([view, sid, flip], c) => anims.forEach(([name, fi, dy]) => {
      const a = s.anims.get(sid + "-" + name + "-" + view); if (!a) return;
      const fr = a.frames[fi < 0 ? Math.round(a.frames.length * 0.55) : fi].frame.name;
      const x = Math.round(me.x + side * (40 + c * 44)), y = Math.round(me.y + dy);
      const sp = s.add.sprite(x, y, sh.key, fr).setOrigin(sh.ox, sh.oy).setFlipX(flip).setDepth(y);
      out.push(sp);
      const sd = s.add.image(x, y - 2, "fx_shadow_blob").setDepth(-1e5 + 5); out.push(sd);
      if (sh.glow) { const g = s.add.sprite(x, y, sh.key + "_glow", fr).setOrigin(sh.ox, sh.oy).setFlipX(flip).setDepth(1e6 - 44); out.push(g); g.__night = true; }
    }));
    res.push(sh.key);
  }
  return res.join(" | ");
})()`;
/** Свечение «Б» ночью у рядов: альфа по ночи (как UnitView). */
const GLOW = (night: number) => `(window.__hbGrid || []).forEach((o) => { if (o.__night) o.setAlpha(${night}).setVisible(${night} > 0.05); })`;


/** Запись кадров вокруг своего героя (зум 3): n снимков через ms → полоса tools/out/hero147-live/<tag>.png. */
async function record(p: Page, tag: string, n: number, ms: number) {
  const { PNG } = await import("pngjs");
  const W = 240, H = 240, strip = new PNG({ width: W * n, height: H });
  for (let k = 0; k < n; k++) {
    const buf = await p.screenshot({ clip: { x: 683 - W / 2, y: 384 - H / 2 - 40, width: W, height: H } }) as Buffer;
    const im = PNG.sync.read(Buffer.from(buf));
    PNG.bitblt(im, strip, 0, 0, W, H, k * W, 0);
    await sleep(ms);
  }
  fs.writeFileSync(path.join(OUT, `${tag}.png`), PNG.sync.write(strip)); log(`запись ${tag}`);
}
/** Ткань (бег, остановка, ветер) и особый удар Рыцаря с огненным следом — на своём герое в сете Рыцаря. */
async function clothAndSpecial(A: Page) {
  await A.bringToFront();
  await A.evaluate(`window.heroB.set("chaos-knight"); window.__phase = 0.3; (window.__hbGrid || []).forEach((o) => o.destroy()); window.__hbGrid = []; window.__game.scene.getScene("game").cameras.main.setZoom(3);`);
  await sleep(3500);
  await record(A, "cloth_idle_wind", 10, 300);
  // бег: клик по земле вправо (герой бежит ~3 с), затем остановка
  await A.mouse.click(683 + 330, 384 + 20, { button: "right" }); // ЛКМ по земле ведёт героя только в раскладке «Классика»
  await record(A, "cloth_run_stop", 14, 220);
  await A.mouse.click(683 - 330, 384 + 20, { button: "right" }); // ЛКМ по земле ведёт героя только в раскладке «Классика»
  await record(A, "cloth_run_back", 14, 220);
  await A.keyboard.press("Escape");
  await sleep(2500);
  // особый удар: анимация attack2 своего листа и огненный след (как в UnitView при каждом 3-м ударе)
  for (const view of [0, 2]) {
    await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); if (!v || !v.hb) return; v.attacking = true; v.sprite.play(v.hb.sid + "-attack2-${view}"); v.hbPush = true; window.heroB.trail(s, Math.round(v.x), Math.round(v.y), v.y, false, 875); })()`);
    await record(A, `special2h_view${view}`, 10, 85);
    await sleep(800);
  }
}

async function screenOf(p: Page, wx: number, wy: number) {
  return p.evaluate((x: number, y: number) => {
    const s = (window as any).__game.scene.getScene("game"), cam = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
    return { x: r.left + (x - cam.worldView.x) * cam.zoom * (r.width / s.game.canvas.width) * (s.game.canvas.width / cam.width), y: r.top + (y - cam.worldView.y) * cam.zoom * (r.height / s.game.canvas.height) * (s.game.canvas.height / cam.height) };
  }, wx, wy);
}

/** QUICK=1: один воин, heroB.self() + вид сета Рыцаря, зум 3 днём и ночью — быстрая проверка пути «включить и посмотреть». */
async function quick(browser: Browser) {
  const A = await newPage(browser);
  await login(A, "Быстробэ", "warrior");
  await dbg(A, { op: "god" });
  log(await A.evaluate(`window.heroB.self()`) as string);
  for (const set of ["chaos-knight", "recruit-plate"]) {
    await A.evaluate(`window.heroB.set(${JSON.stringify(set)})`);
    await sleep(4000);
    log(`${set}: ${await A.evaluate(GRID)}`);
    log(JSON.stringify(await A.evaluate(`window.heroB.status()`)));
    for (const PH of [0.3, 0.83]) {
      await A.evaluate(`window.__phase = ${PH}; window.__game.scene.getScene("game").cameras.main.setZoom(3);`);
      await A.evaluate(GLOW(PH > 0.5 ? 1 : 0));
      await sleep(1500);
      await shot(A, `quick_${set}_z3_${PH > 0.5 ? "night" : "day"}`);
    }
  }
  await clothAndSpecial(A);
  await A.close();
}

/**
 * ANIM=1: анимация основы Б в игре (Рыцарь Хаоса, зум 3): переступ в покое, бег → остановка, бег при замедлении (timeScale),
 * удар по мобу: кадр анимации в момент урона (цифры) — в лог; полосы кадров anim_*.png.
 */
async function animCheck(browser: Browser) {
  const A = await newPage(browser);
  await login(A, "Анимбэ", "warrior");
  await dbg(A, { op: "god" });
  log(await A.evaluate(`window.heroB.self()`) as string);
  await A.evaluate(`window.heroB.set("chaos-knight"); window.__phase = 0.3; window.__game.scene.getScene("game").cameras.main.setZoom(3);`);
  await sleep(5000);
  await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"); window.__hbLog = []; window.__hbDmg = [];
    s.events.on("postupdate", () => { const v = s.units.get(window.__net.id); if (!v) return; const a = v.sprite.anims, k = a.currentAnim ? a.currentAnim.key.split("-").slice(-2).join("-") : "";
      window.__hbLog.push([Math.round(performance.now()), k, (a.currentFrame ? a.currentFrame.index : 1) - 1, +a.timeScale.toFixed(2), Math.round(v.hbSpeed || 0), v.u.aseq, v.u.anim, v.attacking ? 1 : 0, v.hb ? 1 : 0]); if (window.__hbLog.length > 20000) window.__hbLog.splice(0, 5000); });
    window.__net.on("fx", (list) => list.forEach((f) => { if (f.t === "dmg") window.__hbDmg.push([Math.round(performance.now()), f.id, f.v]); })); })()`);
  if (process.env.ENCH_ONLY) { await enchantShots(A); await A.close(); return; }
  if (process.env.DIAG) {
    const { PNG } = await import("pngjs");
    const clip = async (tag: string) => { const buf = await A.screenshot({ clip: { x: 683 - 110, y: 384 - 150, width: 220, height: 220 } }) as Buffer; fs.writeFileSync(path.join(OUT, tag + ".png"), PNG.sync.write(PNG.sync.read(Buffer.from(buf)))); };
    await A.evaluate('window.heroB.set("chaos-knight")');
    await A.waitForFunction(() => { const v = (window as any).__game.scene.getScene("game").units.get((window as any).__net.id); return !!(v && v.hb && v.hb.key.includes("chaos")); }, { timeout: 300000, polling: 1000 });
    await sleep(3000); await clip("diag-p0");
    await A.evaluate('(() => { const v = window.__game.scene.getScene("game").units.get(window.__net.id); const p = v.u.weapon.split(":"); p[2] = "11"; v.u.weapon = p.join(":"); })()');
    await sleep(2500); await clip("diag-p11");
    log("diag: " + await A.evaluate('(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id), e = v.ench; const d = (o) => o ? [o.texture.key.slice(-12), o.frame.name, o.visible, +o.alpha.toFixed(2), o.depth.toFixed(1), o.tintTopLeft.toString(16), o.blendMode] : null; return JSON.stringify({ hero: d(v.sprite), s1: d(e && e.s1), s2: d(e && e.s2), s3: d(e && e.s3), ench: !!v.hb.ench, max: s.renderer.getMaxTextureSize ? s.renderer.getMaxTextureSize() : 0, dyn: v.dyn ? Object.keys(v.dyn).join(",") : "" }); })()'));
    await A.evaluate('(() => { const v = window.__game.scene.getScene("game").units.get(window.__net.id); v.ench.s1.setVisible(false); if (v.ench.s2) v.ench.s2.setVisible(false); v.ench.update = () => {}; })()');
    await sleep(800); await clip("diag-p11-hidden");
    await A.close(); return;
  }
  const pos = async () => A.evaluate(`(() => { const v = window.__game.scene.getScene("game").units.get(window.__net.id); return Math.round(v.x) + "," + Math.round(v.y) + " " + v.u.anim; })()`);
  const summary = async (tag: string, t0: number) => log(`${tag}: ` + await A.evaluate(`(() => { const L = window.__hbLog.filter((q) => q[0] >= ${t0}); const out = []; let prev = ""; for (const q of L) { const s = q[1] + ":" + q[2]; if (s !== prev) { out.push(s + (q[3] !== 1 ? "×" + q[3] : "") + (q[4] ? "@" + q[4] : "")); prev = s; } } return out.slice(0, 70).join(" "); })()`));
  let t0 = 0;
  if (!process.env.ATK_ONLY) {
  // переступ: разрешить сразу
  await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); v.hbIdle2At = 0; })()`);
  await sleep(1500);
  await record(A, "anim_idle_step", 16, 90);
  t0 = await A.evaluate(`Math.round(performance.now())`) as number;
  await A.mouse.click(683 + 300, 384 + 10, { button: "right" }); // ЛКМ по земле ведёт героя только в раскладке «Классика»
  log(`до бега ${await pos()}`);
  await record(A, "anim_run_stop", 14, 140);
  log(`после бега ${await pos()}`);
  await summary("бег → остановка", t0);
  await dbg(A, { op: "slow", v: 60, ms: 9000 }); await sleep(300);
  t0 = await A.evaluate(`Math.round(performance.now())`) as number;
  await A.mouse.click(683 - 300, 384 + 10, { button: "right" }); // ЛКМ по земле ведёт героя только в раскладке «Классика»
  await record(A, "anim_run_slowed", 12, 140);
  await summary("бег при замедлении 60 %", t0);
  await sleep(2500);
  }
  log(`позиция ${await pos()}`);
  // удар по ближайшему мобу
  const mob = await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), me = s.units.get(window.__net.id); let b = null, bd = 1e9;
    for (const v of s.units.values()) { if (v === me || v.dead || v.npc || v.u.kind === me.u.kind || !s.isEnemy || !s.isEnemy(v)) continue; const d = Math.hypot(v.x - me.x, v.y - me.y); if (d < bd) { bd = d; b = v; } }
    return b ? { id: b.id, x: b.x, y: b.y, d: Math.round(bd) } : null; })()`) as { id: string; x: number; y: number; d: number } | null;
  if (!mob) { log("моба рядом нет — удар не проверен"); await A.close(); return; }
  log(`моб ${mob.id} в ${mob.d} px`);
  await dbg(A, { op: "tp", x: mob.x - 34, y: mob.y + 2 }); await sleep(2500);
  for (let k = 0; k < 3; k++) { log("переступ: " + await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); return Math.round(s.time.now) + " → " + Math.round(v.hbIdle2At) + " " + (v.sprite.anims.currentAnim ? v.sprite.anims.currentAnim.key.split("-").slice(-2).join("-") : "") + " моб " + JSON.stringify((() => { const m = s.units.get(${JSON.stringify(mob.id)}); return m ? [Math.round(m.x - v.x), Math.round(m.y - v.y), m.dead, s.isEnemy(m)] : null; })()); })()`)); await sleep(1500); }
  t0 = await A.evaluate(`Math.round(performance.now())`) as number;
  await A.evaluate(`window.__net.send("attack", { id: ${JSON.stringify(mob.id)} })`);
  await record(A, "anim_attack", 14, 60);
  for (let k = 0; k < 6; k++) { await dbg(A, { op: "mobhp", id: mob.id, v: 1 }); await sleep(800); }
  await A.mouse.click(683 - 300, 384 + 10, { button: "right" }); // ЛКМ по земле ведёт героя только в раскладке «Классика»
  await record(A, "anim_attack_to_run", 10, 120);
  await summary("удар → стойка → бег", t0);
  const sync = await A.evaluate(`(() => { const out = []; for (const [t, id, v] of window.__hbDmg) { if (id !== ${JSON.stringify(mob.id)} || t < ${t0}) continue; const L = window.__hbLog.filter((q) => q[0] <= t); const q = L[L.length - 1]; out.push((q ? q[1] + ":" + q[2] + (q[3] !== 1 ? "×" + q[3] : "") : "?") + "(" + v + ")"); } return out.join(" "); })()`);
  log(`кадр анимации в момент урона (контакт atk2h = 8): ${sync || "урона нет"}`);
  log("хронология удара (мс от начала): " + await A.evaluate(`(() => { const out = []; let prev = ""; for (const q of window.__hbLog) { if (q[0] < ${t0} || q[0] > ${t0} + 6000) continue; const k = q[1] + ":" + q[2]; if (k !== prev && /attack/.test(q[1]) && (q[2] === 0 || q[2] === 8)) out.push((q[0] - ${t0}) + " " + k); prev = k; } for (const [t, id, v] of window.__hbDmg) if (id === ${JSON.stringify(mob.id)} && t >= ${t0} && t < ${t0} + 6000) out.push((t - ${t0}) + " УРОН " + v); return out.sort((a, b) => parseInt(a) - parseInt(b)).join(" | "); })()`));
  log("перед уроном: " + await A.evaluate(`(() => { const out = []; for (const [t, id] of window.__hbDmg.filter((d) => d[1] === ${JSON.stringify(mob.id)}).slice(0, 2)) { const L = window.__hbLog.filter((q) => q[0] <= t).slice(-14); out.push("УРОН@" + t + ": " + L.map((q) => (t - q[0]) + "мс " + q[1] + ":" + q[2] + " a" + q[5] + " u" + q[6] + " at" + q[7] + " hb" + q[8]).join(", ")); } return out.join(" || "); })()`));
  log(`FPS страницы: ${await A.evaluate("Math.round(window.__game.loop.actualFps)")}`);
  if (process.env.ATK_ONLY || process.env.NO_ENCH) { await A.close(); return; }
  await enchantShots(A);
  await A.close();
}

/** Заточка героя Б (вариант D): +0/+5/+8/+11 на Рыцаре Хаоса и новобранце, покой и кадр контакта удара, день и ночь, зум 3 → enchant-*.png; удар +8/+11 — полоса кадров (шлейф). */
async function enchantShots(A: Page) {
  const { PNG } = await import("pngjs");
  const clip = async (tag: string) => { const buf = await A.screenshot({ clip: { x: 683 - 110, y: 384 - 150, width: 220, height: 220 } }) as Buffer; fs.writeFileSync(path.join(OUT, `${tag}.png`), PNG.sync.write(PNG.sync.read(Buffer.from(buf)))); };
  await sleep(1500);
  for (const set of ["chaos-knight", "recruit-plate"]) {
    await A.evaluate(`window.heroB.set(${JSON.stringify(set)})`);
    await A.waitForFunction((st: string) => { const v = (window as any).__game.scene.getScene("game").units.get((window as any).__net.id); return !!(v && v.hb && v.hb.key.includes(st)); }, { timeout: 300000, polling: 1000 }, set);
    await sleep(2000);
    // день, затем ночь: фаза меняется один раз (резкий скачок Date.now раскачивает ткань — после него пауза)
    for (const PH of [0.3, 0.83]) {
      await A.evaluate(`window.__phase = ${PH}; window.__game.scene.getScene("game").cameras.main.setZoom(3);`); await sleep(4000);
      for (const plus of [0, 5, 8, 11]) {
        await A.waitForFunction((st: string) => { const v = (window as any).__game.scene.getScene("game").units.get((window as any).__net.id); return !!(v && v.hb && v.hb.key.includes(st)); }, { timeout: 300000, polling: 1000 }, set);
        await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); const p = (v.u.weapon || "greatsword:0:0").split(":"); p[2] = "${plus}"; v.u.weapon = p.join(":"); })()`);
        await sleep(1500);
        await clip(`enchant-${set}-p${plus}-idle-${PH > 0.5 ? "night" : "day"}`);
        // кадр контакта удара (atk2h.hit = 8): удар вбок стоит на кадре контакта
        await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); v.attacking = true; v.sprite.setFlipX(false).play(v.hb.sid + "-attack-2"); v.sprite.anims.pause(v.sprite.anims.currentAnim.frames[8]); })()`); await sleep(900);
        await clip(`enchant-${set}-p${plus}-hit-${PH > 0.5 ? "night" : "day"}`);
        await A.evaluate(`(() => { const v = window.__game.scene.getScene("game").units.get(window.__net.id); v.sprite.anims.resume(); })()`); await sleep(1500);
        if (plus >= 8 && PH > 0.5) {
          await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), v = s.units.get(window.__net.id); v.attacking = true; v.sprite.play(v.hb.sid + "-attack-2"); v.sprite.anims.timeScale = 0.5; })()`);
          await record(A, `enchant-${set}-p${plus}-swing-night`, 12, 70);
          await sleep(1500);
        }
      }
    }
  }
  log("заточка: снимки enchant-*.png");
}

async function run(browser: Browser) {
  if (process.env.QUICK) return quick(browser);
  if (process.env.ANIM) return animCheck(browser);
  // Причина зависания прежнего прогона: три вкладки открывались сразу, вход шёл в фоновых — у фоновой вкладки requestAnimationFrame
  // стоит, Phaser не стартует, ожидание сцены (120 с × 3 попытки) на каждой. Теперь вкладка создаётся перед входом и выводится вперёд,
  // а у Chrome выключено торможение фоновых вкладок (флаги в launch).
  const A = await newPage(browser); await login(A, "Сольбэ", "warrior");
  const B = await newPage(browser); await login(B, "Умбэ", "deathknight");
  const C = await newPage(browser); await login(C, "Союзбэ", "warrior");
  await A.bringToFront();
  for (const p of [A, B, C]) { await dbg(p, { op: "god" }); await dbg(p, { op: "level", v: 100 }); }
  const me = await A.evaluate(`({ x: window.__net.self.x, y: window.__net.self.y })`) as { x: number; y: number };
  await dbg(A, { op: "tp", x: me.x, y: me.y });
  await dbg(B, { op: "tp", x: me.x + 26, y: me.y + 4 });
  await dbg(C, { op: "tp", x: me.x - 26, y: me.y + 4 });
  await sleep(2500);
  for (const p of [A, B, C]) await p.evaluate(`window.heroB.on()`);
  await sleep(2500);
  // проверка хитбокса героя Б по маске кадра (A смотрит на B)
  for (const set of ["chaos-knight", "recruit-plate"]) {
    for (const p of [A, B, C]) await p.evaluate(`window.heroB.set(${JSON.stringify(set)})`);
    await sleep(3000);
    const keys = await A.evaluate(GRID);
    log(`${set}: ${keys}`);
    const hit = await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"); const v = [...s.units.values()].find((q) => q.u.faction === "umbrath" && q.hb); if (!v) return "нет"; const sp = v.sprite;
      const t = (dx, dy, r) => { const d = v.hitTest(sp.x + dx, sp.y + dy, r, false); return d === Infinity ? "мимо" : d.toFixed(1); };
      return { rise: v.hb.rise, frame: v.hb.frame, head: t(0, -v.hb.rise + 2, 0), aboveHead: t(0, -v.hb.rise - 4, 0), aboveTol: t(0, -v.hb.rise - 4, 5), side: t(14, -14, 0), feet: t(0, -2, 0), boxW: Math.round(v.body.x1 - v.body.x0), boxH: Math.round(v.body.y1 - v.body.y0) }; })()`);
    log(`хитбокс ${set}: ${JSON.stringify(hit)}`);
    for (const [Z, PH] of [[2, 0.3], [3, 0.3], [2, 0.83], [3, 0.83]] as [number, number][]) {
      await A.evaluate(`window.__phase = ${PH}; window.__game.scene.getScene("game").cameras.main.setZoom(${Z});`);
      await A.evaluate(GLOW(PH > 0.5 ? 1 : 0));
      await sleep(1800);
      await shot(A, `${set}_z${Z}_${PH > 0.5 ? "night" : "day"}`);
    }
    // наведение: союзник — зелёное, враг — красное (isEnemy: игрок — враг), NPC — золотое; зум 3, день
    await A.evaluate(`window.__phase = 0.3; (window.__hbGrid || []).forEach((o) => o.setVisible(false)); window.__game.scene.getScene("game").cameras.main.setZoom(3);`);
    await sleep(800);
    const pos = async (who: "ally" | "foe") => A.evaluate(`(() => { const s = window.__game.scene.getScene("game"), me = s.units.get(window.__net.id); const v = [...s.units.values()].find((q) => q !== me && q.u.kind === me.u.kind && (${who === "foe"} ? q.u.faction !== me.u.faction : q.u.faction === me.u.faction)); return v ? { x: v.sprite.x, y: v.sprite.y - 14 } : null; })()`) as Promise<{ x: number; y: number } | null>;
    const ally = await pos("ally");
    if (ally) { const sc = await screenOf(A, ally.x, ally.y); await A.mouse.move(sc.x, sc.y); await sleep(900); await shot(A, `${set}_hover_green`); }
    await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"); s.__isEnemy0 ??= s.isEnemy; s.isEnemy = (v) => v.u.kind === 0 ? v.u.faction !== window.__net.self.faction : s.__isEnemy0(v); })()`);
    const foe = await pos("foe");
    if (foe) { const sc = await screenOf(A, foe.x, foe.y); await A.mouse.move(sc.x, sc.y); await sleep(900); await shot(A, `${set}_hover_red`); }
    await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"); if (s.__isEnemy0) s.isEnemy = s.__isEnemy0; })()`);
    await A.evaluate(`(window.__hbGrid || []).forEach((o) => o.setVisible(true))`);
  }
  // золотое: ближайший видимый NPC (свечение NPC прежнее, проверка, что герой Б его не ломает)
  const npc = await A.evaluate(`(() => { const s = window.__game.scene.getScene("game"); let b = null, bd = 1e9; for (const n of s.npcs) { if (!n.sprite || !n.sprite.visible || !n.id) continue; const d = Math.hypot(n.sprite.x - s.pos.x, n.sprite.y - s.pos.y); if (d < bd) { bd = d; b = n; } } return b ? { x: b.sprite.x, y: b.sprite.y - 12 } : null; })()`) as { x: number; y: number } | null;
  if (npc) {
    await dbg(A, { op: "tp", x: npc.x + 30, y: npc.y + 30 }); await sleep(2500);
    const sc = await screenOf(A, npc.x, npc.y); await A.mouse.move(sc.x, sc.y); await sleep(900); await shot(A, `hover_gold_npc`);
  }
  await clothAndSpecial(A);
  for (const p of [A, B, C]) await p.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (let k = 0; ; k++) { try { fs.mkdirSync(LOCK); break; } catch { if (k % 12 === 0) log("жду замок scenario.lock3…"); if (k > 720) throw new Error("замок"); await sleep(5000); } }
  try {
    fs.writeFileSync(path.join(LOCK, "owner"), `hero147-live ${process.pid} ${new Date().toISOString()}\n`);
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    await startServer(true);
    try {
      const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 600000 });
      try { await run(browser); } finally { await browser.close(); }
    } finally { await vite.close(); await stopServer(); }
  } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
  if (errors.length) log(`ошибки страницы (${errors.length}):\n` + [...new Set(errors)].slice(0, 12).join("\n"));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
