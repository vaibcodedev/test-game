# Карта тестов

Раннера-библиотеки нет: каждый тест — скрипт `npx tsx tests/<имя>.ts`, код выхода 0/1.

- `npm run test:unit` — все быстрые тесты без сервера (`tests/run-unit.ts`): новые наборы `tests/unit/*.ts` и прежние автономные `tests/*.ts`. Каждый файл — отдельный процесс с пониженным приоритетом. Флаги: `-j 2` (параллельно), `--unit` (только новые наборы), подстрока имени (`npm run test:unit -- bank`).
- `npm test` — прежняя цепочка, в ней есть тесты с сервером (`tests/harness.ts` поднимает `server/src/index.ts`). Сценарии с сервером запускать по одному, под замком `tools/out/scenario.lock`.
- Наборы `tests/unit/*` пишут в конце `RESULT passed=… failed=… known=… xpass=…`. `knownFail` — тест на найденный баг: пока баг на месте, прогон не падает. XPASS значит, что баг починен и пометку пора снять. Общие помощники: `tests/unit/lib.ts` и `tests/unit/fixtures.ts` (мир без сети, герои, база в памяти).

## Модуль → тесты

| Область | Модуль | Тесты | Состояние |
|---|---|---|---|
| shared: формулы, уровни | formulas.ts | unit/combat.ts (xpToNext, очки, softStat, derive, armorReduction, mobStats, xpForKill) | есть |
| shared: предметы | items.ts, upgrade.ts | unit/economy.ts (effStats, baseSellValue, isBound, canEquip, failLevel), admin.ts, legendary.ts | есть |
| shared: карта и проходимость | map.ts, path.ts | map-layout, terrain-tiles, path-buffer, move, los, water-edge, tiled-roundtrip | есть |
| shared: CC и DR | cc.ts | cc.ts (DR, потолки, цепочка, боссы, безмолвие, страх) | есть |
| shared: умения, форма | skills.ts, skillShape.ts | skill-shape, cast-resolve, cast-move; unit/anticheat (canLearn, cleanRef) | есть |
| shared: города, телепорты | cities.ts | cities.ts, unit/teleport.ts | есть |
| сервер: бой | World.hitEx | unit/combat.ts (урон, броня, крит, PvP-потолки, неуязвимость, пауза фазы, щит, смерть, возрождение) | есть |
| сервер: умения классов | tanks/healers/mages/archers/rogue/reaver/umbrath | auras, aura-fx, cc, skill-fx, cast-*; unit/combat (откаты, GCD, мана, чужие умения) | частично: уникальные механики классов по отдельности не проверены |
| сервер: питомцы и призывы | Pet.ts, menagerie.ts | menagerie.ts, unit/combat (питомец бьёт босса, неуязвимого — нет) | частично |
| сервер: лут, награды | rewards.ts, legendary.ts, mountDrops.ts | legendary, zone-boss-loot, mount-awards; unit/economy (подбор мешка) | частично: unit/combat (участники рядом получают убийство и опыт, ушедший — нет, мешки личные); золото группе и лимиты дропа — нет |
| сервер: инвентарь | inventory.ts | unit/economy.ts (addItem, swap, buy, sell, еда, экипировка, зелья, подбор) | есть |
| сервер: торговля | TradeManager.ts | unit/bank-trade.ts (12 сценариев), trade.ts (сервер) | есть |
| сервер: банк | bank.ts | unit/bank-trade.ts (золото, предметы, стопки, полные, общий склад, откат БД), bank.ts (сервер) | есть |
| сервер: заточка | smith.ts | unit/economy.ts (успех, неудача, failLevel, максимум, нехватка, блокировка) | есть |
| сервер: перековка | transmog.ts | transmog.ts (сервер; ведёт другой агент) | без изменений: дополнять рядом после завершения работ |
| сервер: сумочник | bags.ts | unit/economy.ts (цена, предел, откат БД) | есть |
| сервер: рынок | market.ts | unit/economy.ts (спрос, нет арбитража) | есть |
| сервер: телепорты | cities.ts | unit/teleport.ts | есть |
| сервер: мировой босс | worldboss/* | world-boss.ts (сервер) | нет быстрых |
| сервер: рейд | raid/* | raid.ts (без сервера), raid-room.ts | есть |
| сервер: сборы | raid/muster.ts | raid.ts | частично |
| сервер: знамёна и осада | bannerWar.ts, siege.ts | banners-event.ts, fort-siege.ts, banners-world.ts | есть |
| сервер: гильдии | — | — | модуля нет |
| БД: сохранение | db.ts, Player.ts | unit/persistence.ts (круговой путь, смерть, saveMany, аккаунты, удаление), server-safety.ts (бэкап, автосохранение) | есть |
| БД: миграции | db.ts | unit/persistence.ts (старая схема → аккаунты, админка, фракция, копия, повторное открытие) | есть |
| античит | rooms/common.ts | server-safety (флуд), unit/combat (скорость, moveTo, цель), unit/anticheat (alloc, canLearn, панели, чат, num), дальность и чужие вещи — economy, bank-trade, teleport | есть |
| client: pick, objPick | pick.ts, objPick.ts | pick.ts, nature-hitbox.ts | есть (pick.ts сейчас падает, см. ниже) |
| client: keybinds, hotbar | keybinds.ts | keybinds.ts, hotbar.ts (сервер), controls.ts | есть |
| client: форматтеры | ui/* | style-tokens, worldmap-labels, auras (подписи) | частично |

## Прежние тесты, которые падают сейчас (до этой работы, не связаны с ней)

Прогон 2026-10-30. Скорее всего, данные и ассеты сейчас меняют другие агенты.

- cast-move — «герой идёт: 160 → 160».
- cloak — «стили 15/15/16».
- editor — «тексты не проходят проверку».
- heroB-weapon — падал с TypeError в отдельном прогоне, в полном прогоне прошёл (файл сейчас меняют).
- npc-ai — «night: у мест home ≥ 60% — 38%».
- pick — TypeError: reading 'origin'.
- tiled-roundtrip — TypeError: reading 'replace'.
- path-buffer — не падает, но медленный (82 с в одиночку, больше 10 мин при -j 2 под нагрузкой); в раннере предел 20 мин на файл.

## Найденные баги

Помечены `knownFail` в тестах. Игровой код не правился.

| № | Где | Суть | Риск |
|---|---|---|---|
| B1 | server/src/game/inventory.ts `addItem`, `pickup` | Если для остатка стопки нет ячейки, addItem уже долил существующие стопки и только потом возвращает false, ничего не откатывая. `pickup` оставляет предмет в мешке целиком. **Дюп:** стопка 18/20 зелий, сумка полная, мешок с 5 зельями → в сумке 20, в мешке по-прежнему 5. Тот же эффект возможен для материалов и ресурсов (стопка 99). buy/buyFood/buyMaterial, банк и обмен откатывают сумку сами и не затронуты. Правка: в addItem сначала посчитать место, потом класть; либо в pickup класть копию и вычитать долитое. | высокий (экономика) |
| B2 | server/src/game/bank.ts `put` | put с `tab = SHARED_TAB` и конкретным `slot` у героя без аккаунта (accountId 0): предмет кладётся в ячейку общего склада, а saveAccountBank пропускается — **предмет исчезает**. Проверка «без аккаунта» есть только в ветке без slot. В живой игре accountId почти всегда есть (вход через аккаунт), но DungeonRoom и WorldRoom ставят 0, если владелец не найден. | средний |
| B3 | server/src/game/smith.ts `buyMaterial`, inventory.ts `buyFood` | id без Object.hasOwn: «__proto__» и «constructor» находят прототип, makeItem бросает исключение. Состояние не меняется, комната ловит ошибку, но это шум в логе. | низкий |
| B4 | server/src/game/Player.ts конструктор | Уровень и опыт нормализуются, золото — нет. Отрицательное, NaN или дробное золото из битой строки остаётся. С NaN все проверки «gold < price» ложны, покупки проходят. | низкий (нужна порча данных) |
| B5 | server/src/db.ts `load` | JSON.parse без try/catch: одна битая строка героя — исключение при входе. Сервер не падает, но вход невозможен, а в лог уходит стек. Ожидается null или понятная ошибка. | низкий |

## Что осталось покрыть (по риску)

1. rewards.ts `grantKillRewards`: доля золота и опыта в группе, бонусы боссов и зон, отказ в трофеях (bossLootDenied), раз в сутки в подземелье.
2. raid/rewards.ts, worldboss/rewards.ts: награды раз в неделю или сутки (lootAt, pity), pendingItems при полной сумке, saveMany одной транзакцией.
3. stable.ts и menagerie.ts: покупка печатей и сборка маунта — списание деталей и золота, полная сумка, повтор.
4. legendary.ts (сервер): переносы между героями (привязка) и выдача легендарок из рейда.
5. transmog.ts: быстрые тесты рядом с tests/transmog.ts (tm:extract, tm:apply, tm:reset — дюп оболочки, чужие и заблокированные вещи) — после того как другой агент закончит перековку.
6. Механики классов по отдельности: каждый модуль tanks, healers, mages, archers, rogue, reaver, umbrath — по 2–3 поведения (урон и лечение растут с рангом, откат, цель вне дальности).
7. admin.ts без сервера: права проверяются по БД на каждое действие.
8. Клиентские форматтеры (client/src/ui): числа, время, золото — после завершения редизайна UI.
