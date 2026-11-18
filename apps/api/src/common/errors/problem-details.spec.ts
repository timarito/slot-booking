import { HttpStatus, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppException, toProblemDetails } from './problem-details.js';

describe('toProblemDetails', () => {
  describe('AppException', () => {
    it('maps code, detail and a custom title', () => {
      const exception = new AppException(HttpStatus.CONFLICT, 'booking-conflict', {
        title: 'Booking conflict',
        detail: 'The selected time overlaps an existing booking.',
      });

      expect(toProblemDetails(exception, '/bookings')).toEqual({
        status: 409,
        body: {
          type: '/problems/booking-conflict',
          title: 'Booking conflict',
          status: 409,
          detail: 'The selected time overlaps an existing booking.',
          instance: '/bookings',
          code: 'booking-conflict',
        },
      });
    });

    it('defaults the title to the HTTP reason phrase and omits absent members', () => {
      const { body } = toProblemDetails(
        new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'booking-in-past'),
        '/bookings',
      );

      expect(body.title).toBe('Unprocessable Entity');
      expect(body).not.toHaveProperty('detail');
      expect(body).not.toHaveProperty('errors');
    });

    it('passes field errors through', () => {
      const errors = [{ field: 'title', message: 'title must be shorter than 100 characters' }];

      const { body } = toProblemDetails(
        new AppException(HttpStatus.BAD_REQUEST, 'validation-error', { errors }),
        '/bookings',
      );

      expect(body.errors).toEqual(errors);
    });
  });

  describe('built-in HttpException', () => {
    it('derives the code from the status', () => {
      const { status, body } = toProblemDetails(new NotFoundException(), '/nope');

      expect(status).toBe(404);
      expect(body).toMatchObject({
        code: 'not-found',
        type: '/problems/not-found',
        title: 'Not Found',
      });
    });

    it('does not expose the exception message, which may echo request input', () => {
      const { body } = toProblemDetails(
        new NotFoundException('Cannot GET /nope?token=secret'),
        '/nope',
      );

      expect(JSON.stringify(body)).not.toContain('secret');
      expect(body).not.toHaveProperty('detail');
    });

    it('handles multi-word reason phrases', () => {
      const { body } = toProblemDetails(new ServiceUnavailableException(), '/health');

      expect(body.code).toBe('service-unavailable');
    });
  });

  describe('unexpected errors', () => {
    it('returns a generic 500 without leaking the original message', () => {
      const { status, body } = toProblemDetails(
        new Error('relation "users" does not exist at postgres://admin:pw@db'),
        '/me',
      );

      expect(status).toBe(500);
      expect(body).toEqual({
        type: '/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/me',
        code: 'internal-server-error',
      });
    });

    it('handles thrown non-Error values', () => {
      expect(toProblemDetails('boom', '/me').status).toBe(500);
      expect(toProblemDetails(undefined, '/me').status).toBe(500);
    });
  });
});
