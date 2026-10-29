/**
 * Цитадель Хаоса v2 (рейд; tools/gen/citadel.ts → /assets/citadel, data/citadel.json). ВРЕМЕННО под флагом до утверждения:
 * window.__citadelV2 = true или localStorage citadelV2 = "1".
 *  - архитектура одной картинкой на карту (стена с башнями, помост, чаша лавы ниже пола, обрыв в пропасть) — над слоями земли и стен,
 *    под юнитами; лава видна сквозь чашу (слой тайлов лавы); слой свечения — сложением;
 *  - объекты (колонны, врата моста, жаровни) — из data/citadel.json через shared/raid.ts (клетки карты те же);
 *  - огонь — лист cit_flame (12 кадров), ореолы света — fx_glow с учётом ночи (lights.ts), искры над лавой.
 */
import Phaser from "phaser";
import { DEPTH } from "./terrain";
import { trackLight } from "./lights";
import { setCitadelV2 } from "../../../shared/raid";
import data from "../../../data/citadel.json";

const DIR = "/assets/citadel";
export function citadelV2On(): boolean {
  const w = window as unknown as { __citadelV2?: boolean };
  if (w.__citadelV2 !== undefined) return !!w.__citadelV2;
  try { return localStorage.getItem("citadelV2") === "1"; } catch { return false; }
}
// до сборки карты рейда (GameScene → generateRaidMap): объекты v2
setCitadelV2(citadelV2On());

export function preloadCitadelV2(scene: Phaser.Scene) {
  if (!citadelV2On()) return;
  scene.load.image("citadel_bg", `${DIR}/citadel_bg.png`);
  scene.load.image("citadel_emit", `${DIR}/citadel_emit.png`);
  for (const k of ["cit_pillar", "cit_gate", "cit_brazier"]) scene.load.image(`o_${k}`, `${DIR}/${k}.png`);
  scene.load.spritesheet("cit_flame", `${DIR}/cit_flame.png`, { frameWidth: 20, frameHeight: 30 });
}

const kindNow = () => (window as unknown as { __net?: { kind?: string } }).__net?.kind ?? "world";

export function attachCitadelV2(game: Phaser.Game) {
  const gs = game.scene.getScene("game");
  gs.events.on("create", () => {
    if (kindNow() !== "raid" || !citadelV2On() || !gs.textures.exists("citadel_bg")) return;
    // прежний пол рейда (floorsV2) не нужен: пол — часть картинки цитадели
    for (const o of gs.children.list) if (o instanceof Phaser.GameObjects.Image && o.texture.key.startsWith("floorsV2_raid")) o.setVisible(false);
    gs.add.image(0, 0, "citadel_bg").setOrigin(0).setDepth(DEPTH.walls + 1);
    gs.add.image(0, 0, "citadel_emit").setOrigin(0).setDepth(DEPTH.ground - 3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    if (!gs.anims.exists("cit_flame")) gs.anims.create({ key: "cit_flame", frames: gs.anims.generateFrameNumbers("cit_flame", { start: 0, end: 11 }), frameRate: 14, repeat: -1 });
    for (const [i, f] of data.fires.entries()) {
      const s = gs.add.sprite(f.x, f.y, "cit_flame").setOrigin(0.5, 0.93).setScale(f.s).setDepth(f.d);
      s.play({ key: "cit_flame", startFrame: (i * 5) % 12 });
    }
    for (const g of data.glows) {
      const img = gs.add.image(g.x, g.y, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(g.c).setScale(g.s).setAlpha(g.a).setDepth(DEPTH.top - 10);
      trackLight(img, g.s, g.a, !!g.f);
      if (g.f) gs.tweens.add({ targets: img, alpha: { from: g.a * 0.75, to: g.a * 1.08 }, scale: { from: g.s * 0.94, to: g.s * 1.04 }, duration: 180 + (i32(g.x, g.y) % 200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    // искры над лавой: поднимаются и гаснут (≤ 36, твины с easing)
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + 0.13, south = Math.sin(a) > 0;
      const pad = south ? 1.4 : 0.5, x = (24 + Math.cos(a) * (15 + pad)) * 32, y = (19 + Math.sin(a) * (13.5 + pad)) * 32;
      const d = gs.add.rectangle(Math.round(x), Math.round(y), 2, 2, i % 3 ? 0xffa040 : 0xffe080, 0).setDepth(y + 4).setBlendMode(Phaser.BlendModes.ADD);
      gs.tweens.add({ targets: d, y: y - 40 - (i % 5) * 9, x: x + ((i % 7) - 3) * 4, alpha: { from: 0.9, to: 0 }, duration: 1800 + (i % 9) * 260, delay: (i * 173) % 2400, repeat: -1, ease: "Quad.easeOut" });
    }
  });
}
const i32 = (x: number, y: number) => Math.abs((x * 73856093) ^ (y * 19349663));
