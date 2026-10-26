import Phaser from "phaser";
import { MOVE_MUL } from "../../../shared/constants";
import { loadVfx, makeVfxAnims, type VfxEntry } from "./vfx";
import { initAuraFx, loadAuraFx } from "./auraFx";
import { loading } from "../ui/loading";
import { zbCreate, zbLoad, type ZbManifest } from "./zoneBoss";
import { mountTex, type MountMeta } from "../../../shared/mounts";
import { loadInteriors, makeInteriorAnims } from "./interiors";

export interface Manifest {
  units: Record<string, { frame: number; cols?: number }>;
  mounts?: Record<string, MountMeta>;
  objects: Record<string, { w: number; h: number }>;
  icons: string[];
  fx: string[];
}

/** Загрузка всех ассетов по manifest.json и создание анимаций юнитов. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // прогресс — на экране загрузки (ui/loading.ts): ассеты — до 85%, дальше шрифты и постройка мира
    this.load.on("progress", (p: number) => loading.progress(p * 0.85, "Загрузка графики…"));
    this.load.json("manifest", "/assets/manifest.json");
    this.load.once("filecomplete-json-manifest", () => {
      const m = this.cache.json.get("manifest") as Manifest;
      this.load.image("coin_icon", "/assets/icons/coin.png");
      this.load.image("terrain", "/assets/tiles/terrain.png");
      this.load.image("water", "/assets/tiles/water.png");
      this.load.image("lava_glow", "/assets/tiles/lava_glow.png");
      for (const [id, u] of Object.entries(m.units)) this.load.spritesheet(`u_${id}`, `/assets/units/${id}.png`, { frameWidth: u.frame, frameHeight: u.frame });
      // маунты (задача 142): один лист на модель (sheet), у гербовых — второй лист для Умбрата (<модель>_umbrath)
      for (const [id, u] of Object.entries(m.mounts ?? {})) for (const fac of u.fac ? ["", "umbrath"] : [""]) {
        const key = mountTex(id, u, fac), file = key.slice(2);
        if (!this.textures.exists(key)) this.load.spritesheet(key, `/assets/mounts/${file}.png`, { frameWidth: u.frame, frameHeight: u.frame });
      }
      for (const id of Object.keys(m.objects)) this.load.image(`o_${id}`, `/assets/objects/${id}.png`);
      for (const id of m.fx) this.load.image(`fx_${id}`, `/assets/fx/${id}.png`);
      // анимации умений (задача 127): каталог листов, затем сами листы
      this.load.json("vfxm", "/assets/vfx/manifest.json");
      this.load.once("filecomplete-json-vfxm", () => loadVfx(this, (this.cache.json.get("vfxm") ?? {}) as Record<string, VfxEntry>));
      // обозначения бафов и дебафов на юнитах (задача 129): каталог, затем листы; нет каталога — всё остаётся по-старому
      this.load.json("aurafx", "/assets/aura-fx/manifest.json");
      this.load.once("filecomplete-json-aurafx", () => loadAuraFx(this, this.cache.json.get("aurafx")));
      // боссы стартовых земель (задача 136): листы 64×64 и эффекты мира; нет каталога — боссы рисуются запасным листом
      this.load.json("zbm", "/assets/zone-bosses/manifest.json");
      this.load.once("filecomplete-json-zbm", () => zbLoad(this, this.cache.json.get("zbm") as ZbManifest | undefined));
      // интерьеры зданий (задача 144): залы, убранство, пламя
      loadInteriors(this);
    });
  }

  create() {
    const m = this.cache.json.get("manifest") as Manifest;
    makeVfxAnims(this, (this.cache.json.get("vfxm") ?? {}) as Record<string, VfxEntry>);
    makeInteriorAnims(this);
    initAuraFx(this);
    zbCreate(this);
    for (const id of Object.keys(m.units)) {
      // мобы задачи 140 (tools/gen/mobs/game.ts): ≥ 45 столбцов — покой 12, ходьба 12, атака 9–10, гибель 12; 3 вида
      const fw = m.units[id].frame, wide = this.textures.exists(`u_${id}`) ? Math.round(this.textures.get(`u_${id}`).getSourceImage().width / fw) : 0;
      if (!m.units[id].cols && wide >= 45 && fw <= 48) {
        for (let row = 0; row < 3; row++) {
          const f = (a: number, b: number) => this.anims.generateFrameNumbers(`u_${id}`, { start: row * wide + a, end: row * wide + b });
          this.anims.create({ key: `${id}-rest-${row}`, frames: f(0, 11), frameRate: 10, repeat: -1 });
          this.anims.create({ key: `${id}-walk-${row}`, frames: f(12, 23), frameRate: 12 * MOVE_MUL, repeat: -1 });
          this.anims.create({ key: `${id}-attack-${row}`, frames: f(24, wide - 13), frameRate: 14, repeat: 0 });
          this.anims.create({ key: `${id}-death-${row}`, frames: f(wide - 12, wide - 1), frameRate: 12, repeat: 0 });
        }
        continue;
      }
      const cols = m.units[id].cols ?? 12;
      for (let row = 0; row < 3; row++) {
        const f = (a: number, b: number) => this.anims.generateFrameNumbers(`u_${id}`, { start: row * cols + a, end: row * cols + b });
        this.anims.create({ key: `${id}-walk-${row}`, frames: f(0, 3), frameRate: 8 * MOVE_MUL, repeat: -1 }); // шаг под общий множитель ходьбы (data/balance.json moveMul): ноги не скользят
        this.anims.create({ key: `${id}-attack-${row}`, frames: f(4, 7), frameRate: 14, repeat: 0 });
        this.anims.create({ key: `${id}-death-${row}`, frames: f(8, 11), frameRate: 9, repeat: 0 });
        if (cols >= 24) {
          this.anims.create({ key: `${id}-slam-${row}`, frames: f(12, 15), frameRate: 8, repeat: 0 });
          this.anims.create({ key: `${id}-roar-${row}`, frames: f(16, 19), frameRate: 7, repeat: 0 });
          this.anims.create({ key: `${id}-idle-${row}`, frames: f(20, 23), frameRate: 3, repeat: -1 });
        }
      }
    }
    // маунты: строки 0..views−1 — зверь, views..2·views−1 — слой поверх всадника; столбцы 0..run−1 бег, дальше покой.
    // Новый лист (задача 142): 4 вида (вниз, вверх, вправо, влево — без отражения), бег 12 кадров, покой 24; старый: 3 вида, 8 + 4.
    for (const [id, u] of Object.entries(m.mounts ?? {})) for (const fac of u.fac ? ["", "umbrath"] : [""]) {
      const key = mountTex(id, u, fac);
      if (this.anims.exists(`${key}-run-0`)) continue;
      const cols = u.cols, run = u.run ?? 8, idle = u.idle ?? 4, views = u.views ?? 3;
      for (let row = 0; row < views * 2; row++) {
        const f = (a: number, b: number) => this.anims.generateFrameNumbers(key, { start: row * cols + a, end: row * cols + b });
        // новый лист: базовые 30 к/с, UnitView подстраивает timeScale под скорость маунта (meta.stride), чтобы копыта не скользили
        this.anims.create({ key: `${key}-run-${row}`, frames: f(0, run - 1), frameRate: u.stride ? 30 : 14 * MOVE_MUL, repeat: -1 });
        this.anims.create({ key: `${key}-idle-${row}`, frames: f(run, run + idle - 1), frameRate: u.idle ? 10 : 4, repeat: -1 });
      }
    }
    // все шрифты, которыми рисуют Phaser и canvas карты мира: иначе в текстуры подписей запечётся запасной шрифт.
    // Rubik из @fontsource порезан по unicode-range: без образца текста load() берёт пробел и грузит только латиницу,
    // а ники и титулы — кириллица, поэтому просим и латиницу, и кириллицу
    loading.progress(0.88, "Загрузка шрифтов…");
    const sample = "AaЯя";
    Promise.all([document.fonts.load('400 14px "Rubik"', sample), document.fonts.load('600 14px "Rubik"', sample), document.fonts.load('20px "Ark Pixel 10"')]).finally(() => this.scene.start("game"));
  }
}
