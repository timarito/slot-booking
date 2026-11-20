import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cookieHeader, refreshCookie } from './support/refresh-cookie.js';
import { resetDatabase } from './support/reset-database.js';

const credentials = { email: 'bob@example.com', password: 'password1' };

describe('POST /auth/logout (e2e)', () => {
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
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, name: 'Bob' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = async (): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    return refreshCookie(response.headers['set-cookie']).value;
  };

  const withCookie = (path: string, refreshToken?: string) => {
    const req = request(app.getHttpServer()).post(path);
    return refreshToken === undefined ? req : req.set('Cookie', cookieHeader(refreshToken));
  };
  const logout = (refreshToken?: string) => withCookie('/auth/logout', refreshToken);
  const refresh = (refreshToken: string) => withCookie('/auth/refresh', refreshToken);

  /** Ответ должен стереть cookie: пустое значение, тот же Path, Expires в прошлом. */
  const expectCookieCleared = (setCookie: string[] | string | undefined) => {
    const cookie = refreshCookie(setCookie);
    expect(cookie.value).toBe('');
    expect(cookie.attributes).toEqual(expect.arrayContaining(['Path=/auth', 'HttpOnly', 'Secure']));
    const expires = cookie.attributes.find((attribute) => attribute.startsWith('Expires='));
    expect(new Date(expires?.slice('Expires='.length) ?? '').getTime()).toBeLessThan(Date.now());
  };

  it('returns 204 with no body and clears the refresh cookie', async () => {
    const token = await login();

    const response = await logout(token).expect(204);

    expect(response.text).toBe('');
    expectCookieCleared(response.headers['set-cookie']);
  });

  it('makes the refresh token unusable', async () => {
    const token = await login();

    await logout(token).expect(204);

    await refresh(token).expect(401);
  });

  // Логаут завершает сессию устройства целиком: старые токены семьи уже отозваны ротацией,
  // а текущий — логаутом. Сессии других устройств (других входов) продолжают работать.
  it('revokes the whole family of the token and nothing else', async () => {
    const first = await login();
    const rotated = refreshCookie((await refresh(first).expect(200)).headers['set-cookie']).value;
    const otherDevice = await login();

    await logout(rotated).expect(204);

    const family = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(first) },
      select: { familyId: true },
    });
    expect(
      await prisma.session.count({ where: { familyId: family.familyId, revokedAt: null } }),
    ).toBe(0);
    await refresh(otherDevice).expect(200);
  });

  // Идемпотентность: повторный логаут, логаут без cookie или с мусором — тот же успешный ответ.
  // Клиенту не нужно разбирать ошибки, чтобы просто выйти.
  it('is idempotent: repeating it with the same token still returns 204', async () => {
    const token = await login();

    await logout(token).expect(204);
    const again = await logout(token).expect(204);

    expectCookieCleared(again.headers['set-cookie']);
  });

  it('returns 204 and clears the cookie without a refresh cookie', async () => {
    const response = await logout().expect(204);

    expectCookieCleared(response.headers['set-cookie']);
  });

  it('returns 204 for an unknown token and changes no sessions', async () => {
    await login();

    await logout('not-a-real-token').expect(204);

    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });
});
