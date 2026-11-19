import { describe, expect, it } from 'vitest';
import { NodeEnv, validateEnv } from './env.validation.js';

// Значения process.env всегда строки, поэтому и фикстуры — строки.
const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid environment and converts PORT to a number', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
  });

  it('applies defaults for optional variables', () => {
    const { PORT: _port, NODE_ENV: _nodeEnv, ...required } = validEnv;

    const env = validateEnv(required);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.JWT_ACCESS_TTL_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it.each([
    ['PORT is not a number', { PORT: 'abc' }, 'PORT'],
    ['PORT is out of range', { PORT: '70000' }, 'PORT'],
    ['NODE_ENV is unknown', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['CORS_ORIGIN is empty', { CORS_ORIGIN: '' }, 'CORS_ORIGIN'],
    ['DATABASE_URL is missing', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['LOG_LEVEL is unknown', { LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    ['JWT_ACCESS_SECRET is missing', { JWT_ACCESS_SECRET: undefined }, 'JWT_ACCESS_SECRET'],
    ['JWT_ACCESS_SECRET is too short', { JWT_ACCESS_SECRET: 'x'.repeat(31) }, 'JWT_ACCESS_SECRET'],
    ['JWT_ACCESS_TTL_MINUTES is zero', { JWT_ACCESS_TTL_MINUTES: '0' }, 'JWT_ACCESS_TTL_MINUTES'],
    [
      'REFRESH_TOKEN_TTL_DAYS is not a number',
      { REFRESH_TOKEN_TTL_DAYS: '30d' },
      'REFRESH_TOKEN_TTL_DAYS',
    ],
  ])('rejects the environment when %s', (_case, override, variable) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(
      new RegExp(`Invalid environment variables:[\\s\\S]*${variable}:`),
    );
  });

  describe('LOG_LEVEL', () => {
    it.each([
      ['development', 'debug'],
      ['test', 'silent'],
      ['production', 'info'],
    ])('defaults to the NODE_ENV-specific level: %s -> %s', (nodeEnv, level) => {
      expect(validateEnv({ ...validEnv, NODE_ENV: nodeEnv }).LOG_LEVEL).toBe(level);
    });

    it('keeps an explicit value', () => {
      expect(
        validateEnv({ ...validEnv, NODE_ENV: 'production', LOG_LEVEL: 'debug' }).LOG_LEVEL,
      ).toBe('debug');
    });
  });
});
