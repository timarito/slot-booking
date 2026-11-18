import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

// Один PrismaClient на процесс. Он владеет ПУЛОМ соединений (pg.Pool через адаптер):
// запрос берёт соединение на время выполнения SQL и возвращает его обратно.
// Если создавать клиент на каждый запрос, каждый раз будет новое TCP-соединение и аутентификация,
// и мы быстро упрёмся в max_connections Postgres (по умолчанию 100).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    // Prisma 7 работает с БД через «driver adapter» — здесь это драйвер node-postgres.
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }

  // Подключаемся сразу при старте: неверный DATABASE_URL уронит запуск, а не первого пользователя.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Закрываем пул при остановке (нужен app.enableShutdownHooks() в main.ts).
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
