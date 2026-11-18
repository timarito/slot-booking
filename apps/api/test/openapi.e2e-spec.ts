import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupOpenApi } from '../src/openapi.js';

// setupOpenApi вызывается в main.ts, а не в AppModule, поэтому здесь подключаем его вручную —
// так же, как в main.ts. Проверяем то, на что будет опираться генерация типов на фронтенде.
describe('OpenAPI (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupOpenApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the JSON specification with documented routes and error format', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    // supertest типизирует body как any; приводим к типу документа, чтобы обращения проверялись.
    const document = response.body as OpenAPIObject;
    const problem = { schema: { $ref: '#/components/schemas/ProblemDetails' } };

    expect(document.openapi).toMatch(/^3\./);
    expect(document.components?.schemas).toHaveProperty('ProblemDetails');
    // Ошибки описаны с правильным media type и ссылкой на общую схему: и 503, и `default`.
    expect(document.paths['/health']?.get?.responses).toMatchObject({
      '200': {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/HealthStatusDto' } },
        },
      },
      '503': { content: { 'application/problem+json': problem } },
      default: { content: { 'application/problem+json': problem } },
    });
  });

  it('serves Swagger UI', async () => {
    await request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /text\/html/);
  });
});
