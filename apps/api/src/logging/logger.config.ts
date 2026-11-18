import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { genReqId } from './request-id.js';

type LoggerEnv = Pick<EnvironmentVariables, 'NODE_ENV' | 'LOG_LEVEL'>;

/**
 * Настройки pino-http: middleware, которое создаёт логгер на каждый запрос и пишет строку
 * «request completed» с методом, путём, статусом и временем ответа.
 *
 * Почему pino: пишет JSON (одна строка = одно событие, удобно искать и фильтровать в системах
 * сбора логов) и делает это быстро. Форматирование для человека (pino-pretty) — только в dev.
 */
export function buildPinoHttpOptions(env: LoggerEnv): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId,

    // Уровень строки «request completed» по статусу: 5xx — наша ошибка, 4xx — стоит заметить,
    // остальное — обычная работа. Так в проде можно смотреть только error и не тонуть в шуме.
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    // Health check дёргают каждые несколько секунд — в логе он только шум.
    autoLogging: {
      ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
    },

    // Секреты не должны попадать в логи: логи читает больше людей и систем, чем БД,
    // и хранятся они дольше. Токены и cookie заменяются на "[Redacted]".
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],

    // В dev — читаемый цветной вывод в одну строку. В проде pino-pretty не используется:
    // он медленный, а JSON нужен системе сбора логов. Поэтому pino-pretty — devDependency.
    ...(env.NODE_ENV === NodeEnv.Development && {
      transport: { target: 'pino-pretty', options: { singleLine: true } },
    }),
  };
}
