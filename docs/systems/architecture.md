# Архитектура и сервер

**Когда читать:** перед правкой сервера, протокола, базы, конфигов, античита или когда нужно найти, где что лежит.
**Главное:** сервер авторитарен, клиент шлёт только намерения; права админа — только на сервере. Почти всё меняется через конфиги в /data, не в коде. Переносы предметов и золота — одна транзакция SQLite с откатом. Защита — только на сервере; проверки в клиенте ничего не защищают. Стек: Phaser 3.90 (client), Colyseus 0.16 (server), SQLite через `node:sqlite` (server/src/db.ts).

## Где что лежит
- `data/` — весь контент и числа в JSON (см. «Всё в конфигах»).
- `shared/` — общий код клиента и сервера: constants, map (генератор мира), town, formulas, classes, skills, skillShape, items, mobs, protocol, path (A*), arena, trade, bestiary, rumors, food, elites, upgrade, mounts, legendary, bank, cities, settlements, factions, npcs, quests, hotbar, texts (`T()`), palette, bannerWar, siege.
- `server/src/index.ts` — HTTP + WebSocket (транспорт с `maxPayload` и `verifyClient`). `db.ts` — accounts (до 6 героев, общий склад), players (`account_id`), trade_log, admin_log, market_demand (таблицу suspicion ведёт anticheat.ts). Схема — `migrations.ts`: шаги по `PRAGMA user_version`, каждый одной транзакцией с откатом; изменение схемы — только новым шагом в конец списка (2026-11-02).
- `server/src/accounts.ts` — HTTP API `/api` (login, chars, delete, logout), сессии-токены в памяти, лимиты; `WorldRoom.onAuth({token, character})`. `shared/accounts.ts` — типы и внешность (LOOKS). `POST /api/client-error` — лог ошибок клиента.
- `server/src/rooms/` — WorldRoom, ArenaRoom, RaidRoom, DungeonRoom, schema, common (`makeOn`, `floodCheck`, `num`, `cleanText`), schemas (схемы сообщений).
- `server/src/game/` — World, Player, Mob, Pet, skills, effects, auras, bosses, zoneBosses, rewards, inventory, rumors, smith, market, legendary, admin, bank, rogue, townfolk, soldiers, cities, biomes, mountDrops, bannerWar, siege, ai/brain.ts (mistreevous, горожане).
- `server/src/arena/` — store, queue, party, registry, rewards, bots, botgear. `server/src/trade/TradeManager.ts` — обмен. `server/src/anticheat.ts` — античит. `server/src/raid/` — рейд.
- Клиент: `client/src/main.ts` — вход и окна ошибок/переподключения; `account.ts` — HTTP API; `net.ts` — подключение, ping/pong, `recover`; `ui/charselect.ts` — герои; `game/` — сцены и отрисовка (UnitView, GearLayers, effects, vfx, terrain, shadows, lights, postfx, weather, fx/*); `ui/` — hud, hotbar, controls, arena, trade, bestiary, rumor, cook, smith, bank, admin, raid, worldmap, bannerWar, siege.
- Управление: `game/keybinds.ts`, `ui/hotbar.ts`, `game/aim.ts`, `game/castResolve.ts`, `game/hit.ts`, `ui/controls.ts` — подробно в docs/systems/combat.md.
- Дизайн-система: `client/src/styles/` (tokens.css — все значения `:root`, kit.css, fonts.css), `client/src/ui/kit.ts` (tabs, seg, openModal, rangeFill); правила — docs/art/ui-style.md. `shared/palette.ts` синхронен с tokens.css (тест `tests/style-tokens.ts`). Все подписи мира Phaser — `client/src/game/worldText.ts`.
- `tools/` — генерация пиксель-арта (`gen/`, паки — `gen/vendor*.ts`), `db` (CLI: просмотр, `admin <логин> on|off`), `balance/sim.ts`, `tiled/`. Исходники паков — `vendor/` (локально, git игнорирует); картинки UI — `client/public/ui`.
- `tests/` — карта тестов в docs/process/tests.md.
- `editor/` — редактор конфигов (`npm run editor`).
- Десктоп: `desktop/` (Electron: main.ts, server.ts — встроенный сервер отдельным процессом, import-db.ts, launcher/), `electron-builder.yml`; база и логи — `%APPDATA%\AshenReach`.

## Карта
Устройство мира, города, поселения, стража, Tiled — docs/systems/world.md.

## Главные правила
- Публичное — Schema, личное — сообщения владельцу, эффекты — пакет `fx`.
- Обмен и банк — в памяти + сохранение одной транзакцией SQLite с откатом.
- Новый контент — в /data, не в коде.
- Баланс: `data/balance.json` + `shared/balance.ts` (кривые мобов и боссов, PvP: устойчивость, потолки урона, лимит матча); проверка — `tools/balance/sim.ts`, таблицы — docs/plan/balance.md. Бои с ботами на арене — рейтинг ×`BOT_RATING_MULT` (`shared/arena.ts`).
- Рейд: `server/src/raid/` (director, chaosKnight, ai, chatter, muster, rewards), `rooms/RaidRoom.ts`, `shared/raid.ts`, `data/raid.json`, клиент `ui/raid.ts`, `game/raidBoss.ts` — docs/systems/bosses.md.
- Обрыв связи: `onLeave` без согласия → `allowReconnection(RECONNECT_SEC=30)`, герой стоит в мире, обмен отменён; иначе сохранение и удаление. Вход тем же аккаунтом с другой вкладки вытесняет старую сессию (`KICK_CODE`).
- Маунты: `data/mounts.json` (ярус, источник, фракция); виды — `tools/gen/mounts*.ts` (3D-каркас → листы 12×6 в assets/mounts, `manifest.mounts` с посадкой всадника); отрисовка в UnitView; получение — `server/src/game/mountDrops.ts`.
- Снаряжение на герое, заточка, редкость — docs/art/gear.md.

## Античит
**Сейчас есть** (`server/src/anticheat.ts`, настройки `data/anticheat.json`, лимиты сообщений — `data/server.json`):
- Транспорт: `maxPayload`, `verifyClient` с проверкой `Origin` и лимитом соединений с IP (`IpLimit`).
- Версия клиента сверяется в `onAuth` (`versionError`, `shared/version.ts`), старым — «обновите страницу».
- Все сообщения — через `makeOn()` → `floodCheck()` (отдельные счётчики «движение» и «прочее», серия превышений → кик, запись в лог); `onMessage("*")` гасит неизвестные типы. Схемы сообщений — `rooms/schemas.ts`; ошибка схемы — тихий отброс, не отключение.
- Журнал подозрительного: таблица `suspicion`, `flag(name, kind, detail)`; виды `speed | range | flood | invalid | foreign | admin`.
- Движение авторитетно: клиент шлёт `mx,my ∈ [-1,1]`, позицию считает сервер. `onAuth`: токен, владение героем, бан, один герой на аккаунт.

**Правила:**
- Кулдауны, ресурс, дистанция, LoS, состояние (жив, не в стане) — только на сервере, по времени сервера. Урон считает сервер из своих статов.
- Не слать клиенту то, что герой не видит (свой `Visibility`; скрытые статы и дроп не слать заранее).
- Экономика: одна транзакция на операцию, уникальный id предмета, блок инвентаря на время обмена, сохранение перед выходом.
- Токен — секрет сессии: не класть в URL и логи. В проде — только `wss` за nginx/Caddy.
- Клиентский античит, детект DevTools, обфускация — не делать (снимается за минуты); достаточно минификации Vite без source maps в проде. Ничего секретного в бандле.
- `npm audit` держать чистым (риски — своя логика и `ws`, `express`).

## Всё в конфигах
**Правило владельца:** «через конфиг должна быть возможность менять почти всё, что у нас есть» — вплоть до реплик боссов, частоты событий, шансов, цен и ассортимента. Исключение — техническая начинка.

Редактор: `npm run editor` (`http://localhost:5300`, порт — `EDITOR_PORT`). Новое поле в `data/*.json` редактор показывает сам; описание — из `_doc`-полей файла. Значения вне границ сохранить нельзя, вне разумного — предупреждение; есть «было / стало» и откат файла. Тест — `tests/editor.ts`.

**Где что лежит:**
| Что | Файл |
|---|---|
| Бой, агро, мобы и боссы (кривые), лечение, мана, PvP, добыча, GCD, питомцы | `balance.json` |
| Общие числа: скорость, дальности, таймеры, прогресс, арена, обмен, бестиарий, рынок, возрождение и поводок мобов, награды | `gameplay.json` |
| Контроль (CC) | `cc.json` |
| Тексты (сообщения сервера, интерфейс, реплики): `T("ключ", {подст.})` из `shared/texts.ts`; подстановки `{name}` не менять | `texts.json` |
| Мобы (все числа, 101 моб), поведение | `mobs.json`, `mobAI.json`, `ai.json` |
| Предметы: модели, правила редкости и аффиксов, базы экипировки | `items.json`, `items-rules.json`, `legendaries.json`, `food.json`, `bags.json` |
| Классы, умения, прицел, иконки, эффекты | `classes.json`, `skills*.json`, `skills_aim.json`, `skill-icons.json`, `skill-fx.json` |
| Заточка и её вид | `upgrade.json`, `gear-fx.json` |
| Боссы зон, рейд | `zone-bosses.json`, `zone-boss-loot.json`, `raid.json` |
| Мир, города, поселения, интерьеры, сценки | `world.json`, `cities.json`, `settlements.json`, `interiors.json`, `scenes.json`, `townfolk.json` |
| Патрули, отряды, стража | `patrols.json`, `npc-ranks.json`, `npc-gear.json`, `ember-guard.json` |
| Маунты (ярусы, цены, конюшие, экономика), питомцы, банк | `mounts.json`, `mount-art.json`, `pets.json`, `bank.json` |
| Война фракций, осада, фракции | `faction-war.json`, `siege.json`, `factions.json` |
| Задания, слухи, встречи, подсказки, статуи, титры | `quests.json`, `rumors.json`, `encounters.json`, `loading-tips.json`, `statues.json`, `credits.json` |
| Ауры и эффекты | `aura-fx.json`, `aura-fx-rules.json`, `auras.json`, `vfx-tune.json`, `lighting.json` |
| Сервер, античит | `server.json`, `anticheat.json` |

**Не выносим:** порты, адреса, коды закрытия (`LOGOUT_CODE`, `KICK_CODE`), сетевые таймауты, протокол; слои и порядок отрисовки, `CHUNK`, `COLS`, `TERRAIN_COUNT`, `MAP_VERSION`; размер карты и сид; формулы как код (выносятся только коэффициенты); id мобов, предметов, умений, классов (на них ссылаются сохранения); значения генерации карты (`TOWN_BELT`, `CITIZEN_COUNT`, `SETTLE_R`, `SETTLE_MOB_GAP`, `PLACE_R`, `RIVER_MOB_GAP`) — только с перегенерацией. Границы защиты в `server.json` редактор не даёт «выключить».

**Ещё в коде:** торговцы, их товары и цены (`shared/npcs.ts`); названия и описания предметов (`shared/items.ts`), умений (`shared/skills.ts`), классов, NPC; подписи клавиш (`keybinds.ts`); окна админа (`admin.ts`, `adminGive.ts`); частота обновления бойцов и горожан (`soldiers.ts`, `townfolk.ts`); привязка телепорта админа (`admin.ts`); `STAT_K` и опыт мобов в `shared/formulas.ts`; звук (`sfx.ts`).

## Не сделано
- Античит по приоритету: (1) аудит экономики — каждая операция с золотом/предметами одной транзакцией `BEGIN IMMEDIATE`, сверка суммы до/после, id запроса против двойной отправки (core-engineer); (2) ревизия: кулдауны, дистанция, LoS всех умений и взаимодействий с NPC/сундуками только на сервере; sanity-check урона и дохода в час → `flag`; (3) лимит входа/регистрации по IP; (4) детект ботов (разброс интервалов ввода, часы онлайн подряд, повтор маршрута) + админ-просмотр — после релиза; (5) теневой бан и волны банов (флаг в БД: без дропа и торговли, свой матчмейкинг); (6) `wss` за nginx/Caddy, helmet + CSP при публичном сервере, `npm audit` в CI; (7) Colyseus 0.17+ (`validate`, `maxMessagesPerSecond`) — позже, ломающие изменения.
- Конфиги: вынести оставшееся «Ещё в коде» (содержимое — в свои файлы данных, не в `texts.json`); русские объяснения для файлов, где их нет (всё, кроме balance, gameplay, items-rules, texts, mounts, patrols, zone-bosses, items, mobs, части raid); свежие скриншоты редактора.
- Редактор (задача 145), по порядку: применение на лету и история с откатом к версии; массовые правки, поиск по всем данным, «где используется id»; предпросмотр спрайтов и иконок; симулятор баланса перед сохранением; таймлайн событий и редактор реплик боссов («кто говорит»); редактор карты по клику (или через Tiled); профили тест/боевой, экспорт в таблицы, проверка орфографии, права доступа.
