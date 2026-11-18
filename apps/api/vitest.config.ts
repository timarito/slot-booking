import { defineConfig } from 'vitest/config';

// Unit-тесты: быстрые, без БД и сети. Лежат рядом с кодом как *.spec.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Полифил Reflect metadata в рантайме неявно загружает @nestjs/core.
    // Unit-тесты, которые не импортируют Nest (например, валидация env через class-transformer),
    // тоже от него зависят, поэтому грузим его один раз на тестовый файл — так же, как приложение.
    setupFiles: ['reflect-metadata'],
  },
});
