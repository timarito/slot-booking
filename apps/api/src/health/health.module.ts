import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// Feature-модуль объединяет всё, что относится к одной области (контроллеры + сервисы).
// Будущие модули устроены так же: auth/, resources/, bookings/.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
