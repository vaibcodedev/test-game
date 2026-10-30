---
paths:
  - "tools/gen/hero147/**"
  - "tools/gen/mobs/**"
  - "tools/gen/scale147/**"
  - "tools/gen/vfx*"
  - "client/src/game/UnitView.ts"
  - "client/src/game/heroCloth.ts"
  - "client/src/game/ropeCloth.ts"
  - "client/src/game/effects.ts"
  - "client/src/game/fx/**"
  - "data/hero-base-b.json"
---
# Анимация и эффекты (подробно — docs/art/animation.md)

- Эталон — основа Б: 12–16 кадров, 12–16 к/с, easing, переход 2–3 кадра; ступня на земле не скользит (шаг = скорость из shared).
- Подвижные части — с запаздыванием, ≤ 1 px между соседними кадрами; ткань — Verlet + Phaser Rope, не кадрами.
- Все направления, ничего не вылезает за кадр; крупное оружие — кадр шире.
- Эффекты — на уровне паков (сначала бесплатные паки), размеры к герою (снаряды 12–20 px, попадания 24–40), плавно; сравнение «наш | эталон».
- Проверка: tools/gen/gear147/review.ts, tools/gen/hero147/gait_check.ts.
- Удар синхронен с уроном: кадр контакта = момент урона, длина ≤ attackCd с haste (timeScale), между ударами — боевая стойка.
