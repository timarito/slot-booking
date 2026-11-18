import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// A feature module groups everything for one area (controllers + services).
// Future modules follow the same shape: auth/, resources/, bookings/.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
