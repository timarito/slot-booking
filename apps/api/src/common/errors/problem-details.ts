import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

// RFC 9457 "Problem Details for HTTP APIs": https://www.rfc-editor.org/rfc/rfc9457
// Единая машиночитаемая форма для всех ошибок, чтобы клиент обрабатывал их в одном месте.

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface FieldError {
  /** Путь к невалидному полю через точку, например `workingHours.0.openTime`. */
  field: string;
  message: string;
}

export interface ProblemDetails {
  /** URI-ссылка на тип проблемы; стабильная, документируется для каждого `code`. */
  type: string;
  /** Короткое описание типа проблемы для человека (одинаковое для всех случаев этого типа). */
  title: string;
  /** HTTP-статус, продублированный в теле для клиентов, которые теряют строку статуса. */
  status: number;
  /** Пояснение для человека к этому конкретному случаю. */
  detail?: string;
  /** Путь запроса, к которому относится этот случай. */
  instance: string;
  /** Поле-расширение: ключ, который фронтенд маппит на сообщение в UI (spec.md, раздел 7). */
  code: string;
  /** Поле-расширение: есть только у ошибок валидации. */
  errors?: FieldError[];
}

interface AppExceptionOptions {
  /** По умолчанию — стандартная фраза HTTP-статуса (reason phrase). */
  title?: string;
  detail?: string;
  errors?: FieldError[];
}

/**
 * Исключение, которое сервисы бросают при ожидаемых доменных ошибках:
 * `throw new AppException(HttpStatus.CONFLICT, 'booking-conflict', { detail: '...' })`.
 *
 * Наследует HttpException, чтобы остальной Nest (и любой код с проверкой
 * `instanceof HttpException`) по-прежнему считал его HTTP-ошибкой с известным статусом.
 */
export class AppException extends HttpException {
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: FieldError[];

  constructor(
    status: HttpStatus,
    readonly code: string,
    { title, detail, errors }: AppExceptionOptions = {},
  ) {
    super(detail ?? code, status);
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

/** Результат маппинга любого брошенного значения: статус и тело ответа. */
export interface ProblemResponse {
  status: number;
  body: ProblemDetails;
}

/**
 * Превращает всё, что может быть брошено, в ответ Problem Details.
 * Намеренно чистая функция: все решения живут здесь и тестируются unit-тестами без Nest и HTTP.
 */
export function toProblemDetails(exception: unknown, instance: string): ProblemResponse {
  if (exception instanceof AppException) {
    const status = exception.getStatus();
    return {
      status,
      body: buildProblem(status, exception.code, instance, {
        title: exception.title,
        detail: exception.detail,
        errors: exception.errors,
      }),
    };
  }

  // Встроенные исключения Nest (NotFoundException для неизвестного маршрута, наш 503 в /health,
  // 400 для некорректного JSON...). Их code выводится из статуса: 404 -> "not-found".
  // Их сообщения НЕ передаются в `detail`: они написаны не для клиента и могут отражать входные
  // данные запроса (404 в Nest — "Cannot GET /path?query", ошибки парсинга JSON цитируют тело).
  // Правило: в `detail` попадает только текст, написанный нами намеренно, то есть из AppException.
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { status, body: buildProblem(status, codeFromStatus(status), instance, {}) };
  }

  // Всё остальное — баг или сбой инфраструктуры. Сообщение и стек никогда не уходят клиенту:
  // в них может быть SQL, пути к файлам или секреты. Подробности логирует фильтр.
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return {
    status,
    body: buildProblem(status, codeFromStatus(status), instance, {
      detail: 'An unexpected error occurred.',
    }),
  };
}

function buildProblem(
  status: number,
  code: string,
  instance: string,
  { title, detail, errors }: AppExceptionOptions,
): ProblemDetails {
  return {
    type: `/problems/${code}`,
    title: title ?? reasonPhrase(status),
    status,
    ...(detail !== undefined && { detail }),
    instance,
    code,
    ...(errors !== undefined && { errors }),
  };
}

function reasonPhrase(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

/** "Not Found" -> "not-found", "Internal Server Error" -> "internal-server-error". */
function codeFromStatus(status: number): string {
  return reasonPhrase(status)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
