# Каталог примеров Phaser: что взять в «Пепельный Предел»

Источник: https://phaser.io/oss/examples (просмотрен 2026-10-28). Дополняет `docs/libraries.md` и `docs/libraries-2.md`, не повторяет их.

## 0. Главное для владельца

1. **Каталог сейчас целиком про Phaser 4.1, а у нас Phaser 3.90.** Версии 3.x на сайте нет: адрес `/oss/examples/v3.90.0/...` отдаёт 404, labs.phaser.io закрыт (403), репозиторий `phaserjs/examples` переведён на v4. Поэтому примеры — **источник идей и приёмов**, а не код для копирования. Около 70 % приёмов есть и в 3.90 под другими именами. Остальное только в v4: `Filters`, `Noise`, `Gradient`, `SpriteGPULayer`, `Stamp`, `CaptureFrame`, `ImageLight`. Ниже в каждой строке указано, на какой версии это работает.
2. **Самое ценное для нас лежит не в «эффектах», а в базовых объектах**, которых в проекте пока нет ни разу: `Rope` (0 мест), `RenderTexture` как холст для следов (1 место, только тени), `BitmapText` (0), `Timeline` (0), `deathZone` и `moveTo` у частиц (0), `ColorMatrix` и `Wipe` (0). По «вау / час» это лучшая часть каталога.
3. **Переход на Phaser 4 — отдельное решение, не сейчас.** v4 даёт тысячи спрайтов на GPU (лес, трава, толпы) и фильтры на любые слои. Но сломается всё, что мы уже сделали на FX 3.90: `postfx.ts`, `lights.ts`, маски. Mesh и Plane в v4 удалены. Вернуться к вопросу после этапа «красота» (раздел 5).

Обозначения:
- **v3** — есть в 3.90, ставить можно сейчас;
- **v4** — только Phaser 4 (в 3.90 повторить своим кодом или ждать перехода);
- **ч** — часы работы агента;
- **слабый ПК** — нагрузка на GPU или CPU: низкая / средняя / высокая.

Приоритеты:
- **P1** — делать в ближайший этап «красоты»;
- **P2** — следом;
- **P3** — по желанию.

---

## 1. Топ-10 по «вау / сложность»

| # | Что увидит игрок | Пример | Где у нас | ч | Слабый ПК | Версия |
|---|---|---|---|---|---|---|
| 1 | **Ночь с настоящими пятнами света**: темнота вокруг факела «вырезана», а не просто подсвечена сверху; в склепе видно только круг у героя и у жаровен | [Circle Cut Out](https://phaser.io/oss/examples/v4.1.0/display/blend%20modes/view/circle-cut-out), [Erase Part of RT](https://phaser.io/oss/examples/v4.1.0/game%20objects/render%20texture/view/erase-part-of-render-texture) | `terrain.ts:414` (сейчас ночь — плоский `rectangle` с альфой), `lights.ts` | 5–7 | средняя (1 RT размером с экран, перерисовка раз в кадр) | v3 |
| 2 | **Души и золото летят к герою**: с убитого моба искры-души тянутся к игроку, монеты добычи летят в сумку | [Move Particles to Dynamic Target](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/move-to-dynamic), [Gravity Well](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/gravity-processor) | `effects.ts` (смерть моба, `+N` золота), `lootView.ts` | 2–3 | низкая | v3 |
| 3 | **Знамёна и флаги развеваются**, у боссов качаются цепи, у некоторых — хвосты и ленты | [Animated Rope](https://phaser.io/oss/examples/v4.1.0/game%20objects/rope/view/animated-rope), [Horizontal Rope](https://phaser.io/oss/examples/v4.1.0/game%20objects/rope/view/horizontal-rope) | `bannerBases.ts` (королевское знамя на мачте), `siegeView.ts` (флаги замков), `zoneBoss.ts` (цепи Гнашеры) | 4–6 | низкая (1 вызов отрисовки на верёвку) | v3 |
| 4 | **Следы на земле остаются**: лужи крови, выжженные пятна после огненных умений, следы в снегу и на болоте; медленно тают | [Paint Interpolated](https://phaser.io/oss/examples/v4.1.0/game%20objects/render%20texture/view/paint-interpolated), [Batch Stamp Atlas Frames](https://phaser.io/oss/examples/v4.1.0/game%20objects/render%20texture/view/batch-draw-frame) | `terrain.ts` (куски карты), `vfx.ts` (`blood-pool` сейчас исчезает) | 6–10 | средняя (видеопамять: RT на кусок ≈ 1 МБ) | v3 |
| 5 | **Тени облаков плывут по земле** днём: большие мягкие тёмные пятна медленно идут по лугам | идея из [Clouds With Simplex Noise](https://phaser.io/oss/examples/v4.1.0/game%20objects/noise/view/clouds-with-simplex-noise) (v4); у нас — `TileSprite` с мягким шумом и blend MULTIPLY | `terrain.ts` (рядом с `macro`), `shared/weather.ts` (в дождь гуще) | 2 | низкая (1 TileSprite) | v3 (приём) |
| 6 | **Мир сереет при смерти** героя (призрак), сепия во «воспоминаниях», мир блёкнет при низком здоровье | Color Matrix: [папка colormatrix](https://phaser.io/oss/examples/v4.1.0/filters/colormatrix) | `postfx.ts` — `cam.postFX.addColorMatrix().grayscale()` | 1–2 | низкая (1 проход, только пока активно) | v3 |
| 7 | **Вступление босса как в кино**: камера едет к боссу, наезд, рёв, вспышка, табличка с именем, возврат к герою | [Timeline Tween Actions](https://phaser.io/oss/examples/v4.1.0/time/timeline/view/tween-action), [Timeline Sound Actions](https://phaser.io/oss/examples/v4.1.0/time/timeline/view/sound-action), [Camera Zoom To and Pan](https://phaser.io/oss/examples/v4.1.0/camera/view/zoom-to) | `zoneBoss.ts`, `raidBoss.ts`, `arenaIntro.ts` | 3–4 (+1 на босса) | низкая | v3 |
| 8 | **Цифры урона дешевле и сочнее**: крит «подпрыгивает» по буквам, в рейде нет подтормаживания от сотен цифр | [Display Callback Wibble/Scale](https://phaser.io/oss/examples/v4.1.0/game%20objects/bitmaptext/dynamic/view/display-callback-scale-effect), папка [Retro Font](https://phaser.io/oss/examples/v4.1.0/game%20objects/bitmaptext/retro%20font) | `effects.ts:143,192` (сейчас `Text` — у каждой цифры своя canvas-текстура) | 5–7 | **снижает** нагрузку | v3 |
| 9 | **Переход через портал**: экран «стягивается» линзой и рассыпается пикселями, на выходе — обратно | [папка Barrel](https://phaser.io/oss/examples/v4.1.0/filters/barrel), [Pixelate](https://phaser.io/oss/examples/v4.1.0/filters/pixelate), [Wipe](https://phaser.io/oss/examples/v4.1.0/filters/wipe) | `teleportFx.ts`, `dungeon:fade` в `GameScene.ts:354` | 2–3 | низкая (0,5 с) | v3 (`postFX.addBarrel/addPixelate/addWipe`) |
| 10 | **Над городом летают птицы и вороны** по плавным дугам, над болотом кружат стаи | папка [Paths](https://phaser.io/oss/examples/v4.1.0/paths) (`PathFollower`, сплайны) | `GameScene.setupAmbient` (там листья и светлячки) | 3 | низкая | v3 |

Почему такой порядок:
- пункты 1–3 и 5–6 почти полностью встроены в 3.90, нужна только связка с нашими системами;
- пункт 4 сложнее, потому что следы надо хранить кусками вместе с картой;
- пункт 8 — единственный, который одновременно и красивее, и **быстрее**.

---

## 2. Все находки

### 2.1. Игрок увидит

| # | Находка | Ссылка | Что увидит игрок | Где у нас | ч | Слабый ПК | Версия | Пр. |
|---|---|---|---|---|---|---|---|---|
| 1 | Темнота-холст с «вырезанным» светом (RT + `BlendModes.ERASE` мягким кругом) | [circle-cut-out](https://phaser.io/oss/examples/v4.1.0/display/blend%20modes/view/circle-cut-out) | ночь и склеп с честными пятнами света, фонарь героя в данже | `terrain.ts` (`dark`), `lights.ts`, `interiors.ts` | 5–7 | средняя | v3 | P1 |
| 2 | Частицы `moveTo` / `GravityWell` | [move-to-dynamic](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/move-to-dynamic) | души и золото летят к герою; воронка у портала босса | `effects.ts`, `lootView.ts`, `vfx.ts` | 2–3 | низкая | v3 | P1 |
| 3 | `Rope` | [animated-rope](https://phaser.io/oss/examples/v4.1.0/game%20objects/rope/view/animated-rope) | флаги, знамёна, цепи, ленты на ветру (ветер — из `shared/weather.ts`) | `bannerBases.ts`, `siegeView.ts`, `zoneBoss.ts` | 4–6 | низкая | v3 и v4 | P1 |
| 4 | RenderTexture-«холст следов» (`stamp`/`draw` кадров атласа в RT куска) | [paint-interpolated](https://phaser.io/oss/examples/v4.1.0/game%20objects/render%20texture/view/paint-interpolated), [batch-draw-frame](https://phaser.io/oss/examples/v4.1.0/game%20objects/render%20texture/view/batch-draw-frame) | кровь, ожоги, следы в снегу, тают за 1–2 мин | `terrain.ts` (куски), `vfx.ts` | 6–10 | средняя | v3 | P1 |
| 5 | Тени облаков (`TileSprite` + MULTIPLY) | [clouds](https://phaser.io/oss/examples/v4.1.0/game%20objects/noise/view/clouds-with-simplex-noise) | плывущие тени облаков днём | `terrain.ts`, `data/lighting.json` | 2 | низкая | v3 (приём) | P1 |
| 6 | `postFX.addColorMatrix` | [colormatrix](https://phaser.io/oss/examples/v4.1.0/filters/colormatrix) | серый мир при смерти, блёклость при низком здоровье | `postfx.ts` | 1–2 | низкая | v3 | P1 |
| 7 | `Timeline` + `zoomTo` / `pan` | [tween-action](https://phaser.io/oss/examples/v4.1.0/time/timeline/view/tween-action), [zoom-to](https://phaser.io/oss/examples/v4.1.0/camera/view/zoom-to) | кинематографичное появление босса | `zoneBoss.ts`, `raidBoss.ts`; сценарии в `data/boss-intros.json` | 3–4 | низкая | v3 | P1 |
| 8 | `BitmapText` / `DynamicBitmapText` + `RetroFont` | [display-callback-scale](https://phaser.io/oss/examples/v4.1.0/game%20objects/bitmaptext/dynamic/view/display-callback-scale-effect) | «прыгающие» цифры крита, ровный пиксельный шрифт | `effects.ts`, `worldText.ts` | 5–7 | снижает | v3 | P1 |
| 9 | `postFX.addBarrel`, `addPixelate`, `addWipe` | [barrel](https://phaser.io/oss/examples/v4.1.0/filters/barrel), [wipe](https://phaser.io/oss/examples/v4.1.0/filters/wipe) | линза и пиксели при телепорте, «шторка» при входе в данж | `teleportFx.ts`, `GameScene.ts` | 2–3 | низкая | v3 | P1 |
| 10 | `PathFollower` по сплайну | [paths](https://phaser.io/oss/examples/v4.1.0/paths) | птицы, вороны, летучие мыши ночью, лодки | `GameScene.setupAmbient` | 3 | низкая | v3 | P2 |
| 11 | Частицы `deathZone` | [multiple-death-zones](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/multiple-death-zones) | капли дождя не падают «сквозь» крыши и навесы | `weather.ts` | 2 | низкая | v3 | P2 |
| 12 | Частицы `onUpdate` / `stepped` / `explode` | [onemit-and-onupdate](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/onemit-and-onupdate), [explode](https://phaser.io/oss/examples/v4.1.0/game%20objects/particle%20emitter/view/explode-emitter) | искры, которые закручиваются спиралью вокруг босса; взрыв осколков при разрушении стены осады | `vfx.ts`, `siegeView.ts` | 2–4 | низкая | v3 | P2 |
| 13 | Камера: `followOffset` по направлению взгляда / прицела + `setDeadzone` | [follow-offset](https://phaser.io/oss/examples/v4.1.0/camera/view/follow-offset), [deadzone](https://phaser.io/oss/examples/v4.1.0/camera/view/follow-sprite-with-deadzone) | камера чуть «смотрит вперёд», куда бежит герой; не дёргается при мелких шагах | `GameScene.ts:553` (`startFollow` с lerp 0.15 уже есть) | 1–2 | нет | v3 | P2 |
| 14 | Своя шейдерная поверхность `add.shader` (GLSL) | [game objects/shader](https://phaser.io/oss/examples/v4.1.0/game%20objects/shader) | текущая лава с прожилками в склепе, рябь и блики на воде | `terrain.ts` (вода — `TileSprite`), лава в данже | 6–8 | средняя (только на видимой площади) | v3 (API другое, чем в v4) | P2 |
| 15 | `Layer` с `postFX` на слой | [layer-filter](https://phaser.io/oss/examples/v4.1.0/game%20objects/layer/view/layer-filter) | свечение или размытие только у слоя заклинаний, а не у всего экрана | `vfx.ts` (сейчас всё в общем списке через `setDepth`) | 3–4 | средняя | v3 (у `Layer` есть postPipeline — проверить FX на 3.90) | P2 |
| 16 | `postFX.addBokeh` / TiltShift | [bokeh](https://phaser.io/oss/examples/v4.1.0/filters/bokeh) | эффект «миниатюры» на экране выбора героя и на панораме города | `ui/charselect.ts` (фон), режим фото | 1–2 | средняя | v3 | P3 |
| 17 | `preFX.addShadow` | [shadow-filter](https://phaser.io/oss/examples/v4.1.0/filters/shadow/view/shadow-filter) | мягкая тень у летящих снарядов и у прыгающих боссов (видно высоту) | `vfx.ts`, `zoneBoss.ts` | 1–2 | низкая на объект | v3 | P3 |
| 18 | Снимок экрана `renderer.snapshot` | папка [Snapshot](https://phaser.io/oss/examples/v4.1.0/snapshot) | кнопка «Скриншот» без рамок интерфейса, PNG в папку игры | `ui/gamemenu.ts`, Electron | 1–2 | нет | v3 | P2 |
| 19 | `Grid` (фигура) | [game objects/shapes](https://phaser.io/oss/examples/v4.1.0/game%20objects/shapes) | сетка тайлов в админ-режиме и при расстановке | `ui/admin.ts` | 1 | нет | v3 | P3 |
| 20 | Геймпад | папка [Input](https://phaser.io/oss/examples/v4.1.0/input) (gamepad) | игра с геймпада в ПК-клиенте | `keybinds.ts`, `controls.ts` | 12–20 | нет | v3 | P3 |

### 2.2. Упростит разработку или ускорит игру

| # | Находка | Ссылка | Польза | Где у нас | ч | Слабый ПК | Версия | Пр. |
|---|---|---|---|---|---|---|---|---|
| 21 | Tiled JSON: `createFromObjects`, свойства тайлов, коллизии из Tiled | [create-from-objects](https://phaser.io/oss/examples/v4.1.0/tilemap/view/create-from-objects), [tile-properties](https://phaser.io/oss/examples/v4.1.0/tilemap/view/tile-properties), [collision-data](https://phaser.io/oss/examples/v4.1.0/tilemap/view/set-colliding-by-collision-data) | готовый образец для **импорта** нашей Tiled-карты: объекты → спрайты, свойство `solid` → проходимость | импортёр из `docs/libraries-2.md` 1.4, `tools/tiled/` | (в составе задачи Tiled) | — | v3 | P1 |
| 22 | Анимированные тайлы (вода, лава, огонь) из Tiled | (в Phaser 3 встроенной анимации тайлов нет; читаем `tileset.tileData[i].animation` и раз в N мс меняем индекс — ≈ 40 строк) | владелец рисует анимацию тайла прямо в Tiled | `terrainTiles.ts` | 3 | низкая (обновлять только видимые куски) | v3 (своё) | P2 |
| 23 | `weightedRandomize` тайлов | [weighted-randomize](https://phaser.io/oss/examples/v4.1.0/tilemap/view/weighted-randomize) | разнообразие травы и камня без ручной расстановки (например, 80 % травы, 15 % цветов, 5 % камней) | `terrainTiles.ts`, Tiled-импорт | 1 | нет | v3 | P3 |
| 24 | `Blitter` | [benchmark](https://phaser.io/oss/examples/v4.1.0/game%20objects/blitter/view/benchmark-test-1) | тысячи **неповоротных** мелочей одним вызовом: камешки, цветы, мусор на улицах, искры углей. Нет поворота и масштаба, поэтому для качающейся травы не подходит | `terrain.ts` (мелочь на кусках) | 3–4 | **снижает** | v3 и v4 | P3 |
| 25 | `Timeline` вместо цепочек `delayedCall` | [create-timeline](https://phaser.io/oss/examples/v4.1.0/time/timeline/view/create-timeline) | сценки и фазы боссов описываются данными (`data/*.json`), а не вложенными колбэками | `raidBoss.ts`, `fortScenes.ts` | вместе с № 7 | — | v3 | P2 |
| 26 | Сцена-плагин | [scene-plugin](https://phaser.io/oss/examples/v4.1.0/plugins/view/scene-plugin-test-1) | `PostFx`, `lights`, `weather` подключаются к любой сцене одной строкой, а не руками в `GameScene` | `postfx.ts`, `lights.ts`, `weather.ts` | 2–3 | — | v3 | P3 |
| 27 | Отладка коллизий тайлмапа | [debug-colliding-tiles](https://phaser.io/oss/examples/v4.1.0/tilemap/view/debug-colliding-tiles) | в админ-режиме видно, где карта непроходима: ловить «застрявших NPC» | `ui/admin.ts`, `terrain.ts` | 1–2 | нет (только админ) | v3 | P2 |
| 28 | Твин-счётчик, `stagger` | [counter-tween](https://phaser.io/oss/examples/v4.1.0/tweens/view/counter-tween), [stagger-showcase](https://phaser.io/oss/examples/v4.1.0/tweens/view/stagger-showcase) | золото «набегает» числом; руны круга вспыхивают по очереди | `effects.ts` (`+N`), `aim.ts` | 1 | нет | v3 | P3 |

---

## 3. Что уже есть у нас (не дублировать)

| Пример каталога | У нас | Файл |
|---|---|---|
| Glow, Shine, Bloom, Vignette, Displacement | сделано, режим «Полные / Простые» | `client/src/game/postfx.ts`, `data/lighting.json` |
| Point Light | факелы, жаровни, окна, мерцание, сила по времени суток | `client/src/game/lights.ts` |
| Дождь, гроза, вспышка камеры | сделано, расписание общее с сервером | `client/src/game/weather.ts`, `shared/weather.ts` |
| Тряска камеры, hit-stop | сделано | `client/src/game/camShake.ts`, `postfx.ts` |
| Следование камеры с lerp | `startFollow(…, 0.15, 0.15)` | `GameScene.ts:553` |
| Отсечение невидимого (culling) | свои: куски карты и юниты раз в 400 мс | `terrain.ts:341`, `GameScene.ts:531` |
| Тайлмап кусками | `make.tilemap` на кусок | `terrain.ts:282` |
| TileSprite (вода, макро-текстура) | сделано | `terrain.ts:89,96`, `vfx.ts:559` |
| Частицы с зонами (туман, листья, светлячки, пыльца) | сделано, 11 эмиттеров | `GameScene.ts:478` |
| RenderTexture | только для теней стен | `shadows.ts:108` |
| Blend modes (ADD) | 57 мест | везде в `vfx.ts`, `effects.ts` |
| Подсветка под курсором | своя (контур и пятно) | `hoverGlow.ts` |
| Миникарта | своя на DOM-canvas | `ui/hud.ts:113` |
| Атлас, ИИ NPC, экспорт в Tiled | в работе | `docs/libraries.md`, `docs/libraries-2.md` |
| Пространственный звук | у нас свой WebAudio (`sfx.ts`), примеры Phaser [spatial](https://phaser.io/oss/examples/v4.1.0/audio/Web%20Audio/view/spatial-audio-move-with-player) — для звука из файлов, **нам не подходят**; `StereoPanner` уже в `libraries-2.md` | `sfx.ts` |

---

## 4. Что смотрели и не берём

- **Light2D с картами нормалей** ([graveyard](https://phaser.io/oss/examples/v4.1.0/game%20objects/lights/view/graveyard), [Normal Tools](https://phaser.io/oss/examples/v4.1.0/filters/normal%20tools)). Нужны нормали к каждому кадру, а арт у нас генерируется кодом. Решение «не брать» принято в первом аудите.
- **Nine-slice.** Интерфейс у нас на DOM, там то же даёт CSS `border-image`. Для облачков реплик (`bubble.ts`) можно позже, но выгода мала.
- **Mesh / Plane** (есть в 3.90). В Phaser 4 удалены. Знамёна делать на `Rope`.
- **Мультикамеры и камера-миникарта** ([minimap-camera](https://phaser.io/oss/examples/v4.1.0/camera/view/minimap-camera)). Мир рисовался бы второй раз, на слабом ПК это ×2 нагрузки. Наша DOM-миникарта дешевле.
- **Video, DOM Element, физика Arcade/Matter** (200 примеров). Не нужны: движение считает сервер.
- **Только v4: `SpriteGPULayer`, `Noise`, `Gradient`, `ImageLight`, `Quantize`, `GradientMap`, `Key`, `Threshold`, параллельные фильтры, `Stamp`, `CaptureFrame`.** Сейчас недоступны. Самое заманчивое:
  - [Big Forest](https://phaser.io/oss/examples/v4.1.0/game%20objects/sprite%20gpu%20layer/view/big-forest) и [One Million Pixel Sprites](https://phaser.io/oss/examples/v4.1.0/game%20objects/sprite%20gpu%20layer/view/pixel-sprites-1-million) — огромный лес и трава почти бесплатно;
  - [Heat Haze](https://phaser.io/oss/examples/v4.1.0/game%20objects/noise/view/heat-haze-with-simplex-noise) — марево; у нас уже есть через Displacement;
  - [Reflections](https://phaser.io/oss/examples/v4.1.0/game%20objects/noise/view/reflections-with-simplex-noise) — отражения в воде.

---

## 5. Порядок внедрения

**Шаг 1 — дёшево и сразу видно (1 сессия, feature-dev):**
- № 6 ColorMatrix: смерть и низкое здоровье;
- № 9 портал (Barrel + Pixelate);
- № 5 тени облаков;
- № 2 души и золото к герою.

Всё — в `postfx.ts`, `teleportFx.ts`, `effects.ts`, параметры — в `data/lighting.json`. В режиме «Простые» эффекты выключать, кроме ColorMatrix (он дешёвый).

**Шаг 2 — мир живее (1–2 сессии, feature-dev):**
- № 3 `Rope`-флаги и цепи: ветер общий с `shared/weather.ts`, точки верёвки считать только у видимых;
- № 10 птицы;
- № 11 дождь не сквозь крыши;
- № 13 камера «смотрит вперёд».

**Шаг 3 — ночь и следы (core-engineer, потом feature-dev):**
- № 1 темнота-холст. Заменяет `dark`-прямоугольник. Свет из `lights.ts` стирает темноту мягкой кистью: одна RT размером с экран, кисть — заранее сгенерированный радиальный градиент. В «Простых» остаётся старый прямоугольник.
- № 4 холст следов. RT на кусок карты создаётся лениво, только когда на куске появился след; уничтожается вместе с куском. Затухание — перерисовка с альфой раз в 2–5 с, не каждый кадр. Предел — не больше N RT, из `data/lighting.json`.

**Шаг 4 — боссы и цифры (feature-dev):**
- № 7 и № 25 Timeline-вступления. Сценарий — в `data/boss-intros.json`: шаги `pan`, `zoom`, `sfx`, `shake`, `title`.
- № 8 BitmapText для цифр урона. **Шрифт выбирает владелец** — спросить через опросник. Атлас шрифта генерировать нашим `tools/gen` из выбранного TTF, раскладка — `RetroFont` или BMFont XML.

**Шаг 5 — вместе с импортом Tiled:**
- № 21 импорт объектов и свойств по образцу примеров;
- № 22 анимированные тайлы;
- № 27 отладка коллизий в админке.

**Позже (P3):**
- № 14 шейдер лавы и воды;
- № 15 FX на слое;
- № 24 Blitter для мелочи;
- № 26 плагины сцен;
- № 20 геймпад;
- № 16–19 и № 23, 28.

**Отдельный вопрос — Phaser 4.** Оценка перехода — 2–4 сессии core-engineer:
- переписать `postfx.ts` и маски на `Filters`;
- проверить `lights.ts`, `shadows.ts` и все места с `setBlendMode`;
- прогнать `tests/fx-shots.ts`.

Что даёт: SpriteGPULayer (лес, трава, толпы), фильтры на любой объект и слой, `Noise` для воды и облаков. Начинать только после того, как закончим шаги 1–4 на 3.90. Код шагов 1–4 почти весь переносится: Rope, RT, Timeline, частицы, BitmapText в v4 сохранились.

### Заметки для агентов

- Примеры на сайте написаны под **v4 API**. В 3.90:
  - `obj.filters.internal.addGlow()` → `obj.preFX.addGlow()`;
  - `camera.filters.external.add…` → `cam.postFX.add…`;
  - фильтр `Mask` → `setMask(createBitmapMask())`.
  
  Сверять с API 3.90: https://docs.phaser.io/api-documentation/api-documentation (версия 3.90) и с исходниками `node_modules/phaser/src`.
- В 3.90 `Rope` принимает массив точек; менять `rope.points[i]` и ставить `rope.setDirty()` в `update`. Только WebGL — в Canvas-режиме оставлять статичный спрайт флага.
- `RenderTexture` в 3.90 — это `DynamicTexture` внутри. Рисовать пачкой: `rt.beginDraw()`, затем `rt.batchDrawFrame(...)`, затем `rt.endDraw()`. Кадры брать из атласа (задача атласа в `libraries.md`).
- Всё новое — с переключателем «Полные / Простые» (`vfxFull()` из `postfx.ts`), параметры — в `data/lighting.json` или в новом `data/fx.json`.
