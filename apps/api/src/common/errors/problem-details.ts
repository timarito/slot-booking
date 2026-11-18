import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

// RFC 9457 "Problem Details for HTTP APIs": https://www.rfc-editor.org/rfc/rfc9457
// One machine-readable shape for every error, so the client handles errors in one place.

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface FieldError {
  /** Dot path to the invalid field, e.g. `workingHours.0.openTime`. */
  field: string;
  message: string;
}

export interface ProblemDetails {
  /** URI reference identifying the problem type; stable, documented per `code`. */
  type: string;
  /** Short human-readable summary of the problem type (same for every occurrence). */
  title: string;
  /** HTTP status code, duplicated in the body for clients that lose the status line. */
  status: number;
  /** Human-readable explanation of this specific occurrence. */
  detail?: string;
  /** The request path this occurrence relates to. */
  instance: string;
  /** Extension member: the key the frontend maps to a UI message (spec.md, section 7). */
  code: string;
  /** Extension member: present only for validation errors. */
  errors?: FieldError[];
}

interface AppExceptionOptions {
  /** Defaults to the HTTP reason phrase of `status`. */
  title?: string;
  detail?: string;
  errors?: FieldError[];
}

/**
 * The exception services throw for expected, domain-level failures:
 * `throw new AppException(HttpStatus.CONFLICT, 'booking-conflict', { detail: '...' })`.
 *
 * It extends HttpException so the rest of Nest (and any code checking `instanceof HttpException`)
 * still treats it as an HTTP error with a known status.
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

/** The result of mapping any thrown value: what to send and whether it's our fault (5xx). */
export interface ProblemResponse {
  status: number;
  body: ProblemDetails;
}

/**
 * Maps anything that can be thrown to a Problem Details response.
 * A pure function on purpose: all the decisions live here and are unit-tested without Nest/HTTP.
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

  // Nest's built-in exceptions (NotFoundException for unknown routes, our 503 in /health,
  // 400 for malformed JSON...). Their code is derived from the status: 404 -> "not-found".
  // Their messages are NOT passed on as `detail`: they are not written for clients and may echo
  // request input (Nest's 404 is "Cannot GET /path?query", JSON parse errors quote the body).
  // Rule: `detail` only ever contains text we wrote deliberately, i.e. from AppException.
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { status, body: buildProblem(status, codeFromStatus(status), instance, {}) };
  }

  // Anything else is a bug or an infrastructure failure. Never leak its message or stack
  // to the client: they can contain SQL, file paths or secrets. The filter logs the details.
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
