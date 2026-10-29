/**
 * Вода и лава на шейдерах (WebGL, Phaser 3.90). Три пайплайна на базе SinglePipeline (один проход, без полноэкранных буферов):
 *   wl_water — на TileSprite воды: рябь, блики, каустика, глубина к центру, береговая пена, берег-срез (стенка грунта под верхним краем суши; считается по маске воды, без разметки), ночью блики тусклее, в дождь круги;
 *   wl_lava  — на слоях лавы карты: корка с пульсирующими трещинами;
 *   wl_halo  — прямоугольник с аддитивным ореолом над землёй рядом с лавой.
 * Всё считается от мировых пикселей (varying vWorld из экранной позиции вершины), цвета — ступени палитры игры: результат квантован к пикселю мира.
 * Береговая пена и ореол берут маску из маленькой текстуры (w+1)×(h+1) по углам клеток (R — вода, G — размытая лава), билинейно: один раз на карту.
 * Виды по умолчанию (WebGL и «Полные» эффекты): вода 1 (B без берега-среза; 2 — со стенкой, пока не доведена), лава 2. Откат на прежний вид: window.__waterLook = 0, window.__lavaLook = 0 (или localStorage waterLook / lavaLook).
 * «Простые» эффекты и не-WebGL всегда рисуют по-старому.
 */
import Phaser from "phaser";
import { T, type WorldMap } from "../../../shared/map";
import { vfxFull } from "./postfx";

/** Среда для шейдеров: ночь 0..1 и сила дождя 0..1 (ставит GameScene раз в кадр). */
export const shaderEnv = { night: 0, rain: 0 };
const S = { time: 0, zoom: 1, vx: 0, vy: 0, maskN: [2, 2] as [number, number] };

const VERT = `
precision highp float;
uniform mat4 uProjectionMatrix;
uniform float uZoom;
uniform vec2 uView;
attribute vec2 inPosition;
attribute vec2 inTexCoord;
attribute float inTexId;
attribute float inTintEffect;
attribute vec4 inTint;
varying vec2 outTexCoord;
varying vec2 vWorld;
void main () {
  gl_Position = uProjectionMatrix * vec4(inPosition, 1.0, 1.0);
  outTexCoord = inTexCoord;
  vWorld = uView + inPosition / uZoom;
}`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform sampler2D uMask;
uniform float uTime;
uniform float uLook;
uniform float uNight;
uniform float uRain;
uniform vec2 uMaskN;
varying vec2 outTexCoord;
varying vec2 vWorld;
float hh(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 maskUV() { return (vWorld / 32.0 + 0.5) / uMaskN; }
`;

const WATER = HEAD + `
vec3 pal(float i) {
  i = clamp(i, 0.0, 5.0);
  if (i < 0.5) return vec3(20.0, 48.0, 100.0) / 255.0;
  if (i < 1.5) return vec3(30.0, 68.0, 128.0) / 255.0;
  if (i < 2.5) return vec3(40.0, 90.0, 158.0) / 255.0;
  if (i < 3.5) return vec3(58.0, 120.0, 188.0) / 255.0;
  if (i < 4.5) return vec3(122.0, 184.0, 230.0) / 255.0;
  return vec3(222.0, 241.0, 252.0) / 255.0;
}
float idx(vec3 c) { float r = c.r * 255.0; return r < 35.0 ? 1.0 : (r < 49.0 ? 2.0 : (r < 90.0 ? 3.0 : 4.0)); }
float landAt(vec2 w) { return texture2D(uMask, (w / 32.0 + 0.5) / uMaskN).r; }
void main () {
  vec2 p = floor(vWorld);
  float t = uTime;
  vec2 d = floor(vec2(sin(p.y * 0.06 + t * 0.8), cos(p.x * 0.05 - t * 0.7)) * 2.4 + 0.5);
  vec3 base = texture2D(uMainSampler, outTexCoord + ((p + 0.5) - vWorld + d) / 64.0).rgb;
  float i = idx(base);
  float n = vn(p * 0.08 + vec2(t * 0.05, 0.0));
  i -= step(0.62, vn(p * 0.03 + vec2(0.0, t * 0.04)));
  float cs = sin(p.x * 0.1 + t) + sin(p.y * 0.1 - t * 0.8) + sin((p.x + p.y) * 0.06 + t * 0.5) + (n - 0.5) * 1.6;
  i += step(2.25, cs);
  // блики: редкие короткие горизонтальные штрихи 1x2..1x4 светлого тона воды, мерцают
  {
    vec2 gc = floor(p / vec2(8.0, 4.0)), lc = p - gc * vec2(8.0, 4.0);
    float g = hh(gc), ph = fract(g * 7.0 + t * 0.45);
    float len = 2.0 + floor(hh(gc + 5.0) * 3.0), x0 = floor(hh(gc + 9.0) * 4.0), y0 = floor(hh(gc + 13.0) * 4.0);
    if (g > 0.93 && ph < 0.28 && lc.y == y0 && lc.x >= x0 && lc.x < x0 + len) i = max(i, uNight > 0.5 ? 3.0 : 4.0);
  }
  vec4 mk = texture2D(uMask, maskUV());
  // кромка суши из маски идёт по сетке; искажаем точку шумом (волнистый берег, скруглённые углы)
  vec2 wq = vWorld + (vec2(vn(p * 0.045), vn(p * 0.045 + 7.0)) - 0.5) * 6.0 + (vec2(vn(p * 0.13 + 3.0), vn(p * 0.13 + 11.0)) - 0.5) * 3.0 + (vec2(vn(p * 0.4 + 5.0), vn(p * 0.4 + 13.0)) - 0.5) * 1.5;
  float s0 = landAt(wq);
  // глубина: к центру водоёма темнее
  i -= step(0.55, mk.b) + step(0.85, mk.b);
  float sh = s0 + (n - 0.5) * 0.34;
  float edge = 0.6 + 0.05 * sin(t * 1.3 + n * 8.0);
  // дождь: расходящиеся круги
  if (uRain > 0.04) {
    vec2 rc = floor(p / 28.0);
    if (hh(rc + 7.0) < uRain * 0.9) {
      float rp = fract(t * 0.8 + hh(rc));
      vec2 c = rc * 28.0 + vec2(hh(rc + 3.0), hh(rc + 5.0)) * 20.0 + 4.0;
      float dd = length(p - c);
      if (abs(dd - rp * 10.0) < 0.9 && rp < 0.85) i += 1.0 + step(rp, 0.3);
    }
  }
  vec3 col = pal(floor(i + 0.5));
  float foamN = step(0.45, vn(p * 0.5 + vec2(t * 0.4, 0.0)));
  // пена: тонкая прерывистая полупрозрачная линия вдоль кромки
  float foam = step(edge - 0.05, sh) * step(sh, edge) * foamN;
  // берег-срез (uLook 2): вода ниже земли. Берег из маски воды, без разметки: ищем сушу вокруг точки.
  // Трава/земля: с севера стенка грунта (кромка дёрна, свет, середина, тёмный низ, тень, пена), с боков узкая стенка 2-3 px,
  // с юга кромка дёрна с тенью на воде. Песок: пологий мокрый край 2-4 px и пена.
  if (uLook > 1.5 && mk.b < 0.9 && s0 > 0.42) {
    float W = (uMaskN.x - 1.0) * 0.5;
    vec3 gk = texture2D(uMask, ((wq / 32.0 + 0.5) + vec2(W + 1.0, 0.0)) / uMaskN).rgb; // грунт у кромки: песок, снег/лёд, камень/пепел
    float sand = gk.r;
    float lum = 1.0 - 0.45 * uNight;
    float jit = floor(vn(vec2(p.x * 0.17, 3.0)) * 3.0) - 1.0  ;
    float dN = 0.0, dS = 0.0, dE = 0.0, dW = 0.0;
    for (int q = 1; q <= 9; q++) {
      float fq = float(q);
      if (dN < 0.5 && landAt(vec2(wq.x, floor(wq.y) - fq * 2.0 - jit)) < 0.62) dN = fq * 2.0 + jit;
      if (q <= 2) {
        if (dS < 0.5 && landAt(vec2(wq.x, floor(wq.y) + fq)) < 0.62) dS = fq;
        if (dE < 0.5 && landAt(vec2(floor(wq.x) + fq, wq.y)) < 0.62) dE = fq;
        if (dW < 0.5 && landAt(vec2(floor(wq.x) - fq, wq.y)) < 0.62) dW = fq;
      }
    }
    // узкое русло (по размытой воде): стенка тоньше и не лезет за ~20 % ширины, с боков только кромка
    float kw = clamp(smoothstep(0.2, 0.6, mk.b), 0.12, 1.0);
    if (dN > 18.0 * kw) dN = 0.0;
    if (kw < 0.6) { if (dE > 1.5) dE = 0.0; if (dW > 1.5) dW = 0.0; if (dS > 1.5) dS = 0.0; }
    float dm = 99.0;
    if (dN > 0.5) dm = min(dm, dN);
    if (dS > 0.5) dm = min(dm, dS);
    if (dE > 0.5) dm = min(dm, dE);
    if (dW > 0.5) dm = min(dm, dW);
    if (sand > 0.25) {
      if (dm <= 1.5) col = mix(col, vec3(150.0, 122.0, 86.0) / 255.0 * lum, 0.65);       // узкий мокрый край, полупрозрачный
      else if (dm <= 3.0) col = mix(col, vec3(170.0, 142.0, 102.0) / 255.0 * lum, 0.35);
      else if (dm <= 4.5 && foamN > 0.5) col = mix(col, pal(4.0), 0.55);
    } else if (dN > 0.5) {
      float f = floor(dN / (2.0 * kw) + 0.5);
      // цвет стенки — цвет грунта берега: дёрн и земля / снег и лёд / тёмный камень и пепел
      vec3 lip = vec3(72.0, 96.0, 50.0), c1 = vec3(122.0, 96.0, 62.0), c2 = vec3(100.0, 76.0, 50.0), c3 = vec3(78.0, 58.0, 40.0), c4 = vec3(56.0, 42.0, 34.0);
      if (gk.g > 0.3) { lip = vec3(236.0, 243.0, 250.0); c1 = vec3(206.0, 220.0, 236.0); c2 = vec3(168.0, 188.0, 214.0); c3 = vec3(122.0, 146.0, 184.0); c4 = vec3(84.0, 106.0, 150.0); }
      else if (gk.b > 0.3) { lip = vec3(96.0, 92.0, 104.0); c1 = vec3(78.0, 74.0, 88.0); c2 = vec3(62.0, 58.0, 72.0); c3 = vec3(48.0, 44.0, 58.0); c4 = vec3(36.0, 32.0, 46.0); }
      if (f < 1.5) col = lip / 255.0 * lum;
      else if (f < 2.5) col = c1 / 255.0 * lum;
      else if (f < 3.5) col = c2 / 255.0 * lum;
      else if (f < 4.5) col = c3 / 255.0 * lum;
      else if (f < 5.5) col = c4 / 255.0 * lum;
      else if (f < 6.5) col *= 0.6;
      else if (f < 7.5) col = mix(col, pal(4.0), 0.5 * foamN);
      else if (f < 8.5) col *= 0.85;
    } else if (dE > 0.5 || dW > 0.5) {
      float q = dE > 0.5 ? dE : dW;
      vec3 l1 = vec3(72.0, 96.0, 50.0), l2 = vec3(78.0, 58.0, 40.0);
      if (gk.g > 0.3) { l1 = vec3(236.0, 243.0, 250.0); l2 = vec3(122.0, 146.0, 184.0); } else if (gk.b > 0.3) { l1 = vec3(96.0, 92.0, 104.0); l2 = vec3(48.0, 44.0, 58.0); }
      if (q < 1.5) col = l1 / 255.0 * lum;
      else if (q < 2.5) col = l2 / 255.0 * lum;
      else col *= 0.7;
    } else if (dS > 0.5) {
      if (dS < 1.5) col *= 0.55; else col *= 0.8;
    } else col = mix(col, pal(4.0), 0.5 * foam);
  } else col = mix(col, pal(4.0), 0.5 * foam);
  col *= 1.0 - 0.1 * uNight;
  gl_FragColor = vec4(col, 1.0);
}`;

const LAVA = HEAD + `
void main () {
  vec4 tex = texture2D(uMainSampler, outTexCoord);
  if (tex.a < 0.01) { gl_FragColor = vec4(0.0); return; }
  float a = tex.a;
  vec3 un = tex.rgb / a;
  float lum = dot(un, vec3(0.3, 0.5, 0.2));
  if (lum < 0.14) { gl_FragColor = tex; return; }
  vec2 p = floor(vWorld);
  float t = uTime;
  vec3 c;
  float pulse = 0.5 + 0.5 * sin(t * 1.5 + vn(p * 0.006) * 6.0);
  {
    vec2 g = p / 22.0, gi = floor(g), gf = fract(g);
    float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 nb = vec2(float(x), float(y));
      vec2 o = vec2(hh(gi + nb), hh(gi + nb + 17.0));
      o = 0.5 + 0.4 * sin(t * 0.25 + 6.2831 * o);
      vec2 r = nb + o - gf;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    float e = sqrt(d2) - sqrt(d1);
    float hot = pulse;
    float m = vn(p * 0.2);
    if (e < 0.07 + 0.05 * hot) c = hot > 0.55 ? vec3(255.0, 224.0, 122.0) : vec3(255.0, 154.0, 42.0);
    else if (e < 0.15 + 0.06 * hot) c = hot > 0.5 ? vec3(255.0, 154.0, 42.0) : vec3(224.0, 84.0, 18.0);
    else if (e < 0.24) c = vec3(160.0, 42.0, 16.0);
    else c = m < 0.35 ? vec3(46.0, 22.0, 20.0) : vec3(80.0, 30.0, 20.0);
  }
  gl_FragColor = vec4(c / 255.0 * a, a);
}`;

const HALO = HEAD + `
void main () {
  vec2 p = floor(vWorld / 2.0);
  float m = texture2D(uMask, maskUV()).g;
  float h = smoothstep(0.04, 0.5, m) * (1.0 - smoothstep(0.82, 1.0, m));
  float pulse = 0.72 + 0.28 * sin(uTime * 1.5 + vn(p * 0.012) * 6.0);
  float k = h * pulse * 0.9;
  float lv = floor(k * 4.0 + mod(p.x + 2.0 * p.y, 4.0) / 4.0) / 4.0;
  gl_FragColor = vec4(vec3(255.0, 110.0, 30.0) / 255.0 * lv * 0.34, 0.0);
}`;

type GLTex = { webGLTexture: WebGLTexture };
class FxPipe extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  mask: GLTex | null = null;
  look = 0;
  constructor(game: Phaser.Game, name: string, frag: string) {
    super({ game, name, fragShader: frag, vertShader: VERT } as never);
  }
  override boot() {
    super.boot();
    this.set1i("uMask", 1);
  }
  override onBind(go?: Phaser.GameObjects.GameObject) {
    super.onBind(go as never);
    this.set1f("uTime", S.time); this.set1f("uZoom", S.zoom); this.set2f("uView", S.vx, S.vy);
    this.set1f("uLook", this.look); this.set1f("uNight", shaderEnv.night); this.set1f("uRain", shaderEnv.rain);
    this.set2f("uMaskN", S.maskN[0], S.maskN[1]);
    if (this.mask) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.mask.webGLTexture);
      gl.activeTexture(gl.TEXTURE0);
    }
    return this;
  }
}

/** Флаг вида: window.__<k> (0 — прежний вид), потом localStorage, иначе вид по умолчанию. */
const readLook = (k: string, def: number): number => {
  const w = (window as unknown as Record<string, unknown>)["__" + k];
  if (w !== undefined && Number.isFinite(Number(w))) return Math.floor(Number(w));
  try { const v = localStorage.getItem(k); if (v !== null && Number.isFinite(Number(v))) return Math.floor(Number(v)); } catch { /* нет хранилища */ }
  return def;
};

/** Маска по углам клеток: R — вода, G — лава, размытая коробкой (радиус 3 клетки по каждой оси). */
function buildMask(scene: Phaser.Scene, m: WorldMap): GLTex {
  const W = m.w + 1, H = m.h + 1, TW = 2 * W + 1; // слева R — вода, G — лава (размытая), B — вода (размытая); справа (после колонки-подложки) R — песок
  if (scene.textures.exists("fx_mask")) scene.textures.remove("fx_mask");
  const tex = scene.textures.createCanvas("fx_mask", TW, H)!;
  const ctx = tex.getContext(), img = ctx.createImageData(TW, H);
  const lava = new Float32Array(W * H), deep = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = m.vtx[i], o = (y * TW + x) * 4, so = (y * TW + W + 1 + x) * 4;
    img.data[o] = v === T.Water ? 255 : 0;
    img.data[o + 3] = 255;
    img.data[so] = v === T.Sand || v === T.Dune ? 255 : 0;
    img.data[so + 1] = v === T.Snow || v === T.Ice ? 255 : 0;
    img.data[so + 2] = v === T.Ash || v === T.Obsidian || v === T.Basalt || v === T.CrackedMarble || v === T.Marble || v === T.Cobble || v === T.Floor || v === T.Worn ? 255 : 0;
    img.data[so + 3] = 255;
    lava[i] = v === T.Lava ? 1 : 0;
    deep[i] = v === T.Water ? 1 : 0;
  }
  for (let y = 0; y < H; y++) { const o = (y * TW + W) * 4, c = (y * TW + W - 1) * 4; for (let k = 0; k < 4; k++) img.data[o + k] = img.data[c + k]; }
  const R = 3, tmp = new Float32Array(W * H), box = (src: Float32Array, dst: Float32Array, len: number, step: number, lines: number, lstep: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * lstep;
      let acc = 0;
      for (let k = -R; k <= R; k++) if (k >= 0 && k < len) acc += src[o + k * step];
      for (let k = 0; k < len; k++) {
        dst[o + k * step] = acc / (2 * R + 1);
        const add = k + R + 1, rem = k - R;
        if (add < len) acc += src[o + add * step];
        if (rem >= 0) acc -= src[o + rem * step];
      }
    }
  };
  box(lava, tmp, W, 1, H, W);
  box(tmp, lava, H, W, W, 1);
  box(deep, tmp, W, 1, H, W);
  box(tmp, deep, H, W, W, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = (y * TW + x) * 4; img.data[o + 1] = Math.min(255, Math.round(lava[i] * 255 * 2.2)); img.data[o + 2] = Math.round(deep[i] * 255); }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  S.maskN = [TW, H];
  return (tex.source[0] as unknown as { glTexture: GLTex }).glTexture;
}

export interface WaterLava {
  /** Слой лавы нового куска: получает шейдер, если он включён. */
  lava(layer: Phaser.Tilemaps.TilemapLayer): void;
  /** Раз в кадр: камера и время сцены; переключает вид по флагам. */
  update(cam: Phaser.Cameras.Scene2D.Camera): void;
}

export function setupWaterLava(scene: Phaser.Scene, m: WorldMap, water: Phaser.GameObjects.TileSprite, hasLava: boolean): WaterLava {
  const game = scene.sys.game, gl = game.renderer.type === Phaser.WEBGL;
  const layers = new Set<Phaser.Tilemaps.TilemapLayer>();
  let curW = 0, curL = 0, mask: GLTex | null = null, halo: Phaser.GameObjects.Image | null = null;
  const pipes: Record<string, FxPipe> = {};
  const pipe = (name: string, frag: string) => {
    const pm = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
    let p = pm.get(name) as FxPipe | undefined;
    if (!p) { p = new FxPipe(game, name, frag); pm.add(name, p); }
    pipes[name] = p;
    return p;
  };
  let broken = false;
  const ensure = () => {
    mask ??= buildMask(scene, m);
    pipe("wl_water", WATER).mask = mask; pipe("wl_lava", LAVA).mask = mask; pipe("wl_halo", HALO).mask = mask;
  };
  const applyLava = (l: Phaser.Tilemaps.TilemapLayer) => { if (curL) l.setPipeline("wl_lava"); else l.resetPipeline(); };
  const tick = (cam: Phaser.Cameras.Scene2D.Camera) => {
    const on = vfxFull();
    const lw = on ? readLook("waterLook", 1) : 0, ll = on && hasLava ? readLook("lavaLook", 2) : 0;
    if (lw || ll) ensure();
    S.time = scene.time.now / 1000; S.zoom = cam.zoom; S.vx = cam.worldView.x; S.vy = cam.worldView.y;
    if (lw !== curW) { curW = lw; if (lw) water.setPipeline("wl_water"); else water.resetPipeline(); }
    if (lw) pipes["wl_water"].look = lw;
    if (ll !== curL) {
      curL = ll;
      for (const l of layers) applyLava(l);
      if (ll && !halo) halo = scene.add.image(0, 0, "fx_glow").setOrigin(0).setDepth(-690).setBlendMode(Phaser.BlendModes.ADD).setPipeline("wl_halo");
      halo?.setVisible(!!ll);
    }
    if (ll) {
      pipes["wl_lava"].look = ll;
      if (halo) { const v = cam.worldView; halo.setPosition(v.x - 8, v.y - 8).setDisplaySize(v.width + 16, v.height + 16); }
    }
  };
  return {
    lava(layer) { layers.add(layer); layer.once("destroy", () => layers.delete(layer)); if (gl && curL && !broken) applyLava(layer); },
    update(cam) {
      if (!gl || broken) return;
      try { tick(cam); } catch (e) {
        // ошибка компиляции шейдера или WebGL: откат к прежнему виду, без заливки
        broken = true; console.warn("waterLava: шейдеры отключены, прежний вид", e);
        try { water.resetPipeline(); for (const l of layers) l.resetPipeline(); halo?.destroy(); halo = null; } catch { /* уже сброшено */ }
      }
    },
  };
}
