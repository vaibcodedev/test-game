/**
 * Стенд превью вау-эффектов (страница client/fx-preview.html, запускается tools/wow-preview.ts). Без сервера и без игры:
 * маленькая сцена 320x180, процедурная земля, герой, дома. Каждый случай снимает кадры по меткам времени игры
 * и собирает лист (подписи, зум 2 без сглаживания). В игру не подключается.
 */
import Phaser from "phaser";
import { Birds, DmgNumbers, BossIntro, warpOut, warpIn, warpClear, CloudShadows, Decals, RopeCloth, clothTexture, chainTexture, PickupFly, wowForce, wind } from "./index";

wowForce(true);
const W = 320, H = 180;

type Handle = { update?: (dt: number) => void; destroy?: () => void };
interface Case { section: string; zoom: number; labels: string[]; marks: number[]; end?: number; setup: (s: PV) => Handle | void }
let cases: Case[] = [];

class PV extends Phaser.Scene {
  cur: Handle | null = null;
  constructor() { super("pv"); }
  create() { this.makeArt(); }
  override update(_t: number, dt: number) { this.cur?.update?.(dt); }

  makeArt() {
    const mk = (key: string, w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d")!); this.textures.addCanvas(key, c); };
    let seed = 5; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ground = (key: string, base: string, tones: string[]) => mk(key, 32, 32, (g) => { g.fillStyle = base; g.fillRect(0, 0, 32, 32); for (let i = 0; i < 60; i++) { g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1 + Math.floor(r() * 2), 1); } });
    ground("g_grass", "#4d7a38", ["#436b31", "#58853f", "#3b5f2b", "#689848"]);
    ground("g_snow", "#d9e4ee", ["#c9d8e6", "#e8f0f7", "#b9cbdc"]);
    ground("g_sand", "#cfae72", ["#c19f64", "#dcc08a", "#b8955a"]);
    mk("hero", 10, 16, (g) => { g.fillStyle = "#2c3e66"; g.fillRect(2, 6, 6, 7); g.fillStyle = "#e0b890"; g.fillRect(3, 1, 4, 5); g.fillStyle = "#6a4a2a"; g.fillRect(3, 1, 4, 2); g.fillStyle = "#222"; g.fillRect(2, 13, 2, 3); g.fillRect(6, 13, 2, 3); g.fillStyle = "#9ab"; g.fillRect(8, 5, 1, 7); });
    mk("mob", 12, 10, (g) => { g.fillStyle = "#6a3030"; g.fillRect(1, 2, 10, 7); g.fillStyle = "#8a4040"; g.fillRect(2, 1, 8, 3); g.fillStyle = "#ffd040"; g.fillRect(3, 3, 2, 2); g.fillRect(7, 3, 2, 2); });
    mk("house", 44, 36, (g) => { g.fillStyle = "#cdb48a"; g.fillRect(4, 16, 36, 20); g.fillStyle = "#8a6a44"; g.fillRect(4, 33, 36, 3); g.fillStyle = "#4a3320"; g.fillRect(19, 24, 7, 12); g.fillStyle = "#79b0d8"; g.fillRect(8, 21, 6, 6); g.fillRect(30, 21, 6, 6);
      for (let y = 0; y < 16; y++) { const inset = Math.floor((15 - y) * 0.9); g.fillStyle = y % 4 === 3 ? "#7a2a24" : "#a63a30"; g.fillRect(inset, y, 44 - inset * 2, 1); } });
    mk("boss", 64, 80, (g) => { // 2 кадра: стоит / жест (руки вверх, свечение)
      for (let f = 0; f < 2; f++) { const o = f * 32; g.fillStyle = "#2a1c30"; g.fillRect(o + 8, 20, 16, 50); g.fillStyle = "#3d2848"; g.fillRect(o + 6, 38, 20, 36); g.fillStyle = "#1a1020"; g.fillRect(o + 10, 8, 12, 14); g.fillStyle = "#ff5a3a"; g.fillRect(o + 12, 14, 2, 2); g.fillRect(o + 18, 14, 2, 2);
        g.fillStyle = "#c8c0a0"; g.fillRect(o + 8, 4, 3, 6); g.fillRect(o + 21, 4, 3, 6);
        g.fillStyle = "#2a1c30"; if (f === 0) { g.fillRect(o + 2, 28, 4, 22); g.fillRect(o + 26, 28, 4, 22); } else { g.fillRect(o + 1, 6, 4, 28); g.fillRect(o + 27, 6, 4, 28); g.fillStyle = "#ffcc60"; g.fillRect(o, 2, 6, 5); g.fillRect(o + 26, 2, 6, 5); } }
    });
    const t = this.textures.get("boss"); t.add(0, 0, 0, 0, 32, 80); t.add(1, 0, 32, 0, 32, 80);
  }
  reset() {
    this.cur?.destroy?.(); this.cur = null;
    this.tweens.killAll(); this.time.removeAllEvents(); this.children.removeAll(true);
    const c = this.cameras.main; c.stopFollow(); c.setScroll(0, 0); c.setBounds(0, 0, W, H); c.postFX.clear(); c.setZoom(1); c.setAlpha(1);
  }
  ground(kind: "grass" | "snow" | "sand" = "grass", w = W, h = H) { return this.add.tileSprite(0, 0, w, h, "g_" + kind).setOrigin(0).setDepth(0); }
  house(x: number, y: number) { return this.add.image(x, y, "house").setOrigin(0.5, 1).setDepth(y); }
  hero(x: number, y: number) { return this.add.image(x, y, "hero").setOrigin(0.5, 1).setDepth(y + 1); }
  label(x: number, y: number, s: string) { return this.add.text(x, y, s, { fontFamily: "Arial", fontSize: "8px", color: "#fff", backgroundColor: "#000a" }).setDepth(30000).setResolution(2); }
}

const view = () => ({ x: 0, y: 0, w: W, h: H });

// ───────── случаи ─────────
cases = [
  { section: "1. Птицы над городом: стайка пролетает (тень на земле) · садится на крышу · взлетает, когда подошёл герой", zoom: 2, labels: ["Пролёт, 6 птиц", "Садятся на крышу", "Сидят · потом спугнули"], marks: [2300, 5400, 7200], end: 8800,
    setup(s) {
      s.ground(); const roofs = [{ x: 220, y: 66 }]; s.house(70, 80); s.house(220, 92); s.house(150, 150);
      const hero = s.hero(60, 150); const b = new Birds(s, { roofs: () => roofs, isDay: () => true, scare: () => ({ x: hero.x, y: hero.y - 40 }), view });
      b.spawn(-10, 50, 1, 6);
      s.time.delayedCall(200, () => b.spawn(45, 30, 1, 5, roofs[0]));
      s.time.delayedCall(6200, () => hero.setPosition(205, 100));
      return { update: (dt) => b.update(dt), destroy: () => b.destroy() };
    } },
  { section: "2. Цифры урона: было (Text) | стало (BitmapText, свой пиксельный шрифт, поп + дуга)", zoom: 2, labels: ["Спавн цифр: слева Text, справа BitmapText", "Через 0,3 с: поп и дуга"], marks: [110, 380], end: 700,
    setup(s) {
      s.ground("grass");
      s.add.rectangle(W / 2, 0, 1, H, 0x000000, 0.4).setOrigin(0.5, 0).setDepth(5);
      s.label(4, 4, "было: Text"); s.label(W / 2 + 4, 4, "стало: BitmapText");
      const mobL = s.add.image(80, 130, "mob").setDepth(10), mobR = s.add.image(240, 130, "mob").setDepth(10);
      const n = new DmgNumbers(s);
      const items: [string, "dmg" | "crit" | "heal" | "hero", string][] = [["124", "dmg", "#ffe060"], ["387!", "crit", "#ffb030"], ["+45", "heal", "#7aff7a"], ["62", "hero", "#ff6a5a"]];
      const old: Phaser.GameObjects.Text[] = [];
      items.forEach(([txt, kind, col], i) => {
        const x = 40 + i * 24, y = 110 - (i % 2) * 18;
        const t = s.add.text(x, y, txt, { fontFamily: "Rubik, Arial", fontSize: kind === "crit" ? "10px" : "8px", color: col, stroke: "#14080c", strokeThickness: 3, fontStyle: kind === "crit" ? "bold" : "600" }).setResolution(2).setOrigin(0.5).setDepth(20);
        old.push(t);
        s.tweens.add({ targets: t, x: x + (i % 2 ? 14 : -14), y: y - 24, alpha: 0, duration: 900, delay: 100, ease: "Cubic.easeOut" });
        n.show(x + 160, y, txt, kind);
      });
      void mobL; void mobR;
      return { update: (dt) => n.update(dt), destroy: () => n.destroy() };
    } },
  { section: "3. Вступление босса (Timeline): полосы, камера к боссу, имя и титул, жест, возврат · 2,9 с", zoom: 1, labels: ["0,5 с: полосы, камера едет", "1,3 с: приехала, имя", "1,9 с: жест, титул", "2,6 с: камера возвращается"], marks: [500, 1300, 1900, 2650], end: 3200,
    setup(s) {
      const WW = 440; s.ground("grass", WW, H); s.cameras.main.setBounds(0, 0, WW, H);
      const hero = s.hero(70, 120); const boss = s.add.image(360, 130, "boss", 0).setOrigin(0.5, 1).setDepth(130);
      s.add.ellipse(360, 129, 40, 10, 0x000000, 0.35).setDepth(1);
      s.cameras.main.startFollow(hero, true, 1, 1);
      let ring: Phaser.GameObjects.Arc | null = null;
      s.time.delayedCall(300, () => new BossIntro(s, { boss: { x: 360, y: 122 }, name: "Гнашера", title: "Жрица котла", followTarget: hero, skippable: false,
        onGesture: () => { boss.setFrame(1); ring = s.add.circle(360, 100, 6, 0xffcc60, 0.7).setDepth(129); s.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 600, ease: "Cubic.easeOut" }); s.time.delayedCall(800, () => boss.setFrame(0)); } }).play());
    } },
  { section: "4. Переход через портал (экран стягивается линзой и рассыпается пикселями; на выходе обратно)", zoom: 1, labels: ["Вход 0,15 с: линза", "0,30 с: пиксели растут", "0,41 с: вспышка, экран закрыт", "Выход 0,1 с: собирается"], marks: [150, 300, 410, 790], end: 1100,
    setup(s) {
      s.ground(); s.house(80, 70); s.house(230, 100); s.house(150, 160); s.hero(160, 110);
      s.time.delayedCall(30, () => warpOut(s, () => { s.time.delayedCall(30, () => warpIn(s)); }));
      return { destroy: () => warpClear(s) };
    } },
  { section: "5. Тени облаков: редкие, очень мягкие, альфа ≤ 0,12 (на всём экране; вариант плотности)", zoom: 2, labels: ["А. Редкие (1–2 на экран)", "Б. Гуще (4–5 на экран)", "В. Гуще + дождь (темнее до 0,12)"], marks: [500, 500, 500], end: 520,
    setup(s) { return { update() {}, destroy() {} }; } }, // особая обработка ниже (три прогона)
  { section: "6. Следы на земле (RenderTexture): кровь и ожоги · шаги в снегу и песке · те же следы за миг до исчезновения", zoom: 2, labels: ["Кровь и ожоги от умений", "Шаги: снег (слева), песок (справа)", "Тот же слой через ~28 с: почти исчезли"], marks: [300, 300, 300], end: 320,
    setup(s) { return {}; } }, // особая обработка
  { section: "7. Флаги и цепи на ветру (Rope): общий ветер, волна растёт к краю, тень складок", zoom: 2, labels: ["Знамёна, порыв слабее", "Знамёна, порыв сильнее", "Терновые цепи Гнашеры качаются"], marks: [900, 2100, 2100], end: 2300,
    setup(s) { return {}; } },
  { section: "8. Золото и души летят к герою (героя в движении догоняют)", zoom: 2, labels: ["Монетки: подброс и дуга", "Души: искры со следом", "Души у героя: вспышка"], marks: [380, 700, 1050], end: 1300,
    setup(s) { return {}; } },
];

// ───────── особые случаи (разные по виду, но одна сцена) ─────────
const special: Record<number, (s: PV, i: number) => Handle> = {
  4: (s, i) => {
    s.ground(); s.house(60, 70); s.house(240, 80); s.house(150, 150); s.hero(160, 105);
    const dens = i === 0 ? "sparse" : "denser", rain = i === 2 ? 1 : 0;
    const cs = new CloudShadows(s, { view, isDay: () => 1, isOpen: () => true, rain: () => rain, density: () => dens as "sparse" | "denser", depth: 50 });
    cs.fill(dens === "sparse" ? 2 : 5, rain);
    return { update: (dt) => cs.update(dt), destroy: () => cs.destroy() };
  },
  5: (s, i) => {
    const kind = i === 1 ? "snow" : "grass"; s.ground(kind as "snow");
    const d = new Decals(s, {}); const now = s.time.now, back = i === 2 ? 24000 : 0;
    if (i === 1) {
      s.add.rectangle(W / 2, 0, W / 2, H, 0xcfae72).setOrigin(0).setDepth(1); s.add.tileSprite(W / 2, 0, W / 2, H, "g_sand").setOrigin(0).setDepth(1);
      for (let k = 0; k < 16; k++) d.step("snow", 20 + k * 8, 50 + Math.sin(k / 3) * 14, 1, Math.cos(k / 3) * 0.4, k);
      for (let k = 0; k < 16; k++) d.step("sand", 176 + k * 8, 120 - Math.sin(k / 3) * 14, 1, -Math.cos(k / 3) * 0.4, k);
    } else {
      const hit = [[60, 60], [70, 66], [58, 72], [66, 80]]; for (const [x, y] of hit) d.add("blood", x, y, 0, now - back);
      for (let k = 0; k < 8; k++) d.add("blood", 110 + k * 7, 100 + k * 3 + (k % 2) * 3, 0, now - back);
      d.add("scorch", 230, 70, 0, now - back); d.add("scorch", 255, 110, 0, now - back); d.add("scorch", 215, 125, 0, now - back);
    }
    s.hero(i === 1 ? 160 : 90, 150); s.label(4, 4, i === 2 ? "возраст следов ≈ 24 с из 30" : "");
    return { update: (dt) => d.update(dt), destroy: () => d.destroy() };
  },
  6: (s, i) => {
    s.ground(); const rc = new RopeCloth(s);
    if (i < 2) {
      const cols: [string, string][] = [["#8a1c24", "#e0b050"], ["#1c3a6a", "#c8d0e0"], ["#2a5a30", "#e0c060"], ["#4a2a60", "#d0a0e0"]];
      cols.forEach(([c, c2], k) => {
        const x = 40 + k * 70; clothTexture(s, "cl" + k, { w: 34, h: 22, col: c, col2: c2 });
        s.add.rectangle(x, 150, 3, 120, 0x4a3320).setOrigin(0.5, 1).setDepth(99); s.add.circle(x, 30, 2.5, 0xd0a840).setDepth(100);
        s.add.ellipse(x, 150, 14, 5, 0x000000, 0.3).setDepth(1);
        rc.flag(x + 1, 44, "cl" + k, { seg: 12 });
      });
    } else {
      s.add.rectangle(W / 2, 22, 260, 6, 0x4a3320).setDepth(99);
      for (let k = 0; k < 5; k++) { chainTexture(s, "ch" + k, 12 + (k % 3) * 3, true); rc.chain(60 + k * 50, 25, "ch" + k, 12 + (k % 3) * 3, { amp: 4 }); }
      s.hero(160, 160);
    }
    // прогреваем ветер, чтобы кадры отличались порывом
    return { update: (dt) => rc.update(dt), destroy: () => rc.destroy() };
  },
  7: (s, i) => {
    s.ground("sand"); const hero = s.hero(250, 130), mob = s.add.image(60, 120, "mob").setDepth(120); const pf = new PickupFly(s, () => ({ x: hero.x, y: hero.y }));
    s.time.delayedCall(10, () => (i === 0 ? pf.gold(60, 112, 7) : pf.souls(60, 112, 6)));
    if (i === 2) { s.time.delayedCall(10, () => pf.gold(60, 112, 0)); }
    s.tweens.add({ targets: hero, x: 270, duration: 1200, ease: "Sine.easeInOut" }); // герой идёт
    void mob;
    return { update: (dt) => pf.update(dt), destroy: () => pf.destroy() };
  },
};

// ───────── прогон ─────────
const shots: string[][] = [];
async function runCase(sc: PV, c: Case, idx: number, sub: number): Promise<string[]> {
  sc.reset();
  const h = special[idx] ? special[idx](sc, sub) : c.setup(sc);
  sc.cur = h || null;
  const t0 = sc.time.now, marks = c.marks, out: string[] = [];
  const game = sc.game;
  await new Promise<void>((res) => {
    const on = () => {
      while (out.length < marks.length && sc.time.now - t0 >= marks[out.length]) out.push((game.canvas as HTMLCanvasElement).toDataURL("image/png"));
      if (sc.time.now - t0 >= (c.end ?? marks[marks.length - 1] + 50) && out.length >= marks.length) { game.events.off("postrender", on); res(); }
    };
    game.events.on("postrender", on);
  });
  return out;
}
// облака/следы/флаги/пикапы — по одному прогону на каждую плитку
async function runSpecial(sc: PV, c: Case, idx: number): Promise<string[]> {
  const res: string[] = [];
  for (let i = 0; i < c.labels.length; i++) {
    const one: Case = { ...c, marks: [c.marks[i]], end: c.marks[i] + 30 };
    res.push(...(await runCase(sc, one, idx, i)));
  }
  return res;
}

function img(src: string) { return new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; }); }

async function bench(sc: PV, kind: "text" | "bitmap", frames = 150, perFrame = 2): Promise<{ ms: number; fps: number; peak: number }> {
  sc.reset(); sc.ground();
  const n = new DmgNumbers(sc);
  const olds: { t: Phaser.GameObjects.Text; age: number; x: number; y: number }[] = [];
  const st = { style: { fontFamily: "Rubik, Arial", fontSize: "8px", color: "#ffe060", stroke: "#14080c", strokeThickness: 3, fontStyle: "600" } };
  let live = 0, peak = 0, k = 0;
  sc.cur = { update: (dt) => {
    if (kind === "bitmap") { for (let i = 0; i < perFrame; i++) n.show(40 + Math.random() * 240, 60 + Math.random() * 80, String(100 + Math.floor(Math.random() * 900)), Math.random() < 0.1 ? "crit" : "dmg"); n.update(dt); live = n.count; }
    else {
      for (let i = 0; i < perFrame; i++) { const x = 40 + Math.random() * 240, y = 60 + Math.random() * 80; const t = sc.add.text(x, y, String(100 + Math.floor(Math.random() * 900)), st.style).setResolution(2).setOrigin(0.5).setDepth(20); olds.push({ t, age: 0, x, y }); }
      for (let i = olds.length - 1; i >= 0; i--) { const o = olds[i]; o.age += dt; const q = Math.min(1, o.age / 850); o.t.setPosition(Math.round(o.x + q * 14), Math.round(o.y - 22 * q)).setAlpha(1 - q * q); if (q >= 1) { o.t.destroy(); olds.splice(i, 1); } }
      live = olds.length;
    }
    peak = Math.max(peak, live);
  } , destroy: () => { n.destroy(); olds.forEach((o) => o.t.destroy()); } };
  const game = sc.game, ts: number[] = []; let pre = 0;
  await new Promise<void>((res) => { const a = () => { pre = performance.now(); }; const on = () => { ts.push(performance.now() - pre); if (++k >= frames) { game.events.off("postrender", on); game.events.off("prestep", a); res(); } }; game.events.on("prestep", a); game.events.on("postrender", on); });
  const use = ts.slice(20), ms = use.reduce((a, b) => a + b, 0) / use.length;
  return { ms, fps: 1000 / ms, peak };
}

async function runAll() {
  const sc = game.scene.getScene("pv") as PV;
  const out: { section: string; zoom: number; labels: string[]; shots: string[] }[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    out.push({ section: c.section, zoom: c.zoom, labels: c.labels, shots: special[i] ? await runSpecial(sc, c, i) : await runCase(sc, c, i, 0) });
  }
  // скорость: 50 живых цифр (≈2 новых за кадр при ~60 к/с)
  const bt = await bench(sc, "text", 160, 1), bb = await bench(sc, "bitmap", 160, 1);
  sc.reset();
  // лист
  const SW = 1320, pad = 12;
  const cv = document.createElement("canvas"); cv.width = SW; cv.height = 6000; const g = cv.getContext("2d")!;
  g.fillStyle = "#14161c"; g.fillRect(0, 0, SW, 6000); g.imageSmoothingEnabled = false;
  let y = 14;
  g.fillStyle = "#fff"; g.font = "bold 20px Arial"; g.fillText("Пепельный Предел · прототипы вау-эффектов (в игре выключены)", pad, y + 18); y += 38;
  for (const sec of out) {
    g.fillStyle = "#e8d8a0"; g.font = "bold 15px Arial"; g.fillText(sec.section, pad, y + 14); y += 24;
    const tw = W * sec.zoom, th = H * sec.zoom, per = Math.floor((SW - pad) / (tw + pad));
    for (let i = 0; i < sec.shots.length; i++) {
      const col = i % per, row = Math.floor(i / per), x = pad + col * (tw + pad), yy = y + row * (th + 28);
      const im = await img(sec.shots[i]); g.drawImage(im, x, yy, tw, th);
      g.fillStyle = "#cfd6e4"; g.font = "13px Arial"; g.fillText(sec.labels[i] ?? "", x, yy + th + 16);
    }
    y += Math.ceil(sec.shots.length / per) * (th + 28) + 10;
  }
  g.fillStyle = "#9fe8ff"; g.font = "bold 14px Arial";
  g.fillText(`Скорость, ~50 живых цифр, работа движка за кадр (обновление+отрисовка): Text ${bt.ms.toFixed(2)} мс | BitmapText ${bb.ms.toFixed(2)} мс (пик ${bt.peak}/${bb.peak} цифр); ≈ ${(1000/bt.ms).toFixed(0)} против ${(1000/bb.ms).toFixed(0)} к/с запаса`, pad, y + 14); y += 30;
  const out2 = document.createElement("canvas"); out2.width = SW; out2.height = y; out2.getContext("2d")!.drawImage(cv, 0, 0);
  return { sheet: out2.toDataURL("image/png"), bt, bb };
}

const game = new Phaser.Game({
  type: Phaser.WEBGL, width: W, height: H, parent: "g", pixelArt: true, backgroundColor: "#000",
  render: { preserveDrawingBuffer: true, antialias: false }, scene: [PV], fps: { target: 60 },
});
(window as unknown as { __wow: unknown }).__wow = { runAll, wind, ready: new Promise<void>((r) => game.events.once("ready", () => setTimeout(r, 400))) };
