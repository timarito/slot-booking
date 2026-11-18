import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { createValidationPipe } from './common/errors/validation.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Корневой модуль — вершина графа зависимостей. При старте Nest рекурсивно обходит `imports`,
// создаёт каждый провайдер один раз (синглтоны) и внедряет их туда, где они нужны.
@Module({
  imports: [
    // Читает .env и process.env, один раз валидирует при старте, отдаёт ConfigService глобально.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
