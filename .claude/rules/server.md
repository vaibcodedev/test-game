---
paths:
  - "server/**"
  - "shared/**"
  - "data/anticheat.json"
---
# Сервер и античит (подробно — docs/systems/architecture.md)

- Сервер авторитарен, клиент шлёт только намерения; права админа — только на сервере.
- Сообщения — через makeOn() → floodCheck() и схемы server/src/rooms/schemas.ts; id из клиента — только через Object.hasOwn.
- Предметы и золото: в памяти + сохранение одной транзакцией SQLite с откатом; место в сумке считать до изменения (без дюпа).
- Публичное — Schema, личное — сообщения владельцу, эффекты — пакет fx. Числа — в data/*.json.
- После правки: npm run typecheck и npm run test:unit (docs/process/tests.md).
