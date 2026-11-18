import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Health check for Docker/orchestrators/load balancers: "can this instance serve traffic?"
// It checks the DB because an API without its DB is useless — the balancer should stop
// routing requests here. Deliberately cheap: it may be called every few seconds.
@Controller('health')
export class HealthController {
  // Constructor injection: Nest sees the PrismaService type (via decorator metadata)
  // and passes the single shared instance. Compare: Vue's provide/inject, but resolved
  // automatically by type and wired at startup.
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 = "temporarily can't serve", the conventional status for a failed health check.
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
