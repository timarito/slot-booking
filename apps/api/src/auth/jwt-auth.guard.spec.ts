import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard, extractBearerToken } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc.def.ghi', 'abc.def.ghi'],
    ['BEARER  abc.def.ghi', 'abc.def.ghi'],
  ])('reads the token from %j', (header, token) => {
    expect(extractBearerToken(header)).toBe(token);
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic dXNlcjpwYXNz', 'abc.def.ghi', 'Bearer a b'])(
    'returns undefined for %j',
    (header) => {
      expect(extractBearerToken(header)).toBeUndefined();
    },
  );
});

// Настоящие JwtService и Reflector: guard проверяется на реальной подписи и реальных метаданных
// декоратора, а не на заглушках, которые повторяли бы его же допущения.
const SECRET = 'test-secret-at-least-32-characters-long';
const jwt = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256', expiresIn: 60 },
  verifyOptions: { algorithms: ['HS256'] },
});
const guard = new JwtAuthGuard(jwt, new Reflector());

class ProtectedController {
  handler(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

class MixedController {
  @Public()
  open(): void {}
}

/** Минимальный ExecutionContext: guard использует только handler, класс и HTTP-запрос. */
function contextFor(
  controller: new () => object,
  method: string,
  headers: Record<string, string> = {},
) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const context = {
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const expectUnauthorized = (promise: Promise<boolean>) =>
  expect(promise).rejects.toMatchObject({ code: 'unauthorized', status: HttpStatus.UNAUTHORIZED });

describe('JwtAuthGuard', () => {
  it('lets a valid access token through and exposes the user on the request', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', role: 'admin' });
    const { context, request } = contextFor(ProtectedController, 'handler', bearer(token));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: 'admin' });
  });

  it('rejects a request without a token', async () => {
    await expectUnauthorized(guard.canActivate(contextFor(ProtectedController, 'handler').context));
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'another-secret' }).signAsync({ sub: 'user-1' });

    await expectUnauthorized(
      guard.canActivate(contextFor(ProtectedController, 'handler', bearer(forged)).context),
    );
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ sub: 'user-1', role: 'member' }, { expiresIn: -1 });

    await expectUnauthorized(
      guard.canActivate(contextFor(ProtectedController, 'handler', bearer(expired)).context),
    );
  });

  // Классическая атака на JWT: alg=none и пустая подпись. verifyOptions.algorithms её отсекает.
  it('rejects an unsigned token (alg: none)', async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1', role: 'admin' })}.`;

    await expectUnauthorized(
      guard.canActivate(contextFor(ProtectedController, 'handler', bearer(unsigned)).context),
    );
  });

  it('skips the check for a @Public() controller', async () => {
    await expect(guard.canActivate(contextFor(PublicController, 'handler').context)).resolves.toBe(
      true,
    );
  });

  it('skips the check for a @Public() handler', async () => {
    await expect(guard.canActivate(contextFor(MixedController, 'open').context)).resolves.toBe(
      true,
    );
  });
});
