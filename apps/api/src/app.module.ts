import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}
