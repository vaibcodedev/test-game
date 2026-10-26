/**
 * Тряска экрана целыми пикселями мира (просьба пользователя: «совсем маленькая и без визуальных багов»).
 * Встроенная cam.shake(ms, intensity) берёт долю от ширины холста и умножает на масштаб, а матрица камеры умножает сдвиг на масштаб
 * ещё раз: после fitCanvas (холст в пикселях устройства) 0.006 давало десятки пикселей экрана, к тому же сдвиг на доли пикселя мира —
 * дрожь и «плывущая» сетка пиксель-арта. Здесь тот же эффект камеры (shakeEffect), но смещение —
 * целые пиксели мира (1–2; матрица переводит их в целые пиксели холста), затухает к концу и меняется раз в STEP мс, а не каждый кадр.
 */
import Phaser from "phaser";
import { GP } from "../../../shared/gameplay";

const STEP = GP.ui.camShakeStep;
interface State { px: number; next: number }
const state = new WeakMap<Phaser.Cameras.Scene2D.Camera, State>();

/** Встряхнуть камеру на ms миллисекунд с размахом px пикселей мира (1 — лёгкий толчок, 2 — сильный удар босса). */
export function shakeCam(cam: Phaser.Cameras.Scene2D.Camera, ms: number, px = 1) {
  const fx = cam.shakeEffect as Phaser.Cameras.Scene2D.Effects.Shake & { _elapsed: number; _offsetX: number; _offsetY: number };
  let st = state.get(cam);
  if (!st) {
    st = { px: 1, next: 0 };
    state.set(cam, st);
    const s = st;
    // свой расчёт смещения вместо встроенного (доля ширины холста × масштаб, с долями пикселя мира)
    fx.update = function (this: typeof fx, _time: number, delta: number) {
      if (!this.isRunning) return;
      this._elapsed += delta;
      if (this._elapsed >= this.duration) { this.effectComplete(); return; }
      if (this._elapsed < s.next) return;
      s.next = this._elapsed + STEP;
      const a = Math.max(1, Math.round(s.px * (1 - this._elapsed / this.duration)));
      this._offsetX = Math.round((Math.random() * 2 - 1) * a);
      this._offsetY = Math.round((Math.random() * 2 - 1) * a);
    };
  }
  // идущая тряска не перебивается более слабой
  if (fx.isRunning && px < st.px) return;
  st.px = px;
  st.next = 0;
  cam.shake(ms, 0, true);
}
