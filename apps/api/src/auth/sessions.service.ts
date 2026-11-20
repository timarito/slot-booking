import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  /** Сам токен: отдаётся клиенту один раз (в cookie) и больше нигде не хранится. */
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

/**
 * Сессии = выданные refresh-токены. Здесь будет вся работа с таблицей sessions:
 * создание при входе, ротация при refresh, отзов при логауте и при повторном использовании.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  /** Новый вход = новая семья токенов. */
  async create(userId: string): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const expiresAt = this.expiresAtFrom(new Date());

    await this.prisma.session.create({
      data: { userId, tokenHash: hashRefreshToken(token), familyId: randomUUID(), expiresAt },
    });

    return { token, expiresAt };
  }

  /**
   * Ротация (spec.md, 5.1): предъявленный токен отзывается, взамен выдаётся новый в той же семье.
   * Возвращает null, если токен нельзя обменять: неизвестен, истёк или уже отозван.
   * Отозванный токен, предъявленный снова, — признак кражи: отзываем всю семью.
   * Почему null, а не исключение: причину отказа клиенту не раскрываем (ответ один — 401),
   * а решение «как ответить по HTTP» принимает AuthService.
   */
  async rotate(token: string): Promise<RotatedRefreshToken | null> {
    const tokenHash = hashRefreshToken(token);
    const now = new Date();

    // Транзакция: «отозвать старый» и «создать новый» происходят вместе или никак.
    // Если создание нового упадёт, старый не останется отозванным — пользователь не потеряет сессию.
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Условный UPDATE — защита от гонки. Нельзя «сначала SELECT, проверить revokedAt, потом UPDATE»:
      // два параллельных запроса с одним токеном оба увидели бы «не отозван» и оба получили бы
      // новый токен — семья раздвоилась бы. UPDATE берёт блокировку строки, второй запрос ждёт,
      // затем Postgres перепроверяет WHERE уже по свежей версии строки (READ COMMITTED),
      // видит revoked_at IS NOT NULL и обновляет 0 строк. Победитель ровно один.
      const { count } = await tx.session.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });

      const session = await tx.session.findUnique({
        where: { tokenHash },
        select: { userId: true, familyId: true, revokedAt: true },
      });

      if (count === 1 && session) {
        const issued = generateRefreshToken();
        const expiresAt = this.expiresAtFrom(now);
        await tx.session.create({
          data: {
            userId: session.userId,
            tokenHash: hashRefreshToken(issued),
            familyId: session.familyId,
            expiresAt,
          },
        });
        return { kind: 'rotated', userId: session.userId, token: issued, expiresAt } as const;
      }

      // Отозван раньше, чем пришёл этот запрос (ротацией, логаутом или прошлой кражей).
      if (session?.revokedAt) {
        return { kind: 'reused', familyId: session.familyId, userId: session.userId } as const;
      }

      // Неизвестный или истёкший токен: просто отказ, семью не трогаем.
      return { kind: 'invalid' } as const;
    });

    if (outcome.kind === 'rotated') {
      const { kind: _kind, ...rotated } = outcome;
      return rotated;
    }

    if (outcome.kind === 'reused') {
      // Отзыв семьи — ОТДЕЛЬНО от транзакции выше и после её коммита. Если бы отзыв шёл внутри
      // транзакции, а следом бросалось исключение (401), откат отменил бы и отзыв: вор продолжил бы
      // пользоваться своей веткой токенов. Здесь же отзыв фиксируется независимо от ответа.
      await this.revokeFamily(outcome.familyId, now);
      // Событие безопасности: в лог, чтобы его можно было найти и расследовать. Токен не пишем.
      this.logger.warn(
        { userId: outcome.userId, familyId: outcome.familyId },
        'Refresh token reuse detected, token family revoked',
      );
    }

    return null;
  }

  /**
   * Логаут: отзывает семью, к которой принадлежит токен. Неизвестный токен — не ошибка:
   * логаут идемпотентен (spec.md, 5.1), повтор или «чужая» cookie просто ничего не меняют.
   * Состояние токена (истёк, отозван) не важно: семья в любом случае должна перестать работать.
   */
  async revokeFamilyOf(token: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      select: { familyId: true },
    });
    if (session) {
      await this.revokeFamily(session.familyId, new Date());
    }
  }

  /** Отзывает все ещё действующие токены семьи. Уже отозванные не трогаем: их revokedAt — история. */
  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  // Скользящий срок: каждая ротация продлевает сессию на полный TTL от момента выдачи
  // (spec.md, 3.2: expiresAt = время создания + TTL). Активный пользователь не разлогинивается,
  // неактивный дольше TTL — разлогинивается.
  private expiresAtFrom(issuedAt: Date): Date {
    return new Date(issuedAt.getTime() + this.ttlDays * DAY_MS);
  }
}
