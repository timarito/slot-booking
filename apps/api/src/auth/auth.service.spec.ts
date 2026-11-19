import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/problem-details.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';

const input = { email: 'bob@example.com', password: 'password1', name: 'Bob' };

const createdUser = {
  id: '0193f0a0-0000-7000-8000-000000000001',
  email: 'bob@example.com',
  name: 'Bob',
  role: 'member',
  createdAt: new Date('2026-11-19T10:00:00Z'),
};

// Подменяем БД и хешер через DI (как в health.controller.spec.ts): сервис не знает, что они фейковые.
// Хешер фейковый, чтобы тест был быстрым и детерминированным — настоящий argon2 проверяет свой тест.
async function createService(create: (args: unknown) => Promise<unknown>) {
  const userCreate = vi.fn(create);
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: { user: { create: userCreate } } },
      {
        provide: PasswordHasher,
        useValue: { hash: (p: string) => Promise.resolve(`hashed:${p}`) },
      },
    ],
  }).compile();

  return { service: moduleRef.get(AuthService), userCreate };
}

describe('AuthService.register', () => {
  it('stores the password hash, never the plain password, and always as a member', async () => {
    const { service, userCreate } = await createService(() => Promise.resolve(createdUser));

    await service.register(input);

    expect(userCreate).toHaveBeenCalledWith(
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
    const { service, userCreate } = await createService(() => Promise.resolve(createdUser));

    await expect(service.register(input)).resolves.toEqual(createdUser);
    expect(userCreate).toHaveBeenCalledWith(
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
    const { service } = await createService(() => Promise.reject(uniqueViolation));

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
    const { service } = await createService(() => Promise.reject(otherError));

    await expect(service.register(input)).rejects.toBe(otherError);
  });
});
