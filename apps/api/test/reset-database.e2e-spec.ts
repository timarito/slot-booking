import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

// Проверяет саму тестовую инфраструктуру: на неё будут опираться все e2e-тесты с данными.
describe('Test database isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects the app to the dedicated test database', async () => {
    const [{ name }] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;

    expect(name).toMatch(/_test$/);
  });

  // Два теста создают пользователя с одним и тем же email. Второй проходит только потому,
  // что beforeEach стёр данные первого, иначе упал бы уникальный индекс users_email_key.
  it.each(['first', 'second'])('starts the %s test with empty tables', async () => {
    expect(await prisma.user.count()).toBe(0);

    await prisma.user.create({
      data: { email: 'isolation@example.com', passwordHash: 'not-a-real-hash', name: 'Isolation' },
    });

    expect(await prisma.user.count()).toBe(1);
  });

  it('keeps the migration history', async () => {
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM _prisma_migrations
    `;

    expect(count).toBeGreaterThan(0n);
  });
});
