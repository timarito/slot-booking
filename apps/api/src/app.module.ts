import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { createValidationPipe } from './common/errors/validation.js';
import { type EnvironmentVariables, validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { buildPinoHttpOptions } from './logging/logger.config.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Корневой модуль — вершина графа зависимостей. При старте Nest рекурсивно обходит `imports`,
// создаёт каждый провайдер один раз (синглтоны) и внедряет их туда, где они нужны.
@Module({
  imports: [
    // Читает .env и process.env, один раз валидирует при старте, отдаёт ConfigService глобально.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // pino-http middleware + логгер, который через AsyncLocalStorage знает текущий запрос:
    // любой `new Logger(...)` из @nestjs/common внутри запроса пишет строки с его req.id.
    // forRootAsync — потому что настройки зависят от провалидированного конфига.
    // Подключается только здесь: повторный импорт в feature-модуле задвоил бы логи запросов.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: buildPinoHttpOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
      }),
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    // Глобальные фильтр и pipe подключены здесь, а не через app.useGlobalFilters() в main.ts:
    // - они становятся частью AppModule, поэтому e2e-тесты (поднимают AppModule, а не main.ts)
    //   их получают;
    // - их создаёт DI, значит, позже они смогут внедрять сервисы (например, логгер).
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
