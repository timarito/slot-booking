import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// CLI: пишет OpenAPI-спецификацию в файл без запуска сервера и без БД. Из файла фронтенд
// генерирует типы (apps/web, openapi:types); файл в git, CI проверяет, что он не устарел.
//   node dist/openapi-export.js <output.json>

// AppModule валидирует env уже при создании (ConfigModule, fail fast), а контракт от конфига
// не зависит. Подставляем заведомо фиктивные значения — поверх любого локального .env, чтобы
// результат был одинаковым на любой машине. Подключения к БД не будет: см. preview ниже.
Object.assign(process.env, {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://unused@localhost/openapi-export',
  CORS_ORIGIN: 'http://localhost',
  JWT_ACCESS_SECRET: 'openapi-export-placeholder-not-a-real-secret',
  LOG_LEVEL: 'silent',
});

// Динамический импорт: статические импорты ESM выполняются до кода модуля, то есть до
// Object.assign выше, и ConfigModule увидел бы пустой env.
const { AppModule } = await import('./app.module.js');
const { buildOpenApiDocument } = await import('./openapi.js');

// preview: Nest строит граф модулей и читает метаданные контроллеров, но не создаёт провайдеры
// (PrismaService не подключается к БД). Для генерации документа больше ничего не нужно.
// https://docs.nestjs.com/standalone-applications
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const document = buildOpenApiDocument(app);
await app.close();

const output = resolve(process.argv[2] ?? 'openapi.json');
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI document written to ${output}`);
