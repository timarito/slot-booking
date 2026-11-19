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
import { cookieHeader, refreshCookie } from './support/refresh-cookie.js';
import { resetDatabase } from './support/reset-database.js';

const credentials = { email: 'bob@example.com', password: 'password1' };

describe('POST /auth/refresh (e2e)', () => {
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

  /** Вход через API; возвращает refresh-токен из cookie. */
  const login = async (): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    return refreshCookie(response.headers['set-cookie']).value;
  };

  const refresh = (refreshToken?: string) => {
    const req = request(app.getHttpServer()).post('/auth/refresh');
    return refreshToken === undefined ? req : req.set('Cookie', cookieHeader(refreshToken));
  };

  const sessionOf = (refreshToken: string) =>
    prisma.session.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(refreshToken) } });

  const expectInvalidRefresh = (body: unknown) => {
    expect(body).toMatchObject({
      code: 'refresh-token-invalid',
      status: 401,
    } satisfies Partial<ProblemDetails>);
  };

  it('returns a new access token and the user, like login', async () => {
    const token = await login();

    const response = await refresh(token).expect(200);

    const body = response.body as LoginResponseDto;
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'user']);
    expect(body.user).toMatchObject({ email: 'bob@example.com', role: 'member' });
    const payload = await jwt.verifyAsync<AccessTokenPayload>(body.accessToken);
    expect(payload).toMatchObject({ sub: body.user.id, role: 'member' });
  });

  it('rotates the refresh token: revokes the old one, issues a new one in the same family', async () => {
    const oldToken = await login();

    const response = await refresh(oldToken).expect(200);
    const cookie = refreshCookie(response.headers['set-cookie']);

    expect(cookie.value).not.toBe(oldToken);
    expect(cookie.attributes).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']),
    );
    const [oldSession, newSession] = await Promise.all([
      sessionOf(oldToken),
      sessionOf(cookie.value),
    ]);
    expect(oldSession.revokedAt).not.toBeNull();
    expect(newSession.revokedAt).toBeNull();
    expect(newSession.familyId).toBe(oldSession.familyId);
    // Скользящий срок: новый токен живёт полный TTL от момента ротации.
    expect(newSession.expiresAt.getTime()).toBeGreaterThan(oldSession.expiresAt.getTime());
  });

  it('keeps working along a chain of rotations', async () => {
    let token = await login();
    for (let i = 0; i < 3; i++) {
      const response = await refresh(token).expect(200);
      token = refreshCookie(response.headers['set-cookie']).value;
    }

    expect(await prisma.session.count()).toBe(4);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('puts the current role into the new access token', async () => {
    const token = await login();
    await prisma.user.update({ where: { email: credentials.email }, data: { role: 'admin' } });

    const response = await refresh(token).expect(200);

    const { accessToken } = response.body as LoginResponseDto;
    expect(await jwt.verifyAsync<AccessTokenPayload>(accessToken)).toMatchObject({ role: 'admin' });
  });

  // Сценарий кражи: вор и пользователь владеют одним токеном. Кто-то из них ротирует его первым;
  // когда второй предъявит уже отозванный токен, сервер не знает, кто из них вор, — поэтому
  // отзывает всю семью, и новый токен победителя тоже перестаёт работать.
  it('revokes the whole family when a rotated token is used again', async () => {
    const stolen = await login();
    const response = await refresh(stolen).expect(200);
    const fresh = refreshCookie(response.headers['set-cookie']).value;

    const reuse = await refresh(stolen).expect(401);

    expectInvalidRefresh(reuse.body);
    expect(reuse.headers['set-cookie']).toBeUndefined();
    expect((await sessionOf(fresh)).revokedAt).not.toBeNull();
    expectInvalidRefresh((await refresh(fresh).expect(401)).body);
  });

  it('revokes only the affected family, other logins stay valid', async () => {
    const stolen = await login();
    const otherDevice = await login();
    await refresh(stolen).expect(200);

    await refresh(stolen).expect(401);

    await refresh(otherDevice).expect(200);
  });

  it('rejects an expired token without touching its family', async () => {
    const token = await login();
    await prisma.session.update({
      where: { tokenHash: hashRefreshToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expectInvalidRefresh((await refresh(token).expect(401)).body);

    expect((await sessionOf(token)).revokedAt).toBeNull();
  });

  // Ответ один и тот же, что бы ни было не так: клиент не может отличить «нет такого токена»
  // от «токен истёк», а реакция в обоих случаях одна — войти заново.
  it('returns the same 401 for a missing cookie and an unknown token', async () => {
    const missing = await refresh().expect(401);
    const unknown = await refresh('not-a-real-token').expect(401);

    expectInvalidRefresh(missing.body);
    expect(unknown.body).toEqual(missing.body);
    expect(await prisma.session.count()).toBe(0);
  });

  // Две вкладки, один токен, запросы одновременно. Условный UPDATE пропускает ровно один;
  // второй видит уже отозванный токен — для сервера это неотличимо от кражи, и семья отзывается.
  // Поэтому спека требует от клиента дедуплицировать refresh (spec.md, 5.1). Тест фиксирует,
  // что гонка не создаёт две живые ветки семьи.
  it('lets exactly one of two concurrent refreshes with the same token win', async () => {
    const token = await login();

    const responses = await Promise.all([refresh(token), refresh(token)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });
});
