import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Health check для Docker, оркестраторов и балансировщиков: «может ли этот инстанс принимать трафик?»
// Проверяет БД, потому что API без своей БД бесполезен: балансировщик должен перестать слать
// сюда запросы. Намеренно дешёвый: его могут вызывать каждые несколько секунд.
@Controller('health')
export class HealthController {
  // Внедрение через конструктор: Nest видит тип PrismaService (через метаданные декораторов)
  // и передаёт единственный общий экземпляр. Сравни с provide/inject во Vue: здесь зависимость
  // находится автоматически по типу и связывается при старте.
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 = «временно не могу обслуживать» — общепринятый статус для упавшего health check.
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
