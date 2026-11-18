import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

// Builds a Nest module with the real controller and a fake DB. This is what DI buys us:
// the controller code is untouched, only the provider registered under PrismaService changes.
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
