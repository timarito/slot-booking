import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { AccessTokenPayload } from '../src/auth/auth.service.js';
import type { LoginResponseDto } from '../src/auth/dto/login-response.dto.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import type { ProblemDetails } from '../src/common/errors/problem-details.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

const credentials = { email: 'bob@example.com', password: 'password1' };

/** Достаёт cookie с refresh-токеном из заголовков ответа: значение и атрибуты по отдельности. */
function refreshCookie(setCookie: string[] | string | undefined) {
  const header = [setCookie ?? []].flat().find((cookie) => cookie.startsWith('refresh_token='));
  if (header === undefined) {
    throw new Error('refresh_token cookie was not set');
  }
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  return { value: pair.slice('refresh_token='.length), attributes };
}

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  // Каждый тест — с чистой БД и одним зарегистрированным пользователем, созданным через API:
  // так тест не зависит от внутреннего устройства регистрации (хеширования и т. п.).
  beforeEach(async () => {
    await resetDatabase(prisma);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, name: 'Bob' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (payload: object) => request(app.getHttpServer()).post('/auth/login').send(payload);

  it('returns 200 with an access token and the public user', async () => {
    const response = await login(credentials).expect(200);

    const body = response.body as LoginResponseDto;
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'user']);
    expect(body.user).toMatchObject({ email: 'bob@example.com', name: 'Bob', role: 'member' });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('issues an HS256 access token with sub and role that lives 15 minutes', async () => {
    const response = await login(credentials).expect(200);
    const { accessToken, user } = response.body as LoginResponseDto;

    // verifyAsync проверяет подпись нашим секретом и срок — так же, как будет делать guard.
    const payload = await jwt.verifyAsync<AccessTokenPayload & { iat: number; exp: number }>(
      accessToken,
    );
    expect(payload).toMatchObject({ sub: user.id, role: 'member' });
    expect(payload.exp - payload.iat).toBe(15 * 60);

    const [header = ''] = accessToken.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({
      alg: 'HS256',
    });
  });

  it('sets the refresh token in a hardened cookie, not in the body', async () => {
    const response = await login(credentials).expect(200);

    const cookie = refreshCookie(response.headers['set-cookie']);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.attributes).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']),
    );
    expect(cookie.attributes.some((attribute) => attribute.startsWith('Expires='))).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(cookie.value);
  });

  it('stores only the SHA-256 hash of the refresh token in a new session', async () => {
    const response = await login(credentials).expect(200);
    const cookie = refreshCookie(response.headers['set-cookie']);

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session?.tokenHash).toBe(hashRefreshToken(cookie.value));
    expect(session?.tokenHash).not.toBe(cookie.value);
    expect(session?.revokedAt).toBeNull();

    const ttlDays = ((session?.expiresAt.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeCloseTo(30, 1);
  });

  it('opens a separate session (new token family) for every login', async () => {
    await login(credentials).expect(200);
    await login(credentials).expect(200);

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((session) => session.familyId)).size).toBe(2);
  });

  it('accepts the email in any case and with surrounding spaces', async () => {
    await login({ ...credentials, email: '  BOB@Example.com ' }).expect(200);
  });

  // Ответы на «неверный пароль» и «нет такого email» должны быть побайтно одинаковыми,
  // иначе по ним можно выяснить, зарегистрирован ли email.
  it('returns the same 401 invalid-credentials for a wrong password and an unknown email', async () => {
    const wrongPassword = await login({ ...credentials, password: 'wrong-password' }).expect(401);
    const unknownEmail = await login({ ...credentials, email: 'nobody@example.com' }).expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toMatchObject({ code: 'invalid-credentials', status: 401 });
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it('returns field errors for a missing email and password', async () => {
    const response = await login({}).expect(400);

    const problem = response.body as ProblemDetails;
    expect(problem.code).toBe('validation-error');
    expect(new Set(problem.errors?.map((error) => error.field))).toEqual(
      new Set(['email', 'password']),
    );
  });
});
