import type { CookieOptions, Request } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';
/** Имя security scheme в OpenAPI (openapi.ts) для эндпоинтов, которые читают refresh-cookie. */
export const REFRESH_COOKIE_SECURITY = 'refresh-cookie';

/**
 * Флаги cookie с refresh-токеном (spec.md, 5.1). Каждый закрывает свою атаку:
 * - httpOnly — JS на странице не видит cookie: XSS не может украсть долгоживущий токен;
 * - secure — только по HTTPS (браузеры делают исключение для http://localhost, так что dev работает);
 * - sameSite: 'strict' — браузер не отправит cookie с чужого сайта: защита от CSRF на /auth/refresh;
 * - path: '/auth' — cookie уходит только на /auth/*, а не с каждым запросом к API:
 *   меньше мест, где токен может засветиться (логи прокси, чужие эндпоинты).
 * Срок жизни cookie совпадает со сроком сессии в БД.
 */
export function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/auth',
    expires: expiresAt,
  };
}

/**
 * Значение refresh-cookie из запроса (req.cookies заполняет cookie-parser).
 * В типах Express это Record<string, any>, поэтому проверяем, что пришла именно строка:
 * пустая или «не та» cookie считается отсутствующей.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE_NAME
  ];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
