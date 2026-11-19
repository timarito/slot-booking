import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { readRefreshCookie } from './refresh-cookie.js';

const requestWith = (cookies: unknown) => ({ cookies }) as unknown as Request;

describe('readRefreshCookie', () => {
  it('returns the refresh_token cookie value', () => {
    expect(readRefreshCookie(requestWith({ refresh_token: 'abc' }))).toBe('abc');
  });

  // cookie-parser не подключён или cookie нет — это «нет токена», а не падение.
  it.each([
    ['no cookies object', undefined],
    ['no refresh cookie', { other: 'x' }],
    ['an empty value', { refresh_token: '' }],
    // cookie-parser превращает значения вида `j:{...}` в объекты (JSON cookies).
    ['a non-string value', { refresh_token: { injected: true } }],
  ])('returns undefined for %s', (_case, cookies) => {
    expect(readRefreshCookie(requestWith(cookies))).toBeUndefined();
  });
});
