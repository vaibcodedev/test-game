# Архитектура

Стек: Phaser 3 (client), Colyseus 0.16 (server), SQLite через node:sqlite (server/src/db.ts).

## Где что лежит
- data/ — контент в JSON: bestiary, rumors, food, elites, upgrade, mounts, legendaries, bank, pets, scenes, townfolk, cities, quests.
- shared/ — общий код: constants, map (генератор мира), town (планировка Эмберхолла), formulas, classes, skills, items, mobs, protocol, path (A*),
  arena, trade, bestiary, rumors, food, elites, upgrade, mounts, legendary, bank, cities (города, телепорт), quests.
- server/src/index.ts — HTTP + WebSocket. db.ts — accounts (до 6 героев, общий склад), players (account_id), trade_log, admin_log, market_demand.
- server/src/accounts.ts — HTTP API /api (login, chars, delete, logout), сессии-токены в памяти, лимиты; WorldRoom.onAuth({token, character}). shared/accounts.ts — типы, внешность (LOOKS). POST /api/client-error — лог ошибок клиента.
- server/src/rooms/ — WorldRoom (мир), ArenaRoom (инстанс арены), schema, common.
- server/src/game/ — World, Player, Mob, skills, bosses, rewards, inventory, rumors, smith, market,
  legendary (эффекты), admin, bank, Pet (питомцы), rogue (яд, удар в спину), townfolk (стражники и горожане), cities (телепорт, задания).
- server/src/arena/ — store, queue, party, registry, rewards, bots. server/src/trade/TradeManager.ts — обмен.
- client/src/main.ts — вход/регистрация, account.ts — HTTP API, ui/charselect.ts — выбор и создание героя; выход (logout:request) — без перезагрузки.
- Управление: game/keybinds.ts (пресеты, mouseOpts), ui/hotbar.ts (панели), game/aim.ts (прицел), game/castResolve.ts (цель/точка каста), ui/controls.ts (настройки).
- client/src/net.ts — подключение, сторож ping/pong и переподключение (recover); main.ts — окна «Переподключение…», «Что-то пошло не так», вытеснение; game/ — сцены и отрисовка (UnitView, effects, terrain — куски 32×32 у камеры);
  ui/ — hud (меню, сумка, настройки), arena, trade, bestiary, rumor, cook, smith, bank, admin.
- tools/ — генерация пиксель-арта (gen/), db (CLI: просмотр, `admin <имя> on|off`).
- tests/ — bots, arena, trade, admin, bank, reconnect (обрыв, двойной вход), screenshot, reconnect-screens (браузер).

- client/src/styles/ — дизайн-система: tokens.css (все значения `:root`), kit.css (компоненты окна, кнопок, ячеек, полос), fonts.css; правила — docs/STYLE_GUIDE.md. client/src/ui/kit.ts — tabs, seg, openModal, rangeFill.
- shared/palette.ts — цвета для TS, canvas и Phaser (синхронно с tokens.css, тест tests/style-tokens.ts). client/src/game/worldText.ts — все подписи мира Phaser.
- Ассеты из паков (Kenney UI и курсоры, объекты Schwarnhild и др.): исходники в vendor/ (локально, git игнорирует), в игру — только через генератор tools/gen/vendor*.ts; картинки UI — client/public/ui.

## Карта
- Мир 1100×360 (shared/map.ts, данные — data/world.json: layout, зоны, уровни под designCap/levelCap, квоты мобов, дороги, реки, стены, места, указатели). Запад — безопасные земли Сольгарда (Аурелион, 1–40 ур., четыре оболочки вокруг столицы), восток — их зеркало (Мортхейм; x → 1099 − x, шум по сложенной x); граница — реки, вход по трём мостам, вдоль рек стены с воротами у мостов и башнями. Между реками (MID 676×360) — кольцо 40–80 «Небезопасная зона» (четыре пояса вокруг Полей) и Поля вечных битв 80–100 «Опасная зона» (CORE): Эмберхолл на оси вверху, данж внизу (вход с севера), вулкан с вратами рейда. Уровень растёт к центру. Раскладку проверяет tests/map-layout.ts (в npm test). Зоны рисуются биомом (ZoneInfo.style, zoneStyle); unused — зоны без места в мире. Подводных локаций нет.
- Среда: server/src/game/biomes.ts (жар, лава, добыча узлов), параметры и ресурсы — data/biomes.json, shared/biomes.ts. Музыка по зонам — client/src/game/sfx.ts (setAmbience), частицы погоды — GameScene.setupAmbient, арт — tools/gen/biomes.ts.
- Загрузка кусками: клиент строит тайлы/объекты по 32×32 рядом с камерой (terrain.ts), мобов — только в 1500 px от героя (GameScene.cullUnits); сервер не думает за мобов вдали от героев (World.awake). Мосты — где дорога пересекает реку.
- Города со стилем (shared/cities.ts, isTownZone): Оазис, Снежная долина и столицы (поле capital), одна раскладка 27×21 с двумя воротами, стиль (desert/snow/solgard/umbrath) задаёт арт (tools/gen/cities.ts, factions.ts) и покрытие. Столица: старт и возрождение своей фракции (homeCity), чужак — нарушитель под ударами стражи. Жители — data/cities.json, стража в townfolk.ts (SITES), камень телепорта есть и в Эмберхолле.
- Поселения безопасных земель (shared/settlements.ts, задача 132): по одному в каждой зоне 1–40 своей фракции, места — world.json → places (kind settlement: вид, ворота, ограда), жители — data/settlements.json, штандарты — world.json → banners (settle-*); внутри торговец, повар, стража (townfolk SITES), места под камень и возрождение; без мобов в круге SETTLE_R. Земли фракции — поле land у зон, factionLandAt в shared/factions.ts. Банкиры, кузнецы, сумочники — списки BANKERS/SMITHS/BAGMEN (Эмберхолл и обе столицы); NPC клиента — shared/npcs.ts (WORLD_NPCS).
- Телепорт и задания: server/src/game/cities.ts (открытие города при входе в зону -> save.cities, каст 3 с, отмена движением/уроном/боем; задания из data/quests.json -> save.quests). Возрождение — в ближайшем открытом городе своей фракции (nearestCity, cityKnown: своя столица всегда, чужая — никогда).
- Эмберхолл — стены, башни, 4 ворот, кварталы (shared/town.ts); мобы в город не заходят, стражники бьют их у стен.
- Смена раскладки — поднять MAP_VERSION: старые позиции из сохранений сбросятся в столицу фракции, открытые телепорты (save.cities) — до своей столицы (WorldRoom.onJoin).

## Главные правила
- Сервер авторитарен, клиент шлёт только намерения. Права админа проверяются только на сервере.
- Публичное — Schema, личное — сообщения владельцу, эффекты — пакет fx.
- Переносы предметов (обмен, банк) — в памяти + сохранение одной транзакцией SQLite с откатом.
- Новый контент — в /data, не в коде.
- Баланс: data/balance.json + shared/balance.ts (кривые мобов и боссов, PvP-модель: устойчивость, потолки урона, лимит матча); проверка — tools/balance/sim.ts, таблицы — BALANCE.md. Бои с ботами на арене — рейтинг ×BOT_RATING_MULT (shared/arena.ts).
- Рейд: server/src/raid/ (director, chaosKnight, ai ботов, chatter, muster, rewards), rooms/RaidRoom.ts, shared/raid.ts, data/raid.json, клиент ui/raid.ts и game/raidBoss.ts; описание — docs/raid.md.
- Десктоп: desktop/ (Electron: main.ts, server.ts — встроенный сервер отдельным процессом, import-db.ts, launcher/), electron-builder.yml; база и логи в %APPDATA%\AshenReach.
- Спецификации: docs/controls.md (управление), docs/gear-visuals.md (заточка, редкость, вид вещей), docs/raid.md.
- NPC города стоят со смещением от TOWN; новые места проверять через walkable().
- Обрыв связи: WorldRoom/ArenaRoom.onLeave без согласия → allowReconnection(RECONNECT_SEC=30), герой стоит в мире, обмен отменён; иначе сохранение и удаление. Вход тем же аккаунтом с другой вкладки вытесняет старую сессию (KICK_CODE).
- Маунты (задача 118): data/mounts.json (ярус, источник, фракция); виды — tools/gen/mounts*.ts (3D-каркас -> листы 12x6 в assets/mounts, manifest.mounts с посадкой всадника); отрисовка в UnitView; получение — server/src/game/mountDrops.ts (босс, awardMount, raidMountTrophies, arenaMountRewards).
