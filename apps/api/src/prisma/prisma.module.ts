import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global: БД нужна почти каждому feature-модулю, поэтому PrismaService доступен везде
// без импорта PrismaModule в каждый модуль. @Global стоит использовать редко —
// инфраструктура (БД, конфиг, логгер) — типичный оправданный случай.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
