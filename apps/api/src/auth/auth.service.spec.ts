import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/problem-details.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsService } from './sessions.service.js';

const publicUser = {
  id: '0193f0a0-0000-7000-8000-000000000001',
  email: 'bob@example.com',
  name: 'Bob',
  role: 'member',
  createdAt: new Date('2026-11-19T10:00:00Z'),
};

const refreshExpiresAt = new Date('2026-12-19T10:00:00Z');

// Подменяем все зависимости через DI (как в health.controller.spec.ts): сервис не знает, что
// они фейковые. Хешер фейковый, чтобы тест был быстрым и детерминированным — настоящий argon2
// проверяет свой тест. Каждый тест переопределяет только то, что ему важно.
async function createService(
  overrides: {
    create?: (args: unknown) => Promise<unknown>;
    findUnique?: (args: unknown) => Promise<unknown>;
    verify?: (hash: string | undefined, password: string) => Promise<boolean>;
    rotate?: (token: string) => Promise<unknown>;
    findUserById?: (args: unknown) => Promise<unknown>;
  } = {},
) {
  const fakes = {
    create: vi.fn(overrides.create ?? (() => Promise.resolve(publicUser))),
    findUnique: vi.fn(overrides.findUnique ?? (() => Promise.resolve(null))),
    verify: vi.fn(overrides.verify ?? (() => Promise.resolve(false))),
    signAsync: vi.fn((payload: object) => Promise.resolve(`jwt:${JSON.stringify(payload)}`)),
    createSession: vi.fn((_userId: string) =>
      Promise.resolve({ token: 'refresh-token', expiresAt: refreshExpiresAt }),
    ),
    rotate: vi.fn(overrides.rotate ?? (() => Promise.resolve(null))),
    findUserById: vi.fn(overrides.findUserById ?? (() => Promise.resolve(publicUser))),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      {
        provide: PrismaService,
        useValue: {
          user: {
            create: fakes.create,
            findUnique: fakes.findUnique,
            findUniqueOrThrow: fakes.findUserById,
          },
        },
      },
      {
        provide: PasswordHasher,
        useValue: { hash: (p: string) => Promise.resolve(`hashed:${p}`), verify: fakes.verify },
      },
      { provide: JwtService, useValue: { signAsync: fakes.signAsync } },
      {
        provide: SessionsService,
        useValue: { create: fakes.createSession, rotate: fakes.rotate },
      },
    ],
  }).compile();

  return { service: moduleRef.get(AuthService), ...fakes };
}

describe('AuthService.register', () => {
  const input = { email: 'bob@example.com', password: 'password1', name: 'Bob' };

  it('stores the password hash, never the plain password, and always as a member', async () => {
    const { service, create } = await createService();

    await service.register(input);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: 'bob@example.com',
          passwordHash: 'hashed:password1',
          name: 'Bob',
          role: 'member',
        },
      }),
    );
  });

  it('selects only public fields, so the hash is never read back', async () => {
    const { service, create } = await createService();

    await expect(service.register(input)).resolves.toEqual(publicUser);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
    );
  });

  it('maps a unique violation to 409 email-taken', async () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = await createService({ create: () => Promise.reject(uniqueViolation) });

    const error = await service.register(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: 'email-taken', status: HttpStatus.CONFLICT });
  });

  // Другие ошибки БД — не «email занят»: их нельзя прятать за 409, пусть станут 500 и попадут в лог.
  it('rethrows any other database error unchanged', async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
      code: 'P2003',
      clientVersion: 'test',
    });
    const { service } = await createService({ create: () => Promise.reject(otherError) });

    await expect(service.register(input)).rejects.toBe(otherError);
  });
});

describe('AuthService.login', () => {
  const input = { email: 'bob@example.com', password: 'password1' };
  const storedUser = { ...publicUser, passwordHash: '$argon2id$stored' };

  it('returns an access token, the public user and a new refresh token', async () => {
    const { service, signAsync, createSession } = await createService({
      findUnique: () => Promise.resolve(storedUser),
      verify: () => Promise.resolve(true),
    });

    const result = await service.login(input);

    expect(signAsync).toHaveBeenCalledWith({ sub: publicUser.id, role: 'member' });
    expect(createSession).toHaveBeenCalledWith(publicUser.id);
    expect(result).toEqual({
      accessToken: `jwt:${JSON.stringify({ sub: publicUser.id, role: 'member' })}`,
      user: publicUser,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: refreshExpiresAt,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('checks the password against the stored hash', async () => {
    const { service, verify } = await createService({
      findUnique: () => Promise.resolve(storedUser),
      verify: () => Promise.resolve(true),
    });

    await service.login(input);

    expect(verify).toHaveBeenCalledWith('$argon2id$stored', 'password1');
  });

  it('rejects a wrong password with 401 invalid-credentials and opens no session', async () => {
    const { service, createSession } = await createService({
      findUnique: () => Promise.resolve(storedUser),
      verify: () => Promise.resolve(false),
    });

    await expect(service.login(input)).rejects.toMatchObject({
      code: 'invalid-credentials',
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  // Защита от тайминг-атаки: для неизвестного email проверка пароля всё равно выполняется
  // (хешер получает undefined и сверяет с фиктивным хешем), а ошибка та же, что для неверного пароля.
  it('still runs the password check for an unknown email and fails the same way', async () => {
    const { service, verify, createSession } = await createService({
      findUnique: () => Promise.resolve(null),
    });

    await expect(service.login(input)).rejects.toMatchObject({
      code: 'invalid-credentials',
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(verify).toHaveBeenCalledWith(undefined, 'password1');
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh', () => {
  const rotated = {
    userId: publicUser.id,
    token: 'rotated-refresh-token',
    expiresAt: refreshExpiresAt,
  };

  it('rotates the token and returns a new pair for the current user', async () => {
    const { service, rotate, findUserById } = await createService({
      rotate: () => Promise.resolve(rotated),
    });

    const result = await service.refresh('old-refresh-token');

    expect(rotate).toHaveBeenCalledWith('old-refresh-token');
    expect(findUserById).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: publicUser.id } }),
    );
    expect(result).toEqual({
      accessToken: `jwt:${JSON.stringify({ sub: publicUser.id, role: 'member' })}`,
      user: publicUser,
      refreshToken: 'rotated-refresh-token',
      refreshTokenExpiresAt: refreshExpiresAt,
    });
  });

  // Роль берётся из БД на момент refresh, а не переносится из старого access-токена.
  it('signs the access token with the role read from the database', async () => {
    const { service, signAsync } = await createService({
      rotate: () => Promise.resolve(rotated),
      findUserById: () => Promise.resolve({ ...publicUser, role: 'admin' }),
    });

    await service.refresh('old-refresh-token');

    expect(signAsync).toHaveBeenCalledWith({ sub: publicUser.id, role: 'admin' });
  });

  it('rejects a token that cannot be rotated with 401 refresh-token-invalid', async () => {
    const { service, signAsync } = await createService({ rotate: () => Promise.resolve(null) });

    await expect(service.refresh('revoked-token')).rejects.toMatchObject({
      code: 'refresh-token-invalid',
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects a missing cookie without touching sessions', async () => {
    const { service, rotate } = await createService();

    await expect(service.refresh(undefined)).rejects.toMatchObject({
      code: 'refresh-token-invalid',
    });
    expect(rotate).not.toHaveBeenCalled();
  });
});
