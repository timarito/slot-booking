import { Prisma } from '../generated/prisma/client.js';

// Коды ошибок Prisma: https://www.prisma.io/docs/orm/reference/error-reference
// P2002 = нарушено ограничение уникальности (SQLSTATE 23505 в Postgres).
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Попытка записать значение, которое уже есть в UNIQUE-колонке.
 * Сервисы ловят её после INSERT, а не проверяют заранее через SELECT: проверка «найти, потом
 * вставить» пропускает два параллельных запроса, а уникальный индекс в БД — нет.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
