import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

// Собирает Nest-модуль с настоящим контроллером и фейковой БД. Вот что даёт DI:
// код контроллера не меняется, подменяется только провайдер, зарегистрированный как PrismaService.
async function createController(queryRaw: () => Promise<unknown>): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } }],
  }).compile();

  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns ok when the database answers', async () => {
    const controller = await createController(() => Promise.resolve([{ '?column?': 1 }]));

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
  });

  it('throws 503 when the database is unreachable', async () => {
    const controller = await createController(() =>
      Promise.reject(new Error('connect ECONNREFUSED')),
    );

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
