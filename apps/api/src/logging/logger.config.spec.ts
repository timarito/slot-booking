import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AutoLoggingOptions } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { NodeEnv } from '../config/env.validation.js';
import { buildPinoHttpOptions } from './logger.config.js';

const devOptions = buildPinoHttpOptions({ NODE_ENV: NodeEnv.Development, LOG_LEVEL: 'debug' });
const prodOptions = buildPinoHttpOptions({ NODE_ENV: NodeEnv.Production, LOG_LEVEL: 'info' });

const req = (url: string) => ({ url }) as IncomingMessage;
const res = (statusCode: number) => ({ statusCode }) as ServerResponse;

describe('buildPinoHttpOptions', () => {
  it('uses the configured level', () => {
    expect(prodOptions.level).toBe('info');
  });

  it.each([
    [200, 'info'],
    [302, 'info'],
    [404, 'warn'],
    [422, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('logs a %i response at level %s', (status, level) => {
    expect(prodOptions.customLogLevel?.(req('/x'), res(status))).toBe(level);
  });

  it('logs at error level when the request failed with an error, regardless of status', () => {
    expect(prodOptions.customLogLevel?.(req('/x'), res(200), new Error('socket hang up'))).toBe(
      'error',
    );
  });

  it('skips the automatic request log for health checks only', () => {
    const { ignore } = prodOptions.autoLogging as AutoLoggingOptions;

    expect(ignore?.(req('/health'))).toBe(true);
    expect(ignore?.(req('/resources'))).toBe(false);
  });

  it('redacts credentials', () => {
    expect(prodOptions.redact).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie']),
    );
  });

  it('pretty-prints only in development', () => {
    expect(devOptions.transport).toMatchObject({ target: 'pino-pretty' });
    expect(prodOptions.transport).toBeUndefined();
  });
});
