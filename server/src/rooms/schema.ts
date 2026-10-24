/** Публичное состояние мира, которое Colyseus синхронизирует со всеми клиентами. */
import { Encoder, MapSchema, Schema, type } from "@colyseus/schema";

/** Большая карта: ~1100 мобов в полном состоянии при входе не помещаются в буфер по умолчанию (8 КБ → 1 МБ). */
Encoder.BUFFER_SIZE = 1024 * 1024;

export class Unit extends Schema {
  @type("uint8") kind = 0;
  @type("string") name = "";
  @type("string") sprite = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") dir = 0;
  @type("uint8") anim = 0;
  /** Счётчик атак: клиент проигрывает анимацию удара при каждом изменении. */
  @type("uint16") aseq = 0;
  @type("int32") hp = 0;
  @type("int32") maxHp = 0;
  @type("int32") mp = 0;
  @type("int32") maxMp = 0;
  @type("uint8") level = 1;
  @type("uint16") buffs = 0;
  @type("uint8") phase = 0;
  /** Игрок: оружие как "база:редкость:заточка_оружия:легендарка:модель" (заточка только самого оружия). */
  @type("string") weapon = "";
  /** Игрок: шлем|доспех|сапоги|вторая_рука|плащ, каждая как "редкость:заточка:легендарка:рваная(1|""):база:модель". Кольцо и амулет не синхронизируются. */
  @type("string") gear = "";
  @type("string") target = "";
  /** Арена: номер команды; титул и рамка за сезонные награды. */
  @type("uint8") team = 0;
  @type("string") title = "";
  @type("string") frame = "";
  /** Игрок: id маунта под седоком ("" — пешком). */
  @type("string") mount = "";
  /** Игрок: оттенок спрайта (внешность), 0 — без оттенка. */
  @type("uint32") look = 0;
  /** Элитный моб: 1. */
  @type("uint8") elite = 0;
  /** Питомец: id хозяина. */
  @type("string") ownerId = "";
  /** Игрок: фракция (solgard | umbrath) — цвет имени и вражда в спорных зонах. */
  @type("string") faction = "";
  /** Игрок: нарушитель мира в нейтральном городе (стража атакует). */
  @type("uint8") outlaw = 0;
  /** Игрок: остаток щита-поглотителя (целое, 0 — щита нет); для полосы щита поверх здоровья в рамках цели и группы. */
  @type("int32") shield = 0;
  /** Обозначения бафов и дебафов на юните (задача 129): строка по символу на эффект (формат — shared/auraFx.ts), "" — нет. Видна всем в комнате; меняется только при смене набора. */
  @type("string") fx = "";
  /** Боец фракции (задача 132, шаг 8; shared/npcGear.ts): геральдика — табард (w | n | -), флаги a (герб на плаще) и b (знаменосец).
   *  Без начального значения: у остальных юнитов поле не уходит в состояние. */
  @type("string") herald?: string;
}

export class WorldState extends Schema {
  @type({ map: Unit }) players = new MapSchema<Unit>();
  @type({ map: Unit }) mobs = new MapSchema<Unit>();
}

/** Состояние матча арены: фаза, обратный отсчёт и оставшееся время в секундах. */
export class ArenaState extends WorldState {
  @type("string") mode = "1v1";
  @type("string") phase = "waiting";
  @type("uint8") countdown = 0;
  @type("uint16") timeLeft = 0;
}

/** Состояние рейда (shared/raid.ts): этап gather | pull | fight | end, секунд до следующего этапа, id босса, заряды воскрешения, попытка, секунд до берсерка. */
export class RaidState extends WorldState {
  @type("string") stage = "gather";
  @type("uint16") countdown = 0;
  @type("string") boss = "";
  @type("uint8") revives = 0;
  @type("uint8") attempt = 1;
  @type("uint8") attempts = 1;
  @type("uint16") berserk = 0;
}
