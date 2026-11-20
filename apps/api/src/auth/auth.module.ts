import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MeController } from './me.controller.js';
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
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    PasswordHasher,
    SessionsService,
    // APP_GUARD делает guard глобальным для всего приложения, где бы он ни был объявлен.
    // Объявлен здесь, потому что ему нужен JwtService этого модуля; через DI, а не
    // app.useGlobalGuards() в main.ts, — чтобы e2e-тесты (AppModule без main.ts) его получили.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule implements NestModule {
  // cookie-parser разбирает заголовок Cookie в req.cookies. Подключаем его middleware модуля,
  // а не app.use() в main.ts: e2e-тесты поднимают AppModule без main.ts и иначе его бы не получили.
  // Только для AuthController: cookie с Path=/auth и так приходит только сюда.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(AuthController);
  }
}
