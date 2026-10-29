/**
 * Интерьеры на клиенте (задача 144, shared/interiors.ts): картинки залов (tools/gen/interiors.ts → /assets/interiors), убранство по глубине,
 * свет — свечение и живое пламя поверх затемнения, лучи из окон днём, стёкла светятся (днём ярко, ночью приглушённо), круг Умбрата пульсирует.
 * Залы стоят за краем карты мира: их видно только тому, кто вошёл (камера ограничена залом).
 */
import Phaser from "phaser";
import { INTERIORS, type Interior } from "../../../shared/interiors";
import { TILE } from "../../../shared/constants";
import { DEPTH } from "./terrain";
import { interiorUrl } from "./floorsV2";

type Light = [number, number, string, number, string | null];
interface IntManifest {
  flames: Record<string, { w: number; h: number; frames: number }>;
  props: Record<string, { w: number; h: number; lights: Light[] }>;
  rooms: Record<string, { lights: Light[] }>;
}
const DIR = "/assets/interiors";
const MKEY = "intm";

/** BootScene.preload: каталог, затем картинки залов, убранства и листы пламени. Нет каталога — интерьеры без картинок (переход работает). */
export function loadInteriors(scene: Phaser.Scene) {
  scene.load.json(MKEY, `${DIR}/manifest.json`);
  scene.load.once(`filecomplete-json-${MKEY}`, () => {
    const m = scene.cache.json.get(MKEY) as IntManifest | undefined;
    if (!m) return;
    for (const r of INTERIORS) for (const l of ["base", "glass", "shafts", "glow"]) scene.load.image(`int_${r.id}_${l}`, interiorUrl(r.id, l, `${DIR}/${r.id}_${l}.png`));
    for (const k of Object.keys(m.props)) scene.load.image(`ip_${k}`, `${DIR}/prop_${k}.png`);
    for (const [k, f] of Object.entries(m.flames)) scene.load.spritesheet(`if_${k}`, `${DIR}/flame_${k}.png`, { frameWidth: f.w, frameHeight: f.h });
  });
}
/** BootScene.create: анимации пламени (12 кадров/с). */
export function makeInteriorAnims(scene: Phaser.Scene) {
  const m = scene.cache.json.get(MKEY) as IntManifest | undefined;
  for (const [k, f] of Object.entries(m?.flames ?? {})) {
    if (!scene.textures.exists(`if_${k}`) || scene.anims.exists(`iflame_${k}`)) continue;
    scene.anims.create({ key: `iflame_${k}`, frames: scene.anims.generateFrameNumbers(`if_${k}`, { start: 0, end: f.frames - 1 }), frameRate: 12, repeat: -1 });
  }
}

interface RoomView { r: Interior; glass?: Phaser.GameObjects.Image; shafts?: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; glows: { img: Phaser.GameObjects.Image; a: number; ph: number; fl: boolean }[] }

export class InteriorViews {
  private rooms: RoomView[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene) {
    const m = scene.cache.json.get(MKEY) as IntManifest | undefined;
    for (const r of INTERIORS) {
      const v: RoomView = { r, glows: [] };
      const W = r.w * TILE, H = r.h * TILE;
      // чёрный фон вокруг зала (за ним — вода «за краем мира»)
      scene.add.rectangle(r.ox - 2000, r.oy - 2000, W + 4000, H + 4000, 0x020104, 1).setOrigin(0).setDepth(DEPTH.water + 1);
      const tex = (k: string) => scene.textures.exists(k);
      if (tex(`int_${r.id}_base`)) scene.add.image(r.ox, r.oy, `int_${r.id}_base`).setOrigin(0).setDepth(DEPTH.ground - 2);
      if (tex(`int_${r.id}_glow`)) v.glow = scene.add.image(r.ox, r.oy, `int_${r.id}_glow`).setOrigin(0).setDepth(DEPTH.ground - 1).setBlendMode(Phaser.BlendModes.ADD);
      // стёкла — сложением прямо за героями (герой у стены не прячется за окном)
      if (tex(`int_${r.id}_glass`)) v.glass = scene.add.image(r.ox, r.oy, `int_${r.id}_glass`).setOrigin(0).setDepth(r.oy + r.wall * TILE - 2).setBlendMode(Phaser.BlendModes.ADD);
      if (tex(`int_${r.id}_shafts`)) v.shafts = scene.add.image(r.ox, r.oy, `int_${r.id}_shafts`).setOrigin(0).setDepth(DEPTH.top - 11).setBlendMode(Phaser.BlendModes.ADD);
      const light = (x: number, y: number, [, , color, scale, flame]: Light, depth: number) => {
        const c = Phaser.Display.Color.HexStringToColor(color).color;
        const img = scene.add.image(x, y, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(c).setScale(scale).setDepth(DEPTH.top - 10);
        v.glows.push({ img, a: flame ? 0.55 : 0.4, ph: Math.random() * 6.28, fl: !!flame });
        if (flame && scene.anims.exists(`iflame_${flame}`)) {
          const f = scene.add.sprite(x, y + 3, `if_${flame}`).setOrigin(0.5, 1).setDepth(depth + 1).play({ key: `iflame_${flame}`, startFrame: Math.floor(Math.random() * 8) });
          f.anims.msPerFrame = 1000 / (11 + Math.random() * 3);
        }
      };
      for (const p of r.props) {
        const cx = r.ox + (p.x + p.w / 2) * TILE, by = r.oy + (p.y + p.h) * TILE;
        if (tex(`ip_${p.kind}`)) scene.add.image(cx, by, `ip_${p.kind}`).setOrigin(0.5, 1).setDepth(by - 4);
        for (const l of m?.props[p.kind]?.lights ?? []) light(cx + l[0], by + l[1], l, by);
      }
      for (const l of m?.rooms[r.id]?.lights ?? []) light(r.ox + l[0], r.oy + l[1], l, r.oy + r.wall * TILE - 1);
      this.rooms.push(v);
    }
  }

  /** Каждый кадр: night 0…1 (общий цикл), room — зал героя (свет считается только у него). */
  update(dt: number, night: number, room: Interior | null) {
    this.t += dt;
    for (const v of this.rooms) {
      if (v.r !== room) continue;
      const day = 1 - night;
      v.shafts?.setAlpha(day * 0.95);
      // стёкла: днём светятся солнцем, ночью — лунный отсвет (храм) или собственный огонь рун (зиккурат)
      v.glass?.setAlpha(v.r.style === "sol" ? 0.12 + day * 0.5 : 0.55 + 0.2 * Math.sin(this.t * 1.3));
      if (v.glass) v.glass.setTint(v.r.style === "sol" && night > 0.5 ? 0x8aa0ff : 0xffffff);
      v.glow?.setAlpha(v.r.style === "sol" ? day * 0.9 : 0.55 + 0.35 * Math.sin(this.t * 1.6));
      // огни: мягкое мерцание; ночью ярче
      for (const g of v.glows) {
        const fl = g.fl ? 0.82 + 0.12 * Math.sin(this.t * 9 + g.ph) + 0.06 * Math.sin(this.t * 23 + g.ph * 2) : 0.9 + 0.1 * Math.sin(this.t * 1.7 + g.ph);
        g.img.setAlpha(g.a * fl * (0.75 + night * 0.45));
      }
    }
  }
}
