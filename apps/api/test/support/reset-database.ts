import type { PrismaClient } from '../../src/generated/prisma/client.js';

// Приводит тестовую БД в известное состояние: пустые таблицы, схема и история миграций на месте.
// Вызывается в beforeEach тех e2e-файлов, которые читают или пишут данные: каждый тест
// начинает с чистого листа и не зависит от того, что оставили тесты до него.
//
// Почему TRUNCATE, а не откат транзакции после каждого теста: приложение берёт соединения
// из своего пула и само открывает транзакции, а тест конкурентности (M4) должен видеть
// настоящие закоммиченные параллельные вставки. Откат транзакции этого не позволяет.
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Список таблиц берём из каталога Postgres, а не держим вручную: новая таблица
  // из следующей миграции очищается автоматически. _prisma_migrations не трогаем —
  // иначе Prisma решит, что миграции не применены.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) {
    return;
  }

  // Имена из системного каталога, не из пользовательского ввода, поэтому собирать SQL строкой
  // безопасно; кавычки — на случай имён, требующих квотирования.
  const tableList = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  // Одна команда на все таблицы: TRUNCATE сам учитывает FK между перечисленными таблицами.
  // CASCADE — страховка, RESTART IDENTITY сбрасывает счётчики автоинкремента, если появятся.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}
