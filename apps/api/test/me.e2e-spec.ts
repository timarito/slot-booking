import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { LoginResponseDto } from '../src/auth/dto/login-response.dto.js';
import type { ProblemDetails } from '../src/common/errors/problem-details.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { refreshCookie } from './support/refresh-cookie.js';
import { resetDatabase } from './support/reset-database.js';

const credentials = { email: 'bob@example.com', password: 'password1' };

describe('GET /me (e2e)', () => {
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

  const login = async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    return {
      ...(response.body as LoginResponseDto),
      refreshToken: refreshCookie(response.headers['set-cookie']).value,
    };
  };

  const me = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/me');
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  const expectUnauthorized = (body: unknown) => {
    expect(body).toMatchObject<Partial<ProblemDetails>>({
      status: 401,
      code: 'unauthorized',
      instance: '/me',
    });
  };

  it('returns the current user for a valid access token', async () => {
    const { accessToken, user } = await login();

    const response = await me(`Bearer ${accessToken}`).expect(200);

    expect(response.body).toEqual(user);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('returns 401 Problem Details without a token', async () => {
    const response = await me()
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expectUnauthorized(response.body);
  });

  it('returns 401 for an expired access token', async () => {
    const { user } = await login();
    const expired = await jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn: -1 });

    expectUnauthorized((await me(`Bearer ${expired}`).expect(401)).body);
  });

  // Refresh-токен — непрозрачная строка, не JWT: подсунуть его вместо access не выйдет.
  it('returns 401 when the refresh token is sent as a bearer token', async () => {
    const { refreshToken } = await login();

    expectUnauthorized((await me(`Bearer ${refreshToken}`).expect(401)).body);
  });

  it('returns 401 when the user was deleted while the token is still valid', async () => {
    const { accessToken, user } = await login();
    await prisma.user.delete({ where: { id: user.id } });

    expectUnauthorized((await me(`Bearer ${accessToken}`).expect(401)).body);
  });

  // Регрессия на «безопасно по умолчанию»: глобальный guard не должен закрыть публичные маршруты.
  it('keeps public routes open without a token', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).post('/auth/refresh').expect(401); // свой 401, не от guard'а
  });
});
