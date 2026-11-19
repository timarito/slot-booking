import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh-токен — непрозрачная случайная строка, а не JWT (spec.md, 5.1): серверу не нужно
 * ничего из него читать, только найти сессию. 32 байта из CSPRNG = 256 бит энтропии,
 * угадать или перебрать такой токен невозможно. base64url — безопасен в cookie без экранирования.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * В БД хранится только этот хеш. SHA-256 детерминирован (без соли), поэтому сессию можно найти
 * запросом `WHERE token_hash = hashRefreshToken(cookie)`. Медленный хеш вроде argon2 здесь не нужен:
 * он защищает слабые пароли от перебора, а 256-битный случайный токен перебрать нельзя и так.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
