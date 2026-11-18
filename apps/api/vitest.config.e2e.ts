import { defineConfig } from 'vitest/config';

// E2E-тесты: поднимают весь AppModule и отправляют ему настоящие HTTP-запросы.
// Им нужны запущенный Postgres (`pnpm db:up`) и apps/api/.env, поэтому они медленнее
// и запускаются отдельно от unit-тестов.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Каждый файл поднимает своё приложение и пул соединений; файлы идут по одному,
    // чтобы не конкурировать за одну БД, когда тесты начнут писать данные (M2+).
    fileParallelism: false,
  },
});
