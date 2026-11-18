import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// Поднимает настоящий AppModule: реальная валидация конфига, реальный PrismaService, реальный Postgres.
// Важно: настройки из main.ts (CORS, shutdown hooks) не входят в AppModule,
// поэтому здесь они не проверяются.
describe('GET /health (e2e)', () => {
  // Дженерик типизирует getHttpServer(); без него сервер — `any`.
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // init() запускает хуки жизненного цикла (PrismaService подключается), не открывая порт:
    // supertest работает с объектом HTTP-сервера напрямую.
    await app.init();
  });

  // Без close() пул соединений с БД остаётся открытым, и процесс теста не завершается.
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok when the database is up', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
