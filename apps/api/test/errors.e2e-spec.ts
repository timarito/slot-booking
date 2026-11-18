import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { ProblemDetails } from '../src/common/errors/problem-details.js';

// Test-only endpoints to drive the real global pipe and filter through HTTP.
// They exist only inside this testing module, never in the app.
class ProbeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(5)
  name: string;
}

@Controller('__probe')
class ProbeController {
  @Post('validate')
  validate(@Body() dto: ProbeDto): ProbeDto {
    return dto;
  }

  @Get('crash')
  crash(): never {
    throw new Error('connection to postgres://admin:secret@db failed');
  }
}

describe('Error responses (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    // logger: false keeps the expected 500 stack trace out of the test output.
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 Problem Details for an unknown route without echoing the query', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist?token=secret')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toEqual({
      type: '/problems/not-found',
      title: 'Not Found',
      status: 404,
      instance: '/does-not-exist',
      code: 'not-found',
    });
    expect(response.text).not.toContain('secret');
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/__probe/validate')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({ code: 'bad-request', status: 400 });
  });

  it('returns validation-error with field errors for an invalid DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/__probe/validate')
      .send({ email: 'not-an-email', name: 'too long' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    // supertest types the body as `any`; assert our contract explicitly.
    const body = response.body as ProblemDetails;
    expect(body).toMatchObject({
      type: '/problems/validation-error',
      code: 'validation-error',
      status: 400,
      instance: '/__probe/validate',
    });
    const fields = body.errors?.map((e) => e.field);
    expect(fields).toContain('email');
    expect(fields).toContain('name');
    expect(body.errors?.every((e) => e.message.length > 0)).toBe(true);
  });

  it('passes a valid DTO through to the handler', async () => {
    await request(app.getHttpServer())
      .post('/__probe/validate')
      .send({ email: 'a@b.co', name: 'Timur' })
      .expect(201, { email: 'a@b.co', name: 'Timur' });
  });

  it('returns a generic 500 without leaking internals', async () => {
    const response = await request(app.getHttpServer())
      .get('/__probe/crash')
      .expect(500)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      code: 'internal-server-error',
      detail: 'An unexpected error occurred.',
    });
    expect(response.text).not.toContain('postgres');
    expect(response.text).not.toContain('secret');
  });
});
