import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/problem-details.js';
import { UserRole } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { USER_DTO_SELECT, type UserDto } from './dto/user.dto.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsService } from './sessions.service.js';

/** Claims access-токена (spec.md, 5.1): `sub` — id пользователя (стандартный claim RFC 7519). */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  user: UserDto;
  /** Уходит в cookie, не в тело ответа: это решает контроллер. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
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

  /**
   * Проверяет учётные данные и открывает новую сессию.
   * Неверный email и неверный пароль неотличимы ни по ответу, ни по времени (spec.md, 5.1).
   */
  async login({ email, password }: LoginDto): Promise<LoginResult> {
    const found = await this.prisma.user.findUnique({
      where: { email },
      // Единственное место, где хеш читается из БД: он нужен для проверки и дальше не уходит.
      select: { ...USER_DTO_SELECT, passwordHash: true },
    });

    // Проверка выполняется ВСЕГДА, даже если пользователь не найден (см. PasswordHasher.verify):
    // ранний `if (!found) throw` вернул бы ответ в десятки раз быстрее и выдал бы,
    // что такого email нет.
    const passwordMatches = await this.passwordHasher.verify(found?.passwordHash, password);
    if (!found || !passwordMatches) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'invalid-credentials', {
        title: 'Invalid credentials',
        detail: 'The email or password is incorrect.',
      });
    }

    const { passwordHash: _passwordHash, ...user } = found;
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    const refresh = await this.sessions.create(user.id);

    return {
      accessToken,
      user,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }
}
