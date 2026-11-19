// Адрес БД для e2e-тестов. Тесты очищают таблицы, поэтому они никогда не должны попасть
// в dev-базу из apps/api/.env: там лежат данные, с которыми работаешь руками.
//
// По умолчанию — отдельная база slot_booking_test в том же контейнере Postgres, что и dev
// (учётные данные из корневого docker-compose.yml; в CI service-контейнер настроен так же).
// Саму базу создавать не нужно: `prisma migrate deploy` в globalSetup создаёт её, если её нет.
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://slot_booking:slot_booking@localhost:5432/slot_booking_test';

export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;

// Предохранитель: очистка таблиц — разрушительная операция. Если кто-то переопределит
// TEST_DATABASE_URL на «настоящую» базу, тесты должны упасть до первого запроса, а не стереть её.
const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run e2e tests against database "${databaseName}": its name must end with "_test".`,
  );
}
