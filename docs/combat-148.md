# Задача 148 «Боевка: глубина и контроль» — проект

Цель: уйти от «тык-тык лицом к лицу». Жёсткий контроль (стан до 4 с, замедление до 70 %), новые виды — безмолвие, корни, страх;
у каждого класса свой стиль контроля и средство выхода; мобы — 4 архетипа с телеграфами; DR в PvP по категориям (как WoW).
Все числа — в `data/*.json` (новый `data/cc.json` + существующие файлы умений), в коде только механика.

## 1. Как сейчас

| Что | Где | Суть |
|---|---|---|
| Эффекты | `server/src/game/effects.ts` | `applySlow` (слот «процент+срок», сильнейший действует, слабый ждёт в хвосте), `applyStun`, `applyRoot` (только продление срока), `ccMs` = `×(1−ccReduce)` и `×pvp.ccMult` (0.7) |
| DR | `effects.ts stunDrK` | только оглушение, только герой→герой: `pvp.stunDr [1,.5,.25,0]`, окно `stunDrMs 15000` (`data/balance.json`) |
| Поля | `Player.ts`, `Mob.ts` | `stunUntil`, `rootUntil`, `slowPct/slowUntil`, `frozenUntil` (у героя); безмолвия и страха нет |
| Движение | `World.ts` ~913 `canMove`, 791 `playerSpeed`, 987 `mobSpeed`, 1100 у моба | стан — ни шага, ни атаки; корни — нет шага; замедление — множитель скорости |
| Умения | `skills.ts:52` | под станом умение нельзя; касты (`castUntil`: Гимн, Воскрешение, камень, маунт) рвёт только движение |
| Мобы | `World.updateMob` (1069–1190), `data/mobAI.json` | императивный ИИ: `kite.min`, `heal` (мгновенный снаряд, без каста), `slam` (круг-телеграф, стан на замахе срывает удар), `throw`, `weak.cc` — множители длительности (`applyWeakCc` правит срок задним числом) |
| mistreevous | `server/src/game/ai/brain.ts`, `data/ai.json` | только горожане (`trees.citizen`), мобы деревом не ходят |
| Боссы | разные модули | «босса — замедление» прописано в описаниях умений поштучно (`tp_shield_bash`, `dr_snare`, `as_cheap`, `hr_hamstring`); общего правила нет |
| Клиент | `UnitView.ts:564` тон спрайта, `auraFx.ts` + `data/aura-fx.json debuffs: stun root slow`, `GameScene.ts:1399/1403` | предсказание движения: стан/корни блокируют, замедление — **фикс. ×0.55** (не реальный %) |
| Флаги | `shared/protocol.ts` | `Unit.buffs` uint16, занято до 1024 (BLEED) → свободны 2048…32768 |
| Рамка | `server/src/game/auras.ts:67` (`stun/root/slow`), подписи `data/auras.json` | |

Замечания: в `data/mobAI.json` у `fallen_umbrath` `weak` без обёртки `dmg` (данные не применяются). `server/src/rooms/schema.ts` сейчас правит другой агент (visibility) — батч с новым полем схемы ставить после его коммита.

## 2. Модель контроля

### Типы
| Тип | Нельзя | Можно | Ломается | Флаг |
|---|---|---|---|---|
| stun | двигаться, атаковать, умения (кроме помеченных `usableInStun`) | — | нет | BUFF_STUN |
| root | двигаться | атака, умения; рывки/телепорты — только с `breaksRoot` | нет | BUFF_ROOT |
| slow | — (скорость −pct, потолок `cc.maxSlowPct` 70) | всё | нет | BUFF_SLOW + `slowPct` в схеме |
| silence | умения (кроме `usableInSilence`: щиты-«физика», рывки воинов) | автоатака, бег | нет | BUFF_SILENCE 2048 |
| fear | управление: сервер ведёт прочь от источника (скорость ×`fear.speedMul`, виляние) | — | урон ≥ `fear.breakHp`·maxHp после наложения (DoT считается с весом `fear.dotWeight`) | BUFF_FEAR 4096 |

Стан и страх прерывают каст (`castUntil`, `mountCast`, замах моба `windUntil`); безмолвие прерывает только каст умений и даёт моба-кастера
блокировку `cc.silenceLockMs`. Длительность: `ms × (1−ccReduce) × pvpCcMult × DR`, затем потолок `cc.maxMs[тип]` (стан 4000, страх 4000, корни 4000, безмолвие 4000).

### Категории DR (только герой→герой и питомец героя→герой)
`stun` (все оглушения), `root` (корни, вмерзание), `fear` (страх), `silence`, `slow` — у каждой свой счётчик.
Жёсткие: `[1, 0.5, 0.25, 0]`, сброс через `cc.drMs` 18000 после **последнего** наложения в категории.
Замедления — мягкая шкала `[1, 0.75, 0.5, 0.5]` по **сроку**, не до иммунитета (иначе кайт не работает). Рывки-притяжения (Хватка смерти) и отбрасывания — без DR.
Иммунитет (k=0): эффект не ложится, на цели — всплывающее «Иммунитет», `aura` `dr_<cat>` в рамке.

### PvE и боссы
Мобы: без DR, но `weak.cc` переносится внутрь `applyCc` (множитель при наложении, `applyWeakCc` удаляется).
Боссы (`def.boss`, рейд, зонные): `cc.boss` = `{ stun: "slow", root: "slow", fear: "immune", silence: "interrupt", slowMult: 0.5, convSlow: 50 }` —
стан и корни превращаются в замедление `convSlow` %, страх не ложится, безмолвие только сбивает каст босса (без блокировки), сила замедления ×0.5.
Это общее правило заменяет поштучные «босса — замедление» в модулях классов.

### Где в коде
- `server/src/game/effects.ts`: одна точка `applyCc(w, by, a, kind, ms, pct?)` + обёртки `applyStun/Root/Slow/Silence/Fear`; DR-таблица `WeakMap<Actor, Record<Cat,{n,until}>>`; правило боссов; `breakFear(a, dmg, dot)`; `cleanseCc(a, kinds[])`.
- `Player.ts`, `Mob.ts`: `silenceUntil`, `fearUntil`, `fearFrom {x,y}`, `fearDmg`.
- `World.ts`: `canMove` (+fear), шаг страха для героя и моба (`fearStep`), автоатака запрещена под страхом, прерывание каста на стан/страх/безмолвие; `hit()` зовёт `breakFear`; флаги BUFF_*.
- `skills.ts castSkillInner`: проверки `silenceUntil`, `fearUntil`, флаги `usableInStun/usableInSilence/breaksRoot` из данных умения.
- `auras.ts`: `silence`, `fear`, `dr_stun|root|fear|silence` (DR цели видно в рамке цели только в PvP).
- `shared/protocol.ts`: BUFF_SILENCE, BUFF_FEAR; `schema.ts`: `slowPct` uint8 (клиентское предсказание скорости).
- `shared/balance.ts` + `data/cc.json`: правила (`maxMs`, `maxSlowPct`, `dr`, `drMs`, `slowDr`, `fear`, `boss`, `silenceLockMs`) и `skills` — новые CC-поля по id умения (см. §3).
  `pvp.stunDr/stunDrMs` в balance.json удаляются (переезжают в `cc.dr`); `pvp.ccMult` 0.7 → пересмотреть симулятором (кандидат 0.85).

## 3. Классы: стиль контроля и выход

Числа на 5-м ранге, «→» — было → стало. Новое поле умения — в `data/cc.json skills.<id>` (у базовых умений Сольгарда из `shared/skills.ts` — тоже там; код читает через `ccOf(id, rank)`).

| Класс | Стиль | Умения (id: изменение) | Выход |
|---|---|---|---|
| Храмовник `warrior` | стан, прерывание | `charge`: стан 1.2 → 1.5 с, снимает с себя корни/замедление; `tp_shield_bash`: стан 1.5 → 2.0, сбивает каст + безмолвие 2 с; `quake`: замедление 40 → 50 % на 3 с | `tp_divine` `usableInStun`, снимает всё; `charge` `breaksRoot`; `unbending` режет все типы CC |
| Клирик `healer` | безмолвие, лёгкий страх | `cl_radiance`: враги на луче — безмолвие 2 с; `holyshield`: разбитый щит пугает врагов рядом (радиус 90) на 2 с (страх) | `cl_cleanse` на себя `usableInStun` (снимает стан/корни/страх/безмолвие), cd 10 → 16; `cl_pure_light` пассивно укорачивает |
| Егерь `ranger` | кайт: замедления, капканы | `hr_hamstring`: 20+10r → 30+10r % (70 % на 5 р.) на 2 с, дальше 200 пикс.; `volley`: замедление 30 % 2 с; `hr_trap`: корни 2+0.2r → 2.5+0.3r; `rain`: 30 → 40 % | `roll` снимает корни/замедление (`breaksRoot`), `hr_trickroll` — капкан за спиной |
| Боевой маг `mage` | заморозка | `frostnova`: замедление → корни 2+0.25r (3 с), после — замедление 50 % 2 с; `mg_bolt`: первая цель — безмолвие 1.5 с (прерывание, cd 7); `mg_timewarp` 55 → 60 %; `mg_phase` 40 → 50 % | `blink` `usableInStun` + `breaksRoot`, cd +2 с; `mg_escape` |
| Ассасин `rogue` | стан-лок из тени | `as_cheap`: стан 1.5+0.1r → 1.8+0.1r (+1.5 из скрытности/со спины, ≤4 с); `shadowstep`: безмолвие 2 с (кик); `venom` 3 стака — замедление 30 % | `stealth`/`as_smoke` снимают корни/замедление; `as_escape` + снятие стана; `shadowstep` `breaksRoot` |
| Рыцарь смерти `deathknight` | притяжение + лёд | `dk_death_grip`: замедление 50 % 2 → 3 с, рывок сбивает каст; `dk_icy_touch`: замедление 45 → 50 %, вмерзание 1.2 → 1.5 с; `dk_chain_storm`: 40 % 2 с → 50 % 3 с; `dk_iron_chains`: корни 1.5+0.5r | `dk_anti_magic`: на время иммунитет к безмолвию и страху; `dk_icebound` режет все типы |
| Кровотворец `bloodweaver` | страх кровью | `bw_blood_burst`: враги в круге — страх 1.5 с (кто истекает кровью — 2.5 с); `bw_crimson_pool`: замедление 30 % внутри | `bw_sacrifice` без цели снимает с себя корни/замедление/безмолвие (`usableInSilence`) |
| Тёмный следопыт `darkranger` | безмолвие + корни | `dr_raven`: первый клевок — безмолвие 2 с (cd 14); `dr_snare` корни 1.8+0.2r без изменений; `dr_weakening`: 30 → 40 %; `dr_veil`: 25 → 35 % | `dr_shadowmeld` снимает и корни (сейчас только замедление); `dr_last_shadow` |
| Чернокнижник `warlock` | страх, корни | `wl_hex`: страх 2.5 с при наложении (cd 14), потом проклятие; `wl_skeletons`: корни 1.5 → 2 с; `wl_doom`: замедление 20 % | `wl_meta`: снятие при входе + иммунитет к страху и корням на срок; `wl_shroud` |
| Потрошитель `reaver` | догон ближника | `rv_hamstring`: 50 → 60 %; `rv_leap`: снимает с себя корни/замедление (`breaksRoot`), цели — безмолвие 1 с; `rv_throw`: замедление 40 % 3 с по линии | `rv_frenzy`: иммунитет к замедлению на срок (не к стану) |

Итого в каждой паре «танк/лекарь/лучник/кастер/ближник» фракций стиль разный: стан (Храмовник/Ассасин), лёд (маг/ДК), кайт (Егерь), безмолвие (Клирик/Тёмный следопыт), страх (Кровотворец/Чернокнижник), догон (Потрошитель).
Новые эффекты — флаги `usableInStun`, `usableInSilence`, `breaksRoot`, `cleanse: [...]`, `immune: {kinds, ms}` в `data/cc.json skills`. Описания умений (`desc`) правит content-writer.

## 4. Мобы: 4 архетипа

Дерево мобов — `data/ai.json trees.mob` (MDSL), агент `server/src/game/ai/mobBrain.ts` (`MobAgent`), шаг 200 мс только у мобов в бою; ходьба — каждый такт по цели дерева (как у горожан).
`World.updateMob` зовёт дерево, если у моба есть `ai.arch`; остальные мобы — по старому коду (переход постепенный). Параметры — `data/mobAI.json`.

```
root { selector {
  sequence { condition [IsDisabled] action [Hold] }            // стан, страх (страх ведёт World)
  sequence { condition [IsReturning] action [Return] }
  sequence { condition [IsWindingUp] action [Hold] }           // замах: телеграф уже висит
  sequence { condition [CanSupport] action [CastSupport] }     // лечить/усилить, каст с полосой
  sequence { condition [CanDash] action [Dash] }               // рывок к дальнику
  sequence { condition [CanNet] action [Net] }                 // сеть-корни / стан-удар
  sequence { condition [MeleeTooClose] action [Retreat] }      // дальник отходит
  action [Fight]                                               // сближение + удар / выстрел
} }
```

| Архетип | `mobAI.json` | Поведение и телеграф | Мобы |
|---|---|---|---|
| Разбойник `skirmisher` | `dash: {min:120, max:320, wind:450, cd:9, mult:1.6, slow:40, slowMs:2500, prefer:"ranged"}` | выбирает героя-дальника/кастера в радиусе; замах 0.45 с — красная полоса-линия к цели; рывок, удар ×1.6 + замедление | bandit, bandit_leader, marauder_axe, nomad_axe, wolffolk_chaser, gnoll_chaser, ghoul_leaper, canine_jackal |
| Контролёр `controller` | `net: {range:220, wind:700, root:2000, r:28, cd:12}`, у ударников `slam.stun: 1500` | сеть: круг-метка в точке цели 0.7 с, можно уйти; стан-удар: существующий slam + значок звёзд в круге | ghoul_catcher, frogfolk_harpoon, wrapped_weaver, spider_spitter (паутина), butcher_hook; стан: skeleton_knight, bone_knight, ogre_*, troll_*, golem_* (кроме осадного), ash_knight |
| Дальник `archer` | `kite: {min:110, keep:220, retreatCd:3}`, `chill: {pct:25, ms:1500}` у части | держит 160–220 пикс., ближник рядом — отход шагом в сторону от стены (а не упор); замедленный герой — бьёт без отхода | skeleton_bow, gnoll_archer, marauder_bow, north_bow, orc_bow, goblin_slinger, lizardfolk_javelin, wolffolk_hunter, fallen_spirit_archer, ratfolk_poacher, skeleton_mage, imp_caster |
| Шаман `support` | `heal: {…, cast:1200}`, `buff: {range:220, dmg:20, haste:20, ms:8000, cd:10, cast:1000}` | лечение и усиление — каст с полосой над мобом и свечением рук; стан/безмолвие сбивают и блокируют `silenceLockMs`; держится за спинами | goblin_shaman, satyr_piper, frogfolk_shaman, lizardfolk_shaman, bone_witch_staff, fallen_spirit_drowned; усиление — cultist_pyro, orc_thunder |

Телеграфы: в `World.telegraph` добавить форму `line` (рывок, сеть по линии); круг сети — зелёно-серый, стан-удар — круг + иконка звёзд, каст шамана — полоса каста над плашкой (событие `cast` для моба, как у боссов).
Мобы тоже ловят страх/безмолвие героев: страх — бег прочь (ломается уроном), безмолвие — шаман не лечит, кастер бьёт только ближним.

## 5. Визуал и звук

- Над головой (`data/aura-fx.json debuffs`, slot overlay, приоритет выше бафов): `stun` — кружащие звёзды (есть, проверить по планке паков), `root` — цепи/лозы у ног + замок над головой, `silence` — печать с перечёркнутыми устами, `fear` — череп с дрожью; `immune` — серый щит-вспышка 0.6 с.
- Замедление — эффект у ног (`slow`, ring): иней/грязь, интенсивность по `slowPct` (2 ступени: до 40 и выше).
- Стоп-кадр при стане: `UnitView` ставит анимацию на паузу на текущем кадре + лёгкое обесцвечивание (вместо сплошного жёлтого тона на 564); корни — ноги не анимируются, руки бьют.
- Страх: спрайт бежит с дрожью, сверху череп; при сломе — осколки.
- Рамка героя и цели: значки `stun/root/slow/silence/fear` с таймером (`data/auras.json`); в рамке цели (PvP) — маленький значок DR категории: «½», «¼», перечёркнутый круг; хотбар под безмолвием — умения серые с печатью.
- Клиент: `GameScene` — под страхом ввод не предсказывается, под безмолвием клавиши умений дают тост; скорость предсказания — по `slowPct`.
- Звук (`client/src/game/sfx.ts`): стан — глухой удар + звон, корни — лязг цепи/треск лозы, безмолвие — приглушённое «шш», страх — шёпот-вскрик, слом страха — стекло, иммунитет — металлический «тинь». Замах моба — короткий свист до удара.
- Спрайты эффектов — генератор `tools/gen/aura-fx.ts` (запускать, когда машина свободна; сравнение «наш | эталон»).

## 6. Шаги реализации (партии, файлы не пересекаются)

| № | Кто | Файлы | Что | Тест |
|---|---|---|---|---|
| A | core-engineer | `effects.ts`, `Player.ts`, `Mob.ts`, `World.ts` (canMove, fearStep, cast interrupt, hit→breakFear, флаги; удалить applyWeakCc), `skills.ts` (guard), `auras.ts`, `shared/protocol.ts`, `shared/balance.ts`, `data/cc.json` (правила), `data/balance.json` (убрать stunDr), `shared/skills.ts` (`ccOf`), `schema.ts` (`slowPct` — после коммита visibility) | ядро CC, DR, боссы | новый `tests/cc.ts`: DR 1/.5/.25/иммун и сброс 18 с; потолки 4 с и 70 %; босс: стан→замедление, страх не ложится; страх ломается от урона; безмолвие — атака и бег можно, умения нельзя; стан рвёт каст; `tests/combat.ts` зелёный |
| B1 | feature-dev | `tanks.ts`, `healers.ts` | Храмовник, ДК, Клирик, Кровотворец по §3 | `tests/cc.ts` блок классов (один каст — один эффект) |
| B2 | feature-dev | `mages.ts`, `archers.ts` | маг, Чернокнижник, Егерь, Тёмный следопыт | то же |
| B3 | feature-dev | `rogue.ts`, `reaver.ts` | Ассасин, Потрошитель | то же |
| C | content-writer | `data/cc.json skills`, `data/skills*.json` (числа и `desc`), `data/auras.json`, тексты | числа §3, подписи | — (проверка JSON) |
| D | feature-dev | `server/src/game/ai/mobBrain.ts` (новый), `data/ai.json trees.mob`, `data/mobAI.json`, `shared/mobs.ts` (типы), `World.ts` только `updateMob`+`telegraph line` — после A | 4 архетипа, телеграфы | `tests/mobs-ingame.ts` + новый `tests/mob-arch.ts`: рывок по дальнику, сеть даёт корни, шаман сбивается безмолвием, лучник отходит |
| E | feature-dev | `client/src/game/auraFx.ts`, `UnitView.ts`, `GameScene.ts`, `sfx.ts`, `client/src/ui/hud.ts` (рамка, хотбар — после чужой правки hud), `data/aura-fx.json`, `tools/gen/aura-fx.ts` | визуал и звук §5 | `tests/aura-ingame.ts`, скриншоты stun/root/silence/fear |
| F | core-engineer | `server/src/arena/bots.ts`, `tools/balance/sim.ts` | боты и симулятор используют CC и выходы, кайт дальников | прогон sim `--only pvp,pvproles,pve,boss` |

Порядок: A → (B1, B2, B3, C, D, E параллельно; число агентов — по слову пользователя, сценарии с сервером по одному) → F → баланс → tester.
B и C делят числа: B кладёт поля в `data/cc.json` с черновыми значениями из §3, C только правит значения и тексты (после B).

## 7. Риски баланса

- Цепочки разных категорий (стан 4 → страх 4 → безмолвие) = ~10 с без ответа: держат `pvp.burstCapHp`/`hitCapHp`, но дуэль 15–20 с ломается. Меры: общий потолок «полного контроля» `cc.chainCapMs` (напр. 6 с из 10), после — 1 с иммунитета ко всему; `ccMult` подобрать sim.
- Кайт: маг (корни 3 с + блинк) и Егерь (70 % замедления) против ближника могут не проигрывать никогда → у Потрошителя/Храмовника/Ассасина обязательны рывок + снятие корней; мягкий DR замедлений; проверить пары ranger×reaver, mage×rogue, darkranger×warrior в `sim.ts pvp`, добавить метрику «доля времени ближника в радиусе удара».
- Лекари под безмолвием: пары `pvproles` (лекарь против бойца 60–70 %) сдвинутся; Клирик/Кровотворец получают `usableInSilence`-выход.
- Страх + свои DoT (Чернокнижник: Агония ломает свой же страх) — `fear.dotWeight` 0.5 и порог `breakHp` 0.1.
- PvE: жёсткий контроль без DR тривиализирует пачки — длительности на мобах ×`weak.cc`, у элит `cc.eliteMult` 0.7; мобы-контролёры по героям — без DR, но потолок 2 с у обычных мобов (`cc.mobMaxMs`).
- Боссы: замедление ×0.5 — проверить, что механики (`throw`, телеграфы) не обходятся кайтом; `sim.ts boss`.
- Боты арены (`bots.ts`) не умеют выходить из CC — до F рейтинг ботов искажён; `pvp.class` поправки пересчитать после F.
- Клиент: предсказание скорости по фикс. 0.55 даст «резинку» при 70 % — `slowPct` в схеме обязателен.
