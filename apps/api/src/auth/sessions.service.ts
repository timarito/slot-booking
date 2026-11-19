import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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

/**
 * Сессии = выданные refresh-токены. Здесь будет вся работа с таблицей sessions:
 * создание при входе, ротация при refresh, отзов при логауте и при повторном использовании.
 */
@Injectable()
export class SessionsService {
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
    const expiresAt = new Date(Date.now() + this.ttlDays * DAY_MS);

    await this.prisma.session.create({
      data: { userId, tokenHash: hashRefreshToken(token), familyId: randomUUID(), expiresAt },
    });

    return { token, expiresAt };
  }
}
