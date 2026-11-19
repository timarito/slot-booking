import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client.js';

/**
 * Публичное представление пользователя. Отдельный класс, а не модель Prisma:
 * в ответ попадают только перечисленные поля, passwordHash наружу не уходит никогда.
 */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'bob@example.com' })
  email: string;

  @ApiProperty({ example: 'Bob' })
  name: string;

  // enumName: в спецификации enum станет отдельной именованной схемой, и фронтенд получит
  // тип `UserRole`, а не анонимный union в каждом месте использования.
  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role: UserRole;

  // Date сериализуется в JSON как ISO 8601 в UTC (Date.prototype.toJSON).
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

/**
 * Поля для `select` в запросах Prisma. Выбираем их на уровне SQL, а не вырезаем после:
 * хеш пароля даже не читается из БД, поэтому случайно вернуть его клиенту невозможно.
 * `satisfies` проверяет, что ключи совпадают с полями UserDto.
 */
export const USER_DTO_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const satisfies Record<keyof UserDto, true>;
