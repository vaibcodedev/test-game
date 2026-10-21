# Источники и лицензии

## Графика

Графика игры сделана для этого проекта: тайлы, персонажи, мобы, боссы, иконки, эффекты и большинство объектов. Исключение — часть объектов мира и деталей интерфейса из сторонних паков; их перекрашивает под нашу палитру и приводит к масштабу героя `tools/gen/vendor.ts` (`vendor-lib.ts`, `vendor-ui.ts`).

- **Basic Tileset and Asset Pack 32x32 Pixels** и **Volcanoe Tileset and Asset Pack 32x32 Pixels**, автор Schwarnhild ([schwarnhild.itch.io](https://schwarnhild.itch.io)): деревья, кусты, пни, брёвна, заборы, обрывы, пещеры, лестницы, мёртвые деревья и кусты, валуны, лавовые холмики, кости. Можно использовать и править, нельзя раздавать файлы (в том числе изменённые).
- **Graveyard Set (Free)**, автор 0_mem0ry ([0-mem0ry.itch.io](https://0-mem0ry.itch.io/graveyard-set-free)): надгробия, кресты, ограды, статуи, фонари, гробы. Можно использовать и править, нельзя раздавать файлы, нельзя использовать для ИИ.
- **Fantasy UI Borders** и **Cursor Pixel Pack**, автор Kenney ([kenney.nl](https://kenney.nl)), лицензия CC0: рамка окон, разделитель заголовка и курсоры.

Исходные архивы (`vendor/`) и перекрашенные объекты (`client/public/assets/objects/v_*.png`) в публичный репозиторий не попадают: лицензии Schwarnhild и 0_mem0ry запрещают раздачу файлов.

Изображения рисует код генератора в `tools/gen/` (`canvas.ts`, `palette.ts`, `tiles.ts`, `units.ts`, `objects.ts`). Команда `npm run assets` пересоздаёт их в `client/public/assets/`. Палитра собрана вручную в `tools/gen/palette.ts`.

## Шрифты

Оба шрифта собираются вместе с клиентом и лаунчером, интернет для них не нужен.

- **Ark Pixel 10px Proportional** (заголовки, карта мира), автор TakWolf, [ark-pixel-font.takwolf.com](https://ark-pixel-font.takwolf.com). Лицензия SIL Open Font License 1.1, текст лицензии — `client/src/fonts/OFL-ark-pixel.txt`. Файл `client/src/fonts/ark-pixel-10px.woff2` — latin-сборка (латиница и кириллица).
- **Rubik** (основной текст), подключён через пакет [`@fontsource/rubik`](https://fontsource.org/fonts/rubik). Лицензия SIL Open Font License 1.1.

## Звук

Звуков в игре нет.

## Библиотеки

| Библиотека | Назначение | Лицензия |
|---|---|---|
| [Phaser 3](https://phaser.io) | движок клиента | MIT |
| [Colyseus](https://colyseus.io) (`@colyseus/core`, `@colyseus/schema`, `@colyseus/ws-transport`, `colyseus.js`) | сервер и синхронизация состояния | MIT |
| [Express](https://expressjs.com) | HTTP-сервер | MIT |
| [Vite](https://vite.dev) | сборка и dev-сервер клиента | MIT |
| [tsx](https://tsx.is), [TypeScript](https://www.typescriptlang.org) | запуск и проверка TypeScript | MIT, Apache-2.0 |
| [pngjs](https://github.com/pngjs/pngjs) | запись PNG в генераторе ассетов | MIT |
| [concurrently](https://github.com/open-cli-tools/concurrently) | запуск сервера и клиента одной командой | MIT |
| [puppeteer-core](https://pptr.dev) | скриншоты клиента в тестах | Apache-2.0 |
| `node:sqlite` | хранение прогресса | встроен в Node.js (MIT) |

## Иконки умений и предметов (задача 127)

- Иконки умений: **RPG Ability Icons Collection**, frosty_rabbid, CC0, [frosty-rabbid.itch.io/rpg-ability-icons](https://frosty-rabbid.itch.io/rpg-ability-icons). Недостающие рисует генератор `tools/gen/icons-frosty.ts` в том же стиле, затемнено под игру.
- Формы для генератора — силуэты [game-icons.net](https://game-icons.net), CC BY 3.0:
  - DarkZaitzev: hooded-assassin, running-ninja, smoke-bomb
  - Delapouite: angry-eyes, cross-shield, crosshair, devil-mask, healing-shield, heart-armor, heart-beats, heart-shield, heart-wings, knight-banner, knocked-out-stars, rock-golem, shield-bash, soul, soul-vessel, sparkles, spiked-shield, sun-spear, templar-shield, temporary-shield, thor-hammer, tomahawk
  - Lorc: angel-wings, anvil, archery-target, arrow-cluster, arrowhead, barbed-arrow, battle-axe, beast-eye, bestial-fangs, big-wave, bleeding-heart, bloody-sword, bolt-shield, boot-prints, broadhead-arrow, chained-heart, chalice-drops, claw-slashes, cloak-dagger, concentration-orb, crenulated-shield, crossed-chains, crossed-slashes, crosshair-arrow, crow-dive, crowned-skull, crystal-cluster, dread-skull, drop, droplet-splash, evil-bat, evil-book, explosion-rays, extraction-orb, fast-arrow, fire-dash, fire-punch, fire-ring, fist, flying-dagger, footprint, gem-pendant, ghost, ghost-ally, glowing-hands, hand, heart-bottle, heart-drop, heavy-arrow, holy-symbol, horned-skull, imp, knife-thrust, lightning-helix, linked-rings, magic-shield, mailed-fist, mantrap, moon, over-infinity, paw-heart, poison-bottle, poison-gas, pretty-fangs, psychic-waves, ragged-wound, raven, ribcage, run, rune-stone, sacrificial-dagger, screaming, shadow-grasp, shield-echoes, shield-reflect, skull-crack, snowflake-1, snowflake-2, spiky-explosion, spinning-sword, stag-head, stitched-wound, sun, sun-radiations, sunrise, sword-clash, syringe, targeting, tattered-banner, teleport, thrown-daggers, triorb, two-shadows, vulture, walking-boot, winged-leg, wingfoot, wolf-head, wolf-trap
  - Skoll: fangs
  - sbed: health-increase, poison-cloud, water-drop
- Еда, зелья и ресурсы (17 иконок): **496 pixel art icons for medieval/fantasy RPG**, Henrique Lazarini (7Soul1), CC0, [opengameart.org](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg).

## Анимации умений (задача 127)

Листы собирает `tools/gen/vfx.ts` (разрезка, прореживание, перекраска под стихии игры, масштаб 1:1) в `client/public/assets/vfx/`, таблица умений — `data/skill-fx.json`. Исходные архивы лежат в `vendor/vfx-*` и в репозиторий не попадают; без них сборка пропускает эти листы, и клиент рисует частицы.

- **Pixel Magic Effects**, Foozle (рисовал lordfitoi), CC0, [foozlecc.itch.io/pixel-magic-sprite-effects](https://foozlecc.itch.io/pixel-magic-sprite-effects): огненный шар, взрыв, водяной шар, ветер, камни, портал, копьё, шипы, гейзер, торнадо.
- **Ninja Adventure Asset Pack**, Pixel-boy, CC0, [pixel-boy.itch.io/ninja-adventure-asset-pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack): метательная звезда.
- Бесплатные паки, файлы раздавать нельзя (перекрашенные листы лежат в `client/public/assets/vfx/r/`, каталог в `.gitignore`):
  - **Sentient Dream Studio** ([sentient-dream-studio.itch.io](https://sentient-dream-studio.itch.io)): Pixel Holy Effects Pack 01, Pixel VFX 3 Poison Attacks, Pixel Explosion Effects Pack 01, Pixel VFX Level Up Effect, Pixel VFX Dark Spells. Автор просит указывать «Pixel art effects by Sentient Dream Studio» при показе в соцсетях.
  - **pimen** ([pimen.itch.io](https://pimen.itch.io)): Dark VFX 01–02, Smear VFX 01, Hit Effect 01, Thunder Effect 01 и 02, Ice Effect 01, Smoke Effect 01.
  - **ImpactForge FX**: Slash Effect Pack ([impactforce-fx.itch.io](https://impactforce-fx.itch.io/impactforge-fx-slash-effect-pack)).
- Скачаны, но не используются (форма не вписывается в масштаб героя 32×32 или не нужна): Free Magic Summons (SrZolda, CC BY 4.0, кадры 512–816 px), Pixel Battle Effects (pimen, CC BY 4.0), Acid VFX 01–02 (pimen). Круги призыва, цепи, кандалы, ауры, щиты, знамя, капкан, ворон, дождь стрел, топор, лужа и брызги крови, пламя рисует код `tools/gen/vfx-gen.ts` и `vfx-gen2.ts`.
