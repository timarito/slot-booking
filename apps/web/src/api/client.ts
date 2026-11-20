import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './schema';

// Тонкий типизированный клиент поверх fetch. Пути, параметры, тела и ответы проверяются по
// типам, сгенерированным из OpenAPI бэкенда (schema.d.ts): переименовали поле в DTO —
// перегенерировали схему — фронтенд не компилируется, пока не поправишь все места.
// https://openapi-ts.dev/openapi-fetch/

export type Schemas = components['schemas'];
export type ProblemDetails = Schemas['ProblemDetails'];
export type ApiClient = Client<paths>;

/**
 * Ошибка HTTP-ответа API. Хуки TanStack Query бросают её из queryFn/mutationFn, а UI решает,
 * что показать, по `code` (spec.md, раздел 7) — не по тексту и не только по статусу.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  /** Тело ответа, если это Problem Details; иначе undefined (например, HTML от прокси на 502). */
  readonly problem: ProblemDetails | undefined;

  // Поля объявлены явно, а не через `constructor(readonly status: number)`: parameter properties —
  // не стираемый синтаксис (генерируют присваивания), erasableSyntaxOnly их запрещает.
  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.status = status;
    this.problem = problem;
  }

  /** Машиночитаемый код ошибки; `unknown-error`, если сервер ответил не Problem Details. */
  get code(): string {
    return this.problem?.code ?? 'unknown-error';
  }
}

// Ответ мог прийти не от нашего API (прокси, балансировщик), поэтому форму тела проверяем,
// а не доверяем типу из схемы.
function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).status === 'number'
  );
}

/**
 * openapi-fetch не бросает исключений на 4xx/5xx, а возвращает `{ data } | { error }`.
 * TanStack Query же ждёт, что неудачный запрос бросит ошибку. unwrap переводит одно в другое:
 *   const user = await unwrap(api.GET('/me'));
 * Сетевая ошибка (сервер недоступен, CORS) — это отклонённый fetch: она пролетает как есть.
 */
export async function unwrap<Data>(
  request: Promise<
    | { data: Data; error?: never; response: Response }
    | { data?: never; error: unknown; response: Response }
  >,
): Promise<Data> {
  const result = await request;
  if (result.error !== undefined) {
    throw new ApiError(
      result.response.status,
      isProblemDetails(result.error) ? result.error : undefined,
    );
  }
  return result.data as Data;
}

export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createClient<paths>({
    // include: браузер отправляет и принимает cookie на cross-origin запросах (web :5173 → api :3000).
    // Без этого refresh-cookie не будет ни сохранена после логина, ни отправлена на /auth/refresh.
    // Работает в паре с CORS на сервере: точный origin + Access-Control-Allow-Credentials.
    credentials: 'include',
    ...options,
  });
}

// Fail fast, как env-валидация в api: без адреса API приложение бесполезно, и лучше сразу
// увидеть причину, чем «Failed to fetch» на каждом запросе.
const baseUrl = import.meta.env.VITE_API_URL;
if (!baseUrl) {
  throw new Error('VITE_API_URL is not set. Copy apps/web/.env.example to apps/web/.env.');
}

/** Клиент приложения. Access-токен добавит middleware в задаче про клиентскую аутентификацию. */
export const api = createApiClient({ baseUrl });
