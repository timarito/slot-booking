import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global: almost every feature module needs the DB, so PrismaService is available
// everywhere without importing PrismaModule each time. Use @Global sparingly —
// infrastructure (DB, config, logger) is the typical legitimate case.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
