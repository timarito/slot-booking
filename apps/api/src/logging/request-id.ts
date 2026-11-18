import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Входящий id принимаем, только если он «безопасный»: ограниченный набор символов и длина.
// Иначе клиент мог бы подсунуть в логи переводы строк (подделка записей лога) или мегабайтную строку.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Request id — сквозной идентификатор запроса: попадает в каждую строку лога этого запроса
 * и в заголовок ответа. По нему ошибку из жалобы пользователя или из лога прокси находят в наших логах.
 *
 * Если перед API стоит прокси или балансировщик, он уже мог присвоить id — тогда переиспользуем его,
 * чтобы один и тот же запрос имел один id во всех системах. Иначе генерируем новый.
 */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  // Node склеивает повторяющиеся заголовки в массив; доверять неоднозначному значению не стоит.
  if (typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

/** genReqId для pino-http: определяет id и сразу возвращает его клиенту в заголовке ответа. */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
