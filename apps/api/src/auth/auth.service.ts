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
import { type IssuedRefreshToken, SessionsService } from './sessions.service.js';

/** Claims access-токена (spec.md, 5.1): `sub` — id пользователя (стандартный claim RFC 7519). */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

/** Результат входа и refresh: одинаковый набор — пара токенов и публичный пользователь. */
export interface AuthResult {
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
  async login({ email, password }: LoginDto): Promise<AuthResult> {
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
    return this.issueAccessToken(user, await this.sessions.create(user.id));
  }

  /**
   * Обменивает refresh-токен из cookie на новую пару токенов (ротация, spec.md, 5.1).
   * Любой отказ — нет cookie, неизвестный, истёкший, отозванный токен — даёт один и тот же
   * 401 `refresh-token-invalid`: клиенту (и вору) не нужно знать причину, реакция одна — войти заново.
   */
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    const rotated = refreshToken === undefined ? null : await this.sessions.rotate(refreshToken);
    if (!rotated) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'refresh-token-invalid', {
        title: 'Invalid refresh token',
        detail: 'The refresh token is missing, expired or revoked. Log in again.',
      });
    }

    // Пользователя читаем заново, а не берём из старого access-токена: если админ сменил роль,
    // новый access-токен получит актуальную. Строка точно есть: сессии удаляются каскадом вместе
    // с пользователем (onDelete: Cascade), поэтому findUniqueOrThrow — инвариант, а не ветка логики.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: rotated.userId },
      select: USER_DTO_SELECT,
    });
    return this.issueAccessToken(user, rotated);
  }

  private async issueAccessToken(user: UserDto, refresh: IssuedRefreshToken): Promise<AuthResult> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }
}
