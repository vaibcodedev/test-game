/**
 * Следы на земле (эффект 6) через RenderTexture-холсты. Мир режется на плитки 256x256 (RenderTexture — только там, где есть следы, не больше 9 живых);
 * плитка хранит список следов и перерисовывается 12 раз в секунду. След плавно исчезает за 20–40 с.
 *  - кровь: капли и брызги разного размера; свежая яркая, за ~10 с высыхает и темнеет;
 *  - ожог: пепельное пятно, первые 6 с по краю тлеют искры (мерцают);
 *  - шаги в снегу и песке: ступня с каблуком по направлению движения; у маунта — пара копыт.
 */
import Phaser from "phaser";
import { clamp01, wowCfg } from "./config";

export type DecalKind = "blood" | "scorch" | "snow" | "sand" | "hoofsnow" | "hoofsand";
interface Dec { kind: DecalKind; v: number; x: number; y: number; rot: number; sc: number; t0: number; life: number; a0: number }
interface Chunk { rt: Phaser.GameObjects.RenderTexture; list: Dec[] }
const CH = 256;
const FOOT = new Set<DecalKind>(["snow", "sand", "hoofsnow", "hoofsand"]);

function makeTex(scene: Phaser.Scene) {
  if (scene.textures.exists("wow_dc_ember")) return;
  let seed = 11; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const mk = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!); scene.textures.addCanvas(key, c); };
  for (let v = 0; v < 4; v++) {
    mk("wow_dc_blood" + v, 16, 12, (g) => {
      const body = ["#8a1626", "#a31e30", "#6a1020"], R = 2 + v % 2;
      for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = Math.pow(r(), 1.6) * 6.5; g.fillStyle = body[i % 3]; g.fillRect(Math.round(8 + Math.cos(a) * d * 1.2), Math.round(6 + Math.sin(a) * d * 0.8), 1 + (r() < 0.25 ? 1 : 0), 1); }
      g.fillStyle = "#6a1020"; g.fillRect(7, 5, R, R - 1); g.fillStyle = "#c0283a"; g.fillRect(7, 5, 1, 1);
      for (let i = 0; i < 5; i++) { const a = r() * 6.28; g.fillStyle = "#8a1626"; g.fillRect(Math.round(8 + Math.cos(a) * (5 + r() * 2.5)), Math.round(6 + Math.sin(a) * 3.5), 1, 1); } // капли-брызги
      const a = v * 1.57; for (let k = 1; k < 5; k++) { g.fillStyle = "#6a1020"; g.fillRect(Math.round(8 + Math.cos(a) * (3 + k * 1.1)), Math.round(6 + Math.sin(a) * (2 + k * 0.7)), 1, 1); } // след-брызг
    });
    mk("wow_dc_scorch" + v, 26, 18, (g) => {
      for (let i = 0; i < 110; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 11; const x = Math.round(13 + Math.cos(a) * d), y = Math.round(9 + Math.sin(a) * d * 0.68); g.fillStyle = d > 8.5 ? "#4a3a30" : d > 5 ? "#2a211d" : "#120e0d"; g.fillRect(x, y, 1, 1); }
      for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = 4 + r() * 5; g.fillStyle = r() < 0.5 ? "#5a4a40" : "#6a584c"; g.fillRect(Math.round(13 + Math.cos(a) * d), Math.round(9 + Math.sin(a) * d * 0.68), 1, 1); } // пепел светлее
    });
  }
  mk("wow_dc_ember", 26, 18, (g) => { for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 2 + r() * 8; g.fillStyle = r() < 0.5 ? "#ff8a2a" : "#ffc060"; g.fillRect(Math.round(13 + Math.cos(a) * d), Math.round(9 + Math.sin(a) * d * 0.68), 1, 1); } });
  // подошва 5x8: носок шире, пятка отдельно, каблук глубже
  const boot = (key: string, base: string, deep: string, edge: string) => mk(key, 7, 10, (g) => {
    g.fillStyle = edge; g.fillRect(1, 0, 5, 5); g.fillRect(1, 7, 4, 3);
    g.fillStyle = base; g.fillRect(2, 1, 3, 4); g.fillRect(2, 8, 2, 2); g.fillRect(1, 2, 1, 2); g.fillRect(5, 1, 1, 3);
    g.fillStyle = deep; g.fillRect(2, 4, 3, 1); g.fillRect(2, 9, 2, 1); g.fillRect(3, 1, 1, 1);
  });
  boot("wow_dc_snow", "#a8bdd2", "#7f98b4", "#eef4fa"); boot("wow_dc_sand", "#b8935a", "#8f6e3a", "#dcc089");
  // копыто: пара полумесяцев 9x6
  const hoof = (key: string, base: string, deep: string, edge: string) => mk(key, 11, 7, (g) => {
    for (const ox of [0, 6]) { g.fillStyle = edge; g.fillRect(ox + 1, 0, 4, 1); g.fillRect(ox, 1, 1, 4); g.fillRect(ox + 4, 1, 1, 4); g.fillStyle = base; g.fillRect(ox + 1, 1, 3, 3); g.fillStyle = deep; g.fillRect(ox + 1, 3, 1, 2); g.fillRect(ox + 3, 3, 1, 2); g.fillRect(ox + 1, 5, 3, 1); }
  });
  hoof("wow_dc_hoofsnow", "#a8bdd2", "#7f98b4", "#eef4fa"); hoof("wow_dc_hoofsand", "#b8935a", "#8f6e3a", "#dcc089");
}

export class Decals {
  private chunks = new Map<string, Chunk>();
  private acc = 0;
  private stamp: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene, private o: { depth?: number }) {
    makeTex(scene);
    this.stamp = scene.add.image(0, 0, "wow_dc_blood0").setVisible(false).setOrigin(0.5);
  }

  add(kind: DecalKind, x: number, y: number, rot = 0, now = this.scene.time.now, sc = 1) {
    const [a, b] = wowCfg("decals").fadeMs, cap = wowCfg("decals").maxPerScreen;
    const life = kind === "scorch" ? b : a + Math.random() * (b - a) * (kind === "blood" ? 1 : 0.8);
    const cx = Math.floor(x / CH), cy = Math.floor(y / CH), key = cx + "," + cy;
    let c = this.chunks.get(key);
    if (!c) {
      if (this.chunks.size >= 9) { let old: string | null = null, ot = Infinity; for (const [k, ch] of this.chunks) { const t = ch.list[ch.list.length - 1]?.t0 ?? 0; if (t < ot) { ot = t; old = k; } } if (old) { this.chunks.get(old)!.rt.destroy(); this.chunks.delete(old); } }
      c = { rt: this.scene.add.renderTexture(cx * CH, cy * CH, CH, CH).setOrigin(0).setDepth(this.o.depth ?? -695), list: [] }; this.chunks.set(key, c);
    }
    c.list.push({ kind, v: Math.floor(Math.random() * 4), x: x - cx * CH, y: y - cy * CH, rot, sc, t0: now, life, a0: kind === "blood" ? 0.9 : kind === "scorch" ? 0.85 : 0.75 });
    if (c.list.length > cap) c.list.splice(0, c.list.length - cap);
  }
  /** Шаг: ступня (левая/правая со смещением) по направлению движения; mount — пара копыт. */
  step(surf: "snow" | "sand", x: number, y: number, dirX: number, dirY: number, foot: number, mount = false) {
    const rot = Math.atan2(dirY, dirX) + Math.PI / 2, side = foot % 2 ? 1 : -1, kind = (mount ? "hoof" + surf : surf) as DecalKind;
    this.add(kind, x - dirY * side * (mount ? 0 : 2.5), y + dirX * side * (mount ? 0 : 1.5), rot);
  }
  update(dt: number) {
    this.acc += dt;
    if (this.acc < 83) return;
    this.acc = 0;
    const now = this.scene.time.now;
    for (const [key, c] of this.chunks) {
      const before = c.list.length;
      c.list = c.list.filter((d) => now - d.t0 < d.life);
      if (!c.list.length && before) { c.rt.destroy(); this.chunks.delete(key); continue; }
      if (c.list.length) this.redraw(c, now);
    }
  }
  private redraw(c: Chunk, now: number) {
    c.rt.clear();
    c.rt.beginDraw();
    for (const d of c.list) {
      const age = now - d.t0, k = age / d.life, a = d.a0 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) * (d.kind === "scorch" ? 1 - 0.35 * k : 1);
      const key = d.kind === "blood" ? "wow_dc_blood" + d.v : d.kind === "scorch" ? "wow_dc_scorch" + (d.v % 4) : "wow_dc_" + d.kind;
      const img = this.stamp.setTexture(key).setAngle(FOOT.has(d.kind) ? Phaser.Math.RadToDeg(d.rot) : 0).setAlpha(clamp01(a)).setScale(d.sc).setBlendMode(Phaser.BlendModes.NORMAL);
      if (d.kind === "blood") { const dry = clamp01(age / 10000), g = Math.round(255 * (1 - 0.5 * dry)); img.setTint((g << 16) | (Math.round(g * 0.82) << 8) | Math.round(g * 0.82)); } else img.clearTint();
      c.rt.batchDraw(img, Math.round(d.x), Math.round(d.y));
      if (d.kind === "scorch" && age < 6000) { // тлеющие искры по краю: мерцание 12 к/с, гаснут к 6 с
        const flick = 0.55 + 0.45 * Math.sin(age / 90 + d.x * 3), life = 1 - age / 6000;
        c.rt.batchDraw(this.stamp.setTexture("wow_dc_ember").setAlpha(clamp01(flick * life)).setAngle(0).clearTint().setBlendMode(Phaser.BlendModes.ADD), Math.round(d.x), Math.round(d.y));
      }
    }
    c.rt.endDraw();
  }
  get count() { let n = 0; this.chunks.forEach((c) => (n += c.list.length)); return n; }
  destroy() { this.chunks.forEach((c) => c.rt.destroy()); this.chunks.clear(); this.stamp.destroy(); }
}
