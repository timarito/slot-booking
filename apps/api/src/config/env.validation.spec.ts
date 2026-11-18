import { describe, expect, it } from 'vitest';
import { NodeEnv, validateEnv } from './env.validation.js';

// Значения process.env всегда строки, поэтому и фикстуры — строки.
const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  CORS_ORIGIN: 'http://localhost:5173',
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
  });

  it.each([
    ['PORT is not a number', { PORT: 'abc' }, 'PORT'],
    ['PORT is out of range', { PORT: '70000' }, 'PORT'],
    ['NODE_ENV is unknown', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['CORS_ORIGIN is empty', { CORS_ORIGIN: '' }, 'CORS_ORIGIN'],
    ['DATABASE_URL is missing', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['LOG_LEVEL is unknown', { LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
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
