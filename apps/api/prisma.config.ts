// Конфиг Prisma CLI (migrate, generate, studio). Используется только инструментами,
// в рантайме приложения не участвует.
// С Prisma 7 CLI сам не читает .env, поэтому dotenv импортируется явно.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
