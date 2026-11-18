import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { genReqId, resolveRequestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reuses a valid incoming id', () => {
    expect(resolveRequestId('abc-123_DEF.9')).toBe('abc-123_DEF.9');
  });

  it('generates a UUID when there is no incoming id', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  it.each([
    ['empty', ''],
    ['with spaces', 'bad id'],
    ['with a newline (log injection)', 'id\n{"level":"error"}'],
    ['too long', 'a'.repeat(129)],
  ])('replaces an unsafe incoming id: %s', (_case, incoming) => {
    expect(resolveRequestId(incoming)).toMatch(UUID);
  });

  it('does not trust a repeated header', () => {
    expect(resolveRequestId(['a', 'b'])).toMatch(UUID);
  });

  it('generates a new id each time', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});

describe('genReqId', () => {
  it('returns the id and sends it back in the X-Request-Id response header', () => {
    const req = { headers: { 'x-request-id': 'trace-1' } } as unknown as IncomingMessage;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as ServerResponse;

    expect(genReqId(req, res)).toBe('trace-1');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-1');
  });
});
