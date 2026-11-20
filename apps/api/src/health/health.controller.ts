import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { problemResponse } from '../common/errors/problem-details.schema.js';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthStatusDto } from './health-status.dto.js';

// Health check для Docker, оркестраторов и балансировщиков: «может ли этот инстанс принимать трафик?»
// Проверяет БД, потому что API без своей БД бесполезен: балансировщик должен перестать слать
// сюда запросы. Намеренно дешёвый: его могут вызывать каждые несколько секунд.
// Публичный: Docker и балансировщик не имеют токенов.
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  // Внедрение через конструктор: Nest видит тип PrismaService (через метаданные декораторов)
  // и передаёт единственный общий экземпляр. Сравни с provide/inject во Vue: здесь зависимость
  // находится автоматически по типу и связывается при старте.
  constructor(private readonly prisma: PrismaService) {}

  // Swagger не видит тип возвращаемого значения в рантайме (Promise<T> стирается), поэтому
  // ответы описываются декораторами явно. 503 указан отдельно: это ожидаемый ответ, а не сбой.
  @Get()
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiServiceUnavailableResponse(problemResponse('The database is unreachable.'))
  async check(): Promise<HealthStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 = «временно не могу обслуживать» — общепринятый статус для упавшего health check.
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
