import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/problem-details.js';
import { UserRole } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import { USER_DTO_SELECT, type UserDto } from './dto/user.dto.js';
import { PasswordHasher } from './password-hasher.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  /**
   * Создаёт участника. email и name уже нормализованы DTO (trim, lower case).
   * Занятый email → 409 `email-taken` (spec.md, 5.1).
   */
  async register({ email, password, name }: RegisterDto): Promise<UserDto> {
    // Хешируем до обращения к БД: хеш дорогой (~десятки мс), но транзакцию он не держит.
    const passwordHash = await this.passwordHasher.hash(password);

    // Нет предварительного «SELECT по email»: два параллельных запроса с одним email оба
    // увидели бы «свободно». Решает уникальный индекс users_email_key, а мы переводим его
    // ошибку в доменную. Бонус: на один запрос к БД меньше.
    try {
      return await this.prisma.user.create({
        // Роль задаём явно, а не полагаемся на DEFAULT в БД: правило «регистрация всегда
        // создаёт member» видно в коде, а дефолт — вторая линия обороны.
        data: { email, passwordHash, name, role: UserRole.member },
        select: USER_DTO_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(HttpStatus.CONFLICT, 'email-taken', {
          title: 'Email already registered',
          detail: 'An account with this email already exists.',
        });
      }
      throw error;
    }
  }
}
