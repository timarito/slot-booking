-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'member');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Ручная часть: Prisma не умеет описывать CHECK в схеме (см. комментарий над model User).
-- Email уникален без учёта регистра за счёт нормализации в сервисе (trim + lower case).
-- CHECK — страховка: запись в другом регистре в обход сервиса отклоняется (SQLSTATE 23514),
-- иначе 'Bob@x.com' и 'bob@x.com' прошли бы обычный UNIQUE как разные значения.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
