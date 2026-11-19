import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { ProblemDetails } from '../src/common/errors/problem-details.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

const body = { email: 'bob@example.com', password: 'password1', name: 'Bob' };

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication<App>;
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

  const register = (payload: object) =>
    request(app.getHttpServer()).post('/auth/register').send(payload);

  it('creates a member and returns only public fields', async () => {
    const response = await register(body).expect(201);

    // Сверяем с тем, что реально записано в БД: id и createdAt генерируются, поэтому
    // ожидаемые значения берём оттуда. toEqual строгий: лишнее поле (passwordHash) уронит тест.
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@example.com' } });
    expect(response.body).toEqual({
      id: stored.id,
      email: 'bob@example.com',
      name: 'Bob',
      role: 'member',
      createdAt: stored.createdAt.toISOString(),
    });
  });

  it('stores an argon2id hash instead of the password', async () => {
    await register(body).expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('password1');
  });

  it('normalizes the email and trims the name', async () => {
    const response = await register({
      ...body,
      email: '  Bob@Example.COM ',
      name: '  Bob ',
    }).expect(201);

    expect(response.body).toMatchObject({ email: 'bob@example.com', name: 'Bob' });
  });

  it('returns 409 email-taken for an email that differs only in case', async () => {
    await register(body).expect(201);

    const response = await register({ ...body, email: 'BOB@example.com' }).expect(409);

    expect(response.body).toMatchObject({ code: 'email-taken', status: 409 });
    expect(await prisma.user.count()).toBe(1);
  });

  // Гонка, ради которой нет предварительного SELECT: оба запроса проверили бы «email свободен».
  // Уникальный индекс пропускает ровно одну вставку, вторая получает 409, а не 500.
  it('lets exactly one of several concurrent registrations with the same email succeed', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => register(body)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  // Защита от mass assignment: роль нельзя выбрать при регистрации.
  it('rejects unknown fields such as role', async () => {
    const response = await register({ ...body, role: 'admin' }).expect(400);

    expect((response.body as ProblemDetails).errors).toContainEqual({
      field: 'role',
      message: 'property role should not exist',
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it('returns field errors for invalid input', async () => {
    const response = await register({ email: 'nope', password: 'short', name: '' }).expect(400);

    const problem = response.body as ProblemDetails;
    expect(problem.code).toBe('validation-error');
    expect(new Set(problem.errors?.map((error) => error.field))).toEqual(
      new Set(['email', 'password', 'name']),
    );
  });
});
