import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/support/test-database-url.js';

// E2E-тесты: поднимают весь AppModule и отправляют ему настоящие HTTP-запросы.
// Им нужен запущенный Postgres (`pnpm db:up`), поэтому они медленнее
// и запускаются отдельно от unit-тестов.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Миграции применяются к тестовой БД один раз перед всеми файлами.
    globalSetup: ['test/support/global-setup.ts'],
    // Переменные процесса имеют приоритет над apps/api/.env в ConfigModule, поэтому приложение
    // в тестах подключается к тестовой базе, а не к dev.
    env: { DATABASE_URL: TEST_DATABASE_URL },
    // Все файлы работают с одной базой и очищают её в beforeEach: параллельно они стирали бы
    // данные друг друга. Поэтому файлы идут строго по одному.
    fileParallelism: false,
  },
});
