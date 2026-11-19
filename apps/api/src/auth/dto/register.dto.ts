import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { toNormalizedEmail } from '../normalize-email.js';

// @Transform выполняется ДО валидации (ValidationPipe сначала превращает JSON в экземпляр класса),
// поэтому проверки длины видят уже нормализованное значение: имя из одних пробелов станет ''
// и не пройдёт @MinLength(1). Нестроковое значение пропускаем как есть — его отклонит @IsString.
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'bob@example.com', maxLength: 254 })
  @Transform(toNormalizedEmail)
  @IsEmail()
  // 254 — практический максимум длины адреса (RFC 5321: путь до 256 октетов минус <>).
  // @IsEmail (validator.js) уже отклоняет более длинные адреса; @MaxLength делает лимит явным
  // и добавляет клиенту понятное сообщение «слишком длинный» вместо просто «невалидный email».
  @MaxLength(254)
  email: string;

  // Пароль НЕ обрезаем: пробелы по краям — часть пароля, который выбрал пользователь.
  // Верхняя граница защищает от DoS: хешировать мегабайтную строку дорого.
  @ApiProperty({ minLength: 8, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Bob', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
