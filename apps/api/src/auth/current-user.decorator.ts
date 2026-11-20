import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/client.js';

/** Кто делает запрос — то, что JwtAuthGuard достал из проверенного access-токена. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Запрос после JwtAuthGuard. Express-тип Request не знает про `user`, а глобально расширять его
 * (declaration merging) не хотим: тогда `req.user` «существовал» бы и в публичных маршрутах.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/**
 * `@CurrentUser() user: AuthUser` в параметрах обработчика. Контроллер не лезет в req сам:
 * ему не нужно знать, где guard хранит пользователя, а в тестах метод вызывается с обычным объектом.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
