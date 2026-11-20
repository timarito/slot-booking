import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/problem-details.js';
import type { AccessTokenPayload } from './auth.service.js';
import type { AuthenticatedRequest } from './current-user.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Достаёт токен из `Authorization: Bearer <token>` (RFC 6750, 2.1).
 * Имя схемы по RFC 9110 регистронезависимо, поэтому /i. Нет заголовка или другая схема — undefined.
 */
export function extractBearerToken(header: string | undefined): string | undefined {
  return /^Bearer +(\S+)$/i.exec(header ?? '')?.[1];
}

/**
 * Глобальный guard (APP_GUARD в AuthModule): каждый маршрут требует валидный access-токен,
 * кроме помеченных @Public().
 *
 * Проверка без похода в БД: подпись и срок доказывают, что токен выпустили мы не позже 15 минут
 * назад. В этом смысл JWT — масштабируется без общего хранилища. Цена: удалённый пользователь
 * или сменённая роль «доезжают» только после истечения токена (см. AuthService.logout).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Сначала метод, потом класс: @Public() можно повесить и на весь контроллер, и на один маршрут.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    // Нет токена, битая подпись, истёк, чужой alg — для клиента всё одно: обновить токен
    // или войти заново. Причину не раскрываем, как и в refresh.
    const payload = token === undefined ? undefined : await this.verify(token);
    if (!payload) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'unauthorized', {
        title: 'Unauthorized',
        detail: 'The access token is missing, invalid or expired.',
      });
    }

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private async verify(token: string): Promise<AccessTokenPayload | undefined> {
    try {
      // Алгоритм и секрет — из JwtModule.registerAsync (auth.module.ts): там же verifyOptions
      // с явным списком алгоритмов. Срок (exp) verifyAsync проверяет сам.
      return await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      return undefined;
    }
  }
}
