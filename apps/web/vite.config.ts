/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Один конфиг и для сборки, и для тестов: Vitest берёт те же плагины и алиасы, поэтому код
// в тестах трансформируется так же, как в приложении. Отдельный vitest.config нужен, только
// когда окружения расходятся (как unit и e2e в apps/api).
// https://vite.dev/config/ · https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // API разрешает CORS ровно для http://localhost:5173 (CORS_ORIGIN в apps/api/.env).
    // Без strictPort занятый порт молча сменился бы на 5174, и запросы к API падали бы на CORS.
    port: 5173,
    strictPort: true,
  },
  test: {
    // jsdom — DOM, реализованный на JS внутри Node: компоненты рендерятся без браузера.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Тот же явный стиль, что в apps/api: describe/it/expect импортируются, а не глобальные.
    globals: false,
  },
});
