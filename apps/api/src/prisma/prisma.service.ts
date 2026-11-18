import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

// One PrismaClient per process. It owns a connection POOL (pg.Pool via the adapter):
// a request borrows a connection for the duration of a query and returns it.
// Creating a client per request would open a new TCP connection + auth handshake
// each time and quickly exhaust Postgres' max_connections (default 100).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    // Prisma 7 talks to the DB through a "driver adapter" — here the node-postgres driver.
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }

  // Connect eagerly at startup: a wrong DATABASE_URL fails the boot, not the first user.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Close the pool on shutdown (needs app.enableShutdownHooks() in main.ts).
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
