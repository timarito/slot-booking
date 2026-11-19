import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';

// PrismaService не импортируем: PrismaModule глобальный (см. prisma.module.ts).
// Провайдеры не экспортируются: пока никто вне модуля auth в них не нуждается.
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher],
})
export class AuthModule {}
