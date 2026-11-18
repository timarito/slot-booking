import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// Boots the real AppModule: real config validation, real PrismaService, real Postgres.
// Note: settings applied in main.ts (CORS, shutdown hooks) are NOT part of AppModule,
// so they are not covered here.
describe('GET /health (e2e)', () => {
  // The generic types getHttpServer(); without it the server is `any`.
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // init() runs lifecycle hooks (PrismaService connects) without opening a port:
    // supertest talks to the HTTP server object directly.
    await app.init();
  });

  // Without close() the DB pool stays open and the test process never exits.
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok when the database is up', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
