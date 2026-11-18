import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { createValidationPipe } from './common/errors/validation.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Root module: the top of the dependency graph. Nest walks `imports` recursively at startup,
// creates every provider once (singletons) and injects them where needed.
@Module({
  imports: [
    // Reads .env + process.env, validates it once at boot, exposes ConfigService globally.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    // Global filter and pipe are registered here, not with app.useGlobalFilters() in main.ts:
    // - they become part of AppModule, so e2e tests (which boot AppModule, not main.ts) get them;
    // - they are created by DI, so they can inject services later (e.g. a logger).
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
