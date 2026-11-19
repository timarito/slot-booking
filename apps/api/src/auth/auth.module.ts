import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsService } from './sessions.service.js';

// PrismaService не импортируем: PrismaModule глобальный (см. prisma.module.ts).
// Провайдеры не экспортируются: пока никто вне модуля auth в них не нуждается.
@Module({
  imports: [
    // registerAsync — потому что секрет и срок берутся из провалидированного конфига.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          // HS256 — HMAC с общим секретом: токены выпускает и проверяет один и тот же сервис.
          // Асимметричный RS256/ES256 нужен, когда проверять токены должны другие сервисы.
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_TTL_MINUTES', { infer: true }) * 60,
        },
        // Явный список при проверке: токен с другим alg (например, 'none') будет отклонён.
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher, SessionsService],
})
export class AuthModule {}
