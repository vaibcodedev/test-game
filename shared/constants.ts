import balance from "../data/balance.json";

/** Размер тайла и базовая сетка пиксель-арта. */
export const TILE = 32;
/**
 * Весь мир (задача 132, схема tools/map-plan.ts, вариант А): запад — безопасные земли Сольгарда (столица Аурелион, 1–40 ур.),
 * восток — их зеркало: земли Умбрата (Мортхейм); между реками — кольцо 40–80 и «Поля вечных битв» 80–100 с Эмберхоллом на оси симметрии.
 * Восток — зеркало запада: непрерывная x → MAP_W − x, клетка i ↔ MAP_W − 1 − i (шум границ и дороги считаются по сложенной x).
 * Геометрия зон, рек, стен и мест — data/world.json (layout, rivers, roads, walls, places).
 */
export const MAP_W = 1100;
export const MAP_H = 360;
export const MAP_SEED = 20261014;
/** Ось симметрии карты (непрерывная x). */
export const MAP_AXIS = MAP_W / 2;
/** Середина между реками (кольцо 40–80 и Поля вечных битв), тайлы: от восточного берега западной реки до западного берега восточной (прежде 634 тайла, теперь 676). */
export const MID = { x: 212, y: 0, w: 676, h: MAP_H };
/** Поля вечных битв (80–100 ур.): охватывающий прямоугольник эллипса вокруг оси (data/world.json layout.fields), обрезанный краями карты; тайлы. */
export const CORE = { x0: 385, y0: 0, x1: 715, y1: MAP_H };
/**
 * Форты фракций на краях Полей (бывшие Оазис и Снежная долина, шаг 4): центры городов в тайлах; восток — зеркало запада (клетка i ↔ MAP_W − 1 − i).
 * Сольгард — запад, Умбрат — восток.
 */
export const FORTS = { west: { x: 392, y: 180 }, east: { x: MAP_W - 1 - 392, y: 180 } };

/** Сервер: частота симуляции и рассылки патчей. */
export const TICK_MS = 50;
export const PATCH_MS = 50;

/** Общий множитель скорости ходьбы всех живых (data/balance.json moveMul): герои, боты, мобы, бойцы, стража, горожане, питомцы. */
export const MOVE_MUL: number = balance.moveMul;
/** Скорость героя пешком, px/с: 150 «до множителя» × MOVE_MUL. */
export const PLAYER_SPEED = 150 * MOVE_MUL;
export const PLAYER_RADIUS = 10;
/** Предел уровня (задача 39, BALANCE.md); levelCap в data/world.json должен совпадать. */
export const MAX_LEVEL = 100;
export const STAT_POINTS_PER_LEVEL = 3;
export const INVENTORY_SIZE = 24;
export const LOOT_BAG_TTL_MS = 90_000;
export const PICKUP_RANGE = 72;
export const MERCHANT_RANGE = 110;
export const RESPAWN_DELAY_MS = 4000;
export const SAVE_INTERVAL_MS = 30_000;
export const CHAT_MAX_LEN = 140;
export const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_]{3,16}$/;
