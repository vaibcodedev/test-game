# Документация «Пепельного Предела»

**Когда читать:** чтобы найти нужный гайд. Главная точка входа для Claude — `CLAUDE.md` (таблица «задача → гайд»).
**Главное:** один гайд на тему; новое правило или решение владельца — дописывать в профильный гайд с датой, новые файлы не плодить; история — в git.

## Гайды

| Папка | Файл | О чём |
|---|---|---|
| process | [workflow.md](process/workflow.md) | агенты и модели, порядок, исследование топ-MMO, замки прогонов, git, версия игры, экономия |
| process | [tests.md](process/tests.md) | `npm run test:unit`, карта «модуль → тесты», что не покрыто |
| art | [quality-bar.md](art/quality-bar.md) | общая планка арта (Warspear, стиль свой), хитбокс, генератор, паки, проверка перед показом |
| art | [perspective.md](art/perspective.md) | 3/4, основание и тень, высоты, здания (гаснут, коллизия по основанию), вода и берега, стены, ворота |
| art | [objects.md](art/objects.md) | каталог всех объектов мира (собирается из data/objects-catalog.json): категории, где стоят, генератор, коллизия |
| art | [scale.md](art/scale.md) | рост юнитов и объектов под героя Б, флаг, аудит (генерируется) |
| art | [icons.md](art/icons.md) | иконки вещей и умений: 65–70 % поля, без лица, иконка = вещь на герое |
| art | [gear.md](art/gear.md) | сеты, ступени и редкость, оружие, «Спина», заточка D, легендарки, перековка, герой Б в игре |
| art | [animation.md](art/animation.md) | анимация основы Б, ткань Verlet + Rope, мобы, эффекты умений |
| art | [ui-style.md](art/ui-style.md) | дизайн-система интерфейса, шрифты, токены, подписи в мире |
| systems | [architecture.md](systems/architecture.md) | где что лежит, главные правила сервера, античит, «всё в конфигах» |
| systems | [combat.md](systems/combat.md) | бой, контроль и DR, управление, прицел и выбор цели |
| systems | [bosses.md](systems/bosses.md) | мобы, боссы зон и кольца, рейд, мировые боссы, добыча |
| systems | [world.md](systems/world.md) | карта, зоны, города, стража, Tiled |
| systems | [faction-war.md](systems/faction-war.md) | «Знамёна Предела», осада фортов |
| content | [lore.md](content/lore.md) | фракции, классы, гербы, лор |
| content | [credits.md](content/credits.md) | источники и лицензии |
| plan | [plan.md](plan/plan.md) | текущий этап и открытые задачи |
| plan | [backlog.md](plan/backlog.md) | следующие этапы |
| plan | [balance.md](plan/balance.md) | баланс: кривые, PvP, цены |
| plan | [next.md](plan/next.md) | что дальше: не сделано и нужно |

Автоподгрузка: краткие правила по темам — `.claude/rules/*.md` (грузятся сами, часть — при работе с файлами по `paths`).

## Перенос (2026-10-30): старый файл → судьба → новый файл

| Старый файл | Судьба | Новый файл |
|---|---|---|
| PLAN.md | перенесён; решения по арту и агентам разнесены по гайдам | plan/plan.md |
| BACKLOG.md | перенесён | plan/backlog.md |
| BALANCE.md | перенесён | plan/balance.md |
| ARCHITECTURE.md | слит (карта — в world.md) | systems/architecture.md |
| FACTIONS.md | слит с решениями по гербам и лору | content/lore.md |
| CREDITS.md | перенесён | content/credits.md |
| README.md | сокращён до запуска и ссылки сюда (описание «3 класса, мир 180×140» устарело) | README.md |
| CLAUDE.md | переписан: гайд для Claude, таблица «задача → гайд» | CLAUDE.md |
| docs/STYLE_GUIDE.md | перенесён | art/ui-style.md |
| docs/world-labels.md | слит | art/ui-style.md §6 |
| docs/art-perspective.md | перенесён и дополнен (рост героя Б, здания гаснут) | art/perspective.md |
| docs/water-shores.md | правила слиты, отчёты партий удалены | art/perspective.md §12 |
| docs/walls-141.md | вывод слит, разбор источников удалён | art/perspective.md §13 |
| docs/dungeon-doors.md | слит | art/perspective.md §14 |
| docs/volume-audit-1030.md | одноразовый аудит удалён, очередь — в «Не сделано» | art/perspective.md |
| docs/scale-147.md | перенесён | art/scale.md |
| docs/icon-style.md | слит; «80 % поля» заменено на 65–70 % | art/icons.md |
| docs/gear-sets-spec.md | слит | art/gear.md, art/icons.md, art/animation.md |
| docs/gear-visuals.md | правила редкости и легендарок слиты; бирюзовая заточка и аудит устарели | art/gear.md §5 |
| docs/enchant-visual-research.md | исследование удалено, решение (вариант D) слито | art/gear.md §5 |
| docs/transmog.md | слит | art/gear.md §6 |
| docs/hero147-live.md | слит | art/gear.md §8, art/animation.md |
| docs/tests-map.md | перенесён, исправленные баги удалены | process/tests.md |
| docs/anticheat-research.md | исследование сжато до правил и очереди | systems/architecture.md |
| docs/config-audit.md | сжато до правила и остатка | systems/architecture.md |
| docs/combat-148.md, controls.md, aim-and-pick.md | слиты, аудиты «как сейчас» удалены | systems/combat.md |
| docs/map-rework.md, tiled-guide.md | слиты | systems/world.md |
| docs/faction-war.md | сжат | systems/faction-war.md |
| docs/zone-bosses.md, bosses-139.md, world-bosses.md, world-bosses-ideas.md, raid.md, mobs-140.md | слиты; карточки сделанных боссов и раскладки референсов удалены (данные — в data/) | systems/bosses.md |
| docs/libraries.md, libraries-2.md, phaser-examples.md | исследования удалены, решения «брать / не брать» и очередь слиты | plan/next.md §4 |
| .claude/agents/*.md | дополнены ссылками на гайды и общими правилами | .claude/agents/*.md |
| — | новые | .claude/rules/*.md, process/workflow.md, plan/next.md, art/quality-bar.md, art/animation.md |
