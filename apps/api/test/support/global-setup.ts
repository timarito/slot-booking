import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL } from './test-database-url.js';

// Vitest вызывает globalSetup один раз перед всеми e2e-файлами, в главном процессе.
// Приводим схему тестовой БД к последней миграции — так же, как это делает деплой
// (`migrate deploy`: только применяет готовые миграции, ничего не генерирует и не сбрасывает).
// Если тест падает из-за «нет такой таблицы», значит, забыли создать миграцию.
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    // Корень apps/api: там prisma.config.ts и папка prisma/.
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    // prisma.config.ts загружает .env через dotenv, но dotenv не перезаписывает уже заданные
    // переменные, поэтому миграции идут в тестовую базу, а не в dev.
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
