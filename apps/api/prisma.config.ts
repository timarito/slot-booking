// Prisma CLI config (migrate, generate, studio). Used by tooling only, never at app runtime.
// Since Prisma 7 the CLI does not read .env by itself, hence the explicit dotenv import.
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
