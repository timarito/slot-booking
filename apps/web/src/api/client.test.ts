import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ProblemDetails, createApiClient, unwrap } from './client';

const user = {
  id: '0193f0a0-0000-7000-8000-000000000001',
  email: 'bob@example.com',
  name: 'Bob',
  role: 'member',
  createdAt: '2026-11-19T10:00:00.000Z',
};

const problem: ProblemDetails = {
  type: '/problems/unauthorized',
  title: 'Unauthorized',
  status: 401,
  detail: 'The access token is missing, invalid or expired.',
  instance: '/me',
  code: 'unauthorized',
};

/** Клиент с подменённым fetch: запоминает запросы и отвечает заданным Response. */
function clientRespondingWith(response: () => Response) {
  const requests: Request[] = [];
  const fetch = vi.fn((request: Request) => {
    requests.push(request);
    return Promise.resolve(response());
  });
  return { client: createApiClient({ baseUrl: 'http://api.test', fetch }), requests };
}

const json = (body: unknown, status: number, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

describe('createApiClient', () => {
  it('sends requests to the base URL with credentials included', async () => {
    const { client, requests } = clientRespondingWith(() => json(user, 200));

    await client.GET('/me');

    expect(requests[0]?.url).toBe('http://api.test/me');
    // Без credentials: 'include' браузер не отправит refresh-cookie на другой origin.
    expect(requests[0]?.credentials).toBe('include');
  });
});

describe('unwrap', () => {
  it('returns the parsed body of a successful response', async () => {
    const { client } = clientRespondingWith(() => json(user, 200));

    await expect(unwrap(client.GET('/me'))).resolves.toEqual(user);
  });

  it('returns undefined for 204 No Content', async () => {
    const { client } = clientRespondingWith(() => new Response(null, { status: 204 }));

    await expect(unwrap(client.POST('/auth/logout'))).resolves.toBeUndefined();
  });

  it('throws ApiError with the Problem Details of an error response', async () => {
    const { client } = clientRespondingWith(() => json(problem, 401, 'application/problem+json'));

    const error = await unwrap(client.GET('/me')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'unauthorized',
      problem,
      message: problem.detail,
    });
  });

  // Ответ не от нашего API (например, HTML-страница прокси): статус есть, Problem Details нет.
  it('throws ApiError with unknown-error code when the body is not Problem Details', async () => {
    const { client } = clientRespondingWith(
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    );

    const error = await unwrap(client.GET('/me')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'unknown-error', problem: undefined });
  });

  // Сетевая ошибка — не ApiError: ответа нет вовсе, и UI показывает «нет связи», а не код.
  it('lets network errors propagate unchanged', async () => {
    const networkError = new TypeError('Failed to fetch');
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () => Promise.reject(networkError),
    });

    await expect(unwrap(client.GET('/me'))).rejects.toBe(networkError);
  });
});
