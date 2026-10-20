/** Сообщения между клиентом и сервером. Сервер проверяет каждое входящее сообщение. */
import type { ClassId, FactionId, StatKey, Stats } from "./classes";
import type { Derived } from "./formulas";
import type { Item, Slot } from "./items";
import type { Bars, SlotRef } from "./hotbar";
import type { QuestSave } from "./quests";

export const ROOM_NAME = "world";

/** Вход в мир: токен сессии (POST /api/login) и имя героя этого аккаунта. */
/** Вход в мир: токен сессии (POST /api/login) и имя героя этого аккаунта. */
export interface JoinOptions {
  token: string;
  character: string;
}

/** Состояние анимации юнита в Schema. */
export enum Anim {
  Idle = 0,
  Walk = 1,
  Attack = 2,
  Cast = 3,
  Dead = 4,
}
export enum Dir {
  Down = 0,
  Up = 1,
  Left = 2,
  Right = 3,
}
export enum UnitKind {
  Player = 0,
  Mob = 1,
  Boss = 2,
  Pet = 3,
  /** Стражник города: неуязвим, бьёт мобов у стен, с игроками не воюет. */
  Guard = 4,
  /** Горожанин: просто гуляет по улицам. */
  Citizen = 5,
}
/** Битовые флаги эффектов на юните (видны всем). */
export const BUFF_SLOW = 1;
export const BUFF_STUN = 2;
export const BUFF_WARCRY = 4;
export const BUFF_ROOT = 8;
export const BUFF_HASTE = 16;
export const BUFF_ENRAGE = 32;
export const BUFF_POISON = 64;
export const BUFF_BURN = 128;
export const BUFF_STEALTH = 256;
/** Проклятие (урон тенью со временем) и кровотечение — классы Умбрата. */
export const BUFF_CURSE = 512;
export const BUFF_BLEED = 1024;

// ---------- клиент -> сервер ----------
export interface ClientMessages {
  input: { mx: number; my: number };
  moveTo: { x: number; y: number };
  target: { id: string | null };
  skill: { id: string; x: number; y: number; target?: string | null };
  alloc: { stat: StatKey };
  learn: { id: string };
  equip: { index: number };
  unequip: { slot: Slot };
  use: { index: number };
  "use:base": { base: string };
  "bars:set": { bar: number; i: number; ref: SlotRef | null };
  "bars:swap": { a: { bar: number; i: number }; b: { bar: number; i: number } };
  sell: { index: number };
  swap: { a: number; b: number };
  buy: { base: string; qty?: number };
  "cook:buy": { id: string; qty?: number };
  "smith:upgrade": { index?: number; slot?: Slot };
  "smith:buy": { id: string; qty?: number };
  pickup: { bag: string; index?: number };
  chat: { text: string };
  respawn: Record<string, never>;
  "mount:toggle": Record<string, never>;
  "mount:select": { id: string };
  "mount:buy": { id: string };
  "pet:toggle": Record<string, never>;
  "pet:select": { id: string };
  "pet:buy": { id: string };
  "bag:expand": Record<string, never>;
  /** Осмотр игрока: sid — id сессии из state.players. Ответ — сообщение "inspect" (InspectReply). */
  inspect: { sid: string };
  "tp:go": { id: string };
  "quest:accept": { id: string };
  "quest:turn": { id: string };
}

// ---------- сервер -> клиент ----------
export interface SelfState {
  id: string;
  name: string;
  cls: ClassId;
  faction: FactionId;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  alloc: Stats;
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  inventory: (Item | null)[];
  /** Панели умений: 2 × 12 слотов (shared/hotbar.ts). */
  bars: Bars;
  equip: Record<Slot, Item | null>;
  derived: Derived;
  kills: number;
  bossKills: Record<string, number>;
  /** Убийства по типам мобов (бестиарий). */
  mobKills: Record<string, number>;
  /** Еда: id блюда и сколько мс осталось. */
  food?: { id: string; left: number } | null;
  /** Маунты: владение и выбранный. */
  /** Только для показа кнопки; сервер доверяет лишь БД. */
  isAdmin?: boolean;
  mounts?: string[];
  mount?: string;
  /** Питомцы: владение (уровень, опыт, опыт до уровня), выбранный, осталось мс до повторного призыва. */
  pets?: Record<string, { level: number; xp: number; next: number }>;
  pet?: string;
  petCd?: number;
  /** Открытые телепорты (id городов) и задания. */
  cities?: string[];
  quests?: QuestSave;
  /** Входящие запросы на обмен отключены. */
}

/** Одна из 7 вещей в ответе на осмотр. Пустой слот: base "", item null. r — редкость, leg — id легендарки. */
export interface InspectSlot {
  slot: Slot;
  base: string;
  r: number;
  plus: number;
  leg: string;
  model: string;
  /** Полный предмет (характеристики для подсказки со сравнением); имя клиент берёт из каталога или из него. */
  item: Item | null;
}

/** Ответ сервера на "inspect": герой и 7 вещей в порядке SLOTS. */
export interface InspectReply {
  sid: string;
  name: string;
  cls: ClassId;
  lvl: number;
  fac: FactionId;
  equip: InspectSlot[];
}

export interface LootBag {
  id: string;
  x: number;
  y: number;
  items: Item[];
  boss?: boolean;
}

export type FxKind = "phys" | "fire" | "frost" | "poison" | "arcane" | "shadow" | "nature" | "holy" | "blood";

export type Fx =
  | { t: "dmg"; id: string; v: number; crit?: boolean; k?: FxKind; heal?: boolean; miss?: boolean; abs?: boolean; imm?: boolean }
  | { t: "proj"; k: string; from: string; tx: number; ty: number; ms: number; to?: string }
  | { t: "aoe"; k: string; x: number; y: number; r: number }
  | { t: "cone"; k: string; x: number; y: number; a: number; r: number; w: number }
  /** Телеграф: circle — круг r; ring — кольцо r..r2; cone — конус r, угол a, раствор w (рад); line — линия длиной r по углу a, полуширина w (рейд). */
  | { t: "tele"; shape: "circle" | "cone" | "ring" | "line"; k: string; x: number; y: number; r: number; r2?: number; a?: number; w?: number; ms: number }
  | { t: "hazard"; id: string; k: string; x: number; y: number; r: number; ms: number }
  | { t: "blink"; id: string; x0: number; y0: number; x1: number; y1: number; k?: string }
  | { t: "chain"; pts: number[]; k?: string }
  | { t: "lvl"; id: string; level: number }
  | { t: "buff"; id: string; k: string; ms: number }
  | { t: "say"; id: string; text: string; /** звук у города: перекличка, окрик у ворот, тревога */ snd?: "call" | "halt" | "alarm" }
  | { t: "spawn"; id: string; k: string }
  /** Рейд-босс: поза (swing — замах, slam — удар в землю, roar — рёв, idle — стойка) на ms. */
  | { t: "pose"; id: string; k: "swing" | "slam" | "roar" | "idle"; ms: number }
  /** Рейд-босс: реплика крупным текстом над головой и строкой в чате. */
  | { t: "yell"; id: string; text: string }
  /** Рейд: мощный удар — тряска и вспышка (quake | rift | phase | sun | death | berserk) в точке x, y. */
  | { t: "shake"; k: string; x: number; y: number }
  /** Телепорт: cast — начало каста у камня (sx,sy), go — уход, arrive — прибытие, cancel — прерван */
  | { t: "tp"; id: string; ph: "cast" | "go" | "arrive" | "cancel"; x: number; y: number; sx?: number; sy?: number; ms?: number };

export interface ChatLine {
  from: string;
  text: string;
  sys?: boolean;
  cls?: ClassId;
  /** Фракция автора; foreign — чужая фракция (текст на «чужом языке»). */
  faction?: FactionId;
  foreign?: boolean;
  /** Рейд: перекличка ботов и чат рейда (без «чужого языка»). */
  raid?: boolean;
  /** Реплика рейд-босса: выделяется цветом босса. */
  boss?: boolean;
}

export interface ToastMsg {
  text: string;
  kind?: "info" | "error" | "loot" | "level";
  /** Ключ иконки предмета (iconFor) и классы, для которых он предназначен. */
  icon?: string;
  classes?: string[];
  /** Куда автоматически встало изученное умение: клиент дописывает «— клавиша R» по своей схеме. */
  slot?: { bar: number; i: number };
  /** Причина отказа каста/предмета: звук и красная вспышка слота. */
  code?: "target" | "range" | "los" | "mana" | "cd" | "learn";
}

export interface CooldownMsg {
  id: string;
  ms: number;
}
