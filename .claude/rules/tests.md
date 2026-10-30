---
paths:
  - "tests/**"
---
# Тесты (подробно — docs/process/tests.md)

- Быстрые без сервера: `npm run test:unit` (флаги `-j 2`, `--unit`, подстрока имени). Тест — скрипт `npx tsx tests/<имя>.ts`, код выхода 0/1.
- С сервером (`tests/harness.ts`, скриншоты) — строго по одному под замком tools/out/scenario.lock.
- Найденный баг — тест knownFail; XPASS — снять пометку.
- Хитбоксы и наведение — tests/pick.ts. Скриншоты после успешного прогона удалять.
