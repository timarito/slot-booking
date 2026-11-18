import { ApiProperty } from '@nestjs/swagger';

// Тип ответа — класс, а не интерфейс: по нему @nestjs/swagger строит схему в спецификации.
export class HealthStatusDto {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';
}
