import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

describe('generateRefreshToken', () => {
  it('returns 32 random bytes encoded as base64url (43 characters, cookie-safe)', () => {
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns a different token every time', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateRefreshToken));

    expect(tokens.size).toBe(100);
  });
});

describe('hashRefreshToken', () => {
  // Известный тестовый вектор SHA-256 — проверяет, что это действительно SHA-256 в hex.
  it('returns the hex SHA-256 digest', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  // Детерминированность — то, что позволяет искать сессию по хешу из cookie.
  it('is deterministic, so a session can be looked up by it', () => {
    const token = generateRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });
});
