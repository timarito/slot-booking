import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// Проверяет, что pino-http middleware из LoggerModule действительно подключён к AppModule:
// у каждого ответа, включая ошибки, есть X-Request-Id.
describe('X-Request-Id (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns a new id when the client sends none', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a valid incoming id, also on error responses', async () => {
    await request(app.getHttpServer())
      .get('/does-not-exist')
      .set('X-Request-Id', 'trace-42')
      .expect(404)
      .expect('X-Request-Id', 'trace-42');
  });

  it('replaces an unsafe incoming id', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'bad id with spaces')
      .expect(200);

    // Проверяем формат, а не «не равно»: иначе тест прошёл бы и при отсутствии заголовка.
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
